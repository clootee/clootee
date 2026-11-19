// 引擎安装/更新（实现）：spawn `npm install -g`。跨平台：Windows 用 npm.cmd(shell)，其余用 npm。
// npm 源由 RegistryPicker 决定（用户配置 > 竞速最快 > 官方），首选源失败时自动换另一个公共源重试一次。
// 安装到应用可写的 out_end/tools，复用启动安装器的位置，不需要写系统全局目录。
import { Toolchain } from './Toolchain';
import { SemVer } from '../helper/SemVer';
import { promisify } from 'util';
import { spawn, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { OutEnd } from '../helper/OutEnd';
import { ClaudeBin } from '../helper/ClaudeBin';
import { CodexBin } from '../helper/CodexBin';
import { AppConfig } from '../config/AppConfig';
import { EngineUpdaterStruct, UpdateProgress, PKG } from '../logic_struct/EngineUpdaterStruct';
import { Logger } from '../helper/Logger';
import { RegistryPicker, OFFICIAL_REGISTRY, MIRROR_REGISTRY } from '../helper/RegistryPicker';

export class EngineUpdater extends EngineUpdaterStruct {
  private static _active(engine: string) {
    if (engine !== 'claude' && engine !== 'codex') throw new Error('Invalid engine');
    return engine === 'claude'
      ? ClaudeBin.resolve(AppConfig.CLAUDE_BIN, Toolchain.preferBundled('claude'))
      : CodexBin.resolve(AppConfig.CODEX_BIN, Toolchain.preferBundled('codex'));
  }

  private static async _activeVersion(engine: string) {
    const resolved = this._active(engine);
    const { stdout } = await promisify(execFile)(resolved.bin, [...resolved.prefixArgs, '--version'],
      { windowsHide: true, timeout: 10000 });
    const current = stdout.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0];
    if (!current) throw new Error('Cannot read installed CLI version');
    return current;
  }

  static async checkVersion(engine: string) {
    const current = await this._activeVersion(engine);
    const registry = (await this._pickRegistry()).replace(/\/+$/, '');
    const response = await fetch(registry + '/' + PKG[engine] + '/latest', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Registry HTTP ' + response.status);
    const latest = SemVer.parse((await response.json()).version);
    if (!latest) throw new Error('Cannot read latest CLI version');
    return { current, latest, hasUpdate: SemVer.gt(latest, current) };
  }

  protected static async _verify(engine: string, prefix: string): Promise<void> {
    const modules = process.platform === 'win32' ? 'node_modules' : 'lib/node_modules';
    const manifest = path.join(prefix, modules, PKG[engine], 'package.json');
    const installed = SemVer.parse(JSON.parse(fs.readFileSync(manifest, 'utf8')).version);
    const active = await this._activeVersion(engine);
    if (!installed || SemVer.lt(active, installed))
      throw new Error(`安装版本 ${installed}，任务实际使用 ${engine} ${active}。请检查运行环境中的引擎路径。`);
  }

  protected static _installPrefix(engine: string): string {
    let executable: string;
    try {
      const active = this._active(engine);
      executable = active.prefixArgs[0] || active.bin;
    } catch { return OutEnd.toolsDir(); } // First-time installation
    if (!path.isAbsolute(executable)) {
      const candidate = (process.env.PATH || '').split(path.delimiter)
        .map(dir => path.join(dir, executable)).find(file => fs.existsSync(file));
      if (candidate) executable = candidate;
    }
    if (fs.existsSync(executable)) {
      const binary = fs.realpathSync(executable);
      const modules = process.platform === 'win32' ? 'node_modules' : 'lib/node_modules';
      for (let dir = path.dirname(binary); dir !== path.dirname(dir); dir = path.dirname(dir)) {
        const root = path.join(dir, modules, PKG[engine]);
        if (binary.startsWith(root + path.sep) && fs.existsSync(path.join(root, 'package.json'))) return dir;
      }
    }
    return OutEnd.toolsDir();
  }

  protected static _pickRegistry(): Promise<string> {
    return RegistryPicker.pick();
  }

  protected static async _npmInstall(
    pkg: string,
    registry: string,
    prefix: string,
    onProgress?: UpdateProgress
  ): Promise<string> {
    try {
      return await this._spawnNpm(pkg, registry, prefix, onProgress);
    } catch (e) {
      // 用户自己配了私服就别乱换源：换了大概率也装不上，反而掩盖真正的错误
      if (RegistryPicker.configured()) throw e;
      const other = registry === MIRROR_REGISTRY ? OFFICIAL_REGISTRY : MIRROR_REGISTRY;
      Logger.info('EngineUpdater', 'retry with other registry', { from: registry, to: other });
      onProgress?.(`换源重试 / retrying with ${other}`);
      return this._spawnNpm(pkg, other, prefix, onProgress);
    }
  }

  // 全局安装最典型的失败是「全局目录没有写权限」（Linux/macOS 用系统 Node 时）。
  // npm 自己的报错很长，这里在最前面补一句人话，否则用户只能看到一堆 EACCES 路径。
  private static _permHint(tail: string): string {
    if (!/EACCES|EPERM|permission denied/i.test(tail)) return '';
    return '\n（无法写入应用工具目录，请检查目录权限后重试 / Check permissions for the application tools directory）';
  }

  private static _spawnNpm(
    pkg: string,
    registry: string,
    prefix: string,
    onProgress?: UpdateProgress
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32';
      const nodeDir = path.dirname(process.execPath);
      const npmCli = [path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
        path.join(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
        path.join(nodeDir, '../node_modules/npm/bin/npm-cli.js')].find(file => fs.existsSync(file));
      const cmd = npmCli ? process.execPath : isWin ? 'npm.cmd' : 'npm';
      const installArgs = ['install', '-g', `${pkg}@latest`, '--prefix', prefix,
        '--include=optional', `--registry=${registry}`, '--no-audit', '--no-fund'];
      const args = npmCli ? [npmCli, ...installArgs] : installArgs;
      Logger.info('EngineUpdater', 'npm install start', { cmd, args });
      const toolBin = isWin ? prefix : path.join(prefix, 'bin');
      const env = { ...process.env, PATH: [nodeDir, toolBin, process.env.PATH || ''].join(path.delimiter) };
      const child = spawn(cmd, args, { shell: !npmCli && isWin, windowsHide: true, env });
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
          if (!(process.env.PATH || '').split(path.delimiter).includes(toolBin)) process.env.PATH = toolBin + path.delimiter + (process.env.PATH || '');
          Logger.info('EngineUpdater', 'npm install done', { pkg, registry });
          resolve(tail || '(no output)');
        } else {
          reject(new Error(`npm 退出码 ${code}（源 ${registry}）:${this._permHint(tail)}\n${tail}`));
        }
      });
    });
  }
}
