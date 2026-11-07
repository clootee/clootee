// List catalogs contain file descriptors, never conversation bodies. Only a page
// of previews is hydrated; pagination snapshots keep ordering stable while tasks run.
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { FsHelper } from '../helper/FsHelper';
import { SignatureCache } from '../helper/SignatureCache';
import { NativeSession } from './NativeSession';
import { CodexSession } from './CodexSession';
import { SessionManager } from './SessionManager';
import { SessionMeta } from './SessionMeta';
import { RootManager } from './RootManager';
import { Settings } from './Settings';
import { Session } from '../models/Types';

interface Candidate {
  id: string; rootId: string; uuid: string; engine: 'claude' | 'codex';
  file?: string; mtimeMs: number; size: number; createdAt: number;
  live?: Session;
}
export interface ListQuery {
  mode?: string; rootId?: string; filterRootId?: string; status?: string;
  q?: string; fullText?: boolean; run?: string; finished?: string[];
  offset?: number; limit?: number; snapshot?: string;
}
interface Directory { rootId: string; count: number; lastAt: number; running: number; justFinished: number; }
interface Snapshot { key: string; at: number; rows: Candidate[]; directories: Directory[]; snippets: Record<string, string>; }

export class SessionList {
  private static _catalogs = new Map<string, { at: number; promise: Promise<Candidate[]> }>();
  private static _previews = new SignatureCache<Session>(1000);
  private static _reading = new Map<string, Promise<Session>>();
  private static _snapshots = new Map<string, Snapshot>();
  private static _building = new Map<string, Promise<Snapshot>>();

  private static async _catalog(): Promise<Candidate[]> {
    const home = Settings.effectiveHomeDir();
    const roots = RootManager.listRoots();
    const key = JSON.stringify([home, process.env.CODEX_HOME, process.env.CLAUDE_CONFIG_DIR, roots.map(r => [r.id, r.path])]);
    const hit = this._catalogs.get(key);
    if (hit && Date.now() - hit.at < 2000) return hit.promise;
    const promise = (async () => {
      const out: Candidate[] = [];
      for (const root of roots) {
        const dir = ClaudeStoreHelper.projectDir(root.path, home);
        let files: string[];
        try { files = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.jsonl')); }
        catch { continue; }
        for (let i = 0; i < files.length; i += 16) {
          const batch = await Promise.all(files.slice(i, i + 16).map(async name => {
            const file = path.join(dir, name);
            try {
              const st = await fs.promises.stat(file);
              if (!st.isFile()) return null;
              const uuid = name.slice(0, -6);
              return { id: `${root.id}:${uuid}`, rootId: root.id, uuid, engine: 'claude' as const,
                file, mtimeMs: st.mtimeMs, size: st.size, createdAt: st.birthtimeMs };
            } catch { return null; }
          }));
          for (const row of batch) if (row) out.push(row);
        }
      }
      await CodexStoreHelper.withIndex(home, () => {
        for (const root of roots) for (const f of CodexStoreHelper.listByCwd(root.path, home)) {
          out.push({ id: `${root.id}:${f.sessionId}`, rootId: root.id, uuid: f.sessionId,
            engine: 'codex', file: f.file, mtimeMs: f.mtimeMs, size: f.size, createdAt: f.createdAt });
        }
      });
      return out;
    })();
    this._catalogs.set(key, { at: Date.now(), promise });
    while (this._catalogs.size > 4) this._catalogs.delete(this._catalogs.keys().next().value!);
    try { return await promise; } catch (e) { this._catalogs.delete(key); throw e; }
  }

  private static async _preview(c: Candidate): Promise<Session> {
    const base: Session = { id: c.id, rootId: c.rootId, engine: c.engine, name: '', claudeSessionId: c.uuid,
      createdAt: c.createdAt, updatedAt: c.mtimeMs, paused: false, source: 'empty', tasks: [], messages: [] };
    if (!c.file) return { ...base, ...c.live, messages: [] };
    const sig = `${c.mtimeMs}:${c.size}:${c.rootId}`;
    const key = c.file;
    const hit = this._previews.get(key, sig);
    if (hit) return { ...hit };
    const jobKey = `${key}:${sig}`;
    let job = this._reading.get(jobKey);
    if (!job) {
      job = (async () => {
        const edge = await FsHelper.readEdgeLinesAsync(c.file!);
        // Large files may have no recent user message in the bounded tail. An
        // empty preview is preferable to rescanning megabytes of tool output.
        const preview = c.engine === 'codex'
          ? CodexSession.fromEdges(c.rootId, c.uuid, c.mtimeMs, edge.head, edge.tail, c.createdAt)
          : NativeSession.fromEdges(c.rootId, c.uuid, c.mtimeMs, edge.head, edge.tail);
        return this._previews.set(key, sig, preview);
      })().finally(() => this._reading.delete(jobKey));
      this._reading.set(jobKey, job);
    }
    return { ...await job };
  }

  private static _decorate(c: Candidate, row: Session, meta: ReturnType<typeof SessionMeta.getAll>): Session {
    const natural = `${c.rootId}:${c.uuid}`;
    const m = meta[natural] || meta[c.id];
    return { ...row, id: c.id, tasks: c.live?.tasks || [], paused: c.live?.paused || false,
      updatedAt: Math.max(row.updatedAt || 0, c.live?.updatedAt || 0),
      pinned: !!m?.pinned, favorite: !!m?.favorite, status: m?.status || 'active',
      customTitle: m?.customTitle || '', promptCache: m?.promptCache || c.live?.promptCache,
      promptCacheConfirmed: m?.promptCacheConfirmed ?? c.live?.promptCacheConfirmed, messages: [] };
  }

  private static async _candidates(): Promise<Candidate[]> {
    const catalog = await this._catalog();
    const live = SessionManager.runtimeSessions();
    const byNatural = new Map(live.map(s => [s.claudeSessionId ? `${s.rootId}:${s.claudeSessionId}` : s.id, s]));
    const seen = new Set<string>();
    const out = catalog.map(c => {
      const s = byNatural.get(c.id);
      seen.add(s?.id || c.id);
      return { ...c, id: s?.id.includes(':draft-') ? s.id : c.id, live: s,
        mtimeMs: Math.max(c.mtimeMs, s?.updatedAt || 0) };
    });
    const roots = new Set(RootManager.listRoots().map(r => r.id));
    for (const s of live) if (!seen.has(s.id) && roots.has(s.rootId)) {
      out.push({ id: s.id, rootId: s.rootId, uuid: s.claudeSessionId, engine: s.engine || 'claude',
        mtimeMs: s.updatedAt, size: 0, createdAt: s.createdAt, live: s });
    }
    return out;
  }

  // Search only real user/assistant messages, streaming one frame at a time.
  private static async _textHit(c: Candidate, q: string, signal?: AbortSignal): Promise<string | null> {
    if (!c.file) {
      const m = c.live?.messages.find(m => m.text.toLowerCase().includes(q));
      return m ? m.text.slice(0, 120) : null;
    }
    const input = fs.createReadStream(c.file, { highWaterMark: 64 * 1024 });
    const lines = createInterface({ input, crlfDelay: Infinity });
    const abort = () => input.destroy(new Error('Search cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      let n = 0;
      for await (const line of lines) {
        signal?.throwIfAborted();
        const messages = c.engine === 'codex'
          ? CodexSession.messagesFromLines([line], c.uuid) : NativeSession.messagesFromLines([line], c.uuid);
        for (const m of messages) {
          const at = m.text.toLowerCase().indexOf(q);
          if (at >= 0) return m.text.slice(Math.max(0, at - 20), at + q.length + 50).replace(/\s+/g, ' ');
        }
        if (++n % 16 === 0) await new Promise<void>(resolve => setImmediate(resolve));
      }
      return null;
    } catch { return null; }
    finally { signal?.removeEventListener('abort', abort); lines.close(); input.destroy(); }
  }

  static async page(query: ListQuery, canRead: (rootId: string) => boolean = () => true, signal?: AbortSignal) {
    const roots = RootManager.listRoots();
    const access = roots.filter(r => canRead(r.id)).map(r => r.id).sort();
    const mode = ['single', 'favorites', 'indexed', 'workspace'].includes(query.mode || '') ? query.mode : 'single';
    const q = String(query.q || '').trim().toLowerCase().slice(0, 500);
    const finished = new Set((query.finished || []).slice(0, 2000));
    const status = ['active', 'testing', 'completed'].includes(query.status || '') ? query.status : 'all';
    const key = JSON.stringify([Settings.effectiveHomeDir(), process.env.CODEX_HOME, process.env.CLAUDE_CONFIG_DIR, roots.map(r => [r.id, r.path]), mode, query.rootId, query.filterRootId, status,
      q, !!query.fullText, query.run, [...finished].sort(), access]);
    const meta = SessionMeta.getAll();
    let offset = Number.isFinite(query.offset) ? Math.max(0, Math.floor(query.offset!)) : 0;
    const limit = Number.isFinite(query.limit) ? Math.max(1, Math.min(50, Math.floor(query.limit!))) : 20;
    let token = query.snapshot || '';
    let snapshot = this._snapshots.get(token);
    const reset = offset > 0 && (!snapshot || snapshot.key !== key || Date.now() - snapshot.at > 120000);
    if (reset) offset = 0;
    if (!snapshot || snapshot.key !== key || Date.now() - snapshot.at > 120000 || offset === 0) {
      let build = q ? undefined : this._building.get(key);
      if (!build) {
        build = (async () => {
          const scoped = (await this._candidates()).filter(c => {
            const m = meta[`${c.rootId}:${c.uuid}`] || meta[c.id];
            return !(mode === 'single' && c.rootId !== query.rootId)
              && !(mode === 'favorites' && !m?.favorite) && !(mode === 'indexed' && !m?.indexed);
          });
          const dirs = new Map<string, Directory>();
          for (const c of scoped) {
            const d = dirs.get(c.rootId) || { rootId: c.rootId, count: 0, lastAt: 0, running: 0, justFinished: 0 };
            d.count++; d.lastAt = Math.max(d.lastAt, c.mtimeMs);
            if (c.live?.tasks.some(t => t.status === 'running')) d.running++;
            else if (finished.has(c.id)) d.justFinished++;
            dirs.set(c.rootId, d);
          }
          let rows = scoped.filter(c => {
            const m = meta[`${c.rootId}:${c.uuid}`] || meta[c.id];
            if (query.filterRootId && c.rootId !== query.filterRootId) return false;
            if (status !== 'all' && (m?.status || 'active') !== status) return false;
            const running = c.live?.tasks.some(t => t.status === 'running');
            const run = (query.run || '').split(',');
            if (query.run && !(run.includes('running') && running) && !(run.includes('justFinished') && !running && finished.has(c.id))) return false;
            return !q || canRead(c.rootId);
          });
          rows.sort((a, b) => {
            const ma = meta[`${a.rootId}:${a.uuid}`] || meta[a.id];
            const mb = meta[`${b.rootId}:${b.uuid}`] || meta[b.id];
            return Number(!!mb?.pinned) - Number(!!ma?.pinned) || b.mtimeMs - a.mtimeMs || a.id.localeCompare(b.id);
          });
          const snippets: Record<string, string> = {};
          if (q) {
            const found: Candidate[] = [];
            for (const c of rows) {
              signal?.throwIfAborted();
              try {
                const row = this._decorate(c, await this._preview(c), meta);
                if ((row.customTitle || row.name || '').toLowerCase().includes(q)) found.push(c);
                else if (query.fullText) {
                  const snippet = await this._textHit(c, q, signal);
                  if (snippet !== null) { found.push(c); snippets[c.id] = snippet; }
                }
              } catch { /* A deleted file is absent from search. */ }
            }
            rows = found;
          }
          signal?.throwIfAborted();
          return { key, rows, directories: [...dirs.values()], snippets, at: Date.now() };
        })().finally(() => this._building.delete(key));
        if (!q) this._building.set(key, build);
      }
      snapshot = await build;
      signal?.throwIfAborted();
      token = randomUUID();
      this._snapshots.set(token, snapshot);
      for (const [id, snap] of this._snapshots) if (Date.now() - snap.at > 120000) this._snapshots.delete(id);
      while (this._snapshots.size > 32) this._snapshots.delete(this._snapshots.keys().next().value!);
    }
    // Read at most four bounded previews concurrently, and yield between batches.
    signal?.throwIfAborted();
    const items: Session[] = [];
    let end = offset;
    while (items.length < limit && end < snapshot.rows.length) {
      signal?.throwIfAborted();
      const batch = snapshot.rows.slice(end, end + Math.min(4, limit - items.length));
      end += batch.length;
      const loaded = await Promise.all(batch.map(async c => {
        try { return this._decorate(c, await this._preview(c), meta); } catch { return null; }
      }));
      for (const row of loaded) if (row) items.push(row);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    return { items, total: snapshot.rows.length, nextOffset: end, hasMore: end < snapshot.rows.length,
      snapshot: token, reset, snippets: Object.fromEntries(items.filter(s => snapshot!.snippets[s.id]).map(s => [s.id, snapshot!.snippets[s.id]])),
      directories: snapshot.directories,
      running: SessionManager.runtimeSessions().filter(s => canRead(s.rootId) && s.tasks.some(t => t.status === 'running')).map(s => ({ id: s.id, tasks: s.tasks.filter(t => t.status === 'running') })) };
  }

  static async recency(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const c of await this._candidates()) out[c.rootId] = Math.max(out[c.rootId] || 0, c.mtimeMs);
    return out;
  }
}
