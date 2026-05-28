const user = getUser();
if (!user || user.role !== 'client') window.location.href = '/';

document.getElementById('clientInfo').innerHTML = `${user.name} | <button onclick="logout()">Выйти</button>`;

// Загрузка профиля
async function loadProfile() {
  const res = await fetch('/api/client/profile', { headers: { 'X-User-Id': user.id } });
  const data = await res.json();
  document.getElementById('profileName').value = data.name || '';
  document.getElementById('profileEmail').value = data.email || '';
  document.getElementById('profilePhone').value = data.phone || '';
  document.getElementById('profileBirthDate').value = data.birthDate || '';
  document.getElementById('profileGender').value = data.gender || 'М';
}

// Сохранение профиля
document.getElementById('saveProfileBtn').addEventListener('click', async () => {
  const payload = {
    name: document.getElementById('profileName').value,
    phone: document.getElementById('profilePhone').value,
    birthDate: document.getElementById('profileBirthDate').value,
    gender: document.getElementById('profileGender').value
  };
  const res = await fetch('/api/client/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
    body: JSON.stringify(payload)
  });
  if (res.ok) alert('Профиль обновлён');
  else alert('Ошибка');
});

// Смена пароля
document.getElementById('changePasswordBtn').addEventListener('click', async () => {
  const old = document.getElementById('oldPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const new2 = document.getElementById('newPassword2').value;
  if (newPwd !== new2) return alert('Новые пароли не совпадают');
  const res = await fetch('/api/client/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
    body: JSON.stringify({ oldPassword: old, newPassword: newPwd })
  });
  if (res.ok) alert('Пароль изменён');
  else alert('Ошибка');
});

// Загрузка медицинской карты
async function loadMedCard() {
  const res = await fetch('/api/client/medcard', { headers: { 'X-User-Id': user.id } });
  const p = await res.json();
  const container = document.getElementById('medcardContent');
  if (!p || !p.id) {
    container.innerHTML = '<p>Медицинская карта не заполнена. Обратитесь к врачу.</p>';
    return;
  }
  container.innerHTML = `
    <p><strong>Диагноз:</strong> ${p.diagnosis || '—'}</p>
    <p><strong>История болезней:</strong> ${p.history || '—'}</p>
    <p><strong>Аллергии:</strong> ${p.allergies || '—'}</p>
    <p><strong>Группа крови:</strong> ${p.bloodType || '—'}</p>
    <p><strong>Вес:</strong> ${p.weight || '—'} кг</p>
    <p><strong>Рост:</strong> ${p.height || '—'} см</p>
    <p><strong>Профессия:</strong> ${p.occupation || '—'}</p>
    <p><strong>Семейное положение:</strong> ${p.marital_status || '—'}</p>
    <p><strong>Экстренный контакт:</strong> ${p.emergency_contact || '—'}</p>
    <p><strong>Полис ДМС:</strong> ${p.insurance_policy || '—'}</p>
    <p><strong>Прививки:</strong> ${p.vaccinations || '—'}</p>
    <p><strong>Хронические заболевания:</strong> ${p.chronic_diseases || '—'}</p>
  `;
}

loadProfile();
loadMedCard();