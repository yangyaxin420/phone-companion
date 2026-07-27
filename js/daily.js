/* ==================== 晞晞日报 v2 ==================== */
/* 每天记一条 → 自动生成日报/周报/月报 + 骆云影点评 */

let _mode = 'daily';
let _curResult = null;
let _curReportId = null;

/* ===== 页面入口 ===== */
function showDaily() {
  navigateTo('page-daily');
  switchDailyMode('daily');
  renderDayList();
  renderReportList();
}

/* ===== Tab切换 ===== */
function switchDailyMode(mode) {
  _mode = mode;
  document.querySelectorAll('.daily-tab').forEach(b => {
    const isActive = b.dataset.mode === mode;
    b.style.background = isActive ? '#fff' : 'transparent';
    b.style.color = isActive ? '#333' : '#999';
    b.style.fontWeight = isActive ? '600' : '400';
  });
  renderInputArea();
  updateBtnText();
  document.getElementById('dailyResults').style.display = 'none';
}

function updateBtnText() {
  const btn = document.getElementById('dailyBtn');
  const labels = { daily:'🤖 生成今日日报', weekly:'🤖 生成周报', monthly:'🤖 生成月报' };
  btn.textContent = labels[_mode] || '🤖 生成报告';
}

/* ===== 输入区 ===== */
function renderInputArea() {
  const area = document.getElementById('dailyInputArea');
  const _now = new Date();
  const today = _fmtDate(_now);
  if (_mode === 'daily') {
    // 今天已有的记录
    const records = getDayRecords();
    const existing = records[today] || null;
    area.innerHTML = `
      <div style="font-size:12px;color:#999;margin-bottom:4px;">📅 日期</div>
      <input type="date" id="dailyDate" value="${today}" style="width:100%;padding:8px 10px;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;background:#fff;margin-bottom:8px;box-sizing:border-box;">
      <div style="font-size:12px;color:#999;margin-bottom:4px;">📝 今天做了什么？</div>
      <textarea id="dailyDayInput" placeholder="写写今天的事…&#10;骆云影晚上会看" style="width:100%;min-height:80px;padding:10px;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;line-height:1.6;resize:vertical;background:#fff;font-family:inherit;box-sizing:border-box;">${existing ? existing.text : ''}</textarea>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button onclick="saveDayRecord()" style="flex:1;padding:8px;background:#f0f0f0;border:none;border-radius:8px;font-size:13px;cursor:pointer;color:#555;">💾 保存今日记录</button>
        <button onclick="loadDayRecord()" style="padding:8px 12px;background:none;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;cursor:pointer;color:#888;">📂 加载</button>
      </div>
    `;
    // 日期变更时加载对应记录
    document.getElementById('dailyDate').addEventListener('change', function() {
      const records = getDayRecords();
      const rec = records[this.value] || null;
      document.getElementById('dailyDayInput').value = rec ? rec.text : '';
    });
  } else if (_mode === 'weekly') {
    const monday = getMonday(new Date());
    const sunday = getSunday(new Date());
    const allReports = lsGet('daily_reports', []);
    const weekReps = allReports.filter(r => r.mode === 'daily' && r.dateLabel >= monday && r.dateLabel <= sunday);
    area.innerHTML = `
      <div style="font-size:12px;color:#999;margin-bottom:4px;">📅 选择日期范围</div>
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <input type="date" id="dailyWeekStart" value="${monday}" style="flex:1;padding:8px 10px;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;background:#fff;box-sizing:border-box;">
        <span style="line-height:36px;color:#bbb;">—</span>
        <input type="date" id="dailyWeekEnd" value="${sunday}" style="flex:1;padding:8px 10px;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;background:#fff;box-sizing:border-box;">
      </div>
      <div style="font-size:12px;color:#999;margin-bottom:4px;">🎯 本周主题（可选）</div>
      <input type="text" id="dailyTheme" placeholder="例如：专心考试" style="width:100%;padding:8px 12px;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;background:#fff;box-sizing:border-box;">
      <div style="font-size:12px;color:#888;margin-top:6px;padding:8px 10px;background:#f8f9fe;border-radius:8px;">
        📊 本周已有日报 <strong>${weekReps.length}</strong> 篇${weekReps.length > 0 ? '（' + weekReps.map(r => r.dateLabel.slice(5)).join('、') + '）' : ''}
      </div>
    `;
  } else { // monthly
    const now = new Date();
    const ym = _fmtDate(now).slice(0,7);
    const allReports = lsGet('daily_reports', []);
    const monthReps = allReports.filter(r => r.mode === 'daily' && r.dateLabel.startsWith(ym));
    area.innerHTML = `
      <div style="font-size:12px;color:#999;margin-bottom:4px;">📅 选择月份</div>
      <input type="month" id="dailyMonth" value="${ym}" style="width:100%;padding:8px 10px;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;background:#fff;box-sizing:border-box;margin-bottom:8px;">
      <div style="font-size:12px;color:#999;margin-bottom:4px;">🎯 本月主题（可选）</div>
      <input type="text" id="dailyTheme" placeholder="例如：暑假探索" style="width:100%;padding:8px 12px;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;background:#fff;box-sizing:border-box;">
      <div style="font-size:12px;color:#888;margin-top:6px;padding:8px 10px;background:#f8f9fe;border-radius:8px;">
        📊 本月已有日报 <strong>${monthReps.length}</strong> 篇
      </div>
    `;
  }
}

/* ===== 保存每日记录 ===== */
function saveDayRecord() {
  const date = document.getElementById('dailyDate')?.value;
  const text = document.getElementById('dailyDayInput')?.value.trim();
  if (!date || !text) { showDailyToast('📝 写点今天的记录吧'); return; }
  const records = getDayRecords();
  records[date] = { text, savedAt: new Date().toISOString() };
  lsSet('day_records', records);
  renderDayList();
  showDailyToast('✅ 今日已记录！');
}

function loadDayRecord() {
  const date = document.getElementById('dailyDate')?.value;
  if (!date) return;
  const records = getDayRecords();
  const rec = records[date];
  if (!rec) { showDailyToast('📭 这天还没记录'); return; }
  document.getElementById('dailyDayInput').value = rec.text;
  showDailyToast('📂 已加载 ' + date + ' 的记录');
}

function getDayRecords() {
  return lsGet('day_records', {});
}

/* ===== 生成报告 ===== */
async function generateDailyReport() {
  let text = '';
  let dateLabel = '';
  let theme = '';

  if (_mode === 'daily') {
    const date = document.getElementById('dailyDate')?.value;
    const dayInput = document.getElementById('dailyDayInput')?.value.trim();
    if (dayInput) {
      // 先用输入框的，如果没有再用已保存的
      text = dayInput;
    } else {
      const records = getDayRecords();
      text = records[date]?.text || '';
    }
    if (!text) { showDailyToast('📝 先写点今天的记录'); return; }
    dateLabel = date;
  } else if (_mode === 'weekly') {
    const start = document.getElementById('dailyWeekStart')?.value;
    const end = document.getElementById('dailyWeekEnd')?.value;
    if (!start || !end) { showDailyToast('📅 选一下日期范围'); return; }
    theme = document.getElementById('dailyTheme')?.value.trim() || '';
    // 优先从历史日报中读取
    const allReports = lsGet('daily_reports', []);
    const dailyReps = allReports.filter(r => r.mode === 'daily' && r.dateLabel >= start && r.dateLabel <= end);
    const entries = dailyReps.flatMap(r =>
      (r.comments || []).map(c => `【${r.dateLabel}】${c.event}`)
    );
    if (entries.length === 0) { showDailyToast('📭 这个区间还没有日报，先生成几天日报再来'); return; }
    text = entries.join('\n\n');
    dateLabel = start + '~' + end;
  } else { // monthly
    const ym = document.getElementById('dailyMonth')?.value;
    if (!ym) { showDailyToast('📅 选一下月份'); return; }
    theme = document.getElementById('dailyTheme')?.value.trim() || '';
    // 优先从历史日报中读取
    const allReports = lsGet('daily_reports', []);
    const dailyReps = allReports.filter(r => r.mode === 'daily' && r.dateLabel.startsWith(ym));
    const entries = dailyReps.flatMap(r =>
      (r.comments || []).map(c => `【${r.dateLabel}】${c.event}`)
    );
    if (entries.length === 0) { showDailyToast('📭 这个月还没有日报，先生成几天日报再来'); return; }
    text = entries.join('\n\n');
    dateLabel = ym;
  }

  // 调用AI
  var btn = document.getElementById('dailyBtn');
  btn.disabled = true;
  btn.textContent = '⏳ 骆云影正在看…';
  document.getElementById('dailyResults').innerHTML =
    '<div style="text-align:center;padding:40px;color:#888;font-size:13px;"><div style="font-size:32px;margin-bottom:8px;">💭</div>骆云影在翻看你的记录…</div>';
  document.getElementById('dailyResults').style.display = 'block';

  try {
    var result;
    if (apiConfig && apiConfig.apiKey) {
      result = await callDailyAI(text, dateLabel, theme, _mode);
    } else {
      result = dailyRuleParse(text);
    }
    var rid = saveReport(_mode, dateLabel, theme, result);
    renderReport(result, theme, rid);
    renderReportList();
    showDailyToast('✅ ' + ({ daily:'日报', weekly:'周报', monthly:'月报' }[_mode] || '报告') + '生成完毕！');
  } catch(e) {
    console.error(e);
    document.getElementById('dailyResults').innerHTML =
      '<div style="text-align:center;padding:40px;color:#e55;font-size:13px;">❌ ' + e.message + '</div>';
    showDailyToast('❌ 生成失败');
  } finally {
    btn.disabled = false;
    updateBtnText();
  }
}

/* ===== AI调用 ===== */
async function callDailyAI(text, dateLabel, theme, mode) {
  const pName = (personaData && personaData.name) || '骆云影';
  const story = (personaData && personaData.story) || '黑色中长发，灰蓝色眼睛，178cm。ISTP，傲娇暴躁毒舌刻薄，嘴硬心软。';
  const un = (userPersona && userPersona.name) || '你';
  const modeLabel = { daily:'今天', weekly:'这周', monthly:'这个月' }[mode] || '这段时间';
  const tLine = theme ? `\n${un}给${modeLabel}定的主题是：${theme}` : '';

  const isMonthly = mode === 'monthly';
  const kwPart = isMonthly ? `\n\n另外，请从这${modeLabel}的记录中提炼出3-5个关键词（这个${modeLabel}的关键主题/情绪/事件），放在"keywords"数组中。` : '';

  const sp = `你是${pName}。${story}
傲娇暴躁，嘴硬心软，说话简洁冷淡带刺，但偶尔会透出关心。讨厌肉麻和废话。
${un}发来了ta在${dateLabel}（${modeLabel}）的记录。${tLine}
请以你的风格，逐条点评每条事件。每条点评1-2句话，毒舌但透着关心，用「你」称呼。
不要用动作描写，不要加emoji，不要长篇大论。${kwPart}
返回严格JSON（不要markdown代码块）：
{
  ${isMonthly ? '"keywords": ["关键词1","关键词2","关键词3"],' : ''}
  "comments": [
    { "event": "事件原文", "yunying_says": "毒舌点评" }
  ],
  "overall": "一句话总结（毒舌但关心）"
}`;

  const apiUrl = (apiConfig.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '') + '/chat/completions';
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.apiKey },
    body: JSON.stringify({
      model: apiConfig.model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: sp + '\n\n用户记录如下：' },
        { role: 'user', content: text }
      ],
      temperature: 0.7, max_tokens: 4096
    })
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`API错误(${resp.status})`);
  }
  const json = await resp.json();
  const content = json.choices?.[0]?.message?.content || '';
  const jm = content.match(/\{[\s\S]*\}/);
  if (jm) return JSON.parse(jm[0]);
  throw new Error('AI返回格式不对，重新试试');
}

/* ===== 关键词规则兜底 ===== */
function dailyRuleParse(text) {
  const sents = text.split(/[。，；\n]+/).map(s => s.trim()).filter(s => s.length > 2);
  const rules = [
    { cat:'学习', kw:['考试','六级','期末','课','社会实践','PPT','作业','学'] },
    { cat:'生活', kw:['逛街','吃','饭','DIY','戒指','买','去'] },
    { cat:'娱乐', kw:['电影','视频','游戏','画画','约稿','看'] },
    { cat:'健康', kw:['运动','睡','情绪','累','健康'] },
    { cat:'发展', kw:['项目','网站','代码','PWA','写','职业','规划','AI'] }
  ];
  function cls(s) { for (const r of rules) { for (const kw of r.kw) { if (s.includes(kw)) return r.cat; } } return '生活'; }
  const pool = {
    '学习':['啧，学习了啊？难得。','行吧至少还在学。'],
    '生活':['日子过得挺滋润啊。','你这小日子可以的。'],
    '娱乐':['玩儿得挺欢。','又摸鱼是吧。'],
    '健康':['注意身体行不行。','别把自己搞垮了。'],
    '发展':['哟，在搞正事了？','不错嘛，有点东西。']
  };
  return {
    keywords: _mode === 'monthly' ? ['生活','学习','娱乐'] : undefined,
    comments: sents.map(s => {
      const p = pool[cls(s)] || ['嗯。'];
      return { event: s, yunying_says: p[Math.floor(Math.random() * p.length)] };
    }),
    overall: `一共${sents.length}件事，还行吧。`
  };
}

/* ===== 渲染报告 ===== */
function renderReport(result, theme, reportId) {
  _curResult = result;
  _curReportId = reportId;
  const container = document.getElementById('dailyResults');
  const charName = (personaData && personaData.name) || '骆云影';
  if (!result || !result.comments || result.comments.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;font-size:13px;">📭 没分析出事件</div>';
    return;
  }
  const cc = { '学习':'#90CAF9','生活':'#FFB74D','娱乐':'#E57373','健康':'#81C784','发展':'#BA68C8' };
  function guessCat(t) {
    if (/考试|六级|期末|课|社会实践|PPT|作业|学/.test(t)) return '学习';
    if (/逛街|吃|饭|DIY|戒指|买|去/.test(t)) return '生活';
    if (/电影|视频|游戏|画画|约稿|看/.test(t)) return '娱乐';
    if (/运动|睡|情绪|累|健康/.test(t)) return '健康';
    if (/项目|网站|代码|PWA|写|职业|规划|AI/.test(t)) return '发展';
    return '生活';
  }

  let html = '';
  // 月报显示关键词
  if (_mode === 'monthly' && result.keywords && result.keywords.length > 0) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">`;
    result.keywords.forEach(kw => {
      html += `<span style="padding:4px 12px;border-radius:14px;background:linear-gradient(135deg,#667eea20,#764ba220);color:#667eea;font-size:12px;font-weight:600;">#${escHtml(kw)}</span>`;
    });
    html += `</div>`;
  }

  if (result.overall) {
    html += `<div style="background:linear-gradient(135deg,#f0f4ff,#fff);border-radius:16px;padding:16px;margin-bottom:16px;border:1px solid #e8eeff;">
      <div style="font-size:13px;font-weight:600;color:#5B7FFF;margin-bottom:6px;">💬 ${charName}说</div>
      <div style="font-size:14px;line-height:1.7;color:#333;">${result.overall}</div>
    </div>`;
  }

  result.comments.forEach((c, i) => {
    const cat = guessCat(c.event);
    const color = cc[cat] || '#999';
    const un = c.userNote ? c.userNote : '<span style="color:#bbb;font-style:italic;">✏️ 写批注</span>';
    html += `<div class="daily-card" style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:11px;color:#999;min-width:50px;">#${i+1}</span>
        <span style="font-size:12px;padding:2px 10px;border-radius:10px;background:${color}20;color:${color};font-weight:500;">${cat}</span>
        <span style="flex:1;"></span>
        <button onclick="delReportComment(${i})" style="font-size:12px;color:#ccc;background:none;border:none;cursor:pointer;padding:2px 4px;" title="删除这条">✕</button>
      </div>
      <div style="font-size:13px;color:#555;line-height:1.6;margin-bottom:8px;padding-left:4px;border-left:2px solid #eee;">${c.event}</div>
      <div style="background:#f8f9fe;border-radius:10px;padding:10px 12px;font-size:14px;color:#333;line-height:1.6;margin-bottom:8px;">
        <span style="color:#5B7FFF;font-weight:600;">${charName}</span>：${c.yunying_says}
      </div>
      <div class="daily-note" data-idx="${i}" contenteditable="false"
        style="font-size:13px;color:#888;padding:6px 8px;border-radius:8px;border:1px dashed #e0e0e0;cursor:text;transition:.15s;"
        onclick="editReportNote(${i})"
        onfocus="this.style.borderColor='#5B7FFF';this.style.background='#f8f9fe';"
        onblur="saveReportNote(${i})"
        onkeydown="if(event.key=='Enter'&&!event.shiftKey){event.preventDefault();this.blur();}">${un}</div>
    </div>`;
  });

  // 月报底部加复盘按钮
  if (_mode === 'monthly') {
    const savedReport = lsGet('daily_reports', []).find(r => r.id == reportId);
    const hasReview = savedReport && savedReport.reviewNote;
    html += `<div style="margin-top:16px;border-top:2px dashed #e8eeff;padding-top:14px;">
      <button onclick="toggleReview(${reportId})" style="width:100%;padding:10px;background:#f8f9fe;border:1px solid #e0e8ff;border-radius:12px;font-size:13px;font-weight:600;color:#667eea;cursor:pointer;">
        📋 复盘${hasReview ? ' ✓' : ''}
      </button>
      <div id="reviewArea_${reportId}" style="display:${hasReview ? 'block' : 'none'};margin-top:8px;">
        <textarea id="reviewInput_${reportId}" placeholder="写写这个月的复盘反思…" style="width:100%;min-height:80px;padding:10px;border:1px solid #e0e0e0;border-radius:10px;font-size:13px;line-height:1.6;resize:vertical;background:#fff;font-family:inherit;box-sizing:border-box;">${hasReview || ''}</textarea>
        <button onclick="saveReview(${reportId})" style="width:100%;padding:8px;margin-top:6px;background:#667eea;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">💾 保存复盘</button>
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

/* ===== 复盘 ===== */
function toggleReview(reportId) {
  const area = document.getElementById('reviewArea_' + reportId);
  if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

function saveReview(reportId) {
  const input = document.getElementById('reviewInput_' + reportId);
  if (!input) return;
  const text = input.value.trim();
  var reports = lsGet('daily_reports', []);
  var r = reports.find(r => r.id == reportId);
  if (r) {
    r.reviewNote = text;
    lsSet('daily_reports', reports);
  }
  showDailyToast(text ? '✅ 复盘已保存' : '🗑 复盘已清空');
}

/* ===== 批注 ===== */
function editReportNote(idx) {
  const el = document.querySelector(`.daily-note[data-idx="${idx}"]`);
  if (!el || el.contentEditable === 'true') return;
  el.contentEditable = 'true'; el.focus();
  const r = document.createRange(); r.selectNodeContents(el);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
}

function saveReportNote(idx) {
  const el = document.querySelector(`.daily-note[data-idx="${idx}"]`);
  if (!el) return;
  el.style.borderColor = '#e0e0e0'; el.style.background = '';
  const text = el.textContent.trim();
  el.innerHTML = text ? text : '<span style="color:#bbb;font-style:italic;">✏️ 写批注</span>';
  el.contentEditable = 'false';
  if (_curResult && _curResult.comments[idx]) _curResult.comments[idx].userNote = text;
  updateReportComment(_curReportId, idx, { userNote: text });
}

/* ===== 删除单条点评 ===== */
function delReportComment(idx) {
  if (!_curResult || !_curResult.comments[idx]) return;
  if (!confirm('🗑️ 删除这条？')) return;
  _curResult.comments.splice(idx, 1);
  updateReportComments(_curReportId, _curResult.comments);
  renderReport(_curResult, document.querySelector('#dailyTheme')?.value || '', _curReportId);
}

/* ===== 数据 ===== */
function saveReport(mode, dateLabel, theme, result) {
  var reports = lsGet('daily_reports', []);
  var id = Date.now();
  reports.unshift({
    id, mode, dateLabel, theme: theme || '',
    keywords: result.keywords || [],
    overall: result.overall || '',
    comments: (result.comments || []).map(c => ({
      event: c.event, yunying_says: c.yunying_says, userNote: c.userNote || ''
    })),
    reviewNote: '',
    createdAt: new Date().toISOString()
  });
  if (reports.length > 30) reports = reports.slice(0, 30);
  lsSet('daily_reports', reports);
  return id;
}

function updateReportComment(reportId, idx, updates) {
  if (!reportId) return;
  var reports = lsGet('daily_reports', []);
  var r = reports.find(r => r.id == reportId);
  if (r && r.comments && r.comments[idx]) {
    Object.assign(r.comments[idx], updates);
    lsSet('daily_reports', reports);
  }
}

function updateReportComments(reportId, comments) {
  if (!reportId) return;
  var reports = lsGet('daily_reports', []);
  var r = reports.find(r => r.id == reportId);
  if (r) { r.comments = comments; lsSet('daily_reports', reports); }
}

/* ===== 每日记录列表 ===== */
function renderDayList() {
  const container = document.getElementById('dailyDayList');
  const records = getDayRecords();
  const keys = Object.keys(records).sort().reverse().slice(0, 10);
  if (keys.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:#bbb;margin-top:8px;">📭 还没有每日记录，在「日报」tab记吧</div>';
    return;
  }
  let html = '<div style="font-size:12px;color:#bbb;margin-bottom:6px;margin-top:8px;">📂 每日记录</div>';
  keys.forEach(d => {
    const rec = records[d];
    const preview = rec.text.length > 30 ? rec.text.slice(0, 30) + '…' : rec.text;
    html += `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12px;color:#888;cursor:pointer;"
      onclick="loadDayToEdit('${d}')">
      <span style="min-width:70px;font-weight:500;">${d}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aaa;">${preview}</span>
      <button onclick="event.stopPropagation();delDayRecord('${d}')" style="font-size:11px;color:#ddd;background:none;border:none;cursor:pointer;">✕</button>
    </div>`;
  });
  container.innerHTML = html;
}

function loadDayToEdit(dateStr) {
  switchDailyMode('daily');
  document.getElementById('dailyDate').value = dateStr;
  const records = getDayRecords();
  document.getElementById('dailyDayInput').value = records[dateStr]?.text || '';
  showDailyToast('📂 已加载 ' + dateStr);
}

function delDayRecord(dateStr) {
  if (!confirm('🗑️ 删除 ' + dateStr + ' 的记录？')) return;
  var records = getDayRecords();
  delete records[dateStr];
  lsSet('day_records', records);
  renderDayList();
}

/* ===== 历史报告列表 ===== */
function renderReportList() {
  const container = document.getElementById('dailyReportList');
  const reports = lsGet('daily_reports', []);
  if (reports.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:#bbb;margin-top:8px;"></div>';
    return;
  }
  const modeLabel = { daily:'日报', weekly:'周报', monthly:'月报' };
  let html = '<div style="font-size:12px;color:#bbb;margin-bottom:6px;margin-top:8px;">📂 历史报告</div>';
  reports.slice(0, 8).forEach(r => {
    var ds = r.createdAt ? r.createdAt.slice(0,10) : '';
    html += `<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12px;">
      <span style="cursor:pointer;flex:1;color:#888;" onclick="loadReport(${r.id})">
        <span style="font-weight:500;">${modeLabel[r.mode] || '报告'}</span> ${r.dateLabel || ''}
        <span style="color:#ccc;">${r.comments ? r.comments.length : 0}条</span>
        <span style="float:right;color:#ddd;">${ds}</span>
      </span>
      <button onclick="delReport(${r.id})" style="font-size:12px;color:#ddd;background:none;border:none;cursor:pointer;">🗑️</button>
    </div>`;
  });
  container.innerHTML = html;
}

function loadReport(reportId) {
  var reports = lsGet('daily_reports', []);
  var r = reports.find(r => r.id == reportId);
  if (!r) { showDailyToast('❌ 报告未找到'); return; }
  _mode = r.mode || 'daily';
  // 更新tab样式
  document.querySelectorAll('.daily-tab').forEach(b => {
    const isActive = b.dataset.mode === _mode;
    b.style.background = isActive ? '#fff' : 'transparent';
    b.style.color = isActive ? '#333' : '#999';
    b.style.fontWeight = isActive ? '600' : '400';
  });
  updateBtnText();
  renderReport({ comments: r.comments || [], overall: r.overall || '', keywords: r.keywords || [] }, r.theme, r.id);
  document.getElementById('dailyResults').style.display = 'block';
}

function delReport(reportId) {
  if (!confirm('🗑️ 删除这份报告？')) return;
  var reports = lsGet('daily_reports', []);
  reports = reports.filter(r => r.id != reportId);
  lsSet('daily_reports', reports);
  renderReportList();
  if (_curReportId == reportId) { _curResult = null; _curReportId = null; document.getElementById('dailyResults').style.display = 'none'; }
}

/* ===== 工具 ===== */
function _fmtDate(dt) {
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
function getMonday(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay();
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1));
  return _fmtDate(dt);
}
function getSunday(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day === 0 ? 0 : 7 - day));
  return _fmtDate(dt);
}
function getDateRange(start, end) {
  const dates = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const d = new Date(sy, sm - 1, sd);
  const endD = new Date(ey, em - 1, ed);
  while (d <= endD) {
    dates.push(_fmtDate(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/* ===== 示例 ===== */
function fillDailyDemo() {
  if (_mode === 'daily') {
    document.getElementById('dailyDayInput').value = '今天终于把论文写完了，下午去操场跑了3圈，晚上看了一集动漫。';
  } else if (_mode === 'weekly') {
    document.getElementById('dailyTheme').value = '充实的一周';
    showDailyToast('✨ 示例已填充！调的日期范围就是本周');
  } else {
    document.getElementById('dailyTheme').value = '期末+暑假过渡';
    showDailyToast('✨ 示例已填充！调月份直接点生成');
  }
}

/* ===== Toast ===== */
function showDailyToast(msg) {
  var t = document.getElementById('dailyToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'dailyToast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:10px;font-size:13px;z-index:999;opacity:0;transition:opacity .3s;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}
