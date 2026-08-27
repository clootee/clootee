// 以指定系统用户身份运行子进程（业务无关）：Linux/macOS 下用 root 跑 claude/codex 常踩一个坑——
// 两者的免确认模式（claude 的 --dangerously-skip-permissions / bypassPermissions，codex 类似）
// 都明确拒绝在 root/sudo 下执行（安全考虑：全权限模式 + root 权限叠加风险太高）。
// 用 `sudo -H -u <user> --` 包一层，让子进程以普通用户身份跑，凭据/配置也落在该用户自己的家目录。
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
    return { bin: 'sudo', args: ['-H', '-u', cfg.user.trim(), '--', bin, ...args] };
  }
}
