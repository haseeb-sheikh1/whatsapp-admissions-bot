/**
 * sessions.js - Per-student conversation state manager
 * Tracks each student's conversation state and collected data
 */

const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, '..', 'data', 'sessions.json');

// Conversation states
const STATE = {
  OUTREACH_SENT: 'outreach_sent',
  INTERESTED: 'interested',
  COLLECTING_NAME: 'collecting_name',
  COLLECTING_FATHER_NAME: 'collecting_father_name',
  COLLECTING_CITY: 'collecting_city',
  COLLECTING_PROGRAM: 'collecting_program',
  COLLECTING_FSC: 'collecting_fsc',
  COLLECTING_MATRIC: 'collecting_matric',
  COLLECTING_CNIC: 'collecting_cnic',
  COLLECTING_EMAIL: 'collecting_email',
  QA_MODE: 'qa_mode',
  COMPLETED: 'completed',
  NOT_INTERESTED: 'not_interested',
};

// In-memory session store
let sessions = {};

// Load sessions from disk if they exist
function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, 'utf8');
      sessions = JSON.parse(data);
      console.log(`[Sessions] Loaded ${Object.keys(sessions).length} existing sessions.`);
    }
  } catch (err) {
    console.error('[Sessions] Error loading sessions:', err.message);
    sessions = {};
  }
}

// Save sessions to disk
function saveSessions() {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
  } catch (err) {
    console.error('[Sessions] Error saving sessions:', err.message);
  }
}

// Get or create a session for a phone number
function getSession(phone) {
  if (!sessions[phone]) {
    sessions[phone] = {
      phone,
      state: STATE.OUTREACH_SENT,
      data: {
        phone,
        name: '',
        fatherName: '',
        city: '',
        program: '',
        fscPercentage: '',
        matricPercentage: '',
        cnic: '',
        email: '',
        questionsAsked: [],
        interestedStatus: 'Pending',
        timestamp: new Date().toISOString(),
      },
      conversationHistory: [],
    };
    saveSessions();
  }
  return sessions[phone];
}

// Update session state
function updateState(phone, newState) {
  if (sessions[phone]) {
    sessions[phone].state = newState;
    saveSessions();
  }
}

// Update student data field
function updateData(phone, field, value) {
  if (sessions[phone]) {
    sessions[phone].data[field] = value;
    saveSessions();
  }
}

// Add a question to the questions list
function addQuestion(phone, question) {
  if (sessions[phone]) {
    if (!sessions[phone].data.questionsAsked) {
      sessions[phone].data.questionsAsked = [];
    }
    sessions[phone].data.questionsAsked.push(question);
    saveSessions();
  }
}

// Add message to conversation history for AI context
function addToHistory(phone, role, content) {
  if (sessions[phone]) {
    sessions[phone].conversationHistory.push({ role, content });
    // Keep last 20 messages for context
    if (sessions[phone].conversationHistory.length > 20) {
      sessions[phone].conversationHistory = sessions[phone].conversationHistory.slice(-20);
    }
    saveSessions();
  }
}

// Check if session exists
function hasSession(phone) {
  return !!sessions[phone];
}

// Delete session (cleanup)
function deleteSession(phone) {
  delete sessions[phone];
  saveSessions();
}

// Get all sessions (for dashboard)
function getAllSessions() {
  return sessions;
}

// Get count of sessions by state
function getStats() {
  const stats = {
    total: 0,
    interested: 0,
    notInterested: 0,
    completed: 0,
    pending: 0,
  };
  
  Object.values(sessions).forEach(session => {
    stats.total++;
    if (session.state === STATE.NOT_INTERESTED) stats.notInterested++;
    else if (session.state === STATE.COMPLETED) stats.completed++;
    else if (session.state === STATE.OUTREACH_SENT) stats.pending++;
    else stats.interested++;
  });
  
  return stats;
}

// Initialize
loadSessions();

module.exports = {
  STATE,
  getSession,
  updateState,
  updateData,
  addQuestion,
  addToHistory,
  hasSession,
  deleteSession,
  getAllSessions,
  getStats,
};
