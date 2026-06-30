/* ==================== 11. Secret — 多角色翻手机 ==================== */
let secretCharId = lsGet('secretCharId', currentCharId || 'luo');
let secretData = lsGet('secretData', {}); // { charId: { data, time } }
let secretGenerated = null; // 保留兼容

function getSecretForChar(charId) {
  const entry = secretData[charId];
  if (entry && entry.data) return entry.data;
  return null;
}

function setSecretForChar(charId, data) {
  secretData[charId] = { data, time: Date.now() };
  lsSet('secretData', secretData);
}

function getCharPersona(charId) {
  const char = characters.find(c => c.id === charId);
  if (!char) return { name:'AI', story:'' };
  const saved = lsGet('persona_' + charId, null);
  if (saved) return saved;
  return { name: char.name, story: char.story };
}

async function generateSecretContent(charId) {
  const charIdToUse = charId || secretCharId;
  const charPers = getCharPersona(charIdToUse);
  const pName = charPers.name || 'AI';
  const story = charPers.story || '';

  // 检查是否有缓存（10分钟内）
  const existing = getSecretForChar(charIdToUse);
  if (apiConfig.apiKey && (!existing || Date.now() - (secretData[charIdToUse]?.time || 0) > 600000)) {
    // 构建联系人列表：包含其他AI角色
    let otherChars = characters.filter(c => c.id !== charIdToUse);
    let otherCharContacts = otherChars.map((c, i) => ({
      id: 'ai_' + c.id,
      avatar: c.avatar || '💬',
      name: c.name,
      nickname: c.name,
      lastMsg: '',
      time: ''
    }));

    const contactPrompt = otherCharContacts.length > 0
      ? `\n额外联系人（AI角色）：${otherCharContacts.map(c => `${c.avatar} ${c.name}`).join('、')}—— 这些也是AI角色，${pName}和他们认识，请把其中2-3个也放进联系人列表，并生成对话`
      : '';

    const prompt = `你现在是${pName}。${story ? '你的性格/背景：' + story : ''}请用JSON格式生成以下手机内容（不要额外文字，只输出JSON）：

1. 微信聊天列表：6-8个联系人，包含emoji头像、名字、"nickname"（备注/外号）、最后一条消息预览、时间
2. 你和其中3-4个联系人的完整对话（每个3-6条消息，符合你的性格）
3. 你的相册：8张照片（emoji、标题、时间）
4. 你的最近播放：6首歌（歌名、歌手、时间）
${contactPrompt}

联系人的例子：蛋糕店老板、快递员、楼下咖啡店员、房东、朋友、家人${otherChars.length > 0 ? '、其他AI角色' : ''}等

JSON格式：
{
  "contacts": [{ "id":"1", "avatar":"🎂", "name":"甜时蛋糕", "nickname":"备注名", "lastMsg":"最后一条消息", "time":"时间" }],
  "conversations": { "1": [{ "from":"me", "text":"..." }, { "from":"them", "text":"..." }] },
  "album": [{ "emoji":"🌅", "label":"标题", "time":"时间" }],
  "playlist": [{ "title":"歌名", "artist":"歌手", "time":"时间" }]
}`;

    try {
      const reply = await callLLMApi(prompt);
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // 如果没包含AI角色，手动加进去
        otherChars.forEach(c => {
          if (!parsed.contacts.find(ct => ct.id === 'ai_' + c.id)) {
            parsed.contacts.push({
              id: 'ai_' + c.id,
              avatar: c.avatar || '💬',
              name: c.name,
              nickname: c.name,
              lastMsg: '最近没联系',
              time: ''
            });
            if (!parsed.conversations) parsed.conversations = {};
            parsed.conversations['ai_' + c.id] = [
              { from:'me', text:'最近怎么样' },
              { from:'them', text:'还行吧，你呢' },
              { from:'me', text:'老样子' }
            ];
          }
        });
        setSecretForChar(charIdToUse, parsed);
        return parsed;
      }
    } catch(e) { console.log('[Secret] AI生成失败:', e); }
  }

  // === 本地降级：根据角色生成不同的内容 ===
  if (!existing) {
    const localData = generateLocalSecretContent(charIdToUse, charPers);
    if (localData) {
      setSecretForChar(charIdToUse, localData);
      return localData;
    }
  }
  return existing;

  function generateLocalSecretContent(charId, charPers) {
    const name = charPers.name || 'AI';
    const story = charPers.story || '';
    const s = story.toLowerCase();

    // 根据性格关键词选模板风格
    const isTsundere = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(s);
    const isGentle = /温柔|温暖|亲切|可爱|软/.test(s);
    const isCool = /冷淡|高冷|沉默|安静/.test(s);

    // 不同角色的联系人
    const contacts = [
      { id:'you', avatar:'💬', name:'你', nickname: isTsundere ? '那家伙' : isGentle ? '小可爱' : '你', lastMsg:'', time:'' },
      { id:'1', avatar: isTsundere ? '🎂' : '🌸', name: isTsundere ? '甜时蛋糕' : '花语花店', nickname: isTsundere ? '蛋糕店' : '花店老板', lastMsg: isTsundere ? '明天来取蛋糕～' : '新到的玫瑰要看看吗？', time:'下午' },
      { id:'2', avatar:'📦', name:'顺丰快递', nickname:'快递小哥', lastMsg:'包裹已放保安室', time:'上午' },
      { id:'3', avatar: isGentle ? '☕' : '🏪', name: isGentle ? '转角咖啡' : '楼下便利店', nickname: isGentle ? '咖啡小妹' : '老板', lastMsg: isGentle ? '今天也是老样子吗☺️' : (isTsundere ? '再不来我拆了😏' : '新进了关东煮'), time: isGentle ? '早上' : '昨天' },
    ];

    // 不同角色的对话
    const convos = {};
    convos['1'] = isTsundere
      ? [{ from:'them', text:'您好，蛋糕做好了' },{ from:'me', text:'嗯，糖减半了吧' },{ from:'them', text:'减了，动物奶油，放心' },{ from:'me', text:'行' }]
      : isGentle
      ? [{ from:'them', text:'今天有新的粉玫瑰哦' },{ from:'me', text:'好看，包一束吧' },{ from:'them', text:'好嘞，送给谁的呀☺️' }]
      : [{ from:'them', text:'老板，这个月会员日有活动' },{ from:'me', text:'什么活动' },{ from:'them', text:'满100减15' },{ from:'me', text:'哦，那来一箱牛奶' }];

    // 其他AI角色的对话
    const otherAIs = characters.filter(c => c.id !== charId);
    otherAIs.forEach(c => {
      const cid = 'ai_' + c.id;
      if (!contacts.find(ct => ct.id === cid)) {
        contacts.push({ id: cid, avatar: c.avatar || '💬', name: c.name, nickname: c.name, lastMsg: '最近没联系', time: '' });
      }
      convos[cid] = [
        { from:'me', text: isTsundere ? '干嘛' : '最近怎么样' },
        { from:'them', text: '挺好的，你呢' },
        { from:'me', text: isTsundere ? '还行' : '老样子呗' },
      ];
    });

    // 相册
    const album = isTsundere
      ? [{ emoji:"🌅", label:"今天的晚霞", time:"今天" },{ emoji:"☕", label:"她喝的咖啡", time:"今天" },{ emoji:"🐱", label:"楼下流浪猫", time:"昨天" },{ emoji:"🍰", label:"蛋糕店新品", time:"昨天" },{ emoji:"🌧", label:"下雨了", time:"前天" },{ emoji:"🌙", label:"今晚月亮", time:"3天前" },{ emoji:"📖", label:"她认真的时候", time:"3天前" },{ emoji:"🌸", label:"路边的花", time:"5天前" }]
      : isGentle
      ? [{ emoji:"🌸", label:"今天买的花", time:"今天" },{ emoji:"☀️", label:"好天气", time:"今天" },{ emoji:"🐱", label:"猫咖的小橘", time:"昨天" },{ emoji:"📚", label:"新买的书", time:"昨天" },{ emoji:"🎵", label:"听到一首好歌", time:"前天" },{ emoji:"🌧", label:"听雨", time:"3天前" },{ emoji:"🍰", label:"做了蛋糕", time:"4天前" },{ emoji:"🌙", label:"月色很美", time:"5天前" }]
      : [{ emoji:"☕", label:"早上的咖啡", time:"今天" },{ emoji:"📱", label:"刷到有趣的新闻", time:"今天" },{ emoji:"🍜", label:"晚饭", time:"昨天" },{ emoji:"💻", label:"工作", time:"昨天" },{ emoji:"🌧", label:"下雨", time:"前天" },{ emoji:"🎮", label:"打游戏", time:"3天前" },{ emoji:"🍺", label:"朋友聚会", time:"4天前" },{ emoji:"🌙", label:"深夜", time:"5天前" }];

    // 歌单
    const playlist = isTsundere
      ? [{ title:'路过人间', artist:'郁可唯', time:'刚刚' },{ title:'唯一', artist:'告五人', time:'昨天' },{ title:'起风了', artist:'买辣椒也用券', time:'昨天' },{ title:'小半', artist:'陈粒', time:'前天' },{ title:'喜欢你', artist:'陈洁仪', time:'4天前' }]
      : isGentle
      ? [{ title:'小美满', artist:'周深', time:'刚刚' },{ title:'日常', artist:'田馥甄', time:'昨天' },{ title:'暖暖', artist:'梁静茹', time:'昨天' },{ title:'小手拉大手', artist:'梁静茹', time:'前天' },{ title:'陪你度过漫长岁月', artist:'陈奕迅', time:'3天前' }]
      : [{ title:'空城', artist:'杨坤', time:'刚刚' },{ title:'演员', artist:'薛之谦', time:'昨天' },{ title:'丑八怪', artist:'薛之谦', time:'昨天' },{ title:'像我这样的人', artist:'毛不易', time:'前天' },{ title:'平凡之路', artist:'朴树', time:'4天前' }];

    // 所有联系人确保有conversations条目
    contacts.forEach(c => {
      if (c.id !== 'you' && !convos[c.id]) {
        convos[c.id] = [{ from:'me', text:'最近怎么样' },{ from:'them', text:'挺好的' }];
      }
    });

    return { contacts, conversations: convos, album, playlist };
  }
}

function getSecretNickname(contactId) {
  const data = getSecretForChar(secretCharId);
  if (data && data.contacts) {
    const c = data.contacts.find(c => c.id === contactId);
    if (c && c.nickname) return c.nickname;
  }
  return null;
}

function getSecretCharName() {
  const char = getCharPersona(secretCharId);
  return char.name || 'AI';
}

/* ---- 角色切换 ---- */
function switchSecretChar(charId) {
  secretCharId = charId;
  lsSet('secretCharId', charId);
  const char = getCharPersona(charId);
  document.getElementById('secretAiName').textContent = char.name;
  // 如果当前在桌面视图，刷新
  if (document.getElementById('secretDesk').style.display !== 'none') {
    renderSecretDesk();
  }
}

function renderSecretDesk() {
  const char = getCharPersona(secretCharId);
  document.getElementById('secretAiName').textContent = char.name;
  // 异步刷新内容
  generateSecretContent(secretCharId);
}

function showSecretDesk() {
  document.getElementById('secretDesk').style.display = 'flex';
  document.getElementById('secretContent').style.display = 'none';
  document.getElementById('secretBackBtn').style.display = 'none';
  document.getElementById('secretTitle').textContent = '🔍 AI的手机';
  renderSecretDesk();
  renderSecretCharSwitcher();
}

function renderSecretCharSwitcher() {
  const container = document.getElementById('secretCharSwitcher');
  if (!container) return;
  container.innerHTML = '';
  characters.forEach(c => {
    const btn = document.createElement('button');
    btn.style.cssText = `padding:4px 10px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .1s;${
      c.id === secretCharId ? 'background:#2D3748;color:#fff;' : 'background:#EDF2F7;color:#718096;'
    }`;
    btn.textContent = c.avatar + ' ' + c.name;
    btn.onclick = () => switchSecretChar(c.id);
    container.appendChild(btn);
  });
}

function showSecretChat() {
  document.getElementById('secretDesk').style.display = 'none';
  document.getElementById('secretContent').style.display = 'block';
  document.getElementById('secretBackBtn').style.display = 'inline';
  document.getElementById('secretTitle').textContent = '💬 聊天记录';
  const pName = getSecretCharName();
  document.getElementById('secretAiName').textContent = pName;
  const container = document.getElementById('secretContent');

  generateSecretContent(secretCharId);

  const data = getSecretForChar(secretCharId);
  const useApi = data && data.contacts;
  const contacts = useApi ? data.contacts : [
    { id:'you', avatar:'💬', name:'你', nickname:'她', lastMsg:'', time:'' },
    { id:'1', avatar:'🎂', name:'甜时蛋糕', nickname:'蛋糕店', lastMsg:'明天来取蛋糕～', time:'下午' },
    { id:'2', avatar:'📦', name:'顺丰快递', nickname:'快递', lastMsg:'包裹已放保安室', time:'上午' },
    { id:'3', avatar:'☕', name:'楼下咖啡', nickname:'咖啡小哥', lastMsg:'老样子哈', time:'早上' },
    { id:'4', avatar:'🏪', name:'便利店老板', nickname:'老板', lastMsg:'再不来我拆了😏', time:'昨天' },
  ];

  const today = new Date().toISOString().split('T')[0];
  const charMsgs = chatData[secretCharId] || [];
  const todayMsgs = charMsgs.filter(m => m.time && new Date(m.time).toISOString().split('T')[0] === today);
  const yourLastMsg = todayMsgs.length > 0 ? todayMsgs[todayMsgs.length-1].text.substring(0,20) : '';

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">微信</div>';

  if (yourLastMsg) {
    const yourNote = getSecretNickname('you') || '她';
    h += '<div class="secret-contact-item" onclick="showSecretConvo(\'you\')">' +
      '<div class="sci-avatar">💬</div>' +
      '<div class="sci-info"><div class="sci-name-row"><span class="sci-nickname">' + escHtml(yourNote) + '</span></div>' +
      '<div class="sci-lastmsg">' + escHtml(yourLastMsg) + '</div></div>' +
      '<div class="sci-time">现在</div></div>';
  }

  contacts.forEach(function(c) {
    if (c.id === 'you') return;
    const nickname = getSecretNickname(c.id) || c.nickname || c.name.replace(/^[^\s]+\s/, '');
    h += '<div class="secret-contact-item" onclick="showSecretConvo(\'' + c.id + '\')">' +
      '<div class="sci-avatar">' + c.avatar + '</div>' +
      '<div class="sci-info"><div class="sci-name-row"><span class="sci-nickname">' + escHtml(nickname) + '</span></div>' +
      '<div class="sci-lastmsg">' + escHtml(c.lastMsg || '') + '</div></div>' +
      '<div class="sci-time">' + escHtml(c.time || '') + '</div></div>';
  });

  h += '<div style="font-size:10px;color:#ddd;text-align:center;padding:16px 0 8px;">—— 没有更多了 ——</div>';
  container.innerHTML = h;
}

function showSecretConvo(contactId) {
  document.getElementById('secretTitle').textContent = '💬 聊天记录';
  document.getElementById('secretBackBtn').onclick = showSecretChat;
  const container = document.getElementById('secretContent');
  const pName = getSecretCharName();

  var contact = null;
  const data = getSecretForChar(secretCharId);
  if (contactId === 'you') {
    contact = { name:'你', avatar:'💬', nickname: getSecretNickname('you') || '她' };
  } else if (data && data.contacts) {
    contact = data.contacts.find(function(c) { return c.id === contactId; });
  }

  var nickname = (contact && contact.nickname) ? contact.nickname : ((contact && contact.name) ? contact.name.replace(/^[^\s]+\s/, '') : '联系人');
  var avatar = (contact && contact.avatar) ? contact.avatar : '💬';
  var displayName = contactId === 'you' ? nickname : ((contact && contact.name) || nickname);

  var msgs = [];
  if (contactId === 'you') {
    var today = new Date().toISOString().split('T')[0];
    msgs = chatMessages.filter(function(m) { return m.time && new Date(m.time).toISOString().split('T')[0] === today; });
  } else if (data && data.conversations && data.conversations[contactId]) {
    msgs = data.conversations[contactId];
  } else {
    var staticConvos = {
      '1': [{ from:'them', text:'您好，蛋糕做好了，明天来取～' },{ from:'me', text:'好，她喜欢芋泥，别太甜' },{ from:'them', text:'糖减半了，用的动物奶油，配丝带😄' }],
      '2': [{ from:'them', text:'您包裹已放保安室，请及时取件' },{ from:'me', text:'嗯' }],
      '3': [{ from:'them', text:'帅哥今天美式还是拿铁？' },{ from:'me', text:'拿铁，多加份浓缩' },{ from:'them', text:'好嘞老样子' }],
      '4': [{ from:'them', text:'快递在我这放三天了😏' },{ from:'me', text:'……忘了' },{ from:'them', text:'再不来我拆开看了啊' },{ from:'me', text:'你敢' }],
    };
    msgs = staticConvos[contactId] || [];
  }

  if (msgs.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#ccc;padding:40px;font-size:13px;">暂无消息</div>';
    return;
  }

  var h = '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #eee;margin-bottom:8px;">' +
    '<div style="font-size:28px;">' + avatar + '</div>' +
    '<div><div style="font-size:15px;font-weight:600;">' + escHtml(displayName) + '</div>' +
    '<div style="font-size:11px;color:#999;">' + (nickname !== displayName ? '备注：' + escHtml(nickname) : '') + '</div></div></div>';

  msgs.forEach(function(m) {
    var isMe = m.from === 'me' || m.role === 'ai';
    var isSystem = m.role === 'system';
    if (isSystem) {
      h += '<div style="text-align:center;font-size:11px;color:#999;padding:8px 0;">' + escHtml(m.text) + '</div>';
    } else {
      h += '<div class="convo-bubble ' + (isMe ? 'me' : 'them') + '">' +
        '<div class="convo-text">' + escHtml(m.text) + '</div></div>';
    }
  });

  container.innerHTML = h;
  setTimeout(function() { container.scrollTop = container.scrollHeight; }, 200);
}

function showSecretNotes() {
  generateSecretContent(secretCharId);
  document.getElementById('secretDesk').style.display = 'none';
  document.getElementById('secretContent').style.display = 'block';
  document.getElementById('secretBackBtn').style.display = 'inline';
  document.getElementById('secretTitle').textContent = '📓 记事本';
  const pName = getSecretCharName();
  document.getElementById('secretAiName').textContent = pName;
  const container = document.getElementById('secretContent');
  const today = new Date().toISOString().split('T')[0];
  const charMsgs = chatData[secretCharId] || [];
  const todayMsgs = charMsgs.filter(m => m.time && new Date(m.time).toISOString().split('T')[0] === today);
  const notes = generateSecretNotes(todayMsgs);
  if (notes.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#ccc;padding:40px;font-size:13px;">今天还没有记录笔记</div>';
    return;
  }
  container.innerHTML = '<div style="font-size:11px;color:#bbb;padding:4px 0 8px;">' + pName + '偷偷记下的笔记</div>';
  if (memories.length > 0) {
    var recentMemories = memories.slice(-30).reverse();
    recentMemories.forEach(function(mem) {
      var d = new Date(mem.time);
      var timeStr = d.getMonth()+1 + '月' + d.getDate() + '日 ' + d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
      var noteEl = document.createElement('div');
      noteEl.className = 'secret-note-card';
      noteEl.innerHTML = '<div class="sn-time">' + timeStr + '</div><div class="sn-text">' + escHtml(mem.text) + '</div>';
      container.appendChild(noteEl);
    });
    return;
  }
  notes.forEach(n => {
    const el = document.createElement('div');
    el.className = 'secret-note-card';
    el.innerHTML = '<div class="sn-time">' + (n.time||'') + '</div><div class="sn-text">' + escHtml(n.text) + '</div>';
    container.appendChild(el);
  });
}

function generateSecretNotes(msgs) {
  const notes = [];
  const userMsgs = msgs.filter(m => m.role === 'user');
  userMsgs.forEach(m => {
    const t = m.text;
    if (t.length < 3) return;
    if (/考|试|上课|老师|作业|论文|复习|六级|考试/.test(t)) {
      notes.push({ text: '她今天提到了学习相关的事', time: new Date(m.time).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) });
    }
    if (/累|烦|难过|不开心|伤心|焦虑/.test(t)) {
      notes.push({ text: '她的心情不太好，要多关心她', time: new Date(m.time).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) });
    }
    if (/吃|饭|食堂|外卖|好吃|饿/.test(t)) {
      notes.push({ text: '她今天吃了东西，要注意她有没有好好吃饭', time: new Date(m.time).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) });
    }
    if (/睡|觉|熬夜|失眠|困/.test(t)) {
      notes.push({ text: '她的作息需要关注一下', time: new Date(m.time).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) });
    }
    if (/喜欢|爱|想|梦|梦到/.test(t)) {
      notes.push({ text: '她跟我分享了她在意的事', time: new Date(m.time).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) });
    }
  });
  if (notes.length === 0 && msgs.length > 0) {
    notes.push({ text: '今天和她聊了天，一共' + msgs.length + '条消息', time: '今天' });
    const lastMsg = msgs[msgs.length-1];
    if (lastMsg) notes.push({ text: '她最后跟我说的是关于"' + lastMsg.text.substring(0,15) + '"', time: new Date(lastMsg.time).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'}) });
  }
  const seen = new Set();
  return notes.filter(n => { if (seen.has(n.text)) return false; seen.add(n.text); return true; }).slice(0, 10);
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function showSecretPlaylist() {
  document.getElementById("secretDesk").style.display = "none";
  document.getElementById("secretContent").style.display = "block";
  document.getElementById("secretBackBtn").style.display = "inline";
  document.getElementById("secretTitle").textContent = "🎵 " + (getSecretCharName()) + "的歌单";
  const pName = getSecretCharName();
  const container = document.getElementById("secretContent");
  const now = new Date();
  const hr = now.getHours();

  const data = getSecretForChar(secretCharId);
  const useApi = data && data.playlist;
  const recentlyPlayed = useApi ? data.playlist : [
    { title:'路过人间', artist:'郁可唯', time:'刚刚' },
    { title:'小美满', artist:'周深', time:'昨天' },
    { title:'唯一', artist:'告五人', time:'昨天' },
    { title:'起风了', artist:'买辣椒也用券', time:'前天' },
    { title:'喜欢你', artist:'陈洁仪', time:'4天前' },
  ];

  const timeGreeting = hr < 6 ? '深夜' : hr < 9 ? '清晨' : hr < 12 ? '上午' : hr < 14 ? '午后' : hr < 18 ? '下午' : hr < 21 ? '傍晚' : '夜晚';
  if (recentlyPlayed.length > 0 && recentlyPlayed[0].time === '刚刚') {
    recentlyPlayed[0].time = timeGreeting + ' · 刚刚';
  }

  const playlists = [
    { name: '🌙 安静的时候', songs: ['钢琴曲','月半小夜曲','路过人间','起风了'] },
    { name: '☀️ 想到她的时候', songs: ['小美满','唯一','喜欢你','想你的风吹到了这里'] },
    { name: '🎧 一个人发呆', songs: ['走神','空白格','好久不见','夜曲'] },
  ];

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">' + escHtml(pName) + '最近在听</div>';
  h += '<div class="playlist-header">🎶 最近播放</div>';
  recentlyPlayed.forEach(function(s) {
    h += '<div class="secret-playlist-item"><div class="sp-icon">🎧</div><div class="sp-info"><div class="sp-title">' + escHtml(s.title) + '</div><div class="sp-artist">' + escHtml(s.artist || '') + '</div></div><div class="sp-time">' + escHtml(s.time) + '</div></div>';
  });
  h += '<div class="playlist-header">📋 我的歌单</div>';
  playlists.forEach(function(p) {
    h += '<div class="secret-note-card"><div class="sn-text" style="font-weight:600;">' + escHtml(p.name) + '</div><div style="font-size:12px;color:#888;margin-top:4px;">' + escHtml(p.songs.join(' · ')) + '</div></div>';
  });
  container.innerHTML = h;
}

function showSecretAlbum() {
  document.getElementById("secretDesk").style.display = "none";
  document.getElementById("secretContent").style.display = "block";
  document.getElementById("secretBackBtn").style.display = "inline";
  document.getElementById("secretTitle").textContent = "🖼 " + (getSecretCharName()) + "的相册";
  const container = document.getElementById("secretContent");
  const pName = getSecretCharName();

  const data = getSecretForChar(secretCharId);
  const useApi = data && data.album;
  const photos = useApi ? data.album : [
    { emoji:"🌅", label:"今天的晚霞", time:"今天" },
    { emoji:"☕", label:"她喝咖啡", time:"今天" },
    { emoji:"🐱", label:"楼下小猫", time:"昨天" },
    { emoji:"📖", label:"她认真的时候", time:"昨天" },
    { emoji:"🍰", label:"蛋糕店看到的", time:"前天" },
    { emoji:"🌧", label:"下雨了", time:"3天前" },
    { emoji:"🌙", label:"今晚月亮", time:"3天前" },
    { emoji:"🌸", label:"路边的花", time:"5天前" },
  ];

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">' + escHtml(pName) + '的相册 · ' + Math.floor(20+Math.random()*50) + '张照片</div>';
  h += '<div class="secret-photo-grid">';
  photos.forEach(function(p) {
    h += '<div class="secret-photo-item"><div class="sp-emoji">' + p.emoji + '</div><div class="sp-label">' + escHtml(p.label) + '</div></div>';
  });
  h += '</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">';
  photos.forEach(function(p) {
    h += '<div class="secret-photo-time">' + escHtml(p.time) + '</div>';
  });
  h += '</div>';
  container.innerHTML = h;
}
