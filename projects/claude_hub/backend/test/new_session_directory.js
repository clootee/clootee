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
    settings: { defaultEngine: 'codex' },
    sessionId: 'old', session: { id: 'old', rootId, claudeSessionId: 'used', tasks: [] },
    favoriteSessions: [], sessions: [], runFilters: new Set(['running']), tab: 'completed',
  };
  const context = vm.createContext({
    State, Date, window: { matchMedia: () => ({ matches: true }) },
    $: id => {
      if (!elements.has(id)) elements.set(id, { scrollTop: 300, focus() {} });
      return elements.get(id);
    },
    api: async (url, body) => {
      calls.push({ url, body });
      if (url === '/api/session/create') return { id: 'real', rootId: body.rootId, updatedAt: Date.now(), tasks: [] };
      if (url === '/api/session/favorite') return { ...State.session, id: body.id, rootId, favorite: true };
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
    renderSessions() {
      context.visible = State.sessions.filter(s => s.rootId === rootId);
    },
    alert: message => { throw new Error(message); },
  });
  vm.runInContext([
    section('function bumpSessionUpdatedAt(', 'async function refreshFavoriteSessions('),
    section('function focusTaskInputIfDesktop(', 'async function selectSession('),
    section('async function bindFavoriteDraftRoot(', 'function messageRenderUnits('),
  ].join('\n'), context);
  await context.newSession();
  assert.equal(calls[0].url, '/api/session/create');
  assert.equal(calls[0].body.rootId, rootId);
  assert.equal(State.sessionId, 'real');
  assert.equal(context.visible[0].id, 'real', 'new session appears in filtered sidebar immediately');
  assert.equal(State.runFilters.size, 0);
  assert.equal(State.tab, 'active');
  assert.equal(calls.some(c => c.url === '/api/session/favorite'), mode === 'favorites');
  assert.equal(State.sessions.some(s => s.id.startsWith('favorite-draft-')), false);
  State.session = { ...State.session, claudeSessionId: '', tasks: [] };
  State.favoriteSessions.push({ id: 'newer', rootId, updatedAt: Date.now() - 1 });
  State.sessions = State.favoriteSessions;
  State.sessions.find(s => s.id === 'real').updatedAt = 1;
  const before = calls.length;
  await context.newSession();
  assert.equal(calls.length, before, 'reuses the current empty session');
  assert.equal(State.sessions[0].id, 'real', 'reused empty session moves to the front');
  assert.equal(elements.get('sessionList').scrollTop, 0);
}
(async () => {
  await check('all');
  await check('favorites');
  process.stdout.write('new_session_directory: passed\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
