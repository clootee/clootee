// Claude 官方 API 计费（实现）：按 msgId 去重取最终 usage → 按模型价目逐请求计价 → 用 result.modelUsage 补差。
import { ApiCostStruct } from '../logic_struct/ApiCostStruct';
import { Logger } from '../helper/Logger';
import {
  CLAUDE_PRICES, ModelPrice, CACHE_WRITE_5M_MULT, CACHE_WRITE_1H_MULT, CACHE_READ_DEFAULT_MULT,
  LONG_CONTEXT_THRESHOLD, LONG_CONTEXT_INPUT_MULT, LONG_CONTEXT_OUTPUT_MULT, WEB_SEARCH_USD, API_COST_PROVIDER,
} from '../config/ClaudePricing';
import { ApiCostLine, ApiSessionCost, ApiTurnCost, TraceEvent } from '../models/Types';

interface Req {
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cw5m: number;
  cw1h: number;
  web: number;
  fast: boolean;
}

type ModelUsage = Record<string, Record<string, number>>;

const MTOK = 1_000_000;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export class ApiCost extends ApiCostStruct {
  private static _cache = new Map<string, { stamp: string; value: ApiSessionCost }>();

  protected static _cached(id: string, stamp: string, fn: () => ApiSessionCost): ApiSessionCost {
    const hit = this._cache.get(id);
    if (hit && hit.stamp === stamp && stamp !== 'none') return hit.value;
    const value = fn();
    this._cache.set(id, { stamp, value });
    return value;
  }

  protected static _totals(ids: string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const id of ids) {
      try {
        const s = this.session(String(id));
        if (s.turns.length) out[id] = s.totalUsd;
      } catch (e) {
        Logger.warn('ApiCost', `totals: skip id=${id} ${(e as Error).message}`);
      }
    }
    return out;
  }

  protected static _compute(sessionId: string, events: TraceEvent[]): ApiSessionCost {
    const apiTasks = new Map<string, number>(); // taskId → startedAt
    for (const e of events) {
      const raw = e.raw as { provider?: string } | undefined;
      if (e.kind === 'task_start' && e.engine !== 'codex' && raw?.provider === API_COST_PROVIDER) apiTasks.set(e.taskId, e.ts);
    }
    const turns: ApiTurnCost[] = [];
    for (const [taskId, startedAt] of apiTasks) {
      turns.push(this._turn(taskId, startedAt, events.filter((e) => e.taskId === taskId)));
    }
    turns.sort((a, b) => a.startedAt - b.startedAt);
    return { sessionId, turns, totalUsd: this._round(turns.reduce((n, t) => n + t.totalUsd, 0)) };
  }

  private static _turn(taskId: string, startedAt: number, events: TraceEvent[]): ApiTurnCost {
    // 同一条消息拆成多帧（每个内容块一帧）时 usage 重复出现，取 output 最大（最终）的那份
    const byMsg = new Map<string, Req>();
    let anon = 0;
    let cliUsd: number | null = null;
    let modelUsage: ModelUsage | null = null;
    for (const e of events) {
      if (e.kind === 'result') {
        if (typeof e.costUsd === 'number') cliUsd = e.costUsd;
        const mu = (e.raw as { model_usage?: ModelUsage } | undefined)?.model_usage;
        if (mu && typeof mu === 'object') modelUsage = mu;
        continue;
      }
      if (!e.usage || !e.model) continue;
      const req = this._req(e.model, e.usage);
      const key = e.msgId || `anon-${anon++}`;
      const prev = byMsg.get(key);
      if (!prev || req.output >= prev.output) byMsg.set(key, req);
    }

    const lines = new Map<string, ApiCostLine>();
    for (const r of byMsg.values()) this._add(lines, false, r, 1);
    if (modelUsage) this._addMissing(lines, modelUsage);
    const list = [...lines.values()].map((l) => this._finish(l));
    return { taskId, startedAt, lines: list, totalUsd: this._round(list.reduce((n, l) => n + l.totalUsd, 0)), cliUsd };
  }

  private static _req(model: string, u: Record<string, unknown>): Req {
    const cc = (u.cache_creation || null) as Record<string, unknown> | null;
    const create = num(u.cache_creation_input_tokens);
    const cw1h = cc ? num(cc.ephemeral_1h_input_tokens) : 0;
    // 没有细分对象（或细分加起来不足）时，剩余部分按 5 分钟 TTL 计（CLI 默认）
    const cw5m = cc ? Math.max(num(cc.ephemeral_5m_input_tokens), create - cw1h) : create;
    const stu = (u.server_tool_use || null) as Record<string, unknown> | null;
    return {
      model,
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cw5m,
      cw1h,
      web: stu ? num(stu.web_search_requests) : 0,
      fast: u.speed === 'fast',
    };
  }

  private static _blank(model: string, extra: boolean): ApiCostLine {
    return {
      model, priced: !!this._price(model), extra, requests: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, webSearches: 0,
      usd: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, webSearch: 0 },
      totalUsd: 0,
    };
  }

  // 每个请求单独计价（长上下文 / fast 倍率按单次请求判定），再累加进按模型的行
  private static _add(lines: Map<string, ApiCostLine>, extra: boolean, r: Req, requests: number): void {
    const key = `${extra ? 'x:' : ''}${r.model}`;
    const line = lines.get(key) || this._blank(r.model, extra);
    lines.set(key, line);
    line.requests += requests;
    line.inputTokens += r.input;
    line.outputTokens += r.output;
    line.cacheReadTokens += r.cacheRead;
    line.cacheWrite5mTokens += r.cw5m;
    line.cacheWrite1hTokens += r.cw1h;
    line.webSearches += r.web;
    line.usd.webSearch += r.web * WEB_SEARCH_USD;
    const p = this._price(r.model);
    if (!p) return;
    const long = !!p.longContext && r.input + r.cacheRead + r.cw5m + r.cw1h > LONG_CONTEXT_THRESHOLD;
    const fast = r.fast && p.fastMult ? p.fastMult : 1;
    const inMult = (long ? LONG_CONTEXT_INPUT_MULT : 1) * fast;
    const inRate = (p.input * inMult) / MTOK;
    const outRate = (p.output * (long ? LONG_CONTEXT_OUTPUT_MULT : 1) * fast) / MTOK;
    const readRate = p.cacheRead !== undefined ? (p.cacheRead * inMult) / MTOK : inRate * CACHE_READ_DEFAULT_MULT;
    line.usd.input += r.input * inRate;
    line.usd.output += r.output * outRate;
    line.usd.cacheRead += r.cacheRead * readRate;
    line.usd.cacheWrite5m += r.cw5m * inRate * CACHE_WRITE_5M_MULT;
    line.usd.cacheWrite1h += r.cw1h * inRate * CACHE_WRITE_1H_MULT;
  }

  // CLI 的 result.modelUsage 含后台调用（如 Haiku 生成标题），消息流里看不到 → 按差额补一行
  private static _addMissing(lines: Map<string, ApiCostLine>, mu: ModelUsage): void {
    for (const [model, m] of Object.entries(mu)) {
      const seen = [...lines.values()].filter((l) => !l.extra && this._norm(l.model) === this._norm(model));
      const sum = (f: (l: ApiCostLine) => number) => seen.reduce((s, l) => s + f(l), 0);
      const diff: Req = {
        model,
        input: Math.max(0, num(m.inputTokens) - sum((l) => l.inputTokens)),
        output: Math.max(0, num(m.outputTokens) - sum((l) => l.outputTokens)),
        cacheRead: Math.max(0, num(m.cacheReadInputTokens) - sum((l) => l.cacheReadTokens)),
        cw5m: Math.max(0, num(m.cacheCreationInputTokens) - sum((l) => l.cacheWrite5mTokens + l.cacheWrite1hTokens)),
        cw1h: 0,
        web: Math.max(0, num(m.webSearchRequests) - sum((l) => l.webSearches)),
        fast: false,
      };
      // 消息流里见过的模型：差额是最后一帧没带全的 token，并回该模型的行；没见过的才是后台调用
      if (diff.input + diff.output + diff.cacheRead + diff.cw5m + diff.web > 0) this._add(lines, seen.length === 0, diff, 0);
    }
  }

  private static _finish(l: ApiCostLine): ApiCostLine {
    const u = l.usd;
    const total = u.input + u.output + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h + u.webSearch;
    const usd = {
      input: this._round(u.input),
      output: this._round(u.output),
      cacheRead: this._round(u.cacheRead),
      cacheWrite5m: this._round(u.cacheWrite5m),
      cacheWrite1h: this._round(u.cacheWrite1h),
      webSearch: this._round(u.webSearch),
    };
    return { ...l, usd, totalUsd: this._round(total) };
  }

  // 模型 id 归一：去掉区域/anthropic. 前缀、[1m] 标记、@版本、日期后缀
  private static _norm(model: string): string {
    return String(model || '').toLowerCase()
      .replace(/^(us\.|eu\.|apac\.|global\.)?anthropic\./, '')
      .replace(/\[.*?\]/g, '')
      .replace(/@.*$/, '')
      .replace(/-v\d+(:\d+)?$/, '')
      .replace(/-\d{8}$/, '')
      .trim();
  }

  // 最长前缀匹配（边界必须是结尾或「-」），避免 claude-opus-5 吃掉 claude-opus-5-5
  private static _price(model: string): ModelPrice | null {
    const id = this._norm(model);
    let best = '';
    for (const k of Object.keys(CLAUDE_PRICES)) {
      if ((id === k || id.startsWith(`${k}-`)) && k.length > best.length) best = k;
    }
    return best ? CLAUDE_PRICES[best] : null;
  }

  // 保留到 1e-9 美元，去掉浮点尾巴
  private static _round(v: number): number {
    return Math.round(v * 1e9) / 1e9;
  }
}
