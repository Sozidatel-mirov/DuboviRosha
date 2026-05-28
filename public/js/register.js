let verificationToken = null;
let timerInterval = null;
let remainingSeconds = 0;
const CODE_EXPIRY_SECONDS = 300; // 5 минут

const sendCodeBtn = document.getElementById('sendCodeBtn');
const editEmailBtn = document.getElementById('editEmailBtn');
const regEmailInput = document.getElementById('regEmail');
const verifyCodeBtn = document.getElementById('verifyCodeBtn');
const resendCodeBtn = document.getElementById('resendCodeBtn');
const codeBlock = document.getElementById('codeBlock');
const timerDisplay = document.getElementById('timerDisplay');
const step1Error = document.getElementById('step1Error');

function startTimer(seconds) {
  if (timerInterval) clearInterval(timerInterval);
  remainingSeconds = seconds;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    if (remainingSeconds <= 0) {
      clearInterval(timerInterval);
      timerDisplay.innerText = '';
      resendCodeBtn.style.display = 'inline-block';
      verifyCodeBtn.disabled = true;
    } else {
      remainingSeconds--;
      updateTimerDisplay();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  timerDisplay.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showError(element, message) {
  element.innerText = message;
  setTimeout(() => element.innerText = '', 5000);
}

// Отправка кода
sendCodeBtn.addEventListener('click', async () => {
  const email = regEmailInput.value;
  if (!email) return showError(step1Error, 'Введите email');
  sendCodeBtn.disabled = true;
  sendCodeBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Отправка...';
  try {
    const res = await fetch('/api/send-verification-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok) {
      // Блокируем поле email, показываем кнопку редактирования
      regEmailInput.readOnly = true;
      sendCodeBtn.style.display = 'none';
      editEmailBtn.style.display = 'inline-flex';
      codeBlock.style.display = 'block';
      startTimer(CODE_EXPIRY_SECONDS);
      verifyCodeBtn.disabled = false;
      resendCodeBtn.style.display = 'none';
      showError(step1Error, 'Код отправлен на почту');
    } else {
      showError(step1Error, data.error);
      sendCodeBtn.disabled = false;
      sendCodeBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить код';
    }
  } catch (err) {
    showError(step1Error, 'Ошибка сервера');
    sendCodeBtn.disabled = false;
    sendCodeBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить код';
  }
});

// Редактирование email
editEmailBtn.addEventListener('click', () => {
  regEmailInput.readOnly = false;
  regEmailInput.focus();
  editEmailBtn.style.display = 'none';
  sendCodeBtn.style.display = 'inline-flex';
  sendCodeBtn.disabled = false;
  sendCodeBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить код';
  codeBlock.style.display = 'none';
  if (timerInterval) clearInterval(timerInterval);
  document.getElementById('verificationCode').value = '';
  showError(step1Error, 'Введите новый email и нажмите "Отправить код"');
});

// Повторная отправка кода
resendCodeBtn.addEventListener('click', async () => {
  const email = regEmailInput.value;
  if (!email) return showError(step1Error, 'Email не указан');
  resendCodeBtn.disabled = true;
  resendCodeBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Отправка...';
  try {
    const res = await fetch('/api/send-verification-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (res.ok) {
      startTimer(CODE_EXPIRY_SECONDS);
      verifyCodeBtn.disabled = false;
      resendCodeBtn.style.display = 'none';
      showError(step1Error, 'Новый код отправлен');
    } else {
      showError(step1Error, data.error);
    }
  } catch (err) {
    showError(step1Error, 'Ошибка сервера');
  } finally {
    resendCodeBtn.disabled = false;
    resendCodeBtn.innerHTML = '<i class="fas fa-redo-alt"></i> Отправить снова';
  }
});

// Проверка кода
verifyCodeBtn.addEventListener('click', async () => {
  const email = regEmailInput.value;
  const code = document.getElementById('verificationCode').value;
  if (!email || !code) return showError(step1Error, 'Заполните email и код');
  verifyCodeBtn.disabled = true;
  verifyCodeBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Проверка...';
  try {
    const res = await fetch('/api/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await res.json();
    if (res.ok) {
      verificationToken = data.token;
      document.getElementById('step1').style.display = 'none';
      document.getElementById('step2').style.display = 'block';
      if (timerInterval) clearInterval(timerInterval);
    } else {
      showError(step1Error, data.error);
    }
  } catch (err) {
    showError(step1Error, 'Ошибка сервера');
  } finally {
    verifyCodeBtn.disabled = false;
    verifyCodeBtn.innerHTML = '<i class="fas fa-check"></i> Подтвердить код';
  }
});

// Завершение регистрации
document.getElementById('completeRegBtn').addEventListener('click', async () => {
  const name = document.getElementById('fullName').value;
  const gender = document.getElementById('gender').value;
  const birthDate = document.getElementById('birthDate').value;
  const phone = document.getElementById('phone').value;
  const password = document.getElementById('password').value;
  const password2 = document.getElementById('password2').value;
  const step2Error = document.getElementById('step2Error');

  if (!name || !password) return showError(step2Error, 'Заполните обязательные поля');
  if (password !== password2) return showError(step2Error, 'Пароли не совпадают');
  if (password.length < 6) return showError(step2Error, 'Пароль должен быть не менее 6 символов');

  try {
    const res = await fetch('/api/complete-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verificationToken, name, gender, birthDate, phone, password })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Регистрация успешна! Теперь вы можете войти.');
      window.location.href = '/';
    } else {
      showError(step2Error, data.error);
    }
  } catch (err) {
    showError(step2Error, 'Ошибка сервера');
  }
});