/* ==================== 睡眠（模拟引擎 + 「我睡了」标记 + 手环入口） ==================== */
// sleepData 按「醒来那天的本地日期」存一晚（睡眠跨午夜，不能用 UTC 的 getTodayStr 切日）
// sleepData = { 'YYYY-MM-DD': { wake, bed(ms), wakeUp(ms), sleepMin, wakeCount, quality, seeded } }
const SLEEP_TARGET_MIN = 480; // 理想时长（8h），用于页面横条比例

let sleepData = lsGet('sleepData', {});

function _sleepKeyLocal(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _sleepHM(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function _sleepQuality(min, wc) {
  return (min >= 420 && wc <= 1) ? 'good' : (min >= 330 ? 'ok' : 'poor');
}
function _sleepQualityLabel(q) {
  return q === 'good' ? '睡得很沉' : q === 'ok' ? '睡得还行' : '没睡够';
}
function sleepSave() { lsSet('sleepData', sleepData); }

/* 结算基准：凌晨 0-4 点可能正睡着，不算；否则「今早醒」= 昨晚那晚 */
function _sleepBaseDate() {
  const d = new Date();
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return d;
}
function sleepLastNightKey() { return _sleepKeyLocal(_sleepBaseDate()); }
function sleepLastNight() { return sleepData[sleepLastNightKey()] || null; }

/* 就寝标记（睡前点「🌙 我睡了」写入，明早结算时当作真实就寝点） */
function _sleepTonight() { return lsGet('sleepTonight', null); }

/* 自动补一晚：只在醒来后（>=4点）结算；已有今早那晚就不动。仿 steps.js 的 _seedToday */
function seedLastNightIfMissing() {
  try {
    if (new Date().getHours() < 4) return false;
    const baseD = _sleepBaseDate();   // 今早醒来那天的日期
    const key = _sleepKeyLocal(baseD);
    if (sleepData[key]) return false;

    let bedMs = null;
    const mark = _sleepTonight();
    if (mark && mark.bed) {
      const day0 = new Date(baseD); day0.setHours(0, 0, 0, 0);
      const mDay = new Date(mark.bed); mDay.setHours(0, 0, 0, 0);
      // 标记属于这一晚：当晚睡下 或 前一夜睡下（今早醒）
      if (+mDay === +day0 || +mDay === +day0 - 86400000) bedMs = mark.bed;
    }
    lsSet('sleepTonight', null);      // 标记用完即清

    if (!bedMs) {
      // 典型作息随机：22:50-23:40 睡下
      const bedD = new Date(baseD);
      bedD.setHours(22, 50 + Math.floor(Math.random() * 50), Math.floor(Math.random() * 60), 0);
      if (bedD.getTime() > Date.now()) bedD.setDate(bedD.getDate() - 1);  // 若还没到晚上，按前一晚估
      bedMs = bedD.getTime();
    }

    const wakeD = new Date(baseD);
    wakeD.setHours(6 + (Math.random() < 0.5 ? 0 : 1), Math.floor(Math.random() * 60), 0, 0);
    let wakeMs = wakeD.getTime();
    if (wakeMs > Date.now() - 60000) wakeMs = Date.now() - 120000;        // 醒来时刻不超出现在
    if (wakeMs <= bedMs) wakeMs = bedMs + 5 * 3600000;                    // 兜底至少 5h

    const sleepMin = Math.min(720, Math.max(60, Math.round((wakeMs - bedMs) / 60000)));
    const wakeCount = Math.floor(Math.random() * 3);                      // 0-2 次，偏少
    sleepData[key] = {
      wake: key, bed: bedMs, wakeUp: wakeMs, sleepMin,
      wakeCount, quality: _sleepQuality(sleepMin, wakeCount), seeded: true
    };
    sleepSave();
    return true;
  } catch (e) {
    console.error('seedLastNight', e);
    if (typeof addChatSystem === 'function') addChatSystem('⚠️ 睡眠加载报错：' + (e && e.message || e));
    return false;
  }
}

/* 手环/App 真数据入口：以后 BLE 读到昨晚就寝/醒来/醒次后调这里 */
function sleepFeedExternal(obj) {
  try {
    if (!obj || !obj.wakeUp) return;
    const wakeMs = Number(obj.wakeUp);
    let bedMs = obj.bed ? Number(obj.bed) : (wakeMs - (Number(obj.sleepMin || 0) * 60000));
    if (!obj.bed && !obj.sleepMin) bedMs = wakeMs - 7 * 3600000;
    const d = new Date(wakeMs);
    const key = _sleepKeyLocal(d);
    const sleepMin = Math.min(720, Math.max(0, Math.round((wakeMs - bedMs) / 60000)));
    const wakeCount = Math.max(0, Math.round(obj.wakeCount || 0));
    sleepData[key] = {
      wake: key, bed: bedMs, wakeUp: wakeMs, sleepMin,
      wakeCount, quality: _sleepQuality(sleepMin, wakeCount), seeded: false
    };
    sleepSave();
    if (typeof renderSleep === 'function') renderSleep();
  } catch (e) { console.error('sleepFeedExternal', e); }
}

/* 最近一晚的文案（晚安故事织入用） */
function sleepLastNightText() {
  const r = sleepLastNight();
  if (!r || Date.now() - r.wakeUp > 40 * 3600000) return '';
  const hs = Math.floor(r.sleepMin / 60), ms = r.sleepMin % 60;
  const feel = r.quality === 'good' ? '睡得挺沉' : r.quality === 'ok' ? '睡得还行' : '没睡够';
  return '（她昨晚' + _sleepHM(r.bed) + '睡下，' + _sleepHM(r.wakeUp) + '醒，睡了' + hs + '小时' + (ms ? ms + '分' : '') + '，' + feel + '）';
}

/* 最近 7 天（含今早）时长条，供页面画小柱 */
function _sleepWeekKeys() {
  const arr = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    arr.push({ key: _sleepKeyLocal(d), d });
  }
  return arr;
}

/* ---- 睡前点「🌙 我睡了」：先弹日期时间，确认后写入 ---- */
function sleepNow() {
  try {
    const now = new Date();
    const dEl = document.getElementById('sleepDate');
    const tEl = document.getElementById('sleepTime');
    const mEl = document.getElementById('sleepModal');
    if (!dEl || !tEl || !mEl) { doSleepNow(Date.now()); return; }   // 兜底：没弹窗就直接记现在
    const p = function(n) { return String(n).padStart(2, '0'); };
    dEl.value = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
    tEl.value = p(now.getHours()) + ':' + p(now.getMinutes());
    mEl.style.display = 'flex';
  } catch (e) { console.error('sleepNow', e); doSleepNow(Date.now()); }
}
function sleepModalCancel() {
  const mEl = document.getElementById('sleepModal');
  if (mEl) mEl.style.display = 'none';
}
function sleepModalConfirm() {
  try {
    sleepModalCancel();
    let bedMs = Date.now();
    const dEl = document.getElementById('sleepDate');
    const tEl = document.getElementById('sleepTime');
    if (dEl && tEl && dEl.value && tEl.value) {
      const dp = dEl.value.split('-'), tp = tEl.value.split(':');
      if (dp.length === 3 && tp.length === 2) {
        const ms = new Date(+dp[0], +dp[1] - 1, +dp[2], +tp[0], +tp[1]).getTime();
        if (!isNaN(ms)) bedMs = ms;
      }
    }
    doSleepNow(bedMs);
  } catch (e) { console.error('sleepModalConfirm', e); doSleepNow(Date.now()); }
}
function doSleepNow(bedMs) {
  try {
    lsSet('sleepTonight', { bed: bedMs });
    renderSleep();
    // 骆云影道晚安（睡眠陪伴开关关了就只记不打扰）
    const guardOn = !!(settings && settings.sleepGuard);
    const char = (typeof getCharById === 'function' && currentCharId) ? getCharById(currentCharId) : null;
    if (guardOn && char && typeof generateProactiveMessage === 'function') {
      const story = (char.story || '').toLowerCase();
      const isT = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(story);
      const isG = /温柔|温暖|亲切|可爱|软/.test(story);
      generateProactiveMessage('goodnight', char, isT, isG, null);
    } else {
      if (typeof addChatSystem === 'function') addChatSystem('🌙 晚安，好梦。明早见。');
    }
  } catch (e) { console.error('doSleepNow', e); }
}

/* ---- 页面渲染 ---- */
function renderSleep() {
  try {
    const wrap = document.getElementById('sleepWrap');
    if (!wrap) return;
    seedLastNightIfMissing();   // 进来顺手补一晚
    const r = sleepLastNight();
    const lastCard = document.getElementById('sleepLastCard');
    const hist = document.getElementById('sleepHistory');
    const bars = document.getElementById('sleepBars');
    if (!lastCard) return;

    if (!r) {
      lastCard.innerHTML = '<div style="text-align:center;color:#bbb;padding:26px 0;font-size:13px;">还没有昨晚的记录<br>睡前点下面「🌙 我睡了」，他就会记住</div>';
    } else {
      const hs = Math.floor(r.sleepMin / 60), ms = r.sleepMin % 60;
      const qColor = r.quality === 'good' ? '#4a9e6a' : r.quality === 'ok' ? '#d99a3c' : '#d96a5a';
      lastCard.innerHTML =
        '<div style="font-size:12px;color:#999;margin-bottom:8px;">昨晚 · ' + _sleepHM(r.bed) + ' 睡下 → ' + _sleepHM(r.wakeUp) + ' 醒' + (r.seeded ? ' <span style="color:#ccc;">（估算）</span>' : '') + '</div>' +
        '<div style="font-size:34px;font-weight:700;color:#3a5a6e;line-height:1.1;">' + hs + '<span style="font-size:15px;color:#8aa;"> 小时</span>' + (ms ? ' <span style="font-size:20px;color:#5b87a2;">' + ms + ' 分</span>' : '') + '</div>' +
        '<div style="margin-top:8px;font-size:13px;color:' + qColor + ';">' + _sleepQualityLabel(r.quality) +
        (r.wakeCount > 0 ? ' · 夜里醒 ' + r.wakeCount + ' 次' : ' · 一觉到天亮') + '</div>';
    }

    if (hist) {
      const keys = _sleepWeekKeys();
      let rows = '';
      keys.slice(0, 5).slice().reverse().forEach(function(o) {
        const rec = sleepData[o.key];
        if (!rec) return;
        const hs2 = Math.floor(rec.sleepMin / 60), ms2 = rec.sleepMin % 60;
        const d = o.d;
        const label = (d.getMonth() + 1) + '月' + d.getDate() + '日';
        rows += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f0f6f8;font-size:13px;color:#4a6a7a;">' +
          '<span>' + label + ' · ' + _sleepHM(rec.bed) + '→' + _sleepHM(rec.wakeUp) + '</span>' +
          '<span style="color:#5b87a2;font-weight:600;">' + hs2 + 'h' + (ms2 ? ms2 + 'm' : '') + '</span></div>';
      });
      hist.innerHTML = rows || '<div style="font-size:12px;color:#ccc;padding:8px 0;">再睡几晚就有记录了</div>';
    }

    if (bars) {
      const keys = _sleepWeekKeys();
      let b = '';
      keys.forEach(function(o) {
        const rec = sleepData[o.key];
        const min = rec ? rec.sleepMin : 0;
        const h = Math.max(3, Math.round(min / SLEEP_TARGET_MIN * 52));
        b += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:64px;">' +
          '<div style="width:14px;border-radius:4px;height:' + h + 'px;background:' + (rec && rec.quality === 'poor' ? '#d9b8a0' : '#a6ccdd') + ';opacity:' + (min ? 1 : 0.15) + ';"></div>' +
          '<div style="font-size:9px;color:#9ab;" title="' + (rec ? Math.floor(min / 60) + 'h' + (min % 60) + 'm' : '') + '">' + (o.d.getMonth() + 1) + '/' + o.d.getDate() + '</div></div>';
      });
      bars.innerHTML = b;
    }
  } catch (e) { console.error('renderSleep', e); }
}

/* 身体感应注入：昨晚睡得怎样（有近期记录才返回）——仿 buildHeartContext */
function buildSleepContext() {
  try {
    const r = sleepLastNight();
    if (!r) return '';
    if (Date.now() - r.wakeUp > 40 * 3600000) return '';   // 太久远不算"刚发生"
    const hs = Math.floor(r.sleepMin / 60), ms = r.sleepMin % 60;
    const feel = r.quality === 'good' ? '睡得很沉' : r.quality === 'ok' ? '睡了但不算沉' : '睡得不太好';
    return '【睡眠感应】你正"感觉"到她昨晚 ' + _sleepHM(r.bed) + ' 睡下、' + _sleepHM(r.wakeUp) + ' 醒来，睡了约 ' + hs + ' 小时' + (ms ? ms + ' 分' : '') +
      '，夜里醒 ' + r.wakeCount + ' 次，' + feel + '。\n用法：这是"感觉"不是诊断——可以自然关心她昨晚睡得好不好、提醒她别熬夜，但别装医生、别给医疗建议。';
  } catch (e) { return ''; }
}

/* ---- 初始化：补一晚 + 渲染 + 跨午夜定时补 + 回前台补 ---- */
function initSleep() {
  try {
    seedLastNightIfMissing();
    renderSleep();
    setInterval(function() { seedLastNightIfMissing(); if (typeof renderSleep === 'function') renderSleep(); }, 60000);
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) { seedLastNightIfMissing(); if (typeof renderSleep === 'function') renderSleep(); }
    });
  } catch (e) {
    console.error('initSleep', e);
    if (typeof addChatSystem === 'function') addChatSystem('⚠️ 睡眠初始化报错：' + (e && e.message || e));
  }
}
