// 软件版本更新（调度骨架）：本地 git HEAD 与 GitHub 上同名分支的最新 commit 对比，
// 有更新时前端提示用户确认，确认后拉取 + 触发重新编译与重启（脚本由 Realize 复用 restart.sh/restart.bat）。
// 「版本号」= git commit sha：本项目没有独立的发行版本号，提交即发布。

export interface UpdateCommitInfo {
  sha: string;
  short: string;
  message: string;
  date: string; // ISO 8601
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  current: UpdateCommitInfo;
  latest: UpdateCommitInfo;
  branch: string;
  repoUrl: string; // 供前端「查看改动」链接
  checkedAt: number;
}

export type UpdateProgress = (line: string) => void;

export interface UpdateApplyResult {
  ok: boolean;
  output: string;
}

export class UpdateCheckerStruct {
  // 对比本地与 GitHub 远端最新 commit
  static async check(): Promise<UpdateCheckResult> {
    const branch = this._currentBranch();
    const current = this._localCommit();
    const latest = await this._remoteCommit(branch);
    return {
      hasUpdate: current.sha !== latest.sha,
      current,
      latest,
      branch,
      repoUrl: this._repoUrl(),
      checkedAt: Date.now(),
    };
  }

  // 拉取最新代码并触发重新编译 + 重启；重启脚本会杀掉当前进程，因此这里不等重启跑完
  static async apply(onProgress?: UpdateProgress): Promise<UpdateApplyResult> {
    const pull = await this._pull(onProgress);
    if (!pull.ok) return pull;
    this._triggerRestart();
    return { ok: true, output: `${pull.output}\n[restart] 已触发重新编译与重启，请稍候刷新页面` };
  }

  // ── Realize 实现点 ──
  protected static _currentBranch(): string {
    throw new Error('UpdateCheckerStruct._currentBranch: Not implemented');
  }
  protected static _localCommit(): UpdateCommitInfo {
    throw new Error('UpdateCheckerStruct._localCommit: Not implemented');
  }
  protected static _remoteCommit(_branch: string): Promise<UpdateCommitInfo> {
    throw new Error('UpdateCheckerStruct._remoteCommit: Not implemented');
  }
  protected static _repoUrl(): string {
    throw new Error('UpdateCheckerStruct._repoUrl: Not implemented');
  }
  protected static _pull(_onProgress?: UpdateProgress): Promise<UpdateApplyResult> {
    throw new Error('UpdateCheckerStruct._pull: Not implemented');
  }
  protected static _triggerRestart(): void {
    throw new Error('UpdateCheckerStruct._triggerRestart: Not implemented');
  }
}
