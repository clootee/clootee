// 会话管理（调度骨架）。
// 核心原则：hub 不再持久化任何会话/消息——唯一数据源是 Claude Code 自己的 jsonl（~/.claude/projects）。
// 列表 = 扫描 jsonl 得到的会话；运行期状态（任务队列 / 暂停）只活在内存里（_live，由 realize 持有），后端重启即清空。
// 会话 id = `<rootId>:<claude uuid>`；尚未开始的新会话草稿为 `<rootId>:draft-<rand>`（纯内存）。
import { Ids } from '../helper/Ids';
import { Logger } from '../helper/Logger';
import { AppConfig } from '../config/AppConfig';
import { SessionMeta } from '../logic_realize/SessionMeta';
import { SessionStatus } from './SessionMetaStruct';
import { Session, Task, Message, Engine, SessionSearchHit } from '../models/Types';

export class SessionManagerStruct {
  // 列出某根目录下的会话 = claude jsonl 会话 + 内存中的运行期会话（草稿 / 带队列的）。
  // 已开始的会话以 jsonl 元信息为准（标题/时间），叠加内存里的队列与暂停状态；草稿单独列出。
  static listSessions(rootId: string): Session[] {
    if (!rootId) throw new Error(`listSessions: invalid rootId=${rootId}`);
    // 两个引擎的原生会话合并：claude jsonl + codex rollout，id 均为 `rootId:uuid`（uuid 命名空间不相交）
    const metas = [...this._nativeMetas(rootId), ...this._codexMetas(rootId)];
    const live = this._all().filter((s) => s.rootId === rootId);
    const liveByUuid = new Map<string, Session>();
    for (const s of live) if (s.claudeSessionId) liveByUuid.set(s.claudeSessionId, s);

    const out: Session[] = [];
    const usedIds = new Set<string>();
    for (const m of metas) {
      const l = liveByUuid.get(m.claudeSessionId);
      // jsonl 为准（标题/时间），叠加运行期队列与暂停。
      // id 一律用会话自然 id（`rootId:uuid`，即 m.id），仅当运行期会话仍是草稿（id 含 draft-）
      // 才沿用其草稿 id 以保持首跑前后前端选中不丢。绝不把别的 uuid 套用运行期 id，
      // 否则一旦 claudeSessionId 被 reconcile 改写（如 SDK 会话 resume 产生新 id），
      // 两个 meta 会共用一个 id → 列表"分裂"（点一个两个都高亮）。
      const useLiveId = !!l && l.id.includes(':draft-');
      const row = l ? { ...m, id: useLiveId ? l.id : m.id, tasks: l.tasks, paused: l.paused } : m;
      out.push(row);
      usedIds.add(row.id);
    }
    // 内存会话里 jsonl 还没出现的：草稿（无 uuid）或 jsonl 尚未落盘的新会话
    for (const l of live) {
      if (l.claudeSessionId && metas.some((m) => m.claudeSessionId === l.claudeSessionId)) continue;
      if (usedIds.has(l.id)) continue; // 防御：绝不输出重复 id
      out.push({ ...l, messages: [] });
      usedIds.add(l.id);
    }
    return this._withMeta(out).sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }

  // 工作台模式：合并列出所有根目录下的会话（跨目录同时展示）。
  // 每个会话自带 rootId，前端据此显示所属目录名。排序：置顶优先、其后按更新时间倒序。
  static listAllSessions(): Session[] {
    const out: Session[] = [];
    for (const rootId of this._rootIds()) {
      try {
        out.push(...this.listSessions(rootId));
      } catch {
        /* 单个根目录异常（已删等）跳过，不影响其余 */
      }
    }
    return out.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  }

  // 全文搜索：跨会话在「标题 + 全部对话正文」里找关键词。
  // 前端只加载当前打开会话的正文，故全文搜索必须走后端逐会话读 jsonl。
  // rootId 传入 = 只搜该根目录（经典模式）；缺省 = 跨全部根目录（工作台模式）。
  static searchSessions(query: string, rootId?: string): SessionSearchHit[] {
    const q = (query || '').trim().toLowerCase();
    if (!q) throw new Error(`searchSessions: invalid query=${query}`);
    const candidates = rootId ? this.listSessions(rootId) : this.listAllSessions();
    const hits: SessionSearchHit[] = [];
    for (const s of candidates) {
      const hit = this._matchSessionText(s, q);
      if (hit) hits.push(hit);
    }
    return hits;
  }

  // 叠加置顶/状态标记（hub 自己的标注，不属于 jsonl）
  // 读取键与写入键一致，都走「规范键」；`meta[s.id]` 只作历史遗留（草稿键上的旧标注）兜底。
  private static _withMeta(sessions: Session[]): Session[] {
    const meta = SessionMeta.getAll();
    return sessions.map((s) => {
      const e = meta[this._canonicalKey(s)] || meta[s.id];
      return {
        ...s,
        pinned: !!e?.pinned,
        favorite: !!e?.favorite,
        status: e?.status || 'active',
        customTitle: e?.customTitle || '',
      };
    });
  }

  // 会话 meta 的「规范键」：拿到引擎 uuid 后一律用自然 id（`rootId:uuid`），尚是草稿才用草稿 id。
  // 同一个会话在首跑前后有两个可用 id（草稿 id 与自然 id，两者都能 getSession 到），
  // 若标注按调用方传来的 id 直接记账，就会给同一会话写出两条 meta —— 收藏夹遍历 meta 键，
  // 于是同一个会话出现两遍。故所有读写 meta 的入口统一收敛到这一个键。
  private static _canonicalKey(s: Session): string {
    return s.claudeSessionId ? `${s.rootId}:${s.claudeSessionId}` : s.id;
  }

  // 置顶 / 取消置顶（最多同时 3 个，超出时淘汰最早置顶的一个）
  static setPinned(id: string, pinned: boolean): Session {
    if (!id) throw new Error(`setPinned: invalid id=${id}`);
    SessionMeta.setPinned(this._canonicalKey(this.getSession(id)), pinned);
    return this.getSession(id);
  }

  // 收藏夹：遍历 meta 里被收藏的键。同一会话的草稿键与自然键可能都留有记录（历史数据），
  // 故按规范键去重，且优先保留自然 id 那条，避免同一个会话在列表里出现两遍。
  static listFavoriteSessions(): Session[] {
    const meta = SessionMeta.getAll();
    const ids = Object.keys(meta)
      .filter((k) => meta[k].favorite)
      .sort((a, b) => Number(a.includes(':draft-')) - Number(b.includes(':draft-')));
    const out: Session[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      const s = this._getSessionSafe(id); // 会话已删/根目录不可达 → 跳过这条陈旧收藏
      if (!s) continue;
      const key = this._canonicalKey(s);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (meta[b.id]?.favoriteAt || b.updatedAt) - (meta[a.id]?.favoriteAt || a.updatedAt);
    });
  }

  static setFavorite(id: string, favorite: boolean): Session {
    if (!id) throw new Error(`setFavorite: invalid id=${id}`);
    SessionMeta.setFavorite(this._canonicalKey(this.getSession(id)), favorite);
    return this.getSession(id);
  }

  // 手动标记状态：活跃 / 待测试 / 已完成，任意状态可直接互相切换
  static setStatus(id: string, status: SessionStatus): Session {
    if (!id) throw new Error(`setStatus: invalid id=${id}`);
    SessionMeta.setStatus(this._canonicalKey(this.getSession(id)), status);
    return this.getSession(id);
  }

  static setTitle(id: string, title: string): Session {
    if (!id) throw new Error(`setTitle: invalid id=${id}`);
    SessionMeta.setTitle(this._canonicalKey(this.getSession(id)), title);
    return this.getSession(id);
  }

  // 新建会话：仅创建一个内存草稿（不落盘、不自造 claude id）。
  // 发首条任务时不传 --session-id，让 claude 生成 uuid 后由 _reconcileSessionId 回写。
  static createSession(rootId: string, _name: string, engine?: Engine): Session {
    if (!rootId) throw new Error(`createSession: invalid rootId=${rootId}`);
    const eng: Engine = engine === 'codex' ? 'codex' : engine === 'claude' ? 'claude' : AppConfig.DEFAULT_ENGINE;
    const now = Date.now();
    const session: Session = {
      id: `${rootId}:draft-${Ids.short()}`,
      rootId,
      engine: eng,
      name: '',
      claudeSessionId: '', // 草稿：尚无 claude 会话
      paused: false,
      createdAt: now,
      updatedAt: now,
      tasks: [],
      messages: [],
      source: 'empty', // 草稿尚无对话
    };
    this._put(session);
    return session;
  }

  // 设置草稿会话的引擎（仅在会话尚未开始时允许：无 claudeSessionId 且无任务）。
  // 一旦开始（有引擎会话 id 或已入队任务）即锁定，拒绝修改。
  static setEngine(id: string, engine: Engine): Session {
    if (!id) throw new Error(`setEngine: invalid id=${id}`);
    if (engine !== 'claude' && engine !== 'codex') throw new Error(`setEngine: invalid engine=${engine}`);
    const session = this.getSession(id);
    if (session.claudeSessionId || (session.tasks && session.tasks.length > 0))
      throw new Error('setEngine: session already started, engine locked');
    session.engine = engine;
    this.saveSession(session);
    return session;
  }

  // 读取会话元信息（不含正文）。优先内存运行期会话；否则由 id 解析出 uuid 从 jsonl 构造。
  static getSession(id: string): Session {
    if (!id) throw new Error(`getSession: invalid id=${id}`);
    // 先精确按运行期表键取；miss 再按自然 id 兜底（reconcile 后键与自然 id 分叉时仍能拿到任务队列）
    const live = this._get(id) || this._getLiveByNaturalId(id);
    const base = live ? this._hydrateLiveMeta(live, id) : this._buildMeta(id); // 从 claude jsonl 构造（无运行期状态）
    if (!base) throw new Error(`getSession: not found, id=${id}`);
    return this._withMeta([base])[0];
  }

  // wantId = 调用方索取的 id（收藏夹/单会话按自然 id 索取）。返回会话统一用 wantId，
  // 避免兜底命中草稿键 live 时把返回 id 退回草稿 id（会丢失收藏标记与前端选中）。
  private static _hydrateLiveMeta(live: Session, wantId: string): Session {
    if (!live.claudeSessionId) return { ...live, id: wantId };
    const meta = this._buildMeta(`${live.rootId}:${live.claudeSessionId}`);
    if (!meta) return { ...live, id: wantId };
    return {
      ...meta,
      id: wantId,
      rootId: live.rootId,
      engine: live.engine || meta.engine,
      claudeSessionId: live.claudeSessionId,
      paused: live.paused,
      tasks: live.tasks,
      messages: live.messages || [],
    };
  }

  // 读取会话 + 正文（正文实时从 claude jsonl 解析，单一数据源）。供前端展示使用。
  static getSessionFull(id: string): Session {
    const session = this.getSession(id);
    session.messages = this._loadMessages(session);
    return session;
  }

  // 保存会话 = 写入内存运行期表（不落盘）。任何获得运行期状态（入队/暂停/回写 uuid）的会话都经此进入 _live。
  static saveSession(session: Session): void {
    if (!session || !session.id) throw new Error('saveSession: invalid session');
    session.updatedAt = Date.now();
    this._put(session);
  }

  // 删除会话：删除其对应的 claude jsonl（真正生效，不会再以"原生会话"冒出来）并清掉内存运行期。
  static removeSession(id: string): void {
    if (!id) throw new Error(`removeSession: invalid id=${id}`);
    const s = this._getSessionSafe(id); // 必须先取：删完 jsonl / 运行期后就推不出规范键了
    this._removeJsonl(id);
    this._del(id);
    SessionMeta.remove(id);
    if (s) SessionMeta.remove(this._canonicalKey(s)); // 顺带清掉另一个 id 上的历史标注
  }

  // 批量删除会话：逐个删除，单个失败不影响其余（迭代与容错细节交 realize）
  static removeSessions(ids: string[]): { removed: string[]; failed: string[] } {
    if (!Array.isArray(ids) || ids.length === 0)
      throw new Error(`removeSessions: invalid ids=${JSON.stringify(ids)}`);
    return this._removeMany(ids.filter((x) => !!x));
  }

  // ── 启动恢复：把上次持久化的运行期队列载入内存 ──────────────────────
  // 进程重启后 _live 为空 → 任务队列全丢。此处读回快照并规整：
  // 中断的 running 任务（其子进程已随重启消失）标记为 stopped，不自动重跑（避免重复执行）；
  // pending/held/已完成任务原样保留。返回恢复出的会话，供调度层决定是否继续 pending。
  static restorePersisted(): Session[] {
    const saved = this._readPersisted();
    const restored: Session[] = [];
    for (const s of saved) {
      if (!s || !s.id) continue;
      const tasks = (s.tasks || []).map((t) =>
        t.status === 'running'
          ? { ...t, status: 'stopped' as const, finishedAt: t.finishedAt || Date.now(), error: t.error || '服务重启中断' }
          : t,
      );
      const session: Session = { ...s, tasks, messages: [] };
      this._put(session);
      restored.push(session);
    }
    this._normalizeMeta(restored);
    return restored;
  }

  // 历史数据修复：把还记在草稿 id 上的标注并回规范键（migrate 自带合并：收藏/置顶取或、时间取大）。
  // 这些草稿键是「_reconcileSessionId 已把 meta 迁到自然 id，之后又在列表里按草稿 id 写了一次」留下的，
  // 不并掉的话收藏夹里同一会话会出现两条。
  private static _normalizeMeta(sessions: Session[]): void {
    let merged = 0;
    for (const s of sessions) {
      const key = this._canonicalKey(s);
      if (key === s.id) continue;
      if (SessionMeta.migrate(s.id, key)) merged++;
    }
    if (merged) Logger.info('SessionManager', `_normalizeMeta: 合并重复会话标注 ${merged} 条`);
  }

  // 取会话中的某个任务
  static getTask(sessionId: string, taskId: string): Task {
    const task = this.getSession(sessionId).tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`getTask: not found, session=${sessionId} task=${taskId}`);
    return task;
  }

  // ── 运行期存储钩子（realize 用内存 Map 实现）──
  protected static _get(_id: string): Session | null {
    throw new Error('Not implemented');
  }
  // 按会话「自然 id」（`rootId:claudeSessionId`）在内存表里兜底匹配。
  // _live 以会话最初 id（草稿 id / 首个 uuid）为键，reconcile 换 uuid 后键与自然 id 分叉，
  // 精确 _get(自然id) 会 miss；收藏夹/单会话读取按自然 id 索取，故需此兜底拿到运行期任务。
  protected static _getLiveByNaturalId(_id: string): Session | null {
    throw new Error('Not implemented');
  }
  // getSession 的安全版：会话已删 / 根目录不可达时返回 null 而非抛错（收藏夹遍历、删除取规范键用）
  protected static _getSessionSafe(_id: string): Session | null {
    throw new Error('Not implemented');
  }
  protected static _put(_session: Session): void {
    throw new Error('Not implemented');
  }
  protected static _del(_id: string): void {
    throw new Error('Not implemented');
  }
  protected static _all(): Session[] {
    throw new Error('Not implemented');
  }
  // 读取上次持久化的运行期队列快照（无文件 / 损坏 → []）
  protected static _readPersisted(): Session[] {
    throw new Error('Not implemented');
  }

  // 全部根目录 id（工作台模式跨目录合并列表用），realize 经 RootManager 实现
  protected static _rootIds(): string[] {
    throw new Error('Not implemented');
  }

  // ── claude jsonl 解析钩子（realize 经 RootManager + NativeSession 实现）──
  // 某根目录下全部 claude 会话的轻量元信息
  protected static _nativeMetas(_rootId: string): Session[] {
    throw new Error('Not implemented');
  }
  // 某根目录下全部 codex 会话的轻量元信息
  protected static _codexMetas(_rootId: string): Session[] {
    throw new Error('Not implemented');
  }
  // 由会话 id 解析出 uuid，从 jsonl 构造元信息；草稿 / 文件不存在返回 null
  protected static _buildMeta(_id: string): Session | null {
    throw new Error('Not implemented');
  }
  // 从 claude jsonl 读取该会话正文（草稿 / 无文件返回 []）
  protected static _loadMessages(_session: Session): Message[] {
    throw new Error('Not implemented');
  }
  // 单个会话是否命中关键词（标题或正文）；命中返回 {id, snippet}，否则 null
  protected static _matchSessionText(_session: Session, _q: string): SessionSearchHit | null {
    throw new Error('Not implemented');
  }
  // 删除会话对应的 claude jsonl
  protected static _removeJsonl(_id: string): void {
    throw new Error('Not implemented');
  }

  // 批量删除的迭代 + 容错（realize 实现：逐个 removeSession，捕获单个异常记入 failed）
  protected static _removeMany(_ids: string[]): { removed: string[]; failed: string[] } {
    throw new Error('Not implemented');
  }
}
