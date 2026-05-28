const user = getUser();
if (!user || user.role !== 'staff') {
  alert('Доступ запрещён');
  window.location.href = '/';
}

let currentAppointments = [];

// Получение локальной даты (YYYY-MM-DD) без учёта часового пояса
function getLocalToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Проверка, можно ли менять статус (только если процедура идёт прямо сейчас)
function canChangeStatus(appointment) {
  const todayStr = getLocalToday();
  const appDate = appointment.date ? appointment.date.split('T')[0] : '';
  if (appDate !== todayStr) return false;
  const [startHour, startMin] = appointment.time.split(':').map(Number);
  const duration = appointment.duration || 30;
  const startTime = startHour * 60 + startMin;
  const endTime = startTime + duration;
  const currentTime = new Date().getHours() * 60 + new Date().getMinutes();
  return currentTime >= startTime && currentTime <= endTime;
}

// Загрузка назначений, где ответственный – текущий сотрудник
async function loadMyAppointments() {
  try {
    const res = await fetch('/api/appointments');
    const allAppointments = await res.json();
    currentAppointments = allAppointments.filter(a => a.responsibleStaffId == user.id);
    renderAppointmentsTable();
    renderTodayAppointments();
  } catch (err) {
    console.error('Ошибка загрузки назначений:', err);
  }
}

// Таблица "Мои процедуры" (все процедуры сотрудника)
function renderAppointmentsTable() {
  const tbody = document.querySelector('#appointmentsTable tbody');
  if (!tbody) return;
  if (currentAppointments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6"><i class="fas fa-info-circle"></i> Нет назначенных процедур</td></tr>';
    return;
  }
  tbody.innerHTML = currentAppointments.map(a => `
    <tr>
      <td><i class="fas fa-user"></i> ${escapeHtml(a.patientName)}</td>
      <td><i class="fas fa-procedures"></i> ${escapeHtml(a.procedureName)}</td>
      <td><i class="fas fa-calendar-day"></i> ${a.date ? a.date.split('T')[0] : a.date}</td>
      <td><i class="fas fa-clock"></i> ${a.time || '—'} (${a.duration || 30} мин)</td>
      <td><span class="status-badge status-${a.status === 'Выполнена' ? 'completed' : a.status === 'Не явился' ? 'missed' : 'scheduled'}">${a.status}</span></td>
      <td><button onclick="showPatientCard(${a.patientId})" class="btn-outline"><i class="fas fa-notes-medical"></i> Карта</button></td>
    </tr>
  `).join('');
}

// Таблица "Сегодняшние процедуры" (только на текущую локальную дату)
function renderTodayAppointments() {
  const todayContainer = document.getElementById('todayAppointments');
  if (!todayContainer) return;
  const today = getLocalToday();
  const todayApps = currentAppointments.filter(a => {
    const appDate = a.date ? a.date.split('T')[0] : '';
    return appDate === today;
  });
  if (todayApps.length === 0) {
    todayContainer.innerHTML = '<p style="color: #8ba0ae;"><i class="fas fa-calendar-times"></i> Нет процедур на сегодня</p>';
    return;
  }
  todayContainer.innerHTML = `
    <div style="overflow-x: auto;">
      <table style="width:100%">
        <thead>
          <tr>
            <th><i class="fas fa-clock"></i> Время</th>
            <th><i class="fas fa-user"></i> Пациент</th>
            <th><i class="fas fa-procedures"></i> Процедура</th>
            <th><i class="fas fa-tag"></i> Текущий статус</th>
            <th><i class="fas fa-exchange-alt"></i> Новый статус</th>
            <th><i class="fas fa-comment"></i> Комментарий</th>
            <th><i class="fas fa-save"></i> Действие</th>
            <th><i class="fas fa-notes-medical"></i> Карта</th>
          </tr>
        </thead>
        <tbody>
          ${todayApps.map(a => {
            const canChange = canChangeStatus(a);
            return `
              <tr>
                <td>${a.time || '—'} (${a.duration || 30} мин)</td>
                <td>${escapeHtml(a.patientName)}</td>
                <td>${escapeHtml(a.procedureName)}</td>
                <td><span class="status-badge status-${a.status === 'Выполнена' ? 'completed' : a.status === 'Не явился' ? 'missed' : 'scheduled'}">${a.status}</span></td>
                <td>
                  <select id="status-${a.id}" class="status-select" ${!canChange ? 'disabled' : ''}>
                    <option value="Назначена" ${a.status === 'Назначена' ? 'selected' : ''}>Назначена</option>
                    <option value="Выполнена" ${a.status === 'Выполнена' ? 'selected' : ''}>Выполнена</option>
                    <option value="Не явился" ${a.status === 'Не явился' ? 'selected' : ''}>Не явился</option>
                  </select>
                 </td>
                <td>
                  <input type="text" id="comment-${a.id}" placeholder="Комментарий" value="${escapeHtml(a.comment || '')}" class="comment-input" ${!canChange ? 'disabled' : ''}>
                 </td>
                <td>
                  ${canChange 
                    ? `<button onclick="updateStatus(${a.id})" class="btn-outline"><i class="fas fa-save"></i> Сохранить</button>`
                    : `<span style="color:#999; font-size:0.8rem;"><i class="fas fa-ban"></i> Недоступно</span>`
                  }
                 </td>
                <td><button onclick="showPatientCard(${a.patientId})" class="btn-outline"><i class="fas fa-notes-medical"></i> Карта</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// Обновление статуса и комментария
window.updateStatus = async (appointmentId) => {
  const appointment = currentAppointments.find(a => a.id == appointmentId);
  if (!appointment) return;
  if (!canChangeStatus(appointment)) {
    alert('Изменение статуса возможно только во время процедуры');
    loadMyAppointments();
    return;
  }
  const statusSelect = document.getElementById(`status-${appointmentId}`);
  const commentInput = document.getElementById(`comment-${appointmentId}`);
  const newStatus = statusSelect?.value;
  const comment = commentInput?.value || '';
  if (!newStatus) return;
  try {
    const response = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, status: newStatus, comment })
    });
    if (response.ok) {
      alert('Статус обновлён');
      loadMyAppointments();
    } else {
      alert('Ошибка при обновлении');
    }
  } catch (err) {
    console.error(err);
    alert('Ошибка сети');
  }
};

// Показать карточку пациента
window.showPatientCard = async (patientId) => {
  try {
    const [patientRes, historyRes] = await Promise.all([
      fetch(`/api/patients/${patientId}`),
      fetch(`/api/appointments/patient/${patientId}`)
    ]);
    const patient = await patientRes.json();
    const history = await historyRes.json();
    let modal = document.getElementById('patientCardModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'patientCardModal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-window" style="max-width: 700px;">
          <h3><i class="fas fa-notes-medical"></i> Карта пациента</h3>
          <div id="patientCardContent"></div>
          <div class="modal-buttons">
            <button onclick="closePatientCardModal()"><i class="fas fa-times"></i> Закрыть</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    const content = modal.querySelector('#patientCardContent');
    content.innerHTML = `
      <p><i class="fas fa-user"></i> <strong>ФИО:</strong> ${escapeHtml(patient.name)}</p>
      <p><i class="fas fa-birthday-cake"></i> <strong>Дата рождения:</strong> ${patient.birthDate || '—'}</p>
      <p><i class="fas fa-phone"></i> <strong>Телефон:</strong> ${patient.phone || '—'}</p>
      <p><i class="fas fa-envelope"></i> <strong>Email:</strong> ${patient.email || '—'}</p>
      <p><i class="fas fa-stethoscope"></i> <strong>Диагноз:</strong> ${escapeHtml(patient.diagnosis || '—')}</p>
      <p><i class="fas fa-history"></i> <strong>История болезней:</strong> ${escapeHtml(patient.history || '—')}</p>
      <p><i class="fas fa-allergies"></i> <strong>Аллергии:</strong> ${escapeHtml(patient.allergies || '—')}</p>
      <p><i class="fas fa-tint"></i> <strong>Группа крови:</strong> ${patient.bloodType || '—'}</p>
      <hr>
      <h4><i class="fas fa-history"></i> История процедур</h4>
      <div style="overflow-x: auto;">
        <table style="width:100%">
          <thead><tr><th>Дата</th><th>Время</th><th>Процедура</th><th>Статус</th><th>Комментарий</th></tr></thead>
          <tbody>
            ${history.map(h => `
              <tr>
                <td>${h.date ? h.date.split('T')[0] : h.date}</td>
                <td>${h.time || '—'}</td>
                <td>${escapeHtml(h.procedureName)}</td>
                <td>${h.status}</td>
                <td>${escapeHtml(h.comment || '—')}</td>
              </tr>
            `).join('') || '<tr><td colspan="5">Нет процедур</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    modal.classList.add('active');
  } catch (err) {
    console.error(err);
    alert('Ошибка загрузки данных пациента');
  }
};

window.closePatientCardModal = function() {
  const modal = document.getElementById('patientCardModal');
  if (modal) modal.classList.remove('active');
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

const staffInfoSpan = document.getElementById('staffInfo');
if (staffInfoSpan) {
  staffInfoSpan.innerHTML = `<i class="fas fa-user-nurse"></i> ${user.name} | <button onclick="logout()" class="btn-outline"><i class="fas fa-sign-out-alt"></i> Выйти</button>`;
}

loadMyAppointments();
setInterval(loadMyAppointments, 15000);