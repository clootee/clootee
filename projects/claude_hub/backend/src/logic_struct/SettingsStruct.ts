// 全局设置（调度骨架）：默认引擎 / 是否允许局域网访问 / 是否优先使用内置(out_end)引擎。
// 持久化到 data/settings.json。
import { AppConfig } from '../config/AppConfig';
import { Engine } from '../models/Types';
import { OutEnd } from '../helper/OutEnd';
import { NetHelper } from '../helper/NetHelper';

// 快捷按钮：一个组内互斥（单选，可取消），组与组之间互不影响（可各选一个）
export interface QuickTag {
  label: string;   // 按钮显示文字
  prompt?: string; // 该按钮的含义/对应提示词（发送时插入正文前）；留空则回落为 `[label]` 前缀
}
export interface QuickGroup {
  name: string;    // 组名（界面提示用）
  prompt?: string; // 组提示词（可选）：该组任一按钮被选中时一并附加
  tags: QuickTag[];
}

// 每个工具各自的来源偏好：auto=本机优先 / system=只认本机 / bundled=内置优先
// 键为 ToolchainStruct 的 ToolId（node/git/claude/codex），缺省即 auto
export type ToolPrefMap = Record<string, 'auto' | 'system' | 'bundled'>;

// 自动压缩上下文（对应 claude CLI 的 `--autocompact <auto|tokens>`）。
// 对话逼近上下文上限时，引擎会把前面的内容压成摘要再继续，避免"聊着聊着就报超长"。
//   auto   = 不传该参数，跟随引擎自身默认（第三方服务商可能另有 CLAUDE_CODE_AUTO_COMPACT_WINDOW）
//   custom = 显式指定压缩窗口，取值必须在 100k–1M 之间（CLI 自己的硬性限制）
export type AutoCompactMode = 'auto' | 'custom';
export interface AutoCompactSetting {
  mode: AutoCompactMode;
  tokens: number; // custom 时生效
}
export const AUTO_COMPACT_MIN = 100000;
export const AUTO_COMPACT_MAX = 1000000;
export const AUTO_COMPACT_DEFAULT_TOKENS = 200000;

export interface AppSettings {
  defaultEngine: Engine;
  allowLan: boolean;      // false=仅 localhost；true=允许局域网(0.0.0.0)访问（需重启生效）
  preferBundled: boolean; // 旧字段：true=优先内置。新代码请用 toolPrefs，这里仅作迁移来源
  // 运行环境面板的选择：哪个工具用本机、哪个用内置
  toolPrefs: ToolPrefMap;
  // 预设系统提示词：非空时，每次发消息前自动确保写入当前项目根目录的 CLAUDE.md / AGENTS.md
  systemPrompt: string;
  // 快捷前缀标签分组（用户可在设置里自定义；空数组=不显示标签行）
  quickGroups: QuickGroup[];
  // 模板集合路径：设置后，该目录下每个直接子文件夹都作为一个自定义项目模板，
  // 新建/选择根目录且缺少 CLAUDE.md/AGENTS.md 时可选用，选中即把子文件夹内容复制覆盖到项目里。空=未设置。
  templateCollectionPath: string;
  // 自动压缩上下文（仅 Claude Code 有对应 CLI 开关；Codex 由其自身机制处理）
  autoCompact: AutoCompactSetting;
  // 新手引导是否已完成（旧字段，保留兼容；判定是否强制引导请用 setupDone）
  onboarded: boolean;
  // 初始设置是否已完成（语言/主题/引擎/服务商/模型都选好了）。
  // false=新用户：必须先走完引导才能设定密码进入，不允许跳过。
  setupDone: boolean;
  platform?: string;     // 服务器运行平台（win32/linux/darwin）
  outEndReady?: boolean;  // out_end 目录是否已就绪（前端提示是否需 bootstrap）
  port?: number;          // 服务端口（前端展示局域网访问教程用）
  lanUrls?: string[];     // 本机局域网访问地址 http://<ip>:<port>（供前端「允许局域网访问」教程展示+复制）
}

export class SettingsStruct {
  static get(): AppSettings {
    const raw = this._read();
    const eng =
      raw && (raw.defaultEngine === 'codex' || raw.defaultEngine === 'claude')
        ? raw.defaultEngine
        : AppConfig.DEFAULT_ENGINE;
    return {
      defaultEngine: eng,
      allowLan: !!(raw && raw.allowLan),
      preferBundled: !!(raw && raw.preferBundled),
      toolPrefs: this._sanitizeToolPrefs(raw && raw.toolPrefs, !!(raw && raw.preferBundled)),
      onboarded: !!(raw && raw.onboarded),
      setupDone: !!(raw && raw.setupDone),
      systemPrompt: raw && typeof raw.systemPrompt === 'string' ? raw.systemPrompt : '',
      quickGroups: raw && Array.isArray(raw.quickGroups)
        ? this._sanitizeQuickGroups(raw.quickGroups)
        : this.defaultQuickGroups(),
      templateCollectionPath:
        raw && typeof raw.templateCollectionPath === 'string' ? raw.templateCollectionPath : '',
      autoCompact: this._sanitizeAutoCompact(raw && raw.autoCompact),
      platform: process.platform,
      outEndReady: OutEnd.exists(),
      port: AppConfig.PORT,
      lanUrls: NetHelper.lanUrls(AppConfig.PORT),
    };
  }

  static setDefaultEngine(engine: Engine): AppSettings {
    if (engine !== 'claude' && engine !== 'codex')
      throw new Error(`setDefaultEngine: invalid engine=${engine}`);
    return this._patch({ defaultEngine: engine });
  }

  // 出厂分组：默认新用户不预置任何快捷标签分组（用户可自行在设置里添加）
  static defaultQuickGroups(): QuickGroup[] {
    return [];
  }

  // 批量更新（前端设置面板）；只接受已知字段
  static update(patch: Partial<AppSettings>): AppSettings {
    const next: Partial<AppSettings> = {};
    if (patch.defaultEngine === 'claude' || patch.defaultEngine === 'codex')
      next.defaultEngine = patch.defaultEngine;
    if (typeof patch.allowLan === 'boolean') next.allowLan = patch.allowLan;
    if (typeof patch.preferBundled === 'boolean') next.preferBundled = patch.preferBundled;
    if (patch.toolPrefs && typeof patch.toolPrefs === 'object')
      next.toolPrefs = this._sanitizeToolPrefs(patch.toolPrefs, false);
    if (typeof patch.onboarded === 'boolean') next.onboarded = patch.onboarded;
    if (typeof patch.setupDone === 'boolean') next.setupDone = patch.setupDone;
    if (typeof patch.systemPrompt === 'string') next.systemPrompt = patch.systemPrompt;
    if (Array.isArray(patch.quickGroups)) next.quickGroups = this._sanitizeQuickGroups(patch.quickGroups);
    if (typeof patch.templateCollectionPath === 'string')
      next.templateCollectionPath = patch.templateCollectionPath.trim();
    if (patch.autoCompact) next.autoCompact = this._sanitizeAutoCompact(patch.autoCompact);
    return this._patch(next);
  }

  private static _patch(patch: Partial<AppSettings>): AppSettings {
    const cur = this.get();
    const merged: AppSettings = {
      defaultEngine: patch.defaultEngine ?? cur.defaultEngine,
      allowLan: patch.allowLan ?? cur.allowLan,
      preferBundled: patch.preferBundled ?? cur.preferBundled,
      toolPrefs: patch.toolPrefs ?? cur.toolPrefs,
      onboarded: patch.onboarded ?? cur.onboarded,
      setupDone: patch.setupDone ?? cur.setupDone,
      systemPrompt: patch.systemPrompt ?? cur.systemPrompt,
      quickGroups: patch.quickGroups ?? cur.quickGroups,
      templateCollectionPath: patch.templateCollectionPath ?? cur.templateCollectionPath,
      autoCompact: patch.autoCompact ?? cur.autoCompact,
    };
    this._write(merged);
    return this.get();
  }

  // 自动压缩要不要显式传给 claude CLI：custom 才传，返回 `--autocompact` 的取值；
  // auto（默认）返回 ''＝一个参数都不传，完全跟随引擎/服务商自己的设定。
  static autoCompactArg(): string {
    const ac = this.get().autoCompact;
    return ac.mode === 'custom' ? String(ac.tokens) : '';
  }

  // ── IO 钩子（realize 实现）──
  protected static _read(): AppSettings | null {
    throw new Error('Not implemented');
  }
  protected static _write(_s: AppSettings): void {
    throw new Error('Not implemented');
  }
  // 清洗用户自定义分组（去空标签/空组、去重、长度上限）
  protected static _sanitizeQuickGroups(_raw: unknown): QuickGroup[] {
    throw new Error('Not implemented');
  }
  // 清洗工具来源偏好：只保留已知工具与合法取值；
  // _legacyPreferBundled 为旧字段 preferBundled 的迁移来源（未显式设置过的工具取它）
  protected static _sanitizeToolPrefs(_raw: unknown, _legacyPreferBundled: boolean): ToolPrefMap {
    throw new Error('Not implemented');
  }
  // 清洗自动压缩设置：模式只认 auto/custom，窗口夹到 100k–1M（CLI 只接受这个区间）
  protected static _sanitizeAutoCompact(_raw: unknown): AutoCompactSetting {
    throw new Error('Not implemented');
  }
}
