#!/usr/bin/env node
'use strict';
// Dedicated per-installation lifecycle; never touches system process managers.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const home = fs.realpathSync(process.env.CLOOTEE_HOME || path.resolve(__dirname, '../..'));
const state = path.join(home, 'run');
const record = path.join(state, 'server.json');
const lock = path.join(state, 'control.lock');
const log = path.join(home, 'logs', 'server.log');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function identity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').slice(1).join(') ').split(' ');
    if (stat[0] === 'Z') return null;
    return { start: stat[19], cwd: fs.readlinkSync(`/proc/${pid}/cwd`), args: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0') };
  } catch { return null; }
}
function read() { try { return JSON.parse(fs.readFileSync(record)); } catch { return null; } }
function owned(r) {
  if (!r || !Number.isSafeInteger(r.pid) || !(r.backend?.startsWith(home + '/releases/') || r.backend === path.join(home, 'projects/claude_hub/backend'))) return false;
  const id = identity(r.pid);
  return id && id.start === r.start && id.cwd === r.backend && [path.join(r.backend, 'dist/index.js'), path.resolve(r.backend, '../../../scripts/linux/supervisor.cjs')].includes(id.args[1]);
}
function health(port) {
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/api/auth/status', timeout: 1500 }, res => {
      let body = ''; res.on('data', c => { if (body.length < 16384) body += c; });
      res.on('end', () => { try { resolve(res.statusCode === 200 && JSON.parse(body).success === true); } catch { resolve(false); } });
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(false));
  });
}
async function free(port) {
  await new Promise((resolve, reject) => {
    const s = net.createServer(); s.once('error', () => reject(new Error(`端口 ${port} 已占用 / Port is in use; no other process was stopped.`)));
    s.listen(port, '127.0.0.1', () => s.close(resolve));
  });
}
async function stop() {
  const r = read();
  if (!owned(r)) { fs.rmSync(record, { force: true }); process.stdout.write('Clootee 已停止 / stopped\n'); return; }
  process.kill(r.pid, 'SIGTERM');
  for (let i = 0; i < 100 && owned(r); i++) await sleep(100);
  if (owned(r)) process.kill(r.pid, 'SIGKILL');
  for (let i = 0; i < 50 && owned(r); i++) await sleep(100);
  if (owned(r)) throw new Error(`停止失败 / Stop failed. Log: ${log}`);
  fs.rmSync(record, { force: true });
  fs.rmSync(path.join(state, 'server.pid'), { force: true });
  process.stdout.write('Clootee 已停止 / stopped\n');
}
async function start() {
  const previous = read();
  if (owned(previous)) { process.stdout.write(`Clootee 已运行 / running: http://127.0.0.1:${previous.port}\n${previous.backend}\n`); return; }
  const port = Number(process.env.PORT || 8970);
  if (!Number.isInteger(port) || port < 1 || port > 65533) throw new Error('Invalid PORT');
  await free(port);
  const managed = fs.existsSync(path.join(home, 'current/runtime/bin/node'));
  const backend = fs.realpathSync(path.join(home, managed ? 'current/projects/claude_hub/backend' : 'projects/claude_hub/backend'));
  fs.mkdirSync(path.dirname(log), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(log, 'a', 0o600);
  const runtime = managed ? path.join(home, 'current/runtime/bin/node') : process.execPath;
  const child = spawn(runtime, [path.resolve(backend, '../../../scripts/linux/supervisor.cjs'), '--backend', backend], {
    cwd: backend, detached: true, stdio: ['ignore', fd, fd],
    env: { ...process.env, PORT: String(port), PATH: path.dirname(runtime) + path.delimiter + process.env.PATH }
  });
  fs.closeSync(fd);
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
  const id = identity(child.pid);
  if (!id) throw new Error(`启动失败 / Start failed. Log: ${log}`);
  const r = { pid: child.pid, start: id.start, backend, port };
  fs.writeFileSync(record, JSON.stringify(r), { mode: 0o600 });
  fs.writeFileSync(path.join(state, 'server.pid'), String(child.pid), { mode: 0o600 });
  for (let i = 0; i < 60; i++) {
    if (!owned(r)) break;
    if (await health(port)) { process.stdout.write(`Clootee 已启动 / started: http://127.0.0.1:${port}\n${backend}\n日志 / Log: ${log}\n关闭终端后继续运行 / Continues running after closing this terminal.\n`); return; }
    await sleep(500);
  }
  await stop();
  throw new Error(`启动检查未通过 / Startup check failed. Log: ${log}`);
}
async function main() {
  const command = process.argv[2] || 'help';
  if (command === 'autostart') { process.stdout.write(require('./autostart.cjs').autostart(home, process.argv[3] || 'enable', Number(process.env.PORT || 8970)) + '\n'); return; }
  if (command === 'version' || command === '--version') { process.stdout.write(JSON.parse(fs.readFileSync(path.join(home, fs.existsSync(path.join(home, 'current')) ? 'current/version.json' : 'version.json'))).version + '\n'); return; }
  if (command === 'logs') { const p = spawn('tail', ['-n', '100', '-f', log], { stdio: 'inherit' }); p.on('error', e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; }); return; }
  if (command === 'status') { const r = read(); const running = owned(r); process.stdout.write(running ? `Clootee running · PID ${r.pid} · http://127.0.0.1:${r.port}\n${r.backend}\n` : 'Clootee stopped\n'); process.exitCode = running ? 0 : 3; return; }
  if (!['start', 'stop', 'restart'].includes(command)) { process.stdout.write('Usage: clootee {start|stop|restart|status|logs|version|autostart enable|autostart disable|autostart status}\n'); process.exitCode = command === 'help' ? 0 : 2; return; }
  fs.mkdirSync(state, { recursive: true, mode: 0o700 });
  try { fs.mkdirSync(lock); } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let holder; try { holder = JSON.parse(fs.readFileSync(path.join(lock, 'owner'))); } catch {}
    if (!holder || identity(holder.pid)?.start === holder.start) throw new Error('另一个启停命令正在执行 / Another lifecycle command is running.');
    fs.rmSync(lock, { recursive: true }); fs.mkdirSync(lock);
  }
  fs.writeFileSync(path.join(lock, 'owner'), JSON.stringify({ pid: process.pid, start: identity(process.pid).start }));
  try { if (command !== 'start') await stop(); if (command !== 'stop') await start(); }
  finally { fs.rmSync(lock, { recursive: true, force: true }); }
}
main().catch(e => { process.stderr.write(e.message + '\n'); process.exitCode = 1; });
