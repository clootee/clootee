'use strict';
/**
 * git 按需安装（安装脚本版）—— 纯 JS，只依赖 Node 内置模块（要在 TS 没装时就能跑）。
 *
 * 为什么不用 npm 装 git：npm 上没有官方 git；`dugite` 之类的包只是在 postinstall 里
 * 去 GitHub 下同一份便携版，国内还常被墙。所以这里直接下便携版，并**优先走国内镜像**。
 *
 * Windows：下载 Git for Windows 的便携包解压到 out_end/git（免安装、不写注册表、不要管理员）
 *   - 默认 MinGit（~41MB，解压 ~91MB）：含 git 本体 + ssh.exe + git-credential-wincred，够
 *     add/commit/push（HTTPS 用 `git config --global credential.helper wincred` 存一次密码/token，
 *     SSH 直接可用）；不含 GUI / Git Bash / 微软那套 GCM 浏览器登录流程。
 *   - full=true 时用 PortableGit（~59MB，解压 ~350MB）：完整版，含 Git Bash 与凭据管理器。
 *   下载源在「npmmirror 二进制镜像」与「GitHub Releases」之间实测竞速（同 registry.js 的思路）。
 *
 * Linux/macOS：便携包没有官方发行版，改用系统包管理器；有 root/brew 就直接装，否则打印命令。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const MIRROR_BASE = 'https://registry.npmmirror.com/-/binary/git-for-windows';
const GITHUB_BASE = 'https://github.com/git-for-windows/git/releases/download';
// 探测不到最新版时用它兜底（2025-08 发布，长期可用）
const FALLBACK_TAG = 'v2.51.0.windows.1';
const PROBE_TIMEOUT_MS = 2000;
const NET_TIMEOUT_MS = 20000;

// ── 网络（跟随重定向；GitHub 下载会跳到 objects.githubusercontent.com）─────────
function get(url, cb, depth = 0) {
  if (depth > 5) return cb(new Error('重定向过多 / too many redirects'));
  const req = https.get(url, { timeout: NET_TIMEOUT_MS }, (res) => {
    const code = res.statusCode || 0;
    if (code >= 300 && code < 400 && res.headers.location) {
      res.resume();
      return get(new URL(res.headers.location, url).toString(), cb, depth + 1);
    }
    if (code !== 200) {
      res.resume();
      return cb(new Error(`HTTP ${code} — ${url}`));
    }
    cb(null, res);
  });
  req.on('timeout', () => req.destroy(new Error(`超时 / timeout — ${url}`)));
  req.on('error', cb);
}

function fetchText(url) {
  return new Promise((resolve) => {
    get(url, (err, res) => {
      if (err) return resolve(null);
      let buf = '';
      res.setEncoding('utf-8');
      res.on('data', (d) => (buf += d));
      res.on('end', () => resolve(buf));
      res.on('error', () => resolve(null));
    });
  });
}

// 探测某个下载源的延迟（毫秒），超时/出错返回 null
function probe(url) {
  return new Promise((resolve) => {
    const started = Date.now();
    let done = false;
    const fin = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'HEAD', timeout: PROBE_TIMEOUT_MS },
        (res) => {
          res.resume();
          const code = res.statusCode || 0;
          fin(code < 500 ? Date.now() - started : null);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        fin(null);
      });
      req.on('error', () => fin(null));
      req.end();
    } catch {
      fin(null);
    }
  });
}

function download(url, dest, onProgress) {
  return new Promise((resolve) => {
    get(url, (err, res) => {
      if (err) return resolve(err.message);
      const total = Number(res.headers['content-length'] || 0);
      let got = 0;
      let lastTick = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (c) => {
        got += c.length;
        const now = Date.now();
        if (onProgress && now - lastTick > 400) {
          lastTick = now;
          onProgress(got, total);
        }
      });
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          if (onProgress) onProgress(got, total || got);
          resolve(null);
        });
      });
      out.on('error', (e) => resolve(e.message));
      res.on('error', (e) => resolve(e.message));
    });
  });
}

// ── Windows：版本 / 资源名 / 解压 ──────────────────────────────────────────────
// 从镜像的目录清单里挑最新的 vX.Y.Z.windows.N；探不通就用兜底版本
async function latestTag() {
  const txt = await fetchText(`${MIRROR_BASE}/`);
  if (!txt) return FALLBACK_TAG;
  const seen = new Set();
  const re = /"name"\s*:\s*"(v(\d+)\.(\d+)\.(\d+)\.windows\.(\d+))\/"/g;
  let m;
  let best = null;
  let bestKey = [-1, -1, -1, -1];
  while ((m = re.exec(txt))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const key = [Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
    if (cmp(key, bestKey) > 0) {
      bestKey = key;
      best = m[1];
    }
  }
  return best || FALLBACK_TAG;
}

function cmp(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function winArch() {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'ia32') return '32-bit';
  return '64-bit';
}

// tag 形如 v2.51.0.windows.1 → 资源里的版本号是 2.51.0（.windows.N > 1 时是 2.51.0.N）
function assetVersion(tag) {
  const m = /^v(\d+\.\d+\.\d+)\.windows\.(\d+)$/.exec(tag);
  if (!m) return null;
  return m[2] === '1' ? m[1] : `${m[1]}.${m[2]}`;
}

function assetName(tag, full) {
  const v = assetVersion(tag);
  if (!v) return null;
  return full ? `PortableGit-${v}-${winArch()}.7z.exe` : `MinGit-${v}-${winArch()}.zip`;
}

function unzip(zip, destDir) {
  // Win10 1803+ 自带 bsdtar，能解 zip 且比 Expand-Archive 快得多
  const t = spawnSync('tar', ['-xf', zip, '-C', destDir], { stdio: 'ignore', shell: false });
  if (t.status === 0) return null;
  const ps = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${destDir}' -Force`],
    { stdio: 'ignore' }
  );
  return ps.status === 0 ? null : '解压失败 / extract failed（tar 与 Expand-Archive 都不可用）';
}

// PortableGit 是 7z 自解压器：-o 指定目录、-y 全部确认，静默完成
function selfExtract(exe, destDir) {
  const r = spawnSync(exe, [`-o${destDir}`, '-y'], { stdio: 'ignore' });
  return r.status === 0 ? null : '自解压失败 / self-extract failed';
}

function winGitExe(gitDir) {
  const p = path.join(gitDir, 'cmd', 'git.exe');
  return fs.existsSync(p) ? p : null;
}

async function installWindows(gitDir, full, log) {
  const tag = await latestTag();
  const name = assetName(tag, full);
  if (!name) return { ok: false, error: `无法解析版本 / bad tag: ${tag}` };

  const urls = [`${MIRROR_BASE}/${tag}/${name}`, `${GITHUB_BASE}/${tag}/${name}`];
  const ms = await Promise.all(urls.map(probe));
  const order = urls
    .map((u, i) => ({ u, ms: ms[i] }))
    .sort((a, b) => (a.ms === null ? Infinity : a.ms) - (b.ms === null ? Infinity : b.ms))
    .map((x) => x.u);
  log(
    `下载源竞速 / picking mirror: ` +
      urls.map((u, i) => `${new URL(u).hostname}=${ms[i] === null ? '超时' : ms[i] + 'ms'}`).join('  ')
  );

  fs.mkdirSync(gitDir, { recursive: true });
  const tmp = path.join(gitDir, `.download-${name}`);
  let err = '下载未开始 / no source';
  for (const url of order) {
    log(`下载 ${name}（约 ${full ? 59 : 41}MB）来自 ${new URL(url).hostname} ...`);
    err = await download(url, tmp, (got, total) => {
      const pct = total ? Math.floor((got / total) * 100) : 0;
      process.stdout.write(`\r  [..]   ${pct}%  ${(got / 1048576).toFixed(1)}MB`);
    });
    process.stdout.write('\n');
    if (!err) break;
    log(`该源失败 / failed: ${err}`);
  }
  if (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* 清不掉临时文件不影响结论 */
    }
    return { ok: false, error: `下载失败 / download failed: ${err}` };
  }

  log('解压中 / extracting ...');
  const xerr = full ? selfExtract(tmp, gitDir) : unzip(tmp, gitDir);
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* 同上 */
  }
  if (xerr) return { ok: false, error: xerr };

  const exe = winGitExe(gitDir);
  if (!exe) return { ok: false, error: `解压后仍找不到 git.exe / git.exe missing in ${gitDir}` };
  return { ok: true, bin: exe, version: tag, full };
}

// ── Linux / macOS：交给系统包管理器 ────────────────────────────────────────────
const PKG_MANAGERS = [
  { bin: 'apt-get', args: ['install', '-y', 'git'], pre: ['update'] },
  { bin: 'dnf', args: ['install', '-y', 'git'] },
  { bin: 'yum', args: ['install', '-y', 'git'] },
  { bin: 'zypper', args: ['--non-interactive', 'install', 'git'] },
  { bin: 'pacman', args: ['-S', '--noconfirm', 'git'] },
  { bin: 'apk', args: ['add', '--no-cache', 'git'] },
  { bin: 'brew', args: ['install', 'git'], noRoot: true },
];

function onPath(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf-8' });
  if (r.status !== 0 || !r.stdout) return null;
  return String(r.stdout).trim().split(/\r?\n/)[0] || null;
}

function pickPkgManager() {
  for (const m of PKG_MANAGERS) if (onPath(m.bin)) return m;
  return null;
}

function installUnix(log) {
  const m = pickPkgManager();
  if (!m) {
    return {
      ok: false,
      error:
        '未找到可用的包管理器 / no package manager found —— ' +
        (process.platform === 'darwin' ? '请运行 xcode-select --install' : '请手动安装 git'),
    };
  }
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  const cmdline = `${m.bin} ${m.args.join(' ')}`;
  if (!isRoot && !m.noRoot) {
    return { ok: false, needsSudo: true, error: `需要 root 权限 / run it yourself: sudo ${cmdline}` };
  }
  if (m.pre) {
    log(`${m.bin} ${m.pre.join(' ')} ...`);
    spawnSync(m.bin, m.pre, { stdio: 'inherit' });
  }
  log(`${cmdline} ...`);
  const r = spawnSync(m.bin, m.args, { stdio: 'inherit' });
  if (r.status !== 0) return { ok: false, error: `${cmdline} 失败 / failed` };
  const bin = onPath('git');
  return bin ? { ok: true, bin } : { ok: false, error: '装完仍找不到 git / git still not on PATH' };
}

// ── 对外接口 ──────────────────────────────────────────────────────────────────
// out_end/git 下已解压好的便携版（Windows 专有），存在才返回
function bundled(gitDir) {
  return process.platform === 'win32' ? winGitExe(gitDir) : null;
}

// 安装 git。Windows 装到 gitDir（便携、免管理员）；其余走系统包管理器。
// 返回 { ok, bin?, error?, needsSudo? }，永不抛错。
async function install(gitDir, opts) {
  const o = opts || {};
  const log = o.log || (() => {});
  if (process.platform === 'win32') return installWindows(gitDir, !!o.full, log);
  return installUnix(log);
}

// 没装成功时给用户的手动安装建议（一行）
function manualHint() {
  if (process.platform === 'win32') {
    return 'winget install --id Git.Git -e  或  下载 https://git-scm.com/download/win';
  }
  if (process.platform === 'darwin') return 'brew install git  或  xcode-select --install';
  const m = pickPkgManager();
  return m ? `sudo ${m.bin} ${m.args.join(' ')}` : '用你的包管理器安装 git';
}

module.exports = { install, bundled, manualHint, winGitExe };
