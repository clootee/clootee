// 项目模板管理（调度骨架）。文件检测/读写/复制均经 FsHelper 可达，故直接在 Struct 实现。
// 用途：新建或选择根目录后，若缺少 CLAUDE.md/AGENTS.md，引导用户选一个模板：
//   - 内置模板（web-tool / app-fullstack / web-game-2d / web-game-3d / python-tool）→ 写入对应的 CLAUDE.md + AGENTS.md
//   - 自定义模板（设置里 templateCollectionPath 下的每个直接子文件夹）→ 把其内容复制覆盖到项目
import { FsHelper } from '../helper/FsHelper';
import { TemplatesConfig } from '../config/TemplatesConfig';
import { RootManager } from '../logic_realize/RootManager';
import { Settings } from '../logic_realize/Settings';

export type TemplateKind = 'builtin' | 'custom';

export interface TemplateListItem {
  id: string; // builtin: 模板 id；custom: 子文件夹名
  kind: TemplateKind;
  labelZh: string;
  labelEn: string;
  descZh?: string;
  descEn?: string;
}

export interface TemplateList {
  builtin: TemplateListItem[];
  custom: TemplateListItem[];
  collectionPath: string; // 设置里配置的模板集合路径（可空）
}

export class TemplateManagerStruct {
  // 该根目录是否需要选模板：CLAUDE.md 与 AGENTS.md（大小写不敏感）两者都不存在时才需要
  static needsTemplate(rootId: string): { needed: boolean } {
    if (!rootId) throw new Error(`needsTemplate: invalid rootId=${rootId}`);
    const root = RootManager.getRoot(rootId);
    if (root.templateSkipped) return { needed: false }; // 用户已选「不使用模板」，不再打扰
    const has =
      FsHelper.hasFileCI(root.path, 'CLAUDE.md') || FsHelper.hasFileCI(root.path, 'AGENTS.md');
    return { needed: !has };
  }

  // 记住「该根目录不再询问模板」（用户明确跳过）
  static skipTemplate(rootId: string): { ok: boolean } {
    if (!rootId) throw new Error(`skipTemplate: invalid rootId=${rootId}`);
    RootManager.markTemplateSkipped(rootId);
    return { ok: true };
  }

  // 同上，但按绝对路径判断（根目录尚未注册时用，让前端可以先选模板再建目录）
  static needsTemplateAtPath(dirPath: string): { needed: boolean } {
    if (!dirPath) throw new Error(`needsTemplateAtPath: invalid dirPath=${dirPath}`);
    const has = FsHelper.hasFileCI(dirPath, 'CLAUDE.md') || FsHelper.hasFileCI(dirPath, 'AGENTS.md');
    return { needed: !has };
  }

  // 列出可选模板：内置清单 + 模板集合路径下的直接子文件夹
  static listTemplates(): TemplateList {
    const builtin: TemplateListItem[] = TemplatesConfig.builtin.map((t) => ({
      id: t.id,
      kind: 'builtin',
      labelZh: t.label.zh,
      labelEn: t.label.en,
      descZh: t.desc.zh,
      descEn: t.desc.en,
    }));
    const cp = (Settings.get().templateCollectionPath || '').trim();
    const custom: TemplateListItem[] =
      cp && FsHelper.exists(cp)
        ? FsHelper.listSubdirs(cp).map((d) => ({
            id: d.name,
            kind: 'custom',
            labelZh: d.name,
            labelEn: d.name,
          }))
        : [];
    return { builtin, custom, collectionPath: cp };
  }

  // 应用模板到某根目录：内置→写 CLAUDE.md/AGENTS.md；自定义→复制子文件夹内容覆盖过去
  static applyTemplate(rootId: string, kind: TemplateKind, templateId: string): { ok: boolean } {
    if (!rootId) throw new Error(`applyTemplate: invalid rootId=${rootId}`);
    if (!templateId) throw new Error(`applyTemplate: invalid templateId=${templateId}`);
    const root = RootManager.getRoot(rootId);
    if (kind === 'builtin') this._applyBuiltin(root.path, templateId);
    else if (kind === 'custom') this._applyCustom(root.path, templateId);
    else throw new Error(`applyTemplate: invalid kind=${kind}`);
    return { ok: true };
  }

  // 内置模板：把 config/templates/<id>.CLAUDE.md 与 <id>.AGENTS.md 写入项目根目录
  protected static _applyBuiltin(rootPath: string, id: string): void {
    const meta = TemplatesConfig.builtin.find((t) => t.id === id);
    if (!meta) throw new Error(`_applyBuiltin: unknown builtin template id=${id}`);
    const claude = FsHelper.readText(FsHelper.joinChild(TemplatesConfig.DIR, `${id}.CLAUDE.md`)).content;
    const agents = FsHelper.readText(FsHelper.joinChild(TemplatesConfig.DIR, `${id}.AGENTS.md`)).content;
    FsHelper.writeText(FsHelper.joinChild(rootPath, 'CLAUDE.md'), claude);
    FsHelper.writeText(FsHelper.joinChild(rootPath, 'AGENTS.md'), agents);
  }

  // 自定义模板：把模板集合路径下名为 name 的直接子文件夹的内容复制覆盖到项目根目录
  protected static _applyCustom(rootPath: string, name: string): void {
    if (!FsHelper.isValidDirName(name)) throw new Error(`_applyCustom: invalid template name=${name}`);
    const cp = (Settings.get().templateCollectionPath || '').trim();
    if (!cp) throw new Error('_applyCustom: templateCollectionPath not set');
    const src = FsHelper.joinChild(cp, name);
    if (!FsHelper.exists(src)) throw new Error(`_applyCustom: template not found, path=${src}`);
    FsHelper.copyDirInto(src, rootPath);
  }
}
