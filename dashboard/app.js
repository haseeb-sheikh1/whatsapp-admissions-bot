/**
 * app.js - Admin Dashboard Frontend Logic
 * Real-time updates via Socket.IO + REST API calls
 */

// ====================== INIT ======================

const socket = io();

let allLeads = [];
let outreachTotal = 0;
let outreachSent = 0;
let selectedFile = null;

// Tab navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = item.getAttribute('data-tab');
    switchTab(tab);
  });
});

function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  
  document.getElementById(`nav-${tab}`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');

  const titles = {
    dashboard: ['Dashboard', 'Real-time overview'],
    outreach: ['Send Outreach', 'Start a new campaign'],
    leads: ['Student Leads', 'All collected data'],
    settings: ['Knowledge Base', 'Edit admission information'],
  };

  document.getElementById('page-title').textContent = titles[tab][0];
  document.getElementById('page-subtitle').textContent = titles[tab][1];

  if (tab === 'leads') loadLeads();
  if (tab === 'settings') loadAdmissionInfo();
}

// ====================== CLOCK ======================

function updateClock() {
  const now = new Date();
  const opts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
  document.getElementById('time-display').textContent = now.toLocaleTimeString('en-US', opts);
}
updateClock();
setInterval(updateClock, 1000);

// ====================== SOCKET.IO EVENTS ======================

socket.on('qr', (data) => {
  const qrSection = document.getElementById('qr-section');
  const qrImg = document.getElementById('qr-image');
  const qrLoading = document.getElementById('qr-loading');

  if (data.qr) {
    qrSection.style.display = 'block';
    qrImg.src = data.qr;
    qrImg.style.display = 'block';
    qrLoading.style.display = 'none';
  } else {
    qrSection.style.display = 'none';
  }
});

socket.on('status', (data) => {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const qrSection = document.getElementById('qr-section');

  text.textContent = data.status === 'ready' ? 'Connected ✅' :
                     data.status === 'authenticated' ? 'Authenticating...' :
                     data.status === 'connecting' ? 'Scan QR code' : 'Disconnected';

  dot.className = 'status-dot';
  if (data.status === 'ready') {
    dot.classList.add('connected');
    qrSection.style.display = 'none';
  } else if (data.status === 'connecting' || data.status === 'authenticated') {
    dot.classList.add('connecting');
  }
});

socket.on('stats_update', () => {
  loadStats();
});

socket.on('message', (data) => {
  addActivityItem(data);
  loadLeadsIfOpen();
});

socket.on('outreach_sent', (data) => {
  addActivityItem({
    phone: data.phone,
    text: '(Outreach message sent)',
    reply: 'Initial outreach sent ✅',
    timestamp: data.timestamp,
  });
});

socket.on('outreach_progress', (data) => {
  updateProgress(data.sent, data.total);
});

socket.on('outreach_complete', (data) => {
  const progressText = document.getElementById('progress-text');
  if (progressText) {
    progressText.textContent = `✅ Complete! Sent: ${data.sent}, Failed: ${data.failed}`;
  }
  updateProgress(data.sent + data.failed, data.sent + data.failed);
  loadStats();
});

// ====================== STATS ======================

async function loadStats() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const s = data.stats;

    animateNumber('stat-total', s.total || 0);
    animateNumber('stat-interested', (s.interested || 0));
    animateNumber('stat-completed', s.completed || 0);
    animateNumber('stat-not-interested', s.notInterested || 0);
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const duration = 500;
  const startTime = performance.now();
  
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const current = Math.round(start + (target - start) * progress);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ====================== ACTIVITY FEED ======================

function addActivityItem(data) {
  const feed = document.getElementById('activity-feed');
  const empty = feed.querySelector('.activity-empty');
  if (empty) empty.remove();

  const item = document.createElement('div');
  item.className = 'activity-item';

  const phone = data.phone || 'Unknown';
  const initials = phone.slice(-2);
  const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'Now';

  item.innerHTML = `
    <div class="activity-avatar">${initials}</div>
    <div class="activity-content">
      <div class="activity-phone">📱 +${phone}</div>
      <div class="activity-message">💬 ${escapeHtml(data.text || '')}</div>
      <div class="activity-time">🤖 Bot: ${escapeHtml((data.reply || '').slice(0, 80))}...</div>
      <div class="activity-time">⏰ ${time}</div>
    </div>
  `;

  feed.insertBefore(item, feed.firstChild);

  // Keep max 50 items
  while (feed.children.length > 50) {
    feed.removeChild(feed.lastChild);
  }
}

// ====================== FILE UPLOAD & OUTREACH ======================

const uploadArea = document.getElementById('upload-area');
const csvUpload = document.getElementById('csv-upload');

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) {
    setSelectedFile(file);
  } else {
    alert('Please drop a CSV file.');
  }
});

csvUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) setSelectedFile(file);
});

function setSelectedFile(file) {
  selectedFile = file;
  const fileSelected = document.getElementById('file-selected');
  const fileName = document.getElementById('file-name');
  fileSelected.style.display = 'block';
  fileName.textContent = `📋 ${file.name}`;
}

async function startBulkOutreach() {
  if (!selectedFile) {
    showSingleResult('outreach', 'Please select a CSV file first.', 'error');
    return;
  }

  const delay = parseInt(document.getElementById('message-delay').value);
  const btn = document.getElementById('start-outreach-btn');
  btn.textContent = '⏳ Starting...';
  btn.disabled = true;

  const formData = new FormData();
  formData.append('phonelist', selectedFile);
  formData.append('delay', delay);

  try {
    const res = await fetch('/api/outreach/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (res.ok) {
      outreachTotal = data.count;
      outreachSent = 0;
      document.getElementById('outreach-progress').style.display = 'block';
      updateProgress(0, data.count);
      btn.textContent = `🚀 Sending to ${data.count} numbers...`;
      btn.disabled = true;
    } else {
      btn.textContent = '🚀 Start Outreach Campaign';
      btn.disabled = false;
      alert('Error: ' + data.error);
    }
  } catch (err) {
    btn.textContent = '🚀 Start Outreach Campaign';
    btn.disabled = false;
    alert('Failed to start outreach: ' + err.message);
  }
}

async function sendSingleOutreach() {
  const phone = document.getElementById('single-phone').value.trim();
  const resultEl = document.getElementById('single-result');
  const btn = document.getElementById('single-send-btn');

  if (!phone) {
    resultEl.textContent = '❌ Please enter a phone number.';
    resultEl.className = 'result-message error';
    return;
  }

  btn.textContent = '⏳ Sending...';
  btn.disabled = true;
  resultEl.textContent = '';

  try {
    const res = await fetch('/api/outreach/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();

    if (res.ok) {
      resultEl.textContent = '✅ ' + data.message;
      resultEl.className = 'result-message success';
      document.getElementById('single-phone').value = '';
    } else {
      resultEl.textContent = '❌ ' + data.error;
      resultEl.className = 'result-message error';
    }
  } catch (err) {
    resultEl.textContent = '❌ Error: ' + err.message;
    resultEl.className = 'result-message error';
  } finally {
    btn.textContent = '📤 Send Message';
    btn.disabled = false;
  }
}

function updateProgress(sent, total) {
  const pct = total > 0 ? (sent / total) * 100 : 0;
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = `${sent} / ${total} sent`;

  if (sent >= total && total > 0) {
    const btn = document.getElementById('start-outreach-btn');
    btn.textContent = '🚀 Start Outreach Campaign';
    btn.disabled = false;
  }
}

// ====================== LEADS TABLE ======================

async function loadLeads() {
  try {
    const res = await fetch('/api/students');
    const data = await res.json();
    allLeads = data.students || [];
    renderLeads(allLeads);
  } catch (err) {
    console.error('Failed to load leads:', err);
  }
}

function loadLeadsIfOpen() {
  const leadsTab = document.getElementById('tab-leads');
  if (leadsTab.classList.contains('active')) {
    loadLeads();
  }
}

function renderLeads(leads) {
  const tbody = document.getElementById('leads-tbody');

  if (leads.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-row">No leads yet. Start an outreach campaign to collect student data!</td></tr>';
    return;
  }

  tbody.innerHTML = leads.map((lead, i) => {
    const status = lead['Interest Status'] || '';
    const statusClass = status.toLowerCase().includes('not') ? 'status-not-interested' :
                        status.toLowerCase().includes('collected') ? 'status-completed' :
                        status.toLowerCase().includes('interested') ? 'status-interested' : 'status-pending';

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(lead['Phone Number'] || '')}</td>
        <td>${escapeHtml(lead['Full Name'] || '—')}</td>
        <td>${escapeHtml(lead["Father's Name"] || '—')}</td>
        <td>${escapeHtml(lead['City'] || '—')}</td>
        <td>${escapeHtml(lead['Program Interested In'] || '—')}</td>
        <td>${escapeHtml(lead['FSc Percentage'] || '—')}</td>
        <td>${escapeHtml(lead['Matric Percentage'] || '—')}</td>
        <td>${escapeHtml(lead['CNIC'] || '—')}</td>
        <td>${escapeHtml(lead['Email Address'] || '—')}</td>
        <td><span class="status-badge ${statusClass}">${escapeHtml(status || 'Pending')}</span></td>
        <td>${lead['Timestamp'] ? new Date(lead['Timestamp']).toLocaleDateString() : '—'}</td>
      </tr>`;
  }).join('');
}

function filterLeads() {
  const query = document.getElementById('leads-search').value.toLowerCase();
  const filtered = allLeads.filter(lead => 
    Object.values(lead).some(val => 
      String(val).toLowerCase().includes(query)
    )
  );
  renderLeads(filtered);
}

// ====================== ADMISSION INFO EDITOR ======================

async function loadAdmissionInfo() {
  try {
    const res = await fetch('/api/admission-info');
    const data = await res.json();
    document.getElementById('admission-info-editor').value = data.content || '';
  } catch (err) {
    console.error('Failed to load admission info:', err);
  }
}

async function saveAdmissionInfo() {
  const content = document.getElementById('admission-info-editor').value;
  const resultEl = document.getElementById('save-result');

  try {
    const res = await fetch('/api/admission-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();

    if (res.ok) {
      resultEl.textContent = '✅ ' + data.message;
      resultEl.style.color = '#25d366';
    } else {
      resultEl.textContent = '❌ ' + data.error;
      resultEl.style.color = '#ef4444';
    }

    setTimeout(() => { resultEl.textContent = ''; }, 3000);
  } catch (err) {
    resultEl.textContent = '❌ Error: ' + err.message;
    resultEl.style.color = '#ef4444';
  }
}

// ====================== UTILS ======================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}

function showSingleResult(type, msg, cls) {
  const el = document.getElementById(`${type}-result`);
  if (el) {
    el.textContent = msg;
    el.className = `result-message ${cls}`;
  }
}

// ====================== INITIAL LOAD ======================

loadStats();
setInterval(loadStats, 10000); // refresh stats every 10s
