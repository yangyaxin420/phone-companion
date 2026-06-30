/* ==================== 10. 记账 ==================== */
let expType = 'expense';
let expenseActiveTab = 'expense';
const EXPENSE_CATS = ['餐饮','交通','购物','娱乐','学习','日用','通讯','其他'];
const INCOME_CATS = ['生活费','兼职','红包','理财','报销','其他收入'];

function renderExpense() {
  if (typeof renderExpenseList === 'function') renderExpenseList('expense');
}

function renderExpenseChart() {
  const canvas = document.getElementById("expChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const records = getExpRecords();
  const now = new Date();
  const monthPrefix = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const pieRecs = records.filter(function(r) { return r.date && r.date.startsWith(monthPrefix) && r.type !== "income"; });
  if (pieRecs.length === 0) {
    ctx.fillStyle = "#ccc"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("暂无数据", w/2, h/2);
    return;
  }
  const catTotals = {};
  pieRecs.forEach(function(r) { if (!catTotals[r.category]) catTotals[r.category] = 0; catTotals[r.category] += r.amount; });
  const cats = Object.keys(catTotals);
  const total = pieRecs.reduce(function(s,r) { return s + r.amount; }, 0);
  const pieColors = ["#e76f51","#f4a261","#e9c46a","#2a9d8f","#264653","#a855f7","#ec4899","#f97316"];
  var cx = 55, cy = 55, radius = 38;
  var angle = -Math.PI / 2;
  cats.forEach(function(cat, i) {
    var slice = (catTotals[cat] / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = pieColors[i % pieColors.length];
    ctx.fill();
    angle += slice;
  });
  var lx = 110, ly = 6;
  cats.forEach(function(cat, i) {
    ctx.fillStyle = pieColors[i % pieColors.length];
    ctx.fillRect(lx, ly + i * 14, 9, 9);
    ctx.fillStyle = "#555";
    ctx.font = "8px sans-serif";
    ctx.textAlign = "left";
    var pct = (catTotals[cat] / total * 100).toFixed(0);
    ctx.fillText(cat + " " + pct + "%", lx + 13, ly + i * 14 + 8);
  });
  ctx.fillStyle = "#999";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("支出分类", 4, 12);
}

function renderExpenseLineChart() {
  const canvas = document.getElementById('expLineChart');
  if (!canvas) return;
  const records = getExpRecords();
  const now = new Date();
  var weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 6);
  var weekStart = weekAgo.toISOString().split('T')[0];
  const weekRecs = records.filter(function(r) { return r.date && r.date >= weekStart; });
  if (weekRecs.length === 0) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  const isIncome = expenseActiveTab === 'income';
  var filtered = weekRecs.filter(function(r) { return isIncome ? r.type === 'income' : r.type !== 'income'; });
  if (filtered.length === 0) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  var dayMap = {};
  filtered.forEach(function(r) {
    if (!dayMap[r.date]) dayMap[r.date] = 0;
    dayMap[r.date] += r.amount;
  });
  var days = Object.keys(dayMap).sort();
  if (days.length < 2) { canvas.style.display = 'none'; return; }
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  var max = Math.max.apply(null, days.map(function(d) { return dayMap[d]; })) * 1.2;
  var padL = 30, padR = 6, padT = 16, padB = 16;
  var gw = w - padL - padR, gh = h - padT - padB;
  ctx.fillStyle = "#999"; ctx.font = "8px sans-serif"; ctx.textAlign = "right";
  [0, 0.5, 1].forEach(function(ratio) {
    var y = padT + gh * (1 - ratio);
    ctx.fillText((max * ratio).toFixed(0), padL - 4, y + 3);
    ctx.strokeStyle = "#f0f0f0"; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  });
  ctx.strokeStyle = isIncome ? '#4caf50' : '#e76f51';
  ctx.lineWidth = 2;
  ctx.beginPath();
  days.forEach(function(d, i) {
    var x = padL + (i / (days.length - 1)) * gw;
    var y = padT + gh - (dayMap[d] / max) * gh;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  days.forEach(function(d, i) {
    var x = padL + (i / (days.length - 1)) * gw;
    var y = padT + gh - (dayMap[d] / max) * gh;
    ctx.fillStyle = isIncome ? '#4caf50' : '#e76f51';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = "#999"; ctx.font = "8px sans-serif"; ctx.textAlign = "center";
  days.forEach(function(d, i) {
    ctx.fillText(d.slice(5), padL + (i / (days.length - 1)) * gw, h - 2);
  });
  ctx.fillStyle = "#999"; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(isIncome ? '收入趋势(7天)' : '支出趋势(7天)', 4, 12);
}

function expSetType(type) {
  expType = type;
  renderExpenseCats();
}

function switchExpenseTab(tab) {
  expenseActiveTab = tab;
  document.querySelectorAll('.expense-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelector('.expense-tab[data-tab="' + tab + '"]').classList.add('active');
  if (tab === 'stats') {
    document.getElementById('expenseListArea').style.display = 'none';
    document.getElementById('expenseStatsArea').style.display = 'block';
    renderExpenseStats();
  } else {
    document.getElementById('expenseListArea').style.display = 'block';
    document.getElementById('expenseStatsArea').style.display = 'none';
    renderExpenseList(tab);
  }
}

function switchStatsTab(tab) {
  document.querySelectorAll('.expense-stats-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelector('.expense-stats-tab[data-stab="' + tab + '"]').classList.add('active');
  renderExpenseStats();
}

function renderExpenseList(type) {
  const records = getExpRecords();
  const filtered = records.filter(function(r) { return type === 'income' ? r.type === 'income' : r.type !== 'income'; });
  if (filtered.length === 0) {
    document.getElementById('expDetailList').innerHTML = '<div style="text-align:center;color:#ccc;padding:40px;font-size:13px;">还没有' + (type==='income'?'收入':'支出') + '记录</div>';
    return;
  }
  const sorted = [...filtered].sort(function(a,b) { return (a.date||'') > (b.date||'') ? -1 : 1; });
  const groups = {};
  sorted.forEach(function(r) {
    if (!groups[r.date]) groups[r.date] = [];
    groups[r.date].push(r);
  });
  let h = '';
  Object.keys(groups).forEach(function(date) {
    const items = groups[date];
    h += '<div class="expense-date-group">' + escHtml(date) + '</div>';
    items.forEach(function(r) {
      h += '<div class="expense-detail-item">' +
        '<div class="edi-left"><span class="edi-cat">' + escHtml(r.category) + '</span>' +
        (r.note ? '<span class="edi-note">' + escHtml(r.note) + '</span>' : '') + '</div>' +
        '<div><span class="edi-amount ' + r.type + '">' + (r.type==='income'?'+':'-') + r.amount.toFixed(2) + '</span>' +
        '<span class="edi-del" onclick="delExpense(\'' + r.id + '\')">✕</span></div></div>';
    });
    const dayTotal = items.reduce(function(s,r) { return s + r.amount; }, 0);
    h += '<div style="font-size:11px;color:#999;text-align:right;padding:2px 8px 8px;border-bottom:1px solid #f0f0f0;">小计：' + dayTotal.toFixed(2) + '</div>';
  });
  document.getElementById('expDetailList').innerHTML = h;
}

function renderExpenseStats() {
  const records = getExpRecords();
  const now = new Date();
  const monthPrefix = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const monthRecs = records.filter(function(r) { return r.date && r.date.startsWith(monthPrefix); });
  const totalExpense = monthRecs.filter(function(r) { return r.type !== 'income'; }).reduce(function(s,r) { return s + r.amount; }, 0);
  const totalIncome = monthRecs.filter(function(r) { return r.type === 'income'; }).reduce(function(s,r) { return s + r.amount; }, 0);
  document.getElementById('expSummary').innerHTML =
    '<div class="expense-summary-item"><div class="amount expense">-' + totalExpense.toFixed(2) + '</div><div class="label">支出</div></div>' +
    '<div class="expense-summary-item"><div class="amount income">+' + totalIncome.toFixed(2) + '</div><div class="label">收入</div></div>' +
    '<div class="expense-summary-item"><div class="amount">' + (totalIncome - totalExpense).toFixed(2) + '</div><div class="label">结余</div></div>';
  renderExpensePieChart();
}

function renderExpensePieChart() {
  const canvas = document.getElementById('expChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const records = getExpRecords();
  const now = new Date();
  const monthPrefix = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const monthRecs = records.filter(function(r) { return r.date && r.date.startsWith(monthPrefix); });
  const statsType = document.querySelector('.expense-stats-tab.active')?.dataset?.stab || 'expense';
  const filtered = monthRecs.filter(function(r) { return statsType === 'income' ? r.type === 'income' : r.type !== 'income'; });
  if (filtered.length === 0) {
    ctx.fillStyle = '#ccc'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w/2, h/2);
    return;
  }
  const catTotals = {};
  filtered.forEach(function(r) { if (!catTotals[r.category]) catTotals[r.category] = 0; catTotals[r.category] += r.amount; });
  const cats = Object.keys(catTotals);
  const total = filtered.reduce(function(s,r) { return s + r.amount; }, 0);
  const pieColors = ['#e76f51','#f4a261','#e9c46a','#2a9d8f','#264653','#a855f7','#ec4899','#f97316','#06b6d4','#84cc16'];
  var cx = 70, cy = 90, radius = 65;
  var angle = -Math.PI / 2;
  cats.forEach(function(cat, i) {
    var slice = (catTotals[cat] / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = pieColors[i % pieColors.length];
    ctx.fill();
    angle += slice;
  });
  var lx = 150, ly = 8;
  cats.forEach(function(cat, i) {
    ctx.fillStyle = pieColors[i % pieColors.length];
    ctx.fillRect(lx, ly + i * 18, 12, 12);
    ctx.fillStyle = '#555';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    var pct = (catTotals[cat] / total * 100).toFixed(0);
    ctx.fillText(cat + ' ' + catTotals[cat].toFixed(0) + '元 (' + pct + '%)', lx + 16, ly + i * 18 + 10);
  });
}

function renderExpenseCats() {
  const grid = document.getElementById('expCatGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const cats = expType === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  cats.forEach(function(c) {
    const btn = document.createElement('button');
    btn.className = 'expense-cat-btn' + (c === '其他' ? ' selected' : '');
    btn.textContent = c;
    btn.onclick = function() {
      grid.querySelectorAll('.expense-cat-btn').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
    };
    grid.appendChild(btn);
  });
}

function addExpense() {
  const amount = parseFloat(document.getElementById('expAmount').value);
  if (!amount || amount <= 0) { alert('请输入有效金额'); return; }
  const date = document.getElementById('expDate').value || new Date().toISOString().split('T')[0];
  const typeSel = document.getElementById('expDetailType');
  const recordType = typeSel ? typeSel.value : expType;
  const selectedCat = document.getElementById('expCatGrid').querySelector('.expense-cat-btn.selected');
  const category = selectedCat ? selectedCat.textContent : '其他';
  const note = document.getElementById('expNote').value.trim();
  const records = getExpRecords();
  records.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2,6), amount, type: recordType, category, note, date });
  saveExpRecords(records);
  document.getElementById('expAmount').value = '';
  document.getElementById('expNote').value = '';
  renderExpense();
  addChatSystem('💰 已记录' + (expType==='expense'?'支出':'收入') + '：' + category + ' ' + amount.toFixed(2) + '元' + (note?' ('+note+')':''));
}

function getExpRecords() { try { var r = JSON.parse(localStorage.getItem('expense_records')) || []; var changed = false; r.forEach(function(rec, i) { if (!rec.id) { rec.id = Date.now() + '_' + Math.random().toString(36).slice(2,8); changed = true; } }); if (changed) localStorage.setItem('expense_records', JSON.stringify(r)); return r; } catch(e) { return []; } }
function saveExpRecords(v) { localStorage.setItem('expense_records', JSON.stringify(v)); }

function delExpense(id) {
  var records = getExpRecords();
  records = records.filter(function(r) { return r.id !== id; });
  saveExpRecords(records);
  renderExpense();
  try { renderExpenseDetail(); } catch(e) {}
}

function exportExpense() {
  const records = getExpRecords();
  const blob = new Blob([JSON.stringify(records, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '记账数据_' + new Date().toISOString().split('T')[0] + '.json';
  a.click(); URL.revokeObjectURL(url);
}
