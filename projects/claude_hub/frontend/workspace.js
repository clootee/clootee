// 工作台模式（独立于经典模式）：每个会话绑定各自的工作目录，跨目录合并展示。
// 本文件只承载「新建会话前选择工作目录」的弹窗逻辑；模式开关、列表数据源、目录徽章
// 等最小改动散落在 app.js（以 isWorkspace() 守卫，不影响经典模式）。
// 依赖 app.js 已定义的全局：State / api / $ / T / basename / openPicker / loadSessions /
//   selectSession / escapeHtml。仅在用户交互（点击新建会话）时被调用，无加载顺序问题。

// 打开「选择工作目录」弹窗：列出近期用过的目录 + 手动输入/浏览
function openWsDir() {
  renderWsRecent();
  $('wsDirPath').value = '';
  $('wsDirCreate').checked = true;
  $('wsDirOverlay').hidden = false;
  setTimeout(() => $('wsDirPath').focus(), 50);
}
function closeWsDir() {
  $('wsDirOverlay').hidden = true;
}

// 近期目录 = 已登记的根目录列表（按名称）。点击某项直接在该目录下新建会话
function renderWsRecent() {
  const box = $('wsRecentList');
  box.innerHTML = '';
  const roots = State.roots || [];
  if (roots.length === 0) {
    box.innerHTML = `<div class="ws-recent-empty">${escapeHtml(T('wsNoRecent'))}</div>`;
    return;
  }
  roots.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'ws-recent-row';
    row.innerHTML =
      `<span class="ico">📁</span>` +
      `<span class="nm">${escapeHtml(basename(r.path) || r.name)}</span>` +
      `<span class="sub">${escapeHtml(r.path)}</span>`;
    row.title = r.path;
    row.addEventListener('click', () => wsCreateSessionInRoot(r.id));
    box.appendChild(row);
  });
}

// 借用经典模式的目录浏览器（GUI 选择），选中后仅回填路径输入框，不新增根目录
function wsBrowseDir() {
  openPicker((path) => {
    $('wsDirPath').value = path;
  });
}

// 使用输入框里的目录（可勾选「不存在则创建」）→ 确保根目录 → 在其下新建会话
async function wsUseTypedDir() {
  const path = $('wsDirPath').value.trim();
  if (!path) {
    $('wsDirPath').focus();
    return;
  }
  const create = $('wsDirCreate').checked;
  try {
    const root = await api('/api/root/ensure', { path, create });
    // 刷新本地根目录表（供目录徽章 / 近期列表使用），再在该根下建会话
    State.roots = await api('/api/root/list');
    await wsCreateSessionInRoot(root.id);
  } catch (e) {
    alert(e.message);
  }
}

// 在指定根目录下创建一个新会话并选中它（引擎取默认引擎）。会话目录一经绑定不可更改。
async function wsCreateSessionInRoot(rootId) {
  try {
    const s = await api('/api/session/create', {
      rootId,
      name: '',
      engine: State.settings.defaultEngine,
    });
    closeWsDir();
    await loadSessions();
    await selectSession(s.id);
    $('taskInput').focus();
  } catch (e) {
    alert(e.message);
  }
}
