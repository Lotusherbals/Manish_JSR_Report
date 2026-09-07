// ─────────────────────────────────────────────────────────────────────────
//  MANISH JSR DASHBOARD — Main Application
//  Firebase Auth + Firestore powered
// ─────────────────────────────────────────────────────────────────────────

let db, auth;
let currentUser = null;
let currentRole = null;      // 'admin' | 'edit' | 'view'
let selectedDate  = todayStr();
let calViewYear, calViewMonth;
let selectedMood  = '';
let editingTaskId = null;
let localReportCache = {};   // { [date]: { tasks, jsrReport } }

// ── Bootstrap ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Detect unconfigured Firebase
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'YOUR_API_KEY') {
    show('setupScreen'); return;
  }

  try {
    firebase.initializeApp(firebaseConfig);
    db   = firebase.firestore();
    auth = firebase.auth();
  } catch (e) {
    show('setupScreen'); return;
  }

  // Date from URL param
  const params   = new URLSearchParams(window.location.search);
  const dateParam = params.get('date');
  if (dateParam) selectedDate = dateParam;

  const d = new Date(selectedDate + 'T00:00:00');
  calViewYear  = d.getFullYear();
  calViewMonth = d.getMonth();

  // Auth state
  auth.onAuthStateChanged(async user => {
    if (!user) { showLogin(); return; }
    await handleSignedIn(user);
  });
});

// ── Auth ─────────────────────────────────────────────────────────────────
function showLogin() {
  hideAll();
  show('loginScreen');
}

async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ hd: 'lotusherbals.com' });
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    alert('Sign-in failed: ' + e.message);
  }
}

async function signOut() {
  await auth.signOut();
  currentUser = null; currentRole = null;
  showLogin();
}

async function handleSignedIn(user) {
  // Admin is always allowed
  if (user.email === ADMIN_EMAIL) {
    currentUser = user;
    currentRole = 'admin';
    await ensureAdminInFirestore(user);
    launchApp();
    return;
  }

  // Check Firestore users collection
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists) {
      showAccessDenied(user.email);
      return;
    }
    const data = snap.data();
    currentUser = user;
    currentRole = data.role || 'view';
    launchApp();
  } catch (e) {
    showAccessDenied(user.email);
  }
}

async function ensureAdminInFirestore(user) {
  const ref = db.collection('users').doc(user.uid);
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

// ── App Launch ────────────────────────────────────────────────────────────
function launchApp() {
  hideAll();
  show('appContainer');

  // Populate user info in sidebar
  const u = currentUser;
  const initials = (u.displayName || u.email || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const avatarEl = document.getElementById('userAvatar');
  if (u.photoURL) {
    avatarEl.innerHTML = `<img src="${u.photoURL}" alt="">`;
  } else {
    avatarEl.textContent = initials;
  }
  document.getElementById('userName').textContent  = u.displayName || u.email.split('@')[0];
  document.getElementById('userEmail').textContent = u.email;

  const roleBadge = document.getElementById('userRoleBadge');
  roleBadge.textContent = currentRole === 'admin' ? '⚡ Admin' : currentRole === 'edit' ? '✏️ Edit' : '👁 View';
  roleBadge.className   = 'role-badge role-' + currentRole;

  // Admin panel link
  if (currentRole === 'admin') document.getElementById('adminSection').style.display = '';

  // View-only restrictions
  applyRoleRestrictions();

  // Calendar & page
  document.getElementById('prevMonth').addEventListener('click', () => {
    calViewMonth--; if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; } renderCalendar();
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    calViewMonth++; if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; } renderCalendar();
  });

  renderCalendar();
  loadAndRenderPage();
}

function applyRoleRestrictions() {
  const canEdit = currentRole === 'admin' || currentRole === 'edit';
  if (!canEdit) {
    document.getElementById('addTaskBtn')?.remove();
    document.getElementById('jsrEditBtn')?.remove();
    document.getElementById('emptyAddBtn')?.remove();
  }
}

function hideAll() {
  ['setupScreen','loginScreen','accessDenied','appContainer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}
function show(id) { document.getElementById(id)?.classList.remove('hidden'); }

// ── Date Helpers ──────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }
function formatDisplay(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
}
function formatDay(d) {
  const day  = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long' });
  const yest = new Date(); yest.setDate(yest.getDate()-1);
  if (d === todayStr()) return day + ' · Today';
  if (d === yest.toISOString().split('T')[0]) return day + ' · Yesterday';
  return day;
}
function goToDate(key) {
  if (key === 'today') selectedDate = todayStr();
  else if (key === 'yesterday') { const d=new Date(); d.setDate(d.getDate()-1); selectedDate=d.toISOString().split('T')[0]; }
  const d = new Date(selectedDate + 'T00:00:00');
  calViewYear=d.getFullYear(); calViewMonth=d.getMonth();
  renderCalendar(); loadAndRenderPage();
}

// ── Firestore Data ────────────────────────────────────────────────────────
async function loadReport(date) {
  if (localReportCache[date]) return localReportCache[date];
  try {
    const snap = await db.collection('reports').doc(date).get();
    const data = snap.exists ? snap.data() : { date, tasks:[], jsrReport:{} };
    localReportCache[date] = data;
    return data;
  } catch(e) {
    return { date, tasks:[], jsrReport:{} };
  }
}

async function saveReport(data) {
  localReportCache[data.date] = data;
  await db.collection('reports').doc(data.date).set({
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: currentUser?.email
  }, { merge: true });
}

async function loadAndRenderPage() {
  document.getElementById('displayDate').textContent = formatDisplay(selectedDate);
  document.getElementById('displayDay').textContent  = formatDay(selectedDate);
  const data = await loadReport(selectedDate);
  renderStats(data);
  renderTasks(data);
  renderJSR(data);
}

// ── Calendar ──────────────────────────────────────────────────────────────
function renderCalendar() {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('calMonthYear').textContent = MONTHS[calViewMonth] + ' ' + calViewYear;
  const calDays   = document.getElementById('calDays');
  calDays.innerHTML = '';
  const firstDay   = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth= new Date(calViewYear, calViewMonth+1, 0).getDate();
  const today      = todayStr();

  for (let i=0; i<firstDay; i++) {
    const b = document.createElement('div'); b.className='cal-day empty'; b.textContent=' '; calDays.appendChild(b);
  }
  for (let d=1; d<=daysInMonth; d++) {
    const ds = calViewYear+'-'+String(calViewMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const el = document.createElement('div');
    el.className = 'cal-day' + (ds===today?' today':'') + (ds===selectedDate?' selected':'') + (localReportCache[ds]&&((localReportCache[ds].tasks||[]).length||(localReportCache[ds].jsrReport||{}).summary)?' has-data':'');
    el.textContent = d;
    el.addEventListener('click', () => { selectedDate=ds; renderCalendar(); loadAndRenderPage(); });
    calDays.appendChild(el);
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────
function renderStats(data) {
  const tasks   = data.tasks || [];
  const total   = tasks.length;
  const done    = tasks.filter(t=>t.status==='Done').length;
  const prog    = tasks.filter(t=>t.status==='In Progress').length;
  const todo    = tasks.filter(t=>t.status==='Todo').length;
  let hours = 0;
  tasks.forEach(t => {
    if (t.timeSpent) {
      const hm=t.timeSpent.match(/(\d+(\.\d+)?)\s*h/i); const mm=t.timeSpent.match(/(\d+)\s*m/i);
      if (hm) hours+=parseFloat(hm[1]); if (mm) hours+=parseInt(mm[1])/60;
    }
  });
  document.getElementById('statTotal').textContent   = total;
  document.getElementById('statDone').textContent    = done;
  document.getElementById('statProgress').textContent= prog;
  document.getElementById('statTodo').textContent    = todo;
  document.getElementById('statHours').textContent   = hours>0?hours.toFixed(1)+'h':'0h';
  const pct = total>0?Math.round((done/total)*100):0;
  document.getElementById('progressPct').textContent = pct+'%';
  document.getElementById('progressBar').style.width = pct+'%';
}

// ── Tasks ─────────────────────────────────────────────────────────────────
function applyFilters() { loadAndRenderPage(); }

function getFiltered(tasks) {
  const sf = [...document.querySelectorAll('.status-filter:checked')].map(e=>e.value);
  const pf = [...document.querySelectorAll('.priority-filter:checked')].map(e=>e.value);
  return tasks.filter(t=>sf.includes(t.status)&&pf.includes(t.priority));
}

function sortedTasks(tasks) {
  const sort = document.getElementById('sortTasks')?.value||'priority';
  const po={High:0,Medium:1,Low:2}, so={'In Progress':0,Todo:1,Done:2};
  return [...tasks].sort((a,b)=> sort==='priority'?(po[a.priority]||1)-(po[b.priority]||1): sort==='status'?(so[a.status]||1)-(so[b.status]||1): (b.timeSpent||'').localeCompare(a.timeSpent||''));
}

function renderTasks(data) {
  const canEdit = currentRole==='admin'||currentRole==='edit';
  const tasks   = sortedTasks(getFiltered(data?.tasks||[]));
  const container= document.getElementById('taskList');
  const empty    = document.getElementById('emptyTasks');
  container.innerHTML='';

  if (tasks.length===0) {
    container.appendChild(empty); empty.classList.remove('hidden');
    if (!canEdit) document.getElementById('emptyAddBtn')?.remove();
    return;
  }
  empty.classList.add('hidden');

  tasks.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card'+(task.status==='Done'?' status-done':'')+(task.priority==='High'?' priority-high':'');
    card.dataset.id = task.id;
    const isDone = task.status==='Done';
    const editBtn  = canEdit?`<button class="task-action-btn" onclick="editTask('${task.id}')">Edit</button>`:'';
    const delBtn   = canEdit?`<button class="task-action-btn delete" onclick="deleteTask('${task.id}')">Delete</button>`:'';
    const toggleFn = canEdit?`onclick="toggleDone('${task.id}')"`:'' ;
    const addedBy  = task.addedBy?`<div class="task-added-by">Added by ${esc(task.addedBy)}</div>`:'';

    card.innerHTML=`
      <div class="task-card-top">
        <div class="${isDone?'task-check done':'task-check'}" ${toggleFn}></div>
        <div class="${isDone?'task-title done-text':'task-title'}">${esc(task.title)}</div>
        <div class="task-actions">${editBtn}${delBtn}</div>
      </div>
      ${task.description?`<div class="task-desc">${esc(task.description)}</div>`:''}
      <div class="task-meta">
        <span class="badge ${statusClass(task.status)}">${task.status}</span>
        <span class="badge ${priorityClass(task.priority)}">${task.priority}</span>
        ${task.category?`<span class="badge badge-category">${task.category}</span>`:''}
        ${task.timeSpent?`<span class="badge badge-time">⏱ ${task.timeSpent}</span>`:''}
      </div>
      ${addedBy}
    `;
    container.appendChild(card);
  });
}

function statusClass(s){return s==='Done'?'badge-done':s==='In Progress'?'badge-progress':'badge-todo'}
function priorityClass(p){return p==='High'?'badge-high':p==='Low'?'badge-low':'badge-medium'}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// ── Task CRUD ─────────────────────────────────────────────────────────────
function openAddTask() {
  editingTaskId=null;
  document.getElementById('modalTitle').textContent='Add Task';
  ['taskId','taskTitle','taskDesc','taskTime'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('taskCategory').value='Development';
  document.getElementById('taskPriority').value='Medium';
  document.getElementById('taskStatus').value='Todo';
  document.getElementById('taskModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('taskTitle').focus(),100);
}

function editTask(id) {
  const data = localReportCache[selectedDate]; if(!data) return;
  const task = data.tasks.find(t=>t.id===id); if(!task) return;
  editingTaskId=id;
  document.getElementById('modalTitle').textContent='Edit Task';
  document.getElementById('taskId').value=id;
  document.getElementById('taskTitle').value=task.title;
  document.getElementById('taskDesc').value=task.description||'';
  document.getElementById('taskCategory').value=task.category||'Development';
  document.getElementById('taskPriority').value=task.priority||'Medium';
  document.getElementById('taskStatus').value=task.status||'Todo';
  document.getElementById('taskTime').value=task.timeSpent||'';
  document.getElementById('taskModal').classList.remove('hidden');
}

async function saveTask() {
  const title=document.getElementById('taskTitle').value.trim();
  if(!title){document.getElementById('taskTitle').focus();return;}
  const data=localReportCache[selectedDate]||{date:selectedDate,tasks:[],jsrReport:{}};
  if(editingTaskId){
    const idx=data.tasks.findIndex(t=>t.id===editingTaskId);
    if(idx>-1) data.tasks[idx]={...data.tasks[idx],title,description:document.getElementById('taskDesc').value.trim(),category:document.getElementById('taskCategory').value,priority:document.getElementById('taskPriority').value,status:document.getElementById('taskStatus').value,timeSpent:document.getElementById('taskTime').value.trim(),updatedBy:currentUser?.email};
  } else {
    data.tasks.push({id:'task_'+Date.now(),title,description:document.getElementById('taskDesc').value.trim(),category:document.getElementById('taskCategory').value,priority:document.getElementById('taskPriority').value,status:document.getElementById('taskStatus').value,timeSpent:document.getElementById('taskTime').value.trim(),addedBy:currentUser?.email,createdAt:Date.now()});
  }
  await saveReport(data);
  closeModal(); loadAndRenderPage(); renderCalendar();
}

async function deleteTask(id) {
  if(!confirm('Delete this task?'))return;
  const data=localReportCache[selectedDate]; if(!data)return;
  data.tasks=data.tasks.filter(t=>t.id!==id);
  await saveReport(data); loadAndRenderPage(); renderCalendar();
}

async function toggleDone(id) {
  const data=localReportCache[selectedDate]; if(!data)return;
  const task=data.tasks.find(t=>t.id===id); if(!task)return;
  task.status=task.status==='Done'?'Todo':'Done';
  if(task.status==='Done') task.completedAt=Date.now();
  await saveReport(data); loadAndRenderPage(); renderCalendar();
}

function closeModal(){ document.getElementById('taskModal').classList.add('hidden'); editingTaskId=null; }

// ── JSR Report ─────────────────────────────────────────────────────────────
function renderJSR(data) {
  const r=data?.jsrReport||{};
  document.getElementById('viewSummary').textContent=r.summary||'Click Edit to add your daily summary...';
  document.getElementById('viewAchievements').textContent=r.achievements||'—';
  document.getElementById('viewBlockers').textContent=r.blockers||'—';
  document.getElementById('viewNextDay').textContent=r.nextDayPlan||'—';
  document.getElementById('viewMood').textContent=r.mood||'—';
}

function toggleJSREdit() {
  const data=localReportCache[selectedDate]||{jsrReport:{}};
  const r=data.jsrReport||{};
  document.getElementById('jsrSummary').value=r.summary||'';
  document.getElementById('jsrAchievements').value=r.achievements||'';
  document.getElementById('jsrBlockers').value=r.blockers||'';
  document.getElementById('jsrNextDay').value=r.nextDayPlan||'';
  selectedMood=r.mood||'';
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.toggle('selected',b.getAttribute('onclick')?.includes(selectedMood)));
  document.getElementById('jsrView').classList.add('hidden');
  document.getElementById('jsrEdit').classList.remove('hidden');
  document.getElementById('jsrEditBtn').textContent='';
}

function cancelJSREdit() {
  document.getElementById('jsrView').classList.remove('hidden');
  document.getElementById('jsrEdit').classList.add('hidden');
  document.getElementById('jsrEditBtn').textContent='✏️ Edit';
}

async function saveJSR() {
  const data=localReportCache[selectedDate]||{date:selectedDate,tasks:[],jsrReport:{}};
  data.jsrReport={summary:document.getElementById('jsrSummary').value.trim(),achievements:document.getElementById('jsrAchievements').value.trim(),blockers:document.getElementById('jsrBlockers').value.trim(),nextDayPlan:document.getElementById('jsrNextDay').value.trim(),mood:selectedMood,updatedBy:currentUser?.email};
  await saveReport(data); cancelJSREdit(); renderJSR(data); renderCalendar();
}

function selectMood(btn,mood) {
  selectedMood=mood;
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
}

// ── Share ─────────────────────────────────────────────────────────────────
function shareReport() {
  const url=window.location.origin+window.location.pathname+'?date='+selectedDate;
  document.getElementById('shareDate').textContent=formatDisplay(selectedDate);
  document.getElementById('shareUrl').value=url;
  document.getElementById('copySuccess').classList.add('hidden');
  document.getElementById('shareModal').classList.remove('hidden');
}
function copyShareUrl() {
  navigator.clipboard.writeText(document.getElementById('shareUrl').value).then(()=>{
    document.getElementById('copySuccess').classList.remove('hidden');
    setTimeout(()=>document.getElementById('copySuccess').classList.add('hidden'),3000);
  });
}
function closeShareModal(){ document.getElementById('shareModal').classList.add('hidden'); }

// ── Print ─────────────────────────────────────────────────────────────────
function printReport() {
  const data=localReportCache[selectedDate]||{tasks:[],jsrReport:{}};
  document.getElementById('printDate').textContent=formatDisplay(selectedDate);
  let html='<div><h2>Tasks</h2>';
  (data.tasks||[]).forEach(t=>{html+=`<div class="print-task-item"><strong>${esc(t.title)}</strong> [${t.status}] [${t.priority}]${t.category?' — '+t.category:''}${t.timeSpent?' — ⏱ '+t.timeSpent:''}${t.description?'<br><small>'+esc(t.description)+'</small>':''}</div>`;});
  html+='</div><div class="print-jsr-section"><h2>JSR Report</h2>';
  const r=data.jsrReport||{};
  [['Summary',r.summary],['Achievements',r.achievements],['Blockers',r.blockers],['Next Day Plan',r.nextDayPlan],['Mood',r.mood]].forEach(([l,v])=>{html+=`<div class="print-jsr-field"><div class="print-jsr-label">${l}</div><div class="print-jsr-val">${esc(v||'—')}</div></div>`;});
  html+='</div>';
  document.getElementById('printContent').innerHTML=html;
  window.print();
}

// ── User Manager (Admin only) ─────────────────────────────────────────────
async function openUserManager() {
  document.getElementById('userManagerModal').classList.remove('hidden');
  document.getElementById('addUserMsg').classList.add('hidden');
  document.getElementById('newUserEmail').value='';
  document.getElementById('newUserName').value='';
  document.getElementById('newUserRole').value='view';
  await loadUsersList();
}
function closeUserManager(){ document.getElementById('userManagerModal').classList.add('hidden'); }

async function loadUsersList() {
  const list=document.getElementById('usersList');
  list.innerHTML='<div class="loading-users">Loading users...</div>';
  try {
    const snap=await db.collection('users').get();
    const users=snap.docs.map(d=>d.data());
    document.getElementById('usersCount').textContent=users.length+' users';
    list.innerHTML='';
    users.sort((a,b)=>{const o={admin:0,edit:1,view:2};return (o[a.role]||2)-(o[b.role]||2);}).forEach(u=>{
      const isAdmin=u.email===ADMIN_EMAIL;
      const row=document.createElement('div');
      row.className='user-row';
      row.innerHTML=`
        <div class="user-row-avatar">${(u.name||u.email||'?')[0].toUpperCase()}</div>
        <div class="user-row-info">
          <div class="user-row-name">${esc(u.name||'Unknown')}${isAdmin?' <span class="user-row-admin-tag">● Owner</span>':''}</div>
          <div class="user-row-email">${esc(u.email)}</div>
        </div>
        <div class="user-row-actions">
          ${isAdmin
            ? `<span class="role-badge role-admin">⚡ Admin</span>`
            : `<select class="role-select-inline" onchange="changeRole('${u.uid}',this.value)">
                <option value="view" ${u.role==='view'?'selected':''}>👁 View</option>
                <option value="edit" ${u.role==='edit'?'selected':''}>✏️ Edit</option>
                <option value="admin" ${u.role==='admin'?'selected':''}>⚡ Admin</option>
              </select>
              <button class="btn-remove-user" onclick="removeUser('${u.uid}','${esc(u.email)}')">Remove</button>`
          }
        </div>
      `;
      list.appendChild(row);
    });
  } catch(e) {
    list.innerHTML='<div class="loading-users" style="color:#ff5470">Error loading users: '+e.message+'</div>';
  }
}

async function addUser() {
  const email=document.getElementById('newUserEmail').value.trim();
  const name =document.getElementById('newUserName').value.trim();
  const role =document.getElementById('newUserRole').value;
  const msgEl=document.getElementById('addUserMsg');
  if(!email){showMsg(msgEl,'error','Please enter an email address.'); return;}
  msgEl.className='add-user-msg';msgEl.textContent='Adding user...';msgEl.classList.remove('hidden');
  try {
    // Store by a sanitized email key since we don't have their UID yet
    const safeKey='pending_'+email.replace(/[@.]/g,'_');
    await db.collection('users').doc(safeKey).set({
      uid:safeKey, email, name:name||email.split('@')[0], role,
      addedBy:currentUser?.email,
      addedAt:firebase.firestore.FieldValue.serverTimestamp(),
      pending:true
    });
    showMsg(msgEl,'success','✅ User added! They will get full access on first sign-in.');
    document.getElementById('newUserEmail').value='';
    document.getElementById('newUserName').value='';
    await loadUsersList();
  } catch(e){
    showMsg(msgEl,'error','Error: '+e.message);
  }
}

async function changeRole(uid,role) {
  try { await db.collection('users').doc(uid).update({ role }); } catch(e){ alert('Error: '+e.message); }
}

async function removeUser(uid,email) {
  if(!confirm('Remove '+email+' from the dashboard?'))return;
  try { await db.collection('users').doc(uid).delete(); await loadUsersList(); } catch(e){ alert('Error: '+e.message); }
}

function showMsg(el,type,msg){
  el.className='add-user-msg '+type; el.textContent=msg; el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'),5000);
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key==='Escape'){ closeModal(); closeShareModal(); cancelJSREdit(); closeUserManager(); }
  if ((e.metaKey||e.ctrlKey)&&e.key==='n'&&(currentRole==='admin'||currentRole==='edit')){ e.preventDefault(); openAddTask(); }
});
