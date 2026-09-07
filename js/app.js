// ─────────────────────────────────────────────────────────────────────────
//  MANISH JSR DASHBOARD — Main Application v2 (Kanban Edition)
//  Firebase Auth + Firestore | Multi-date task model
// ─────────────────────────────────────────────────────────────────────────

let db, auth;
let currentUser       = null;
let currentRole       = null;      // 'admin' | 'edit' | 'view'
let currentView       = 'kanban';  // 'kanban' | 'list'
let calViewYear, calViewMonth;
let selectedMood      = '';
let editingTaskId     = null;
let editingTaskDate   = null;
let defaultTaskStatus = 'Todo';
let activeDateFilter  = null;      // null = all dates, or 'YYYY-MM-DD'
let activeMonthFilter = 'all';     // 'all' | 'current'
let localReportCache  = {};        // { [YYYY-MM-DD]: { date, tasks[], jsrReport{} } }
let selectedDate      = todayStr();// date used by JSR section & day preview

// ── Bootstrap ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    show('setupScreen'); return;
  }
  try {
    firebase.initializeApp(firebaseConfig);
    db   = firebase.firestore();
    auth = firebase.auth();
  } catch (e) { show('setupScreen'); return; }

  const params        = new URLSearchParams(window.location.search);
  const dateParam     = params.get('date');
  const isPublicShare = params.get('view') === '1';

  if (dateParam) { selectedDate = dateParam; activeDateFilter = dateParam; }

  const d = new Date(selectedDate + 'T00:00:00');
  calViewYear  = d.getFullYear();
  calViewMonth = d.getMonth();

  // Set current month button label
  const mfCurLabel = document.getElementById('mfCurLabel');
  if (mfCurLabel) mfCurLabel.textContent = monthKey(todayStr());

  if (isPublicShare) { loadPublicShareView(); return; }

  auth.onAuthStateChanged(async user => {
    if (!user) { showLogin(); return; }
    await handleSignedIn(user);
  });
});

// ── Date Helpers ──────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDisplay(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
}
function formatShort(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}
function monthKey(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { month:'short', year:'numeric' });
}
function monthSortKey(d) { return d ? d.substring(0, 7) : ''; }

// ── Auth ─────────────────────────────────────────────────────────────────
function showLogin() { hideAll(); show('loginScreen'); }

async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'lotusherbals.com' });
  try { await auth.signInWithPopup(provider); }
  catch (e) { alert('Sign-in failed: ' + e.message); }
}

async function signOut() {
  await auth.signOut();
  currentUser = null; currentRole = null;
  showLogin();
}

async function handleSignedIn(user) {
  if (user.email === ADMIN_EMAIL) {
    currentUser = user; currentRole = 'admin';
    try { await ensureAdminInFirestore(user); } catch(e) { console.warn('Firestore not ready:', e.message); }
    launchApp(); return;
  }
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists) {
      const safeKey    = 'pending_' + user.email.replace(/[@.]/g,'_');
      const pendingSnap = await db.collection('users').doc(safeKey).get();
      if (pendingSnap.exists) {
        const pd = pendingSnap.data();
        await db.collection('users').doc(user.uid).set({ ...pd, uid: user.uid, name: user.displayName || pd.name, pending: false });
        await db.collection('users').doc(safeKey).delete();
        currentUser = user; currentRole = pd.role || 'view';
        launchApp(); return;
      }
      showAccessDenied(user.email); return;
    }
    const data = snap.data();
    currentUser = user; currentRole = data.role || 'view';
    launchApp();
  } catch (e) {
    console.error('Auth check error:', e.message);
    showAccessDenied(user.email);
  }
}

async function ensureAdminInFirestore(user) {
  const ref  = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      uid:     user.uid,
      email:   user.email,
      name:    user.displayName || 'Manish Sahu',
      role:    'admin',
      addedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

function showAccessDenied(email) {
  hideAll();
  document.getElementById('deniedEmail').textContent = email;
  show('accessDenied');
}

function hideAll() {
  ['setupScreen','loginScreen','accessDenied','appContainer'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden')
  );
}
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }

// ── Public Share View (no login) ─────────────────────────────────────────
async function loadPublicShareView() {
  currentRole = 'view'; currentUser = null;
  document.getElementById('shareBanner').classList.remove('hidden');
  hideAll(); show('appContainer');
  // Hide all edit controls
  ['addTaskBtn','jsrEditBtn'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
  document.querySelectorAll('.kcol-add').forEach(b => b.style.display='none');
  const addDateBtn = document.querySelector('.add-date-btn'); if(addDateBtn) addDateBtn.style.display='none';
  const dpAddBtn   = document.getElementById('dpAddBtn');    if(dpAddBtn)   dpAddBtn.style.display='none';
  const adminBtn   = document.getElementById('adminBtn');    if(adminBtn)   adminBtn.style.display='none';
  const navUser    = document.getElementById('navUser');     if(navUser)    navUser.style.display='none';
  document.querySelector('.nav-btn-ghost')?.remove();
  setupCalendarNav();
  await loadAllReports();
  renderAll();
}

// ── App Launch ────────────────────────────────────────────────────────────
async function launchApp() {
  hideAll(); show('appContainer');

  // Populate nav user info
  const u        = currentUser;
  const initials = (u.displayName||u.email||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const navAvatar = document.getElementById('navAvatar');
  if (navAvatar) navAvatar.innerHTML = u.photoURL
    ? `<img src="${u.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
    : initials;
  const navName = document.getElementById('navName');
  if (navName) navName.textContent = u.displayName || u.email.split('@')[0];
  const navRole = document.getElementById('navRoleBadge');
  if (navRole) {
    navRole.textContent = currentRole === 'admin' ? '⚡ Admin' : currentRole === 'edit' ? '✏️ Edit' : '👁 View';
    navRole.className   = 'nav-role';
  }

  if (currentRole === 'admin') {
    const adminBtn = document.getElementById('adminBtn');
    if (adminBtn) adminBtn.style.display = '';
  }

  applyRoleRestrictions();
  setupCalendarNav();
  await loadAllReports();
  renderAll();
}

function applyRoleRestrictions() {
  const canEdit = currentRole === 'admin' || currentRole === 'edit';
  if (!canEdit) {
    ['addTaskBtn','jsrEditBtn'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display='none'; });
    document.querySelectorAll('.kcol-add').forEach(b => b.style.display='none');
    const addDateBtn = document.querySelector('.add-date-btn'); if(addDateBtn) addDateBtn.style.display='none';
    const dpAddBtn   = document.getElementById('dpAddBtn');    if(dpAddBtn)   dpAddBtn.style.display='none';
  }
}

function setupCalendarNav() {
  document.getElementById('prevMonth')?.addEventListener('click', () => {
    calViewMonth--; if (calViewMonth < 0) { calViewMonth=11; calViewYear--; } renderCalendar();
  });
  document.getElementById('nextMonth')?.addEventListener('click', () => {
    calViewMonth++; if (calViewMonth > 11) { calViewMonth=0; calViewYear++; } renderCalendar();
  });
}

// ── Firestore Data ────────────────────────────────────────────────────────
async function loadAllReports() {
  try {
    const snap = await db.collection('reports').get();
    snap.forEach(doc => { localReportCache[doc.id] = doc.data(); });
  } catch(e) { console.warn('Could not load all reports:', e.message); }
}

async function loadReport(date) {
  if (localReportCache[date]) return localReportCache[date];
  try {
    const snap = await db.collection('reports').doc(date).get();
    const data = snap.exists ? snap.data() : { date, tasks:[], jsrReport:{} };
    localReportCache[date] = data;
    return data;
  } catch(e) {
    console.warn('Firestore read failed:', e.message);
    const empty = { date, tasks:[], jsrReport:{} };
    localReportCache[date] = empty;
    return empty;
  }
}

async function saveReport(data) {
  localReportCache[data.date] = data;
  try {
    await db.collection('reports').doc(data.date).set({
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser?.email
    }, { merge: true });
  } catch(e) {
    console.warn('Firestore save failed:', e.message);
    alert('⚠️ Could not save to database. Please check Firestore in Firebase Console.');
  }
}

// ── Task Aggregation ──────────────────────────────────────────────────────
function getAllTasks() {
  const tasks = [];
  for (const [date, report] of Object.entries(localReportCache)) {
    for (const task of (report.tasks || [])) {
      tasks.push({ ...task, date });
    }
  }
  return tasks;
}

function getFilteredTasks() {
  let tasks = getAllTasks();

  // Date tab / calendar filter
  if (activeDateFilter) tasks = tasks.filter(t => t.date === activeDateFilter);

  // Month panel filter
  if (activeMonthFilter === 'current') {
    const cur = monthSortKey(todayStr());
    tasks = tasks.filter(t => monthSortKey(t.date||'') === cur);
  }

  // Month dropdown
  const mVal = document.getElementById('filterMonth')?.value;
  if (mVal) tasks = tasks.filter(t => monthSortKey(t.date||'') === mVal);

  // Status dropdown
  const sVal = document.getElementById('filterStatus')?.value;
  if (sVal) tasks = tasks.filter(t => t.status === sVal);

  // Priority dropdown
  const pVal = document.getElementById('filterPriority')?.value;
  if (pVal) tasks = tasks.filter(t => t.priority === pVal);

  // Search
  const q = (document.getElementById('searchInput')?.value||'').trim().toLowerCase();
  if (q) tasks = tasks.filter(t =>
    (t.title||'').toLowerCase().includes(q) ||
    (t.description||'').toLowerCase().includes(q) ||
    (t.category||'').toLowerCase().includes(q) ||
    (t.date||'').includes(q)
  );

  return tasks;
}

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
  document.getElementById('mfAll')?.classList.add('active');
  document.getElementById('mfCur')?.classList.remove('active');
  renderAll();
}

function setView(view) {
  currentView = (view === 'calendar') ? 'list' : view;
  document.getElementById('btnKanban')?.classList.toggle('active', currentView === 'kanban');
  document.getElementById('btnList')?.classList.toggle('active', view === 'list');
  document.getElementById('btnCal')?.classList.toggle('active', view === 'calendar');
  document.getElementById('kanbanView')?.classList.toggle('hidden', currentView !== 'kanban');
  document.getElementById('listView')?.classList.toggle('hidden', currentView !== 'list');
  const tasks = getFilteredTasks();
  if (currentView === 'kanban') renderKanban(tasks);
  else renderList(tasks);
}

function setMonthFilter(filter) {
  activeMonthFilter = filter;
  document.getElementById('mfAll')?.classList.toggle('active', filter==='all');
  document.getElementById('mfCur')?.classList.toggle('active', filter==='current');
  renderAll();
}

function clearDateFilter() {
  activeDateFilter = null;
  document.getElementById('dpClearBtn').style.display = 'none';
  document.getElementById('dpFilter').classList.add('hidden');
  renderAll();
}

// ── Title Bar ─────────────────────────────────────────────────────────────
function renderTitleBar(tasks) {
  const dateBadge = document.getElementById('dateBadge');
  const dbSub     = document.getElementById('dbSub');
  if (activeDateFilter) {
    if (dateBadge) dateBadge.textContent = '📅 ' + formatDisplay(activeDateFilter);
    if (dbSub)     dbSub.textContent = `Showing ${tasks.length} task${tasks.length!==1?'s':''} for ${formatShort(activeDateFilter)}`;
  } else {
    if (dateBadge) dateBadge.textContent = '📅 All Dates';
    if (dbSub)     dbSub.textContent = `Showing ${tasks.length} task${tasks.length!==1?'s':''} across all dates`;
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────
function renderStats(tasks) {
  const total = tasks.length;
  const done  = tasks.filter(t=>t.status==='Done').length;
  const prog  = tasks.filter(t=>t.status==='In Progress').length;
  const pct   = total>0 ? Math.round((done/total)*100) : 0;

  document.getElementById('statTotal').textContent    = total;
  document.getElementById('statDone').textContent     = done;
  document.getElementById('statProgress').textContent = prog;
  const statPct   = document.getElementById('statPct');
  const statBar   = document.getElementById('statBar');
  const statRatio = document.getElementById('statRatio');
  if (statPct)   statPct.textContent   = pct + '%';
  if (statBar)   statBar.style.width   = pct + '%';
  if (statRatio) statRatio.textContent = done + '/' + total;
}

// ── Month Totals ──────────────────────────────────────────────────────────
function renderMonthTotals() {
  const byMonth = {};
  for (const [date, report] of Object.entries(localReportCache)) {
    const tasks = report.tasks || [];
    if (!tasks.length) continue;
    const mk = monthSortKey(date);
    if (!byMonth[mk]) byMonth[mk] = { total:0, done:0, inp:0, todo:0, label:monthKey(date), sortKey:mk };
    byMonth[mk].total += tasks.length;
    byMonth[mk].done  += tasks.filter(t=>t.status==='Done').length;
    byMonth[mk].inp   += tasks.filter(t=>t.status==='In Progress').length;
    byMonth[mk].todo  += tasks.filter(t=>t.status==='Todo').length;
  }

  const months = Object.values(byMonth).sort((a,b) => b.sortKey.localeCompare(a.sortKey));
  let displayMonths = months;
  if (activeMonthFilter === 'current') {
    const cur = monthSortKey(todayStr());
    displayMonths = months.filter(m => m.sortKey === cur);
  }

  const monthCount  = document.getElementById('monthCount');
  const monthFooter = document.getElementById('monthFooter');
  if (monthCount)  monthCount.textContent  = months.length + ' Month(s)';
  if (monthFooter) monthFooter.textContent = activeMonthFilter==='current' ? 'Showing current month only' : 'Showing totals for all months';

  const container = document.getElementById('monthTotals');
  if (!container) return;
  container.innerHTML = '';

  if (!displayMonths.length) {
    container.innerHTML = '<div class="loading-users">No task data yet</div>'; return;
  }

  displayMonths.forEach(m => {
    const pct = m.total>0 ? Math.round((m.done/m.total)*100) : 0;
    const row = document.createElement('div');
    row.className = 'month-row';
    row.style.flexDirection = 'column';
    row.style.alignItems    = 'stretch';
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
        <span class="month-row-name">${m.label}</span>
        <span class="month-row-badge">${m.total} tasks · ${pct}%</span>
      </div>
      <div class="month-bar-bg"><div class="month-bar-fill" style="width:${pct}%"></div></div>
      <div class="month-row-stats" style="margin-top:6px">
        <span class="month-stat">⏳ <span>${m.inp}</span> inp</span>
        <span class="month-stat">✅ <span>${m.done}</span> done</span>
        <span class="month-stat">🔲 <span>${m.todo}</span> todo</span>
      </div>`;
    container.appendChild(row);
  });
}

// ── Calendar ──────────────────────────────────────────────────────────────
function renderCalendar() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const calMonthYear = document.getElementById('calMonthYear');
  if (calMonthYear) calMonthYear.textContent = MONTHS[calViewMonth] + ' ' + calViewYear;

  const calDays = document.getElementById('calDays');
  if (!calDays) return;
  calDays.innerHTML = '';

  const today       = todayStr();
  const firstDay    = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth+1, 0).getDate();

  for (let i=0; i<firstDay; i++) {
    const e = document.createElement('div'); e.className='cal-day empty'; calDays.appendChild(e);
  }

  for (let d=1; d<=daysInMonth; d++) {
    const ds     = calViewYear+'-'+String(calViewMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const tasks  = localReportCache[ds]?.tasks || [];
    const hasDone= tasks.some(t=>t.status==='Done');
    const hasInp = tasks.some(t=>t.status==='In Progress');
    const hasTodo= tasks.some(t=>t.status==='Todo');

    const el = document.createElement('div');
    let cls = 'cal-day';
    if (ds===today)         cls += ' today';
    if (ds===activeDateFilter) cls += ' selected';
    if (tasks.length)       cls += ' has-data';
    el.className = cls;
    el.innerHTML = `${d}<div class="day-dots">
      ${hasInp  ? '<span class="day-dot day-dot-inp"></span>'  : ''}
      ${hasDone ? '<span class="day-dot day-dot-done"></span>' : ''}
      ${hasTodo ? '<span class="day-dot day-dot-todo"></span>' : ''}
    </div>`;
    el.addEventListener('click', () => {
      activeDateFilter = ds; selectedDate = ds;
      const dt = new Date(ds+'T00:00:00');
      calViewYear=dt.getFullYear(); calViewMonth=dt.getMonth();
      renderAll();
    });
    calDays.appendChild(el);
  }
}

// ── Day Preview ────────────────────────────────────────────────────────────
function renderDayPreview(date) {
  const report = localReportCache[date];
  const tasks  = report?.tasks || [];

  const dpDate     = document.getElementById('dpDate');
  const dpTotal    = document.getElementById('dpTotal');
  const dpDone     = document.getElementById('dpDone');
  const dpInp      = document.getElementById('dpInp');
  const dpTodo     = document.getElementById('dpTodo');
  const dpFilter   = document.getElementById('dpFilter');
  const dpClearBtn = document.getElementById('dpClearBtn');
  const dpActive   = document.getElementById('dpActive');

  if (dpDate)  dpDate.textContent  = formatDisplay(date);
  if (dpTotal) dpTotal.textContent = tasks.length;
  if (dpDone)  dpDone.textContent  = tasks.filter(t=>t.status==='Done').length;
  if (dpInp)   dpInp.textContent   = tasks.filter(t=>t.status==='In Progress').length;
  if (dpTodo)  dpTodo.textContent  = tasks.filter(t=>t.status==='Todo').length;

  if (activeDateFilter) {
    dpFilter?.classList.remove('hidden');
    if (dpClearBtn) dpClearBtn.style.display='';
  } else {
    dpFilter?.classList.add('hidden');
    if (dpClearBtn) dpClearBtn.style.display='none';
  }

  if (dpActive) {
    const active = tasks.filter(t=>t.status==='In Progress').slice(0,3);
    dpActive.innerHTML = active.length
      ? active.map(t=>`<div class="dp-task-item">${esc(t.title)}</div>`).join('')
      : tasks.length ? '<div class="dp-task-item" style="color:var(--green)">All tasks completed! ✅</div>' : '';
  }
}

// ── Date Tabs ─────────────────────────────────────────────────────────────
function renderDateTabs() {
  const container = document.getElementById('dateTabs');
  if (!container) return;
  container.innerHTML = '';

  const allTotal = getAllTasks().length;
  const allTab   = document.createElement('div');
  allTab.className = 'date-tab' + (!activeDateFilter ? ' active' : '');
  allTab.innerHTML = `All <span class="tab-count">${allTotal}</span>`;
  allTab.addEventListener('click', () => { activeDateFilter=null; renderAll(); });
  container.appendChild(allTab);

  const dates = Object.keys(localReportCache)
    .filter(d => (localReportCache[d].tasks||[]).length>0)
    .sort((a,b) => b.localeCompare(a))
    .slice(0, 12);

  dates.forEach(d => {
    const count = (localReportCache[d]?.tasks||[]).length;
    const tab   = document.createElement('div');
    tab.className = 'date-tab' + (activeDateFilter===d ? ' active' : '');
    tab.innerHTML = `${formatShort(d)} <span class="tab-count">${count}</span>`;
    tab.addEventListener('click', () => {
      activeDateFilter = d; selectedDate = d;
      const dt = new Date(d+'T00:00:00');
      calViewYear=dt.getFullYear(); calViewMonth=dt.getMonth();
      renderAll();
    });
    container.appendChild(tab);
  });
}

// ── Month Filter Dropdown ─────────────────────────────────────────────────
function populateMonthFilter() {
  const sel = document.getElementById('filterMonth');
  if (!sel) return;
  const cur = sel.value;

  const months = new Set();
  Object.keys(localReportCache).forEach(d => {
    if ((localReportCache[d].tasks||[]).length) months.add(monthSortKey(d));
  });
  const sorted = [...months].sort((a,b) => b.localeCompare(a));

  sel.innerHTML = '<option value="">Month: All</option>';
  sorted.forEach(mk => {
    const sample = Object.keys(localReportCache).find(d => monthSortKey(d)===mk);
    const label  = sample ? monthKey(sample) : mk;
    const opt    = document.createElement('option');
    opt.value = mk; opt.textContent = label;
    if (mk===cur) opt.selected=true;
    sel.appendChild(opt);
  });
}

// ── Kanban ────────────────────────────────────────────────────────────────
function renderKanban(tasks) {
  const canEdit   = currentRole==='admin'||currentRole==='edit';
  const inpTasks  = tasks.filter(t=>t.status==='In Progress');
  const doneTasks = tasks.filter(t=>t.status==='Done');
  const todoTasks = tasks.filter(t=>t.status==='Todo');

  document.getElementById('kColInpCount').textContent  = inpTasks.length;
  document.getElementById('kColDoneCount').textContent = doneTasks.length;
  document.getElementById('kColTodoCount').textContent = todoTasks.length;

  fillKanbanCol('colInProgress', inpTasks, canEdit);
  fillKanbanCol('colDone', doneTasks, canEdit);
  fillKanbanCol('colTodo', todoTasks, canEdit);
}

function fillKanbanCol(colId, tasks, canEdit) {
  const col = document.getElementById(colId);
  if (!col) return;
  col.innerHTML = '';

  if (!tasks.length) {
    col.innerHTML = '<div class="k-empty"><div class="k-empty-icon">📋</div>No tasks</div>';
    return;
  }

  tasks.forEach(task => {
    const card   = document.createElement('div');
    const isDone = task.status==='Done';
    card.className = 'k-card' + (isDone ? ' k-done' : '');
    const d      = esc(task.date||'');
    const id     = esc(task.id||'');

    card.innerHTML = `
      <div class="k-card-brand">
        <span class="k-card-brand-dot"></span>
        <span>${esc(task.category||'General')}</span>
        <span style="margin-left:auto;font-weight:400">${task.date===todayStr()?'Today':formatShort(task.date||'')}</span>
        <div class="k-card-actions">
          ${canEdit?`<button class="k-card-btn" onclick="toggleDone('${d}','${id}')" title="Toggle Done">☑</button>`:''}
          ${canEdit?`<button class="k-card-btn" onclick="editTask('${d}','${id}')">✏️</button>`:''}
          ${canEdit?`<button class="k-card-btn delete" onclick="deleteTask('${d}','${id}')">🗑️</button>`:''}
        </div>
      </div>
      <div class="k-card-title${isDone?' done-text':''}">${esc(task.title)}</div>
      ${task.description?`<div class="k-card-desc">${esc(task.description)}</div>`:''}
      <div class="k-card-footer">
        <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
          <span class="k-card-badge ${priorityClass(task.priority)}">${task.priority||'Medium'}</span>
          ${task.timeSpent?`<span class="k-card-badge badge-todo">⏱ ${esc(task.timeSpent)}</span>`:''}
        </div>
        ${task.addedBy?`<span class="k-card-date">${esc(task.addedBy.split('@')[0])}</span>`:''}
      </div>`;
    col.appendChild(card);
  });
}

// ── List View ─────────────────────────────────────────────────────────────
function renderList(tasks) {
  const container = document.getElementById('listItems');
  if (!container) return;
  container.innerHTML = '';
  const canEdit = currentRole==='admin'||currentRole==='edit';

  if (!tasks.length) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:8px">📋</div>
      No tasks found
      ${canEdit?`<br><br><button class="btn btn-warm btn-sm" onclick="openAddTask()">+ Add Task</button>`:''}
    </div>`;
    return;
  }

  const byDate = {};
  tasks.forEach(t => { if(!byDate[t.date]) byDate[t.date]=[]; byDate[t.date].push(t); });
  const sortedDates = Object.keys(byDate).sort((a,b) => b.localeCompare(a));

  sortedDates.forEach(date => {
    const header = document.createElement('div');
    header.className = 'list-date-header';
    header.innerHTML = `${formatDisplay(date)} <span class="users-count">${byDate[date].length}</span>`;
    container.appendChild(header);

    byDate[date].forEach(task => {
      const item   = document.createElement('div');
      item.className = 'list-item';
      const isDone = task.status==='Done';
      const d      = esc(task.date||'');
      const id     = esc(task.id||'');
      const cfn    = canEdit?`onclick="toggleDone('${d}','${id}')"`:'';
      const editBtn= canEdit?`<button class="list-action-btn" onclick="editTask('${d}','${id}')">Edit</button>`:'';
      const delBtn = canEdit?`<button class="list-action-btn delete" onclick="deleteTask('${d}','${id}')">Delete</button>`:'';

      item.innerHTML = `
        <div class="list-check${isDone?' done':''}" ${cfn}></div>
        <span class="list-title${isDone?' done-text':''}">${esc(task.title)}</span>
        <div class="list-meta">
          <span class="k-card-badge ${statusClass(task.status)}">${task.status}</span>
          <span class="k-card-badge ${priorityClass(task.priority)}">${task.priority||'Medium'}</span>
          ${task.category?`<span class="k-card-badge badge-category">${esc(task.category)}</span>`:''}
        </div>
        <div class="list-actions">${editBtn}${delBtn}</div>`;
      container.appendChild(item);
    });
  });
}

// ── JSR Report ─────────────────────────────────────────────────────────────
function renderJSR(date) {
  const jsrDateLabel = document.getElementById('jsrDateLabel');
  if (jsrDateLabel) jsrDateLabel.textContent = formatDisplay(date);

  const r = localReportCache[date]?.jsrReport || {};
  document.getElementById('viewSummary').textContent      = r.summary      || 'Click Edit to add your daily summary...';
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
    b.classList.toggle('selected', selectedMood!==''&&b.getAttribute('onclick')?.includes(selectedMood))
  );
  document.getElementById('jsrView').classList.add('hidden');
  document.getElementById('jsrEdit').classList.remove('hidden');
}

function cancelJSREdit() {
  document.getElementById('jsrView').classList.remove('hidden');
  document.getElementById('jsrEdit').classList.add('hidden');
}

async function saveJSR() {
  const data = localReportCache[selectedDate] || { date:selectedDate, tasks:[], jsrReport:{} };
  data.jsrReport = {
    summary:      document.getElementById('jsrSummary').value.trim(),
    achievements: document.getElementById('jsrAchievements').value.trim(),
    blockers:     document.getElementById('jsrBlockers').value.trim(),
    nextDayPlan:  document.getElementById('jsrNextDay').value.trim(),
    mood:         selectedMood,
    updatedBy:    currentUser?.email
  };
  await saveReport(data);
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
  document.getElementById('taskCategory').value      = 'Development';
  document.getElementById('taskPriority').value      = 'Medium';
  document.getElementById('taskStatus').value        = defaultTaskStatus;
  document.getElementById('taskTime').value          = '';
  document.getElementById('taskDate').value          = activeDateFilter || todayStr();
  document.getElementById('taskModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}

function openAddTaskWithStatus(status) {
  defaultTaskStatus = status;
  openAddTask();
}

function editTask(date, id) {
  const report = localReportCache[date];
  if (!report) return;
  const task = (report.tasks||[]).find(t=>t.id===id);
  if (!task) return;
  editingTaskId   = id;
  editingTaskDate = date;
  document.getElementById('modalTitle').textContent  = 'Edit Task';
  document.getElementById('taskId').value            = id;
  document.getElementById('taskTitle').value         = task.title;
  document.getElementById('taskDesc').value          = task.description||'';
  document.getElementById('taskCategory').value      = task.category||'Development';
  document.getElementById('taskPriority').value      = task.priority||'Medium';
  document.getElementById('taskStatus').value        = task.status||'Todo';
  document.getElementById('taskTime').value          = task.timeSpent||'';
  document.getElementById('taskDate').value          = date;
  document.getElementById('taskModal').classList.remove('hidden');
}

async function saveTask() {
  const title = document.getElementById('taskTitle').value.trim();
  if (!title) { document.getElementById('taskTitle').focus(); return; }

  const taskDate = document.getElementById('taskDate').value || todayStr();

  if (editingTaskId && editingTaskDate) {
    // Existing task edit
    const data = localReportCache[editingTaskDate] || { date:editingTaskDate, tasks:[], jsrReport:{} };
    const idx  = (data.tasks||[]).findIndex(t=>t.id===editingTaskId);
    if (idx > -1) {
      const updated = {
        ...data.tasks[idx],
        title,
        description: document.getElementById('taskDesc').value.trim(),
        category:    document.getElementById('taskCategory').value,
        priority:    document.getElementById('taskPriority').value,
        status:      document.getElementById('taskStatus').value,
        timeSpent:   document.getElementById('taskTime').value.trim(),
        updatedBy:   currentUser?.email
      };
      if (taskDate !== editingTaskDate) {
        // Move to new date
        data.tasks.splice(idx, 1);
        await saveReport(data);
        const newData = localReportCache[taskDate] || { date:taskDate, tasks:[], jsrReport:{} };
        newData.tasks = [...(newData.tasks||[]), updated];
        await saveReport(newData);
      } else {
        data.tasks[idx] = updated;
        await saveReport(data);
      }
    }
  } else {
    // New task
    const data = localReportCache[taskDate] || { date:taskDate, tasks:[], jsrReport:{} };
    data.tasks  = [...(data.tasks||[]), {
      id:          'task_' + Date.now(),
      title,
      description: document.getElementById('taskDesc').value.trim(),
      category:    document.getElementById('taskCategory').value,
      priority:    document.getElementById('taskPriority').value,
      status:      document.getElementById('taskStatus').value,
      timeSpent:   document.getElementById('taskTime').value.trim(),
      addedBy:     currentUser?.email,
      createdAt:   Date.now()
    }];
    await saveReport(data);
    // Navigate calendar to the task date
    const dt = new Date(taskDate+'T00:00:00');
    calViewYear=dt.getFullYear(); calViewMonth=dt.getMonth();
  }

  closeModal();
  renderAll();
}

async function deleteTask(date, id) {
  if (!confirm('Delete this task?')) return;
  const data = localReportCache[date]; if (!data) return;
  data.tasks = (data.tasks||[]).filter(t=>t.id!==id);
  await saveReport(data); renderAll();
}

async function toggleDone(date, id) {
  const data = localReportCache[date]; if (!data) return;
  const task = (data.tasks||[]).find(t=>t.id===id); if (!task) return;
  task.status = task.status==='Done' ? 'Todo' : 'Done';
  if (task.status==='Done') task.completedAt = Date.now();
  await saveReport(data); renderAll();
}

function closeModal() {
  document.getElementById('taskModal').classList.add('hidden');
  editingTaskId=null; editingTaskDate=null; defaultTaskStatus='Todo';
}

// ── Share ─────────────────────────────────────────────────────────────────
function shareReport() {
  const base     = window.location.origin + window.location.pathname;
  const dashUrl  = base + '?view=1';
  const dateUrl  = base + '?view=1&date=' + selectedDate;

  document.getElementById('shareDate').textContent = formatDisplay(selectedDate);
  document.getElementById('shareUrl').value        = dashUrl;
  document.getElementById('shareTodayUrl').value   = dateUrl;
  document.getElementById('copySuccess').classList.add('hidden');
  document.getElementById('shareModal').classList.remove('hidden');
}

function copyUrl(inputId, msgId) {
  navigator.clipboard.writeText(document.getElementById(inputId).value).then(() => {
    const el = document.getElementById(msgId);
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
  });
}

function closeShareModal() { document.getElementById('shareModal').classList.add('hidden'); }

// ── User Manager ──────────────────────────────────────────────────────────
async function openUserManager() {
  document.getElementById('userManagerModal').classList.remove('hidden');
  document.getElementById('addUserMsg').classList.add('hidden');
  document.getElementById('newUserEmail').value = '';
  document.getElementById('newUserName').value  = '';
  document.getElementById('newUserRole').value  = 'view';
  await loadUsersList();
}

function closeUserManager() { document.getElementById('userManagerModal').classList.add('hidden'); }

async function loadUsersList() {
  const list = document.getElementById('usersList');
  list.innerHTML = '<div class="loading-users">Loading users...</div>';
  try {
    const snap = await db.collection('users').get();
    const users = snap.docs.map(d=>d.data());
    document.getElementById('usersCount').textContent = users.length + ' users';
    list.innerHTML = '';
    users.sort((a,b)=>{ const o={admin:0,edit:1,view:2}; return (o[a.role]||2)-(o[b.role]||2); }).forEach(u => {
      const isAdmin = u.email===ADMIN_EMAIL;
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML = `
        <div class="user-row-avatar">${(u.name||u.email||'?')[0].toUpperCase()}</div>
        <div class="user-row-info">
          <div class="user-row-name">${esc(u.name||'Unknown')}${isAdmin?' <span class="user-row-admin-tag">● Owner</span>':''}</div>
          <div class="user-row-email">${esc(u.email)}</div>
        </div>
        <div class="user-row-actions">
          ${isAdmin
            ? `<span class="role-badge role-admin">⚡ Admin</span>`
            : `<select class="role-select-inline" onchange="changeRole('${u.uid}',this.value)">
                <option value="view"  ${u.role==='view' ?'selected':''}>👁 View</option>
                <option value="edit"  ${u.role==='edit' ?'selected':''}>✏️ Edit</option>
                <option value="admin" ${u.role==='admin'?'selected':''}>⚡ Admin</option>
              </select>
              <button class="btn-remove-user" onclick="removeUser('${u.uid}','${esc(u.email)}')">Remove</button>`
          }
        </div>`;
      list.appendChild(row);
    });
  } catch(e) {
    list.innerHTML = `<div class="loading-users" style="color:var(--red)">Error: ${e.message}</div>`;
  }
}

async function addUser() {
  const email = document.getElementById('newUserEmail').value.trim();
  const name  = document.getElementById('newUserName').value.trim();
  const role  = document.getElementById('newUserRole').value;
  const msgEl = document.getElementById('addUserMsg');
  if (!email) { showMsg(msgEl,'error','Please enter an email address.'); return; }
  msgEl.className='add-user-msg'; msgEl.textContent='Adding user...'; msgEl.classList.remove('hidden');
  try {
    const safeKey = 'pending_'+email.replace(/[@.]/g,'_');
    await db.collection('users').doc(safeKey).set({
      uid:safeKey, email, name:name||email.split('@')[0], role,
      addedBy: currentUser?.email,
      addedAt: firebase.firestore.FieldValue.serverTimestamp(),
      pending: true
    });
    showMsg(msgEl,'success','✅ User added! They get access on first sign-in.');
    document.getElementById('newUserEmail').value='';
    document.getElementById('newUserName').value='';
    await loadUsersList();
  } catch(e) { showMsg(msgEl,'error','Error: '+e.message); }
}

async function changeRole(uid, role) {
  try { await db.collection('users').doc(uid).update({ role }); }
  catch(e) { alert('Error: '+e.message); }
}

async function removeUser(uid, email) {
  if (!confirm('Remove '+email+' from dashboard?')) return;
  try { await db.collection('users').doc(uid).delete(); await loadUsersList(); }
  catch(e) { alert('Error: '+e.message); }
}

function showMsg(el, type, msg) {
  el.className='add-user-msg '+type; el.textContent=msg; el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),5000);
}

// ── Utils ─────────────────────────────────────────────────────────────────
function statusClass(s)   { return s==='Done'?'badge-done':s==='In Progress'?'badge-progress':'badge-todo'; }
function priorityClass(p) { return p==='High'?'badge-high':p==='Low'?'badge-low':'badge-medium'; }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Keyboard Shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeModal(); closeShareModal(); cancelJSREdit(); closeUserManager(); }
  if ((e.metaKey||e.ctrlKey) && e.key==='n' && (currentRole==='admin'||currentRole==='edit')) {
    e.preventDefault(); openAddTask();
  }
});
