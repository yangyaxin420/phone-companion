# 方案：AI主动消息 + AI自动发朋友圈 + 设置页

## 需求
1. **AI主动消息** — 角色在特定场景下主动发消息（早问候、久未联系提醒、下雨提醒、随机）
2. **AI自动发朋友圈** — 角色按时间/天气/性格自动发朋友圈（每日有上限）
3. **设置页补全** — 统一的设置页面，控制以上功能的开关 + API 配置 + 数据管理

## 改动文件（7个）

### 1. `js/settings.js` — 完整替换
- 定义 `DEFAULT_SETTINGS` 对象：`{ proactiveMsg, autoMoments, notifications, charPrivacy }`
- 函数：`loadSettings()`, `saveSettings()`, `toggleSetting(el, key)`
- `toggleSetting`：切换 `.on` class + 更新 settings 对象 + `lsSet` 持久化 + `addChatSystem` 反馈
- 使用 `.ios-toggle.on` 模式（已存在于 style.css）

### 2. `index.html` — 加设置页 + 注册轮询
- 在 `page-mood` 之后新增 `#page-settings`，含：
  - 4 个 toggle 开关（AI主动消息/AI自动朋友圈/通知/角色隐私预留）
  - API 配置区域（复用 persona.js 的逻辑）
  - 数据管理区域（导出/导入按钮）
- `init()` 中加轮询间隔：
  ```js
  setInterval(checkProactiveConditions, 300000); // 5分钟
  setTimeout(checkProactiveConditions, 60000);   // 首次延迟1分钟
  ```
- `init()` 中调用 `loadSettings()`

### 3. `js/app.js` — 加图标 + 页面回调
- `ICONS` 数组加一行：`{ id:'settings', symbol:'⚙', name:'设置', page:'page-settings' }`
- `navigateTo` 加回调：`if (pageId === 'page-settings') loadSettings()`

### 4. `css/style.css` — 设置页样式
- `.settings-card`（白底圆角卡片）
- `.settings-row` / `.settings-row-left` / `.settings-row-title` / `.settings-row-desc`

### 5. `js/chat.js` — 主动消息核心逻辑
- 在文件末尾加：
  - `checkProactiveConditions()` — 入口，5分钟轮询触发
    - 检查 settings 开关
    - 冷却判断（同角色30分钟内不重复）
    - 用户正在聊天时不打扰
    - 4个场景：**早晨问候**(7:25-7:35) / **长时间不活跃**(>6h) / **下雨提醒** / **随机**(15%概率)
    - 每个场景一天只触发一次（用 `lsGet` 日期标记）
    - 最后调用 `checkAutoMomentCondition()`
  - `generateProactiveMessage(scenario, char, ...)` — 生成消息
    - 有API：调用 `callLLMApi` 按性格生成
    - 无API：本地模板（傲娇/温柔/高冷 三种模板数组）
  - `sendProactiveMessage(text, char)` — 发送
    - `chatMessages.push` → `saveChatData()`
    - 只有在聊天页才 `renderChat()`
    - 在后台/其他页面 → `new Notification()`
- `sendChat()` 中加一行 `lastUserMsgTime = Date.now()` 追踪

### 6. `js/moments.js` — 自动发朋友圈
- 在文件末尾加：
  - `checkAutoMomentCondition()` — 被 `checkProactiveConditions()` 调用
    - 检查 settings 开关
    - 每个角色每天最多3条，间隔至少4小时
    - 只有活跃角色才能发（有过聊天记录的）
  - `generateAutoMoment(char, todayStr, dailyCount)`
    - 有API：调用 DeepSeek 按角色性格生成
    - 无API：本地模板（天气/心情/早安/晚安等）
    - 记录到 `moments` 数组 + 更新计数

### 7. `js/persona.js` — 最小改动
- 可选：把 `saveApiConfig` 和 `testApiConnection` 改为也可从设置页调用，或复制逻辑

## 数据存储

| localStorage 键 | 格式 | 用途 |
|---|---|---|
| `phone_settings` | `{proactiveMsg,autoMoments,notifications,charPrivacy}` | 设置 |
| `phone_proactiveTimestamps` | `{charId: timestamp}` | 各角色最后主动消息时间 |
| `phone_greeted_{charId}` | date string | 当日是否已早安 |
| `phone_inactiveMsg_{charId}_{date}` | boolean | 当日是否已发不活跃提醒 |
| `phone_rainMsg_{charId}_{date}` | boolean | 当日是否已发下雨提醒 |
| `phone_autoMomentDailyCount` | `{date: {charId: count}}` | 每日自动朋友圈计数 |
| `phone_autoMomentTimestamps` | `{charId: timestamp}` | 最后自动朋友圈时间 |
| `phone_lastUserMsgTime` | timestamp | 用户最后发消息时间 |

## 场景模板示例

**傲娇版** — 早安：「啧，醒了没。」/ 久未联系：「一天没理我……随你吧。」/ 下雨：「带伞了吗？没带活该冻着。」
**温柔版** — 早安：「早安~今天也要开心哦☀️」/ 久未联系：「已经X小时没找你了……在忙吗？」
**高冷版** — 早安：「起了。」/ 下雨：「下雨。带伞。」/ 久未联系：「X小时。忙。」

## 边界情况
- 无API Key → 完全本地模板降级
- 用户正在聊天（5分钟内） → 不打扰
- 应用在后台/其他页面 → 走 Notification API
- 首次启动 → 所有设置默认开启，轮询60秒后启动
- 3个角色 → 主动消息仅当前角色，朋友圈所有角色轮流发

## 验证
1. 首页能看到 ⚙ 设置图标，点击进入设置页
2. toggle 开关能正常切换，状态持久化
3. 调到早上7:25-7:35 → 检查是否收到早安消息
4. 超过6小时不聊天 → 检查是否收到提醒
5. 天气为下雨 → 检查是否收到提醒
6. 设置页关闭主动消息 → 检查不再触发
7. 朋友圈有 AI 自动发布的新动态（最多每天3条/角色）
8. 关掉自动朋友圈 → 检查不再自动发
