'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const backend = path.resolve(__dirname, '../../projects/claude_hub/backend');
const load = name => require(path.join(backend, 'dist', name));
const { SessionList } = load('logic_realize/SessionList');
const { SessionManager } = load('logic_realize/SessionManager');
const { SessionMeta } = load('logic_realize/SessionMeta');
const { Settings } = load('logic_realize/Settings');
const { RootManager } = load('logic_realize/RootManager');
const { ClaudeStoreHelper } = load('helper/ClaudeStoreHelper');
const { FsHelper } = load('helper/FsHelper');

function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-page-'));
  const roots = [{ id: 'alpha', path: path.join(tmp, 'alpha') }, { id: 'beta', path: path.join(tmp, 'beta') }];
  const meta = {};
  const original = { home: Settings.effectiveHomeDir, roots: RootManager.listRoots, meta: SessionMeta.getAll,
    live: SessionManager.runtimeSessions, edge: FsHelper.readEdgeLinesAsync, codex: process.env.CODEX_HOME,
    claude: process.env.CLAUDE_CONFIG_DIR };
  Settings.effectiveHomeDir = () => tmp;
  RootManager.listRoots = () => roots;
  SessionMeta.getAll = () => meta;
  SessionManager.runtimeSessions = () => [];
  process.env.CODEX_HOME = path.join(tmp, '.codex');
  process.env.CLAUDE_CONFIG_DIR = path.join(tmp, '.claude');
  const files = [];
  for (let i = 0; i < 1200; i++) {
    const root = roots[i % 2];
    const dir = ClaudeStoreHelper.projectDir(root.path, tmp);
    fs.mkdirSync(dir, { recursive: true });
    const id = `session-${String(i).padStart(4, '0')}`;
    const file = path.join(dir, id + '.jsonl');
    fs.writeFileSync(file, JSON.stringify({ type: 'user', message: { role: 'user', content: `Title ${i}` } }) + '\n'
      + JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: i === 1177 ? 'deep-search-only' : 'answer' } }) + '\n');
    const time = new Date(1700000000000 + i * 1000);
    fs.utimesSync(file, time, time);
    meta[`${root.id}:${id}`] = { indexed: true, indexedAt: i, favorite: i % 3 === 0, status: i % 4 === 0 ? 'completed' : 'active', pinned: i === 0 };
    files.push(file);
  }
  let reads = 0;
  FsHelper.readEdgeLinesAsync = async (...args) => { reads++; return original.edge.apply(FsHelper, args); };
  return { tmp, roots, meta, files, reads: () => reads,
    cleanup() {
      Settings.effectiveHomeDir = original.home; RootManager.listRoots = original.roots;
      SessionMeta.getAll = original.meta; SessionManager.runtimeSessions = original.live;
      FsHelper.readEdgeLinesAsync = original.edge;
      for (const [key, value] of [['CODEX_HOME', original.codex], ['CLAUDE_CONFIG_DIR', original.claude]]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    } };
}

test('1200 sessions: first and second pages hydrate only 20 previews; order stays stable', async () => {
  const f = fixture();
  const server = http.createServer((_req, res) => res.end('alive'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let running = true, probes = 0;
  const probe = (async () => {
    while (running) { assert.equal(await (await fetch(`http://127.0.0.1:${server.address().port}`)).text(), 'alive'); probes++; }
  })();
  try {
    const first = await SessionList.page({ mode: 'indexed' });
    assert.equal(first.items.length, 20); assert.equal(first.total, 1200);
    assert.equal(f.reads(), 20); assert.equal(first.items[0].id, 'alpha:session-0000');
    assert.deepEqual(first.directories.map(d => d.count), [600, 600]);
    f.meta['alpha:session-1100'].pinned = true;
    const second = await SessionList.page({ mode: 'indexed', offset: first.nextOffset, snapshot: first.snapshot });
    assert.equal(second.items.length, 20); assert.equal(f.reads(), 40);
    assert.equal(new Set([...first.items, ...second.items].map(s => s.id)).size, 40);
    assert.equal(second.snapshot, first.snapshot); assert.ok(probes > 0);
    const before = f.reads();
    await SessionList.recency(); assert.equal(f.reads(), before, 'directory recency never reads conversation previews');
    console.log(`1200 files; first page: 20 reads; second page: 20 reads; HTTP probes during IO: ${probes}`);
  } finally {
    running = false; await probe; await new Promise(resolve => server.close(resolve)); f.cleanup();
  }
});

test('filters run before pagination; unseen title/full-text hits and locked roots stay correct', async () => {
  const f = fixture();
  try {
    const filtered = await SessionList.page({ mode: 'indexed', status: 'completed', filterRootId: 'alpha' });
    assert.equal(filtered.total, 300); assert.equal(filtered.items.length, 20);
    assert.equal(filtered.directories.length, 2, 'other directory filters remain available');
    assert.ok(filtered.items.every(s => s.status === 'completed' && s.rootId === 'alpha'));
    const favorites = await SessionList.page({ mode: 'favorites', rootId: 'alpha' });
    assert.equal(favorites.total, 400); assert.ok(favorites.items.every(s => s.favorite));
    const title = await SessionList.page({ mode: 'indexed', q: 'Title 1177' });
    assert.equal(title.total, 1); assert.equal(title.items[0].id, 'beta:session-1177');
    const denied = await SessionList.page({ mode: 'indexed', q: 'Title 1177' }, root => root !== 'beta');
    assert.equal(denied.total, 0, 'search counts cannot disclose locked-root text');
    const full = await SessionList.page({ mode: 'indexed', q: 'deep-search-only', fullText: true });
    assert.equal(full.total, 1); assert.match(full.snippets['beta:session-1177'], /deep-search-only/);
    const max = await SessionList.page({ mode: 'indexed', limit: 10000 });
    assert.equal(max.items.length, 50);
    const reset = await SessionList.page({ mode: 'indexed', offset: 20, snapshot: 'expired' });
    assert.equal(reset.reset, true); assert.equal(reset.nextOffset, 20);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(SessionList.page({ mode: 'indexed', q: 'cancel' }, () => true, controller.signal), /abort/i);
  } finally { f.cleanup(); }
});

test('preview IO is bounded even when a tool frame is several megabytes long', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-window-'));
  const file = path.join(tmp, 'giant.jsonl');
  const oldOpen = fs.promises.open;
  let bytes = 0;
  try {
    fs.writeFileSync(file, '{"type":"user","message":{"content":"first"}}\n' + 'x'.repeat(8 * 1024 * 1024) + '\n{"type":"user","message":{"content":"last"}}\n');
    fs.promises.open = async (...args) => {
      const handle = await oldOpen.apply(fs.promises, args), read = handle.read.bind(handle);
      handle.read = async (...args) => { const result = await read(...args); bytes += result.bytesRead; return result; };
      return handle;
    };
    const edge = await FsHelper.readEdgeLinesAsync(file);
    assert.ok(bytes <= 512 * 1024, `read ${bytes} bytes`);
    assert.match(edge.head.join('\n'), /first/); assert.match(edge.tail.join('\n'), /last/);
    assert.ok(!edge.tail.some(l => l.includes('xxxx')));
  } finally { fs.promises.open = oldOpen; fs.rmSync(tmp, { recursive: true, force: true }); }
});

function frontendContext(api) {
  const source = fs.readFileSync(path.resolve(backend, '../frontend/app.js'), 'utf8');
  const context = { URLSearchParams, AbortController, Map, Set, api,
    State: { rootId: 'alpha', listMode: 'single', tab: 'all', favoritesOnly: false,
      sessions: [], favoriteSessions: [], justFinished: new Set(), justFinishedSeen: new Set(), runFilters: new Set(), sessionId: 'selected', session: { rootId: 'alpha' } },
    Page: { size: 20, offset: 0, more: 0, key: '', directories: [], running: [], cache: new Map() },
    Search: { query: '', advanced: false, hits: new Map() }, FavDir: { rootId: '' },
    sessionListRequest: 0, sessionSelectionVersion: 1, sessionListScope: () => context.State.rootId,
    sessionPageKey: () => context.State.rootId, isWorkspace: () => false, renderSessions() {},
    rebuildRunning() {}, setSearchPending() {}, isFavoriteDraftId: () => false,
    selectSession: async () => { throw Error('current selection must be preserved'); } };
  vm.runInNewContext(source.slice(source.indexOf('async function loadSessions('), source.indexOf('// 会话标题：')), context);
  return context;
}
function result(id, more = true) {
  return { items: [{ id }], nextOffset: 20, snapshot: 'snapshot', total: 40, hasMore: more, directories: [], running: [], snippets: {} };
}
test('frontend appends one page, suppresses duplicate scroll requests, and preserves selection', async () => {
  const calls = []; let release;
  const c = frontendContext(async (url) => { calls.push(url); if (calls.length === 2) await new Promise(r => release = r); return result(`row-${calls.length}`); });
  await c.loadSessions(); assert.equal(c.State.sessions.length, 1); assert.match(calls[0], /limit=20/);
  const next = c.loadSessions(true); await c.loadSessions(true);
  assert.equal(calls.length, 2); release(); await next;
  assert.equal(c.State.sessions.length, 2); assert.match(calls[1], /offset=20/); assert.equal(c.State.sessionId, 'selected');
});
test('frontend ignores late responses from another directory and retains rows on retryable failure', async () => {
  let release; let count = 0;
  const c = frontendContext(async () => { if (++count === 1) return new Promise(r => release = r); return result('beta-row'); });
  const old = c.loadSessions(); c.State.rootId = 'beta'; c.State.session.rootId = 'beta';
  await c.loadSessions(); release(result('old-row')); await old;
  assert.equal(c.State.sessions[0].id, 'beta-row');
  c.api = async () => { throw Error('temporary failure'); };
  await c.loadSessions(true); assert.equal(c.State.sessions[0].id, 'beta-row'); assert.equal(c.Page.error, 'temporary failure');
});
