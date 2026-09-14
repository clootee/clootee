// PATH 组装（业务无关）：把「内置运行时目录」放到 PATH 最前面，并清掉本工具此前注入的其他内置目录。
// 用途：用户选择「使用内置的 node / git / claude」时，spawn 出去的子进程（claude/codex 及它们
// 自己调用的命令）都能在 PATH 里先命中内置版本。
// 纯函数：只做字符串处理，不读配置、不碰 process.env。
import * as path from 'path';

export class ToolEnv {
  // basePath: 原始 PATH 字符串；managed: 本工具可能注入过的所有目录（会被先剔除）；
  // wanted: 本次要放到最前面的目录（按给定顺序）
  static compose(basePath: string, managed: string[], wanted: string[]): string {
    const sep = path.delimiter;
    const norm = (p: string) => path.resolve(p).toLowerCase();
    const managedSet = new Set(managed.map(norm));
    const kept = String(basePath || '')
      .split(sep)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !managedSet.has(norm(p)));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of [...wanted, ...kept]) {
      const k = norm(p);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out.join(sep);
  }
}
