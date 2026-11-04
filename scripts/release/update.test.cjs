const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { validate, download, newer, bindUpdates } = require('./desktop/updater.cjs');
const { verify } = require('./desktop/install-update.cjs');
const { EventEmitter } = require('node:events');
const backend = path.resolve(__dirname, '../../projects/claude_hub/backend');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message, timeout = 20000) {
  const end = Date.now() + timeout;
  do { if (await check()) return; await sleep(100); } while (Date.now() < end);
  throw new Error(message);
}
async function fixture(t, body = Buffer.from('release-package')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-update-'));
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/feed')) res.end(JSON.stringify({ version: '3.1.31', packages: { windows: item, mac: item } }));
    else res.end(body);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const feed = 'http://127.0.0.1:' + server.address().port + '/feed';
  const item = { url: feed.replace('/feed', '/package'), bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, feed, item };
}
test('release selection rejects invalid metadata and unsafe URLs', () => {
  assert.equal(newer('3.1.31', '3.1.30'), true); assert.equal(newer('3.1.31', '3.1.31'), false);
  for (const release of [{}, { version: '../escape' }, { version: '3.1.31', packages: { windows: { sha256: '0'.repeat(64), bytes: 3, url: 'http://attacker.test/a.exe' } } }]) assert.throws(() => validate(release, 'win32'));
});
test('download and independent install verification reject corrupt or truncated packages before touching the app', async t => {
  const { dir, feed, item } = await fixture(t);
  const file = path.join(dir, 'update.exe');
  await download(item, file, () => {}, feed);
  await verify({ ...item, file });
  fs.appendFileSync(file, 'tamper'); await assert.rejects(verify({ ...item, file }), /size changed/);
  fs.rmSync(file);
  for (const invalid of [{ ...item, sha256: '0'.repeat(64) }, { ...item, bytes: item.bytes + 1 }, { ...item, bytes: item.bytes - 1 }]) {
    await assert.rejects(download(invalid, file, () => {}, feed));
    assert.equal(fs.existsSync(file), false); assert.equal(fs.existsSync(file + '.partial'), false);
  }
});
test('desktop checks the published package feed and does not consult GitHub source versions', async t => {
  const { dir, feed } = await fixture(t);
  const server = new EventEmitter(); server.connected = true;
  const replies = []; server.send = msg => replies.push(msg);
  bindUpdates(server, { app: { getVersion: () => '3.1.30' }, home: dir, feed });
  server.emit('message', { type: 'desktop-update', id: 'check-1', action: 'check' });
  await until(() => replies.length, 'No desktop check result');
  assert.equal(replies[0].result.currentVersion, '3.1.30'); assert.equal(replies[0].result.latestVersion, '3.1.31'); assert.equal(replies[0].result.hasUpdate, true);
});

for (const mode of ['git', 'zip', 'legacy-unix', 'pm2']) test((mode === 'zip' ? 'ZIP without .git' : mode === 'git' ? 'Git checkout' : mode === 'pm2' ? 'Existing process manager' : 'Old Unix restart') + ' upgrade: real pull, build, IPC handoff, health and reopen without PM2; failed build keeps old server', { timeout: 90000 }, async t => {
  const zip = mode === 'zip';
  const legacy = mode === 'legacy-unix' && process.platform !== 'win32';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee source update '));
  const origin = path.join(dir, 'origin'), root = path.join(dir, 'installed');
  fs.mkdirSync(origin); fs.mkdirSync(root);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  git(origin, 'init', '-b', 'main'); git(origin, 'config', 'user.email', 'test@example.invalid'); git(origin, 'config', 'user.name', 'Release test');
  const hub = path.join(origin, 'projects/claude_hub'), src = path.join(hub, 'backend');
  fs.mkdirSync(path.join(src, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(origin, 'scripts'));
  fs.copyFileSync(path.join(__dirname, '../restart-update.js'), path.join(origin, 'scripts/restart-update.js'));
  let fixtureCode = `const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
  const {Paths}=require(${JSON.stringify(path.join(backend, 'dist/paths'))});
  Paths.PROJECT_ROOT=path.resolve(__dirname,'../..'); Paths.LOGS_DIR=path.resolve(Paths.PROJECT_ROOT,'data/logs');
  const {UpdateChecker}=require(${JSON.stringify(path.join(backend, 'dist/logic_realize/UpdateChecker'))});
  const version=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'))).version;
  http.createServer(async(req,res)=>{res.setHeader('content-type','application/json');
    if(req.url.startsWith('/apply')){try{res.end(JSON.stringify(await UpdateChecker.apply(undefined,req.url.includes('force=1'))));}catch(e){res.end(JSON.stringify({error:e.message}));}}
    else if(req.url==='/status')res.end(JSON.stringify(UpdateChecker.status()));
    else res.end(JSON.stringify({data:{version,instance:process.pid+':fixture'}}));
  }).listen(Number(process.env.PORT),'127.0.0.1');`;
  fs.copyFileSync(path.join(__dirname,'../../projects/claude_hub/restart.sh'),path.join(hub,'restart.sh'));
  fs.copyFileSync(path.join(__dirname,'../node-env.sh'),path.join(origin,'scripts/node-env.sh'));
  if(legacy) fixtureCode = fixtureCode.replace('const version=JSON.parse', `UpdateChecker._triggerRestart=async(onFailure)=>{fs.mkdirSync(Paths.LOGS_DIR,{recursive:true});const log=fs.openSync(path.join(Paths.LOGS_DIR,'update-restart.log'),'a');const child=require('node:child_process').spawn('bash',[path.join(Paths.PROJECT_ROOT,'restart.sh')],{cwd:process.cwd(),detached:true,stdio:['ignore',log,log]});fs.closeSync(log);child.unref();child.on('exit',()=>onFailure('Restart failed'));}; const version=JSON.parse`);
  fs.writeFileSync(path.join(src, 'server.cjs'), fixtureCode);
  fs.writeFileSync(path.join(src, 'scripts/setup.js'), `const fs=require('node:fs'); if(fs.existsSync('build-fails'))process.exit(1); fs.mkdirSync('dist',{recursive:true}); fs.copyFileSync('server.cjs','dist/index.js');`);
  fs.writeFileSync(path.join(src, 'package.json'), '{"version":"3.1.30"}');
  git(origin, 'add', '.'); git(origin, 'commit', '-m', 'Old version');
  git(root, 'clone', origin, '.');
  if (zip) fs.rmSync(path.join(root,'.git'), {recursive:true,force:true});
  const gitConfig = path.join(dir, 'gitconfig');
  git(dir, 'config', '--file', gitConfig, 'url.' + origin.replace(/\\/g,'/') + '.insteadOf', 'https://github.com/clootee/clootee.git');
  const installed = path.join(root, 'projects/claude_hub/backend');
  const data = path.join(root, 'projects/claude_hub/data'); fs.mkdirSync(data);
  const saved = path.join(data, 'auth.json'); fs.writeFileSync(saved, '{"keep":"security-password"}');
  fs.writeFileSync(path.join(data, 'console.json'), '{"keep":"provider-session"}');
  fs.mkdirSync(path.join(root, 'user-project')); fs.writeFileSync(path.join(root, 'user-project/prompt.txt'), 'unchanged');
  execFileSync(process.execPath, ['scripts/setup.js'], { cwd: installed });
  const listener = http.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening'); const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const url = 'http://127.0.0.1:' + port;
  let old, replacementPid;
  const call = async route => (await fetch(url + route, { signal: AbortSignal.timeout(4000) })).json();
  const start = () => {
    const env = { ...process.env, PORT: String(port), GIT_CONFIG_GLOBAL: gitConfig }; delete env.pm_id; delete env.CLOOTEE_DESKTOP;
    if (mode === 'pm2') {
      env.pm_id = '0';
      const monitor = `const {spawn}=require('node:child_process');let stopping=false,child;function start(){child=spawn(process.execPath,['dist/index.js'],{cwd:process.cwd(),env:process.env,stdio:'ignore'});child.on('exit',()=>{if(stopping)process.exit(0);else start();});}process.on('SIGTERM',()=>{stopping=true;child.kill();});start();`;
      return spawn(process.execPath, ['-e', monitor], {cwd:installed,env,stdio:'ignore'});
    }
    const child = spawn(process.execPath, ['dist/index.js'], { cwd: installed, env, stdio: 'ignore' }); return child;
  };
  t.after(async () => {
    if (old?.exitCode === null) { old.kill(); await once(old, 'exit'); }
    if (replacementPid) { try { process.kill(replacementPid, 'SIGTERM'); } catch {} }
    await until(async () => { try { await call('/api/auth/status'); return false; } catch { return true; } }, 'Test server did not stop');
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  old = start();
  await until(async () => { try { return (await call('/api/auth/status')).data.version === '3.1.30'; } catch { return false; } }, 'Old server did not start');
  fs.writeFileSync(path.join(src, 'package.json'), '{"version":"3.1.31"}');
  git(origin, 'add', '.'); git(origin, 'commit', '-m', 'New version');
  let applied = await call('/apply');
  if(zip) { assert.equal(applied.requiresConfirmation,true); applied = await call('/apply?force=1'); }
  assert.equal(applied.ok, true);
  await until(async () => { try { const state = (await call('/api/auth/status')).data; if(state.version !== '3.1.31')return false; replacementPid = Number(state.instance.split(':')[0]); return true; } catch { return false; } }, 'Updated server did not become healthy');
  assert.notEqual(replacementPid, old.pid);
  if(mode !== 'pm2') await until(() => fs.existsSync(path.join(data,'run/hub.pid')), 'Supervisor did not finish writing startup record');
  assert.equal(fs.readFileSync(saved, 'utf8'), '{"keep":"security-password"}');
  assert.equal(fs.readFileSync(path.join(data,'console.json'), 'utf8'), '{"keep":"provider-session"}');
  assert.equal(fs.readFileSync(path.join(root,'user-project/prompt.txt'), 'utf8'), 'unchanged');
  await until(() => fs.readFileSync(path.join(data,'logs/update-restart.log'), 'utf8').includes('UPDATE COMPLETE'), 'Supervisor did not finish');
  if(mode === 'pm2') { replacementPid = null; return; }
  process.kill(replacementPid); replacementPid = null;
  await until(async () => { try { await call('/api/auth/status'); return false; } catch { return true; } }, 'Replacement did not stop');
  old = start();
  await until(async () => { try { return (await call('/api/auth/status')).data.version === '3.1.31'; } catch { return false; } }, 'Reopened app not on new version');
  fs.writeFileSync(path.join(src, 'package.json'), '{"version":"3.1.32"}'); fs.writeFileSync(path.join(src,'build-fails'),'yes');
  git(origin, 'add', '.'); git(origin, 'commit', '-m', 'Broken build');
  assert.equal((await call('/apply')).ok, true);
  await until(async () => !(await call('/status')).applying, 'Build failure not reported');
  assert.match((await call('/status')).error, /Restart failed/);
  assert.equal((await call('/api/auth/status')).data.version, '3.1.31');
  assert.equal(old.exitCode, null);
});
