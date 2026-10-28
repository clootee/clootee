// Real HTTP contract tests with isolated data/config; never touch a user's keys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-email-test-'));
process.env.HOME = tmp;
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'claude');
process.env.CODEX_HOME = path.join(tmp, 'codex');
let starts = 0, polls = 0, anonymous = 0, approved = false, revoked = false, email = 'test@example.com';
const fake = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const send = (status, value) => { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(value)); };
  if (req.url === '/api/v1/devices') { anonymous++; return send(404, {}); }
  if (req.url === '/api/device/start') {
    assert.equal(req.headers['x-console-request'], '1');
    starts++;
    return send(200, {device_code:'private-device-secret',user_code:'12345678',verification_uri:'/connect',expires_in:600,interval:5});
  }
  if (req.url === '/api/device/token') {
    assert.equal(JSON.parse(body).device_code, 'private-device-secret'); polls++;
    return send(200, approved ? {token:'ck-email-authorized'} : {pending:true});
  }
  if (revoked || req.headers.authorization !== 'Bearer ck-email-authorized') return send(401, {error:{message:'Sign in again'}});
  if (req.url === '/api/v1/me') return send(200, {email,balanceMicro:700000});
  if (req.url.startsWith('/api/v1/me/usage')) return send(200, {balanceMicro:699000,items:[],tagged:{calls:1,costMicro:1000}});
  send(404, {});
});
(async () => {
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  process.env.CLOOTEE_CONSOLE_BASE = `http://127.0.0.1:${fake.address().port}`;
  const {Paths} = require('../dist/paths');
  const originalRoot = Paths.DATA_ROOT;
  for (const key of Object.keys(Paths)) if (typeof Paths[key] === 'string' && Paths[key].startsWith(originalRoot)) Paths[key] = Paths[key].replace(originalRoot,path.join(tmp,'data'));
  const {ConsoleAccount:C} = require('../dist/logic_realize/ConsoleAccount');
  const {EngineConfig:E} = require('../dist/logic_realize/EngineConfig');
  const {ErrorHandler} = require('../dist/helper/ErrorHandler');
  ErrorHandler.handle = e => e.message;
  assert.equal((await C.status()).registered,false);
  await assert.rejects(C.ensureToken(), /Sign in with your email/);
  await assert.rejects(C.activate(), /Sign in with your email/);
  const login = await Promise.all([C.startLogin(), C.startLogin()]);
  assert.equal(starts,1);
  assert.equal(login[0].userCode,'12345678');
  assert.equal(login[0].url, process.env.CLOOTEE_CONSOLE_BASE+'/connect?user_code=12345678');
  assert.ok(!JSON.stringify(login).includes('private-device-secret'));
  assert.deepEqual(await C.activate(),{pending:true});
  assert.equal((await C.status()).registered,false);
  approved=true;
  const before=polls;
  const result=await Promise.all([C.activate(),C.activate()]);
  assert.equal(polls,before+1);
  assert.equal(result[0].email,email);
  assert.equal(result[0].balanceMicro,700000);
  assert.equal(E.get().claude.apiKey,'ck-email-authorized');
  assert.equal(E.get().codex.provider,'clootee');
  assert.equal(fs.statSync(Paths.CONSOLE_FILE).mode & 0o077,0);
  await C.activate();
  assert.equal(starts,1);
  assert.equal(await C.linkUrl(), process.env.CLOOTEE_CONSOLE_BASE+'/billing');
  assert.equal((await C.turnCost('task-1')).costMicro,1000);
  email=null;
  await assert.rejects(C.activate(), /sign in with your email first/);
  revoked=true;
  assert.match((await C.status()).error,/Sign in again/);
  assert.equal(starts,1); assert.equal(anonymous,0);
  await assert.rejects(C.activate(),/Sign in again/);
  revoked=false;email='test@example.com';
  await C.startLogin();
  C._pending.expiresAt=Date.now()-1;
  await assert.rejects(C.activate(),/Authorization expired/);
  assert.equal(anonymous,0);
  console.log('PASS: email required, secret stays on server, pending does not activate, start/exchange deduplicated, engine configuration, private storage, repeat login, revoked/anonymous rejection, expiry, usage and billing.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{fake.close();fs.rmSync(tmp,{recursive:true,force:true});});
