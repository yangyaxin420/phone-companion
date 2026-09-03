/* ==================== 晚安故事（骆云影每晚编一个） ==================== */
let _storySending = false;

function showStory() {
  navigateTo('page-story');
  renderStoryList();
}

/* 收集她最近的日常，织进故事里 */
function buildStoryMaterial() {
  const lines = [];
  const records = lsGet('day_records', {});
  const keys = Object.keys(records).sort().reverse().slice(0, 5);
  keys.forEach(d => { lines.push('【' + d + '】' + records[d].text); });
  const today = new Date().toISOString().split('T')[0];
  if (typeof moodData !== 'undefined' && moodData && moodData[today]) {
    lines.push('今天心情：' + moodData[today].emoji + moodData[today].label);
  }
  if (typeof moments !== 'undefined' && moments && moments.length > 0) {
    lines.push('最近朋友圈：' + moments.slice(0, 2).map(m => m.content.substring(0, 30)).join('；'));
  }
  if (typeof sleepLastNightText === 'function') {
    const sl = sleepLastNightText();
    if (sl) lines.push(sl);
  }
  return lines.join('\n');
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
  const un = (userPersona && userPersona.name) || '你';
  const sp = `你是${pName}。${charStory}
今晚${un}睡前，你要给她编一个完整的睡前小故事。
要求：
- 必须有情节：一个具体人物 + 一件具体的小事（有起因、经过、结尾）
- 可以有一点小小的转折或情感点，但不要不知所云、不要只有氛围和意象
- 200-400字，2-3个小段落
- 温暖、带一点童话感，但别肉麻
- 可以悄悄把下面她最近的日子织进故事里
- 结尾用轻的收，收得住
- 只讲故事本身，不要评论故事，不要动作描写，不要提「我给你编了个故事」这类话

她最近的日子：
${material || '（今天没什么特别的）'}

讲完故事后，把标题和正文整理成一个JSON对象返回：
{"title":"3-8个字的标题","story":"完整故事正文"}
（可以只输出这个JSON，我会自己解析；故事正文用完整的人话，不要漏字）`;
  const apiUrl = (apiConfig.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '') + '/chat/completions';
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.apiKey },
    body: JSON.stringify({
      model: apiConfig.model || 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: sp },
        { role: 'user', content: '把今晚的故事用JSON返回。' }
      ],
      temperature: 0.85, max_tokens: 1400
    })
  });
  if (!resp.ok) throw new Error('API错误(' + resp.status + ')');
  const json = await resp.json();
  const content = json.choices?.[0]?.message?.content || '';
  // 1) 先试严格 JSON（剥掉可能裹着的代码块）
  const cleaned = content.replace(/```(json|JSON)?/g, '').trim();
  const jm = cleaned.match(/\{[\s\S]*\}/);
  if (jm) {
    try {
      const obj = JSON.parse(jm[0]);
      if (obj && obj.title && obj.story) return { title: String(obj.title), story: String(obj.story) };
    } catch (e) { /* JSON 解析失败 → 走纯文本兜底 */ }
  }
  // 2) 兜底：AI 直接把故事讲出来了 → 整段当故事，标题取第一句
  const text = content.trim();
  if (text.length > 20) {
    const firstLine = text.split('\n').map(l => l.trim()).find(l => l.length > 2) || '';
    let title = firstLine.replace(/^[「『“‘"']+|[」』”"'']+$/g, '').replace(/^[#*\s]+/, '').slice(0, 8);
    if (title.length > 8) title = title.slice(0, 8);
    return { title: title || '一个故事', story: text };
  }
  return null; // 没讲出来 → 交给上层用本地故事兜底
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
  const i = Math.floor(Math.random() * titles.length);
  const title = titles[i];
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
    '<div style="font-size:12px;color:#999;margin-bottom:6px;">🌙 骆云影 · ' + item.date + (isFallback ? ' <span style="color:#ccc;">（AI 没接上，先讲旧故事本的）</span>' : '') + '</div>' +
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
