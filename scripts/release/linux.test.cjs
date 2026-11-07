'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const controller = path.join(root, 'scripts/linux/control.cjs');
async function port() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
function fixture(base) {
  const app = path.join(base, 'app');
  for (const dir of ['runtime/bin', 'scripts/linux', 'projects/claude_hub/backend/dist']) fs.mkdirSync(path.join(app, dir), { recursive: true });
  fs.symlinkSync(process.execPath, path.join(app, 'runtime/bin/node'));
  for (const name of ['control.cjs', 'supervisor.cjs', 'autostart.cjs']) fs.copyFileSync(path.join(root, 'scripts/linux', name), path.join(app, 'scripts/linux', name));
  fs.mkdirSync(path.join(app, 'projects/claude_hub/frontend'));
  fs.writeFileSync(path.join(app, 'projects/claude_hub/frontend/index.html'), 'workspace');
  fs.writeFileSync(path.join(app, 'version.json'), '{"version":"1.2.3"}');
  fs.writeFileSync(path.join(app, 'projects/claude_hub/backend/dist/index.js'), "require('http').createServer((q,s)=>{s.setHeader('content-type','application/json');s.end(JSON.stringify({success:true,data:{passwordEnabled:false}}));}).listen(Number(process.env.PORT),'127.0.0.1');");
  return app;
}
function cli(home, command, env = {}) { return execFileSync(process.execPath, [controller, command], { env: { ...process.env, CLOOTEE_HOME: home, ...env }, encoding: 'utf8', timeout: 45000 }); }
test('Linux manager starts, is idempotent, restarts, and stops only its own instance', { skip: process.platform !== 'linux' }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-lifecycle-'));
  try {
    const app = fixture(temp); fs.mkdirSync(path.join(temp, 'releases')); fs.renameSync(app, path.join(temp, 'releases/test')); fs.symlinkSync(path.join(temp, 'releases/test'), path.join(temp, 'current'));
    const env = { PORT: String(await port()) };
    assert.match(cli(temp, 'start', env), /started/);
    const first = JSON.parse(fs.readFileSync(path.join(temp, 'run/server.json'))).pid;
    assert.match(cli(temp, 'start', env), /running/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'run/server.json'))).pid, first);
    assert.match(cli(temp, 'status'), /running/);
    cli(temp, 'restart', env);
    assert.notEqual(JSON.parse(fs.readFileSync(path.join(temp, 'run/server.json'))).pid, first);
    cli(temp, 'stop');
    assert.throws(() => cli(temp, 'status'), e => e.status === 3);
    assert.match(cli(temp, 'version'), /1.2.3/);
    const other = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    await new Promise(r => other.once('spawn', r));
    try { fs.writeFileSync(path.join(temp, 'run/server.json'), JSON.stringify({pid:other.pid,start:'wrong',backend:path.join(temp,'releases/test/projects/claude_hub/backend')})); cli(temp, 'stop'); assert.doesNotThrow(() => process.kill(other.pid, 0)); } finally { other.kill(); }
    const occupied = net.createServer(); await new Promise(r => occupied.listen(Number(env.PORT), '127.0.0.1', r));
    try { assert.throws(() => cli(temp, 'start', env), /port|Port/); } finally { await new Promise(r => occupied.close(r)); }
  } finally { try { cli(temp, 'stop'); } catch {} fs.rmSync(temp, { recursive: true, force: true }); }
});
test('installer verifies SHA256, installs and upgrades with persistent data, refuses foreign launcher', { skip: process.platform !== 'linux' }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-installer-'));
  const home = path.join(temp, 'home');
  try {
    const app = fixture(temp); const archive = path.join(temp, 'bundle.tar.gz'); execFileSync('tar', ['-czf', archive, '-C', app, '.']);
    const tools = path.join(temp, 'tools'); fs.mkdirSync(tools);
    fs.writeFileSync(path.join(tools, 'curl'), '#!/usr/bin/env bash\ncp "$FIXTURE" "${@: -1}"\n', { mode: 0o755 });
    const sha = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    const installer = path.join(temp, 'install.sh');
    let script = fs.readFileSync(path.join(root, 'scripts/linux/install.sh'), 'utf8').replaceAll('@@VERSION@@','1.2.3').replaceAll('@@RELEASE@@','1.2.3-fixture').replaceAll('@@X64_URL@@','https://example.com/x64').replaceAll('@@ARM64_URL@@','https://example.com/arm64').replaceAll('@@X64_SHA@@',sha).replaceAll('@@ARM64_SHA@@',sha);
    fs.writeFileSync(installer,script);
    const env = {...process.env, PATH: tools + ':' + process.env.PATH, FIXTURE:archive, CLOOTEE_AUTOSTART:'0', CLOOTEE_HOME:home, CLOOTEE_BIN_DIR:path.join(temp,'bin'), PORT:String(await port())};
    const install = () => execFileSync('bash',[installer],{env,encoding:'utf8',timeout:45000});
    assert.match(install(),/Installed/);
    fs.writeFileSync(path.join(home,'data/keep'),'persistent');
    const old=fs.realpathSync(path.join(home,'current'));
    assert.match(install(),/Installed/);
    assert.notEqual(fs.realpathSync(path.join(home,'current')),old);
    assert.equal(fs.readFileSync(path.join(home,'data/keep'),'utf8'),'persistent');
    const before=fs.realpathSync(path.join(home,'current'));
    fs.writeFileSync(installer,script.replaceAll(sha,'0'.repeat(64)));
    assert.throws(install);
    assert.equal(fs.realpathSync(path.join(home,'current')),before);
    assert.match(cli(home,'status'),/running/);
    fs.writeFileSync(path.join(temp,'bin/clootee'),'foreign tool');
    fs.writeFileSync(installer,script);
    assert.throws(install,e => /overwrite/.test(e.stdout?.toString()));
  } finally { try { cli(home,'stop'); } catch {} fs.rmSync(temp,{recursive:true,force:true}); }
});
