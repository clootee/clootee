// Native CI: install a 3.1.30 baseline shell, update through the real backend API
// using the complete newly built EXE/DMG, then reopen and verify persisted data.
const { _electron } = require('./desktop/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { once } = require('node:events');
const { execFileSync, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { wait } = require('./desktop/install-update.cjs');
const desktopDir = path.join(__dirname, 'desktop');
const output = path.join(desktopDir, 'output');
const baseline = path.join(output, 'baseline');
const version = require('../../projects/claude_hub/backend/package.json').version;
const oldVersion = '3.1.30';
const windows = process.platform === 'win32';
const sourceExe = windows ? path.join(baseline, 'win-unpacked/Clootee.exe') : path.join(baseline, 'mac-universal/Clootee.app/Contents/MacOS/Clootee');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee update profile '));
const executable = windows ? sourceExe : path.join(baseline,'installed app/Clootee.app/Contents/MacOS/Clootee');
function buildBaseline() {
  const payloadPkg = path.join(desktopDir,'payload/projects/claude_hub/backend/package.json');
  const saved = fs.readFileSync(payloadPkg);
  const pkg = JSON.parse(saved); pkg.version = oldVersion;
  fs.writeFileSync(payloadPkg, JSON.stringify(pkg));
  try {
    const args = ['electron-builder', windows ? '--win' : '--mac', '--dir', '--publish', 'never', '--config.extraMetadata.version=' + oldVersion, '--config.directories.output=' + baseline];
    execFileSync(windows ? 'npx.cmd' : 'npx', args, { cwd: desktopDir, stdio:'inherit', shell: windows, env: {...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'} });
  } finally { fs.writeFileSync(payloadPkg, saved); }
  if (!windows) {
    fs.mkdirSync(path.dirname(path.resolve(executable,'../../..')), {recursive:true});
    execFileSync('ditto', [path.resolve(sourceExe,'../../..'),path.resolve(executable,'../../..')]);
  }
}
function kill(pid) {
  if (!pid) return;
  if (windows) { try { execFileSync('taskkill', ['/pid', String(pid), '/T', '/F']); } catch {} }
  else { try { process.kill(pid, 'SIGTERM'); } catch {} }
}
(async () => {
  let app, server, replacementPid;
  const stateFile = path.join(profile,'desktop-update-state.json');
  const status = () => fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : {};
  try {
    buildBaseline();
    const artifact = fs.readdirSync(output).find(name => name.endsWith(windows ? '.exe' : '.dmg'));
    assert.ok(artifact,'Complete release artifact must exist');
    const file = path.join(output,artifact);
    const hash = createHash('sha256'); for await (const data of fs.createReadStream(file)) hash.update(data);
    let item = {bytes:fs.statSync(file).size,sha256:hash.digest('hex')};
    server = http.createServer((req,res) => {
      if(req.url.startsWith('/latest')) res.end(JSON.stringify({version,packages:{windows:item,mac:item}}));
      else fs.createReadStream(file).pipe(res);
    });
    server.listen(0,'127.0.0.1'); await once(server,'listening');
    const feed = 'http://127.0.0.1:' + server.address().port + '/latest'; item.url = feed.replace('/latest','/package');
    app = await _electron.launch({executablePath:executable,args:['--user-data-dir='+profile],env:{...process.env,CLOOTEE_UPDATE_FEED:feed},timeout:1200000});
    let win = await app.firstWindow();
    await win.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\/$/,{timeout:1200000});
    const origin = new URL(win.url()).origin;
    assert.equal((await win.evaluate(async()=>(await fetch('/api/auth/status')).json())).data.version,oldVersion);
    const ports = fs.readFileSync(path.join(profile,'desktop-ports.json'),'utf8');
    const marker = 'update-preserves-drafts-and-preferences';
    await win.evaluate(marker=>localStorage.setItem('update-sentinel',marker),marker);
    fs.writeFileSync(path.join(profile,'data/upgrade-sentinel.json'),JSON.stringify({provider:'keep-provider-credentials',task:'keep-task-history'}));
    // Keep a real explicit workspace password throughout the update and reopen.
    const auth = await win.evaluate(async()=>(await fetch('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'upgrade-test-password'})})).json());
    assert.equal(auth.success,true); const token=auth.data.token;
    const authBefore=fs.readFileSync(path.join(profile,'data/auth.json'),'utf8');
    const call = async(route,body) => {
      const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{'x-auth-token':token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return response.json();
    };
    const check=await call('/api/update/check');assert.equal(check.success,true);assert.equal(check.data.hasUpdate,true);assert.equal(check.data.latestVersion,version);
    const applied=await call('/api/update/apply',{});assert.equal(applied.success,true);assert.equal(applied.data.ok,true);
    await wait(()=>{
      const state=status();if(state.phase==='failed')throw Error(state.error);return state.phase==='complete';
    },35*60*1000,'Packaged update did not finish');
    replacementPid=status().pid;app=null;
    const upgraded=await call('/api/auth/check');assert.equal(upgraded.success,true);assert.equal(upgraded.data.version,version);
    assert.equal(fs.readFileSync(path.join(profile,'desktop-ports.json'),'utf8'),ports);
    assert.equal(fs.readFileSync(path.join(profile,'data/auth.json'),'utf8'),authBefore);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'data/upgrade-sentinel.json'))).provider,'keep-provider-credentials');
    kill(replacementPid);replacementPid=null;
    await wait(async()=>{try{await fetch(origin+'/api/auth/status',{signal:AbortSignal.timeout(300)});return false;}catch{return true;}},20000,'Updated backend did not stop');
    app=await _electron.launch({executablePath:executable,args:['--user-data-dir='+profile],timeout:1200000});
    win=await app.firstWindow();await win.waitForURL(origin+'/',{timeout:1200000});
    assert.equal(await app.evaluate(({app})=>app.getVersion()),version);
    assert.equal(await win.evaluate(()=>localStorage.getItem('update-sentinel')),marker);
    assert.equal((await win.evaluate(async()=>(await fetch('/api/auth/status')).json())).data.passwordEnabled,true);
    assert.equal(fs.readFileSync(path.join(profile,'data/auth.json'),'utf8'),authBefore);
    console.log('NATIVE FULL PACKAGE UPGRADE PASSED:',process.platform,oldVersion,'->',version,'install, healthy restart, reopen, explicit password, provider data and browser state preserved');
  } catch(error) {
    for(const name of ['desktop-update.log','desktop.log']) {const file=path.join(profile,name);if(fs.existsSync(file))console.error(name,fs.readFileSync(file,'utf8').slice(-10000));}
    throw error;
  } finally {
    if(app)await app.close().catch(()=>{});kill(replacementPid||status().pid);
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    fs.rmSync(profile,{recursive:true,force:true,maxRetries:20,retryDelay:300});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
