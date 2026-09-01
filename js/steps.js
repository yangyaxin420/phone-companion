/* ==================== 步数（模拟引擎 + 手机真实计步 + 手环入口） ==================== */
// 步数按天存：stepsData = { 'YYYY-MM-DD': { steps, updated } }
const STEP_TARGET = 8000; // 每日目标

let stepsData = lsGet('stepsData', {});
const stepState = { mode: 'sim' }; // 'sim' = 模拟，'real' = 手机计步中

function _stepDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _todayKey() { return _stepDateKey(new Date()); }
function saveSteps() { lsSet('stepsData', stepsData); }

function todaySteps() {
  const e = stepsData[_todayKey()];
  const v = e && e.steps != null ? Number(e.steps) : 0;
  return isNaN(v) ? 0 : v;
}
function weekSteps() {
  const start = _weekStartMs();
  let sum = 0;
  Object.keys(stepsData).forEach(k => {
    if (new Date(k + 'T00:00:00').getTime() >= start) {
      const v = stepsData[k] && stepsData[k].steps != null ? Number(stepsData[k].steps) : 0;
      sum += isNaN(v) ? 0 : v;
    }
  });
  return sum;
}
function _weekStartMs() {
  const now = new Date();
  const day = now.getDay(); // 0=周日
  const diff = day === 0 ? 6 : day - 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff).getTime();
}

/* 一天里的活动曲线（分钟级步速）：上学/午休/晚饭后多，深夜睡）
   —— 估算每天 ~6000-9000 步，目标 8000 */
function _hourBase(h) {
  if (h >= 1 && h < 6) return 0;
  if (h >= 6 && h < 9) return 11;   // 早起出门
  if (h >= 9 && h < 12) return 5;   // 上课/坐着
  if (h >= 12 && h < 14) return 8;  // 午休走动
  if (h >= 14 && h < 17) return 4;  // 下午
  if (h >= 17 && h < 22) return 9;  // 晚饭后散步
  return 3;                          // 睡前
}

function simStepIncrement() {
  return Math.floor(_hourBase(new Date().getHours()) * (0.5 + Math.random()));
}

/* 首次打开：从今天 0 点按活动曲线估算到现在的步数，让数字不是 0 */
function _seedToday() {
  const k = _todayKey();
  if (stepsData[k]) return;
  const now = new Date();
  const h0 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const minsSoFar = Math.round((now - h0) / 60000);
  let est = 0;
  for (let m = 0; m < minsSoFar; m++) est += _hourBase(new Date(h0.getTime() + m * 60000).getHours());
  est = Math.round(est * (0.85 + Math.random() * 0.3));
  stepsData[k] = { steps: est, updated: Date.now() };
  saveSteps();
}

/* 加步数（模拟 tick、手机计步、手环、演示按钮共用） */
function addSteps(n) {
  const k = _todayKey();
  const e = stepsData[k] || { steps: 0, updated: 0 };
  e.steps += Math.max(0, n);
  e.updated = Date.now();
  stepsData[k] = e;
  saveSteps();
  renderSteps();
}

/* 模拟 tick：每 60s 走一点（真实计步开启后停） */
function stepTick() {
  if (stepState.mode !== 'sim') return;
  const inc = simStepIncrement();
  if (inc > 0) addSteps(inc);
}

/* 「🚶 走几步」演示按钮 */
function stepsDemoBump() {
  try {
    if (stepState.mode === 'real') { addChatSystem('🚶 现在在手机计步，走一步算一步，别点这个啦'); return; }
    const n = 200 + Math.floor(Math.random() * 700);
    addSteps(n);
    addChatSystem('🚶 走了 ' + n + ' 步（模拟，真实手环接入后换成真步数）');
  } catch (e) { if (typeof addChatSystem === 'function') addChatSystem('⚠️ 步数报错：' + (e && e.message || e)); }
}

/* 手机真实计步（iOS13+/安卓浏览器需授权；桌面预览/无传感器时保持模拟） */
function enableStepCounter() {
  try {
    if (typeof DeviceMotionEvent === 'undefined') return;
    const req = DeviceMotionEvent.requestPermission
      ? DeviceMotionEvent.requestPermission.bind(DeviceMotionEvent)
      : Promise.resolve('granted');
    req().then(p => {
      if (p !== 'granted') return;
      window.addEventListener('devicemotion', onStepMotion);
    }).catch(() => {});
  } catch (e) { /* 某些浏览器授权接口会同步抛异常：无视，保持模拟 */ }
}

let _stepDetect = { lastT: 0, lastSign: 0 };
function onStepMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  // 拿到第一条真实读数才切真实计步——桌面没传感器/没动时模拟继续跑
  if (stepState.mode !== 'real') {
    stepState.mode = 'real';
    renderSteps();
    addChatSystem('🚶 手机计步已开启。之前的步数是模拟估算，接下来按真实走路计数');
  }
  const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) - 9.8;
  const now = performance.now();
  // 粗步态检测：加速度突刺 + 间隔>300ms + 方向翻转 才算一步
  if (Math.abs(mag) > 2.4 && now - _stepDetect.lastT > 300 && Math.sign(mag) !== _stepDetect.lastSign) {
    _stepDetect.lastT = now;
    _stepDetect.lastSign = Math.sign(mag);
    addSteps(1);
  }
}

/* 未来真实手环：BLE 读到累计步数后调这里（替代手机计步的这部分） */
function stepsFeedExternal(steps) {
  stepState.mode = 'real';
  addSteps(Math.max(0, Math.round(steps || 0)));
}

/* ---- 渲染（心跳页步数卡） ---- */
function renderSteps() {
  try {
    const t = todaySteps();
    const cntEl = document.getElementById('stepCount');
    if (cntEl) cntEl.textContent = t.toLocaleString();
    const wkEl = document.getElementById('stepWeekCount');
    if (wkEl) wkEl.textContent = weekSteps().toLocaleString();
    const barEl = document.getElementById('stepBar');
    if (barEl) barEl.style.width = Math.min(100, Math.round(t / STEP_TARGET * 100)) + '%';
    const modeEl = document.getElementById('stepMode');
    if (modeEl) modeEl.textContent = stepState.mode === 'real' ? '📱 真实计步' : '○ 模拟';
  } catch (e) { console.error('renderSteps', e); }
}

/* ---- 初始化 ---- */
function initSteps() {
  try {
    _seedToday();
    renderSteps();
    setInterval(stepTick, 60000);
    // 移动端浏览器尝试开真实计步（授权失败/桌面预览自动留在模拟）
    enableStepCounter();
  } catch (e) {
    console.error('initSteps', e);
    if (typeof addChatSystem === 'function') addChatSystem('⚠️ 步数加载报错：' + (e && e.message || e));
  }
}
