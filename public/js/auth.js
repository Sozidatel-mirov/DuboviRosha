// Общие функции авторизации
async function loginUser(username, password) {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: username, password })
  });
  return await response.json();
}

function logout() {
  localStorage.clear();
  window.location.href = '/';
}

function getUser() {
  const user = localStorage.getItem('user');
  return user ? JSON.parse(user) : null;
}

function requireAuth() {
  const user = getUser();
  if (!user) {
    window.location.href = '/';
  }
  return user;
}

function requireRole(role) {
  const user = requireAuth();
  if (user.role !== role) {
    alert('Доступ запрещён');
    window.location.href = '/dashboard.html';
  }
  return user;
}

// Перенаправление в зависимости от роли
function redirectToDashboard() {
  const user = getUser();
  if (!user) return;
  if (user.role === 'client') {
    window.location.href = '/client-dashboard.html';
  } else {
    window.location.href = '/dashboard.html';
  }
}

// Обработчик входа (если кнопка существует на странице)
if (document.getElementById('loginBtn')) {
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    
    const data = await loginUser(login, password);
    
    if (data.success) {
      localStorage.setItem('user', JSON.stringify(data.user));
      redirectToDashboard();  // вместо window.location.href = '/dashboard.html';
    } else {
      document.getElementById('errorMsg').innerHTML = '❌ ' + data.message;
    }
  });
}