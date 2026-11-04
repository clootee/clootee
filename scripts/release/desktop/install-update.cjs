// Runs from writable user data after the desktop parent exits.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const http = require('node:http');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check, timeout, message) {
  const end = Date.now() + timeout;
  do { if (await check()) return; await delay(250); } while (Date.now() < end);
  throw new Error(message);
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } }
function status(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/auth/status', timeout: 1000 }, res => {
      let body = ''; res.on('data', b => { body += b; });
      res.on('end', () => { try { resolve(JSON.parse(body).data); } catch { resolve(null); } });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(null));
  });
}
async function verify(config) {
  if (fs.statSync(config.file).size !== config.bytes) throw new Error('Installer size changed');
  const hash = createHash('sha256');
  for await (const bytes of fs.createReadStream(config.file)) hash.update(bytes);
  if (hash.digest('hex') !== config.sha256.toLowerCase()) throw new Error('Installer checksum changed');
}
function launch(exe, args) {
  const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: true });
  return new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(child.pid); }); });
}
async function install(config) {
  await verify(config);
  await wait(() => !alive(config.pid), 60000, 'Desktop did not stop; installation cancelled');
  await wait(async () => !(await status(config.port)), 30000, 'Old backend did not stop; installation cancelled');
  if (config.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const child = spawn(config.file, ['/S', '--updated', '/D=' + path.dirname(config.exe)], { windowsHide: true, stdio: 'inherit', env: { ...process.env, CLOOTEE_UPDATE_PROFILE: config.home } });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Installer timed out')); }, 30 * 60 * 1000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Installer failed: ' + code)); });
    });
  } else if (config.platform === 'darwin') {
    const backup = config.target + '.clootee-previous';
    // Never discard a previous recovery copy before the new app has launched.
    if (fs.existsSync(backup)) throw new Error('Previous recovery application exists: ' + backup);
    fs.renameSync(config.target, backup);
    try { fs.renameSync(config.stage, config.target); }
    catch (error) { fs.renameSync(backup, config.target); throw error; }
  } else throw new Error('Unsupported desktop platform');
  const pid = await launch(config.exe, config.args);
  await wait(async () => (await status(config.port))?.version === config.version, 30 * 60 * 1000, 'Updated application did not become healthy; reopen Clootee and inspect desktop.log');
  if (config.platform === 'darwin') fs.rmSync(config.target + '.clootee-previous', { recursive: true, force: true });
  return pid;
}
async function main(configFile) {
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  const stateFile = path.join(config.home, 'desktop-update-state.json');
  const state = (phase, error, pid) => fs.writeFileSync(stateFile, JSON.stringify({ phase, version: config.version, pid, error: error || '', at: new Date().toISOString() }));
  try {
    await verify(config);
    if (!process.send) throw new Error('Desktop updater requires IPC approval');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Desktop update was not approved')), 20000);
      process.once('message', msg => { clearTimeout(timeout); msg?.type === 'install' ? resolve() : reject(new Error('Invalid install approval')); });
      process.send({ type: 'ready' });
    });
    state('installing');
    const pid = await install(config);
    state('complete', '', pid); console.log('DESKTOP UPDATE COMPLETE:', config.version);
  } catch (error) { state('failed', error.message); throw error; }
}
module.exports = { install, verify, wait, status, launch };
if (require.main === module) main(process.argv[2]).then(() => process.exit(0), error => { console.error(error); process.exit(1); });
