// Antigravity CLI（agy）安装：不走 npm，直接跑 Google 官方安装脚本。
// 脚本装到运行身份的 ~/.local/bin/agy（Windows：%LOCALAPPDATA%\agy\bin），之后 agy 自己后台自动更新。
// 以 root 起服务并启用「以系统用户运行」时，按目标用户身份安装，任务才能在那个用户的家目录里找到 agy。
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { AntigravityBin } from './AntigravityBin';
import { RunAsUser, RunAsUserConfig } from './RunAsUser';
import { Logger } from './Logger';

const UNIX_SCRIPT = 'https://antigravity.google/cli/install.sh';
const WINDOWS_SCRIPT = 'https://antigravity.google/cli/install.ps1';

export class AntigravityInstaller {
  static async install(home: string | undefined, runAs: RunAsUserConfig | undefined, onProgress?: (line: string) => void) {
    const existing = AntigravityBin.find(home);
    if (existing) return { path: existing, version: await this.version(existing, runAs), log: 'already installed' };
    const win = process.platform === 'win32';
    const command = win
      ? { bin: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm ${WINDOWS_SCRIPT} | iex`] }
      : RunAsUser.wrap('bash', ['-c', `set -o pipefail; curl -fsSL ${UNIX_SCRIPT} | bash`], runAs);
    onProgress?.(win ? `irm ${WINDOWS_SCRIPT} | iex` : `curl -fsSL ${UNIX_SCRIPT} | bash`);
    const log = await this.run(command.bin, command.args, onProgress);
    const installed = AntigravityBin.find(home);
    if (!installed) throw new Error(`安装脚本已结束，但未找到 agy（${home || '~'}/.local/bin）。\n${log}`);
    return { path: installed, version: await this.version(installed, runAs), log };
  }

  private static async version(bin: string, runAs: RunAsUserConfig | undefined): Promise<string> {
    const command = RunAsUser.wrap(bin, ['--version'], runAs);
    const { stdout } = await promisify(execFile)(command.bin, command.args, { windowsHide: true, timeout: 20000 });
    return stdout.split(/\r?\n/)[0].trim().slice(0, 60);
  }

  private static run(bin: string, args: string[], onProgress?: (line: string) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      Logger.info('AntigravityInstaller', 'install start', { bin, args });
      const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
