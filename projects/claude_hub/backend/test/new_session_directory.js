const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '../../frontend/app.js'), 'utf8');
function section(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));
}
async function check(mode) {
  const elements = new Map();
  const calls = [];
  const rootId = 'chosen';
  const State = {
    favoritesOnly: true, listMode: mode, rootId: 'other',
    roots: [{ id: rootId }],
    settings: { defaultEngine: 'codex' },
    sessionId: 'old', session: { id: 'old', rootId, claudeSessionId: 'used', tasks: [] },
    favoriteSessions: [], sessions: [], runFilters: new Set(['running']), tab: 'completed',
  };
  const context = vm.createContext({
    State, Date, window: { matchMedia: () => ({ matches: true }) },
    $: id => {
      if (!elements.has(id)) elements.set(id, { scrollTop: 300, value: '', focus() {} });
      return elements.get(id);
    },
    api: async (url, body) => {
      calls.push({ url, body });
      if (url === '/api/session/create') return { id: 'real', rootId: body.rootId, updatedAt: Date.now(), tasks: [] };
      if (url === '/api/session/favorite') return { ...State.session, id: body.id, rootId, favorite: true };
      if (url === '/api/task/add') return {};
      throw new Error(url);
    },
    favFilterRootId: () => rootId,
    closeDrawer() {}, resetSessionSearch() {}, syncRunTabs() {},
    switchTab: tab => { State.tab = tab; },
    showMiniToast() {}, T: key => key, flashSessionRow() {},
    selectSession: async id => { State.sessionId = id; context.renderSessions(); },
    quickCarryKey() {}, renderMessages() {}, renderQueue() {}, refreshPauseBtn() {},
    refreshEngineControl() {}, renderQuick() {}, sessionTitle: () => '',
    setFavoriteRootBindingUi() {}, setTabRootId: id => { State.rootId = id; },
    refreshRootRecency: async () => {},
    attachPaths: () => [], Attach: { items: [] }, renderAttachBar() {}, clearNotices() {}, clearSlashPrefix() {},
    applySlashPrefix: text => text, applyQuickPrefix: text => text,
    SessionLimitUi: { prepare: async () => true }, PromptCacheUi: { ensure: async () => true },
    CostUi: { prepare: async prompts => ({ sessionId: State.sessionId, prompts }) },
    Upload: {}, showUpProgress() {}, setUpProgress() {}, hideUpProgress() {}, attachAdd() {},
    uploadOne: async () => {
      assert.equal(State.session.rootId, rootId, 'session created before uploading');
      calls.push({ url: 'upload' });
      return { rel: 'tmp/file.txt' };
    },
    renderSessions() {
      context.visible = State.sessions.filter(s => s.rootId === rootId);
    },
    alert: message => { throw new Error(message); },
  });
  vm.runInContext([
    section('function bumpSessionUpdatedAt(', 'async function refreshFavoriteSessions('),
    section('function focusTaskInputIfDesktop(', 'async function selectSession('),
    section('async function bindFavoriteDraftRoot(', 'function messageRenderUnits('),
    section('async function ensureSession(', '// ── 批量任务弹窗'),
    section('async function uploadFiles(', '// ── 附件区'),
  ].join('\n'), context);
  await context.newSession();
  assert.equal(calls.length, 0, 'new session button creates only a draft');
  assert.equal(State.session.pendingRootId, rootId);
  // Sending implicitly confirms the preselected directory without an extra click.
  context.$('taskInput').value = 'hello';
  await context.addTask();
  assert.equal(calls[0].url, '/api/session/create');
  assert.equal(calls[0].body.rootId, rootId);
  assert.equal(State.sessionId, 'real');
  assert.equal(context.visible[0].id, 'real', 'new session appears in filtered sidebar immediately');
  assert.equal(calls.at(-1).url, '/api/task/add');
  assert.equal(calls.some(c => c.url === '/api/session/favorite'), mode === 'favorites');
  assert.equal(State.sessions.some(s => s.id.startsWith('favorite-draft-')), false);
  context.createFavoriteDraftSession(rootId);
  calls.length = 0;
  await context.uploadFiles([{ name: 'file.txt' }]);
  assert.deepEqual(calls.map(c => c.url), mode === 'favorites'
    ? ['/api/session/create', '/api/session/favorite', 'upload'] : ['/api/session/create', 'upload']);
  // Explicitly clearing a previously selected directory must block both actions.
  context.createFavoriteDraftSession(rootId);
  State.session.pendingRootId = '';
  context.alert = () => {};
  calls.length = 0;
  context.$('taskInput').value = 'keep this draft';
  await context.addTask();
  await context.uploadFiles([{ name: 'file.txt' }]);
  assert.equal(calls.length, 0);
  assert.equal(context.$('taskInput').value, 'keep this draft');
  // Also continue on the first action if there was no session at all.
  State.sessionId = '';
  State.session = null;
  await context.addTask();
  assert.equal(calls[0].url, '/api/session/create');
  assert.equal(calls.at(-1).url, '/api/task/add');
}
(async () => {
  await check('all');
  await check('favorites');
  process.stdout.write('new_session_directory: passed\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
