// 解析 git 可执行文件（业务无关），思路同 ClaudeBin / CodexBin。
// 优先级：环境变量 GIT_BIN > 系统 PATH > out_end/git 内置便携版（scripts/setup.js --with-git 装的）。
// 找不到时抛错，错误信息里带上安装办法——git 缺失只影响「推送到云端」，不该拖垮整个服务。
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { OutEnd } from './OutEnd';

export class GitBin {
  private static _cache: string | null = null;

  static resolve(): string {
    const bin = this.find();
    if (!bin) {
      throw new Error(
        'GitBin: 未找到 git（环境变量 GIT_BIN、系统 PATH、out_end 内置便携版都没有）。' +
          '请安装 git，或在项目根目录运行 install 脚本时加 --with-git 自动下载便携版。',
      );
    }
    return bin;
  }

  // 找得到返回路径/命令，找不到返回 null（供「能否推送」这类探测用）
  static find(): string | null {
    if (this._cache) return this._cache;
    const found = this._compute();
    if (found) this._cache = found;
    return found;
  }

  static clearCache(): void {
    this._cache = null;
  }

  private static _compute(): string | null {
    const env = process.env.GIT_BIN;
    if (env && fs.existsSync(env)) return env;
    if (this._runs('git')) return 'git';
    return OutEnd.gitExe();
  }

  private static _runs(bin: string): boolean {
    if (path.isAbsolute(bin)) return fs.existsSync(bin);
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
