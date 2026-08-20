// 过程轨迹存储（实现）：落盘位置、jsonl 反推、合并去重、耗时计算与统计聚合。
// 落盘：data/traces/<rootId>/<claudeSessionId>.jsonl，一行一个 TraceEvent（不截断任何字段）。
// 跨平台：全部走 path.join + fs，无 shell 依赖。
import * as path from 'path';
import { TraceStoreStruct, TraceInput } from '../logic_struct/TraceStoreStruct';
import { JsonlStore } from '../helper/JsonlStore';
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { Paths } from '../paths';
import { RootManager } from './RootManager';
import { TraceEvent, TraceStats, TraceToolStat, TraceSlow, TraceTaskStat, TracePhaseBreakdown, TraceCounts } from '../models/Types';

interface RawFrame {
  type?: string;
  timestamp?: string;
  uuid?: string;
  message?: { role?: string; model?: string; content?: unknown; usage?: Record<string, unknown> };
  toolUseResult?: unknown;
}

export class TraceStore extends TraceStoreStruct {
  // 每会话的自增序号（进程内）。重启后从已落盘的最大 seq 续接，保证单调。
  private static _seq = new Map<string, number>();

  static file(sessionId: string): string {
    if (!sessionId) throw new Error(`TraceStore.file: invalid sessionId=${sessionId}`);
    const { rootId, uuid } = this._split(sessionId);
    return path.join(Paths.TRACES_DIR, this._safe(rootId), `${this._safe(uuid)}.jsonl`);
  }

  protected static _stamp(sessionId: string, ev: TraceInput): TraceEvent {
    const seq = this._nextSeq(sessionId);
    return { ...ev, seq, ts: ev.ts || Date.now(), source: 'live' } as TraceEvent;
  }

  protected static _append(sessionId: string, ev: TraceEvent): void {
    JsonlStore.append(this.file(sessionId), ev);
  }

  protected static _readLive(sessionId: string): TraceEvent[] {
    return JsonlStore.readAll<TraceEvent>(this.file(sessionId)).map((e) => ({ ...e, source: 'live' }));
  }

  // 从 claude 自己的 jsonl 反推事件。会话是 codex 的 / 文件不存在 / 根目录已删 → 返回 []
  protected static _readJsonl(sessionId: string, includeRaw: boolean): TraceEvent[] {
    const { rootId, uuid } = this._split(sessionId);
    if (!uuid || uuid.startsWith('draft-')) return [];
    let rootPath = '';
    try {
      rootPath = RootManager.getRoot(rootId).path;
    } catch {
      return [];
    }
    if (!ClaudeStoreHelper.sessionExists(rootPath, uuid)) return [];

    const out: TraceEvent[] = [];
    let seq = 0;
    for (const ln of ClaudeStoreHelper.readLines(ClaudeStoreHelper.sessionFile(rootPath, uuid))) {
      const f = this._parseFrame(ln);
      if (!f) continue;
      const ts = f.timestamp ? Date.parse(f.timestamp) || 0 : 0;
      const blocks = Array.isArray(f.message?.content) ? (f.message!.content as any[]) : null;

      if (!blocks) {
        if (includeRaw) out.push(this._jsonlEvent(seq++, ts, { kind: 'raw', name: f.type, raw: f }));
        continue;
      }

      let usageAttached = false;
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue;
        // 每帧的 usage/model 只挂在该帧第一个事件上，避免聚合时重复计数
        const extra = usageAttached
          ? {}
          : { model: f.message?.model, usage: f.message?.usage };
        if (f.message?.usage || f.message?.model) usageAttached = true;

        if (b.type === 'thinking') {
          // claude 落盘时会抹掉 thinking 正文（只剩 signature），这里如实反映为空文本
          out.push(this._jsonlEvent(seq++, ts, { kind: 'thinking', text: String(b.thinking || ''), ...extra }));
        } else if (b.type === 'text') {
          out.push(this._jsonlEvent(seq++, ts, { kind: 'text', text: String(b.text || ''), ...extra }));
        } else if (b.type === 'tool_use') {
          out.push(
            this._jsonlEvent(seq++, ts, {
              kind: 'tool_use',
              name: String(b.name || 'tool'),
              toolId: String(b.id || ''),
              input: b.input,
              ...extra,
            }),
          );
        } else if (b.type === 'tool_result') {
          out.push(
            this._jsonlEvent(seq++, ts, {
              kind: 'tool_result',
              toolId: String(b.tool_use_id || ''),
              output: this._text(b.content),
              isError: !!b.is_error,
              // toolUseResult 是 claude 附带的结构化结果（如文件内容/命令退出码），一并留存
              raw: f.toolUseResult,
              ...extra,
            }),
          );
        } else if (includeRaw) {
          out.push(this._jsonlEvent(seq++, ts, { kind: 'raw', name: String(b.type || ''), raw: b }));
        }
      }
    }
    return out;
  }

  // 合并：jsonl 为权威（text/tool_use/tool_result 以它为准），live 只补 jsonl 没有的种类。
  // jsonl 为空（终端外的 codex 会话 / 文件被删）时，live 全量保留。
  protected static _merge(live: TraceEvent[], jsonl: TraceEvent[]): TraceEvent[] {
    if (jsonl.length === 0) return [...live].sort(this._byTime);
    const dupKinds = new Set(['text', 'tool_use', 'tool_result']);
    const liveKept = live.filter((e) => !dupKinds.has(e.kind));
    return [...jsonl, ...liveKept].sort(this._byTime);
  }

  // 标注耗时：tool_result.durationMs = 与同 toolId 的 tool_use 间隔；每个事件的 gapMs = 与前一事件间隔
  protected static _annotate(events: TraceEvent[]): TraceEvent[] {
    const useTs = new Map<string, number>();
    for (const e of events) {
      if (e.kind === 'tool_use' && e.toolId) useTs.set(e.toolId, e.ts);
    }
    let prev = 0;
    return events.map((e) => {
      const gapMs = prev ? Math.max(0, e.ts - prev) : 0;
      prev = e.ts;
      const start = e.kind === 'tool_result' && e.toolId ? useTs.get(e.toolId) : undefined;
      const durationMs = start ? Math.max(0, e.ts - start) : undefined;
      return durationMs !== undefined ? { ...e, gapMs, durationMs } : { ...e, gapMs };
    });
  }

  protected static _aggregate(sessionId: string, events: TraceEvent[]): TraceStats {
    const first = events.length ? events[0].ts : 0;
    const last = events.length ? events[events.length - 1].ts : 0;
    const spanMs = Math.max(0, last - first);

    const nameOf = new Map<string, string>();
    for (const e of events) if (e.kind === 'tool_use' && e.toolId) nameOf.set(e.toolId, e.name || 'tool');

    const tools = new Map<string, TraceToolStat>();
    const slow: TraceSlow[] = [];
    const briefOf = new Map<string, string>();
    for (const e of events) {
      if (e.kind === 'tool_use' && e.toolId) briefOf.set(e.toolId, this._brief(e.input));
    }

    let toolMs = 0;
    let toolCalls = 0;
    for (const e of events) {
      if (e.kind !== 'tool_result' || e.durationMs === undefined) continue;
      const name = (e.toolId && nameOf.get(e.toolId)) || 'tool';
      const ms = e.durationMs;
      toolMs += ms;
      toolCalls++;
      const cur = tools.get(name) || { name, count: 0, totalMs: 0, avgMs: 0, maxMs: 0 };
      cur.count++;
      cur.totalMs += ms;
      cur.maxMs = Math.max(cur.maxMs, ms);
      cur.avgMs = Math.round(cur.totalMs / cur.count);
      tools.set(name, cur);
      slow.push({ name, ms, ts: e.ts, brief: (e.toolId && briefOf.get(e.toolId)) || '' });
    }

    const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
    for (const e of events) {
      if (e.costUsd) usage.costUsd += e.costUsd;
      const u = e.usage as Record<string, number> | undefined;
      if (!u) continue;
      usage.inputTokens += Number(u.input_tokens || 0);
      usage.outputTokens += Number(u.output_tokens || 0);
      usage.cacheReadTokens += Number(u.cache_read_input_tokens || 0);
      usage.cacheCreationTokens += Number(u.cache_creation_input_tokens || 0);
    }

    const phases = this._phases(events);

    return {
      sessionId,
      events: events.length,
      spanMs,
      activeMs: Math.max(0, spanMs - phases.idle),
      rounds: this._rounds(events),
      toolMs,
      modelMs: Math.max(0, spanMs - toolMs),
      phases,
      counts: this._counts(events),
      toolCalls,
      byTool: [...tools.values()].sort((a, b) => b.totalMs - a.totalMs),
      slowest: slow.sort((a, b) => b.ms - a.ms).slice(0, 10),
      usage,
      byTask: this._byTask(events),
    };
  }

  protected static _moveFile(oldSessionId: string, newSessionId: string): void {
    JsonlStore.rename(this.file(oldSessionId), this.file(newSessionId));
    this._seq.delete(oldSessionId);
  }

  protected static _removeFile(sessionId: string): void {
    JsonlStore.remove(this.file(sessionId));
    this._seq.delete(sessionId);
  }

  // ── 内部纯实现 ──

  // 按任务汇总：以 task_start 事件的时间为边界把事件切成若干时间窗，逐窗统计。
  // 之所以按「时间窗」而非 e.taskId：live 事件带真实 task 号、jsonl 反推事件统一是 native，
  // 两路混排时按 taskId 分组会把同一时间段的事件拆到不同桶、产生跨越整段的假任务。
  // 时间切分对两种来源都成立；任务之间的用户空闲天然落在窗与窗的边界外，不计入任一任务。
  private static _byTask(events: TraceEvent[]): TraceTaskStat[] {
    if (events.length === 0) return [];
    const starts = events.filter((e) => e.kind === 'task_start');
    // 无 task_start（纯终端 jsonl 反推）→ 整段视为一个 native 任务
    const bounds =
      starts.length === 0
        ? [{ ts: events[0].ts, taskId: 'native' }]
        : starts.map((e) => ({ ts: e.ts, taskId: e.taskId || 'native' }));

    return bounds
      .map((b, i) => {
        const from = i === 0 ? -Infinity : b.ts;
        const to = i + 1 < bounds.length ? bounds[i + 1].ts : Infinity;
        const evs = events.filter((e) => e.ts >= from && e.ts < to);
        if (evs.length === 0) return null;
        const startedAt = evs[0].ts;
        const endedAt = evs[evs.length - 1].ts;
        const totalMs = Math.max(0, endedAt - startedAt);
        let toolMs = 0;
        let toolCalls = 0;
        for (const e of evs) {
          if (e.kind === 'tool_result' && e.durationMs !== undefined) {
            toolMs += e.durationMs;
            toolCalls++;
          }
        }
        return {
          taskId: b.taskId,
          startedAt,
          endedAt,
          totalMs,
          toolMs,
          modelMs: Math.max(0, totalMs - toolMs),
          toolCalls,
          phases: this._phases(evs),
        } as TraceTaskStat;
      })
      .filter((t): t is TraceTaskStat => t !== null);
  }

  // 单个间隙超过此阈值：几乎不可能是「一次连续的 AI 步骤」（思考有 ~1.5s 心跳、
  // 生成逐 token、工具结果会回来），因此判为用户离开的空闲，不计入 AI 工作时间。
  // 这条规则对「原生终端会话没有 task_start/task_end 标记、却跨天累积」的情况尤其关键。
  private static readonly IDLE_GAP_MS = 120000;
  private static readonly _BG_NAMES = new Set([
    'task_started', 'task_notification', 'task_updated', 'task_progress', 'background_tasks_changed',
  ]);

  // 细分耗时：按「相邻事件的间隙」归类到 thinking/生成/等首token/工具/后台/空闲… 各桶。
  // 归类依据 = 间隙前后两个事件的种类 + 间隙长度；单位 ms。所有间隙都会被计入某一桶，
  // 因此各桶之和恒等于首末事件跨度（spanMs），activeMs = spanMs - idle。
  private static _phases(events: TraceEvent[]): TracePhaseBreakdown {
    const b: TracePhaseBreakdown = {
      ttft: 0, think: 0, genTool: 0, genText: 0, toolExec: 0, bgTask: 0, idle: 0, startup: 0, other: 0,
    };
    const isTH = (e: TraceEvent) => e.kind === 'system' && e.name === 'thinking_tokens';
    const isInit = (e: TraceEvent) => e.kind === 'system' && e.name === 'init';
    const isBg = (e: TraceEvent) => e.kind === 'system' && this._BG_NAMES.has(e.name || '');
    for (let i = 1; i < events.length; i++) {
      const p = events[i - 1];
      const c = events[i];
      const d = Math.max(0, c.ts - p.ts);
      if (d === 0) continue;
      let cat: keyof TracePhaseBreakdown;
      // 1) 工具真实执行 / 后台任务：直接测量，多久都算工作时间（长构建也是 AI 在推进）
      if (p.kind === 'tool_use' && c.kind === 'tool_result') cat = 'toolExec';
      else if (isBg(p) || isBg(c)) cat = 'bgTask';
      // 2) 会话/任务边界后的等待，或任何超长间隙 = 用户空闲（人不在）
      else if (c.kind === 'task_start' || d > this.IDLE_GAP_MS) cat = 'idle';
      // 3) 启动：task_start / init 帧附近
      else if (p.kind === 'task_start' || isInit(p) || isInit(c)) cat = 'startup';
      // 4) 思考：思考心跳之间 = 生成思考；心跳前的等待（工具结果后）= 等首 token
      else if (isTH(p)) cat = 'think';
      else if (isTH(c)) cat = (p.kind === 'tool_result' || p.kind === 'text' || p.kind === 'result') ? 'ttft' : 'think';
      // 5) 生成：工具调用入参 / 可见文字 / 思考正文
      else if (c.kind === 'tool_use') cat = 'genTool';
      else if (c.kind === 'text') cat = 'genText';
      else if (c.kind === 'thinking') cat = 'think';
      // 6) 工具结果 → 本轮收尾（无思考的一轮）= 等首 token
      else if (p.kind === 'tool_result' && (c.kind === 'result' || c.kind === 'task_end')) cat = 'ttft';
      else cat = 'other';
      b[cat] += d;
    }
    return b;
  }

  // 各类次数/数量统计：一遍扫描累计。
  private static _counts(events: TraceEvent[]): TraceCounts {
    const c: TraceCounts = {
      tasks: 0, turns: 0, textBlocks: 0, textChars: 0, thinkingBlocks: 0, thinkingChars: 0,
      toolUses: 0, toolErrors: 0, toolOutputChars: 0, stderrs: 0, retries: 0, bgTasks: 0,
    };
    for (const e of events) {
      if (e.kind === 'task_start') c.tasks++;
      else if (e.kind === 'result') c.turns++;
      else if (e.kind === 'text') { c.textBlocks++; c.textChars += (e.text || '').length; }
      else if (e.kind === 'thinking') { c.thinkingBlocks++; c.thinkingChars += (e.text || '').length; }
      else if (e.kind === 'tool_use') c.toolUses++;
      else if (e.kind === 'tool_result') { if (e.isError) c.toolErrors++; c.toolOutputChars += (e.output || '').length; }
      else if (e.kind === 'stderr') c.stderrs++;
      else if (e.kind === 'system' && e.name === 'api_retry') c.retries++;
      else if (e.kind === 'system' && e.name === 'task_started') c.bgTasks++;
    }
    return c;
  }

  // 模型请求轮数：每次「工具结果/任务开始」之后模型重新吐出第一个 token 算一轮。
  private static _rounds(events: TraceEvent[]): number {
    const starts = new Set(['thinking', 'text', 'tool_use']);
    let n = 0;
    for (let i = 1; i < events.length; i++) {
      const p = events[i - 1];
      const c = events[i];
      const cStart = starts.has(c.kind) || (c.kind === 'system' && c.name === 'thinking_tokens');
      if ((p.kind === 'tool_result' || p.kind === 'task_start') && cStart) n++;
    }
    return n;
  }

  private static _jsonlEvent(seq: number, ts: number, part: Partial<TraceEvent>): TraceEvent {
    return { seq, ts, taskId: 'native', source: 'jsonl', kind: 'raw', ...part } as TraceEvent;
  }

  private static _parseFrame(ln: string): RawFrame | null {
    try {
      return JSON.parse(ln) as RawFrame;
    } catch {
      return null;
    }
  }

  // tool_result 的 content 可能是字符串或块数组，统一成完整文本（不截断）
  private static _text(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((c: any) => (c && typeof c === 'object' && typeof c.text === 'string' ? c.text : JSON.stringify(c)))
        .join('\n');
    }
    if (content === undefined || content === null) return '';
    return JSON.stringify(content);
  }

  private static _brief(input: unknown): string {
    try {
      const s = typeof input === 'string' ? input : JSON.stringify(input);
      return s.length > 200 ? s.slice(0, 200) + '…' : s;
    } catch {
      return '';
    }
  }

  private static _byTime(a: TraceEvent, b: TraceEvent): number {
    return a.ts - b.ts || a.seq - b.seq;
  }

  private static _nextSeq(sessionId: string): number {
    let n = this._seq.get(sessionId);
    if (n === undefined) {
      const existing = JsonlStore.readAll<TraceEvent>(this.file(sessionId));
      n = existing.reduce((m, e) => Math.max(m, Number(e.seq) || 0), 0);
    }
    n += 1;
    this._seq.set(sessionId, n);
    return n;
  }

  // sessionId = `<rootId>:<uuid>`；无冒号时整串当 uuid，rootId 归入 _misc
  private static _split(sessionId: string): { rootId: string; uuid: string } {
    const i = sessionId.indexOf(':');
    if (i < 0) return { rootId: '_misc', uuid: sessionId };
    return { rootId: sessionId.slice(0, i), uuid: sessionId.slice(i + 1) };
  }

  // 文件名安全化：非字母数字下划线短横一律替换，避免 id 里的字符击穿路径
  private static _safe(s: string): string {
    return (s || '_').replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}
