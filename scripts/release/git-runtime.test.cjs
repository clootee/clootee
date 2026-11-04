const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const backend = path.resolve(__dirname, '../../projects/claude_hub/backend');
const code = fs.readFileSync(path.join(backend, 'dist/helper/GitBin.js'), 'utf8');
function fixture({ system = false, platform = 'linux', fail = false } = {}) {
  let available = system, installs = 0, broken = false;
  const events = [];
  const context = { exports: {}, __dirname: path.join(backend,'dist/helper'), process: { platform, env: { PATH: '/system' } },
    require: name => {
      if (name === 'child_process') return { execFileSync() { if (!available || broken) throw Error('not installed'); return 'git version 2.51'; } };
      if (name === 'fs') return { existsSync: () => true };
      if (name === 'path') return path;
      if (name === './OutEnd') return { OutEnd: { gitDir: () => '/portable/git', gitExe: () => available ? '/portable/git/cmd/git' : null } };
      if (name === './EventBus') return { EventBus: { broadcast: e => events.push(e) } };
      if (name.endsWith('/scripts/git.js')) return { install: async (_dir, opts) => {
        installs++; events.push({ full: opts.full }); await new Promise(resolve => setImmediate(resolve));
        if (fail) return { ok: false, error: 'download failed' };
        available = true; broken = false; return { ok: true, bin: '/portable/git/cmd/git' };
      } };
      throw Error(name);
    },
  };
  vm.runInNewContext(code, context);
  return { Git: context.exports.GitBin, events, installs: () => installs, remove: () => { available = false; broken = false; } };
}
test('working system Git is reused without downloads', async () => {
  const f = fixture({ system: true }); assert.equal(await f.Git.ensure(), 'git'); assert.equal(f.installs(), 0);
});
test('missing Git installs automatically once for concurrent runtime actions', async () => {
  const f = fixture({ platform: 'win32' });
  assert.deepEqual(await Promise.all([f.Git.ensure(),f.Git.ensure()]), ['git','git']);
  assert.equal(f.installs(), 1); assert.equal(f.events.find(e => 'full' in e).full, true);
  assert.ok(f.events.some(e => e.status === 'ready'));
});
test('a Git executable removed during runtime is detected and reinstalled', async () => {
  const f = fixture({ system: true }); await f.Git.ensure(); f.remove();
  await f.Git.ensure(); assert.equal(f.installs(), 1);
});
test('failed installation blocks the action and reports an actionable error', async () => {
  const f = fixture({ fail: true }); await assert.rejects(f.Git.ensure(), /Git installation incomplete/);
  assert.ok(f.events.some(e => e.status === 'error')); assert.equal(f.events.some(e => e.status === 'ready'), false);
});
