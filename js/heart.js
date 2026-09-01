/* ==================== 16. 心跳（手环 · 模拟数据） ==================== */

// ---- 状态 ----
const HEART_READING_LIMIT = 200;
const HEART_SAMPLE_INTERVAL = 60 * 60 * 1000; // 自动采样：1小时一轮（避免频繁打扰，手动测随时可点）

let heartState = lsGet('heart', { sampling: true, connected: false, readings: [] });
function saveHeart() {
  lsSet('heart', { sampling: heartState.sampling, connected: !!heartState.connected, readings: heartState.readings.slice(-HEART_READING_LIMIT) });
}

// 最新一次读数
function heartLast() {
  return heartState.readings.length > 0 ? heartState.readings[heartState.readings.length - 1] : null;
}

// 今天的读数
function heartTodayReadings() {
  const today = getTodayStr();
  return heartState.readings.filter(r => new Date(r.t).toISOString().split('T')[0] === today);
}

/* ---- 模拟引擎（手环未连接时用） ---- */
function simHeartHr() {
  const h = new Date().getHours();
  // 基础心率随时间波动：凌晨最低、起床后略高、白天正常
  let base = 70;
  if (h >= 0 && h < 6) base = 60;
  else if (h >= 6 && h < 9) base = 76;
  else if (h >= 21 && h < 24) base = 73;
  const last = heartLast();
  // 从上一次读数随机游走
  let hr = last ? last.hr + (Math.random() * 10 - 5) : base + (Math.random() * 8 - 4);
  // 偶发紧张/激动高峰：25% 概率 +25~55（演示期调高一点更好触发，真实手环接入后数据就是真的）
  if (Math.random() < 0.25) hr += 25 + Math.random() * 30;
  return Math.round(Math.max(48, Math.min(150, hr)));
}

function simHeartTemp() {
  const last = heartLast();
  let t = last ? last.temp + (Math.random() * 0.2 - 0.1) : 36.4 + (Math.random() * 0.2 - 0.1);
  return Math.round(Math.max(35.8, Math.min(37.5, t)) * 10) / 10;
}

/* ---- 采样 ---- */
function heartSample(now) {
  const r = { t: now || Date.now(), hr: simHeartHr(), temp: simHeartTemp() };
  heartState.readings.push(r);
  saveHeart();
  renderHeart();
  return r;
}

// 手动测一次（用户主动）
function heartMeasureNow() {
  const r = heartSample();
  // 系统消息带上"感觉"描述：正常→他没特意说啥；偏高/偏低→他马上会来关心（去聊天页能看到）
  addChatSystem('💓 测了一下心跳：' + r.hr + ' bpm，体温 ' + r.temp.toFixed(1) + '°C（' + heartStateDesc(r) + '）');
  // 偏高/偏低 → 骆云影立刻主动关心（不用等轮询）
  if (typeof tryHeartProactive === 'function') tryHeartProactive();
  return r;
}

// 未来真实手环：蓝牙读到数据后调用这里，替代模拟
function heartFeedExternal(hr, temp) {
  heartState.connected = true;
  heartState.readings.push({ t: Date.now(), hr, temp });
  saveHeart();
  renderHeart();
}

// 自动采样开关
function toggleHeartSampling() {
  heartState.sampling = !heartState.sampling;
  saveHeart();
  renderHeart();
  addChatSystem(heartState.sampling ? '✅ 自动采样已开启（每1小时一轮，手动测随时可点）' : '❌ 自动采样已关闭');
}

/* ---- 页面初始化 ---- */
function initHeart() {
  const last = heartLast();
  if (!last) {
    heartSample(); // 首次访问：立即采一条，让页面有数据
  } else if (heartState.sampling && Date.now() - last.t >= HEART_SAMPLE_INTERVAL) {
    heartSample(); // 距上次超过一轮：补一条
  }
  renderHeart();
  // 自动采样检查：每分钟看一次是否该采了
  setInterval(function() {
    if (heartState.sampling) {
      const l = heartLast();
      if (l && Date.now() - l.t >= HEART_SAMPLE_INTERVAL) heartSample();
    }
  }, 60000);
}

/* ---- 渲染 ---- */
function renderHeart() {
  const last = heartLast();
  const statusEl = document.getElementById('heartStatus');
  if (statusEl) statusEl.textContent = heartState.connected ? '手环已连接' : '模拟数据';
  if (last) {
    const bpmEl = document.getElementById('heartBpm');
    if (bpmEl) bpmEl.textContent = last.hr;
    const tempEl = document.getElementById('heartTemp');
    if (tempEl) tempEl.textContent = last.temp.toFixed(1) + '°C';
    const beatEl = document.getElementById('heartBeatAnim');
    if (beatEl) beatEl.style.animationDuration = (60 / last.hr) + 's'; // 心跳快慢跟 bpm 走
    const updEl = document.getElementById('heartUpdated');
    if (updEl) {
      const mins = Math.round((Date.now() - last.t) / 60000);
      updEl.textContent = mins <= 0 ? '刚刚测过' : mins + ' 分钟前测过';
    }
    const descEl = document.getElementById('heartStateDesc');
    if (descEl) descEl.textContent = heartStateDesc(last);
  }
  const toggleEl = document.getElementById('heartToggleBtn');
  if (toggleEl) toggleEl.textContent = heartState.sampling ? '自动采样：开' : '自动采样：关';
  // 呼吸练习按钮：心跳偏快时高亮提醒
  const breatheBtn = document.getElementById('heartBreatheBtn');
  if (breatheBtn) {
    if (last && last.hr >= 100) {
      breatheBtn.textContent = '🌬 心跳偏快 · 做个呼吸练习';
      breatheBtn.classList.add('high');
    } else {
      breatheBtn.textContent = '🌬 呼吸练习';
      breatheBtn.classList.remove('high');
    }
  }
  renderHeartStats();
  drawHeartSpark();
  renderHeartHistory();
  if (typeof renderHealthReportArea === 'function') renderHealthReportArea();
}

function heartStateDesc(last) {
  if (!last) return '';
  if (last.hr >= 100) return '有点快，是不是紧张或刚动了？';
  if (last.hr >= 85) return '略快，可能有点兴奋';
  if (last.hr <= 55) return '很平静，可能在休息';
  return '平静 · 正常';
}

function renderHeartStats() {
  const today = heartTodayReadings();
  const cntEl = document.getElementById('heartTodayCount');
  if (cntEl) cntEl.textContent = today.length;
  const avgEl = document.getElementById('heartAvgHr');
  if (avgEl) avgEl.textContent = today.length > 0 ? Math.round(today.reduce((s, r) => s + r.hr, 0) / today.length) : '--';
  const maxEl = document.getElementById('heartMaxHr');
  if (maxEl) maxEl.textContent = today.length > 0 ? Math.max(...today.map(r => r.hr)) : '--';
}

function drawHeartSpark() {
  const cv = document.getElementById('heartSpark');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const data = heartState.readings.slice(-40);
  if (data.length < 2) {
    ctx.fillStyle = '#ccc';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('再测几次就能看到趋势', w / 2, h / 2);
    return;
  }
  const hrs = data.map(r => r.hr);
  let min = Math.min(...hrs) - 5, max = Math.max(...hrs) + 5;
  if (min < 40) min = 40;
  if (max > 160) max = 160;
  // 折线
  ctx.beginPath();
  data.forEach((r, i) => {
    const x = (i / (data.length - 1)) * (w - 8) + 4;
    const y = h - 6 - ((r.hr - min) / (max - min)) * (h - 12);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // 底部渐变填充
  ctx.lineTo(w - 4, h);
  ctx.lineTo(4, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(236,72,153,.22)');
  grad.addColorStop(1, 'rgba(236,72,153,0)');
  ctx.fillStyle = grad;
  ctx.fill();
}

let heartHistoryOpen = false;
function toggleHeartHistory() {
  heartHistoryOpen = !heartHistoryOpen;
  const box = document.getElementById('heartHistory');
  const chev = document.getElementById('heartChevron');
  if (box) box.style.display = heartHistoryOpen ? 'block' : 'none';
  if (chev) chev.style.transform = heartHistoryOpen ? 'rotate(180deg)' : '';
}

function renderHeartHistory() {
  const box = document.getElementById('heartHistory');
  if (!box) return;
  const cntEl = document.getElementById('heartHistoryCount');
  if (cntEl) cntEl.textContent = heartState.readings.length;
  box.style.display = heartHistoryOpen ? 'block' : 'none';
  const items = heartState.readings.slice(-20).reverse();
  if (items.length === 0) {
    box.innerHTML = '<div style="font-size:12px;color:#aaa;text-align:center;padding:12px;">还没有记录，点「测一次」开始</div>';
    return;
  }
  box.innerHTML = '';
  items.forEach(r => {
    const d = new Date(r.t);
    const time = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
    const el = document.createElement('div');
    el.className = 'heart-history-item';
    el.innerHTML = `<div class="heart-hi-time">${time}</div><div class="heart-hi-hr">${r.hr} bpm</div><div class="heart-hi-temp">${r.temp.toFixed(1)}°C</div>`;
    box.appendChild(el);
  });
}

/* ---- AI 上下文：让骆云影"感觉到"用户 ---- */
function buildHeartContext() {
  const last = heartLast();
  if (!last) return '';
  const mins = Math.max(1, Math.round((Date.now() - last.t) / 60000));
  let desc = '';
  if (last.hr >= 100) desc = '偏快，她可能紧张、激动或在运动';
  else if (last.hr >= 85) desc = '略快，她可能有点兴奋或刚活动过';
  else if (last.hr <= 55) desc = '偏慢，她可能很放松或在休息';
  else desc = '正常，比较平静';
  const tempNote = last.temp >= 37.0 ? '，体温偏高一点' : '';
  const stepNote = (typeof todaySteps === 'function' && todaySteps() > 0) ? '，今天走了 ' + todaySteps() + ' 步' : '';
  return `【身体感应】你正"感觉"到用户的身体状态（${mins}分钟前测过）：心跳 ${last.hr} bpm（${desc}），体温 ${last.temp.toFixed(1)}°C${tempNote}${stepNote}。\n用法：这是"感觉"不是诊断——可以自然地关心她（紧张了、累了、心慌了、又想心事了都可以），但绝对不要装医生、不要诊断疾病、不要给医疗建议。`;
}
