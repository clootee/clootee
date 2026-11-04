/* Desktop shell only. The backend runs with a real bundled Node in a writable,
 * per-user installation; credentials and downloaded tools survive upgrades. */
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const { bindUpdates } = require('./updater.cjs');
let win, child, quitting = false, installationComplete = false;
const installOnly = process.argv.includes('--install-only');
if (installOnly && process.env.CLOOTEE_UPDATE_PROFILE) app.setPath('userData', process.env.CLOOTEE_UPDATE_PROFILE);
const single = app.requestSingleInstanceLock();
if (!single) app.exit(installOnly ? 1 : 0);
else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('Clootee', error.message); app.exit(1); });
}
function stopChild() {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') require('node:child_process').spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } }
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); });
  });
}
async function persistentPorts(home) {
  const file = path.join(home, 'desktop-ports.json');
  let ports;
  if (fs.existsSync(file)) ports = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    const port = await freePort(); let kimi;
    do { kimi = await freePort(); } while (kimi === port);
    ports = { port, kimi };
    fs.writeFileSync(file + '.tmp', JSON.stringify(ports), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  }
  if (![ports.port, ports.kimi].every(p => Number.isInteger(p) && p >= 1024 && p <= 65535) || ports.port === ports.kimi) throw new Error('本地端口配置无效 / Invalid local port configuration: ' + file);
  for (const port of [ports.port, ports.kimi]) await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', () => reject(new Error(`端口 ${port} 被占用，请关闭上次的 Clootee 或重启电脑后重试。/ Port ${port} is in use. Close the previous Clootee process or restart your computer.`)));
    socket.listen(port, '127.0.0.1', () => socket.close(resolve));
  });
  return ports;
}
async function start() {
  const home = app.getPath('userData');
  const root = path.join(home, 'versions', app.getVersion());
  const hub = path.join(root, 'projects', 'claude_hub');
  win = new BrowserWindow({ width: 1380, height: 900, minWidth: 360, minHeight: 520, title: 'Clootee', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#f8f9ff', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'Clootee', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }
  ]));
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><style>body{font:16px system-ui;background:#f8f9ff;color:#30334d;display:grid;place-items:center;height:90vh;text-align:center}h1{color:#7263e8}small{color:#76798c}</style><div><h1>Clootee</h1><p>正在准备你的工作空间…<br>Preparing your workspace…</p><small>正在检查 Node、Git、Claude Code 和 Codex；缺失时自动安装。<br>Checking Node, Git, Claude Code and Codex. Missing components install automatically.</small><pre id="progress" style="max-width:85vw;max-height:45vh;overflow:auto;white-space:pre-wrap;text-align:left;font-size:12px"></pre></div>'));
  if (!fs.existsSync(path.join(root, '.ready'))) {
    fs.mkdirSync(root, { recursive: true });
    fs.cpSync(path.join(process.resourcesPath, 'payload'), root, { recursive: true });
    // Never let payload content replace an existing user's credentials or tools.
    for (const name of ['data', 'out_end']) {
      const shared = path.join(home, name);
      const target = path.join(hub, name);
      fs.mkdirSync(shared, { recursive: true });
      if (name === 'out_end' && fs.existsSync(target)) fs.cpSync(target, shared, { recursive: true, force: false, errorOnExist: false });
      fs.rmSync(target, { recursive: true, force: true });
      fs.symlinkSync(shared, target, process.platform === 'win32' ? 'junction' : 'dir');
    }
    fs.writeFileSync(path.join(root, '.ready'), app.getVersion());
  }
  const runtime = path.join(process.resourcesPath, 'runtimes', process.platform + '-' + process.arch);
  const bin = process.platform === 'win32' ? runtime : path.join(runtime, 'bin');
  const node = path.join(bin, process.platform === 'win32' ? 'node.exe' : 'node');
  const backend = path.join(hub, 'backend');
  // Keep the browser origin stable: changing port would lose saved sign-in,
  // language, theme and drafts, even though the backend data is preserved.
  const { port, kimi } = await persistentPorts(home);
  const log = fs.openSync(path.join(home, 'desktop.log'), 'a');
  const env = { ...process.env, PORT: String(port), KIMI_PROXY_PORT: String(kimi), CLOOTEE_LOG_CONSOLE: '1', CLOOTEE_DESKTOP: '1', npm_config_prefix: path.join(hub, 'out_end', 'tools'), PATH: [bin, path.join(hub, 'out_end', 'git', 'cmd'), path.join(hub, 'out_end', 'git', 'bin'), process.platform === 'win32' ? path.join(hub, 'out_end', 'tools') : path.join(hub, 'out_end', 'tools', 'bin'), process.env.PATH || ''].join(path.delimiter) };
  delete env.ELECTRON_RUN_AS_NODE;
  // Use the same required dependency installer as source packages, before serving UI.
  await new Promise((resolve, reject) => {
    let tail = '';
    child = spawn(node, [path.join(backend, 'scripts', 'setup.js'), '--runtime-only'],
      { cwd: backend, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { stopChild(); reject(new Error('安装超时，请检查网络后重试 / Setup timed out. Retry after checking your connection. ' + path.join(home, 'desktop.log'))); }, 30 * 60 * 1000);
    const output = bytes => {
      fs.writeSync(log, bytes);
      tail = (tail + bytes.toString()).slice(-8000);
      if (win && !win.isDestroyed()) win.webContents.executeJavaScript(
        `document.getElementById('progress').textContent = ${JSON.stringify(tail)};`).catch(() => {});
    };
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer); child = null;
      if (code === 0) resolve();
      else reject(new Error('依赖安装未完成 / Dependency setup incomplete. 请重新打开重试 / Reopen to retry. ' + path.join(home, 'desktop.log') + '\n' + tail.slice(-2000)));
    });
  });
  installationComplete = true;
  // Setup runs in a separate process. Recreate its Git Bash environment for sessions.
  if (process.platform === 'win32') {
    const bash = path.join(hub, 'out_end', 'git', 'bin', 'bash.exe');
    if (fs.existsSync(bash)) env.CLAUDE_CODE_GIT_BASH_PATH = bash;
  }
  if (installOnly) { fs.closeSync(log); app.quit(); return; }
  child = spawn(node, [path.join(backend, 'dist', 'index.js')], { cwd: backend, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', log, log, 'ipc'] });
  bindUpdates(child, { app, home, node, port, stop: () => { quitting = true; stopChild(); }, feed: process.env.CLOOTEE_UPDATE_FEED });
  fs.closeSync(log);
  let failure;
  child.once('error', e => { failure = e; });
  child.once('exit', code => { failure = new Error('本地服务已停止 / Local service stopped (' + code + '). ' + path.join(home, 'desktop.log')); if (!quitting && win && !win.isDestroyed()) { dialog.showErrorBox('Clootee', failure.message); app.quit(); } });
  const base = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (failure) throw failure;
    try { const response = await fetch(base + '/api/auth/status', { signal: AbortSignal.timeout(800) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('启动超时 / Startup timed out. ' + path.join(home, 'desktop.log'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== base) { event.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
  await win.loadURL(base);
}
app.on('window-all-closed', () => {
  if (installOnly && !installationComplete) { quitting = true; stopChild(); app.exit(1); }
  else app.quit();
});
app.on('before-quit', () => { quitting = true; stopChild(); });
