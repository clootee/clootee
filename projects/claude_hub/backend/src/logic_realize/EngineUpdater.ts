// 引擎安装/更新（实现）：spawn `npm install -g`。跨平台：Windows 用 npm.cmd(shell)，其余用 npm。
// npm 源由 RegistryPicker 决定（用户配置 > 竞速最快 > 官方），首选源失败时自动换另一个公共源重试一次。
// 装到哪里由 npm 自己的全局 prefix 决定：用内置便携 Node 时落在 out_end/node（已在 PATH 里），
// 用系统 Node 时落在系统全局目录——两种情况 ClaudeBin/CodexBin 都能在 PATH 上找到。
import { spawn } from 'child_process';
import { EngineUpdaterStruct, UpdateProgress } from '../logic_struct/EngineUpdaterStruct';
import { Logger } from '../helper/Logger';
import { RegistryPicker, OFFICIAL_REGISTRY, MIRROR_REGISTRY } from '../helper/RegistryPicker';

export class EngineUpdater extends EngineUpdaterStruct {
  protected static _pickRegistry(): Promise<string> {
    return RegistryPicker.pick();
  }

  protected static async _npmInstall(
    pkg: string,
    registry: string,
    onProgress?: UpdateProgress
  ): Promise<string> {
    try {
      return await this._spawnNpm(pkg, registry, onProgress);
    } catch (e) {
      // 用户自己配了私服就别乱换源：换了大概率也装不上，反而掩盖真正的错误
      if (RegistryPicker.configured()) throw e;
      const other = registry === MIRROR_REGISTRY ? OFFICIAL_REGISTRY : MIRROR_REGISTRY;
      Logger.info('EngineUpdater', 'retry with other registry', { from: registry, to: other });
      onProgress?.(`换源重试 / retrying with ${other}`);
      return this._spawnNpm(pkg, other, onProgress);
    }
  }

  // 全局安装最典型的失败是「全局目录没有写权限」（Linux/macOS 用系统 Node 时）。
  // npm 自己的报错很长，这里在最前面补一句人话，否则用户只能看到一堆 EACCES 路径。
  private static _permHint(tail: string): string {
    if (!/EACCES|EPERM|permission denied/i.test(tail)) return '';
    return process.platform === 'win32'
      ? '\n（没有写权限：请用管理员身份重新启动本软件后再试）'
      : '\n（没有写权限：可在终端执行 sudo npm install -g <包名>，' +
          '或先 npm config set prefix ~/.npm-global 并把 ~/.npm-global/bin 加进 PATH）';
  }

  private static _spawnNpm(
    pkg: string,
    registry: string,
    onProgress?: UpdateProgress
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'npm.cmd' : 'npm';
      const args = ['install', '-g', `${pkg}@latest`, `--registry=${registry}`, '--no-audit', '--no-fund'];
      Logger.info('EngineUpdater', 'npm install start', { cmd, args });
      const child = spawn(cmd, args, { shell: isWin, windowsHide: true });
      let out = '';
      let pending = '';
      const cap = (c: Buffer) => {
        const text = c.toString();
        out += text;
        if (out.length > 20000) out = out.slice(-20000);
        if (!onProgress) return;
        pending += text;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (t) onProgress(t);
        }
      };
      child.stdout?.on('data', cap);
      child.stderr?.on('data', cap);
      child.on('error', (e) => reject(new Error(`npm 启动失败: ${e.message}`)));
      child.on('close', (code) => {
        if (pending.trim() && onProgress) onProgress(pending.trim());
        const tail = out.split(/\r?\n/).filter(Boolean).slice(-20).join('\n');
        if (code === 0) {
          Logger.info('EngineUpdater', 'npm install done', { pkg, registry });
          resolve(tail || '(no output)');
        } else {
          reject(new Error(`npm 退出码 ${code}（源 ${registry}）:${this._permHint(tail)}\n${tail}`));
        }
      });
    });
  }
}
