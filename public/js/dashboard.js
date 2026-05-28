const user = requireAuth();

function initNavigation() {
  const nav = document.getElementById('navbar');
  let panelUrl = '';
  if (user.role === 'admin') panelUrl = '/admin.html';
  else if (user.role === 'doctor') panelUrl = '/doctor.html';
  else panelUrl = '/staff.html';

  let reportsLink = '';
  if (user.role === 'admin' || user.role === 'doctor') {
    reportsLink = '<a href="/reports.html"><i class="fas fa-chart-line"></i> Отчёты</a>';
  } else if (user.role === 'staff') {
    reportsLink = '<a href="/staff-reports.html"><i class="fas fa-chart-line"></i> Мои отчёты</a>';
  }

  nav.innerHTML = `
    <a href="/dashboard.html"><i class="fas fa-home"></i> Главная</a>
    <a href="/calendar.html"><i class="fas fa-calendar-alt"></i> Календарь</a>
    ${reportsLink}
    <a href="${panelUrl}"><i class="fas fa-user-md"></i> Моя панель</a>
    <span class="user-info">
      <i class="fas fa-user-circle"></i> ${user.name} (${getRoleName(user.role)})
      <button onclick="logout()" class="btn-outline"><i class="fas fa-sign-out-alt"></i> Выйти</button>
    </span>
  `;
}

function getRoleName(role) {
  switch(role) {
    case 'admin': return 'Администратор';
    case 'doctor': return 'Врач';
    case 'staff': return 'Медперсонал';
    default: return role;
  }
}

async function loadStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  const statsContainer = document.getElementById('statsCards');
  statsContainer.innerHTML = `
    <div class="stat-card"><div class="stat-number">${stats.totalPatients}</div><div class="stat-label"><i class="fas fa-users"></i> Пациентов</div></div>
    <div class="stat-card"><div class="stat-number">${stats.totalAppointments}</div><div class="stat-label"><i class="fas fa-calendar-check"></i> Всего процедур</div></div>
    <div class="stat-card"><div class="stat-number">${stats.completionRate}%</div><div class="stat-label"><i class="fas fa-check-circle"></i> Выполнение</div></div>
  `;
}

function initQuickActions() {
  const actions = document.getElementById('quickActions');
  if (user.role === 'doctor') {
    actions.innerHTML = '<button onclick="location.href=\'/doctor.html\'"><i class="fas fa-user-plus"></i> Добавить пациента</button><button onclick="location.href=\'/doctor.html\'"><i class="fas fa-calendar-plus"></i> Назначить процедуру</button>';
  } else if (user.role === 'staff') {
    actions.innerHTML = '<button onclick="location.href=\'/staff.html\'"><i class="fas fa-check-double"></i> Отметить посещаемость</button>';
  } else {
    actions.innerHTML = '<button onclick="location.href=\'/admin.html\'"><i class="fas fa-users-cog"></i> Управление сотрудниками</button><button onclick="location.href=\'/calendar.html\'"><i class="fas fa-calendar-alt"></i> Просмотр расписания</button>';
  }
}

async function loadRecent() {
  const res = await fetch('/api/appointments');
  const apps = await res.json();
  const recent = apps.slice(-5).reverse();
  const container = document.getElementById('recentAppointments');
  if (recent.length === 0) {
    container.innerHTML = '<p style="color: #8ba0ae;"><i class="fas fa-info-circle"></i> Нет назначений</p>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead><tr><th><i class="fas fa-user"></i> Пациент</th><th><i class="fas fa-procedures"></i> Процедура</th><th><i class="fas fa-calendar-day"></i> Дата</th><th><i class="fas fa-clock"></i> Время</th><th><i class="fas fa-tag"></i> Статус</th></tr></thead>
      <tbody>
        ${recent.map(a => `
          <tr>
            <td>${escapeHtml(a.patientName)}</td>
            <td>${escapeHtml(a.procedureName || a.procedure || '—')}</td>
            <td>${a.date}</td>
            <td>${a.time || '—'}</td>
            <td><span class="status-badge status-${a.status === 'Выполнена' ? 'completed' : a.status === 'Не явился' ? 'missed' : 'scheduled'}">${a.status}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadNotifications() {
  const res = await fetch('/api/notifications');
  const notifications = await res.json();
  const container = document.getElementById('notificationsList');
  if (notifications.length === 0) {
    container.innerHTML = '<p style="color: #8ba0ae;"><i class="fas fa-bell-slash"></i> Нет уведомлений</p>';
    return;
  }
  container.innerHTML = notifications.slice(-5).map(n => `
    <div class="notification ${!n.read ? 'unread' : ''}">
      <i class="fas fa-bell"></i> ${escapeHtml(n.message)}<br>
      <small style="color: #8ba0ae;"><i class="fas fa-clock"></i> ${new Date(n.createdAt).toLocaleString()}</small>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

initNavigation();
initQuickActions();
loadStats();
loadRecent();
loadNotifications();
setInterval(() => { loadStats(); loadRecent(); loadNotifications(); }, 30000);