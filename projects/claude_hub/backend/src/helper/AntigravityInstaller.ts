// Antigravity CLI（agy）安装：不走 npm，直接跑 Google 官方安装脚本。
// 脚本装到运行身份的 ~/.local/bin/agy（Windows：%LOCALAPPDATA%\agy\bin），之后 agy 自己后台自动更新。
// 以 root 起服务并启用「以系统用户运行」时，按目标用户身份安装，任务才能在那个用户的家目录里找到 agy。
import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { AntigravityBin } from './AntigravityBin';
import { RunAsUser, RunAsUserConfig } from './RunAsUser';
import { Logger } from './Logger';

const UNIX_SCRIPT = 'https://antigravity.google/cli/install.sh';
const WINDOWS_SCRIPT = 'https://antigravity.google/cli/install.ps1';
// 与官方 install.sh 内的发布清单地址一致；只用于测速和显示总大小，取不到时不影响安装
const MANIFEST_BASE = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/';
const PROXY_VARS = ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY'];
const MB = 1024 * 1024;

export class AntigravityInstaller {
  static async install(home: string | undefined, runAs: RunAsUserConfig | undefined, onProgress?: (line: string) => void) {
    const existing = AntigravityBin.find(home);
    if (existing) return { path: existing, version: await this.version(existing, runAs), log: 'already installed' };
    const win = process.platform === 'win32';
    const command = win
      ? { bin: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${WINDOWS_SCRIPT} | iex`] }
      : RunAsUser.wrap('bash', ['-c', `set -o pipefail; curl -fsSL ${UNIX_SCRIPT} | bash`], runAs);
    onProgress?.(win ? `irm ${WINDOWS_SCRIPT} | iex` : `curl -fsSL ${UNIX_SCRIPT} | bash`);
    // 安装包约 100MB，脚本下载时静默无输出：先测代理/直连哪个快，再按暂存文件大小持续汇报进度
    const net = win ? { env: process.env, total: 0 } : await this.pickNetwork(onProgress);
    const staging = path.join(home || os.homedir(), '.cache', 'antigravity', 'staging', 'agy.tar.gz');
    let last = { bytes: 0, at: Date.now() };
    const timer = win ? null : setInterval(() => {
      let bytes = 0;
      try { bytes = fs.statSync(staging).size; } catch { return; }
      const now = Date.now();
      const speed = Math.max(0, (bytes - last.bytes) / Math.max(1, (now - last.at) / 1000));
      last = { bytes, at: now };
      const total = net.total ? ` / ${(net.total / MB).toFixed(1)} MB（${Math.floor(bytes * 100 / net.total)}%）` : ' MB';
      const eta = net.total && speed > 0 ? `，约剩 ${Math.ceil((net.total - bytes) / speed / 60)} 分钟` : '';
      onProgress?.(`⬇ 已下载 ${(bytes / MB).toFixed(1)}${total}，${Math.round(speed / 1024)} KB/s${eta}`);
    }, 3000);
    let log: string;
    try {
      log = await this.run(command.bin, command.args, onProgress, net.env).catch((e) => {
        if (net.env === process.env) throw e;
        onProgress?.('直连安装失败，改用代理重试');
        return this.run(command.bin, command.args, onProgress);
      });
    } finally { if (timer) clearInterval(timer); }
    const installed = AntigravityBin.find(home);
    if (!installed) throw new Error(`安装脚本已结束，但未找到 agy（${home || '~'}/.local/bin）。\n${log}`);
    return { path: installed, version: await this.version(installed, runAs), log };
  }

  private static async version(bin: string, runAs: RunAsUserConfig | undefined): Promise<string> {
    const command = RunAsUser.wrap(bin, ['--version'], runAs);
    const { stdout } = await promisify(execFile)(command.bin, command.args, { windowsHide: true, timeout: 20000 });
    return stdout.split(/\r?\n/)[0].trim().slice(0, 60);
  }

  // 代理与直连各试下 2MB，选更快的一路；任一步失败都退回当前环境，不阻塞安装
  private static async pickNetwork(onProgress?: (line: string) => void): Promise<{ env: NodeJS.ProcessEnv; total: number }> {
    const proxied = PROXY_VARS.some((k) => process.env[k]);
    const direct = { ...process.env };
    for (const k of PROXY_VARS) delete direct[k];
    const curl = (args: string[], env: NodeJS.ProcessEnv, timeout: number) =>
      promisify(execFile)('curl', args, { env, timeout, windowsHide: true }).then((r) => r.stdout, (e) => String(e?.stdout || '')) // 超时退出码 28 仍带回测速结果;
    const platform = `linux_${os.arch() === 'arm64' ? 'arm64' : 'amd64'}`;
    const name = process.platform === 'darwin' ? platform.replace('linux', 'darwin') : platform;
    const manifest = (await curl(['-fsSL', '-m', '15', MANIFEST_BASE + name + '.json'], process.env, 20000))
      || (proxied ? await curl(['-fsSL', '-m', '15', MANIFEST_BASE + name + '.json'], direct, 20000) : '');
    const url = /"url"\s*:\s*"([^"]+)"/.exec(manifest)?.[1];
    if (!url) return { env: process.env, total: 0 };
    const probe = async (env: NodeJS.ProcessEnv) => {
      const out = await curl(['-sS', '-r', `0-${2 * MB - 1}`, '-m', '8', '-D', '-', '-o', os.devNull, '-w', '\nSPEED=%{speed_download}', url], env, 12000);
      const total = Number(/content-range:\s*bytes\s+\d+-\d+\/(\d+)/i.exec(out)?.[1]) || 0;
      return { env, total, speed: Number(/SPEED=([\d.]+)/.exec(out)?.[1]) || 0 };
    };
    const tries = await Promise.all(proxied ? [probe(process.env), probe(direct)] : [probe(process.env)]);
    const best = tries.reduce((a, b) => (b.speed > a.speed ? b : a));
    const total = tries.find((t) => t.total)?.total || 0;
    if (proxied) {
      const kb = (t: { speed: number }) => Math.round(t.speed / 1024) + ' KB/s';
      onProgress?.(`测速：代理 ${kb(tries[0])}，直连 ${kb(tries[1]!)} → 使用${best === tries[1] ? '直连' : '代理'}`);
    }
    return { env: best.speed > 0 ? best.env : process.env, total };
  }

  private static run(bin: string, args: string[], onProgress?: (line: string) => void, env: NodeJS.ProcessEnv = process.env): Promise<string> {
    return new Promise((resolve, reject) => {
      Logger.info('AntigravityInstaller', 'install start', { bin, args });
      const child = spawn(bin, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
      child.on('error', (e) => reject(new Error(`启动安装脚本失败：${e.message}`)));
      child.on('close', (code) => {
        if (pending.trim()) onProgress?.(pending.trim());
        const tail = out.split(/\r?\n/).filter(Boolean).slice(-15).join('\n');
        if (code === 0) resolve(tail || '(no output)');
        else reject(new Error(`Antigravity 安装脚本退出码 ${code}:\n${tail}`));
      });
    });
  }
}
