/* ==================== 课表（Excel式网格） + 值班（日期罗列） ==================== */
// 数据存 lsGet('course')。schema='course2'。
// 默认课表 = 晞晞 2026-2027-1 学实课表（2026-09-14 第1周周一），PDF逐列解析。
// 网格：横=周一~周五，纵=第1~12节单位行；课按 {s..e} 跨行(rowspan)。
// 周数变通：w1..w2 覆盖「前几周/后几周」，parity 单/双/每周；本周不在区间自动不显示。
// 命名：页级渲染入口 renderCourse()（renderSchedule 已被 tasks.js 占用，勿重名）。
const COURSE_WEEK_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const COURSE_PARITY_CN = { all: '每周', odd: '单周', even: '双周' };

/* ---- 默认课表：杨雅鑫 2026-2027-1（13门，周三无课） ---- */
const COURSE_DEFAULT = {
  semesterStart: '2026-09-14',
  items: [
    { day: 1, s: 1,  e: 2,  name: '法律社会学', room: 'L4-312', w1: 1,  w2: 16, parity: 'all' },
    { day: 1, s: 3,  e: 5,  name: '个案工作', room: 'L4-312', w1: 1,  w2: 16, parity: 'all' },
    { day: 1, s: 6,  e: 7,  name: '形势与政策', room: 'L4-213', w1: 9,  w2: 12, parity: 'all' },
    { day: 1, s: 10, e: 12, name: '党史', room: 'L4-229', w1: 2,  w2: 7,  parity: 'all' },
    { day: 2, s: 3,  e: 5,  name: '军事理论', room: 'L4-106', w1: 1,  w2: 7,  parity: 'all' },
    { day: 2, s: 6,  e: 7,  name: '高级影视听说', room: 'L4-212', w1: 1,  w2: 16, parity: 'all' },
    { day: 2, s: 10, e: 12, name: '数值方法', room: 'L4-115', w1: 2,  w2: 17, parity: 'all' },
    { day: 4, s: 3,  e: 4,  name: '乒乓球(初级)', room: '乒乓球馆', w1: 1, w2: 16, parity: 'all' },
    { day: 4, s: 6,  e: 8,  name: '毛泽东思想和中国特色社会主义理论体系概论', room: 'L4-219', w1: 1, w2: 16, parity: 'all' },
    { day: 4, s: 10, e: 12, name: '社会政策概论', room: 'L4-312', w1: 1,  w2: 16, parity: 'all' },
    { day: 5, s: 1,  e: 2,  name: '数据分析与统计软件应用', room: 'L4-334', w1: 1, w2: 16, parity: 'all' },
    { day: 5, s: 3,  e: 5,  name: '社会统计学', room: 'L4-334', w1: 1,  w2: 16, parity: 'all' },
    { day: 5, s: 6,  e: 7,  name: '城市社会学', room: 'L4-334', w1: 1,  w2: 16, parity: 'all' },
    { day: 5, s: 8,  e: 9,  name: '非营利组织财务管理', room: 'L4-315', w1: 1, w2: 16, parity: 'all' }
  ],
  duties: []
};

let courseData = lsGet('course', null);
let _courseFormParity = 'all';   // 弹窗里当前选中的 每周/单/双
const _coursePalette = [
  { bg: '#e3eef6', bd: '#4a7ba6', fg: '#24496b' },
  { bg: '#e5f1ea', bd: '#3f8f6b', fg: '#2b5a44' },
  { bg: '#f6eee2', bd: '#c98a3c', fg: '#6b4a20' },
  { bg: '#eee8f6', bd: '#8a63b8', fg: '#4f3573' },
  { bg: '#fbe9e2', bd: '#d96a5a', fg: '#8a3528' },
  { bg: '#e4f2f1', bd: '#2f8f9e', fg: '#1c5963' }
];

/* ==================== 工具 ==================== */
function _cPad(n) { return String(n).padStart(2, '0'); }
function _cEsc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
function courseDateKey(d) { return d.getFullYear() + '-' + _cPad(d.getMonth() + 1) + '-' + _cPad(d.getDate()); }
function courseDayNum(d) { const g = d.getDay(); return g === 0 ? 7 : g; }
function courseMonday(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = r.getDay() === 0 ? -6 : 1 - r.getDay();
  r.setDate(r.getDate() + diff); r.setHours(0, 0, 0, 0);
  return r;
}
function courseWeekNumber(day) {   // 开学日起算的第几周；未开学→0（day 可传，测试用）
  const sd = courseData && courseData.semesterStart;
  if (!sd) return 0;
  const p = String(sd).split('-');
  if (p.length !== 3) return 0;
  const startMs = new Date(+p[0], +p[1] - 1, +p[2]).getTime();
  const mon = courseMonday(day || new Date()).getTime();
  const diffDays = Math.floor((mon - startMs) / 86400000);
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7) + 1;
}
function _viewWeek() { const w = courseWeekNumber(); return w < 1 ? 1 : w; }   // 未开学→预览第1周
function courseIsOdd(week) { return week % 2 === 1; }
function courseActiveWeek(it, week) {   // 本周在不在课的周数区间（含单双）
  const w1 = it.w1 || 1, w2 = it.w2 || 16;
  if (week < w1 || week > w2) return false;
  if (it.parity === 'odd') return courseIsOdd(week);
  if (it.parity === 'even') return !courseIsOdd(week);
  return true;
}
function _courseUid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _dayItems(day, week) {
  return courseData.items.filter(function(it) { return it.day === day && courseActiveWeek(it, week); })
    .sort(function(a, b) { return a.s - b.s; });
}
function _color(name) {
  let h = 0; const n = String(name || '');
  for (let i = 0; i < n.length; i++) h = (h + n.charCodeAt(i)) % 997;
  return _coursePalette[h % _coursePalette.length];
}

/* ==================== 存取 / 初始化默认 ==================== */
function courseSave() { if (courseData) lsSet('course', courseData); }
function courseSeedDefault() {
  courseData = { schema: 'course2', semesterStart: COURSE_DEFAULT.semesterStart, items: [], duties: [] };
  COURSE_DEFAULT.items.forEach(function(it) {
    courseData.items.push(Object.assign({ id: _courseUid() }, it));
  });
  courseSave();
}
function courseEnsure() {
  const raw = lsGet('course', null);
  if (raw && raw.schema === 'course2') {                       // 已是新版：修字段即可
    courseData = raw;
    if (!Array.isArray(courseData.items)) courseData.items = [];
    if (!Array.isArray(courseData.duties)) courseData.duties = [];
    if (typeof courseData.semesterStart !== 'string') courseData.semesterStart = COURSE_DEFAULT.semesterStart;
    courseData.items.forEach(function(it) {
      if (!it) return;
      it.day = (+it.day >= 1 && +it.day <= 5) ? +it.day : 1;
      it.s = +it.s || 1; it.e = +it.e || it.s;
      if (it.e < it.s) { const t = it.s; it.s = it.e; it.e = t; }
      it.name = String(it.name || '').trim() || '课程';
      it.room = String(it.room || '').trim();
      it.w1 = +it.w1 || 1; it.w2 = +it.w2 || 16;
      if (it.w2 < it.w1) it.w2 = it.w1;
      it.parity = (it.parity === 'odd' || it.parity === 'even') ? it.parity : 'all';
    });
    return;
  }
  // 旧版(无 schema 或其它) → 备份后内置新默认
  if (raw) lsSet('course_v1_backup', raw);
  courseSeedDefault();
  if (typeof addChatSystem === 'function') addChatSystem('📚 已按你的 PDF 排好本学期课表（可进课表页改动）');
}

/* ==================== 页面渲染 ==================== */
function renderCourse() {
  try {
    if (!courseData) courseEnsure();
    const page = document.getElementById('page-course');
    if (!page) return;
    // 顶部：今日 + 第几周
    const now = new Date();
    const w = courseWeekNumber(now);
    const infoEl = document.getElementById('courseWeekInfo');
    if (infoEl) {
      infoEl.innerHTML = COURSE_WEEK_CN[courseDayNum(now) - 1] + ' · ' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
    }
    const sdEl = document.getElementById('courseStartDate');
    if (sdEl && sdEl.value !== (courseData.semesterStart || '')) sdEl.value = courseData.semesterStart || '';
    const badge = document.getElementById('courseWeekBadge');
    if (badge) {
      if (w < 1) badge.innerHTML = '未开学 · <b>预览第1周</b>（' + (courseData.semesterStart || '?') + ' 开学）';
      else badge.innerHTML = '第 <b>' + w + '</b> 周 · ' + (courseIsOdd(w) ? '单周' : '双周');
    }
    courseRenderGrid(w < 1 ? 1 : w);
    courseRenderDuty();
  } catch (e) { console.error('renderCourse', e); }
}

/* 网格：行=第1~12节，列=周一~周五；课从第s节 rowspan 到第e节 */
function courseRenderGrid(week) {
  const el = document.getElementById('courseGrid');
  if (!el) return;
  const now = new Date();
  const today = courseDayNum(now);
  const mon = courseMonday(now);
  const byDay = [null, [], [], [], [], []];      // 1..5
  courseData.items.forEach(function(it) { if (it.day >= 1 && it.day <= 5 && courseActiveWeek(it, week)) byDay[it.day].push(it); });
  for (let d = 1; d <= 5; d++) byDay[d].sort(function(a, b) { return a.s - b.s; });

  let h = '<table class="course-t"><colgroup><col style="width:42px"><col><col><col><col><col></colgroup><thead><tr><th class="course-dl"></th>';
  for (let d = 1; d <= 5; d++) {
    const dd = new Date(mon); dd.setDate(mon.getDate() + d - 1);
    const on = d === today;
    h += '<th class="course-dh' + (on ? ' on' : '') + '">' + COURSE_WEEK_CN[d - 1] +
      '<span>' + (dd.getMonth() + 1) + '/' + dd.getDate() + '</span></th>';
  }
  h += '</tr></thead><tbody>';

  const idx = [0, 0, 0, 0, 0, 0];                 // 每天读到第几条
  for (let p = 1; p <= 12; p++) {
    let cells = '<td class="course-pl">第' + p + '节</td>';
    for (let d = 1; d <= 5; d++) {
      const arr = byDay[d];
      const prev = idx[d] > 0 ? arr[idx[d] - 1] : null;   // 上一个已开始跨行的课
      const it = arr[idx[d]];
      if (it && p === it.s) { cells += courseBlockTd(it); idx[d]++; }
      else if (prev && p > prev.s && p <= prev.e) { /* 被 prev 的 rowspan 覆盖，本行不放格 */ }
      else cells += '<td class="course-open' + (d === today ? ' ctd' : '') + '" onclick="openCourseAdd(' + d + ',' + p + ')"></td>';
    }
    h += '<tr>' + cells + '</tr>';
  }
  h += '</tbody></table>';
  el.innerHTML = h;
}
function courseBlockTd(it) {
  const c = _color(it.name);
  const span = (it.e - it.s + 1);
  const sub = it.e > it.s ? '<div class="course-cs">' + it.s + '-' + it.e + '节</div>' : '';
  const rm = it.room ? '<div class="course-cr">' + _cEsc(it.room) + '</div>' : '';
  return '<td rowspan="' + span + '" class="course-block" onclick="openCourseEdit(\'' + it.id + '\')" style="background:' + c.bg + ';border-left:3px solid ' + c.bd + ';color:' + c.fg + ';">' +
    '<div class="course-cn">' + _cEsc(it.name) + '</div>' + sub + rm + '</td>';
}

/* 值班：按日期罗列（今天置顶高亮，过去置灰沉底） */
function courseRenderDuty() {
  const el = document.getElementById('courseDutyList');
  if (!el) return;
  const arr = (courseData.duties || []).slice();
  if (!arr.length) {
    el.innerHTML = '<div style="font-size:12px;color:#c6d6df;text-align:center;padding:16px 0;">还没有值班安排<br><span style="font-size:11px;">点右上「➕」按日期加一条，他到时提醒你</span></div>';
    return;
  }
  arr.sort(function(a, b) { return (a.date < b.date) ? -1 : (a.date > b.date ? 1 : (a.t0 < b.t0 ? -1 : 1)); });
  const todayKey = courseDateKey(new Date());
  const html = arr.map(function(x) {
    const past = x.date < todayKey;
    const today = x.date === todayKey;
    const dm = String(x.date).split('-');
    const dt = dm.length === 3 ? new Date(+dm[0], +dm[1] - 1, +dm[2]) : null;
    const dow = dt ? COURSE_WEEK_CN[courseDayNum(dt) - 1] : '';
    const main = (x.name ? x.name : '值班') + (x.loc ? ' · ' + x.loc : '');
    return '<div class="duty-row' + (today ? ' duty-today' : '') + (past ? ' duty-past' : '') + '">' +
      '<div class="duty-d">' + (+dm[1]) + '月' + (+dm[2]) + '日 ' + dow +
      '<span class="duty-t">' + (x.t0 || '') + (x.t1 ? '–' + x.t1 : '') + '</span></div>' +
      '<div class="duty-m">' + _cEsc(main) + '</div>' +
      '<button onclick="deleteDuty(\'' + x.id + '\')" style="flex:none;background:none;border:none;color:#d9a6a0;font-size:14px;cursor:pointer;padding:2px;">✕</button></div>';
  }).join('');
  el.innerHTML = html;
}

/* ==================== 课程增删改（点格弹窗） ==================== */
function openCourseAdd(day, p) {
  const m = document.getElementById('courseModal');
  if (!m) return;
  document.getElementById('courseModalTitle').textContent = '➕ 加课';
  document.getElementById('courseFormId').value = '';
  document.getElementById('courseFormDay').value = String(day || 1);
  document.getElementById('courseFormS').value = String(p || 1);
  document.getElementById('courseFormE').value = String(Math.min((p || 1) + 1, 12));
  document.getElementById('courseFormName').value = '';
  document.getElementById('courseFormRoom').value = '';
  document.getElementById('courseFormW1').value = '1';
  document.getElementById('courseFormW2').value = '16';
  setCourseParityForm('all');
  const del = document.getElementById('courseFormDel');
  if (del) del.style.display = 'none';
  m.style.display = 'flex';
}
function openCourseEdit(id) {
  const it = (courseData.items || []).find(function(x) { return x.id === id; });
  if (!it) return;
  const m = document.getElementById('courseModal');
  if (!m) return;
  document.getElementById('courseModalTitle').textContent = '✎ 编辑';
  document.getElementById('courseFormId').value = id;
  document.getElementById('courseFormDay').value = String(it.day);
  document.getElementById('courseFormS').value = String(it.s);
  document.getElementById('courseFormE').value = String(it.e);
  document.getElementById('courseFormName').value = it.name;
  document.getElementById('courseFormRoom').value = it.room || '';
  document.getElementById('courseFormW1').value = String(it.w1);
  document.getElementById('courseFormW2').value = String(it.w2);
  setCourseParityForm(it.parity || 'all');
  const del = document.getElementById('courseFormDel');
  if (del) del.style.display = 'inline-block';
  m.style.display = 'flex';
}
function courseFormCancel() { const m = document.getElementById('courseModal'); if (m) m.style.display = 'none'; }
function courseFormDelete() {
  const id = document.getElementById('courseFormId').value;
  if (!id || !confirm('删掉这门课吗？')) return;
  courseData.items = courseData.items.filter(function(x) { return x.id !== id; });
  courseSave(); courseFormCancel(); renderCourse();
}
function setCourseParityForm(k) {
  _courseFormParity = (k === 'odd' || k === 'even') ? k : 'all';
  ['all', 'odd', 'even'].forEach(function(v) {
    const el = document.getElementById('courseFormParity_' + v);
    if (!el) return;
    const on = v === _courseFormParity;
    el.className = 'course-seg' + (on ? ' on' : '');
    el.style.color = on ? (v === 'odd' ? '#2c5a78' : v === 'even' ? '#2c5a78' : '#2c5a78') : '#6f94ab';
  });
}
function courseFormTerm() {   // 快捷：整学期（1-16周，每周）
  const w1 = document.getElementById('courseFormW1');
  const w2 = document.getElementById('courseFormW2');
  if (w1) w1.value = '1';
  if (w2) w2.value = '16';
  setCourseParityForm('all');
}
function courseFormSave() {
  try {
    const id = document.getElementById('courseFormId').value;
    const name = (document.getElementById('courseFormName').value || '').trim();
    const day = +document.getElementById('courseFormDay').value || 1;
    const s = +document.getElementById('courseFormS').value || 1;
    let e = +document.getElementById('courseFormE').value || s;
    if (!name) { alert('给这门课起个名吧～'); return; }
    if (e < s) e = s;
    let w1 = parseInt(document.getElementById('courseFormW1').value, 10);
    let w2 = parseInt(document.getElementById('courseFormW2').value, 10);
    if (isNaN(w1) || w1 < 1) w1 = 1;
    if (isNaN(w2) || w2 < 1) w2 = w1;
    if (w2 < w1) w2 = w1;
    const obj = {
      day: day, s: s, e: e,
      name: name, room: (document.getElementById('courseFormRoom').value || '').trim(),
      w1: w1, w2: w2, parity: _courseFormParity
    };
    if (id) {
      const i = courseData.items.findIndex(function(x) { return x.id === id; });
      if (i >= 0) courseData.items[i] = Object.assign({}, courseData.items[i], obj);
    } else { obj.id = _courseUid(); courseData.items.push(obj); }
    courseSave(); courseFormCancel(); renderCourse();
  } catch (e) { console.error('courseFormSave', e); }
}

/* 开学时间（唯一保留设置） */
function courseSetStart(v) {
  if (!courseData) courseEnsure();
  courseData.semesterStart = v || '';
  courseSave(); renderCourse();
  if (v) addChatSystem('📅 开学第1周周一已设为 ' + v);
}

/* ==================== 值班增删（具体日期） ==================== */
function openDutyAdd() {
  const m = document.getElementById('dutyModal');
  if (!m) return;
  document.getElementById('dutyFormId').value = '';
  document.getElementById('dutyFormDate').value = courseDateKey(new Date());
  document.getElementById('dutyFormT0').value = '14:00';
  document.getElementById('dutyFormT1').value = '16:00';
  document.getElementById('dutyFormName').value = '';
  document.getElementById('dutyFormLoc').value = '';
  const del = document.getElementById('dutyFormDel');
  if (del) del.style.display = 'none';
  m.style.display = 'flex';
}
function dutyFormCancel() { const m = document.getElementById('dutyModal'); if (m) m.style.display = 'none'; }
function dutyFormDelete() {
  const id = document.getElementById('dutyFormId').value;
  if (!id || !confirm('删掉这次值班吗？')) return;
  courseData.duties = courseData.duties.filter(function(x) { return x.id !== id; });
  courseSave(); dutyFormCancel(); renderCourse();
}
function deleteDuty(id) {
  if (!confirm('删掉这次值班吗？')) return;
  courseData.duties = courseData.duties.filter(function(x) { return x.id !== id; });
  courseSave(); renderCourse();
}
function dutyFormSave() {
  try {
    const id = document.getElementById('dutyFormId').value;
    const date = document.getElementById('dutyFormDate').value;
    const t0 = document.getElementById('dutyFormT0').value;
    const t1 = document.getElementById('dutyFormT1').value;
    if (!date) { alert('选个日期吧'); return; }
    const obj = {
      date: date,
      t0: t0 || '00:00', t1: t1 || '',
      name: (document.getElementById('dutyFormName').value || '').trim(),
      loc: (document.getElementById('dutyFormLoc').value || '').trim()
    };
    if (id) {
      const i = courseData.duties.findIndex(function(x) { return x.id === id; });
      if (i >= 0) courseData.duties[i] = Object.assign({}, courseData.duties[i], obj);
    } else { obj.id = _courseUid(); courseData.duties.push(obj); }
    courseSave(); dutyFormCancel(); renderCourse();
  } catch (e) { console.error('dutyFormSave', e); }
}

/* ==================== AI 感知：骆云影看得到今天的课/值班 ==================== */
function buildScheduleContext() {
  try {
    if (!courseData || (!courseData.items.length && !(courseData.duties && courseData.duties.length))) return '';
    const now = new Date();
    const week = courseWeekNumber(now);
    const day = courseDayNum(now);
    const line = '【课表感应】今天是' + COURSE_WEEK_CN[day - 1] +
      (week < 1 ? '（还没开学）' : '，本学期第' + week + '周(' + (courseIsOdd(week) ? '单周' : '双周') + ')') + '。';
    const today = courseData.items.filter(function(it) { return it.day === day && courseActiveWeek(it, week < 1 ? 1 : week); })
      .sort(function(a, b) { return a.s - b.s; });
    let out = line;
    if (today.length) {
      out += '她今天有' + today.length + '门：' + today.map(function(it) {
        return '第' + it.s + (it.e > it.s ? '-' + it.e : '') + '节 ' + it.name + (it.room ? '@' + it.room : '');
      }).join('；') + '。';
    } else {
      out += '她今天没课。';
    }
    const tk = courseDateKey(now);
    const duties = (courseData.duties || []).filter(function(x) { return x.date === tk; });
    if (duties.length) out += '今天要值班：' + duties.map(function(x) { return (x.t0 || '') + (x.name ? x.name : '值班') + (x.loc ? '@' + x.loc : ''); }).join('；') + '。';
    out += '\n用法：这是"看见"——她聊到上课/约饭/时间时自然接话；别死板复读，别每句都提课表。';
    return out;
  } catch (e) { console.error('buildScheduleContext', e); return ''; }
}

/* 值班当天准点前提醒（骆云影说一句）；课表无钟点则不做上课提醒 */
function courseCheckReminders() {
  try {
    if (!settings || settings.proactiveMsg === false) return;
    if (settings.scheduleRemind === false) return;
    const now = new Date();
    const tk = courseDateKey(now);
    const duties = (courseData.duties || []).filter(function(x) { return x.date === tk && x.t0; });
    if (!duties.length) return;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const inChat = typeof currentPage !== 'undefined' && currentPage === 'page-chat' &&
      typeof lastUserMsgTime === 'number' && now.getTime() - lastUserMsgTime < 5 * 60000;
    for (let i = 0; i < duties.length; i++) {
      const x = duties[i];
      const pm = String(x.t0).split(':');
      const startMin = (+pm[0] || 0) * 60 + (+pm[1] || 0);
      const diff = startMin - nowMin;
      if (diff <= 0 || diff > 15) continue;
      const key = 'scheduleNotified_' + x.id + '_' + tk;
      if (lsGet(key, false)) continue;
      if (inChat) { lsSet(key, true); continue; }
      const char = (typeof getCharById === 'function' && typeof currentCharId !== 'undefined') ? getCharById(currentCharId) : null;
      if (!char || typeof generateProactiveMessage !== 'function') return;
      const story = (char.story || '').toLowerCase();
      const isT = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(story);
      const isG = /温柔|温暖|亲切|可爱|软/.test(story);
      generateProactiveMessage('class', char, isT, isG, { item: { type: 'duty', name: x.name || '值班', start: x.t0, end: x.t1, loc: x.loc }, min: Math.ceil(diff) });
      lsSet(key, true);
      return;   // 每次只提醒最近一项
    }
  } catch (e) { console.error('courseCheckReminders', e); }
}

/* ==================== 初始化 ==================== */
function initCourse() {
  try {
    courseEnsure();
    renderCourse();
    setInterval(function() {
      // 只在课表页可见时重绘（否则每60s刷新会打断横向滚动/阅读）；提醒照常后台跑
      if (!document.hidden && typeof currentPage !== 'undefined' && currentPage === 'page-course') renderCourse();
      if (typeof courseCheckReminders === 'function') courseCheckReminders();
    }, 60000);
    setTimeout(function() { if (typeof courseCheckReminders === 'function') courseCheckReminders(); }, 30000);
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) { renderCourse(); if (typeof courseCheckReminders === 'function') courseCheckReminders(); }
    });
  } catch (e) {
    console.error('initCourse', e);
    if (typeof addChatSystem === 'function') addChatSystem('⚠️ 课表初始化报错：' + (e && e.message || e));
  }
}
