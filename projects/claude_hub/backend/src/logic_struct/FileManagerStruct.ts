// 文件管理器（调度骨架）：在某根目录范围内浏览子目录、面包屑、读写文件、搜索、重点文件夹。
// 仅做调度：定位根目录 → 安全解析相对路径 → 调 FsHelper → 用 realize 的分类器映射为元信息。
// 所有相对路径都被约束在根目录之内（FsHelper.resolveWithin 防穿越）。
import * as fs from 'fs';
import { FsHelper } from '../helper/FsHelper';
import { RootManagerStruct } from './RootManagerStruct';
import {
  BrowseResult, Crumb, DirMeta, FileMeta, FileKind, FileContent,
} from '../models/Types';

export class FileManagerStruct {
  // 浏览某根目录下的相对目录：返回面包屑 + 子目录 + 文件（非递归） + 重点文件夹
  static browse(rootId: string, rel: string): BrowseResult {
    const base = this._rootPath(rootId);
    const dir = this._resolveDir(base, rel);
    const children = FsHelper.listChildren(dir);
    const cwd = FsHelper.relOf(base, dir);
    const dirs: DirMeta[] = [];
    const files: FileMeta[] = [];
    for (const c of children) {
      const childRel = FsHelper.relOf(base, c.path);
      if (c.isDir) dirs.push({ name: c.name, rel: childRel, mtime: c.mtime });
      else files.push(this._meta(childRel, c.size, c.mtime));
    }
    return {
      cwd,
      breadcrumb: this._breadcrumb(rootId, base, dir),
      dirs,
      files,
      favorites: this._favorites(rootId),
    };
  }

  // 在根目录下按文件名递归搜索（返回文件元信息，限量）
  static search(rootId: string, q: string): FileMeta[] {
    const needle = String(q || '').trim().toLowerCase();
    if (!needle) return [];
    const base = this._rootPath(rootId);
    return FsHelper.listFilesRecursive(base)
      .filter((f) => f.rel.toLowerCase().includes(needle))
      .slice(0, 200)
      .map((f) => this._meta(f.rel, f.size, f.mtime));
  }

  // 读取文本文件内容（用于内置编辑器）；非文本/超大不可编辑
  static readFile(rootId: string, rel: string): FileContent {
    const base = this._rootPath(rootId);
    const full = this._resolveFile(base, rel);
    const st = fs.statSync(full);
    const relNorm = FsHelper.relOf(base, full);
    const meta = this._meta(relNorm, st.size, st.mtimeMs);
    const { content, truncated } = FsHelper.readText(full);
    return { meta, content, truncated };
  }

  // 覆盖保存文本文件内容（仅可编辑类型）
  static writeFile(rootId: string, rel: string, content: string): FileMeta {
    if (typeof content !== 'string') throw new Error(`writeFile: invalid content for rel=${rel}`);
    const base = this._rootPath(rootId);
    const full = this._resolveFile(base, rel);
    const relNorm = FsHelper.relOf(base, full);
    const { editable } = this._classify(this._extOf(relNorm));
    if (!editable) throw new Error(`writeFile: not an editable text file, rel=${rel}`);
    FsHelper.writeText(full, content);
    const st = fs.statSync(full);
    return this._meta(relNorm, st.size, st.mtimeMs);
  }

  // 定位单个文件绝对路径（下载/预览流式响应用）；越界或不存在抛错
  static locate(rootId: string, rel: string): { path: string; meta: FileMeta } {
    const base = this._rootPath(rootId);
    const full = this._resolveFile(base, rel);
    const st = fs.statSync(full);
    const relNorm = FsHelper.relOf(base, full);
    return { path: full, meta: this._meta(relNorm, st.size, st.mtimeMs) };
  }

  // 切换重点文件夹（已存在则移除、否则加入）；校验该相对目录在根内且确为目录
  static toggleFavorite(rootId: string, rel: string): string[] {
    const base = this._rootPath(rootId);
    const dir = this._resolveDir(base, rel);
    const relNorm = FsHelper.relOf(base, dir);
    if (!relNorm) throw new Error(`toggleFavorite: cannot favorite root itself, rootId=${rootId}`);
    const cur = this._favorites(rootId);
    const next = cur.includes(relNorm) ? cur.filter((f) => f !== relNorm) : [...cur, relNorm];
    RootManagerStruct.updateRoot(rootId, { favorites: next });
    return next;
  }

  // ── 内部调度工具 ──
  private static _rootPath(rootId: string): string {
    if (!rootId) throw new Error(`FileManager: invalid rootId=${rootId}`);
    return RootManagerStruct.getRoot(rootId).path;
  }

  private static _favorites(rootId: string): string[] {
    return RootManagerStruct.getRoot(rootId).favorites || [];
  }

  // 把相对路径解析为根内目录的绝对路径（校验存在且为目录）
  private static _resolveDir(base: string, rel: string): string {
    const full = FsHelper.resolveWithin(base, String(rel || ''));
    if (!full) throw new Error(`FileManager: dir out of root, rel=${rel}`);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      throw new Error(`FileManager: dir not found, rel=${rel}`);
    }
    if (!st.isDirectory()) throw new Error(`FileManager: not a directory, rel=${rel}`);
    return full;
  }

  // 把相对路径解析为根内文件的绝对路径（校验存在且为文件）
  private static _resolveFile(base: string, rel: string): string {
    const full = FsHelper.resolveWithin(base, String(rel || ''));
    if (!full) throw new Error(`FileManager: file out of root, rel=${rel}`);
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      throw new Error(`FileManager: file not found, rel=${rel}`);
    }
    if (!st.isFile()) throw new Error(`FileManager: not a file, rel=${rel}`);
    return full;
  }

  // 面包屑：从根（名取根目录名）逐级到当前目录
  private static _breadcrumb(rootId: string, base: string, dir: string): Crumb[] {
    const rootName = RootManagerStruct.getRoot(rootId).name;
    const crumbs: Crumb[] = [{ name: rootName, rel: '' }];
    const rel = FsHelper.relOf(base, dir);
    if (!rel) return crumbs;
    const parts = rel.split('/');
    let acc = '';
    for (const p of parts) {
      acc = acc ? acc + '/' + p : p;
      crumbs.push({ name: p, rel: acc });
    }
    return crumbs;
  }

  private static _meta(rel: string, size: number, mtime: number): FileMeta {
    const ext = this._extOf(rel);
    const { kind, previewable, editable } = this._classify(ext);
    return {
      name: rel,
      sizeKb: Math.max(1, Math.round(size / 1024)),
      ext,
      kind,
      previewable,
      editable,
      mtime,
    };
  }

  private static _extOf(rel: string): string {
    return (rel.split('.').pop() || '').toLowerCase();
  }

  // 按扩展名分类（kind + 可预览 + 可编辑）。实现细节交 realize
  protected static _classify(_ext: string): { kind: FileKind; previewable: boolean; editable: boolean } {
    throw new Error('Not implemented');
  }
}
