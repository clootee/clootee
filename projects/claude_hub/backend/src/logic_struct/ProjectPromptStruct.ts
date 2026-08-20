// 预设系统提示词注入（调度骨架）
// 设置里填了「预设系统提示词」后，每次发消息前检查当前项目根目录的 CLAUDE.md 与 AGENTS.md
// （大小写变体都算，如 claude.md / Claude.md），没写过这段提示词就写进去（幂等，带标记块）。
import { PromptBlock } from '../helper/PromptBlock';
import { Settings } from '../logic_realize/Settings';

export type PromptEnsureAction = 'skip' | 'appended' | 'created' | 'updated';

export interface PromptEnsureResult {
  file: string; // 实际写入/检查的文件绝对路径
  action: PromptEnsureAction;
}

export class ProjectPromptStruct {
  // ── 调度骨架：ensure ───────────────────────────────────────────────
  // Settings.get().systemPrompt 为空 → 什么都不做；否则两个目标文件各处理一次
  static ensure(rootPath: string): PromptEnsureResult[] {
    if (!rootPath) throw new Error(`ProjectPromptStruct.ensure: invalid rootPath=${rootPath}`);
    const prompt = (Settings.get().systemPrompt || '').trim();
    if (!prompt) return [];
    const claude = this._ensureOne(rootPath, 'CLAUDE.md', prompt);
    const agents = this._ensureOne(rootPath, 'AGENTS.md', prompt);
    return [claude, agents];
  }

  // ── 调度骨架：_ensureOne ───────────────────────────────────────────
  // this._findFile → 大小写不敏感地找现有文件（realize）
  // PromptBlock.upsert → 纯计算新内容；null=已有该提示词，跳过
  static _ensureOne(rootPath: string, defaultName: string, prompt: string): PromptEnsureResult {
    if (!defaultName) throw new Error(`_ensureOne: invalid defaultName=${defaultName}`);
    const existing = this._findFile(rootPath, defaultName);
    const target = existing || this._defaultPath(rootPath, defaultName);
    const current = existing ? this._readFile(existing) : '';
    const next = PromptBlock.upsert(current, prompt);
    if (next === null) return { file: target, action: 'skip' };
    this._writeFile(target, next);
    return { file: target, action: this._actionOf(existing, current) };
  }

  // ── IO / 纯派生钩子（realize 实现）──
  protected static _findFile(_rootPath: string, _defaultName: string): string | null {
    throw new Error('Not implemented');
  }
  protected static _defaultPath(_rootPath: string, _defaultName: string): string {
    throw new Error('Not implemented');
  }
  protected static _readFile(_file: string): string {
    throw new Error('Not implemented');
  }
  protected static _writeFile(_file: string, _content: string): void {
    throw new Error('Not implemented');
  }
  protected static _actionOf(_existing: string | null, _current: string): PromptEnsureAction {
    throw new Error('Not implemented');
  }
}
