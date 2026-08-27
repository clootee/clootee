// 以指定系统用户身份运行子进程（业务无关）：Linux/macOS 下用 root 跑 claude/codex 常踩一个坑——
// 两者的免确认模式（claude 的 --dangerously-skip-permissions / bypassPermissions，codex 类似）
// 都明确拒绝在 root/sudo 下执行（安全考虑：全权限模式 + root 权限叠加风险太高）。
// 用 `sudo -H -u <user> --` 包一层，让子进程以普通用户身份跑，凭据/配置也落在该用户自己的家目录。
import * as fs from 'fs';
import * as path from 'path';

export interface RunAsUserConfig {
  enabled: boolean;
  user: string;
}

export class RunAsUser {
  // 只在「已启用 + 配了用户名 + 类 Unix + 当前确实是 root」时才包一层；
  // 任一条件不满足就原样返回，绝不在非必要场景强加 sudo（用户本来就是普通账号时没有这个问题）。
  static wrap(bin: string, args: string[], cfg: RunAsUserConfig | undefined | null): { bin: string; args: string[] } {
    if (!cfg || !cfg.enabled || !cfg.user || !cfg.user.trim()) return { bin, args };
    if (process.platform === 'win32') return { bin, args }; // Windows 没有对应机制，忽略
    if (typeof process.getuid !== 'function' || process.getuid() !== 0) return { bin, args }; // 不是 root，不需要切
    // 关键坑：claude/codex 在 Linux 下常是「裸命令名」（ClaudeBin/CodexBin 靠 PATH 查找，不落地绝对路径）。
    // sudo 解析「要执行哪个命令」这一步走的是它自己的 secure_path 策略，即使加了
    // --preserve-env=PATH 把 PATH 传进子进程环境，也救不了这一步的查找——实测两种都试过，
    // 唯一稳的办法是自己按当前进程的 PATH 把裸命令名解析成绝对路径，再交给 sudo。
    const resolvedBin = this._resolveOnPath(bin);
    // --preserve-env（不带值＝全部保留）：sudo 默认清空大部分环境变量，只留白名单里的少数几个。
    // 本工具的父进程环境里可能配了 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY 等出网代理（服务器直连
    // claude.com/api.anthropic.com 被墙时必需），不透传的话子进程会直接连不上、登录 403。
    // HOME 由 -H 单独控制、始终指向目标用户的家目录，不受 --preserve-env 影响，两者不冲突。
    return { bin: 'sudo', args: ['-H', '--preserve-env', '-u', cfg.user.trim(), '--', resolvedBin, ...args] };
  }

  // 把裸命令名按 process.env.PATH 解析成绝对路径；本来就是绝对路径或解析不到就原样返回
  // （解析不到的情况留给 sudo 自己报错，报错信息足够定位问题，不在这里吞掉）。
  private static _resolveOnPath(bin: string): string {
    if (path.isAbsolute(bin)) return bin;
    const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
      const candidate = path.join(dir, bin);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        /* 这个目录里没有，继续找下一个 */
      }
    }
    return bin;
  }
}
