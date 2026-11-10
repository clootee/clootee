const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../projects/claude_hub/frontend/rootwizard.js'), 'utf8');

async function scenario({ proceed = true, existing = false, fail = true, unknown = false } = {}) {
  const calls = [];
  const elements = new Map();
  let ready = 0;
  const context = {
    State: { rootId: 'previous' },
    $: (id) => {
      if (!elements.has(id)) elements.set(id, { style: {} });
      return elements.get(id);
    },
    T: (key) => key + ' {error}',
    setTimeout: (cb) => cb(),
    confirm: (message) => { calls.push(['confirm', message]); return proceed; },
    alert: (message) => calls.push(['alert', message]),
    setTabRootId: (id) => { context.State.rootId = id; },
    loadRoots: async () => {},
    api: async (url, body) => {
      calls.push([url, body]);
      if (url === '/api/root/list') return existing ? [{ id: 'target' }] : [];
      if (url.startsWith('/api/template/need')) return { needed: true };
      if (url === '/api/template/apply' && fail) throw new Error('EACCES: CLAUDE.md');
      return {};
    },
  };
  vm.runInNewContext(source, context);
  context.pickTemplate = async () => ({ kind: 'builtin', id: 'web-tool' });
  await context.runRootFlow(unknown ? 'unknown' : { kind: 'builtin', id: 'web-tool' },
    async () => ({ id: 'target' }), async () => ready++);
  return { calls, ready, selected: context.State.rootId };
}

(async () => {
  for (const unknown of [false, true]) {
    const continued = await scenario({ unknown });
    assert.equal(continued.ready, 1);
    assert.equal(continued.selected, 'target');
    assert.ok(continued.calls.some(([url]) => url === '/api/template/skip'));
    assert.ok(continued.calls.some(([url, message]) => url === 'confirm' && message.includes('EACCES')));
    assert.ok(!continued.calls.some(([url]) => url === '/api/root/remove'));
    const cancelled = await scenario({ proceed: false, unknown });
    assert.equal(cancelled.ready, 0);
    assert.equal(cancelled.selected, 'previous');
    assert.ok(cancelled.calls.some(([url, body]) => url === '/api/root/remove' && body.id === 'target'));
    const reused = await scenario({ proceed: false, existing: true, unknown });
    assert.ok(!reused.calls.some(([url]) => url === '/api/root/remove'));
    assert.equal(reused.ready, 0);
  }
  const success = await scenario({ fail: false });
  assert.equal(success.ready, 1);
  assert.ok(!success.calls.some(([url]) => url === 'confirm'));
  process.stdout.write('root template failure: 7 scenarios passed\n');
})().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
