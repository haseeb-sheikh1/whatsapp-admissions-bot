/**
 * csv.js - CSV read/write manager for student lead data
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const STUDENTS_CSV = path.join(__dirname, '..', 'data', 'students.csv');

// CSV header definition
const CSV_HEADERS = [
  { id: 'phone', title: 'Phone Number' },
  { id: 'name', title: 'Full Name' },
  { id: 'fatherName', title: "Father's Name" },
  { id: 'city', title: 'City' },
  { id: 'program', title: 'Program Interested In' },
  { id: 'fscPercentage', title: 'FSc Percentage' },
  { id: 'matricPercentage', title: 'Matric Percentage' },
  { id: 'cnic', title: 'CNIC' },
  { id: 'email', title: 'Email Address' },
  { id: 'questionsAsked', title: 'Questions Asked' },
  { id: 'interestedStatus', title: 'Interest Status' },
  { id: 'timestamp', title: 'Timestamp' },
];

// Ensure students.csv has headers if it doesn't exist
function initStudentsCSV() {
  if (!fs.existsSync(STUDENTS_CSV)) {
    const headers = CSV_HEADERS.map(h => h.title).join(',');
    fs.writeFileSync(STUDENTS_CSV, headers + '\n');
    console.log('[CSV] Created students.csv with headers.');
  }
}

// Save a student record to CSV
async function saveStudent(studentData) {
  try {
    initStudentsCSV();
    
    const writer = createCsvWriter({
      path: STUDENTS_CSV,
      header: CSV_HEADERS,
      append: true,
    });

    const record = {
      phone: studentData.phone || '',
      name: studentData.name || '',
      fatherName: studentData.fatherName || '',
      city: studentData.city || '',
      program: studentData.program || '',
      fscPercentage: studentData.fscPercentage || '',
      matricPercentage: studentData.matricPercentage || '',
      cnic: studentData.cnic || '',
      email: studentData.email || '',
      questionsAsked: Array.isArray(studentData.questionsAsked)
        ? studentData.questionsAsked.join(' | ')
        : (studentData.questionsAsked || ''),
      interestedStatus: studentData.interestedStatus || 'Interested',
      timestamp: studentData.timestamp || new Date().toISOString(),
    };

    await writer.writeRecords([record]);
    console.log(`[CSV] Saved student: ${record.name} (${record.phone})`);
    return true;
  } catch (err) {
    console.error('[CSV] Error saving student:', err.message);
    return false;
  }
}

// Read phone numbers from uploaded CSV
function readPhoneNumbers(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    
    return records.map(r => ({
      phone: (r.phone_number || r.phone || r.Phone || r.PhoneNumber || '').toString().replace(/\D/g, ''),
      name: r.name || r.Name || '',
    })).filter(r => r.phone && r.phone.length >= 10);
  } catch (err) {
    console.error('[CSV] Error reading phone numbers:', err.message);
    return [];
  }
}

// Read all students from students.csv (for dashboard)
function readAllStudents() {
  try {
    initStudentsCSV();
    const content = fs.readFileSync(STUDENTS_CSV, 'utf8');
    if (!content.trim()) return [];
    
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    return records;
  } catch (err) {
    console.error('[CSV] Error reading students:', err.message);
    return [];
  }
}

// Get students CSV file path
function getStudentsCSVPath() {
  return STUDENTS_CSV;
}

initStudentsCSV();

module.exports = {
  saveStudent,
  readPhoneNumbers,
  readAllStudents,
  getStudentsCSVPath,
};
