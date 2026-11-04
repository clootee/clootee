// 解析 git 可执行文件（业务无关），思路同 ClaudeBin / CodexBin。
// 优先级：环境变量 GIT_BIN > 系统 PATH > out_end/git 内置便携版（scripts/setup.js --with-git 装的）。
// 找不到时抛错，错误信息里带上安装办法——git 缺失只影响「推送到云端」，不该拖垮整个服务。
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { OutEnd } from './OutEnd';
import { EventBus } from './EventBus';

export class GitBin {
  private static _cache: string | null = null;
  private static _installing: Promise<string> | null = null;

  static resolve(): string {
    const bin = this.find();
    if (!bin) {
      throw new Error(
        'GitBin: 未找到 git（环境变量 GIT_BIN、系统 PATH、out_end 内置便携版都没有）。' +
          '请重新运行启动脚本自动安装 git，或手动安装后重启软件。',
      );
    }
    return bin;
  }

  // 找得到返回路径/命令，找不到返回 null（供「能否推送」这类探测用）
  static find(): string | null {
    if (this._cache && this._runs(this._cache)) return this._cache;
    this._cache = null;
    const found = this._compute();
    if (found) this._cache = found;
    return found;
  }

  // Share the startup installer's platform handling, mirror selection and fallback.
  static async ensure(): Promise<string> {
    if (this._installing) return this._installing;
    const existing = this.find();
    if (existing) return existing;
    this._installing = this._install();
    try { return await this._installing; }
    finally { this._installing = null; }
  }

  private static async _install(): Promise<string> {
    const emit = (status: string, line: string) => EventBus.broadcast({ kind: 'gitInstall', status, line });
    emit('installing', '未检测到 Git，正在自动安装 / Git missing, installing automatically ...');
    try {
      const installer = require(path.resolve(__dirname, '../../scripts/git.js')) as {
        install(dir: string, options: { full: boolean; log(line: string): void }): Promise<{ ok: boolean; bin?: string; error?: string }>;
      };
      const result = await installer.install(OutEnd.gitDir(), {
        full: process.platform === 'win32', log: line => emit('installing', line),
      });
      if (!result.ok || !result.bin || !this._runs(result.bin)) throw new Error(result.error || 'Git executable verification failed');
      const dirs = [path.dirname(result.bin), path.join(OutEnd.gitDir(), 'bin')];
      process.env.PATH = [...dirs, process.env.PATH || ''].join(path.delimiter);
      const bash = path.join(OutEnd.gitDir(), 'bin', 'bash.exe');
      if (process.platform === 'win32' && fs.existsSync(bash)) process.env.CLAUDE_CODE_GIT_BASH_PATH = bash;
      this.clearCache();
      const bin = this.find();
      if (!bin) throw new Error('Git still unavailable after installation');
      emit('ready', 'Git 已自动安装并验证，可以继续使用 / Git installed and verified.');
      return bin;
    } catch (error) {
      const message = 'Git 自动安装未完成，请检查网络或系统授权后重试 / Git installation incomplete: ' + (error instanceof Error ? error.message : String(error));
      emit('error', message);
      throw new Error(message);
    }
  }

  static clearCache(): void {
    this._cache = null;
  }

  private static _compute(): string | null {
    const env = process.env.GIT_BIN;
    if (env && this._runs(env)) return env;
    if (this._runs('git')) return 'git';
    const bundled = OutEnd.gitExe();
    return bundled && this._runs(bundled) ? bundled : null;
  }

  private static _runs(bin: string): boolean {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
      return true;
    } catch {
      return false;
    }
  }
}
