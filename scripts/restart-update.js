// Windows update supervisor. Uses the same Node runtime as the server, no shell/WMI.
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function note(message) { process.stdout.write(`[${new Date().toISOString()}] ${message}\n`); }
function status(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/auth/status', timeout: 1000 }, res => {
      let body = '';
      res.on('data', data => { body += data; });
      res.on('end', () => {
        try { resolve(JSON.parse(body).data); } catch { resolve(null); }
      });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}
function portOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(true));
  });
}
async function waitUntil(check, timeout, message) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await delay(200);
  } while (Date.now() < deadline);
  throw new Error(message);
}
function build(backend, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/setup.js', '--no-tools', '--no-git'], {
      cwd: backend, env, windowsHide: true, stdio: ['ignore', 1, 2],
    });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Update build timed out; old server remains running.')); }, 480000);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Update build failed (${code}); old server remains running.`));
    });
  });
}
function approveStop() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not approve restart')), 15000);
    process.once('message', message => {
      clearTimeout(timer);
      if (message?.type !== 'stop-approved') { reject(new Error('Invalid restart approval')); return; }
      if (process.connected) process.disconnect();
      resolve();
    });
    process.send({ type: 'ready-to-stop' }, error => {
      if (error) { clearTimeout(timer); reject(error); }
    });
  });
}
async function startServer(backend, runDir, port, env, log) {
  const child = spawn(process.execPath, [path.join(backend, 'dist/index.js')], {
    cwd: backend, env, detached: true, windowsHide: true, stdio: ['ignore', log, log],
  });
  let failure = '';
  child.once('error', error => { failure = error.message; });
  child.once('exit', code => { failure = `Updated server exited (${code})`; });
  child.unref();
  await waitUntil(async () => {
    if (failure) throw new Error(failure);
    const result = await status(port);
    return String(result?.instance || '').startsWith(`${child.pid}:`);
  }, 60000, 'Updated server did not become healthy within 60 seconds');
  fs.writeFileSync(path.join(runDir, 'hub.pid'),
    `pid=${child.pid}\nport=${port}\nnode=${process.execPath}\nentry=${path.join(backend, 'dist/index.js')}\nstarted=${new Date().toISOString()}\n`);
  note(`UPDATE COMPLETE: healthy server PID=${child.pid}, port=${port}`);
}
async function main() {
  if (!process.send) throw new Error('Updater requires its server IPC channel');
  const root = path.resolve(__dirname, '..');
  const backend = path.join(root, 'projects/claude_hub/backend');
  const runDir = path.join(root, 'projects/claude_hub/data/run');
  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid server port');
  const env = { ...process.env, PORT: String(port), CLOOTEE_LOG_CONSOLE: '0' };
  fs.mkdirSync(runDir, { recursive: true });
  note(`Updater running with Node ${process.version}; building before stopping server`);
  await build(backend, env);
  if (!fs.existsSync(path.join(backend, 'dist/index.js'))) throw new Error('Built server entry is missing');
  // cmd.exe can lock service.log. Open an independent output file BEFORE the
  // handoff, so a permissions/locking error cannot stop the working service.
  const log = fs.openSync(path.join(runDir, 'update-service.log'), 'a');
  try {
    if (!fs.fstatSync(log).isFile()) throw new Error('Startup log path is not a regular file');
    fs.writeSync(log, `\n[${new Date().toISOString()}] Preparing updated server output\n`);
    note('Build complete; asking original server to exit');
    await approveStop();
    await waitUntil(async () => !(await portOpen(port)), 20000, 'Original server did not release its port');
    note('Original server stopped; starting updated server');
    await startServer(backend, runDir, port, env, log);
  } finally { fs.closeSync(log); }
}
if (require.main === module) {
  main().then(() => process.exit(0), error => {
    note(`UPDATE FAILED: ${error.stack || error}`);
    process.exit(1);
  });
}
