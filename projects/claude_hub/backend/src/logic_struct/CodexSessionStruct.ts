// Codex 原生会话解析调度骨架：把 ~/.codex/sessions 下的 rollout JSONL 解析成 hub 的 Session 形态。
// 与 NativeSessionStruct（claude）对称。跨平台定位与读取全经 CodexStoreHelper。
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { Session, Message } from '../models/Types';

export class CodexSessionStruct {
  // 列出某工作目录下所有 codex 会话（轻量元信息，不载入全文）
  static metas(absPath: string, rootId: string): Session[] {
    if (!absPath) throw new Error(`CodexSession.metas: invalid absPath=${absPath}`);
    if (!rootId) throw new Error(`CodexSession.metas: invalid rootId=${rootId}`);
    return CodexStoreHelper.listByCwd(absPath).map((f) =>
      this._meta(rootId, f.sessionId, f.file, f.mtimeMs, f.createdAt),
    );
  }

  // 单个会话轻量元信息；文件不存在抛错
  static metaOne(rootId: string, uuid: string): Session {
    if (!uuid) throw new Error(`CodexSession.metaOne: invalid uuid=${uuid}`);
    const f = CodexStoreHelper.findFile(uuid);
    if (!f) throw new Error(`CodexSession.metaOne: not found uuid=${uuid}`);
    return this._meta(rootId, uuid, f.file, f.mtimeMs, f.createdAt);
  }

  // 载入单个会话全文消息（供展示）
  static importMessages(uuid: string): Message[] {
    if (!uuid) throw new Error(`CodexSession.importMessages: invalid uuid=${uuid}`);
    const f = CodexStoreHelper.findFile(uuid);
    if (!f) return [];
    return this._parseMessages(CodexStoreHelper.readLines(f.file), uuid);
  }

  // ── 实现钩子（realize 填充）──
  protected static _meta(
    _rootId: string,
    _uuid: string,
    _file: string,
    _mtimeMs: number,
    _createdAt: number,
  ): Session {
    throw new Error('Not implemented');
  }

  protected static _parseMessages(_lines: string[], _uuid: string): Message[] {
    throw new Error('Not implemented');
  }
}
