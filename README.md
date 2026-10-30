# 🎓 WhatsApp AI Admissions Bot

An AI-powered WhatsApp chatbot that automatically reaches out to prospective students, collects their data, answers their questions, and saves everything to a CSV file for Phase 1 processing.

---

## ✨ Features

- 📤 **Bulk Outreach** — Upload a CSV of phone numbers and the bot texts them all automatically
- 🤖 **AI Conversations** — Powered by Google Gemini (free), understands both English and Roman Urdu
- 📋 **Data Collection** — Collects: Name, Father's Name, City, Program, FSc %, Matric %, CNIC, Email
- 💬 **Q&A Mode** — Answers student questions about fees, programs, deadlines using your knowledge base
- 📊 **Admin Dashboard** — Beautiful web UI to monitor everything in real-time at `http://localhost:3000`
- ⬇️ **CSV Export** — Download all student leads with one click

---

## 🚀 Quick Start

### Step 1: Get Your Free Gemini API Key
1. Go to: https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Copy your key

### Step 2: Configure the Bot
Edit the `.env` file:
```
GEMINI_API_KEY=your_key_here
INSTITUTION_NAME=Your Institution Name
PORT=3000
```

### Step 3: Customize Admission Info
Edit `data/admission_info.txt` with your institution's real information:
- Programs offered
- Fees
- Eligibility criteria
- Deadlines
- Contact info
- FAQs

(You can also edit this from the dashboard)

### Step 4: Start the Bot
```bash
npm start
```

### Step 5: Connect WhatsApp
1. Open `http://localhost:3000` in your browser
2. A QR code will appear on the dashboard
3. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
4. Scan the QR code
5. The bot is now connected! ✅

### Step 6: Start Outreach
1. Go to the **"Send Outreach"** tab in the dashboard
2. Upload your CSV file with phone numbers (column must be named `phone_number`)
3. Set the delay between messages (5 seconds recommended)
4. Click "Start Outreach Campaign"

---

## 📁 Phone Numbers CSV Format

Your CSV file must look like this:
```csv
phone_number,name
923001234567,Ali Ahmed
923012345678,Sara Khan
```

- Phone numbers must include country code (92 for Pakistan)
- No spaces, dashes, or + signs
- The column must be named `phone_number`

---

## 📊 Student Data Collected

The bot collects and saves to `data/students.csv`:

| Field | Description |
|-------|-------------|
| Phone Number | Auto-captured from WhatsApp |
| Full Name | Student's name |
| Father's Name | Father's full name |
| City | Student's city |
| Program Interested In | Program they want to enroll in |
| FSc Percentage | FSc/Inter marks percentage |
| Matric Percentage | Matric marks percentage |
| CNIC | Student's CNIC number |
| Email Address | Student's email |
| Questions Asked | Questions the student asked the bot |
| Interest Status | Interested / Not Interested / Data Collected |
| Timestamp | When the conversation happened |

---

## ⚠️ Important Notes

- **Rate Limiting**: Use at least 5 seconds delay between messages to avoid WhatsApp temporarily blocking your number
- **Phone Number Format**: Always include country code. Pakistan = 92. Example: `923001234567` (not `03001234567`)
- **Don't spam**: Only send to phone numbers of people who have given you their number willingly
- **Keep the bot running**: The Node.js process must stay running for the bot to work. Don't close the terminal.
- **Session persistence**: If you restart the bot, it remembers previous conversations (saved in `data/sessions.json`)

---

## 🛠️ Project Structure

```
whatsapp-bot/
├── index.js              # Main server
├── bot/
│   ├── whatsapp.js       # WhatsApp client
│   ├── ai.js             # Gemini AI engine
│   ├── sessions.js       # Conversation state manager
│   └── csv.js            # CSV read/write
├── dashboard/
│   ├── index.html        # Admin dashboard UI
│   ├── style.css         # Dashboard styles
│   └── app.js            # Dashboard frontend
├── data/
│   ├── admission_info.txt # AI knowledge base (edit this!)
│   ├── phone_numbers.csv  # Sample input format
│   └── students.csv       # Output - collected student data
├── .env                   # Your API keys (keep private!)
└── package.json
```
