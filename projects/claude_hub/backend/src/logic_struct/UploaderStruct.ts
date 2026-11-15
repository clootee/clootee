// 文件上传调度骨架：把上传的文件写入"会话根目录下的 tmp/"。
// 仅做调度与非法校验；实际落盘（建目录/文件名清洗/防重名/写入）在 Realize。
import { SessionManager } from '../logic_realize/SessionManager';
import { RootManager } from '../logic_realize/RootManager';
import { MultiEngine } from '../logic_realize/MultiEngine';

export interface UploadResult {
  name: string;   // 最终保存的文件名（可能因防重名带后缀）
  rel: string;    // 相对根目录的路径（统一用 / 分隔，如 tmp/foo.png）
  absolutePath: string; // 实际落盘位置，供多引擎跨工作目录引用
  sizeKb: number;
}

export class UploaderStruct {
  // 多引擎共享父项目 tmp；单引擎仍使用会话根目录 tmp。
  static save(sessionId: string, filename: string, data: Buffer): UploadResult {
    if (!sessionId) throw new Error(`Uploader.save: invalid sessionId=${sessionId}`);
    if (!filename || !filename.trim()) throw new Error(`Uploader.save: invalid filename=${filename}`);
    if (!data || data.length === 0) throw new Error('Uploader.save: empty file data');
    const session = SessionManager.getSession(sessionId);
    const root = RootManager.getRoot(MultiEngine.decorate(session).multiRootId || session.rootId);
    return this._writeToTmp(root.path, filename, data);
  }

  // ── 实现钩子（realize）──
  protected static _writeToTmp(_rootPath: string, _filename: string, _data: Buffer): UploadResult {
    throw new Error('Not implemented');
  }
}
