// Runs on the CI runner: binaries go directly from CI to COS, never to the website host.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const COS = require(process.env.COS_SDK_PATH || 'cos-nodejs-sdk-v5');
const dir = path.resolve(process.env.RELEASE_OUTPUT_DIR || 'release-output');
const bucket = process.env.COS_BUCKET || 'devok-1256047633';
const region = process.env.COS_REGION || 'na-siliconvalley';
const base = new URL(process.env.COS_CDN_BASE || 'https://devok-1256047633.cos.accelerate.myqcloud.com');
if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash) throw new Error('Invalid CDN base');
const build = process.env.BUILD_ID;
if (!/^[a-zA-Z0-9-]{1,90}$/.test(build || '')) throw new Error('Invalid build ID');
if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) throw new Error('COS publishing credentials are required');
const cos = new COS({ SecretId: process.env.COS_SECRET_ID, SecretKey: process.env.COS_SECRET_KEY, UseAccelerate: true, FileParallelLimit: 2, ChunkParallelLimit: 4 });
const scope = { Bucket: bucket, Region: region };
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'release.json')));
if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) || Object.keys(manifest.packages || {}).sort().join(',') !== 'mac,source,windows') throw new Error('Invalid package manifest');
async function digest(file) {
  const hash = createHash('sha256');
  for await (const data of fs.createReadStream(file)) hash.update(data);
  return hash.digest('hex');
}
async function main() {
  // Validate the entire input set before uploading anything.
  for (const [kind, p] of Object.entries(manifest.packages)) {
    const extension = { windows: '.exe', mac: '.dmg', source: '.zip' }[kind];
    if (!/^[a-zA-Z0-9._-]+$/.test(p.file) || !p.file.endsWith(extension) || !p.file.includes(manifest.version)) throw new Error('Invalid package filename');
    const file = path.join(dir, p.file);
    if (fs.statSync(file).size !== p.bytes || await digest(file) !== p.sha256) throw new Error('Package hash mismatch: ' + p.file);
    const fd = fs.openSync(file, 'r'), header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, kind === 'mac' ? p.bytes - 512 : 0); fs.closeSync(fd);
    if (kind === 'windows' && header.subarray(0, 2).toString() !== 'MZ' || kind === 'source' && header.subarray(0, 2).toString() !== 'PK' || kind === 'mac' && header.toString() !== 'koly') throw new Error('Invalid package format');
  }
  for (const p of Object.values(manifest.packages)) {
    const key = `clootee/releases/${manifest.version}/${build}/${p.file}`;
    await cos.uploadFile({ ...scope, Key: key, FilePath: path.join(dir, p.file), SliceSize: 8 * 1024 * 1024,
      ContentType: p.file.endsWith('.zip') ? 'application/zip' : 'application/octet-stream',
      ContentDisposition: `attachment; filename="${p.file}"`, CacheControl: 'public, max-age=31536000, immutable',
      Headers: { 'x-cos-meta-sha256': p.sha256, 'x-cos-meta-source-commit': manifest.sourceCommit }
    });
    const head = await cos.headObject({ ...scope, Key: key });
    if (Number(head.headers['content-length']) !== p.bytes || head.headers['x-cos-meta-sha256'] !== p.sha256) throw new Error('COS upload verification failed: ' + p.file);
    p.url = new URL('/' + key, base).href;
    // Verify the actual accelerated download address, not just the storage origin.
    const response = await fetch(p.url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(60000) });
    if (!response.ok || Number(response.headers.get('content-length')) !== p.bytes || response.headers.get('x-cos-meta-sha256') !== p.sha256) throw new Error('CDN verification failed: ' + p.file);
    const download = await fetch(p.url, { redirect: 'error', signal: AbortSignal.timeout(180000) });
    if (!download.ok) throw new Error('CDN download failed: ' + p.file);
    const hash = createHash('sha256'); let bytes = 0;
    for await (const chunk of download.body) { bytes += chunk.length; hash.update(chunk); }
    if (bytes !== p.bytes || hash.digest('hex') !== p.sha256) throw new Error('CDN full-file SHA256 mismatch: ' + p.file);
    console.log('COS/CDN full-file SHA256 verified: ' + p.file);
  }
  manifest.storage = 'cos';
  manifest.publishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('All three COS/CDN packages are ready');
}
main().catch(error => { console.error('COS publish failed: ' + (error.code || error.message)); process.exitCode = 1; });
