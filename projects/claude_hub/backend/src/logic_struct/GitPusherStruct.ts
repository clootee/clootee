// git 一键提交推送（调度骨架）：校验 rootId → 取根目录路径 → 交给 realize 执行
import { RootManagerStruct } from './RootManagerStruct';

export interface GitPushResult {
  ok: boolean;
  output: string;
}

export class GitPusherStruct {
  // 对指定根目录执行 git add . / commit -m 1 / push
  static push(rootId: string): GitPushResult {
    if (!rootId) throw new Error(`push: invalid rootId=${rootId}`);
    const root = RootManagerStruct.getRoot(rootId);
    return this._runGitPush(root.path);
  }

  // 实际执行 git 命令序列（实现细节交 realize）
  protected static _runGitPush(_dirPath: string): GitPushResult {
    throw new Error('Not implemented');
  }
}
