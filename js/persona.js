/* ==================== 14. 用户人设 ==================== */
let userPersona = lsGet('userPersona', { name:'晞晞', gender:'女', age:'大一，社会工作', traits:'敏感、爱写东西、嘴硬心软', hobbies:'写作、听歌、骆云影', background:'在杭州读书' });

function loadUserPersona() {
  userPersona = lsGet('userPersona', { name:'晞晞', gender:'女', age:'大一，社会工作', traits:'敏感、爱写东西、嘴硬心软', hobbies:'写作、听歌、骆云影', background:'在杭州读书' });
  var el = document.getElementById('userName'); if (el) el.value = userPersona.name;
  var el2 = document.getElementById('userGender'); if (el2) el2.value = userPersona.gender;
  var el3 = document.getElementById('userAge'); if (el3) el3.value = userPersona.age;
  var el4 = document.getElementById('userTraits'); if (el4) el4.value = userPersona.traits;
  var el5 = document.getElementById('userHobbies'); if (el5) el5.value = userPersona.hobbies;
  var el6 = document.getElementById('userBackground'); if (el6) el6.value = userPersona.background;
}

function saveUserPersona() {
  userPersona.name = document.getElementById('userName').value.trim() || '晞晞';
  userPersona.gender = document.getElementById('userGender').value;
  userPersona.age = document.getElementById('userAge').value.trim();
  userPersona.traits = document.getElementById('userTraits').value.trim();
  userPersona.hobbies = document.getElementById('userHobbies').value.trim();
  userPersona.background = document.getElementById('userBackground').value.trim();
  lsSet('userPersona', userPersona);
  addChatSystem('✅ 我的人设已更新');
}

function loadPersona() {
  personaData = lsGet('persona_' + currentCharId, { name:'骆云影', story:'黑色中长发，灰蓝色眼睛，178cm。ISTP，傲娇暴躁毒舌刻薄，嘴硬心软。' });
  document.getElementById('chatTitle').textContent = personaData.name || '聊天';

  worldBook = lsGet('worldBook', '');

  apiConfig = lsGet('apiConfig', { baseUrl:'https://api.deepseek.com', apiKey:'', model:'deepseek-chat', useCorsProxy:false });
  if (apiConfig.useCorsProxy && (!apiConfig.baseUrl || apiConfig.baseUrl.includes('deepseek.com'))) {
    apiConfig.useCorsProxy = false;
    lsSet('apiConfig', apiConfig);
  }
  var keyEl = document.getElementById('apiKey');
  if (keyEl) keyEl.value = apiConfig.apiKey || '';
  updateApiStatusBadge();
}

function savePersona() {
  // 已移到聊天页的 AI 人设弹窗
}

function saveWorldBook() {
  worldBook = document.getElementById('worldBook').value.trim();
  lsSet('worldBook', worldBook);
  addChatSystem(`📖 世界书已更新`);
}

function saveApiConfig() {
  apiConfig.baseUrl = document.getElementById('apiBaseUrl').value.trim() || 'https://api.deepseek.com';
  apiConfig.apiKey = document.getElementById('apiKey').value.trim();
  apiConfig.model = document.getElementById('apiModel').value || 'deepseek-chat';
  apiConfig.useCorsProxy = document.getElementById('apiCorsProxy').checked;
  lsSet('apiConfig', apiConfig);
  updateApiStatusBadge();
  if (apiConfig.apiKey) {
    addChatSystem(`✅ API 已配置（${apiConfig.model}），聊天将使用大模型回复${apiConfig.useCorsProxy ? '（通过 CORS 代理）' : ''}`);
  } else {
    addChatSystem(`ℹ️ API Key 未填写，聊天使用本地回复模式`);
  }
}

async function testApiConnection() {
  const key = document.getElementById('apiKey').value.trim();
  const baseUrl = document.getElementById('apiBaseUrl').value.trim() || 'https://api.deepseek.com';
  const model = document.getElementById('apiModel').value || 'deepseek-chat';
  const useProxy = document.getElementById('apiCorsProxy').checked;
  if (!key) { addChatSystem('❌ 请先填写 API Key'); return; }
  addChatSystem('🔄 正在测试 API 连接...');
  const baseEndpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const testBody = { model, messages: [{ role: 'user', content: '你好，请用一句话回复测试成功' }], max_tokens: 32 };
  const fetchOpts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }, body: JSON.stringify(testBody) };
  try {
    addChatSystem('🔄 尝试直连...');
    const resp = await fetch(baseEndpoint, fetchOpts);
    if (resp.ok) {
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || '（连接成功但回复为空）';
      document.getElementById('apiStatusBadge').textContent = '已连接';
      document.getElementById('apiStatusBadge').className = 'api-status on';
      addChatSystem(`✅ API 直连成功！模型回复：${reply}`);
      if (useProxy) {
        document.getElementById('apiCorsProxy').checked = false;
        apiConfig.useCorsProxy = false;
        lsSet('apiConfig', apiConfig);
        addChatSystem('ℹ️ 直连可用，已自动关闭 CORS 代理');
      }
      return;
    }
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401) { addChatSystem('❌ API Key 无效（401）'); }
    else if (resp.status === 402) { addChatSystem('❌ API 余额不足（402）'); }
    else if (resp.status === 429) { addChatSystem('❌ 请求频率过高（429）'); }
    else { addChatSystem(`⚠️ 直连返回错误 (${resp.status})`); }
  } catch(e) { addChatSystem(`⚠️ 直连网络失败：${e.message}`); }
  if (CORS_PROXIES.length > 0) {
    for (const proxy of CORS_PROXIES) {
      try {
        addChatSystem(`🔄 尝试代理 ${proxy.name}...`);
        const resp = await fetch(proxy.build(baseEndpoint), fetchOpts);
        if (resp.ok) {
          const data = await resp.json();
          const reply = data.choices?.[0]?.message?.content || '（成功）';
          document.getElementById('apiStatusBadge').textContent = '已连接';
          document.getElementById('apiStatusBadge').className = 'api-status on';
          addChatSystem(`✅ 通过代理 ${proxy.name} 连接成功！`);
          return;
        }
      } catch(e) { addChatSystem(`⚠️ 代理 ${proxy.name} 失败`); }
    }
  }
  document.getElementById('apiStatusBadge').textContent = '失败';
  document.getElementById('apiStatusBadge').className = 'api-status off';
  addChatSystem('❌ 所有连接方式均失败');
}

function updateApiStatusBadge() {
  const badge = document.getElementById('apiStatusBadge');
  if (!badge) return;
  if (apiConfig.apiKey) {
    badge.textContent = '已连接';
    badge.className = 'api-status on';
  } else {
    badge.textContent = '未连接';
    badge.className = 'api-status off';
  }
}

/* ---- 导出/导入数据 ---- */
async function exportData() {
  try {
    addChatSystem('🔄 正在导出数据...');
    const allData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('phone_')) {
        try { const val = localStorage.getItem(key); allData[key] = JSON.parse(val); } catch(e) { allData[key] = localStorage.getItem(key); }
      }
    }
    const photoBlobs = [];
    for (const id of photos) {
      const blob = await getPhotoFromDB(id);
      if (blob) { const base64 = await blobToBase64(blob); photoBlobs.push({ id, data: base64, type: blob.type }); }
    }
    allData['_exportPhotos'] = photoBlobs;
    const emojiBlobs = [];
    for (const ei of customImgEmojis) {
      const blob = await getEmojiImage(ei.id);
      if (blob) { const base64 = await blobToBase64(blob); emojiBlobs.push({ id: ei.id, data: base64, type: blob.type, thumb: ei.thumb }); }
    }
    allData['_exportEmojis'] = emojiBlobs;
    allData['_exportVersion'] = 1;
    allData['_exportTime'] = new Date().toISOString();
    const json = JSON.stringify(allData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `phone_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const sizeMB = (json.length / 1024 / 1024).toFixed(1);
    addChatSystem(`✅ 数据导出完成！文件大小：${sizeMB}MB。包含 ${photos.length} 张照片、${chatMessages.length} 条聊天记录等。`);
  } catch(e) { addChatSystem(`❌ 导出失败：${e.message}`); }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  try {
    addChatSystem('🔄 正在导入数据，请稍候...');
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data._exportVersion) { addChatSystem('❌ 文件格式不对'); return; }
    let importCount = 0;
    for (const [key, val] of Object.entries(data)) {
      if (key.startsWith('_export')) continue;
      try { localStorage.setItem(key, JSON.stringify(val)); importCount++; } catch(e) {}
    }
    if (data._exportPhotos && data._exportPhotos.length > 0) {
      for (const p of data._exportPhotos) {
        const blob = base64ToBlob(p.data, p.type);
        await savePhotoToDB(p.id, blob);
      }
      for (const id of data._exportPhotos.map(p => p.id)) {
        const blob = await getPhotoFromDB(id);
        if (blob) photoURLs[id] = URL.createObjectURL(blob);
      }
      addChatSystem(`📷 已恢复 ${data._exportPhotos.length} 张照片`);
    }
    if (data._exportEmojis && data._exportEmojis.length > 0) {
      await openEmojiDB();
      for (const ei of data._exportEmojis) {
        const blob = base64ToBlob(ei.data, ei.type);
        await saveEmojiImage(ei.id, blob);
        emojiImgURLs[ei.id] = URL.createObjectURL(blob);
      }
      addChatSystem(`😊 已恢复 ${data._exportEmojis.length} 个自定义表情`);
    }
    addChatSystem(`✅ 导入完成！${importCount} 项数据已恢复。正在刷新页面...`);
    setTimeout(() => { location.reload(); }, 1500);
  } catch(e) {
    addChatSystem(`❌ 导入失败：${e.message}`);
    if (e.message.includes('QuotaExceeded')) addChatSystem('💡 存储空间不足，建议清理照片或使用更小的备份文件');
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, type) {
  const parts = base64.split(',');
  const byteStr = atob(parts[1]);
  const ab = new ArrayBuffer(byteStr.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
  return new Blob([ab], { type: type || 'image/jpeg' });
}
