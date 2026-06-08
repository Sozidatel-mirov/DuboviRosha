const user = requireRole('doctor');

let patients = [];
let allPatients = [];
let procedures = [];
let resources = [];
let courseProcedures = [];
let currentFilter = '';
let currentPatientId = null;
let currentPatientName = '';

// DOM элементы модального окна курса
const modalProceduresContainer = document.getElementById('modalProceduresList');
const modalAddProcedureBtn = document.getElementById('modalAddProcedureBtn');
const modalGenerateBtn = document.getElementById('modalGenerateScheduleBtn');
const modalSchedulePreviewDiv = document.getElementById('modalSchedulePreview');
const modalPreviewList = document.getElementById('modalPreviewList');
const modalConfirmBtn = document.getElementById('modalConfirmScheduleBtn');
const modalCancelPreviewBtn = document.getElementById('modalCancelPreviewBtn');
const modalPrintScheduleBtn = document.getElementById('modalPrintScheduleBtn');
const selectedPatientInfo = document.getElementById('selectedPatientInfo');

// DOM элементы модального окна добавления процедуры в курс
const addProcedureModal = document.getElementById('addProcedureModal');
const modalProcedureSelect = document.getElementById('modalProcedureSelect');
const modalSessionsCount = document.getElementById('modalSessionsCount');
const modalDuration = document.getElementById('modalDuration');
const confirmAddProcedureBtn = document.getElementById('confirmAddProcedureBtn');

// ========== ОТОБРАЖЕНИЕ ПАЦИЕНТОВ ==========
function renderPatientsTable(patientsToShow) {
  const tbody = document.querySelector('#patientsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = patientsToShow.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.diagnosis || '—')}</td>
      <td>
        <button onclick="showMedicalCard(${p.id})" class="btn-outline"><i class="fas fa-notes-medical"></i> Карта</button>
        <button onclick="openEditPatientModal(${p.id})"><i class="fas fa-edit"></i></button>
        <button onclick="deletePatient(${p.id})" class="btn-outline" style="color:#dc3545;"><i class="fas fa-trash-alt"></i></button>
        <button onclick="openCourseModal(${p.id})" class="btn-outline" style="background:#2c9b7a;"><i class="fas fa-calendar-plus"></i> Курс</button>
      </td>
    </tr>
  `).join('');
}

function filterPatients() {
  const term = currentFilter.toLowerCase().trim();
  const filtered = term ? allPatients.filter(p => p.name.toLowerCase().includes(term) || (p.diagnosis && p.diagnosis.toLowerCase().includes(term)) || (p.phone && p.phone.toLowerCase().includes(term)) || (p.email && p.email.toLowerCase().includes(term))) : allPatients;
  renderPatientsTable(filtered);
}

// ========== ЗАГРУЗКА ДАННЫХ ==========
async function loadPatients() {
  const res = await fetch('/api/patients', { headers: { 'X-User-Id': user.id } });
  allPatients = await res.json();
  patients = allPatients;
  filterPatients();
}
async function loadProcedures() {
  const res = await fetch('/api/procedures', { headers: { 'X-User-Id': user.id } });
  procedures = await res.json();
}
async function loadResources() {
  const res = await fetch('/api/resources', { headers: { 'X-User-Id': user.id } });
  resources = await res.json();
}
async function loadDoctorStats() {
  const res = await fetch('/api/appointments', { headers: { 'X-User-Id': user.id } });
  const allApps = await res.json();
  const myPatientsIds = patients.map(p => p.id);
  const myApps = allApps.filter(a => myPatientsIds.includes(a.patientId));
  const completed = myApps.filter(a => a.status === 'Выполнена').length;
  const statsDiv = document.getElementById('doctorStats');
  if (statsDiv) {
    statsDiv.innerHTML = `
      <div class="stat-card"><div class="stat-number">${patients.length}</div><div class="stat-label"><i class="fas fa-users"></i> Мои пациенты</div></div>
      <div class="stat-card"><div class="stat-number">${myApps.length}</div><div class="stat-label"><i class="fas fa-calendar-check"></i> Назначено процедур</div></div>
      <div class="stat-card"><div class="stat-number">${myApps.length ? Math.round(completed / myApps.length * 100) : 0}%</div><div class="stat-label"><i class="fas fa-percent"></i> Выполнение</div></div>
    `;
  }
}

// ========== УДАЛЕНИЕ ПАЦИЕНТА ==========
window.deletePatient = async (patientId) => {
  if (!confirm('Вы уверены, что хотите удалить этого пациента? Все его назначения также будут удалены.')) return;
  const res = await fetch(`/api/patients/${patientId}`, { method: 'DELETE', headers: { 'X-User-Id': user.id } });
  if (res.ok) { alert('Пациент удалён'); loadPatients(); loadDoctorStats(); } else alert('Ошибка при удалении');
};

// ========== МОДАЛЬНОЕ ОКНО КУРСА ==========
function openCourseModal(patientId) {
  const patient = patients.find(p => p.id == patientId);
  if (!patient) return;
  currentPatientId = patientId;
  currentPatientName = patient.name;
  selectedPatientInfo.innerHTML = `<i class="fas fa-user"></i> Пациент: <strong>${escapeHtml(currentPatientName)}</strong>`;
  document.getElementById('coursePatientId').value = patientId;
  courseProcedures = [];
  renderCourseProcedures();
  if (modalSchedulePreviewDiv) modalSchedulePreviewDiv.style.display = 'none';
  window.generatedSchedule = null;
  const modal = document.getElementById('courseModal');
  if (modal) modal.classList.add('active');
}
window.closeCourseModal = () => { const modal = document.getElementById('courseModal'); if (modal) modal.classList.remove('active'); };

function renderCourseProcedures() {
  if (!modalProceduresContainer) return;
  modalProceduresContainer.innerHTML = courseProcedures.length ? courseProcedures.map((proc, idx) => `<div class="procedure-item"><span><i class="fas fa-procedures"></i> ${escapeHtml(proc.procedureName)} — ${proc.sessionsCount} сеанс(ов) (${proc.duration} мин)</span><button onclick="removeProcedureFromCourse(${idx})" class="btn-outline" style="background:#dc3545; color:white;"><i class="fas fa-trash-alt"></i></button></div>`).join('') : '<p style="color:#8ba0ae;"><i class="fas fa-info-circle"></i> Нет добавленных процедур. Нажмите "Добавить процедуру".</p>';
}
window.removeProcedureFromCourse = (idx) => { courseProcedures.splice(idx, 1); renderCourseProcedures(); hidePreview(); };
function hidePreview() { if (modalSchedulePreviewDiv) modalSchedulePreviewDiv.style.display = 'none'; window.generatedSchedule = null; }

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ДАТАМИ ==========
function addMinutes(time, min) {
  let [h, m] = time.split(':').map(Number);
  let total = h * 60 + m + min;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
function nextDate(date, days, excludeWeekends) {
  let d = new Date(date);
  d.setDate(d.getDate() + days);
  if (excludeWeekends) while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

async function isSlotFree(resourceId, date, time, duration, busySlots) {
  const res = await fetch(`/api/free-slots?resourceId=${resourceId}&date=${date}`, { headers: { 'X-User-Id': user.id } });
  const data = await res.json();
  const freeSlots = data.freeSlots || [];
  if (!freeSlots.includes(time)) return false;
  let slotEnd = addMinutes(time, duration);
  for (let busy of busySlots) {
    if (time < busy.end && slotEnd > busy.start) return false;
  }
  return true;
}

async function findNearestFreeSlot(resourceId, date, desiredTime, duration, busySlots) {
  const res = await fetch(`/api/free-slots?resourceId=${resourceId}&date=${date}`, { headers: { 'X-User-Id': user.id } });
  const data = await res.json();
  let freeSlots = data.freeSlots || [];
  freeSlots.sort();
  for (let slot of freeSlots) {
    if (slot < desiredTime) continue;
    let slotEnd = addMinutes(slot, duration);
    let conflict = false;
    for (let busy of busySlots) {
      if (slot < busy.end && slotEnd > busy.start) { conflict = true; break; }
    }
    if (!conflict) return slot;
  }
  return null;
}

// ========== ГЕНЕРАЦИЯ ПРЕДПРОСМОТРА ==========
async function generatePreview() {
  if (!currentPatientId) { alert('Пациент не выбран'); return; }
  if (!courseProcedures.length) { alert('Добавьте процедуры'); return; }
  const startDate = document.getElementById('modalCourseStartDate').value;
  const startTime = document.getElementById('modalCourseStartTime').value;
  const intervalDays = parseInt(document.getElementById('modalIntervalDays').value);
  const intervalMinutes = parseInt(document.getElementById('modalIntervalMinutes').value);
  const excludeWeekends = document.getElementById('modalExcludeWeekends').value === 'true';
  if (!startDate || !startTime) { alert('Укажите дату и время начала'); return; }

  let rawSessions = [];
  for (let proc of courseProcedures) {
    let curDate = new Date(startDate);
    for (let i = 0; i < proc.sessionsCount; i++) {
      let sessionDate = new Date(curDate);
      if (excludeWeekends) while (sessionDate.getDay() === 0 || sessionDate.getDay() === 6) sessionDate.setDate(sessionDate.getDate() + 1);
      rawSessions.push({
        date: sessionDate.toISOString().split('T')[0],
        procedureId: proc.procedureId,
        procedureName: proc.procedureName,
        duration: proc.duration
      });
      curDate = nextDate(curDate, intervalDays, excludeWeekends);
    }
  }
  let grouped = {};
  for (let s of rawSessions) {
    if (!grouped[s.date]) grouped[s.date] = [];
    grouped[s.date].push(s);
  }

  let finalSchedule = [];
  for (let date in grouped) {
    let currentTime = startTime;
    let busySlots = [];
    for (let item of grouped[date]) {
      let proc = procedures.find(p => p.id == item.procedureId);
      let resourceId = proc?.resourceId;
      if (!resourceId && resources.length) resourceId = resources[0].id;
      if (!resourceId) { alert(`Не удалось определить ресурс для процедуры ${item.procedureName}`); return; }
      let free = await isSlotFree(resourceId, date, currentTime, item.duration, busySlots);
      if (!free) {
        let newSlot = await findNearestFreeSlot(resourceId, date, currentTime, item.duration, busySlots);
        if (!newSlot) {
          let nextDateObj = new Date(date);
          let maxAttempts = 30;
          let found = false;
          for (let a = 0; a < maxAttempts; a++) {
            nextDateObj = nextDate(nextDateObj, 1, excludeWeekends);
            let nextDateStr = nextDateObj.toISOString().split('T')[0];
            newSlot = await findNearestFreeSlot(resourceId, nextDateStr, '08:00', item.duration, []);
            if (newSlot) {
              date = nextDateStr;
              currentTime = newSlot;
              found = true;
              break;
            }
          }
          if (!found) { alert(`Не удалось найти свободное время для процедуры "${item.procedureName}" в течение 30 дней.`); return; }
        } else {
          if (!confirm(`Для процедуры "${item.procedureName}" на ${date} время ${currentTime} занято. Предлагаем ${newSlot}. Принять?`)) {
            alert('Формирование расписания отменено');
            return;
          }
          currentTime = newSlot;
        }
      }
      let resourceName = resources.find(r => r.id == resourceId)?.name || '—';
      finalSchedule.push({
        date: date,
        time: currentTime,
        procedureId: item.procedureId,
        procedureName: item.procedureName,
        duration: item.duration,
        resourceName: resourceName,
        resourceId: resourceId
      });
      let endTime = addMinutes(currentTime, item.duration);
      busySlots.push({ start: currentTime, end: endTime });
      currentTime = addMinutes(currentTime, item.duration + intervalMinutes);
    }
  }
  window.generatedSchedule = finalSchedule;
  renderEditableSchedulePreview(finalSchedule);
  modalSchedulePreviewDiv.style.display = 'block';
}

function renderEditableSchedulePreview(schedule) {
  let html = '<div style="overflow-x: auto;"><table class="preview-table" style="width:100%; border-collapse: collapse;">';
  html += '<thead><tr><th>Дата</th><th>Время</th><th>Процедура</th><th>Кабинет</th><th>Длительность</th><th>Действия</th></tr></thead><tbody>';
  schedule.forEach((item, idx) => {
    html += `
      <tr data-idx="${idx}">
        <td><input type="date" class="edit-date" value="${item.date}" data-idx="${idx}"></td>
        <td><input type="time" class="edit-time" value="${item.time}" data-idx="${idx}"></td>
        <td>${escapeHtml(item.procedureName)}</td>
        <td>${escapeHtml(item.resourceName)}</td>
        <td>${item.duration} мин</td>
        <td><button onclick="removeSession(${idx})" class="btn-outline"><i class="fas fa-trash-alt"></i> Удалить</button></td>
      </tr>
    `;
  });
  html += '</tbody></table></div><div class="modal-buttons"><button id="updateScheduleBtn" class="btn"><i class="fas fa-sync-alt"></i> Обновить расписание</button></div>';
  modalPreviewList.innerHTML = html;
  document.querySelectorAll('.edit-date, .edit-time').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const newDate = document.querySelector(`.edit-date[data-idx="${idx}"]`).value;
      const newTime = document.querySelector(`.edit-time[data-idx="${idx}"]`).value;
      if (window.generatedSchedule[idx]) {
        window.generatedSchedule[idx].date = newDate;
        window.generatedSchedule[idx].time = newTime;
      }
    });
  });
  const updateBtn = document.getElementById('updateScheduleBtn');
  if (updateBtn) updateBtn.onclick = async () => await revalidateSchedule();
}

async function revalidateSchedule() {
  if (!window.generatedSchedule) return;
  let hasConflict = false;
  for (let item of window.generatedSchedule) {
    let resourceId = item.resourceId;
    if (!resourceId && resources.length) resourceId = resources[0].id;
    let free = await isSlotFree(resourceId, item.date, item.time, item.duration, []);
    if (!free) {
      let newSlot = await findNearestFreeSlot(resourceId, item.date, item.time, item.duration, []);
      if (newSlot && confirm(`Конфликт: процедура "${item.procedureName}" на ${item.date} ${item.time} уже занята. Предлагаем ${newSlot}. Принять?`)) {
        item.time = newSlot;
      } else {
        alert(`Конфликт не разрешён для процедуры "${item.procedureName}". Исправьте вручную.`);
        hasConflict = true;
      }
    }
  }
  if (!hasConflict) {
    renderEditableSchedulePreview(window.generatedSchedule);
    alert('Расписание обновлено, конфликтов нет.');
  } else {
    alert('Остались конфликты, пожалуйста, исправьте их вручную.');
  }
}

window.removeSession = (idx) => {
  if (window.generatedSchedule) {
    window.generatedSchedule.splice(idx, 1);
    renderEditableSchedulePreview(window.generatedSchedule);
  }
};

function printSchedule() {
  if (!window.generatedSchedule) return alert('Нет расписания');
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Расписание для ${currentPatientName}</title><meta charset="UTF-8"><style>body{font-family:Arial;padding:20px}h1{color:#1a6d5e}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px}th{background:#e8f4f0}</style></head><body><h1><i class="fas fa-calendar-alt"></i> Расписание процедур</h1><p><strong>Пациент:</strong> ${escapeHtml(currentPatientName)}</p><p><strong>Дата печати:</strong> ${new Date().toLocaleString()}</p><table><thead><tr><th>№</th><th>Дата</th><th>Время</th><th>Процедура</th><th>Кабинет</th><th>Длительность</th><tr></thead><tbody>${window.generatedSchedule.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.date}</td><td>${i.time}</td><td>${escapeHtml(i.procedureName)}</td><td>${escapeHtml(i.resourceName)}</td><td>${i.duration} мин</td></tr>`).join('')}</tbody></table><div class="footer"><i class="fas fa-signature"></i> Подпись врача: __________________</div></body></html>`);
  w.document.close(); w.print();
}

// ========== СОХРАНЕНИЕ РАСПИСАНИЯ (BATCH) ==========
async function confirmSchedule() {
  if (!window.generatedSchedule) return alert('Нет расписания');
  if (!currentPatientId) return alert('Пациент не выбран');
  const patient = patients.find(p => p.id == currentPatientId);
  if (!patient) return;
  if (!resources.length) return alert('Нет ресурсов');
  for (let item of window.generatedSchedule) {
    let resourceId = item.resourceId;
    if (!resourceId && resources.length) resourceId = resources[0].id;
    let free = await isSlotFree(resourceId, item.date, item.time, item.duration, []);
    if (!free) {
      alert(`Конфликт: процедура "${item.procedureName}" на ${item.date} ${item.time} уже занята. Измените время и повторите сохранение.`);
      return;
    }
  }
  const toCreate = [];
  const errors = [];
  for (let item of window.generatedSchedule) {
    const resp = await fetch(`/api/get-responsible-staff/${item.procedureId}`, { headers: { 'X-User-Id': user.id } });
    const staff = await resp.json();
    if (!staff.id) { errors.push(`${item.date} ${item.time}: ${staff.error || 'нет ответственного'}`); continue; }
    let resourceId = item.resourceId || resources[0].id;
    toCreate.push({ patientId: currentPatientId, patientName: patient.name, procedureId: item.procedureId, procedureName: item.procedureName, date: item.date, time: item.time, duration: item.duration, resourceId, status: 'Назначена', responsibleStaffId: staff.id });
  }
  if (!toCreate.length) { alert(`Ошибки:\n${errors.join('\n')}`); return; }
  const res = await fetch('/api/appointments/batch', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, body: JSON.stringify({ appointments: toCreate }) });
  const result = await res.json();
  const success = result.results.filter(r => r.success).length;
  const fail = result.results.filter(r => !r.success).length;
  alert(`✅ Создано: ${success}\n❌ Ошибок: ${fail}\n${errors.length ? `⚠️ Не найден персонал: ${errors.length}` : ''}`);
  courseProcedures = [];
  renderCourseProcedures();
  hidePreview();
  closeCourseModal();
  loadDoctorStats();
}

// ========== ДОБАВЛЕНИЕ ПРОЦЕДУРЫ В КУРС ==========
function openAddProcedureModal() {
  if (!procedures.length) { alert('Список процедур не загружен'); return; }
  modalProcedureSelect.innerHTML = '<option value="">-- Выберите процедуру --</option>' + procedures.map(p => `<option value="${p.id}" data-duration="${p.default_duration}">${escapeHtml(p.name)} (${p.default_duration} мин)</option>`).join('');
  modalSessionsCount.value = '5';
  modalDuration.value = '30';
  addProcedureModal.classList.add('active');
}
window.closeAddProcedureModal = () => addProcedureModal.classList.remove('active');
function addSelectedProcedure() {
  const procId = modalProcedureSelect.value;
  if (!procId) { alert('Выберите процедуру'); return; }
  const sessions = parseInt(modalSessionsCount.value);
  const dur = parseInt(modalDuration.value);
  if (isNaN(sessions) || sessions < 1) { alert('Количество сеансов ≥1'); return; }
  if (isNaN(dur) || dur < 5) { alert('Длительность ≥5 мин'); return; }
  const proc = procedures.find(p => p.id == procId);
  if (!proc) return;
  courseProcedures.push({ procedureId: proc.id, procedureName: proc.name, sessionsCount: sessions, duration: dur });
  renderCourseProcedures();
  closeAddProcedureModal();
}

// ========== МОДАЛЬНОЕ ОКНО ПАЦИЕНТА ==========
function openPatientModal(isEdit, data) {
  const modal = document.getElementById('patientModal');
  const title = document.getElementById('patientModalTitle');
  if (isEdit && data) {
    title.innerHTML = '<i class="fas fa-edit"></i> Редактировать пациента';
    document.getElementById('patientId').value = data.id;
    document.getElementById('patientName').value = data.name || '';
    document.getElementById('patientGender').value = data.gender || '';
    document.getElementById('patientBirthDate').value = data.birthDate || '';
    document.getElementById('patientPhone').value = data.phone || '';
    document.getElementById('patientEmail').value = data.email || '';
    document.getElementById('patientDiagnosis').value = data.diagnosis || '';
    document.getElementById('patientHistory').value = data.history || '';
    document.getElementById('patientAllergies').value = data.allergies || '';
    document.getElementById('patientBloodType').value = data.bloodType || '';
    document.getElementById('patientWeight').value = data.weight || '';
    document.getElementById('patientHeight').value = data.height || '';
    document.getElementById('patientOccupation').value = data.occupation || '';
    document.getElementById('patientMaritalStatus').value = data.marital_status || '';
    document.getElementById('patientEmergencyContact').value = data.emergency_contact || '';
    document.getElementById('patientInsurancePolicy').value = data.insurance_policy || '';
    document.getElementById('patientVaccinations').value = data.vaccinations || '';
    document.getElementById('patientChronicDiseases').value = data.chronic_diseases || '';
  } else {
    title.innerHTML = '<i class="fas fa-user-plus"></i> Новый пациент';
    document.getElementById('patientId').value = '';
    document.querySelectorAll('#patientModal input, #patientModal textarea, #patientModal select').forEach(el => el.value = '');
  }
  modal.classList.add('active');
}
window.closePatientModal = () => {
  const modal = document.getElementById('patientModal');
  if (modal) modal.classList.remove('active');
};

document.getElementById('savePatientBtn')?.addEventListener('click', async () => {
  const id = document.getElementById('patientId').value;
  const patient = {
    id: id ? parseInt(id) : undefined,
    name: document.getElementById('patientName').value,
    gender: document.getElementById('patientGender').value,
    birthDate: document.getElementById('patientBirthDate').value,
    phone: document.getElementById('patientPhone').value,
    email: document.getElementById('patientEmail').value,
    diagnosis: document.getElementById('patientDiagnosis').value,
    history: document.getElementById('patientHistory').value,
    allergies: document.getElementById('patientAllergies').value,
    bloodType: document.getElementById('patientBloodType').value,
    weight: parseFloat(document.getElementById('patientWeight').value) || null,
    height: parseInt(document.getElementById('patientHeight').value) || null,
    occupation: document.getElementById('patientOccupation').value,
    marital_status: document.getElementById('patientMaritalStatus').value,
    emergency_contact: document.getElementById('patientEmergencyContact').value,
    insurance_policy: document.getElementById('patientInsurancePolicy').value,
    vaccinations: document.getElementById('patientVaccinations').value,
    chronic_diseases: document.getElementById('patientChronicDiseases').value
  };
  if (!patient.name) { alert('Введите ФИО'); return; }
  try {
    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: JSON.stringify(patient)
    });
    const data = await res.json();
    if (res.ok) {
      if (res.ok) {
        let message = 'Пациент сохранён';
        if (data.tempPassword) {
          message += `\nВременный пароль: ${data.tempPassword}\nПередайте его пациенту.`;
        }
        alert(message);
        closePatientModal();
        loadPatients();
        loadDoctorStats();
      } else if (patient.email && !patient.id) {
        alert('Пациент добавлен и связан с существующей учётной записью.');
      } else {
        alert('Пациент сохранён');
      }
      closePatientModal();
      loadPatients();
      loadDoctorStats();
    } else {
      alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
    }
  } catch (err) {
    alert('Ошибка сервера');
    console.error(err);
  }
});

window.openEditPatientModal = async (patientId) => {
  const res = await fetch(`/api/patients/${patientId}`, { headers: { 'X-User-Id': user.id } });
  const patient = await res.json();
  openPatientModal(true, patient);
};
document.getElementById('newPatientBtn')?.addEventListener('click', () => openPatientModal(false));

// ========== МЕДИЦИНСКАЯ КАРТА ==========
window.showMedicalCard = async (patientId) => {
  const p = await (await fetch(`/api/patients/${patientId}`, { headers: { 'X-User-Id': user.id } })).json();
  const history = await (await fetch(`/api/appointments/patient/${patientId}`, { headers: { 'X-User-Id': user.id } })).json();
  const modal = document.getElementById('medicalCardModal');
  const content = document.getElementById('modalContent');
  content.innerHTML = `
    <h3><i class="fas fa-user-circle"></i> ${escapeHtml(p.name)}</h3>
    <p><i class="fas fa-birthday-cake"></i> <strong>Дата рождения:</strong> ${p.birthDate || '—'}</p>
    <p><i class="fas fa-phone"></i> <strong>Телефон:</strong> ${p.phone || '—'}</p>
    <p><i class="fas fa-envelope"></i> <strong>Email:</strong> ${p.email || '—'}</p>
    <p><i class="fas fa-stethoscope"></i> <strong>Диагноз:</strong> ${escapeHtml(p.diagnosis || '—')}</p>
    <p><i class="fas fa-history"></i> <strong>История:</strong> ${escapeHtml(p.history || '—')}</p>
    <p><i class="fas fa-allergies"></i> <strong>Аллергии:</strong> ${escapeHtml(p.allergies || '—')}</p>
    <p><i class="fas fa-tint"></i> <strong>Группа крови:</strong> ${p.bloodType || '—'}</p>
    <p><i class="fas fa-weight"></i> <strong>Вес:</strong> ${p.weight || '—'} кг</p>
    <p><i class="fas fa-arrow-up"></i> <strong>Рост:</strong> ${p.height || '—'} см</p>
    <p><i class="fas fa-briefcase"></i> <strong>Профессия:</strong> ${escapeHtml(p.occupation || '—')}</p>
    <p><i class="fas fa-heart"></i> <strong>Семейное положение:</strong> ${escapeHtml(p.marital_status || '—')}</p>
    <p><i class="fas fa-phone-alt"></i> <strong>Экстренный контакт:</strong> ${escapeHtml(p.emergency_contact || '—')}</p>
    <p><i class="fas fa-file-invoice"></i> <strong>Полис ДМС:</strong> ${escapeHtml(p.insurance_policy || '—')}</p>
    <p><i class="fas fa-syringe"></i> <strong>Прививки:</strong> ${escapeHtml(p.vaccinations || '—')}</p>
    <p><i class="fas fa-lungs"></i> <strong>Хронические заболевания:</strong> ${escapeHtml(p.chronic_diseases || '—')}</p>
    <hr>
    <h4><i class="fas fa-history"></i> История процедур</h4>
    <div style="overflow-x:auto;"><table style="width:100%"><thead><tr><th>Дата</th><th>Время</th><th>Процедура</th><th>Кабинет</th><th>Статус</th><th>Комментарий</th><th>Действия</th></tr></thead><tbody>
      ${history.map(a => { let res = resources.find(r => r.id == a.resourceId); return `<tr><td>${a.date}</td><td>${a.time || '—'}</td><td>${escapeHtml(a.procedureName)}</td><td>${escapeHtml(res ? res.name : '—')}</td><td><span class="status-badge status-${a.status === 'Выполнена' ? 'completed' : a.status === 'Не явился' ? 'missed' : 'scheduled'}">${a.status}</span></td><td>${escapeHtml(a.comment || '—')}</td><td><button onclick="editAppointment(${a.id})" class="btn-outline"><i class="fas fa-edit"></i></button> <button onclick="deleteAppointment(${a.id})" class="btn-outline" style="color:#dc3545;"><i class="fas fa-trash-alt"></i></button></td></tr>` }).join('') || '<tr><td colspan="7">Нет процедур</td></tr>'}
    </tbody></table></div>
  `;
  modal.classList.add('active');
  document.body.classList.add('modal-open');
};
window.closeModal = () => {
  const modal = document.getElementById('medicalCardModal');
  if (modal) modal.classList.remove('active');
  document.body.classList.remove('modal-open');
};

// ========== РЕДАКТИРОВАНИЕ/УДАЛЕНИЕ НАЗНАЧЕНИЙ ==========
async function editAppointment(id) {
  const all = await (await fetch('/api/appointments', { headers: { 'X-User-Id': user.id } })).json();
  const app = all.find(a => a.id == id);
  if (!app) return;
  document.getElementById('editAppointmentProcedureId').innerHTML = procedures.map(p => `<option value="${p.id}" ${p.id == app.procedureId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  document.getElementById('editAppointmentResourceId').innerHTML = resources.map(r => `<option value="${r.id}" ${r.id == app.resourceId ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  document.getElementById('editAppointmentId').value = app.id;
  document.getElementById('editAppointmentDate').value = app.date;
  document.getElementById('editAppointmentTime').value = app.time || '09:00';
  document.getElementById('editAppointmentStatus').value = app.status;
  document.getElementById('editAppointmentComment').value = app.comment || '';
  document.getElementById('editAppointmentModal').classList.add('active');
}
window.closeEditAppointmentModal = () => document.getElementById('editAppointmentModal').classList.remove('active');
document.getElementById('saveAppointmentEditBtn')?.addEventListener('click', async () => {
  const id = document.getElementById('editAppointmentId').value;
  const procId = document.getElementById('editAppointmentProcedureId').value;
  const proc = procedures.find(p => p.id == procId);
  const resId = document.getElementById('editAppointmentResourceId').value;
  const date = document.getElementById('editAppointmentDate').value;
  const time = document.getElementById('editAppointmentTime').value;
  const status = document.getElementById('editAppointmentStatus').value;
  const comment = document.getElementById('editAppointmentComment').value;
  if (!date || !time) { alert('Заполните дату и время'); return; }
  const all = await (await fetch('/api/appointments', { headers: { 'X-User-Id': user.id } })).json();
  const conflict = all.find(a => a.id != id && a.resourceId == resId && a.date == date && a.time == time);
  if (conflict) {
    const useAuto = confirm('Это время уже занято. Найти ближайшее свободное?');
    if (useAuto) {
      const resp = await fetch('/api/find-free-slot', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, body: JSON.stringify({ resourceId: resId, date, time, duration: 30, excludeWeekends: true }) });
      const data = await resp.json();
      if (data.success) {
        const newDate = data.date, newTime = data.time;
        if (confirm(`Предлагаем перенести на ${newDate} ${newTime}. Принять?`)) {
          document.getElementById('editAppointmentDate').value = newDate;
          document.getElementById('editAppointmentTime').value = newTime;
          await document.getElementById('saveAppointmentEditBtn').click();
          return;
        }
      } else alert(data.message);
      return;
    }
    alert('Изменение отменено');
    return;
  }
  const response = await fetch(`/api/appointments/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id }, body: JSON.stringify({ procedureId: parseInt(procId), procedureName: proc.name, resourceId: parseInt(resId), date, time, status, comment }) });
  if (response.ok) { alert('Назначение обновлено'); closeEditAppointmentModal(); loadPatients(); } else alert('Ошибка');
});
window.deleteAppointment = async (id) => {
  if (!confirm('Удалить это назначение?')) return;
  const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE', headers: { 'X-User-Id': user.id } });
  if (res.ok) { alert('Назначение удалено'); loadPatients(); } else alert('Ошибка');
};

function escapeHtml(s) { if (!s) return ''; return s.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

// ========== НАВИГАЦИЯ И ПОИСК ==========
document.getElementById('doctorInfo').innerHTML = `<i class="fas fa-user-md"></i> ${user.name} | <button onclick="logout()" class="btn-outline"><i class="fas fa-sign-out-alt"></i> Выйти</button>`;
document.getElementById('patientSearch')?.addEventListener('input', e => { currentFilter = e.target.value; filterPatients(); });
document.getElementById('clearSearchBtn')?.addEventListener('click', () => { document.getElementById('patientSearch').value = ''; currentFilter = ''; filterPatients(); });

// ========== ОБРАБОТЧИКИ СОБЫТИЙ ДЛЯ КУРСА ==========
modalAddProcedureBtn?.addEventListener('click', openAddProcedureModal);
modalGenerateBtn?.addEventListener('click', generatePreview);
modalConfirmBtn?.addEventListener('click', confirmSchedule);
modalCancelPreviewBtn?.addEventListener('click', hidePreview);
modalPrintScheduleBtn?.addEventListener('click', printSchedule);
confirmAddProcedureBtn?.addEventListener('click', addSelectedProcedure);

// ========== ИНИЦИАЛИЗАЦИЯ ==========
loadPatients();
loadProcedures();
loadResources();
loadDoctorStats();
