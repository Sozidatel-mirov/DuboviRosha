const user = getUser();
if (!user || user.role !== 'client') window.location.href = '/';

document.getElementById('clientInfo').innerHTML = `${user.name} | <button onclick="logout()">Выйти</button>`;

let doctors = [];
let selectedDoctorId = null;
let selectedDate = null;
let selectedSlot = null;
let currentSpecialty = 'all';

const today = new Date().toISOString().split('T')[0];
const dateInput = document.getElementById('appointmentDate');
if (dateInput) dateInput.min = today;

// Загрузка списка специальностей для фильтра
async function loadSpecialties() {
  try {
    const res = await fetch('/api/doctor-specialties');
    if (!res.ok) throw new Error('Ошибка загрузки специальностей');
    const specialties = await res.json();
    const select = document.getElementById('specialtyFilter');
    if (!select) return;
    if (!specialties.length) {
      select.style.display = 'none';
      const label = document.querySelector('label[for="specialtyFilter"]');
      if (label) label.style.display = 'none';
      return;
    }
    select.innerHTML = '<option value="all">Все специальности</option>' +
      specialties.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    select.disabled = false;
    // Обработчик изменения специальности
    select.onchange = async (e) => {
      currentSpecialty = e.target.value;
      await loadDoctors();
      resetBookingForm();
    };
  } catch (err) {
    console.error('Ошибка загрузки специальностей:', err);
  }
}

// Сброс формы при смене врача или специальности
function resetBookingForm() {
  selectedDoctorId = null;
  selectedSlot = null;
  const doctorSelect = document.getElementById('doctorSelect');
  if (doctorSelect) doctorSelect.value = '';
  const slotsContainer = document.getElementById('slotsContainer');
  if (slotsContainer) slotsContainer.innerHTML = 'Сначала выберите врача и дату';
  const bookBtn = document.getElementById('bookBtn');
  if (bookBtn) bookBtn.disabled = true;
}

// Загрузка списка врачей с учётом выбранной специальности
async function loadDoctors() {
  try {
    const url = currentSpecialty !== 'all' 
      ? `/api/doctors?specialty=${encodeURIComponent(currentSpecialty)}` 
      : '/api/doctors';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Ошибка загрузки врачей');
    doctors = await res.json();
    const select = document.getElementById('doctorSelect');
    if (!select) return;
    if (!doctors.length) {
      select.innerHTML = '<option value="">-- Нет врачей --</option>';
      select.disabled = true;
      resetBookingForm();
      return;
    }
    select.innerHTML = '<option value="">-- Выберите врача --</option>' +
      doctors.map(d => `<option value="${d.id}">${escapeHtml(d.name)} ${d.specialty ? `(${escapeHtml(d.specialty)})` : ''}</option>`).join('');
    select.disabled = false;
  } catch (err) {
    console.error('Ошибка загрузки врачей:', err);
    const select = document.getElementById('doctorSelect');
    if (select) select.innerHTML = '<option>Ошибка загрузки</option>';
  }
}

// Загрузка свободных слотов для выбранного врача и даты
async function loadFreeSlots() {
  const doctorId = selectedDoctorId;
  const date = selectedDate;
  if (!doctorId || !date) return;
  try {
    const res = await fetch(`/api/doctor-free-slots?doctorId=${doctorId}&date=${date}`);
    if (!res.ok) throw new Error('Ошибка загрузки слотов');
    const data = await res.json();
    const freeSlots = data.freeSlots || [];
    const container = document.getElementById('slotsContainer');
    if (!container) return;
    if (!freeSlots.length) {
      container.innerHTML = '<span style="color: #dc3545;">Нет свободного времени на эту дату</span>';
      selectedSlot = null;
      const bookBtn = document.getElementById('bookBtn');
      if (bookBtn) bookBtn.disabled = true;
      return;
    }
    container.innerHTML = freeSlots.map(slot => 
      `<button type="button" class="slot-btn" data-time="${slot}">${slot}</button>`
    ).join('');
    // Добавляем обработчики на кнопки слотов
    document.querySelectorAll('.slot-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSlot = btn.getAttribute('data-time');
        const bookBtn = document.getElementById('bookBtn');
        if (bookBtn) bookBtn.disabled = false;
      };
    });
    selectedSlot = null;
    const bookBtn = document.getElementById('bookBtn');
    if (bookBtn) bookBtn.disabled = true;
  } catch (err) {
    console.error('Ошибка загрузки слотов:', err);
    const container = document.getElementById('slotsContainer');
    if (container) container.innerHTML = '<span style="color: #dc3545;">Ошибка загрузки времени</span>';
  }
}

// Отправка записи к врачу
async function bookAppointment() {
  if (!selectedDoctorId || !selectedDate || !selectedSlot) {
    alert('Заполните все поля');
    return;
  }
  const reason = document.getElementById('reason').value.trim();
  const payload = {
    doctorId: selectedDoctorId,
    appointment_date: selectedDate,
    appointment_time: selectedSlot,
    reason: reason
  };
  try {
    const res = await fetch('/api/doctor-appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert('Запись успешно создана!');
      document.getElementById('reason').value = '';
      // Обновляем свободные слоты и список записей
      await loadFreeSlots();
      await loadMyAppointments();
      selectedSlot = null;
      document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      const bookBtn = document.getElementById('bookBtn');
      if (bookBtn) bookBtn.disabled = true;
    } else {
      const err = await res.json();
      if (err.conflict) alert('Это время уже занято. Выберите другое.');
      else alert(err.error || 'Ошибка записи');
    }
  } catch (err) {
    console.error('Ошибка при записи:', err);
    alert('Произошла ошибка. Попробуйте позже.');
  }
}

// Загрузка уже созданных записей клиента
async function loadMyAppointments() {
  try {
    const res = await fetch('/api/client/doctor-appointments', { headers: { 'X-User-Id': user.id } });
    if (!res.ok) throw new Error('Ошибка загрузки записей');
    const apps = await res.json();
    const container = document.getElementById('myAppointments');
    if (!container) return;
    if (!apps.length) {
      container.innerHTML = '<p>У вас нет записей к врачу.</p>';
      return;
    }
    container.innerHTML = `
      <table style="width:100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th>Врач</th>
            <th>Дата</th>
            <th>Время</th>
            <th>Причина</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          ${apps.map(a => `
            <tr>
              <td>${escapeHtml(a.doctor_name)}</td>
              <td>${a.appointment_date}</td>
              <td>${a.appointment_time}</td>
              <td>${escapeHtml(a.reason || '—')}</td>
              <td>${a.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error('Ошибка загрузки записей:', err);
    const container = document.getElementById('myAppointments');
    if (container) container.innerHTML = '<p>Ошибка загрузки записей</p>';
  }
}

// Обработчики событий
const doctorSelect = document.getElementById('doctorSelect');
if (doctorSelect) {
  doctorSelect.addEventListener('change', (e) => {
    selectedDoctorId = e.target.value;
    selectedSlot = null;
    document.getElementById('bookBtn').disabled = true;
    if (selectedDoctorId && selectedDate) loadFreeSlots();
  });
}
const appointmentDate = document.getElementById('appointmentDate');
if (appointmentDate) {
  appointmentDate.addEventListener('change', (e) => {
    selectedDate = e.target.value;
    selectedSlot = null;
    document.getElementById('bookBtn').disabled = true;
    if (selectedDoctorId && selectedDate) loadFreeSlots();
  });
}
const bookBtn = document.getElementById('bookBtn');
if (bookBtn) bookBtn.addEventListener('click', bookAppointment);

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

// Инициализация страницы
loadSpecialties();
loadDoctors();
loadMyAppointments();