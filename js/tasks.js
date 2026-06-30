/* ==================== 7. 日程 ==================== */
let tasks = lsGet('tasks', []);
let schedulePreview = null;

function renderSchedule() {
  const list = document.getElementById('scheduleList');
  list.innerHTML = '';
  if (schedulePreview && schedulePreview.length > 0) {
    const previewDiv = document.createElement('div');
    previewDiv.className = 'schedule-preview';
    previewDiv.innerHTML = '<div style="font-size:12px;font-weight:600;color:#e65100;margin-bottom:6px;">📋 AI建议的日程 — 点击确认或编辑</div>';
    schedulePreview.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'schedule-preview-item';
      row.innerHTML =
        '<span>' + escHtml(item.text) + '</span>' +
        '<span style="font-size:11px;color:#999;">' + (item.date||'') + ' ' + (item.time||'') + '</span>' +
        '<div>' +
        '<button class="schedule-confirm-btn schedule-edit-btn" onclick="editScheduleItem(' + i + ')">编辑</button>' +
        '<button class="schedule-confirm-btn" onclick="confirmScheduleItem(' + i + ')">✓确认</button>' +
        '</div>';
      previewDiv.appendChild(row);
    });
    const allBtn = document.createElement('button');
    allBtn.className = 'schedule-confirm-btn';
    allBtn.style.cssText = 'display:block;width:100%;margin-top:8px;padding:8px;';
    allBtn.textContent = '全部确认添加';
    allBtn.onclick = confirmAllSchedule;
    previewDiv.appendChild(allBtn);
    list.appendChild(previewDiv);
  }
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const sorted = [...tasks].sort((a,b) => (a.date||'') > (b.date||'') ? 1 : -1);
  let lastDate = '';
  sorted.forEach((t, i) => {
    if (t.date && t.date !== lastDate) {
      const dateLabel = document.createElement('div');
      dateLabel.className = 'schedule-date-group';
      dateLabel.textContent = t.date === todayStr ? '今天 ' + t.date : t.date;
      list.appendChild(dateLabel);
      lastDate = t.date;
    }
    const el = document.createElement('div');
    el.className = 'schedule-item' + (t.done ? ' done' : '');
    el.innerHTML =
      '<div class="schedule-check ' + (t.done?'checked':'') + '" onclick="toggleTask(' + tasks.indexOf(t) + ')">' + (t.done?'✓':'') + '</div>' +
      '<div class="schedule-text">' + escHtml(t.text) + (t.date||t.time ? '<span class="schedule-time"> '+(t.date&&t.date!==todayStr?t.date:'')+' '+(t.time||'')+'</span>' : '') + '</div>' +
      '<div class="schedule-del" onclick="delTask(' + tasks.indexOf(t) + ')">✕</div>';
    list.appendChild(el);
  });
}

function addTask() {
  const inp = document.getElementById('taskInput');
  const text = inp.value.trim();
  if (!text) return;
  tasks.push({ text, done:false, date:'', time:'' });
  lsSet('tasks', tasks);
  inp.value = '';
  renderSchedule();
}

function toggleTask(i) {
  if (!tasks[i]) return;
  tasks[i].done = !tasks[i].done;
  lsSet('tasks', tasks);
  renderSchedule();
}

function delTask(i) {
  if (!tasks[i]) return;
  const t = tasks[i];
  if (t.time) {
    const alarmIdx = alarms.findIndex(a => a.label === t.text && a.time === t.time);
    if (alarmIdx >= 0) { alarms.splice(alarmIdx, 1); lsSet('alarms', alarms); renderAlarms(); }
  }
  tasks.splice(i, 1);
  lsSet('tasks', tasks);
  renderSchedule();
}

function confirmScheduleItem(i) {
  const item = schedulePreview[i];
  if (!item) return;
  tasks.push({ text: item.text, done: false, date: item.date || '', time: item.time || '' });
  lsSet('tasks', tasks);
  if (item.time) {
    const existing = alarms.find(a => a.time === item.time && a.label === item.text);
    if (!existing) {
      alarms.push({ time: item.time, label: item.text, on: true });
      lsSet('alarms', alarms);
      renderAlarms();
    }
  }
  schedulePreview.splice(i, 1);
  if (schedulePreview.length === 0) schedulePreview = null;
  renderSchedule();
  requestNotificationPermission();
}

function editScheduleItem(i) {
  const item = schedulePreview[i];
  if (!item) return;
  const newText = prompt('任务内容：', item.text);
  if (!newText) return;
  const newDate = prompt('日期（YYYY-MM-DD，不填则不设）：', item.date || '');
  const newTime = prompt('时间（HH:MM，不填则不设）：', item.time || '');
  schedulePreview[i] = { text: newText, date: newDate || '', time: newTime || '' };
  renderSchedule();
}

function confirmAllSchedule() {
  if (!schedulePreview) return;
  schedulePreview.forEach(item => {
    tasks.push({ text: item.text, done: false, date: item.date || '', time: item.time || '' });
    if (item.time) {
      const existing = alarms.find(a => a.time === item.time && a.label === item.text);
      if (!existing) {
        alarms.push({ time: item.time, label: item.text, on: true });
        lsSet('alarms', alarms);
      }
    }
  });
  lsSet('tasks', tasks);
  renderAlarms();
  schedulePreview = null;
  renderSchedule();
  requestNotificationPermission();
}

function addSchedulePreview(items) {
  schedulePreview = schedulePreview || [];
  items.forEach(item => {
    if (!schedulePreview.find(s => s.text === item.text)) {
      schedulePreview.push(item);
    }
  });
  renderSchedule();
  addChatSystem('📋 AI为你规划了' + items.length + '项日程，请到日程页面确认');
}

/* ==================== 8. 闹钟 ==================== */
let alarms = lsGet('alarms', []);
let alarmCheckInterval = null;

function renderAlarms() {
  const list = document.getElementById('alarmList');
  list.innerHTML = '';
  alarms.forEach((a, i) => {
    const el = document.createElement('div');
    el.className = 'alarm-item';
    el.innerHTML =
      '<div><div class="alarm-time">' + escHtml(a.time) + '</div><div class="alarm-label">' + escHtml(a.label || '闹钟') + '</div></div>' +
      '<div class="alarm-right"><div class="ios-toggle ' + (a.on?'on':'') + '" onclick="toggleAlarm(' + i + ')"></div><div class="alarm-del" onclick="delAlarm(' + i + ')">✕</div></div>';
    list.appendChild(el);
  });
}

function addAlarm() {
  const time = document.getElementById('alarmTimeInput').value;
  const label = document.getElementById('alarmLabelInput').value.trim();
  if (!time) return;
  alarms.push({ time, label: label||'闹钟', on:true });
  lsSet('alarms', alarms);
  document.getElementById('alarmLabelInput').value = '';
  renderAlarms();
}

function toggleAlarm(i) {
  alarms[i].on = !alarms[i].on;
  lsSet('alarms', alarms);
  renderAlarms();
}

function delAlarm(i) {
  alarms.splice(i, 1);
  lsSet('alarms', alarms);
  renderAlarms();
}

function checkAlarms() {
  const now = new Date();
  const hm = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  alarms.forEach((a, i) => {
    if (a.on && a.time === hm) {
      triggerAlarm(a);
      alarms[i].on = false;
      lsSet('alarms', alarms);
      renderAlarms();
    }
  });
}

function triggerAlarm(a) {
  document.getElementById('amTime').textContent = a.time;
  document.getElementById('amLabel').textContent = a.label;
  document.getElementById('alarmModal').classList.add('show');
  addChatSystem('⏰ 闹钟响了！' + a.time + ' - ' + a.label);
  playAlarmSound();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('⏰ ' + a.label, { body: '时间到了：' + a.time, icon: '/icon-192.png' });
  }
}
