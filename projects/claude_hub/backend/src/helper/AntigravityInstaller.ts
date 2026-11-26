// Antigravity CLI（agy）安装：按官方安装脚本的同一套流程（发布清单 → 下载 → SHA512 校验 → 放到
// ~/.local/bin/agy 或 %LOCALAPPDATA%\agy\bin\agy.exe → `agy install`），但下载由本工具自己做：
//   · 候选源：Google 官方（有代理时代理/直连各算一路）+ Clootee 国内加速镜像（COS 全球加速，同一份文件同一个 SHA512）
//   · 先各试下 1MB 测速，选最快的；失败或校验不过自动换下一个
//   · 分段并发下载，每 2 秒汇报「已下载 / 总大小 / 速度 / 剩余时间」
// agy 装好后自己后台自动更新。以 root 起服务并启用「以系统用户运行」时，按目标用户身份落盘。
import { execFile, spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { AntigravityBin } from './AntigravityBin';
import { RunAsUser, RunAsUserConfig } from './RunAsUser';
import { Logger } from './Logger';

const OFFICIAL_BASE = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/';
export const MIRROR_BASE = 'https://devok-1256047633.cos.accelerate.myqcloud.com/clootee/mirrors/antigravity-cli/manifests/';
const PROXY_VARS = ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY'];
const MB = 1024 * 1024;
const SEGMENTS = 8;

type Progress = (line: string) => void;
interface Candidate { label: string; env: NodeJS.ProcessEnv; version: string; url: string; sha512: string; speed: number; total: number }

export class AntigravityInstaller {
  static async install(home: string | undefined, runAs: RunAsUserConfig | undefined, onProgress?: Progress) {
    const existing = AntigravityBin.find(home);
    if (existing) return { path: existing, version: await this.version(existing, runAs), log: 'already installed' };
    const say = (line: string) => onProgress?.(line);
    const platform = this.platform();
    say(`平台：${platform}，正在比较下载源速度…`);
    const candidates = await this.candidates(platform);
    if (!candidates.length) throw new Error('官方源和国内镜像都连不上，请检查网络后重试');
    say('测速：' + candidates.map((c) => `${c.label} ${Math.round(c.speed / 1024)} KB/s`).join('，'));
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-agy-'));
    fs.chmodSync(work, 0o755); // 以其他系统用户落盘时要能读到
    const errors: string[] = [];
    try {
      for (const c of candidates) {
        try {
          say(`使用 ${c.label} 下载 Antigravity CLI ${c.version}`);
          const payload = path.join(work, path.basename(new URL(c.url).pathname));
          await this.download(c, payload, say);
          say('✓ 下载完成，校验 SHA512…');
          if ((await this.sha512(payload)) !== c.sha512.toLowerCase()) throw new Error('SHA512 校验不一致，文件可能损坏');
          say('✓ 校验通过，正在安装…');
          const bin = this.extract(payload, work);
          const target = await this.place(bin, home, runAs);
          await this.run(RunAsUser.wrap(target, ['install'], runAs), say).catch((e) => say(`agy install 提示：${e.message}`));
          return { path: target, version: await this.version(target, runAs), log: `${c.label} ${c.version}` };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${c.label}：${msg}`);
          say(`${c.label} 失败：${msg}${c === candidates[candidates.length - 1] ? '' : '，换下一个源'}`);
        }
      }
      throw new Error('所有下载源都失败了：\n' + errors.join('\n'));
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  // 与官方脚本的清单命名一致：linux_amd64[_musl] / darwin_arm64 / windows_amd64 …
  private static platform(): string {
    const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
    if (process.platform === 'win32') return `windows_${arch}`;
    if (process.platform === 'darwin') return `darwin_${arch}`;
    const musl = ['/lib/libc.musl-x86_64.so.1', '/lib/libc.musl-aarch64.so.1'].some((f) => fs.existsSync(f));
    return `linux_${arch}${musl ? '_musl' : ''}`;
  }

  private static curl(args: string[], env: NodeJS.ProcessEnv, timeout: number): Promise<string> {
    const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';
    // 超时退出（码 28）时 stdout 里仍有测速结果，不能丢
    return promisify(execFile)(bin, args, { env, timeout, windowsHide: true, maxBuffer: 4 * MB })
      .then((r) => r.stdout, (e) => String(e?.stdout || ''));
  }

  // 列出所有能拿到清单的源，并用前 1MB 测速，按速度从快到慢排
  private static async candidates(platform: string): Promise<Candidate[]> {
    const direct = { ...process.env };
    for (const k of PROXY_VARS) delete direct[k];
    const proxied = PROXY_VARS.some((k) => process.env[k]);
    const routes = [
      { label: proxied ? '官方源（代理）' : '官方源', base: OFFICIAL_BASE, env: process.env },
      ...(proxied ? [{ label: '官方源（直连）', base: OFFICIAL_BASE, env: direct }] : []),
      { label: '国内加速镜像', base: MIRROR_BASE, env: direct },
    ];
    const probed = await Promise.all(routes.map(async (r) => {
      const text = await this.curl(['-fsSL', '-m', '10', r.base + platform + '.json'], r.env, 15000);
      let m: { version?: string; url?: string; sha512?: string } = {};
      try { m = JSON.parse(text); } catch { return null; }
      if (!m.url || !m.sha512 || !/^https:\/\//.test(m.url)) return null;
      const out = await this.curl(['-sS', '-L', '-r', `0-${MB - 1}`, '-m', '6', '-D', '-', '-o', os.devNull,
        '-w', '\nSPEED=%{speed_download}', m.url], r.env, 10000);
      const total = Number(/content-range:\s*bytes\s+\d+-\d+\/(\d+)/i.exec(out)?.[1]) || 0;
      const speed = Number(/SPEED=([\d.]+)/.exec(out)?.[1]) || 0;
      return { label: r.label, env: r.env, version: m.version || '?', url: m.url, sha512: m.sha512, speed, total };
    }));
    return (probed.filter(Boolean) as Candidate[]).sort((a, b) => b.speed - a.speed);
  }

  // 分段并发下载（单连接常被限速）；不支持断点的源退回单连接。每 2 秒汇报一次进度。
  private static async download(c: Candidate, file: string, say: Progress): Promise<void> {
    const total = c.total;
    const parts = total > 8 * MB ? SEGMENTS : 1;
    const size = Math.ceil(total / parts);
    const files = Array.from({ length: parts }, (_, i) => `${file}.part${i}`);
    const done = () => files.reduce((n, f) => { try { return n + fs.statSync(f).size; } catch { return n; } }, 0);
    let last = { bytes: 0, at: Date.now() };
    const timer = setInterval(() => {
      const bytes = done();
      const now = Date.now();
      const speed = Math.max(0, (bytes - last.bytes) / Math.max(0.001, (now - last.at) / 1000));
      last = { bytes, at: now };
      const of = total ? ` / ${(total / MB).toFixed(1)} MB（${Math.floor(bytes * 100 / total)}%）` : ' MB';
      const eta = total && speed > 0 ? `，约剩 ${this.eta((total - bytes) / speed)}` : '';
      say(`⬇ 已下载 ${(bytes / MB).toFixed(1)}${of}，${Math.round(speed / 1024)} KB/s${eta}`);
    }, 2000);
    try {
      await Promise.all(files.map(async (part, i) => {
        const range = parts > 1 ? ['-r', `${i * size}-${Math.min(total, (i + 1) * size) - 1}`] : [];
        for (let attempt = 1; ; attempt++) {
          fs.rmSync(part, { force: true });
          try {
            await this.run({ bin: process.platform === 'win32' ? 'curl.exe' : 'curl',
              args: ['-fsSL', '--retry', '2', '--speed-limit', '1024', '--speed-time', '60', ...range, '-o', part, c.url] }, undefined, c.env);
            return;
          } catch (e) { if (attempt >= 3) throw e; }
        }
      }));
    } finally { clearInterval(timer); }
    const out = fs.createWriteStream(file);
    for (const part of files) {
      await new Promise<void>((resolve, reject) => {
        const input = fs.createReadStream(part);
        input.on('error', reject).on('end', resolve).pipe(out, { end: false });
      });
      fs.rmSync(part, { force: true });
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
    if (total && fs.statSync(file).size !== total) throw new Error(`下载大小不对：${fs.statSync(file).size} / ${total}`);
  }

  private static eta(seconds: number): string {
    return seconds < 60 ? `${Math.ceil(seconds)} 秒` : `${Math.ceil(seconds / 60)} 分钟`;
  }

  private static sha512(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha512');
      fs.createReadStream(file).on('error', reject).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex')));
    });
  }

  // tar.gz 里只取 antigravity 这一个可执行文件（与官方脚本相同）；Windows 直接是 exe
  private static extract(payload: string, work: string): string {
    if (!payload.endsWith('.tar.gz')) return payload;
    const out = path.join(work, 'x');
    fs.mkdirSync(out, { mode: 0o755 });
    const r = require('child_process').spawnSync('tar', ['-xzf', payload, '-C', out, 'antigravity'], { windowsHide: true });
    const bin = path.join(out, 'antigravity');
    if (r.status !== 0 || !fs.existsSync(bin)) throw new Error('解压安装包失败：' + String(r.stderr || '').slice(0, 300));
    fs.chmodSync(bin, 0o755);
    return bin;
  }

  // 落盘到运行用户的固定位置（AntigravityBin.find 正是在这里找）；先写临时名再改名，避免半个文件
  private static async place(bin: string, home: string | undefined, runAs: RunAsUserConfig | undefined): Promise<string> {
    if (process.platform === 'win32') {
      const dir = path.join(process.env.LOCALAPPDATA || path.join(home || os.homedir(), 'AppData', 'Local'), 'agy', 'bin');
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, 'agy.exe');
      fs.copyFileSync(bin, target);
      return target;
    }
    const dir = path.join(home || os.homedir(), '.local', 'bin');
    const script = 'mkdir -p "$1" && cp "$2" "$1/.agy.tmp" && chmod 755 "$1/.agy.tmp" && mv -f "$1/.agy.tmp" "$1/agy"'
      + (process.platform === 'darwin' ? ' && (xattr -d com.apple.quarantine "$1/agy" 2>/dev/null || true)' : '');
    await this.run(RunAsUser.wrap('sh', ['-c', script, 'sh', dir, bin], runAs));
    return path.join(dir, 'agy');
  }

  private static async version(bin: string, runAs: RunAsUserConfig | undefined): Promise<string> {
    const command = RunAsUser.wrap(bin, ['--version'], runAs);
    const { stdout } = await promisify(execFile)(command.bin, command.args, { windowsHide: true, timeout: 20000 });
    return stdout.split(/\r?\n/)[0].trim().slice(0, 60);
  }

  private static run(command: { bin: string; args: string[] }, onProgress?: Progress, env: NodeJS.ProcessEnv = process.env): Promise<string> {
    return new Promise((resolve, reject) => {
      Logger.info('AntigravityInstaller', 'run', { bin: command.bin, args: command.args.slice(-3) });
      const child = spawn(command.bin, command.args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let pending = '';
      const cap = (chunk: Buffer) => {
        const text = chunk.toString();
        out = (out + text).slice(-8000);
        pending += text;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) if (line.trim()) onProgress?.(line.trim());
      };
      child.stdout.on('data', cap);
      child.stderr.on('data', cap);
      child.on('error', (e) => reject(new Error(`启动 ${command.bin} 失败：${e.message}`)));
      child.on('close', (code) => {
        if (pending.trim()) onProgress?.(pending.trim());
        const tail = out.split(/\r?\n/).filter(Boolean).slice(-10).join('\n');
        if (code === 0) resolve(tail);
        else reject(new Error(`${path.basename(command.bin)} 退出码 ${code}${tail ? '：\n' + tail : ''}`));
      });
    });
  }
}
