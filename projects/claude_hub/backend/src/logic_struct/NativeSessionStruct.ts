// Claude Code 原生会话（终端里直接对 claude 的对话）解析调度骨架。
// 把 ~/.claude/projects/<编码目录>/<uuid>.jsonl 解析成 hub 的 Session 形态，便于统一展示/续接。
// 跨平台：定位与读取全部经 ClaudeStoreHelper（os.homedir + path.join），不依赖任一平台。
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { Session, Message } from '../models/Types';

export class NativeSessionStruct {
  // 列出某工作目录下所有原生会话（轻量元信息：标题/时间，不载入全文消息）
  static metas(absPath: string, rootId: string): Session[] {
    if (!absPath) throw new Error(`NativeSession.metas: invalid absPath=${absPath}`);
    if (!rootId) throw new Error(`NativeSession.metas: invalid rootId=${rootId}`);
    return ClaudeStoreHelper.listSessionFiles(absPath).map((f) =>
      this._meta(rootId, f.sessionId, f.file, f.mtimeMs),
    );
  }

  // 单个会话的轻量元信息（标题/时间，不含全文消息）。文件不存在抛错。
  static metaOne(absPath: string, rootId: string, uuid: string): Session {
    if (!absPath) throw new Error(`NativeSession.metaOne: invalid absPath=${absPath}`);
    if (!uuid) throw new Error(`NativeSession.metaOne: invalid uuid=${uuid}`);
    const file = ClaudeStoreHelper.sessionFile(absPath, uuid);
    if (!ClaudeStoreHelper.mtimeMs(file)) throw new Error(`NativeSession.metaOne: not found uuid=${uuid}`);
    return this._meta(rootId, uuid, file, ClaudeStoreHelper.mtimeMs(file));
  }

  // 载入单个原生会话全文（解析为最终消息列表，供只读查看）
  static full(absPath: string, rootId: string, uuid: string): Session {
    if (!absPath) throw new Error(`NativeSession.full: invalid absPath=${absPath}`);
    if (!uuid) throw new Error(`NativeSession.full: invalid uuid=${uuid}`);
    const file = ClaudeStoreHelper.sessionFile(absPath, uuid);
    const session = this._meta(rootId, uuid, file, ClaudeStoreHelper.mtimeMs(file));
    session.messages = this._parseMessages(ClaudeStoreHelper.readLines(file), uuid);
    return session;
  }

  // 接管时使用：解析为可直接存入 hub 会话的消息数组
  static importMessages(absPath: string, uuid: string): Message[] {
    if (!absPath) throw new Error(`NativeSession.importMessages: invalid absPath=${absPath}`);
    if (!uuid) throw new Error(`NativeSession.importMessages: invalid uuid=${uuid}`);
    const file = ClaudeStoreHelper.sessionFile(absPath, uuid);
    return this._parseMessages(ClaudeStoreHelper.readLines(file), uuid);
  }

  // ── 实现钩子（realize 填充）──
  // 由单个会话文件构造 Session 元信息（不含 messages）
  protected static _meta(
    _rootId: string,
    _uuid: string,
    _file: string,
    _mtimeMs: number,
  ): Session {
    throw new Error('Not implemented');
  }

  // 把 JSONL 行解析为最终消息（仅纯文本，忽略 thinking/tool 过程帧）
  protected static _parseMessages(_lines: string[], _uuid: string): Message[] {
    throw new Error('Not implemented');
  }
}
