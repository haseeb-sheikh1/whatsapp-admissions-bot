/**
 * whatsapp.js - WhatsApp client using Baileys
 * 
 * Baileys connects directly via WhatsApp WebSocket (no Chrome/Puppeteer).
 * Lightweight (~50MB RAM) — perfect for free cloud hosting on Railway.
 * Works 24/7 even when your PC is off.
 */

require('dotenv').config();
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  isJidGroup,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const {
  STATE,
  getSession,
  updateState,
  updateData,
  addQuestion,
  addToHistory,
  hasSession,
} = require('./sessions');

const {
  getOutreachMessage,
  detectInterest,
  handleUnclearResponse,
  COLLECTION_PROMPTS,
  getNextCollectionState,
  STATE_TO_FIELD,
  validateField,
  handleQA,
  getCompletionMessage,
  getNotInterestedMessage,
} = require('./ai');

const { saveStudent } = require('./csv');

const INSTITUTION_NAME = process.env.INSTITUTION_NAME || 'Our Institution';
const AUTH_DIR = path.join(__dirname, '..', 'data', 'auth');

// Ensure auth directory exists
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// State
let sock = null;
let io = null;
let botStatus = 'disconnected';
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

// Emit to dashboard
function emitToDashboard(event, data) {
  if (io) io.emit(event, data);
}

// Set Socket.IO instance
function setSocketIO(socketIO) {
  io = socketIO;
}

// ====================== CONNECT ======================

async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[Baileys] Using WA version: ${version.join('.')}`);

    sock = makeWASocket({
      version,
      auth: state,
      // Suppress internal Baileys logs — we handle our own
      logger: pino({ level: 'silent' }),
      // Improves reliability on cloud
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      retryRequestDelayMs: 2000,
      // Don't mark messages as read automatically
      markOnlineOnConnect: false,
      // Generate high-quality QR
      printQRInTerminal: false,
    });

    // ---- Connection updates ----
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[Baileys] QR code received. Open http://localhost:' + (process.env.PORT || 3000) + ' to scan.');
        botStatus = 'connecting';
        try {
          const qrDataURL = await QRCode.toDataURL(qr, { width: 256 });
          emitToDashboard('qr', { qr: qrDataURL });
          emitToDashboard('status', { status: 'connecting', message: 'Scan QR code with WhatsApp' });
        } catch (err) {
          console.error('[Baileys] QR generation error:', err.message);
        }
      }

      if (connection === 'open') {
        console.log('[Baileys] ✅ Connected to WhatsApp!');
        botStatus = 'ready';
        reconnectAttempts = 0;
        emitToDashboard('qr', { qr: null });
        emitToDashboard('status', { status: 'ready', message: 'Bot is connected and ready!' });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[Baileys] Connection closed. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);
        botStatus = 'disconnected';
        emitToDashboard('status', { status: 'disconnected', message: 'Disconnected. Reconnecting...' });

        if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
          reconnectAttempts++;
          const delay = Math.min(reconnectAttempts * 3000, 30000);
          console.log(`[Baileys] Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`);
          setTimeout(connectToWhatsApp, delay);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log('[Baileys] Logged out. Please scan QR again.');
          // Clear auth to force re-scan
          try { fs.rmSync(AUTH_DIR, { recursive: true }); fs.mkdirSync(AUTH_DIR); } catch (e) {}
          setTimeout(connectToWhatsApp, 2000);
        } else {
          console.error('[Baileys] Max reconnect attempts reached.');
          emitToDashboard('status', { status: 'error', message: 'Connection failed. Please restart the bot.' });
        }
      }
    });

    // Save credentials whenever they update
    sock.ev.on('creds.update', saveCreds);

    // ---- Incoming messages ----
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        // Ignore group messages, status, and own messages
        if (!message.message) continue;
        if (message.key.fromMe) continue;
        if (isJidGroup(message.key.remoteJid)) continue;
        if (message.key.remoteJid === 'status@broadcast') continue;

        const jid = message.key.remoteJid;
        const phone = jid.replace('@s.whatsapp.net', '');

        // Extract text from various message types
        const userText = (
          message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          message.message?.imageMessage?.caption ||
          ''
        ).trim();

        if (!userText) continue;

        console.log(`[WhatsApp] Message from ${phone}: "${userText}"`);

        try {
          await handleMessage(phone, jid, userText);
        } catch (err) {
          console.error('[WhatsApp] Error handling message:', err.message);
        }
      }
    });

  } catch (err) {
    console.error('[Baileys] Fatal error:', err.message);
    botStatus = 'disconnected';
    if (reconnectAttempts < MAX_RECONNECT) {
      reconnectAttempts++;
      setTimeout(connectToWhatsApp, 5000);
    }
  }
}

// ====================== SEND MESSAGE ======================

async function sendMessage(jid, text) {
  if (!sock || botStatus !== 'ready') {
    console.warn('[WhatsApp] Cannot send message - bot not ready');
    return false;
  }
  try {
    await sock.sendMessage(jid, { text });
    return true;
  } catch (err) {
    console.error('[WhatsApp] Send error:', err.message);
    return false;
  }
}

// ====================== CONVERSATION HANDLER ======================

async function handleMessage(phone, jid, userText) {
  const session = getSession(phone);
  const state = session.state;

  addToHistory(phone, 'user', userText);

  let reply = '';

  // ---- OUTREACH_SENT: waiting for YES/NO ----
  if (state === STATE.OUTREACH_SENT) {
    let interest = detectInterest(userText);
    if (interest === 'UNCLEAR') interest = await handleUnclearResponse(userText, INSTITUTION_NAME);

    if (interest === 'YES') {
      updateState(phone, STATE.COLLECTING_NAME);
      updateData(phone, 'interestedStatus', 'Interested');
      reply = `Wonderful! 🎉 We're excited to help you with your admission journey!\n\n${COLLECTION_PROMPTS[STATE.COLLECTING_NAME]}`;
    } else if (interest === 'NO') {
      updateState(phone, STATE.NOT_INTERESTED);
      updateData(phone, 'interestedStatus', 'Not Interested');
      await saveStudent(session.data);
      reply = getNotInterestedMessage();
    } else {
      reply = `I'm sorry, I didn't quite understand that. 😊\n\nAre you interested in learning about our admissions?\n\nPlease reply:\n✅ *YES* - to learn more\n❌ *NO* - if not interested`;
    }
  }

  // ---- DATA COLLECTION STATES ----
  else if ([
    STATE.COLLECTING_NAME, STATE.COLLECTING_FATHER_NAME, STATE.COLLECTING_CITY,
    STATE.COLLECTING_PROGRAM, STATE.COLLECTING_FSC, STATE.COLLECTING_MATRIC,
    STATE.COLLECTING_CNIC, STATE.COLLECTING_EMAIL
  ].includes(state)) {
    const validation = await validateField(state, userText);

    if (!validation.valid) {
      reply = validation.error;
    } else {
      const field = STATE_TO_FIELD[state];
      updateData(phone, field, validation.value);
      const nextState = getNextCollectionState(state);
      updateState(phone, nextState);

      if (nextState === STATE.QA_MODE) {
        const name = session.data.name;
        updateData(phone, 'interestedStatus', 'Interested - Data Collected');
        await saveStudent({ ...session.data, [field]: validation.value });
        reply = getCompletionMessage(name, INSTITUTION_NAME);
      } else {
        reply = `✅ Got it!\n\n${COLLECTION_PROMPTS[nextState]}`;
      }
    }
  }

  // ---- QA MODE ----
  else if (state === STATE.QA_MODE) {
    const lowerText = userText.toLowerCase();
    const endKeywords = ['no more', "that's all", 'thats all', 'shukriya', 'thank you', 'thanks', 'ok done', 'okay done', 'khuda hafiz', 'allah hafiz'];

    if (endKeywords.some(kw => lowerText.includes(kw))) {
      updateState(phone, STATE.COMPLETED);
      reply = `You're welcome! 😊 We look forward to welcoming you to *${INSTITUTION_NAME}*! 🎓\n\nOur admissions team will reach out to you shortly. Good luck! ✨`;
    } else {
      addQuestion(phone, userText);
      await saveStudent(session.data);
      reply = await handleQA(userText, session.conversationHistory, session.data.name);
    }
  }

  // ---- COMPLETED ----
  else if (state === STATE.COMPLETED) {
    reply = `Hello again! 😊 Your registration is already complete. Our admissions team will be in touch soon. 🎓`;
  }

  // ---- NOT INTERESTED ----
  else if (state === STATE.NOT_INTERESTED) {
    const interest = detectInterest(userText);
    if (interest === 'YES') {
      updateState(phone, STATE.COLLECTING_NAME);
      updateData(phone, 'interestedStatus', 'Interested');
      reply = `Welcome back! 🎉\n\n${COLLECTION_PROMPTS[STATE.COLLECTING_NAME]}`;
    } else {
      reply = `No problem! If you ever change your mind, we're here. 😊`;
    }
  }

  if (reply) {
    await sendMessage(jid, reply);
    addToHistory(phone, 'bot', reply);
    emitToDashboard('message', { phone, text: userText, reply, timestamp: new Date().toISOString() });
    emitToDashboard('stats_update', {});
  }
}

// ====================== OUTREACH ======================

async function sendOutreachMessage(phone, delayMs = 0) {
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        if (botStatus !== 'ready') {
          console.log(`[Outreach] Bot not ready, skipping ${phone}`);
          return resolve(false);
        }

        const jid = `${phone}@s.whatsapp.net`;
        getSession(phone); // init session

        const msg = getOutreachMessage(INSTITUTION_NAME);
        const success = await sendMessage(jid, msg);

        if (success) {
          console.log(`[Outreach] ✅ Sent to ${phone}`);
          emitToDashboard('outreach_sent', { phone, timestamp: new Date().toISOString() });
        }
        resolve(success);
      } catch (err) {
        console.error(`[Outreach] ❌ Failed ${phone}:`, err.message);
        resolve(false);
      }
    }, delayMs);
  });
}

async function sendBulkOutreach(phoneList, delayBetween = 5000) {
  console.log(`[Outreach] Starting bulk outreach to ${phoneList.length} numbers...`);
  let sent = 0, failed = 0;

  for (let i = 0; i < phoneList.length; i++) {
    const { phone } = phoneList[i];
    if (hasSession(phone)) {
      console.log(`[Outreach] Skipping ${phone} (already contacted)`);
      continue;
    }

    const delay = i * delayBetween;
    const success = await sendOutreachMessage(phone, delay);
    if (success) sent++; else failed++;
    emitToDashboard('outreach_progress', { sent, failed, total: phoneList.length, current: i + 1 });
  }

  console.log(`[Outreach] Done. Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

// ====================== EXPORTS ======================

function initialize() {
  console.log('[Baileys] Starting WhatsApp connection...');
  connectToWhatsApp();
}

function getStatus() { return botStatus; }

module.exports = {
  initialize,
  setSocketIO,
  sendBulkOutreach,
  sendOutreachMessage,
  getStatus,
};
