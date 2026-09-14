// 过程轨迹存储（调度骨架）
// 职责：把 AI 干活的全过程（思考/工具入参/工具输出/耗时/token）逐条落盘，并能按会话读回 + 统计。
// 数据源有两路，读取时合并：
//   ① live —— hub 自己执行任务时从 stream-json 实时捕获（唯一能拿到 thinking 正文的途径）
//   ② jsonl —— claude 自己落盘的 ~/.claude/projects/<enc>/<uuid>.jsonl 反推
//      （覆盖终端里手跑的会话；但 thinking 正文已被 claude 抹除，只剩 signature）
// 冲突策略：text/tool_use/tool_result 以 jsonl 为准（权威且带官方时间戳），
//           live 只补 jsonl 缺失的部分（thinking 正文、stderr、任务起止、token/费用）。
import { EventBus } from '../helper/EventBus';
import { TraceEvent, TraceResult, TraceStats } from '../models/Types';

// 记录入参：seq/ts 由存储层补全，调用方只关心内容
export type TraceInput = Omit<TraceEvent, 'seq' | 'ts'> & { ts?: number };

export class TraceStoreStruct {
  // ── 调度骨架：record ───────────────────────────────────────────────
  // this._stamp     → 补 seq/ts，得到完整事件（realize）
  // this._append    → 追加落盘（realize）
  // EventBus        → 实时广播给前端"全过程"视图
  static record(sessionId: string, ev: TraceInput): TraceEvent {
    if (!sessionId) throw new Error(`TraceStore.record: invalid sessionId=${sessionId}`);
    if (!ev || !ev.kind) throw new Error(`TraceStore.record: invalid kind=${ev && ev.kind}`);
    if (!ev.taskId) throw new Error(`TraceStore.record: invalid taskId=${ev && ev.taskId}`);

    const full = this._stamp(sessionId, ev);
    this._append(sessionId, full);
    EventBus.broadcast({ kind: 'trace', sessionId, taskId: full.taskId, event: full });
    return full;
  }

  // ── 调度骨架：read ─────────────────────────────────────────────────
  // this._readLive  → 读本地 trace 文件（realize）
  // this._readJsonl → 从 claude 原生 jsonl 反推（realize）
  // this._merge     → 按时间排序 + 去重（realize）
  // this._annotate  → 计算 gapMs / durationMs（realize）
  // this._aggregate → 汇总耗时与 token（realize）
  // includeRaw=true 时连 claude jsonl 里的非对话元帧（attachment / queue-operation / summary…）
  // 也一并还原成 kind=raw 事件，供极端排查用；默认不含，避免响应体被目录快照类附件撑爆。
  static read(sessionId: string, includeRaw = false): TraceResult {
    if (!sessionId) throw new Error(`TraceStore.read: invalid sessionId=${sessionId}`);
    const live = this._readLive(sessionId);
    const jsonl = this._readJsonl(sessionId, includeRaw);
    const events = this._annotate(this._merge(live, jsonl));
    return {
      sessionId,
      events,
      liveCount: live.length,
      jsonlCount: jsonl.length,
      stats: this._aggregate(sessionId, events),
    };
  }

  // ── 调度骨架：stats ────────────────────────────────────────────────
  // 只要统计不要全量事件时用（前端"慢在哪"面板）
  static stats(sessionId: string): TraceStats {
    return this.read(sessionId).stats;
  }

  // ── 调度骨架：migrate ──────────────────────────────────────────────
  // 草稿会话首跑后拿到 claude 真实 uuid，把已写的轨迹文件改名到新 id 下（与 SessionMeta.migrate 同步调用）
  static migrate(oldSessionId: string, newSessionId: string): void {
    if (!oldSessionId) throw new Error(`TraceStore.migrate: invalid oldSessionId=${oldSessionId}`);
    if (!newSessionId) throw new Error(`TraceStore.migrate: invalid newSessionId=${newSessionId}`);
    if (oldSessionId === newSessionId) return;
    this._moveFile(oldSessionId, newSessionId);
  }

  // ── 调度骨架：remove ───────────────────────────────────────────────
  static remove(sessionId: string): void {
    if (!sessionId) throw new Error(`TraceStore.remove: invalid sessionId=${sessionId}`);
    this._removeFile(sessionId);
  }

  // ── 实现钩子（realize 填充）──
  static file(_sessionId: string): string { throw new Error('Not implemented'); }
  protected static _stamp(_sessionId: string, _ev: TraceInput): TraceEvent { throw new Error('Not implemented'); }
  protected static _append(_sessionId: string, _ev: TraceEvent): void { throw new Error('Not implemented'); }
  protected static _readLive(_sessionId: string): TraceEvent[] { throw new Error('Not implemented'); }
  protected static _readJsonl(_sessionId: string, _includeRaw: boolean): TraceEvent[] { throw new Error('Not implemented'); }
  protected static _merge(_live: TraceEvent[], _jsonl: TraceEvent[]): TraceEvent[] { throw new Error('Not implemented'); }
  protected static _annotate(_events: TraceEvent[]): TraceEvent[] { throw new Error('Not implemented'); }
  protected static _aggregate(_sessionId: string, _events: TraceEvent[]): TraceStats { throw new Error('Not implemented'); }
  protected static _moveFile(_oldSessionId: string, _newSessionId: string): void { throw new Error('Not implemented'); }
  protected static _removeFile(_sessionId: string): void { throw new Error('Not implemented'); }
}
