/**
 * index.js - Main server entry point
 * Express server + Socket.IO + WhatsApp bot (Baileys)
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const whatsapp = require('./bot/whatsapp');
const { readPhoneNumbers, readAllStudents, getStudentsCSVPath } = require('./bot/csv');
const { getStats } = require('./bot/sessions');
const { loadAdmissionInfo } = require('./bot/ai');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer for CSV uploads
const upload = multer({
  dest: UPLOAD_DIR,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
    else cb(new Error('Only CSV files are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Static dashboard
app.use(express.static(path.join(__dirname, 'dashboard')));
app.use(express.json());

// Hand Socket.IO to WhatsApp module for live updates
whatsapp.setSocketIO(io);

// ====================== API ROUTES ======================

// Bot status + stats
app.get('/api/status', (req, res) => {
  res.json({ status: whatsapp.getStatus(), stats: getStats() });
});

// All student leads
app.get('/api/students', (req, res) => {
  res.json({ students: readAllStudents() });
});

// Download students CSV
app.get('/api/download/students', (req, res) => {
  const csvPath = getStudentsCSVPath();
  if (fs.existsSync(csvPath)) res.download(csvPath, 'students_leads.csv');
  else res.status(404).json({ error: 'No students data yet.' });
});

// Bulk outreach via CSV upload
app.post('/api/outreach/upload', upload.single('phonelist'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const phoneList = readPhoneNumbers(req.file.path);
    fs.unlinkSync(req.file.path);

    if (phoneList.length === 0)
      return res.status(400).json({ error: 'No valid phone numbers found. Column must be named "phone_number".' });

    const delay = parseInt(req.body.delay) || 5000;
    res.json({ message: `Starting outreach to ${phoneList.length} numbers...`, count: phoneList.length });

    whatsapp.sendBulkOutreach(phoneList, delay).then(result => io.emit('outreach_complete', result));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single number outreach
app.post('/api/outreach/single', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' });

    const cleanPhone = phone.toString().replace(/\D/g, '');
    if (cleanPhone.length < 10)
      return res.status(400).json({ error: 'Invalid phone. Include country code (e.g., 923001234567).' });

    if (whatsapp.getStatus() !== 'ready')
      return res.status(400).json({ error: 'Bot not connected. Scan the QR code first.' });

    const success = await whatsapp.sendOutreachMessage(cleanPhone, 0);
    if (success) res.json({ message: `Outreach sent to ${cleanPhone}!` });
    else res.status(500).json({ error: 'Failed to send. Check the phone number has WhatsApp.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update admission knowledge base
app.post('/api/admission-info', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required.' });
    fs.writeFileSync(path.join(__dirname, 'data', 'admission_info.txt'), content);
    loadAdmissionInfo();
    res.json({ message: 'Admission info updated!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get admission knowledge base
app.get('/api/admission-info', (req, res) => {
  try {
    const infoPath = path.join(__dirname, 'data', 'admission_info.txt');
    res.json({ content: fs.existsSync(infoPath) ? fs.readFileSync(infoPath, 'utf8') : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================== SOCKET.IO ======================

io.on('connection', (socket) => {
  const status = whatsapp.getStatus();
  socket.emit('status', {
    status,
    message: status === 'ready' ? 'Bot is connected and ready!' : 'Waiting for QR scan...',
  });
  socket.emit('stats_update', getStats());
});

// ====================== START ======================

server.listen(PORT, () => {
  console.log(`\n🚀 Admin Dashboard → http://localhost:${PORT}`);
  console.log(`📱 Starting WhatsApp connection (Baileys)...\n`);
  whatsapp.initialize();
});

module.exports = { app, io };
