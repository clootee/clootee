// 引擎安装/更新（实现）：spawn `npm install -g`。跨平台：Windows 用 npm.cmd(shell)，其余用 npm。
// npm 源由 RegistryPicker 决定（用户配置 > 竞速最快 > 官方），首选源失败时自动换另一个公共源重试一次。
// 安装到应用可写的 out_end/tools，复用启动安装器的位置，不需要写系统全局目录。
import { promisify } from 'util';
import { spawn, execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { OutEnd } from '../helper/OutEnd';
import { ClaudeBin } from '../helper/ClaudeBin';
import { CodexBin } from '../helper/CodexBin';
import { AppConfig } from '../config/AppConfig';
import { EngineUpdaterStruct, UpdateProgress } from '../logic_struct/EngineUpdaterStruct';
import { Logger } from '../helper/Logger';
import { RegistryPicker, OFFICIAL_REGISTRY, MIRROR_REGISTRY } from '../helper/RegistryPicker';

export class EngineAuthDenied extends Error {}
export class EngineWriteDenied extends Error {}

export class EngineUpdater extends EngineUpdaterStruct {
  private static permissionFailures = new Map<string, number>();

  static async requestUpdate(engine: string, auth: { username: string; password: string } | undefined, progress: UpdateProgress) {
    if (engine !== 'claude' && engine !== 'codex') throw new Error('无效的引擎');
    if (auth) {
      if (process.platform !== 'linux' || (this.permissionFailures.get(engine) || 0) < Date.now())
        throw new Error('请先尝试普通更新');
      await this.prepareInstallDir(auth.username, auth.password);
    }
    try {
      const result = await this.update(engine, progress);
      this.permissionFailures.delete(engine);
      return result;
    } catch (error) {
      if (error instanceof EngineWriteDenied && process.platform === 'linux') {
        if (OutEnd.installDir() !== OutEnd.toolsDir())
          throw new Error(`管理员安装目录仍不可写：${error.message}`);
        if (process.getuid!() === 0) {
          await promisify(execFile)('/usr/bin/install', this.directoryArgs(), { cwd: '/' });
          return this.update(engine, progress);
        }
        this.permissionFailures.set(engine, Date.now() + 300000);
      }
      throw error;
    }
  }

  private static directoryArgs(): string[] {
    return ['-d', '-m', '0755', '-o', String(process.getuid!()), '-g', String(process.getgid!()), OutEnd.adminToolsDir()];
  }

  private static prepareInstallDir(username: string, password: string): Promise<void> {
    if (typeof username !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(username)
        || typeof password !== 'string' || !password || password.length > 1024 || /[\r\n\0]/.test(password))
      throw new Error('请输入有效的服务器用户名和密码');
    // Only system binaries and server-derived numeric IDs/paths enter this command.
    const command = ['/usr/bin/install', ...this.directoryArgs()].join(' ');
    const script = username === 'root' ? command : `exec /usr/bin/sudo -k -S -p 'CLOOTEE_SUDO:' -- ${command}`;
    return new Promise((resolve, reject) => {
      const child = spawn('/usr/bin/su', ['-s', '/bin/sh', '-c', script, '--', username], {
        cwd: '/', detached: true, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' }, stdio: ['pipe', 'ignore', 'pipe'],
      });
      let pending = '';
      const prompts = new Set<string>();
      const timer = setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 30000);
      child.stdin.on('error', () => {});
      child.stderr.on('data', data => {
        pending = (pending + data.toString()).slice(-512);
        for (const prompt of ['Password:', 'CLOOTEE_SUDO:']) {
          if (!pending.includes(prompt)) continue;
          if (prompts.has(prompt)) child.stdin.end();
          else { prompts.add(prompt); child.stdin.write(password + '\n'); }
          pending = '';
        }
      });
      child.on('error', () => { clearTimeout(timer); reject(new Error('启动系统授权工具 su 失败')); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new EngineAuthDenied('服务器授权失败，请检查账号密码及 sudo 权限后重试'));
      });
    });
  }

  protected static _verify(engine: string): Promise<string> {
    const launcher = process.platform === 'win32' ? `${engine}.cmd` : path.join('bin', engine);
    if (!fs.existsSync(path.join(OutEnd.installDir(), launcher)))
      return Promise.reject(new Error(`${engine} 更新后缺少启动文件 ${launcher}`));
    const resolved = engine === 'claude'
      ? ClaudeBin.resolve(AppConfig.CLAUDE_BIN, true)
      : CodexBin.resolve(AppConfig.CODEX_BIN, true);
    return new Promise((resolve, reject) => {
      execFile(resolved.bin, [...resolved.prefixArgs, '--version'],
        { windowsHide: true, timeout: 30000 }, (error, stdout) => {
          if (error || !String(stdout).trim()) reject(new Error(`${engine} 安装后运行检查失败 / executable verification failed: ${error?.message || 'empty version'}`));
          else resolve(String(stdout).trim().split(/\r?\n/)[0]);
        });
    });
  }

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
      if (e instanceof EngineWriteDenied || RegistryPicker.configured()) throw e;
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
    return '\n（无法写入应用工具目录，请检查目录权限后重试 / Check permissions for the application tools directory）';
  }

  private static _spawnNpm(
    pkg: string,
    registry: string,
    onProgress?: UpdateProgress
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32';
      const nodeDir = path.dirname(process.execPath);
      const npmCli = [path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
        path.join(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
        path.join(nodeDir, '../node_modules/npm/bin/npm-cli.js')].find(file => fs.existsSync(file));
      const cmd = npmCli ? process.execPath : isWin ? 'npm.cmd' : 'npm';
      const prefix = OutEnd.installDir();
      const installArgs = ['install', '-g', `${pkg}@latest`, '--prefix', prefix,
        '--include=optional', `--registry=${registry}`, '--no-audit', '--no-fund'];
      if (process.platform === 'linux' && prefix !== OutEnd.toolsDir())
        installArgs.push('--cache', path.join(prefix, '.npm-cache'));
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
          const Failure = /\b(?:EACCES|EPERM|EROFS)\b|permission denied/i.test(out) ? EngineWriteDenied : Error;
          reject(new Failure(`npm 退出码 ${code}（源 ${registry}）:${this._permHint(tail)}\n${tail}`));
        }
      });
    });
  }
}
