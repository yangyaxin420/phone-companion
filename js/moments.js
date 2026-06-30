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

async function aiCommentMoment(index) {
  if (!apiConfig.apiKey || index >= moments.length) return;
  const m = moments[index];
  if (m.user === (personaData.name || '小伴')) return;
  const pName = personaData.name || '小伴';
  const personaDesc = personaData.story ? `\n你的性格/背景：${personaData.story}` : '';
  try {
    const sysPrompt = `你是${pName}，用户刚发了一条朋友圈，请写一条简短自然的评论（1-2句话）。${personaDesc}用你的风格来评论，不要用引号包裹，不要加emoji。`;
    const resp = await fetch(apiConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
      body: JSON.stringify({ model: apiConfig.model || 'deepseek-chat', messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: `我发的朋友圈内容：「${m.content}」` }
      ], max_tokens: 64, temperature: 0.9 })
    });
    if (resp.ok) {
      const data = await resp.json();
      const comment = data.choices?.[0]?.message?.content?.trim();
      if (comment) {
        if (!moments[index].comments) moments[index].comments = [];
        moments[index].comments.push({ user: pName, content: comment, time: Date.now() });
        lsSet('moments', moments);
        renderMoments();
      }
    }
  } catch(e) {}
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
      commentsHtml = '<div class="moment-comments">' + m.comments.map(c =>
        `<div class="moment-comment-item"><b>${escHtml(c.user)}</b>：${escHtml(c.content)}</div>`
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

async function aiReplyComment(index) {
  if (!apiConfig.apiKey || index >= moments.length) return;
  const m = moments[index];
  const pName = personaData.name || '小伴';
  var isMyMoment = m.user === pName;
  const lastComment = m.comments[m.comments.length - 1];
  if (!lastComment || lastComment.user === pName) return;
  try {
    var ownerLabel = isMyMoment ? "你的" : "用户的";
    const sysPrompt = `你是${pName}，有人在${ownerLabel}朋友圈评论了，请简短回复（1句话）。${personaData.story ? '你的性格：' + personaData.story + '。用你的风格回复。' : ''}不要用引号，不要加emoji。`;
    const resp = await fetch(apiConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
      body: JSON.stringify({ model: apiConfig.model || 'deepseek-chat', messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: `原动态：「${m.content}」\n评论者说：「${lastComment.content}」` }
      ], max_tokens: 48, temperature: 0.9 })
    });
    if (resp.ok) {
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) {
        moments[index].comments.push({ user: pName, content: reply, time: Date.now() });
        lsSet('moments', moments);
        renderMoments();
      }
    }
  } catch(e) {}
}

function toggleLike(i) {
  moments[i].liked = !moments[i].liked;
  moments[i].likes = (moments[i].likes||0) + (moments[i].liked ? 1 : -1);
  lsSet('moments', moments);
  renderMoments();
}

async function addAiMoment() {
  const pName = personaData.name || '小伴';
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

      const sysPrompt = `你是${pName}，要发一条朋友圈。${personaData.story ? '你的性格/背景：' + personaData.story + '。用你自己的风格来写。' : ''}根据当前环境信息写一条简短有趣的动态（1-2句话），可以关心用户、分享心情、提建议等。不要用引号，不要加emoji。`;
      const resp = await fetch(apiConfig.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
        body: JSON.stringify({ model: apiConfig.model || 'deepseek-chat', messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: contextInfo }
        ], max_tokens: 64, temperature: 0.9 })
      });
      if (resp.ok) {
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
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
    } catch(e) {}
  }

  // 降级
  const templates = [];
  if (compState.running) templates.push(`${pName}正在陪伴你${compState.activity}～`);
  if (weatherData && Date.now() - weatherData.time < 3600000) templates.push(`今天${weatherData.desc}，${weatherData.temp}°C`);
  templates.push(`${pName}觉得今天也要加油哦！💪`);
  templates.push(`${pName}偷偷冒个泡 🫧`);
  templates.push(`今天的心情怎么样呀？`);
  moments.unshift({ user: pName, content: templates[Math.floor(Math.random()*templates.length)], time: Date.now(), likes: 0, liked: false, comments: [] });
  lsSet('moments', moments);
  renderMoments();
}

/* ---- 音效工具（闹钟用） ---- */
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
