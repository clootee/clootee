// Full Windows handoff on an isolated port and installation; never touches port 8970.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
if (process.platform !== 'win32') { process.stdout.write('SKIP: Windows restart integration\n'); process.exit(0); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee restart integration '));
const hub = path.join(root, 'projects/claude_hub');
const backend = path.join(hub, 'backend');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, message) {
  const end = Date.now() + 20000;
  do { const value = await check(); if (value) return value; await delay(100); } while (Date.now() < end);
  throw new Error(message);
}
function request(port, route, method = 'GET') {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, timeout: 1000 }, res => {
      let body = ''; res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => req.destroy()); req.end();
  });
}
let port, initial, currentPid;
(async () => {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  for (const dir of ['backend/scripts', 'backend/dist', 'data/logs', 'data/run']) fs.mkdirSync(path.join(hub, dir), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '../../../../scripts/restart-update.js'), path.join(root, 'scripts/restart-update.js'));
  fs.writeFileSync(path.join(hub, 'data/sentinel'), 'preserve user data');
  fs.writeFileSync(path.join(backend, 'scripts/setup.js'), `
const fs=require('fs');
if(fs.existsSync('fail-build'))process.exit(23);
const file='build-count';fs.writeFileSync(file,String(Number(fs.existsSync(file)?fs.readFileSync(file,'utf8'):0)+1));
`);
  fs.writeFileSync(path.join(backend, 'dist/index.js'), `
const http=require('http'),path=require('path');
const code=${JSON.stringify(path.resolve(__dirname, '../dist'))};
const {Paths}=require(path.join(code,'paths'));
Paths.PROJECT_ROOT=path.resolve(__dirname,'../..');Paths.LOGS_DIR=path.join(Paths.PROJECT_ROOT,'data/logs');
require(path.join(code,'config/LogConfig')).LogConfig.FILE_PATH=path.join(Paths.LOGS_DIR,'app.log');
const {UpdateChecker}=require(path.join(code,'logic_realize/UpdateChecker'));
UpdateChecker._pull=async()=>({ok:true,output:'fixture pull succeeded'});
http.createServer(async(req,res)=>{
try{
let data;
if(req.url==='/apply')data=await UpdateChecker.apply();
else if(req.url==='/status')data=UpdateChecker.status();
else data={instance:process.pid+':fixture'};
res.end(JSON.stringify({success:true,data}));
}catch(e){res.end(JSON.stringify({success:false,error:e.message}));}
}).listen(Number(process.env.PORT),'127.0.0.1');
`);
  const reserver = net.createServer();
  await new Promise(resolve => reserver.listen(0, '127.0.0.1', resolve));
  port = reserver.address().port;
  await new Promise(resolve => reserver.close(resolve));
  initial = spawn(process.execPath, [path.join(backend, 'dist/index.js')], {
    cwd: backend, windowsHide: true, stdio: 'ignore', env: { ...process.env, PORT: String(port) },
  });
  initial.on('error', error => { process.stderr.write(error.message); });
  let health = await until(async () => (await request(port, '/api/auth/status'))?.data, 'initial service did not start');
  currentPid = Number(health.instance.split(':')[0]);
  // An unusable output log must be detected BEFORE stopping the old service.
  const blockedLog = path.join(hub, 'data/run/update-service.log');
  fs.mkdirSync(blockedLog);
  assert.equal((await request(port, '/apply', 'POST')).success, true);
  await until(async () => (await request(port, '/status'))?.data?.error, 'log failure was not reported');
  assert.equal((await request(port, '/api/auth/status')).data.instance, health.instance);
  assert.equal((await request(port, '/status')).data.applying, false);
  fs.rmdirSync(blockedLog);
  process.stdout.write('PASS: inaccessible startup log preserves old service\n');
  for (let cycle = 1; cycle <= 2; cycle++) {
    const before = health.instance;
    assert.equal((await request(port, '/apply', 'POST')).success, true);
    health = await until(async () => {
      const value = (await request(port, '/api/auth/status'))?.data;
      return value && value.instance !== before ? value : null;
    }, 'new server did not become healthy');
    currentPid = Number(health.instance.split(':')[0]);
    await until(async () => fs.readFileSync(path.join(hub, 'data/logs/update-restart.log'), 'utf8').includes(`healthy server PID=${currentPid}`), 'supervisor did not confirm success');
    assert.equal(fs.readFileSync(path.join(hub, 'data/sentinel'), 'utf8'), 'preserve user data');
    process.stdout.write(`PASS: restart cycle ${cycle}, ${before} -> ${health.instance}\n`);
  }
  fs.writeFileSync(path.join(backend, 'fail-build'), '1');
  assert.equal((await request(port, '/apply', 'POST')).success, true);
  await until(async () => (await request(port, '/status'))?.data?.error, 'build failure was not reported');
  assert.equal((await request(port, '/api/auth/status')).data.instance, health.instance);
  assert.equal((await request(port, '/status')).data.applying, false);
  process.stdout.write('PASS: failed build preserves old service and releases update lock\n');
  fs.unlinkSync(path.join(backend, 'fail-build'));
  const before = health.instance;
  assert.equal((await request(port, '/apply', 'POST')).success, true);
  health = await until(async () => {
    const value = (await request(port, '/api/auth/status'))?.data;
    return value && value.instance !== before ? value : null;
  }, 'retry failed');
  currentPid = Number(health.instance.split(':')[0]);
  await until(async () => fs.readFileSync(path.join(hub, 'data/logs/update-restart.log'), 'utf8').includes(`healthy server PID=${currentPid}`), 'retry health not confirmed');
  process.stdout.write('PASS: retry after build failure restarts successfully\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.stderr.write(`Fixture retained: ${root}\n`); process.exitCode = 1; }).finally(async () => {
  const lastHealth = port && (await request(port, '/api/auth/status'))?.data;
  if (String(lastHealth?.instance || '').endsWith(':fixture')) currentPid = Number(lastHealth.instance.split(':')[0]);
  if (currentPid) { try { process.kill(currentPid); } catch { /* Test process already exited. */ } }
  if (initial && initial.exitCode === null) initial.kill();
  await delay(300);
  // Verify the recursive deletion target is the generated fixture beneath tmp.
  if (!process.exitCode && path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('clootee restart integration ')) fs.rmSync(root, { recursive: true, force: true });
});
