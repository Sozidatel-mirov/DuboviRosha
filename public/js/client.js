const user = getUser();
if (!user || user.role !== 'client') window.location.href = '/';

document.getElementById('clientInfo').innerHTML = `${user.name} | <button onclick="logout()">Выйти</button>`;

async function loadAppointments() {
  const res = await fetch('/api/client/appointments', { headers: { 'X-User-Id': user.id } });
  const apps = await res.json();
  const container = document.getElementById('appointmentsList');
  container.innerHTML = apps.map(a => `
    <div class="card">
      <p><strong>Процедура:</strong> ${a.procedureName}</p>
      <p><strong>Дата:</strong> ${a.date} ${a.time}</p>
      <p><strong>Статус:</strong> ${a.status}</p>
      <p><strong>Комментарий:</strong> ${a.comment || '—'}</p>
    </div>
  `).join('');
}
loadAppointments();