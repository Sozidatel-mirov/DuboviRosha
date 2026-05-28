const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'healthcare.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function get(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}
function all(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function init() {
  try {
    db.run('PRAGMA foreign_keys = ON');

    // ============ СОЗДАНИЕ ТАБЛИЦ ============
    // Пользователи (добавлена колонка specialty)
    await run(`
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
    // Пациенты
    await run(`
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
    // Ресурсы (кабинеты)
    await run(`
      CREATE TABLE IF NOT EXISTS resources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT DEFAULT 'room'
      )
    `);
    // Процедуры
    await run(`
      CREATE TABLE IF NOT EXISTS procedures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        default_duration INTEGER DEFAULT 30,
        category TEXT,
        resourceId INTEGER,
        FOREIGN KEY (resourceId) REFERENCES resources(id) ON DELETE SET NULL
      )
    `);
    // Назначения процедур (добавлена plan_id)
    await run(`
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
    // Планы лечения
    await run(`
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
    // Записи к врачу (отдельные от процедур)
    await run(`
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
    // Рабочие часы врачей (опционально, для будущего расширения)
    await run(`
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
    // Уведомления
    await run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT NOT NULL,
        read BOOLEAN DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Связь медперсонала с процедурами
    await run(`
      CREATE TABLE IF NOT EXISTS user_procedures (
        user_id INTEGER NOT NULL,
        procedure_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, procedure_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (procedure_id) REFERENCES procedures(id) ON DELETE CASCADE
      )
    `);
    // Email верификации
    await run(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL
      )
    `);
    // Индексы
    await run(`CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_resource_date_time ON appointments(resourceId, date, time)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_patientId ON appointments(patientId)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_user_procedures_user_id ON user_procedures(user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_appointments_plan_id ON appointments(plan_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_treatment_plans_patient ON treatment_plans(patientId)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_doctor_appointments_doctor_date ON doctor_appointments(doctorId, appointment_date, appointment_time)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_doctor_appointments_patient ON doctor_appointments(patientId)`);

    // ============ НАЧАЛЬНЫЕ ДАННЫЕ ============
    console.log('📦 Добавление тестовых данных...');

    // ----- 1. РЕСУРСЫ (кабинеты) -----
    const resources = [
      "Кабинет массажа", "Физио-кабинет", "Зал ЛФК", "Водолечебница",
      "Кабинет УВЧ-терапии", "Кабинет магнитотерапии"
    ];
    for (const name of resources) {
      await run(`INSERT OR IGNORE INTO resources (name) VALUES (?)`, [name]);
    }
    const resourceRows = await all(`SELECT id, name FROM resources`);
    const resourceMap = {};
    resourceRows.forEach(r => resourceMap[r.name] = r.id);

    // ----- 2. ПРОЦЕДУРЫ (15 видов) -----
    const proceduresData = [
      { name: "Лечебный массаж", duration: 30, category: "Массаж", resourceName: "Кабинет массажа" },
      { name: "Физиотерапия", duration: 45, category: "Физиотерапия", resourceName: "Физио-кабинет" },
      { name: "ЛФК", duration: 40, category: "ЛФК", resourceName: "Зал ЛФК" },
      { name: "Гидромассаж", duration: 30, category: "Водолечение", resourceName: "Водолечебница" },
      { name: "Электрофорез", duration: 25, category: "Электротерапия", resourceName: "Физио-кабинет" },
      { name: "Магнитотерапия", duration: 20, category: "Физиотерапия", resourceName: "Кабинет магнитотерапии" },
      { name: "УВЧ-терапия", duration: 15, category: "Физиотерапия", resourceName: "Кабинет УВЧ-терапии" },
      { name: "Иглорефлексотерапия", duration: 35, category: "Рефлексотерапия", resourceName: "Физио-кабинет" },
      { name: "Озонотерапия", duration: 40, category: "Физиотерапия", resourceName: "Физио-кабинет" },
      { name: "Парафинотерапия", duration: 30, category: "Теплолечение", resourceName: "Физио-кабинет" },
      { name: "Дарсонвализация", duration: 20, category: "Электротерапия", resourceName: "Физио-кабинет" },
      { name: "Лазеротерапия", duration: 15, category: "Физиотерапия", resourceName: "Физио-кабинет" },
      { name: "Кинезиотейпирование", duration: 20, category: "Массаж", resourceName: "Кабинет массажа" },
      { name: "Криотерапия", duration: 15, category: "Теплолечение", resourceName: "Физио-кабинет" },
      { name: "Грязелечение", duration: 40, category: "Теплолечение", resourceName: "Водолечебница" }
    ];
    for (const p of proceduresData) {
      const resourceId = resourceMap[p.resourceName];
      await run(`INSERT OR IGNORE INTO procedures (name, default_duration, category, resourceId) VALUES (?, ?, ?, ?)`,
        [p.name, p.duration, p.category, resourceId]);
    }
    const proceduresList = await all(`SELECT id, name, default_duration, resourceId FROM procedures`);
    const procMap = {};
    proceduresList.forEach(p => procMap[p.name] = p.id);

    // ----- 3. ПОЛЬЗОВАТЕЛИ (админы, врачи с specialty, медперсонал) -----
    const usersData = [
      { name: "Главный администратор", login: "admin", password: bcrypt.hashSync('admin123', 10), role: "admin", email: "admin@clinic.com", email_confirmed: 1, specialty: null },
      { name: "Администратор Смирнова", login: "admin2", password: bcrypt.hashSync('admin456', 10), role: "admin", email: "admin2@clinic.com", email_confirmed: 1, specialty: null },
      { name: "Доктор Иванов", login: "doctor", password: bcrypt.hashSync('doc123', 10), role: "doctor", email: "doctor@clinic.com", email_confirmed: 1, specialty: "Терапевт" },
      { name: "Доктор Петрова", login: "doctor2", password: bcrypt.hashSync('doc456', 10), role: "doctor", email: "doctor2@clinic.com", email_confirmed: 1, specialty: "Кардиолог" },
      { name: "Доктор Сидоров", login: "doctor3", password: bcrypt.hashSync('doc789', 10), role: "doctor", email: "doctor3@clinic.com", email_confirmed: 1, specialty: "Невролог" },
      { name: "Доктор Козлова", login: "doctor4", password: bcrypt.hashSync('doc101', 10), role: "doctor", email: "doctor4@clinic.com", email_confirmed: 1, specialty: "Физиотерапевт" },
      { name: "Медсестра Петрова", login: "staff", password: bcrypt.hashSync('staff123', 10), role: "staff", email: "staff@clinic.com", email_confirmed: 1, specialty: null },
      { name: "Медсестра Соколова", login: "staff2", password: bcrypt.hashSync('staff456', 10), role: "staff", email: "staff2@clinic.com", email_confirmed: 1, specialty: null },
      { name: "Медбрат Васильев", login: "staff3", password: bcrypt.hashSync('staff789', 10), role: "staff", email: "staff3@clinic.com", email_confirmed: 1, specialty: null },
      { name: "Медсестра Кузнецова", login: "staff4", password: bcrypt.hashSync('staff101', 10), role: "staff", email: "staff4@clinic.com", email_confirmed: 1, specialty: null }
    ];
    const userIds = {};
    for (const u of usersData) {
      await run(`INSERT OR IGNORE INTO users (name, login, password, role, email, email_confirmed, specialty) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [u.name, u.login, u.password, u.role, u.email, u.email_confirmed, u.specialty]);
      const userRow = await get(`SELECT id FROM users WHERE login = ?`, [u.login]);
      userIds[u.login] = userRow.id;
    }
    // Получим всех staff и doctors
    const staffUsers = await all(`SELECT id, login FROM users WHERE role = 'staff'`);
    const staffIds = staffUsers.map(s => s.id);
    const doctors = await all(`SELECT id, name FROM users WHERE role = 'doctor'`);

    // ----- 4. ПАЦИЕНТЫ (30 человек, роль client) -----
    const firstNames = ["Алексей", "Мария", "Иван", "Елена", "Сергей", "Ольга", "Павел", "Наталья", "Дмитрий", "Анна", "Владимир", "Татьяна", "Николай", "Юлия", "Андрей", "Екатерина", "Константин", "Людмила", "Михаил", "Оксана", "Роман", "Светлана", "Виталий", "Алина", "Галина", "Василий", "Кристина", "Евгений", "Ирина", "Максим"];
    const lastNames = ["Фёдоров", "Смирнова", "Петров", "Козлова", "Морозов", "Новикова", "Соколов", "Кузнецова", "Орлов", "Тимофеева", "Васильев", "Захарова", "Медведев", "Егорова", "Андреев", "Борисова", "Денисов", "Емельянова", "Жуков", "Иванова", "Крылов", "Лебедева", "Мишин", "Никитина", "Павлова", "Романов", "Сидорова", "Тихонов", "Фомина", "Шевченко"];
    const genders = ["М", "Ж"];
    const diagnoses = ["Гипертония", "Остеохондроз", "Артрит", "Мигрень", "Диабет 2 типа", "Сколиоз", "Гастрит", "Варикоз", "Травма колена", "Фибромиалгия", "Подагра", "Остеопороз", "Плоскостопие", "Невралгия", "Ишемическая болезнь", "Аллергия", "ХОБЛ", "Артроз", "Спортивная травма", "Депрессия", "Простатит", "Мастопатия", "Псориаз", "Вегетососудистая дистония"];
    const histories = ["Хроническое заболевание", "Без особенностей", "После операции", "Травма", "Наследственное"];
    const allergiesList = ["Нет", "Пенициллин", "Аспирин", "Пыльца", "Шерсть"];
    const bloodTypes = ["A(II)+", "B(III)-", "O(I)+", "AB(IV)-", "A(II)-", "B(III)+", "O(I)-", "AB(IV)+"];
    const occupations = ["Инженер", "Учитель", "Водитель", "Медсестра", "Строитель", "Бухгалтер", "Программист", "Пенсионер", "Студент", "Домохозяйка"];
    const marital = ["Женат/Замужем", "Холост/Не замужем", "Разведён(а)", "Вдовец/Вдова"];

    const patientIds = [];
    for (let i = 0; i < 30; i++) {
      const name = `${firstNames[i]} ${lastNames[i]}`;
      const email = `patient${i+1}@mail.ru`;
      const phone = `+7 900 ${Math.floor(1000000 + Math.random() * 9000000)}`;
      const gender = genders[i % 2];
      const birthDate = `${1950 + Math.floor(Math.random() * 50)}-${Math.floor(1 + Math.random() * 12)}-${Math.floor(1 + Math.random() * 28)}`;
      const diagnosis = diagnoses[i % diagnoses.length];
      const history = histories[i % histories.length];
      const allergies = allergiesList[i % allergiesList.length];
      const bloodType = bloodTypes[i % bloodTypes.length];
      const weight = 50 + Math.random() * 50;
      const height = 150 + Math.random() * 40;
      const occupation = occupations[i % occupations.length];
      const marital_status = marital[i % marital.length];
      const emergency_contact = `+7 901 ${Math.floor(1000000 + Math.random() * 9000000)}`;
      const insurance_policy = `POLIS${Math.floor(100000 + Math.random() * 900000)}`;
      const vaccinations = "Корь, грипп, гепатит B";
      const chronic_diseases = diagnosis;

      const hashedPassword = bcrypt.hashSync('client123', 10);
      const userResult = await run(`INSERT OR IGNORE INTO users (name, login, password, role, email, email_confirmed, phone, birthDate, gender) VALUES (?, ?, ?, 'client', ?, 1, ?, ?, ?)`,
        [name, email, hashedPassword, email, phone, birthDate, gender]);
      let userId = null;
      if (userResult.lastID) {
        userId = userResult.lastID;
      } else {
        const existing = await get(`SELECT id FROM users WHERE email = ?`, [email]);
        userId = existing.id;
      }
      await run(`INSERT OR IGNORE INTO patients (userId, name, gender, birthDate, phone, email, diagnosis, history, allergies, bloodType, weight, height, occupation, marital_status, emergency_contact, insurance_policy, vaccinations, chronic_diseases) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, gender, birthDate, phone, email, diagnosis, history, allergies, bloodType, weight, height, occupation, marital_status, emergency_contact, insurance_policy, vaccinations, chronic_diseases]);
      const patientRow = await get(`SELECT id FROM patients WHERE userId = ?`, [userId]);
      if (patientRow) patientIds.push(patientRow.id);
    }
    const patients = await all(`SELECT id, name, email FROM patients`);
    console.log(`✅ Добавлено пациентов: ${patients.length}`);

    // ----- 5. СВЯЗЬ МЕДПЕРСОНАЛА С ПРОЦЕДУРАМИ (случайные 3-5 процедур на каждого staff) -----
    for (const staff of staffUsers) {
      const shuffled = [...proceduresList];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const selected = shuffled.slice(0, 3 + Math.floor(Math.random() * 3));
      for (const proc of selected) {
        await run(`INSERT OR IGNORE INTO user_procedures (user_id, procedure_id) VALUES (?, ?)`, [staff.id, proc.id]);
      }
    }

    // ----- 6. НАЗНАЧЕНИЯ (100 записей) -----
    const statuses = ["Назначена", "Выполнена", "Не явился"];
    const commentsMap = {
      "Назначена": "",
      "Выполнена": "Процедура проведена успешно",
      "Не явился": "Пациент не пришёл"
    };
    const today = new Date();
    for (let i = 0; i < 100; i++) {
      const patient = patients[i % patients.length];
      const procedure = proceduresList[i % proceduresList.length];
      const resourceId = procedure.resourceId || resourceMap["Физио-кабинет"];
      const offsetDays = Math.floor(Math.random() * 61) - 30; // от -30 до +30 дней
      const date = new Date(today);
      date.setDate(today.getDate() + offsetDays);
      const dateStr = date.toISOString().split('T')[0];
      const hour = 8 + Math.floor(Math.random() * 10);
      const minute = Math.random() < 0.5 ? 0 : 30;
      const timeStr = `${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}`;
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const comment = commentsMap[status];
      const responsibleStaffId = staffIds[Math.floor(Math.random() * staffIds.length)];
      await run(`
        INSERT INTO appointments 
          (patientId, patientName, procedureId, procedureName, date, time, duration, resourceId, status, comment, responsibleStaffId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [patient.id, patient.name, procedure.id, procedure.name, dateStr, timeStr, procedure.default_duration, resourceId, status, comment, responsibleStaffId]);
    }
    const appointmentsCount = await get(`SELECT COUNT(*) as cnt FROM appointments`);
    console.log(`✅ Добавлено назначений: ${appointmentsCount.cnt}`);

    // ----- 7. ПЛАНЫ ЛЕЧЕНИЯ (для первых 5 пациентов) -----
    const planTitles = [
      "Курс физиотерапии при остеохондрозе",
      "Реабилитация после травмы колена",
      "Лечебный массаж и ЛФК",
      "Комплексная терапия гипертонии",
      "Восстановление после инсульта"
    ];
    const planDescriptions = [
      "10 сеансов физиотерапии, электрофорез, магнитотерапия",
      "5 сеансов массажа, 10 занятий ЛФК",
      "8 сеансов лечебного массажа + контроль давления",
      "Физиотерапия, УВЧ, лечебная гимнастика",
      "Логопед, ЛФК, физиотерапия"
    ];
    const planProceduresMap = [
      [procMap["Физиотерапия"], procMap["Электрофорез"], procMap["Магнитотерапия"]],
      [procMap["Лечебный массаж"], procMap["ЛФК"], procMap["Гидромассаж"]],
      [procMap["Лечебный массаж"], procMap["ЛФК"]],
      [procMap["УВЧ-терапия"], procMap["Магнитотерапия"], procMap["Озонотерапия"]],
      [procMap["ЛФК"], procMap["Физиотерапия"], procMap["Кинезиотейпирование"]]
    ];
    const planPatientIds = patientIds.slice(0, 5);
    const doctorId = doctors[0]?.id || userIds['doctor'];
    for (let i = 0; i < planPatientIds.length; i++) {
      const patientId = planPatientIds[i];
      const title = planTitles[i];
      const description = planDescriptions[i];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 5);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 15);
      const planResult = await run(`
        INSERT INTO treatment_plans (patientId, doctorId, title, description, start_date, end_date, status)
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `, [patientId, doctorId, title, description, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);
      const planId = planResult.lastID;
      // Привязываем уже существующие назначения этого пациента к плану
      const patientApps = await all(`SELECT id FROM appointments WHERE patientId = ? LIMIT 3`, [patientId]);
      for (const app of patientApps) {
        await run(`UPDATE appointments SET plan_id = ? WHERE id = ?`, [planId, app.id]);
      }
      // Добавляем недостающие процедуры из плана
      const neededProcs = planProceduresMap[i];
      for (let j = 0; j < neededProcs.length; j++) {
        const procId = neededProcs[j];
        const proc = proceduresList.find(p => p.id == procId);
        if (!proc) continue;
        const appDate = new Date();
        appDate.setDate(appDate.getDate() + j * 2);
        const dateStr = appDate.toISOString().split('T')[0];
        const timeStr = `10:${j*30}`;
        const resourceId = proc.resourceId || resourceMap["Физио-кабинет"];
        const responsibleStaffId = staffIds[Math.floor(Math.random() * staffIds.length)];
        await run(`
          INSERT INTO appointments 
            (patientId, patientName, procedureId, procedureName, date, time, duration, resourceId, status, comment, responsibleStaffId, plan_id, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Назначена', ?, ?, ?, datetime('now'))
        `, [patientId, patients.find(p => p.id == patientId).name, proc.id, proc.name, dateStr, timeStr, proc.default_duration, resourceId, `По плану: ${title}`, responsibleStaffId, planId]);
      }
    }
    console.log(`✅ Добавлены планы лечения`);

    // ----- 8. ЗАПИСИ К ВРАЧУ (10 тестовых) -----
    if (doctors.length > 0 && patientIds.length > 0) {
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        const doctor = doctors[i % doctors.length];
        const patientId = patientIds[i % patientIds.length];
        const patient = patients.find(p => p.id == patientId);
        const appDate = new Date();
        appDate.setDate(now.getDate() + Math.floor(Math.random() * 14) + 1); // от завтра до +14 дней
        const dateStr = appDate.toISOString().split('T')[0];
        const hour = 10 + Math.floor(Math.random() * 6); // 10..15
        const minute = Math.random() < 0.5 ? 0 : 30;
        const timeStr = `${hour.toString().padStart(2,'0')}:${minute.toString().padStart(2,'0')}`;
        const reason = "Плановый осмотр, жалобы на ...";
        await run(`
          INSERT INTO doctor_appointments (doctorId, patientId, appointment_date, appointment_time, reason, status)
          VALUES (?, ?, ?, ?, ?, 'Назначен')
        `, [doctor.id, patientId, dateStr, timeStr, reason]);
      }
      console.log(`✅ Добавлены тестовые записи к врачу`);
    }

    // ----- 9. УВЕДОМЛЕНИЯ -----
    const notifications = [
      "Назначена новая процедура для пациента",
      "Статус процедуры изменён на 'Выполнена'",
      "Добавлен новый пациент",
      "Напоминание: завтра процедура у пациента"
    ];
    for (const msg of notifications) {
      await run(`INSERT INTO notifications (message, read, createdAt) VALUES (?, 0, datetime('now'))`, [msg]);
    }

    // ----- 10. ИТОГОВАЯ СТАТИСТИКА -----
    const totalUsers = (await all(`SELECT COUNT(*) as cnt FROM users`))[0].cnt;
    const totalPatients = (await all(`SELECT COUNT(*) as cnt FROM patients`))[0].cnt;
    const totalProcedures = (await all(`SELECT COUNT(*) as cnt FROM procedures`))[0].cnt;
    const totalResources = (await all(`SELECT COUNT(*) as cnt FROM resources`))[0].cnt;
    const totalAppointments = (await all(`SELECT COUNT(*) as cnt FROM appointments`))[0].cnt;
    const totalPlans = (await all(`SELECT COUNT(*) as cnt FROM treatment_plans`))[0].cnt;
    const totalDoctorApps = (await all(`SELECT COUNT(*) as cnt FROM doctor_appointments`))[0].cnt;
    console.log('✅ Инициализация тестовых данных завершена успешно!');
    console.log(`📊 Итог: пользователей - ${totalUsers}, пациентов - ${totalPatients}, процедур - ${totalProcedures}, ресурсов - ${totalResources}, назначений - ${totalAppointments}, планов лечения - ${totalPlans}, записей к врачу - ${totalDoctorApps}`);
  } catch (err) {
    console.error('❌ Ошибка при инициализации БД:', err);
  } finally {
    db.close();
  }
}

init();