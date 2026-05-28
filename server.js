const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const cron = require('node-cron');
const moment = require('moment-timezone');
require('dotenv').config();

// ============ ИНТЕГРАЦИЯ GIGACHAT ============
const { GigaChat } = require('gigachat');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

// ============ ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ ============
const dbPath = path.join(__dirname, 'healthcare.db');
const db = new sqlite3.Database(dbPath);
db.run('PRAGMA foreign_keys = ON');

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}
function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ============ MIDDLEWARE ПРОВЕРКИ РОЛИ ============
function requireRole(...roles) {
  return async (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Необходима авторизация' });
    }
    try {
      const user = await getQuery(`SELECT role FROM users WHERE id = ?`, [userId]);
      if (!user) {
        return res.status(401).json({ error: 'Пользователь не найден' });
      }
      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: 'Недостаточно прав' });
      }
      req.userRole = user.role;
      next();
    } catch (err) {
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
}

// ============ МИГРАЦИЯ (все таблицы + specialty) ============
async function migrate() {
  const columnsToAdd = [
    { table: 'users', column: 'email', type: 'TEXT' },
    { table: 'users', column: 'email_confirmed', type: 'BOOLEAN DEFAULT 0' },
    { table: 'users', column: 'temp_password', type: 'TEXT' },
    { table: 'users', column: 'reset_token', type: 'TEXT' },
    { table: 'users', column: 'reset_expires', type: 'TEXT' },
    { table: 'users', column: 'phone', type: 'TEXT' },
    { table: 'users', column: 'birthDate', type: 'TEXT' },
    { table: 'users', column: 'gender', type: 'TEXT' },
    { table: 'users', column: 'specialty', type: 'TEXT' },
    { table: 'patients', column: 'userId', type: 'INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL' },
    { table: 'appointments', column: 'responsibleStaffId', type: 'INTEGER REFERENCES users(id) ON DELETE SET NULL' },
    { table: 'procedures', column: 'resourceId', type: 'INTEGER REFERENCES resources(id) ON DELETE SET NULL' },
    { table: 'appointments', column: 'plan_id', type: 'INTEGER' }
  ];
  for (const col of columnsToAdd) {
    try {
      await runQuery(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}`);
      console.log(`✅ Добавлена колонка ${col.column} в ${col.table}`);
    } catch (e) {}
  }

  await runQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      login TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'doctor', 'staff', 'client')),
      email TEXT UNIQUE,
      email_confirmed BOOLEAN DEFAULT 0,
      temp_password TEXT,
      reset_token TEXT,
      reset_expires TEXT,
      phone TEXT,
      birthDate TEXT,
      gender TEXT,
      specialty TEXT
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER UNIQUE,
      name TEXT NOT NULL,
      gender TEXT,
      birthDate TEXT,
      phone TEXT,
      email TEXT,
      diagnosis TEXT,
      history TEXT,
      allergies TEXT,
      bloodType TEXT,
      weight REAL,
      height INTEGER,
      occupation TEXT,
      marital_status TEXT,
      emergency_contact TEXT,
      insurance_policy TEXT,
      vaccinations TEXT,
      chronic_diseases TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'room'
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS procedures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      default_duration INTEGER DEFAULT 30,
      category TEXT,
      resourceId INTEGER,
      FOREIGN KEY (resourceId) REFERENCES resources(id) ON DELETE SET NULL
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId INTEGER NOT NULL,
      patientName TEXT NOT NULL,
      procedureId INTEGER NOT NULL,
      procedureName TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration INTEGER DEFAULT 30,
      resourceId INTEGER NOT NULL,
      status TEXT DEFAULT 'Назначена' CHECK(status IN ('Назначена', 'Выполнена', 'Не явился')),
      comment TEXT,
      responsibleStaffId INTEGER,
      plan_id INTEGER,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patientId) REFERENCES patients(id) ON DELETE CASCADE,
      FOREIGN KEY (procedureId) REFERENCES procedures(id),
      FOREIGN KEY (resourceId) REFERENCES resources(id),
      FOREIGN KEY (responsibleStaffId) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS treatment_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patientId INTEGER NOT NULL,
      doctorId INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patientId) REFERENCES patients(id),
      FOREIGN KEY (doctorId) REFERENCES users(id)
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS doctor_appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctorId INTEGER NOT NULL,
      patientId INTEGER NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'Назначен',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (doctorId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (patientId) REFERENCES patients(id) ON DELETE CASCADE
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS doctor_schedules (
      doctorId INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slot_duration INTEGER DEFAULT 30,
      FOREIGN KEY (doctorId) REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (doctorId, day_of_week)
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      read BOOLEAN DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS user_procedures (
      user_id INTEGER NOT NULL,
      procedure_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, procedure_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (procedure_id) REFERENCES procedures(id) ON DELETE CASCADE
    )
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    )
  `);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_appointments_resource_date_time ON appointments(resourceId, date, time)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_appointments_patientId ON appointments(patientId)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_user_procedures_user_id ON user_procedures(user_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_appointments_plan_id ON appointments(plan_id)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON treatment_plans(patientId)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_doctor_appointments_doctor_date ON doctor_appointments(doctorId, appointment_date, appointment_time)`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_doctor_appointments_patient ON doctor_appointments(patientId)`);

  console.log('✅ Миграция выполнена');
}
migrate();

// ============ НАСТРОЙКА SMTP ============
let transporter;
async function initTransporter() {
  if (process.env.MAIL_USER && process.env.MAIL_PASS) {
    transporter = nodemailer.createTransport({
      host: 'smtp.mail.ru',
      port: 465,
      secure: true,
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    });
    console.log('✅ SMTP Mail.ru настроен');
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log('✅ Используется тестовый SMTP (ethereal)');
    console.log(`📧 Логин: ${testAccount.user}`);
    console.log(`🔑 Пароль: ${testAccount.pass}`);
  }
}

async function sendVerificationEmail(email, code) {
  if (!transporter) return;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; padding: 20px;"><h2 style="color: #1a6d5e;">Подтверждение регистрации</h2><p>Ваш код подтверждения:</p><h1 style="font-size: 32px; letter-spacing: 4px;">${code}</h1><p>Код действителен в течение 5 минут.</p><hr><small>Медицинская система</small></body></html>`;
  await transporter.sendMail({
    from: `"Медицинская система" <${process.env.MAIL_USER || 'test@ethereal.email'}>`,
    to: email,
    subject: 'Код подтверждения регистрации',
    html,
  });
}

async function sendTempPasswordEmail(email, tempPassword) {
  if (!transporter) return;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; padding: 20px;"><h2 style="color: #1a6d5e;">Добро пожаловать!</h2><p>Ваш временный пароль: <strong>${tempPassword}</strong></p><p>Рекомендуем сменить его после первого входа.</p><hr><small>Медицинская система</small></body></html>`;
  await transporter.sendMail({
    from: `"Медицинская система" <${process.env.MAIL_USER || 'test@ethereal.email'}>`,
    to: email,
    subject: 'Временный пароль для доступа',
    html,
  });
}

const verifiedEmails = new Map();
const MAX_ATTEMPTS = 3;
const CODE_EXPIRY_MINUTES = 5;

// ============ GIGACHAT CLIENT ============
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
let gigachatClient = null;
async function initGigaChat() {
  const credentials = process.env.GIGACHAT_CREDENTIALS;
  const scope = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
  if (!credentials) {
    console.warn('⚠️ GIGACHAT_CREDENTIALS не заданы. AI-помощник недоступен.');
    return;
  }
  try {
    gigachatClient = new GigaChat({
      credentials: credentials,
      model: 'GigaChat-Pro',
      httpsAgent: httpsAgent,
      scope: scope,
    });
    console.log(`✅ GigaChat клиент инициализирован (scope: ${scope})`);
  } catch (err) {
    console.error('❌ Ошибка инициализации GigaChat:', err.message);
  }
}

// ============ РЕГИСТРАЦИЯ И АВТОРИЗАЦИЯ ============
app.post('/api/send-verification-code', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email обязателен' });
  try {
    const existing = await getQuery(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existing) return res.status(400).json({ error: 'Email уже зарегистрирован' });
    await runQuery(`DELETE FROM email_verifications WHERE email = ?`, [email]);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
    await runQuery(`INSERT INTO email_verifications (email, code, attempts, expires_at) VALUES (?, ?, 0, ?)`, [email, code, expiresAt]);
    await sendVerificationEmail(email, code);
    res.json({ success: true, message: 'Код отправлен на email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка отправки кода' });
  }
});

app.post('/api/verify-code', async (req, res) => {
  const { email, code } = req.body;
  try {
    const record = await getQuery(`SELECT * FROM email_verifications WHERE email = ? AND code = ? AND expires_at > datetime('now')`, [email, code]);
    if (!record) {
      await runQuery(`UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?`, [email]);
      const attemptsRow = await getQuery(`SELECT attempts FROM email_verifications WHERE email = ?`, [email]);
      if (attemptsRow && attemptsRow.attempts >= MAX_ATTEMPTS) {
        await runQuery(`DELETE FROM email_verifications WHERE email = ?`, [email]);
        return res.status(400).json({ error: 'Превышено число попыток. Запросите новый код.' });
      }
      return res.status(400).json({ error: 'Неверный или просроченный код' });
    }
    await runQuery(`DELETE FROM email_verifications WHERE email = ?`, [email]);
    const token = crypto.randomBytes(32).toString('hex');
    verifiedEmails.set(token, email);
    setTimeout(() => verifiedEmails.delete(token), 10 * 60 * 1000);
    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка проверки кода' });
  }
});

app.post('/api/complete-registration', async (req, res) => {
  const { token, name, gender, birthDate, phone, password } = req.body;
  const email = verifiedEmails.get(token);
  if (!email) return res.status(400).json({ error: 'Токен недействителен или истёк' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await runQuery(
      `INSERT INTO users (name, login, password, role, email, email_confirmed, phone, birthDate, gender) VALUES (?, ?, ?, 'client', ?, 1, ?, ?, ?)`,
      [name, email, hashedPassword, email, phone, birthDate, gender]
    );
    await runQuery(
      `INSERT INTO patients (userId, name, gender, birthDate, phone, email) VALUES (?, ?, ?, ?, ?, ?)`,
      [result.lastID, name, gender, birthDate, phone, email]
    );
    verifiedEmails.delete(token);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка завершения регистрации' });
  }
});

app.post('/api/login', async (req, res) => {
  const { login, password } = req.body;
  try {
    const user = await getQuery(`SELECT id, name, role, email_confirmed, password FROM users WHERE login = ? OR email = ?`, [login, login]);
    if (!user) return res.json({ success: false, message: 'Неверный логин или пароль' });
    if (user.role === 'client' && !user.email_confirmed) {
      return res.json({ success: false, message: 'Подтвердите email перед входом' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.json({ success: false, message: 'Неверный логин или пароль' });
    res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ОБЩИЕ API ============
app.get('/api/stats', async (req, res) => {
  try {
    const totalPatients = await getQuery(`SELECT COUNT(*) as count FROM patients`);
    const totalAppointments = await getQuery(`SELECT COUNT(*) as count FROM appointments`);
    const completed = await getQuery(`SELECT COUNT(*) as count FROM appointments WHERE status = 'Выполнена'`);
    const missed = await getQuery(`SELECT COUNT(*) as count FROM appointments WHERE status = 'Не явился'`);
    const scheduled = await getQuery(`SELECT COUNT(*) as count FROM appointments WHERE status = 'Назначена'`);
    const total = totalAppointments.count;
    res.json({
      totalPatients: totalPatients.count,
      totalAppointments: total,
      completed: completed.count,
      missed: missed.count,
      scheduled: scheduled.count,
      completionRate: total > 0 ? ((completed.count / total) * 100).toFixed(1) : 0
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const appointments = await allQuery(`SELECT * FROM appointments ORDER BY date DESC, time`);
    res.json(appointments);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const notifs = await allQuery(`SELECT * FROM notifications ORDER BY createdAt DESC`);
    res.json(notifs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ПОЛЬЗОВАТЕЛИ (админка) ============
app.get('/api/users', requireRole('admin'), async (req, res) => {
  try { const users = await allQuery(`SELECT id, name, login, role, specialty FROM users`); res.json(users); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/users', requireRole('admin'), async (req, res) => {
  const { name, login, password, role, specialty } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await runQuery(`INSERT INTO users (name, login, password, role, specialty) VALUES (?,?,?,?,?)`, [name, login, hashed, role, specialty || null]);
    res.json({ id: result.lastID, name, login, role, specialty });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/users/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, login, password, role, specialty } = req.body;
  try {
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await runQuery(`UPDATE users SET name=?, login=?, password=?, role=?, specialty=? WHERE id=?`, [name, login, hashed, role, specialty || null, id]);
    } else {
      await runQuery(`UPDATE users SET name=?, login=?, role=?, specialty=? WHERE id=?`, [name, login, role, specialty || null, id]);
    }
    res.json({ id, name, login, role, specialty });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try { await runQuery(`DELETE FROM users WHERE id = ?`, [id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ПАЦИЕНТЫ ============
app.get('/api/patients', async (req, res) => {
  try {
    const patients = await allQuery(`SELECT * FROM patients`);
    res.json(patients);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/patients/:id', async (req, res) => {
  try {
    const patient = await getQuery(`SELECT * FROM patients WHERE id = ?`, [req.params.id]);
    if (patient) res.json(patient);
    else res.status(404).json({ error: 'Пациент не найден' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/patients', async (req, res) => {
  const p = req.body;
  console.log('📝 Создание/обновление пациента:', p);
  try {
    if (p.id) {
      await runQuery(`UPDATE patients SET name=?, gender=?, birthDate=?, phone=?, email=?, diagnosis=?, history=?, allergies=?, bloodType=?, weight=?, height=?, occupation=?, marital_status=?, emergency_contact=?, insurance_policy=?, vaccinations=?, chronic_diseases=? WHERE id=?`,
        [p.name, p.gender, p.birthDate, p.phone, p.email, p.diagnosis, p.history, p.allergies, p.bloodType, p.weight, p.height, p.occupation, p.marital_status, p.emergency_contact, p.insurance_policy, p.vaccinations, p.chronic_diseases, p.id]);
      return res.json(p);
    }
    let userId = null;
    let isNewUser = false;
    if (p.email && p.email.trim() !== '') {
      const existingPatient = await getQuery(`SELECT id FROM patients WHERE email = ?`, [p.email]);
      if (existingPatient) {
        await runQuery(`UPDATE patients SET name=?, gender=?, birthDate=?, phone=?, diagnosis=?, history=?, allergies=?, bloodType=?, weight=?, height=?, occupation=?, marital_status=?, emergency_contact=?, insurance_policy=?, vaccinations=?, chronic_diseases=? WHERE id=?`,
          [p.name, p.gender, p.birthDate, p.phone, p.diagnosis, p.history, p.allergies, p.bloodType, p.weight, p.height, p.occupation, p.marital_status, p.emergency_contact, p.insurance_policy, p.vaccinations, p.chronic_diseases, existingPatient.id]);
        return res.json({ ...p, id: existingPatient.id });
      }
      const existingUser = await getQuery(`SELECT id, role FROM users WHERE email = ?`, [p.email]);
      if (existingUser) {
        if (existingUser.role !== 'client') {
          return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован как сотрудник. Используйте другой email.' });
        }
        userId = existingUser.id;
        console.log(`🔗 Связываем пациента с существующим пользователем id=${userId}`);
      } else {
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        const result = await runQuery(
          `INSERT INTO users (name, login, password, role, email, email_confirmed, phone, birthDate, gender) VALUES (?, ?, ?, 'client', ?, 1, ?, ?, ?)`,
          [p.name, p.email, hashedPassword, p.email, p.phone || '', p.birthDate || '', p.gender || '']
        );
        userId = result.lastID;
        isNewUser = true;
        console.log(`✅ Создан новый пользователь id=${userId}, роль client`);
        await runQuery(`UPDATE users SET role = 'client' WHERE id = ?`, [userId]);
        await sendTempPasswordEmail(p.email, tempPassword);
      }
    }
    if (userId) {
      const existingPatientByUserId = await getQuery(`SELECT id FROM patients WHERE userId = ?`, [userId]);
      if (existingPatientByUserId) {
        await runQuery(`UPDATE patients SET name=?, gender=?, birthDate=?, phone=?, email=?, diagnosis=?, history=?, allergies=?, bloodType=?, weight=?, height=?, occupation=?, marital_status=?, emergency_contact=?, insurance_policy=?, vaccinations=?, chronic_diseases=? WHERE userId=?`,
          [p.name, p.gender, p.birthDate, p.phone, p.email, p.diagnosis, p.history, p.allergies, p.bloodType, p.weight, p.height, p.occupation, p.marital_status, p.emergency_contact, p.insurance_policy, p.vaccinations, p.chronic_diseases, userId]);
        return res.json({ ...p, userId });
      }
    }
    const result = await runQuery(
      `INSERT INTO patients (userId, name, gender, birthDate, phone, email, diagnosis, history, allergies, bloodType, weight, height, occupation, marital_status, emergency_contact, insurance_policy, vaccinations, chronic_diseases) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, p.name, p.gender, p.birthDate, p.phone, p.email, p.diagnosis, p.history, p.allergies, p.bloodType, p.weight, p.height, p.occupation, p.marital_status, p.emergency_contact, p.insurance_policy, p.vaccinations, p.chronic_diseases]
    );
    const response = { ...p, id: result.lastID, userId };
    if (isNewUser) response.passwordSent = true;
    console.log(`💾 Пациент сохранён, id=${result.lastID}, userId=${userId}`);
    res.json(response);
  } catch (err) {
    console.error('❌ Ошибка при создании пациента:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера: ' + err.message });
  }
});
app.delete('/api/patients/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try { await runQuery(`DELETE FROM patients WHERE id = ?`, [id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ПРОЦЕДУРЫ ============
app.get('/api/procedures', async (req, res) => {
  try { const procedures = await allQuery(`SELECT * FROM procedures ORDER BY name`); res.json(procedures); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/procedures', requireRole('admin'), async (req, res) => {
  const { name, default_duration, category, resourceId } = req.body;
  if (!name) return res.status(400).json({ error: 'Название процедуры обязательно' });
  try {
    const result = await runQuery(`INSERT INTO procedures (name, default_duration, category, resourceId) VALUES (?, ?, ?, ?)`, [name, default_duration || 30, category || '', resourceId || null]);
    res.json({ id: result.lastID, name, default_duration: default_duration || 30, category: category || '', resourceId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/procedures/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, default_duration, category, resourceId } = req.body;
  try {
    await runQuery(`UPDATE procedures SET name=?, default_duration=?, category=?, resourceId=? WHERE id=?`, [name, default_duration, category, resourceId || null, id]);
    res.json({ id, name, default_duration, category, resourceId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/procedures/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const used = await getQuery(`SELECT COUNT(*) as count FROM appointments WHERE procedureId = ?`, [id]);
    if (used.count > 0) return res.status(409).json({ error: 'Невозможно удалить: процедура используется в назначениях' });
    await runQuery(`DELETE FROM procedures WHERE id = ?`, [id]); res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ РЕСУРСЫ ============
app.get('/api/resources', async (req, res) => {
  try { const resources = await allQuery(`SELECT * FROM resources ORDER BY name`); res.json(resources); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/resources', requireRole('admin'), async (req, res) => {
  const { name, type } = req.body;
  if (!name) return res.status(400).json({ error: 'Название ресурса обязательно' });
  try { const result = await runQuery(`INSERT INTO resources (name, type) VALUES (?, ?)`, [name, type || 'room']); res.json({ id: result.lastID, name, type: type || 'room' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/resources/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, type } = req.body;
  try { await runQuery(`UPDATE resources SET name=?, type=? WHERE id=?`, [name, type, id]); res.json({ id, name, type }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/resources/:id', requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const used = await getQuery(`SELECT COUNT(*) as count FROM appointments WHERE resourceId = ?`, [id]);
    if (used.count > 0) return res.status(409).json({ error: 'Невозможно удалить: ресурс используется в назначениях' });
    await runQuery(`DELETE FROM resources WHERE id = ?`, [id]); res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ НАЗНАЧЕНИЯ (CRUD, batch, attendance, слоты) ============
app.post('/api/appointments', async (req, res) => {
  const { patientId, patientName, procedureId, procedureName, date, time, duration, resourceId, status, comment, responsibleStaffId } = req.body;
  try {
    const conflict = await getQuery(`SELECT id FROM appointments WHERE resourceId = ? AND date = ? AND time = ?`, [resourceId, date, time]);
    if (conflict) return res.status(409).json({ error: 'Ресурс уже занят', conflict: true });
    if (responsibleStaffId) {
      const canPerform = await getQuery(`SELECT * FROM user_procedures WHERE user_id = ? AND procedure_id = ?`, [responsibleStaffId, procedureId]);
      if (!canPerform) return res.status(400).json({ error: 'Сотрудник не может выполнять эту процедуру' });
    }
    const result = await runQuery(
      `INSERT INTO appointments (patientId, patientName, procedureId, procedureName, date, time, duration, resourceId, status, comment, responsibleStaffId, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      [patientId, patientName, procedureId, procedureName, date, time, duration, resourceId, status || 'Назначена', comment || '', responsibleStaffId || null]
    );
    await runQuery(`INSERT INTO notifications (message, read, createdAt) VALUES (?,0,datetime('now'))`, [`Назначена процедура "${procedureName}" для ${patientName} на ${date} ${time}`]);
    res.json({ id: result.lastID, patientId, patientName, procedureId, procedureName, date, time, duration, resourceId, status: status || 'Назначена', comment: comment || '', responsibleStaffId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/appointments/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  try {
    const fields = []; const values = [];
    for (const [key, val] of Object.entries(updates)) { fields.push(`${key} = ?`); values.push(val); }
    values.push(id);
    await runQuery(`UPDATE appointments SET ${fields.join(', ')} WHERE id = ?`, values);
    res.json({ id, ...updates });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/appointments/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try { await runQuery(`DELETE FROM appointments WHERE id = ?`, [id]); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/appointments/batch', async (req, res) => {
  const { appointments } = req.body;
  if (!Array.isArray(appointments) || appointments.length === 0) return res.status(400).json({ error: 'Необходимо передать массив appointments' });
  const results = [];
  for (const appt of appointments) {
    try {
      const conflict = await getQuery(`SELECT id FROM appointments WHERE resourceId = ? AND date = ? AND time = ?`, [appt.resourceId, appt.date, appt.time]);
      if (conflict) { results.push({ ...appt, success: false, error: 'Конфликт: ресурс уже занят' }); continue; }
      if (appt.responsibleStaffId) {
        const canPerform = await getQuery(`SELECT * FROM user_procedures WHERE user_id = ? AND procedure_id = ?`, [appt.responsibleStaffId, appt.procedureId]);
        if (!canPerform) { results.push({ ...appt, success: false, error: 'Сотрудник не может выполнять эту процедуру' }); continue; }
      }
      const result = await runQuery(
        `INSERT INTO appointments (patientId, patientName, procedureId, procedureName, date, time, duration, resourceId, status, comment, responsibleStaffId, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
        [appt.patientId, appt.patientName, appt.procedureId, appt.procedureName, appt.date, appt.time, appt.duration, appt.resourceId, appt.status || 'Назначена', appt.comment || '', appt.responsibleStaffId || null]
      );
      await runQuery(`INSERT INTO notifications (message, read, createdAt) VALUES (?,0,datetime('now'))`, [`Назначена процедура "${appt.procedureName}" для ${appt.patientName} на ${appt.date} ${appt.time}`]);
      results.push({ id: result.lastID, ...appt, success: true });
    } catch (err) { results.push({ ...appt, success: false, error: err.message }); }
  }
  res.json({ results });
});

app.post('/api/attendance', async (req, res) => {
  const { appointmentId, status, comment } = req.body;
  try {
    await runQuery(`UPDATE appointments SET status = ?, comment = ? WHERE id = ?`, [status, comment, appointmentId]);
    const appt = await getQuery(`SELECT procedureName, patientName FROM appointments WHERE id = ?`, [appointmentId]);
    if (appt) {
      await runQuery(`INSERT INTO notifications (message, read, createdAt) VALUES (?,0,datetime('now'))`, [`Статус процедуры "${appt.procedureName}" для ${appt.patientName} изменён на "${status}"`]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auto-slot', async (req, res) => {
  const { resourceId, date } = req.body;
  const timeSlots = [];
  for (let h = 8; h <= 17; h++) for (let m = 0; m < 60; m += 30) if (!(h === 17 && m > 0)) timeSlots.push(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`);
  try {
    const busy = await allQuery(`SELECT time FROM appointments WHERE resourceId = ? AND date = ?`, [resourceId, date]);
    const busyTimes = busy.map(b => b.time);
    const freeSlots = timeSlots.filter(slot => !busyTimes.includes(slot));
    res.json({ slot: freeSlots[0] || null, availableSlots: freeSlots });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/free-slots', async (req, res) => {
  const { resourceId, date } = req.query;
  if (!resourceId || !date) return res.status(400).json({ error: 'Не указан resourceId или date' });
  const allSlots = [];
  for (let h = 8; h <= 17; h++) for (let m = 0; m < 60; m += 30) if (!(h === 17 && m > 0)) allSlots.push(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`);
  try {
    const busy = await allQuery(`SELECT time FROM appointments WHERE resourceId = ? AND date = ?`, [resourceId, date]);
    const busyTimes = busy.map(b => b.time);
    const freeSlots = allSlots.filter(slot => !busyTimes.includes(slot));
    res.json({ freeSlots });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/find-free-slot', async (req, res) => {
  const { resourceId, date, time, duration = 30, excludeWeekends = false } = req.body;
  if (!resourceId || !date) return res.status(400).json({ error: 'Не указан ресурс или дата' });
  const allSlots = [];
  for (let h = 8; h <= 17; h++) for (let m = 0; m < 60; m += 30) if (!(h === 17 && m > 0)) allSlots.push(`${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`);
  let currentDate = new Date(date);
  let attempts = 0;
  const maxAttempts = 14;
  while (attempts < maxAttempts) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const busy = await allQuery(`SELECT time FROM appointments WHERE resourceId = ? AND date = ?`, [resourceId, dateStr]);
    const busyTimes = busy.map(b => b.time);
    const freeSlots = allSlots.filter(slot => !busyTimes.includes(slot));
    let foundSlot = null;
    for (let slot of freeSlots) {
      if (slot >= time) { foundSlot = slot; break; }
    }
    if (foundSlot) return res.json({ success: true, date: dateStr, time: foundSlot, availableSlots: freeSlots });
    currentDate.setDate(currentDate.getDate() + 1);
    if (excludeWeekends) while (currentDate.getDay() === 0 || currentDate.getDay() === 6) currentDate.setDate(currentDate.getDate() + 1);
    attempts++;
  }
  res.json({ success: false, message: 'Не удалось найти свободный слот в ближайшие две недели' });
});

// ============ СВЯЗЬ МЕДПЕРСОНАЛ - ПРОЦЕДУРЫ ============
app.get('/api/user-procedures/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  try { const procedures = await allQuery(`SELECT p.id, p.name, p.default_duration, p.resourceId FROM procedures p JOIN user_procedures up ON p.id = up.procedure_id WHERE up.user_id = ?`, [userId]); res.json(procedures); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/user-procedures/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { procedureIds } = req.body;
  try {
    await runQuery(`DELETE FROM user_procedures WHERE user_id = ?`, [userId]);
    for (let procId of procedureIds) await runQuery(`INSERT INTO user_procedures (user_id, procedure_id) VALUES (?, ?)`, [userId, procId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/staff-with-procedures', async (req, res) => {
  try {
    const staff = await allQuery(`SELECT id, name FROM users WHERE role = 'staff'`);
    for (let s of staff) {
      const procs = await allQuery(`SELECT p.id, p.name FROM procedures p JOIN user_procedures up ON p.id = up.procedure_id WHERE up.user_id = ?`, [s.id]);
      s.procedures = procs;
    }
    res.json(staff);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/get-responsible-staff/:procedureId', async (req, res) => {
  const procedureId = parseInt(req.params.procedureId);
  try {
    const staff = await getQuery(`SELECT u.id, u.name FROM users u JOIN user_procedures up ON u.id = up.user_id WHERE u.role = 'staff' AND up.procedure_id = ? LIMIT 1`, [procedureId]);
    staff ? res.json({ id: staff.id, name: staff.name }) : res.json({ id: null, error: 'Нет доступного персонала' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ КЛИЕНТСКИЕ API (с resourceName) ============
app.get('/api/client/profile', async (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    const client = await getQuery(`SELECT id, name, email, phone, birthDate, gender FROM users WHERE id = ? AND role = 'client'`, [userId]);
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });
    res.json(client);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/client/profile', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { name, phone, birthDate, gender } = req.body;
  try {
    await runQuery(`UPDATE users SET name = ?, phone = ?, birthDate = ?, gender = ? WHERE id = ? AND role = 'client'`, [name, phone, birthDate, gender, userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/client/change-password', async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { oldPassword, newPassword } = req.body;
  try {
    const user = await getQuery(`SELECT password FROM users WHERE id = ?`, [userId]);
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) return res.status(400).json({ error: 'Неверный старый пароль' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await runQuery(`UPDATE users SET password = ? WHERE id = ?`, [hashed, userId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/client/medcard', async (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    const patient = await getQuery(`SELECT * FROM patients WHERE userId = ?`, [userId]);
    if (!patient) return res.json({});
    res.json(patient);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/client/appointments', async (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    const patient = await getQuery(`SELECT id FROM patients WHERE userId = ?`, [userId]);
    if (!patient) return res.json([]);
    const apps = await allQuery(`
      SELECT a.*, r.name as resourceName 
      FROM appointments a
      LEFT JOIN resources r ON a.resourceId = r.id
      WHERE a.patientId = ? 
      ORDER BY a.date DESC, a.time
    `, [patient.id]);
    res.json(apps);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/appointments/patient/:patientId', async (req, res) => {
  const patientId = parseInt(req.params.patientId);
  try {
    const apps = await allQuery(`
      SELECT a.*, r.name as resourceName 
      FROM appointments a
      LEFT JOIN resources r ON a.resourceId = r.id
      WHERE a.patientId = ? 
      ORDER BY a.date DESC, a.time
    `, [patientId]);
    res.json(apps);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ВРАЧ: КЛИЕНТЫ ============
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await allQuery(`SELECT id, name, email FROM users WHERE role = 'client' AND email_confirmed = 1`);
    res.json(clients);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/doctor/add-patient', async (req, res) => {
  const { name, email, phone, birthDate, gender } = req.body;
  try {
    const existing = await getQuery(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existing) return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashed = await bcrypt.hash(tempPassword, 10);
    const result = await runQuery(
      `INSERT INTO users (name, login, password, role, email, email_confirmed, temp_password, phone, birthDate, gender) VALUES (?, ?, ?, 'client', ?, 1, ?, ?, ?, ?)`,
      [name, email, hashed, email, tempPassword, phone, birthDate, gender]
    );
    await runQuery(`INSERT INTO patients (userId, name, gender, birthDate, phone, email) VALUES (?, ?, ?, ?, ?, ?)`, [result.lastID, name, gender, birthDate, phone, email]);
    await sendVerificationEmail(email, `Ваш временный пароль: ${tempPassword}\nРекомендуем сменить его при первом входе.`);
    res.json({ success: true, message: 'Пациент добавлен, пароль отправлен на email' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ПЛАНЫ ЛЕЧЕНИЯ (с resourceName) ============
app.get('/api/client/treatment-plans', requireRole('client'), async (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    const patient = await getQuery(`SELECT id FROM patients WHERE userId = ?`, [userId]);
    if (!patient) return res.json([]);
    const plans = await allQuery(`
      SELECT tp.*, u.name as doctor_name 
      FROM treatment_plans tp
      JOIN users u ON tp.doctorId = u.id
      WHERE tp.patientId = ? 
      ORDER BY tp.start_date DESC
    `, [patient.id]);
    for (let plan of plans) {
      const procedures = await allQuery(`
        SELECT a.id, a.procedureName, a.date, a.time, a.status, r.name as resourceName
        FROM appointments a
        LEFT JOIN resources r ON a.resourceId = r.id
        WHERE a.plan_id = ? 
        ORDER BY a.date, a.time
      `, [plan.id]);
      plan.procedures = procedures;
      const total = procedures.length;
      const completed = procedures.filter(p => p.status === 'Выполнена').length;
      plan.progress = total ? Math.round(completed / total * 100) : 0;
    }
    res.json(plans);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ============ ОТМЕНА, ПЕРЕНОС, ОТМЕТКА ВЫПОЛНЕНИЯ (клиент) ============
app.put('/api/client/complete-procedure/:appointmentId', requireRole('client'), async (req, res) => {
  const appointmentId = parseInt(req.params.appointmentId);
  const userId = req.headers['x-user-id'];
  try {
    const patient = await getQuery(`SELECT id FROM patients WHERE userId = ?`, [userId]);
    const appointment = await getQuery(`SELECT id, status, patientId FROM appointments WHERE id = ? AND patientId = ?`, [appointmentId, patient?.id]);
    if (!appointment) return res.status(404).json({ error: 'Процедура не найдена' });
    if (appointment.status !== 'Назначена') return res.status(400).json({ error: 'Нельзя отметить уже выполненную или пропущенную процедуру' });
    await runQuery(`UPDATE appointments SET status = 'Выполнена' WHERE id = ?`, [appointmentId]);
    await runQuery(`INSERT INTO notifications (message, read, createdAt) VALUES (?,0,datetime('now'))`, [`Пациент отметил процедуру #${appointmentId} как выполненную`]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/client/appointments/:id', requireRole('client'), async (req, res) => {
  const id = parseInt(req.params.id);
  const userId = req.headers['x-user-id'];
  try {
    const patient = await getQuery(`SELECT id FROM patients WHERE userId = ?`, [userId]);
    const app = await getQuery(`SELECT id, date, time, patientName, procedureName FROM appointments WHERE id = ? AND patientId = ?`, [id, patient?.id]);
    if (!app) return res.status(404).json({ error: 'Запись не найдена' });
    const [hour, minute] = app.time.split(':').map(Number);
    const appDateTime = moment.tz(`${app.date} ${app.time}`, 'YYYY-MM-DD HH:mm', process.env.TIMEZONE || 'Europe/Moscow');
    if (appDateTime.diff(moment(), 'hours') < 2) {
      return res.status(400).json({ error: 'Отмена возможна не позднее чем за 2 часа до процедуры' });
    }
    await runQuery(`DELETE FROM appointments WHERE id = ?`, [id]);
    await runQuery(`INSERT INTO notifications (message, read, createdAt) VALUES (?,0,datetime('now'))`, [`Клиент ${app.patientName} отменил процедуру "${app.procedureName}" на ${app.date} ${app.time}`]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/client/reschedule-appointment/:id', requireRole('client'), async (req, res) => {
  const id = parseInt(req.params.id);
  const userId = req.headers['x-user-id'];
  const { newDate, newTime } = req.body;
  try {
    const patient = await getQuery(`SELECT id FROM patients WHERE userId = ?`, [userId]);
    const app = await getQuery(`SELECT id, resourceId, duration, patientName, procedureName FROM appointments WHERE id = ? AND patientId = ?`, [id, patient?.id]);
    if (!app) return res.status(404).json({ error: 'Запись не найдена' });
    const conflict = await getQuery(`SELECT id FROM appointments WHERE resourceId = ? AND date = ? AND time = ? AND id != ?`, [app.resourceId, newDate, newTime, id]);
    if (conflict) return res.status(409).json({ error: 'Выбранное время уже занято', conflict: true });
    await runQuery(`UPDATE appointments SET date = ?, time = ? WHERE id = ?`, [newDate, newTime, id]);
    await runQuery(`INSERT INTO notifications (message, read, createdAt) VALUES (?,0,datetime('now'))`, [`Клиент ${app.patientName} перенёс процедуру "${app.procedureName}" на ${newDate} ${newTime}`]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ============ ЗАПИСЬ К ВРАЧУ (С ФИЛЬТРОМ ПО СПЕЦИАЛЬНОСТИ) ============
app.get('/api/doctors', async (req, res) => {
  const { specialty } = req.query;
  let sql = `SELECT id, name, email, phone, specialty FROM users WHERE role = 'doctor' AND email_confirmed = 1`;
  let params = [];
  if (specialty && specialty !== 'all') {
    sql += ` AND specialty = ?`;
    params.push(specialty);
  }
  sql += ` ORDER BY name`;
  try {
    const doctors = await allQuery(sql, params);
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/doctor-specialties', async (req, res) => {
  try {
    const specialties = await allQuery(`SELECT DISTINCT specialty FROM users WHERE role = 'doctor' AND specialty IS NOT NULL AND specialty != '' ORDER BY specialty`);
    res.json(specialties.map(s => s.specialty));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/doctor-free-slots', async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) {
    return res.status(400).json({ error: 'doctorId и date обязательны' });
  }
  const today = new Date().toISOString().split('T')[0];
  if (date < today) {
    return res.status(400).json({ error: 'Нельзя записаться на прошедшую дату' });
  }
  // Рабочие часы 9:00-17:00, перерыв 13:00-14:00, слоты 30 мин
  const workStart = 9;
  const workEnd = 17;
  const lunchStart = 13;
  const lunchEnd = 14;
  const slotDuration = 30;
  let slots = [];
  for (let h = workStart; h < workEnd; h++) {
    for (let m = 0; m < 60; m += slotDuration) {
      if (h === lunchStart && m >= 0) continue;
      if (h === lunchEnd && m === 0) break;
      const time = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
      slots.push(time);
    }
  }
  const busy = await allQuery(
    `SELECT appointment_time FROM doctor_appointments WHERE doctorId = ? AND appointment_date = ?`,
    [doctorId, date]
  );
  const busyTimes = busy.map(b => b.appointment_time);
  const freeSlots = slots.filter(slot => !busyTimes.includes(slot));
  res.json({ freeSlots });
});

app.post('/api/doctor-appointments', requireRole('client'), async (req, res) => {
  const userId = req.headers['x-user-id'];
  const { doctorId, appointment_date, appointment_time, reason } = req.body;
  if (!doctorId || !appointment_date || !appointment_time) {
    return res.status(400).json({ error: 'Не все поля заполнены' });
  }
  try {
    const patient = await getQuery(`SELECT id FROM patients WHERE userId = ?`, [userId]);
    if (!patient) return res.status(404).json({ error: 'Пациент не найден' });
    const doctor = await getQuery(`SELECT id FROM users WHERE id = ? AND role = 'doctor'`, [doctorId]);
    if (!doctor) return res.status(404).json({ error: 'Врач не найден' });
    const today = new Date().toISOString().split('T')[0];
    if (appointment_date < today) {
      return res.status(400).json({ error: 'Нельзя записаться на прошедшую дату' });
    }
    const conflict = await getQuery(
      `SELECT id FROM doctor_appointments WHERE doctorId = ? AND appointment_date = ? AND appointment_time = ?`,
      [doctorId, appointment_date, appointment_time]
    );
    if (conflict) {
      return res.status(409).json({ error: 'Это время уже занято', conflict: true });
    }
    const [hour, minute] = appointment_time.split(':').map(Number);
    if (hour < 9 || hour > 16 || (hour === 16 && minute > 30) || (hour === 13 && minute < 60)) {
      return res.status(400).json({ error: 'Выбранное время вне рабочего диапазона врача' });
    }
    const result = await runQuery(
      `INSERT INTO doctor_appointments (doctorId, patientId, appointment_date, appointment_time, reason) VALUES (?, ?, ?, ?, ?)`,
      [doctorId, patient.id, appointment_date, appointment_time, reason || '']
    );
    const doctorName = await getQuery(`SELECT name FROM users WHERE id = ?`, [doctorId]);
    const patientName = await getQuery(`SELECT name FROM patients WHERE id = ?`, [patient.id]);
    await runQuery(
      `INSERT INTO notifications (message, read, createdAt) VALUES (?, 0, datetime('now'))`,
      [`Клиент ${patientName.name} записался к врачу ${doctorName.name} на ${appointment_date} ${appointment_time}`]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/client/doctor-appointments', requireRole('client'), async (req, res) => {
  const userId = req.headers['x-user-id'];
  try {
    const patient = await getQuery(`SELECT id FROM patients WHERE userId = ?`, [userId]);
    if (!patient) return res.json([]);
    const appointments = await allQuery(`
      SELECT da.*, u.name as doctor_name
      FROM doctor_appointments da
      JOIN users u ON da.doctorId = u.id
      WHERE da.patientId = ?
      ORDER BY da.appointment_date DESC, da.appointment_time
    `, [patient.id]);
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ EMAIL НАПОМИНАНИЯ (CRON) ============
async function sendReminderEmail(email, name, procedure, date, time, when) {
  if (!transporter) return;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Напоминание о процедуре</h2><p>Уважаемый(ая) ${name},</p><p>Напоминаем, что <strong>${when}</strong> у вас запланирована процедура:</p><p><strong>${procedure}</strong><br>${date} в ${time}</p><p>Пожалуйста, не опаздывайте.</p><hr><small>Медицинская система</small></body></html>`;
  await transporter.sendMail({
    from: `"Медицинская система" <${process.env.MAIL_USER || 'test@ethereal.email'}>`,
    to: email,
    subject: `Напоминание: ${procedure} ${when}`,
    html
  });
}

async function sendAppointmentReminders() {
  if (!transporter) {
    console.warn('SMTP не настроен, напоминания не отправляются');
    return;
  }
  const timezone = process.env.TIMEZONE || 'Europe/Moscow';
  const now = moment().tz(timezone);
  const tomorrow = now.clone().add(1, 'day').startOf('day');
  const inOneHour = now.clone().add(1, 'hour');
  try {
    const tomorrowStr = tomorrow.format('YYYY-MM-DD');
    const dayBeforeApps = await allQuery(`
      SELECT a.*, u.email, u.name as user_name 
      FROM appointments a
      JOIN patients p ON a.patientId = p.id
      JOIN users u ON p.userId = u.id
      WHERE a.date = ? AND a.status = 'Назначена'
    `, [tomorrowStr]);
    for (const app of dayBeforeApps) {
      await sendReminderEmail(app.email, app.user_name, app.procedureName, app.date, app.time, 'завтра');
    }
    const inOneHourStr = inOneHour.format('YYYY-MM-DD');
    const oneHourTime = inOneHour.format('HH:mm');
    const hourBeforeApps = await allQuery(`
      SELECT a.*, u.email, u.name as user_name 
      FROM appointments a
      JOIN patients p ON a.patientId = p.id
      JOIN users u ON p.userId = u.id
      WHERE a.date = ? AND a.time = ? AND a.status = 'Назначена'
    `, [inOneHourStr, oneHourTime]);
    for (const app of hourBeforeApps) {
      await sendReminderEmail(app.email, app.user_name, app.procedureName, app.date, app.time, 'через час');
    }
  } catch(err) {
    console.error('Ошибка при отправке напоминаний:', err);
  }
}

cron.schedule('0 * * * *', () => {
  console.log('🕒 Запуск отправки email-напоминаний...');
  sendAppointmentReminders();
});

// ============ AI ПОМОЩНИК (GigaChat) ============
app.post('/api/client/ai-chat', requireRole('client'), async (req, res) => {
  if (!gigachatClient) {
    return res.status(503).json({ error: 'AI-помощник временно недоступен' });
  }
  const { message, history = [] } = req.body;
  const userId = req.headers['x-user-id'];
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Сообщение не может быть пустым' });
  }
  try {
    const patient = await getQuery(`
      SELECT p.* FROM patients p
      JOIN users u ON p.userId = u.id
      WHERE u.id = ?
    `, [userId]);
    const appointments = await allQuery(`
      SELECT procedureName, date, time, status
      FROM appointments
      WHERE patientId = ?
        AND date >= date('now')
      ORDER BY date ASC
      LIMIT 5
    `, [patient?.id]);
    const systemPrompt = `Ты — полезный и дружелюбный медицинский помощник клиники.
Используй эту информацию о пациенте:
- Имя: ${patient?.name || 'клиент'}
- Диагноз: ${patient?.diagnosis || 'не указан'}
- Аллергии: ${patient?.allergies || 'неизвестны'}
- Ближайшие процедуры:
${appointments.map(a => `  * ${a.date} ${a.time}: ${a.procedureName} (${a.status})`).join('\n') || '  * Нет запланированных процедур'}
Правила:
1. Никогда не ставь медицинские диагнозы и не назначай лечение. При серьёзных симптомах направляй к врачу.
2. Отвечай вежливо и по существу, ссылаясь на предоставленную информацию, если это уместно.
3. Если информации недостаточно, честно скажи об этом и предложи обратиться к администратору или врачу.
4. Отвечай на русском языке, кратко и понятно.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(turn => ({ role: turn.role === 'user' ? 'user' : 'assistant', content: turn.content })),
      { role: 'user', content: message }
    ];
    const response = await gigachatClient.chat({ messages });
    const answer = response.choices[0]?.message?.content || "Извините, я не смог сформулировать ответ.";
    res.json({ success: true, answer });
  } catch (err) {
    console.error('Ошибка GigaChat:', err);
    res.status(500).json({ error: 'Ошибка при обращении к AI-помощнику' });
  }
});

// ============ ЗАПУСК СЕРВЕРА ============
async function startServer() {
  await initTransporter();
  await initGigaChat();
  app.listen(PORT, () => {
    console.log(`🏥 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📋 Логин: admin / admin123 | doctor / doc123 | staff / staff123`);
  });
}
startServer();