// 引擎安装 / 更新（调度骨架）：把 claude code / codex 装到最新版（npm 全局安装）。
// 两个引擎都**不再随包内置**：体积大、更新快，统一走 `npm install -g <pkg>@latest`，
// 源由 RegistryPicker 竞速选出（官方源 vs 国内镜像，谁的 /-/ping 快用谁）。
// 用户手动触发；装完清 Bin 缓存以便下次 spawn 用到新版本。
// 具体 npm 调用（子进程）由 Realize 实现。
import { ClaudeBin } from '../helper/ClaudeBin';
import { CodexBin } from '../helper/CodexBin';

export interface UpdateResult {
  ok: boolean;
  engine: string;
  pkg: string;
  log: string; // npm 输出摘要（尾部）
  registry: string; // 实际使用的 npm 源（便于失败时给出「换源重试」的提示）
}

// 安装过程中的实时输出回调（Server 用它把进度广播给前端；不传则静默）
export type UpdateProgress = (line: string) => void;

const PKG: Record<string, string> = {
  claude: '@anthropic-ai/claude-code',
  codex: '@openai/codex',
};

export class EngineUpdaterStruct {
  // 安装/更新指定引擎到最新版（npm 全局）。onProgress 有值时逐行回传 npm 输出。
  static async update(engine: string, onProgress?: UpdateProgress): Promise<UpdateResult> {
    const pkg = PKG[engine];
    if (!pkg) throw new Error(`update: invalid engine=${engine}`);
    const registry = await this._pickRegistry();
    onProgress?.(`npm registry: ${registry}`);
    const log = await this._npmInstall(pkg, registry, onProgress);
    // 安装后清缓存，让下次解析拿到新版本
    ClaudeBin.clearCache();
    CodexBin.clearCache();
    return { ok: true, engine, pkg, log, registry };
  }

  // 选定 npm 源：用户配过就用他的，否则探测官方源与国内镜像谁快（Realize 实现）。
  protected static _pickRegistry(): Promise<string> {
    throw new Error('Not implemented');
  }

  // 执行 `npm install -g <pkg>@latest --registry=<registry>`，返回输出尾部（Realize 实现）。
  protected static _npmInstall(
    _pkg: string,
    _registry: string,
    _onProgress?: UpdateProgress
  ): Promise<string> {
    throw new Error('Not implemented');
  }
}
