export type SessionStatus = 'active' | 'testing' | 'completed';

const STATUSES: SessionStatus[] = ['active', 'testing', 'completed'];
const MAX_PINNED = 3;

export interface SessionMetaEntry {
  pinned: boolean;
  pinnedAt: number;
  favorite?: boolean;
  favoriteAt?: number;
  indexed?: boolean;       // 「全部目录」索引标记：本版本起新建的会话在创建时打上，避免全盘扫描
  indexedAt?: number;      // 打标时间（列表按它倒序兜底）
  status: SessionStatus;
  customTitle?: string;
}

export class SessionMetaStruct {
  static getAll(): Record<string, SessionMetaEntry> {
    return this._read();
  }

  static setPinned(id: string, pinned: boolean): void {
    if (!id) throw new Error(`setPinned: invalid id=${id}`);
    const all = this._read();
    const entry = all[id] || this._blank();
    if (pinned) {
      const pinnedIds = Object.keys(all).filter((k) => k !== id && all[k].pinned);
      if (pinnedIds.length >= MAX_PINNED) {
        const oldest = pinnedIds.sort((a, b) => all[a].pinnedAt - all[b].pinnedAt)[0];
        all[oldest] = { ...all[oldest], pinned: false, pinnedAt: 0 };
      }
      entry.pinned = true;
      entry.pinnedAt = Date.now();
    } else {
      entry.pinned = false;
      entry.pinnedAt = 0;
    }
    all[id] = entry;
    this._write(all);
  }

  static setFavorite(id: string, favorite: boolean): void {
    if (!id) throw new Error(`setFavorite: invalid id=${id}`);
    const all = this._read();
    const entry = all[id] || this._blank();
    entry.favorite = favorite;
    entry.favoriteAt = favorite ? Date.now() : 0;
    all[id] = entry;
    this._write(all);
  }

  // 建立「全部目录」索引标记。已标记过的不覆盖时间（保留首次建立索引的时刻）。
  static setIndexed(id: string, at: number): void {
    if (!id) throw new Error(`setIndexed: invalid id=${id}`);
    if (!at || at <= 0) throw new Error(`setIndexed: invalid at=${at}`);
    const all = this._read();
    const entry = all[id] || this._blank();
    if (entry.indexed && entry.indexedAt) return;
    entry.indexed = true;
    entry.indexedAt = at;
    all[id] = entry;
    this._write(all);
  }

  static setStatus(id: string, status: SessionStatus): void {
    if (!id) throw new Error(`setStatus: invalid id=${id}`);
    if (!STATUSES.includes(status)) throw new Error(`setStatus: invalid status=${status}`);
    const all = this._read();
    const entry = all[id] || this._blank();
    entry.status = status;
    all[id] = entry;
    this._write(all);
  }

  static setTitle(id: string, title: string): void {
    if (!id) throw new Error(`setTitle: invalid id=${id}`);
    const normalized = String(title || '').replace(/\s+/g, ' ').trim();
    if (normalized.length > 120) throw new Error('setTitle: title too long');
    const all = this._read();
    const entry = all[id] || this._blank();
    if (normalized) entry.customTitle = normalized;
    else delete entry.customTitle;
    all[id] = entry;
    this._write(all);
  }

  static remove(id: string): void {
    if (!id) throw new Error(`remove: invalid id=${id}`);
    const all = this._read();
    if (!(id in all)) return;
    delete all[id];
    this._write(all);
  }

  // 把 oldId 上的标注并入 newId（收藏/置顶取或、时间取大）并删掉 oldId。
  // 返回是否真的发生了迁移，供调用方统计/记录。
  static migrate(oldId: string, newId: string): boolean {
    if (!oldId) throw new Error(`migrate: invalid oldId=${oldId}`);
    if (!newId) throw new Error(`migrate: invalid newId=${newId}`);
    if (oldId === newId) return false;
    const all = this._read();
    const oldEntry = all[oldId];
    if (!oldEntry) return false;
    all[newId] = this._merge(all[newId], oldEntry);
    delete all[oldId];
    this._write(all);
    return true;
  }

  // 两个时间戳取「较早的非零值」；都为空则 0（索引时间代表首次建立索引的时刻，合并时不应变晚）
  private static _earliest(a?: number, b?: number): number {
    const list = [a, b].filter((n): n is number => !!n && n > 0);
    return list.length ? Math.min(...list) : 0;
  }

  private static _blank(): SessionMetaEntry {
    return { pinned: false, pinnedAt: 0, favorite: false, favoriteAt: 0, indexed: false, indexedAt: 0, status: 'active' };
  }

  private static _merge(
    existing: SessionMetaEntry | undefined,
    incoming: SessionMetaEntry,
  ): SessionMetaEntry {
    const base = existing || this._blank();
    return {
      ...base,
      ...incoming,
      favorite: !!base.favorite || !!incoming.favorite,
      favoriteAt: Math.max(base.favoriteAt || 0, incoming.favoriteAt || 0),
      pinned: !!base.pinned || !!incoming.pinned,
      pinnedAt: Math.max(base.pinnedAt || 0, incoming.pinnedAt || 0),
      indexed: !!base.indexed || !!incoming.indexed,
      indexedAt: this._earliest(base.indexedAt, incoming.indexedAt),
      status: incoming.status || base.status || 'active',
      customTitle: incoming.customTitle || base.customTitle,
    };
  }

  protected static _read(): Record<string, SessionMetaEntry> {
    throw new Error('Not implemented');
  }

  protected static _write(_all: Record<string, SessionMetaEntry>): void {
    throw new Error('Not implemented');
  }
}
