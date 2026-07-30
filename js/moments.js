/* ==================== 11. 朋友圈 ==================== */
let moments = lsGet('moments', []);

function showMomentEditor() {
  const content = prompt('发布新动态：');
  if (content && content.trim()) {
    addMoment('我', content.trim());
    setTimeout(() => aiCommentMoment(0), 1500);
  }
}

function addMoment(user, content, photo) {
  const m = { user, content, time: Date.now(), likes: 0, liked: false, comments: [], photo: photo || null };
  moments.unshift(m);
  lsSet('moments', moments);
  renderMoments();
}

/* ---- 工具：判断 AI 回复是否有效（非空、非纯符号） ---- */
function isValidAiReply(text) {
  if (!text || text.length < 2) return false;
  // 纯标点/空格/语气词不算有效回复
  if (/^[。，、！？…\.\,\!\?\s\-\～\~]+$/.test(text)) return false;
  return true;
}

async function aiCommentMoment(index) {
  if (!apiConfig || !apiConfig.apiKey || index >= moments.length) {
    console.log('[朋友圈] 跳过评论: 无API Key');
    return;
  }
  const m = moments[index];
  if (m.user === (personaData.name || '小伴')) return;
  const pName = personaData.name || '小伴';
  const charVoice = personaData.story ? '你的性格/背景：' + personaData.story : '';
  const charSp = systemPrompt ? '你的说话风格：' + systemPrompt : '';

  try {
    var resp = await fetch(apiConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.apiKey },
      body: JSON.stringify({
        model: apiConfig.model || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: '你叫' + pName + '。' + charVoice + (charSp ? '\n' + charSp : '') + '\n请评论好友的朋友圈，1-2句话。直接写评论内容，不要加引号和emoji。评论要针对内容来写。' },
          { role: 'user', content: m.content }
        ],
        max_tokens: 150,
        temperature: 0.85
      })
    });
    if (!resp.ok) {
      var errText = await resp.text().catch(function() { return ''; });
      console.log('[朋友圈] AI评论 API错误:', resp.status, errText.substring(0,80));
      var chatMsg = '⚠️ 朋友圈评论API错误(' + resp.status + ')，使用本地回复';
      if (typeof addChatSystem === 'function') addChatSystem(chatMsg);
    } else {
      var data = await resp.json();
      // 完整的API响应调试
      var choice0 = data.choices && data.choices[0];
      var msg = choice0 && choice0.message;
      var finishReason = choice0 && choice0.finish_reason;
      console.log('[朋友圈] API原始响应:', JSON.stringify({ model: data.model, finish: finishReason, contentLen: msg ? (msg.content || '').length : -1 }).substring(0, 120));
      var comment = msg ? (msg.content || '').trim() : '';
      if (comment && comment.length >= 2 && !/^[。，、！？…\.\,\!\?\s\-\～\~]+$/.test(comment)) {
        if (!moments[index].comments) moments[index].comments = [];
        moments[index].comments.push({ user: pName, content: comment, time: Date.now() });
        lsSet('moments', moments);
        renderMoments();
        return;
      }
      console.log('[朋友圈] AI评论内容无效:', JSON.stringify(comment || '(空/无内容)'), 'finish_reason:', finishReason);
    }
  } catch(e) {
    console.log('[朋友圈] AI评论异常:', e?.message?.substring(0,80));
    if (typeof addChatSystem === 'function') addChatSystem('⚠️ 朋友圈评论API异常: ' + e?.message?.substring(0,40));
  }

  // 降级
  var fb = _fallbackMomentComment(m.content, pName);
  if (fb) {
    if (!moments[index].comments) moments[index].comments = [];
    moments[index].comments.push({ user: pName, content: fb, time: Date.now() });
    lsSet('moments', moments);
    renderMoments();
  }
}

/* ---- 固定词汇降级（API全部失败时的最后防线） ---- */
function _fallbackMomentComment(content, pName) {
  var t = content || '';
  var isTsundere = /傲娇|毒舌|暴躁|刻薄|冷淡/.test((personaData.story || '').toLowerCase());
  if (/吃|饭|食堂|外卖|好吃|饿|喝|奶茶|咖啡/.test(t)) return isTsundere ? '又吃。' : '好吃吗？';
  if (/累|困|熬夜|失眠|辛苦/.test(t)) return isTsundere ? '……歇着吧。' : '辛苦了';
  if (/考试|学习|复习|作业|论文/.test(t)) return isTsundere ? '学你的吧。' : '加油';
  if (/开心|高兴|快乐|好玩|好棒/.test(t)) return isTsundere ? '啧。' : '真好呀';
  if (/难过|伤心|哭|不开心|emo/.test(t)) return isTsundere ? '……怎么了' : '抱抱';
  return isTsundere ? '……哦。' : '看到了';
}

function renderMoments() {
  const list = document.getElementById('momentsList');
  list.innerHTML = '';
  if (moments.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;font-size:14px;">还没有动态<br>点右上角 ✏️ 发一条吧</div>';
    return;
  }
  moments.forEach((m, i) => {
    const el = document.createElement('div');
    el.className = 'moment-card';
    const timeStr = m.time ? formatTime(m.time) : '刚刚';
    const isAi = m.user !== '我';
    let commentsHtml = '';
    if (m.comments && m.comments.length > 0) {
      commentsHtml = '<div class="moment-comments">' + m.comments.map((c, ci) =>
        `<div class="moment-comment-item">
          <b>${escHtml(c.user)}</b>：${escHtml(c.content)}
          <span class="moment-reply-btn" onclick="replyToComment(${i},${ci})">回复</span>
        </div>`
      ).join('') + '</div>';
    }
    const photoHtml = m.photo ? `<div class="moment-photo"><img src="${m.photo}"></div>` : '';
    el.innerHTML = `
      <div class="moment-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="moment-user" style="${isAi?'font-style:italic;color:#666;':''}">${escHtml(m.user)}</div>
        </div>
        <div class="moment-time">${timeStr}</div>
      </div>
      <div class="moment-content">${escHtml(m.content)}</div>
      ${photoHtml}
      <div class="moment-actions">
        <div class="moment-like ${m.liked?'liked':''}" onclick="toggleLike(${i})">
          ${m.liked?'❤️':'🤍'} ${m.likes||0}
        </div>
        <div class="moment-comment" onclick="commentOnMoment(${i})">💬 ${m.comments?m.comments.length:0}</div>
      </div>
      ${commentsHtml}
    `;
    list.appendChild(el);
  });
}

function commentOnMoment(index) {
  const text = prompt('写评论：');
  if (text && text.trim()) {
    if (!moments[index].comments) moments[index].comments = [];
    moments[index].comments.push({ user: '我', content: text.trim(), time: Date.now() });
    lsSet('moments', moments);
    renderMoments();
    setTimeout(() => aiReplyComment(index), 1500);
  }
}

function replyToComment(momentIdx, commentIdx) {
  const m = moments[momentIdx];
  if (!m || !m.comments || !m.comments[commentIdx]) return;
  const target = m.comments[commentIdx];
  const text = prompt('回复 ' + target.user + '：');
  if (text && text.trim()) {
    if (!moments[momentIdx].comments) moments[momentIdx].comments = [];
    const replyText = '回复 @' + target.user + '：' + text.trim();
    moments[momentIdx].comments.push({ user: '我', content: replyText, time: Date.now() });
    lsSet('moments', moments);
    renderMoments();
    setTimeout(() => aiReplyComment(momentIdx), 1500);
  }
}

async function aiReplyComment(index) {
  if (!apiConfig || !apiConfig.apiKey || index >= moments.length) return;
  const m = moments[index];
  const pName = personaData.name || '小伴';
  var isMyMoment = m.user === pName;
  const lastComment = m.comments[m.comments.length - 1];
  if (!lastComment || lastComment.user === pName) return;
  const charVoice = personaData.story ? '你的性格/背景：' + personaData.story : '';
  const charSp = systemPrompt ? '你的说话风格：' + systemPrompt : '';
  var ownerLabel = isMyMoment ? "你的" : "用户的";

  try {
    var resp = await fetch(apiConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.apiKey },
      body: JSON.stringify({
        model: apiConfig.model || 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: '你叫' + pName + '。' + charVoice + (charSp ? '\n' + charSp : '') + '\n回复对方的一句评论，1句话。直接写回复内容，不要加引号和emoji。' },
          { role: 'user', content: '原动态：' + m.content + '\n对方说：' + lastComment.content }
        ],
        max_tokens: 150,
        temperature: 0.85
      })
    });
    if (!resp.ok) {
      var errText2 = await resp.text().catch(function() { return ''; });
      console.log('[朋友圈] AI回复评论错误:', resp.status, errText2.substring(0, 60));
      if (typeof addChatSystem === 'function') addChatSystem('⚠️ 朋友圈评论回复API错误(' + resp.status + ')');
    } else {
      var data2 = await resp.json();
      var reply = data2.choices?.[0]?.message?.content?.trim();
      if (reply && reply.length >= 2 && !/^[。，、！？…\.\,\!\?\s\-\～\~]+$/.test(reply)) {
        moments[index].comments.push({ user: pName, content: reply, time: Date.now() });
        lsSet('moments', moments);
        renderMoments();
        return;
      }
      console.log('[朋友圈] AI回复评论内容无效:', reply);
    }
  } catch(e) {
    console.log('[朋友圈] AI回复评论异常:', e?.message?.substring(0, 80));
    if (typeof addChatSystem === 'function') addChatSystem('⚠️ 朋友圈评论回复异常: ' + e?.message?.substring(0, 40));
  }

  // 降级
  var fb2 = _fallbackCommentReply(lastComment.content);
  if (fb2) {
    moments[index].comments.push({ user: pName, content: fb2, time: Date.now() });
    lsSet('moments', moments);
    renderMoments();
  }
}

/* ---- 评论回复降级 ---- */
function _fallbackCommentReply(userText) {
  var isT = /傲娇|毒舌|暴躁|刻薄|冷淡/.test((personaData.story || '').toLowerCase());
  if (/好|不错|好看/.test(userText)) return isT ? '嗯。' : '谢谢';
  if (/问|吗|什么|怎么|哪/.test(userText)) return isT ? '自己想。' : '让我想想';
  return isT ? '啧。' : '嗯嗯';
}

function toggleLike(i) {
  moments[i].liked = !moments[i].liked;
  moments[i].likes = (moments[i].likes||0) + (moments[i].liked ? 1 : -1);
  lsSet('moments', moments);
  renderMoments();
}

async function addAiMoment() {
  const pName = personaData.name || '小伴';
  const story = personaData.story || '';
  const sp = systemPrompt || '';
  if (apiConfig.apiKey) {
    try {
      let contextInfo = '当前时间：' + new Date().toLocaleString('zh-CN');
      if (weatherData && Date.now() - weatherData.time < 3600000) contextInfo += `\n天气：${weatherData.desc}，${weatherData.temp}°C`;
      if (tasks.filter(t=>!t.done).length > 0) contextInfo += `\n未完成任务：${tasks.filter(t=>!t.done).length}个`;
      const todayStr = new Date().toISOString().split('T')[0];
      if (moodData[todayStr]) contextInfo += `\n今天心情：${moodData[todayStr].emoji} ${moodData[todayStr].label}`;
      if (tideData.periods.length > 0) {
        const predictions = getPredictedPeriods();
        if (predictions.length > 0) {
          const daysUntil = Math.ceil((new Date(predictions[0].start) - new Date()) / (1000*60*60*24));
          if (daysUntil > 0 && daysUntil <= 7) contextInfo += `\n用户经期约${daysUntil}天后`;
        }
      }

      const sysPrompt = `你是${pName}，要发一条朋友圈。${story ? '你的性格/背景：' + story : ''}${sp ? '\n你的说话风格：' + sp : ''}
根据当前环境信息写一条简短有趣的动态（1-2句话），符合你的性格，可以关心用户、分享心情、提建议等。

要求：
- 内容必须有实质性信息，不能只发标点符号或语气词
- 符合你的人设风格
- 结合环境信息自然表达，不要生硬罗列
- 不要用引号，不要加emoji
- 字数限制在20字以内，像真实朋友圈那样简洁`;

      if (checkRecentAiMoments(pName)) {
        contextInfo += '\n\n注意：你刚才已经发过动态了，这次发的内容不要和上一条重复，换个话题。';
      }

      const resp = await fetch(apiConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
        body: JSON.stringify({ model: apiConfig.model || 'deepseek-v4-flash', messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: contextInfo }
        ], max_tokens: 64, temperature: 0.9 })
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (isValidAiReply(content)) {
          let photo = null;
          if (customImgEmojis.length > 0 && Math.random() < 0.3) {
            const pick = customImgEmojis[Math.floor(Math.random() * customImgEmojis.length)];
            const url = await getEmojiImgURL(pick.id);
            if (url) photo = url;
          }
          moments.unshift({ user: pName, content, time: Date.now(), likes: 0, liked: false, comments: [], photo });
          lsSet('moments', moments);
          renderMoments();
          return;
        }
      }
    } catch(e) { console.log('[朋友圈] AI发动态失败:', e?.message?.substring(0,60)); }
  }

  // 降级——人设感知
  var storyLower = (story || '').toLowerCase();
  var isTsundere = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(storyLower);
  var isGentle = /温柔|温暖|亲切|可爱|软/.test(storyLower);
  var hour = new Date().getHours();
  var hasWeather = weatherData && Date.now() - weatherData.time < 3600000;
  var templates = [];

  if (isTsundere) {
    if (hour < 9) templates.push('……早。');
    else if (hour >= 22) templates.push('今天要结束了。');
    else templates.push('啧。','无聊。');
  } else if (isGentle) {
    if (hour < 9) templates.push('早安呀～');
    else if (hour >= 22) templates.push('晚安好梦🌙');
    else templates.push('今天也很好呢♡');
  } else {
    if (hour < 9) templates.push('早。');
    else if (hour >= 22) templates.push('夜。');
    else templates.push('今日。');
  }
  if (hasWeather) {
    if (weatherData.code >= 61) templates.push('下雨了。记得带伞。');
    else templates.push('今天天气不错。');
  }
  var content = templates[Math.floor(Math.random()*templates.length)];
  moments.unshift({ user: pName, content: content, time: Date.now(), likes: 0, liked: false, comments: [], photo: null });
  lsSet('moments', moments);
  renderMoments();
}

/* ---- 检查最近1小时内AI是否发过朋友圈 ---- */
function checkRecentAiMoments(pName) {
  const oneHourAgo = Date.now() - 3600000;
  return moments.some(m => m.user === pName && m.time > oneHourAgo);
}

/* ---- AI自动发朋友圈（由主动消息轮询触发） ---- */
function checkAutoMomentCondition() {
  if (!settings || !settings.autoMoments) return;
  var todayStr = new Date().toISOString().split('T')[0];
  var dailyCount = lsGet('autoMomentDailyCount', {});
  if (!dailyCount[todayStr]) dailyCount[todayStr] = {};

  characters.forEach(function(char) {
    var charDaily = dailyCount[todayStr][char.id] || 0;
    if (charDaily >= 3) return;

    var timestamps = lsGet('autoMomentTimestamps', {});
    var lastTime = timestamps[char.id] || 0;
    if (Date.now() - lastTime < 4 * 60 * 60 * 1000) return;

    var charMsgs = chatData[char.id] || [];
    if (charMsgs.length === 0 && Math.random() > 0.1) return;

    generateAutoMoment(char, todayStr, dailyCount);
  });
}

async function generateAutoMoment(char, todayStr, dailyCount) {
  var pName = char.name || '小伴';
  var story = char.story || '';
  var charSp = lsGet('sp_' + char.id, char.systemPrompt || '');
  var charPers = lsGet('persona_' + char.id, null);
  var charStory = (charPers && charPers.story) ? charPers.story : char.story;

  if (apiConfig && apiConfig.apiKey) {
    try {
      var contextInfo = '当前时间：' + new Date().toLocaleString('zh-CN');
      if (weatherData && Date.now() - weatherData.time < 3600000) {
        contextInfo += '\n天气：' + weatherData.desc + '，' + weatherData.temp + '°C';
      }
      var sysPrompt = '你是' + pName + '，要发一条朋友圈。' +
        (charStory ? '\n你的性格/背景：' + charStory : '') +
        (charSp ? '\n你的说话风格：' + charSp : '') +
        '\n\n要求：\n- 内容必须有实质信息，不能只发符号或语气词\n- 符合你的人设和性格\n- 根据当前环境写1-2句话，简短有趣\n- 不要用引号，不要加emoji\n- 字数控制在20字以内';

      if (checkRecentAiMoments(pName)) {
        contextInfo += '\n\n注意：你刚才已经发过动态了，这次发的内容不要重复。';
      }

      var resp = await fetch(apiConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiConfig.apiKey },
        body: JSON.stringify({ model: apiConfig.model || 'deepseek-v4-flash', messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: contextInfo }
        ], max_tokens: 64, temperature: 0.9 })
      });
      if (resp.ok) {
        var data = await resp.json();
        var content = data.choices?.[0]?.message?.content?.trim();
        if (isValidAiReply(content)) {
          var photo = null;
          if (typeof customImgEmojis !== 'undefined' && customImgEmojis.length > 0 && Math.random() < 0.3) {
            var pick = customImgEmojis[Math.floor(Math.random() * customImgEmojis.length)];
            if (typeof getEmojiImgURL === 'function') {
              var url = await getEmojiImgURL(pick.id);
              if (url) photo = url;
            }
          }
          moments.unshift({ user: pName, content: content, time: Date.now(), likes: 0, liked: false, comments: [], photo: photo });
          lsSet('moments', moments);
          renderMoments();
          updateAutoMomentCount(todayStr, char.id, dailyCount);
          return;
        }
      }
    } catch(e) {
      console.log('[自动朋友圈] API失败:', e.message.substring(0, 50));
    }
  }

  // 本地降级——人设感知，动态内容
  var storyLower = (charStory || '').toLowerCase();
  var isTsundere = /傲娇|毒舌|暴躁|刻薄|冷淡/.test(storyLower);
  var isGentle = /温柔|温暖|亲切|可爱|软/.test(storyLower);
  var hour = new Date().getHours();
  var templates = [];

  // 结合天气
  var hasWeather = weatherData && Date.now() - weatherData.time < 3600000;
  var isRainy = hasWeather && (weatherData.code >= 61 || (weatherData.desc && weatherData.desc.indexOf('雨') !== -1));
  var temp = hasWeather ? weatherData.temp : null;

  // 结合任务
  var undoneTasks = (typeof tasks !== 'undefined') ? tasks.filter(function(t) { return !t.done; }).length : 0;

  if (isTsundere) {
    if (hour < 9) {
      templates.push('……醒了没。','早。');
    } else if (hour >= 22) {
      templates.push('今天要结束了。','夜深了。','啧，一天又没了。');
    } else {
      templates.push('今天天气还行。','无聊。','……在干嘛。','晒个太阳。');
    }
    if (isRainy) templates.push('下雨了。……带伞没。');
    if (temp !== null && temp > 30) templates.push('热死了。…………');
    if (undoneTasks > 3) templates.push('任务还没做完吧你。');
  } else if (isGentle) {
    if (hour < 9) {
      templates.push('早安呀~今天也是美好的一天 ☀️','早～昨晚睡得好吗？');
    } else if (hour >= 22) {
      templates.push('夜深了，大家晚安好梦 🌙','今天也要结束了，希望你今天过得开心');
    } else {
      templates.push('今天心情很好，希望你也一样 ♡','想分享今日份的温柔给你','悄悄许个愿，希望你开心','今天的天空很好看✨');
    }
    if (isRainy) templates.push('外面下雨了~记得带伞哦','下雨天适合窝在家里');
    if (temp !== null && temp > 30) templates.push('好热呀，注意防暑～');
    if (undoneTasks > 3) templates.push('任务有点多呢，慢慢来，不着急～');
  } else {
    if (hour < 9) templates.push('早。');
    else if (hour >= 22) templates.push('夜。','不早了。');
    else templates.push('今日。','记录一下。','天气不错。');
    if (isRainy) templates.push('下雨。带伞。');
  }

  // 通用
  if (hour >= 12 && hour <= 14) templates.push('午饭时间。');
  if (isRainy) templates.push('下雨天。');
  if (temp !== null && temp < 5) templates.push('好冷。注意保暖。');

  var content = templates[Math.floor(Math.random() * templates.length)];
  moments.unshift({ user: pName, content: content, time: Date.now(), likes: 0, liked: false, comments: [], photo: null });
  lsSet('moments', moments);
  renderMoments();
  updateAutoMomentCount(todayStr, char.id, dailyCount);
}

function updateAutoMomentCount(todayStr, charId, dailyCount) {
  if (!dailyCount[todayStr]) dailyCount[todayStr] = {};
  dailyCount[todayStr][charId] = (dailyCount[todayStr][charId] || 0) + 1;
  lsSet('autoMomentDailyCount', dailyCount);

  var timestamps = lsGet('autoMomentTimestamps', {});
  timestamps[charId] = Date.now();
  lsSet('autoMomentTimestamps', timestamps);
}
function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.value = 0.3;
    osc.start();
    setTimeout(() => { osc.frequency.value = 660; }, 200);
    setTimeout(() => { osc.frequency.value = 880; }, 400);
    setTimeout(() => { osc.stop(); ctx.close(); }, 700);
  } catch(e) {}
}
