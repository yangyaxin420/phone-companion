/* ==================== 10. 聊天 AI ==================== */

/* ---- 多角色数据 ---- */
let currentCharId = lsGet('currentCharId', 'luo');

// 角色列表：预置骆云影，后续可扩展
const DEFAULT_CHARACTERS = [
  {
    id: 'luo',
    name: '骆云影',
    avatar: '💬',
    story: '黑色中长发，灰蓝色眼睛，178cm。ISTP，傲娇暴躁毒舌刻薄，嘴硬心软。语言表达极其简洁冷淡，嫌弃一切肉麻和废话。习惯用刻薄掩饰在意，用暴躁掩盖担心——关心都藏在「啧」「随你」「别死了」这种话里。内心其实细腻温柔，只是从来不说软话。',
    systemPrompt: '你是骆云影。傲娇暴躁，嘴硬心软，说话简洁冷淡带刺，但偶尔会透出关心。讨厌肉麻和废话。用最少的字说最狠的话，但别真的伤人。',
    status: '在线',
    relation: '恋人'
  }
];

let characters = lsGet('characters', DEFAULT_CHARACTERS);

// 多角色聊天数据：{ charId: [messages] }
let chatData = lsGet('chatData', null);
if (!chatData) {
  // 迁移旧数据：把单数组格式转成多角色格式
  const oldChat = lsGet('chat', []);
  chatData = {};
  characters.forEach(c => { chatData[c.id] = []; });
  chatData['luo'] = oldChat; // 旧数据归骆云影
  lsSet('chatData', chatData);
  // 删除旧 key
  localStorage.removeItem('phone_chat');
}

// 获取当前角色的聊天消息
function getCurrentChat() {
  return chatData[currentCharId] || [];
}

function setCurrentChat(msgs) {
  chatData[currentCharId] = msgs;
}

let systemPrompt = lsGet('sp', DEFAULT_CHARACTERS[0].systemPrompt);
let personaData = lsGet('persona', { name:'骆云影', story:DEFAULT_CHARACTERS[0].story });
let worldBook = lsGet('worldBook', '');
let apiConfig = lsGet('apiConfig', { baseUrl:'https://api.deepseek.com', apiKey:'', model:'deepseek-chat', useCorsProxy:false });

/* ---- 角色切换 ---- */
function switchCharacter(charId) {
  const char = characters.find(c => c.id === charId);
  if (!char) return;
  // 保存当前聊天数据
  saveChatData();
  currentCharId = charId;
  lsSet('currentCharId', charId);
  chatMessages = getCurrentChat();

  // 切换人设和提示词
  personaData = lsGet('persona_' + charId, { name: char.name, story: char.story });
  systemPrompt = lsGet('sp_' + charId, char.systemPrompt);
  document.getElementById('chatTitle').textContent = char.name + (char.status === '离线' ? ' 📴' : '');

  // 重新渲染
  renderChat();
  updateChatContext();
  addChatSystem(`切换到 ${char.name}`);

  // 从聊天列表页回到聊天时，把页面切回聊天
  navigateTo('page-chat', true);
}

function getCharById(id) {
  return characters.find(c => c.id === id) || characters[0];
}

function showConvList() {
  renderConvList();
  navigateTo('page-conv-list', true);
}

function showAddCharDialog() {
  const name = prompt('新角色名字：');
  if (!name || !name.trim()) return;
  const id = 'char_' + Date.now().toString(36);
  characters.push({
    id,
    name: name.trim(),
    avatar: '💬',
    story: '',
    systemPrompt: '你是一个温柔的陪伴者，说话温暖亲切。',
    status: '在线'
  });
  chatData[id] = [];
  lsSet('characters', characters);
  lsSet('chatData', chatData);
  renderConvList();
  switchCharacter(id);
}

/* ---- 角色管理 ---- */
let charManageMode = false;

function toggleCharManage() {
  charManageMode = !charManageMode;
  document.getElementById('btnManageChars').style.color = charManageMode ? '#e55' : '#A0AEC0';
  document.getElementById('btnManageChars').textContent = charManageMode ? '完成' : '···';
  renderConvList();
}

function deleteCharacter(charId) {
  if (characters.length <= 1) { addChatSystem('⚠️ 至少保留一个角色'); return; }
  if (!confirm('确认删除这个角色？聊天记录也会一起删除。')) return;
  characters = characters.filter(c => c.id !== charId);
  delete chatData[charId];
  lsSet('characters', characters);
  lsSet('chatData', chatData);
  // 如果删除的是当前角色，切到第一个
  if (currentCharId === charId) {
    switchCharacter(characters[0].id);
  }
  renderConvList();
}

/* ---- 聊天列表 ---- */
function renderConvList() {
  const container = document.getElementById('convList');
  if (!container) return;
  container.innerHTML = '';

  // 按最后消息时间排序
  const sorted = [...characters].sort((a, b) => {
    const msgsA = chatData[a.id] || [];
    const msgsB = chatData[b.id] || [];
    const lastA = msgsA.length > 0 ? msgsA[msgsA.length-1].time || 0 : 0;
    const lastB = msgsB.length > 0 ? msgsB[msgsB.length-1].time || 0 : 0;
    return lastB - lastA;
  });

  sorted.forEach(c => {
    const msgs = chatData[c.id] || [];
    const lastMsg = msgs.filter(m => m.role !== 'system').slice(-1)[0];
    const lastText = lastMsg ? lastMsg.text.substring(0, 25) + (lastMsg.text.length > 25 ? '...' : '') : '开始聊天吧';
    const lastTime = lastMsg && lastMsg.time ? formatTime(lastMsg.time) : '';
    const statusEmoji = c.status === '离线' ? ' 📴' : c.status === '忙碌' ? ' 🔴' : '';

    const el = document.createElement('div');
    el.className = 'conv-item' + (c.id === currentCharId ? ' active' : '');
    el.innerHTML = `
      <div class="conv-avatar">${c.avatar}</div>
      <div class="conv-info">
        <div class="conv-name-row">
          <span class="conv-name">${escHtml(c.name)}${statusEmoji}</span>
          <span class="conv-time">${lastTime}</span>
        </div>
        <div class="conv-preview">${escHtml(lastText)}</div>
      </div>
      ${charManageMode ? `<button class="conv-del" onclick="event.stopPropagation();deleteCharacter('${c.id}')">✕</button>` : ''}
    `;
    el.onclick = () => { if (!charManageMode) switchCharacter(c.id); };
    container.appendChild(el);
  });
}

/* ---- 兼容旧代码：chatMessages 映射到当前角色 ---- */
let chatMessages = getCurrentChat();

// 每次渲染/保存时同步到 chatData
function syncChatMessages() {
  chatMessages = getCurrentChat();
}
function saveChatData() {
  chatData[currentCharId] = chatMessages;
  lsSet('chatData', chatData);
}

function addChatSystem(text) {
  chatMessages.push({ role:'system', text, time: Date.now() });
  saveChatData();
  renderChat();
}

/* ---- 记忆系统 ---- */
let memories = lsGet('memories', []);

function saveMemory(text) {
  memories.push({ text: text, time: Date.now() });
  if (memories.length > 200) memories = memories.slice(-200);
  lsSet('memories', memories);
}

function getRecentMemories(count) {
  var recent = memories.slice(-(count || 30));
  return recent.map(function(m) { return m.text; }).join('\n');
}

function renderChat() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  let lastDate = '';
  chatMessages.forEach(m => {
    if (m.time) {
      const d = new Date(m.time);
      const dateStr = `${d.getMonth()+1}月${d.getDate()}日`;
      if (dateStr !== lastDate && m.role !== 'system') {
        const divider = document.createElement('div');
        divider.className = 'chat-msg system';
        divider.style.cssText = 'font-size:10px;padding:2px 8px;margin:4px 0;';
        divider.textContent = dateStr;
        container.appendChild(divider);
        lastDate = dateStr;
      }
    }
    const el = document.createElement('div');
    el.className = 'chat-msg ' + m.role;
    if (m.emojiImg) {
      el.classList.add('emoji-img-only');
      const img = document.createElement('img');
      img.className = 'emoji-img-msg';
      img.loading = 'lazy';
      const cachedUrl = emojiImgURLs[m.emojiImg];
      if (cachedUrl) {
        img.src = cachedUrl;
      } else {
        getEmojiImgURL(m.emojiImg).then(url => { if (url) img.src = url; });
        img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect fill="%23eee" width="60" height="60" rx="8"/></svg>';
      }
      el.appendChild(img);
    } else if (m.emoji) {
      el.classList.add('emoji-only');
      el.innerHTML = `<span class="emoji-msg">${escHtml(m.text)}</span>`;
    } else {
      el.textContent = m.text;
    }
    if (m.time && m.role !== 'system') {
      const d = new Date(m.time);
      const timeLabel = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
      const timeEl = document.createElement('div');
      timeEl.className = 'chat-msg-time';
      timeEl.textContent = timeLabel;
      el.appendChild(timeEl);
    }
    container.appendChild(el);
  });
  // 自动滚到底部
  var doScroll = function() { container.scrollTop = container.scrollHeight; };
  requestAnimationFrame(doScroll);
  setTimeout(doScroll, 50);
}

/* ---- 表情面板 ---- */
const EMOJI_SETS = {
  common: ['😊','😂','🥰','😎','🤔','😢','😡','👍','❤️','🔥','✨','🎉','😘','🥺','😭','😤','🤗','😴','👀','💯','👋','🙏','💪','🫶','😈','🤡','💀','👻','🫠','🥳'],
  face:   ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖'],
  nature: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🦟','🦗','🕷','🌸','🌺','🌻','🌹','🌷','🌲','🌳','🌴','🌵','🍀','🍁','🍂','🍃','🌊','⭐','🌟','🌙','☀️','⛅','🌈','❄️','🔥','💧','🌙','地球','🌍','🌏','🌎'],
  food:   ['🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🍞','🥐','🥖','🧁','🍰','🎂','🍮','🍬','🍫','🍿','🍩','🍪','🌰','☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷','🥡','🥢','🧂','🫕','🫔','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦀','🦞','🦐','🦑','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🌮','🌯','🥙']
};
let customEmojis = lsGet('customEmojis', []);
let customImgEmojis = lsGet('customImgEmojis', []);
let currentEmojiTab = 'common';
let emojiDB = null;
let emojiImgURLs = {};

function openEmojiDB() {
  return new Promise((resolve, reject) => {
    if (emojiDB) return resolve(emojiDB);
    const req = indexedDB.open('PhoneEmojiDB', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { emojiDB = e.target.result; resolve(emojiDB); };
    req.onerror = e => reject(e);
  });
}

async function saveEmojiImage(id, blob) {
  if (!emojiDB) await openEmojiDB();
  return new Promise((resolve, reject) => {
    const tx = emojiDB.transaction('images', 'readwrite');
    tx.objectStore('images').put({ id, blob });
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e);
  });
}

async function getEmojiImage(id) {
  if (!emojiDB) await openEmojiDB();
  return new Promise((resolve, reject) => {
    const tx = emojiDB.transaction('images', 'readonly');
    const req = tx.objectStore('images').get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = e => reject(e);
  });
}

async function deleteEmojiImage(id) {
  if (!emojiDB) await openEmojiDB();
  return new Promise((resolve, reject) => {
    const tx = emojiDB.transaction('images', 'readwrite');
    tx.objectStore('images').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e);
  });
}

async function getEmojiImgURL(id) {
  if (emojiImgURLs[id]) return emojiImgURLs[id];
  const blob = await getEmojiImage(id);
  if (blob) {
    const url = URL.createObjectURL(blob);
    emojiImgURLs[id] = url;
    return url;
  }
  return null;
}

async function preloadEmojiImages() {
  for (const ei of customImgEmojis) {
    if (!emojiImgURLs[ei.id]) {
      await getEmojiImgURL(ei.id);
    }
  }
}

function toggleEmojiPanel() {
  const panel = document.getElementById('emojiPanel');
  const isOpen = panel.classList.contains('show');
  if (isOpen) {
    panel.classList.remove('show');
  } else {
    panel.classList.add('show');
    renderEmojiGrid();
  }
}

function switchEmojiTab(tab, btn) {
  currentEmojiTab = tab;
  document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEmojiGrid();
  document.getElementById('emojiCustomBar').style.display = tab === 'custom' ? 'flex' : 'none';
}

function renderEmojiGrid() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  if (currentEmojiTab === 'custom') {
    let imgHtml = '';
    if (customImgEmojis.length > 0) {
      imgHtml += '<div class="emoji-custom-section"><div class="emoji-custom-section-title">图片表情</div><div class="emoji-img-grid">';
      customImgEmojis.forEach((ei, i) => {
        imgHtml += `<div class="emoji-img-item" onclick="sendImgEmoji('${ei.id}')"><img src="${ei.thumb}"><button class="emoji-del" onclick="event.stopPropagation();removeCustomImgEmoji(${i})">×</button></div>`;
      });
      imgHtml += '</div></div>';
    }
    let textHtml = '';
    if (customEmojis.length > 0) {
      textHtml += '<div class="emoji-custom-section"><div class="emoji-custom-section-title">文字表情</div><div class="emoji-grid" style="max-height:120px;overflow-y:auto;">';
      customEmojis.forEach((e, i) => {
        textHtml += `<div class="emoji-manage-item"><span class="emoji-grid-item" onclick="sendEmoji('${escAttr(e)}')">${e}</span><button class="emoji-del" onclick="event.stopPropagation();removeCustomEmoji(${i})">×</button></div>`;
      });
      textHtml += '</div></div>';
    }
    if (!imgHtml && !textHtml) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#aaa;font-size:13px;padding:20px;">还没有自定义表情<br>在下方添加</div>';
    } else {
      grid.innerHTML = imgHtml + textHtml;
      grid.style.display = 'block';
    }
    return;
  }
  grid.style.display = 'grid';
  const emojis = EMOJI_SETS[currentEmojiTab] || EMOJI_SETS.common;
  emojis.forEach(e => {
    const item = document.createElement('div');
    item.className = 'emoji-grid-item';
    item.textContent = e;
    item.onclick = () => sendEmoji(e);
    grid.appendChild(item);
  });
}

function sendEmoji(emoji) {
  chatMessages.push({ role:'user', text:emoji, emoji:true, time: Date.now() });
  saveChatData();
  renderChat();
  document.getElementById('emojiPanel').classList.remove('show');
  setTimeout(() => {
    const aiEmoji = pickAiEmojiReply(emoji);
    chatMessages.push({ role:'ai', text:aiEmoji, emoji:true, time: Date.now() });
    saveChatData();
    renderChat();
  }, 400 + Math.random() * 600);
}

function pickAiEmojiReply(userEmoji) {
  const map = {
    '😊':['😊','🥰','😄'],'😂':['😂','🤣','😆'],'😢':['🥺','💙','🫂'],
    '😡':['🤗','😤','😮‍💨'],'❤️':['❤️','🥰','💕','🫶'],'👍':['👍','😊','💪'],
    '🔥':['🔥','😎','👀'],'😴':['😴','💤','🌙'],'😭':['🥺','🫂','💙'],
    '😘':['😘','🥰','❤️'],'🤔':['🤔','🧐','💭'],'💯':['💯','🔥','😎'],
    '🎉':['🎉','🥳','✨'],'✨':['✨','🌟','🥰'],
  };
  const options = map[userEmoji] || ['😊','✨','❤️','👍','🥰','😎','🤗','👀','🫶'];
  return options[Math.floor(Math.random() * options.length)];
}

function addCustomEmoji() {
  const inp = document.getElementById('customEmojiInput');
  const val = inp.value.trim();
  if (!val) return;
  if (customEmojis.includes(val)) { inp.value = ''; return; }
  customEmojis.push(val);
  lsSet('customEmojis', customEmojis);
  inp.value = '';
  renderEmojiGrid();
}

function addCustomImageEmoji() {
  document.getElementById('emojiImageInput').click();
}

async function handleEmojiImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';
  const maxSize = 200;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = async (e) => {
    img.onload = async () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const thumb = canvas.toDataURL('image/jpeg', 0.6);
      const id = 'ei_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
      try {
        await saveEmojiImage(id, file);
        customImgEmojis.push({ id, thumb });
        lsSet('customImgEmojis', customImgEmojis);
        emojiImgURLs[id] = URL.createObjectURL(file);
        renderEmojiGrid();
      } catch(err) { console.log('[表情] 保存图片失败:', err); }
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeCustomEmoji(index) {
  customEmojis.splice(index, 1);
  lsSet('customEmojis', customEmojis);
  renderEmojiGrid();
}

async function removeCustomImgEmoji(index) {
  const ei = customImgEmojis[index];
  if (ei) {
    await deleteEmojiImage(ei.id);
    if (emojiImgURLs[ei.id]) { URL.revokeObjectURL(emojiImgURLs[ei.id]); delete emojiImgURLs[ei.id]; }
  }
  customImgEmojis.splice(index, 1);
  lsSet('customImgEmojis', customImgEmojis);
  renderEmojiGrid();
}

function sendImgEmoji(id) {
  chatMessages.push({ role:'user', text:'[图片表情]', emojiImg: id, time: Date.now() });
  saveChatData();
  renderChat();
  document.getElementById('emojiPanel').classList.remove('show');
  setTimeout(async () => {
    const aiReply = await pickAiImgEmojiReply(id);
    chatMessages.push({ role:'ai', text: aiReply.text, emojiImg: aiReply.emojiImg || undefined, emoji: aiReply.emoji ? true : undefined, time: Date.now() });
    saveChatData();
    renderChat();
  }, 400 + Math.random() * 600);
}

async function pickAiImgEmojiReply(userEmojiId) {
  if (customImgEmojis.length > 1 && Math.random() < 0.5) {
    const candidates = customImgEmojis.filter(e => e.id !== userEmojiId);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      return { text: '[图片表情]', emojiImg: pick.id };
    }
  }
  const options = ['😊','✨','❤️','👍','🥰','😎','🤗','👀','🫶','😂'];
  const e = options[Math.floor(Math.random() * options.length)];
  return { text: e, emoji: true };
}

// 点击聊天区域关闭表情面板
document.addEventListener('click', (e) => {
  const panel = document.getElementById('emojiPanel');
  const btn = document.getElementById('emojiToggle');
  if (panel && panel.classList.contains('show') && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.remove('show');
  }
});

/* ---- 骰子/抽签 ---- */
function toggleDiceMenu() {
  const menu = document.getElementById('diceMenu');
  menu.classList.toggle('show');
  const emojiPanel = document.getElementById('emojiPanel');
  if (emojiPanel) emojiPanel.classList.remove('show');
}

function sendDice() {
  const val = Math.floor(Math.random() * 6) + 1;
  const diceChars = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  chatMessages.push({ role:'user', text: '🎲 掷骰子', time: Date.now() });
  chatMessages.push({ role:'ai', text: '你掷出了 ' + diceChars[val-1] + ' ' + val + ' 点！', time: Date.now() });
  saveChatData();
  renderChat();
  document.getElementById('diceMenu').classList.remove('show');
}

function sendLottery() {
  const input = prompt('输入选项，用逗号分隔：\n（如：吃饭,睡觉,学习）');
  if (!input) return;
  const options = input.split(/[,，]/).map(s=>s.trim()).filter(s=>s);
  if (options.length === 0) return;
  const result = options[Math.floor(Math.random() * options.length)];
  chatMessages.push({ role:'user', text: '🎯 抽签：' + input, time: Date.now() });
  chatMessages.push({ role:'ai', text: '🎯 抽签结果：『' + result + '』', time: Date.now() });
  saveChatData();
  renderChat();
  document.getElementById('diceMenu').classList.remove('show');
}

/* ---- Chat functions ---- */
function toggleSpConfig() {
  document.getElementById('modalAiName').value = personaData.name || '';
  document.getElementById('modalAiStory').value = personaData.story || '';
  document.getElementById('spTextarea').value = systemPrompt;
  document.getElementById('modalWorldBook').value = worldBook || '';
  var char = characters.find(c => c.id === currentCharId);
  document.getElementById('modalRelation').value = (char && char.relation) || '恋人';
  document.getElementById('spConfigModal').classList.add('show');
}
function closeSpConfig() { document.getElementById('spConfigModal').classList.remove('show'); }

function clearCurrentChat() {
  if (!confirm('确认清空和 ' + personaData.name + ' 的所有聊天记录？')) return;
  chatData[currentCharId] = [];
  chatMessages = [];
  saveChatData();
  renderChat();
  addChatSystem('🗑 聊天记录已清空');
  closeSpConfig();
}
function saveAiConfig() {
  // 保存当前角色的 AI 人设
  personaData.name = document.getElementById('modalAiName').value.trim() || '小伴';
  personaData.story = document.getElementById('modalAiStory').value.trim();
  systemPrompt = document.getElementById('spTextarea').value;
  worldBook = document.getElementById('modalWorldBook').value.trim();
  var relation = document.getElementById('modalRelation').value;

  lsSet('persona_' + currentCharId, personaData);
  lsSet('sp_' + currentCharId, systemPrompt);
  lsSet('worldBook', worldBook);

  // 保存关系到角色
  var char = characters.find(c => c.id === currentCharId);
  if (char) { char.relation = relation; lsSet('characters', characters); }

  document.getElementById('chatTitle').textContent = personaData.name;
  addChatSystem(`✅ ${personaData.name} 的人设已更新`);
  closeSpConfig();
}

async function sendChat() {
  const inp = document.getElementById('chatInput');
  const text = inp.value.trim();
  if (!text) return;
  chatMessages.push({ role:'user', text, time: Date.now() });
  saveChatData();
  inp.value = '';
  renderChat();
  saveMemory(text);

  // 自动记账检测
  const expenseParsed = parseExpenseFromChat(text);
  if (expenseParsed) {
    const expRecords = getExpRecords();
    expRecords.push({ id: Date.now() + "_" + Math.random().toString(36).slice(2,6), amount: expenseParsed.amount, type: expenseParsed.type, category: expenseParsed.category, note: text.substring(0,20), date: new Date().toISOString().split("T")[0] });
    saveExpRecords(expRecords);
    renderExpense();
    chatMessages.push({ role:"system", text: "💰 已自动记账：" + (expenseParsed.type === "income" ? "+" : "") + expenseParsed.amount.toFixed(2) + "元 (" + expenseParsed.category + ")", time: Date.now() });
    saveChatData();
    renderChat();
  }

  const typing = document.getElementById('chatTyping');
  typing.classList.add('show');

  try {
    let reply;
    if (apiConfig.apiKey) {
      reply = await callLLMApi(text);
    } else {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 800));
      reply = generateLocalReply(text);
    }
    typing.classList.remove('show');

    const parsed = parseAiActions(reply);
    chatMessages.push({ role:'ai', text:parsed.display, time: Date.now() });
    saveChatData();
    renderChat();
    executeAiActions(parsed.actions);
  } catch(e) {
    typing.classList.remove('show');
    const fallback = generateLocalReply(text);
    let errMsg = '';
    if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
      errMsg = '网络连接失败，请检查 API Key 和网络。如在中国大陆可能需要科学上网。';
    } else if (e.message.includes('401')) {
      errMsg = 'API Key 无效，请检查。';
    } else if (e.message.includes('402')) {
      errMsg = 'API 余额不足，请充值。';
    } else {
      errMsg = `API 错误：${e.message.substring(0,60)}`;
    }
    chatMessages.push({ role:'ai', text:fallback + `\n\n（⚠️ ${errMsg}，已切换本地回复）`, time: Date.now() });
    saveChatData();
    renderChat();
  }
}

/* ---- CORS 代理 ---- */
const CORS_PROXIES = [
  { name:'corsproxy.io', build: u => 'https://corsproxy.io/?url=' + encodeURIComponent(u) },
];
let corsProxyIndex = 0;

function buildCorsProxyUrl(targetUrl) {
  return CORS_PROXIES[corsProxyIndex % CORS_PROXIES.length].build(targetUrl);
}

/* ---- DeepSeek API ---- */
async function callLLMApi(userText) {
  let apiUrl = apiConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  if (apiConfig.useCorsProxy) {
    apiUrl = buildCorsProxyUrl(apiUrl);
  }

  const pName = personaData.name || '小伴';
  const personaPart = personaData.story ? `\n\n你的人设背景：${personaData.story}` : '';
  const worldBookPart = worldBook ? `\n\n【世界书 / 世界观设定】\n${worldBook}\n请在回复中自然地参考和遵守这些设定，但不要生硬地背诵规则。` : '';

  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
  const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;

  let contextBlock = `\n\n【当前环境信息 - 你可以主动提及这些内容，但不要每次都提，自然融入对话即可】`;
  // 用户人设注入
  if (userPersona && userPersona.name) {
    var charRelation = '恋人';
    var currentChar = characters.find(c => c.id === currentCharId);
    if (currentChar && currentChar.relation) charRelation = currentChar.relation;
    contextBlock += `\n【用户信息】你的用户叫${userPersona.name}，${userPersona.gender}，${userPersona.age}。性格：${userPersona.traits}。爱好：${userPersona.hobbies}。背景：${userPersona.background}。你和用户的关系：${charRelation}。在回复中自然融入这些信息，但不要生硬背诵。`;
  }

  var memoryBlock = getRecentMemories(20);
  if (memoryBlock) {
    contextBlock += '\n【AI的记忆 - 用户曾说过】\n' + memoryBlock;
  }
  contextBlock += `\n当前时间：${dateStr} ${timeStr}`;

  if (weatherData && Date.now() - weatherData.time < 3600000) {
    contextBlock += `\n当前天气：${weatherData.desc}，${weatherData.temp}°C，湿度${weatherData.humidity}%，风速${weatherData.windSpeed}km/h`;
  }
  if (tasks.length > 0) {
    const done = tasks.filter(t => t.done).length;
    const undone = tasks.length - done;
    contextBlock += `\n任务清单：共${tasks.length}个任务，${undone}个未完成，${done}个已完成`;
    if (undone > 0 && undone <= 5) {
      const undoneList = tasks.filter(t => !t.done).map(t => t.text).join('、');
      contextBlock += `（未完成：${undoneList}）`;
    }
  }
  const activeAlarms = alarms.filter(a => a.on);
  if (activeAlarms.length > 0) {
    contextBlock += `\n已设闹钟：${activeAlarms.map(a => a.time + (a.label ? '('+a.label+')' : '')).join('、')}`;
  }
  if (compState.running) {
    const mins = Math.floor(compState.seconds / 60);
    const secs = compState.seconds % 60;
    contextBlock += `\n正在进行陪伴计时：${compState.activity}，已持续${mins}分${secs}秒`;
  } else if (compState.activity && compState.seconds > 0) {
    const mins = Math.floor(compState.seconds / 60);
    contextBlock += `\n上次陪伴计时：${compState.activity}，共${mins}分钟（已暂停）`;
  }
  if (cdData && cdData.event) {
    const target = new Date(cdData.date);
    target.setHours(0,0,0,0);
    const now2 = new Date(); now2.setHours(0,0,0,0);
    const diffDays = Math.ceil((now2 - target) / (1000*60*60*24));
    if (diffDays >= 0) {
      contextBlock += `\n纪念日：${cdData.event}，已经${diffDays}天（${cdData.date}起）`;
    } else {
      contextBlock += `\n纪念日：${cdData.event}，还有${Math.abs(diffDays)}天（${cdData.date}）`;
    }
  }
  if (tideData.periods.length > 0) {
    const avgCycle = getAvgCycle();
    const predictions = getPredictedPeriods();
    contextBlock += `\n月经周期：平均${avgCycle}天，已记录${tideData.periods.length}次`;
    if (predictions.length > 0) {
      const nextP = predictions[0];
      const daysUntil = Math.ceil((new Date(nextP.start) - new Date()) / (1000*60*60*24));
      if (daysUntil > 0 && daysUntil <= 7) {
        contextBlock += `，下次经期约${daysUntil}天后（${nextP.start}），请适时关心`;
      } else if (daysUntil <= 0 && daysUntil >= -7) {
        contextBlock += `，目前可能在经期中，请温柔关心`;
      }
    }
  }
  const todayStr = new Date().toISOString().split('T')[0];
  const recentMoods = [];
  for (let d = 6; d >= 0; d--) {
    const dt = new Date(); dt.setDate(dt.getDate() - d);
    const ds = dt.toISOString().split('T')[0];
    if (moodData[ds]) recentMoods.push(`${ds.slice(5)}:${moodData[ds].emoji}${moodData[ds].label}`);
  }
  if (recentMoods.length > 0) {
    contextBlock += `\n近期心情：${recentMoods.join(' → ')}`;
  }
  if (moments.length > 0) {
    const recentM = moments.slice(0, 3).map(m => `${m.user}：「${m.content.substring(0,20)}${m.content.length>20?'...':''}」`).join('；');
    contextBlock += `\n最近朋友圈：${recentM}`;
  }

  const fullSystemPrompt = systemPrompt + personaPart + worldBookPart + contextBlock + `\n\n你的名字叫${pName}。回复规则：
1. 极简短，1-2句话，像微信聊天
2. 绝对不要用动作描写（如*微笑*、*拥抱*、*拍肩*），只说纯文字
3. 不要加任何emoji（除非用户主动发表情）
4. 不要长篇大论、不要总结、不要解释

【你可以执行的操作 — 在回复中用特殊标记】
- 添加任务：在回复中包含 [TASK:任务内容] 即可自动添加到用户的任务清单
- 添加多个任务：每行一个 [TASK:xxx]
- 你可以主动提及当前环境信息，比如天气变了提醒带伞、任务多的时候鼓励、经期前关心等。`;

  const contextMsgs = chatMessages.slice(-20).map(m => ({
    role: m.role === 'ai' ? 'assistant' : m.role === 'user' ? 'user' : 'system',
    content: m.text
  }));

  const body = {
    model: apiConfig.model || 'deepseek-chat',
    messages: [
      { role: 'system', content: fullSystemPrompt },
      ...contextMsgs,
      { role: 'user', content: userText }
    ],
    max_tokens: 512,
    temperature: 0.8
  };

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiConfig.apiKey}`
    },
    body: JSON.stringify(body)
  }).catch(async e => {
    if (!apiConfig.useCorsProxy) {
      // 直连失败不自动开启代理
    }
    throw e;
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`API ${resp.status}: ${errText.substring(0,100)}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 返回内容为空');
  return content.trim();
}

/* ---- 自动记账解析 ---- */
const EXPENSE_KEYWORDS = [
  ['餐饮', /吃|饭|食堂|外卖|餐|喝|饮|咖啡|奶茶|早|中|晚|午|夜宵|零食/],
  ['交通', /车|交通|打车|地铁|公交|加油|骑车|停车/],
  ['购物', /买|购物|衣服|鞋|包|网购|超市/],
  ['娱乐', /玩|娱乐|电影|游戏|视频|唱歌|旅游/],
  ['学习', /学|书|课|文具|资料|打印/],
  ['日用', /日|用|生活|水电|物业|话费|理发/],
  ['医疗', /药|医院|看病|体检|牙/],
];

function parseExpenseFromChat(text) {
  var numMatch = text.match(/\d+(\.\d+)?/);
  var amount = numMatch ? parseFloat(numMatch[0]) : null;
  if (!amount || amount <= 0 || amount > 99999999) return null;
  var isIncome = /收入|工资|兼职|红包|进账|发钱|生活费/.test(text);
  var type = isIncome ? "income" : "expense";
  var category = isIncome ? "其他收入" : "其他";
  if (!isIncome) {
    for (var i = 0; i < EXPENSE_KEYWORDS.length; i++) {
      if (EXPENSE_KEYWORDS[i][1].test(text)) { category = EXPENSE_KEYWORDS[i][0]; break; }
    }
  } else {
    if (/工资|薪水/.test(text)) category = "工资";
    else if (/兼职|副业/.test(text)) category = "兼职";
    else if (/红包/.test(text)) category = "红包";
  }
  return { amount: amount, type: type, category: category };
}

/* ---- 解析 AI 操作指令 ---- */
function parseAiActions(reply) {
  const actions = [];
  let display = reply;
  const taskRegex = /\[TASK:(.*?)\]/g;
  let match;
  while ((match = taskRegex.exec(reply)) !== null) {
    actions.push({ type: 'task', content: match[1].trim() });
  }
  const schedRegex = /\[SCHEDULE:(.*?)\]/g;
  while ((match = schedRegex.exec(reply)) !== null) {
    actions.push({ type: 'schedule', content: match[1].trim() });
  }
  const alarmRegex = /\[ALARM:(.*?)\|(\d{1,2}:\d{2})\]/g;
  while ((match = alarmRegex.exec(reply)) !== null) {
    actions.push({ type: 'alarm', label: match[1].trim(), time: match[2].trim() });
  }
  display = display.replace(taskRegex, '').replace(schedRegex, '').replace(alarmRegex, '').replace(/\n{3,}/g, '\n\n').trim();
  return { display, actions };
}

function executeAiActions(actions) {
  const pName = personaData.name || '小伴';
  actions.forEach(a => {
    if (a.type === 'task') {
      tasks.push({ text: a.content, done: false });
      lsSet('tasks', tasks);
      renderSchedule();
      addChatSystem(`📋 ${pName}帮你添加了任务：${a.content}`);
    } else if (a.type === 'schedule') {
      const parts = a.content.split('|').map(s => s.trim());
      const sText = parts[0] || '';
      const sDate = parts[1] || '';
      const sTime = parts[2] || '';
      if (sText) addSchedulePreview([{ text: sText, date: sDate, time: sTime }]);
    }
  });
}

/* ---- 本地降级回复 ---- */
function generateLocalReply(text) {
  const t = text.toLowerCase();
  const pName = personaData.name || '小伴';
  const hour = new Date().getHours();

  if (/天气|下雨|温度|冷|热|出门|带伞|穿什么/.test(t)) {
    if (weatherData && Date.now() - weatherData.time < 3600000) {
      return `${pName}看了下天气：现在${weatherData.desc}，${weatherData.temp}°C，湿度${weatherData.humidity}%。${weatherData.code>=61?'记得带伞哦！':weatherData.temp<10?'穿厚一点！':weatherData.temp>30?'注意防暑～':'出门挺舒服的！'}`;
    }
    return `${pName}还没拿到天气数据呢，点击主页天气卡片刷新一下？`;
  }
  if (/早上|早安|早|good morning|morning/.test(t)) {
    return hour < 9 ? `${pName}觉得早晨的空气特别好呢～早上好！☀️` : `早上好呀！虽然已经不早了，但有好心情就够啦～`;
  }
  if (/晚安|睡了|good night/.test(t)) return `晚安～做个好梦 🌙 ${pName}会守着你的。`;
  if (/你好|hi|hello|嗨|hey/.test(t)) {
    const greetings = [`嗨～我是${pName}，有什么想聊的吗？`,`你好呀！${pName}在呢～`,`嗨！今天怎么样？`];
    return greetings[Math.floor(Math.random()*greetings.length)];
  }
  if (/任务|备忘|待办|todo/.test(t)) {
    const undone = tasks.filter(x=>!x.done).length;
    return undone > 0 ? `你有 ${undone} 个未完成的任务哦～要不要去看看？` : `所有任务都完成啦！真棒 🎉`;
  }
  if (/添加任务|新建任务|提醒我/.test(t)) {
    const taskText = t.replace(/添加任务|新建任务|提醒我/g,'').trim();
    if (taskText) {
      tasks.push({ text:taskText, done:false });
      lsSet('tasks', tasks);
      renderSchedule();
      return `好的，已经帮你添加了任务：${taskText} ✓`;
    }
    return `想添加什么任务？直接告诉我就好～`;
  }
  if (/花了|买了|吃了|喝了|用了|付了|支出|消费/.test(t) && /\d+/.test(t)) {
    const amountMatch = t.match(/(\d+)(\.\d+)?/);
    if (amountMatch) {
      const amount = parseFloat(amountMatch[0]);
      if (amount > 0 && amount < 999999) {
        let category = "其他";
        if (/吃|饭|食堂|外卖|餐|喝|饮|咖啡|奶茶/.test(t)) category = "餐饮";
        else if (/买|购物|衣服|鞋|包|网购/.test(t)) category = "购物";
        else if (/车|交通|打车|地铁|公交|加油/.test(t)) category = "交通";
        else if (/玩|娱乐|电影|游戏/.test(t)) category = "娱乐";
        else if (/学|书|课|文具|资料/.test(t)) category = "学习";
        else if (/日|用|生活|水电|物业/.test(t)) category = "日用";
        const records = getExpRecords();
        records.push({ id: Date.now() + "_" + Math.random().toString(36).slice(2,6), amount, type: "expense", category, note: t.substring(0,20), date: new Date().toISOString().split("T")[0] });
        saveExpRecords(records);
        renderExpense();
        return "💰 已自动记账：" + category + " " + amount.toFixed(2) + "元";
      }
    }
  }
  if (/收入|工资|兼职|红包|进账|发钱/.test(t) && /\d+/.test(t)) {
    const amountMatch = t.match(/(\d+)(\.\d+)?/);
    if (amountMatch) {
      const amount = parseFloat(amountMatch[0]);
      if (amount > 0 && amount < 999999) {
        let category = "其他收入";
        if (/工资|薪水/.test(t)) category = "工资";
        else if (/兼职|副业/.test(t)) category = "兼职";
        else if (/红包/.test(t)) category = "红包";
        const records = getExpRecords();
        records.push({ id: Date.now() + "_" + Math.random().toString(36).slice(2,6), amount, type: "income", category, note: t.substring(0,20), date: new Date().toISOString().split("T")[0] });
        saveExpRecords(records);
        renderExpense();
        return "💰 已自动记账：" + category + " +" + amount.toFixed(2) + "元";
      }
    }
  }
  if (/闹钟|提醒|叫醒|定时/.test(t)) {
    const timeMatch = t.match(/(\d{1,2}):?(\d{2})/);
    if (timeMatch) {
      const h = timeMatch[1].padStart(2,'0');
      const m = timeMatch[2];
      const time = h+':'+m;
      alarms.push({ time, label:'聊天设定', on:true });
      lsSet('alarms', alarms);
      renderAlarms();
      return `好的，已经设定了 ${time} 的闹钟 ⏰`;
    }
    return `想设定几点的闹钟？比如"7:30提醒我"～`;
  }
  if (/陪伴|一起|专注/.test(t)) {
    if (compState.running) {
      return `${pName}正在陪你${compState.activity}哦，已经 ${Math.floor(compState.seconds/60)} 分钟了！`;
    }
    return `想一起做什么呢？可以去陪伴页面选择活动哦～${COMPANION_ACTIVITIES.map(a=>a.emoji+a.name).join(' ')}`;
  }
  if (/月经|经期|生理期|大姨妈|例假|周期/.test(t)) {
    if (tideData.periods.length > 0) {
      const avgCycle = getAvgCycle();
      const predictions = getPredictedPeriods();
      if (predictions.length > 0) {
        const daysUntil = Math.ceil((new Date(predictions[0].start) - new Date()) / (1000*60*60*24));
        return `你平均周期${avgCycle}天，下次经期预计约${daysUntil > 0 ? daysUntil + '天后' : '进行中'}。记得注意保暖和休息`;
      }
      return `你平均周期${avgCycle}天，已记录${tideData.periods.length}次。`;
    }
    return `还没有记录过经期哦，可以去潮汐页面记录`;
  }
  if (/心情|情绪|感受|感觉怎么样/.test(t)) {
    const todayStr2 = new Date().toISOString().split('T')[0];
    if (moodData[todayStr2]) {
      return `今天你的心情是 ${moodData[todayStr2].emoji} ${moodData[todayStr2].label}，${moodData[todayStr2].score >= 3 ? '状态不错呢！' : '要不要聊聊？我陪你～'}`;
    }
    return `今天还没记录心情哦，可以在每日心情页面选择emoji～`;
  }
  if (/开心|高兴|快乐|happy/.test(t)) return `太好了！${pName}也开心了`;
  if (/难过|伤心|不开心|sad/.test(t)) return `抱抱你，${pName}一直在`;
  if (/累|疲惫|困|tired/.test(t)) return `辛苦了，好好休息`;
  if (/谢谢|thanks/.test(t)) return `不客气呀`;
  if (/喜欢|love|爱/.test(t)) return `${pName}也喜欢你`;
  if (/你是谁|你叫什么/.test(t)) return `我是${pName}！${personaData.story ? personaData.story.substring(0,60)+'...' : '你的贴心陪伴～'}`;

  const contextHints = [];
  if (weatherData && weatherData.temp < 10) contextHints.push(`今天才${weatherData.temp}°C，记得保暖！`);
  if (weatherData && weatherData.code >= 61) contextHints.push(`外面在下雨，出门记得带伞哦～`);
  if (tasks.filter(x=>!x.done).length > 3) contextHints.push(`还有不少任务没完成呢，加油！`);
  if (hour >= 22) contextHints.push(`夜深了，注意休息呀～`);
  if (contextHints.length > 0 && Math.random() < 0.3) {
    return contextHints[Math.floor(Math.random()*contextHints.length)];
  }

  const defaults = [`嗯嗯，在听`,`说下去呀`,`有意思`,`说得对`,`嗯，然后呢？`,`哈哈是吗`];
  return defaults[Math.floor(Math.random()*defaults.length)];
}
