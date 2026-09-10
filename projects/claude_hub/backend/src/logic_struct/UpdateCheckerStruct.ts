// 软件版本更新（调度骨架）。
// 「有没有新版本」**只由版本清单 version.json 决定**——它是仓库根目录的一份 JSON，
// 托管在 GitHub 上按分支读取，规定版本号、是否强制更新、更新说明，是对外发版的唯一开关。
// git commit 对比（本地 HEAD vs GitHub 同名分支）只作为展示信息：告诉用户本地代码和远端
// 差了哪些提交。它**不参与**判定，否则开发机上任何一个未推送的本地提交都会被当成「有新版本」，
// 于是已经是最新版也照样弹窗、照样显示「拉取更新并重启」。
// 确认更新后拉取 + 触发重新编译与重启（脚本由 Realize 复用 restart.sh/restart.bat）。

export interface UpdateCommitInfo {
  sha: string;
  short: string;
  message: string;
  date: string; // ISO 8601
}

// version.json 的形状；字段全部可选，缺什么按「不强制、无说明」处理
export interface UpdateManifest {
  version: string;        // 最新发行版本号，如 "2.1.0"
  minVersion?: string;    // 低于此版本必须更新（强制）
  force?: boolean;        // 一刀切强制：true 时所有低版本用户都必须更新
  releasedAt?: string;    // ISO 8601
  notes?: string;         // 更新说明（单语言字符串，或 notesI18n 按语言取）
  notesI18n?: Record<string, string>;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;         // 清单里的版本号高于本机才为 true；清单不可用时恒为 false
  mandatory: boolean;         // true = 强制更新，前端弹不可关闭的窗
  commitDiffers: boolean;     // 本地 HEAD 与远端分支不同，仅供展示，不代表有新版本
  currentVersion: string;     // 本机正在跑的版本（backend/package.json）
  latestVersion: string;      // 清单里的最新版本；清单不可用时等于 currentVersion
  manifestOk: boolean;        // 清单是否成功读到（false 表示本次结论只来自 commit 兜底）
  notes: string;              // 更新说明，取不到为空串
  releasedAt: string;
  current: UpdateCommitInfo;
  latest: UpdateCommitInfo;
  branch: string;
  repoUrl: string;            // 供前端「查看改动」链接
  checkedAt: number;
}

export type UpdateProgress = (line: string) => void;

export interface UpdateApplyResult {
  ok: boolean;
  output: string;
}

export class UpdateCheckerStruct {
  // 对比本地与 GitHub：先读版本清单，再读远端 commit，两者交给 _decide 汇总成结论
  static async check(lang?: string): Promise<UpdateCheckResult> {
    const branch = this._currentBranch();
    const current = this._localCommit();
    const currentVersion = this._localVersion();
    const manifest = await this._remoteManifest(branch);
    const latest = await this._remoteCommit(branch);
    const verdict = this._decide(currentVersion, manifest, lang);
    return {
      hasUpdate: verdict.hasUpdate,
      mandatory: verdict.mandatory,
      commitDiffers: current.sha !== latest.sha,
      currentVersion,
      latestVersion: verdict.latestVersion,
      manifestOk: manifest !== null,
      notes: verdict.notes,
      releasedAt: verdict.releasedAt,
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
  protected static _localVersion(): string {
    throw new Error('UpdateCheckerStruct._localVersion: Not implemented');
  }
  protected static _remoteManifest(_branch: string): Promise<UpdateManifest | null> {
    throw new Error('UpdateCheckerStruct._remoteManifest: Not implemented');
  }
  protected static _remoteCommit(_branch: string): Promise<UpdateCommitInfo> {
    throw new Error('UpdateCheckerStruct._remoteCommit: Not implemented');
  }
  protected static _decide(
    _currentVersion: string,
    _manifest: UpdateManifest | null,
    _lang?: string,
  ): { hasUpdate: boolean; mandatory: boolean; latestVersion: string; notes: string; releasedAt: string } {
    throw new Error('UpdateCheckerStruct._decide: Not implemented');
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
