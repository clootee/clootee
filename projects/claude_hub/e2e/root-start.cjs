// Run with node --test e2e/root-start.cjs after building the backend.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { RootManager } = require('../backend/dist/logic_realize/RootManager');
const { FsHelper } = require('../backend/dist/helper/FsHelper');
const app = fs.readFileSync(path.join(__dirname, '../frontend/app.js'), 'utf8');
function segment(start, end) { return app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start))); }

test('automatic folders: missing parent, retry, separate projects, unavailable base, invalid request', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-root-'));
  const original = { base: FsHelper.preferredBase, home: FsHelper.home, ensure: RootManager.ensureRoot };
  const roots = new Map();
  FsHelper.preferredBase = () => path.join(dir, 'preferred');
  FsHelper.home = () => path.join(dir, 'home');
  RootManager.ensureRoot = (target) => {
    if (!roots.has(target)) roots.set(target, { id: String(roots.size + 1), path: target });
    return roots.get(target);
  };
  try {
    const first = RootManager.quickStart('11111111-1111-4111-8111-111111111111');
    assert.ok(fs.statSync(first.path).isDirectory());
    fs.writeFileSync(path.join(first.path, 'keep.txt'), 'preserve me');
    assert.equal(RootManager.quickStart('11111111-1111-4111-8111-111111111111'), first);
    assert.equal(fs.readFileSync(path.join(first.path, 'keep.txt'), 'utf8'), 'preserve me');
    const second = RootManager.quickStart('22222222-2222-4222-8222-222222222222');
    assert.notEqual(second.path, first.path);
    const blocked = path.join(dir, 'blocked');
    fs.writeFileSync(blocked, 'not a directory');
    FsHelper.preferredBase = () => blocked;
    const fallback = RootManager.quickStart('33333333-3333-4333-8333-333333333333');
    assert.ok(fallback.path.startsWith(path.join(dir, 'home', 'projects')));
    assert.throws(() => RootManager.quickStart('../escape'), /invalid requestId/);
    FsHelper.home = () => blocked;
    assert.throws(() => RootManager.quickStart('44444444-4444-4444-8444-444444444444'));
  } finally {
    FsHelper.preferredBase = original.base;
    FsHelper.home = original.home;
    RootManager.ensureRoot = original.ensure;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Windows drive detection and Unix defaults use actual platform availability', () => {
  const source = fs.readFileSync(path.join(__dirname, '../backend/src/helper/FsHelper.ts'), 'utf8');
  const body = source.slice(source.indexOf('  static preferredBase()'), source.indexOf('  // 目录里是否存在名为 name'))
    .replace('static preferredBase(): string', 'preferredBase()');
  for (const [platform, available, expected] of [
    ['win32', ['D:\\', 'C:\\'], 'D:\\'], ['win32', ['C:\\'], 'C:\\'],
    ['win32', [], '/home/test'], ['linux', [], '/home/test'], ['darwin', [], '/home/test'],
  ]) {
    const context = vm.createContext({ process: { platform }, os: { homedir: () => '/home/test' },
      fs: { accessSync: (drive) => { if (!available.includes(drive)) throw Error('missing drive'); } } });
    assert.equal(vm.runInContext(`({${body}}).preferredBase()`, context), expected);
  }
});

function frontend(roots, draft = false) {
  const controls = new Map();
  const control = (id) => {
    if (!controls.has(id)) controls.set(id, { value: 'message stays', classes: new Set(), attrs: {}, focused: false,
      classList: { add(name) { controls.get(id).classes.add(name); }, remove(name) { controls.get(id).classes.delete(name); } },
      setAttribute(k,v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
      getClientRects: () => [1], focus() { this.focused = true; }, scrollIntoView() {}, addEventListener() {} });
    return controls.get(id);
  };
  const state = { roots, rootId: '', sessionId: draft ? 'favorite-draft-1' : '', session: draft ? {} : null, settings: {} };
  const calls = [];
  const context = vm.createContext({ State: state, $: control,
    document: { querySelectorAll: () => [control('picker')], body: { classList: { add() {} } } },
    T: (key) => key, showMiniToast: (msg) => calls.push(msg),
    setTabRootId: (id) => { state.rootId = id; }, renderWorkdirBar() {}, renderRootMeta() {},
    currentRoot: () => roots.find((r) => r.id === state.rootId), isWorkspace: () => false,
    isFavoriteDraftId: (id) => id.startsWith('favorite-draft-'),
    bindFavoriteDraftRoot: async (id) => { state.session.rootId = id; state.sessionId = 'real'; calls.push(id); },
    api: async (_route, data) => { calls.push(data.rootId); return { id: 'real' }; },
    loadSessions: async () => {}, selectSession: async (id) => { state.sessionId = id; },
    alert: () => { throw Error('blocking alert must not be used'); },
  });
  vm.runInContext(segment('function requestRootSelection()', '// 选中某个根目录（下拉框')
    + segment('async function ensureSession()', '// 所有会话一视同仁'), context);
  return { context, state, calls, control };
}

for (const draft of [false, true]) {
  test(`send with ${draft ? 'favorite draft' : 'classic session'}: zero/one/multiple directories`, async () => {
    const single = frontend([{ id: 'only' }], draft);
    assert.equal(await vm.runInContext('ensureSession()', single.context), true);
    assert.ok(single.calls.includes('only'));
    for (const roots of [[], [{ id: 'a' }, { id: 'b' }]]) {
      const f = frontend(roots, draft);
      assert.equal(await vm.runInContext('ensureSession()', f.context), false);
      assert.equal(f.control('taskInput').value, 'message stays');
      const target = f.control(roots.length ? 'picker' : 'addRootBtn');
      assert.ok(target.classes.has('root-needs-choice'));
      assert.equal(target.focused, true);
      assert.equal(target.attrs['aria-invalid'], 'true');
      assert.ok(f.calls.includes(roots.length ? 'rootChoiceHint' : 'rootAddHint'));
    }
  });
}

test('beginner option skips questions, guards double clicks, and binds the active draft', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/rootwizard.js'), 'utf8');
  const state = { sessionId: 'favorite-draft-1' };
  let apiCalls = 0;
  let bound = '';
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const context = vm.createContext({ State: state, crypto: require('node:crypto').webcrypto,
    T: (key) => key, closeAddRootGuide() {}, showMiniToast() {}, focusTaskInputIfDesktop() {},
    isFavoriteDraftId: (id) => id.startsWith('favorite-draft-'),
    bindFavoriteDraftRoot: async (id) => { bound = id; },
    api: async (_route, body) => { apiCalls++; assert.match(body.requestId, /^[a-f0-9-]{36}$/); await pending; return { id: 'new', path: '/home/test/projects/new' }; },
    runRootFlow: async (choice, makeRoot, ready) => { assert.equal(choice, 'skip'); const root = await makeRoot(); await ready(root.id); },
  });
  const start = source.indexOf("let quickStartRequestId");
  const end = source.indexOf('function closeAddRootGuide()', start);
  vm.runInContext(source.slice(start, end), context);
  const first = vm.runInContext('quickStartRoot()', context);
  await vm.runInContext('quickStartRoot()', context);
  assert.equal(apiCalls, 1);
  release();
  await first;
  assert.equal(bound, 'new');
});
