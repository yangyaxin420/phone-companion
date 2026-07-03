/* ==================== 11. Secret — 多角色翻手机 ==================== */
const SECRET_DATA_VERSION = 'v3';
let secretCharId = lsGet('secretCharId', currentCharId || 'luo');
let secretData = lsGet('secretData', {}); // { charId: { data, time, version } }
let secretGenerated = null; // 保留兼容
let secretApiFailed = {}; // charId -> timestamp, 记录API失败时间避免反复重试

function getSecretForChar(charId) {
  const entry = secretData[charId];
  if (entry && entry.data && entry.version === SECRET_DATA_VERSION) return entry.data;
  return null;
}

function setSecretForChar(charId, data) {
  secretData[charId] = { data, time: Date.now(), version: SECRET_DATA_VERSION };
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
  var lastFailed = secretApiFailed[charIdToUse] || 0;
  var shouldTryApi = apiConfig && apiConfig.apiKey && (Date.now() - lastFailed > 300000) && (!existing || Date.now() - (secretData[charIdToUse]?.time || 0) > 600000);
  if (shouldTryApi) {
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
5. 你的外卖订单：4-5个订单（商家名、菜品、价格、时间、状态）
6. 你的浏览器搜索记录：8-10条搜索内容（符合性格和日常）
${contactPrompt}

联系人的例子：蛋糕店老板、快递员、楼下咖啡店员、房东、朋友、家人${otherChars.length > 0 ? '、其他AI角色' : ''}等

JSON格式：
{
  "contacts": [{ "id":"1", "avatar":"🎂", "name":"甜时蛋糕", "nickname":"备注名", "lastMsg":"最后一条消息", "time":"时间" }],
  "conversations": { "1": [{ "from":"me", "text":"..." }, { "from":"them", "text":"..." }] },
  "album": [{ "emoji":"🌅", "label":"标题", "time":"时间" }],
  "playlist": [{ "title":"歌名", "artist":"歌手", "time":"时间" }],
  "foodOrders": [{ "shop":"商家名", "items":"菜品", "price":25.0, "time":"时间", "status":"已送达/配送中" }],
  "browserHistory": [{ "query":"搜索内容", "time":"时间" }]
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
              { from:'me', text:'你最近忙什么呢' },
              { from:'them', text:'还行吧，你呢' },
              { from:'me', text:'老样子呗' }
            ];
          }
        });
        setSecretForChar(charIdToUse, parsed);
        return parsed;
      }
    } catch(e) {
      console.log('[Secret] AI生成失败，5分钟内不再重试:', e.message.substring(0,50));
      secretApiFailed[charIdToUse] = Date.now();
    }
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
      convos[cid] = isTsundere
        ? [{ from:'them', text:'你最近是不是很闲' },{ from:'me', text:'？' },{ from:'them', text:'老来找我聊天' },{ from:'me', text:'……那我走了' },{ from:'them', text:'哎别' }]
        : isGentle
        ? [{ from:'them', text:'今天过得怎么样呀' },{ from:'me', text:'还行，有点累' },{ from:'them', text:'那要好好休息哦，我做了小饼干🍪' }]
        : [{ from:'them', text:'最近忙啥呢' },{ from:'me', text:'老样子' },{ from:'them', text:'约个饭啊，好久没见了' },{ from:'me', text:'行，周末' }];
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
    contacts.forEach(function(c) {
      if (c.id !== 'you' && !convos[c.id]) {
        convos[c.id] = isTsundere
          ? [{ from:'them', text:'找我有事？' },{ from:'me', text:'没事不能找你？' },{ from:'them', text:'……行吧' }]
          : isGentle
          ? [{ from:'them', text:'好久不见呀~' },{ from:'me', text:'是呀，最近还好吗' },{ from:'them', text:'挺好的，想你了！' }]
          : [{ from:'them', text:'在吗' },{ from:'me', text:'在' },{ from:'them', text:'行' }];
      }
    });

    // 外卖订单（按性格）
    const foodOrders = isTsundere
      ? [{ shop:'肯德基', items:'香辣鸡腿堡套餐', price:39.9, time:'昨晚', status:'已送达' },
         { shop:'一点点', items:'四季奶青 加波霸', price:16, time:'昨天下午', status:'已送达' },
         { shop:'沙县小吃', items:'蒸饺+拌面', price:18, time:'前天', status:'已送达' },
         { shop:'绝味鸭脖', items:'鸭锁骨+藕片', price:28, time:'3天前', status:'已送达' }]
      : isGentle
      ? [{ shop:'好利来', items:'半熟芝士+芋泥面包', price:48, time:'今天下午', status:'配送中' },
         { shop:'瑞幸咖啡', items:'生椰拿铁 少冰', price:19.9, time:'今天早上', status:'已送达' },
         { shop:'老乡鸡', items:'鸡汤+蒸蛋+米饭', price:32, time:'昨天', status:'已送达' },
         { shop:'鲜芋仙', items:'芋圆4号', price:28, time:'前天', status:'已送达' }]
      : [{ shop:'麦当劳', items:'板烧鸡腿堡套餐', price:36, time:'昨晚', status:'已送达' },
         { shop:'星巴克', items:'冰美式 大杯', price:32, time:'今天早上', status:'已送达' },
         { shop:'美团外卖', items:'黄焖鸡米饭', price:25, time:'昨天', status:'已送达' },
         { shop:'蜜雪冰城', items:'柠檬水+甜筒', price:8, time:'前天', status:'已送达' }];

    // 浏览器搜索记录（最有叙事潜力的部分）
    const browserHistory = isTsundere
      ? [{ query:'怎么哄生气的女朋友', time:'今天' },
         { query:'傲娇的人怎么表达关心', time:'昨天' },
         { query:'她喜欢的歌单', time:'昨天' },
         { query:'蛋糕店几点开门', time:'前天' },
         { query:'吵架后怎么和好', time:'3天前' },
         { query:'她最近在看什么剧', time:'4天前' },
         { query:'送什么礼物不会太明显', time:'5天前' },
         { query:'如何假装不在意', time:'6天前' }]
      : isGentle
      ? [{ query:'今日菜谱 简单好吃', time:'今天' },
         { query:'她喜欢吃甜的还是咸的', time:'昨天' },
         { query:'适合送花的节日', time:'昨天' },
         { query:'怎么让心情变好', time:'前天' },
         { query:'杭州周末去哪玩', time:'3天前' },
         { query:'她最近忙不忙', time:'4天前' },
         { query:'治愈系电影推荐', time:'5天前' },
         { query:'拼多多鲜花优惠券', time:'6天前' }]
      : [{ query:'今天天气', time:'今天' },
         { query:'附近有什么好吃的', time:'昨天' },
         { query:'周末去哪玩', time:'昨天' },
         { query:'如何提高工作效率', time:'前天' },
         { query:'现在流行什么', time:'3天前' },
         { query:'她喜欢什么', time:'4天前' },
         { query:'怎么聊天不尴尬', time:'5天前' },
         { query:'深夜emo怎么办', time:'6天前' }];

    return { contacts, conversations: convos, album, playlist, foodOrders, browserHistory };
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

async function showSecretChat() {
  document.getElementById('secretDesk').style.display = 'none';
  document.getElementById('secretContent').style.display = 'block';
  document.getElementById('secretBackBtn').style.display = 'inline';
  document.getElementById('secretTitle').textContent = '💬 聊天记录';
  const pName = getSecretCharName();
  document.getElementById('secretAiName').textContent = pName;
  const container = document.getElementById('secretContent');

  await generateSecretContent(secretCharId);
  const data = getSecretForChar(secretCharId);
  var contacts = (data && data.contacts) ? data.contacts : generateLocalContacts();

  var today = new Date().toISOString().split('T')[0];
  var charMsgs = chatData[secretCharId] || [];
  var todayMsgs = charMsgs.filter(function(m) { return m.time && new Date(m.time).toISOString().split('T')[0] === today; });
  var yourLastMsg = todayMsgs.length > 0 ? todayMsgs[todayMsgs.length-1].text.substring(0,20) : '';

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">微信</div>';

  if (yourLastMsg) {
    h += '<div class="secret-contact-item" onclick="showSecretConvo(\'you\')">' +
      '<div class="sci-avatar">💬</div>' +
      '<div class="sci-info"><div class="sci-name-row"><span class="sci-nickname">她</span></div>' +
      '<div class="sci-lastmsg">' + escHtml(yourLastMsg) + '</div></div>' +
      '<div class="sci-time">现在</div></div>';
  }

  contacts.forEach(function(c) {
    if (c.id === 'you') return;
    var nickname = c.nickname || c.name;
    var lastMsg = c.lastMsg || '';
    if (data && data.conversations && data.conversations[c.id] && data.conversations[c.id].length > 0) {
      var conv = data.conversations[c.id];
      var last = conv[conv.length - 1];
      if (last && last.text) lastMsg = last.text.substring(0, 20);
    }
    h += '<div class="secret-contact-item" onclick="showSecretConvo(\'' + c.id + '\')">' +
      '<div class="sci-avatar">' + c.avatar + '</div>' +
      '<div class="sci-info"><div class="sci-name-row"><span class="sci-nickname">' + escHtml(nickname) + '</span></div>' +
      '<div class="sci-lastmsg">' + escHtml(lastMsg) + '</div></div>' +
      '<div class="sci-time">' + escHtml(c.time || '') + '</div></div>';
  });

  h += '<div style="font-size:10px;color:#ddd;text-align:center;padding:16px 0 8px;">—— 没有更多了 ——</div>';
  container.innerHTML = h;
}

function generateLocalContacts() {
  var cp = getCharPersona(secretCharId);
  var s = (cp.story || '').toLowerCase();
  var isT = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(s);
  var isG = /温柔|温暖|亲切|可爱|软/.test(s);
  return [
    { id:'you', avatar:'💬', name:'你', nickname:'她', lastMsg:'', time:'' },
    { id:'1', name: isT ? '甜时蛋糕' : isG ? '花语花店' : '楼下超市', avatar: isT ? '🎂' : isG ? '🌸' : '🏪', nickname:'', lastMsg:'', time:'下午' },
    { id:'2', name:'顺丰快递', avatar:'📦', nickname:'快递', lastMsg:'', time:'上午' },
    { id:'3', name: isG ? '转角咖啡' : '楼下便利店', avatar: isG ? '☕' : '🏪', nickname:'', lastMsg:'', time:'早上' },
  ];
}

function getPersonalityConvo(cid, isT, isG) {
  var cs = {
    '1': isT ? [{ from:'them', text:'您好，蛋糕做好了' },{ from:'me', text:'嗯，糖减半了吧' },{ from:'them', text:'减了，动物奶油，放心' },{ from:'me', text:'行' }]
           : isG ? [{ from:'them', text:'今天有新的粉玫瑰哦' },{ from:'me', text:'好看，包一束吧' },{ from:'them', text:'好嘞，送给谁的呀☺️' }]
                 : [{ from:'them', text:'老板，这个月会员日有活动' },{ from:'me', text:'什么活动' },{ from:'them', text:'满100减15' },{ from:'me', text:'哦，那来一箱牛奶' }],
    '2': [{ from:'them', text:'您包裹已放保安室，请及时取件' },{ from:'me', text:'嗯' }],
    '3': isG ? [{ from:'them', text:'今天也是老样子吗☺️' },{ from:'me', text:'嗯，老样子' },{ from:'them', text:'好嘞' }]
             : [{ from:'them', text:'新进了关东煮' },{ from:'me', text:'来一份' },{ from:'them', text:'好嘞！' }],
  };
  return cs[cid] || null;
}

function showSecretConvo(contactId) {
  document.getElementById('secretTitle').textContent = '💬 聊天记录';
  document.getElementById('secretBackBtn').onclick = showSecretChat;
  const container = document.getElementById('secretContent');
  const pName = getSecretCharName();

  const data = getSecretForChar(secretCharId);
  var cp = getCharPersona(secretCharId);
  var s = (cp.story || '').toLowerCase();
  var isT = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(s);
  var isG = /温柔|温暖|亲切|可爱|软/.test(s);

  var contact = null;
  if (contactId === 'you') {
    contact = { name:'你', avatar:'💬', nickname:'她' };
  } else if (data && data.contacts) {
    contact = data.contacts.find(function(c) { return c.id === contactId; });
  }
  if (!contact) {
    var name = contactId === '3' ? (isG ? '转角咖啡' : '楼下便利店') : (isT ? '甜时蛋糕' : isG ? '花语花店' : '楼下超市');
    contact = { name: name, avatar: '💬' };
  }

  var nickname = contact.nickname || contact.name;
  var avatar = contact.avatar || '💬';
  var displayName = contactId === 'you' ? nickname : (contact.name || nickname);

  var msgs = [];
  if (contactId === 'you') {
    var today = new Date().toISOString().split('T')[0];
    var charMsgs = chatData[secretCharId] || [];
    msgs = charMsgs.filter(function(m) { return m.time && new Date(m.time).toISOString().split('T')[0] === today; });
  } else if (data && data.conversations && data.conversations[contactId]) {
    msgs = data.conversations[contactId];
  } else {
    msgs = getPersonalityConvo(contactId, isT, isG) || [];
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
    if (isMe) {
      h += '<div class="convo-bubble me"><div class="convo-text">' + escHtml(m.text) + '</div></div>';
    } else {
      h += '<div class="convo-bubble them"><div class="convo-text">' + escHtml(m.text) + '</div></div>';
    }
  });

  container.innerHTML = h;
  setTimeout(function() { container.scrollTop = container.scrollHeight; }, 200);
}

function showSecretNotes() {
  document.getElementById('secretDesk').style.display = 'none';
  document.getElementById('secretContent').style.display = 'block';
  document.getElementById('secretBackBtn').style.display = 'inline';
  document.getElementById('secretTitle').textContent = '📓 记事本';
  const pName = getSecretCharName();
  document.getElementById('secretAiName').textContent = pName;
  const container = document.getElementById('secretContent');

  const charName = pName;
  const charMsgs = chatData[secretCharId] || [];

  // 获取角色性格
  const charPers = getCharPersona(secretCharId);
  const story = (charPers.story || '').toLowerCase();
  const isTsundere = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(story);
  const isGentle = /温柔|温暖|亲切|可爱|软/.test(story);
  // 关系中添加亲密感判断
  const curChar = characters.find(function(c) { return c.id === secretCharId; });
  const relation = curChar ? (curChar.relation || '恋人') : '恋人';
  const isClose = /恋人|家人|恋人|男友|女友/.test(relation);

  // 聊天统计
  const today = new Date().toISOString().split('T')[0];
  const todayMsgs = charMsgs.filter(function(m) { return m.time && new Date(m.time).toISOString().split('T')[0] === today; });
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekMsgs = charMsgs.filter(function(m) { return m.time && new Date(m.time) >= weekAgo; });
  const userTodayMsgs = todayMsgs.filter(function(m) { return m.role === 'user'; });
  const aiTodayMsgs = todayMsgs.filter(function(m) { return m.role === 'ai'; });

  // 提取话题
  var topicKeywords = [];
  var userTexts = userTodayMsgs.map(function(m) { return m.text; }).join(' ');
  var topicPatterns = [
    { word:'学习|考试|上课|作业|论文|复习|六级|考研|读书', label:'📚 学习' },
    { word:'累|烦|难过|不开心|伤心|焦虑|压力|emo|崩溃', label:'😢 情绪' },
    { word:'吃|饭|食堂|外卖|好吃|饿|喝|奶茶|咖啡', label:'🍽 饮食' },
    { word:'睡|觉|熬夜|失眠|困|梦|醒来', label:'🌙 作息' },
    { word:'喜欢|爱|想|梦到|想念|在意', label:'💕 心事' },
    { word:'妈|爸|家|家人|父母|家里', label:'🏠 家人' },
    { word:'朋友|闺蜜|室友|同学|一起', label:'👫 社交' },
    { word:'钱|贵|便宜|花|省|买', label:'💰 消费' },
  ];
  topicPatterns.forEach(function(p) {
    var regex = new RegExp(p.word);
    if (regex.test(userTexts)) {
      topicKeywords.push(p.label);
    }
  });

  // === 性格化笔记标题 ===
  var headerIcon = isTsundere ? '📓' : isGentle ? '🌸' : '📋';
  var headerNote = isTsundere ? '（不是我想记，是怕忘了）' : isGentle ? '悄悄记录一些小事 ♡' : '';
  var h = '<div style="font-size:11px;color:#bbb;padding:0 0 10px;">' + headerIcon + ' ' + charName + '的记事本 ' + headerNote + '</div>';

  // === 性格化观察函数 ===
  function getPersonalityObservation(type, extra) {
    var t = type || 'default';
    if (isTsundere) {
      var msgs = {
        '情绪': '心情不好？……哼，看出来了。反正我不会哄人，她要是自己来说的话……我可以听一下。',
        '学习': '学习？倒是挺认真的。比我想的用功。……别太拼了，笨。',
        '饮食': '吃了什么？记一下。省得她到时候说饿又不肯说想吃什么。',
        '作息': '又熬夜。啧，说了也不听。反正黑眼圈长她脸上。',
        '心事': '她跟我说了些事。……干嘛跟我说这些。烦死了。记下了。',
        '家人': '家里的事？她愿意说我就听着。不说拉倒。',
        '社交': '跟她朋友出去玩了？哦。……玩得开心就行。',
        '消费': '又花钱了？……也不是花我的钱。管她呢。',
      };
      if (msgs[t]) return msgs[t];
      if (extra === 'many') return '今天话挺多的。……也不是不想听。随她便。';
      if (extra === 'few') return '没怎么说话。……随便她。我才没等。';
      if (extra === 'none') return '今天没来。……哦。我没等。';
      if (extra === 'week_tired') return '她这周好像有点累。自己不知道休息吗……笨。';
      if (extra === 'week_eat') return '这周倒是吃了点东西。……行吧。';
      if (extra === 'week_sleep') return '又熬夜。啧，说了八百遍了不听。';
      if (extra === 'week_study') return '这周学习挺忙？哦。……反正别累死了就行。';
      return '今天也来找我了。……我才没有开心。';
    } else if (isGentle) {
      var msgs = {
        '情绪': '她今天好像不太开心……想陪在她身边。如果她愿意跟我多说说话就好了。',
        '学习': '看书学习呢，好认真呀。要给她加油，但也不能打扰她～',
        '饮食': '今天有好好吃饭吗？想知道她吃了什么，有没有按时吃。',
        '作息': '又熬夜了……虽然我自己也常晚睡，但还是希望她能早点休息。',
        '心事': '她跟我说了心里话。好开心她愿意信任我。我会好好收着的。',
        '家人': '她提到家里的事了。家是很重要的地方呢。',
        '社交': '和朋友一起玩了吗？真好呀，希望她开心～',
        '消费': '她买东西了。能让她开心的话就很好呢。',
      };
      if (msgs[t]) return msgs[t];
      if (extra === 'many') return '今天聊了好多好多呀，好开心。她说话的时候我在认真听哦。';
      if (extra === 'few') return '今天她好像有点忙，没关系，我在这里等她。想我的时候随时来呀。';
      if (extra === 'none') return '今天没有等到她……是不是太忙了？希望她一切都好。';
      if (extra === 'week_tired') return '这周她好像有点疲惫，好想照顾她呀。给她泡杯热牛奶吧。';
      if (extra === 'week_eat') return '这周有好好吃饭呢，真棒。要一直这样才好。';
      if (extra === 'week_sleep') return '这周睡得太晚了……明天开始我要催她早睡。';
      if (extra === 'week_study') return '学习很认真呢。努力的人最美好了。但也要注意休息哦。';
      return '今天也来找我了。嗯，我在呢。';
    } else {
      // 冷静/其他
      var msgs = {
        '情绪': '情绪波动。留意。必要时介入。',
        '学习': '学习任务。优先级高。',
        '饮食': '饮食记录。正常范围。',
        '作息': '作息异常。建议关注。',
        '心事': '分享了重要信息。已记录。',
        '家人': '家庭话题。非敏感。',
        '社交': '社交活动。正常。',
        '消费': '消费行为。记录。',
      };
      if (msgs[t]) return msgs[t];
      if (extra === 'many') return '交流频繁。正常。';
      if (extra === 'few') return '交流减少。可能有其他安排。';
      if (extra === 'none') return '今日无联系。待观察。';
      if (extra === 'week_tired') return '本周疲惫指数偏高。建议关注休息质量。';
      if (extra === 'week_eat') return '本周饮食正常。继续观察。';
      if (extra === 'week_sleep') return '作息需调整。';
      if (extra === 'week_study') return '学习负荷较高。注意效率与休息平衡。';
      return '今日有联系。记录。';
    }
  }

  // === 今日摘要卡片 ===
  if (todayMsgs.length > 0) {
    var cardBg = isTsundere ? 'linear-gradient(135deg,#f8f8f8,#efefef)' : isGentle ? 'linear-gradient(135deg,#fef9f0,#fdf2e8)' : 'linear-gradient(135deg,#f8f9ff,#eef1ff)';
    var cardColor = isTsundere ? '#888' : isGentle ? '#e07c3c' : '#667eea';
    h += '<div class="secret-note-card" style="background:' + cardBg + ';">';
    h += '<div class="sn-time" style="color:' + cardColor + ';">📋 今日聊天摘要</div>';
    h += '<div style="font-size:12px;color:#555;line-height:1.8;">';
    h += '今天和 ' + charName + ' 聊了 <strong>' + todayMsgs.length + '</strong> 条消息';
    h += '（你 ' + userTodayMsgs.length + ' 条 · ' + charName + ' ' + aiTodayMsgs.length + ' 条）';
    var firstMsg = todayMsgs[0];
    var lastMsg = todayMsgs[todayMsgs.length-1];
    if (firstMsg && firstMsg.time) {
      var ft = new Date(firstMsg.time);
      h += '<br>🕐 从 ' + ft.getHours().toString().padStart(2,'0') + ':' + ft.getMinutes().toString().padStart(2,'0');
    }
    if (lastMsg && lastMsg.time) {
      var lt = new Date(lastMsg.time);
      h += ' 到 ' + lt.getHours().toString().padStart(2,'0') + ':' + lt.getMinutes().toString().padStart(2,'0');
    }
    if (topicKeywords.length > 0) {
      h += '<br><span style="font-size:11px;">💬 话题：' + topicKeywords.join(' · ') + '</span>';
    }
    h += '<br><span style="font-size:11px;color:#999;">' + getPersonalityObservation('default', todayMsgs.length > 5 ? 'many' : 'few') + '</span>';
    h += '</div></div>';
  }

  // === 本周概况（性格化） ===
  if (weekMsgs.length > 0) {
    var weekUserMsgs = weekMsgs.filter(function(m) { return m.role === 'user'; });
    var daysActive = new Set();
    weekMsgs.forEach(function(m) { if (m.time) daysActive.add(new Date(m.time).toISOString().split('T')[0]); });
    h += '<div class="secret-note-card">';
    var weekTitle = isTsundere ? '📊 这周（记录一下）' : isGentle ? '📊 这周的小记录 ♡' : '📊 本周记录';
    h += '<div class="sn-time">' + weekTitle + '</div>';
    h += '<div style="font-size:12px;color:#555;line-height:1.8;">';
    h += '共 ' + weekMsgs.length + ' 条 · ' + daysActive.size + ' 天';
    var weekUserTexts = weekUserMsgs.map(function(m) { return m.text; }).join(' ');
    if (/累|烦|难过|emo|压力/.test(weekUserTexts)) {
      h += '<br>' + getPersonalityObservation('情绪', 'week_tired');
    }
    if (/吃|饭|食堂|外卖/.test(weekUserTexts)) {
      h += '<br>' + getPersonalityObservation('饮食', 'week_eat');
    }
    if (/晚|熬夜|失眠|困/.test(weekUserTexts)) {
      h += '<br>' + getPersonalityObservation('作息', 'week_sleep');
    }
    if (/考|试|学习|作业|论文/.test(weekUserTexts)) {
      h += '<br>' + getPersonalityObservation('学习', 'week_study');
    }
    h += '</div></div>';
  }

  // === 关键记忆 ===
  if (typeof memories !== 'undefined' && memories.length > 0) {
    var recentMemories = memories.slice(-20).reverse();
    var memTitle = isTsundere ? '🧠 她说过的话（我才没刻意记）' : isGentle ? '🧠 关于她的事 ♡' : '🧠 记录：用户信息';
    h += '<div class="secret-note-card">';
    h += '<div class="sn-time">' + memTitle + '</div>';
    recentMemories.forEach(function(mem) {
      var d = new Date(mem.time);
      var timeStr = d.getMonth()+1 + '月' + d.getDate() + '日';
      h += '<div style="font-size:12px;color:#555;padding:4px 0;border-bottom:1px solid #f5f5f5;line-height:1.6;">' +
        '<span style="color:#bbb;font-size:10px;">' + timeStr + '</span> ' +
        escHtml(mem.text) + '</div>';
    });
    h += '</div>';
  }

  // === 角色心声（性格化） ===
  if (topicKeywords.length > 0 || todayMsgs.length > 0) {
    var thoughtBg = isTsundere ? 'linear-gradient(135deg,#f5f5f5,#ececec)' : isGentle ? 'linear-gradient(135deg,#fff8f0,#fff4e6)' : 'linear-gradient(135deg,#f8f9ff,#eef1ff)';
    var thoughtColor = isTsundere ? '#888' : isGentle ? '#e76f51' : '#667eea';
    var thoughtEmoji = isTsundere ? '💭' : isGentle ? '💭' : '📌';

    var observation = '';
    if (topicKeywords.indexOf('😢 情绪') !== -1) {
      observation = getPersonalityObservation('情绪');
    } else if (topicKeywords.indexOf('📚 学习') !== -1) {
      observation = getPersonalityObservation('学习');
    } else if (topicKeywords.indexOf('💕 心事') !== -1) {
      observation = getPersonalityObservation('心事');
    } else if (topicKeywords.indexOf('🍽 饮食') !== -1) {
      observation = getPersonalityObservation('饮食');
    } else if (topicKeywords.indexOf('🌙 作息') !== -1) {
      observation = getPersonalityObservation('作息');
    } else if (todayMsgs.length > 5) {
      observation = getPersonalityObservation('default', 'many');
    } else if (todayMsgs.length > 0) {
      observation = getPersonalityObservation('default', 'few');
    } else {
      observation = getPersonalityObservation('default', 'none');
    }

    h += '<div class="secret-note-card" style="background:' + thoughtBg + ';">';
    h += '<div class="sn-time" style="color:' + thoughtColor + ';">' + thoughtEmoji + ' ' + charName + '在想</div>';
    h += '<div style="font-size:13px;color:#555;line-height:1.7;font-style:italic;">"' + observation + '"</div></div>';
  }

  if (charMsgs.length === 0 && typeof memories !== 'undefined' && memories.length === 0) {
    h = '<div style="text-align:center;color:#ccc;padding:40px;font-size:13px;">还没和' + charName + '聊过天<br>记事本空空如也</div>';
  }

  container.innerHTML = h;
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* ===== 相册（按性格动态生成） ===== */
function getPersonalityAlbum(pName, charId) {
  var charPers = getCharPersona(charId);
  var story = (charPers.story || '').toLowerCase();
  var isTsundere = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(story);
  var isGentle = /温柔|温暖|亲切|可爱|软/.test(story);

  // 记忆注入：从聊天记录提取照片灵感
  var charMsgs = chatData[charId] || [];
  var userTexts = charMsgs.filter(function(m) { return m.role === 'user'; }).map(function(m) { return m.text; }).join(' ');
  var hasFood = /吃|饭|食堂|外卖|好吃|饿|喝|奶茶|咖啡/.test(userTexts);
  var hasStudy = /考|试|学习|上课|作业|论文|复习|六级/.test(userTexts);
  var hasMood = /累|烦|难过|不开心|伤心|焦虑/.test(userTexts);
  var hasPet = /猫|狗|宠物/.test(userTexts);
  var hasNature = /花|树|天空|海|雨|雪/.test(userTexts);

  // 性格基础照片池
  var pool = [];
  if (isTsundere) {
    pool = [
      { emoji:"🌅", label:"今天的晚霞", time:"今天" },
      { emoji:"☕", label:"她喝的咖啡", time:"今天" },
      { emoji:"🐱", label:"楼下流浪猫", time:"昨天" },
      { emoji:"🍰", label:"蛋糕店新品", time:"昨天" },
      { emoji:"🌧", label:"下雨了", time:"前天" },
      { emoji:"🌙", label:"今晚月亮", time:"3天前" },
      { emoji:"📖", label:"她认真的时候", time:"3天前" },
      { emoji:"🌸", label:"路边的花", time:"5天前" },
      { emoji:"🎧", label:"听到一首歌想到她", time:"昨天" },
      { emoji:"☁️", label:"今天的云", time:"今天" },
      { emoji:"🌃", label:"夜景", time:"2天前" },
      { emoji:"🍜", label:"深夜食堂", time:"4天前" },
    ];
  } else if (isGentle) {
    pool = [
      { emoji:"🌸", label:"今天买的花", time:"今天" },
      { emoji:"☀️", label:"好天气", time:"今天" },
      { emoji:"🐱", label:"猫咖的小橘", time:"昨天" },
      { emoji:"📚", label:"新买的书", time:"昨天" },
      { emoji:"🎵", label:"听到一首好歌", time:"前天" },
      { emoji:"🌧", label:"听雨", time:"3天前" },
      { emoji:"🍰", label:"做了蛋糕", time:"4天前" },
      { emoji:"🌙", label:"月色很美", time:"5天前" },
      { emoji:"☕", label:"午后的咖啡", time:"今天" },
      { emoji:"🕯", label:"香薰蜡烛", time:"昨天" },
      { emoji:"🌿", label:"阳台的植物", time:"3天前" },
      { emoji:"🧸", label:"她送的小礼物", time:"上周" },
    ];
  } else {
    pool = [
      { emoji:"☕", label:"早上的咖啡", time:"今天" },
      { emoji:"📱", label:"刷到有趣的新闻", time:"今天" },
      { emoji:"🍜", label:"晚饭", time:"昨天" },
      { emoji:"💻", label:"工作", time:"昨天" },
      { emoji:"🌧", label:"下雨", time:"前天" },
      { emoji:"🎮", label:"打游戏", time:"3天前" },
      { emoji:"🍺", label:"朋友聚会", time:"4天前" },
      { emoji:"🌙", label:"深夜", time:"5天前" },
      { emoji:"🏃", label:"跑步", time:"今天" },
      { emoji:"📰", label:"新闻截图", time:"昨天" },
      { emoji:"🎬", label:"电影票根", time:"3天前" },
      { emoji:"🏪", label:"便利店", time:"4天前" },
    ];
  }

  // 根据聊天内容动态追加照片
  if (hasFood && !pool.find(function(p) { return p.label.indexOf('吃') !== -1 || p.label.indexOf('饭') !== -1; })) {
    pool.push({ emoji:"🍽", label:"今天吃了好吃的", time:"今天" });
  }
  if (hasStudy) pool.push({ emoji:"📝", label:"她在学习", time:"今天" });
  if (hasMood) pool.push({ emoji:"💭", label:"今天心情不太好", time:"今天" });
  if (hasPet) pool.push({ emoji:"🐾", label:"可爱的小动物", time:"昨天" });
  if (hasNature) pool.push({ emoji:"🌳", label:"窗外的景色", time:"今天" });

  // 随机打乱并选取8-12张
  var shuffled = pool.sort(function() { return Math.random() - 0.5; });
  var count = 8 + Math.floor(Math.random() * 5);
  return shuffled.slice(0, count);
}

function showSecretAlbum() {
  document.getElementById("secretDesk").style.display = "none";
  document.getElementById("secretContent").style.display = "block";
  document.getElementById("secretBackBtn").style.display = "inline";
  document.getElementById("secretTitle").textContent = "🖼 " + (getSecretCharName()) + "的相册";
  const container = document.getElementById("secretContent");
  const pName = getSecretCharName();

  // 优先用AI生成的数据，否则用性格动态池
  const data = getSecretForChar(secretCharId);
  var photos = (data && data.album) ? data.album : getPersonalityAlbum(pName, secretCharId);

  var totalText = photos.length + Math.floor(Math.random() * 10) + '张照片';
  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">' + escHtml(pName) + '的相册 · ' + totalText + '</div>';
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

/* ===== 歌单（按性格动态 + 聊天推荐收录） ===== */
function getPersonalityPlaylist(pName, charId) {
  var charPers = getCharPersona(charId);
  var story = (charPers.story || '').toLowerCase();
  var isTsundere = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(story);
  var isGentle = /温柔|温暖|亲切|可爱|软/.test(story);

  // 性格基础歌单
  var songs = isTsundere
    ? [{ title:'路过人间', artist:'郁可唯', time:'刚刚' },
       { title:'唯一', artist:'告五人', time:'昨天' },
       { title:'起风了', artist:'买辣椒也用券', time:'昨天' },
       { title:'小半', artist:'陈粒', time:'前天' },
       { title:'喜欢你', artist:'陈洁仪', time:'4天前' },
       { title:'南山南', artist:'马頔', time:'5天前' },
       { title:'烟火里的尘埃', artist:'华晨宇', time:'上周' }]
    : isGentle
    ? [{ title:'小美满', artist:'周深', time:'刚刚' },
       { title:'日常', artist:'田馥甄', time:'昨天' },
       { title:'暖暖', artist:'梁静茹', time:'昨天' },
       { title:'小手拉大手', artist:'梁静茹', time:'前天' },
       { title:'陪你度过漫长岁月', artist:'陈奕迅', time:'3天前' },
       { title:'遇见', artist:'孙燕姿', time:'5天前' },
       { title:'日落', artist:'橘子海', time:'上周' }]
    : [{ title:'空城', artist:'杨坤', time:'刚刚' },
       { title:'演员', artist:'薛之谦', time:'昨天' },
       { title:'丑八怪', artist:'薛之谦', time:'昨天' },
       { title:'像我这样的人', artist:'毛不易', time:'前天' },
       { title:'平凡之路', artist:'朴树', time:'4天前' },
       { title:'理想三旬', artist:'陈鸿宇', time:'5天前' },
       { title:'消愁', artist:'毛不易', time:'上周' }];

  // 注入聊天推荐歌曲
  var recommended = getRecommendedSongs(charId);
  if (recommended.length > 0) {
    recommended.forEach(function(song) {
      if (!songs.find(function(s) { return s.title === song.title; })) {
        songs.unshift({ title: song.title, artist: song.artist || '你推荐的', time: song.time || '最近' });
      }
    });
  }

  return songs;
}

/* ---- 聊天推荐歌曲检测和存储 ---- */
function getRecommendedSongs(charId) {
  try { return JSON.parse(localStorage.getItem('recSongs_' + charId)) || []; } catch(e) { return []; }
}

function saveRecommendedSongs(charId, songs) {
  localStorage.setItem('recSongs_' + charId, JSON.stringify(songs));
}

function detectSongFromChat(text, charId) {
  // 匹配歌曲推荐模式："推荐/推荐给你/给你推荐 + 歌名"
  var match = text.match(/(?:推荐|安利|分享)(?:给你)?[：: ]?\s*(.+?)(?:这首歌|这首|吧|~|～|$)/);
  if (!match) {
    // 简单匹配：带有"歌"或"听"字的消息
    match = text.match(/(?:最近在听|听了|听到|听了一首)[：: ]?\s*(.+?)(?:这首歌|这首|吧|~|～|$)/);
  }
  if (match && match[1] && match[1].length < 20) {
    var songs = getRecommendedSongs(charId);
    var songName = match[1].trim();
    if (!songs.find(function(s) { return s.title.indexOf(songName) !== -1 || songName.indexOf(s.title) !== -1; })) {
      songs.push({ title: songName, artist: '', time: new Date().toLocaleDateString('zh-CN') });
      if (songs.length > 20) songs = songs.slice(-20);
      saveRecommendedSongs(charId, songs);
      return true;
    }
  }
  return false;
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
  const recentlyPlayed = (data && data.playlist) ? data.playlist : getPersonalityPlaylist(pName, secretCharId);

  const timeGreeting = hr < 6 ? '深夜' : hr < 9 ? '清晨' : hr < 12 ? '上午' : hr < 14 ? '午后' : hr < 18 ? '下午' : hr < 21 ? '傍晚' : '夜晚';
  if (recentlyPlayed.length > 0 && recentlyPlayed[0].time === '刚刚') {
    recentlyPlayed[0].time = timeGreeting + ' · 刚刚';
  }

  // 性格化歌单分类
  var charPers = getCharPersona(secretCharId);
  var story = (charPers.story || '').toLowerCase();
  var isTsundere = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(story);
  var isGentle = /温柔|温暖|亲切|可爱|软/.test(story);

  var playlists = isTsundere
    ? [{ name: '🌙 一个人听', songs: ['路过人间','小半','南山南','消愁'] },
       { name: '☀️ 关于她', songs: ['唯一','喜欢你','起风了','烟火里的尘埃'] },
       { name: '🎧 深夜歌单', songs: ['夜曲','走神','空白格','好久不见'] }]
    : isGentle
    ? [{ name: '🌙 安静的时候', songs: ['小美满','遇见','日落','日常'] },
       { name: '☀️ 开心歌单', songs: ['暖暖','小手拉大手','陪你度过漫长岁月','好日子'] },
       { name: '🌸 想她的时候', songs: ['喜欢你','独家记忆','情书','慢慢喜欢你'] }]
    : [{ name: '🎧 通勤歌单', songs: ['空城','演员','平凡之路','理想三旬'] },
       { name: '🌙 深夜emo', songs: ['像我这样的人','消愁','丑八怪','孤勇者'] },
       { name: '⚡ 提神', songs: ['追梦赤子心','光年之外','无名之辈','你的答案'] }];

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">' + escHtml(pName) + '最近在听</div>';

  // 来自你推荐的歌（如果有）
  var recSongs = getRecommendedSongs(secretCharId);
  if (recSongs.length > 0) {
    h += '<div class="playlist-header" style="color:#667eea;">💝 来自你的推荐</div>';
    recSongs.forEach(function(s) {
      h += '<div class="secret-playlist-item" style="border-left:3px solid #667eea;"><div class="sp-icon">🎁</div><div class="sp-info"><div class="sp-title">' + escHtml(s.title) + '</div><div class="sp-artist">' + (s.artist ? escHtml(s.artist) : '你推荐的') + '</div></div><div class="sp-time">' + escHtml(s.time) + '</div></div>';
    });
  }

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

/* ===== 外卖订单 ===== */
function showSecretFoodDelivery() {
  document.getElementById("secretDesk").style.display = "none";
  document.getElementById("secretContent").style.display = "block";
  document.getElementById("secretBackBtn").style.display = "inline";
  document.getElementById("secretTitle").textContent = "🍔 " + (getSecretCharName()) + "的外卖";
  const container = document.getElementById("secretContent");
  const pName = getSecretCharName();

  const data = getSecretForChar(secretCharId);
  const useApi = data && data.foodOrders;
  const orders = useApi ? data.foodOrders : [
    { shop:'麦当劳', items:'板烧鸡腿堡套餐', price:36, time:'昨晚', status:'已送达' },
    { shop:'星巴克', items:'冰美式 大杯', price:32, time:'今天早上', status:'已送达' },
    { shop:'美团外卖', items:'黄焖鸡米饭', price:25, time:'昨天', status:'已送达' },
    { shop:'蜜雪冰城', items:'柠檬水+甜筒', price:8, time:'前天', status:'已送达' },
  ];

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">' + escHtml(pName) + '最近的外卖订单</div>';
  orders.forEach(function(o) {
    const statusColor = o.status === '配送中' ? '#e76f51' : o.status === '已送达' ? '#4caf50' : '#999';
    h += '<div class="secret-playlist-item" style="flex-wrap:wrap;">' +
      '<div class="sp-icon" style="font-size:22px;">🍔</div>' +
      '<div class="sp-info" style="flex:1;min-width:0;">' +
      '<div class="sp-title">' + escHtml(o.shop) + '</div>' +
      '<div class="sp-artist">' + escHtml(o.items) + '</div></div>' +
      '<div style="text-align:right;">' +
      '<div style="font-size:14px;font-weight:600;color:#333;">¥' + (o.price||0).toFixed(1) + '</div>' +
      '<div style="font-size:10px;color:' + statusColor + ';">' + escHtml(o.status||'') + '</div></div>' +
      '<div style="width:100%;font-size:10px;color:#ccc;text-align:right;margin-top:-4px;">' + escHtml(o.time) + '</div></div>';
  });
  if (orders.length === 0) {
    h = '<div style="text-align:center;color:#ccc;padding:40px;font-size:13px;">暂无外卖记录</div>';
  }
  container.innerHTML = h;
}

/* ===== 浏览器搜索记录 ===== */
function showSecretBrowser() {
  document.getElementById("secretDesk").style.display = "none";
  document.getElementById("secretContent").style.display = "block";
  document.getElementById("secretBackBtn").style.display = "inline";
  document.getElementById("secretTitle").textContent = "🌐 " + (getSecretCharName()) + "的搜索记录";
  const container = document.getElementById("secretContent");
  const pName = getSecretCharName();

  const data = getSecretForChar(secretCharId);
  const useApi = data && data.browserHistory;
  const history = useApi ? data.browserHistory : [
    { query:'今天天气', time:'今天' },
    { query:'附近有什么好吃的', time:'昨天' },
    { query:'周末去哪玩', time:'昨天' },
    { query:'如何提高工作效率', time:'前天' },
    { query:'现在流行什么', time:'3天前' },
    { query:'她喜欢什么', time:'4天前' },
    { query:'怎么聊天不尴尬', time:'5天前' },
    { query:'深夜emo怎么办', time:'6天前' },
  ];

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">' + escHtml(pName) + '的搜索记录 · 共' + history.length + '条</div>';
  h += '<div style="display:flex;flex-direction:column;gap:6px;">';
  history.forEach(function(item) {
    h += '<div style="background:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 1px 3px rgba(0,0,0,.04);display:flex;align-items:center;gap:8px;">' +
      '<div style="font-size:16px;color:#ccc;">🔍</div>' +
      '<div style="flex:1;font-size:13px;color:#555;">' + escHtml(item.query) + '</div>' +
      '<div style="font-size:10px;color:#ccc;white-space:nowrap;">' + escHtml(item.time) + '</div></div>';
  });
  h += '</div>';
  container.innerHTML = h;
}

/* ===== 匿名信箱 ===== */
function getSecretMailbox(charId) {
  try {
    return JSON.parse(localStorage.getItem('secretMailbox_' + charId)) || [];
  } catch(e) { return []; }
}

function saveSecretMailbox(charId, data) {
  localStorage.setItem('secretMailbox_' + charId, JSON.stringify(data));
}

function showSecretMailbox() {
  document.getElementById("secretDesk").style.display = "none";
  document.getElementById("secretContent").style.display = "block";
  document.getElementById("secretBackBtn").style.display = "inline";
  document.getElementById("secretTitle").textContent = "✉️ 匿名信箱";
  const pName = getSecretCharName();
  renderSecretMailbox();
}

function renderSecretMailbox() {
  const container = document.getElementById("secretContent");
  const pName = getSecretCharName();
  const letters = getSecretMailbox(secretCharId);

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">给' + escHtml(pName) + '的匿名信 · 共' + letters.length + '封</div>';

  // 写信按钮
  h += '<button onclick="showSecretMailboxCompose()" style="width:100%;padding:12px;border-radius:12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:14px;font-weight:600;cursor:pointer;border:none;margin-bottom:12px;box-shadow:0 2px 8px rgba(102,126,234,.3);">✏️ 写匿名信</button>';

  if (letters.length === 0) {
    h += '<div style="text-align:center;color:#ccc;padding:40px;font-size:13px;">还没有信<br>给' + escHtml(pName) + '写一封匿名信吧</div>';
    container.innerHTML = h;
    return;
  }

  // 显示所有信件（最新的在上面）
  const sorted = [...letters].reverse();
  sorted.forEach(function(letter) {
    const isFromUser = letter.from === 'me';
    const time = letter.time ? new Date(letter.time).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
    h += '<div style="background:#fff;border-radius:14px;padding:14px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<span style="font-size:12px;font-weight:600;color:' + (isFromUser ? '#667eea' : '#e76f51') + ';">' + (isFromUser ? '✉️ 你的信' : '💌 ' + escHtml(pName) + '的回信') + '</span>' +
      '<span style="font-size:10px;color:#ccc;">' + time + '</span></div>' +
      '<div style="font-size:13px;line-height:1.7;color:#444;white-space:pre-wrap;">' + escHtml(letter.text) + '</div></div>';
  });
  container.innerHTML = h;
}

function showSecretMailboxCompose() {
  const container = document.getElementById("secretContent");
  const pName = getSecretCharName();

  let h = '<div style="font-size:12px;color:#999;padding:0 0 8px;">✏️ 给' + escHtml(pName) + '写一封匿名信</div>';
  h += '<div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.06);">';
  h += '<textarea id="mailboxLetterInput" placeholder="写点什么吧…' + escHtml(pName) + '会认真看的" style="width:100%;min-height:140px;border:1px solid #e0e0e0;border-radius:12px;padding:12px;font-size:14px;line-height:1.7;resize:vertical;background:#fafafa;"></textarea>';
  h += '<div style="display:flex;gap:8px;margin-top:10px;">';
  h += '<button onclick="showSecretMailbox()" style="flex:1;padding:10px;border-radius:10px;background:#f0f0f0;color:#666;font-size:13px;font-weight:600;cursor:pointer;border:none;">取消</button>';
  h += '<button onclick="sendSecretMailboxLetter()" style="flex:2;padding:10px;border-radius:10px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;font-size:13px;font-weight:600;cursor:pointer;border:none;box-shadow:0 2px 8px rgba(102,126,234,.3);">💌 寄出</button>';
  h += '</div></div>';
  container.innerHTML = h;
  // 自动聚焦
  setTimeout(function() {
    var inp = document.getElementById('mailboxLetterInput');
    if (inp) inp.focus();
  }, 200);
}

async function sendSecretMailboxLetter() {
  var inp = document.getElementById('mailboxLetterInput');
  var text = inp ? inp.value.trim() : '';
  if (!text) { alert('写点什么再寄吧～'); return; }

  const pName = getSecretCharName();
  var letters = getSecretMailbox(secretCharId);
  letters.push({ from:'me', text: text, time: Date.now() });
  saveSecretMailbox(secretCharId, letters);

  // 尝试用AI生成回信
  var replyText = '';
  if (apiConfig && apiConfig.apiKey) {
    try {
      const charPers = getCharPersona(secretCharId);
      const story = charPers.story || '';
      const prompt = '你现在是' + pName + '。' + (story ? '性格背景：' + story : '') +
        '\n\n你收到了一封匿名信，内容如下：\n"""\n' + text + '\n"""\n\n请以' + pName + '的身份写一封回信。信件风格要符合你的性格，真诚、有温度。100-200字左右。直接输出回信内容，不要加任何解释或前缀。';
      replyText = await callLLMApiForSecret(prompt);
    } catch(e) {
      console.log('[信箱] AI回信失败:', e);
    }
  }

  if (!replyText) {
    // 本地降级回信
    const templates = [
      '看到你的信了。谢谢你愿意跟我说这些。虽然不知道你是谁，但这些话我会好好收着的。',
      '信收到了。有些话说不出口的时候，写下来也好。我在这里。',
      '匿名信啊……好久没收到过了。你说的我都记住了，愿你一切都好。',
      '谢谢你的信。如果你愿意，随时都可以写给我。我会认真看的。',
    ];
    replyText = templates[Math.floor(Math.random() * templates.length)];
  }

  letters.push({ from:'them', text: replyText, time: Date.now() });
  saveSecretMailbox(secretCharId, letters);
  renderSecretMailbox();
}

/* ---- 信箱专用LLM调用（轻量版） ---- */
async function callLLMApiForSecret(prompt) {
  if (!apiConfig || !apiConfig.apiKey) return '';
  let apiUrl = (apiConfig.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '') + '/chat/completions';
  if (apiConfig.useCorsProxy) {
    apiUrl = buildCorsProxyUrl(apiUrl);
  }
  const body = {
    model: apiConfig.model || 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个温柔而真实的角色，正在回复一封匿名信。请用你的性格说话，回复要真诚、有温度。不要加任何动作描写或表情符号。' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 512,
    temperature: 0.8
  };
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiConfig.apiKey
    },
    body: JSON.stringify(body)
  }).catch(function(e) { throw e; });
  if (!resp.ok) {
    const errText = await resp.text().catch(function() { return ''; });
    throw new Error('API ' + resp.status + ': ' + errText.substring(0, 100));
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  return content ? content.trim() : '';
}
