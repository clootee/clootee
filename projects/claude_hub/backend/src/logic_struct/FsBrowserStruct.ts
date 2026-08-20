// 目录浏览（调度骨架）。实现经 FsHelper 可达，故直接在 Struct 写，不用 throw
import { FsHelper, DirEntry } from '../helper/FsHelper';

export interface DirListing {
  path: string;
  parent: string;
  isRoot: boolean;
  drives: DirEntry[];
  dirs: DirEntry[];
}

export class FsBrowserStruct {
  // 列出某目录内容；path 为空时从用户主目录开始
  static list(target: string): DirListing {
    const dir = target && target.trim() ? target : FsHelper.home();
    if (!FsHelper.exists(dir)) throw new Error(`list: directory not found, path=${dir}`);
    return {
      path: dir,
      parent: FsHelper.parent(dir),
      isRoot: FsHelper.parent(dir) === dir,
      drives: FsHelper.drives(),
      dirs: FsHelper.listSubdirs(dir),
    };
  }

  // 在 parent 下新建目录，返回新目录条目
  static createDir(parent: string, name: string): DirEntry {
    if (!parent || !parent.trim()) throw new Error('createDir: empty parent');
    if (!FsHelper.exists(parent)) throw new Error(`createDir: parent not found, path=${parent}`);
    if (!FsHelper.isValidDirName(name)) throw new Error(`createDir: invalid name, name=${name}`);
    if (FsHelper.exists(FsHelper.joinChild(parent, name)))
      throw new Error(`createDir: already exists, name=${name}`);
    return { name, path: FsHelper.makeDir(parent, name) };
  }

  // 新建项目时推荐的默认父目录：<平台基准>/projects（Windows: D:\projects 或 C:\projects；Unix: ~/projects）。
  // 仅计算路径，不创建（真正创建在 RootManager.createProject 里按需 mkdir）。
  static defaultProjectDir(): { path: string } {
    return { path: FsHelper.joinChild(FsHelper.preferredBase(), 'projects') };
  }

  // 在 base 下搜索名称匹配 q 的目录
  static search(base: string, q: string): DirEntry[] {
    const root = base && base.trim() ? base : FsHelper.home();
    if (!q || !q.trim()) throw new Error('search: empty query');
    if (!FsHelper.exists(root)) throw new Error(`search: base not found, path=${root}`);
    return FsHelper.searchSubdirs(root, q.trim());
  }
}
