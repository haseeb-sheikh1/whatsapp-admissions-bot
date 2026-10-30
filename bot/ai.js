/**
 * ai.js - Google Gemini AI conversation engine
 * Handles all AI-powered chat logic for the admissions bot
 */

require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { STATE } = require('./sessions');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Load admission knowledge base
let admissionInfo = '';
const ADMISSION_INFO_PATH = path.join(__dirname, '..', 'data', 'admission_info.txt');

function loadAdmissionInfo() {
  try {
    admissionInfo = fs.readFileSync(ADMISSION_INFO_PATH, 'utf8');
    console.log('[AI] Admission info loaded successfully.');
  } catch (err) {
    console.error('[AI] Could not load admission_info.txt:', err.message);
    admissionInfo = 'This is an admissions assistant. Please contact the institution for details.';
  }
}

loadAdmissionInfo();

// Watch for changes to admission_info.txt and reload
fs.watchFile(ADMISSION_INFO_PATH, () => {
  console.log('[AI] Admission info updated, reloading...');
  loadAdmissionInfo();
});

// Generate the initial outreach message
function getOutreachMessage(institutionName) {
  return `👋 Assalam o Alaikum!

I'm the AI Admissions Assistant for *${institutionName}*.

We are currently accepting admissions for our upcoming session! 🎓

Are you interested in learning more about our programs and admission process?

Please reply:
✅ *YES* – to learn more
❌ *NO* – if you're not interested

(This is an automated message. Your data is safe and will not be shared.)`;
}

// Detect if user said YES or NO
function detectInterest(message) {
  const msg = message.toLowerCase().trim();
  
  const yesKeywords = ['yes', 'haan', 'han', 'ha', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'interested', 'interested!', 'ji', 'ji han', 'bilkul', 'zaroor', 'please', 'please tell me'];
  const noKeywords = ['no', 'nahi', 'nope', 'not interested', 'na', 'nah', 'never', 'don\'t', 'dont'];
  
  for (const kw of yesKeywords) {
    if (msg.includes(kw)) return 'YES';
  }
  for (const kw of noKeywords) {
    if (msg.includes(kw)) return 'NO';
  }
  
  return 'UNCLEAR';
}

// Messages for each data collection step
const COLLECTION_PROMPTS = {
  [STATE.COLLECTING_NAME]: '📝 Great! To get started, could you please tell me your *Full Name*?',
  [STATE.COLLECTING_FATHER_NAME]: "✅ Got it! Now, please share your *Father's Name*:",
  [STATE.COLLECTING_CITY]: '🏙️ Which *City* are you from?',
  [STATE.COLLECTING_PROGRAM]: `🎓 Which *Program* are you interested in? Please choose one:
  
• BS Computer Science
• BS Business Administration  
• BS Engineering
• MBA
• MBBS
• BBA

(Or type the program name)`,
  [STATE.COLLECTING_FSC]: '📊 What is your *FSc / Inter Percentage*? (e.g., 75%)',
  [STATE.COLLECTING_MATRIC]: '📊 What is your *Matric Percentage*? (e.g., 82%)',
  [STATE.COLLECTING_CNIC]: '🪪 Please share your *CNIC Number* (13 digits, e.g., 35201-1234567-1):',
  [STATE.COLLECTING_EMAIL]: '📧 Finally, please share your *Email Address*:',
};

// Get next state in data collection flow
function getNextCollectionState(currentState) {
  const flow = [
    STATE.COLLECTING_NAME,
    STATE.COLLECTING_FATHER_NAME,
    STATE.COLLECTING_CITY,
    STATE.COLLECTING_PROGRAM,
    STATE.COLLECTING_FSC,
    STATE.COLLECTING_MATRIC,
    STATE.COLLECTING_CNIC,
    STATE.COLLECTING_EMAIL,
    STATE.QA_MODE,
  ];
  
  const idx = flow.indexOf(currentState);
  if (idx === -1 || idx === flow.length - 1) return STATE.QA_MODE;
  return flow[idx + 1];
}

// Map state to data field name
const STATE_TO_FIELD = {
  [STATE.COLLECTING_NAME]: 'name',
  [STATE.COLLECTING_FATHER_NAME]: 'fatherName',
  [STATE.COLLECTING_CITY]: 'city',
  [STATE.COLLECTING_PROGRAM]: 'program',
  [STATE.COLLECTING_FSC]: 'fscPercentage',
  [STATE.COLLECTING_MATRIC]: 'matricPercentage',
  [STATE.COLLECTING_CNIC]: 'cnic',
  [STATE.COLLECTING_EMAIL]: 'email',
};

// Validate and clean a field value using Gemini AI
async function validateField(state, userInput) {
  // Simple validations first
  const input = userInput.trim();
  
  if (state === STATE.COLLECTING_EMAIL) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const match = input.match(emailRegex);
    if (match) return { valid: true, value: match[0] };
    return { valid: false, error: '❌ That doesn\'t look like a valid email address. Please enter a valid email (e.g., name@gmail.com):' };
  }
  
  if (state === STATE.COLLECTING_CNIC) {
    const cleaned = input.replace(/[-\s]/g, '');
    if (cleaned.length === 13 && /^\d+$/.test(cleaned)) {
      return { valid: true, value: `${cleaned.slice(0, 5)}-${cleaned.slice(5, 12)}-${cleaned.slice(12)}` };
    }
    return { valid: false, error: '❌ CNIC should be 13 digits. Please enter again (e.g., 35201-1234567-1):' };
  }
  
  if (state === STATE.COLLECTING_FSC || state === STATE.COLLECTING_MATRIC) {
    const numMatch = input.match(/(\d+(\.\d+)?)/);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      if (num >= 0 && num <= 100) return { valid: true, value: `${num}%` };
    }
    return { valid: false, error: '❌ Please enter a valid percentage (e.g., 75 or 75.5):' };
  }
  
  return { valid: true, value: input };
}

// Handle Q&A using Gemini with admission knowledge base
async function handleQA(userQuestion, conversationHistory, studentName) {
  try {
    const systemContext = `You are a friendly and helpful AI Admissions Assistant. 
You are talking to a student named ${studentName || 'the student'}.
Answer questions ONLY based on the admission information provided below.
If you don't know the answer, politely say you'll connect them with an admission officer.
Keep your responses concise, friendly, and in the same language the student is using (English or Urdu/Roman Urdu).
Use emojis occasionally to keep the conversation warm.

ADMISSION INFORMATION:
${admissionInfo}

After answering 2-3 questions, ask if they have any other questions or if they would like to finalize their interest.`;

    // Build conversation for Gemini
    const history = conversationHistory.slice(-6).map(msg => ({
      role: msg.role === 'bot' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.7,
      },
      systemInstruction: systemContext,
    });

    const result = await chat.sendMessage(userQuestion);
    return result.response.text();
  } catch (err) {
    console.error('[AI] Gemini Q&A error:', err.message);
    return 'I apologize, I\'m having trouble right now. Please contact us directly at our office for more information. 😊';
  }
}

// Handle unclear YES/NO response
async function handleUnclearResponse(userMessage, institutionName) {
  try {
    const prompt = `A prospective student sent this message in response to an admissions inquiry: "${userMessage}"

Determine if they are saying YES (interested) or NO (not interested) in admissions.
Reply with ONLY one word: YES or NO.
If unclear, reply: UNCLEAR`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim().toUpperCase();
    
    if (response.includes('YES')) return 'YES';
    if (response.includes('NO')) return 'NO';
    return 'UNCLEAR';
  } catch (err) {
    return 'UNCLEAR';
  }
}

// Generate completion message when all data is collected
function getCompletionMessage(studentName, institutionName) {
  return `🎉 Excellent, *${studentName}*! 

Your information has been successfully recorded. Our admissions team will review your profile and contact you soon!

Do you have any questions about:
• Programs & Eligibility
• Fee Structure  
• Scholarships
• Campus Facilities
• Application Process

Feel free to ask anything! I'm here to help. 😊`;
}

// Thank you message for not interested
function getNotInterestedMessage() {
  return `Thank you for your time! 😊

No worries — if you ever change your mind or want to learn more about our programs in the future, feel free to message us again.

Best of luck with your future endeavors! 🌟`;
}

module.exports = {
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
  loadAdmissionInfo,
};
