/* Project instructions drawer: changes stay in memory until explicitly saved. */
Object.assign(DICT, Object.fromEntries(Object.entries({
  ppTitle: ['Prompt settings', '提示词设置'], ppSync: ['Edit together · Recommended', '同步编辑 · 推荐'], ppSeparate: ['Edit separately', '分开编辑'],
  ppIntro: ['Keep Claude Code and Codex instructions in sync?', '是否让 Claude Code 和 Codex 的提示词完全同步？'],
  ppExplain: ['Edit one shared prompt for both tools, or maintain each tool’s instructions separately.', '推荐同步：只需维护一份共同提示词；也可以为两个工具分别编写。'],
  ppCommon: ['Shared prompt', '共同提示词'], ppChoose: ['The prompts differ. Which version should be used?', '两份提示词不一致，请选择以哪一份为准'],
  ppChooseNote: ['Preview both drafts below. Your selection only replaces both files when you save.', '请预览下方两份草稿。选择后可继续编辑，点击保存才会覆盖两个文件。'],
  ppUse: ['Use this version', '以此份为准'], ppMissing: ['File does not exist yet · created on save', '文件尚不存在 · 保存时创建'],
  ppSave: ['Save prompts', '保存提示词'], ppSaving: ['Saving…', '正在保存…'], ppSaved: ['Saved', '已保存'],
  ppDraft: ['Unsaved changes', '有未保存的修改'], ppClose: ['Close', '关闭'], ppDiscard: ['Discard unsaved changes and close?', '放弃未保存的修改并关闭？'],
  ppConflict: ['Files changed outside this editor. Your draft is preserved. Reload to review the latest files before saving.', '文件已被外部修改，当前草稿已保留。请重新加载最新文件，再核对并保存。'],
  ppReload: ['Reload files', '重新加载文件'], ppReloadAsk: ['Reload and discard current drafts?', '重新加载并放弃当前草稿？'],
  ppManaged: ["This file includes instructions maintained by Clootee.", "此文件包含 Clootee 管理的指令。"],
  ppScope: ['Applies to all sessions in this project. Includes the full instruction files.', '对本项目下所有会话生效，编辑内容为完整提示词文件。'],
  ppLoading: ['Loading project prompts…', '正在读取项目提示词…'], ppRetry: ['Retry', '重试'],
  ppSyncNote: ['Saving updates CLAUDE.md and AGENTS.md together.', '保存时同时更新 CLAUDE.md 和 AGENTS.md。'],
  ppSeparateNote: ['Each card keeps its own draft. Save applies both drafts.', '两个卡片分别保留草稿，保存时一并写入。'],
  ppEmpty: ['Empty prompt', '暂无提示词'], ppPlaceholder: ['Describe project conventions, commands and preferences…', '填写项目约定、常用命令和工作偏好…']
}).map(([key, [en, zh]]) => [key, { en, zh }])));

const PromptEditor = { data: null, mode: null, active: 0, drafts: [], busy: false, dirty: false, opener: null };
const ppDialog = document.createElement('dialog');
ppDialog.className = 'pp-drawer';
ppDialog.setAttribute('aria-labelledby', 'ppHeading');
document.body.append(ppDialog);
function ppButton(label, action, cls = '') {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = cls; b.onclick = action; return b;
}
function ppText(tag, text, cls = '') { const el = document.createElement(tag); el.textContent = text; el.className = cls; return el; }
function ppClose() {
  if (PromptEditor.busy || (PromptEditor.dirty && !confirm(T('ppDiscard')))) return;
  ppDialog.close(); PromptEditor.opener?.focus();
}
ppDialog.addEventListener('cancel', e => { e.preventDefault(); ppClose(); });
ppDialog.addEventListener('click', e => { if (e.target === ppDialog) { const r = ppDialog.getBoundingClientRect(); if (e.clientX < r.left) ppClose(); } });
window.addEventListener('beforeunload', e => { if (ppDialog.open && PromptEditor.dirty) { e.preventDefault(); e.returnValue = ''; } });
async function openProjectPrompts(rootId) {
  if (!rootId || ppDialog.open) return;
  Object.assign(PromptEditor, { rootId, data: null, mode: null, active: 0, drafts: [], dirty: false, opener: document.activeElement });
  ppDialog.showModal(); await ppLoad();
}
async function ppLoad() {
  PromptEditor.busy = true; ppRender();
  try {
    const data = await api('/api/root/prompts?rootId=' + encodeURIComponent(PromptEditor.rootId));
    Object.assign(PromptEditor, { data, drafts: data.files.map(f => f.content), dirty: false, error: '', mode: localStorage.getItem('prompt-mode:' + data.rootId) || null });
  } catch (e) { PromptEditor.error = ErrorHandler.handle(e, 'ProjectPrompts.load'); }
  finally { PromptEditor.busy = false; ppRender(); }
}
function ppMode(mode) {
  if (PromptEditor.busy || mode === PromptEditor.mode) return;
  // Moving from shared to separate deliberately starts both drafts from the shared text.
  PromptEditor.mode = mode; PromptEditor.dirty = true; ppRender();
}
function ppRender() {
  const s = PromptEditor; ppDialog.replaceChildren();
  const header = ppText('header', '', 'pp-header');
  header.append(ppText('h2', T('ppTitle'), ''), ppButton('✕', ppClose, 'pp-close'));
  header.lastChild.setAttribute('aria-label', T('ppClose')); header.lastChild.disabled = s.busy;
  ppDialog.append(header);
  if (!s.data) {
    ppDialog.append(ppText('p', s.busy ? T('ppLoading') : s.error, 'pp-message'));
    if (!s.busy) ppDialog.append(ppButton(T('ppRetry'), ppLoad)); return;
  }
  ppDialog.append(ppText('strong', s.data.name, 'pp-project'), ppText('div', s.data.path, 'pp-path'));
  const tabs = ppText('nav', '', 'pp-tabs'); tabs.setAttribute('aria-label', T('ppTitle'));
  ['sync', 'separate'].forEach(mode => { const b = ppButton(T(mode === 'sync' ? 'ppSync' : 'ppSeparate'), () => ppMode(mode), s.mode === mode ? 'selected' : ''); b.setAttribute('aria-pressed', String(s.mode === mode)); b.disabled = s.busy; tabs.append(b); });
  ppDialog.append(tabs);
  if (s.drafts.some(text => text.includes('<!-- claude-hub:preset-prompt:start -->'))) ppDialog.append(ppText('small', T('ppManaged'), 'pp-managed'));
  const body = ppText('section', '', 'pp-body');
  const differs = s.drafts[0] !== s.drafts[1];
  if (!s.mode) {
    body.append(ppText('h3', T('ppIntro')), ppText('p', T('ppExplain')));
    body.append(ppButton(T('ppSync'), () => ppMode('sync'), 'pp-choice'), ppButton(T('ppSeparate'), () => ppMode('separate'), 'pp-choice'));
  } else if (s.mode === 'sync' && differs) {
    body.append(ppText('h3', T('ppChoose')), ppText('p', T('ppChooseNote')));
    const previews = ppText('div', '', 'pp-previews');
    s.drafts.forEach((draft, i) => {
      const card = ppText('article', '', 'pp-preview');
      card.append(ppText('h3', i ? 'Codex · ' + s.data.files[i].filename : 'Claude Code · ' + s.data.files[i].filename));
      if (!s.data.files[i].exists) card.append(ppText('small', T('ppMissing')));
      card.append(ppText('pre', draft || T('ppEmpty')));
      const b = ppButton(T('ppUse'), () => { s.drafts = [draft, draft]; s.dirty = true; ppRender(); }, 'pp-primary'); b.disabled = s.busy; card.append(b); previews.append(card);
    }); body.append(previews);
  } else {
    if (s.mode === 'separate') {
      const cards = ppText('div', '', 'pp-cards');
      ['Claude Code', 'Codex'].forEach((name, i) => {
        const b = ppButton(name + ' · ' + s.data.files[i].filename, () => { s.active = i; ppRender(); }, s.active === i ? 'selected' : '');
        b.setAttribute('aria-pressed', String(s.active === i)); cards.append(b);
      }); body.append(cards);
    }
    const index = s.mode === 'sync' ? 0 : s.active;
    const label = ppText('label', s.mode === 'sync' ? T('ppCommon') : (index ? 'Codex' : 'Claude Code')); label.htmlFor = 'ppEditor'; body.append(label);
    body.append(ppText('p', T(s.mode === 'sync' ? 'ppSyncNote' : 'ppSeparateNote')));
    if (!s.data.files[index].exists) body.append(ppText('small', T('ppMissing')));
    const editor = document.createElement('textarea'); editor.id = 'ppEditor'; editor.spellcheck = false; editor.value = s.drafts[index]; editor.placeholder = T('ppPlaceholder'); editor.disabled = s.busy;
    editor.oninput = () => { s.drafts[index] = editor.value; if (s.mode === 'sync') s.drafts[1] = editor.value; s.dirty = true; s.error = ''; ppDialog.querySelector('.pp-status').textContent = T('ppDraft'); ppDialog.querySelector('.pp-save').disabled = false; };
    body.append(editor);
  }
  ppDialog.append(body);
  const error = ppText('p', s.error?.includes('PROMPT_CONFLICT') ? T('ppConflict') : (s.error || ''), 'pp-error'); error.setAttribute('role', 'alert'); ppDialog.append(error);
  if (s.error?.includes('PROMPT_CONFLICT')) ppDialog.append(ppButton(T('ppReload'), () => { if (confirm(T('ppReloadAsk'))) ppLoad(); }));
  const footer = ppText('footer', '', 'pp-footer');
  const status = ppText('span', s.dirty ? T('ppDraft') : T('ppScope'), 'pp-status'); status.setAttribute('role', 'status');
  const save = ppButton(T(s.busy ? 'ppSaving' : 'ppSave'), ppSave, 'pp-primary pp-save'); save.disabled = s.busy || !s.dirty || !s.mode || (s.mode === 'sync' && differs);
  footer.append(status, save); ppDialog.append(footer);
}
async function ppSave() {
  const s = PromptEditor; if (s.busy) return;
  s.busy = true; s.error = ''; ppRender();
  try {
    const data = await api('/api/root/prompts', { rootId: s.rootId, revision: s.data.revision, mode: s.mode, contents: s.drafts });
    s.data = data; s.dirty = false;
    localStorage.setItem('prompt-mode:' + s.rootId, s.mode);
  } catch (e) { s.error = ErrorHandler.handle(e, 'ProjectPrompts.save'); }
  finally { s.busy = false; ppRender(); if (!s.error) ppDialog.querySelector('.pp-status').textContent = T('ppSaved'); }
}


// The selected project directory supports the same menu as favorite directory tags.
for (const id of ['rootSelect', 'workdirBar', 'rootMeta']) {
  const el = document.getElementById(id); if (!el) continue;
  el.addEventListener('contextmenu', e => {
    const root = State.roots.find(r => r.id === State.rootId);
    if (!root) return;
    e.preventDefault(); openDirCtxMenu({ rootId: root.id, name: root.name }, e.clientX, e.clientY);
  });
}
