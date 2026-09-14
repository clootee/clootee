// 通用文件系统工具（业务无关）：列子目录、搜索目录、盘符、路径规整
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DirEntry {
  name: string;
  path: string;
}

export interface FileEntry {
  rel: string; // 相对 base 的路径（统一用 / 分隔）
  path: string; // 绝对路径
  size: number; // 字节
  mtime: number; // 修改时间戳
}

// 目录下单个子项（文件或目录），非递归列举用
export interface ChildEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: number;
}

// 列文件时跳过的目录（噪声/体积大），与业务无关
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', 'dist', 'build', '.next', '.cache', '__pycache__']);

export class FsHelper {
  // 用户主目录
  static home(): string {
    return os.homedir();
  }

  // Windows 盘符列表（非 Windows 返回根 '/'）
  static drives(): DirEntry[] {
    if (process.platform !== 'win32') return [{ name: '/', path: '/' }];
    const found: DirEntry[] = [];
    for (let c = 65; c <= 90; c++) {
      const root = String.fromCharCode(c) + ':\\';
      try {
        fs.accessSync(root);
        found.push({ name: String.fromCharCode(c) + ':', path: root });
      } catch {
        /* 无此盘符 */
      }
    }
    return found;
  }

  // 父目录（已到根则返回自身）
  static parent(dir: string): string {
    const p = path.dirname(dir);
    return p === dir ? dir : p;
  }

  static exists(dir: string): boolean {
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }

  // 列出某目录下的子目录（仅目录，按名称排序，跳过无权限项）
  static listSubdirs(dir: string): DirEntry[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const dirs: DirEntry[] = [];
    for (const e of entries) {
      let isDir = e.isDirectory();
      if (e.isSymbolicLink()) {
        try {
          isDir = fs.statSync(path.join(dir, e.name)).isDirectory();
        } catch {
          isDir = false;
        }
      }
      if (isDir && !e.name.startsWith('.')) dirs.push({ name: e.name, path: path.join(dir, e.name) });
    }
    return dirs.sort((a, b) => a.name.localeCompare(b.name));
  }

  // 在 base 下递归列出文件（限制深度/数量，跳过噪声目录），按修改时间倒序
  static listFilesRecursive(base: string, maxDepth = 4, limit = 800): FileEntry[] {
    const out: FileEntry[] = [];
    const walk = (dir: string, depth: number): void => {
      if (depth > maxDepth || out.length >= limit) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (out.length >= limit) return;
        if (e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (SKIP_DIRS.has(e.name)) continue;
          walk(full, depth + 1);
        } else if (e.isFile()) {
          let st: fs.Stats;
          try {
            st = fs.statSync(full);
          } catch {
            continue;
          }
          const rel = path.relative(base, full).split(path.sep).join('/');
          out.push({ rel, path: full, size: st.size, mtime: st.mtimeMs });
        }
      }
    };
    walk(base, 0);
    return out.sort((a, b) => b.mtime - a.mtime);
  }

  // 列出某目录下的直接子项（文件 + 目录，非递归，跳过隐藏项），目录在前、各自按名称排序
  static listChildren(dir: string): ChildEntry[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const out: ChildEntry[] = [];
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      let isDir = e.isDirectory();
      let st: fs.Stats;
      try {
        st = fs.statSync(full); // 跟随符号链接、获取大小/时间
        if (e.isSymbolicLink()) isDir = st.isDirectory();
      } catch {
        continue; // 无权限/失效链接，跳过
      }
      out.push({ name: e.name, path: full, isDir, size: st.size, mtime: st.mtimeMs });
    }
    return out.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  // 把相对路径安全解析到 base 之内（不校验类型，越界返回 null）。rel 为空返回 base 本身
  static resolveWithin(base: string, rel: string): string | null {
    if (rel && rel.includes('\0')) return null;
    const normalizedRel = (rel || '').split(/[\\/]+/).filter(Boolean).join(path.sep);
    const full = normalizedRel ? path.resolve(base, normalizedRel) : path.resolve(base);
    const baseResolved = path.resolve(base);
    const within = full === baseResolved || full.startsWith(baseResolved + path.sep);
    return within ? full : null;
  }

  // 相对 base 的路径（统一 / 分隔）；同一目录返回 ''
  static relOf(base: string, full: string): string {
    const r = path.relative(base, full);
    return r ? r.split(path.sep).join('/') : '';
  }

  // 读取文本文件；超过 maxBytes 截断（标记 truncated）。返回 utf-8 文本
  static readText(full: string, maxBytes = 1024 * 1024): { content: string; truncated: boolean } {
    const fd = fs.openSync(full, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, maxBytes);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, 0);
      return { content: buf.toString('utf-8'), truncated: size > maxBytes };
    } finally {
      fs.closeSync(fd);
    }
  }

  // 覆盖写入文本文件（utf-8）。父目录必须已存在
  static writeText(full: string, content: string): void {
    fs.writeFileSync(full, content, 'utf-8');
  }

  // 把相对路径安全解析到 base 之内：越界（路径穿越）返回 null
  static safeResolve(base: string, rel: string): string | null {
    if (!rel || rel.includes('\0')) return null;
    const normalizedRel = rel.split(/[\\/]+/).join(path.sep);
    const full = path.resolve(base, normalizedRel);
    const baseResolved = path.resolve(base);
    const within = full === baseResolved || full.startsWith(baseResolved + path.sep);
    if (!within) return null;
    try {
      if (!fs.statSync(full).isFile()) return null;
    } catch {
      return null;
    }
    return full;
  }

  // 拼接父目录与子项名
  static joinChild(parent: string, name: string): string {
    return path.join(parent, name);
  }

  // 在 parent 下新建目录（name 必须是单层合法名称），返回新目录绝对路径
  static makeDir(parent: string, name: string): string {
    const full = path.join(parent, name);
    fs.mkdirSync(full);
    return full;
  }

  // 平台推荐的项目基准盘/目录：Windows 优先 D:\ 存在则用之，否则 C:\；类 Unix 用用户主目录。
  // 仅返回“基准”（不含 projects 子目录），业务侧自行拼接需要的子目录名。
  static preferredBase(): string {
    if (process.platform === 'win32') {
      for (const drive of ['D:\\', 'C:\\']) {
        try {
          fs.accessSync(drive);
          return drive;
        } catch {
          /* 无此盘符，试下一个 */
        }
      }
      return 'C:\\';
    }
    return os.homedir();
  }

  // 目录里是否存在名为 name 的文件（大小写不敏感）。用于 CLAUDE.md / claude.md 等变体检测
  static hasFileCI(dir: string, name: string): boolean {
    const want = name.toLowerCase();
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .some((e) => e.isFile() && e.name.toLowerCase() === want);
    } catch {
      return false;
    }
  }

  // 递归把 src 目录下所有内容复制进 dst（dst 不存在则创建；同名文件覆盖）。跳过噪声目录
  static copyDirInto(src: string, dst: string): void {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (e.isDirectory() && SKIP_DIRS.has(e.name)) continue;
      const from = path.join(src, e.name);
      const to = path.join(dst, e.name);
      if (e.isDirectory()) this.copyDirInto(from, to);
      else if (e.isFile()) fs.copyFileSync(from, to);
    }
  }

  // 名称是否为合法单层目录名（无分隔符/无 .. /无非法字符）
  static isValidDirName(name: string): boolean {
    if (!name || name.trim() !== name) return false;
    if (name === '.' || name === '..') return false;
    if (/[\\/:*?"<>|\0]/.test(name)) return false;
    return true;
  }

  // 在 base 下广度优先搜索名称包含 q 的目录（限制结果数与遍历节点数）
  static searchSubdirs(base: string, q: string, limit = 50, maxNodes = 4000): DirEntry[] {
    const needle = q.toLowerCase();
    const out: DirEntry[] = [];
    const queue: string[] = [base];
    let visited = 0;
    while (queue.length > 0 && out.length < limit && visited < maxNodes) {
      const cur = queue.shift() as string;
      visited++;
      let children: DirEntry[];
      try {
        children = this.listSubdirs(cur);
      } catch {
        continue;
      }
      for (const child of children) {
        if (child.name.toLowerCase().includes(needle)) out.push(child);
        queue.push(child.path);
      }
    }
    return out;
  }
}
