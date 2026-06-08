document.getElementById('completeRegBtn').addEventListener('click', async () => {
  const email = document.getElementById('regEmail').value.trim();
  const name = document.getElementById('fullName').value.trim();
  const gender = document.getElementById('gender').value;
  const birthDate = document.getElementById('birthDate').value;
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const password2 = document.getElementById('password2').value;
  const errorDiv = document.getElementById('regError');

  // Простая валидация
  if (!email || !name || !password) {
    errorDiv.textContent = 'Заполните обязательные поля (email, ФИО, пароль)';
    return;
  }
  if (password !== password2) {
    errorDiv.textContent = 'Пароли не совпадают';
    return;
  }
  if (password.length < 6) {
    errorDiv.textContent = 'Пароль должен быть не менее 6 символов';
    return;
  }

  try {
    const res = await fetch('/api/complete-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, gender, birthDate, phone, password })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Регистрация успешна! Теперь вы можете войти.');
      window.location.href = '/';
    } else {
      errorDiv.textContent = data.error || 'Ошибка регистрации';
    }
  } catch (err) {
    errorDiv.textContent = 'Ошибка сервера';
    console.error(err);
  }
});
