const user = getUser();
if (!user || user.role !== 'staff') {
  alert('Доступ запрещён');
  window.location.href = '/';
}

let allAppointments = [];
let filteredAppointments = [];
let currentSearch = '';

const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const procedureFilterSelect = document.getElementById('procedureFilter');
const statusFilterSelect = document.getElementById('statusFilter');
const applyFilterBtn = document.getElementById('applyFilterBtn');
const resetFilterBtn = document.getElementById('resetFilterBtn');
const tableSearch = document.getElementById('tableSearch');
const printBtn = document.getElementById('printReportBtn');
const tbody = document.querySelector('#reportTable tbody');

function getDateOnly(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  let cleaned = dateStr.split('T')[0];
  if (cleaned.includes(' ')) cleaned = cleaned.split(' ')[0];
  return cleaned;
}

function setDefaultDates() {
  startDateInput.value = '2020-01-01';
  endDateInput.value = '2030-12-31';
}

async function loadMyAppointments() {
  try {
    const res = await fetch('/api/appointments');
    const all = await res.json();
    allAppointments = all.filter(a => a.responsibleStaffId == user.id);
    const uniqueProcedures = [...new Set(allAppointments.map(a => a.procedureName))];
    procedureFilterSelect.innerHTML = '<option value="all">Все процедуры</option>' +
      uniqueProcedures.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
    applyFilters();
  } catch (err) {
    console.error(err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6">Ошибка загрузки данных</td></tr>';
  }
}

function applyFilters() {
  const startDate = startDateInput.value;
  const endDate = endDateInput.value;
  const procedureName = procedureFilterSelect.value;
  const status = statusFilterSelect.value;

  let filtered = [...allAppointments];
  if (startDate) filtered = filtered.filter(a => getDateOnly(a.date) >= startDate);
  if (endDate) filtered = filtered.filter(a => getDateOnly(a.date) <= endDate);
  if (procedureName !== 'all') filtered = filtered.filter(a => a.procedureName === procedureName);
  if (status !== 'all') filtered = filtered.filter(a => a.status === status);

  filteredAppointments = filtered;
  renderTable();
}

function renderTable() {
  let data = [...filteredAppointments];
  if (currentSearch.trim() !== '') {
    const searchLower = currentSearch.toLowerCase();
    data = data.filter(a =>
      a.patientName.toLowerCase().includes(searchLower) ||
      a.procedureName.toLowerCase().includes(searchLower) ||
      (a.comment && a.comment.toLowerCase().includes(searchLower))
    );
  }
  if (!tbody) return;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Нет данных по выбранным критериям</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(a => `
    <tr>
      <td>${getDateOnly(a.date)}</td>
      <td>${a.time || '—'}</td>
      <td>${escapeHtml(a.patientName)}</td>
      <td>${escapeHtml(a.procedureName)}</td>
      <td><span class="status-badge status-${a.status === 'Выполнена' ? 'completed' : a.status === 'Не явился' ? 'missed' : 'scheduled'}">${a.status}</span></td>
      <td>${escapeHtml(a.comment || '—')}</td>
    </tr>
  `).join('');
}

function resetFilters() {
  setDefaultDates();
  procedureFilterSelect.value = 'all';
  statusFilterSelect.value = 'all';
  applyFilters();
}

function printReport() {
  window.print();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

document.getElementById('staffInfo').innerHTML = `<i class="fas fa-user-nurse"></i> ${user.name} | <button onclick="logout()" class="btn-outline"><i class="fas fa-sign-out-alt"></i> Выйти</button>`;

if (applyFilterBtn) applyFilterBtn.addEventListener('click', applyFilters);
if (resetFilterBtn) resetFilterBtn.addEventListener('click', resetFilters);
if (tableSearch) tableSearch.addEventListener('input', (e) => { currentSearch = e.target.value; renderTable(); });
if (printBtn) printBtn.addEventListener('click', printReport);

setDefaultDates();
loadMyAppointments();