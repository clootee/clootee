// 外设库定位（业务无关）：out_end/ 下的便携 node 与内置 claude code / codex。
// 约定（由 out_end/bootstrap 脚本产出）：
//   out_end/node/                 便携版 Node（Windows: node.exe 直接在此目录；Unix: bin/node）
//   out_end/tools/                npm --prefix 安装目标（Windows: claude.cmd/codex.cmd 直接在此；
//                                 node_modules 在 tools/node_modules。Unix: bin/claude、lib/node_modules）
// 所有方法返回真实存在的绝对路径或 null，从不抛错——未 bootstrap 时优雅返回 null，回退系统安装。
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Paths } from '../paths';

export class OutEnd {
  static dir(): string {
    return Paths.OUT_END_DIR;
  }

  static toolsDir(): string {
    return path.join(this.dir(), 'tools');
  }

  // A system administrator can provision a service-owned prefix outside a read-only installation.
  static adminToolsDir(): string {
    const instance = createHash('sha256').update(this.dir()).digest('hex').slice(0, 20);
    return `/var/lib/clootee-engines-${process.getuid!()}-${instance}`;
  }

  static installDir(): string {
    if (process.platform === 'linux' && fs.existsSync(this.adminToolsDir())) return this.adminToolsDir();
    return this.toolsDir();
  }

  static nodeDir(): string {
    return path.join(this.dir(), 'node');
  }

  // 便携版 git 根目录（Windows 放 MinGit，Unix 放解压后的 git）
  static gitDir(): string {
    return path.join(this.dir(), 'git');
  }

  // 内置 git 可执行文件（存在才返回）
  static gitExe(): string | null {
    const cands =
      process.platform === 'win32'
        ? [path.join(this.gitDir(), 'cmd', 'git.exe'), path.join(this.gitDir(), 'bin', 'git.exe')]
        : [path.join(this.gitDir(), 'bin', 'git')];
    for (const c of cands) if (fs.existsSync(c)) return c;
    return null;
  }

  // 需要放进 PATH 的内置目录（只返回真实存在的）
  static binDirs(tool: 'node' | 'git' | 'tools'): string[] {
    const win = process.platform === 'win32';
    const map: Record<string, string[]> = {
      node: win ? [this.nodeDir()] : [path.join(this.nodeDir(), 'bin')],
      git: win
        ? [path.join(this.gitDir(), 'cmd'), path.join(this.gitDir(), 'mingw64', 'bin')]
        : [path.join(this.gitDir(), 'bin')],
      tools: win ? [this.toolsDir()] : [path.join(this.toolsDir(), 'bin')],
    };
    if (tool === 'tools' && this.installDir() !== this.toolsDir())
      map.tools.unshift(path.join(this.installDir(), 'bin'));
    return map[tool].filter((d) => fs.existsSync(d));
  }

  // 所有可能被注入 PATH 的内置目录（切换偏好时据此先清理旧注入）
  static allBinDirs(): string[] {
    const win = process.platform === 'win32';
    return win
      ? [this.nodeDir(), path.join(this.gitDir(), 'cmd'), path.join(this.gitDir(), 'mingw64', 'bin'), this.toolsDir()]
      : [
          path.join(this.nodeDir(), 'bin'),
          path.join(this.gitDir(), 'bin'),
          path.join(this.toolsDir(), 'bin'),
        ];
  }

  // 便携版 node 可执行文件（供直接 spawn cli.js，或作为 npm 更新时的解释器）
  static nodeExe(): string | null {
    const win = path.join(this.nodeDir(), 'node.exe');
    const unix = path.join(this.nodeDir(), 'bin', 'node');
    if (process.platform === 'win32') return fs.existsSync(win) ? win : null;
    return fs.existsSync(unix) ? unix : null;
  }

  // 内置 claude 启动器（.cmd / bin 脚本）。用于解析出底层 cli.js。
  static claudeCmd(): string | null {
    return this._toolCmd('claude');
  }

  static codexCmd(): string | null {
    return this._toolCmd('codex');
  }

  // 内置某工具的 npm bin 启动器路径（存在才返回）。
  private static _toolCmd(name: string): string | null {
    const cands =
      process.platform === 'win32'
        ? [path.join(this.toolsDir(), `${name}.cmd`)]
        : [path.join(this.installDir(), 'bin', name), path.join(this.toolsDir(), 'bin', name)];
    for (const c of cands) if (fs.existsSync(c)) return c;
    return null;
  }

  static exists(): boolean {
    return fs.existsSync(this.dir());
  }
}
