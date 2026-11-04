// Launch the real packaged desktop executable on its native CI runner.
const { _electron } = require('./desktop/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const base = path.join(__dirname, 'desktop/output');
const exe = process.platform === 'win32' ? path.join(base, 'win-unpacked/Clootee.exe') : path.join(base, 'mac-universal/Clootee.app/Contents/MacOS/Clootee');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-desktop-smoke-'));
(async () => {
 let desktop;
 try {
  // Exercise the same blocking dependency phase invoked by the Windows installer.
  const { spawn } = require('node:child_process');
  await new Promise((resolve, reject) => {
    const installer = spawn(exe, ['--install-only', '--user-data-dir=' + profile], { stdio: 'inherit' });
    const timer = setTimeout(() => { installer.kill(); reject(new Error('Dependency installation timed out')); }, 1200000);
    installer.once('error', e => { clearTimeout(timer); reject(e); });
    installer.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Dependency installation failed: ' + code)); });
  });
  desktop = await _electron.launch({ executablePath: exe, args: ['--user-data-dir=' + profile], timeout: 1200000 });
  const win = await desktop.firstWindow();
  await win.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\/$/, { timeout: 1200000 });
  const status = await win.evaluate(async () => (await fetch('/api/auth/status')).json());
  assert.equal(status.success, true);
  assert.equal(status.data.passwordEnabled, false);
  assert.equal(status.data.needsSetup, false);
  assert.equal(fs.existsSync(path.join(profile, 'data/auth.json')), false);
  const info = await desktop.evaluate(({ app }) => ({ version: app.getVersion(), userData: app.getPath('userData') }));
  const expected = require('../../projects/claude_hub/backend/package.json').version;
  assert.equal(info.version, expected);
  // macOS exposes /var through its canonical /private/var alias.
  assert.equal(fs.realpathSync(info.userData), fs.realpathSync(profile));
  assert.ok(fs.existsSync(path.join(info.userData, 'versions', expected, '.ready')));
  assert.ok(fs.existsSync(path.join(info.userData, 'data')));
  await win.locator('body').waitFor();
  await win.screenshot({ path: path.join(base, 'desktop-smoke.png') });
  const runtime = path.join(__dirname, 'desktop/runtimes', process.platform + '-' + process.arch, process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const { execFileSync } = require('node:child_process');
  assert.match(execFileSync(runtime, ['--version'], { encoding: 'utf8' }), /^v22\./);
  const tools = path.join(profile, 'out_end', 'tools');
  const env = { ...process.env, PATH: [path.dirname(runtime), process.platform === 'win32' ? tools : path.join(tools, 'bin'), process.env.PATH].join(path.delimiter) };
  for (const name of ['claude', 'codex']) {
    const file = process.platform === 'win32' ? path.join(tools, name + '.cmd') : path.join(tools, 'bin', name);
    const resolved = fs.existsSync(file) ? file : name;
    const command = process.platform === 'win32' ? '"' + resolved + '"' : resolved;
    assert.ok(execFileSync(command, ['--version'], { env, shell: process.platform === 'win32', encoding: 'utf8', timeout: 30000 }).trim());
  }
  const firstOrigin = new URL(win.url()).origin;
  const quickstart = await win.evaluate(async () => (await fetch('/api/auth/quickstart', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json());
  assert.equal(quickstart.success, true);
  assert.equal(quickstart.data.token, '');
  assert.equal(fs.existsSync(path.join(profile, 'data/auth.json')), false);
  assert.equal(await win.locator('#loginOverlay').isVisible(), false);
  assert.equal(await win.locator('#logoutBtn').isVisible(), false);
  const token = 'workspace-state-survives-restart';
  await win.evaluate(token => localStorage.setItem('clootee-smoke-login', token), token);
  await desktop.close(); desktop = null;
  // Wait for our own backend to release its persisted port before relaunching.
  for (let i = 0; i < 100; i++) {
    try { await fetch(firstOrigin + '/api/auth/status', { signal: AbortSignal.timeout(300) }); }
    catch { break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  desktop = await _electron.launch({ executablePath: exe, args: ['--user-data-dir=' + profile], timeout: 1200000 });
  const secondWindow = await desktop.firstWindow();
  await secondWindow.waitForURL(firstOrigin + '/', { timeout: 1200000 });
  assert.equal(await secondWindow.evaluate(() => localStorage.getItem('clootee-smoke-login')), token);
  const signedIn = await secondWindow.evaluate(async () => (await fetch('/api/auth/check')).json());
  assert.equal(await secondWindow.locator('#loginOverlay').isVisible(), false);
  assert.equal(await secondWindow.locator('#logoutBtn').isVisible(), false);
  assert.equal(signedIn.success, true);
  assert.equal(signedIn.data.version, expected);
  console.log('Packaged desktop: isolated profile, real Node, fresh backend, stable origin and sign-in preserved across restart:', info.version);
 } finally { if (desktop) await desktop.close(); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
