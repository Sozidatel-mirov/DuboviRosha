const user = requireAuth();

let allAppointments = [];
let filteredAppointments = [];
let currentSearch = '';
let statusChart, trendChart, resourceChart, patientActivityChart;

const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const procedureFilterSelect = document.getElementById('procedureFilter');
const statusFilterSelect = document.getElementById('statusFilter');
const applyFilterBtn = document.getElementById('applyFilterBtn');
const resetFilterBtn = document.getElementById('resetFilterBtn');
const tableSearch = document.getElementById('tableSearch');
const printBtn = document.getElementById('printBtn');
const exportPdfBtn = document.getElementById('exportPDFBtn');
const exportChartBtn = document.getElementById('exportChartBtn');
const tbody = document.querySelector('#reportTable tbody');

function getDateOnly(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  let cleaned = dateStr.split('T')[0];
  if (cleaned.includes(' ')) cleaned = cleaned.split(' ')[0];
  return cleaned;
}

function setDefaultDates() {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setDate(today.getDate() - 30);
  startDateInput.value = monthAgo.toISOString().split('T')[0];
  endDateInput.value = today.toISOString().split('T')[0];
}

async function loadAllData() {
  try {
    const res = await fetch('/api/appointments');
    allAppointments = await res.json();
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
  updateStats();
  updateCharts();
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

function updateStats() {
  const total = filteredAppointments.length;
  const completed = filteredAppointments.filter(a => a.status === 'Выполнена').length;
  const missed = filteredAppointments.filter(a => a.status === 'Не явился').length;
  const scheduled = filteredAppointments.filter(a => a.status === 'Назначена').length;
  const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
  const uniquePatients = new Set(filteredAppointments.map(a => a.patientId)).size;

  const statsContainer = document.getElementById('statsCards');
  if (statsContainer) {
    statsContainer.innerHTML = `
      <div class="stat-card"><div class="stat-number">${total}</div><div class="stat-label"><i class="fas fa-calendar-check"></i> Всего процедур</div></div>
      <div class="stat-card"><div class="stat-number">${completionRate}%</div><div class="stat-label"><i class="fas fa-check-circle"></i> Выполнение</div></div>
      <div class="stat-card"><div class="stat-number">${uniquePatients}</div><div class="stat-label"><i class="fas fa-users"></i> Активных пациентов</div></div>
      <div class="stat-card"><div class="stat-number">${completed}</div><div class="stat-label"><i class="fas fa-check-double"></i> Выполнено</div></div>
      <div class="stat-card"><div class="stat-number">${missed}</div><div class="stat-label"><i class="fas fa-times-circle"></i> Неявок</div></div>
      <div class="stat-card"><div class="stat-number">${scheduled}</div><div class="stat-label"><i class="fas fa-clock"></i> Запланировано</div></div>
    `;
  }
}

function updateCharts() {
  // Статус процедур
  const statusCounts = {
    'Выполнена': filteredAppointments.filter(a => a.status === 'Выполнена').length,
    'Назначена': filteredAppointments.filter(a => a.status === 'Назначена').length,
    'Не явился': filteredAppointments.filter(a => a.status === 'Не явился').length
  };
  if (statusChart) statusChart.destroy();
  const statusCtx = document.getElementById('statusChart').getContext('2d');
  statusChart = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: ['Выполнена', 'Назначена', 'Не явился'],
      datasets: [{ data: [statusCounts['Выполнена'], statusCounts['Назначена'], statusCounts['Не явился']], backgroundColor: ['#2c9b7a', '#1a6d5e', '#dc3545'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
  });

  // Динамика по месяцам
  const monthMap = new Map();
  filteredAppointments.forEach(a => {
    const month = getDateOnly(a.date).substring(0, 7);
    monthMap.set(month, (monthMap.get(month) || 0) + 1);
  });
  const sortedMonths = Array.from(monthMap.keys()).sort();
  const monthCounts = sortedMonths.map(m => monthMap.get(m));
  if (trendChart) trendChart.destroy();
  const trendCtx = document.getElementById('trendChart').getContext('2d');
  trendChart = new Chart(trendCtx, {
    type: 'line',
    data: { labels: sortedMonths, datasets: [{ label: 'Количество процедур', data: monthCounts, borderColor: '#1a6d5e', backgroundColor: 'rgba(26, 109, 94, 0.1)', tension: 0.3, fill: true }] },
    options: { responsive: true, maintainAspectRatio: true }
  });

  // Загрузка ресурсов
  const resourceMap = new Map();
  filteredAppointments.forEach(a => { resourceMap.set(a.resourceId, (resourceMap.get(a.resourceId) || 0) + 1); });
  if (resourceChart) resourceChart.destroy();
  const resourceCtx = document.getElementById('resourceChart').getContext('2d');
  resourceChart = new Chart(resourceCtx, {
    type: 'bar',
    data: { labels: Array.from(resourceMap.keys()).map(id => `Ресурс ${id}`), datasets: [{ label: 'Количество процедур', data: Array.from(resourceMap.values()), backgroundColor: '#2c9b7a', borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: true }
  });

  // Активность пациентов
  const patientMap = new Map();
  filteredAppointments.forEach(a => { patientMap.set(a.patientName, (patientMap.get(a.patientName) || 0) + 1); });
  const topPatients = Array.from(patientMap.entries()).sort((a,b) => b[1] - a[1]).slice(0, 5);
  if (patientActivityChart) patientActivityChart.destroy();
  const activityCtx = document.getElementById('patientActivityChart').getContext('2d');
  patientActivityChart = new Chart(activityCtx, {
    type: 'bar',
    data: { labels: topPatients.map(p => p[0]), datasets: [{ label: 'Количество процедур', data: topPatients.map(p => p[1]), backgroundColor: '#1a6d5e', borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y' }
  });
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

async function exportPDF() {
  const element = document.getElementById('reportContent');
  if (!element) return;
  const opt = {
    margin: [0, 0, 0, 0],
    filename: `report_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  await html2pdf().set(opt).from(element).save();
}

async function exportCharts() {
  const chartsHtml = `
    <div style="padding:20px;">
      <h1 style="text-align:center;">Графики</h1>
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div><canvas id="statusChartExport" width="280" height="200"></canvas></div>
        <div><canvas id="trendChartExport" width="280" height="200"></canvas></div>
        <div><canvas id="resourceChartExport" width="280" height="200"></canvas></div>
        <div><canvas id="patientActivityChartExport" width="280" height="200"></canvas></div>
      </div>
    </div>
  `;
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = chartsHtml;
  document.body.appendChild(tempDiv);
  new Chart(document.getElementById('statusChartExport'), statusChart.config);
  new Chart(document.getElementById('trendChartExport'), trendChart.config);
  new Chart(document.getElementById('resourceChartExport'), resourceChart.config);
  new Chart(document.getElementById('patientActivityChartExport'), patientActivityChart.config);
  const opt = {
    margin: [0, 0, 0, 0],
    filename: `charts_${new Date().toISOString().split('T')[0]}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  await html2pdf().set(opt).from(tempDiv).save();
  document.body.removeChild(tempDiv);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

document.getElementById('reportsUser').innerHTML = `${user.name} (${user.role}) | <a href="/dashboard.html"><i class="fas fa-arrow-left"></i> На главную</a>`;

if (applyFilterBtn) applyFilterBtn.addEventListener('click', applyFilters);
if (resetFilterBtn) resetFilterBtn.addEventListener('click', resetFilters);
if (tableSearch) tableSearch.addEventListener('input', (e) => { currentSearch = e.target.value; renderTable(); });
if (printBtn) printBtn.addEventListener('click', printReport);
if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportPDF);
if (exportChartBtn) exportChartBtn.addEventListener('click', exportCharts);

setDefaultDates();
loadAllData();