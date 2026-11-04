import * as fs from 'fs';
import { FsHelper, FileEntry } from '../helper/FsHelper';
import { SessionManagerStruct } from './SessionManagerStruct';
import { RootManagerStruct } from './RootManagerStruct';
import { FileMeta, FileKind } from '../models/Types';

export class SessionFilesStruct {
  static list(sessionId: string): FileMeta[] {
    const base = this._rootPath(sessionId);
    return FsHelper.listFilesRecursive(base).map((f) =>
      this._meta(f.rel, f.size, f.mtime),
    );
  }

  static resolve(sessionId: string, names: string[]): FileMeta[] {
    if (!Array.isArray(names)) throw new Error(`resolve: invalid names=${names}`);
    const base = this._rootPath(sessionId);
    const seen = new Set<string>();
    const out: FileMeta[] = [];
    // 惰性构建的 basename(小写) → 最近修改文件 索引，仅在字面路径未命中时才遍历根目录树
    let baseIndex: Map<string, FileEntry> | null = null;
    for (const raw of names) {
      const rel = this._normalizeRel(raw);
      if (!rel) continue;
      // 1) 字面相对路径命中（AI 给出完整相对路径，或文件就在根目录顶层）
      const full = FsHelper.safeResolve(base, rel);
      if (full) {
        if (seen.has(rel)) continue;
        const st = fs.statSync(full);
        seen.add(rel);
        out.push(this._meta(rel, st.size, st.mtimeMs));
        continue;
      }
      // 2) 回退：AI 常只提裸文件名而文件在子目录里 → 按 basename 在根目录树内查找
      if (!baseIndex) baseIndex = this._buildBaseIndex(base);
      const hit = baseIndex.get((rel.split('/').pop() || '').toLowerCase());
      if (!hit || seen.has(hit.rel)) continue;
      seen.add(hit.rel);
      out.push(this._meta(hit.rel, hit.size, hit.mtime));
    }
    return out;
  }

  // basename(小写) → 该名下最近修改的文件（listFilesRecursive 已按 mtime 倒序，故首个即最新）
  private static _buildBaseIndex(base: string): Map<string, FileEntry> {
    const idx = new Map<string, FileEntry>();
    for (const f of FsHelper.listFilesRecursive(base)) {
      const bn = (f.rel.split('/').pop() || '').toLowerCase();
      if (bn && !idx.has(bn)) idx.set(bn, f);
    }
    return idx;
  }

  static locate(sessionId: string, name: string): { path: string; meta: FileMeta } {
    if (!name) throw new Error(`locate: invalid name=${name}`);
    const base = this._rootPath(sessionId);
    const rel = this._normalizeRel(name);
    const full = FsHelper.safeResolve(base, rel);
    if (!full) throw new Error(`locate: file not found or out of root, session=${sessionId} name=${name}`);
    const st = fs.statSync(full);
    if (!st.isFile()) throw new Error(`locate: not a file, session=${sessionId} name=${name}`);
    return { path: full, meta: this._meta(rel, st.size, st.mtimeMs) };
  }

  private static _rootPath(sessionId: string): string {
    if (!sessionId) throw new Error(`SessionFiles: invalid sessionId=${sessionId}`);
    const session = SessionManagerStruct.getSession(sessionId);
    const root = RootManagerStruct.getRoot(session.rootId);
    return root.path;
  }

  private static _meta(rel: string, size: number, mtime: number): FileMeta {
    const ext = (rel.split('.').pop() || '').toLowerCase();
    const { kind, previewable } = this._classify(ext);
    return {
      name: rel,
      sizeKb: Math.max(1, Math.round(size / 1024)),
      ext,
      kind,
      previewable,
      mtime,
    };
  }

  private static _normalizeRel(raw: string): string {
    return String(raw || '').trim().split(/[\\/]+/).filter(Boolean).join('/');
  }

  protected static _classify(_ext: string): { kind: FileKind; previewable: boolean } {
    throw new Error('Not implemented');
  }
}
