// Codex 执行器（实现）：填充参数组装与 codex --json 事件解析细节。
import { CodexRunnerStruct } from '../logic_struct/CodexRunnerStruct';
import { RunCallbacks } from '../logic_struct/ClaudeRunnerStruct';
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { Logger } from '../helper/Logger';
import { Session } from '../models/Types';
import { EngineConfig } from './EngineConfig';

export class CodexRunner extends CodexRunnerStruct {
  protected static _buildArgs(session: Session, _rootPath: string): string[] {
    // 无人值守：跳过 git 仓库检查 + 跳过审批与沙箱（等价 claude 的 bypassPermissions）。
    const common = [
      '--json',
      '--skip-git-repo-check',
      '--dangerously-bypass-approvals-and-sandbox',
    ];
    // 模型与思考强度：设置里选定则覆盖；为空=自动（沿用 codex config.toml）
    const cfg = EngineConfig.get().codex;
    const model = (cfg.model || '').trim();
    if (model) common.push('-m', model);
    // codex 没有 --effort，走 `-c model_reasoning_effort=<level>` 覆盖 config.toml。
    // 它只认 low/medium/high，故 xhigh/max 按 EFFORT_LEVELS 的映射降级到 high。
    const effort = EngineConfig.codexEffort();
    if (effort) common.push('-c', `model_reasoning_effort=${effort}`);
    // 续接：仅当已有 codex 会话 id 且其 rollout 文件真实存在时才 resume；
    // 否则首跑（不 resume），codex 生成新 id 并经 thread.started 回报，再由 _reconcileSessionId 校正。
    if (session.claudeSessionId && CodexStoreHelper.sessionExists(session.claudeSessionId)) {
      // codex exec resume [OPTIONS] <SESSION_ID> [PROMPT]；'-' = 从 stdin 读 prompt
      return ['exec', 'resume', ...common, session.claudeSessionId, '-'];
    }
    if (session.claudeSessionId) {
      Logger.warn('CodexRunner', 'stale codexSessionId, rollout 不存在，改为首跑新建', {
        sessionId: session.id,
        codexSessionId: session.claudeSessionId,
      });
    }
    return ['exec', ...common, '-'];
  }

  protected static _parseLine(line: string, cb: RunCallbacks): void {
    let evt: any;
    try {
      evt = JSON.parse(line);
    } catch {
      cb.onOutput(line);
      cb.onEvent?.({ kind: 'raw', name: 'non-json-line', text: line, engine: 'codex' });
      return;
    }
    if (!evt || typeof evt !== 'object') return;

    // 每一行 codex 事件都完整进轨迹（codex 无 stream-json 分块语义，整帧留存最保险）
    cb.onEvent?.({
      kind: evt.type === 'item.completed' ? this._traceKind(evt.item) : 'raw',
      name: evt.type === 'item.completed' ? String(evt.item?.type || 'item') : String(evt.type || 'unknown'),
      toolId: evt.item?.id ? String(evt.item.id) : undefined,
      text: evt.type === 'item.completed' ? String(evt.item?.text || evt.item?.summary || '') : undefined,
      input: evt.type === 'item.completed' ? evt.item : undefined,
      usage: evt.usage,
      raw: evt,
      engine: 'codex',
    });

    // 会话 id：codex 在 thread.started 里给出 thread_id（= rollout 文件 uuid）
    if (evt.type === 'thread.started' && typeof evt.thread_id === 'string' && evt.thread_id) {
      cb.onSessionId?.(evt.thread_id);
      return;
    }

    // 单个 item 完成：按类型分发（agent_message=最终消息，reasoning=思考，其余=过程/工具）
    if (evt.type === 'item.completed' && evt.item && typeof evt.item === 'object') {
      this._dispatchItem(evt.item, cb);
      return;
    }

    // 顶层错误 / 回合失败：归入过程视图（不致命的模型元信息告警等）
    if (evt.type === 'error' && evt.message) cb.onOutput(`[error] ${evt.message}`);
    else if (evt.type === 'turn.failed') cb.onOutput(`[turn.failed] ${this._short(evt.error)}`);
    else if (evt.type === 'turn.completed') cb.onDone(true);
  }

  private static _dispatchItem(item: any, cb: RunCallbacks): void {
    switch (item.type) {
      case 'agent_message':
        if (item.text) cb.onFinal(String(item.text));
        break;
      case 'reasoning':
        if (item.text || item.summary) cb.onThinking(String(item.text || item.summary));
        break;
      case 'command_execution':
        cb.onTool('command', this._short(item.command || item.aggregated_output || item));
        break;
      case 'file_change':
        cb.onTool('file_change', this._short(item.changes || item.path || item));
        break;
      case 'mcp_tool_call':
        cb.onTool(`${item.server || 'mcp'}.${item.tool || ''}`, this._short(item.arguments || item));
        break;
      case 'web_search':
        cb.onTool('web_search', this._short(item.query || ''));
        break;
      case 'todo_list':
        cb.onTool('todo', this._short(item.items || item));
        break;
      case 'error':
        cb.onOutput(`[error] ${this._short(item.message || item)}`);
        break;
      default:
        // 其它 item 类型：作为过程输出，避免信息丢失
        cb.onOutput(this._short(item));
    }
  }

  // codex item 类型 → 轨迹事件种类（reasoning=思考、agent_message=正文、其余动作类=工具调用）
  private static _traceKind(item: any): 'thinking' | 'text' | 'tool_use' | 'raw' {
    const t = item && item.type;
    if (t === 'reasoning') return 'thinking';
    if (t === 'agent_message') return 'text';
    if (['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'todo_list'].includes(t))
      return 'tool_use';
    return 'raw';
  }

  private static _short(v: unknown): string {
    try {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      return s.length > 400 ? s.slice(0, 400) + '…' : s;
    } catch {
      return String(v);
    }
  }
}
