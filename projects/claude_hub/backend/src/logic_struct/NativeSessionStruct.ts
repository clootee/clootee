// Claude Code 原生会话（终端里直接对 claude 的对话）解析调度骨架。
// 把 ~/.claude/projects/<编码目录>/<uuid>.jsonl 解析成 hub 的 Session 形态，便于统一展示/续接。
// 跨平台：定位与读取全部经 ClaudeStoreHelper（os.homedir + path.join），不依赖任一平台。
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { SignatureCache } from '../helper/SignatureCache';
import { Session, Message } from '../models/Types';

export class NativeSessionStruct {
  // 元信息缓存：键=jsonl 绝对路径，签名=mtime+大小。文件没变就直接复用上次解析结果
  // —— 会话列表一次要读几百个文件（合计 400MB+），每次都重扫是列表卡死的根因。
  private static _metaCache = new SignatureCache<Session>(400);

  // 列出某工作目录下所有原生会话（轻量元信息：标题/时间，不载入全文消息）
  // homeDir：RunAsUser 切了运行身份时，claude 实际落盘的家目录（与当前进程自己的 home 不同）。
  static metas(absPath: string, rootId: string, homeDir?: string): Session[] {
    if (!absPath) throw new Error(`NativeSession.metas: invalid absPath=${absPath}`);
    if (!rootId) throw new Error(`NativeSession.metas: invalid rootId=${rootId}`);
    return ClaudeStoreHelper.listSessionFiles(absPath, homeDir).map((f) =>
      this._metaCached(rootId, f.sessionId, f.file, f.mtimeMs, f.size),
    );
  }

  // 单个会话的轻量元信息（标题/时间，不含全文消息）。文件不存在抛错。
  static metaOne(absPath: string, rootId: string, uuid: string, homeDir?: string): Session {
    if (!absPath) throw new Error(`NativeSession.metaOne: invalid absPath=${absPath}`);
    if (!uuid) throw new Error(`NativeSession.metaOne: invalid uuid=${uuid}`);
    const file = ClaudeStoreHelper.sessionFile(absPath, uuid, homeDir);
    const st = ClaudeStoreHelper.stat(file);
    if (!st) throw new Error(`NativeSession.metaOne: not found uuid=${uuid}`);
    return this._metaCached(rootId, uuid, file, st.mtimeMs, st.size);
  }

  // 载入单个原生会话全文（解析为最终消息列表，供只读查看）
  static full(absPath: string, rootId: string, uuid: string, homeDir?: string): Session {
    if (!absPath) throw new Error(`NativeSession.full: invalid absPath=${absPath}`);
    if (!uuid) throw new Error(`NativeSession.full: invalid uuid=${uuid}`);
    const file = ClaudeStoreHelper.sessionFile(absPath, uuid, homeDir);
    const st = ClaudeStoreHelper.stat(file);
    const session = this._metaCached(rootId, uuid, file, st?.mtimeMs || 0, st?.size || 0);
    session.messages = this._parseMessages(ClaudeStoreHelper.readLines(file), uuid);
    return session;
  }

  // 接管时使用：解析为可直接存入 hub 会话的消息数组
  static importMessages(absPath: string, uuid: string, homeDir?: string): Message[] {
    if (!absPath) throw new Error(`NativeSession.importMessages: invalid absPath=${absPath}`);
    if (!uuid) throw new Error(`NativeSession.importMessages: invalid uuid=${uuid}`);
    const file = ClaudeStoreHelper.sessionFile(absPath, uuid, homeDir);
    return this._parseMessages(ClaudeStoreHelper.readLines(file), uuid);
  }

  // 元信息：先查缓存（签名不变即复用），未命中才委托 realize 解析。
  // 命中时返回浅拷贝——调用方（如 full()）会往对象上挂 messages，不能污染缓存里那份。
  private static _metaCached(rootId: string, uuid: string, file: string, mtimeMs: number, size: number): Session {
    const sig = `${mtimeMs}:${size}`;
    const hit = this._metaCache.get(file, sig);
    if (hit) return { ...hit };
    return this._metaCache.set(file, sig, this._meta(rootId, uuid, file, mtimeMs, size));
  }

  // ── 实现钩子（realize 填充）──
  // 由单个会话文件构造 Session 元信息（不含 messages）。size 供实现判断是否需要读全文
  protected static _meta(
    _rootId: string,
    _uuid: string,
    _file: string,
    _mtimeMs: number,
    _size: number,
  ): Session {
    throw new Error('Not implemented');
  }

  // 把 JSONL 行解析为最终消息（仅纯文本，忽略 thinking/tool 过程帧）
  protected static _parseMessages(_lines: string[], _uuid: string): Message[] {
    throw new Error('Not implemented');
  }
}
