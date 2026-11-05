'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const COS = require('cos-nodejs-sdk-v5');
const dir = path.resolve('release-output');
const version = require('../../version.json').version;
const build = process.env.BUILD_ID;
if (!/^[a-zA-Z0-9-]{1,70}$/.test(build || '')) throw Error('Invalid build ID');
if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) throw Error('COS credentials required');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const base = 'https://devok-1256047633.cos.accelerate.myqcloud.com';
const scope = { Bucket: 'devok-1256047633', Region: 'na-siliconvalley' };
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY, UseAccelerate: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const packages = {};
for (const arch of ['x64', 'arm64']) {
  const file = `clootee-${version}-linux-${arch}.tar.gz`;
  const bytes = fs.readFileSync(path.join(dir, file));
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw Error('Invalid Linux package');
  packages[arch] = { file, bytes: bytes.length, sha256: hash(bytes), url: `${base}/clootee/releases/${version}/linux-${build}/${file}` };
}
let installer = fs.readFileSync('scripts/linux/install.sh', 'utf8');
for (const [key, value] of Object.entries({ VERSION: version, RELEASE: version + '-' + sourceCommit.slice(0, 12), X64_URL: packages.x64.url, X64_SHA: packages.x64.sha256, ARM64_URL: packages.arm64.url, ARM64_SHA: packages.arm64.sha256 })) installer = installer.replaceAll(`@@${key}@@`, value);
if (installer.includes('@@')) throw Error('Unresolved installer placeholders');
const file = `clootee-${version}-linux-install.sh`;
fs.writeFileSync(path.join(dir, file), installer, { mode: 0o755 });
packages.installer = { file, bytes: Buffer.byteLength(installer), sha256: hash(installer), url: `${base}/clootee/releases/${version}/linux-${build}/${file}` };
(async () => {
  for (const p of Object.values(packages)) {
    const key = new URL(p.url).pathname.slice(1);
    await cos.uploadFile({ ...scope, Key: key, FilePath: path.join(dir, p.file), ContentType: p.file.endsWith('.sh') ? 'text/x-shellscript; charset=utf-8' : 'application/gzip', ContentDisposition: `attachment; filename="${p.file}"`, CacheControl: 'public, max-age=31536000, immutable', Headers: { 'x-cos-meta-sha256': p.sha256, 'x-cos-meta-source-commit': sourceCommit } });
    const response = await fetch(p.url, { redirect: 'error', signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw Error('CDN download failed: ' + p.file);
    const digest = createHash('sha256'); let count = 0;
    for await (const chunk of response.body) { count += chunk.length; digest.update(chunk); }
    if (count !== p.bytes || digest.digest('hex') !== p.sha256) throw Error('CDN SHA256 mismatch: ' + p.file);
    console.log('COS full-file SHA256 verified: ' + p.file);
  }
  fs.writeFileSync(path.join(dir, 'linux.json'), JSON.stringify({ version, sourceCommit, buildId: build, storage: 'cos', publishedAt: new Date().toISOString(), packages }, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'LINUX-SHA256SUMS.txt'), Object.values(packages).map(p => `${p.sha256}  ${p.file}`).join('\n') + '\n');
})().catch(e => { console.error(e.code || e.message); process.exitCode = 1; });
