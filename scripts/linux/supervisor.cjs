#!/usr/bin/env node
'use strict';
// Keep the public origin and recovery controls alive when the worker exits.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const alive = child => child && child.pid && child.exitCode === null && child.signalCode === null;
const local = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
function createSupervisor({ backend, node = process.execPath, port = 8970, host = '127.0.0.1', retryDelay = 2000, healthTimeout = 10000, recoveryTimeout = 60000, startupTimeout = 60000 }) {
  backend = fs.realpathSync(backend);
  const frontend = path.resolve(backend, '../frontend');
  const data = path.resolve(backend, '../data');
  let worker, workerPort, starting, stopping = false, retry, failures = 0;
  const sockets = new Set();
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  function allowed(req) {
    // Never accept cross-site recovery, even when a browser has a saved token.
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    try { if (!req.headers.origin || new URL(req.headers.origin).host !== req.headers.host) return false; } catch { return false; }
    try {
      const auth = JSON.parse(fs.readFileSync(path.join(data, 'auth.json'), 'utf8'));
      const token = req.headers['x-auth-token'];
      if (typeof auth.hash !== 'string' || !auth.hash || typeof token !== 'string') return false;
      const a = Buffer.from(auth.hash), b = Buffer.from(token);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (e) {
      if (e.code !== 'ENOENT') return false;
      const hostname = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
      return local(req.socket.remoteAddress) && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
    }
  }
  async function healthy(timeout = healthTimeout) {
    if (!alive(worker) || !workerPort) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${workerPort}/api/auth/status`, { signal: AbortSignal.timeout(Math.max(1, timeout)) });
      const value = await res.json();
      return res.ok && value.success === true && typeof value.data?.passwordEnabled === 'boolean';
    } catch { return false; }
  }
  async function start() {
    if (starting) return starting;
    starting = (async () => {
      // An alive worker may own tasks. Give slow requests time to finish,
      // and only spawn a replacement after confirming that worker exited.
      const deadline = Date.now() + recoveryTimeout;
      while (alive(worker) && !stopping) {
        if (await healthy(Math.min(healthTimeout, Math.max(1, deadline - Date.now())))) return;
        if (!alive(worker)) break;
        if (Date.now() >= deadline) {
          const error = Error('The workspace process is running but did not respond in time. Check the service log and retry.');
          error.code = 'WORKER_BUSY';
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(500, Math.max(1, deadline - Date.now()))));
      }
      if (stopping) throw Error('Launcher is stopping');
      clearTimeout(retry);
      const probe = net.createServer();
      await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
      workerPort = probe.address().port;
      await new Promise(resolve => probe.close(resolve));
      if (stopping) throw Error('Launcher is stopping');
      const child = spawn(node, [path.join(backend, 'dist/index.js')], {
        cwd: backend, stdio: ['ignore', 'inherit', 'inherit'],
        env: { ...process.env, PORT: String(workerPort), CLOOTEE_SUPERVISED: '1', CLOOTEE_PUBLIC_PORT: String(server.address().port) }
      });
      worker = child;
      child.once('exit', (code, signal) => {
        console.log(`[${new Date().toISOString()}] worker exited pid=${child.pid} code=${code} signal=${signal} stopping=${stopping}`);
        if (!stopping && ++failures <= 3) retry = setTimeout(() => start().catch(e => { if (!stopping) console.error(e.message); }), retryDelay * failures);
      });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      const startupDeadline = Date.now() + startupTimeout;
      while (Date.now() < startupDeadline && !stopping) {
        if (!alive(child)) throw Error('Worker exited before startup completed.');
        if (await healthy(Math.min(healthTimeout, Math.max(1, startupDeadline - Date.now())))) return;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      throw Error('Worker startup timed out; inspect the service log.');
    })().finally(() => { starting = null; });
    return starting;
  }
  function headers(req) {
    // This header can only restrict access; never promotes a remote peer to local.
    return { ...req.headers, 'x-clootee-remote': local(req.socket.remoteAddress) && req.headers['x-clootee-remote'] !== '1' ? '0' : '1' };
  }
  function offline(req, res) {
    // The cached page and a freshly opened page both retain a recovery button.
    if (req.method !== 'GET' || req.url.startsWith('/api/')) { json(res, 503, { success: false, error: 'Workspace unavailable' }); return; }
    const name = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
    let file;
    try { file = fs.realpathSync(path.join(frontend, decodeURIComponent(name))); } catch { json(res, 503, { success: false }); return; }
    if (!file.startsWith(frontend + path.sep) || !fs.statSync(file).isFile()) { json(res, 404, { success: false }); return; }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
    if (!mime[path.extname(file)]) { json(res, 404, { success: false }); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  }
  const server = http.createServer(async (req, res) => {
    if (req.url === '/api/launcher/start') {
      if (req.method !== 'POST') { json(res, 405, { success: false }); return; }
      if (!allowed(req)) { json(res, 403, { success: false, error: 'Recovery requires same-origin authorized access.' }); return; }
      const began = Date.now();
      try {
        failures = 0; await start();
        console.log(`[${new Date().toISOString()}] recovery ready pid=${worker?.pid} elapsedMs=${Date.now() - began}`);
        json(res, 200, { success: true });
      } catch (e) {
        console.error(`[${new Date().toISOString()}] recovery failed code=${e.code || 'START_FAILED'} pid=${worker?.pid} elapsedMs=${Date.now() - began}: ${e.message}`);
        json(res, 503, { success: false, code: e.code || 'START_FAILED', error: e.message });
      }
      return;
    }
    if (!workerPort || !alive(worker)) { offline(req, res); return; }
    const proxy = http.request({ hostname: '127.0.0.1', port: workerPort, method: req.method, path: req.url, headers: headers(req) }, upstream => {
      res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res);
    });
    proxy.on('error', () => { if (!res.headersSent) offline(req, res); else res.destroy(); });
    req.on('aborted', () => proxy.destroy()); req.pipe(proxy);
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => {
    if (!alive(worker) || !workerPort) { socket.destroy(); return; }
    const upstream = net.connect(workerPort, '127.0.0.1');
    upstream.once('connect', () => {
      upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` + Object.entries(headers(req)).map(([k,v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
    socket.on('close', () => upstream.destroy()); upstream.on('close', () => socket.destroy());
  });
  return {
    server, start, healthy,
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); start().catch(e => { if (!stopping) console.error(e.message); }); return server.address(); },
    async close() {
      stopping = true; clearTimeout(retry);
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
      if (alive(worker)) {
        const child = worker; child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
        await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timer);
      }
    },
    get worker() { return worker; }
  };
}
if (require.main === module) {
  const i = process.argv.indexOf('--backend');
  const backend = i >= 0 ? process.argv[i + 1] : path.resolve(__dirname, '../../projects/claude_hub/backend');
  let allowLan = false;
  try { allowLan = JSON.parse(fs.readFileSync(path.resolve(backend, '../data/settings.json'))).allowLan === true; } catch {}
  const launcher = createSupervisor({ backend, port: Number(process.env.PORT || 8970), host: allowLan ? '0.0.0.0' : '127.0.0.1' });
  launcher.listen().then(address => console.log(`Clootee launcher listening on ${address.address}:${address.port}`)).catch(e => { console.error(e); process.exit(1); });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => launcher.close().then(() => process.exit(0)));
}
module.exports = { createSupervisor };
