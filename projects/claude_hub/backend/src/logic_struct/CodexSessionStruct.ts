// Codex 原生会话解析调度骨架：把 ~/.codex/sessions 下的 rollout JSONL 解析成 hub 的 Session 形态。
// 与 NativeSessionStruct（claude）对称。跨平台定位与读取全经 CodexStoreHelper。
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { SignatureCache } from '../helper/SignatureCache';
import { Session, Message } from '../models/Types';

export class CodexSessionStruct {
  // 元信息缓存：键=rollout 文件路径，签名=mtime+大小。与 claude 侧同一个理由——
  // 会话列表一次要读上百个 rollout，每个都全文重扫会让列表和打开会话都卡上十几秒。
  private static _metaCache = new SignatureCache<Session>(400);

  // 列出某工作目录下所有 codex 会话（轻量元信息，不载入全文）
  static metas(absPath: string, rootId: string, homeDir?: string): Session[] {
    if (!absPath) throw new Error(`CodexSession.metas: invalid absPath=${absPath}`);
    if (!rootId) throw new Error(`CodexSession.metas: invalid rootId=${rootId}`);
    return CodexStoreHelper.listByCwd(absPath, homeDir).map((f) =>
      this._metaCached(rootId, f.sessionId, f.file, f.mtimeMs, f.size, f.createdAt),
    );
  }

  // 单个会话轻量元信息；文件不存在抛错
  static metaOne(rootId: string, uuid: string, homeDir?: string): Session {
    if (!uuid) throw new Error(`CodexSession.metaOne: invalid uuid=${uuid}`);
    const f = CodexStoreHelper.findFile(uuid, homeDir);
    if (!f) throw new Error(`CodexSession.metaOne: not found uuid=${uuid}`);
    return this._metaCached(rootId, uuid, f.file, f.mtimeMs, f.size, f.createdAt);
  }

  // 载入单个会话全文消息（供展示）
  static importMessages(uuid: string, homeDir?: string): Message[] {
    if (!uuid) throw new Error(`CodexSession.importMessages: invalid uuid=${uuid}`);
    const f = CodexStoreHelper.findFile(uuid, homeDir);
    if (!f) return [];
    return this._parseMessages(CodexStoreHelper.readLines(f.file), uuid);
  }

  // 元信息：签名（mtime+大小）不变即复用缓存；命中返回浅拷贝，避免调用方就地改动污染缓存
  private static _metaCached(
    rootId: string,
    uuid: string,
    file: string,
    mtimeMs: number,
    size: number,
    createdAt: number,
  ): Session {
    const sig = `${mtimeMs}:${size}`;
    const hit = this._metaCache.get(file, sig);
    if (hit) return { ...hit };
    return this._metaCache.set(file, sig, this._meta(rootId, uuid, file, mtimeMs, size, createdAt));
  }

  // ── 实现钩子（realize 填充）──
  protected static _meta(
    _rootId: string,
    _uuid: string,
    _file: string,
    _mtimeMs: number,
    _size: number,
    _createdAt: number,
  ): Session {
    throw new Error('Not implemented');
  }

  protected static _parseMessages(_lines: string[], _uuid: string): Message[] {
    throw new Error('Not implemented');
  }
}
