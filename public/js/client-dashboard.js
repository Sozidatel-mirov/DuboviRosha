const user = getUser();
if (!user || user.role !== 'client') window.location.href = '/';

document.getElementById('clientInfo').innerHTML = `${user.name} | <button onclick="logout()">Выйти</button>`;

// ========== ЗАГРУЗКА ПРОЦЕДУР (с кабинетом, отменой/переносом) ==========
async function loadAppointments() {
  try {
    const res = await fetch('/api/client/appointments', { headers: { 'X-User-Id': user.id } });
    const apps = await res.json();
    const container = document.getElementById('appointmentsList');
    if (!apps.length) {
      container.innerHTML = '<p>Нет назначенных процедур</p>';
      return;
    }
    container.innerHTML = apps.map(a => {
      const canCancel = a.status === 'Назначена' && new Date(a.date + 'T' + a.time) > new Date();
      return `
        <div class="card">
          <p><strong>Процедура:</strong> ${escapeHtml(a.procedureName)}</p>
          <p><strong>Кабинет:</strong> ${escapeHtml(a.resourceName || '—')}</p>
          <p><strong>Дата:</strong> ${a.date} ${a.time}</p>
          <p><strong>Статус:</strong> ${a.status}</p>
          <p><strong>Комментарий:</strong> ${escapeHtml(a.comment || '—')}</p>
          ${canCancel ? `
            <button onclick="cancelAppointment(${a.id})" class="btn-outline" style="color:#dc3545;"><i class="fas fa-times"></i> Отменить</button>
            <button onclick="rescheduleAppointment(${a.id})" class="btn-outline"><i class="fas fa-calendar-alt"></i> Перенести</button>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

// ========== ОТМЕНА ЗАПИСИ ==========
window.cancelAppointment = async (id) => {
  if (!confirm('Вы уверены, что хотите отменить эту запись?')) return;
  const res = await fetch(`/api/client/appointments/${id}`, { method: 'DELETE', headers: { 'X-User-Id': user.id } });
  if (res.ok) {
    alert('Запись отменена');
    loadAppointments();
    loadTreatmentPlans();
  } else {
    const err = await res.json();
    alert(err.error || 'Ошибка отмены');
  }
};

// ========== ПЕРЕНОС ЗАПИСИ ==========
window.rescheduleAppointment = async (id) => {
  const newDate = prompt('Введите новую дату (ГГГГ-ММ-ДД):', new Date().toISOString().slice(0,10));
  if (!newDate) return;
  const newTime = prompt('Введите новое время (ЧЧ:ММ):', '10:00');
  if (!newTime) return;
  const res = await fetch(`/api/client/reschedule-appointment/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
    body: JSON.stringify({ newDate, newTime })
  });
  if (res.ok) {
    alert('Запись успешно перенесена');
    loadAppointments();
    loadTreatmentPlans();
  } else {
    const err = await res.json();
    if (err.conflict) alert('Выбранное время уже занято. Попробуйте другое.');
    else alert(err.error || 'Ошибка переноса');
  }
};

// ========== ПЛАНЫ ЛЕЧЕНИЯ (без кнопки отметки, с кабинетом) ==========
async function loadTreatmentPlans() {
  const res = await fetch('/api/client/treatment-plans', { headers: { 'X-User-Id': user.id } });
  const plans = await res.json();
  const container = document.getElementById('plansContainer');
  if (!plans.length) {
    container.innerHTML = '<p>У вас пока нет активных планов лечения.</p>';
    return;
  }
  container.innerHTML = plans.map(plan => `
    <div style="margin-bottom: 24px; border-left: 4px solid #1a6d5e; padding-left: 16px;">
      <h3>${escapeHtml(plan.title)} <span style="font-size: 0.8rem;">(${plan.progress}% выполнено)</span></h3>
      <p>${escapeHtml(plan.description || '')}</p>
      <div style="background: #e2e8f0; border-radius: 20px; height: 12px; width: 100%; margin: 8px 0;">
        <div style="background: #1a6d5e; width: ${plan.progress}%; height: 12px; border-radius: 20px;"></div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;">
        ${plan.procedures.map(proc => `
          <div style="flex: 1; min-width: 200px; background: #f8fafc; border-radius: 16px; padding: 8px 12px;">
            <strong>${escapeHtml(proc.procedureName)}</strong><br>
            <small>${proc.date} ${proc.time}</small><br>
            <small>Кабинет: ${escapeHtml(proc.resourceName || '—')}</small><br>
            ${proc.status === 'Выполнена' ? '<span style="color: #1a6d5e;"><i class="fas fa-check-circle"></i> Выполнена</span>' : 
              proc.status === 'Не явился' ? '<span style="color: #dc3545;">Не явился</span>' :
              '<span style="color: #8ba0ae;">Ожидает выполнения</span>'}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

loadAppointments();
loadTreatmentPlans();