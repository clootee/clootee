const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const backend = path.resolve(__dirname, '../../projects/claude_hub/backend');
const { LocalAccess } = require(path.join(backend, 'dist/helper/LocalAccess'));
const { AuthManagerStruct } = require(path.join(backend, 'dist/logic_struct/AuthManagerStruct'));
const { Hash } = require(path.join(backend, 'dist/helper/Hash'));
function authFixture() {
  let record = null;
  class Auth extends AuthManagerStruct {
    static _read() { return record; }
    static _write(value) { record = value; }
    static _delete() { record = null; }
    static _genSalt() { return require('node:crypto').randomBytes(16).toString('hex'); }
  }
  return { Auth, record: () => record };
}
test('quick start never creates a password, even when repeated', () => {
  const f = authFixture();
  for (let i = 0; i < 3; i++) assert.equal(f.Auth.quickstart(), '');
  assert.equal(f.record(), null); assert.equal(f.Auth.passwordEnabled(), false);
});
test('explicit passwords stay protected and cannot be cleared as legacy data', () => {
  const { Auth } = authFixture();
  const token = Auth.setup('my-password');
  assert.equal(Auth.passwordEnabled(), true); assert.equal(Auth.legacyCredentials(), false);
  assert.throws(() => Auth.clearLegacy()); assert.throws(() => Auth.quickstart());
  assert.throws(() => Auth.disable('wrong')); assert.equal(Auth.verify(token), true);
  Auth.disable('my-password'); assert.equal(Auth.passwordEnabled(), false);
});
test('password-free access checks peer, Host and Origin for both HTTP and WebSocket', () => {
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:8970', origin: 'http://localhost:8970' } };
  assert.equal(LocalAccess.isLocal(req), true);
  for (const bad of [
    { ...req, socket: { remoteAddress: '192.168.1.20' } },
    { ...req, headers: { ...req.headers, 'x-clootee-remote': '1' } },
    { ...req, headers: { host: 'attacker.test' } },
    { ...req, headers: { ...req.headers, origin: 'http://attacker.test' } },
    { ...req, headers: { ...req.headers, 'sec-fetch-site': 'cross-site' } },
  ]) assert.equal(LocalAccess.isLocal(bad), false);
});
const appSource = fs.readFileSync(path.join(backend, '../frontend/app.js'), 'utf8');
test('startup asks for unlocking only when the user has enabled a password', async () => {
  for (const enabled of [false, true]) {
    const calls = [];
    const context = { SecurityState: {}, TOKEN: '', applyTheme() {}, applyText() {}, bind() {},
      refreshSecurityState: async () => ({ passwordEnabled: enabled, localAccess: true }),
      showLogin: async () => calls.push('unlock'), showAccessError: () => calls.push('error'),
      api: async () => ({ setupDone: true }), startApp: async () => calls.push('start'), showOnboard: async () => calls.push('onboard') };
    vm.runInNewContext(appSource.slice(appSource.indexOf('async function main() {')).replace(/(?:window\.ClooteeBootReady\s*=\s*)?main\(\);\s*$/, '') + '\nglobalThis.run = main;', context);
    await context.run();
    assert.deepEqual(calls, enabled ? ['unlock'] : ['start']);
  }
});
test('a failed status check shows a connection error instead of inventing a login', async () => {
  const calls = [];
  const context = { securityKnown: false, applyTheme() {}, applyText() {}, bind() {}, refreshSecurityState: async () => { throw Error('offline'); },
    showAccessError: () => calls.push('connection'), showLogin: () => calls.push('unlock') };
  vm.runInNewContext(appSource.slice(appSource.indexOf('async function main() {')).replace(/(?:window\.ClooteeBootReady\s*=\s*)?main\(\);\s*$/, '') + '\nglobalThis.run = main;', context);
  await context.run(); assert.deepEqual(calls, ['connection']);
});
test('password-free state hides workspace lock and clears only workspace credentials', async () => {
  const storage = new Map([['token', 'old-workspace-token'], ['provider-account', 'provider-session']]);
  const elements = { logoutBtn: { parentElement: {} }, loginOverlay: { hidden: false } };
  const context = { AbortSignal, TOKEN: 'old-workspace-token', SecurityState: {}, securityKnown: false,
    $: id => elements[id], T: key => key, localStorage: { removeItem: key => storage.delete(key) },
    fetch: async () => ({ ok: true, json: async () => ({ success: true, data: { passwordEnabled: false, localAccess: true } }) }),
    hideLogin: () => { elements.loginOverlay.hidden = true; } };
  const start = appSource.indexOf('async function refreshSecurityState(');
  const end = appSource.indexOf('function showAccessError', start);
  vm.runInNewContext(appSource.slice(start, end), context);
  await context.refreshSecurityState();
  assert.equal(context.TOKEN, ''); assert.equal(elements.logoutBtn.parentElement.hidden, true);
  assert.equal(elements.loginOverlay.hidden, true); assert.equal(storage.get('provider-account'), 'provider-session');
});

test('real HTTP and WebSocket lifecycle: no password, enable, change, disable, legacy recovery and restart', { timeout: 30000 }, async t => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-security-'));
  const providerFile = path.join(data, 'console.json');
  fs.writeFileSync(providerFile, '{"sentinel":"provider-account-unchanged"}');
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  let child, output = '';
  const code = `const path=require('node:path'); const {Paths}=require(${JSON.stringify(path.join(backend,'dist/paths'))}); const old=Paths.DATA_ROOT; for(const [k,v] of Object.entries(Paths))if(typeof v==='string'&&(v===old||v.startsWith(old+path.sep)))Paths[k]=path.join(process.env.TEST_DATA,path.relative(old,v)); require(${JSON.stringify(path.join(backend,'dist/logic_realize/LifeGuard'))}).LifeGuard.install=()=>{}; require(${JSON.stringify(path.join(backend,'dist/server/Server'))}).Server.start();`;
  const call = (url, body, token, extra = {}) => new Promise((resolve, reject) => {
    const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port, path: url, method: bytes ? 'POST' : 'GET',
      headers: { ...(bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {}), ...(token ? { 'x-auth-token': token } : {}), ...extra } }, res => {
      let text = ''; res.on('data', part => { text += part; }); res.on('end', () => resolve({ status: res.statusCode, ...JSON.parse(text) }));
    }); req.on('error', reject); if (bytes) req.write(bytes); req.end();
  });
  const start = async () => {
    child = spawn(process.execPath, ['-e', code], { env: { ...process.env, PORT: String(port), TEST_DATA: data, CLOOTEE_LOG_CONSOLE: '0' }, stdio: ['ignore','pipe','pipe'] });
    child.stdout.on('data', b => { output = (output + b).slice(-3000); }); child.stderr.on('data', b => { output = (output + b).slice(-3000); });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw Error('isolated server stopped: ' + output);
      try { if ((await call('/api/auth/status')).success) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('isolated server did not start: ' + output);
  };
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } };
  t.after(async () => { await stop(); fs.rmSync(data, { recursive: true, force: true }); });
  await start();
  const WebSocket = require(path.join(backend, 'node_modules/ws'));
  const connect = async token => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token || ''}`, { origin: `http://127.0.0.1:${port}` });
    await once(ws, 'open'); await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(ws.readyState, WebSocket.OPEN); return ws;
  };
  let status = await call('/api/auth/status');
  assert.equal(status.data.passwordEnabled, false); assert.equal(status.data.needsSetup, false);
  assert.equal((await call('/api/auth/check')).status, 200);
  assert.equal((await call('/api/settings')).status, 200);
  assert.equal((await call('/api/auth/quickstart', {})).data.token, '');
  assert.equal(fs.existsSync(path.join(data, 'auth.json')), false);
  const foreignWs = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'http://attacker.test' });
  assert.equal((await once(foreignWs, 'close'))[0], 4001);
  const freeWs = await connect();
  assert.equal((await call('/api/auth/check', undefined, undefined, { host: 'attacker.test' })).status, 403);
  assert.equal((await call('/api/auth/check', undefined, undefined, { origin: 'http://attacker.test' })).status, 403);
  const closedFree = once(freeWs, 'close');
  const first = await call('/api/auth/setup', { password: 'my-security-password' });
  assert.equal(first.success, true); const token = first.data.token;
  assert.equal((await closedFree)[0], 4001);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data,'auth.json'))).kind, 'user');
  assert.equal((await call('/api/auth/check')).status, 401);
  assert.equal((await call('/api/auth/check', undefined, token)).status, 200);
  assert.equal((await call('/api/auth/legacy/disable', { confirm: true })).success, false);
  const protectedWs = await connect(token); const closedProtected = once(protectedWs,'close');
  const changed = await call('/api/auth/change', { oldPassword: 'my-security-password', newPassword: 'updated-password' }, token);
  assert.equal(changed.success, true); const newToken = changed.data.token;
  assert.equal((await closedProtected)[0], 4001);
  assert.equal((await call('/api/auth/check', undefined, token)).status, 401);
  assert.equal((await call('/api/auth/disable', { password: 'wrong' }, newToken)).success, false);
  assert.equal((await call('/api/auth/disable', { password: 'updated-password' }, newToken)).success, true);
  assert.equal((await call('/api/auth/check')).status, 200);
  assert.equal(fs.existsSync(path.join(data,'auth.json')), false);
  fs.writeFileSync(path.join(data,'auth.json'), JSON.stringify({ salt: 'legacy', hash: Hash.sha256('unknown-random-password::legacy') }));
  status = await call('/api/auth/status'); assert.equal(status.data.legacyCredentials, true);
  assert.match(status.data.recoveryCommand, /passwd\.(sh|bat)/);
  assert.equal((await call('/api/auth/legacy/disable', {})).success, false);
  assert.equal((await call('/api/auth/legacy/disable', { confirm: true }, undefined, { origin: 'http://attacker.test' })).success, false);
  assert.equal((await call('/api/auth/legacy/disable', { confirm: true })).success, true);
  assert.equal((await call('/api/auth/check')).status, 200);
  await stop(); await start();
  assert.equal((await call('/api/auth/status')).data.passwordEnabled, false);
  assert.equal((await call('/api/auth/check')).status, 200);
  const enabled = await call('/api/auth/setup', { password: 'persisted-password' }); assert.equal(enabled.success,true);
  await stop(); await start();
  assert.equal((await call('/api/auth/status')).data.passwordEnabled,true);
  assert.equal((await call('/api/auth/check')).status,401);
  assert.equal((await call('/api/auth/login', { password: 'persisted-password' })).data.token,enabled.data.token);
  assert.equal(fs.readFileSync(providerFile,'utf8'), '{"sentinel":"provider-account-unchanged"}');
});

function securityPaneFixture(enabled = true, failVerification = false) {
  const f = authFixture();
  if (enabled) f.Auth.setup('old-password');
  const fields = {};
  const element = id => fields[id] || (fields[id] = { value: '', textContent: '', hidden: true, disabled: false });
  element('allowLanChk').checked = false;
  const notices = [], calls = [];
  const context = {
    $: element, SecurityState: { passwordEnabled: enabled }, TOKEN: f.Auth.token(), hubWs: null,
    State: { settings: { allowLan: false } }, T: key => key,
    localStorage: { setItem() {} }, hideLogin() {}, connectWs() {}, alert() {},
    refreshSecurityState: async () => {},
    setPaneNotice: (...args) => notices.push(args),
    patchSettings: async patch => { calls.push('settings'); context.State.settings.allowLan = patch.allowLan; return patch; },
    api: async (url, body) => {
      calls.push(url);
      if (url === '/api/auth/change') return { token: f.Auth.changePassword(body.oldPassword, body.newPassword) };
      if (url === '/api/auth/setup') return { token: f.Auth.setup(body.password) };
      if (url === '/api/auth/reset') return { token: f.Auth.resetPassword(body.oldPassword, body.newPassword) };
      if (url === '/api/auth/login') {
        if (failVerification) throw Error('verification failed');
        return { token: f.Auth.login(body.password) };
      }
      throw Error('Unexpected endpoint');
    },
  };
  const between = (start, end) => appSource.slice(appSource.indexOf(start), appSource.indexOf(end, appSource.indexOf(start)));
  vm.runInNewContext(between('function hasSecurityPasswordDraft()', 'function fillPromptPane()')
    + between('let SecuritySavePending =', 'async function disableSecurityPassword()')
    + between('function resetLanPassword()', '// ── Codex 档位')
    + '\nglobalThis.save = saveNetworkPane; globalThis.change = changePassword;', context);
  return { ...f, fields, element, notices, calls, context, draft(old = 'old-password', next = 'saved-password') {
    element('pwOld').value = old; element('pwNew').value = next; element('pwConfirm').value = next;
  } };
}

test('network section Save persists and verifies a password before leaving, including first setup', async () => {
  for (const enabled of [false, true]) {
    const f = securityPaneFixture(enabled); f.draft(enabled ? 'old-password' : '');
    assert.equal(await f.context.save(), true);
    assert.equal(f.Auth.login('saved-password'), f.context.TOKEN);
    assert.deepEqual(f.calls, [enabled ? '/api/auth/change' : '/api/auth/setup', '/api/auth/login', 'settings']);
    assert.equal(f.element('pwNew').value, '');
  }
});

test('network section Save includes the expanded reset-password form', async () => {
  const f = securityPaneFixture(); f.element('lanPwReset').hidden = false;
  f.element('lanPwOld').value = 'old-password';
  f.element('lanPwNew').value = 'reset-password'; f.element('lanPwNew2').value = 'reset-password';
  assert.equal(await f.context.save(), true);
  assert.equal(f.Auth.login('reset-password'), f.context.TOKEN);
  assert.deepEqual(f.calls, ['/api/auth/reset', '/api/auth/login', 'settings']);
});

test('reset-password form refuses to save without the current password', async () => {
  const f = securityPaneFixture(); f.element('lanPwReset').hidden = false;
  f.element('lanPwNew').value = 'reset-password'; f.element('lanPwNew2').value = 'reset-password';
  assert.equal(await f.context.save(), false);
  assert.deepEqual(f.calls, []);
  assert.ok(f.Auth.login('old-password'));
});

test('wrong old password or mismatched confirmation blocks Save and retains the draft', async () => {
  for (const badOld of [false, true]) {
    const f = securityPaneFixture(); f.draft(badOld ? 'wrong-password' : 'old-password');
    if (!badOld) f.element('pwConfirm').value = 'different-password';
    assert.equal(await f.context.save(), false);
    assert.ok(f.Auth.login('old-password'));
    assert.equal(f.element('pwNew').value, 'saved-password');
    assert.ok(!f.calls.includes('settings'));
    assert.equal(f.notices.at(-1)[2], 'err');
  }
});

test('password verification failure cannot report success or discard password inputs', async () => {
  const f = securityPaneFixture(true, true); f.draft();
  assert.equal(await f.context.save(), false);
  assert.equal(f.element('pwNew').value, 'saved-password');
  assert.ok(!f.calls.includes('settings'));
  assert.equal(f.notices.at(-1)[2], 'err');
});

test('duplicate saves share one password change and empty security fields preserve credentials', async () => {
  const f = securityPaneFixture(); f.draft();
  const first = f.context.change(), second = f.context.change();
  assert.equal(first, second);
  assert.equal(await first, true);
  assert.equal(f.calls.filter(x => x === '/api/auth/change').length, 1);
  assert.equal(f.element('pwChangeBtn').disabled, false);
  f.calls.length = 0;
  assert.equal(await f.context.save(), true);
  assert.deepEqual(f.calls, ['settings']);
  assert.ok(f.Auth.login('saved-password'));
});

test('two simultaneously filled password forms must be resolved before Save', async () => {
  const f = securityPaneFixture(); f.draft(); f.element('lanPwReset').hidden = false;
  f.element('lanPwNew').value = 'another-password';
  assert.equal(await f.context.save(), false);
  assert.deepEqual(f.calls, []);
  assert.ok(f.Auth.login('old-password'));
});
