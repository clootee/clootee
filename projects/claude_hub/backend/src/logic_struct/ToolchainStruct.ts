// 运行环境工具链（调度骨架）：node / git / claude / codex 四件套的「有没有、用哪个、怎么装」。
//
// 两种来源：
//   system  —— 本机已装（PATH 里能找到）
//   bundled —— 本工具内置（out_end/ 下随包自带，或点一下下载到那里），**不需要用户安装**
// 偏好（每个工具各自可选，持久化在 settings.toolPrefs）：
//   auto    —— 默认：**本机有就优先用本机的**，没有才用内置
//   system  —— 只认本机（本机没有时回退内置，界面会标出来）
//   bundled —— 优先用内置（内置没有时回退本机）
// claude / codex 两个 AI 引擎**都不内置**：体积大（各 400-500MB）、版本更新快，
// 一律 `npm install -g`（源由 RegistryPicker 竞速选出）。只有 node / git 提供内置便携版。
import { OutEnd } from '../helper/OutEnd';

export type ToolId = 'node' | 'git' | 'claude' | 'codex';
export type ToolPref = 'auto' | 'system' | 'bundled';
export type ToolSource = 'system' | 'bundled' | 'none';
export type InstallTarget = 'global' | 'bundled';

export interface ToolCopy {
  found: boolean;
  path: string;
  version: string;
  // 文件在、但执行不起来时的原因（被杀软拦截、架构不符、依赖缺失…）。
  // 没有这一项时，界面上"已安装却怎么都跑不出结果"完全无从查起。
  error?: string;
}

export interface ToolInfo {
  id: ToolId;
  label: string;
  purpose: string; // 这个工具是干什么用的（界面直接展示）
  optional: boolean; // 缺了软件仍可用
  bundlable: boolean; // 是否提供内置版
  globalInstallable: boolean; // 是否支持一键「全局安装」
  system: ToolCopy;
  bundled: ToolCopy;
  pref: ToolPref;
  active: ToolSource; // 按当前偏好 + 实际存在情况，真正会被用到的那一份
}

export interface ToolMeta {
  id: ToolId;
  label: string;
  purpose: string;
  optional: boolean;
  bundlable: boolean;
  globalInstallable: boolean;
}

// 工具清单（顺序即界面展示顺序）
export const TOOLS: ToolMeta[] = [
  {
    id: 'node',
    label: 'Node.js',
    purpose: '运行本软件自身，以及 claude / codex 这类 npm 命令行工具',
    optional: false,
    bundlable: true,
    globalInstallable: false, // 全局安装 Node 需要管理员安装包，这里只提供内置便携版
  },
  {
    id: 'git',
    label: 'Git',
    purpose: '会话里的版本管理与「推送到云端」；不装也能正常对话',
    optional: true,
    // Git 的「内置便携版」只有 Windows 有（MinGit：纯 zip、解压即用、不写注册表）。
    // macOS / Linux 官方没有便携发行版，只能交给系统包管理器 → 那边走「安装到本机」。
    bundlable: process.platform === 'win32',
    globalInstallable: process.platform !== 'win32',
  },
  {
    id: 'claude',
    label: 'Claude Code',
    purpose: '主力 AI 引擎，本软件的所有任务都由它执行',
    optional: false,
    bundlable: false, // 体积大、更新快，不随包内置：npm 全局安装
    globalInstallable: true,
  },
  {
    id: 'codex',
    label: 'Codex',
    purpose: '可选的第二个 AI 引擎；不用 Codex 就不必装',
    optional: true,
    bundlable: false, // 同上
    globalInstallable: true,
  },
];

export const TOOL_PREFS: ToolPref[] = ['auto', 'system', 'bundled'];

// 「全部使用内置」一键模式覆盖的工具：运行环境本身（node、git）。
// claude / codex 不内置（走 npm 全局安装），不参与这个模式。
export const SELF_CONTAINED: ToolId[] = ['node', 'git'];
export type PresetMode = 'bundled' | 'auto';

export type ToolProgress = (line: string) => void;

export class ToolchainStruct {
  // 全部工具的当前状态（界面面板直接渲染这个）
  static status(): ToolInfo[] {
    return TOOLS.map((m) => this._info(m));
  }

  // 单个工具的状态
  static one(id: ToolId): ToolInfo {
    const meta = TOOLS.find((m) => m.id === id);
    if (!meta) throw new Error(`Toolchain.one: invalid tool=${id}`);
    return this._info(meta);
  }

  // 设定某个工具用本机还是内置；改完立刻让 PATH 与各 Bin 缓存跟上
  static setPref(id: ToolId, pref: ToolPref): ToolInfo {
    if (!TOOLS.some((m) => m.id === id)) throw new Error(`Toolchain.setPref: invalid tool=${id}`);
    if (!TOOL_PREFS.includes(pref)) throw new Error(`Toolchain.setPref: invalid pref=${pref} (tool=${id})`);
    this._savePref(id, pref);
    this._clearBinCaches();
    this.applyPath();
    return this.one(id);
  }

  // 一键模式：
  //   bundled = 运行环境自包含，node / git 全用内置版，不再理会本机装了什么
  //   auto    = 回到默认，本机有就优先用本机的
  static preset(mode: PresetMode): ToolInfo[] {
    if (mode !== 'bundled' && mode !== 'auto') throw new Error(`Toolchain.preset: invalid mode=${mode}`);
    // 该平台没有内置版的工具（如 macOS/Linux 的 git）不参与，否则会写下一个永远回退的偏好
    for (const id of this.selfContained()) this._savePref(id, mode === 'bundled' ? 'bundled' : 'auto');
    this._clearBinCaches();
    this.applyPath();
    return this.status();
  }

  // 「全部使用内置」在当前平台上真正覆盖到的工具（本平台没有内置版的自动剔除）
  static selfContained(): ToolId[] {
    return SELF_CONTAINED.filter((id) => TOOLS.some((m) => m.id === id && m.bundlable));
  }

  // 当前是否已经是「全部使用内置」（本平台可内置的那些工具偏好都是 bundled）
  static isSelfContained(): boolean {
    return this.selfContained().every((id) => this._readPref(id) === 'bundled');
  }

  // 安装：target='global' 装到系统（全局），'bundled' 下载到 out_end 内置库
  static async install(id: ToolId, target: InstallTarget, onProgress?: ToolProgress): Promise<ToolInfo> {
    const meta = TOOLS.find((m) => m.id === id);
    if (!meta) throw new Error(`Toolchain.install: invalid tool=${id}`);
    if (target !== 'global' && target !== 'bundled')
      throw new Error(`Toolchain.install: invalid target=${target} (tool=${id})`);
    if (target === 'global' && !meta.globalInstallable)
      throw new Error(`Toolchain.install: ${id} 不支持全局安装，请改用内置版`);
    if (target === 'bundled' && !meta.bundlable)
      throw new Error(`Toolchain.install: ${id} 没有内置版，请选择全局安装`);

    if (target === 'global') await this._installGlobal(id, onProgress);
    else await this._installBundled(id, onProgress);

    this._clearBinCaches();
    this.applyPath();
    return this.one(id);
  }

  // 供 Runner 判断某引擎是否该优先用内置版
  static preferBundled(id: ToolId): boolean {
    return this.one(id).active === 'bundled';
  }

  // 把当前偏好落到 process.env.PATH：子进程（claude/codex 及其调用的命令）据此命中内置版
  static applyPath(): void {
    const wanted: string[] = [];
    for (const id of ['git', 'node'] as ToolId[]) {
      // node 放最前：claude 的 npm 垫片要用它
      if (this.one(id).active === 'bundled') wanted.unshift(...OutEnd.binDirs(id as 'node' | 'git'));
    }
    // 旧版本把引擎装在 out_end/tools；现在一律全局安装，但老用户的那份仍要能被找到，
    // 故该目录存在就继续挂在 PATH 末尾（全局安装的版本优先）。
    wanted.push(...OutEnd.binDirs('tools'));
    this._applyPath(OutEnd.allBinDirs(), wanted);
  }

  // 组装单个工具的状态：先探测两处，再按偏好决定实际用哪个
  private static _info(meta: ToolMeta): ToolInfo {
    const system = this._detectSystem(meta.id);
    const bundled = meta.bundlable ? this._detectBundled(meta.id) : { found: false, path: '', version: '' };
    const pref = this._readPref(meta.id);
    return { ...meta, system, bundled, pref, active: this._resolveActive(pref, system, bundled) };
  }

  // auto/system → 本机优先；bundled → 内置优先；选中的那边没有就回退另一边
  private static _resolveActive(pref: ToolPref, system: ToolCopy, bundled: ToolCopy): ToolSource {
    const order: ToolSource[] = pref === 'bundled' ? ['bundled', 'system'] : ['system', 'bundled'];
    for (const s of order) {
      if (s === 'system' && system.found) return 'system';
      if (s === 'bundled' && bundled.found) return 'bundled';
    }
    return 'none';
  }

  // ── Realize 实现点 ──
  protected static _detectSystem(_id: ToolId): ToolCopy {
    throw new Error('Not implemented');
  }
  protected static _detectBundled(_id: ToolId): ToolCopy {
    throw new Error('Not implemented');
  }
  protected static _readPref(_id: ToolId): ToolPref {
    throw new Error('Not implemented');
  }
  protected static _savePref(_id: ToolId, _pref: ToolPref): void {
    throw new Error('Not implemented');
  }
  protected static _installGlobal(_id: ToolId, _onProgress?: ToolProgress): Promise<void> {
    throw new Error('Not implemented');
  }
  protected static _installBundled(_id: ToolId, _onProgress?: ToolProgress): Promise<void> {
    throw new Error('Not implemented');
  }
  protected static _applyPath(_managedDirs: string[], _wantedDirs: string[]): void {
    throw new Error('Not implemented');
  }
  protected static _clearBinCaches(): void {
    throw new Error('Not implemented');
  }
}
