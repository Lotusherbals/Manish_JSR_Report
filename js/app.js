// ── State ──────────────────────────────────────────────────────────────────
let selectedDate = getTodayStr();
let calViewYear, calViewMonth;
let selectedMood = '';
let editingTaskId = null;
let isShareView = false;
let shareData = null;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const shareParam = params.get('share');
  const dateParam = params.get('date');

  if (shareParam) {
    isShareView = true;
    try {
      shareData = JSON.parse(atob(shareParam));
      selectedDate = shareData.date || getTodayStr();
    } catch (e) {
      alert('Invalid share link.');
    }
    document.getElementById('shareBanner').classList.remove('hidden');
    document.getElementById('headerActions').classList.add('hidden');
  } else if (dateParam) {
    selectedDate = dateParam;
  }

  const d = new Date(selectedDate + 'T00:00:00');
  calViewYear = d.getFullYear();
  calViewMonth = d.getMonth();

  renderCalendar();
  renderPage();

  document.getElementById('prevMonth').addEventListener('click', () => {
    calViewMonth--;
    if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    calViewMonth++;
    if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendar();
  });
});

// ── Date Helpers ───────────────────────────────────────────────────────────
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}
function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-IN', { weekday: 'long' });
  const today = getTodayStr();
  if (dateStr === today) return day + ' · Today';
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (dateStr === yest.toISOString().split('T')[0]) return day + ' · Yesterday';
  return day;
}
function goToDate(key) {
  if (key === 'today') selectedDate = getTodayStr();
  else if (key === 'yesterday') {
    const d = new Date(); d.setDate(d.getDate() - 1);
    selectedDate = d.toISOString().split('T')[0];
  } else if (key === 'week') {
    selectedDate = getTodayStr();
  }
  const d = new Date(selectedDate + 'T00:00:00');
  calViewYear = d.getFullYear();
  calViewMonth = d.getMonth();
  renderCalendar();
  renderPage();
}

// ── Storage ────────────────────────────────────────────────────────────────
function getKey(date) { return 'jsr_' + date; }
function loadData(date) {
  if (isShareView && shareData) return shareData;
  const raw = localStorage.getItem(getKey(date));
  return raw ? JSON.parse(raw) : { date, tasks: [], jsrReport: {} };
}
function saveData(data) {
  if (isShareView) return;
  localStorage.setItem(getKey(data.date), JSON.stringify(data));
}
function hasData(date) {
  const raw = localStorage.getItem(getKey(date));
  if (!raw) return false;
  const d = JSON.parse(raw);
  return (d.tasks && d.tasks.length > 0) || (d.jsrReport && d.jsrReport.summary);
}

// ── Calendar ───────────────────────────────────────────────────────────────
function renderCalendar() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calMonthYear').textContent = MONTHS[calViewMonth] + ' ' + calViewYear;

  const calDays = document.getElementById('calDays');
  calDays.innerHTML = '';

  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const today = getTodayStr();

  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    calDays.appendChild(blank);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calViewYear + '-' + String(calViewMonth + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;
    if (dateStr === today) el.classList.add('today');
    if (dateStr === selectedDate) el.classList.add('selected');
    if (hasData(dateStr)) el.classList.add('has-data');
    el.addEventListener('click', () => selectDate(dateStr));
    calDays.appendChild(el);
  }
}
function selectDate(dateStr) {
  selectedDate = dateStr;
  renderCalendar();
  renderPage();
}

// ── Page Render ────────────────────────────────────────────────────────────
function renderPage() {
  document.getElementById('displayDate').textContent = formatDisplayDate(selectedDate);
  document.getElementById('displayDay').textContent = formatDayName(selectedDate);
  renderStats();
  renderTasks();
  renderJSR();
}

// ── Stats ──────────────────────────────────────────────────────────────────
function renderStats() {
  const data = loadData(selectedDate);
  const tasks = data.tasks || [];
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'Done').length;
  const prog = tasks.filter(t => t.status === 'In Progress').length;
  const todo = tasks.filter(t => t.status === 'Todo').length;
  let hours = 0;
  tasks.forEach(t => {
    if (t.timeSpent) {
      const hm = t.timeSpent.match(/(\d+(\.\d+)?)\s*h/i);
      const mm = t.timeSpent.match(/(\d+)\s*m/i);
      if (hm) hours += parseFloat(hm[1]);
      if (mm) hours += parseInt(mm[1]) / 60;
    }
  });
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statProgress').textContent = prog;
  document.getElementById('statTodo').textContent = todo;
  document.getElementById('statHours').textContent = hours > 0 ? hours.toFixed(1) + 'h' : '0h';

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressBar').style.width = pct + '%';
}

// ── Tasks ──────────────────────────────────────────────────────────────────
function applyFilters() { renderTasks(); }

function getFilteredTasks(tasks) {
  const statusFilters = [...document.querySelectorAll('.status-filter:checked')].map(el => el.value);
  const priorityFilters = [...document.querySelectorAll('.priority-filter:checked')].map(el => el.value);
  return tasks.filter(t => statusFilters.includes(t.status) && priorityFilters.includes(t.priority));
}

function sortTasks(tasks) {
  const sort = document.getElementById('sortTasks')?.value || 'priority';
  const priorityOrder = { High: 0, Medium: 1, Low: 2 };
  const statusOrder = { 'In Progress': 0, Todo: 1, Done: 2 };
  return [...tasks].sort((a, b) => {
    if (sort === 'priority') return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
    if (sort === 'status') return (statusOrder[a.status] || 1) - (statusOrder[b.status] || 1);
    if (sort === 'time') return (b.timeSpent || '').localeCompare(a.timeSpent || '');
    return 0;
  });
}

function renderTasks() {
  const data = loadData(selectedDate);
  const tasks = sortTasks(getFilteredTasks(data.tasks || []));
  const container = document.getElementById('taskList');
  const empty = document.getElementById('emptyTasks');

  if (tasks.length === 0) {
    container.innerHTML = '';
    container.appendChild(empty);
    empty.classList.remove('hidden');
    if (isShareView) empty.querySelector('button')?.remove();
    return;
  }
  empty.classList.add('hidden');

  const existing = [...container.querySelectorAll('.task-card')];
  existing.forEach(el => el.remove());

  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card' + (task.status === 'Done' ? ' status-done' : '');
    card.dataset.id = task.id;

    const isDone = task.status === 'Done';
    const editBtn = isShareView ? '' : `<button class="task-action-btn" onclick="editTask('${task.id}')">Edit</button>`;
    const delBtn = isShareView ? '' : `<button class="task-action-btn delete" onclick="deleteTask('${task.id}')">Delete</button>`;
    const checkClass = isDone ? 'task-check done' : 'task-check';
    const titleClass = isDone ? 'task-title done-text' : 'task-title';
    const toggleFn = isShareView ? '' : `onclick="toggleDone('${task.id}')"`;

    card.innerHTML = `
      <div class="task-card-top">
        <div class="${checkClass}" ${toggleFn}></div>
        <div class="${titleClass}">${escHtml(task.title)}</div>
        <div class="task-actions">${editBtn}${delBtn}</div>
      </div>
      ${task.description ? `<div class="task-desc">${escHtml(task.description)}</div>` : ''}
      <div class="task-meta">
        <span class="badge ${statusBadgeClass(task.status)}">${task.status}</span>
        <span class="badge ${priorityBadgeClass(task.priority)}">${task.priority}</span>
        ${task.category ? `<span class="badge badge-category">${task.category}</span>` : ''}
        ${task.timeSpent ? `<span class="badge badge-time">⏱ ${task.timeSpent}</span>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

function statusBadgeClass(s) {
  if (s === 'Done') return 'badge-done';
  if (s === 'In Progress') return 'badge-progress';
  return 'badge-todo';
}
function priorityBadgeClass(p) {
  if (p === 'High') return 'badge-high';
  if (p === 'Medium') return 'badge-medium';
  return 'badge-low';
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Task CRUD ──────────────────────────────────────────────────────────────
function openAddTask() {
  editingTaskId = null;
  document.getElementById('modalTitle').textContent = 'Add Task';
  document.getElementById('taskId').value = '';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskCategory').value = 'Development';
  document.getElementById('taskPriority').value = 'Medium';
  document.getElementById('taskStatus').value = 'Todo';
  document.getElementById('taskTime').value = '';
  document.getElementById('taskModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}
function editTask(id) {
  const data = loadData(selectedDate);
  const task = data.tasks.find(t => t.id === id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById('modalTitle').textContent = 'Edit Task';
  document.getElementById('taskId').value = id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDesc').value = task.description || '';
  document.getElementById('taskCategory').value = task.category || 'Development';
  document.getElementById('taskPriority').value = task.priority || 'Medium';
  document.getElementById('taskStatus').value = task.status || 'Todo';
  document.getElementById('taskTime').value = task.timeSpent || '';
  document.getElementById('taskModal').classList.remove('hidden');
}
function saveTask() {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) { document.getElementById('taskTitle').focus(); return; }
  const data = loadData(selectedDate);
  if (editingTaskId) {
    const idx = data.tasks.findIndex(t => t.id === editingTaskId);
    if (idx > -1) {
      data.tasks[idx] = {
        ...data.tasks[idx],
        title,
        description: document.getElementById('taskDesc').value.trim(),
        category: document.getElementById('taskCategory').value,
        priority: document.getElementById('taskPriority').value,
        status: document.getElementById('taskStatus').value,
        timeSpent: document.getElementById('taskTime').value.trim(),
      };
    }
  } else {
    data.tasks.push({
      id: 'task_' + Date.now(),
      title,
      description: document.getElementById('taskDesc').value.trim(),
      category: document.getElementById('taskCategory').value,
      priority: document.getElementById('taskPriority').value,
      status: document.getElementById('taskStatus').value,
      timeSpent: document.getElementById('taskTime').value.trim(),
      createdAt: Date.now()
    });
  }
  saveData(data);
  closeModal();
  renderStats();
  renderTasks();
  renderCalendar();
}
function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  const data = loadData(selectedDate);
  data.tasks = data.tasks.filter(t => t.id !== id);
  saveData(data);
  renderStats();
  renderTasks();
  renderCalendar();
}
function toggleDone(id) {
  const data = loadData(selectedDate);
  const task = data.tasks.find(t => t.id === id);
  if (!task) return;
  task.status = task.status === 'Done' ? 'Todo' : 'Done';
  if (task.status === 'Done') task.completedAt = Date.now();
  saveData(data);
  renderStats();
  renderTasks();
  renderCalendar();
}
function closeModal() {
  document.getElementById('taskModal').classList.add('hidden');
  editingTaskId = null;
}

// ── JSR Report ─────────────────────────────────────────────────────────────
function renderJSR() {
  const data = loadData(selectedDate);
  const r = data.jsrReport || {};
  document.getElementById('viewSummary').textContent = r.summary || '—';
  document.getElementById('viewAchievements').textContent = r.achievements || '—';
  document.getElementById('viewBlockers').textContent = r.blockers || '—';
  document.getElementById('viewNextDay').textContent = r.nextDayPlan || '—';
  document.getElementById('viewMood').textContent = r.mood || '—';
  if (isShareView) document.getElementById('jsrEditBtn')?.classList.add('hidden');
}
function toggleJSREdit() {
  const data = loadData(selectedDate);
  const r = data.jsrReport || {};
  document.getElementById('jsrSummary').value = r.summary || '';
  document.getElementById('jsrAchievements').value = r.achievements || '';
  document.getElementById('jsrBlockers').value = r.blockers || '';
  document.getElementById('jsrNextDay').value = r.nextDayPlan || '';
  selectedMood = r.mood || '';
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('onclick').includes(selectedMood));
  });
  document.getElementById('jsrView').classList.add('hidden');
  document.getElementById('jsrEdit').classList.remove('hidden');
  document.getElementById('jsrEditBtn').textContent = '';
}
function cancelJSREdit() {
  document.getElementById('jsrView').classList.remove('hidden');
  document.getElementById('jsrEdit').classList.add('hidden');
  document.getElementById('jsrEditBtn').textContent = 'Edit';
}
function saveJSR() {
  const data = loadData(selectedDate);
  data.jsrReport = {
    summary: document.getElementById('jsrSummary').value.trim(),
    achievements: document.getElementById('jsrAchievements').value.trim(),
    blockers: document.getElementById('jsrBlockers').value.trim(),
    nextDayPlan: document.getElementById('jsrNextDay').value.trim(),
    mood: selectedMood
  };
  saveData(data);
  cancelJSREdit();
  renderJSR();
  renderCalendar();
}
function selectMood(btn, mood) {
  selectedMood = mood;
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

// ── Share ──────────────────────────────────────────────────────────────────
function shareReport() {
  const data = loadData(selectedDate);
  const encoded = btoa(JSON.stringify(data));
  const url = window.location.origin + window.location.pathname + '?share=' + encoded;
  document.getElementById('shareDate').textContent = formatDisplayDate(selectedDate);
  document.getElementById('shareUrl').value = url;
  document.getElementById('copySuccess').classList.add('hidden');
  document.getElementById('shareModal').classList.remove('hidden');
}
function copyShareUrl() {
  const url = document.getElementById('shareUrl').value;
  navigator.clipboard.writeText(url).then(() => {
    document.getElementById('copySuccess').classList.remove('hidden');
    setTimeout(() => document.getElementById('copySuccess').classList.add('hidden'), 3000);
  });
}
function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

// ── Print ──────────────────────────────────────────────────────────────────
function printReport() {
  const data = loadData(selectedDate);
  const tasks = data.tasks || [];
  const r = data.jsrReport || {};
  document.getElementById('printDate').textContent = formatDisplayDate(selectedDate);
  let html = `<div class="print-tasks"><h2>Tasks</h2>`;
  if (tasks.length === 0) html += '<p>No tasks for this day.</p>';
  tasks.forEach(t => {
    html += `<div class="print-task-item"><strong>${escHtml(t.title)}</strong> [${t.status}] [${t.priority}]${t.category ? ' — ' + t.category : ''}${t.timeSpent ? ' — ⏱ ' + t.timeSpent : ''}${t.description ? '<br><small>' + escHtml(t.description) + '</small>' : ''}</div>`;
  });
  html += `</div><div class="print-jsr-section"><h2>JSR Report</h2>`;
  [['Summary', r.summary], ['Achievements', r.achievements], ['Blockers', r.blockers], ['Next Day Plan', r.nextDayPlan], ['Mood', r.mood]].forEach(([label, val]) => {
    html += `<div class="print-jsr-field"><div class="print-jsr-label">${label}</div><div class="print-jsr-val">${escHtml(val || '—')}</div></div>`;
  });
  html += '</div>';
  document.getElementById('printContent').innerHTML = html;
  window.print();
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeShareModal(); cancelJSREdit(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !isShareView) { e.preventDefault(); openAddTask(); }
});
