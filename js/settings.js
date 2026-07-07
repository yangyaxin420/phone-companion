/* ==================== 设置页 ==================== */
const APP_VERSION = "v3.3.0 (2026.07.07)";

const DEFAULT_SETTINGS = {
  proactiveMsg: true,
  autoMoments: true,
  notifications: true,
  charPrivacy: false
};

let settings = lsGet('settings', DEFAULT_SETTINGS);

function loadSettings() {
  var verEl = document.getElementById('appVersionDisplay');
  if (verEl && typeof APP_VERSION !== 'undefined') verEl.textContent = APP_VERSION;
  settings = lsGet('settings', DEFAULT_SETTINGS);
  const toggles = ['proactiveMsg','autoMoments','notifications','charPrivacy'];
  toggles.forEach(function(key) {
    const el = document.getElementById('setting' + key.charAt(0).toUpperCase() + key.slice(1));
    if (el) {
      if (settings[key]) el.classList.add('on');
      else el.classList.remove('on');
    }
  });
  // 加载 API Key
  const apiKeyInput = document.getElementById('settingsApiKey');
  if (apiKeyInput && apiConfig) {
    apiKeyInput.value = apiConfig.apiKey || '';
  }
}

function toggleSetting(el, key) {
  const isOn = el.classList.toggle('on');
  settings[key] = isOn;
  lsSet('settings', settings);
  // 通知权限
  if (key === 'notifications' && isOn) {
    requestNotificationPermission();
  }
  const labels = {
    proactiveMsg: 'AI主动消息',
    autoMoments: 'AI自动发朋友圈',
    notifications: '通知',
    charPrivacy: '角色隐私'
  };
  addChatSystem((isOn ? '✅ ' : '❌ ') + labels[key] + (isOn ? '已开启' : '已关闭'));
}

function saveSettingsApiConfig() {
  const keyInput = document.getElementById('settingsApiKey');
  if (!keyInput) return;
  const newKey = keyInput.value.trim();
  if (apiConfig) {
    apiConfig.apiKey = newKey;
    lsSet('apiConfig', apiConfig);
  }
  addChatSystem('✅ API Key 已保存');
  updateApiStatusBadge();
}

function testSettingsApiConnection() {
  if (typeof testApiConnection === 'function') {
    testApiConnection();
  } else {
    addChatSystem('⚠️ 请先保存 API Key');
  }
}
