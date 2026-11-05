import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
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
  fs.copyFileSync('scripts/linux/control.cjs', path.join(temp, 'scripts/linux/control.cjs'));
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
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
