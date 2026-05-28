const user = requireRole('admin');

let allUsers = [];
let currentRoleFilter = 'all';
let currentSearch = '';
let resourcesList = [];
let resourceMap = {};

function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); }

// ========== ЗАГРУЗКА СПИСКА СПЕЦИАЛЬНОСТЕЙ ДЛЯ DATALIST ==========
async function loadSpecialtiesForDatalist() {
  try {
    const res = await fetch('/api/doctor-specialties');
    const specialties = await res.json();
    const datalist = document.getElementById('specialtiesList');
    const editDatalist = document.getElementById('editSpecialtiesList');
    if (datalist) datalist.innerHTML = specialties.map(s => `<option value="${escapeHtml(s)}">`).join('');
    if (editDatalist) editDatalist.innerHTML = specialties.map(s => `<option value="${escapeHtml(s)}">`).join('');
  } catch (err) {
    console.error('Ошибка загрузки специальностей', err);
  }
}

// ========== ВКЛАДКИ ==========
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      contents.forEach(content => content.classList.remove('active'));
      const activeContent = document.getElementById(`tab-${tabId}`);
      if (activeContent) activeContent.classList.add('active');
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (tabId === 'procedures') {
        loadProcedures();
        loadResourcesForSelect();
      } else if (tabId === 'resources') {
        loadResources();
      }
    });
  });
}

// ========== ЗАГРУЗКА СПИСКА КАБИНЕТОВ ДЛЯ SELECT ==========
async function loadResourcesForSelect() {
  const res = await fetch('/api/resources', { headers: { 'X-User-Id': user.id } });
  resourcesList = await res.json();
  resourceMap = {};
  resourcesList.forEach(r => resourceMap[r.id] = r.name);
  const procSelect = document.getElementById('procResourceId');
  const editProcSelect = document.getElementById('editProcedureResourceId');
  const options = '<option value="">-- Выберите кабинет --</option>' + resourcesList.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  if (procSelect) procSelect.innerHTML = options;
  if (editProcSelect) editProcSelect.innerHTML = options;
}

// ========== СОТРУДНИКИ ==========
async function loadUsers() {
  try {
    const res = await fetch('/api/users', { headers: { 'X-User-Id': user.id } });
    if (!res.ok) throw new Error('Ошибка загрузки пользователей');
    allUsers = await res.json();
    applyUserFilter();
  } catch (err) {
    console.error(err);
    allUsers = [];
    applyUserFilter();
  }
}

async function loadUserProcedures(userId) {
  const res = await fetch(`/api/user-procedures/${userId}`);
  return await res.json();
}

async function applyUserFilter() {
  if (!Array.isArray(allUsers)) {
    console.error('allUsers не массив');
    return;
  }
  let filtered = [...allUsers];
  if (currentRoleFilter !== 'all') filtered = filtered.filter(u => u.role === currentRoleFilter);
  if (currentSearch) filtered = filtered.filter(u => u.name.toLowerCase().includes(currentSearch.toLowerCase()));
  const tbody = document.querySelector('#usersTable tbody');
  tbody.innerHTML = '';
  for (let u of filtered) {
    let proceduresHtml = '';
    let assignBtnHtml = '';
    if (u.role === 'staff') {
      const procs = await loadUserProcedures(u.id);
      proceduresHtml = procs.map(p => `<span class="procedure-badge">${escapeHtml(p.name)}</span>`).join('') || '—';
      assignBtnHtml = `<button onclick="openAssignProceduresModal(${u.id}, '${escapeHtml(u.name)}')" class="btn-outline"><i class="fas fa-tasks"></i> Процедуры</button>`;
    } else {
      proceduresHtml = '—';
      assignBtnHtml = '';
    }

    let roleIcon = '';
    let roleText = '';
    if (u.role === 'admin') {
      roleIcon = '<i class="fas fa-crown"></i>';
      roleText = 'Администратор';
    } else if (u.role === 'doctor') {
      roleIcon = '<i class="fas fa-stethoscope"></i>';
      roleText = 'Врач';
    } else if (u.role === 'staff') {
      roleIcon = '<i class="fas fa-user-nurse"></i>';
      roleText = 'Медперсонал';
    } else if (u.role === 'client') {
      roleIcon = '<i class="fas fa-user"></i>';
      roleText = 'Клиент';
    }

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><i class="fas fa-user"></i> ${escapeHtml(u.name)}</td>
      <td><i class="fas fa-envelope"></i> ${escapeHtml(u.login)}</td>
      <td>${roleIcon} ${roleText}</td>
      <td>${u.role === 'doctor' ? escapeHtml(u.specialty || '—') : '—'}</td>
      <td>${proceduresHtml}</td>
      <td>
        <button onclick="openEditUserModal(${u.id}, '${escapeHtml(u.name)}', '${escapeHtml(u.login)}', '${u.role}', '${escapeHtml(u.specialty || '')}')" class="btn-outline"><i class="fas fa-edit"></i></button>
        <button onclick="deleteUser(${u.id})" class="btn-outline" style="color:#dc3545;"><i class="fas fa-trash-alt"></i></button>
        ${assignBtnHtml}
      </td>
    `;
    tbody.appendChild(row);
  }
}

// Показать/скрыть поле специальности в зависимости от роли
function toggleSpecialtyField(roleSelectId, specialtyInputId) {
  const role = document.getElementById(roleSelectId).value;
  const specialtyField = document.getElementById(specialtyInputId);
  const container = specialtyField?.closest('.form-row');
  if (role === 'doctor') {
    if (container) container.style.display = 'block';
    else if (specialtyField) specialtyField.style.display = 'block';
  } else {
    if (container) container.style.display = 'none';
    else if (specialtyField) specialtyField.style.display = 'none';
    if (specialtyField) specialtyField.value = '';
  }
}

// Фильтры сотрудников
document.getElementById('roleFilter')?.addEventListener('change', (e) => { currentRoleFilter = e.target.value; applyUserFilter(); });
document.getElementById('userSearch')?.addEventListener('input', (e) => { currentSearch = e.target.value; applyUserFilter(); });
document.getElementById('resetUserFilterBtn')?.addEventListener('click', () => {
  document.getElementById('roleFilter').value = 'all';
  document.getElementById('userSearch').value = '';
  currentRoleFilter = 'all';
  currentSearch = '';
  applyUserFilter();
});

// Удаление пользователя
window.deleteUser = async (id) => {
  if (!confirm('Удалить сотрудника?')) return;
  await fetch(`/api/users/${id}`, { method: 'DELETE', headers: { 'X-User-Id': user.id } });
  loadUsers();
  loadStats();
};

// Открытие модального окна редактирования пользователя
window.openEditUserModal = (id, name, login, role, specialty) => {
  document.getElementById('editUserId').value = id;
  document.getElementById('editUserName').value = name;
  document.getElementById('editUserLogin').value = login;
  document.getElementById('editUserPassword').value = '';
  document.getElementById('editUserRole').value = role;
  document.getElementById('editUserSpecialty').value = specialty || '';
  toggleSpecialtyField('editUserRole', 'editUserSpecialty');
  document.getElementById('editUserModal').classList.add('active');
};

// Сохранение редактирования пользователя
document.getElementById('saveUserEditBtn')?.addEventListener('click', async () => {
  const id = document.getElementById('editUserId').value;
  const name = document.getElementById('editUserName').value;
  const login = document.getElementById('editUserLogin').value;
  const password = document.getElementById('editUserPassword').value;
  const role = document.getElementById('editUserRole').value;
  const specialty = document.getElementById('editUserSpecialty').value;
  if (!name || !login) return alert('Заполните имя и логин');
  const payload = { name, login, role, specialty: role === 'doctor' ? specialty : null };
  if (password) payload.password = password;
  await fetch(`/api/users/${id}`, { 
    method: 'PUT', 
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
    body: JSON.stringify(payload)
  });
  closeModal('editUserModal');
  loadUsers();
  loadStats();
  loadSpecialtiesForDatalist();
});

// Добавление пользователя
document.getElementById('addUserBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('empName').value;
  const login = document.getElementById('empLogin').value;
  const password = document.getElementById('empPass').value;
  const role = document.getElementById('empRole').value;
  const specialty = document.getElementById('empSpecialty').value;
  if (!name || !login || !password) return alert('Заполните все поля');
  await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
    body: JSON.stringify({ 
      name, login, password, role, 
      specialty: role === 'doctor' ? specialty : null 
    })
  });
  document.getElementById('empName').value = '';
  document.getElementById('empLogin').value = '';
  document.getElementById('empPass').value = '';
  document.getElementById('empRole').value = 'admin';
  document.getElementById('empSpecialty').value = '';
  toggleSpecialtyField('empRole', 'empSpecialty');
  loadUsers();
  loadStats();
  loadSpecialtiesForDatalist();
});

// Инициализация переключения видимости поля специальности
document.getElementById('empRole')?.addEventListener('change', () => toggleSpecialtyField('empRole', 'empSpecialty'));
document.getElementById('editUserRole')?.addEventListener('change', () => toggleSpecialtyField('editUserRole', 'editUserSpecialty'));

// ========== ПРОЦЕДУРЫ ==========
async function loadProcedures() {
  const res = await fetch('/api/procedures', { headers: { 'X-User-Id': user.id } });
  const procs = await res.json();
  const tbody = document.querySelector('#proceduresTable tbody');
  tbody.innerHTML = procs.map(p => {
    let resourceName = '—';
    if (p.resourceId && resourceMap[p.resourceId]) resourceName = resourceMap[p.resourceId];
    return `
      <tr>
        <td>${p.id}</td>
        <td><span id="proc-name-${p.id}">${escapeHtml(p.name)}</span></td>
        <td>${p.default_duration} мин</td>
        <td>${escapeHtml(p.category || '—')}</td>
        <td>${escapeHtml(resourceName)}</td>
        <td>
          <button onclick="openEditProcedureModal(${p.id}, '${escapeHtml(p.name)}', ${p.default_duration}, '${escapeHtml(p.category || '')}', ${p.resourceId || 'null'})" class="btn-outline"><i class="fas fa-edit"></i></button>
          <button onclick="deleteProcedure(${p.id})" class="btn-outline" style="color:#dc3545;"><i class="fas fa-trash-alt"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openEditProcedureModal = (id, name, duration, category, resourceId) => {
  document.getElementById('editProcedureId').value = id;
  document.getElementById('editProcedureName').value = name;
  document.getElementById('editProcedureDuration').value = duration;
  document.getElementById('editProcedureCategory').value = category;
  const select = document.getElementById('editProcedureResourceId');
  if (select && resourceMap) {
    select.value = resourceId || '';
  }
  document.getElementById('editProcedureModal').classList.add('active');
};

document.getElementById('saveProcedureEditBtn')?.addEventListener('click', async () => {
  const id = document.getElementById('editProcedureId').value;
  const name = document.getElementById('editProcedureName').value;
  const duration = document.getElementById('editProcedureDuration').value;
  const category = document.getElementById('editProcedureCategory').value;
  const resourceId = document.getElementById('editProcedureResourceId')?.value;
  if (!name) return alert('Введите название');
  const payload = { name, default_duration: parseInt(duration), category, resourceId: resourceId ? parseInt(resourceId) : null };
  await fetch(`/api/procedures/${id}`, { 
    method: 'PUT', 
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, 
    body: JSON.stringify(payload)
  });
  closeModal('editProcedureModal');
  loadProcedures();
});

window.deleteProcedure = async (id) => {
  if (!confirm('Удалить процедуру? Она не должна использоваться в назначениях.')) return;
  const res = await fetch(`/api/procedures/${id}`, { method: 'DELETE', headers: { 'X-User-Id': user.id } });
  if (res.status === 409) alert('❌ Невозможно удалить: процедура используется в назначениях');
  else if (res.ok) loadProcedures();
  else alert('Ошибка при удалении');
};

document.getElementById('addProcedureBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('procName').value;
  const duration = document.getElementById('procDuration').value;
  const category = document.getElementById('procCategory').value;
  const resourceId = document.getElementById('procResourceId')?.value;
  if (!name) return alert('Введите название процедуры');
  await fetch('/api/procedures', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, 
    body: JSON.stringify({ name, default_duration: parseInt(duration), category, resourceId: resourceId ? parseInt(resourceId) : null })
  });
  document.getElementById('procName').value = '';
  document.getElementById('procDuration').value = '30';
  document.getElementById('procCategory').value = '';
  if (document.getElementById('procResourceId')) document.getElementById('procResourceId').value = '';
  loadProcedures();
});

// ========== РЕСУРСЫ ==========
async function loadResources() {
  const res = await fetch('/api/resources', { headers: { 'X-User-Id': user.id } });
  resourcesList = await res.json();
  resourceMap = {};
  resourcesList.forEach(r => resourceMap[r.id] = r.name);
  const tbody = document.querySelector('#resourcesTable tbody');
  tbody.innerHTML = resourcesList.map(r => `
    <tr>
      <td>${r.id}</td>
      <td><span id="res-name-${r.id}">${escapeHtml(r.name)}</span></td>
      <td>${r.type === 'room' ? 'Кабинет' : (r.type === 'equipment' ? 'Оборудование' : 'Другое')}</td>
      <td>
        <button onclick="openEditResourceModal(${r.id}, '${escapeHtml(r.name)}', '${r.type}')" class="btn-outline"><i class="fas fa-edit"></i></button>
        <button onclick="deleteResource(${r.id})" class="btn-outline" style="color:#dc3545;"><i class="fas fa-trash-alt"></i></button>
      </td>
    </tr>
  `).join('');
}

window.openEditResourceModal = (id, name, type) => {
  document.getElementById('editResourceId').value = id;
  document.getElementById('editResourceName').value = name;
  document.getElementById('editResourceType').value = type;
  document.getElementById('editResourceModal').classList.add('active');
};

document.getElementById('saveResourceEditBtn')?.addEventListener('click', async () => {
  const id = document.getElementById('editResourceId').value;
  const name = document.getElementById('editResourceName').value;
  const type = document.getElementById('editResourceType').value;
  if (!name) return alert('Введите название');
  await fetch(`/api/resources/${id}`, { 
    method: 'PUT', 
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, 
    body: JSON.stringify({ name, type })
  });
  closeModal('editResourceModal');
  loadResources();
  loadProcedures();
});

window.deleteResource = async (id) => {
  if (!confirm('Удалить ресурс? Он не должен использоваться в назначениях.')) return;
  const res = await fetch(`/api/resources/${id}`, { method: 'DELETE', headers: { 'X-User-Id': user.id } });
  if (res.status === 409) alert('❌ Невозможно удалить: ресурс используется в назначениях');
  else if (res.ok) { loadResources(); loadProcedures(); }
  else alert('Ошибка при удалении');
};

document.getElementById('addResourceBtn')?.addEventListener('click', async () => {
  const name = document.getElementById('resourceName').value;
  const type = document.getElementById('resourceType').value;
  if (!name) return alert('Введите название ресурса');
  await fetch('/api/resources', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, 
    body: JSON.stringify({ name, type })
  });
  document.getElementById('resourceName').value = '';
  loadResources();
  loadProcedures();
});

// ========== НАЗНАЧЕНИЕ ПРОЦЕДУР СОТРУДНИКУ ==========
async function loadAllProceduresForSelect() {
  const res = await fetch('/api/procedures', { headers: { 'X-User-Id': user.id } });
  return await res.json();
}

window.openAssignProceduresModal = async (userId, userName) => {
  document.getElementById('assignUserId').value = userId;
  document.getElementById('assignUserName').innerText = userName;
  const allProcs = await loadAllProceduresForSelect();
  const userProcsRes = await fetch(`/api/user-procedures/${userId}`);
  const userProcs = await userProcsRes.json();
  const userProcIds = userProcs.map(p => p.id);
  const select = document.getElementById('procedureMultiSelect');
  select.innerHTML = allProcs.map(p => `<option value="${p.id}" ${userProcIds.includes(p.id) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  document.getElementById('assignProceduresModal').classList.add('active');
};

window.closeAssignProceduresModal = () => document.getElementById('assignProceduresModal').classList.remove('active');

document.getElementById('saveProceduresAssignBtn')?.addEventListener('click', async () => {
  const userId = document.getElementById('assignUserId').value;
  const select = document.getElementById('procedureMultiSelect');
  const selectedIds = Array.from(select.selectedOptions).map(opt => parseInt(opt.value));
  await fetch(`/api/user-procedures/${userId}`, { 
    method: 'PUT', 
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, 
    body: JSON.stringify({ procedureIds: selectedIds })
  });
  closeAssignProceduresModal();
  alert('✅ Процедуры назначены');
  loadUsers();
});

// ========== СТАТИСТИКА ==========
async function loadStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  document.getElementById('adminStats').innerHTML = `
    <div class="stat-card"><div class="stat-number">${stats.totalPatients}</div><div class="stat-label"><i class="fas fa-users"></i> Всего пациентов</div></div>
    <div class="stat-card"><div class="stat-number">${stats.totalAppointments}</div><div class="stat-label"><i class="fas fa-calendar-check"></i> Всего процедур</div></div>
    <div class="stat-card"><div class="stat-number">${stats.completionRate}%</div><div class="stat-label"><i class="fas fa-percent"></i> Выполнение</div></div>
  `;
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.getElementById('adminInfo').innerHTML = `<i class="fas fa-crown"></i> ${user.name} | <button onclick="logout()" class="btn-outline"><i class="fas fa-sign-out-alt"></i> Выйти</button>`;

if (document.getElementById('empRole')) toggleSpecialtyField('empRole', 'empSpecialty');
if (document.getElementById('editUserRole')) toggleSpecialtyField('editUserRole', 'editUserSpecialty');

loadSpecialtiesForDatalist();
loadUsers();
loadResourcesForSelect();
loadResources();
loadProcedures();
loadStats();
initTabs();