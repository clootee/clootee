export type SessionStatus = 'active' | 'testing' | 'completed';

const STATUSES: SessionStatus[] = ['active', 'testing', 'completed'];
const MAX_PINNED = 3;

export interface SessionMetaEntry {
  pinned: boolean;
  pinnedAt: number;
  favorite?: boolean;
  favoriteAt?: number;
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

  private static _blank(): SessionMetaEntry {
    return { pinned: false, pinnedAt: 0, favorite: false, favoriteAt: 0, status: 'active' };
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
