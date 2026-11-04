// Complete desktop releases are selected from the same manifest as the download page.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Readable, Transform } = require('node:stream');
const FEED = 'https://clootee.com/download/api/latest';
function urlAllowed(value, feed) {
  const u = new URL(value);
  if (u.protocol === 'https:' && !u.username && !u.password) return;
  // Native integration tests host complete release packages on a loopback feed.
  const f = new URL(feed);
  if (f.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(f.hostname) && u.origin === f.origin) return;
  throw new Error('Update URL must use HTTPS');
}
function validate(manifest, platform, feed = FEED) {
  if (!/^\d+\.\d+\.\d+$/.test(manifest?.version || '')) throw new Error('Invalid release version');
  const item = manifest.packages?.[platform === 'win32' ? 'windows' : 'mac'];
  if (!item || !/^[a-f0-9]{64}$/i.test(item.sha256) || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) throw new Error('Incomplete release package');
  urlAllowed(item.url, feed);
  return item;
}
function newer(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}
async function manifest(feed = FEED) {
  urlAllowed(feed, feed);
  const res = await fetch(feed + (feed.includes('?') ? '&' : '?') + 't=' + Date.now(), { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { 'Cache-Control': 'no-cache' } });
  if (!res.ok) throw new Error('Release manifest unavailable: ' + res.status);
  return res.json();
}
async function download(item, destination, progress, feed = FEED) {
  urlAllowed(item.url, feed);
  const partial = destination + '.partial';
  let bytes = 0, last = -1;
  const digest = createHash('sha256');
  try {
    const res = await fetch(item.url, { signal: AbortSignal.timeout(20 * 60 * 1000), redirect: 'error' });
    if (!res.ok || !res.body) throw new Error('Package download failed: ' + res.status);
    await pipeline(Readable.fromWeb(res.body), new Transform({ transform(chunk, _, done) {
      bytes += chunk.length;
      if (bytes > item.bytes) { done(new Error('Package size exceeds manifest')); return; }
      digest.update(chunk);
      const percent = Math.floor(bytes * 100 / item.bytes);
      if (percent >= last + 5) { last = percent; progress(`Downloading ${percent}%`); }
      done(null, chunk);
    } }), fs.createWriteStream(partial, { mode: 0o600 }));
    if (bytes !== item.bytes || digest.digest('hex') !== item.sha256.toLowerCase()) throw new Error('Package SHA256/size verification failed; installation cancelled');
    fs.renameSync(partial, destination);
  } finally { fs.rmSync(partial, { force: true }); }
}
function stageMac(file, executable, progress) {
  const target = path.resolve(executable, '../../..');
  if (!target.endsWith('.app')) throw new Error('Cannot locate installed macOS application');
  fs.accessSync(path.dirname(target), fs.constants.W_OK);
  const stage = target + '.clootee-update';
  if (fs.existsSync(target + '.clootee-previous')) throw new Error('Previous recovery application exists: ' + target + '.clootee-previous');
  const attached = execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-plist', file]);
  const mounted = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: attached, encoding: 'utf8' }));
  // Locate only the image we just attached; no other mounted app may be selected.
  const mount = mounted['system-entities']?.find(entry => entry['mount-point'])?.['mount-point'];
  if (!mount) throw new Error('Could not mount update disk image');
  try {
    progress('Preparing verified macOS application');
    fs.rmSync(stage, { recursive: true, force: true });
    execFileSync('ditto', [path.join(mount, 'Clootee.app'), stage]);
    if (!fs.existsSync(path.join(stage, 'Contents/MacOS/Clootee'))) throw new Error('Update application is incomplete');
    return { target, stage };
  } finally { execFileSync('hdiutil', ['detach', mount]); }
}
function bindUpdates(server, { app, home, node, port, stop, feed = FEED }) {
  let applying = false;
  server.on('message', async message => {
    if (message?.type !== 'desktop-update' || !['check', 'apply'].includes(message.action) || typeof message.id !== 'string') return;
    const reply = value => { if (server.connected) server.send({ type: 'desktop-update-result', id: message.id, ...value }); };
    const progress = line => reply({ line });
    try {
      const release = await manifest(feed);
      const item = validate(release, process.platform, feed);
      const current = app.getVersion();
      if (message.action === 'check') {
        reply({ result: { hasUpdate: newer(release.version, current), mandatory: false, commitDiffers: false,
          currentVersion: current, latestVersion: release.version, manifestOk: true, notes: '', releasedAt: release.publishedAt || '',
          current: { sha: '', short: '', date: '', message: 'Desktop ' + current },
          latest: { sha: release.sourceCommit || '', short: (release.sourceCommit || '').slice(0, 7), date: '', message: 'Desktop ' + release.version },
          branch: 'main', repoUrl: 'https://github.com/clootee/clootee', checkedAt: Date.now() } });
        return;
      }
      if (applying) { reply({ result: { ok: true, output: 'Desktop update already in progress' } }); return; }
      if (!newer(release.version, current)) { reply({ result: { ok: false, output: 'Already running the latest desktop release' } }); return; }
      applying = true;
      const dir = path.join(home, 'updates', release.version);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, process.platform === 'win32' ? 'update.exe' : 'update.dmg');
      await download(item, file, progress, feed);
      progress('Package verified; preparing restart');
      const mac = process.platform === 'darwin' ? stageMac(file, app.getPath('exe'), progress) : {};
      // Run outside app resources: the installer must be able to replace its Node runtime.
      const worker = path.join(dir, 'install-update.cjs');
      const workerNode = path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node');
      fs.copyFileSync(path.join(__dirname, 'install-update.cjs'), worker);
      fs.copyFileSync(node, workerNode); fs.chmodSync(workerNode, 0o700);
      const config = { pid: process.pid, port, version: release.version, file, sha256: item.sha256, bytes: item.bytes,
        exe: app.getPath('exe'), home, ...mac, args: ['--user-data-dir=' + home], platform: process.platform };
      const configFile = path.join(dir, 'install.json');
      fs.writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
      const log = fs.openSync(path.join(home, 'desktop-update.log'), 'a');
      const helper = spawn(workerNode, [worker, configFile], { cwd: dir, detached: true, windowsHide: true, stdio: ['ignore', log, log, 'ipc'] });
      fs.closeSync(log);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { helper.kill(); reject(new Error('Update helper did not become ready')); }, 15000);
        helper.once('error', error => { clearTimeout(timeout); reject(error); });
        helper.once('exit', code => { clearTimeout(timeout); reject(new Error('Update helper exited: ' + code)); });
        helper.once('message', msg => {
          clearTimeout(timeout);
          if (msg?.type !== 'ready') { reject(new Error('Invalid update helper handshake')); return; }
          resolve();
        });
      });
      reply({ result: { ok: true, output: 'Verified desktop update ready; restarting application' } });
      // The HTTP response must reach the renderer before stopping its backend.
      setTimeout(() => { helper.send({ type: 'install' }); helper.disconnect(); helper.unref(); stop(); app.quit(); }, 1000);
    } catch (error) { if (message.action === 'apply') applying = false; reply({ error: error.message }); }
  });
}
module.exports = { bindUpdates, download, validate, newer, manifest, stageMac };
