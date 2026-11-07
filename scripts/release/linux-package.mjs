import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { check, checkHistory, checkPayload, stripDependencyNotes } from './public-snapshot.mjs';
const checkFiles = new Set(check()); checkHistory('HEAD');
const arch = process.arch;
if (process.platform !== 'linux' || !['x64', 'arm64'].includes(arch)) throw Error('Build natively on Linux x64 or ARM64');
const root = process.cwd();
const version = JSON.parse(fs.readFileSync('version.json')).version;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-linux-'));
try {
  const hub = path.join(temp, 'projects/claude_hub');
  fs.mkdirSync(hub, { recursive: true });
  const backend = path.join(hub, 'backend'); fs.mkdirSync(backend);
  for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(`projects/claude_hub/backend/${file}`, path.join(backend, file));
  fs.cpSync('projects/claude_hub/backend/dist', path.join(backend, 'dist'), { recursive: true });
  execFileSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: backend, stdio: 'inherit' });
  stripDependencyNotes(path.join(backend, 'node_modules'));
  fs.cpSync('projects/claude_hub/frontend', path.join(hub, 'frontend'), { recursive: true, filter: source => {
    const rel = path.relative(root, path.resolve(source)).replaceAll(path.sep, '/');
    return fs.statSync(source).isDirectory() ? !/(?:^|\/)(?:md|node_modules|data|test|knowledge_ai)$/.test(source) : checkFiles.has(rel);
  }});
  fs.mkdirSync(path.join(temp, 'scripts/linux'), { recursive: true });
  // Generated bundles are deliberately absent from the source allowlist.
  // Build into the payload so native packages use the same optimized frontend.
  const { createRequire } = await import('node:module');
  const { buildWeb } = createRequire(import.meta.url)('../build-web.cjs');
  buildWeb(root, path.join(hub, 'frontend/dist'));
  for (const name of ['control.cjs', 'supervisor.cjs', 'autostart.cjs']) fs.copyFileSync('scripts/linux/' + name, path.join(temp, 'scripts/linux', name));
  for (const file of ['version.json', 'LICENSE', 'NOTICE']) fs.copyFileSync(file, path.join(temp, file));
  const nodeVersion = '22.23.4';
  const name = `node-v${nodeVersion}-linux-${arch}`;
  const base = `https://nodejs.org/dist/v${nodeVersion}/`;
  const response = await fetch(base + 'SHASUMS256.txt'); if (!response.ok) throw Error('Node checksum download failed');
  const sums = await response.text();
  const expected = sums.split('\n').find(line => line.trim().endsWith(' ' + name + '.tar.xz'))?.split(/\s+/)[0];
  const { createHash } = await import('node:crypto');
  const res = await fetch(base + name + '.tar.xz'); if (!res.ok) throw Error('Node download failed');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('Node SHA256 mismatch');
  const archive = path.join(os.tmpdir(), name + '-' + process.pid + '.tar.xz');
  fs.writeFileSync(archive, bytes);
  try { execFileSync('tar', ['-xJf', archive, '-C', temp]); } finally { fs.rmSync(archive, { force: true }); }
  fs.renameSync(path.join(temp, name), path.join(temp, 'runtime'));
  fs.rmSync(path.join(temp, 'runtime/include'), { recursive: true, force: true });
  fs.rmSync(path.join(temp, 'runtime/share'), { recursive: true, force: true });
  stripDependencyNotes(path.join(temp, 'runtime/lib/node_modules'));
  // Runtime docs are not product payload; preserve the runtime license.
  for (const file of ['README.md', 'CHANGELOG.md']) fs.rmSync(path.join(temp, 'runtime', file), { force: true });
  for (const file of fs.readdirSync(path.join(backend, 'dist/config/templates'))) if (file.endsWith('.md')) fs.rmSync(path.join(backend, 'dist/config/templates', file));
  checkPayload(temp);
  fs.mkdirSync('release-output', { recursive: true });
  execFileSync('tar', ['-czf', path.join(root, `release-output/clootee-${version}-linux-${arch}.tar.gz`), '-C', temp, '.']);
  // Verify the actual bundled runtime and backend on the native architecture.
  // Data created by this check stays outside the already-created release archive.
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const profile = path.join(temp, 'smoke-profile'); fs.mkdirSync(profile);
  const runtime = path.join(temp, 'runtime/bin/node');
  const child = spawn(runtime, [path.join(backend, 'dist/index.js')], {
    cwd: backend, stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env, HOME: profile, PORT: String(port), PATH: path.dirname(runtime) + path.delimiter + process.env.PATH }
  });
  let spawnError;
  child.once('error', error => { spawnError = error; });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    let healthy = false;
    for (let i = 0; i < 90; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw Error('Bundled Linux backend exited before readiness');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/auth/status`, { signal: AbortSignal.timeout(1000) });
        const auth = await response.json();
        if (response.ok && auth.success && auth.data.passwordEnabled === false) { healthy = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!healthy) throw Error('Bundled Linux backend did not become ready');
    const response = await fetch(`http://127.0.0.1:${port}/api/system/health`);
    const health = await response.json();
    if (!response.ok || !health.success || health.data.platform !== 'linux' || !health.data.memory || !health.data.disk) throw Error('Bundled Linux metrics check failed');
    const page = await fetch(`http://127.0.0.1:${port}/`);
    if (!page.ok || !(await page.text()).includes('serverHealth')) throw Error('Bundled Linux frontend check failed');
    console.log(`Native Linux ${arch} bundle passed: real Node, backend, frontend and server metrics`);
  } finally {
    if (child.pid && child.exitCode === null) {
      child.kill('SIGTERM');
      const deadline = setTimeout(() => child.kill('SIGKILL'), 5000); deadline.unref();
      await exited; clearTimeout(deadline);
    }
  }

} finally { fs.rmSync(temp, { recursive: true, force: true }); }
