'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { once } = require('node:events');
const backend = path.resolve(__dirname, '../../projects/claude_hub/backend');
const { CodexStoreHelper } = require(path.join(backend, 'dist/helper/CodexStoreHelper'));
const { SessionManager } = require(path.join(backend, 'dist/logic_realize/SessionManager'));
const { Settings } = require(path.join(backend, 'dist/logic_realize/Settings'));
const { RootManager } = require(path.join(backend, 'dist/logic_realize/RootManager'));
const { Paths } = require(path.join(backend, 'dist/paths'));
const { createSupervisor } = require('../linux/supervisor.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function rollout(root, id, cwd = '/fixture') {
  const file = path.join(root, `rollout-${id}.jsonl`);
  fs.writeFileSync(file, JSON.stringify({ type: 'session_meta', payload: { id, cwd } }) + '\n' + JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `Question ${id}` }] } }) + '\n');
  return file;
}
test('1200 indexed sessions share one async scan and one metadata read; HTTP stays responsive', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-list-'));
  const root = path.join(tmp, 'sessions/2026/11/07');
  fs.mkdirSync(root, { recursive: true });
  const meta = {};
  for (let i = 0; i < 1200; i++) {
    rollout(root, `id-${i}`);
    meta[`fixture:id-${i}`] = { indexed: true, indexedAt: i + 1, pinned: i === 0, favorite: i === 1 };
  }
  meta['fixture:missing'] = { indexed: true };
  const metaFile = path.join(tmp, 'session_meta.json');
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  const saved = { codex: process.env.CODEX_HOME, meta: Paths.SESSION_META_FILE, home: Settings.effectiveHomeDir, root: RootManager.getRoot,
    read: fs.readFileSync, readdir: fs.readdirSync, asyncReaddir: fs.promises.readdir };
  let metaReads = 0, syncWalks = 0, asyncWalks = 0, probes = 0;
  process.env.CODEX_HOME = tmp;
  Paths.SESSION_META_FILE = metaFile;
  Settings.effectiveHomeDir = () => tmp;
  RootManager.getRoot = () => ({ id: 'fixture', path: '/fixture' });
  fs.readFileSync = function(file, ...args) { if (String(file) === metaFile) metaReads++; return saved.read.call(this, file, ...args); };
  fs.readdirSync = function(dir, ...args) { if (String(dir).startsWith(tmp)) syncWalks++; return saved.readdir.call(this, dir, ...args); };
  fs.promises.readdir = async function(dir, ...args) { if (String(dir).startsWith(tmp)) asyncWalks++; return saved.asyncReaddir.call(this, dir, ...args); };
  const server = http.createServer((req, res) => { probes++; res.end('alive'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let done = false;
  const probe = (async () => { while (!done) { assert.equal(await (await fetch(`http://127.0.0.1:${server.address().port}`)).text(), 'alive'); await pause(2); } })();
  try {
    const list = await SessionManager.listIndexedSessions();
    assert.equal(list.length, 1200);
    assert.equal(new Set(list.map(s => s.id)).size, 1200);
    assert.equal(list[0].id, 'fixture:id-0'); // pinned first
    assert.equal(list[1].id, 'fixture:id-1199'); // newest indexed next
    assert.equal(list.find(s => s.id === 'fixture:id-1').favorite, true);
    assert.equal(metaReads, 1);
    assert.equal(syncWalks, 0);
    assert.equal(asyncWalks, 4); // sessions/year/month/day, once each
    assert.ok(probes > 0, 'HTTP must be served before the list completes');
  } finally {
    done = true; await probe;
    await new Promise(resolve => server.close(resolve));
    fs.readFileSync = saved.read; fs.readdirSync = saved.readdir; fs.promises.readdir = saved.asyncReaddir;
    Paths.SESSION_META_FILE = saved.meta; Settings.effectiveHomeDir = saved.home; RootManager.getRoot = saved.root;
    if (saved.codex === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = saved.codex;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('request snapshots refresh additions and deletions and isolate concurrent homes', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-index-'));
  const saved = process.env.CODEX_HOME;
  delete process.env.CODEX_HOME;
  const a = path.join(tmp, 'a'), b = path.join(tmp, 'b');
  for (const home of [a, b]) fs.mkdirSync(path.join(home, '.codex/sessions'), { recursive: true });
  const file = rollout(path.join(a, '.codex/sessions'), 'a');
  rollout(path.join(b, '.codex/sessions'), 'b');
  try {
    await Promise.all([a, b].map(home => CodexStoreHelper.withIndex(home, async () => {
      await pause(10);
      const id = path.basename(home);
      assert.equal(CodexStoreHelper.index(home).length, 1);
      assert.equal(CodexStoreHelper.findFile(id, home).sessionId, id);
      assert.equal(CodexStoreHelper.findFile(id === 'a' ? 'b' : 'a', home), null);
    })));
    fs.unlinkSync(file); rollout(path.join(a, '.codex/sessions'), 'new');
    await CodexStoreHelper.withIndex(a, () => {
      assert.equal(CodexStoreHelper.findFile('a', a), null);
      assert.equal(CodexStoreHelper.findFile('new', a).sessionId, 'new');
    });
  } finally {
    if (saved === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('recovery preserves transiently busy workers and replaces unresponsive or exited workers', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-busy-'));
  const work = path.join(tmp, 'backend');
  fs.mkdirSync(path.join(work, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(work, 'dist/index.js'), `const fs=require('fs');require('http').createServer((q,s)=>{if(fs.existsSync('busy')&&fs.readFileSync('busy','utf8')===String(process.pid))return; s.end(JSON.stringify({success:true,data:{passwordEnabled:false}}));}).listen(Number(process.env.PORT),'127.0.0.1');`);
  const launcher = createSupervisor({ backend: work, port: 0, healthTimeout: 250, recoveryTimeout: 2000, startupTimeout: 10000, retryDelay: 30000 });
  try {
    const address = await launcher.listen(); await launcher.start();
    const base = `http://127.0.0.1:${address.port}`;
    const recover = () => fetch(base + '/api/launcher/start', { method: 'POST', headers: { Origin: base } });
    const pid = launcher.worker.pid;
    fs.writeFileSync(path.join(work, 'busy'), String(pid));
    const timer = setTimeout(() => fs.rmSync(path.join(work, 'busy')), 120);
    const responses = await Promise.all([recover(), recover()]); clearTimeout(timer);
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    assert.equal(launcher.worker.pid, pid);
    fs.writeFileSync(path.join(work, 'busy'), String(pid));
    const recovered = await recover(); assert.equal(recovered.status, 200);
    assert.notEqual(launcher.worker.pid, pid);
    const replacementPid = launcher.worker.pid;
    fs.writeFileSync(path.join(work, 'busy'), String(replacementPid));
    const waiting = recover();
    await pause(50); fs.rmSync(path.join(work, 'busy'));
    launcher.worker.kill('SIGKILL'); await once(launcher.worker, 'exit');
    assert.equal((await waiting).status, 200);
    assert.notEqual(launcher.worker.pid, replacementPid);
  } finally { await launcher.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('recovery UI shows busy and startup errors without losing their cause', async () => {
  const source = fs.readFileSync(path.resolve(backend, '../frontend/app.js'), 'utf8');
  for (const [result, expected] of [
    [{ code: 'WORKER_BUSY', error: 'worker alive' }, 'workspaceRecoveryBusy'],
    [{ code: 'START_FAILED', error: 'Worker exited before startup completed.' }, 'workspaceRecoveryFailed: Worker exited before startup completed.'],
  ]) {
    const elements = { accessErrorRetry: {}, accessErrorNote: {} };
    const context = { AbortSignal, Promise, setTimeout, TOKEN: 'saved', T: key => key === 'workspaceRecoveryFailed' ? key + ': {reason}' : key,
      $: id => elements[id], window: {}, location: { hostname: 'server.example' },
      refreshSecurityState: async () => { throw Error('offline'); },
      fetch: async () => ({ ok: false, status: 503, json: async () => result }) };
    vm.runInNewContext(source.slice(source.indexOf('let workspaceRecovering = false'), source.indexOf('async function showLogin()')), context);
    await context.recoverWorkspace();
    assert.equal(elements.accessErrorNote.textContent, expected);
    assert.equal(elements.accessErrorRetry.disabled, false);
  }
});
