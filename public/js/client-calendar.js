document.addEventListener('DOMContentLoaded', function() {
  const user = getUser();
  if (!user || user.role !== 'client') {
    window.location.href = '/';
    return;
  }
  document.getElementById('clientInfo').innerHTML = `${user.name} | <button onclick="logout()">Выйти</button>`;

  let calendar = null;
  let calendarInitialized = false;

  async function ensureCalendarReady() {
    const el = document.getElementById('calendar');
    if (!el) return false;
    // Если элемент скрыт (display:none или visibility:hidden), подождём
    if (el.offsetParent === null && !el.style.display) {
      console.log('Calendar element hidden, waiting...');
      await new Promise(resolve => setTimeout(resolve, 100));
      return ensureCalendarReady();
    }
    return true;
  }

  async function initCalendar() {
    if (calendarInitialized) return;
    if (typeof FullCalendar === 'undefined') {
      console.log('FullCalendar not loaded, waiting...');
      setTimeout(initCalendar, 200);
      return;
    }
    const ready = await ensureCalendarReady();
    if (!ready) {
      setTimeout(initCalendar, 200);
      return;
    }
    try {
      const medcardRes = await fetch('/api/client/medcard', { headers: { 'X-User-Id': user.id } });
      const medcard = await medcardRes.json();
      if (!medcard.id) {
        document.getElementById('calendar').innerHTML = '<p>Ошибка: не найдена медицинская карта</p>';
        return;
      }
      const patientId = medcard.id;
      const res = await fetch(`/api/appointments/patient/${patientId}`);
      if (!res.ok) throw new Error('Ошибка загрузки данных');
      const appointments = await res.json();

      const events = appointments.map(a => ({
        title: `${a.procedureName} (${a.resourceName || 'каб.?'})`,
        start: `${a.date}T${a.time}`,
        backgroundColor: a.status === 'Выполнена' ? '#2c9b7a' : a.status === 'Не явился' ? '#dc3545' : '#1a6d5e',
        extendedProps: { status: a.status, comment: a.comment, resource: a.resourceName }
      }));

      const calendarEl = document.getElementById('calendar');
      if (calendar) calendar.destroy();
      calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        locale: 'ru',
        slotMinTime: '08:00:00',
        slotMaxTime: '18:00:00',
        events: events,
        eventClick: function(info) {
          alert(`Процедура: ${info.event.title.split(' (')[0]}\nКабинет: ${info.event.extendedProps.resource || '—'}\nСтатус: ${info.event.extendedProps.status}\nКомментарий: ${info.event.extendedProps.comment || '—'}`);
        }
      });
      calendar.render();
      calendarInitialized = true;
    } catch (err) {
      console.error(err);
      document.getElementById('calendar').innerHTML = '<p>Ошибка загрузки календаря</p>';
    }
  }

  // Если FullCalendar уже загружен локально – запускаем сразу, иначе загружаем с CDN
  if (typeof FullCalendar === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/main.min.js';
    script.onload = () => {
      console.log('FullCalendar loaded from CDN');
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/main.min.css';
      document.head.appendChild(link);
      initCalendar();
    };
    document.head.appendChild(script);
  } else {
    initCalendar();
  }
});