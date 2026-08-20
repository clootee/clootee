// 会话管理（实现）。运行期会话表 = 纯内存 Map（草稿 + 带队列/暂停的会话），不落盘。
// claude jsonl 相关钩子经 RootManager 定位根目录、NativeSession 解析。
import { SessionManagerStruct } from '../logic_struct/SessionManagerStruct';
import { NativeSession } from './NativeSession';
import { CodexSession } from './CodexSession';
import { RootManager } from './RootManager';
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { JsonStore } from '../helper/JsonStore';
import { Paths } from '../paths';
import { Session, Message, SessionSearchHit } from '../models/Types';

export class SessionManager extends SessionManagerStruct {
  // 运行期会话表：key = 会话 id（`rootId:uuid` 或 `rootId:draft-xxx`）。
  // 带任务/暂停态的会话另落盘（queue_state.json），进程重启后由 restorePersisted() 载回。
  private static _live = new Map<string, Session>();

  protected static _get(id: string): Session | null {
    return this._live.get(id) || null;
  }
  protected static _getLiveByNaturalId(id: string): Session | null {
    for (const s of this._live.values()) {
      if (s.claudeSessionId && `${s.rootId}:${s.claudeSessionId}` === id) return s;
    }
    return null;
  }
  protected static _getSessionSafe(id: string): Session | null {
    try {
      return this.getSession(id);
    } catch {
      return null;
    }
  }
  protected static _put(session: Session): void {
    this._live.set(session.id, session);
    this._persist();
  }
  protected static _del(id: string): void {
    this._live.delete(id);
    this._persist();
  }
  protected static _all(): Session[] {
    return [...this._live.values()];
  }

  protected static _readPersisted(): Session[] {
    try {
      return JsonStore.read<Session[]>(Paths.QUEUE_STATE_FILE, []);
    } catch {
      return [];
    }
  }

  // 持久化：只保存带运行期状态（有任务或已暂停）的会话，去掉正文（正文以 jsonl 为准）
  private static _persist(): void {
    try {
      const snap = [...this._live.values()]
        .filter((s) => (s.tasks && s.tasks.length > 0) || s.paused)
        .map((s) => ({ ...s, messages: [] }));
      JsonStore.write(Paths.QUEUE_STATE_FILE, snap);
    } catch {
      /* 持久化失败不影响主流程 */
    }
  }

  // 全部根目录 id（工作台模式跨目录合并列表用）
  protected static _rootIds(): string[] {
    return RootManager.listRoots().map((r) => r.id);
  }

  // 某根目录下的 claude jsonl 会话元信息（根目录已删等安全降级为空）
  protected static _nativeMetas(rootId: string): Session[] {
    try {
      const root = RootManager.getRoot(rootId);
      return NativeSession.metas(root.path, rootId);
    } catch {
      return [];
    }
  }

  protected static _codexMetas(rootId: string): Session[] {
    try {
      const root = RootManager.getRoot(rootId);
      return CodexSession.metas(root.path, rootId);
    } catch {
      return [];
    }
  }

  // 由会话 id（`rootId:uuid`）从 jsonl/rollout 构造元信息；先试 claude，再试 codex；草稿 / 无文件返回 null
  protected static _buildMeta(id: string): Session | null {
    const { rootId, uuid } = this._parseId(id);
    if (!uuid || this._isDraftPart(uuid)) return null;
    let root;
    try {
      root = RootManager.getRoot(rootId);
    } catch {
      return null;
    }
    try {
      return NativeSession.metaOne(root.path, rootId, uuid);
    } catch {
      /* 非 claude 会话，试 codex */
    }
    try {
      return CodexSession.metaOne(rootId, uuid);
    } catch {
      return null;
    }
  }

  // 会话正文：按引擎从对应存储解析（草稿 / 无文件 / 异常安全降级为 []）
  protected static _loadMessages(session: Session): Message[] {
    if (!session.claudeSessionId) return [];
    try {
      if (session.engine === 'codex') {
        return CodexSession.importMessages(session.claudeSessionId);
      }
      const root = RootManager.getRoot(session.rootId);
      return NativeSession.importMessages(root.path, session.claudeSessionId);
    } catch {
      return [];
    }
  }

  // 全文命中判定：先比标题/预览（免读 jsonl），未中再逐条读正文找首个命中并截取片段。
  protected static _matchSessionText(session: Session, q: string): SessionSearchHit | null {
    const titleHit =
      (session.customTitle || '').toLowerCase().includes(q) ||
      (session.name || '').toLowerCase().includes(q) ||
      (session.lastUser || '').toLowerCase().includes(q);
    if (titleHit) return { id: session.id, snippet: '' };
    for (const m of this._loadMessages(session)) {
      const body = (m.text || '').toLowerCase();
      const idx = body.indexOf(q);
      if (idx >= 0) return { id: session.id, snippet: this._snippetAround(m.text, idx, q.length) };
    }
    return null;
  }

  // 命中处上下文片段：前取 20、后取 30 字，折叠空白，两端按需补省略号
  private static _snippetAround(text: string, idx: number, len: number): string {
    const start = Math.max(0, idx - 20);
    const end = idx + len + 30;
    const raw = text.slice(start, end).replace(/\s+/g, ' ');
    return (start > 0 ? '…' : '') + raw + (end < text.length ? '…' : '');
  }

  // 删除会话对应的原生存储文件（按引擎）
  protected static _removeJsonl(id: string): void {
    const live = this._get(id);
    const { rootId, uuid } = this._parseId(id);
    const realUuid = live?.claudeSessionId || (this._isDraftPart(uuid) ? '' : uuid);
    if (!realUuid) return; // 草稿无文件
    const engine = live?.engine;
    try {
      if (engine === 'codex') {
        CodexStoreHelper.removeSessionFile(realUuid);
        return;
      }
      if (engine === 'claude') {
        const root = RootManager.getRoot(rootId);
        ClaudeStoreHelper.removeSessionFile(root.path, realUuid);
        return;
      }
      // 引擎未知（非 live，从 id 无法判定）：两边都尝试删，命中即止
      try {
        const root = RootManager.getRoot(rootId);
        ClaudeStoreHelper.removeSessionFile(root.path, realUuid);
      } catch {
        /* ignore */
      }
      CodexStoreHelper.removeSessionFile(realUuid);
    } catch {
      /* 根目录已删等：忽略 */
    }
  }

  // 批量删除：逐个 removeSession，单个抛错记入 failed 后继续，保证部分成功
  protected static _removeMany(ids: string[]): { removed: string[]; failed: string[] } {
    const removed: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      try {
        this.removeSession(id);
        removed.push(id);
      } catch {
        failed.push(id);
      }
    }
    return { removed, failed };
  }

  // 解析会话 id：`<rootId>:<uuid 或 draft-xxx>`（rootId 形如 root_xxx，不含冒号）
  private static _parseId(id: string): { rootId: string; uuid: string } {
    const i = id.indexOf(':');
    if (i < 0) return { rootId: id, uuid: '' };
    return { rootId: id.slice(0, i), uuid: id.slice(i + 1) };
  }

  private static _isDraftPart(part: string): boolean {
    return part.startsWith('draft-');
  }
}
