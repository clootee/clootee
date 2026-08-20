// git 一键提交推送（实现）：依次执行 add / commit / push，commit 无变更时不视为失败
import { execFileSync } from 'child_process';
import { GitPusherStruct, GitPushResult } from '../logic_struct/GitPusherStruct';
import { GitBin } from '../helper/GitBin';

export class GitPusher extends GitPusherStruct {
  protected static _runGitPush(dirPath: string): GitPushResult {
    const steps: Array<[string, string[]]> = [
      ['add', ['add', '.']],
      ['commit', ['commit', '-m', '1']],
      ['push', ['push']],
    ];
    const lines: string[] = [];
    let failed = false;
    // 系统没装 git 时用 out_end 内置便携版（install --with-git 装的）
    const git = GitBin.find();
    if (!git) {
      return {
        ok: false,
        output:
          '[git] FAILED: 未找到 git —— 请安装 git，或运行 install 脚本时加 --with-git 自动下载便携版',
      };
    }
    for (const [label, args] of steps) {
      try {
        const out = execFileSync(git, args, { cwd: dirPath, encoding: 'utf-8' });
        lines.push(`[${label}] ${out.trim() || 'ok'}`);
      } catch (e: unknown) {
        const err = e as { stdout?: string; stderr?: string; message?: string };
        const msg = (err.stderr || err.stdout || err.message || String(e)).trim();
        if (label === 'commit' && /nothing to commit/i.test(msg)) {
          lines.push('[commit] nothing to commit');
          continue;
        }
        lines.push(`[${label}] FAILED: ${msg}`);
        failed = true;
        break;
      }
    }
    return { ok: !failed, output: lines.join('\n') };
  }
}
