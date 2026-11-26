// 把 Google 官方 Antigravity CLI 各平台安装包同步到 COS（全球加速域名），供国内用户一键安装时竞速选用。
// 镜像清单格式与官方完全一致（version / url / sha512），文件逐字节相同；已是同版本的平台跳过。
// node scripts/release/cdn/antigravity-mirror.cjs [platform...]
// 凭据：COS_SECRET_ID / COS_SECRET_KEY，或 COS_KEYS_FILE 指向的本机 JSON（读其中 tencentCos.secretId/secretKey）。
const COS = require(process.env.COS_SDK_PATH || 'cos-nodejs-sdk-v5');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OFFICIAL = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/';
const CDN = 'https://devok-1256047633.cos.accelerate.myqcloud.com';
const PREFIX = 'clootee/mirrors/antigravity-cli';
const PLATFORMS = ['linux_amd64', 'linux_arm64', 'linux_amd64_musl', 'linux_arm64_musl',
  'darwin_amd64', 'darwin_arm64', 'windows_amd64', 'windows_arm64'];
const SEGMENTS = 8;

function credentials() {
  if (process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY)
    return { secretId: process.env.COS_SECRET_ID, secretKey: process.env.COS_SECRET_KEY };
  if (process.env.COS_KEYS_FILE) return require(path.resolve(process.env.COS_KEYS_FILE)).tencentCos;
  throw new Error('COS credentials are required (COS_SECRET_ID/COS_SECRET_KEY or COS_KEYS_FILE)');
}
const keys = credentials();
const cos = new COS({ SecretId: keys.secretId, SecretKey: keys.secretKey, UseAccelerate: true, ChunkParallelLimit: 4 });
const scope = { Bucket: process.env.COS_BUCKET || 'devok-1256047633', Region: process.env.COS_REGION || 'na-siliconvalley' };
const call = (fn, args) => new Promise((resolve, reject) => cos[fn]({ ...scope, ...args }, (e, d) => (e ? reject(e) : resolve(d))));

const curl = (args) => execFileSync('curl', ['-fsSL', ...args], { maxBuffer: 1 << 24 }).toString();
const json = (url) => { try { return JSON.parse(curl(['-m', '20', url])); } catch { return null; } };

// 单连接常被限速：分段并发拉取后拼接
function download(url, file) {
  const total = Number(/content-range:\s*bytes\s+\d+-\d+\/(\d+)/i.exec(curl(['-r', '0-0', '-D', '-', '-o', os.devNull, url]))[1]);
  const size = Math.ceil(total / SEGMENTS);
  const script = Array.from({ length: SEGMENTS }, (_, i) =>
    `curl -fsSL --retry 5 -r ${i * size}-${Math.min(total, (i + 1) * size) - 1} -o "${file}.${i}" "${url}" &`).join('\n') + '\nwait';
  execFileSync('bash', ['-c', script], { stdio: 'inherit' });
  fs.writeFileSync(file, Buffer.concat(Array.from({ length: SEGMENTS }, (_, i) => fs.readFileSync(`${file}.${i}`))));
  for (let i = 0; i < SEGMENTS; i++) fs.rmSync(`${file}.${i}`);
  if (fs.statSync(file).size !== total) throw new Error(`size mismatch ${fs.statSync(file).size}/${total}`);
}

async function mirror(platform, work) {
  const official = json(OFFICIAL + platform + '.json');
  if (!official?.url || !official.sha512) throw new Error('official manifest unavailable');
  const current = json(`${CDN}/${PREFIX}/manifests/${platform}.json?t=${Date.now()}`);
  if (current?.version === official.version && current.sha512 === official.sha512) {
    console.log(`${platform}: ${official.version} already mirrored`);
    return;
  }
  const name = path.basename(new URL(official.url).pathname);
  const file = path.join(work, name);
  const began = Date.now();
  download(official.url, file);
  const sha512 = crypto.createHash('sha512').update(fs.readFileSync(file)).digest('hex');
  if (sha512 !== official.sha512.toLowerCase()) throw new Error('SHA512 mismatch with official manifest');
  console.log(`${platform}: downloaded ${(fs.statSync(file).size / 1048576).toFixed(1)} MB in ${Math.round((Date.now() - began) / 1000)}s`);
  const key = `${PREFIX}/${official.version}/${platform}/${name}`;
  await call('uploadFile', { Key: key, FilePath: file, Headers: { 'x-cos-meta-sha512': sha512 } });
  // 先确认加速域名上的文件完整可读，再切换清单
  const head = curl(['-I', '-m', '30', `${CDN}/${key}`]);
  if (Number(/content-length:\s*(\d+)/i.exec(head)?.[1]) !== fs.statSync(file).size) throw new Error('CDN size check failed');
  const manifest = { version: official.version, url: `${CDN}/${key}`, sha512, source: official.url };
  await call('putObject', { Key: `${PREFIX}/manifests/${platform}.json`, Body: JSON.stringify(manifest, null, 2) + '\n',
    ContentType: 'application/json', CacheControl: 'no-cache' });
  fs.rmSync(file);
  console.log(`${platform}: mirrored ${official.version} → ${manifest.url}`);
}

(async () => {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : PLATFORMS;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-mirror-'));
  let failed = 0;
  try {
    for (const platform of wanted) {
      try { await mirror(platform, work); } catch (e) { failed++; console.error(`${platform}: FAILED ${e.message || e.code || e}`); }
    }
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
  process.exitCode = failed ? 1 : 0;
})();
