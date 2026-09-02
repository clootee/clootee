// 根目录管理（调度骨架）。持久化经由 JsonStore helper 可达，故直接在 Struct 实现
import * as fs from 'fs';
import * as path from 'path';
import { JsonStore } from '../helper/JsonStore';
import { Ids } from '../helper/Ids';
import { Paths } from '../paths';
import { Root, RootLink } from '../models/Types';

export class RootManagerStruct {
  // 列出全部根目录
  static listRoots(): Root[] {
    return JsonStore.read<Root[]>(Paths.ROOTS_FILE, []);
  }

  // 新增根目录：校验路径存在 → 生成 id → 落盘
  static addRoot(name: string, dirPath: string): Root {
    if (!name || !name.trim()) throw new Error(`addRoot: invalid name=${name}`);
    if (!dirPath || !fs.existsSync(dirPath))
      throw new Error(`addRoot: path not found, path=${dirPath}`);
    const roots = this.listRoots();
    const root: Root = {
      id: Ids.short('root'),
      name: name.trim(),
      path: dirPath,
      createdAt: Date.now(),
    };
    roots.push(root);
    JsonStore.write(Paths.ROOTS_FILE, roots);
    return root;
  }

  // 确保某目录对应的根（工作台模式新建会话用）：
  // 已存在同一路径的根 → 直接复用；否则可选先创建目录，再新增根。名称默认取目录末段。
  static ensureRoot(dirPath: string, create: boolean): Root {
    if (!dirPath || !dirPath.trim()) throw new Error(`ensureRoot: invalid path=${dirPath}`);
    const target = dirPath.trim();
    const existing = this.listRoots().find((r) => this._samePath(r.path, target));
    if (existing) return existing;
    if (!fs.existsSync(target)) {
      if (!create) throw new Error(`ensureRoot: path not found, path=${target}`);
      fs.mkdirSync(target, { recursive: true });
    }
    return this.addRoot(this._baseName(target), target);
  }

  // 新建项目：在 parentDir 下创建以 name 命名的项目文件夹并登记为根目录。
  // name 只允许英文字母/数字/下划线（作为文件夹名，须符合命名规范，禁止中文）。
  // parentDir 不存在则递归创建（含默认的 projects 目录）；项目目录已存在时：
  // allowExisting=false → 抛 PROJECT_EXISTS（前端据此询问用户「是否直接使用该目录」）；
  // allowExisting=true  → 直接复用该目录（已登记过同路径的根则返回原根，不重复登记）。
  static createProject(name: string, parentDir: string, allowExisting = false): Root {
    const clean = (name || '').trim();
    if (!/^[A-Za-z0-9_]+$/.test(clean))
      throw new Error(`createProject: invalid name=${name} (only A-Z a-z 0-9 _ allowed)`);
    if (!parentDir || !parentDir.trim()) throw new Error(`createProject: invalid parentDir=${parentDir}`);
    const parent = parentDir.trim();
    const target = path.join(parent, clean);
    if (fs.existsSync(target)) {
      if (!allowExisting) throw new Error(`createProject: PROJECT_EXISTS path=${target}`);
      const existing = this.listRoots().find((r) => this._samePath(r.path, target));
      return existing || this.addRoot(clean, target);
    }
    fs.mkdirSync(target, { recursive: true });
    return this.addRoot(clean, target);
  }

  private static _baseName(p: string): string {
    return path.basename(p.replace(/[\\/]+$/, '')) || p;
  }

  // 路径归一比较（Windows 大小写不敏感、去尾斜杠）
  private static _samePath(a: string, b: string): boolean {
    const norm = (s: string): string => {
      const r = path.resolve(s).replace(/[\\/]+$/, '');
      return process.platform === 'win32' ? r.toLowerCase() : r;
    };
    return norm(a) === norm(b);
  }

  // 按 id 查询根目录
  static getRoot(id: string): Root {
    const root = this.listRoots().find((r) => r.id === id);
    if (!root) throw new Error(`getRoot: not found, id=${id}`);
    return root;
  }

  // 更新根目录的备注 / 链接 / 重点文件夹（均可选）
  static updateRoot(
    id: string,
    patch: { name?: string; note?: string; links?: RootLink[]; favorites?: string[] },
  ): Root {
    if (!id) throw new Error(`updateRoot: invalid id=${id}`);
    const roots = this.listRoots();
    const root = roots.find((r) => r.id === id);
    if (!root) throw new Error(`updateRoot: not found, id=${id}`);
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new Error(`updateRoot: empty name, id=${id}`);
      root.name = patch.name.trim();
    }
    if (patch.note !== undefined) root.note = patch.note;
    if (patch.links !== undefined) root.links = this._sanitizeLinks(patch.links);
    if (patch.favorites !== undefined) {
      if (!Array.isArray(patch.favorites)) throw new Error(`updateRoot: invalid favorites, id=${id}`);
      root.favorites = patch.favorites;
    }
    JsonStore.write(Paths.ROOTS_FILE, roots);
    return root;
  }

  // 标记「该根目录不再询问模板」（用户选了不使用模板）；置位后 needsTemplate 恒为 false
  static markTemplateSkipped(id: string): Root {
    if (!id) throw new Error(`markTemplateSkipped: invalid id=${id}`);
    const roots = this.listRoots();
    const root = roots.find((r) => r.id === id);
    if (!root) throw new Error(`markTemplateSkipped: not found, id=${id}`);
    root.templateSkipped = true;
    JsonStore.write(Paths.ROOTS_FILE, roots);
    return root;
  }

  // 清洗链接：去掉空项，url 补全协议（实现细节交 realize）
  protected static _sanitizeLinks(_links: RootLink[]): RootLink[] {
    throw new Error('Not implemented');
  }

  // 删除根目录
  static removeRoot(id: string): void {
    if (!id) throw new Error(`removeRoot: invalid id=${id}`);
    const roots = this.listRoots().filter((r) => r.id !== id);
    JsonStore.write(Paths.ROOTS_FILE, roots);
  }

  // 读取某根目录的外部消息注入 API 状态；从未设置过则视为默认开放，并顺带补一个 token
  static ensureExternalApi(id: string): Root {
    if (!id) throw new Error(`ensureExternalApi: invalid id=${id}`);
    const roots = this.listRoots();
    const root = roots.find((r) => r.id === id);
    if (!root) throw new Error(`ensureExternalApi: not found, id=${id}`);
    let changed = false;
    if (root.externalApiOpen === undefined) {
      root.externalApiOpen = true;
      changed = true;
    }
    if (!root.externalApiToken) {
      root.externalApiToken = Ids.short('ext');
      changed = true;
    }
    if (changed) JsonStore.write(Paths.ROOTS_FILE, roots);
    return root;
  }

  // 设置该根目录对外可达的地址（供运行中的 AI 通过环境变量拿到，自己拼 bridge 参数）；传空串=清除
  static setExternalApiBaseUrl(id: string, baseUrl: string): Root {
    if (!id) throw new Error(`setExternalApiBaseUrl: invalid id=${id}`);
    const roots = this.listRoots();
    const root = roots.find((r) => r.id === id);
    if (!root) throw new Error(`setExternalApiBaseUrl: not found, id=${id}`);
    root.externalApiBaseUrl = (baseUrl || '').trim();
    JsonStore.write(Paths.ROOTS_FILE, roots);
    return root;
  }

  // 开放/关闭某根目录的外部消息注入 API（开放时若无 token 顺带生成）
  static setExternalApiOpen(id: string, open: boolean): Root {
    if (!id) throw new Error(`setExternalApiOpen: invalid id=${id}`);
    const roots = this.listRoots();
    const root = roots.find((r) => r.id === id);
    if (!root) throw new Error(`setExternalApiOpen: not found, id=${id}`);
    root.externalApiOpen = open;
    if (open && !root.externalApiToken) root.externalApiToken = Ids.short('ext');
    JsonStore.write(Paths.ROOTS_FILE, roots);
    return root;
  }

  // 重置某根目录的外部 API token（旧 token 立即失效）
  static resetExternalApiToken(id: string): Root {
    if (!id) throw new Error(`resetExternalApiToken: invalid id=${id}`);
    const roots = this.listRoots();
    const root = roots.find((r) => r.id === id);
    if (!root) throw new Error(`resetExternalApiToken: not found, id=${id}`);
    root.externalApiToken = Ids.short('ext');
    JsonStore.write(Paths.ROOTS_FILE, roots);
    return root;
  }

  // 批量删除根目录：一次读取 → 按 id 集合过滤 → 一次落盘（避免多次读写）
  static removeRoots(ids: string[]): { removed: string[] } {
    if (!Array.isArray(ids) || ids.length === 0)
      throw new Error(`removeRoots: invalid ids=${JSON.stringify(ids)}`);
    const drop = new Set(ids.filter((x) => !!x));
    if (drop.size === 0) throw new Error(`removeRoots: no valid ids=${JSON.stringify(ids)}`);
    const roots = this.listRoots().filter((r) => !drop.has(r.id));
    JsonStore.write(Paths.ROOTS_FILE, roots);
    return { removed: [...drop] };
  }
}
