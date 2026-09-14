// 在系统文件管理器中打开根目录（调度骨架）：校验 rootId → 取绝对路径 → 交给 realize 打开
import { RootManagerStruct } from './RootManagerStruct';

export interface FolderOpenResult {
  ok: boolean;
  path: string;
}

export class FolderOpenerStruct {
  // 在本机文件管理器中打开指定根目录（服务器本机行为，主要用于 Windows 本地运行）
  static open(rootId: string): FolderOpenResult {
    if (!rootId) throw new Error(`open: invalid rootId=${rootId}`);
    const root = RootManagerStruct.getRoot(rootId);
    this._openFolder(root.path);
    return { ok: true, path: root.path };
  }

  // 实际调用系统命令打开文件夹（跨平台实现交 realize）
  protected static _openFolder(_dirPath: string): void {
    throw new Error('Not implemented');
  }
}
