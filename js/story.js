/* ==================== 晚安故事（骆云影每晚编一个） ==================== */
let _storySending = false;

function showStory() {
  navigateTo('page-story');
  renderStoryList();
}

/* 收集她最近的日常，织进故事里 */
function buildStoryMaterial() {
  const lines = [];
  const today = new Date().toISOString().split('T')[0];

  // 1) 她今天跟他说过的话 —— 最主要的故事素材（原话，越具体越好）
  try {
    var cid = (typeof currentCharId !== 'undefined' && currentCharId) ? currentCharId : 'luo';
    var charMsgs = (typeof chatData !== 'undefined' && chatData[cid]) || [];
    var saidToday = charMsgs.filter(function(m) {
      return m.role === 'user' && m.time && new Date(m.time).toISOString().split('T')[0] === today;
    }).map(function(m) { return m.text; });
    if (saidToday.length === 0) {
      // 今天还没聊 → 拿最近几句补，别让素材空着
      saidToday = charMsgs.filter(function(m) { return m.role === 'user'; }).slice(-4).map(function(m) { return m.text; });
    }
    if (saidToday.length > 0) {
      lines.push('她今天对他说过的话（原话，别改意思，可以挑一件小事写进故事）：\n' +
        saidToday.slice(-8).join('\n').slice(0, 500));
    }
  } catch (e) { /* 素材拿不到就算了，不影响出故事 */ }

  // 2) 她自己写的每日记录
  const records = lsGet('day_records', {});
  const keys = Object.keys(records).sort().reverse().slice(0, 4);
  if (keys.length > 0) {
    lines.push('她前几天自己写下的记录：\n' + keys.map(d => '【' + d + '】' + String(records[d].text).slice(0, 120)).join('\n'));
  }

  // 3) 心情 / 睡眠 / 昨天睡的怎么样
  if (typeof moodData !== 'undefined' && moodData && moodData[today]) {
    lines.push('她今天的心情：' + moodData[today].emoji + moodData[today].label);
  }
  if (typeof sleepLastNightText === 'function') {
    const sl = sleepLastNightText();
    if (sl) lines.push(sl);
  }

  // 4) 朋友圈（她和他最近发过的）
  if (typeof moments !== 'undefined' && moments && moments.length > 0) {
    var ms = moments.slice(0, 3).map(function(m) { return (m.user ? m.user + '：' : '') + String(m.content).substring(0, 40); });
    lines.push('最近的朋友圈：' + ms.join('；'));
  }

  return lines.join('\n\n');
}


async function generateNightStory() {
  if (_storySending) return;
  const btn = document.getElementById('storyBtn');
  const resultEl = document.getElementById('storyResult');
  _storySending = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 骆云影在酝酿…'; }
  if (resultEl) resultEl.innerHTML = '<div style="text-align:center;padding:30px;color:#888;font-size:13px;">🌙 他在想今晚要讲什么…</div>';
  const material = buildStoryMaterial();
  try {
    let story;
    let isFallback = false;
    if (apiConfig && apiConfig.apiKey) {
      story = await callNightStoryAI(material);
    } else {
      await new Promise(r => setTimeout(r, 600));
      story = localNightStory(material);
      isFallback = true;
    }
    // AI 没接上 / 内容无效 → 自动换旧故事本的，保证每次都有故事
    if (!story || !story.story || !story.title) {
      await new Promise(r => setTimeout(r, 400));
      story = localNightStory(material);
      isFallback = true;
    }
    saveNightStory(story);
    renderStoryCard(story, isFallback);
    renderStoryList();
  } catch (e) {
    // 无论如何都要给一篇故事，绝不让晞晞空手
    console.warn('晚安故事AI异常，用本地故事兜底:', e);
    try {
      const fb = localNightStory(material);
      saveNightStory(fb);
      renderStoryCard(fb, true);
      renderStoryList();
    } catch (e2) {
      if (resultEl) resultEl.innerHTML = '<div style="text-align:center;padding:30px;color:#e55;font-size:13px;">❌ ' + (e.message || '生成失败') + '</div>';
    }
  } finally {
    _storySending = false;
    if (btn) { btn.disabled = false; btn.textContent = '🌙 今晚的故事'; }
  }
}

async function callNightStoryAI(material) {
  const pName = (personaData && personaData.name) || '骆云影';
  const charStory = (personaData && personaData.story) || '黑色中长发，灰蓝色眼睛，178cm。ISTP，傲娇暴躁毒舌刻薄，嘴硬心软。';
  const un = (userPersona && userPersona.name) || '她';
  const sp = `你是${pName}。${charStory}

今晚${un}睡前，你要给她讲一个故事。这是你每晚的活儿，讲完她好睡觉。

【故事必须长这样】
- 要有一个人，有名字（别用「她」当主角，起个名字）
- 要有一件事，具体的、能看见的：一把伞、一碗面、一双旧鞋、一张车票、一只猫、一盏灯——挑一样，让它从开头留到最后
- 要有起因、经过、结尾。要发生点什么，哪怕是件很小的事
- 中间可以有一个小小的转弯，让人心里动一下
- 500字左右，3-4段

【语气】
- 你不是在念童话，你是在给她讲故事。可以带一点你自己的腔调——你平时怎么说话，就怎么讲
- 平实，别堆词。「仿佛」「像是」「氤氲」「缱绻」这种词一个都别用
- 少用形容词，多用具体的东西。写「他把伞往她那边斜了斜」，别写「他体贴地照顾着她」
- 温暖但不肉麻，别煽情，别讲道理
- 结尾用轻的收，收得住，别总结、别升华

【最重要的一条】
下面有她今天真实说过的话。挑一件小事（她提过的吃的、天气、累、谁惹她生气了都行），把它织进故事里——故事里要能看见这件事的影子。这是她今晚会觉得「他在讲我」的地方。

【格式】
第一行只写标题，用《》括起来，比如：\`《伞往哪边斜》\`
空一行，然后直接开始讲故事。
不要输出 JSON，不要输出任何解释、评论、动作描写，也不要提「我给你编了个故事」这种话。

她最近的日子：
${material || '（今天没什么特别的）'}`;
  const apiUrl = (apiConfig.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '') + '/chat/completions';
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.apiKey },
    body: JSON.stringify({
      model: apiConfig.model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: sp },
        { role: 'user', content: '讲吧，我听着。' }
      ],
      temperature: 0.9, max_tokens: 2200
    })
  };
  // 故事长、耗时长，给 45 秒超时；失败自动重试一次（复用聊天那套重试）
  const content = (typeof llmFetchWithRetry === 'function')
    ? await llmFetchWithRetry(apiUrl, init, { label: '晚安故事', timeoutMs: 45000, attempts: 2 })
    : await (async function() {
        const r = await fetch(apiUrl, init);
        if (!r.ok) throw new Error('API错误(' + r.status + ')');
        const j = await r.json();
        return ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
      })();
  return parseNightStory(content);
}

/* 把 JSON 字符串字面量里的裸换行/制表符转义掉 —— AI 写长文时经常留下裸换行，
   导致 JSON.parse 直接抛错（这就是以前故事会掉进旧故事本的原因之一） */
function _repairJsonCtl(s) {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      const c = ch.charCodeAt(0);
      if (c === 10) { out += '\\n'; continue; }
      if (c === 13) { out += '\\r'; continue; }
      if (c === 9) { out += '\\t'; continue; }
      if (c < 32) { out += ' '; continue; }
    }
    out += ch;
  }
  return out;
}

/* 把 AI 返回的纯文本拆成 {title, story}（兼容它偶尔还是吐 JSON 的情况） */
function parseNightStory(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;
  let text = raw.replace(/```(json|JSON)?/g, '').trim();

  // 万一它还是返回了 JSON
  const jm = text.match(/\{[\s\S]*\}/);
  if (jm && /"(story|title)"\s*:/.test(jm[0])) {
    let obj = null;
    try { obj = JSON.parse(jm[0]); } catch (e) { obj = null; }
    if (!obj) { try { obj = JSON.parse(_repairJsonCtl(jm[0])); } catch (e) { obj = null; } }
    if (obj && obj.story) {
      const s = String(obj.story).trim();
      if (s.length >= 60) return { title: String(obj.title || '今晚的故事').slice(0, 12), story: s };
    }
    // 它想返回 JSON 但坏了 → 别把裸 JSON 当故事显示，交给本地兜底
    return null;
  }

  // 主路径：第一行《标题》，其余是正文
  const lines = text.split('\n');
  let title = '';
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 4); i++) {
    const l = lines[i].trim().replace(/^[#*\s]+/, '');
    const m = l.match(/^[《「【\[]?\s*([^》」】\]]{2,14})\s*[》」】\]]$/);
    if (m) { title = m[1].trim(); start = i + 1; break; }
  }
  let body = lines.slice(start).join('\n').trim();
  if (!title) {
    // 没给标题 → 拿第一个像样的短行当标题
    const first = lines.map(l => l.trim()).find(l => l.length > 2 && l.length <= 16) || '';
    title = first.replace(/^[《「【\[#"'\s]+|[》」】\]"']+$/g, '').slice(0, 10);
  }
  // 剥掉正文里可能残留的标题行重复
  if (title && body.indexOf(title) === 0) body = body.slice(title.length).replace(/^[》」】\]：:\s]+/, '').trim();

  if (body.length < 60) return null; // 太短，不算故事 → 交给本地兜底
  return { title: title || '今晚的故事', story: body };
}

/* 没有 API Key 时的本地小故事兜底（有情节有人物） */
function localNightStory(material) {
  const titles = ['会认路的猫', '雨天的伞', '换牙的夏天', '最后一班车', '十二点的灯', '邮差'];
  const bodies = {
    '会认路的猫': '林晚搬进新宿舍的第一晚失眠，听见窗台有动静，一只橘猫蹲在外面。她没理，第二天它又来了，之后每晚都来。她给它取名「路灯」。\n有天傍晚她迷了路，路灯忽然跳上前带路，七拐八拐，把她领到一家饺子馆前。老板探出头看了她很久：小姑娘，你以前是不是住在城东？你家以前养过一只橘猫吧？\n她这才想起来，小时候家里确实养过一只猫，搬家那年跑丢了。那天她在饺子馆吃了碗饺子，路灯蹲在门口等她。回去后她给猫留了门，它进来，在她脚边睡了一夜。',
    '雨天的伞': '顾念总在下雨的时候忘带伞。图书馆门口，管理员沈序会把一把蓝伞递给她：拿去，明天还。日子久了，她以为他柜子里备着一排伞。\n有天她提前去还伞，看见沈序拉开柜子——里面只有这一把蓝伞的位置。他把自己唯一的伞给了她，自己淋着雨走回家。\n她没拆穿。第二天，她多带了一把伞，放回他柜子里。从此那把蓝伞挂在两人之间那面墙上，谁都没再提这件事。',
    '换牙的夏天': '小满七岁那年换牙，爷爷说：上牙扔房顶，下牙扔床底，新牙才长得齐。她照做了，把上牙扔上房顶。第二天，房顶冒出一棵小树苗——是爷爷趁她睡着时偷偷种下的樱桃树。\n后来树一年年长高，结出红樱桃。爷爷却已经不在了。她仰着头摘樱桃，想起爷爷说过的话：牙掉了会长新的，人走了……也会有人替你记着甜。\n她把摘下的樱桃分给路过的小孩。小孩说谢谢，她摆摆手：给你，甜的。',
    '最后一班车': '阿澈开末班公交，每晚都看见一个女孩上车，却不坐，站在门边，到某一站就下。风雨无阻，从不坐。\n他观察了很久，终于有一天问她：你为什么不坐？女孩说：我在等一个人，他以前总在这一站下车。我怕我坐着，会错过他。\n阿澈没接话。第二天，末班车在那个站台多停了半分钟。女孩愣了一下，说了声谢谢。他透过反光镜看她，说：明天还停。',
    '十二点的灯': '苏念刚上大学，失眠，每晚翻来覆去到十二点。她发现对面楼有一扇窗，每到十二点准时亮起，像是在陪她。\n有天她半夜起来喝水，听见室友阿橙的手机在响——定时开关的提示音。她这才发现，那扇亮着的灯，是阿橙偷偷给她装的。\n苏念没拆穿。第二天晚上，她钻进阿橙的被窝：今晚我也怕黑。阿橙耳朵红了：怕黑就直说。灯一直亮着。',
    '邮差': '老周在小镇送了二十年信。镇上有个老人，每周都往外地寄一封信给女儿，可老周知道，那封信从来是空的。他从不多问，准时收，准时送。\n冬天，老人照常把信封递给他，说：我女儿今年该回来了。老周接过来，看见信封上难得写了字，一行小字：等我。\n那年除夕，老人家的灯真的亮了。老周后来才听说，空信封是他们父女俩约好的暗号——没字，就是平安。雪停的时候，老周送完了这一年的最后一封信。'
  };
  // 优先挑最近没讲过的那几篇，别老翻同一篇
  const recent = lsGet('night_stories', []).slice(0, 5).map(s => s.title);
  const unused = titles.filter(t => recent.indexOf(t) === -1);
  const pool = unused.length > 0 ? unused : titles;
  const title = pool[Math.floor(Math.random() * pool.length)];
  const body = bodies[title];
  return { title, story: body };
}

/* ===== 存储 & 渲染 ===== */
function saveNightStory(story) {
  const list = lsGet('night_stories', []);
  const item = {
    id: Date.now(), title: story.title, story: story.story,
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString()
  };
  list.unshift(item);
  if (list.length > 20) list.length = 20;
  lsSet('night_stories', list);
  return item;
}

function renderStoryCard(item, isFallback) {
  const el = document.getElementById('storyResult');
  if (!el) return;
  el.innerHTML = '<div style="background:#fff;border-radius:16px;padding:18px;box-shadow:0 2px 12px rgba(0,0,0,.06);">' +
    '<div style="font-size:12px;color:#999;margin-bottom:6px;">🌙 骆云影 · ' + item.date + (isFallback ? ' <span style="color:#ccc;">（这篇是从故事本里翻出来的）</span>' : '') + '</div>' +
    '<div style="font-size:16px;font-weight:700;color:#334;margin-bottom:10px;">' + escHtml(item.title) + '</div>' +
    '<div style="font-size:14px;line-height:1.8;color:#555;white-space:pre-wrap;">' + escHtml(item.story) + '</div>' +
    '</div>';
}

function renderStoryList() {
  const list = lsGet('night_stories', []);
  const el = document.getElementById('storyList');
  if (!el) return;
  if (list.length <= 1) { el.innerHTML = ''; return; }
  let html = '<div style="font-size:12px;color:#bbb;margin-bottom:6px;">📂 以前的夜</div>';
  list.slice(1, 8).forEach(it => {
    html += '<div style="cursor:pointer;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px;color:#667eea;" onclick="viewNightStory(' + it.id + ')">' +
      '🌙 ' + escHtml(it.title) + '<span style="float:right;color:#ccc;font-size:11px;">' + it.date + '</span></div>';
  });
  el.innerHTML = html;
}

function viewNightStory(id) {
  const it = lsGet('night_stories', []).find(s => s.id === id);
  if (it) renderStoryCard(it);
}
