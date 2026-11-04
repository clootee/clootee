const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../projects/claude_hub/backend/scripts/setup.js'), 'utf8').split('main().catch(')[0];
function fixture(platform, options = {}) {
  const installed = new Set(options.installed || []), calls = [], logs = [];
  const process = { platform, arch: 'x64', execPath: '/runtime/node', versions: { node: '22.23.4' }, argv: ['node', 'setup', ...(options.args || [])], env: { PATH: '/system' } };
  const fakeFs = { ...fs, existsSync: file => {
    if (file.includes('npm-cli.js')) return true;
    if (file.endsWith('bash.exe')) return !options.noBash;
    const name = /(?:^|[/\\])(claude|codex)(?:\.cmd)?$/.exec(file)?.[1];
    return name ? installed.has(name) : true;
  } };
  const spawnSync = (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'where' || cmd === 'which') return { status: args[0] === 'git' ? (options.noGit ? 1 : 0) : 1, stdout: '/system/git' };
    if (args.includes('install')) {
      if (options.failInstall || (options.failFirst && !calls.some(c => c !== calls.at(-1) && c.args.includes('install')))) return { status: 1 };
      installed.add(args.find(a => a.startsWith('@')).includes('claude') ? 'claude' : 'codex');
      return { status: 0 };
    }
    return { status: options.brokenVersion ? 1 : 0, stdout: '1.2.3' };
  };
  const context = { URL, process, __dirname: '/app/projects/claude_hub/backend/scripts', console: { log: s => logs.push(s) }, require: name => {
    if (name === 'fs') return fakeFs;
    if (name === 'child_process') return { spawnSync };
    if (name === './build') return {};
    if (name === './registry') return { pick: async () => ({ registry: 'https://official/', reason: 'fastest', timings: {} }), OFFICIAL: 'https://official/', MIRROR: 'https://mirror/' };
    if (name === './git') return { bundled: () => null, install: async (_dir, opts) => { calls.push({ git: opts }); return options.failGit ? { ok: false, error: 'download failed' } : { ok: true, bin: '/bundled/cmd/git' }; } };
    return require(name);
  } };
  vm.runInNewContext(source + '\nglobalThis.api = {checkEngines, checkGit, problems};', context);
  return { ...context.api, calls, logs, installed };
}
for (const platform of ['win32', 'darwin', 'linux']) {
  test(platform + ': default install includes both engines, optional binaries and private prefix', async () => {
    const f = fixture(platform);
    assert.equal(await f.checkEngines(), true);
    assert.deepEqual([...f.installed], ['claude', 'codex']);
    const installs = f.calls.filter(c => c.args?.includes('install'));
    assert.equal(installs.length, 2);
    for (const { args } of installs) { assert.ok(args.includes('--prefix')); assert.ok(args.includes('--include=optional')); }
  });
  test(platform + ': repeated setup reuses working engines', async () => {
    const f = fixture(platform, { installed: ['claude', 'codex'] });
    assert.equal(await f.checkEngines(), true);
    assert.equal(f.calls.filter(c => c.args?.includes('install')).length, 0);
  });
}
test('failed download switches mirror and still verifies both engines', async () => {
  const f = fixture('linux', { failFirst: true });
  assert.equal(await f.checkEngines(), true);
  assert.ok(f.calls.some(c => c.args?.includes('--registry=https://mirror/')));
});
test('installation and executable failures prevent readiness', async () => {
  for (const opts of [{ failInstall: true }, { brokenVersion: true }]) {
    const f = fixture('linux', opts);
    assert.equal(await f.checkEngines(), false);
    assert.equal(f.problems.length, 2);
  }
});
test('doctor reports missing engines without installing', async () => {
  const f = fixture('linux', { args: ['--check'] });
  assert.equal(await f.checkEngines(), false);
  assert.equal(f.calls.filter(c => c.args?.includes('install')).length, 0);
});
test('Git failure blocks setup; Windows requests full Git Bash distribution', async () => {
  const f = fixture('win32', { noGit: true, failGit: true });
  assert.equal(await f.checkGit(), false);
  assert.equal(f.calls.find(c => c.git).git.full, true);
  assert.equal(f.problems.length, 1);
});
function unixGit(platform, { manager = 'apt-get', uid = 1000, failure = false } = {}) {
  const calls = [];
  const context = { URL, module: { exports: {} }, process: { platform, getuid: () => uid }, require: name => {
    if (name === 'child_process') return { spawnSync(cmd, args) {
      calls.push({ cmd, args });
      if (cmd === 'which') return { status: [manager, 'sudo', 'git'].includes(args[0]) ? 0 : 1, stdout: '/usr/bin/' + args[0] };
      if (cmd === 'softwareupdate') return { status: 0, stdout: '* Label: Command Line Tools for Xcode-16.4\n' };
      return { status: failure ? 1 : 0 };
    } };
    if (name === 'fs') return { closeSync() {}, openSync() { return 1; }, unlinkSync() {} };
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../projects/claude_hub/backend/scripts/git.js'), 'utf8'), context);
  return { calls, install: () => context.module.exports.install('/tools/git') };
}
test('Linux automatically elevates package installation and waits for completion', async () => {
  const f = unixGit('linux');
  assert.equal((await f.install()).ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.filter(c => c.cmd === 'sudo').map(c => c.args))), [['apt-get', 'update'], ['apt-get', 'install', '-y', 'git']]);
});
test('package index failure stops Git installation', async () => {
  const f = unixGit('linux', { failure: true });
  assert.equal((await f.install()).ok, false);
  assert.equal(f.calls.filter(c => c.cmd === 'sudo').length, 1);
});
test('macOS without Homebrew waits for privileged Command Line Tools installation', async () => {
  const f = unixGit('darwin', { manager: '' });
  assert.equal((await f.install()).ok, true);
  assert.ok(f.calls.some(c => c.cmd === 'osascript' && c.args[1].includes('with administrator privileges')));
  assert.equal(f.calls.some(c => c.cmd === 'xcode-select'), false);
});
