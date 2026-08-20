// Claude 执行器（实现）：填充参数组装与 stream-json 解析细节
import { ClaudeRunnerStruct, RunCallbacks } from '../logic_struct/ClaudeRunnerStruct';
import { AppConfig } from '../config/AppConfig';
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { EngineConfig } from './EngineConfig';
import { Logger } from '../helper/Logger';
import { Session } from '../models/Types';
import { Settings } from './Settings';

export class ClaudeRunner extends ClaudeRunnerStruct {
  protected static _buildArgs(session: Session, rootPath: string): string[] {
    const args = [
      '-p',
      '--input-format',
      'text',
      '--output-format',
      AppConfig.OUTPUT_FORMAT,
      '--verbose',
      '--permission-mode',
      AppConfig.PERMISSION_MODE,
    ];
    // 模型与思考强度：设置里选定则显式指定；为空=自动（不传，完全由 claude 自己决定）。
    // 注意读的是 EngineConfig.get() 的**投影视图**——它只反映当前服务商自己那一槽，
    // 所以切回原版绝不会把第三方的模型 id 传给 CLI。
    const cfg = EngineConfig.get().claude;
    const model = (cfg.model || '').trim();
    if (model) args.push('--model', model);
    const effort = (cfg.effort || '').trim();
    if (effort) args.push('--effort', effort);
    // 自动压缩上下文：只有用户显式选了「自定义窗口」才传。选「自动」时一个参数都不加，
    // 让 claude 用自己的默认窗口（第三方服务商还会有 CLAUDE_CODE_AUTO_COMPACT_WINDOW，见 EngineConfig）。
    const autoCompact = Settings.autoCompactArg();
    if (autoCompact) args.push('--autocompact', autoCompact);
    // 追加图表能力提示：让 AI 在合适时输出 <chart> 数据块（前端 ECharts 渲染）
    if (AppConfig.CHART_SYSTEM_PROMPT) {
      args.push('--append-system-prompt', AppConfig.CHART_SYSTEM_PROMPT);
    }
    // 续接策略（绝不 --fork-session，绝不自造 id）：
    //   仅当已有 claudeSessionId 且其 jsonl 真实存在时才 --resume —— 实测当前 claude
    //   版本 --resume 始终追加到同一文件、上下文连续、不会 fork。
    //   若 id 残留但文件已不在（被删/被 fork 走/草稿脏 id），--resume 会报
    //   "No conversation found" 且退出码仍为 0 → 本条消息静默丢失。此时退回首跑
    //   （不传 --resume），让 claude 生成新 id，再由 stream-json 回读校正，消息绝不丢。
    if (session.claudeSessionId) {
      if (ClaudeStoreHelper.sessionExists(rootPath, session.claudeSessionId)) {
        args.push('--resume', session.claudeSessionId);
      } else {
        Logger.warn('ClaudeRunner', 'stale claudeSessionId, jsonl 不存在，改为首跑新建', {
          sessionId: session.id,
          claudeSessionId: session.claudeSessionId,
          rootPath,
        });
      }
    }
    return args;
  }

  protected static _parseLine(line: string, cb: RunCallbacks): void {
    let evt: any;
    try {
      evt = JSON.parse(line);
    } catch {
      // 非 JSON 行（极少数情况），原样作为过程输出，同时进轨迹（绝不丢）
      cb.onOutput(line);
      cb.onEvent?.({ kind: 'raw', name: 'non-json-line', text: line, engine: 'claude' });
      return;
    }

    // 任何带 session_id 的事件都回报真实 id（init/assistant/result 均带），用于校正 hub 记录
    if (evt && typeof evt.session_id === 'string' && evt.session_id) {
      cb.onSessionId?.(evt.session_id);
    }

    // init 帧：模型 / 可用工具 / cwd / mcp —— 只进轨迹，不打扰过程面板
    if (evt.type === 'system') {
      // 例外：压缩分界帧要让用户看见。压缩是"前面的对话被换成摘要"，
      // 不说一声的话，后面 AI 忘了细节会显得莫名其妙（这也是"感觉没在压缩"的由来）。
      if (evt.subtype === 'compact_boundary') {
        const meta = evt.compact_metadata || {};
        const trigger = meta.trigger === 'manual' ? '手动' : '自动';
        const pre = Number(meta.pre_tokens);
        cb.onOutput(
          `[上下文${trigger}压缩] 前面的对话已压缩成摘要后继续` +
            (Number.isFinite(pre) && pre > 0 ? `（压缩前约 ${pre} tokens）` : ''),
        );
      }
      cb.onEvent?.({
        kind: 'system',
        name: String(evt.subtype || 'system'),
        model: evt.model,
        engine: 'claude',
        raw: evt,
      });
      return;
    }

    // 最终结果事件：携带本轮最终文本 + 官方统计（总耗时/轮数/token/费用）
    if (evt.type === 'result') {
      const text = typeof evt.result === 'string' ? evt.result : '';
      cb.onEvent?.({
        kind: 'result',
        name: String(evt.subtype || 'result'),
        text,
        engine: 'claude',
        usage: evt.usage,
        costUsd: typeof evt.total_cost_usd === 'number' ? evt.total_cost_usd : undefined,
        numTurns: typeof evt.num_turns === 'number' ? evt.num_turns : undefined,
        raw: {
          duration_ms: evt.duration_ms,
          duration_api_ms: evt.duration_api_ms,
          is_error: evt.is_error,
          permission_denials: evt.permission_denials,
        },
      });
      if (text) cb.onFinal(text);
      return;
    }

    // assistant 消息：可能包含 thinking / text / tool_use 块
    if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
      let usageAttached = false; // usage 只挂该帧第一个事件，避免统计时重复计数
      for (const block of evt.message.content) {
        const extra = usageAttached
          ? { engine: 'claude' as const }
          : { engine: 'claude' as const, model: evt.message.model, usage: evt.message.usage };
        if (evt.message.usage || evt.message.model) usageAttached = true;

        if (block.type === 'thinking') {
          // 思考块：实测当前 claude CLI 在 -p 模式下会把 thinking 正文抹成空串、只留 signature
          // （落盘 jsonl 同样如此）。正文拿不到，但"何时思考、思考了多久"仍是关键信号，必须留存。
          if (block.thinking) cb.onThinking(block.thinking);
          cb.onEvent?.({
            kind: 'thinking',
            text: String(block.thinking || ''),
            raw: block.signature ? { signature: String(block.signature), redacted: !block.thinking } : undefined,
            ...extra,
          });
        } else if (block.type === 'text') {
          if (block.text) cb.onOutput(block.text);
          cb.onEvent?.({ kind: 'text', text: String(block.text || ''), ...extra });
        } else if (block.type === 'tool_use') {
          cb.onTool(block.name || 'tool', this._summarizeInput(block.input));
          cb.onEvent?.({
            kind: 'tool_use',
            name: String(block.name || 'tool'),
            toolId: String(block.id || ''),
            input: block.input, // 完整入参，不截断
            ...extra,
          });
        } else {
          cb.onEvent?.({ kind: 'raw', name: String(block.type || ''), raw: block, ...extra });
        }
      }
      return;
    }

    // user 事件中的工具结果：归入过程视图 + 完整输出进轨迹
    if (evt.type === 'user' && evt.message && Array.isArray(evt.message.content)) {
      for (const block of evt.message.content) {
        if (block.type === 'tool_result') {
          const full = this._fullToolResult(block.content);
          const out = this._stringifyToolResult(block.content);
          if (out) cb.onTool('tool_result', out);
          cb.onEvent?.({
            kind: 'tool_result',
            toolId: String(block.tool_use_id || ''),
            output: full, // 完整输出，不截断
            isError: !!block.is_error,
            engine: 'claude',
            raw: evt.toolUseResult,
          });
        } else {
          cb.onEvent?.({ kind: 'raw', name: String(block.type || ''), raw: block, engine: 'claude' });
        }
      }
      return;
    }

    // 其它未识别帧：原样进轨迹，绝不丢信息
    cb.onEvent?.({ kind: 'raw', name: String(evt.type || 'unknown'), raw: evt, engine: 'claude' });
  }

  // 工具结果完整文本（不截断）——轨迹专用
  protected static _fullToolResult(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((c: any) => (c && typeof c === 'object' && typeof c.text === 'string' ? c.text : JSON.stringify(c)))
        .join('\n');
    }
    if (content === undefined || content === null) return '';
    try {
      return JSON.stringify(content);
    } catch {
      return String(content);
    }
  }

  // 将工具入参压缩为一行摘要（仅用于实时过程面板；完整入参在轨迹里）
  protected static _summarizeInput(input: unknown): string {
    try {
      const s = JSON.stringify(input);
      return s.length > 2000 ? s.slice(0, 2000) + '…' : s;
    } catch {
      return String(input);
    }
  }

  protected static _stringifyToolResult(content: unknown): string {
    try {
      if (typeof content === 'string') return content.slice(0, 4000);
      const s = JSON.stringify(content);
      return s.length > 4000 ? s.slice(0, 4000) + '…' : s;
    } catch {
      return '';
    }
  }
}
