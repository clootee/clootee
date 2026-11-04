const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../projects/claude_hub/frontend/engine-recovery.js'), 'utf8');
function fixture({ ready = [], fail } = {}) {
  const elements = {}, calls = [], installed = new Set(ready), focus = { isConnected: true, focus() {} };
  for (const id of ['Modal','Note','Progress','Install','Close','Title']) elements['engineRecovery' + id] = { focus() {} };
  const dialog = elements.engineRecoveryModal;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.onclose(); };
  let failed = false;
  const context = { Set, Promise, document: { activeElement: focus, body: { style: { overflow: 'auto' } } },
    $: id => elements[id], T: key => key, alert: message => calls.push(['alert', message]),
    startEngineInstallProgress: () => () => {},
    api: async (url, body) => {
      calls.push([url, body]);
      if (url.startsWith('/api/engine/status')) return Object.fromEntries(['claude','codex'].map(id => [id, { ready: installed.has(id) }]));
      if (url === '/api/engine/update') {
        if (body.engine === fail && !failed) { failed = true; throw Error('download failed'); }
        installed.add(body.engine);
        return { ok: true };
      }
      throw Error('unexpected API');
    },
  };
  vm.runInNewContext(source + '\nglobalThis.recovery = EngineRecovery;', context);
  return { ...context, recovery: context.recovery, elements, calls, installed, dialog };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('missing engines prompt before installing; cancel makes no changes', async () => {
  const f = fixture(); const request = f.recovery.ensure('claude'); await tick();
  assert.equal(f.dialog.open, true);
  assert.equal(f.calls.filter(([url]) => url === '/api/engine/update').length, 0);
  f.elements.engineRecoveryClose.onclick();
  assert.equal(await request, false);
  assert.equal(f.document.body.style.overflow, 'auto');
});
test('one confirmation installs both missing engines sequentially; success stays visible', async () => {
  const f = fixture(); const request = f.recovery.ensure('claude'); await tick();
  await f.elements.engineRecoveryInstall.onclick();
  assert.deepEqual(f.calls.filter(([url]) => url === '/api/engine/update').map(([,body]) => body.engine), ['claude','codex']);
  assert.equal(f.dialog.open, true);
  assert.equal(f.elements.engineRecoveryInstall.hidden, true);
  f.elements.engineRecoveryClose.onclick(); assert.equal(await request, true);
});
test('partial failure can retry without reinstalling the successful engine', async () => {
  const f = fixture({ fail: 'codex' }); const request = f.recovery.ensure('claude'); await tick();
  await f.elements.engineRecoveryInstall.onclick();
  assert.equal(f.dialog.open, true); assert.equal(f.elements.engineRecoveryInstall.hidden, false);
  assert.equal(f.elements.engineRecoveryProgress.textContent, 'download failed');
  await f.elements.engineRecoveryInstall.onclick();
  assert.deepEqual(f.calls.filter(([url]) => url === '/api/engine/update').map(([,body]) => body.engine), ['claude','codex','codex']);
  f.elements.engineRecoveryClose.onclick(); assert.equal(await request, true);
});
test('concurrent detections share a single confirmation and do not double install', async () => {
  const f = fixture(); const first = f.recovery.ensure('claude'); await tick();
  const second = f.recovery.ensure('codex');
  await f.elements.engineRecoveryInstall.onclick(); f.elements.engineRecoveryClose.onclick();
  assert.equal(await first, true); assert.equal(await second, true);
  assert.equal(f.calls.filter(([url]) => url === '/api/engine/update').length, 2);
});
test('runtime missing executable errors force recovery even if status was stale', async () => {
  const f = fixture({ ready: ['claude','codex'] });
  const request = f.recovery.fromError('spawn claude ENOENT', 'task-1'); await tick();
  assert.equal(f.dialog.open, true);
  assert.equal(await f.recovery.fromError('spawn claude ENOENT', 'task-1'), false);
  await f.elements.engineRecoveryInstall.onclick();
  assert.deepEqual(f.calls.filter(([url]) => url === '/api/engine/update').map(([,body]) => body.engine), ['claude']);
  f.elements.engineRecoveryClose.onclick(); assert.equal(await request, true);
});
test('available engines and unrelated errors do not prompt or install', async () => {
  const f = fixture({ ready: ['claude','codex'] });
  assert.equal(await f.recovery.ensure('codex'), true);
  assert.equal(await f.recovery.fromError('ENOENT /project/missing.txt'), false);
  assert.equal(f.dialog.open, undefined);
});
function updaterFixture({ failVerify = false } = {}) {
  const exports = {}, calls = [];
  const context = { exports, Map, Promise, require: name => {
    if (name.includes('ClaudeBin')) return { ClaudeBin: { clearCache() {} } };
    if (name.includes('CodexBin')) return { CodexBin: { clearCache() {} } };
    if (name.includes('EngineStatus')) return { EngineStatus: { invalidate() {} } };
    throw Error(name);
  } };
  const code = fs.readFileSync(path.join(__dirname, '../../projects/claude_hub/backend/dist/logic_struct/EngineUpdaterStruct.js'), 'utf8');
  vm.runInNewContext(code, context);
  class Updater extends exports.EngineUpdaterStruct {
    static async _pickRegistry() { return 'https://registry.example/'; }
    static async _npmInstall(pkg) { calls.push('install:' + pkg); await tick(); return 'done'; }
    static async _verify(engine) { calls.push('verify:' + engine); if (failVerify) throw Error('not runnable'); }
  }
  return { Updater, calls };
}
test('backend deduplicates same-engine installs and serializes different engines', async () => {
  const { Updater, calls } = updaterFixture();
  await Promise.all([Updater.update('claude'), Updater.update('claude'), Updater.update('codex')]);
  assert.deepEqual(calls, ['install:@anthropic-ai/claude-code','verify:claude','install:@openai/codex','verify:codex']);
});
test('backend rejects an installation whose executable verification fails', async () => {
  const { Updater } = updaterFixture({ failVerify: true });
  await assert.rejects(Updater.update('claude'), /not runnable/);
  // A failed earlier job must not block the queue forever.
  await assert.rejects(Updater.update('codex'), /not runnable/);
});
