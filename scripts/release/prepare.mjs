import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { archive as publicArchive, checkPayload, stripDependencyNotes } from './public-snapshot.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktop = path.join(root, 'scripts/release/desktop');
const pkgPath = path.join(desktop, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath));
const version = JSON.parse(fs.readFileSync(path.join(root, 'projects/claude_hub/backend/package.json'))).version;
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
const payload = path.join(desktop, 'payload');
fs.rmSync(payload, { recursive: true, force: true });
fs.mkdirSync(payload, { recursive: true });
// An explicit product allowlist keeps unrelated projects and local runtime data out.
const archive = path.join(desktop, 'payload.tar');
publicArchive(archive, true);
execFileSync('tar', ['-xf', archive, '-C', payload]);
fs.rmSync(archive);
for (const rel of ['scripts/release', 'projects/claude_hub/data', 'projects/claude_hub/deploy']) fs.rmSync(path.join(payload, rel), { recursive: true, force: true });
const backend = path.join(payload, 'projects/claude_hub/backend');
// Windows uses npm.cmd via a fixed, argument-free command, never user input.
const npm = args => process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm ' + args.join(' ')], { cwd: backend, stdio: 'inherit' })
  : execFileSync('npm', args, { cwd: backend, stdio: 'inherit' });
npm(['ci', '--include=dev', '--no-audit', '--no-fund']);
npm(['run', 'build']);
npm(['prune', '--omit=dev', '--no-audit', '--no-fund']);
// Desktop packages contain runtime assets, not repository notes or source tooling.
fs.rmSync(path.join(backend, 'src'), { recursive: true, force: true });
fs.rmSync(path.join(backend, 'tsconfig.json'), { force: true });
stripDependencyNotes(path.join(backend, 'node_modules'));
for (const name of fs.readdirSync(path.join(backend, 'dist/config/templates'))) {
  if (/\.md$/i.test(name)) fs.rmSync(path.join(backend, 'dist/config/templates', name));
}
checkPayload(payload);
const runtimes = path.join(desktop, 'runtimes');
fs.rmSync(runtimes, { recursive: true, force: true });
fs.mkdirSync(runtimes, { recursive: true });
// Both real Node runtimes are included in the universal Mac application.
for (const arch of process.platform === 'darwin' ? ['arm64', 'x64'] : ['x64']) {
  const nodeVersion = '22.23.4';
  const platform = process.platform === 'win32' ? 'win' : 'darwin';
  const name = `node-v${nodeVersion}-${platform}-${arch}`;
  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  const file = name + ext;
  console.log('Downloading and verifying bundled Node:', file);
  const base = `https://nodejs.org/dist/v${nodeVersion}/`;
  const download = async file => { const r = await fetch(base + file, { signal: AbortSignal.timeout(180000) }); if (!r.ok) throw new Error(`Node download ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
  const sums = (await download('SHASUMS256.txt')).toString();
  const bytes = await download(file);
  const expected = sums.split('\n').find(line => line.trim().endsWith(' ' + file))?.split(/\s+/)[0];
  if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Node checksum mismatch');
  const local = path.join(runtimes, file);
  fs.writeFileSync(local, bytes);
  execFileSync('tar', process.platform === 'win32' ? ['-xf', local, '-C', runtimes] : ['-xzf', local, '-C', runtimes]);
  fs.renameSync(path.join(runtimes, name), path.join(runtimes, process.platform + '-' + arch));
  // Ship the runtime and npm, without C/C++ development headers or man pages.
  // Besides size, this avoids thousands of unnecessary universal-merge checks.
  for (const dir of ['include', 'share']) fs.rmSync(path.join(runtimes, process.platform + '-' + arch, dir), { recursive: true, force: true });
  fs.rmSync(local);
  stripDependencyNotes(path.join(runtimes, process.platform + '-' + arch));
}
checkPayload(runtimes);
console.log('Payload ready:', version);
