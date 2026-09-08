// ─────────────────────────────────────────────────────────────────────────
//  MANISH JSR DASHBOARD — localStorage version (no Firebase)
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'jsr_data';

let currentView       = 'kanban';
let calViewYear, calViewMonth;
let selectedMood      = '';
let editingTaskId     = null;
let editingTaskDate   = null;
let defaultTaskStatus = 'Todo';
let activeDateFilter  = null;
let activeMonthFilter = 'all';
let selectedDate      = todayStr();
let localReportCache  = {};

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();

  const params    = new URLSearchParams(window.location.search);
  const dateParam = params.get('date');
  if (dateParam) { selectedDate = dateParam; activeDateFilter = dateParam; }

  const d = new Date(selectedDate + 'T00:00:00');
  calViewYear  = d.getFullYear();
  calViewMonth = d.getMonth();

  document.getElementById('mfCurLabel').textContent = monthKey(todayStr());

  document.getElementById('prevMonth').addEventListener('click', () => {
    calViewMonth--; if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    calViewMonth++; if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendar();
  });

  renderAll();
});

// ── Storage ───────────────────────────────────────────────────────────────
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    localReportCache = raw ? JSON.parse(raw) : {};
  } catch(e) { localReportCache = {}; }

  // Pre-seed with spreadsheet data on first load
  if (Object.keys(localReportCache).length === 0) seedData();
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localReportCache));
}

function saveReport(data) {
  localReportCache[data.date] = data;
  saveToStorage();
}

// ── Seed Data (from spreadsheet) ──────────────────────────────────────────
function seedData() {
  const seed = [
    { date: '2026-09-01', tasks: [
      { title: 'Shared the monthly DB and LO website sale report',                                              category: 'DB, LO',              status: 'Done',        priority: 'Medium' },
      { title: 'Create New offer on Soultree Website — collection page, product recall, banner, auto discount', category: 'ST',                  status: 'Done',        priority: 'High'   },
      { title: 'Create Two Offers in Webstore — collection page, banner, menu changes, gokwik coupon',         category: 'LBT',                 status: 'Done',        priority: 'High'   },
      { title: 'Urgent: Address changes needed for all webstore',                                               category: 'D2C',                 status: 'Done',        priority: 'High'   },
      { title: 'New 2 product listing — 1. Pure Radiance  2. Color-X',                                         category: 'D2C',                 status: 'In Progress', priority: 'Medium' },
      { title: 'Free shipping coding on the Makeup barter coupon code',                                         category: 'General',             status: 'Done',        priority: 'Medium' }
    ]},
    { date: '2026-09-02', tasks: [
      { title: 'GrowthCure invoice summit to finance Team',                                                     category: 'D2C',                 status: 'Done',        priority: 'Medium' },
      { title: 'Monthly Performances sheet follow up with Growth cure',                                         category: 'General',             status: 'Done',        priority: 'Medium' },
      { title: 'Creative requirement share to Brand team and Growthcure team',                                  category: 'Lotus',               status: 'Done',        priority: 'Medium' },
      { title: 'Remove the last month offer banner',                                                            category: 'Lotus',               status: 'In Progress', priority: 'Medium' },
      { title: 'Call with KE team regarding SMS OTP integration',                                               category: 'LP',                  status: 'Done',        priority: 'High'   },
      { title: 'Meeting with finance team regarding the invoices',                                              category: 'D2C',                 status: 'Done',        priority: 'Medium' },
      { title: 'New Store Listing on the Soultree',                                                             category: 'ST',                  status: 'Done',        priority: 'Medium' },
      { title: 'DLT SMS template — approve from DLT, list on KE platform, send to Loyalty team',               category: 'LO',                  status: 'Done',        priority: 'Medium' },
      { title: 'Update stock on master sheet on Lotus website — all SKU',                                       category: 'LH, D2C, Operations', status: 'Done',        priority: 'High'   },
      { title: 'WhiteGlow SKU update stock — one by one continue selling',                                      category: 'LH, D2C, Operations', status: 'Done',        priority: 'Medium' },
      { title: 'Make master sheet of all SKU (LH, LM, LO, DB)',                                                category: 'Operations',          status: 'In Progress', priority: 'High'   }
    ]},
    { date: '2026-09-03', tasks: [
      { title: 'Website Payment Recon Data — Lotus',                                                            category: 'Operations, D2C, LH', status: 'Todo',        priority: 'High'   },
      { title: 'Website Payment Recon Data — LP',                                                               category: 'Operations, LP, D2C', status: 'Todo',        priority: 'High'   },
      { title: 'Website Payment Recon Data — LBT',                                                              category: 'Operations, D2C, LBT',status: 'Todo',        priority: 'High'   },
      { title: 'Website Payment Recon Data — Dermacy',                                                          category: 'D2C, Operations',     status: 'Todo',        priority: 'High'   },
      { title: 'Last 3 Month LBT Payment Recon — Payment Gateway, Invoice, Order with transaction ID',         category: 'D2C, LBT, Operations',status: 'In Progress', priority: 'High'   }
    ]}
  ];

  seed.forEach(r => {
    localReportCache[r.date] = {
      date: r.date,
      jsrReport: {},
      tasks: r.tasks.map((t, i) => ({
        id: 'task_' + r.date.replace(/-/g,'') + '_' + i,
        title: t.title, description: '', category: t.category,
        priority: t.priority, status: t.status, timeSpent: '',
        addedBy: 'manish.sahu', createdAt: Date.now() + i
      }))
    };
  });
  saveToStorage();
}

// ── Date Helpers ──────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDisplay(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
}
function formatShort(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}
function monthKey(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month:'short', year:'numeric' });
}
function monthSortKey(d) { return (d || '').substring(0, 7); }

// ── Render All ────────────────────────────────────────────────────────────
function renderAll() {
  const tasks = getFilteredTasks();
  renderTitleBar(tasks);
  renderStats(tasks);
  renderMonthTotals();
  renderCalendar();
  renderDayPreview(selectedDate);
  renderDateTabs();
  populateMonthFilter();
  if (currentView === 'kanban') renderKanban(tasks);
  else renderList(tasks);
  renderJSR(selectedDate);
}

function applyFilters() { renderAll(); }

function resetFilters() {
  document.getElementById('searchInput').value   = '';
  document.getElementById('filterMonth').value   = '';
  document.getElementById('filterStatus').value  = '';
  document.getElementById('filterPriority').value= '';
  activeDateFilter  = null;
  activeMonthFilter = 'all';
  document.getElementById('mfAll').classList.add('active');
  document.getElementById('mfCur').classList.remove('active');
  renderAll();
}

function setView(view) {
  currentView = view;
  ['Kanban','List','Cal'].forEach(v => document.getElementById('btn'+v)?.classList.remove('active'));
  document.getElementById('kanbanView').classList.add('hidden');
  document.getElementById('listView').classList.add('hidden');
  if (view === 'kanban') {
    document.getElementById('btnKanban').classList.add('active');
    document.getElementById('kanbanView').classList.remove('hidden');
  } else {
    document.getElementById('btnList').classList.add('active');
    document.getElementById('listView').classList.remove('hidden');
  }
  renderAll();
}

function setMonthFilter(filter) {
  activeMonthFilter = filter;
  document.getElementById('mfAll').classList.toggle('active', filter === 'all');
  document.getElementById('mfCur').classList.toggle('active', filter === 'current');
  renderAll();
}

function clearDateFilter() {
  activeDateFilter = null;
  document.getElementById('dpClearBtn').style.display = 'none';
  document.getElementById('dpFilter').classList.add('hidden');
  renderAll();
}

// ── Tasks ─────────────────────────────────────────────────────────────────
function getAllTasks() {
  const tasks = [];
  for (const [date, report] of Object.entries(localReportCache)) {
    (report.tasks || []).forEach(t => tasks.push({ ...t, date }));
  }
  return tasks;
}

function getFilteredTasks() {
  let tasks = getAllTasks();
  if (activeDateFilter) tasks = tasks.filter(t => t.date === activeDateFilter);
  if (activeMonthFilter === 'current') {
    const cur = monthSortKey(todayStr());
    tasks = tasks.filter(t => monthSortKey(t.date) === cur);
  }
  const fMonth = document.getElementById('filterMonth')?.value;
  if (fMonth) tasks = tasks.filter(t => monthSortKey(t.date) === fMonth);
  const fStatus = document.getElementById('filterStatus')?.value;
  if (fStatus) tasks = tasks.filter(t => t.status === fStatus);
  const fPriority = document.getElementById('filterPriority')?.value;
  if (fPriority) tasks = tasks.filter(t => t.priority === fPriority);
  const search = document.getElementById('searchInput')?.value.trim().toLowerCase();
  if (search) tasks = tasks.filter(t =>
    (t.title||'').toLowerCase().includes(search) ||
    (t.description||'').toLowerCase().includes(search) ||
    (t.category||'').toLowerCase().includes(search)
  );
  return tasks;
}

// ── Title Bar ─────────────────────────────────────────────────────────────
function renderTitleBar(tasks) {
  const badge = document.getElementById('dateBadge');
  const sub   = document.getElementById('dbSub');
  if (activeDateFilter) {
    badge.textContent = '📅 ' + formatDisplay(activeDateFilter);
    sub.textContent   = `Showing ${tasks.length} task${tasks.length !== 1 ? 's' : ''} for ${formatShort(activeDateFilter)}`;
  } else {
    badge.textContent = '📅 All Dates';
    sub.textContent   = `Showing ${tasks.length} task${tasks.length !== 1 ? 's' : ''} across all dates`;
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────
function renderStats(tasks) {
  const total = tasks.length;
  const done  = tasks.filter(t => t.status === 'Done').length;
  const prog  = tasks.filter(t => t.status === 'In Progress').length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('statTotal').textContent    = total;
  document.getElementById('statDone').textContent     = done;
  document.getElementById('statProgress').textContent = prog;
  document.getElementById('statPct').textContent      = pct + '%';
  document.getElementById('statBar').style.width      = pct + '%';
  document.getElementById('statRatio').textContent    = done + '/' + total;
}

// ── Month Totals ──────────────────────────────────────────────────────────
function renderMonthTotals() {
  const byMonth = {};
  Object.entries(localReportCache).forEach(([date, report]) => {
    const mk = monthSortKey(date);
    if (!byMonth[mk]) byMonth[mk] = { total:0, done:0, inp:0, todo:0, label: monthKey(date), mk };
    (report.tasks||[]).forEach(t => {
      byMonth[mk].total++;
      if (t.status==='Done')        byMonth[mk].done++;
      else if (t.status==='In Progress') byMonth[mk].inp++;
      else                          byMonth[mk].todo++;
    });
  });

  let months = Object.values(byMonth).sort((a,b) => b.mk.localeCompare(a.mk));
  if (activeMonthFilter === 'current') {
    const cur = monthSortKey(todayStr());
    months = months.filter(m => m.mk === cur);
  }

  document.getElementById('monthCount').textContent  = months.length + ' Month(s)';
  document.getElementById('monthFooter').textContent = activeMonthFilter === 'current' ? 'Showing current month only' : 'Showing totals for all months';

  const container = document.getElementById('monthTotals');
  container.innerHTML = '';
  if (!months.length) { container.innerHTML = '<div style="padding:20px 16px;color:var(--text3);font-size:13px">No task data yet</div>'; return; }

  months.forEach(m => {
    const pct = m.total > 0 ? Math.round((m.done/m.total)*100) : 0;
    const row = document.createElement('div');
    row.className = 'month-row';
    row.innerHTML = `
      <div class="month-row-top">
        <span class="month-row-name">${m.label}</span>
        <span class="month-row-total">${m.total} tasks</span>
        <span class="month-row-pct">${pct}%</span>
      </div>
      <div class="month-row-bar-bg"><div class="month-row-bar-fill" style="width:${pct}%"></div></div>
      <div class="month-row-bottom">
        <span class="month-stat ms-inp">⏳ ${m.inp} in progress</span>
        <span class="month-stat ms-done">✅ ${m.done} done</span>
        <span class="month-stat ms-todo">🔲 ${m.todo} todo</span>
      </div>`;
    container.appendChild(row);
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────
function renderCalendar() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calMonthYear').textContent = MONTHS[calViewMonth] + ' ' + calViewYear;

  const grid = document.querySelector('.big-cal-grid');
  [...grid.children].forEach(c => { if (!c.classList.contains('bcal-hdr')) c.remove(); });

  const today    = todayStr();
  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysIn   = new Date(calViewYear, calViewMonth+1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const e = document.createElement('div'); e.className = 'bcal-day bcal-empty'; grid.appendChild(e);
  }
  for (let d = 1; d <= daysIn; d++) {
    const ds     = calViewYear + '-' + String(calViewMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const tasks  = localReportCache[ds]?.tasks || [];
    const hasDone= tasks.some(t => t.status==='Done');
    const hasInp = tasks.some(t => t.status==='In Progress');
    const hasTodo= tasks.some(t => t.status==='Todo');

    const el = document.createElement('div');
    let cls = 'bcal-day';
    if (ds === today)            cls += ' bcal-today';
    if (ds === activeDateFilter) cls += ' bcal-selected';
    if (tasks.length)            cls += ' bcal-has-tasks';
    el.className = cls;
    el.innerHTML = `<span class="bcal-num">${d}</span>
      <div class="bcal-dots">
        ${hasInp  ? '<span class="day-dot day-dot-inp"></span>'  : ''}
        ${hasDone ? '<span class="day-dot day-dot-done"></span>' : ''}
        ${hasTodo ? '<span class="day-dot day-dot-todo"></span>' : ''}
      </div>`;
    el.addEventListener('click', () => {
      activeDateFilter = ds; selectedDate = ds;
      const dt = new Date(ds + 'T00:00:00');
      calViewYear = dt.getFullYear(); calViewMonth = dt.getMonth();
      renderAll();
    });
    grid.appendChild(el);
  }
}

// ── Day Preview ───────────────────────────────────────────────────────────
function renderDayPreview(date) {
  document.getElementById('dpDate').textContent = formatDisplay(date);
  const tasks = localReportCache[date]?.tasks || [];
  document.getElementById('dpTotal').textContent = tasks.length;
  document.getElementById('dpDone').textContent  = tasks.filter(t=>t.status==='Done').length;
  document.getElementById('dpInp').textContent   = tasks.filter(t=>t.status==='In Progress').length;
  document.getElementById('dpTodo').textContent  = tasks.filter(t=>t.status==='Todo').length;

  const hasFilter = !!activeDateFilter;
  document.getElementById('dpFilter').classList.toggle('hidden', !hasFilter);
  document.getElementById('dpClearBtn').style.display = hasFilter ? '' : 'none';

  const active = tasks.filter(t=>t.status==='In Progress').slice(0,3);
  document.getElementById('dpActive').innerHTML = active.map(t =>
    `<div class="dp-task-item"><span class="dp-task-dot"></span>${esc(t.title)}</div>`
  ).join('');
}

// ── Date Tabs ─────────────────────────────────────────────────────────────
function renderDateTabs() {
  const container = document.getElementById('dateTabs');
  container.innerHTML = '';

  const allCount = getAllTasks().length;
  const allTab   = document.createElement('div');
  allTab.className = 'date-tab' + (!activeDateFilter ? ' active' : '');
  allTab.innerHTML = `All <span class="date-tab-count">${allCount}</span>`;
  allTab.onclick   = () => { activeDateFilter = null; renderAll(); };
  container.appendChild(allTab);

  Object.keys(localReportCache)
    .filter(d => (localReportCache[d].tasks||[]).length > 0)
    .sort((a,b) => b.localeCompare(a))
    .slice(0, 12)
    .forEach(d => {
      const count = localReportCache[d].tasks.length;
      const tab   = document.createElement('div');
      tab.className = 'date-tab' + (activeDateFilter === d ? ' active' : '');
      tab.innerHTML = `${formatShort(d)} <span class="date-tab-count">${count}</span>`;
      tab.onclick   = () => {
        activeDateFilter = d; selectedDate = d;
        const dt = new Date(d+'T00:00:00');
        calViewYear = dt.getFullYear(); calViewMonth = dt.getMonth();
        renderAll();
      };
      container.appendChild(tab);
    });
}

// ── Month Filter Dropdown ─────────────────────────────────────────────────
function populateMonthFilter() {
  const sel = document.getElementById('filterMonth');
  const cur = sel.value;
  const months = [...new Set(
    Object.keys(localReportCache)
      .filter(d => (localReportCache[d].tasks||[]).length)
      .map(d => monthSortKey(d))
  )].sort((a,b) => b.localeCompare(a));

  sel.innerHTML = '<option value="">Month: All</option>';
  months.forEach(mk => {
    const sample = Object.keys(localReportCache).find(d => monthSortKey(d)===mk);
    const opt = document.createElement('option');
    opt.value = mk; opt.textContent = sample ? monthKey(sample) : mk;
    if (mk === cur) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Kanban ────────────────────────────────────────────────────────────────
function renderKanban(tasks) {
  const inp  = tasks.filter(t=>t.status==='In Progress');
  const done = tasks.filter(t=>t.status==='Done');
  const todo = tasks.filter(t=>t.status==='Todo');

  document.getElementById('kColInpCount').textContent  = inp.length;
  document.getElementById('kColDoneCount').textContent = done.length;
  document.getElementById('kColTodoCount').textContent = todo.length;

  renderKCol('colInProgress', inp);
  renderKCol('colDone', done);
  renderKCol('colTodo', todo);
}

function renderKCol(colId, tasks) {
  const col = document.getElementById(colId);
  col.innerHTML = '';
  if (!tasks.length) { col.innerHTML = '<div class="k-empty">No tasks</div>'; return; }

  tasks.forEach(task => {
    const isDone = task.status === 'Done';
    const card   = document.createElement('div');
    card.className = 'k-card' + (isDone ? ' k-done' : '');
    card.innerHTML = `
      <div class="k-card-top">
        <span class="k-check" onclick="toggleDone('${task.date}','${esc(task.id)}')" title="Toggle Done">
          ${isDone ? '✅' : task.status==='In Progress' ? '⏳' : '🔲'}
        </span>
        <span class="k-title ${isDone ? 'k-done-text' : ''}">${esc(task.title)}</span>
        <div class="k-actions">
          <button class="k-action edit" onclick="editTask('${task.date}','${esc(task.id)}')">✏️</button>
          <button class="k-action del"  onclick="deleteTask('${task.date}','${esc(task.id)}')">🗑️</button>
        </div>
      </div>
      ${task.description ? `<div class="k-desc">${esc(task.description)}</div>` : ''}
      <div class="k-meta">
        <span class="k-badge ${priorityClass(task.priority)}">${task.priority||'Medium'}</span>
        ${task.category ? `<span class="k-badge k-badge-cat">${esc(task.category)}</span>` : ''}
        ${task.timeSpent? `<span class="k-badge k-badge-time">⏱ ${esc(task.timeSpent)}</span>` : ''}
        <span class="k-date">${formatShort(task.date||'')}</span>
      </div>`;
    col.appendChild(card);
  });
}

// ── List View ─────────────────────────────────────────────────────────────
function renderList(tasks) {
  const container = document.getElementById('listItems');
  container.innerHTML = '';
  if (!tasks.length) { container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3)">No tasks found.</div>'; return; }

  const byDate = {};
  tasks.forEach(t => { if (!byDate[t.date]) byDate[t.date]=[]; byDate[t.date].push(t); });

  Object.keys(byDate).sort((a,b)=>b.localeCompare(a)).forEach(date => {
    const group = document.createElement('div');
    group.innerHTML = `<div class="list-date-header">${formatDisplay(date)} <span class="ldh-count">${byDate[date].length}</span></div>`;
    byDate[date].forEach(task => {
      const isDone = task.status==='Done';
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <span class="list-check" onclick="toggleDone('${task.date}','${esc(task.id)}')">${isDone?'✅':task.status==='In Progress'?'⏳':'🔲'}</span>
        <span class="list-title ${isDone?'k-done-text':''}">${esc(task.title)}</span>
        <span class="k-badge ${statusClass(task.status)}">${task.status}</span>
        <span class="k-badge ${priorityClass(task.priority)}">${task.priority||'Medium'}</span>
        ${task.category?`<span class="k-badge k-badge-cat">${esc(task.category)}</span>`:''}
        <div class="list-row-actions">
          <button class="k-action edit" onclick="editTask('${task.date}','${esc(task.id)}')">✏️</button>
          <button class="k-action del"  onclick="deleteTask('${task.date}','${esc(task.id)}')">🗑️</button>
        </div>`;
      group.appendChild(row);
    });
    container.appendChild(group);
  });
}

// ── JSR ───────────────────────────────────────────────────────────────────
function renderJSR(date) {
  document.getElementById('jsrDateLabel').textContent    = formatDisplay(date);
  const r = localReportCache[date]?.jsrReport || {};
  document.getElementById('viewSummary').textContent      = r.summary      || 'Click Edit to add summary...';
  document.getElementById('viewAchievements').textContent = r.achievements || '—';
  document.getElementById('viewBlockers').textContent     = r.blockers     || '—';
  document.getElementById('viewNextDay').textContent      = r.nextDayPlan  || '—';
  document.getElementById('viewMood').textContent         = r.mood         || '—';
}

function toggleJSREdit() {
  const r = localReportCache[selectedDate]?.jsrReport || {};
  document.getElementById('jsrSummary').value      = r.summary      || '';
  document.getElementById('jsrAchievements').value = r.achievements || '';
  document.getElementById('jsrBlockers').value     = r.blockers     || '';
  document.getElementById('jsrNextDay').value      = r.nextDayPlan  || '';
  selectedMood = r.mood || '';
  document.querySelectorAll('.mood-btn').forEach(b =>
    b.classList.toggle('selected', selectedMood && b.getAttribute('onclick')?.includes(selectedMood))
  );
  document.getElementById('jsrView').classList.add('hidden');
  document.getElementById('jsrEdit').classList.remove('hidden');
}

function cancelJSREdit() {
  document.getElementById('jsrView').classList.remove('hidden');
  document.getElementById('jsrEdit').classList.add('hidden');
}

function saveJSR() {
  const data = localReportCache[selectedDate] || { date: selectedDate, tasks: [], jsrReport: {} };
  data.jsrReport = {
    summary:      document.getElementById('jsrSummary').value.trim(),
    achievements: document.getElementById('jsrAchievements').value.trim(),
    blockers:     document.getElementById('jsrBlockers').value.trim(),
    nextDayPlan:  document.getElementById('jsrNextDay').value.trim(),
    mood:         selectedMood
  };
  saveReport(data);
  cancelJSREdit();
  renderJSR(selectedDate);
}

function selectMood(btn, mood) {
  selectedMood = mood;
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

// ── Task CRUD ─────────────────────────────────────────────────────────────
function openAddTask() {
  editingTaskId = null; editingTaskDate = null;
  document.getElementById('modalTitle').textContent  = 'Add Task';
  document.getElementById('taskId').value            = '';
  document.getElementById('taskTitle').value         = '';
  document.getElementById('taskDesc').value          = '';
  document.getElementById('taskCategory').value      = '';
  document.getElementById('taskPriority').value      = 'Medium';
  document.getElementById('taskStatus').value        = defaultTaskStatus;
  document.getElementById('taskTime').value          = '';
  document.getElementById('taskDate').value          = activeDateFilter || todayStr();
  document.getElementById('taskModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('taskTitle').focus(), 80);
}

function openAddTaskWithStatus(status) {
  defaultTaskStatus = status; openAddTask();
}

function editTask(date, id) {
  const task = (localReportCache[date]?.tasks||[]).find(t=>t.id===id);
  if (!task) return;
  editingTaskId   = id;
  editingTaskDate = date;
  document.getElementById('modalTitle').textContent  = 'Edit Task';
  document.getElementById('taskId').value            = id;
  document.getElementById('taskTitle').value         = task.title;
  document.getElementById('taskDesc').value          = task.description || '';
  document.getElementById('taskCategory').value      = task.category    || '';
  document.getElementById('taskPriority').value      = task.priority    || 'Medium';
  document.getElementById('taskStatus').value        = task.status      || 'Todo';
  document.getElementById('taskTime').value          = task.timeSpent   || '';
  document.getElementById('taskDate').value          = date;
  document.getElementById('taskModal').classList.remove('hidden');
}

function saveTask() {
  const title    = document.getElementById('taskTitle').value.trim();
  if (!title) { document.getElementById('taskTitle').focus(); return; }
  const taskDate = document.getElementById('taskDate').value || todayStr();

  if (editingTaskId && editingTaskDate) {
    const data = localReportCache[editingTaskDate] || { date: editingTaskDate, tasks: [], jsrReport: {} };
    const idx  = (data.tasks||[]).findIndex(t=>t.id===editingTaskId);
    if (idx > -1) {
      const updated = { ...data.tasks[idx], title,
        description: document.getElementById('taskDesc').value.trim(),
        category:    document.getElementById('taskCategory').value.trim(),
        priority:    document.getElementById('taskPriority').value,
        status:      document.getElementById('taskStatus').value,
        timeSpent:   document.getElementById('taskTime').value.trim()
      };
      if (taskDate !== editingTaskDate) {
        data.tasks.splice(idx, 1);
        saveReport(data);
        const newData = localReportCache[taskDate] || { date: taskDate, tasks: [], jsrReport: {} };
        newData.tasks = [...(newData.tasks||[]), updated];
        saveReport(newData);
      } else {
        data.tasks[idx] = updated;
        saveReport(data);
      }
    }
  } else {
    const data = localReportCache[taskDate] || { date: taskDate, tasks: [], jsrReport: {} };
    data.tasks = [...(data.tasks||[]), {
      id:          'task_' + Date.now(),
      title,
      description: document.getElementById('taskDesc').value.trim(),
      category:    document.getElementById('taskCategory').value.trim(),
      priority:    document.getElementById('taskPriority').value,
      status:      document.getElementById('taskStatus').value,
      timeSpent:   document.getElementById('taskTime').value.trim(),
      addedBy:     'manish.sahu',
      createdAt:   Date.now()
    }];
    saveReport(data);
  }
  closeModal();
  renderAll();
}

function deleteTask(date, id) {
  if (!confirm('Delete this task?')) return;
  const data = localReportCache[date];
  if (!data) return;
  data.tasks = (data.tasks||[]).filter(t=>t.id!==id);
  saveReport(data);
  renderAll();
}

function toggleDone(date, id) {
  const data = localReportCache[date];
  if (!data) return;
  const task = (data.tasks||[]).find(t=>t.id===id);
  if (!task) return;
  task.status = task.status==='Done' ? 'Todo' : 'Done';
  saveReport(data);
  renderAll();
}

function closeModal() {
  document.getElementById('taskModal').classList.add('hidden');
  editingTaskId = null; editingTaskDate = null; defaultTaskStatus = 'Todo';
}

// ── Share ─────────────────────────────────────────────────────────────────
function shareReport() {
  document.getElementById('shareUrl').value = window.location.href;
  document.getElementById('copySuccess').classList.add('hidden');
  document.getElementById('shareModal').classList.remove('hidden');
}
function copyShareUrl() {
  navigator.clipboard.writeText(document.getElementById('shareUrl').value).then(() => {
    const el = document.getElementById('copySuccess');
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  });
}
function closeShareModal() { document.getElementById('shareModal').classList.add('hidden'); }

// ── Print ─────────────────────────────────────────────────────────────────
function printReport() { window.print(); }

// ── Utils ─────────────────────────────────────────────────────────────────
function statusClass(s)   { return s==='Done'?'badge-done':s==='In Progress'?'badge-progress':'badge-todo'; }
function priorityClass(p) { return p==='High'?'badge-high':p==='Low'?'badge-low':'badge-medium'; }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key==='Escape')                        { closeModal(); closeShareModal(); cancelJSREdit(); }
  if ((e.metaKey||e.ctrlKey) && e.key==='n')  { e.preventDefault(); openAddTask(); }
});
