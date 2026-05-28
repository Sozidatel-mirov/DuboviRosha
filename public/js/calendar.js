const user = requireAuth();

let calendar = null;
let allEvents = [];
let currentProcedureFilter = 'all';
let currentCabinetFilter = 'all';

function getRoleName(role) {
  switch(role) {
    case 'admin': return 'Администратор';
    case 'doctor': return 'Врач';
    case 'staff': return 'Медперсонал';
    default: return role;
  }
}

function initNavigation() {
  const nav = document.getElementById('navbar');
  if (!nav) return;

  let panelUrl = '';
  let panelText = '';
  if (user.role === 'admin') {
    panelUrl = '/admin.html';
    panelText = '<i class="fas fa-crown"></i> Моя панель';
  } else if (user.role === 'doctor') {
    panelUrl = '/doctor.html';
    panelText = '<i class="fas fa-stethoscope"></i> Моя панель';
  } else {
    panelUrl = '/staff.html';
    panelText = '<i class="fas fa-user-nurse"></i> Мои процедуры';
  }

  let reportsLink = '';
  if (user.role === 'admin' || user.role === 'doctor') {
    reportsLink = '<a href="/reports.html"><i class="fas fa-chart-line"></i> Отчёты</a>';
  } else {
    reportsLink = '<a href="/staff-reports.html"><i class="fas fa-chart-line"></i> Мои отчёты</a>';
  }

  nav.innerHTML = `
    <a href="/dashboard.html"><i class="fas fa-home"></i> Главная</a>
    <a href="/calendar.html"><i class="fas fa-calendar-alt"></i> Календарь</a>
    <a href="${panelUrl}">${panelText}</a>
    ${reportsLink}
    <span class="user-info">
      <i class="fas fa-user-circle"></i> ${user.name} (${getRoleName(user.role)})
      <button onclick="logout()" class="btn-outline"><i class="fas fa-sign-out-alt"></i> Выйти</button>
    </span>
  `;
}

function addMinutes(time, minutes) {
  if (!time) return '18:00';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
}

function getFilteredEvents() {
  return allEvents.filter(event => {
    if (currentProcedureFilter !== 'all' && event.procedureName !== currentProcedureFilter) return false;
    if (currentCabinetFilter !== 'all' && event.extendedProps.resource !== currentCabinetFilter) return false;
    return true;
  });
}

function updateCalendar() {
  if (calendar) {
    calendar.removeAllEvents();
    calendar.addEventSource(getFilteredEvents());
  }
}

async function populateFilters() {
  const procedureSelect = document.getElementById('procedureFilter');
  const cabinetSelect = document.getElementById('cabinetFilter');
  if (!procedureSelect || !cabinetSelect) return;

  const procRes = await fetch('/api/procedures', { headers: { 'X-User-Id': user.id } });
  const procedures = await procRes.json();
  procedureSelect.innerHTML = '<option value="all">Все процедуры</option>' +
    procedures.map(p => `<option value="${p.name}">${escapeHtml(p.name)}</option>`).join('');

  const cabRes = await fetch('/api/resources', { headers: { 'X-User-Id': user.id } });
  const cabinets = await cabRes.json();
  cabinetSelect.innerHTML = '<option value="all">Все кабинеты</option>' +
    cabinets.map(c => `<option value="${c.name}">${escapeHtml(c.name)}</option>`).join('');
}

function applyFilter() {
  const procedureSelect = document.getElementById('procedureFilter');
  const cabinetSelect = document.getElementById('cabinetFilter');
  currentProcedureFilter = procedureSelect.value;
  currentCabinetFilter = cabinetSelect.value;
  updateCalendar();
}

function resetFilter() {
  const procedureSelect = document.getElementById('procedureFilter');
  const cabinetSelect = document.getElementById('cabinetFilter');
  procedureSelect.value = 'all';
  cabinetSelect.value = 'all';
  currentProcedureFilter = 'all';
  currentCabinetFilter = 'all';
  updateCalendar();
}

async function loadCalendar() {
  const [appointmentsRes, resourcesRes] = await Promise.all([
    fetch('/api/appointments', { headers: { 'X-User-Id': user.id } }),
    fetch('/api/resources', { headers: { 'X-User-Id': user.id } })
  ]);
  let appointments = await appointmentsRes.json();
  const resources = await resourcesRes.json();
  const resourceMap = new Map(resources.map(r => [r.id, r.name]));

  if (user.role === 'staff') {
    appointments = appointments.filter(a => a.responsibleStaffId == user.id);
  }

  // Проверка конфликтов
  const conflicts = [];
  const slotMap = new Map();
  appointments.forEach(a => {
    const key = `${a.resourceId}_${a.date}_${a.time}`;
    if (slotMap.has(key)) {
      if (!conflicts.includes(slotMap.get(key))) conflicts.push(slotMap.get(key));
      conflicts.push(a);
    } else {
      slotMap.set(key, a);
    }
  });

  const warningDiv = document.getElementById('conflictWarning');
  const conflictList = document.getElementById('conflictList');
  if (conflicts.length > 0) {
    warningDiv.style.display = 'block';
    warningDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Обнаружено ${conflicts.length} конфликт(ов) в расписании!`;
    conflictList.innerHTML = `
      <table>
        <thead><tr><th>Дата/Время</th><th>Ресурс</th><th>Пациент</th><th>Процедура</th></tr></thead>
        <tbody>
          ${conflicts.map(c => `
            <tr style="background: #fff3e0;">
              <td>${c.date} ${c.time}</td>
              <td>${resourceMap.get(c.resourceId) || c.resourceId}</td>
              <td>${c.patientName}</td>
              <td>${c.procedureName || c.procedure}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    warningDiv.style.display = 'none';
    conflictList.innerHTML = '<p style="color: #1a6d5e;"><i class="fas fa-check-circle"></i> Конфликтов не обнаружено</p>';
  }

  allEvents = appointments.map(a => {
    const startTime = a.time;
    const endTime = addMinutes(a.time, a.duration || 30);
    const cabinetName = resourceMap.get(a.resourceId) || '?';
    return {
      id: a.id,
      title: `${a.patientName} — ${a.procedureName || a.procedure} (${cabinetName})`,
      start: `${a.date}T${startTime}`,
      end: `${a.date}T${endTime}`,
      backgroundColor: a.status === 'Выполнена' ? '#2c9b7a' : a.status === 'Не явился' ? '#dc3545' : '#1a6d5e',
      borderColor: 'transparent',
      extendedProps: {
        resource: cabinetName,
        status: a.status,
        procedure: a.procedureName || a.procedure,
        patient: a.patientName
      },
      procedureName: a.procedureName || a.procedure
    };
  });

  const calendarEl = document.getElementById('calendar');
  if (calendar) calendar.destroy();
  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'timeGridWeek',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    locale: 'ru',
    slotMinTime: '08:00:00',
    slotMaxTime: '18:00:00',
    slotDuration: '00:30:00',
    allDaySlot: false,
    eventOverlap: false,
    slotEventOverlap: false,
    eventMaxStack: 3,
    events: getFilteredEvents(),
    eventClick: function(info) {
      alert(`Пациент: ${info.event.extendedProps.patient}\nПроцедура: ${info.event.extendedProps.procedure}\nКабинет: ${info.event.extendedProps.resource}\nСтатус: ${info.event.extendedProps.status}`);
    }
  });
  calendar.render();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

initNavigation();
if (user.role === 'staff') {
  const filterBar = document.querySelector('.filter-bar');
  if (filterBar) filterBar.style.display = 'none';
} else {
  populateFilters();
  const applyBtn = document.getElementById('applyFilterBtn');
  const resetBtn = document.getElementById('resetFilterBtn');
  if (applyBtn) applyBtn.addEventListener('click', applyFilter);
  if (resetBtn) resetBtn.addEventListener('click', resetFilter);
}
loadCalendar();