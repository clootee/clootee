// 添加工作目录（根目录）引导流程：
//   加号 → 选择「已有目录」或「新建项目」
//   新建项目：输入项目名（仅英文/数字/下划线）+ 选择创建到的父目录（默认 D:\projects 或 C:\projects / ~/projects）
//   不论新建还是选择，若目标目录缺少 CLAUDE.md 与 AGENTS.md → **立刻**引导选模板（内置 / 自定义集合 / 不选）
//   选完模板才真正执行（创建/注册目录 → 刷新列表 → 写模板），期间显示进度条弹窗
// 依赖 app.js 已定义的全局：$ / api / T / currentLang / openPicker / loadRoots / setTabRootId / escapeHtml

// ── 引导入口（加号点击后调用）──
// onRootReady(rootId)：可选，目录就绪（含模板选择完成）后回调，用于收藏夹「添加新目录」
// 之类需要在拿到 rootId 后再接着做别的事（如绑定草稿会话）的场景；默认（左侧＋）不传，
// 沿用 runRootFlow 内部行为（setTabRootId 选中该目录）。
function openAddRootGuide(onRootReady) {
  $('argTitle').textContent = T('argTitle');
  $('argClose').textContent = '✕';
  $('argExistingT').textContent = T('argExistingT');
  $('argExistingD').textContent = T('argExistingD');
  $('argNewT').textContent = T('argNewT');
  $('argNewD').textContent = T('argNewD');
  $('argClose').onclick = closeAddRootGuide;
  $('argExisting').onclick = () => chooseExistingRoot(onRootReady);
  $('argNew').onclick = () => {
    closeAddRootGuide();
    openNewProjectForm(onRootReady);
  };
  $('addRootGuideOverlay').hidden = false;
}
function closeAddRootGuide() {
  $('addRootGuideOverlay').hidden = true;
}

// 选择已有目录 → 目录选择器 → 立刻选模板 → 带进度条执行（ensure + 刷新 + 写模板）
function chooseExistingRoot(onRootReady) {
  closeAddRootGuide();
  openPicker(async (dirPath) => {
    const choice = await maybePickTemplate(dirPath);
    await runRootFlow(choice, () => api('/api/root/ensure', { path: dirPath, create: false }), onRootReady);
  });
}

// ── 新建项目 ──
async function openNewProjectForm(onRootReady) {
  $('npTitle').textContent = T('npTitle');
  $('npClose').textContent = '✕';
  $('npNameLabel').textContent = T('npNameLabel');
  $('npNameHint').textContent = T('npNameHint');
  $('npParentLabel').textContent = T('npParentLabel');
  $('npBrowse').textContent = T('browse');
  $('npCreate').textContent = T('npCreate');
  $('npName').value = '';
  $('npErr').hidden = true;
  $('npClose').onclick = closeNewProject;
  // 预填平台推荐的默认父目录：优先后端（会检测 D 盘是否存在），失败则按平台回退
  $('npParent').value = fallbackProjectParent();
  try {
    const d = await api('/api/fs/default-project-dir');
    if (d && d.path) $('npParent').value = d.path;
  } catch {
    /* 后端新路由未生效时保留回退值 */
  }
  updateNpPreview();
  $('npName').oninput = updateNpPreview;
  $('npParent').oninput = updateNpPreview;
  $('npBrowse').onclick = () =>
    openPicker((path) => {
      $('npParent').value = path;
      updateNpPreview();
    });
  $('npName').onkeydown = (e) => {
    if (e.key === 'Enter') createNewProject(onRootReady);
  };
  $('npCreate').onclick = () => createNewProject(onRootReady);
  updateNpPreview();
  $('newProjectOverlay').hidden = false;
  $('npName').focus();
}
function closeNewProject() {
  $('newProjectOverlay').hidden = true;
}

// 后端默认路由未生效时的父目录回退：Windows 用 D:\projects，其余用主目录下 projects
function fallbackProjectParent() {
  const plat = (State.settings && State.settings.platform) || '';
  return plat === 'win32' ? 'D:\\projects' : '~/projects';
}

// 项目名合法性：仅英文字母/数字/下划线（作为文件夹名）
function npNameValid(name) {
  return /^[A-Za-z0-9_]+$/.test(name);
}

// 父目录 + 项目名 → 完整路径（按父目录风格选择分隔符）
function npFullPath() {
  const parent = ($('npParent').value || '').trim().replace(/[\\/]+$/, '');
  const name = ($('npName').value || '').trim();
  if (!parent || !name) return '';
  const sep = parent.includes('\\') || /^[A-Za-z]:$/.test(parent) ? '\\' : '/';
  return parent + sep + name;
}

function updateNpPreview() {
  const name = ($('npName').value || '').trim();
  const full = npFullPath();
  const nameBad = name && !npNameValid(name);
  $('npName').classList.toggle('rw-bad', !!nameBad);
  if (nameBad) {
    $('npErr').textContent = T('npNameInvalid');
    $('npErr').hidden = false;
  } else {
    $('npErr').hidden = true;
  }
  $('npPreview').textContent = full && !nameBad ? T('npWillCreate') + full : '';
}

async function createNewProject(onRootReady) {
  const name = ($('npName').value || '').trim();
  const parentDir = ($('npParent').value || '').trim();
  if (!npNameValid(name)) {
    $('npErr').textContent = T('npNameInvalid');
    $('npErr').hidden = false;
    return;
  }
  if (!parentDir) {
    $('npErr').textContent = T('npParentRequired');
    $('npErr').hidden = false;
    return;
  }
  // 先关表单、立刻选模板（不等待目录真正创建），再统一带进度条执行
  closeNewProject();
  const choice = await maybePickTemplate(npFullPathOf(parentDir, name));
  await runRootFlow(choice, () => createProjectApi(name, parentDir), onRootReady);
}

// 创建项目目录；若目录已存在，改为用人话询问「是否直接使用该目录」，确认即等同于选择该目录
async function createProjectApi(name, parentDir) {
  try {
    return await api('/api/root/create-project', { name, parentDir });
  } catch (e) {
    if (!/PROJECT_EXISTS/.test(e.message || '')) throw e;
    const full = npFullPathOf(parentDir, name);
    if (!confirm(T('npFolderExists').replace('{path}', full))) throw new Error('__cancelled__');
    return await api('/api/root/create-project', { name, parentDir, allowExisting: true });
  }
}

// 父目录 + 名字 → 完整路径（供未创建前的模板检测用）
function npFullPathOf(parent, name) {
  const p = (parent || '').replace(/[\\/]+$/, '');
  const sep = p.includes('\\') || /^[A-Za-z]:$/.test(p) ? '\\' : '/';
  return p + sep + name;
}

// ── 选模板（在目录真正创建/注册之前就问，避免用户干等）──
// 返回 {kind,id}=选了模板 / 'skip'=用户明确不用模板 / null=无需询问 / 'unknown'=检测失败（建完再问）
async function maybePickTemplate(dirPath) {
  let needed;
  try {
    const r = await api('/api/template/need?path=' + encodeURIComponent(dirPath));
    needed = !!(r && r.needed);
  } catch {
    return 'unknown'; // 后端不支持按路径检测（未重启）→ 目录建好后再按 rootId 问一次
  }
  if (!needed) return null;
  return (await pickTemplate()) || 'skip';
}

// ── 带进度条执行：建/注册目录 → 刷新列表 → 写模板 ──
// onRootReady(rootId)：流程（含模板选择）全部完成后的回调，供调用方接着做后续绑定动作。
async function runRootFlow(pre, makeRoot, onRootReady) {
  let rootId = '';
  rwProgressOpen();
  try {
    rwProgressStep(T('rwStepDir'), 20);
    const root = await makeRoot();
    if (!root || !root.id) throw new Error('runRootFlow: invalid root');
    rootId = root.id;
    rwProgressStep(T('rwStepList'), 55);
    setTabRootId(root.id);
    await loadRoots();
    if (pre && pre !== 'skip' && pre !== 'unknown') {
      rwProgressStep(T('rwStepTpl'), 80);
      await api('/api/template/apply', { rootId: root.id, kind: pre.kind, templateId: pre.id });
      markTemplateAsked(root.id);
    } else if (pre === 'skip') {
      await rememberTemplateSkip(root.id);
    }
    rwProgressStep(T('rwStepDone'), 100);
    await new Promise((r) => setTimeout(r, 300));
  } catch (e) {
    rwProgressClose();
    if (e.message !== '__cancelled__') alert(e.message); // 用户主动取消（目录已存在时不继续）不弹错
    return;
  }
  rwProgressClose();
  if (pre === 'unknown' && rootId) await offerTemplateForRoot(rootId); // 进度条收起后再补问
  if (onRootReady && rootId) await onRootReady(rootId);
}

// ── 任何时候选用某个工作目录：缺 CLAUDE.md/AGENTS.md 就至少问一次模板 ──
// 用户选「不使用模板」→ 记到后端（root.templateSkipped），之后不再打扰。
const TemplateAsk = { asked: new Set(), busy: false };

function markTemplateAsked(rootId) {
  TemplateAsk.asked.add(rootId);
}

async function rememberTemplateSkip(rootId) {
  markTemplateAsked(rootId);
  try {
    await api('/api/template/skip', { rootId });
  } catch {
    /* 后端旧版本没有该路由：本次会话内不再问，刷新后可能再问一次 */
  }
}

async function offerTemplateForRoot(rootId) {
  if (!rootId || TemplateAsk.busy || TemplateAsk.asked.has(rootId)) return;
  TemplateAsk.busy = true;
  try {
    const r = await api('/api/template/need?rootId=' + encodeURIComponent(rootId));
    if (!r || !r.needed) return;
    const choice = await pickTemplate();
    if (choice) {
      await api('/api/template/apply', { rootId, kind: choice.kind, templateId: choice.id });
      markTemplateAsked(rootId);
    } else {
      await rememberTemplateSkip(rootId);
    }
  } catch {
    /* 检测/写入失败不阻断主流程 */
  } finally {
    TemplateAsk.busy = false;
  }
}

function rwProgressOpen() {
  $('rwpTitle').textContent = T('rwWorking');
  $('rwpStep').textContent = '';
  $('rwpBar').style.width = '0%';
  $('rwProgressOverlay').hidden = false;
}
function rwProgressStep(text, pct) {
  $('rwpStep').textContent = text;
  $('rwpBar').style.width = pct + '%';
}
function rwProgressClose() {
  $('rwProgressOverlay').hidden = true;
}

// ── 选择模板弹窗：返回 Promise<{kind,id}|null> ──
async function pickTemplate() {
  let list;
  try {
    list = await api('/api/template/list');
  } catch (e) {
    alert(e.message);
    return null;
  }
  $('tpTitle').textContent = T('tpTitle');
  $('tpClose').textContent = '✕';
  $('tpHint').textContent = T('tpHint');
  const box = $('tpList');
  box.innerHTML = '';
  return await new Promise((resolve) => {
    const done = (choice) => {
      closeTemplatePicker();
      resolve(choice);
    };
    $('tpClose').onclick = () => done(null);
    (list.builtin || []).forEach((t) => box.appendChild(templateCard(done, t)));
    if ((list.custom || []).length) {
      const sec = document.createElement('div');
      sec.className = 'rw-tpl-sec';
      sec.textContent = T('tpCustomLabel');
      box.appendChild(sec);
      list.custom.forEach((t) => box.appendChild(templateCard(done, t)));
    }
    box.appendChild(noneCard(done));
    $('templatePickOverlay').hidden = false;
  });
}
function closeTemplatePicker() {
  $('templatePickOverlay').hidden = true;
}

function templateCard(done, t) {
  const zh = currentLang() === 'zh';
  const label = zh ? t.labelZh : t.labelEn;
  const desc = zh ? t.descZh || '' : t.descEn || '';
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'rw-tpl' + (t.kind === 'custom' ? ' rw-tpl-custom' : '');
  card.innerHTML =
    `<span class="rw-tpl-ic">${t.kind === 'custom' ? '📦' : '📄'}</span>` +
    `<span class="rw-tpl-tx"><b>${escapeHtml(label)}</b>${desc ? `<em>${escapeHtml(desc)}</em>` : ''}</span>`;
  card.onclick = () => done({ kind: t.kind, id: t.id });
  return card;
}

function noneCard(done) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'rw-tpl rw-tpl-none';
  card.innerHTML =
    `<span class="rw-tpl-ic">➖</span>` +
    `<span class="rw-tpl-tx"><b>${escapeHtml(T('tpNoneT'))}</b><em>${escapeHtml(T('tpNoneD'))}</em></span>`;
  card.onclick = () => done(null);
  return card;
}
