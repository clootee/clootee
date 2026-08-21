// 前端逻辑：API 调用、WebSocket 实时更新、渲染。无业务逻辑下沉，仅渲染与转发
const State = {
  roots: [],
  rootId: sessionStorage.getItem('rootId') || '',
  sessions: [],
  sessionId: '',
  session: null,
  settings: { defaultEngine: 'claude', platform: '', allowLan: false, preferBundled: false, outEndReady: false, systemPrompt: '', templateCollectionPath: '', quickGroups: [], autoCompact: { mode: 'auto', tokens: 200000 }, lanUrls: [], port: 0 }, // 默认引擎 + 服务器平台 + 访问/运行时 + 局域网地址（从后端 /api/settings 加载）
  running: new Set(),                     // 正在执行任务的会话 id 集合（驱动侧栏"执行中"标识）
  runningTasks: new Map(),                // 会话 id → 该会话正在跑的任务 id 集合；running 即它的非空键集（排队新消息不会误清执行中）
  justFinished: new Set(),                // 刚从执行中变为停止、且用户尚未点开查看的会话 id（驱动侧栏"刚执行"醒目标识，区别于状态"已完成"）
  justFinishedSeen: new Set(),            // 在「刚执行完」筛选下被点开（已清除待读）的会话 id：本轮筛选内继续保留在列表中，避免点一个少一个
  tab: 'active',                          // 会话列表筛选：active / testing / completed / all
  runFilters: new Set(),                  // 运行状态筛选（与 tab 叠加）：可同时含 running / justFinished（并集）；空集=「所有」
  mode: 'classic',                       // 模式切换已下线，固定经典模式
  favoritesOnly: sessionStorage.getItem('favoritesOnly') === '1', // 刷新后保持收藏夹视图（与 rootId 同用 sessionStorage）
  favoriteSessions: [],
  favoriteCacheReady: false,
  favoriteRootBindingDraftId: '',
  rootRecent: {},
  aiCollapsed: localStorage.getItem('aiCollapsed') !== '0', // 新用户默认收拢；仅显式关闭('0')才展开
  aiExpandedGroups: new Set(),
  batchMode: false,                       // 会话批量选择模式
  selectedSessions: new Set(),            // 批量模式下已勾选的会话 id
  selectedRoots: new Set(),               // 根目录管理弹窗中已勾选的根 id
  notices: [],                            // 运行提示（后端 kind='notice'）：{id,sessionId,taskId,level,message,at}
  dismissedNotices: new Set(),            // 用户手动关掉（或发新消息时清掉）的提示卡片 key，渲染时跳过
  noticeOpen: false,                      // 右下角错误小圆圈是否已展开
};
let NOTICE_SEQ = 0;                       // 提示卡片自增 id：数组下标会随裁剪变动，不能当 key

// 工作台模式：不按左上角根目录过滤，而是跨全部目录合并会话，每个会话自带目录。
function isWorkspace() {
  return State.mode === 'workspace';
}
// 应用当前模式到 body（CSS 据此隐藏根目录栏等）+ 刷新切换按钮文案
function applyMode() {
  document.body.classList.toggle('mode-workspace', isWorkspace());
  const btn = $('modeToggleBtn');
  if (btn) {
    btn.textContent = isWorkspace() ? T('modeWorkspace') : T('modeClassic');
    btn.title = T('modeToggleHint');
  }
}
async function toggleMode() {
  State.mode = isWorkspace() ? 'classic' : 'workspace';
  localStorage.setItem('hubMode', State.mode);
  setFavoritesOnly(false);
  applyMode();
  // 切换后重新加载会话（数据源不同）：先清空当前选择避免跨模式串台
  State.sessionId = '';
  State.session = null;
  await loadSessions();
  await selectSession(State.sessions[0]?.id || null);
}
// 根目录末段名（工作台会话列表的目录徽章用）
function rootName(rootId) {
  const r = State.roots.find((x) => x.id === rootId);
  if (!r) return '';
  return basename(r.path) || r.name;
}

function setTabRootId(rootId) {
  State.rootId = rootId || '';
  if (State.rootId) sessionStorage.setItem('rootId', State.rootId);
  else sessionStorage.removeItem('rootId');
}

// 收藏夹视图开关：持久化到 sessionStorage，刷新页面后仍停留在收藏夹
function setFavoritesOnly(on) {
  State.favoritesOnly = !!on;
  if (State.favoritesOnly) sessionStorage.setItem('favoritesOnly', '1');
  else sessionStorage.removeItem('favoritesOnly');
}

// 引擎显示名
function engineLabel(e) {
  return e === 'codex' ? T('engineCodex') : T('engineClaude');
}
function engineShortLabel(e) {
  return e === 'codex' ? 'CD' : 'CC';
}
function assistantLabel() {
  return engineLabel(State.session?.engine);
}
// 会话是否仍是"未开始"草稿（可切换引擎）
function isDraftSession(s) {
  return !!s && !s.claudeSessionId && (s.tasks || []).length === 0;
}

let TOKEN = localStorage.getItem('token') || '';
// 本次打开是否属于「新用户首启」（尚未设定访问密码）：决定引导结束后是去设密码还是直接进入
let NEEDS_SETUP = false;

// ── API ──
async function api(path, body) {
  const headers = { 'x-auth-token': TOKEN };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('unauthorized');
  }
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'request failed');
  return json.data;
}

const $ = (id) => document.getElementById(id);

// ── 静态文案 ──
function applyText() {
  document.documentElement.lang = LANG;
  $('appTitle').textContent = T('title');
  $('appTitle').style.display = '';
  $('appTitle').title = T('tagline');
  $('appTagline').textContent = T('tagline');
  // 浏览器标签页/窗口标题也带上这句介绍，并随语言切换
  document.title = `${T('title')} — ${T('tagline')}`;
  $('langBtn').textContent = T('lang');
  $('guideBtn').title = T('guideBtn');
  if (!$('guideMenu').hidden) renderGuideMenu();
  if (!$('guideOverlay').hidden) renderGuide();
  $('rootLabel').textContent = T('root');
  $('addRootBtn').textContent = '＋';
  $('addRootBtn').title = T('addRoot');
  $('removeRootBtn').textContent = '🗑';
  $('removeRootBtn').title = T('removeRoot');
  $('manageRootsBtn').title = T('manageRoots');
  $('batchToggleBtn').title = T('batchSelect');
  $('rootManageTitle').textContent = T('manageRootsTitle');
  $('rootManageClose').textContent = T('close');
  $('rmAllLabel').textContent = T('selectAll');
  $('rootManageDelete').textContent = T('deleteSelected');
  $('batchAllLabel').textContent = T('selectAll');
  $('batchDeleteBtn').textContent = `🗑 ${T('deleteSelected')}`;
  $('batchMarkCompleted').textContent = `✅ ${T('markCompleted')}`;
  $('batchMarkTesting').textContent = `🧪 ${T('markTesting')}`;
  $('batchMarkActive').textContent = `🔥 ${T('markActive')}`;
  $('batchCancelBtn').textContent = T('cancel');
  $('gitPushBtn').textContent = '⇪';
  $('rootEditTitle').textContent = T('editRootTitle');
  $('rootEditClose').textContent = T('close');
  $('noteLabel').textContent = T('note');
  $('rootNote').placeholder = T('notePlaceholder');
  $('linksLabel').textContent = T('links');
  $('addLinkBtn').textContent = T('addLink');
  $('rootEditSave').textContent = T('save');
  $('sessionsLabel').textContent = T('sessions');
  refreshNewSessionButton();
  $('wsDirTitle').textContent = T('wsPickDirTitle');
  $('wsDirClose').textContent = T('close');
  $('wsRecentLabel').textContent = T('wsRecentLabel');
  $('wsAddLabel').textContent = T('wsAddDirLabel');
  $('wsDirPath').placeholder = T('wsDirPathPlaceholder');
  $('wsDirBrowse').textContent = T('wsBrowse');
  $('wsDirCreateLabel').textContent = T('wsCreateIfMissing');
  $('wsDirUse').textContent = T('wsUseDir');
  $('searchToggleBtn').title = T('search');
  $('favoritesToggleBtn').title = T('favoritesFolder');
  $('sessionSearch').placeholder = T('searchSessions');
  $('advSearchLabel').textContent = T('advancedSearch');
  $('tabActiveBtn').textContent = T('tabActive');
  $('tabTestingBtn').textContent = T('tabTesting');
  $('tabCompletedBtn').textContent = T('tabCompleted');
  $('tabAllBtn').textContent = T('tabAll');
  syncRunTabs();
  $('ctxMarkActive').textContent = T('markActive');
  $('ctxMarkTesting').textContent = T('markTesting');
  $('ctxMarkCompleted').textContent = T('markCompleted');
  $('ctxRenameTitle').textContent = T('renameSession');
  $('ctxTraceStats').textContent = T('ctxTraceStats');
  $('ctxOpenWorkdir').textContent = T('ctxOpenWorkdir');
  $('ctxToggleFavorite').textContent = T('favoriteSession');
  $('processLabel').textContent = T('process');
  $('clearProcessBtn').textContent = T('clearProcess');
  $('taskInput').placeholder = T('inputPlaceholder');
  $('addTaskBtn').textContent = T('addTask');
  $('addTasksLabel').textContent = T('addTasks');
  $('tasksTitle').textContent = T('multiTaskTitle');
  $('tasksClose').textContent = T('close');
  $('tasksHint').textContent = T('multiTaskHint');
  $('tasksSubmit').textContent = T('submitTasks');
  $('tasksInput').placeholder = T('inputPlaceholder');
  $('qmAllLabel').textContent = T('selectAll');
  $('stopBtn').textContent = T('stopTask');
  $('stopChoiceTitle').textContent = T('stopChoiceTitle');
  $('stopChoiceDesc').textContent = T('stopChoiceDesc');
  $('stopChoicePauseTitle').textContent = T('stopChoicePause');
  $('stopChoicePauseDesc').textContent = T('stopChoicePauseDesc');
  $('stopChoiceNextTitle').textContent = T('stopChoiceNext');
  $('stopChoiceNextDesc').textContent = T('stopChoiceNextDesc');
  $('pauseHint').textContent = T('pauseHint');
  refreshComposerControls();
  $('uploadBtn').title = T('uploadFile');
  $('shotBtn').title = T('screenshot');
  $('cmdMenuBtn').title = T('cmdMenuBtn');
  if (!$('cmdMenu').hidden) renderCmdMenu();
  if (!$('cmdOverlay').hidden) $('cmdGotIt').textContent = T('guideGotIt');
  $('shotHead').textContent = T('shotPreview');
  $('shotTip').textContent = T('shotDragTip');
  $('shotCancel').textContent = T('cancel');
  $('shotConfirm').textContent = T('confirm');
  $('dropHint').textContent = T('dropToUpload');
  $('loginTitle').textContent = T('loginTitle');
  $('loginPwd').placeholder = T('password');
  $('loginBtn').textContent = T('loginBtn');
  $('logoutBtn').textContent = T('logout');
  $('themeBtn').textContent = '🎨';
  $('themeBtn').title = T('themePick');
  refreshAiCollapseBtn();
  $('pickerTitle').textContent = T('pickDir');
  $('pickerClose').textContent = T('close');
  $('pickerHome').textContent = '🏠 ' + T('home');
  $('pickerUp').textContent = '⬆ ' + T('up');
  $('pickerNewDir').textContent = '➕ ' + T('newFolder');
  $('pickerGo').textContent = T('go');
  $('pickerSearch').placeholder = T('searchDir');
  $('pickerName').placeholder = T('dirNameLabel');
  $('pickerSelect').textContent = T('selectThisDir');
  $('fmSearchInput').placeholder = T('searchFiles');
  $('fmSearchBtn').title = T('search');
  $('fmRefreshBtn').title = T('refresh');
  $('settingsBtn').title = T('settings');
  $('settingsTitle').textContent = T('settingsTitle');
  $('settingsClose').textContent = T('close');
  $('defaultEngineLabel').textContent = T('defaultEngine');
  $('settingsPaneSave').textContent = T('save');
  $('settingsPaneBack').title = T('back');
  // 设置弹窗开着时切语言 → 重渲染板块列表 / 当前板块标题
  if (!$('settingsOverlay').hidden) renderSettingsNav();
  if (!$('settingsPaneOverlay').hidden && CurrentPane) {
    const p = paneById(CurrentPane);
    if (p) $('settingsPaneTitle').textContent = `${p.icon} ${p.title()}`;
  }
  // 引擎下拉选项（主区 + 设置弹窗）
  fillEngineOptions($('engineSelect'));
  fillEngineOptions($('defaultEngineSelect'));
  applyEnginePaneText();
  updateQueueToggle((State.session?.tasks || []).length);
  refreshPauseBtn();
  refreshEngineControl();
  applyMode();
}

// 用 claude/codex 两个选项填充一个 <select>
function fillEngineOptions(sel) {
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML =
    `<option value="claude">${escapeHtml(T('engineClaude'))}</option>` +
    `<option value="codex">${escapeHtml(T('engineCodex'))}</option>`;
  if (prev) sel.value = prev;
}

// ── 主题（多主题：经典深/浅 + 大海蓝 + 粉色少女心，持久化） ──
// 每项 sw = 三色样本[背景, 强调, 文字]，用于面板色卡预览。
const THEMES = [
  { id: 'dark', name: () => T('themeDark'), sw: ['#0f1115', '#5b8cff', '#e6e8ec'] },
  { id: 'light', name: () => T('themeLight'), sw: ['#f4f6fb', '#2f6fed', '#1b2230'] },
  { id: 'ocean', name: () => T('themeOcean'), sw: ['#0a1a2f', '#38bdf8', '#dce8f5'], anim: true },
  { id: 'pink', name: () => T('themePink'), sw: ['#fff0f6', '#ec4899', '#5a2a42'] },
  { id: 'green', name: () => T('themeGreen'), sw: ['#f0f7ee', '#3fa34d', '#22331c'], anim: true },
  { id: 'cat', name: () => T('themeCat'), sw: ['#fdf6ec', '#e08a3c', '#4a3928'], anim: true },
  { id: 'galaxy', name: () => T('themeGalaxy'), sw: ['#05070f', '#3b82f6', '#f2f6ff'], anim: true },
  { id: 'mecha', name: () => T('themeMecha'), sw: ['#171a1c', '#eab308', '#d5dde2'], anim: true },
  { id: 'cyber', name: () => T('themeCyber'), sw: ['#0d0221', '#ff2a6d', '#f0e9ff'], anim: true },
  { id: 'steam', name: () => T('themeSteam'), sw: ['#241b12', '#c8862b', '#ecdcbf'] },
  { id: 'rain', name: () => T('themeRain'), sw: ['#0e1519', '#5aa9e6', '#dbe6ec'], anim: true },
  { id: 'sea', name: () => T('themeSea'), sw: ['#04141f', '#22d3ee', '#cfe6ef'], anim: true },
  { id: 'aurora', name: () => T('themeAurora'), sw: ['#0a1420', '#4ade80', '#dce8f0'], anim: true },
  { id: 'winter', name: () => T('themeWinter'), sw: ['#dbe9f5', '#4f9fd6', '#25384a'], anim: true },
  { id: 'rabbit', name: () => T('themeRabbit'), sw: ['#e7f3dc', '#6aa84f', '#35402a'], anim: true },
];
// 浅底主题集合（编辑器用 CodeMirror default，其余用 material-darker）
const LIGHT_THEMES = ['light', 'pink', 'green', 'cat', 'winter', 'rabbit'];
function currentTheme() {
  const t = localStorage.getItem('theme') || 'dark';
  return THEMES.some((x) => x.id === t) ? t : 'dark';
}
function isLightTheme(t) {
  return LIGHT_THEMES.indexOf(t || currentTheme()) >= 0;
}
function cmTheme() {
  return isLightTheme() ? 'default' : 'material-darker';
}
function applyTheme() {
  const theme = currentTheme();
  THEMES.forEach((t) => document.body.classList.remove(t.id));
  document.body.classList.add(theme);
  // 同步 CodeMirror 主题（编辑器若已创建）
  if (typeof Editor !== 'undefined' && Editor.cm) Editor.cm.setOption('theme', cmTheme());
  // 银河系动态星空 / 赛博朋克合成波场景：仅对应主题时激活 canvas 动画
  if (window.Galaxy) window.Galaxy.setActive(theme === 'galaxy');
  if (window.Cyber) window.Cyber.setActive(theme === 'cyber');
  if (window.Rain) window.Rain.setActive(theme === 'rain');
  if (window.Sea) window.Sea.setActive(theme === 'sea');
  if (window.Aurora) window.Aurora.setActive(theme === 'aurora');
  if (window.Winter) window.Winter.setActive(theme === 'winter');
  if (window.Ocean) window.Ocean.setActive(theme === 'ocean');
  if (window.Bamboo) window.Bamboo.setActive(theme === 'green');
  if (window.Cat) window.Cat.setActive(theme === 'cat');
  if (window.Rabbit) window.Rabbit.setActive(theme === 'rabbit');
  if (window.Mecha) window.Mecha.setActive(theme === 'mecha');
}
function pickTheme(id) {
  localStorage.setItem('theme', id);
  applyTheme();
  renderThemePanel();
}
function renderThemePanel() {
  const cur = currentTheme();
  $('themePanelTitle').textContent = T('themePick');
  $('themeGrid').innerHTML = THEMES.map((t) =>
    `<button type="button" class="theme-opt${t.id === cur ? ' on' : ''}" data-theme="${t.id}">
       <span class="theme-sw">${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
       <span class="theme-nm">${escapeHtml(t.name())}</span>
       ${t.anim ? `<span class="theme-anim" title="${escapeHtml(T('themeAnim'))}">✨ ${escapeHtml(T('themeAnim'))}</span>` : ''}
       ${t.id === cur ? '<span class="theme-chk">✓</span>' : ''}
     </button>`).join('');
  $('themeGrid').querySelectorAll('[data-theme]').forEach((el) => {
    el.onclick = () => pickTheme(el.dataset.theme);
  });
}
function toggleThemePanel() {
  const p = $('themePanel');
  if (p.hidden) { renderThemePanel(); p.hidden = false; }
  else p.hidden = true;
}
function closeThemePanel() {
  const p = $('themePanel');
  if (p && !p.hidden) p.hidden = true;
}

// ── 教程入口菜单：📖 弹出两个选项（快速上手指南 / 小白教程） ──
function renderGuideMenu() {
  $('guideMenuTitle').textContent = T('guideMenuTitle');
  $('gmQuickT').textContent = T('guideMenuQuickT');
  $('gmQuickD').textContent = T('guideMenuQuickD');
  $('gmLearnT').textContent = T('guideMenuLearnT');
  $('gmLearnD').textContent = T('guideMenuLearnD');
}
function toggleGuideMenu() {
  const p = $('guideMenu');
  if (p.hidden) { renderGuideMenu(); p.hidden = false; }
  else p.hidden = true;
}
function closeGuideMenu() {
  const p = $('guideMenu');
  if (p && !p.hidden) p.hidden = true;
}
// 小白教程是独立页面，另开标签页，不打断当前会话
function openLearnCourse() {
  closeGuideMenu();
  window.open('learn.html', '_blank', 'noopener');
}

// ── 使用指南 ──
function renderGuide() {
  $('guideTitle').textContent = T('guideTitle');
  $('guideBody').innerHTML = T('guideHtml');
  $('guideGotIt').textContent = T('guideGotIt');
}
function openGuide() {
  renderGuide();
  $('guideOverlay').hidden = false;
}
function closeGuide() {
  $('guideOverlay').hidden = true;
}

// ── 登录 ──
function showLogin() {
  $('loginOverlay').hidden = false;
  setTimeout(() => $('loginPwd').focus(), 50);
}
function hideLogin() {
  $('loginOverlay').hidden = true;
}
async function doLogin(e) {
  e.preventDefault();
  $('loginErr').textContent = '';
  try {
    const data = await api('/api/auth/login', { password: $('loginPwd').value });
    TOKEN = data.token;
    localStorage.setItem('token', TOKEN);
    $('loginPwd').value = '';
    hideLogin();
    await startApp();
  } catch {
    $('loginErr').textContent = T('wrongPassword');
  }
}
function logout() {
  TOKEN = '';
  localStorage.removeItem('token');
  location.reload();
}

// ── 首次安装：设定访问密码 ──
function showSetup() {
  $('setupTitle').textContent = T('setupTitle');
  $('setupHint').textContent = T('setupHint');
  $('setupPwd').placeholder = T('setupPwd');
  $('setupPwd2').placeholder = T('setupPwd2');
  $('setupBtn').textContent = T('setupBtn');
  $('setupOverlay').hidden = false;
  setTimeout(() => $('setupPwd').focus(), 50);
}
async function doSetup(e) {
  e.preventDefault();
  $('setupErr').textContent = '';
  const p1 = $('setupPwd').value;
  const p2 = $('setupPwd2').value;
  if (!p1 || p1.length < 4) { $('setupErr').textContent = T('setupTooShort'); return; }
  if (p1 !== p2) { $('setupErr').textContent = T('setupMismatch'); return; }
  try {
    const data = await api('/api/auth/setup', { password: p1 });
    TOKEN = data.token;
    NEEDS_SETUP = false;
    localStorage.setItem('token', TOKEN);
    $('setupPwd').value = '';
    $('setupPwd2').value = '';
    $('setupOverlay').hidden = true;
    await startApp();
  } catch (err) {
    $('setupErr').textContent = err.message || T('setupFail');
  }
}

// ── 根目录 ──
async function loadRoots() {
  State.roots = await api('/api/root/list');
  await refreshRootRecency();
  const sel = $('rootSelect');
  sel.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = T('selectRootFirst');
  sel.appendChild(empty);
  sortedRoots().forEach((r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.name} (${r.path})`;
    sel.appendChild(o);
  });
  if (!State.roots.find((r) => r.id === State.rootId)) {
    setTabRootId('');
  }
  sel.value = State.rootId;
  renderWorkdirBar();
  renderRootMeta();
  await loadSessions();
  refreshFavoriteSessions(false);
}

async function refreshRootRecency() {
  try {
    const sessions = await api('/api/session/list-all');
    const recent = {};
    sessions.forEach((s) => {
      if (!s.rootId) return;
      recent[s.rootId] = Math.max(recent[s.rootId] || 0, s.updatedAt || 0);
    });
    State.rootRecent = recent;
  } catch {
    State.rootRecent = {};
  }
}

function sortedRoots() {
  return [...State.roots].sort((a, b) => {
    const ar = State.rootRecent[a.id] || 0;
    const br = State.rootRecent[b.id] || 0;
    if (br !== ar) return br - ar;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

// 当前选中的根目录对象
function currentRoot() {
  return State.roots.find((r) => r.id === State.rootId) || null;
}

// 选中某个根目录（下拉框 change / 引导按钮共用）：同步下拉框、切换 tab 根目录、刷新会话列表
function applyRootSelection(id) {
  setFavoritesOnly(false);
  const sel = $('rootSelect');
  if (sel && sel.value !== id) sel.value = id;
  setTabRootId(id);
  renderWorkdirBar();
  renderRootMeta();
  loadSessions();
  // 选用该目录工作时，若缺 CLAUDE.md/AGENTS.md 则至少引导选一次模板（选过/明确跳过就不再问）
  if (id && typeof offerTemplateForRoot === 'function') offerTemplateForRoot(id);
}

// 引导「选择目录」：打开目录选择器浏览并选中一个项目目录。
// （原先只是 rootSelect.click()，多数浏览器不会以脚本弹开原生下拉 → 点了没反应）
// 走 /api/root/ensure：同一路径复用已有根、不重复添加，选完即选中并进入下一步。
function guidePickRoot() {
  openPicker(async (dirPath) => {
    try {
      const root = await api('/api/root/ensure', { path: dirPath, create: false });
      await loadRoots();
      applyRootSelection(root.id);
    } catch (e) {
      alert(e.message);
    }
  });
}

function renderWorkdirBar() {
  const el = $('workdirBar');
  const row = $('workdirRow');
  if (!el) return;
  const root = State.favoritesOnly ? null : currentRoot();
  el.textContent = root ? root.path : '';
  el.title = root ? root.path : '';
  if (row) row.hidden = !root; // 整行（含边框）随目录有无一起显隐
}

// 侧栏渲染根目录的备注与链接（链接 _blank 打开）。编辑入口集成在此处的 ✎
function renderRootMeta() {
  const box = $('rootMeta');
  const root = currentRoot();
  box.innerHTML = '';
  if (!root) return;
  const hasNote = !!(root.note && root.note.trim());
  const links = root.links || [];

  // 无备注无链接：显示一个低调的「添加」入口
  if (!hasNote && links.length === 0) {
    const add = document.createElement('button');
    add.className = 'meta-empty';
    add.textContent = T('addNoteLink');
    add.addEventListener('click', openRootEdit);
    box.appendChild(add);
    return;
  }

  // 头部：标题 + ✎ 编辑
  const head = document.createElement('div');
  head.className = 'meta-head';
  head.innerHTML = `<span class="lbl">${T('noteLinks')}</span>`;
  const edit = document.createElement('button');
  edit.className = 'meta-edit';
  edit.textContent = '✎';
  edit.title = T('editRoot');
  edit.addEventListener('click', openRootEdit);
  head.appendChild(edit);
  box.appendChild(head);

  if (hasNote) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = root.note;
    box.appendChild(note);
  }
  if (links.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'links';
    links.forEach((l) => {
      const a = document.createElement('a');
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = l.label || l.url;
      a.title = l.url;
      wrap.appendChild(a);
    });
    box.appendChild(wrap);
  }
}

// ── git 一键提交推送：add . / commit -m 1 / push（顶部小型弹窗提示结果，全局仅一个） ──
let gitPushToastTimer = null;
function showGitPushToast(msg, isErr) {
  clearTimeout(gitPushToastTimer);
  const box = $('gitPushToast');
  $('gitPushToastMsg').textContent = msg;
  box.classList.toggle('err', !!isErr);
  box.hidden = false;
  gitPushToastTimer = setTimeout(() => (box.hidden = true), 8000);
}
function hideGitPushToast() {
  clearTimeout(gitPushToastTimer);
  $('gitPushToast').hidden = true;
}
async function gitPush() {
  const root = currentRoot();
  if (!root) {
    alert(T('selectRootFirst'));
    return;
  }
  showGitPushToast(T('gitPushing'), false);
  try {
    const r = await api('/api/root/gitpush', { rootId: root.id });
    showGitPushToast(`${r.ok ? T('gitPushOk') : T('gitPushFail')}\n${r.output}`, !r.ok);
  } catch (e) {
    showGitPushToast(`${T('gitPushFail')}\n${e.message}`, true);
  }
}

// ── 编辑根目录（备注 + 链接） ──
function openRootEdit() {
  const root = currentRoot();
  if (!root) {
    alert(T('selectRootFirst'));
    return;
  }
  $('rootNote').value = root.note || '';
  $('linksEditor').innerHTML = '';
  (root.links || []).forEach((l) => addLinkRow(l.label, l.url));
  $('rootEditOverlay').hidden = false;
}
function closeRootEdit() {
  $('rootEditOverlay').hidden = true;
}
function addLinkRow(label, url) {
  const row = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML =
    `<input class="lbl" placeholder="${T('linkLabel')}" />` +
    `<input class="url" placeholder="${T('linkUrl')}" />` +
    `<button class="del danger sm">✕</button>`;
  row.querySelector('.lbl').value = label || '';
  row.querySelector('.url').value = url || '';
  row.querySelector('.del').addEventListener('click', () => row.remove());
  $('linksEditor').appendChild(row);
}
function collectLinks() {
  return Array.from($('linksEditor').querySelectorAll('.link-row'))
    .map((row) => ({
      label: row.querySelector('.lbl').value.trim(),
      url: row.querySelector('.url').value.trim(),
    }))
    .filter((l) => l.url);
}
async function saveRootEdit() {
  const root = currentRoot();
  if (!root) return;
  await api('/api/root/update', {
    id: root.id,
    note: $('rootNote').value,
    links: collectLinks(),
  });
  closeRootEdit();
  await loadRoots();
}

// ── 移动端抽屉 ──
function toggleDrawer() {
  document.body.classList.toggle('drawer-open');
}
function closeDrawer() {
  document.body.classList.remove('drawer-open');
}

// ── 目录选择器 ──
const Picker = { path: '', searchTimer: null, onPick: null };

function openPicker(onPick) {
  Picker.onPick = onPick || null; // 传入回调=仅回填路径（工作台选目录），否则=添加根目录
  $('pickerOverlay').hidden = false;
  $('pickerSearch').value = '';
  navigatePicker('');
}
function closePicker() {
  $('pickerOverlay').hidden = true;
}

async function navigatePicker(target) {
  let listing;
  try {
    listing = await api('/api/fs/list?path=' + encodeURIComponent(target || ''));
  } catch (e) {
    alert(e.message);
    return;
  }
  Picker.path = listing.path;
  $('pickerPath').value = listing.path;
  $('pickerName').value = basename(listing.path);
  renderDrives(listing.drives);
  renderDirRows(listing.dirs, false);
}

function renderDrives(drives) {
  const box = $('pickerDrives');
  box.innerHTML = '';
  (drives || []).forEach((d) => {
    const b = document.createElement('button');
    b.textContent = d.name;
    b.addEventListener('click', () => navigatePicker(d.path));
    box.appendChild(b);
  });
}

function renderDirRows(dirs, isSearch) {
  const list = $('pickerList');
  list.innerHTML = '';
  if (!dirs || dirs.length === 0) {
    list.innerHTML = `<div class="picker-empty">${isSearch ? T('noResults') : T('emptyDir')}</div>`;
    return;
  }
  dirs.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'dir-row';
    row.innerHTML = `<span class="ico">📁</span><span class="nm">${escapeHtml(d.name)}</span>${isSearch ? `<span class="sub">${escapeHtml(d.path)}</span>` : ''}`;
    row.addEventListener('click', () => {
      $('pickerSearch').value = '';
      navigatePicker(d.path);
    });
    list.appendChild(row);
  });
}

// 在当前目录下新建文件夹，成功后进入其中（显示名自动填为新目录名）
async function createDirInPicker() {
  const parent = Picker.path;
  if (!parent) return;
  const name = (prompt(T('newFolderPrompt') + '\n' + parent, '') || '').trim();
  if (!name) return;
  try {
    const dir = await api('/api/fs/mkdir', { parent, name });
    $('pickerSearch').value = '';
    await navigatePicker(dir.path);
  } catch (e) {
    alert(e.message);
  }
}

function isAbsolutePath(s) {
  return /^[A-Za-z]:[\\/]?/.test(s) || /^[\\/]/.test(s);
}

// 列目录，成功返回 data，失败返回 null（不弹错）
async function fsListSafe(target) {
  try {
    return await api('/api/fs/list?path=' + encodeURIComponent(target));
  } catch {
    return null;
  }
}

function onPickerSearch() {
  clearTimeout(Picker.searchTimer);
  const q = $('pickerSearch').value.trim();
  if (!q) {
    navigatePicker(Picker.path);
    return;
  }
  Picker.searchTimer = setTimeout(() => runPickerSearch(q), 300);
}

async function runPickerSearch(q) {
  // 1) 输入的是绝对路径 → 直接当作路径处理
  if (isAbsolutePath(q)) {
    const normalized = /^[A-Za-z]:$/.test(q) ? q + '\\' : q;
    // 1a) 完整存在的目录：进入它
    const listing = await fsListSafe(normalized);
    if (listing) {
      Picker.path = listing.path;
      $('pickerPath').value = listing.path;
      $('pickerName').value = basename(listing.path);
      renderDrives(listing.drives);
      renderDirRows(listing.dirs, false);
      return;
    }
    // 1b) 部分路径：列出父目录并按末段过滤（如 C:\proj → 列 C:\ 过滤含 proj）
    const parent = parentPath(normalized);
    const seg = basename(normalized).toLowerCase();
    const parentListing = await fsListSafe(parent);
    if (parentListing) {
      const matched = parentListing.dirs.filter((d) => d.name.toLowerCase().includes(seg));
      renderDirRows(matched, true);
    } else {
      renderDirRows([], true);
    }
    return;
  }
  // 2) 普通关键词 → 在当前目录下递归搜索文件夹名
  try {
    const dirs = await api(
      '/api/fs/search?base=' + encodeURIComponent(Picker.path) + '&q=' + encodeURIComponent(q),
    );
    renderDirRows(dirs, true);
  } catch {
    /* 忽略搜索中的瞬时错误 */
  }
}

async function confirmPickDir() {
  const path = Picker.path;
  const name = $('pickerName').value.trim() || basename(path);
  // 工作台模式：借用同一目录选择器为「新建会话选目录」回填路径，不新增根目录
  if (Picker.onPick) {
    const cb = Picker.onPick;
    Picker.onPick = null;
    closePicker();
    cb(path);
    return;
  }
  try {
    const root = await api('/api/root/add', { name, path });
    setTabRootId(root.id);
    closePicker();
    await loadRoots();
  } catch (e) {
    alert(e.message);
  }
}

function basename(p) {
  if (!p) return '';
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function parentPath(p) {
  if (!p) return '';
  const trimmed = p.replace(/[\\/]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (idx <= 0) return trimmed; // 已到盘符/根
  let parent = trimmed.slice(0, idx);
  if (/^[A-Za-z]:$/.test(parent)) parent += '\\'; // Windows 盘符根补反斜杠
  return parent || '/';
}

function addRoot() {
  // 引导：选择已有目录 / 新建项目（见 rootwizard.js）；随后按需引导选模板
  openAddRootGuide();
}

async function removeRoot() {
  if (!State.rootId) return;
  if (!confirm(T('confirmRemoveRoot'))) return;
  await api('/api/root/remove', { id: State.rootId });
  setTabRootId('');
  await loadRoots();
}

// 文案内 {n} 占位替换
function Tn(key, n) {
  return T(key).replace('{n}', n);
}

// ── 根目录批量管理弹窗 ──
function openRootManage() {
  State.selectedRoots = new Set();
  $('rootManageOverlay').hidden = false;
  renderRootManage();
}
function closeRootManage() {
  $('rootManageOverlay').hidden = true;
}
function renderRootManage() {
  const list = $('rootManageList');
  const roots = sortedRoots();
  if (roots.length === 0) {
    list.innerHTML = `<div class="empty">${T('noRoots')}</div>`;
  } else {
    list.innerHTML = '';
    roots.forEach((r) => {
      const row = document.createElement('label');
      row.className = 'rm-item' + (State.selectedRoots.has(r.id) ? ' selected' : '');
      row.innerHTML = `<input type="checkbox" ${State.selectedRoots.has(r.id) ? 'checked' : ''} />
        <span class="rm-name">${escapeHtml(r.name)}</span>
        <span class="rm-path">${escapeHtml(r.path)}</span>`;
      row.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) State.selectedRoots.add(r.id);
        else State.selectedRoots.delete(r.id);
        row.classList.toggle('selected', e.target.checked);
        refreshRootManageBar();
      });
      list.appendChild(row);
    });
  }
  refreshRootManageBar();
}
function refreshRootManageBar() {
  const n = State.selectedRoots.size;
  const total = State.roots.length;
  $('rmCount').textContent = Tn('selectedCount', n);
  $('rmAllChk').checked = total > 0 && n === total;
  const btn = $('rootManageDelete');
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? Tn('deleteSelected', n) + ` (${n})` : T('deleteSelected');
}
function toggleRootManageAll(checked) {
  State.selectedRoots = checked ? new Set(State.roots.map((r) => r.id)) : new Set();
  renderRootManage();
}
async function deleteSelectedRoots() {
  const ids = [...State.selectedRoots];
  if (ids.length === 0) return;
  if (!confirm(Tn('confirmRemoveRoots', ids.length))) return;
  await api('/api/root/remove-batch', { ids });
  // 若当前根被删则清空选择
  if (State.selectedRoots.has(State.rootId)) setTabRootId('');
  State.selectedRoots = new Set();
  closeRootManage();
  await loadRoots();
}

// ── 会话批量选择 / 批量删除 ──
function toggleBatchMode(on) {
  State.batchMode = on === undefined ? !State.batchMode : !!on;
  State.selectedSessions = new Set();
  document.body.classList.toggle('batch-mode', State.batchMode);
  $('batchToggleBtn').classList.toggle('on', State.batchMode);
  $('batchBar').hidden = !State.batchMode;
  renderSessions();
  if (State.batchMode) refreshBatchBar();
}
function toggleSessionSelected(id, checked) {
  if (checked) State.selectedSessions.add(id);
  else State.selectedSessions.delete(id);
  refreshBatchBar();
  renderSessions();
}
// 当前列表实际可见（经筛选/搜索后）的会话 id，供全选/计数使用
function visibleSessionIds() {
  return [...document.querySelectorAll('#sessionList .session-item[data-sid]')].map(
    (el) => el.dataset.sid,
  );
}
function refreshBatchBar() {
  const n = State.selectedSessions.size;
  $('batchCount').textContent = Tn('selectedCount', n);
  const vis = visibleSessionIds();
  $('batchAllChk').checked = vis.length > 0 && vis.every((id) => State.selectedSessions.has(id));
  const act = $('batchActBtn');
  act.disabled = n === 0;
  act.textContent = n > 0 ? `${T('batchActions')} (${n}) ▾` : `${T('batchActions')} ▾`;
  if (n === 0) closeBatchMenu();
}
// 批量操作下拉菜单
function toggleBatchMenu(on) {
  const menu = $('batchMenu');
  const open = on === undefined ? menu.hidden : !!on;
  menu.hidden = !open;
  $('batchActBtn').classList.toggle('on', open);
}
function closeBatchMenu() { toggleBatchMenu(false); }
// 批量标记状态：活跃 / 待测试 / 已完成
async function markSelectedSessions(status) {
  const ids = [...State.selectedSessions];
  closeBatchMenu();
  if (ids.length === 0) return;
  for (const id of ids) await api('/api/session/status', { id, status });
  toggleBatchMode(false);
  await loadSessions();
}
function toggleBatchAll(checked) {
  const vis = visibleSessionIds();
  if (checked) vis.forEach((id) => State.selectedSessions.add(id));
  else vis.forEach((id) => State.selectedSessions.delete(id));
  refreshBatchBar();
  renderSessions();
}
async function deleteSelectedSessions() {
  const ids = [...State.selectedSessions];
  closeBatchMenu();
  if (ids.length === 0) return;
  if (!confirm(Tn('confirmRemoveSessions', ids.length))) return;
  await api('/api/session/remove-batch', { ids });
  if (State.selectedSessions.has(State.sessionId)) {
    State.sessionId = '';
    State.session = null;
  }
  toggleBatchMode(false);
  await loadSessions();
}

// ── 会话（仅显示当前根目录关联的会话） ──
async function loadSessions() {
  const list = $('sessionList');
  if (!isWorkspace() && State.favoritesOnly) {
    State.sessions = await loadFavoriteSessions();
    rebuildRunning();
    renderSessions();
    if (!State.sessions.find((s) => s.id === State.sessionId)) {
      await selectSession(State.sessions[0]?.id || null);
    }
    return;
  }
  if (isWorkspace()) {
    // 工作台模式：跨全部目录合并会话，不依赖左上角根目录选择
    State.sessions = await api('/api/session/list-all');
    rebuildRunning();
    renderSessions();
    if (!State.sessions.find((s) => s.id === State.sessionId)) {
      selectSession(State.sessions[0]?.id || null);
    }
    return;
  }
  if (!State.rootId) {
    State.sessions = [];
    list.innerHTML = `<div class="empty">${T('selectRootFirst')}</div>`;
    selectSession(null);
    return;
  }
  State.sessions = await api('/api/session/list?rootId=' + encodeURIComponent(State.rootId));
  // 依据各会话任务队列重建"执行中"集合（WS 事件后续增量更新）
  rebuildRunning();
  renderSessions();
  if (!State.sessions.find((s) => s.id === State.sessionId)) {
    selectSession(State.sessions[0]?.id || null);
  }
}

// 会话标题：取第一条消息（优先用户消息）首句作为标题，没有消息则回退到 name
function sessionTitle(s) {
  if (!s) return '';
  if (s.customTitle && s.customTitle.trim()) return s.customTitle.trim();
  const msgs = s.messages || [];
  const first = msgs.find((m) => m.role === 'user') || msgs[0];
  const text = first && first.text ? first.text.trim().replace(/\s+/g, ' ') : '';
  if (text) return text.slice(0, 60);
  // 无消息：若是默认的 "Session …" 名则显示更友好的占位
  if (!s.name || /^Session\s/.test(s.name)) return T('untitledSession');
  return s.name;
}

// 会话来源徽章：手动 / SDK / 空。返回带样式的 <span>，未知来源不显示。
function sourceBadge(source) {
  const map = {
    typed: { txt: T('srcTyped'), cls: 'src-typed' },
    sdk: { txt: T('srcSdk'), cls: 'src-sdk' },
    empty: { txt: T('srcEmpty'), cls: 'src-empty' },
  };
  const b = map[source];
  if (!b) return '';
  return `<span class="src-badge ${b.cls}">${escapeHtml(b.txt)}</span>`;
}

function fmtSessionListTime(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const sameYear = d.getFullYear() === now.getFullYear();
  const sameDay = sameYear && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (sameYear) return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 列表项的正文：正文不再随列表下发（以 claude 原生为准）；仅当前打开的会话已加载正文，
// 全文搜索因此只覆盖"当前打开的会话"，其余会话需打开后才可全文搜索（标题搜索不受影响）。
function sessionMessages(s) {
  if (s.id === State.sessionId && State.session) return State.session.messages || [];
  return s.messages || [];
}

// 全文搜索时返回首个命中消息的上下文片段（无命中返回 null）
function matchSnippet(s, q) {
  for (const m of sessionMessages(s)) {
    const body = (m.text || '').toLowerCase();
    const idx = body.indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 20);
      const raw = m.text.slice(start, idx + q.length + 30).replace(/\s+/g, ' ');
      return (start > 0 ? '…' : '') + raw + (idx + q.length + 30 < m.text.length ? '…' : '');
    }
  }
  return null;
}

// 依据会话列表（后端为准）重建"执行中"集合与每会话的运行任务 id 集，后续由 WS 任务事件增量更新
function rebuildRunning() {
  State.runningTasks = new Map();
  for (const s of State.sessions) {
    const ids = (s.tasks || []).filter((t) => t.status === 'running').map((t) => t.id);
    if (ids.length) State.runningTasks.set(s.id, new Set(ids));
  }
  State.running = new Set(State.runningTasks.keys());
}
// 依据一条任务事件更新"执行中"集合（running→加入；该任务结束→移除）
// ⚠ 必须按任务 id 记账：一个会话在跑的同时还能追加排队消息，而排队会广播 status='pending' 的任务事件。
//   早期实现"只要来了非 running 事件就清掉执行中"，导致每追加一条消息，侧栏"执行中"就消失（还会误标"刚执行"）。
// 结束瞬间若用户当前未打开该会话，标记 justFinished（侧栏"刚执行"），待用户点开该会话后清除
function updateRunningFromTask(sessionId, task) {
  if (!sessionId || !task) return;
  const before = State.running.has(sessionId);
  let ids = State.runningTasks.get(sessionId);
  if (task.status === 'running') {
    if (!ids) State.runningTasks.set(sessionId, (ids = new Set()));
    ids.add(task.id);
  } else if (ids) {
    // 只有"这条正在跑的任务"结束才算跑完；pending/held 等其它任务的事件与执行中标识无关
    ids.delete(task.id);
    if (ids.size === 0) State.runningTasks.delete(sessionId);
  }
  const after = State.runningTasks.has(sessionId);
  let reordered = false;
  if (after) {
    State.running.add(sessionId);
    State.justFinished.delete(sessionId);
  } else {
    State.running.delete(sessionId);
    if (before && sessionId !== State.sessionId) State.justFinished.add(sessionId);
  }
  if (task.status === 'running') {
    // 开始执行即把该会话的更新时间顶到最新，让它在列表里浮到最上面
    // （与后端 _markRunning 落库的 updatedAt 保持一致；否则前端缓存的旧时间不会重排）
    reordered = bumpSessionUpdatedAt(sessionId, task.startedAt || Date.now());
  }
  if (reordered || after !== before) renderSessions();
}

// 把某会话的 updatedAt 顶到给定时间并就地重排会话列表（含收藏夹列表）。返回是否命中该会话。
// 用于「开始执行的会话立即浮到列表最上面」：仅改前端缓存排序，不发请求（后端已在 _markRunning 落库同一时间）。
function bumpSessionUpdatedAt(sessionId, ts) {
  let hit = false;
  const apply = (arr) => {
    if (!Array.isArray(arr)) return arr;
    const s = arr.find((x) => x.id === sessionId);
    if (!s) return arr;
    if ((s.updatedAt || 0) < ts) s.updatedAt = ts;
    hit = true;
    return sortSessionsForList(arr);
  };
  const favAliased = State.sessions === State.favoriteSessions;
  State.favoriteSessions = apply(State.favoriteSessions);
  if (favAliased) State.sessions = State.favoriteSessions;
  else State.sessions = apply(State.sessions);
  return hit;
}

function sortSessionsForList(sessions) {
  return sessions.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

async function refreshFavoriteSessions(renderAfter = false) {
  if (isWorkspace()) return;
  try {
    await loadFavoriteSessions();
    if (State.favoritesOnly) {
      State.sessions = State.favoriteSessions;
      rebuildRunning();
      if (renderAfter) renderSessions();
    }
  } catch {
    /* 收藏夹后台刷新失败时保留当前缓存 */
  }
}

async function loadFavoriteSessions() {
  const drafts = State.favoriteSessions.filter((s) => isFavoriteDraftId(s.id));
  const sessions = await api('/api/session/list-favorites');
  State.favoriteSessions = sortSessionsForList([...drafts, ...sessions]);
  State.favoriteCacheReady = true;
  // 恢复的目录筛选可能已无对应收藏（取消收藏/删目录）→ 自动失效，避免列表看起来空
  if (FavDir.rootId && !State.favoriteSessions.some((s) => s.rootId === FavDir.rootId)) setFavDir('');
  return State.favoriteSessions;
}

// hits：后端全文搜索命中集（id→片段）。前端只加载当前会话正文，其余会话的全文命中全靠后端。
const Search = { open: false, query: '', advanced: false, hits: new Map(), reqSeq: 0, timer: null };

function toggleSearch() {
  Search.open = !Search.open;
  $('searchBar').hidden = !Search.open;
  if (Search.open) {
    updateSearchClear();
    setTimeout(() => $('sessionSearch').focus(), 30);
  } else {
    Search.query = '';
    Search.hits = new Map();
    $('sessionSearch').value = '';
    updateSearchClear();
    renderSessions();
  }
}

// 全文搜索走后端（跨会话读 jsonl）。300ms 防抖 + 序号防竞态；非全文/空词即清空命中集。
function scheduleFullTextSearch() {
  if (Search.timer) clearTimeout(Search.timer);
  Search.timer = null;
  if (!Search.advanced || !Search.query) {
    Search.hits = new Map();
    return;
  }
  Search.timer = setTimeout(runFullTextSearch, 300);
}
async function runFullTextSearch() {
  const q = Search.query;
  if (!Search.advanced || !q) {
    Search.hits = new Map();
    return;
  }
  const seq = ++Search.reqSeq;
  try {
    let url = '/api/session/search?q=' + encodeURIComponent(q);
    // 经典单目录模式限定当前根目录；工作台/收藏夹跨目录则不限定，交由列表成员集自然收敛
    if (!isWorkspace() && !State.favoritesOnly && State.rootId)
      url += '&rootId=' + encodeURIComponent(State.rootId);
    const hits = await api(url);
    if (seq !== Search.reqSeq) return; // 丢弃过期响应
    const map = new Map();
    for (const h of hits) map.set(h.id, h.snippet || '');
    Search.hits = map;
    renderSessions();
  } catch {
    if (seq === Search.reqSeq) {
      Search.hits = new Map();
      renderSessions();
    }
  }
}
function updateSearchClear() {
  $('sessionSearchClear').hidden = !$('sessionSearch').value;
}
function onSearchInput() {
  Search.query = $('sessionSearch').value.trim().toLowerCase();
  updateSearchClear();
  scheduleFullTextSearch();
  renderSessions();
}
function resetSessionSearch(focus = false) {
  $('sessionSearch').value = '';
  onSearchInput();
  if (focus) $('sessionSearch').focus();
}
function clearSessionSearch() {
  resetSessionSearch(true);
}
function onAdvToggle() {
  Search.advanced = $('advSearch').checked;
  scheduleFullTextSearch();
  renderSessions();
}

async function toggleFavorites() {
  setFavoritesOnly(!State.favoritesOnly);
  setFavDir('');
  if (State.favoritesOnly) {
    State.sessions = await loadFavoriteSessions();
    rebuildRunning();
    renderSessions();
    if (!State.sessions.find((s) => s.id === State.sessionId)) {
      await selectSession(State.sessions[0]?.id || null);
    }
    return;
  }
  await loadSessions();
}

function syncFavoritesButton() {
  const btn = $('favoritesToggleBtn');
  if (!btn) return;
  document.body.classList.toggle('favorites-only', State.favoritesOnly);
  btn.classList.toggle('active', State.favoritesOnly);
  btn.textContent = State.favoritesOnly ? '←' : '☆';
  btn.title = State.favoritesOnly ? T('backToSessions') : T('favoritesFolder');
  $('sessionsLabel').textContent = State.favoritesOnly ? T('favoritesFolder') : T('sessions');
  refreshNewSessionButton();
  renderWorkdirBar();
}

function refreshNewSessionButton() {
  const btn = $('newSessionBtn');
  if (!btn) return;
  btn.textContent = T('newSession');
}

// ── 收藏夹目录筛选（纯前端，不走后端） ──
const FavDir = { rootId: sessionStorage.getItem('favDirRootId') || '' };

// 目录筛选同样持久化：刷新后仍停在原来那个目录下
function setFavDir(rootId) {
  FavDir.rootId = rootId || '';
  if (FavDir.rootId) sessionStorage.setItem('favDirRootId', FavDir.rootId);
  else sessionStorage.removeItem('favDirRootId');
}

// 收藏会话涉及的根目录（去重 + 计数），按会话数倒序
function favDirOptions() {
  const map = new Map();
  State.sessions.forEach((s) => {
    if (!s.rootId) return;
    const cur = map.get(s.rootId) || { rootId: s.rootId, name: rootName(s.rootId) || s.rootId, count: 0 };
    cur.count += 1;
    map.set(s.rootId, cur);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// 收藏夹里当前筛选中的目录（校验它还活着）：新建会话时直接拿来当工作目录
function favFilterRootId() {
  if (!FavDir.rootId) return '';
  return State.roots.some((r) => r.id === FavDir.rootId) ? FavDir.rootId : '';
}

function pickFavDir(rootId) {
  setFavDir(FavDir.rootId === rootId ? '' : rootId);
  renderSessions();
  // 切到某个目录时顺手打开该目录下最顶端的会话（取消筛选时不动当前会话）
  if (FavDir.rootId) selectTopVisibleSession();
}

// 打开会话列表里第一条（已按当前筛选/排序渲染完毕）。批量模式下不动，避免误勾选。
function selectTopVisibleSession() {
  if (State.batchMode) return;
  const top = $('sessionList').querySelector('.session-item');
  const sid = top && top.dataset.sid;
  if (!sid || sid === State.sessionId) return;
  selectSession(sid);
}

function clearFavDir() {
  setFavDir('');
  renderSessions();
}

// 收藏夹里目录标签行常驻显示（不折叠、无开关）：进来就能看到所有目录
function renderFavDirFilter() {
  const box = $('favDirFilter');
  if (!box) return;
  const opts = State.favoritesOnly && !isWorkspace() ? favDirOptions() : [];
  box.hidden = opts.length === 0; // 不在收藏夹 / 收藏里没有带目录的会话时整行收掉
  if (opts.length === 0) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = opts
    .map((o) => `<button class="fdf-tag${o.rootId === FavDir.rootId ? ' active' : ''}" data-fdf="${escapeHtml(o.rootId)}" title="${escapeHtml(o.name)}">${escapeHtml(o.name)}<i>${o.count}</i></button>`)
    .join('')
    + (FavDir.rootId ? `<button class="fdf-clear" id="fdfClear" title="${escapeHtml(T('clearFilter'))}">✕</button>` : '');
  box.querySelectorAll('.fdf-tag').forEach((el) => {
    el.addEventListener('click', () => pickFavDir(el.dataset.fdf));
  });
  const clr = box.querySelector('#fdfClear');
  if (clr) clr.addEventListener('click', clearFavDir);
}

// tab 切换：active(未完成) / completed(已完成) / all(全部)
function switchTab(tab) {
  State.tab = tab;
  document.querySelectorAll('.s-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  renderSessions();
}

const RUN_TAB_LABELS = { all: 'runTabAll', running: 'runTabRunning', justFinished: 'runTabJustFinished' };

// 单个会话是否命中已勾选的运行状态（多选取并集）；「刚执行」=已停止且用户还没点开看过
function matchRunFilters(s) {
  const running = State.running.has(s.id);
  if (State.runFilters.has('running') && running) return true;
  // 已点开过的（justFinishedSeen）本轮仍留在列表里：点击不应让会话当场消失，等用户切走筛选再清掉
  if (State.runFilters.has('justFinished') && !running && (State.justFinished.has(s.id) || State.justFinishedSeen.has(s.id))) return true;
  return false;
}

// 运行状态筛选下的空列表文案：单选给专属文案，两个都勾给合并文案
function runFilterEmptyKey() {
  if (State.runFilters.size === 0) return '';
  if (State.runFilters.size > 1) return 'noRunOrFinishedSessions';
  return State.runFilters.has('running') ? 'noRunningSessions' : 'noJustFinishedSessions';
}

// 运行状态筛选：running(执行中) / justFinished(刚执行) 可同时勾选（并集），点「所有」清空互斥
function toggleRunFilter(key) {
  if (key === 'all') State.runFilters.clear();
  else if (State.runFilters.has(key)) State.runFilters.delete(key);
  else State.runFilters.add(key);
  State.justFinishedSeen.clear(); // 切换筛选=开启新一轮：上一轮点开过的会话到这时才真正移出「刚执行完」
  syncRunTabs();
  renderSessions();
}

// 刷新运行状态筛选按钮：勾中的加 ✓ 前缀；空集时高亮「所有」
function syncRunTabs() {
  const isAll = State.runFilters.size === 0;
  document.querySelectorAll('.r-tab').forEach((b) => {
    const key = b.dataset.runtab;
    const on = key === 'all' ? isAll : State.runFilters.has(key);
    b.classList.toggle('active', on);
    b.textContent = (on && key !== 'all' ? '✓ ' : '') + T(RUN_TAB_LABELS[key] || 'runTabAll');
  });
}

function renderSessions() {
  const list = $('sessionList');
  syncFavoritesButton();
  renderFavDirFilter();
  if (State.sessions.length === 0) {
    list.innerHTML = `<div class="empty">${T(State.favoritesOnly ? 'noFavoriteSessions' : 'noSessions')}</div>`;
    return;
  }
  const q = Search.query;
  let sessions = State.sessions;
  // 收藏夹内的目录筛选：纯前端即时过滤
  if (State.favoritesOnly && FavDir.rootId) sessions = sessions.filter((s) => s.rootId === FavDir.rootId);
  if (State.tab !== 'all') sessions = sessions.filter((s) => (s.status || 'active') === State.tab);
  // 运行状态筛选：执行中 / 刚执行（已停止且用户还没点开看过）——多选时取并集；空集不过滤
  if (State.runFilters.size) sessions = sessions.filter(matchRunFilters);
  if (q) {
    sessions = sessions.filter((s) => {
      if (sessionTitle(s).toLowerCase().includes(q)) return true;
      if (Search.advanced) {
        if (Search.hits.has(s.id)) return true; // 后端全文命中（覆盖全部会话）
        // 当前打开会话正文已在本地，即时命中（不必等后端）
        return sessionMessages(s).some((m) => (m.text || '').toLowerCase().includes(q));
      }
      return false;
    });
  }
  if (sessions.length === 0) {
    const emptyKeyByTab = { active: 'noActiveSessions', testing: 'noTestingSessions', completed: 'noCompletedSessions' };
    const emptyKey = q ? 'noSearchResults'
      : (runFilterEmptyKey() || emptyKeyByTab[State.tab] || 'noSessions');
    list.innerHTML = `<div class="empty">${T(emptyKey)}</div>`;
    return;
  }
  list.innerHTML = '';
  sessions.forEach((s) => {
    const div = document.createElement('div');
    const status = s.status || 'active';
    const isSel = State.batchMode && State.selectedSessions.has(s.id);
    div.dataset.sid = s.id;
    div.className = 'session-item'
      + (s.id === State.sessionId ? ' active' : '')
      + (s.pinned ? ' pinned' : '')
      + (s.favorite ? ' favorite' : '')
      + (status === 'completed' ? ' completed' : '')
      + (isSel ? ' selected' : '');
    const title = sessionTitle(s);
    let snippet = '';
    if (q && Search.advanced && !title.toLowerCase().includes(q)) {
      // 当前打开会话用本地即时片段；其余会话用后端返回的片段
      const snip = matchSnippet(s, q) || Search.hits.get(s.id) || '';
      if (snip) snippet = `<div class="snippet">${escapeHtml(snip)}</div>`;
    }
    // 执行中标识：会话有任务在跑时显示脉冲圆点 + "执行中"，结束后自动消失
    const runTag = State.running.has(s.id)
      ? `<span class="run-tag"><span class="run-dot"></span>${escapeHtml(T('runningTag'))}</span>`
      : '';
    // 刚执行待查看：刚停止执行、用户还没点开看过，用醒目色标提醒
    const justFinishedTag = (!State.running.has(s.id) && State.justFinished.has(s.id))
      ? `<span class="just-finished-tag">${escapeHtml(T('justFinishedTag'))}</span>`
      : '';
    const pinTag = s.pinned ? `<span class="pin-tag">📌 ${escapeHtml(T('pinnedTag'))}</span>` : '';
    const doneTag = status === 'completed' ? `<span class="done-tag">✓ ${escapeHtml(T('tabCompleted'))}</span>` : '';
    const testingTag = status === 'testing' ? `<span class="testing-tag">🧪 ${escapeHtml(T('testingTag'))}</span>` : '';
    // 引擎徽章（claude / codex）
    const favoriteTag = s.favorite && !State.favoritesOnly ? `<span class="favorite-tag">★ ${escapeHtml(T('favoriteTag'))}</span>` : '';
    const engBadge = `<span class="eng-badge eng-${s.engine === 'codex' ? 'codex' : 'claude'}" title="${escapeHtml(engineLabel(s.engine))}">${escapeHtml(engineShortLabel(s.engine))}</span>`;
    // 工作台模式：显示会话所属目录（根目录末段名）
    const dirNm = (isWorkspace() || State.favoritesOnly) ? rootName(s.rootId) : '';
    const dirBadgeClass = State.favoritesOnly ? 'dir-badge favorite-dir-badge' : 'dir-badge';
    const dirBadge = dirNm ? `<span class="${dirBadgeClass}" title="${escapeHtml(dirNm)}">📁 ${escapeHtml(dirNm)}</span>` : '';
    const updatedTime = fmtSessionListTime(s.updatedAt);
    // 会话来源标记：手动(typed) / SDK 脚本(sdk) / 空会话(empty)
    // 最近一条用户消息（与标题不同才显示，避免只有一条消息时重复）
    const last = (s.lastUser || '').trim();
    const lastLine = last && last.slice(0, 60) !== title
      ? `<div class="last-user"><div class="lu-text">${escapeHtml(last)}</div></div>`
      : '';
    const checkbox = State.batchMode
      ? `<label class="si-check"><input type="checkbox" ${isSel ? 'checked' : ''} /></label>`
      : '';
    div.innerHTML = `${checkbox}<div class="si-main">
        <div class="name">${escapeHtml(title)}</div>
        ${lastLine}
        <div class="meta">
          <span class="meta-tags">${dirBadge}${favoriteTag}${pinTag}${doneTag}${testingTag}${runTag}${justFinishedTag}${engBadge}</span>
          <span class="meta-time">${escapeHtml(updatedTime)}</span>
        </div>
        ${snippet}
      </div>
      <div class="si-actions">
        <span class="del" data-del="${s.id}">✕</span>
        ${s.claudeSessionId ? `<button class="copy-id" title="${T('copySessionId')}">⧉</button>` : ''}
      </div>`;
    // 批量模式：点击整行=切换选中；否则=打开会话
    if (State.batchMode) {
      const cb = div.querySelector('.si-check input');
      div.addEventListener('click', (e) => {
        if (e.target !== cb) cb.checked = !cb.checked;
        toggleSessionSelected(s.id, cb.checked);
      });
    } else {
      div.addEventListener('click', (e) => {
        if (e.target.dataset.del || e.target.classList.contains('copy-id')) return;
        selectSession(s.id);
      });
    }
    const cidBtn = div.querySelector('.copy-id');
    if (cidBtn) cidBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyText(s.claudeSessionId, e.currentTarget, '⧉');
    });
    div.querySelector('.del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(T('confirmRemoveSession'))) return;
      await api('/api/session/remove', { id: s.id });
      if (State.sessionId === s.id) State.sessionId = '';
      await loadSessions();
    });
    // 右键（桌面）/ 长按（移动端）弹出菜单：标记完成 / 置顶
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openSessionCtxMenu(s, e.clientX, e.clientY);
    });
    bindLongPress(div, (e) => {
      const t = e.touches ? e.touches[0] : e;
      openSessionCtxMenu(s, t.clientX, t.clientY);
    });
    list.appendChild(div);
  });
  if (State.batchMode) refreshBatchBar();
}

// 长按识别（触屏）：按住 500ms 且移动距离 < 10px 视为长按
function bindLongPress(el, onLongPress) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    clear();
    timer = setTimeout(() => { timer = null; onLongPress(e); }, 500);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) clear();
  }, { passive: true });
  el.addEventListener('touchend', clear);
  el.addEventListener('touchcancel', clear);
}

// 会话操作右键/长按菜单：标记状态（活跃/待测试/已完成，任意互切）/ 置顶（置顶最多 3 个，超出淘汰最早）
let ctxSession = null;
function openSessionCtxMenu(session, x, y) {
  ctxSession = session;
  const menu = $('sessionCtxMenu');
  const status = session.status || 'active';
  document.querySelectorAll('.ctx-status').forEach((b) => {
    b.classList.toggle('current', b.dataset.status === status);
  });
  $('ctxToggleFavorite').textContent = session.favorite ? T('unfavoriteSession') : T('favoriteSession');
  $('ctxTogglePinned').textContent = session.pinned ? T('unpinSession') : T('pinSession');
  // 「打开工作目录」是服务器本机行为：只有本机跑在 Windows 上、且这个会话确实有根目录时才给
  $('ctxOpenWorkdir').hidden = State.settings.platform !== 'win32' || !session.rootId;
  menu.hidden = false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = 180;
  const mh = 280;
  menu.style.left = Math.min(x, vw - mw - 8) + 'px';
  menu.style.top = Math.min(y, vh - mh - 8) + 'px';
}
function closeSessionCtxMenu() {
  $('sessionCtxMenu').hidden = true;
  ctxSession = null;
}
function applySessionCustomTitle(id, customTitle) {
  State.sessions = State.sessions.map((x) => (x.id === id ? { ...x, customTitle } : x));
  State.favoriteSessions = State.favoriteSessions.map((x) => (x.id === id ? { ...x, customTitle } : x));
  if (State.sessionId === id && State.session) {
    State.session.customTitle = customTitle;
    $('sessionTitle').textContent = sessionTitle(State.session);
  }
  renderSessions();
}
async function ctxRenameTitle() {
  if (!ctxSession) return;
  const s = ctxSession;
  closeSessionCtxMenu();
  const next = prompt(T('renameSessionPrompt'), s.customTitle || sessionTitle(s));
  if (next === null) return;
  const customTitle = next.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (isFavoriteDraftId(s.id)) {
    applySessionCustomTitle(s.id, customTitle);
    return;
  }
  const previousTitle = s.customTitle || '';
  applySessionCustomTitle(s.id, customTitle);
  try {
    const updated = await api('/api/session/title', { id: s.id, title: customTitle });
    applySessionCustomTitle(s.id, updated.customTitle || '');
    refreshFavoriteSessions(false);
  } catch (e) {
    applySessionCustomTitle(s.id, previousTitle);
    alert(e.message || 'Rename failed');
  }
}
async function ctxSetStatus(status) {
  if (!ctxSession) return;
  const s = ctxSession;
  closeSessionCtxMenu();
  await api('/api/session/status', { id: s.id, status });
  await loadSessions();
}
// 在服务器本机的文件管理器中打开该会话的工作目录（Windows 上就是资源管理器）
async function ctxOpenWorkdir() {
  if (!ctxSession) return;
  const rootId = ctxSession.rootId;
  closeSessionCtxMenu();
  if (!rootId) return;
  try {
    await api('/api/root/open', { rootId });
  } catch (e) {
    alert(e.message || 'Open folder failed');
  }
}
function ctxOpenStats() {
  if (!ctxSession) return;
  const s = ctxSession;
  closeSessionCtxMenu();
  openSessionStats(s.id, sessionTitle(s));
}
async function ctxTogglePinned() {
  if (!ctxSession) return;
  const s = ctxSession;
  const willPin = !s.pinned;
  closeSessionCtxMenu();
  if (willPin) {
    const pinnedCount = State.sessions.filter((x) => x.pinned && x.id !== s.id).length;
    if (pinnedCount >= 3) alert(T('pinLimitReached'));
  }
  await api('/api/session/pin', { id: s.id, pinned: willPin });
  await loadSessions();
}

async function ctxToggleFavorite() {
  if (!ctxSession) return;
  const s = ctxSession;
  const favorite = !s.favorite;
  closeSessionCtxMenu();
  State.sessions = State.sessions.map((x) => (x.id === s.id ? { ...x, favorite } : x));
  if (favorite) {
    const next = { ...s, favorite };
    State.favoriteSessions = sortSessionsForList([
      ...State.favoriteSessions.filter((x) => x.id !== s.id),
      next,
    ]);
  } else {
    State.favoriteSessions = State.favoriteSessions.filter((x) => x.id !== s.id);
  }
  renderSessions();
  await api('/api/session/favorite', { id: s.id, favorite });
  await loadSessions();
  refreshFavoriteSessions(false);
}

async function newSession() {
  resetSessionSearch(false);
  if (State.favoritesOnly) {
    // 收藏夹里已按目录筛选 → 新会话直接用该目录，不再让用户重选；没筛选才留空等用户选
    const favRoot = favFilterRootId();
    const cur = State.session;
    // 与主列表同规则：当前就是该目录下一个空的新会话时直接复用，不重复建
    if (favRoot && cur && cur.rootId === favRoot && !cur.claudeSessionId && (cur.tasks || []).length === 0) {
      selectSession(cur.id);
      $('taskInput').focus();
      return;
    }
    createFavoriteDraftSession();
    if (favRoot) await bindFavoriteDraftRoot(favRoot);
    return;
  }
  // 工作台模式：先选择工作目录（近期用过的 / 手动添加，可创建不存在的目录）
  if (isWorkspace()) {
    openWsDir();
    return;
  }
  if (!State.rootId) {
    alert(T('selectRootFirst'));
    return;
  }
  // 当前已是空的新会话（未发起、无任务）则不再重复创建，直接复用并聚焦输入框
  const cur = State.session;
  if (cur && !cur.claudeSessionId && (cur.tasks || []).length === 0) {
    selectSession(cur.id);
    $('taskInput').focus();
    return;
  }
  const s = await api('/api/session/create', {
    rootId: State.rootId,
    name: '',
    engine: State.settings.defaultEngine,
  });
  await loadSessions();
  selectSession(s.id);
}

function isFavoriteDraftId(id) {
  return String(id || '').startsWith('favorite-draft-');
}

function createFavoriteDraftSession() {
  const now = Date.now();
  const draft = {
    id: `favorite-draft-${now}`,
    rootId: '',
    name: '',
    engine: State.settings.defaultEngine,
    claudeSessionId: '',
    paused: false,
    createdAt: now,
    updatedAt: now,
    tasks: [],
    messages: [],
    source: 'empty',
    favorite: true,
  };
  State.favoriteSessions = sortSessionsForList([
    draft,
    ...State.favoriteSessions.filter((s) => !isFavoriteDraftId(s.id)),
  ]);
  State.sessions = State.favoriteSessions;
  State.sessionId = draft.id;
  State.session = draft;
  $('processLog').innerHTML = '';
  $('sessionTitle').textContent = sessionTitle(draft);
  renderMessages();
  renderQueue();
  refreshPauseBtn();
  refreshEngineControl();
  renderSessions();
}

async function selectSession(id) {
  State.sessionId = id || '';
  // 用户点开查看，清除"刚执行"待读标识；若当前正处于「刚执行完」筛选，记入 seen 让它本轮仍留在列表里
  if (id) {
    if (State.justFinished.delete(id) && State.runFilters.has('justFinished')) State.justFinishedSeen.add(id);
  }
  renderQuick(); // 快捷前缀按会话持久化，切换会话即刷新选中态
  State.aiExpandedGroups.clear();
  State.noticeOpen = false; // 换会话 → 右下角错误浮层先收起，别把上一个会话的展开态带过来
  if (id) closeDrawer(); // 移动端：选中会话后收起抽屉
  if (!id) {
    State.session = null;
    $('sessionTitle').textContent = '—';
    renderMessages(); // 无会话 → 主区域显示上手引导，而不是一片空白
    refreshAiCollapseBtn();
    renderQueue();
    $('processLog').innerHTML = '';
    refreshPauseBtn();
    refreshEngineControl();
    renderSessions();
    return;
  }
  if (isFavoriteDraftId(id)) {
    State.session = State.favoriteSessions.find((s) => s.id === id) || State.sessions.find((s) => s.id === id) || null;
    if (!State.session) return;
    $('processLog').innerHTML = '';
    $('sessionTitle').textContent = sessionTitle(State.session);
    renderMessages();
    renderQueue();
    refreshPauseBtn();
    refreshEngineControl();
    renderSessions();
    return;
  }
  State.session = await api('/api/session/get?id=' + encodeURIComponent(id));
  // 工作台模式：同步当前会话所属根目录，让文件抽屉 / 上传 / 「前往」等按会话目录工作
  if (State.session && State.session.rootId && State.rootId !== State.session.rootId) {
    setTabRootId(State.session.rootId);
    const sel = $('rootSelect');
    if (sel) sel.value = State.rootId;
    renderWorkdirBar();
    renderRootMeta();
  }
  $('processLog').innerHTML = '';
  $('sessionTitle').textContent = sessionTitle(State.session);
  renderMessages();
  renderQueue();
  refreshPauseBtn();
  refreshEngineControl();
  renderSessions();
}

// ── 渲染：最终消息 ──
function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';
  // 没有会话可显示时给出「下一步该干什么」的引导（新用户否则面对一片空白，不知道该点哪个 ＋）
  if (!State.session) {
    box.appendChild(gettingStartedEl());
    syncTypingIndicator();
    return;
  }
  if (State.favoritesOnly && State.session && !State.session.rootId) {
    box.appendChild(favoriteDraftRootPickerEl());
  }
  // 每条 AI 消息对应的轨迹时间窗（用于「🔍 过程」内联展开）
  State.msgWindows = buildMsgWindows(State.session?.messages || []);
  const units = messageRenderUnits(State.session?.messages || []);
  units.forEach((unit) => {
    if (unit.kind === 'message') addMessageEl(unit.message);
    else if (unit.kind === 'assistantExpandedGroup') addExpandedAssistantGroupEl(unit);
    else addAssistantGroupEl(unit);
  });
  renderNotices();
  syncTypingIndicator();
  renderElapsedNotes();
  refreshAiCollapseBtn();
  applyMsgScroll(box);
}

// 展开/收起某个 AI 消息组：整块重渲染前先记下这条消息在可视区里的位置，
// 渲染后把它钉回原处 —— 用户点开就是为了看这一条，不该被推到会话底部。
let MsgRenderAnchor = null;

function toggleAssistantGroup(key, expand) {
  const box = $('messages');
  const el = findGroupEl(box, key);
  MsgRenderAnchor = el
    ? {
        key,
        top: el.getBoundingClientRect().top - box.getBoundingClientRect().top,
        height: el.offsetHeight,
        width: el.offsetWidth,
        ghost: msgToggleGhost(el),
      }
    : null;
  if (expand) State.aiExpandedGroups.add(key);
  else State.aiExpandedGroups.delete(key);
  renderMessages();
}

function findGroupEl(box, key) {
  if (!box || !key) return null;
  return Array.from(box.children).find((n) => n.dataset && n.dataset.groupKey === key) || null;
}

// 有锚点就保持位置（展开/收起），否则维持一贯的「滚到底部」（新消息、切会话等）
function applyMsgScroll(box) {
  const anchor = MsgRenderAnchor;
  MsgRenderAnchor = null;
  const el = anchor ? findGroupEl(box, anchor.key) : null;
  if (!el) {
    box.scrollTop = box.scrollHeight;
    return;
  }
  const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top - anchor.top;
  if (delta) box.scrollTop += delta;
  animateMsgToggle(el, anchor);
}

const MSG_TOGGLE_MS = 800;
// 从静止起步、到静止收住的缓动。之前那条 (.2,.7,.3,1) 起手斜率 3.5，一上来就窜出去，
// 时长拉到 800ms 后这种「先弹一下再磨蹭」的感觉尤其别扭。
const MSG_TOGGLE_EASE = 'cubic-bezier(.4, 0, .2, 1)';

function motionOk() {
  return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// 旧样子的快照。重渲染是把这一条整个换成另一个元素（折叠卡片 ⇄ 完整消息），
// 不叠一张旧图淡出的话，第 0 帧就是「预览文字啪地变成正文」——外框补间得再慢也不像在展开。
function msgToggleGhost(el) {
  if (!motionOk() || typeof el.animate !== 'function') return null;
  const ghost = el.cloneNode(true);
  ghost.removeAttribute('id');
  delete ghost.dataset.groupKey;
  // 连点两下时，上一轮的快照可能还挂在里面，别把它也复制进来
  ghost.querySelectorAll('.ai-toggle-ghost').forEach((n) => n.remove());
  ghost.classList.remove('ai-toggling');
  ghost.classList.add('ai-toggle-ghost');
  return ghost;
}

// 自然展开：外框高度补间（内容被裁着一点点露出来）＋ 旧样子就地淡出 ＋ 新正文淡入落定
function animateMsgToggle(el, anchor) {
  const from = anchor.height;
  const to = el.offsetHeight;
  if (!motionOk() || typeof el.animate !== 'function' || !from || !to) return;
  if (Math.abs(to - from) < 4) return;
  el.classList.add('ai-toggling');
  const anim = el.animate([{ height: from + 'px' }, { height: to + 'px' }], {
    duration: MSG_TOGGLE_MS,
    easing: MSG_TOGGLE_EASE,
  });
  const done = () => el.classList.remove('ai-toggling');
  anim.addEventListener('finish', done);
  anim.addEventListener('cancel', done);
  fadeOutMsgGhost(el, anchor);
  fadeInMsgBody(el, to > from);
}

function fadeOutMsgGhost(el, anchor) {
  const ghost = anchor.ghost;
  if (!ghost) return;
  const cs = getComputedStyle(el);
  // 绝对定位以 padding 盒为基准，减掉边框宽度才能和新元素的边框盒对齐
  ghost.style.top = '-' + cs.borderTopWidth;
  ghost.style.left = '-' + cs.borderLeftWidth;
  ghost.style.width = anchor.width + 'px';
  el.appendChild(ghost);
  const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: Math.round(MSG_TOGGLE_MS * 0.45),
    easing: 'ease-out',
    fill: 'forwards',
  });
  const drop = () => ghost.remove();
  fade.addEventListener('finish', drop);
  fade.addEventListener('cancel', drop);
}

function fadeInMsgBody(el, growing) {
  const body = el.querySelector('.msg-body');
  if (!body || typeof body.animate !== 'function') return;
  // fill:'backwards' —— 延迟这段时间里正文保持透明，让位给正在淡出的旧样子，两者才真的交叠
  body.animate(
    [
      { opacity: 0, transform: 'translateY(' + (growing ? -6 : 6) + 'px)' },
      { opacity: 1, transform: 'none' },
    ],
    {
      duration: Math.round(MSG_TOGGLE_MS * 0.6),
      delay: Math.round(MSG_TOGGLE_MS * 0.2),
      easing: MSG_TOGGLE_EASE,
      fill: 'backwards',
    }
  );
}

// 空白主区域的上手引导：三步 ① 添加项目目录 ② 新建会话 ③ 输入任务，
// 当前该做的那一步高亮并带一个直接可点的按钮（省得用户猜哪个图标是加目录）。
function gettingStartedEl() {
  const stage = State.roots.length === 0 ? 1 : !State.rootId ? 2 : 3;
  const wrap = document.createElement('div');
  wrap.className = 'getting-started';
  const step = (n, text, hint) =>
    `<div class="gs-step${n === stage ? ' on' : n < stage ? ' done' : ''}">
       <span class="gs-n">${n < stage ? '✓' : n}</span>
       <div><div class="gs-t">${text}</div>${hint ? `<div class="gs-h">${hint}</div>` : ''}</div>
     </div>`;
  wrap.innerHTML =
    `<div class="gs-title">${T('gsTitle')}</div>` +
    step(1, T('gsStep1'), T('gsStep1Hint')) +
    step(2, T('gsStep2'), T('gsStep2Hint')) +
    step(3, T('gsStep3'), T('gsStep3Hint'));
  // 第二步「选择目录」：用户多半早就加过很多目录，不该逼他去浏览/创建，
  // 直接给「从已有目录里选」的下拉 ＋「＋ 添加新目录」兜底。
  if (stage === 2) {
    wrap.appendChild(gsRootChooserEl());
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'primary';
    btn.id = 'gsAction';
    btn.textContent = stage === 1 ? T('gsAddRoot') : T('gsNewSession');
    btn.onclick = () => (stage === 1 ? addRoot() : newSession());
    wrap.appendChild(btn);
  }
  return wrap;
}

// 引导第二步的目录选择器：列出已有根目录供直接选用，另给「＋ 添加新目录」走目录浏览新增。
function gsRootChooserEl() {
  const row = document.createElement('div');
  row.className = 'gs-root-chooser';
  const sel = document.createElement('select');
  sel.className = 'frr-select';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = T('selectRootFirst');
  sel.appendChild(empty);
  sortedRoots().forEach((r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.name} (${r.path})`;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    if (sel.value) applyRootSelection(sel.value);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'sm';
  addBtn.textContent = '＋ ' + T('addNewDir');
  addBtn.addEventListener('click', guidePickRoot);
  row.appendChild(sel);
  row.appendChild(addBtn);
  return row;
}

function favoriteDraftRootPickerEl() {
  const wrap = document.createElement('div');
  wrap.className = 'favorite-root-required';
  const label = document.createElement('div');
  label.className = 'frr-label';
  label.textContent = T('favoriteRootRequired');
  const row = document.createElement('div');
  row.className = 'frr-row';
  const sel = document.createElement('select');
  sel.className = 'frr-select';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = T('selectRootFirst');
  sel.appendChild(empty);
  sortedRoots().forEach((r) => {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.name} (${r.path})`;
    sel.appendChild(o);
  });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'primary sm';
  btn.textContent = T('confirm');
  const progress = document.createElement('div');
  progress.className = 'frr-progress';
  progress.setAttribute('role', 'progressbar');
  progress.hidden = true;
  // 「添加新目录」：与左侧「＋」功能一致（打开目录选择器加根目录），只是创建完直接选用它绑定本会话
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'sm';
  addBtn.textContent = '＋ ' + T('addNewDir');
  const startBinding = () => bindFavoriteDraftRoot(sel.value, { wrap, sel, btn, progress });
  btn.addEventListener('click', startBinding);
  addBtn.addEventListener('click', pickNewFavoriteRoot);
  sel.addEventListener('change', () => {
    if (sel.value) startBinding();
  });
  row.appendChild(sel);
  row.appendChild(btn);
  row.appendChild(addBtn);
  wrap.appendChild(label);
  wrap.appendChild(row);
  wrap.appendChild(progress);
  setFavoriteRootBindingUi(
    { wrap, sel, btn, progress },
    State.favoriteRootBindingDraftId === State.session?.id,
  );
  return wrap;
}

// 为待绑定的收藏草稿会话新增一个目录并直接绑定：与左侧「＋」走同一套引导
// （已有目录 / 新建项目 → 缺模板即弹选 → 带进度条执行），流程完成后再绑定到当前草稿会话，
// 保证「加目录」这件事在收藏夹入口与主入口体验一致。
function pickNewFavoriteRoot() {
  const draft = State.session;
  if (!draft || !isFavoriteDraftId(draft.id)) return;
  openAddRootGuide((rootId) => bindFavoriteDraftRoot(rootId));
}

function setFavoriteRootBindingUi(controls, busy) {
  if (!controls) return;
  const { wrap, sel, btn, progress } = controls;
  if (wrap) wrap.classList.toggle('is-busy', busy);
  if (sel) sel.disabled = busy;
  if (btn) {
    btn.disabled = busy;
    btn.textContent = busy ? T('loading') : T('confirm');
  }
  if (progress) progress.hidden = !busy;
}

async function bindFavoriteDraftRoot(rootId, controls = null) {
  if (!State.session || !isFavoriteDraftId(State.session.id) || !rootId) return;
  if (State.favoriteRootBindingDraftId) return;
  const draftId = State.session.id;
  State.favoriteRootBindingDraftId = draftId;
  setFavoriteRootBindingUi(controls, true);
  try {
    const s = await api('/api/session/create', {
      rootId,
      name: '',
      engine: State.session.engine || State.settings.defaultEngine,
    });
    const favorited = await api('/api/session/favorite', { id: s.id, favorite: true });
    const real = favorited || { ...s, favorite: true };
    State.favoriteSessions = sortSessionsForList([
      real,
      ...State.favoriteSessions.filter((x) => x.id !== draftId && x.id !== real.id),
    ]);
    State.sessions = State.favoriteSessions;
    State.sessionId = real.id;
    State.session = real;
    setTabRootId(rootId);
    $('sessionTitle').textContent = sessionTitle(real);
    renderMessages();
    renderQueue();
    refreshPauseBtn();
    refreshEngineControl();
    renderSessions();
    refreshRootRecency().then(() => renderSessions()).catch(() => {});
    // 从下拉直接选已有目录绑定时，同样按「选用该目录工作」的通用规则至少问一次模板
    // （走加号引导新建/新建项目时模板早已问过，TemplateAsk.asked 会让这里自然跳过，不重复打扰）
    if (typeof offerTemplateForRoot === 'function') offerTemplateForRoot(rootId);
  } catch (e) {
    alert(e.message || 'Create session failed');
    setFavoriteRootBindingUi(controls, false);
  } finally {
    if (State.favoriteRootBindingDraftId === draftId) State.favoriteRootBindingDraftId = '';
  }
}

function messageRenderUnits(messages) {
  const units = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === 'user') {
      units.push({ kind: 'message', message: m });
      continue;
    }
    const group = [];
    const startIndex = i;
    while (i < messages.length && messages[i]?.role !== 'user') {
      group.push(messages[i]);
      i++;
    }
    i--;
    const key = assistantGroupKey(group, startIndex);
    if (!State.aiCollapsed) {
      group.forEach((message) => units.push({ kind: 'message', message }));
    } else if (State.aiExpandedGroups.has(key)) {
      units.push({ kind: 'assistantExpandedGroup', messages: group, key });
    } else {
      units.push({ kind: 'assistantGroup', messages: group, key });
    }
  }
  return units;
}

function assistantGroupKey(messages, startIndex) {
  const first = messages[0];
  const last = messages[messages.length - 1];
  return [
    State.sessionId || '',
    first?.id || `i${startIndex}`,
    last?.id || `n${messages.length}`,
    messages.length,
  ].join(':');
}

function addAssistantGroupEl(unit) {
  const box = $('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant ai-collapsed-msg';
  div.dataset.groupKey = unit.key;

  const count = unit.messages.length;
  const last = unit.messages[count - 1];
  const preview = assistantGroupPreview(unit.messages);

  const head = document.createElement('div');
  head.className = 'msg-head';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = assistantLabel();
  const meta = document.createElement('span');
  meta.className = 'ai-collapse-meta';
  meta.textContent = T('aiCollapsedCount').replace('{n}', count);
  head.appendChild(who);
  head.appendChild(meta);
  if (last?.createdAt) {
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = fmtDateTime(last.createdAt);
    head.appendChild(time);
  }

  const body = document.createElement('div');
  body.className = 'msg-body ai-collapse-preview';
  body.textContent = preview || T('aiCollapsedEmpty');

  div.appendChild(head);
  div.appendChild(body);

  // 底部明确的「展开」按钮（图标 + 文字），让用户知道这条 AI 消息可点开
  const foot = document.createElement('div');
  foot.className = 'ai-collapse-foot';
  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'ai-collapse-toggle-btn';
  expandBtn.textContent = `▾ ${T('expand')}`;
  expandBtn.title = T('aiExpandGroup');
  foot.appendChild(expandBtn);
  div.appendChild(foot);

  div.title = T('aiExpandGroup');
  div.addEventListener('click', () => toggleAssistantGroup(unit.key, true));
  box.appendChild(div);
}

function assistantGroupPreview(messages) {
  const last = messages[messages.length - 1];
  const text = (last?.text || '').replace(/\s+/g, ' ').trim();
  return text.length > 180 ? text.slice(0, 180) + '...' : text;
}

function addExpandedAssistantGroupEl(unit) {
  const last = unit.messages[unit.messages.length - 1];
  if (!last) return;
  const div = addMessageEl(last);
  div.classList.add('ai-expanded-last');
  div.dataset.groupKey = unit.key;
  // 底部明确的「收起」按钮（图标 + 文字），与展开按钮位置对称
  const foot = document.createElement('div');
  foot.className = 'ai-collapse-foot';
  const collapseBtn = document.createElement('button');
  collapseBtn.type = 'button';
  collapseBtn.className = 'ai-collapse-toggle-btn';
  collapseBtn.textContent = `▴ ${T('collapse')}`;
  collapseBtn.title = T('aiCollapseGroup');
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAssistantGroup(unit.key, false);
  });
  foot.appendChild(collapseBtn);
  div.appendChild(foot);
}

function toggleAiCollapse() {
  State.aiCollapsed = !State.aiCollapsed;
  State.aiExpandedGroups.clear();
  localStorage.setItem('aiCollapsed', State.aiCollapsed ? '1' : '0');
  renderMessages();
}

function refreshAiCollapseBtn() {
  const btn = $('aiCollapseBtn');
  if (!btn) return;
  const messages = State.session?.messages || [];
  const assistantCount = messages.filter((m) => m?.role !== 'user').length;
  btn.disabled = assistantCount === 0;
  btn.textContent = State.aiCollapsed ? '▣' : '▢';
  btn.title = State.aiCollapsed ? T('aiExpandAll') : T('aiCollapseAll');
  btn.setAttribute('aria-label', btn.title);
}

// 本轮完成后，在 AI 最后一条回复下方显示唯一一行「耗时：X」
// = 该回复的时间 − 触发它的那条用户消息的时间。仅在本轮结束（不再执行）后出现。
function renderElapsedNotes() {
  const box = $('messages');
  if (!box) return;
  box.querySelectorAll('.msg-elapsed').forEach((el) => el.remove());
  const msgs = State.session?.messages || [];
  const running = isSessionRunning();
  let lastUserTime = 0;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === 'user') { lastUserTime = m.createdAt || 0; continue; }
    // assistant：仅当它是本轮最后一条回复（后面紧跟用户消息，或它是全场最后一条且已结束）才标注耗时
    const next = msgs[i + 1];
    const turnEnd = (next && next.role === 'user') || (i === msgs.length - 1 && !running);
    if (!turnEnd || !lastUserTime || !m.createdAt) continue;
    const node = box.querySelector(`[data-mid="${CSS.escape(m.id)}"]`);
    if (!node) continue;
    const el = document.createElement('div');
    el.className = 'msg-elapsed';
    el.textContent = `${T('elapsed')}：${fmtElapsed(m.createdAt - lastUserTime)}`;
    node.appendChild(el); // 放进气泡内部（末尾），而非气泡外部
    lastUserTime = 0; // 本轮已消费
  }
}

// ── 渲染：执行失败 / 引擎无响应的提示卡片 ──
// 后台跑挂了（引擎没装好、被安全软件拦下、退出码 0 却零输出）时界面必须看得到原因，
// 否则用户看到的就是「发了消息什么都不回、也不报错」。信息有两个来源：
//   ① 任务失败：task.status='error'，原因在 task.error（后端已带上命令/工作目录/stderr）
//   ② 运行提示：kind='notice' 事件（任务还没结束，但已经出现必须告知的情况）
function noticeItems() {
  const items = [];
  (State.session?.tasks || []).forEach((t) => {
    if (t.status !== 'error' || !t.error) return;
    items.push({
      key: `task:${t.id}`,
      level: 'error',
      at: t.finishedAt || t.startedAt || t.createdAt || 0,
      title: T('runFailedTitle'),
      message: t.error,
    });
  });
  State.notices
    .filter((n) => n.sessionId === State.sessionId)
    .forEach((n) => {
      items.push({
        key: `notice:${n.id}`,
        level: n.level === 'error' ? 'error' : 'warn',
        at: n.at,
        title: n.level === 'error' ? T('runFailedTitle') : T('runWarnTitle'),
        message: n.message,
      });
    });
  return items.filter((it) => !State.dismissedNotices.has(it.key)).sort((a, b) => a.at - b.at);
}

// 渲染成会话右下角的悬浮小圆圈：平时只占一个圆点（带条数），点开才展开详情浮层。
// 之前是把大卡片直接插进正文，一出错就把对话挤没了。
function renderNotices() {
  const dock = $('noticeDock');
  const fab = $('noticeFab');
  const pop = $('noticePop');
  if (!dock || !fab || !pop) return;
  const items = noticeItems();
  if (!items.length) {
    State.noticeOpen = false;
    dock.hidden = true;
    pop.hidden = true;
    pop.textContent = '';
    fab.setAttribute('aria-expanded', 'false');
    return;
  }
  const hasError = items.some((it) => it.level === 'error');
  dock.hidden = false;
  dock.classList.toggle('warn', !hasError);
  const count = $('noticeCount');
  if (count) {
    count.textContent = items.length > 99 ? '99+' : String(items.length);
    count.hidden = items.length < 2; // 只有一条时不必标数字
  }
  fab.title = `${State.noticeOpen ? T('noticeFabClose') : T('noticeFabOpen')}（${items.length}）`;
  fab.setAttribute('aria-label', fab.title);
  fab.setAttribute('aria-expanded', State.noticeOpen ? 'true' : 'false');

  pop.hidden = !State.noticeOpen;
  pop.textContent = '';
  if (!State.noticeOpen) return;
  const head = document.createElement('div');
  head.className = 'np-head';
  const title = document.createElement('span');
  title.className = 'np-title';
  title.textContent = `${hasError ? '✕' : '⚠'} ${T('noticePopTitle')}（${items.length}）`;
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'np-clear sm';
  clear.textContent = T('noticeClearAll');
  clear.addEventListener('click', () => clearNotices());
  head.appendChild(title);
  head.appendChild(clear);
  pop.appendChild(head);
  items.forEach((item) => pop.appendChild(noticeEl(item)));
}

// 圆圈的开合。展开时把最新一条滚进视野（浮层是倒不过来的正序列表，最新在底部）
function toggleNoticePop(open) {
  const items = noticeItems();
  if (!items.length) return;
  State.noticeOpen = typeof open === 'boolean' ? open : !State.noticeOpen;
  renderNotices();
  const pop = $('noticePop');
  if (State.noticeOpen && pop) pop.scrollTop = pop.scrollHeight;
}

function noticeEl(item) {
  const div = document.createElement('div');
  div.className = `msg-notice ${item.level}`;
  const head = document.createElement('div');
  head.className = 'mn-head';
  const title = document.createElement('span');
  title.className = 'mn-title';
  title.textContent = `${item.level === 'error' ? '✕' : '⚠'} ${item.title}`;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'mn-copy sm';
  copy.textContent = T('copyDiag');
  copy.title = T('copyDiag');
  copy.addEventListener('click', () => copyText(item.message, copy, T('copyDiag')));
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'mn-close sm';
  close.textContent = '✕';
  close.title = T('noticeClose');
  close.setAttribute('aria-label', T('noticeClose'));
  close.addEventListener('click', () => dismissNotice(item.key));
  head.appendChild(title);
  head.appendChild(copy);
  head.appendChild(close);
  const body = document.createElement('pre');
  body.className = 'mn-body';
  body.textContent = item.message;
  div.appendChild(head);
  div.appendChild(body);
  return div;
}

// 收到后端运行提示：存下来并即时显示（只保留最近 60 条，避免长跑会话堆积）
function pushNotice(e) {
  State.notices.push({
    id: ++NOTICE_SEQ,
    sessionId: e.sessionId,
    taskId: e.taskId,
    level: e.level === 'error' ? 'error' : 'warn',
    message: String(e.message || ''),
    at: Date.now(),
  });
  if (State.notices.length > 60) State.notices.splice(0, State.notices.length - 60);
  if (e.sessionId === State.sessionId) { renderNotices(); pulseNoticeFab(); }
}

// 新提示到达：小圆圈脉冲两下（不自动展开——那就等于又把正文挡住了）
function pulseNoticeFab() {
  const fab = $('noticeFab');
  if (!fab || $('noticeDock')?.hidden) return;
  fab.classList.remove('pulse');
  void fab.offsetWidth; // 强制回流，让动画能重播
  fab.classList.add('pulse');
}

// 用户手动关掉一张提示卡：任务失败的原因来自 task.error（后端持久化，删不掉），
// 所以只在前端记下 key，渲染时跳过；运行提示则直接从内存里丢掉。
function dismissNotice(key) {
  State.dismissedNotices.add(key);
  const id = key.startsWith('notice:') ? Number(key.slice(7)) : 0;
  if (id) State.notices = State.notices.filter((n) => n.id !== id);
  renderNotices();
}

// 开始新一轮消息 → 过去的失败/告警都翻篇了，全部清空（含顶部后端异常横幅）
function clearNotices() {
  noticeItems().forEach((it) => State.dismissedNotices.add(it.key));
  State.notices = State.notices.filter((n) => n.sessionId !== State.sessionId);
  const bar = $('globalError');
  if (bar) bar.hidden = true;
  State.noticeOpen = false;
  renderNotices();
}

// 任务最终成功了 → 它中途的「无输出」告警已无意义，撤掉，别留着吓人
function dropTaskNotices(taskId) {
  if (!taskId) return;
  State.notices = State.notices.filter((n) => n.taskId !== taskId || n.level === 'error');
}

// 后端级异常（未捕获异常）：顶部横幅，与具体会话无关
function showServerError(message) {
  let bar = $('globalError');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'globalError';
    bar.className = 'global-error';
    bar.innerHTML =
      `<span class="ge-title"></span><span class="ge-text"></span>` +
      `<button type="button" class="ge-copy sm"></button>` +
      `<button type="button" class="ge-close sm">✕</button>`;
    document.body.appendChild(bar);
    bar.querySelector('.ge-close').addEventListener('click', () => { bar.hidden = true; });
    bar.querySelector('.ge-copy').addEventListener('click', (ev) =>
      copyText(bar.querySelector('.ge-text').textContent, ev.currentTarget, T('copyDiag')),
    );
  }
  bar.querySelector('.ge-title').textContent = T('serverErrorTitle');
  bar.querySelector('.ge-copy').textContent = T('copyDiag');
  bar.querySelector('.ge-close').title = T('close');
  bar.querySelector('.ge-text').textContent = String(message || '');
  bar.hidden = false;
}

// 当前会话是否有任务在执行
function isSessionRunning() {
  return !!(State.session?.tasks || []).some((t) => t.status === 'running');
}
// 执行中：在消息区底部显示一个动画气泡（"执行中…"）；非执行中则移除
function syncTypingIndicator() {
  if (isSessionRunning()) showTypingIndicator();
  else removeTypingIndicator();
}
function showTypingIndicator() {
  const box = $('messages');
  if (!box || $('typingMsg')) return;
  const div = document.createElement('div');
  div.className = 'msg assistant typing';
  div.id = 'typingMsg';
  div.innerHTML =
    `<div class="msg-head"><span class="who">${escapeHtml(assistantLabel())}</span></div>` +
    `<div class="msg-body"><span class="typing-dots"><i></i><i></i><i></i></span>` +
    `<span class="typing-label">${T('running')}</span>` +
    `<button class="typing-expand" id="typingExpandBtn" type="button" aria-label="process"></button></div>`;
  box.appendChild(div);
  const btn = div.querySelector('#typingExpandBtn');
  // 收起（箭头向右 ▸）时附带「详情」文案；展开（▾）时只留箭头
  const paintExpandBtn = () => {
    const open = document.body.classList.contains('show-process');
    btn.textContent = open ? '▾' : `▸ ${T('details')}`;
  };
  if (btn) {
    paintExpandBtn();
    btn.addEventListener('click', () => {
      document.body.classList.toggle('show-process');
      paintExpandBtn();
    });
  }
  box.scrollTop = box.scrollHeight;
}
function removeTypingIndicator() {
  const el = $('typingMsg');
  if (el) el.remove();
}
function addMessageEl(m) {
  const box = $('messages');
  const div = document.createElement('div');
  div.className = 'msg ' + m.role;
  if (m.id) div.dataset.mid = m.id;

  const head = document.createElement('div');
  head.className = 'msg-head';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = m.role === 'user' ? T('you') : assistantLabel();
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-btn';
  copyBtn.title = T('copy');
  copyBtn.textContent = '📋';
  copyBtn.addEventListener('click', () => copyText(m.text, copyBtn));
  head.appendChild(who);
  if (m.createdAt) {
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = fmtDateTime(m.createdAt);
    head.appendChild(time);
  }
  head.appendChild(copyBtn);

  const body = document.createElement('div');
  body.className = 'msg-body';
  // AI 消息按 markdown 渲染（代码块/列表/表格/链接等）；用户输入保持纯文本，避免 prompt 被误解析
  let charts = [];
  if (m.role === 'user') {
    body.textContent = m.text;
  } else {
    // AI 消息：先抽取内联 <chart> 数据块，正文（去掉 chart 块）按 markdown 渲染，图表单独成卡片
    const parsed = parseCharts(m.text);
    charts = parsed.charts;
    renderMarkdown(body, parsed.text);
  }

  div.appendChild(head);
  div.appendChild(body);
  // AI 消息：挂「🔍 过程」按钮，点开即在本条下方内联展开这一轮的完整轨迹
  if (m.role !== 'user') attachTraceBtn(div, m);
  // AI 内联图表：每个 <chart> 渲染为一张图表卡片（ECharts），追加在正文之后
  charts.forEach((c) => div.appendChild(chartCardEl(c)));
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  // AI 消息：异步解析其引用到的根目录文件，追加可预览/下载的附件卡片
  if (m.role !== 'user') attachFilesToMessage(div, m);
  return div;
}

// 复制文本到剪贴板（优先 Clipboard API，非安全上下文回退 execCommand），并在按钮上短暂反馈
// restore：反馈结束后按钮恢复的文本（默认 📋）
async function copyText(text, btn, restore = '📋') {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch {
      ok = false;
    }
  }
  if (btn) {
    btn.textContent = ok ? '✓' : '✕';
    btn.classList.toggle('copied', ok);
    btn.title = ok ? T('copied') : T('copy');
    setTimeout(() => {
      btn.textContent = restore;
      btn.classList.remove('copied');
      btn.title = T('copy');
    }, 1200);
  }
}

// ── 渲染：任务队列 ──
const Queue = { showDone: false };
const QUEUE_INLINE_CAP = 8; // 内联队列最多展示的任务数，多出的点「展开管理」进弹窗
// 已完成（含停止/出错）任务：默认折叠，点按钮展开/收起
const FINISHED = ['done', 'stopped', 'error'];
function toggleDone() {
  Queue.showDone = !Queue.showDone;
  renderQueue();
}

// 「展开管理」按钮：打开整体弹窗（更大空间 + 批量删除/修改/复制/暂定）
function toggleQueue() {
  openQueueModal();
}

function renderQueue() {
  const box = $('queue');
  const tasks = State.session?.tasks || [];
  box.innerHTML = '';
  if (tasks.length === 0) {
    box.innerHTML = `<div class="queue-empty">${T('noTasks')}</div>`;
    updateQueueToggle(0);
    syncQueueModal();
    refreshComposerControls();
    return;
  }
  const finished = tasks.filter((t) => FINISHED.includes(t.status));
  // 已完成任务折叠到一个带数字的按钮（点击展开/收起）
  if (finished.length > 0) {
    const bar = document.createElement('div');
    bar.className = 'done-toggle';
    bar.textContent = `✓ ${T('doneTasks')} (${finished.length}) ${Queue.showDone ? '▲' : '▼'}`;
    bar.addEventListener('click', toggleDone);
    box.appendChild(bar);
  }
  // 内联区只展示一部分（紧凑 chip）；折叠时隐藏已完成项，超出上限的收进「+N 更多」
  const visible = tasks.filter((t) => !(FINISHED.includes(t.status) && !Queue.showDone));
  let shown = 0;
  tasks.forEach((t, i) => {
    if (FINISHED.includes(t.status) && !Queue.showDone) return;
    if (shown >= QUEUE_INLINE_CAP) return;
    box.appendChild(taskEl(t, i));
    shown += 1;
  });
  const hidden = visible.length - shown;
  if (hidden > 0) {
    const more = document.createElement('div');
    more.className = 'qmore';
    more.textContent = `+${hidden} ${T('more')}`;
    more.title = T('expandManage');
    more.addEventListener('click', openQueueModal);
    box.appendChild(more);
  }
  updateQueueToggle(tasks.length);
  syncQueueModal();
  refreshComposerControls();
}

function updateQueueToggle(count) {
  const btn = $('queueToggle');
  btn.textContent = `📋 ${T('taskListN')} (${count}) ${T('expandManage')}`;
}

// 内联紧凑 chip（只做预览：序号 + 状态点 + 截断文本 + 快捷删除）
function taskEl(t, i) {
  const el = document.createElement('div');
  el.className = 'qtask' + (t.held ? ' held' : '');
  el.dataset.task = t.id;
  // 失败任务的悬浮提示直接带上原因，不用点进弹窗才知道为什么没跑起来
  el.title = t.status === 'error' && t.error ? `${t.prompt}\n\n${t.error}` : t.prompt;
  el.addEventListener('click', openQueueModal);
  const text = escapeHtml(t.prompt.slice(0, 24));
  const holdMark = t.held ? `<span class="qhold" title="${T('held')}">⏸</span>` : '';
  // 仅 pending（尚未开始）任务可直接删除
  const del =
    t.status === 'pending'
      ? `<span class="qdel" title="${T('delete')}" data-del="${t.id}">✕</span>`
      : '';
  el.innerHTML =
    `<span class="qidx">${i + 1}.</span>` +
    `<span class="dot ${t.status}"></span>` +
    holdMark +
    `<span class="qtext">${text}</span>` +
    `<span style="color:var(--muted)">${t.held ? T('held') : T(t.status)}</span>` +
    del;
  const delBtn = el.querySelector('.qdel');
  if (delBtn) delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); removeTask(t.id); });
  return el;
}
async function removeTask(taskId) {
  if (!State.sessionId) return;
  await api('/api/task/remove', { sessionId: State.sessionId, taskId });
}
function removeTaskLocal(taskId) {
  if (!State.session) return;
  const tasks = State.session.tasks;
  const i = tasks.findIndex((x) => x.id === taskId);
  if (i >= 0) tasks.splice(i, 1);
  renderQueue();
}
function upsertTask(t) {
  if (!State.session) return;
  const tasks = State.session.tasks;
  const i = tasks.findIndex((x) => x.id === t.id);
  if (i >= 0) tasks[i] = t;
  else tasks.push(t);
  renderQueue();
}

// ── 任务管理弹窗（整体展开：更大空间 + 批量删除 / 修改 / 复制 / 暂定）──
const QueueModal = { selected: new Set(), editing: null };

function openQueueModal() {
  if (!State.session) return;
  QueueModal.selected.clear();
  QueueModal.editing = null;
  $('queueModal').hidden = false;
  renderQueueModal();
}
function closeQueueModal() {
  $('queueModal').hidden = true;
  QueueModal.editing = null;
}
// 队列有变化时，若弹窗开着就同步重绘（并清理已消失任务的选中态）
function syncQueueModal() {
  if ($('queueModal').hidden) return;
  const ids = new Set((State.session?.tasks || []).map((t) => t.id));
  [...QueueModal.selected].forEach((id) => { if (!ids.has(id)) QueueModal.selected.delete(id); });
  // 正在编辑且该任务仍在 → 保留编辑框，不整表重绘（避免输入被 WS 事件冲掉）
  if (QueueModal.editing && ids.has(QueueModal.editing)) return;
  QueueModal.editing = null;
  renderQueueModal();
}

function renderQueueModal() {
  const tasks = State.session?.tasks || [];
  $('qmTitle').textContent = `${T('manageTasks')} (${tasks.length})`;
  const list = $('qmList');
  list.innerHTML = '';
  if (tasks.length === 0) {
    list.innerHTML = `<div class="queue-empty">${T('noTasks')}</div>`;
  } else {
    tasks.forEach((t, i) => list.appendChild(qmRow(t, i)));
  }
  // 工具栏：全选态 + 已选计数 + 批量删除可用性
  const pendingIds = tasks.filter((t) => t.status === 'pending').map((t) => t.id);
  const selCount = QueueModal.selected.size;
  const allChk = $('qmSelectAll');
  allChk.checked = pendingIds.length > 0 && pendingIds.every((id) => QueueModal.selected.has(id));
  allChk.indeterminate = selCount > 0 && !allChk.checked;
  allChk.disabled = pendingIds.length === 0;
  const delBtn = $('qmBatchDelete');
  delBtn.disabled = selCount === 0;
  delBtn.textContent = selCount > 0 ? `🗑 ${T('batchDelete')} (${selCount})` : `🗑 ${T('batchDelete')}`;
}

function qmRow(t, i) {
  const row = document.createElement('div');
  row.className = 'qm-row' + (t.held ? ' held' : '');
  row.dataset.task = t.id;
  const editable = t.status === 'pending';

  // 选择框（仅 pending 可批量删除；非 pending 也占位一个禁用勾选框以保持对齐）
  const chkWrap = document.createElement('label');
  chkWrap.className = 'qm-check';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  if (editable) {
    chk.checked = QueueModal.selected.has(t.id);
    chk.addEventListener('change', () => {
      if (chk.checked) QueueModal.selected.add(t.id);
      else QueueModal.selected.delete(t.id);
      renderQueueModal();
    });
  } else {
    chk.checked = false;
    chk.disabled = true;
    chkWrap.classList.add('disabled');
    chkWrap.title = T('taskDoneNoSelect');
    // 禁用状态下点击不会触发 change，用 mousedown 弹提示
    chkWrap.addEventListener('mousedown', (ev) => { ev.preventDefault(); alert(T('taskDoneNoSelect')); });
  }
  chkWrap.appendChild(chk);
  row.appendChild(chkWrap);

  // 序号 + 状态
  const head = document.createElement('div');
  head.className = 'qm-head';
  head.innerHTML =
    `<span class="qm-idx">${i + 1}</span>` +
    `<span class="dot ${t.status}"></span>` +
    `<span class="qm-status">${t.held ? T('held') : T(t.status)}</span>`;
  row.appendChild(head);

  // 正文 / 编辑区
  const body = document.createElement('div');
  body.className = 'qm-body';
  if (QueueModal.editing === t.id) {
    const ta = document.createElement('textarea');
    ta.className = 'qm-edit';
    ta.value = t.prompt;
    ta.rows = Math.min(8, Math.max(2, t.prompt.split('\n').length));
    const bar = document.createElement('div');
    bar.className = 'qm-editbar';
    const save = document.createElement('button');
    save.className = 'sm primary';
    save.textContent = T('save');
    save.addEventListener('click', () => saveTaskEdit(t.id, ta.value));
    const cancel = document.createElement('button');
    cancel.className = 'sm';
    cancel.textContent = T('cancel');
    cancel.addEventListener('click', () => { QueueModal.editing = null; renderQueueModal(); });
    bar.appendChild(save);
    bar.appendChild(cancel);
    body.appendChild(ta);
    body.appendChild(bar);
    setTimeout(() => ta.focus(), 30);
  } else {
    const txt = document.createElement('div');
    txt.className = 'qm-text';
    txt.textContent = t.prompt;
    body.appendChild(txt);
    // 失败任务：把后端给的失败原因（命令/工作目录/stderr）直接摊在这条任务下面
    if (t.status === 'error' && t.error) {
      const err = document.createElement('pre');
      err.className = 'qm-error';
      err.textContent = t.error;
      body.appendChild(err);
    }
  }
  row.appendChild(body);

  // 操作按钮
  const acts = document.createElement('div');
  acts.className = 'qm-acts';
  if (QueueModal.editing !== t.id) {
    const copy = mkActBtn('📋', T('copy'), (b) => copyText(t.prompt, b, '📋'));
    acts.appendChild(copy);
    if (editable) {
      acts.appendChild(mkActBtn('✎', T('edit'), () => { QueueModal.editing = t.id; renderQueueModal(); }));
      const hb = mkActBtn(t.held ? '▶' : '⏸', t.held ? T('resume') : T('hold'), () => holdTask(t.id, !t.held));
      hb.classList.toggle('on', !!t.held);
      acts.appendChild(hb);
      const db = mkActBtn('🗑', T('delete'), () => removeTask(t.id));
      db.classList.add('danger');
      acts.appendChild(db);
    }
  }
  row.appendChild(acts);
  return row;
}

function mkActBtn(icon, title, onClick) {
  const b = document.createElement('button');
  b.className = 'qm-act';
  b.textContent = icon;
  b.title = title;
  b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(b); });
  return b;
}

function toggleSelectAll() {
  const tasks = State.session?.tasks || [];
  const pendingIds = tasks.filter((t) => t.status === 'pending').map((t) => t.id);
  const allSelected = pendingIds.length > 0 && pendingIds.every((id) => QueueModal.selected.has(id));
  if (allSelected) QueueModal.selected.clear();
  else pendingIds.forEach((id) => QueueModal.selected.add(id));
  renderQueueModal();
}

async function batchDeleteTasks() {
  if (!State.sessionId || QueueModal.selected.size === 0) return;
  if (!confirm(T('confirmDeleteTasks'))) return;
  const taskIds = [...QueueModal.selected];
  QueueModal.selected.clear();
  await api('/api/task/removeBatch', { sessionId: State.sessionId, taskIds });
}

async function saveTaskEdit(taskId, prompt) {
  const cleaned = (prompt || '').trim();
  if (!cleaned || !State.sessionId) return;
  QueueModal.editing = null;
  await api('/api/task/update', { sessionId: State.sessionId, taskId, prompt: cleaned });
}

async function holdTask(taskId, held) {
  if (!State.sessionId) return;
  await api('/api/task/hold', { sessionId: State.sessionId, taskId, held });
}

// ── 斜杠命令（透传给 claude 的原生 slash 命令）──
// 输入框打 / 弹候选；选中后填入输入框，可继续补参数，回车发送给 claude 执行。
const SLASH_COMMANDS = [
  { cmd: '/clear', desc: 'Clear conversation history' },
  { cmd: '/compact', desc: 'Compact conversation to save context' },
  { cmd: '/cost', desc: 'Show token usage / cost' },
  { cmd: '/context', desc: 'Show current context usage' },
  { cmd: '/model', desc: 'Show or switch model' },
  { cmd: '/review', desc: 'Review the current changes' },
  { cmd: '/init', desc: 'Generate a CLAUDE.md for the project' },
  { cmd: '/memory', desc: 'Edit memory / CLAUDE.md' },
  { cmd: '/help', desc: 'List available commands' },
  { cmd: '/status', desc: 'Show session status' },
];
const Slash = { open: false, items: [], active: 0 };

function updateSlashMenu() {
  const ta = $('taskInput');
  const v = ta.value;
  // 仅当输入以 / 开头且尚未输入空格（即正在敲命令名）时显示候选
  const m = /^\/(\S*)$/.exec(v);
  if (!m) return closeSlashMenu();
  const q = m[1].toLowerCase();
  const items = SLASH_COMMANDS.filter((c) => c.cmd.slice(1).toLowerCase().startsWith(q));
  if (items.length === 0) return closeSlashMenu();
  Slash.open = true;
  Slash.items = items;
  Slash.active = 0;
  renderSlashMenu();
}
function renderSlashMenu() {
  const menu = $('slashMenu');
  menu.innerHTML = '';
  Slash.items.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'slash-item' + (i === Slash.active ? ' active' : '');
    row.innerHTML = `<span class="slash-cmd">${escapeHtml(c.cmd)}</span><span class="slash-desc">${escapeHtml(c.desc)}</span>`;
    row.addEventListener('mousedown', (e) => { e.preventDefault(); pickSlash(i); });
    menu.appendChild(row);
  });
  menu.hidden = false;
}
function closeSlashMenu() {
  Slash.open = false;
  $('slashMenu').hidden = true;
}
function moveSlash(delta) {
  if (!Slash.open) return;
  Slash.active = (Slash.active + delta + Slash.items.length) % Slash.items.length;
  renderSlashMenu();
}
function pickSlash(i) {
  const c = Slash.items[i != null ? i : Slash.active];
  if (!c) return;
  const ta = $('taskInput');
  ta.value = c.cmd + ' '; // 填入命令名+空格，可继续补参数
  ta.focus();
  closeSlashMenu();
}

// ── 会话工具命令菜单（/usage /compact …）──
// 与"输入框打 / 透传"不同：这里点击菜单直接调后端执行 claude 原生斜杠命令，
// 把真实输出展示在结果弹窗里——真的看到反馈。每个命令都带用途解释。
const CMD_ITEMS = [
  { id: 'usage', slash: '/usage' },
];
const CmdMenu = { open: false, running: false };

function toggleCmdMenu() {
  if (CmdMenu.open) closeCmdMenu();
  else openCmdMenu();
}
function openCmdMenu() {
  renderCmdMenu();
  $('cmdMenu').hidden = false;
  CmdMenu.open = true;
}
function closeCmdMenu() {
  $('cmdMenu').hidden = true;
  CmdMenu.open = false;
}
function renderCmdMenu() {
  const menu = $('cmdMenu');
  menu.innerHTML = '';
  CMD_ITEMS.forEach((c) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cmd-item';
    row.innerHTML =
      `<span class="cmd-item-top"><span class="cmd-item-cmd">${escapeHtml(c.slash)}</span>` +
      `<span class="cmd-item-name">${escapeHtml(T('cmd_' + c.id + '_name'))}</span></span>` +
      `<span class="cmd-item-desc">${escapeHtml(T('cmd_' + c.id + '_desc'))}</span>`;
    row.addEventListener('click', () => runCommand(c.id));
    menu.appendChild(row);
  });
}

// 执行某个工具命令：调后端 → 弹窗展示输出（执行中→结果/错误）
async function runCommand(id) {
  if (CmdMenu.running) return;
  const item = CMD_ITEMS.find((c) => c.id === id);
  if (!item) return;
  closeCmdMenu();
  if (!State.sessionId) { alert(T('selectRootFirst')); return; }
  CmdMenu.running = true;
  openCmdResult(item, T('cmdRunning'), true);
  try {
    const data = await api('/api/command/run', { id: State.sessionId, cmd: id });
    const out = data && data.output ? data.output : T('cmdNoOutput');
    openCmdResult(item, out, false);
  } catch (e) {
    openCmdResult(item, T('cmdFailed') + '\n\n' + (e && e.message ? e.message : String(e)), false);
  } finally {
    CmdMenu.running = false;
  }
}

function openCmdResult(item, output, running) {
  $('cmdTitle').textContent = item.slash + '  ·  ' + T('cmd_' + item.id + '_name');
  $('cmdDesc').textContent = T('cmd_' + item.id + '_desc');
  const pre = $('cmdOutput');
  pre.textContent = output;
  pre.classList.toggle('running', !!running);
  // 执行中：隐藏输出框、显示专属进度条（斜杠命令无流式进度，用不确定进度条 + 已用时长）
  pre.hidden = !!running;
  if (running) startCmdProgress(); else stopCmdProgress();
  $('cmdGotIt').textContent = T('guideGotIt');
  $('cmdGotIt').disabled = !!running; // 执行中禁止「知道了」，避免关掉弹窗后结果覆盖显示
  $('cmdOverlay').hidden = false;
}
function closeCmdResult() {
  stopCmdProgress();
  $('cmdOverlay').hidden = true;
}

// ── 命令执行进度条（不确定态动画 + 已用时长计时）──
let CmdProgTimer = null;
let CmdProgStart = 0;
function startCmdProgress() {
  $('cmdProgress').hidden = false;
  $('cmdProgressLabel').textContent = T('cmdRunning');
  CmdProgStart = Date.now();
  const tick = () => {
    const s = Math.max(0, Math.floor((Date.now() - CmdProgStart) / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('cmdProgressTime').textContent = mm + ':' + ss;
  };
  tick();
  if (CmdProgTimer) clearInterval(CmdProgTimer);
  CmdProgTimer = setInterval(tick, 1000);
}
function stopCmdProgress() {
  if (CmdProgTimer) { clearInterval(CmdProgTimer); CmdProgTimer = null; }
  $('cmdProgress').hidden = true;
}

// ── 上传文件到 <会话根目录>/tmp/ ──
async function uploadFiles(files) {
  if (!files || !files.length) return;
  if (!State.sessionId) { alert(T('selectRootFirst')); return; }
  const ta = $('taskInput');
  const names = [];
  for (const file of files) {
    try {
      // 粘贴/截屏的图片可能没有文件名，补一个带时间戳的默认名（扩展名取自 MIME）
      const fname = file.name || ('pasted-' + Date.now() + '.' + ((file.type && file.type.split('/')[1]) || 'png'));
      const res = await fetch(
        '/api/session/upload?id=' + encodeURIComponent(State.sessionId) +
          '&name=' + encodeURIComponent(fname),
        { method: 'POST', headers: { 'x-auth-token': TOKEN }, body: file },
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'upload failed');
      names.push(json.data.rel);
    } catch (e) {
      alert(T('uploadFailed') + ': ' + (e && e.message ? e.message : file.name));
    }
  }
  if (names.length) {
    // 把上传后的相对路径插入输入框，方便在 prompt 里直接引用
    ta.value = (ta.value ? ta.value.replace(/\s*$/, ' ') : '') + names.join(' ') + ' ';
    ta.focus();
  }
}

// ── 拖拽上传：把文件/图片拖到 composer 释放即上传 ──
function initDragUpload() {
  const composer = $('composer');
  const hint = $('dropHint');
  if (!composer) return;
  const show = () => { hint.hidden = false; composer.classList.add('drag-over'); };
  const hide = () => { hint.hidden = true; composer.classList.remove('drag-over'); };
  composer.addEventListener('dragover', (e) => {
    if (!State.sessionId || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    show();
  });
  composer.addEventListener('dragleave', (e) => {
    // 仅当离开整个 composer（而非进入子元素）才取消高亮
    if (e.target === composer || !composer.contains(e.relatedTarget)) hide();
  });
  composer.addEventListener('drop', async (e) => {
    if (!State.sessionId) return;
    e.preventDefault();
    hide();
    const fs = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (fs.length) await uploadFiles(fs);
  });
  // textarea 是可编辑控件，浏览器有独立的拖放默认行为（会把文件名插进文本）。
  // 直接在它上面拦截，保证拖到输入框内也走上传通道，不落入文本。
  const ta = $('taskInput');
  if (ta) {
    ta.addEventListener('dragover', (e) => {
      if (!State.sessionId || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      show();
    });
    ta.addEventListener('drop', async (e) => {
      if (!State.sessionId) return;
      const fs = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!fs.length) return; // 非文件（纯文本拖拽）放行默认插入
      e.preventDefault();
      e.stopPropagation();
      hide();
      await uploadFiles(fs);
    });
  }
}

// ── 粘贴上传：从剪贴板取图片（截图/复制的图片）直接上传，正常文本粘贴放行 ──
async function onPasteImage(e) {
  if (!State.sessionId) return;
  const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
  const imgs = items.filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
  if (!imgs.length) return;
  e.preventDefault();
  const files = imgs.map((it) => it.getAsFile()).filter(Boolean);
  if (files.length) await uploadFiles(files);
}

// ── 截屏：屏幕共享抓一帧 → 预览（可框选裁剪）→ 确定后上传 ──
const Shot = { dataUrl: null, sel: null, drag: null };

async function captureScreenshot() {
  if (!State.sessionId) { alert(T('selectRootFirst')); return; }
  try {
    const md = navigator.mediaDevices;
    if (!md || !md.getDisplayMedia) throw new Error(T('shotUnsupported'));
    const stream = await md.getDisplayMedia({ video: true, audio: false });
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 250)); // 等首帧就绪
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    stream.getTracks().forEach((tk) => tk.stop());
    openShot(canvas.toDataURL('image/png'));
  } catch (e) {
    alert((e && e.message) ? e.message : T('shotUnsupported'));
  }
}

function openShot(dataUrl) {
  Shot.dataUrl = dataUrl;
  Shot.sel = null;
  $('shotImg').src = dataUrl;
  $('shotSel').hidden = true;
  $('shotOverlay').hidden = false;
}
function closeShot() {
  Shot.dataUrl = null; Shot.sel = null; Shot.drag = null;
  $('shotOverlay').hidden = true;
  $('shotImg').src = '';
}

// 框选（坐标按图片显示区归一到 0~1），确定时按原图分辨率裁剪
function shotPos(e) {
  const r = $('shotStage').getBoundingClientRect();
  return {
    nx: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    ny: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  };
}
function paintSel() {
  const box = $('shotSel');
  if (!Shot.sel) { box.hidden = true; return; }
  const s = Shot.sel;
  box.hidden = false;
  box.style.left = (s.x * 100) + '%';
  box.style.top = (s.y * 100) + '%';
  box.style.width = (s.w * 100) + '%';
  box.style.height = (s.h * 100) + '%';
}
function shotDown(e) {
  e.currentTarget.setPointerCapture(e.pointerId);
  const { nx, ny } = shotPos(e);
  Shot.drag = { ox: nx, oy: ny };
  Shot.sel = { x: nx, y: ny, w: 0, h: 0 };
  paintSel();
}
function shotMove(e) {
  if (!Shot.drag) return;
  const { nx, ny } = shotPos(e);
  const { ox, oy } = Shot.drag;
  Shot.sel = { x: Math.min(ox, nx), y: Math.min(oy, ny), w: Math.abs(nx - ox), h: Math.abs(ny - oy) };
  paintSel();
}
function shotUp() {
  Shot.drag = null;
  if (Shot.sel && (Shot.sel.w < 0.01 || Shot.sel.h < 0.01)) { Shot.sel = null; paintSel(); } // 误点/过小 → 整图
}

function cropShot() {
  return new Promise((resolve) => {
    if (!Shot.dataUrl || !Shot.sel) { resolve(Shot.dataUrl || ''); return; }
    const sel = Shot.sel;
    const img = new Image();
    img.onload = () => {
      const sx = Math.round(sel.x * img.naturalWidth);
      const sy = Math.round(sel.y * img.naturalHeight);
      const sw = Math.max(1, Math.round(sel.w * img.naturalWidth));
      const sh = Math.max(1, Math.round(sel.h * img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = sw; cv.height = sh;
      const ctx = cv.getContext('2d');
      if (ctx) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(cv.toDataURL('image/png'));
    };
    img.onerror = () => resolve(Shot.dataUrl);
    img.src = Shot.dataUrl;
  });
}

function dataUrlToFile(dataUrl, name) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

async function confirmShot() {
  if (!Shot.dataUrl) return;
  const cropped = await cropShot();
  const file = dataUrlToFile(cropped, 'screenshot-' + Date.now() + '.png');
  closeShot();
  await uploadFiles([file]);
}

// ── 过程视图（思考/工具/输出，不进入最终消息） ──
function appendProcess(kind, text) {
  const log = $('processLog');
  const div = document.createElement('div');
  div.className = 'plog ' + kind;
  const tag = kind === 'thinking' ? '💭' : kind === 'tool' ? '🔧' : '·';
  div.innerHTML = `<span class="tag">${tag}</span>${escapeHtml(text)}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.children.length > 600) log.removeChild(log.firstChild);
}

// ── 全过程（Trace）：AI 干活的完整时间线 + 耗时统计 ──
// 数据源 GET /api/session/trace（live 轨迹 + claude 原生 jsonl 合并），详见 data.md
const Trace = { data: null, kinds: new Set(), raw: false, sid: '', stale: true, loading: null };

// 拉取当前会话轨迹（带缓存；有新事件或换会话时失效）
async function ensureTrace(force) {
  if (Trace.sid !== State.sessionId) {
    Trace.data = null;
    Trace.sid = State.sessionId;
    Trace.stale = true;
  }
  if (Trace.data && !Trace.stale && !force) return Trace.data;
  if (Trace.loading) return Trace.loading;
  const q = '/api/session/trace?id=' + encodeURIComponent(State.sessionId) + (Trace.raw ? '&raw=1' : '');
  Trace.loading = api(q)
    .then((d) => {
      Trace.data = d;
      Trace.stale = false;
      return d;
    })
    .finally(() => {
      Trace.loading = null;
    });
  return Trace.loading;
}

// ── 单条消息的「过程细节」：把该轮的轨迹事件内联展开在消息下方 ──
// 归属规则：事件时间落在 (上一条消息时间, 本条消息时间] 区间内 = 属于这一轮
function buildMsgWindows(messages) {
  const map = new Map();
  let prev = 0;
  for (const m of messages) {
    if (!m || !m.createdAt) continue;
    if (m.role !== 'user' && m.id) map.set(m.id, { from: prev, to: m.createdAt });
    prev = m.createdAt;
  }
  return map;
}

function traceEventsIn(win) {
  if (!Trace.data || !win) return [];
  // 上边界放宽 1.5s：最终回复落库时间略早于 result/task_end 事件
  return Trace.data.events.filter((e) => e.ts > win.from && e.ts <= win.to + 1500);
}

async function toggleMsgTrace(msgEl, win, btn) {
  const exist = msgEl.querySelector(':scope > .tr-inline');
  if (exist) {
    exist.remove();
    btn.classList.remove('on');
    return;
  }
  btn.classList.add('on');
  const box = document.createElement('div');
  box.className = 'tr-inline';
  box.innerHTML = '<div class="tr-inline-empty">加载中…</div>';
  msgEl.appendChild(box);
  try {
    await ensureTrace();
  } catch (e) {
    box.innerHTML = '<div class="tr-inline-empty">读取失败：' + escapeHtml(String(e.message || e)) + '</div>';
    return;
  }
  const evs = traceEventsIn(win);
  box.innerHTML = '';
  if (!evs.length) {
    box.innerHTML =
      '<div class="tr-inline-empty">这一轮没有留存过程数据' +
      '（该回复可能是本系统接管前、在终端里跑的）</div>';
    return;
  }
  // 小结条：工具次数 / 工具耗时 / 模型耗时
  const toolMs = evs.reduce((s, e) => s + (e.durationMs || 0), 0);
  const span = evs[evs.length - 1].ts - evs[0].ts;
  const calls = evs.filter((e) => e.kind === 'tool_use').length;
  const sum = document.createElement('div');
  sum.className = 'tr-inline-sum';
  sum.innerHTML =
    `本轮 <b>${fmtMs(span)}</b> · 工具 ${calls} 次 <b>${fmtMs(toolMs)}</b> · ` +
    `模型思考/生成 <b>${fmtMs(Math.max(0, span - toolMs))}</b> · 事件 ${evs.length} 条`;
  box.appendChild(sum);
  const slowLine = Math.max(0, ...evs.map((e) => e.durationMs || 0));
  evs.forEach((e) => box.appendChild(traceEl(e, slowLine)));
}

// 给一条 AI 消息的头部挂「🔍 过程」按钮
function attachTraceBtn(div, m) {
  const win = State.msgWindows?.get(m.id);
  if (!win) return;
  const head = div.querySelector('.msg-head');
  if (!head) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'trace-btn';
  btn.title = '展开这一轮的全过程（工具调用/入参/输出/耗时）';
  btn.textContent = '⤢';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMsgTrace(div, win, btn);
  });
  head.appendChild(btn);
}


async function openTrace() {
  if (!State.sessionId) return;
  $('trOverlay').hidden = false;
  $('trList').innerHTML = '<div class="tr-empty">加载中…</div>';
  await loadTrace();
}

function closeTrace() {
  $('trOverlay').hidden = true;
}

// ── 会话统计详情（右键 → 统计详情）：对任意会话做「时间花在哪」的细分分析 ──
// 数据源 GET /api/session/trace-stats（后端 TraceStore 已算好 phases/activeMs/rounds）。
// 与 trOverlay 不同：这里按传入的 sessionId 取数，不依赖当前打开的会话。
const Stats = { sid: '', title: '', charts: [] };
// 阶段元数据：key 对应后端 TracePhaseBreakdown 字段，label 走 i18n，color 固定配色
const STAT_PHASES = [
  { key: 'ttft', tk: 'phTtft', color: '#f59e0b' },
  { key: 'think', tk: 'phThink', color: '#8b5cf6' },
  { key: 'genTool', tk: 'phGenTool', color: '#2563eb' },
  { key: 'genText', tk: 'phGenText', color: '#06b6d4' },
  { key: 'toolExec', tk: 'phToolExec', color: '#16a34a' },
  { key: 'bgTask', tk: 'phBgTask', color: '#ec4899' },
  { key: 'startup', tk: 'phStartup', color: '#84cc16' },
  { key: 'idle', tk: 'phIdle', color: '#64748b' },
  { key: 'other', tk: 'phOther', color: '#94a3b8' },
];

async function openSessionStats(sessionId, title) {
  if (!sessionId) return;
  Stats.sid = sessionId;
  Stats.title = title || '';
  $('statsTitle').textContent = '📊 ' + T('statsTitle') + (title ? ' · ' + title : '');
  $('statsOverlay').hidden = false;
  await loadSessionStats();
}

function closeSessionStats() {
  _disposeStatsCharts();
  $('statsOverlay').hidden = true;
  Stats.sid = '';
}

function _disposeStatsCharts() {
  Stats.charts.forEach((c) => { try { c.dispose(); } catch { /* ignore */ } });
  Stats.charts = [];
}

async function loadSessionStats() {
  const body = $('statsBody');
  body.innerHTML = '<div class="tr-empty">' + T('statsLoading') + '</div>';
  let s;
  try {
    s = await api('/api/session/trace-stats?id=' + encodeURIComponent(Stats.sid));
  } catch (e) {
    body.innerHTML = '<div class="tr-empty">' + T('statsFailed') + escapeHtml(String(e.message || e)) + '</div>';
    return;
  }
  renderSessionStats(s);
}

function renderSessionStats(s) {
  _disposeStatsCharts();
  const body = $('statsBody');
  if (!s || !s.events) {
    body.innerHTML = '<div class="tr-empty">' + T('statsEmpty') + '</div>';
    return;
  }
  // 后端尚未重启（老进程无 phases 字段）时优雅降级，避免整页 JS 崩
  if (!s.phases) {
    body.innerHTML = '<div class="tr-empty">' + T('statsNeedRestart') + '</div>';
    return;
  }
  // 汇总条
  const cost = s.usage && s.usage.costUsd ? `<span>${T('statsCost')} <b>$${s.usage.costUsd.toFixed(4)}</b></span>` : '';
  const summary =
    `<div class="st-sum">
       <span>${T('statsSpan')} <b>${fmtMs(s.spanMs)}</b></span>
       <span>${T('statsActive')} <b>${fmtMs(s.activeMs)}</b></span>
       <span>${T('statsIdle')} <b>${fmtMs(s.phases.idle)}</b></span>
       <span>${T('statsRounds')} <b>${s.rounds}</b></span>
       <span>${T('statsEvents')} <b>${s.events}</b></span>
       <span>token in/out <b>${s.usage.inputTokens}/${s.usage.outputTokens}</b></span>
       ${cost}
     </div>`;

  // 阶段细分只看「AI 实际工作时间」如何分配（排除 idle——用户空闲已在汇总条单列）。
  // 占比按 activeMs 归一，各段之和≈100%。
  const rows = STAT_PHASES
    .filter((p) => p.key !== 'idle')
    .map((p) => ({ p, ms: s.phases[p.key] || 0 }))
    .filter((r) => r.ms > 0)
    .sort((a, b) => b.ms - a.ms);
  const legend = rows
    .map((r) => {
      const pct = s.activeMs ? Math.round((r.ms / s.activeMs) * 100) : 0;
      return `<div class="st-leg-i"><i style="background:${r.p.color}"></i>` +
        `<span class="st-leg-n">${T(r.p.tk)}</span>` +
        `<b>${fmtMs(r.ms)}</b><span class="st-leg-p">${pct}%</span></div>`;
    })
    .join('');

  // 按任务表（列同样排除 idle：任务内不含用户空闲）
  const colPhases = STAT_PHASES.filter((p) => p.key !== 'idle');
  const taskRows = (s.byTask || [])
    .map((t, i) => {
      const cells = colPhases.map((p) => {
        const ms = t.phases[p.key] || 0;
        return `<td>${ms ? fmtMs(ms) : '·'}</td>`;
      }).join('');
      const label = t.taskId === 'native' ? '终端/native' : (T('statsTaskCol') + ' ' + (i + 1));
      return `<tr><td class="st-tk">${escapeHtml(label)}</td><td><b>${fmtMs(t.totalMs)}</b></td>${cells}</tr>`;
    })
    .join('');
  const taskHead = colPhases.map((p) => `<th>${T(p.tk)}</th>`).join('');
  const taskTable = (s.byTask && s.byTask.length)
    ? `<div class="st-h">${T('statsByTaskTitle')}</div>
       <div class="st-tblwrap"><table class="st-tbl">
         <thead><tr><th>${T('statsTaskCol')}</th><th>${T('statsSpan')}</th>${taskHead}</tr></thead>
         <tbody>${taskRows}</tbody>
       </table></div>`
    : '';

  // 最慢工具调用
  const slow = (s.slowest || [])
    .filter((x) => x.ms > 0)
    .map((x) => `<div class="st-slow-i"><b>${fmtMs(x.ms)}</b><span class="st-slow-n">${escapeHtml(x.name)}</span>` +
      `<span class="st-slow-b">${escapeHtml(String(x.brief || '').replace(/\s+/g, ' ').slice(0, 120))}</span></div>`)
    .join('');
  const slowBlock = slow ? `<div class="st-h">${T('statsSlowTitle')}</div><div class="st-slow">${slow}</div>` : '';

  // 次数/数量统计块
  const c = s.counts || {};
  const kchips = [
    ['cTasks', c.tasks], ['cTurns', c.turns], ['cToolUses', c.toolUses], ['cToolErrors', c.toolErrors],
    ['cBgTasks', c.bgTasks], ['cRetries', c.retries], ['cTextBlocks', c.textBlocks], ['cThinkingBlocks', c.thinkingBlocks],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<span class="st-kc"><b>${v}</b>${T(k)}</span>`)
    .join('');
  const kchars = [
    ['cTextChars', c.textChars], ['cThinkingChars', c.thinkingChars], ['cToolOutputChars', c.toolOutputChars],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<span class="st-kc"><b>${fmtNum(v)}</b>${T(k)}</span>`)
    .join('');
  const countsBlock = (kchips || kchars)
    ? `<div class="st-h">${T('statsCountsTitle')}</div><div class="st-counts">${kchips}${kchars}</div>`
    : '';

  body.innerHTML =
    summary +
    countsBlock +
    `<div class="st-h">${T('statsPhaseTitle')}</div>` +
    `<div class="st-chart" id="statsPhaseChart"></div>` +
    `<div class="st-legend">${legend}</div>` +
    taskTable +
    slowBlock +
    `<div class="st-note">${T('statsNote')}</div>`;

  // ECharts 需要容器有尺寸：入文档后再画
  setTimeout(() => _renderPhaseChart(rows), 0);
}

// 横向条形图：每个阶段一根条（秒）。跟随明暗主题取色。
function _renderPhaseChart(rows) {
  const el = $('statsPhaseChart');
  if (!el || !el.isConnected || typeof echarts === 'undefined' || !rows.length) return;
  const cs = getComputedStyle(document.body);
  const cText = (cs.getPropertyValue('--text') || '#cbd5e1').trim();
  const cBorder = (cs.getPropertyValue('--border') || '#475569').trim();
  const ordered = [...rows].reverse(); // ECharts y 轴从下往上，反转后最大在顶
  const ch = echarts.init(el);
  ch.setOption({
    backgroundColor: 'transparent',
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v) => (v / 1000).toFixed(1) + 's' },
    xAxis: { type: 'value', axisLabel: { color: cText, formatter: (v) => (v / 1000).toFixed(0) + 's' },
      splitLine: { lineStyle: { color: cBorder, opacity: 0.4 } } },
    yAxis: { type: 'category', data: ordered.map((r) => T(r.p.tk)),
      axisLabel: { color: cText }, axisLine: { lineStyle: { color: cBorder } } },
    series: [{
      type: 'bar', data: ordered.map((r) => ({ value: r.ms, itemStyle: { color: r.p.color } })),
      barMaxWidth: 22, label: { show: true, position: 'right', color: cText,
        formatter: (o) => (o.value / 1000).toFixed(1) + 's' },
    }],
  });
  Stats.charts.push(ch);
}

async function loadTrace() {
  try {
    await ensureTrace(true);
  } catch (e) {
    $('trList').innerHTML = '<div class="tr-empty">读取失败：' + escapeHtml(String(e.message || e)) + '</div>';
    return;
  }
  renderTrace();
}

// 执行中轨迹事件很密集，抽屉打开时按 1.2s 节流刷新，避免频繁重绘
let traceReloadTimer = null;
function scheduleTraceReload() {
  if (traceReloadTimer) return;
  traceReloadTimer = setTimeout(() => {
    traceReloadTimer = null;
    if (!$('trOverlay').hidden) loadTrace();
  }, 1200);
}

function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
function fmtMs(ms) {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm' + Math.round((ms % 60000) / 1000) + 's';
}

function renderTrace() {
  const d = Trace.data;
  if (!d) return;
  const s = d.stats;
  const pctTool = s.spanMs ? Math.round((s.toolMs / s.spanMs) * 100) : 0;
  const tools = s.byTool
    .map((t) => `${escapeHtml(t.name)} ×${t.count} <b>${fmtMs(t.totalMs)}</b>(均 ${fmtMs(t.avgMs)})`)
    .join(' · ');
  $('trStats').innerHTML =
    `<div class="tr-row">
       <span>事件 <b>${s.events}</b>（实时 ${d.liveCount} / jsonl ${d.jsonlCount}）</span>
       <span>总跨度 <b>${fmtMs(s.spanMs)}</b></span>
       <span>工具 <b>${fmtMs(s.toolMs)}</b>（${pctTool}%，${s.toolCalls} 次）</span>
       <span>模型思考/生成 <b>${fmtMs(s.modelMs)}</b>（${100 - pctTool}%）</span>
       <span>token in/out <b>${s.usage.inputTokens}/${s.usage.outputTokens}</b>，缓存读 ${s.usage.cacheReadTokens}</span>
       ${s.usage.costUsd ? `<span>费用 <b>$${s.usage.costUsd.toFixed(4)}</b></span>` : ''}
     </div>
     <div class="tr-bar"><i class="tool" style="width:${pctTool}%"></i><i class="model" style="width:${100 - pctTool}%"></i></div>
     <div class="tr-tools">${tools || '（无工具调用）'}</div>`;

  // 种类过滤 chips
  const counts = {};
  d.events.forEach((e) => (counts[e.kind] = (counts[e.kind] || 0) + 1));
  $('trFilters').innerHTML = Object.keys(counts)
    .map(
      (k) =>
        `<button class="tr-chip${Trace.kinds.size === 0 || Trace.kinds.has(k) ? ' on' : ''}" data-kind="${k}">${k} ${counts[k]}</button>`,
    )
    .join('');
  $('trFilters').querySelectorAll('.tr-chip').forEach((b) =>
    b.addEventListener('click', () => {
      const k = b.dataset.kind;
      if (Trace.kinds.has(k)) Trace.kinds.delete(k);
      else Trace.kinds.add(k);
      renderTrace();
    }),
  );

  const slowLine = s.slowest.length ? s.slowest[0].ms : 0;
  const list = $('trList');
  list.innerHTML = '';
  const shown = d.events.filter((e) => Trace.kinds.size === 0 || Trace.kinds.has(e.kind));
  if (!shown.length) {
    list.innerHTML = '<div class="tr-empty">没有事件（该会话可能尚未运行过任务）</div>';
    return;
  }
  for (const e of shown) list.appendChild(traceEl(e, slowLine));
}

function traceEl(e, slowLine) {
  const el = document.createElement('details');
  el.className = 'tr-ev k-' + e.kind;
  const t = new Date(e.ts).toTimeString().slice(0, 8);
  const brief =
    e.kind === 'tool_use'
      ? `${e.name} ${JSON.stringify(e.input || {})}`
      : e.kind === 'tool_result'
        ? e.output || ''
        : e.text || e.name || '';
  const ms = e.durationMs !== undefined ? e.durationMs : e.gapMs;
  const slow = e.durationMs !== undefined && slowLine && e.durationMs >= slowLine * 0.5;
  const sum = document.createElement('summary');
  sum.innerHTML =
    `<span class="tr-t">${t}</span>` +
    `<span class="tr-k">${escapeHtml(e.kind === 'tool_use' ? e.name || 'tool' : e.kind)}</span>` +
    `<span class="tr-b">${escapeHtml(String(brief).replace(/\s+/g, ' ').slice(0, 200))}</span>` +
    `<span class="tr-ms${slow ? ' slow' : ''}">${e.durationMs !== undefined ? '⏱' : '·'}${fmtMs(ms)}</span>`;
  el.appendChild(sum);
  const pre = document.createElement('pre');
  const parts = [];
  if (e.text) parts.push(e.text);
  if (e.input !== undefined) parts.push('入参:\n' + JSON.stringify(e.input, null, 2));
  if (e.output) parts.push('输出:\n' + e.output);
  if (e.usage) parts.push('usage: ' + JSON.stringify(e.usage));
  if (e.raw !== undefined) parts.push('raw:\n' + JSON.stringify(e.raw, null, 2));
  pre.textContent = parts.join('\n\n') || '(无附加内容)';
  el.appendChild(pre);
  return el;
}

// ── 快捷前缀标签 ──
// 分组由用户在「系统设置」里自定义（后端 settings.quickGroups）。
// 规则：同一组内互斥（单选，再点同一个=取消）；组与组之间独立（可各选一个）。
// 选择按会话持久化（localStorage）。热键 Ctrl+1..9 按标签的整体先后顺序对应。
const QUICK_LS_KEY = 'hubQuickTag';
const Quick = { map: {} }; // sessionId -> { 组名: 标签 }

function quickGroups() {
  const g = State.settings.quickGroups;
  return Array.isArray(g) ? g : [];
}
// 扁平顺序（用于 Ctrl+数字 热键）：[{group, label}, ...]
function quickFlat() {
  const out = [];
  quickGroups().forEach((g) => (g.tags || []).forEach((t) => out.push({ group: g.name, label: t.label, prompt: t.prompt || '' })));
  return out;
}
function quickLoad() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUICK_LS_KEY) || '{}');
    Quick.map = raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    Quick.map = {};
  }
}
function quickSave() {
  try {
    localStorage.setItem(QUICK_LS_KEY, JSON.stringify(Quick.map));
  } catch (e) {
    /* 存储不可用时忽略，仅本次会话内生效 */
  }
}
function quickKey() {
  return State.sessionId || '__none__';
}
function quickSel() {
  const s = Quick.map[quickKey()];
  return s && typeof s === 'object' ? s : {};
}
// 点击/热键：同组内切换。已选中同一个 → 取消
function setQuick(group, label) {
  const key = quickKey();
  const sel = { ...quickSel() };
  if (sel[group] === label) delete sel[group];
  else sel[group] = label;
  if (Object.keys(sel).length) Quick.map[key] = sel;
  else delete Quick.map[key];
  quickSave();
  renderQuick();
}
function renderQuick() {
  const bar = $('quickBar');
  if (!bar) return;
  const groups = quickGroups();
  const sel = quickSel();
  const flat = quickFlat();
  bar.innerHTML = '';
  bar.hidden = groups.length === 0;
  flat.forEach((f, idx) => {
    const b = document.createElement('button');
    b.className = 'quick-tag' + (sel[f.group] === f.label ? ' on' : '');
    b.textContent = f.label;
    const hint = (f.prompt || '').trim();
    const key = idx < 9 ? 'Ctrl+' + (idx + 1) : '';
    b.title = [key, hint].filter(Boolean).join('　') || f.label;
    b.addEventListener('click', () => setQuick(f.group, f.label));
    bar.appendChild(b);
  });
}
// 选中按钮实际插入的一段文字：优先用按钮自定义的「含义/提示词」，留空则退化为 [按钮文字]；
// 组提示词（可选）拼在该组这段文字前面。
function quickTagText(group, tag) {
  const body = (tag.prompt || '').trim() || '[' + tag.label + ']';
  const gp = (group.prompt || '').trim();
  return gp ? gp + ' ' + body : body;
}
// 发送前给正文加上前缀（按组顺序拼接每个已选按钮的含义；未选中则原样返回）
function applyQuickPrefix(text) {
  const sel = quickSel();
  const parts = [];
  quickGroups().forEach((g) => {
    const tag = (g.tags || []).find((t) => t.label === sel[g.name]);
    if (tag) parts.push(quickTagText(g, tag));
  });
  return parts.length ? parts.join(' ') + ' ' + text : text;
}

// ── 任务操作 ──
// 无当前会话时按当前模式自动创建一个可用会话（新根目录、之前无会话、用户直接在输入框提交 = 自动开新会话）。
// 成功并有可用 sessionId 返回 true；需要用户先做选择（选目录/选根目录）则给出提示并返回 false。
async function ensureSession() {
  if (State.sessionId) return true;
  // 收藏夹视图：创建一个待绑定根目录的草稿会话（后续仍需绑定根目录才能发任务）。
  if (State.favoritesOnly) {
    createFavoriteDraftSession();
    const favRoot = favFilterRootId();
    if (favRoot) await bindFavoriteDraftRoot(favRoot); // 目录筛选中 → 直接绑定，省掉「请先选目录」
    return !!State.sessionId;
  }
  // 工作台模式：必须先选工作目录，无法静默创建，走原有目录选择流程。
  if (isWorkspace()) {
    openWsDir();
    return false;
  }
  // 经典模式：已选根目录即可直接创建真实会话。
  if (!State.rootId) {
    alert(T('selectRootFirst'));
    return false;
  }
  const s = await api('/api/session/create', {
    rootId: State.rootId,
    name: '',
    engine: State.settings.defaultEngine,
  });
  await loadSessions();
  await selectSession(s.id);
  return !!State.sessionId;
}
// 所有会话一视同仁（都是真实 claude 会话），直接对当前会话发任务即可。
async function addTask() {
  const ta = $('taskInput');
  const raw = ta.value.trim();
  if (!raw) return;
  if (!State.sessionId && !(await ensureSession())) return;
  if (State.session && !State.session.rootId) {
    alert(T('favoriteRootRequired'));
    return;
  }
  ta.value = '';
  clearNotices(); // 新消息开始 → 清掉上一轮遗留的失败提示
  try {
    await api('/api/task/add', { sessionId: State.sessionId, prompts: [applyQuickPrefix(raw)] });
  } catch (e) {
    ta.value = raw;
    alert(e.message || 'Submit failed');
  }
}
// ── 批量任务弹窗 ──
function parseTaskLines() {
  return $('tasksInput').value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
function updateTasksCount() {
  const n = parseTaskLines().length;
  $('tasksCount').textContent = `${n} ${T('tasksCountN')}`;
  $('tasksSubmit').disabled = n === 0;
}
function openTasksModal() {
  if (!State.sessionId) {
    alert(T('selectRootFirst'));
    return;
  }
  $('tasksInput').value = '';
  updateTasksCount();
  $('tasksOverlay').hidden = false;
  setTimeout(() => $('tasksInput').focus(), 50);
}
function closeTasksModal() {
  $('tasksOverlay').hidden = true;
}
async function submitTasks() {
  const prompts = parseTaskLines();
  if (prompts.length === 0 || !State.sessionId) return;
  if (State.session && !State.session.rootId) {
    alert(T('favoriteRootRequired'));
    return;
  }
  clearNotices(); // 新消息开始 → 清掉上一轮遗留的失败提示
  await api('/api/task/add', { sessionId: State.sessionId, prompts: prompts.map(applyQuickPrefix) });
  closeTasksModal();
}

async function stopTask() {
  if (!State.sessionId) return;
  const tasks = State.session?.tasks || [];
  const paused = !!State.session?.paused;
  // 后续仍在排队（未暂定）的任务数量
  const pending = tasks.filter((t) => t.status === 'pending' && !t.held).length;
  // 已处于暂停态，或没有后续排队任务 → 直接停止当前任务，无需二选一
  if (paused || pending === 0) {
    await api('/api/task/stop', { sessionId: State.sessionId });
    return;
  }
  // 有后续排队任务：询问「暂停整个序列」还是「停止当前、开始下一个」
  openStopChoice();
}
function openStopChoice() {
  $('stopChoiceOverlay').hidden = false;
}
function closeStopChoice() {
  $('stopChoiceOverlay').hidden = true;
}
// 暂停整个任务序列：停止当前 + 冻结后续（新消息将作为补充越过暂停执行）
async function stopChoicePause() {
  closeStopChoice();
  if (!State.sessionId) return;
  await api('/api/flow/pause', { sessionId: State.sessionId });
}
// 停止当前任务，继续下一个
async function stopChoiceNext() {
  closeStopChoice();
  if (!State.sessionId) return;
  await api('/api/task/stop', { sessionId: State.sessionId });
}
async function togglePause() {
  if (!State.session) return;
  const path = State.session.paused ? '/api/flow/resume' : '/api/flow/pause';
  await api(path, { sessionId: State.sessionId });
}
function refreshPauseBtn() {
  const paused = State.session?.paused;
  $('pausedBadge').style.display = paused ? '' : 'none';
  $('pausedBadge').textContent = T('paused');
  refreshComposerControls();
}
// 输入区控件随运行/暂停态刷新：
// - 停止按钮：仅有任务运行时显示；
// - 继续任务流按钮 + 暂停说明：仅暂停整条序列时显示；
// - 提交按钮/输入框文案：暂停时改为「补充并执行」语义。
function refreshComposerControls() {
  const running = isSessionRunning();
  const paused = !!State.session?.paused;
  $('stopBtn').style.display = running ? '' : 'none';
  const pauseBtn = $('pauseBtn');
  pauseBtn.style.display = paused ? '' : 'none';
  pauseBtn.textContent = T('resumeFlow');
  pauseBtn.className = 'primary sm';
  $('addTaskBtn').textContent = paused ? T('supplementSubmit') : T('addTask');
  $('taskInput').placeholder = paused ? T('supplementPlaceholder') : T('inputPlaceholder');
  $('pauseHint').style.display = paused ? '' : 'none';
}

// ── 引擎安装进度 ──
// 后端把 npm 输出逐行广播过来（kind='engineInstall'）；谁在装谁订阅（引导页 / 设置页）。
// 引擎包有几百 MB，没有进度显示会被当成卡死。
const EngineInstall = {
  handler: null,
  emit(line) { if (this.handler) this.handler(line); },
  watch(fn) { this.handler = fn; },
  stop() { this.handler = null; },
};

// 在 el 里显示「提示语 + 已用时 + npm 最近输出」，返回停止函数
function startEngineInstallProgress(el, headText) {
  const lines = [T('engInstWaiting')];
  const t0 = Date.now();
  const render = () => {
    const secs = Math.floor((Date.now() - t0) / 1000);
    el.textContent = `${headText}（${T('engInstElapsed').replace('{s}', secs)}）\n${lines.join('\n')}`;
    el.scrollTop = el.scrollHeight;
  };
  EngineInstall.watch((line) => {
    if (lines.length === 1 && lines[0] === T('engInstWaiting')) lines.length = 0;
    lines.push(String(line).slice(0, 500));
    if (lines.length > 40) lines.splice(0, lines.length - 40);
    render();
  });
  const timer = setInterval(render, 1000);
  render();
  return () => { clearInterval(timer); EngineInstall.stop(); };
}

// ── WebSocket 实时事件 ──
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(TOKEN)}`);
  ws.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    // 引擎/工具安装进度：没有 sessionId，必须在按会话过滤之前处理
    if (e.kind === 'engineInstall' || e.kind === 'toolInstall') { EngineInstall.emit(e.line); return; }
    // Claude 登录进度：同样没有 sessionId，且登录卡片要实时跟着后端状态走
    if (e.kind === 'claudeLogin') { onClaudeLoginEvent(e); return; }
    // 后端级异常：同样没有 sessionId，顶部横幅直接显示，别只写进服务器日志
    if (e.kind === 'serverError') { showServerError(e.message); return; }
    if (e.kind === 'session') {
      // 影响会话列表排序/暂停态
      if (State.session && e.session.id === State.session.id) {
        State.session.paused = e.session.paused;
        State.session.claudeSessionId = e.session.claudeSessionId; // 草稿首跑后拿到真实 uuid
        if (e.session.engine) State.session.engine = e.session.engine;
        refreshPauseBtn();
        refreshEngineControl(); // 拿到会话 id 即已开始 → 引擎锁定为徽章
      }
      return;
    }
    // 任务事件：无论是否当前会话，都据此更新侧栏"执行中"标识
    if (e.kind === 'task') {
      updateRunningFromTask(e.sessionId, e.task);
      if (e.task.status === 'done') dropTaskNotices(e.task.id); // 跑通了就撤掉中途的告警
    }
    // 运行提示（引擎无响应等）：任务还没结束就要让用户看到
    if (e.kind === 'notice') { pushNotice(e); return; }
    if (e.sessionId !== State.sessionId) return; // 其余（正文/过程）仅更新当前查看的会话
    // 轨迹事件：缓存标脏（下次展开「过程」时重新拉取）；全过程抽屉打开时顺带刷新
    if (e.kind === 'trace') {
      Trace.stale = true;
      if (!$('trOverlay').hidden) scheduleTraceReload();
      return;
    }
    if (e.kind === 'thinking') appendProcess('thinking', e.text);
    else if (e.kind === 'tool') appendProcess('tool', `${e.name} ${e.detail}`);
    else if (e.kind === 'output') appendProcess('output', e.text);
    else if (e.kind === 'message') {
      const wasEmpty = (State.session.messages || []).length === 0;
      State.session.messages.push(e.message);
      removeTypingIndicator();       // 新消息插到底部前先移除动画
      renderMessages();
      // 首条消息出现后，标题随之确定：刷新主区标题与会话列表
      if (wasEmpty) {
        $('sessionTitle').textContent = sessionTitle(State.session);
        const inList = State.sessions.find((x) => x.id === State.session.id);
        if (inList) inList.messages = State.session.messages;
        renderSessions();
      }
    } else if (e.kind === 'task') {
      upsertTask(e.task);
      renderNotices();               // 任务失败→右下角小圆圈亮起，点开才看现场（命令/目录/stderr）
      if (e.task.status === 'error') pulseNoticeFab();
      syncTypingIndicator();         // running→显示动画，结束→移除
      renderElapsedNotes();          // 任务结束→显示「耗时：X」
      refreshEngineControl();        // 有任务入队即已开始 → 引擎锁定
    } else if (e.kind === 'taskRemoved') removeTaskLocal(e.taskId);
  };
  ws.onclose = () => setTimeout(connectWs, 1500);
}

// ── 工具 ──
// 精确到秒的日期时间：YYYY-MM-DD HH:MM:SS
function fmtDateTime(ms) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// 人性化耗时：<60s → X.X秒，否则 X分Y秒
function fmtElapsed(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(1)}秒`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}分${r}秒`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 一次性初始化 markdown 渲染（marked + DOMPurify）。所有链接强制 _blank 新标签打开。
let _mdReady = false;
function initMarkdown() {
  if (_mdReady) return;
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') return;
  marked.setOptions({ gfm: true, breaks: true });
  // 净化后处理：外链 target=_blank + rel 防止 window.opener 利用；本页锚点保持原样
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  _mdReady = true;
}

// 把 markdown 文本渲染进元素；库不可用或解析失败则回退为纯文本。
function renderMarkdown(el, text) {
  initMarkdown();
  if (!_mdReady) {
    el.textContent = text;
    return;
  }
  try {
    const html = DOMPurify.sanitize(marked.parse(String(text || '')), { ADD_ATTR: ['target'] });
    el.innerHTML = html;
    el.classList.add('md');
  } catch {
    el.textContent = text;
  }
}

// ── AI 内联图表：解析 <chart> 数据块并用 ECharts 渲染 ──
// 约定（提示 AI 在回复里输出）：
//   <chart type="bar" title="各料欠数" x="料号" y="欠数">
//   [{"料号":"A","欠数":12},{"料号":"B","欠数":5}]
//   </chart>
// type 取 bar/line/pie/table；正文里的 <chart> 块会被移除，单独渲染成图表卡片。
const CHART_TYPES = ['bar', 'line', 'pie', 'table'];

function _chartAttrs(s) {
  const out = {};
  const re = /([a-zA-Z_]+)\s*=\s*"([^"]*)"|([a-zA-Z_]+)\s*=\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(s)) !== null) out[(m[1] || m[3]).toLowerCase()] = m[2] != null ? m[2] : (m[4] || '');
  return out;
}

// 从 AI 回复正文里抽取所有 <chart> 块，返回去除图表块后的正文 + 图表数组
function parseCharts(raw) {
  if (typeof raw !== 'string') return { text: '', charts: [] };
  const charts = [];
  let text = raw;
  // 1) <chart ...>JSON</chart> 标签格式（system prompt 指定）
  text = text.replace(/<chart\b([^>]*)>([\s\S]*?)<\/chart>/gi, (full, attrs, body) => {
    const c = _buildChart(body, _chartAttrs(attrs));
    if (c) { charts.push(c); return ''; }
    return full;
  });
  // 2) ```chart ... ``` 围栏格式（AI 实际常用，JSON 自带 type/title/data）
  text = text.replace(/```chart\s*([\s\S]*?)```/gi, (full, body) => {
    const c = _buildChart(body, {});
    if (c) { charts.push(c); return ''; }
    return full;
  });
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { text, charts };
}

// 把一段 JSON（数组或 {type,title,x,y,data/rows:[]}）+ 可选属性，构造成 chart 条目；失败返回 null
function _buildChart(body, attrs) {
  let j;
  try { j = JSON.parse(String(body).trim()); } catch { return null; }
  let rows = [];
  let { type, title, x, y } = attrs;
  if (Array.isArray(j)) {
    rows = j;
  } else if (j && typeof j === 'object') {
    rows = Array.isArray(j.data) ? j.data : Array.isArray(j.rows) ? j.rows : [];
    type = type || j.type;
    title = title || j.title;
    x = x || j.x;
    y = y || j.y;
  }
  if (!Array.isArray(rows) || !rows.length) return null;
  const t = CHART_TYPES.includes(type) ? type : 'bar';
  return { type: t, title: title || '', x: x || '', y: y || '', rows };
}

// 图表卡片：bar/line/pie 用 ECharts；table 渲染数据表。随窗口与主题自适应。
function chartCardEl(chart) {
  const card = document.createElement('div');
  card.className = 'msg-chart';
  const cols = chart.rows.length ? Object.keys(chart.rows[0]) : [];
  const isChart = chart.type === 'bar' || chart.type === 'line' || chart.type === 'pie';

  if (!isChart || typeof echarts === 'undefined') {
    // table（或 echarts 不可用时兜底成表）
    if (chart.title) {
      const tt = document.createElement('div');
      tt.className = 'mc-title';
      tt.textContent = chart.title;
      card.appendChild(tt);
    }
    const tbl = document.createElement('table');
    tbl.className = 'mc-table';
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; htr.appendChild(th); });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    const tb = document.createElement('tbody');
    chart.rows.forEach((r) => {
      const tr = document.createElement('tr');
      cols.forEach((c) => { const td = document.createElement('td'); td.textContent = r[c] == null ? '' : String(r[c]); tr.appendChild(td); });
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    card.appendChild(tbl);
    return card;
  }

  const xKey = chart.x && cols.includes(chart.x) ? chart.x : cols[0];
  const yKey = chart.y && cols.includes(chart.y) ? chart.y : (cols[1] || cols[0]);
  const el = document.createElement('div');
  el.className = 'mc-chart';
  card.appendChild(el);
  // ECharts 需要容器有尺寸：延后到入文档后初始化
  setTimeout(() => renderChart(el, chart, xKey, yKey), 0);
  return card;
}

const _CHART_PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
function renderChart(el, chart, xKey, yKey) {
  if (!el.isConnected || typeof echarts === 'undefined') return;
  const ch = echarts.init(el);
  const cats = chart.rows.map((r) => String(r[xKey] == null ? '' : r[xKey]));
  const vals = chart.rows.map((r) => Number(r[yKey]) || 0);
  // 跟随深/浅主题取轴线、文字、网格线颜色（CSS 变量）
  const cs = getComputedStyle(document.body);
  const cText = (cs.getPropertyValue('--text') || '#cbd5e1').trim();
  const cMuted = (cs.getPropertyValue('--muted') || '#94a3b8').trim();
  const cBorder = (cs.getPropertyValue('--border') || '#475569').trim();
  const axis = {
    nameTextStyle: { color: cMuted }, axisLabel: { color: cText },
    axisLine: { lineStyle: { color: cBorder } }, splitLine: { lineStyle: { color: cBorder, opacity: 0.4 } },
  };
  const common = {
    backgroundColor: 'transparent', color: _CHART_PALETTE, textStyle: { color: cText },
    title: { text: chart.title, left: 'center', top: 8, textStyle: { fontSize: 14, color: cText } },
    tooltip: { trigger: chart.type === 'pie' ? 'item' : 'axis' },
    grid: { left: 48, right: 24, bottom: 56, top: 48, containLabel: true },
  };
  let option;
  if (chart.type === 'pie') {
    option = { ...common, legend: { bottom: 0, type: 'scroll', textStyle: { color: cText } },
      series: [{ type: 'pie', radius: ['36%', '62%'], center: ['50%', '55%'],
        data: cats.map((name, i) => ({ name, value: vals[i] })),
        label: { formatter: '{b}: {d}%', color: cText }, itemStyle: { borderWidth: 2 } }] };
  } else {
    const maxLen = cats.reduce((mx, c) => Math.max(mx, c.length), 0);
    const needRotate = cats.length > 6 || maxLen > 6;
    const rotate = needRotate ? (cats.length > 14 || maxLen > 10 ? 45 : 30) : 0;
    option = { ...common,
      grid: { ...common.grid, bottom: needRotate ? 88 : 56 },
      xAxis: { type: 'category', data: cats, name: xKey, ...axis, axisLabel: { ...axis.axisLabel, interval: 0, rotate, fontSize: 11, width: 92, overflow: 'truncate' } },
      yAxis: { type: 'value', name: yKey, ...axis },
      series: [{ type: chart.type, data: vals, name: yKey, smooth: chart.type === 'line',
        areaStyle: chart.type === 'line' ? { opacity: 0.12 } : undefined,
        itemStyle: { borderRadius: chart.type === 'bar' ? [4, 4, 0, 0] : 0 }, barMaxWidth: 48 }] };
  }
  ch.setOption(option);
  ch.resize();
  _trackChart(ch);
}

// 跟踪已渲染图表，窗口尺寸变化时统一 resize（避免每图各自注册监听）
const _charts = [];
let _chartResizeBound = false;
function _trackChart(ch) {
  _charts.push(ch);
  if (!_chartResizeBound) {
    _chartResizeBound = true;
    window.addEventListener('resize', () => _charts.forEach((c) => { try { c.resize(); } catch { /* 已 dispose */ } }));
  }
}

// ── 会话文件：附件卡片 / 文件面板 / 预览抽屉 ──
const FILE_ICON = { image: '🖼', video: '🎬', audio: '🎵', pdf: '📕', sheet: '📊', md: '📝', text: '📄', doc: '📃', other: '📎' };
// 预览归类（与后端 SessionFiles._classify 对应）
const PREVIEW_GRID = ['xlsx', 'xls', 'csv'];
const PREVIEW_MD = ['md', 'markdown'];
const PREVIEW_PDF = ['pdf'];
const PREVIEW_IMG = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'];
const PREVIEW_VIDEO = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'];
const PREVIEW_AUDIO = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
// 从消息文本里抽取候选文件名的正则（不含空格的 token，以已知扩展名结尾）
const FILE_CAND_RE =
  /[^\s`"'()<>\[\]，。；：、]+\.(?:xlsx|xls|csv|md|markdown|txt|json|log|ya?ml|xml|html?|css|js|ts|tsx|jsx|py|java|go|rs|c|cpp|h|sh|bat|ini|conf|sql|pdf|png|jpe?g|gif|svg|webp|bmp|ico|mp4|webm|mov|m4v|ogv|mkv|mp3|wav|ogg|m4a|flac|aac|docx?|pptx?)/gi;

// 文件下载/预览直链（带 token，供 <a>/<img>/<iframe>/fetch 使用）
function fileUrl(name, download) {
  const q =
    'id=' + encodeURIComponent(State.sessionId) +
    '&name=' + encodeURIComponent(name) +
    '&token=' + encodeURIComponent(TOKEN) +
    (download ? '&download=1' : '');
  return '/api/session/file?' + q;
}

function kindOf(ext) {
  const e = (ext || '').toLowerCase();
  if (PREVIEW_GRID.includes(e)) return 'grid';
  if (PREVIEW_MD.includes(e)) return 'md';
  if (PREVIEW_PDF.includes(e)) return 'pdf';
  if (PREVIEW_IMG.includes(e)) return 'img';
  if (PREVIEW_VIDEO.includes(e)) return 'video';
  if (PREVIEW_AUDIO.includes(e)) return 'audio';
  return 'text';
}

// 给一条 AI 消息追加其引用到的、根目录内真实存在的文件附件卡片
async function attachFilesToMessage(div, m) {
  if (!m || m.role === 'user' || !State.sessionId) return;
  const sid = State.sessionId;
  const text = m.text || '';
  const cands = [];
  const seen = new Set();
  let match;
  FILE_CAND_RE.lastIndex = 0;
  while ((match = FILE_CAND_RE.exec(text)) && cands.length < 40) {
    const name = match[0].replace(/[.,;:]+$/, '');
    // 硬性规则：mem.md / struct.md / CLAUDE.md 不作为附件卡片（不预览/下载）
    const base = name.split(/[\\/]/).pop().toLowerCase();
    if (base === 'mem.md' || base === 'struct.md' || base === 'claude.md') continue;
    if (!seen.has(name)) { seen.add(name); cands.push(name); }
  }
  if (cands.length === 0) return;
  let files = [];
  try {
    files = await api('/api/session/files-resolve', { id: sid, names: cands });
  } catch {
    return;
  }
  // 会话可能在异步期间被切换：仅当仍是同一会话且节点在文档中时渲染
  if (State.sessionId !== sid || !div.isConnected || !files.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'msg-files';
  files.forEach((f) => wrap.appendChild(fileCardEl(f)));
  div.appendChild(wrap);
  const box = $('messages');
  box.scrollTop = box.scrollHeight;
}

// 聊天内附件卡片：图标 + 文件名 + 大小 + 预览/下载
function fileCardEl(f) {
  const row = document.createElement('div');
  row.className = 'msg-file';
  const display = f.name.split('/').pop();
  row.innerHTML =
    `<span class="mf-ico">${FILE_ICON[f.kind] || '📎'}</span>` +
    `<span class="mf-name" title="${escapeHtml(f.name)}">${escapeHtml(display)}</span>` +
    `<span class="mf-size">${f.sizeKb}KB</span>`;
  if (f.previewable) {
    const pv = document.createElement('button');
    pv.className = 'mf-btn';
    pv.textContent = T('preview');
    pv.addEventListener('click', () => openFilePreview(f));
    row.appendChild(pv);
  }
  const dl = document.createElement('a');
  dl.className = 'mf-btn primary';
  dl.href = fileUrl(f.name, true);
  dl.textContent = '⬇ ' + T('download');
  row.appendChild(dl);
  return row;
}

// ── 文件管理器（右侧抽屉：按根目录浏览/编辑/搜索/重点文件夹） ──
const FM = { rel: '', favorites: [], searchOpen: false, searchTimer: null, searching: false };

// 文件管理器下载/预览直链（按 rootId + 相对路径，带 token）
function fmFileUrl(rel, download) {
  return '/api/fm/file?rootId=' + encodeURIComponent(State.rootId) +
    '&rel=' + encodeURIComponent(rel) +
    '&token=' + encodeURIComponent(TOKEN) +
    (download ? '&download=1' : '');
}

async function toggleFilesPanel() {
  const ov = $('filesOverlay');
  if (!ov.hidden) { ov.hidden = true; return; }
  if (!State.rootId) { alert(T('selectRootFirst')); return; }
  ov.hidden = false;
  FM.searchOpen = false;
  $('fmSearch').hidden = true;
  $('fmSearchInput').value = '';
  await fmBrowse(FM.rel);
}
function closeFilesPanel() { $('filesOverlay').hidden = true; }

// 浏览某相对目录：刷新面包屑 / 重点文件夹 / 列表
async function fmBrowse(rel) {
  FM.searching = false;
  const list = $('filesList');
  list.innerHTML = `<div class="files-empty">${T('loading')}</div>`;
  let data;
  try {
    data = await api('/api/fm/browse?rootId=' + encodeURIComponent(State.rootId) +
      '&rel=' + encodeURIComponent(rel || ''));
  } catch (e) {
    list.innerHTML = `<div class="files-empty">${escapeHtml(e.message)}</div>`;
    return;
  }
  FM.rel = data.cwd;
  FM.favorites = data.favorites || [];
  $('filesPanelTitle').textContent = `📁 ${T('fileManager')}`;
  fmRenderCrumbs(data.breadcrumb);
  fmRenderFavs(FM.favorites);
  fmRenderList(data.dirs, data.files);
}

function fmRenderCrumbs(breadcrumb) {
  const box = $('fmCrumbs');
  box.innerHTML = '';
  (breadcrumb || []).forEach((c, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'fm-sep';
      sep.textContent = '/';
      box.appendChild(sep);
    }
    const b = document.createElement('button');
    b.className = 'fm-crumb' + (i === breadcrumb.length - 1 ? ' on' : '');
    b.textContent = c.name;
    b.title = c.rel;
    b.addEventListener('click', () => fmBrowse(c.rel));
    box.appendChild(b);
  });
}

function fmRenderFavs(favs) {
  const box = $('fmFavs');
  box.innerHTML = '';
  if (!favs || favs.length === 0) { box.hidden = true; return; }
  box.hidden = false;
  const star = document.createElement('span');
  star.className = 'fm-fav-lbl';
  star.textContent = '⭐';
  star.title = T('favorites');
  box.appendChild(star);
  favs.forEach((rel) => {
    const chip = document.createElement('button');
    chip.className = 'fm-chip';
    chip.textContent = rel.split('/').pop();
    chip.title = rel;
    chip.addEventListener('click', () => fmBrowse(rel));
    box.appendChild(chip);
  });
}

function fmRenderList(dirs, files) {
  const list = $('filesList');
  list.innerHTML = '';
  if ((!dirs || dirs.length === 0) && (!files || files.length === 0)) {
    list.innerHTML = `<div class="files-empty">${T('noFilesHere')}</div>`;
    return;
  }
  (dirs || []).forEach((d) => list.appendChild(fmDirRowEl(d)));
  (files || []).forEach((f) => list.appendChild(fmFileRowEl(f)));
}

function fmDirRowEl(d) {
  const row = document.createElement('div');
  row.className = 'file-row dir';
  const pinned = FM.favorites.includes(d.rel);
  row.innerHTML =
    `<span class="fr-ico">📁</span>` +
    `<span class="fr-name" title="${escapeHtml(d.rel)}">${escapeHtml(d.name)}</span>`;
  const pin = document.createElement('button');
  pin.className = 'fr-act fr-pin' + (pinned ? ' on' : '');
  pin.textContent = pinned ? '★' : '☆';
  pin.title = pinned ? T('unpin') : T('pin');
  pin.addEventListener('click', (e) => { e.stopPropagation(); fmTogglePin(d.rel); });
  row.appendChild(pin);
  row.addEventListener('click', () => fmBrowse(d.rel));
  return row;
}

function fmFileRowEl(f) {
  const row = document.createElement('div');
  row.className = 'file-row';
  const display = f.name.split('/').pop();
  row.innerHTML =
    `<span class="fr-ico">${FILE_ICON[f.kind] || '📎'}</span>` +
    `<span class="fr-name" title="${escapeHtml(f.name)}">${escapeHtml(display)}</span>` +
    `<span class="fr-size">${f.sizeKb}KB</span>`;
  if (f.editable) {
    const ed = document.createElement('button');
    ed.className = 'fr-act';
    ed.textContent = T('edit');
    ed.addEventListener('click', () => openEditor(f));
    row.appendChild(ed);
  }
  if (f.previewable) {
    const pv = document.createElement('button');
    pv.className = 'fr-act';
    pv.textContent = T('preview');
    pv.addEventListener('click', () => openFilePreview(f, fmFileUrl));
    row.appendChild(pv);
  }
  const dl = document.createElement('a');
  dl.className = 'fr-act';
  dl.href = fmFileUrl(f.name, true);
  dl.title = T('download');
  dl.textContent = '⬇';
  row.appendChild(dl);
  return row;
}

async function fmTogglePin(rel) {
  try {
    const data = await api('/api/fm/favorite', { rootId: State.rootId, rel });
    FM.favorites = data.favorites || [];
    fmRenderFavs(FM.favorites);
    // 重渲染当前列表以更新各目录的星标态（非搜索态才刷新）
    if (!FM.searching) await fmBrowse(FM.rel);
  } catch (e) {
    alert(e.message);
  }
}

// ── 文件管理器：搜索 ──
function fmToggleSearch() {
  FM.searchOpen = !FM.searchOpen;
  $('fmSearch').hidden = !FM.searchOpen;
  if (FM.searchOpen) {
    fmUpdateSearchClear();
    setTimeout(() => $('fmSearchInput').focus(), 30);
  } else {
    $('fmSearchInput').value = '';
    fmUpdateSearchClear();
    fmBrowse(FM.rel);
  }
}
function fmUpdateSearchClear() {
  $('fmSearchClear').hidden = !$('fmSearchInput').value;
}
function fmOnSearchInput() {
  clearTimeout(FM.searchTimer);
  const q = $('fmSearchInput').value.trim();
  fmUpdateSearchClear();
  if (!q) { fmBrowse(FM.rel); return; }
  FM.searchTimer = setTimeout(() => fmRunSearch(q), 300);
}
function fmClearSearch() {
  $('fmSearchInput').value = '';
  fmOnSearchInput();
  $('fmSearchInput').focus();
}
async function fmRunSearch(q) {
  const list = $('filesList');
  list.innerHTML = `<div class="files-empty">${T('loading')}</div>`;
  let files = [];
  try {
    files = await api('/api/fm/search?rootId=' + encodeURIComponent(State.rootId) +
      '&q=' + encodeURIComponent(q));
  } catch (e) {
    list.innerHTML = `<div class="files-empty">${escapeHtml(e.message)}</div>`;
    return;
  }
  FM.searching = true;
  $('fmCrumbs').innerHTML = `<span class="fm-crumb on">🔍 ${T('searchResults')} (${files.length})</span>`;
  list.innerHTML = '';
  if (files.length === 0) {
    list.innerHTML = `<div class="files-empty">${T('noSearchResults')}</div>`;
    return;
  }
  files.forEach((f) => list.appendChild(fmFileRowEl(f)));
}

// ── 文本编辑器（覆盖层） ──
const Editor = { file: null, original: '', dirty: false, readonly: false, cm: null };

// 扩展名 → CodeMirror 语法模式
function extToCmMode(ext) {
  const m = {
    js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript',
    jsx: 'text/jsx', ts: 'application/typescript', tsx: 'text/typescript-jsx',
    json: 'application/json',
    php: 'application/x-httpd-php', phtml: 'application/x-httpd-php',
    html: 'htmlmixed', htm: 'htmlmixed', vue: 'htmlmixed',
    xml: 'application/xml', svg: 'application/xml',
    css: 'text/css', scss: 'text/x-scss', sass: 'text/x-sass', less: 'text/css',
    py: 'text/x-python', rb: 'text/x-ruby', go: 'text/x-go', rs: 'text/x-rustsrc',
    c: 'text/x-csrc', h: 'text/x-csrc', cpp: 'text/x-c++src', cc: 'text/x-c++src',
    hpp: 'text/x-c++src', cs: 'text/x-csharp', java: 'text/x-java',
    sh: 'text/x-sh', bash: 'text/x-sh', zsh: 'text/x-sh',
    sql: 'text/x-sql', yaml: 'text/x-yaml', yml: 'text/x-yaml',
    md: 'text/x-markdown', markdown: 'text/x-markdown',
    dart: 'application/dart', swift: 'text/x-swift', kt: 'text/x-kotlin',
  };
  return m[ext] || null; // null → 纯文本（无高亮）
}

function ensureCm() {
  if (Editor.cm) return Editor.cm;
  Editor.cm = CodeMirror.fromTextArea($('edArea'), {
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    indentUnit: 2,
    tabSize: 2,
    lineWrapping: false,
    theme: cmTheme(),
  });
  Editor.cm.on('change', edMarkDirty);
  // Ctrl/Cmd+S 保存
  Editor.cm.setOption('extraKeys', {
    'Ctrl-S': () => saveEditor(),
    'Cmd-S': () => saveEditor(),
  });
  return Editor.cm;
}

async function openEditor(f) {
  let data;
  try {
    data = await api('/api/fm/read?rootId=' + encodeURIComponent(State.rootId) +
      '&rel=' + encodeURIComponent(f.name));
  } catch (e) {
    alert(T('loadFail') + ': ' + e.message);
    return;
  }
  Editor.file = f;
  Editor.original = data.content;
  Editor.readonly = !!data.truncated;
  Editor.dirty = false;
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const cm = ensureCm();
  cm.setOption('theme', cmTheme());
  cm.setOption('mode', extToCmMode(ext));
  cm.setOption('readOnly', Editor.readonly);
  cm.setValue(data.content);
  cm.clearHistory();
  // CodeMirror 会把 \r\n 规范成 \n，以规范化后的值为基准，避免 CRLF 文件一打开就被误判为已修改
  Editor.original = cm.getValue();
  Editor.dirty = false;
  $('edDirty').hidden = true;
  $('edTitle').textContent = '✎ ' + f.name.split('/').pop();
  $('edTitle').title = f.name;
  $('edSave').textContent = T('save');
  $('edSave').disabled = Editor.readonly;
  $('edDirty').hidden = true;
  $('edFoot').textContent = Editor.readonly ? '⚠ ' + T('tooLargeToEdit') : '';
  $('edFoot').className = 'ed-foot' + (Editor.readonly ? ' warn' : '');
  $('edOverlay').hidden = false;
  setTimeout(() => { cm.refresh(); cm.focus(); }, 30);
}

function edMarkDirty() {
  const cur = Editor.cm ? Editor.cm.getValue() : $('edArea').value;
  const d = cur !== Editor.original;
  Editor.dirty = d;
  $('edDirty').hidden = !d;
}

async function saveEditor() {
  if (!Editor.file || Editor.readonly) return;
  const content = Editor.cm ? Editor.cm.getValue() : $('edArea').value;
  const btn = $('edSave');
  btn.disabled = true;
  try {
    await api('/api/fm/write', { rootId: State.rootId, rel: Editor.file.name, content });
    Editor.original = content;
    Editor.dirty = false;
    $('edDirty').hidden = true;
    $('edFoot').textContent = '✓ ' + T('saved');
    $('edFoot').className = 'ed-foot ok';
    // 若文件面板正展示当前目录，刷新（大小/时间变化）
    if (!$('filesOverlay').hidden && !FM.searching) fmBrowse(FM.rel);
  } catch (e) {
    $('edFoot').textContent = '⚠ ' + T('saveFail') + ': ' + e.message;
    $('edFoot').className = 'ed-foot warn';
  } finally {
    btn.disabled = false;
  }
}

function closeEditor() {
  if (Editor.dirty && !confirm(T('confirmDiscard'))) return;
  $('edOverlay').hidden = true;
  if (Editor.cm) Editor.cm.setValue('');
  else $('edArea').value = '';
  Editor.file = null;
  Editor.dirty = false;
}

// ── 文件预览抽屉 ──
function closeFilePreview() {
  $('fpOverlay').hidden = true;
  $('fpBody').innerHTML = '';
  $('fpTabs').hidden = true;
  $('fpTabs').innerHTML = '';
}

async function openFilePreview(f, urlFn) {
  urlFn = urlFn || fileUrl;
  const name = f.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  const kind = kindOf(ext);
  const url = urlFn(name, false);
  const icon = kind === 'grid' ? '📊' : kind === 'img' ? '🖼' : kind === 'video' ? '🎬' : kind === 'audio' ? '🎵' : kind === 'pdf' ? '📕' : kind === 'md' ? '📝' : '📄';
  $('fpTitle').textContent = `${icon} ${name.split('/').pop()}`;
  $('fpTitle').title = name;
  $('fpDownload').href = urlFn(name, true);
  $('fpDownload').textContent = '⬇ ' + T('download');
  $('fpTabs').hidden = true;
  $('fpTabs').innerHTML = '';
  const body = $('fpBody');
  $('fpOverlay').hidden = false;

  if (kind === 'pdf') {
    body.innerHTML = `<iframe class="fp-frame" src="${url}" title="pdf"></iframe>`;
    return;
  }
  if (kind === 'img') {
    body.innerHTML = `<div class="fp-imgwrap"><img class="fp-img" src="${url}" alt="" /></div>`;
    return;
  }
  if (kind === 'video') {
    body.innerHTML = `<div class="fp-imgwrap"><video class="fp-video" src="${url}" controls autoplay playsinline></video></div>`;
    return;
  }
  if (kind === 'audio') {
    body.innerHTML = `<div class="fp-audiowrap"><audio class="fp-audio" src="${url}" controls autoplay></audio></div>`;
    return;
  }
  body.innerHTML = `<div class="fp-msg">${T('loading')}</div>`;
  try {
    if (kind === 'grid') {
      const buf = await (await fetch(url)).arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheets = wb.SheetNames.map((sn) => ({ name: sn, html: XLSX.utils.sheet_to_html(wb.Sheets[sn], { editable: false }) }));
      renderSheets(sheets);
    } else if (kind === 'md') {
      const raw = await (await fetch(url)).text();
      const el = document.createElement('div');
      el.className = 'msg-body fp-md'; // 复用 .msg-body.md 排版（renderMarkdown 会补 .md）
      renderMarkdown(el, raw);
      body.innerHTML = '';
      body.appendChild(el);
    } else {
      const raw = await (await fetch(url)).text();
      const mode = extToCmMode(ext);
      body.innerHTML = '';
      if (mode && window.CodeMirror) {
        // 代码文件：只读 CodeMirror 高亮预览
        const host = document.createElement('div');
        host.className = 'fp-code';
        body.appendChild(host);
        CodeMirror(host, {
          value: raw,
          mode,
          lineNumbers: true,
          readOnly: true,
          lineWrapping: false,
          theme: cmTheme(),
        });
      } else {
        const pre = document.createElement('pre');
        pre.className = 'fp-text';
        pre.textContent = raw;
        body.appendChild(pre);
      }
    }
  } catch (e) {
    body.innerHTML = `<div class="fp-msg err">⚠ ${T('previewFail')}：${escapeHtml(e.message)}</div>`;
  }
}

// 表格多工作表：标签页切换
function renderSheets(sheets) {
  const body = $('fpBody');
  const tabs = $('fpTabs');
  let active = 0;
  const draw = () => {
    body.innerHTML = `<div class="fp-sheet">${sheets[active] ? sheets[active].html : ''}</div>`;
  };
  if (sheets.length > 1) {
    tabs.hidden = false;
    tabs.innerHTML = '';
    sheets.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'fp-tab' + (i === active ? ' on' : '');
      b.textContent = s.name;
      b.addEventListener('click', () => {
        active = i;
        Array.from(tabs.children).forEach((c, j) => c.classList.toggle('on', j === active));
        draw();
      });
      tabs.appendChild(b);
    });
  }
  draw();
}

// ── 绑定 ──
function bind() {
  $('langBtn').addEventListener('click', toggleLang);
  $('guideBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleGuideMenu(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#guideMenu') && e.target.id !== 'guideBtn') closeGuideMenu();
  });
  $('gmQuick').addEventListener('click', () => { closeGuideMenu(); openGuide(); });
  $('gmLearn').addEventListener('click', openLearnCourse);
  $('guideClose').addEventListener('click', closeGuide);
  $('guideGotIt').addEventListener('click', closeGuide);
  $('guideOverlay').addEventListener('click', (e) => { if (e.target.id === 'guideOverlay') closeGuide(); });
  // 会话工具命令菜单 + 结果弹窗
  $('cmdMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleCmdMenu(); });
  document.addEventListener('click', (e) => {
    if (CmdMenu.open && !e.target.closest('.cmd-wrap')) closeCmdMenu();
  });
  $('cmdClose').addEventListener('click', closeCmdResult);
  $('cmdGotIt').addEventListener('click', closeCmdResult);
  $('cmdOverlay').addEventListener('click', (e) => { if (e.target.id === 'cmdOverlay') closeCmdResult(); });
  $('themeBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleThemePanel(); });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#themePanel') && e.target.id !== 'themeBtn') closeThemePanel();
  });
  $('logoutBtn').addEventListener('click', logout);
  $('aiCollapseBtn').addEventListener('click', toggleAiCollapse);
  $('loginForm').addEventListener('submit', doLogin);
  $('rootSelect').addEventListener('change', (e) => applyRootSelection(e.target.value));
  $('addRootBtn').addEventListener('click', addRoot);
  $('removeRootBtn').addEventListener('click', removeRoot);
  $('gitPushBtn').addEventListener('click', gitPush);
  // 根目录批量管理弹窗
  $('manageRootsBtn').addEventListener('click', openRootManage);
  $('rootManageClose').addEventListener('click', closeRootManage);
  $('rootManageOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'rootManageOverlay') closeRootManage();
  });
  $('rmAllChk').addEventListener('change', (e) => toggleRootManageAll(e.target.checked));
  $('rootManageDelete').addEventListener('click', deleteSelectedRoots);
  // 会话批量选择
  $('batchToggleBtn').addEventListener('click', () => toggleBatchMode());
  $('batchAllChk').addEventListener('change', (e) => toggleBatchAll(e.target.checked));
  $('batchDeleteBtn').addEventListener('click', deleteSelectedSessions);
  $('batchActBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleBatchMenu(); });
  $('batchMarkCompleted').addEventListener('click', () => markSelectedSessions('completed'));
  $('batchMarkTesting').addEventListener('click', () => markSelectedSessions('testing'));
  $('batchMarkActive').addEventListener('click', () => markSelectedSessions('active'));
  document.addEventListener('click', (e) => {
    if (!$('batchMenu').hidden && !e.target.closest('.batch-actions')) closeBatchMenu();
  });
  $('batchCancelBtn').addEventListener('click', () => { closeBatchMenu(); toggleBatchMode(false); });
  $('openFolderBtn').addEventListener('click', openFolder);
  $('gitPushToastClose').addEventListener('click', hideGitPushToast);
  // 编辑根目录备注 + 链接（入口为 rootMeta 内的 ✎ / 添加按钮）
  $('rootEditClose').addEventListener('click', closeRootEdit);
  $('addLinkBtn').addEventListener('click', () => addLinkRow('', ''));
  $('rootEditSave').addEventListener('click', saveRootEdit);
  $('rootEditOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'rootEditOverlay') closeRootEdit();
  });
  // 目录选择器
  $('pickerClose').addEventListener('click', closePicker);
  $('pickerHome').addEventListener('click', () => navigatePicker(''));
  $('pickerUp').addEventListener('click', () => navigatePicker(parentPath(Picker.path)));
  $('pickerGo').addEventListener('click', () => navigatePicker($('pickerPath').value.trim()));
  $('pickerNewDir').addEventListener('click', createDirInPicker);
  $('pickerPath').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigatePicker($('pickerPath').value.trim());
  });
  $('pickerSearch').addEventListener('input', onPickerSearch);
  $('pickerSelect').addEventListener('click', confirmPickDir);
  $('pickerOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'pickerOverlay') closePicker();
  });
  $('newSessionBtn').addEventListener('click', newSession);
  // 工作台：新建会话选目录弹窗
  $('wsDirClose').addEventListener('click', closeWsDir);
  $('wsDirBrowse').addEventListener('click', wsBrowseDir);
  $('wsDirUse').addEventListener('click', wsUseTypedDir);
  $('wsDirPath').addEventListener('keydown', (e) => { if (e.key === 'Enter') wsUseTypedDir(); });
  $('wsDirOverlay').addEventListener('click', (e) => { if (e.target.id === 'wsDirOverlay') closeWsDir(); });
  $('engineSelect').addEventListener('change', onEngineChange);
  // 设置：首页只有板块列表（renderSettingsNav），点某个板块进 #settingsPaneOverlay
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', closeSettings);
  $('settingsPaneBack').addEventListener('click', backToSettingsNav);
  $('settingsPaneClose').addEventListener('click', closeSettingsPane);
  $('settingsPaneSave').addEventListener('click', saveSettings);
  $('quickAddGroup').addEventListener('click', () => {
    QuickEdit.push({ name: '', prompt: '', tags: [{ label: '', prompt: '' }] });
    renderQuickEditor();
  });
  $('allowLanChk').addEventListener('change', renderLanGuide);
  $('autoCompactModeSelect').addEventListener('change', syncAutoCompactMode);
  $('lanForgotLink').addEventListener('click', toggleLanPwReset);
  $('lanPwResetBtn').addEventListener('click', resetLanPassword);
  // 添加工作目录引导 / 选择模板：点击遮罩关闭（新建项目表单不设遮罩关闭，避免误丢输入）
  $('addRootGuideOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'addRootGuideOverlay') closeAddRootGuide();
  });
  $('templatePickOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'templatePickOverlay') closeTemplatePicker();
  });
  // 首次设定密码
  $('setupForm').addEventListener('submit', doSetup);
  // 新手引导（onboard.js）
  $('onboardBack').addEventListener('click', onboardBack);
  $('onboardNext').addEventListener('click', onboardNext);
  // 引擎板块（pane-engine）内：两个引擎折叠块 + 各自的「高级选项」折叠
  $('engAccClaudeHead').addEventListener('click', () => toggleAcc('claude'));
  $('engAccCodexHead').addEventListener('click', () => toggleAcc('codex'));
  $('claudeAdvHead').addEventListener('click', () => toggleAdv('claude'));
  $('codexAdvHead').addEventListener('click', () => toggleAdv('codex'));
  // 服务商 → 模型联动：换服务商即清空并自动检测选中推荐模型；Key 填完（失焦/回车）也自动补
  $('claudeProviderSelect').addEventListener('change', onClaudeProviderChange);
  $('claudeApiKey').addEventListener('change', () => onApiKeySettled('claude'));
  $('claudeApiKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') onApiKeySettled('claude'); });
  $('claudeModelsBtn').addEventListener('click', fetchClaudeModels);
  $('claudeSaveBtn').addEventListener('click', saveClaudeProvider);
  $('codexProviderSelect').addEventListener('change', () => onEngineProviderChange('codex'));
  $('codexApiKey').addEventListener('change', () => onApiKeySettled('codex'));
  $('codexApiKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') onApiKeySettled('codex'); });
  $('codexModelsBtn').addEventListener('click', () => fetchEngineModels('codex'));
  $('codexSaveBtn').addEventListener('click', () => saveEngineProvider('codex'));
  // 更新引擎 + 修改密码
  $('tcRefreshBtn').addEventListener('click', renderToolchain);
  $('tcAllBundledBtn').addEventListener('click', () => setToolPreset('bundled'));
  $('tcAutoBtn').addEventListener('click', () => setToolPreset('auto'));
  // 模型选择：选定 + 两种检测（当前实际模型 / 可用模型），claude 与 codex 各一套；
  // 同一个下拉（claudeModelSelect/codexModelSelect）与「服务商」区共用，服务商变了会被清空重选
  $('claudeModelSelect').addEventListener('change', () => onModelSelect('claude'));
  $('codexModelSelect').addEventListener('change', () => onModelSelect('codex'));
  // 自定义服务商用的手填输入框：失焦/回车即落盘，和下拉行为一致
  $('claudeModelInput').addEventListener('change', () => onModelSelect('claude'));
  $('codexModelInput').addEventListener('change', () => onModelSelect('codex'));
  $('claudeModelInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') onModelSelect('claude'); });
  $('codexModelInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') onModelSelect('codex'); });
  // 思考强度：两个引擎各一个下拉，''=自动
  $('claudeEffortSelect').addEventListener('change', () => onEffortSelect('claude'));
  $('codexEffortSelect').addEventListener('change', () => onEffortSelect('codex'));
  $('mdlClaudeDetectBtn').addEventListener('click', () => detectCurrentModel('claude'));
  $('mdlCodexDetectBtn').addEventListener('click', () => detectCurrentModel('codex'));
  $('mdlClaudeListBtn').addEventListener('click', () => detectAvailableModels('claude'));
  $('mdlCodexListBtn').addEventListener('click', () => detectAvailableModels('codex'));
  $('pwChangeBtn').addEventListener('click', changePassword);
  $('searchToggleBtn').addEventListener('click', toggleSearch);
  $('favoritesToggleBtn').addEventListener('click', toggleFavorites);
  $('sessionSearch').addEventListener('input', onSearchInput);
  $('sessionSearchClear').addEventListener('click', clearSessionSearch);
  $('advSearch').addEventListener('change', onAdvToggle);
  document.querySelectorAll('.s-tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.querySelectorAll('.r-tab').forEach((b) => b.addEventListener('click', () => toggleRunFilter(b.dataset.runtab)));
  document.querySelectorAll('.ctx-status').forEach((b) => b.addEventListener('click', () => ctxSetStatus(b.dataset.status)));
  $('ctxRenameTitle').addEventListener('click', ctxRenameTitle);
  $('ctxToggleFavorite').addEventListener('click', ctxToggleFavorite);
  $('ctxTogglePinned').addEventListener('click', ctxTogglePinned);
  $('ctxTraceStats').addEventListener('click', ctxOpenStats);
  $('ctxOpenWorkdir').addEventListener('click', ctxOpenWorkdir);
  $('statsClose').addEventListener('click', closeSessionStats);
  $('statsRefreshBtn').addEventListener('click', loadSessionStats);
  document.addEventListener('click', (e) => {
    if (!$('sessionCtxMenu').hidden && !$('sessionCtxMenu').contains(e.target)) closeSessionCtxMenu();
  });
  document.addEventListener('scroll', closeSessionCtxMenu, true);
  $('addTaskBtn').addEventListener('click', addTask);
  $('stopBtn').addEventListener('click', stopTask);
  $('pauseBtn').addEventListener('click', togglePause);
  // 停止二选一弹窗
  $('stopChoiceClose').addEventListener('click', closeStopChoice);
  $('stopChoicePauseBtn').addEventListener('click', stopChoicePause);
  $('stopChoiceNextBtn').addEventListener('click', stopChoiceNext);
  $('stopChoiceOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'stopChoiceOverlay') closeStopChoice();
  });
  $('queueToggle').addEventListener('click', toggleQueue);
  // 批量任务弹窗
  $('addTasksBtn').addEventListener('click', openTasksModal);
  $('tasksClose').addEventListener('click', closeTasksModal);
  $('tasksInput').addEventListener('input', updateTasksCount);
  $('tasksSubmit').addEventListener('click', submitTasks);
  $('tasksOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'tasksOverlay') closeTasksModal();
  });
  // 任务管理弹窗
  $('qmClose').addEventListener('click', closeQueueModal);
  $('qmSelectAll').addEventListener('change', toggleSelectAll);
  $('qmBatchDelete').addEventListener('click', batchDeleteTasks);
  $('queueModal').addEventListener('click', (e) => {
    if (e.target.id === 'queueModal') closeQueueModal();
  });
  $('clearProcessBtn').addEventListener('click', () => ($('processLog').innerHTML = ''));
  // 文件管理器 + 预览抽屉 + 编辑器
  $('filesBtn').addEventListener('click', toggleFilesPanel);
  $('filesClose').addEventListener('click', closeFilesPanel);
  $('filesOverlay').addEventListener('click', (e) => { if (e.target.id === 'filesOverlay') closeFilesPanel(); });
  $('fmSearchBtn').addEventListener('click', fmToggleSearch);
  $('fmRefreshBtn').addEventListener('click', () => fmBrowse(FM.rel));
  $('fmSearchInput').addEventListener('input', fmOnSearchInput);
  $('fmSearchClear').addEventListener('click', fmClearSearch);
  $('fpClose').addEventListener('click', closeFilePreview);
  $('fpOverlay').addEventListener('click', (e) => { if (e.target.id === 'fpOverlay') closeFilePreview(); });
  $('edClose').addEventListener('click', closeEditor);
  $('edSave').addEventListener('click', saveEditor);
  $('edArea').addEventListener('input', edMarkDirty);
  $('edArea').addEventListener('keydown', (e) => {
    // Ctrl/Cmd+S 保存；Tab 插入两个空格（不跳出编辑框）
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveEditor();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const ta = e.target;
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s + 2;
      edMarkDirty();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('shotOverlay').hidden) closeShot();
    else if (!$('trOverlay').hidden) closeTrace();
    else if (!$('edOverlay').hidden) closeEditor();
    else if (!$('fpOverlay').hidden) closeFilePreview();
    else if (!$('filesOverlay').hidden) closeFilesPanel();
  });
  // 移动端抽屉 + 过程面板切换
  $('drawerBtn').addEventListener('click', toggleDrawer);
  $('scrim').addEventListener('click', closeDrawer);
  // 全过程视图
  $('traceBtn').addEventListener('click', openTrace);
  $('trClose').addEventListener('click', closeTrace);
  $('trRefreshBtn').addEventListener('click', loadTrace);
  $('trRawBtn').addEventListener('click', () => {
    Trace.raw = !Trace.raw;
    $('trRawBtn').style.color = Trace.raw ? 'var(--accent)' : '';
    loadTrace();
  });
  $('trOverlay').addEventListener('click', (e) => {
    if (e.target === $('trOverlay')) closeTrace();
  });
  $('procBtn').addEventListener('click', () => document.body.classList.toggle('show-process'));
  $('closeProcessBtn').addEventListener('click', () => document.body.classList.remove('show-process'));
  // 右下角错误小圆圈：点开/收起；点浮层外面或按 Esc 收起（点圆圈本身交给它自己 toggle）
  $('noticeFab').addEventListener('click', (e) => { e.stopPropagation(); toggleNoticePop(); });
  document.addEventListener('click', (e) => {
    if (!State.noticeOpen) return;
    if ($('noticeDock')?.contains(e.target)) return;
    toggleNoticePop(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && State.noticeOpen) toggleNoticePop(false);
  });
  // 快捷前缀标签：初始渲染 + Ctrl+1..9 热键（按标签整体顺序；重复按同一个=取消）
  quickLoad();
  renderQuick();
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
    const idx = '123456789'.indexOf(e.key);
    if (idx < 0) return;
    const flat = quickFlat();
    if (idx >= flat.length) return;
    e.preventDefault();
    setQuick(flat[idx].group, flat[idx].label);
  });
  $('taskInput').addEventListener('input', updateSlashMenu);
  $('taskInput').addEventListener('blur', () => setTimeout(closeSlashMenu, 120));
  $('taskInput').addEventListener('keydown', (e) => {
    // 斜杠候选菜单打开时：上下选择、回车/Tab 选中、Esc 关闭
    if (Slash.open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSlash(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveSlash(-1); return; }
      if (e.key === 'Escape') { e.preventDefault(); closeSlashMenu(); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.isComposing) {
        e.preventDefault();
        pickSlash();
        return;
      }
    }
    // 回车 = 加入任务；Shift+回车 = 换行
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      addTask();
    }
  });
  // 上传文件
  $('uploadBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (e) => {
    await uploadFiles(e.target.files);
    e.target.value = ''; // 允许重复选择同一文件
  });
  // 拖拽 / 粘贴 / 截屏
  initDragUpload();
  $('taskInput').addEventListener('paste', onPasteImage);
  $('shotBtn').addEventListener('click', captureScreenshot);
  $('shotCancel').addEventListener('click', closeShot);
  $('shotConfirm').addEventListener('click', confirmShot);
  const stage = $('shotStage');
  stage.addEventListener('pointerdown', shotDown);
  stage.addEventListener('pointermove', shotMove);
  stage.addEventListener('pointerup', shotUp);
}

// 已登录后才连接 WS / 加载数据
async function startApp() {
  connectWs();
  await loadSettings();
  await loadRoots();
  await markSetupDone();
}

// 老用户（已有密码即视为老用户）：一律不再弹引导，顺手把 setupDone 补成 true
async function markSetupDone() {
  try {
    const s = await api('/api/settings');
    if (s && !s.setupDone) await api('/api/settings', { setupDone: true, onboarded: true });
  } catch { /* 非关键路径，静默跳过 */ }
}

// ── 设置：默认引擎 ──
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    if (s && (s.defaultEngine === 'claude' || s.defaultEngine === 'codex')) {
      State.settings.defaultEngine = s.defaultEngine;
    }
    if (s && s.platform) State.settings.platform = s.platform;
    if (s) {
      State.settings.allowLan = !!s.allowLan;
      State.settings.preferBundled = !!s.preferBundled;
      State.settings.outEndReady = !!s.outEndReady;
      State.settings.lanUrls = Array.isArray(s.lanUrls) ? s.lanUrls : [];
      State.settings.port = Number(s.port) || 0;
      State.settings.systemPrompt = typeof s.systemPrompt === 'string' ? s.systemPrompt : '';
      State.settings.templateCollectionPath = typeof s.templateCollectionPath === 'string' ? s.templateCollectionPath : '';
      State.settings.quickGroups = Array.isArray(s.quickGroups) ? s.quickGroups : [];
      if (s.autoCompact) State.settings.autoCompact = s.autoCompact;
      renderQuick();
    }
  } catch { /* 忽略：用默认值 */ }
  // 仅 Windows 显示「前往」按钮（点击在本机文件管理器中打开根目录）
  const btn = $('openFolderBtn');
  if (btn) btn.hidden = State.settings.platform !== 'win32';
}
async function openFolder() {
  const root = currentRoot();
  if (!root) {
    alert(T('selectRootFirst'));
    return;
  }
  try {
    await api('/api/root/open', { rootId: root.id });
  } catch (e) {
    alert(e.message);
  }
}
// 局域网访问教程：随「允许局域网访问」勾选状态展开/收起，列出本机局域网地址（带复制按钮）。
function renderLanGuide() {
  const guide = $('lanGuide');
  const list = $('lanAddrList');
  const hint = $('lanGuideHint');
  if (!guide || !list) return;
  const on = $('allowLanChk').checked;
  guide.hidden = !on;
  // 每次重渲染都收起「忘记密码」重置框，避免残留状态
  const pwBox = $('lanPwReset');
  if (pwBox) pwBox.hidden = true;
  if (!on) return;
  const urls = Array.isArray(State.settings.lanUrls) ? State.settings.lanUrls : [];
  list.innerHTML = '';
  if (!urls.length) {
    const empty = document.createElement('div');
    empty.className = 'lan-addr-empty';
    empty.textContent = '未检测到局域网地址（本机可能未连接 WiFi / 有线网络）。连上网络后重开本面板即可看到地址。';
    list.appendChild(empty);
  } else {
    urls.forEach((url, i) => {
      const row = document.createElement('div');
      row.className = 'lan-addr-row';
      if (i === 0) {
        // 后端已按「越像真实局域网网卡」排序，第一个最可能是手机能访问的地址
        const rec = document.createElement('span');
        rec.className = 'lan-addr-rec';
        rec.textContent = '推荐';
        row.appendChild(rec);
        row.classList.add('recommended');
      }
      const a = document.createElement('span');
      a.className = 'lan-addr-url';
      a.textContent = url;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lan-copy-btn';
      btn.textContent = '📋';
      btn.title = T('copy');
      btn.addEventListener('click', () => copyText(url, btn, '📋'));
      row.appendChild(a);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }
  // 未保存/未重启时提示：更改需重启后局域网才真正可访问
  const needRestart = !State.settings.allowLan;
  const multi = urls.length > 1 ? '优先用「推荐」那条；其余多为虚拟网卡/VPN 地址（如 172.*），其他设备一般连不上，可忽略。' : '';
  const base = needRestart
    ? '⚠️ 开启后需保存并重启服务，局域网访问才会生效。生效后在上面地址首次访问需输入本工作台的访问密码。'
    : '首次访问需输入本工作台的访问密码；打开后可像本机一样使用。';
  hint.textContent = base + (multi ? ' ' + multi : '');
}

// ══ 设置：板块化导航 ══
// 设置首页只有一个板块列表，任何具体设置都要「点进去」进入对应 pane（#settingsPaneOverlay）。
// 每个板块自带 fill（进入时填表单）、save（离开/点保存时写 /api/settings 的局部 patch）与
// summary（列表里一眼看到当前状态，不必点进去）。
// saveKeys 为空数组＝该板块没有 /api/settings 字段（如引擎板块的服务商由自己的保存按钮写 engine/config）。
const SETTINGS_PANES = [
  {
    id: 'runtime',
    icon: '🔧',
    title: () => T('paneRuntime'),
    desc: () => T('paneRuntimeDesc'),
    summary: () => {
      const list = State.toolchain || [];
      if (!list.length) return T('paneRuntimeDesc');
      const miss = list.filter((t) => t.active === 'none').map((t) => t.label);
      return miss.length ? `缺少：${miss.join('、')}` : `全部就绪（${list.length} 项）`;
    },
    fill: fillRuntimePane,
    save: null, // 来源偏好改一个存一个（见 setToolPref），不走 pane 的统一保存
  },
  {
    id: 'engine',
    icon: '🤖',
    title: () => T('paneEngine'),
    desc: () => T('paneEngineDesc'),
    summary: () => {
      const e = State.settings.defaultEngine === 'codex' ? T('engineCodex') : T('engineClaude');
      return `${T('defaultEngine')}：${e}`;
    },
    fill: fillEnginePane,
    save: saveEnginePane,
  },
  {
    id: 'network',
    icon: '🌐',
    title: () => T('paneNetwork'),
    desc: () => T('paneNetworkDesc'),
    summary: () => (State.settings.allowLan ? T('paneNetworkOn') : T('paneNetworkOff')),
    fill: fillNetworkPane,
    save: saveNetworkPane,
  },
  {
    id: 'prompt',
    icon: '📝',
    title: () => T('panePrompt'),
    desc: () => T('panePromptDesc'),
    summary: () => {
      const n = quickGroups().length;
      const p = (State.settings.systemPrompt || '').trim();
      return [p ? T('panePromptSet') : T('panePromptEmpty'), T('paneQuickN').replace('{n}', n)].join(' · ');
    },
    fill: fillPromptPane,
    save: savePromptPane,
  },
  {
    id: 'context',
    icon: '🗜️',
    title: () => T('paneContext'),
    desc: () => T('paneContextDesc'),
    summary: () => {
      const ac = State.settings.autoCompact || {};
      return ac.mode === 'custom'
        ? T('paneContextCustom').replace('{n}', formatTokens(ac.tokens))
        : T('paneContextAuto');
    },
    fill: fillContextPane,
    save: saveContextPane,
  },
  {
    id: 'template',
    icon: '📁',
    title: () => T('paneTemplate'),
    desc: () => T('paneTemplateDesc'),
    summary: () => State.settings.templateCollectionPath || T('paneTemplateEmpty'),
    fill: fillTemplatePane,
    save: saveTemplatePane,
  },
];
function paneById(id) {
  return SETTINGS_PANES.find((p) => p.id === id) || null;
}

function openSettings() {
  renderSettingsNav();
  $('settingsOverlay').hidden = false;
}
function closeSettings() {
  $('settingsOverlay').hidden = true;
}

// 板块列表：图标 + 标题 + 说明 + 当前状态摘要 + ›
function renderSettingsNav() {
  const box = $('settingsNav');
  box.innerHTML = '';
  for (const p of SETTINGS_PANES) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'sx-navi';
    const ic = document.createElement('span');
    ic.className = 'sx-navi-ic';
    ic.textContent = p.icon;
    const tx = document.createElement('span');
    tx.className = 'sx-navi-tx';
    const b = document.createElement('b');
    b.textContent = p.title();
    const em = document.createElement('em');
    em.textContent = p.desc();
    const sum = document.createElement('span');
    sum.className = 'sx-navi-sum';
    sum.textContent = p.summary();
    tx.append(b, em, sum);
    const arr = document.createElement('span');
    arr.className = 'sx-navi-arrow';
    arr.textContent = '›';
    row.append(ic, tx, arr);
    row.addEventListener('click', () => openSettingsPane(p.id));
    box.appendChild(row);
  }
}

// 当前打开的板块 id（null=没开）；保存/返回都以它为准
let CurrentPane = null;

function openSettingsPane(id) {
  const p = paneById(id);
  if (!p) return;
  CurrentPane = id;
  for (const q of SETTINGS_PANES) $(`pane-${q.id}`).hidden = q.id !== id;
  $('settingsPaneTitle').textContent = `${p.icon} ${p.title()}`;
  $('settingsPaneSave').textContent = T('save');
  $('settingsPaneOverlay').hidden = false;
  $('settingsPaneOverlay').querySelector('.sx-body').scrollTop = 0;
  if (p.fill) p.fill();
}
// 返回板块列表：先落盘本板块的改动，再刷新列表摘要
async function backToSettingsNav() {
  await saveCurrentPane();
  CurrentPane = null;
  $('settingsPaneOverlay').hidden = true;
  renderSettingsNav();
}
// 直接关掉整个设置（也先保存，避免改了没生效）
async function closeSettingsPane() {
  await saveCurrentPane();
  CurrentPane = null;
  $('settingsPaneOverlay').hidden = true;
  closeSettings();
}
// 提交当前板块负责的 /api/settings 字段（局部 patch，后端 SettingsStruct.update 只认传入的键）
async function saveCurrentPane() {
  const p = paneById(CurrentPane);
  if (!p) return;
  if (p.save) { await p.save(); return; }
  if (!p.saveKeys || !p.saveKeys.length) return;
  await patchSettings(collectPaneKeys(p.saveKeys));
}
// 按字段名从 DOM 收集值（供 saveKeys 声明式保存）
function collectPaneKeys(keys) {
  const patch = {};
  for (const k of keys) {
    if (k === 'allowLan') patch.allowLan = $('allowLanChk').checked;
  }
  return patch;
}
// 统一的 /api/settings 局部提交 + 同步 State（失败不打断 UI，仅在控制台留痕）
async function patchSettings(patch) {
  if (!patch || !Object.keys(patch).length) return null;
  try {
    const s = await api('/api/settings', patch);
    State.settings.defaultEngine = s.defaultEngine;
    State.settings.allowLan = !!s.allowLan;
    State.settings.preferBundled = !!s.preferBundled;
    State.settings.systemPrompt = typeof s.systemPrompt === 'string' ? s.systemPrompt : '';
    State.settings.templateCollectionPath =
      typeof s.templateCollectionPath === 'string' ? s.templateCollectionPath : '';
    State.settings.quickGroups = Array.isArray(s.quickGroups) ? s.quickGroups : [];
    if (s.autoCompact) State.settings.autoCompact = s.autoCompact;
    renderQuick();
    return s;
  } catch (e) {
    console.warn('保存设置失败：', e.message);
    return null;
  }
}

// ── 各板块的 fill / save ──
// 引擎板块：默认引擎 + 两个引擎的服务商/模型折叠块（进入时才拉取，避免主设置一开就打一堆请求）
// 引擎板块的静态文案：标签、服务商下拉选项、按钮、占位符。
// 首屏与「切语言」都经 applyText 走这里，保证界面只出现当前语言。
function applyEnginePaneText() {
  for (const engine of ['claude', 'codex']) {
    const cap = engine === 'claude' ? 'Claude' : 'Codex';
    const u = providerUi(engine);
    $(`${engine}ProviderLbl`).textContent = T('engProviderLabel');
    // 服务商下拉的选项由 HTML 定义（顺序/值），这里只按 value 改文案
    for (const o of u.select.options) o.textContent = providerOptionText(engine, o.value);
    $(`${engine}BaseUrlLbl`).textContent = T(engine === 'claude' ? 'engBaseUrlClaude' : 'engBaseUrlCodex');
    u.base.placeholder = T(engine === 'claude' ? 'engBaseUrlPhClaude' : 'engBaseUrlPhCodex');
    $(`${engine}ModelsUrlLbl`).textContent = T('engModelsUrlLabel');
    u.modelsUrl.placeholder = T('engModelsUrlPh');
    $(`${engine}ApiKeyLbl`).textContent = T('engApiKeyLabel');
    u.key.placeholder = T('engApiKeyPh');
    $(`${engine}ModelLbl`).textContent = T('engModelLabel');
    u.modelInput.placeholder = T('engModelPh');
    u.modelHint.textContent = T('engModelHintCustom');
    $(`${engine}EffortLbl`).textContent = T('engEffortLabel');
    $(`${engine}EffortNote`).textContent = T(engine === 'claude' ? 'engEffortNoteClaude' : 'engEffortNoteCodex');
    $(`${engine}AdvLabel`).textContent = T('advOptions');
    $(`${engine}ModelsBtn`).textContent = T('engRefetchModels');
    $(`mdl${cap}DetectBtn`).textContent = T('engDetectCurrent');
    $(`mdl${cap}ListBtn`).textContent = T('engDetectAvailable');
    $(`${engine}SaveBtn`).textContent = T(engine === 'claude' ? 'engSaveClaude' : 'engSaveCodex');
    syncModelProviderTag(engine);
  }
  // 「逐个真实验证」只有 claude 有（原版订阅没有模型列表接口，只能挨个试）
  $('mdlClaudeVerifyTitle').textContent = T('engVerifyTitle');
  $('mdlClaudeVerifyDesc').textContent = T('engVerifyDesc');
  // 登录卡整块都是拼出来的文案，切语言要重画（走缓存，不再拉一次 auth status）
  // （Health.loginBox 也可能指向引导页那个框，那时别拿引擎板块的可见性去判断）
  const login = providerUi('claude').login;
  if (login && !login.hidden && Health.loginBox === login) paintClaudeLogin();
}
// 服务商下拉的选项文字：原版按引擎分两种说法，MiniMax 在 claude 侧带「推荐」后缀
function providerOptionText(engine, id) {
  if (id === 'official') return T(engine === 'claude' ? 'pvOfficialClaude' : 'pvOfficialCodex');
  if (id === 'minimax' && engine === 'claude') return T('pvMinimax') + T('pvMinimaxTag');
  return providerLabel(id);
}

function fillEnginePane() {
  $('defaultEngineSelect').value = State.settings.defaultEngine;
  $('defaultEngineNote').textContent = T('defaultEngineNote');
  setAdvOpen('claude', false);
  setAdvOpen('codex', false);
  // 默认展开当前默认引擎那一块，另一块收起
  const claudeFirst = State.settings.defaultEngine !== 'codex';
  setAccOpen('claude', claudeFirst);
  setAccOpen('codex', !claudeFirst);
  loadClaudeProvider();
  loadEngineProvider('codex');
  loadModelState();
}
async function saveEnginePane() {
  const eng = $('defaultEngineSelect').value === 'codex' ? 'codex' : 'claude';
  await patchSettings({ defaultEngine: eng });
}

function fillNetworkPane() {
  $('allowLanChk').checked = !!State.settings.allowLan;
  renderLanGuide();
  $('pwStatus').textContent = '';
  $('pwOld').value = '';
  $('pwNew').value = '';
}
async function saveNetworkPane() {
  const allowLan = $('allowLanChk').checked;
  const wasLan = State.settings.allowLan;
  await patchSettings({ allowLan });
  if (wasLan !== State.settings.allowLan) alert(T('lanNeedRestart'));
}

function fillPromptPane() {
  $('systemPromptInput').value = State.settings.systemPrompt || '';
  quickEditLoad();
}
async function savePromptPane() {
  await patchSettings({
    systemPrompt: $('systemPromptInput').value,
    quickGroups: quickEditCollect(),
  });
}

// ── 快捷按钮 GUI 编辑器 ──
// QuickEdit 是进入面板时对 quickGroups 的可编辑副本；文字输入实时写回副本（不重渲染，避免丢焦点），
// 增删分组/按钮才重渲染。保存时经 quickEditCollect 清洗后写入 settings.quickGroups。
let QuickEdit = [];
function quickEditLoad() {
  QuickEdit = quickGroups().map((g) => ({
    name: g.name || '',
    prompt: g.prompt || '',
    tags: (g.tags || []).map((t) => ({ label: t.label || '', prompt: t.prompt || '' })),
  }));
  renderQuickEditor();
}
// 收集为后端结构：丢掉空按钮/空组，含义/组提示词留空则不带该字段
function quickEditCollect() {
  const out = [];
  for (const g of QuickEdit) {
    const tags = [];
    for (const t of g.tags) {
      const label = (t.label || '').trim();
      if (!label) continue;
      const prompt = (t.prompt || '').trim();
      tags.push(prompt ? { label, prompt } : { label });
    }
    if (!tags.length) continue;
    const name = (g.name || '').trim() || `组${out.length + 1}`;
    const prompt = (g.prompt || '').trim();
    out.push(prompt ? { name, prompt, tags } : { name, tags });
  }
  return out;
}
function renderQuickEditor() {
  const box = $('quickEditor');
  if (!box) return;
  box.innerHTML = '';
  if (!QuickEdit.length) {
    const empty = document.createElement('div');
    empty.className = 'qedit-empty';
    empty.textContent = '还没有快捷按钮。点下方「＋ 添加分组」创建第一个。';
    box.appendChild(empty);
  }
  QuickEdit.forEach((g, gi) => box.appendChild(quickEditGroupCard(g, gi)));
}
// 一个分组卡片：组名 + 组提示词 + 按钮列表 + 增/删
function quickEditGroupCard(g, gi) {
  const card = document.createElement('div');
  card.className = 'qedit-group';

  const head = document.createElement('div');
  head.className = 'qedit-ghead';
  const nameIn = document.createElement('input');
  nameIn.className = 'sx-input qedit-gname';
  nameIn.placeholder = '分组名称（如：深度）';
  nameIn.value = g.name;
  nameIn.addEventListener('input', () => (g.name = nameIn.value));
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'qedit-del-group';
  del.textContent = '删除分组';
  del.addEventListener('click', () => {
    QuickEdit.splice(gi, 1);
    renderQuickEditor();
  });
  head.append(nameIn, del);

  const gp = document.createElement('input');
  gp.className = 'sx-input qedit-gprompt';
  gp.placeholder = '组提示词（可选，选中该组任一按钮时一并附加）';
  gp.value = g.prompt;
  gp.addEventListener('input', () => (g.prompt = gp.value));

  const tagsBox = document.createElement('div');
  tagsBox.className = 'qedit-tags';
  g.tags.forEach((t, ti) => tagsBox.appendChild(quickEditTagRow(g, gi, t, ti)));

  const addTag = document.createElement('button');
  addTag.type = 'button';
  addTag.className = 'qedit-add-tag';
  addTag.textContent = '＋ 添加按钮';
  addTag.addEventListener('click', () => {
    g.tags.push({ label: '', prompt: '' });
    renderQuickEditor();
  });

  card.append(head, gp, tagsBox, addTag);
  return card;
}
// 一行按钮：按钮文字 + 含义/提示词 + 删除
function quickEditTagRow(g, gi, t, ti) {
  const row = document.createElement('div');
  row.className = 'qedit-tag';
  const labelIn = document.createElement('input');
  labelIn.className = 'sx-input qedit-tlabel';
  labelIn.placeholder = '按钮文字';
  labelIn.value = t.label;
  labelIn.addEventListener('input', () => (t.label = labelIn.value));
  const promptIn = document.createElement('input');
  promptIn.className = 'sx-input qedit-tprompt';
  promptIn.placeholder = '含义 / 对应提示词（可选，留空则加 [按钮文字] 前缀）';
  promptIn.value = t.prompt;
  promptIn.addEventListener('input', () => (t.prompt = promptIn.value));
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'qedit-del-tag';
  del.title = '删除该按钮';
  del.textContent = '×';
  del.addEventListener('click', () => {
    g.tags.splice(ti, 1);
    renderQuickEditor();
  });
  row.append(labelIn, promptIn, del);
  return row;
}

// ── 上下文自动压缩板块 ──
// 只作用于 Claude Code（Codex 由其自身机制处理，故面板里直接说明，不给它开关）。
const AUTO_COMPACT_MIN = 100000;
const AUTO_COMPACT_MAX = 1000000;
const AUTO_COMPACT_DEFAULT = 200000;

// 20 万 → 「20 万」/「200k」：摘要里给人看的写法，不参与任何计算
function formatTokens(n) {
  const v = Number(n) || 0;
  if (LANG === 'zh') return `${Math.round(v / 10000)} 万`;
  return `${Math.round(v / 1000)}k`;
}

function fillContextPane() {
  const ac = State.settings.autoCompact || {};
  $('autoCompactModeSelect').value = ac.mode === 'custom' ? 'custom' : 'auto';
  $('autoCompactTokensInput').value = ac.tokens || AUTO_COMPACT_DEFAULT;
  syncAutoCompactMode();
}
// 切换模式：自定义才显示数字输入；备注行说明当前引擎设置对谁生效
function syncAutoCompactMode() {
  const custom = $('autoCompactModeSelect').value === 'custom';
  $('autoCompactCustomBox').hidden = !custom;
  const eng = State.settings.defaultEngine === 'codex' ? T('engineCodex') : T('engineClaude');
  $('autoCompactNote').textContent = T('paneContextScope').replace('{engine}', eng);
}
async function saveContextPane() {
  const mode = $('autoCompactModeSelect').value === 'custom' ? 'custom' : 'auto';
  const raw = Math.round(Number($('autoCompactTokensInput').value));
  const tokens = Number.isFinite(raw) && raw > 0
    ? Math.min(AUTO_COMPACT_MAX, Math.max(AUTO_COMPACT_MIN, raw))
    : AUTO_COMPACT_DEFAULT;
  await patchSettings({ autoCompact: { mode, tokens } });
}

function fillTemplatePane() {
  $('templateCollectionPathInput').value = State.settings.templateCollectionPath || '';
}
async function saveTemplatePane() {
  await patchSettings({ templateCollectionPath: $('templateCollectionPathInput').value });
}

// ── 运行环境面板：node / git / claude / codex 各自「本机 or 内置」──
// 内置版随软件自带、不需要安装；默认「自动」＝本机有就先用本机的。
const TC_PREFS = [
  { v: 'auto', label: '自动（本机优先）' },
  { v: 'system', label: '使用本机安装的' },
  { v: 'bundled', label: '使用内置的' },
];

function fillRuntimePane() {
  $('tcStatus').textContent = '';
  renderToolchain();
  // 网络体检排在工具链前面（决定「能不能连上」）。
  // Claude 账号登录已移到「AI 引擎」板块的原版服务商下——只有原版才需要登录
  runNetCheck($('hcBox'), {});
}

async function renderToolchain() {
  const box = $('tcList');
  box.innerHTML = '<div class="sx-note">检测中…</div>';
  let list;
  try {
    list = await api('/api/toolchain/status');
  } catch (e) {
    box.innerHTML = `<div class="sx-note err">检测失败：${e.message}</div>`;
    return;
  }
  State.toolchain = list;
  box.innerHTML = list.map(tcRow).join('');
  renderTcPreset(list);
  box.querySelectorAll('[data-tc-pref]').forEach((sel) => {
    sel.onchange = () => setToolPref(sel.dataset.tcPref, sel.value);
  });
  box.querySelectorAll('[data-tc-install]').forEach((btn) => {
    btn.onclick = () => installTool(btn.dataset.tcInstall, btn.dataset.tcTarget, btn);
  });
}

// 单个工具一行：状态徽章 + 本机/内置两处的版本 + 来源下拉 + 安装按钮
function tcRow(t) {
  const badge =
    t.active === 'none'
      ? `<span class="tc-badge bad">未安装</span>`
      : `<span class="tc-badge ok">正在使用：${t.active === 'system' ? '本机' : '内置'}</span>`;
  // 文件在但跑不起来（被杀软拦截/装坏）时，把原因直接摊在这一行下面——
  // 否则界面只显示「已安装」，用户根本查不出为什么发消息没反应
  const copy = (c, name, extra) =>
    `<div class="tc-copy${c.found ? '' : ' off'}${c.found && c.error ? ' broken' : ''}">` +
    `<b>${name}</b>` +
    (c.found
      ? `<em title="${escapeHtml(c.path)}">${escapeHtml(c.version || (c.error ? '跑不起来' : '已安装'))}</em>`
      : `<em>${extra || '未安装'}</em>`) +
    (c.found && c.error ? `<span class="tc-err">${escapeHtml(c.error)}</span>` : '') +
    '</div>';
  const opts = TC_PREFS.map(
    (p) => `<option value="${p.v}"${t.pref === p.v ? ' selected' : ''}>${p.label}</option>`,
  ).join('');
  const btns = [];
  if (t.globalInstallable)
    btns.push(
      `<button class="sx-btn" data-tc-install="${t.id}" data-tc-target="global">${t.system.found ? '更新本机版' : '安装到本机（全局）'}</button>`,
    );
  if (t.bundlable)
    btns.push(
      `<button class="sx-btn" data-tc-install="${t.id}" data-tc-target="bundled">${t.bundled.found ? '更新内置版' : '下载内置版'}</button>`,
    );
  return (
    `<div class="tc-item">` +
    `<div class="tc-head"><b>${t.label}</b>${t.optional ? '<span class="tc-opt">可选</span>' : ''}${badge}</div>` +
    `<div class="tc-purpose">${t.purpose}</div>` +
    `<div class="tc-copies">${copy(t.system, '本机')}${copy(t.bundled, '内置', t.bundlable ? '未下载' : '不提供内置版')}</div>` +
    `<div class="tc-actions"><select class="sx-input tc-sel" data-tc-pref="${t.id}">${opts}</select>${btns.join('')}</div>` +
    `<div class="sx-note sx-pre tc-install-status" data-tc-status="${t.id}" hidden></div>` +
    `</div>`
  );
}

// 一键模式覆盖的运行环境：node、git（claude / codex 不内置，一律 npm 全局安装，不参与）
const TC_SELF_CONTAINED = ['node', 'git'];

// 顶部「一键设置」区：显示当前是不是完全自包含，并提示还缺哪些内置件
function renderTcPreset(list) {
  const items = list.filter((t) => TC_SELF_CONTAINED.includes(t.id));
  const allBundled = items.every((t) => t.pref === 'bundled');
  $('tcPresetNow').textContent = allBundled ? '当前：全部使用内置' : '当前：自动 / 自定义';
  $('tcAllBundledBtn').disabled = allBundled;
  const missing = items.filter((t) => !t.bundled.found).map((t) => t.label);
  const warn = $('tcPresetWarn');
  if (allBundled && missing.length) {
    warn.hidden = false;
    warn.textContent = `注意：${missing.join('、')} 还没有内置版，这几项会临时回退到本机版本。请在下方点「下载内置版」补齐。`;
  } else {
    warn.hidden = true;
  }
}

async function setToolPreset(mode) {
  const box = $('tcStatus');
  try {
    await api('/api/toolchain/preset', { mode });
    box.className = 'sx-note sx-pre ok';
    box.textContent = mode === 'bundled' ? '已切换为：全部使用内置。' : '已切换为：自动（本机优先）。';
    await renderToolchain();
  } catch (e) {
    box.className = 'sx-note sx-pre err';
    box.textContent = `切换失败：${e.message}`;
  }
}

async function setToolPref(tool, pref) {
  const box = $('tcStatus');
  try {
    await api('/api/toolchain/prefer', { tool, pref });
    box.className = 'sx-note sx-pre ok';
    box.textContent = `已保存：${tool} → ${(TC_PREFS.find((p) => p.v === pref) || {}).label || pref}`;
    await renderToolchain();
  } catch (e) {
    box.className = 'sx-note sx-pre err';
    box.textContent = `保存失败：${e.message}`;
  }
}

async function installTool(tool, target, btn) {
  let box = btn?.closest('.tc-item')?.querySelector('[data-tc-status]');
  if (!box) box = document.querySelector(`[data-tc-status="${tool}"]`) || $('tcStatus');
  box.hidden = false;
  box.className = 'sx-note sx-pre';
  const label = target === 'global' ? '安装到本机' : '下载内置版';
  const stop = startEngineInstallProgress(box, `${tool}：${label}中，请勿关闭页面`);
  if (btn) btn.disabled = true;
  try {
    await api('/api/toolchain/install', { tool, target });
    stop();
    await renderToolchain();
    box = document.querySelector(`[data-tc-status="${tool}"]`) || box;
    box.hidden = false;
    box.className = 'sx-note sx-pre ok';
    box.textContent = `${tool} ${label}完成。`;
  } catch (e) {
    stop();
    box.className = 'sx-note sx-pre err';
    box.textContent = `${tool} ${label}失败：${e.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── 引擎折叠块内的「高级选项」（检测按钮/逐个验证），默认收起 ──
function advUi(engine) {
  const cap = engine === 'claude' ? 'Claude' : 'Codex';
  return { arrow: $(`${engine}AdvArrow`), body: $(`${engine}AdvBody`), cap };
}
function setAdvOpen(engine, open) {
  const u = advUi(engine);
  u.body.hidden = !open;
  u.arrow.textContent = open ? '▾' : '▸';
}
function toggleAdv(engine) {
  setAdvOpen(engine, advUi(engine).body.hidden);
}
function accUi(engine) {
  const cap = engine === 'claude' ? 'Claude' : 'Codex';
  return { arrow: $(`engAcc${cap}Arrow`), body: $(`engAcc${cap}Body`), sum: $(`engAcc${cap}Sum`) };
}
function setAccOpen(engine, open) {
  const u = accUi(engine);
  u.body.hidden = !open;
  u.arrow.textContent = open ? '▾' : '▸';
}
function toggleAcc(engine) {
  setAccOpen(engine, accUi(engine).body.hidden);
}
// 折叠时在标题行右侧显示一眼可见的当前状态：服务商 · 模型
function renderAccSummary(engine) {
  const u = providerUi(engine);
  // 摘要要短：括号里的补充说明（如「按量计费」）去掉，只留服务商名
  const pv = providerLabel(u.select.value).split(/[（(]/)[0].trim();
  const modelLabel = modelValue(engine) || T('effAutoShort');
  // 强度非自动时才进摘要（避免每个引擎都挂一个「自动」显得啰嗦）
  const effort = u.effort ? u.effort.value : '';
  accUi(engine).sum.textContent = `${pv} · ${modelLabel}${effort ? ' · ' + effort : ''}`;
}

// ── 服务商 / 模型 / 强度的展示名（唯一来源：trans.js，后端只下发 id）──
// 后端新增了前端还没加文案的 id 时，一律回落到 id 本身，绝不显示空白。
const PROVIDER_LABEL_KEY = {
  official: 'pvOfficial', minimax: 'pvMinimax', xiaomi: 'pvXiaomi',
  kimi: 'pvKimi', kimicode: 'pvKimicode', custom: 'pvCustom',
};
const PROVIDER_NOTE_KEY = {
  minimax: 'pvNoteMinimax', xiaomi: 'pvNoteXiaomi', kimi: 'pvNoteKimi', kimicode: 'pvNoteKimicode',
};
const EFFORT_LABEL_KEY = {
  low: 'effLow', medium: 'effMedium', high: 'effHigh', xhigh: 'effXhigh', max: 'effMax',
};
const MODEL_ALIAS_KEY = {
  opus: 'mdlAliasOpus', sonnet: 'mdlAliasSonnet', haiku: 'mdlAliasHaiku', fable: 'mdlAliasFable',
};
// 「检测当前模型」的来源/失败原因：后端下发稳定编码，认不出的原样展示（多为引擎或网络的原始报错）
const DETECT_SRC_KEY = {
  'claude-init': 'srcClaudeInit', 'codex-toml': 'srcCodexToml',
  'codex-catalog': 'srcCodexCatalog', codex: 'srcCodex',
};
const DETECT_ERR_KEY = {
  'init-no-model': 'errInitNoModel',
  'codex-catalog-empty': 'errCodexCatalogEmpty',
  'probe-timeout': 'errProbeTimeout',
};

function providerLabel(id, fallback) {
  return PROVIDER_LABEL_KEY[id] ? T(PROVIDER_LABEL_KEY[id]) : (fallback || id);
}
function providerNote(id, fallback) {
  return PROVIDER_NOTE_KEY[id] ? T(PROVIDER_NOTE_KEY[id]) : (fallback || '');
}
function effortLabel(id, fallback) {
  return EFFORT_LABEL_KEY[id] ? T(EFFORT_LABEL_KEY[id]) : (fallback || id);
}
function detectSourceLabel(src) {
  return DETECT_SRC_KEY[src] ? T(DETECT_SRC_KEY[src]) : (src || '');
}
function detectErrorLabel(err) {
  if (!err) return T('mdlUnknownReason');
  return DETECT_ERR_KEY[err] ? T(DETECT_ERR_KEY[err]) : err;
}
// 一条模型候选的展示文本：展示名 + 验证结果 + 备注
function modelOptionText(o) {
  const base = o.source === 'detected'
    ? `${o.id}${T('mdlSuffixDetected')}`
    : MODEL_ALIAS_KEY[o.id] ? T(MODEL_ALIAS_KEY[o.id]) : (o.label || o.id);
  const mark = o.verified === true ? ' ✓' : o.verified === false ? ' ✕' : '';
  // 备注多为验证失败原因：固定原因有编码可翻译，其余（引擎原始报错）原样带出
  return `${base}${mark}${o.note ? ` · ${detectErrorLabel(o.note)}` : ''}`;
}

// ── 模型这一栏：预设服务商用下拉；自定义服务商可直接手填 ──
// 自定义端点的模型列表未必拉得到（很多兼容网关没有 /models），所以那种情况必须允许自己写模型 id；
// 拉到的候选转成 datalist，输入时作为提示出现，两种方式共用同一个「当前模型」值。
function modelIsFree(engine) {
  return providerUi(engine).select.value === 'custom';
}
function modelValue(engine) {
  const u = providerUi(engine);
  return modelIsFree(engine) ? u.modelInput.value.trim() : u.model.value;
}
function setModelValue(engine, model) {
  const u = providerUi(engine);
  u.model.value = model || '';
  u.modelInput.value = model || '';
}
function clearModelChoices(engine) {
  const u = providerUi(engine);
  u.model.innerHTML = '';
  u.modelList.innerHTML = '';
}
// opts 为 [{id,label,source,verified,note}]；withAuto=true 时首项是「自动」（值为空）
function fillModelChoices(engine, opts, withAuto) {
  const u = providerUi(engine);
  clearModelChoices(engine);
  if (withAuto) u.model.appendChild(new Option(T('effAuto'), ''));
  for (const o of opts) {
    const text = modelOptionText(o);
    u.model.appendChild(new Option(text, o.id));
    u.modelList.appendChild(new Option(text, o.id));
  }
}

// ── 模型选择（claude / codex 各自一套；''=自动）──
// 后端 /api/model/* 提供：state(读) / select(选定) / detect(检测当前实际模型) / available(检测可用)
async function loadModelState() {
  try {
    const st = await api('/api/model/state');
    renderModelSection('claude', st && st.claude);
    renderModelSection('codex', st && st.codex);
  } catch (e) {
    // 后端未重启时该端点会 404，降级为不可用提示，不影响其他设置
    const msg = T('mdlStateFail').replace('{err}', e.message);
    setModelStatus('claude', msg, false);
    setModelStatus('codex', msg, false);
  }
}

// 渲染一个引擎的下拉 + 服务商标签 + 上次检测结果
// 注意：这个下拉（claudeModelSelect/codexModelSelect）与「服务商」区共用同一个 DOM 元素，
// 换服务商时（onEngineProviderChange）会先被清空，这里再按当前服务商的候选重新填充。
function renderModelSection(engine, s) {
  if (!s) return;
  const cap = engine === 'claude' ? 'Claude' : 'Codex';
  const sel = providerUi(engine).model;
  $(`mdl${cap}Provider`).textContent = providerLabel(s.provider);
  const opts = Array.isArray(s.options) ? s.options : [];
  // 标注来源与验证结果，让用户知道这条候选有多可信
  fillModelChoices(engine, opts, true);
  // 选定值不在候选里（例如刚换服务商）时补一条，避免显示错位
  if (s.selected && !opts.some((o) => o.id === s.selected)) {
    sel.appendChild(new Option(`${s.selected}${T('mdlSuffixSelected')}`, s.selected));
  }
  setModelValue(engine, s.selected || '');
  renderEffortSelect(engine, s);
  const d = s.detected;
  if (d) {
    setModelStatus(
      engine,
      d.ok
        ? T('mdlLastDetect').replace('{model}', d.model).replace('{src}', detectSourceLabel(d.source))
        : T('mdlLastDetectFail').replace('{err}', detectErrorLabel(d.error)),
      d.ok,
    );
  } else {
    setModelStatus(engine, '', null);
  }
  renderAccSummary(engine);
}

function setModelStatus(engine, text, ok) {
  const el = $(`mdl${engine === 'claude' ? 'Claude' : 'Codex'}Status`);
  el.className = 'sx-note' + (ok === true ? ' ok' : ok === false ? ' err' : '');
  el.textContent = text;
}

// 选定模型（含「自动」）；立即落盘，下一个任务生效
// 自定义服务商是手填的输入框，change（失焦/回车）时同样走这里
async function onModelSelect(engine) {
  const model = modelValue(engine);
  try {
    await api('/api/model/select', { engine, model });
    setModelStatus(
      engine,
      model ? T('mdlSelected').replace('{model}', model) : T('mdlSelectedAuto'),
      true,
    );
    renderAccSummary(engine);
  } catch (e) {
    setModelStatus(engine, T('engSaveFail').replace('{err}', e.message), false);
  }
}

// 检测当前实际生效的模型（真实探测引擎）
async function detectCurrentModel(engine) {
  setModelStatus(engine, T('mdlDetecting'), null);
  try {
    const d = await api('/api/model/detect', { engine });
    setModelStatus(
      engine,
      d && d.ok
        ? T('mdlDetected').replace('{model}', d.model).replace('{src}', detectSourceLabel(d.source))
        : T('mdlDetectFail').replace('{err}', detectErrorLabel(d && d.error)),
      !!(d && d.ok),
    );
    await loadModelState();
  } catch (e) {
    setModelStatus(engine, T('mdlDetectFail').replace('{err}', e.message), false);
  }
}

// 检测可用模型；结果写回候选下拉
async function detectAvailableModels(engine) {
  const verify = engine === 'claude' && $('mdlClaudeVerifyChk').checked;
  setModelStatus(engine, verify ? T('mdlVerifying') : T('mdlListing'), null);
  try {
    const r = await api('/api/model/available', { engine, verify });
    const n = (r && r.models ? r.models.length : 0);
    await loadModelState();
    setModelStatus(engine, T(verify ? 'mdlGotNVerified' : 'mdlGotN').replace('{n}', n), n > 0);
  } catch (e) {
    setModelStatus(engine, T('mdlGetFail').replace('{err}', e.message), false);
  }
}

// ── Claude Code / Codex 服务商（预设 + 自定义）──
function providerUi(engine) {
  const p = engine === 'claude' ? 'claude' : 'codex';
  return {
    select: $(`${p}ProviderSelect`), cfg: $(`${p}ProviderCfg`), custom: $(`${p}CustomCfg`),
    key: $(`${p}ApiKey`), base: $(`${p}BaseUrl`), modelsUrl: $(`${p}ModelsUrl`),
    model: $(`${p}ModelSelect`), modelInput: $(`${p}ModelInput`), modelList: $(`${p}ModelList`),
    modelHint: $(`${p}ModelHint`), modelBox: $(`${p}ModelBox`), status: $(`${p}ProviderStatus`),
    effort: $(`${p}EffortSelect`),
    // 「Claude 账号登录」卡片只有 claude 侧有（原版才是订阅登录），codex 侧取到 null
    login: engine === 'claude' ? $('clBox') : null,
  };
}

// 选了原版时，在服务商下拉底下渲染「Claude 账号登录」整卡（当前账号 + 登录/重登/重新检测）。
// renderClaudeLogin 自己会拉一次 auth status，所以每次调用拿到的都是最新登录态；
// 只在「打开板块」和「切到原版」这两个时机调，别到处调——每拉一次都要起一个 claude 子进程。
function renderClaudeLoginBox(engine) {
  const box = providerUi(engine).login;
  if (!box) return;
  // forceOfficial：用户可能刚把下拉切到原版还没点保存，后端记的仍是第三方，
  // 不加这个标记登录卡会显示成「不需要登录」，正好把要登录的人挡在门外
  renderClaudeLogin(box, { forceOfficial: true });
}

// 思考强度档位的 id 顺序由后端 /api/model/state 下发（避免前端写死一份），
// 展示文案一律走翻译层。兜底顺序只在后端尚未重启（旧版无 efforts 字段）时使用。
const EFFORT_FALLBACK = [{ id: 'low' }, { id: 'medium' }, { id: 'high' }, { id: 'xhigh' }, { id: 'max' }];

// 渲染某引擎的思考强度下拉。所有服务商（含原版）都可选。
function renderEffortSelect(engine, s) {
  const sel = providerUi(engine).effort;
  if (!sel) return;
  const levels = (s && Array.isArray(s.efforts) && s.efforts.length) ? s.efforts : EFFORT_FALLBACK;
  const cur = (s && s.effort) || '';
  sel.innerHTML = '';
  sel.appendChild(new Option(T('effAuto'), ''));
  for (const e of levels) sel.appendChild(new Option(effortLabel(e.id, e.label), e.id));
  sel.value = cur;
}

// 选定思考强度；立即落盘，下一个任务生效
async function onEffortSelect(engine) {
  const sel = providerUi(engine).effort;
  const effort = sel.value || '';
  try {
    await api('/api/model/effort', { engine, effort });
    setModelStatus(
      engine,
      effort ? T('effortSet').replace('{label}', effortLabel(effort)) : T('effortSetAuto'),
      true,
    );
    renderAccSummary(engine);
  } catch (e) {
    setModelStatus(engine, T('engSaveFail').replace('{err}', e.message), false);
  }
}
// 只管显示/隐藏，不动模型选择——供「读取已保存配置后同步一次界面」调用，不清空当前模型
// 原版订阅也可以选择模型（如 opus/sonnet/haiku/fable），所以模型选择框始终显示
function syncProviderVisibility(engine) {
  const u = providerUi(engine);
  const provider = u.select.value;
  u.cfg.hidden = provider === 'official';
  u.custom.hidden = provider !== 'custom';
  // 模型选择框始终显示，允许原版订阅也选择模型；
  // 自定义服务商换成可手填的输入框（拉不到模型列表时也能用）
  const free = provider === 'custom';
  u.model.hidden = free;
  u.modelInput.hidden = !free;
  u.modelHint.hidden = !free;
  // 只有原版才是订阅登录，第三方走 API Key，没有账号可言 —— 整块登录卡都不出现
  if (u.login) {
    u.login.hidden = provider !== 'official';
    if (provider === 'official') renderClaudeLoginBox(engine);
    else u.login.innerHTML = '';
  }
}
// 用户在下拉里手动切换服务商 → 联动：**彻底隔离**。
// 每个服务商在后端各有一槽（apiKey/model/effort/候选缓存），切过去就回显它自己上次的设置；
// 该服务商从没配过就清空并自动定档。这是「选原版却看到 MiniMax 模型」那个 bug 的前端一半。
async function onEngineProviderChange(engine) {
  syncProviderVisibility(engine);
  const u = providerUi(engine);
  const provider = u.select.value;
  // 先清干净，绝不让上一个服务商的值留在表单里
  clearModelChoices(engine);
  setModelValue(engine, '');
  u.key.value = '';
  u.base.value = '';
  u.modelsUrl.value = '';
  if (u.effort) u.effort.value = '';
  setModelStatus(engine, '', null);
  syncModelProviderTag(engine);
  renderAccSummary(engine);
  // 回显该服务商自己保存过的那一槽
  let slot = null;
  try {
    const r = await api(`/api/engine/slots?engine=${engine}`);
    slot = (r && r.slots && r.slots[provider]) || null;
  } catch (e) {
    // 后端未重启时该端点 404 → 降级为「当作没配过」，不阻断
  }
  if (slot) {
    u.key.value = slot.apiKey || '';
    u.base.value = slot.baseUrl || '';
    u.modelsUrl.value = slot.modelsUrl || '';
    const opts = Array.isArray(slot.models) ? slot.models : [];
    if (opts.length || slot.model) {
      fillModelChoices(engine, opts, true);
      if (slot.model && !opts.some((o) => o.id === slot.model))
        u.model.appendChild(new Option(`${slot.model}${T('mdlSuffixSelected')}`, slot.model));
      setModelValue(engine, slot.model || '');
    }
    if (u.effort) u.effort.value = slot.effort || '';
    renderAccSummary(engine);
  }
  // 没有选定模型才自动定档（不覆盖用户上次的选择）
  if (!modelValue(engine)) autoPickModel(engine);
}
// 「模型」标签旁的服务商小标要跟着表单里选中的服务商走
// （否则会一直显示上次已保存的那个，和下面的模型对不上）
function syncModelProviderTag(engine) {
  const cap = engine === 'claude' ? 'Claude' : 'Codex';
  $(`mdl${cap}Provider`).textContent = providerLabel(providerUi(engine).select.value);
}
function onClaudeProviderChange() { onEngineProviderChange('claude'); }

// 模型跟随服务商自动定档：没有选定模型时自动拉取候选并选中服务商推荐的那个。
// 只改表单里的下拉，不落盘——落盘仍由「保存」按钮完成（否则会把新模型配到旧的已保存服务商上）。
async function autoPickModel(engine) {
  const u = providerUi(engine);
  const provider = u.select.value;
  if (provider === 'official') {
    // 原版订阅也可以选择模型：如果没有选定模型，自动填充内置候选列表
    if (modelValue(engine)) return; // 已有模型就不动
    // 从后端获取可用模型列表（对于 official，返回内置候选）
    try {
      const r = await api('/api/model/available', { engine, verify: false });
      const models = r && r.models ? r.models : [];
      if (models.length > 0) {
        fillModelChoices(engine, models, true);
        // 默认选中 opus（如果有）
        const defaultModel = models.find(m => m.id === 'opus') || models[0];
        if (defaultModel) {
          setModelValue(engine, defaultModel.id);
          setModelStatus(engine, T('mdlAutoPickedOne').replace('{model}', modelOptionText(defaultModel)), true);
        }
      }
    } catch (e) {
      setModelStatus(engine, T('mdlListFail').replace('{err}', e.message), false);
    }
    return;
  }
  if (modelValue(engine)) return; // 已有模型就不动，避免覆盖用户的选择
  if (!u.key.value.trim()) {
    setModelStatus(engine, T('modelNeedKey'), null);
    return;
  }
  if (provider === 'custom' && !u.base.value.trim()) {
    setModelStatus(engine, T('modelNeedBase'), null);
    return;
  }
  await fetchEngineModels(engine, true);
}
// API Key 填完（失焦/回车）时：若还没有模型就自动检测一次
function onApiKeySettled(engine) {
  if (modelValue(engine)) return;
  autoPickModel(engine);
}

async function loadEngineProvider(engine) {
  const u = providerUi(engine);
  try {
    const cfg = await api('/api/engine/config');
    const c = (cfg && cfg[engine]) || { provider: 'official', apiKey: '', model: '' };
    u.select.value = c.provider || 'official';
    u.key.value = c.apiKey || '';
    u.base.value = c.baseUrl || '';
    u.modelsUrl.value = c.modelsUrl || '';
    clearModelChoices(engine);
    if (c.model) {
      u.model.appendChild(new Option(c.model, c.model));
      u.modelList.appendChild(new Option(c.model, c.model));
    }
    setModelValue(engine, c.model || '');
    if (u.effort) u.effort.value = c.effort || '';
    syncProviderVisibility(engine);
    syncModelProviderTag(engine);
    u.status.className = 'sx-note';
    // 说明的是「已保存」的状态（表单里可能已改成别的服务商但还没点保存），文案要写明白
    u.status.textContent = c.provider === 'official'
      ? T(engine === 'claude' ? 'engSavedOfficialClaude' : 'engSavedOfficialCodex')
      : T(c.model ? 'engSavedProviderModel' : 'engSavedProvider')
        .replace('{provider}', providerLabel(c.provider))
        .replace('{model}', c.model || '');
    renderAccSummary(engine);
    // 原版订阅也可以选择模型：如果没有选定模型，自动填充内置候选列表
    if (c.provider === 'official' && !c.model) {
      autoPickModel(engine);
    }
    // 已存了第三方服务商与 Key、却没有模型（历史配置/上次没选完）→ 进面板就自动补一个
    if (c.provider !== 'official' && c.apiKey && !c.model) autoPickModel(engine);
  } catch (e) {
    u.status.className = 'sx-note err';
    u.status.textContent = T('engLoadFail').replace('{engine}', engine).replace('{err}', e.message);
  }
}
function loadClaudeProvider() { return loadEngineProvider('claude'); }

// 拉取某服务商的真实模型列表填进下拉。
// auto=true（由 autoPickModel 触发）时额外选中后端给的 recommended，并把提示写在模型区而非服务商区。
async function fetchEngineModels(engine, auto = false) {
  const u = providerUi(engine);
  const provider = u.select.value;
  const apiKey = u.key.value.trim();
  // 提示落点：自动流程写模型状态行（紧贴下拉），手动点按钮写服务商状态行
  const say = (text, ok) => {
    if (auto) { setModelStatus(engine, text, ok); return; }
    u.status.className = 'sx-note' + (ok === true ? ' ok' : ok === false ? ' err' : '');
    u.status.textContent = text;
  };
  // 原版订阅：走 /api/model/available 获取内置候选列表
  if (provider === 'official') {
    const prev = modelValue(engine);
    clearModelChoices(engine);
    say(auto ? T('modelAutoDetecting') : T('modelFetching'), null);
    try {
      const r = await api('/api/model/available', { engine, verify: false });
      const models = r && r.models ? r.models : [];
      if (!models.length) throw new Error(T('modelEmptyList'));
      fillModelChoices(engine, models, true);
      // 优先保留用户原本的选择；否则选中第一个
      const pick = (prev && models.some(m => m.id === prev) && prev) || models[0]?.id || '';
      setModelValue(engine, pick);
      say(
        auto
          ? T('modelAutoPicked').replace('{model}', pick || T('effAutoShort')).replace('{n}', models.length)
          : T('modelFetched').replace('{n}', models.length),
        true,
      );
      renderAccSummary(engine);
    } catch (e) {
      clearModelChoices(engine);
      say(T('modelFetchFail').replace('{err}', e.message), false);
    }
    return;
  }
  if (!apiKey) { say(T('modelNeedKey'), false); return; }
  if (provider === 'custom' && !u.base.value.trim()) { say(T('modelNeedBase'), false); return; }
  const prev = modelValue(engine);
  clearModelChoices(engine);
  say(auto ? T('modelAutoDetecting') : T('modelFetching'), null);
  try {
    const q = new URLSearchParams({ provider, apiKey });
    if (provider === 'custom') {
      q.set('baseUrl', u.base.value.trim());
      q.set('modelsUrl', u.modelsUrl.value.trim());
    }
    const r = await api(`/api/engine/models?${q.toString()}`);
    // 服务商 API 只返回 id 字符串，统一成候选对象再进下拉/提示列表
    const models = (r && r.models) || [];
    if (!models.length) throw new Error(T('modelEmptyList'));
    fillModelChoices(engine, models.map((id) => ({ id, source: 'api' })), false);
    // 优先保留用户原本的选择；否则用后端在真实返回列表里挑的推荐模型；再否则第一个
    const pick = (prev && models.includes(prev) && prev)
      || (r.recommended && models.includes(r.recommended) && r.recommended)
      || models[0];
    setModelValue(engine, pick);
    say(
      auto
        ? T('modelAutoPicked').replace('{model}', pick).replace('{n}', models.length)
        : T('modelFetched').replace('{n}', models.length),
      true,
    );
    renderAccSummary(engine);
  } catch (e) {
    // 自定义服务商拉不到列表是常事（很多网关没有 /models）：清空候选但保留已填的模型 id
    const kept = modelIsFree(engine) ? prev : '';
    clearModelChoices(engine);
    setModelValue(engine, kept);
    say(T('modelFetchFail').replace('{err}', e.message), false);
  }
}
function fetchClaudeModels() { return fetchEngineModels('claude'); }

async function saveEngineProvider(engine) {
  const u = providerUi(engine);
  const provider = u.select.value;
  // 第三方缺模型时先自动补一次（多数情况用户根本不用管模型），补不上才报错
  if (provider !== 'official' && !modelValue(engine)) await autoPickModel(engine);
  const model = modelValue(engine);
  if (provider !== 'official' && !model) {
    u.status.className = 'sx-note err';
    u.status.textContent = T('modelPickFirst');
    return;
  }
  try {
    await api('/api/engine/config', {
      engine, provider, apiKey: u.key.value.trim(), model,
      effort: u.effort ? u.effort.value : '',
      baseUrl: provider === 'custom' ? u.base.value.trim() : '',
      modelsUrl: provider === 'custom' ? u.modelsUrl.value.trim() : '',
    });
    u.status.className = 'sx-note ok';
    u.status.textContent = T('engSavedOk');
    await loadModelState();
    renderAccSummary(engine);
  } catch (e) {
    u.status.className = 'sx-note err';
    u.status.textContent = T('engSaveFail').replace('{err}', e.message);
  }
}
function saveClaudeProvider() { return saveEngineProvider('claude'); }

// ── 手动安装/更新引擎（npm 全局安装，源自动选官方或国内镜像中更快的那个）──
async function updateEngine(engine) {
  const box = $('updateStatus');
  box.className = 'sx-note sx-pre';
  // 引擎包 400-500MB，用实时进度代替一句「请稍候」，否则看起来像卡死
  const stop = startEngineInstallProgress(box, `正在安装/更新 ${engine}，请勿关闭页面`);
  try {
    const r = await api('/api/engine/update', { engine });
    stop();
    box.className = 'sx-note sx-pre ok';
    box.textContent = `${engine} 更新完成：${(r && r.pkg) || ''}\n源：${(r && r.registry) || ''}\n${(r && r.log) || ''}`;
  } catch (e) {
    stop();
    box.className = 'sx-note sx-pre err';
    box.textContent = `${engine} 更新失败：${e.message}\n可自己在终端执行：npm install -g ${engine === 'codex' ? '@openai/codex' : '@anthropic-ai/claude-code'}`;
  }
}

// ── 修改访问密码 ──
async function changePassword() {
  const oldPassword = $('pwOld').value;
  const newPassword = $('pwNew').value;
  if (!oldPassword || !newPassword) { $('pwStatus').className = 'sx-note err'; $('pwStatus').textContent = '请填写当前密码与新密码'; return; }
  try {
    const data = await api('/api/auth/change', { oldPassword, newPassword });
    TOKEN = data.token;
    localStorage.setItem('token', TOKEN);
    $('pwOld').value = ''; $('pwNew').value = '';
    $('pwStatus').className = 'sx-note ok';
    $('pwStatus').textContent = '密码已修改。';
  } catch (e) {
    $('pwStatus').className = 'sx-note err';
    $('pwStatus').textContent = '修改失败：' + e.message;
  }
}

// 「忘记密码？」→ 展开/收起内联重置框
function toggleLanPwReset(e) {
  if (e) e.preventDefault();
  const box = $('lanPwReset');
  if (!box) return;
  box.hidden = !box.hidden;
  if (!box.hidden) {
    $('lanPwResetStatus').textContent = '';
    $('lanPwNew').value = '';
    $('lanPwNew2').value = '';
    $('lanPwNew').focus();
  }
}
// 重置密码（无需旧密码；已在设置面板内即持有有效 token）
async function resetLanPassword() {
  const st = $('lanPwResetStatus');
  const p1 = $('lanPwNew').value;
  const p2 = $('lanPwNew2').value;
  if (!p1 || p1.length < 4) { st.className = 'sx-note err'; st.textContent = '新密码至少 4 位。'; return; }
  if (p1 !== p2) { st.className = 'sx-note err'; st.textContent = '两次输入的新密码不一致。'; return; }
  try {
    const data = await api('/api/auth/reset', { newPassword: p1 });
    TOKEN = data.token;
    localStorage.setItem('token', TOKEN);
    $('lanPwNew').value = ''; $('lanPwNew2').value = '';
    st.className = 'sx-note ok';
    st.textContent = '✓ 密码已重置。请把新密码告诉需要访问的人。';
  } catch (e) {
    st.className = 'sx-note err';
    st.textContent = '重置失败：' + e.message;
  }
}

// ── Codex 档位（原版 ChatGPT ↔ Kimi K3）──
function renderCodexProfile(s) {
  const box = $('codexProfileStatus');
  if (!s) { box.textContent = ''; return; }
  $('codexProfileSelect').value = s.profile === 'kimi' ? 'kimi' : 'chatgpt';
  const lines = [];
  lines.push(`当前档位：${s.profile === 'kimi' ? 'Kimi K3' : '原版 ChatGPT'}`);
  lines.push(`配置文件：${s.configPath}${s.configExists ? '' : '（尚不存在；原版 ChatGPT 可不需要该文件）'}`);
  lines.push(`Kimi 密钥：${s.hasKimiKey ? '已配置 ' + (s.kimiKeyMasked || '') : '未配置'}`);
  if (s.profile === 'kimi') lines.push('Kimi 路由：本地代理 http://127.0.0.1:8972/v1 → Moonshot');
  else lines.push('原版路由：Codex 默认 ChatGPT 配置');
  if (!s.ok && s.error) lines.push(`⚠ 读取配置失败：${s.error}`);
  box.style.color = s.ok ? 'var(--muted)' : '#e57373';
  box.textContent = lines.join('\n');
  if (s.kimiKeyMasked && !$('codexKimiKey').value) $('codexKimiKey').placeholder = s.kimiKeyMasked;
}
async function loadCodexProfile() {
  try {
    renderCodexProfile(await api('/api/codex/profile'));
  } catch (e) {
    $('codexProfileStatus').style.color = '#e57373';
    $('codexProfileStatus').textContent = `⚠ 无法读取 Codex 配置：${e.message}`;
  }
}
async function switchCodexProfile() {
  const profile = $('codexProfileSelect').value === 'kimi' ? 'kimi' : 'chatgpt';
  try {
    renderCodexProfile(await api('/api/codex/profile', { profile }));
  } catch (e) {
    // 如实展现失败原因，并回滚下拉到实际状态
    $('codexProfileStatus').style.color = '#e57373';
    $('codexProfileStatus').textContent = `⚠ 切换失败：${e.message}`;
    loadCodexProfile();
  }
}
async function saveCodexKey() {
  const key = $('codexKimiKey').value.trim();
  if (!key) return;
  try {
    renderCodexProfile(await api('/api/codex/key', { key }));
    $('codexKimiKey').value = '';
  } catch (e) {
    $('codexProfileStatus').style.color = '#e57373';
    $('codexProfileStatus').textContent = `⚠ 保存密钥失败：${e.message}`;
  }
}
// 「保存」按钮：提交当前板块的字段后回到板块列表（每个板块只管自己的字段，见 SETTINGS_PANES）
async function saveSettings() {
  await backToSettingsNav();
}

// 主区标题旁的引擎控件：草稿(未开始)显示可选下拉，已开始显示锁定徽章，无会话则都隐藏
function refreshEngineControl() {
  const sel = $('engineSelect');
  const badge = $('engineBadge');
  const s = State.session;
  if (!s) {
    sel.style.display = 'none';
    badge.style.display = 'none';
    return;
  }
  // 会话顶部不再显示 CC/CD 引擎徽章；草稿仍可用下拉选择引擎
  badge.style.display = 'none';
  if (isDraftSession(s)) {
    sel.style.display = '';
    sel.value = s.engine || State.settings.defaultEngine;
    sel.title = T('engine');
  } else {
    sel.style.display = 'none';
  }
}

// 用户在草稿上切换引擎 → 通知后端更新草稿引擎
async function onEngineChange() {
  const s = State.session;
  if (!s || !isDraftSession(s)) return;
  const eng = $('engineSelect').value === 'codex' ? 'codex' : 'claude';
  try {
    const updated = await api('/api/session/engine', { id: s.id, engine: eng });
    s.engine = updated.engine;
    const inList = State.sessions.find((x) => x.id === s.id);
    if (inList) inList.engine = updated.engine;
    renderSessions();
  } catch (e) {
    // 已开始等：回退显示
    refreshEngineControl();
  }
}

async function main() {
  applyTheme();
  applyText();
  bind();
  // 新用户（尚未设定密码）：必须先走完新手引导（语言/主题/引擎/服务商/模型，不可跳过），
  // 最后一步才设定访问密码。已完成引导但没设密码（中途刷新）则直接到设密码。
  try {
    const st = await api('/api/auth/status');
    if (st && st.needsSetup) {
      NEEDS_SETUP = true;
      let done = false;
      try { const s = await api('/api/settings'); done = !!(s && s.setupDone); } catch { /* 视为未完成 */ }
      if (done) showSetup();
      else await showOnboard();
      return;
    }
  } catch { /* 状态接口异常时按普通登录流程处理 */ }
  // 用持久 token 探测登录态；无效则弹登录框
  if (!TOKEN) {
    showLogin();
    return;
  }
  try {
    await api('/api/auth/check');
    await startApp();
  } catch {
    showLogin();
  }
}
main();
