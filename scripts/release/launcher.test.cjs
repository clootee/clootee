'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createSupervisor } = require('../linux/supervisor.cjs');
const { configuration } = require('../linux/autostart.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
test('Linux launcher survives worker death, serves offline UI and recovers without restarting healthy work', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-launcher-'));
  const backend = path.join(tmp, 'backend');
  for (const name of ['backend/dist', 'data', 'frontend']) fs.mkdirSync(path.join(tmp, name), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'frontend/index.html'), '<button>recover</button>');
  fs.writeFileSync(path.join(backend, 'dist/index.js'), `const http=require('node:http');http.createServer((q,s)=>{s.setHeader('Content-Type','application/json');s.end(JSON.stringify({success:true,data:{passwordEnabled:false},remote:q.headers['x-clootee-remote']}));}).listen(Number(process.env.PORT),'127.0.0.1');`);
  const launcher = createSupervisor({ backend, port: 0, retryDelay: 30000 });
  try {
    const address = await launcher.listen();
    const base = 'http://127.0.0.1:' + address.port;
    await launcher.start();
    const pid = launcher.worker.pid;
    const start = headers => fetch(base + '/api/launcher/start', { method: 'POST', headers: { Origin: base, ...headers } });
    assert.equal((await start()).status, 200);
    assert.equal(launcher.worker.pid, pid);
    assert.equal((await start({Origin:'https://attacker.test'})).status, 403);
    assert.equal((await start({'Sec-Fetch-Site':'cross-site'})).status, 403);
    assert.equal((await (await fetch(base + '/api/auth/status', { headers: {'x-clootee-remote':'1'} })).json()).remote, '1');
    launcher.worker.kill('SIGKILL'); await once(launcher.worker, 'exit');
    assert.match(await (await fetch(base)).text(), /recover/);
    assert.equal((await fetch(base + '/api/auth/status')).status, 503);
    fs.writeFileSync(path.join(tmp,'data/auth.json'), JSON.stringify({hash:'saved-token'}));
    assert.equal((await start()).status, 403);
    fs.writeFileSync(path.join(tmp,'data/auth.json'), '{broken');
    assert.equal((await start({'x-auth-token':'saved-token'})).status, 403);
    fs.writeFileSync(path.join(tmp,'data/auth.json'), JSON.stringify({hash:'saved-token'}));
    const results = await Promise.all([start({'x-auth-token':'saved-token'}),start({'x-auth-token':'saved-token'})]);
    assert.deepEqual(results.map(r=>r.status),[200,200]);
    assert.notEqual(launcher.worker.pid, pid);
    assert.equal(await launcher.healthy(), true);
    assert.equal((await fetch(base + '/api/launcher/start')).status, 405);
  } finally { await launcher.close(); fs.rmSync(tmp, {recursive:true,force:true}); }
});
test('crashed workers are automatically replaced', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-restart-'));
  fs.mkdirSync(path.join(tmp, 'backend/dist'), {recursive:true});
  fs.writeFileSync(path.join(tmp, 'backend/dist/index.js'), `require('http').createServer((q,s)=>s.end(JSON.stringify({success:true,data:{passwordEnabled:false}}))).listen(Number(process.env.PORT),'127.0.0.1')`);
  const launcher = createSupervisor({backend:path.join(tmp,'backend'),port:0,retryDelay:10});
  try {
    await launcher.listen(); await launcher.start(); const pid=launcher.worker.pid;
    launcher.worker.kill('SIGKILL'); await once(launcher.worker,'exit');
    for(let i=0;i<100 && (launcher.worker.pid===pid || !await launcher.healthy());i++) await pause(30);
    assert.notEqual(launcher.worker.pid,pid); assert.equal(await launcher.healthy(),true);
  } finally {await launcher.close();fs.rmSync(tmp,{recursive:true,force:true});}
});
test('systemd unit uses this installation, a tracked PID and no shared PM2 state', () => {
  const {name,unit}=configuration('/tmp/clootee space%test',8970);
  assert.match(name,/^clootee-[a-f0-9]{12}\.service$/);
  assert.match(unit,/Type=forking/);assert.match(unit,/Restart=on-failure/);
  assert.match(unit,/clootee space%%test/);assert.match(unit,/server.pid/);
  assert.doesNotMatch(unit,/pm2/);
});
const vm = require('node:vm');
const appSource = fs.readFileSync(path.join(__dirname, '../../projects/claude_hub/frontend/app.js'), 'utf8');
function uiFixture({healthy=false, denied=false, desktop=false}={}) {
  const elements = {accessErrorRetry:{},accessErrorNote:{},accessErrorTitle:{},accessErrorOverlay:{}};
  const calls=[];
  let running=healthy, resolveStart;
  const context = { AbortSignal, Promise, setTimeout, TOKEN:'saved', T:key=>key, $:id=>elements[id],
    window: desktop ? {clooteeDesktop:{recover:async()=>{calls.push('desktop');running=true;}}} : {},
    location:{hostname:'server.example',reload:()=>calls.push('reload')},
    refreshSecurityState:async()=>{if(!running)throw Error('offline');},
    fetch:async (url,options)=>{calls.push([url,options]);if(denied)return {ok:false,status:403};await new Promise(r=>{resolveStart=r;});running=true;return {ok:true};}
  };
  vm.runInNewContext(appSource.slice(appSource.indexOf('function showAccessError(message)'),appSource.indexOf('async function showLogin()')),context);
  return {context,calls,elements,finish:()=>resolveStart()};
}
test('reconnect checks a healthy service without restarting it',async()=>{
  const f=uiFixture({healthy:true});await f.context.recoverWorkspace();assert.deepEqual(f.calls,['reload']);
});
test('reconnect starts Linux once, shows progress, then reloads',async()=>{
  const f=uiFixture();const first=f.context.recoverWorkspace();await pause(0);
  assert.equal(f.elements.accessErrorRetry.disabled,true);await f.context.recoverWorkspace();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'/api/launcher/start');
  assert.equal(f.calls[0][1].headers['x-auth-token'],'saved');f.finish();await first;
  assert.equal(f.calls[1],'reload');assert.equal(f.elements.accessErrorRetry.disabled,false);
});
test('unauthorized remote recovery stays on the page with a useful error',async()=>{
  const f=uiFixture({denied:true});await f.context.recoverWorkspace();
  assert.equal(f.elements.accessErrorNote.textContent,'workspaceRecoveryDenied');assert.equal(f.calls.length,1);
});
test('desktop reconnect uses the isolated native bridge',async()=>{
  const f=uiFixture({desktop:true});await f.context.recoverWorkspace();assert.deepEqual(f.calls,['desktop','reload']);
});

test('LAN settings rebind the launcher without restarting its worker', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-lan-'));
  const backend = path.join(tmp, 'backend');
  fs.mkdirSync(path.join(backend, 'dist'), {recursive:true});
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(backend, 'dist/index.js'), `require('http').createServer((q,s)=>s.end(JSON.stringify({success:true,data:{passwordEnabled:false}}))).listen(Number(process.env.PORT),'127.0.0.1')`);
  const launcher = createSupervisor({backend,port:0});
  try {
    const address = await launcher.listen(); await launcher.start(); const pid = launcher.worker.pid;
    for (const enabled of [true, false]) {
      fs.writeFileSync(path.join(tmp, 'data/settings.json'), JSON.stringify({allowLan:enabled}));
      const expected = enabled ? '0.0.0.0' : '127.0.0.1';
      for (let i=0;i<100 && launcher.server.address()?.address !== expected;i++) await pause(20);
      assert.equal(launcher.server.address().address, expected);
      assert.equal(launcher.server.address().port, address.port);
      assert.equal(launcher.worker.pid, pid);
      assert.equal(await launcher.healthy(), true);
    }
  } finally { await launcher.close(); fs.rmSync(tmp,{recursive:true,force:true}); }
});
