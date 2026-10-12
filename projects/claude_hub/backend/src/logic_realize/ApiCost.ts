// 按量 Key 计费（实现）：按 msgId 去重取最终 usage → 按服务商价目（Claude 官方 / OpenRouter / DeepSeek）逐请求计价
// → 用 result.modelUsage 补差。订阅登录跑的轮次也算一份「相当于多少钱」的估价，用 billing 标出来给前端区分。
import { ApiCostStruct } from '../logic_struct/ApiCostStruct';
import { Logger } from '../helper/Logger';
import {
  CLAUDE_PRICES, ModelPrice, DEEPSEEK_PRICES, DeepSeekPrice, DEEPSEEK_OFFPEAK_MULT, isDeepSeekPeak,
  CACHE_WRITE_5M_MULT, CACHE_WRITE_1H_MULT, CACHE_READ_DEFAULT_MULT,
  LONG_CONTEXT_THRESHOLD, LONG_CONTEXT_INPUT_MULT, LONG_CONTEXT_OUTPUT_MULT, WEB_SEARCH_USD,
  SUBSCRIPTION_PROVIDERS, CLOOTEE_PROVIDER,
} from '../config/ClaudePricing';
import { OpenRouterPrices } from './OpenRouterPrices';
import { ApiBilling, ApiCostLine, ApiSessionCost, ApiSessionTotals, ApiTurnCost, TraceEvent } from '../models/Types';

// 价目来源：Claude 官方 / OpenRouter 公开价目 / DeepSeek 官方价目
type Source = 'official' | 'openrouter' | 'deepseek';

interface Req {
  model: string;
  ts: number;              // 该请求发生的时间（DeepSeek 峰谷价按它判定）
  input: number;
  output: number;
  cacheRead: number;
  cw5m: number;
  cw1h: number;
  web: number;
  fast: boolean;
  reported: number | null; // 服务商在 usage.cost 里回报的本次实扣金额（OpenRouter 有）
}

type ModelUsage = Record<string, Record<string, number>>;

// 单次请求的每 token 单价（美元），已套用长上下文 / 分档 / fast / 峰谷倍率
interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  cw5m: number;
  cw1h: number;
  web: number;
}

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

  protected static _totals(ids: string[]): Record<string, ApiSessionTotals> {
    const out: Record<string, ApiSessionTotals> = {};
    for (const id of ids) {
      try {
        const s = this.session(String(id));
        if (s.turns.length) {
          const breakdown: ApiCostLine['usd'] = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, webSearch: 0 };
          const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
          for (const turn of s.turns) for (const line of turn.lines) {
            for (const key of Object.keys(breakdown) as (keyof typeof breakdown)[]) breakdown[key] += line.usd[key];
            tokens.input += line.inputTokens;
            tokens.output += line.outputTokens;
            tokens.cacheRead += line.cacheReadTokens;
            tokens.cacheWrite += line.cacheWrite5mTokens + line.cacheWrite1hTokens;
          }
          out[id] = { usd: s.totalUsd, sub: s.subscriptionUsd, breakdown, tokens,
            consumedMessages: s.turns.reduce((n, t) => n + t.consumedMessages, 0) };
        }
      } catch (e) {
        Logger.warn('ApiCost', `totals: skip id=${id} ${(e as Error).message}`);
      }
    }
    return out;
  }

  // 会话内所有 claude 轮次都计价：订阅轮次给等价估价（billing=subscription），按量轮次是真实支出。
  // Clootee 自有服务商的轮次由 ConsoleAccount 单独记账，这里跳过，免得同一笔钱算两次。
  protected static _compute(sessionId: string, events: TraceEvent[]): ApiSessionCost {
    const tasks = new Map<string, { ts: number; provider: string }>();
    for (const e of events) {
      if (e.kind !== 'task_start' || e.engine === 'codex') continue;
      const provider = String((e.raw as { provider?: string } | undefined)?.provider || '');
      if (provider === CLOOTEE_PROVIDER) continue;
      tasks.set(e.taskId, { ts: e.ts, provider });
    }
    const deltas = this._resultDeltas(events);
    const turns: ApiTurnCost[] = [];
    for (const [taskId, t] of tasks) {
      turns.push(this._turn(taskId, t.ts, t.provider, events.filter((e) => e.taskId === taskId), deltas.get(taskId)));
    }
    turns.sort((a, b) => a.startedAt - b.startedAt);
    return {
      sessionId,
      turns,
      totalUsd: this._round(turns.reduce((n, t) => n + t.totalUsd, 0)),
      subscriptionUsd: this._round(turns.filter((t) => t.billing === 'subscription').reduce((n, t) => n + t.totalUsd, 0)),
    };
  }

  // 订阅登录（official）不产生按量扣费，只给等价估价。
  // 老轨迹（task_start 还没有 provider 字段时）没记服务商：那时 Claude 原生模型只能走订阅登录，按模型推断。
  private static _billing(provider: string, events: TraceEvent[]): ApiBilling {
    if (SUBSCRIPTION_PROVIDERS.includes(provider)) return 'subscription';
    if (provider) return 'apikey';
    return events.some((e) => /^claude-/.test(String(e.model || '').toLowerCase())) ? 'subscription' : 'apikey';
  }

  // 价目来源：服务商优先（openrouter 会把 Anthropic 风格 id 映射到自己的价目），否则按模型 id 判定。
  private static _source(provider: string, model: string): Source {
    if (provider === 'openrouter') return 'openrouter';
    const id = String(model || '').toLowerCase();
    if (id.includes('/')) return 'openrouter'; // 带命名空间的 id（anthropic/…）只有 OpenRouter 会这么报
    if (id.startsWith('deepseek')) return 'deepseek';
    return 'official';
  }

  // CLI 的 result.total_cost_usd / modelUsage 是「整个会话（含 --resume 恢复的）累计值」，不是本轮：
  // 按时间顺序与上一次 result 相减得到本轮增量；数值回落（CLI 计数被重置）时当作从零开始。
  private static _resultDeltas(events: TraceEvent[]): Map<string, { cli: number | null; mu: ModelUsage | null }> {
    const out = new Map<string, { cli: number | null; mu: ModelUsage | null }>();
    let prevCost = 0;
    let prevMu: ModelUsage = {};
    let seenResult = false; // 之前出现过 result
    let muKnown = true;     // 上一次 result 带 modelUsage（否则累计基线未知，无法求差）
    const results = events.filter((e) => e.kind === 'result').sort((a, b) => a.ts - b.ts);
    for (const e of results) {
      const cost = typeof e.costUsd === 'number' ? e.costUsd : null;
      const mu = (e.raw as { model_usage?: ModelUsage } | undefined)?.model_usage || null;
      const reset = (cost !== null && cost < prevCost) || (mu !== null && this._dropped(prevMu, mu));
      const baseCost = reset ? 0 : prevCost;
      const baseMu = reset ? {} : prevMu;
      const delta: ModelUsage | null = mu && (reset || !seenResult || muKnown) ? {} : null;
      if (mu && delta) {
        for (const [model, m] of Object.entries(mu)) {
          const b = baseMu[model] || {};
          delta[model] = {};
          for (const k of Object.keys(m)) delta[model][k] = num(m[k]) - num(b[k]);
        }
      }
      out.set(e.taskId, { cli: cost === null ? null : this._round(cost - baseCost), mu: delta });
      if (cost !== null) prevCost = cost;
      if (mu) prevMu = mu;
      muKnown = !!mu;
      seenResult = true;
    }
    return out;
  }

  private static _dropped(prev: ModelUsage, cur: ModelUsage): boolean {
    for (const [model, p] of Object.entries(prev)) {
      const c = cur[model];
      if (!c || num(c.outputTokens) < num(p.outputTokens) || num(c.cacheReadInputTokens) < num(p.cacheReadInputTokens)) return true;
    }
    return false;
  }

  private static _turn(
    taskId: string, startedAt: number, provider: string, events: TraceEvent[], delta?: { cli: number | null; mu: ModelUsage | null },
  ): ApiTurnCost {
    // 同一条消息拆成多帧（每个内容块一帧）时 usage 重复出现，取 output 最大（最终）的那份
    const byMsg = new Map<string, Req>();
    const cliUsd = delta ? delta.cli : null;
    const modelUsage = delta ? delta.mu : null;
    for (const e of events) {
      if (e.kind === 'result' || !e.usage || !e.model) continue;
      const req = this._req(e.model, e.usage, e.ts);
      // 老轨迹没有 msgId（字段是后加的），内容块的 usage 快照会重复 → 用「模型 + token 快照」当去重键
      const key = e.msgId || `sig:${e.model}|${req.input}|${req.cacheRead}|${req.cw5m}|${req.cw1h}`;
      const prev = byMsg.get(key);
      if (!prev || req.output >= prev.output) byMsg.set(key, req);
    }

    const lines = new Map<string, ApiCostLine>();
    let consumedMessages = 0;
    for (const r of byMsg.values()) {
      const single = new Map<string, ApiCostLine>();
      this._add(single, provider, false, r, 1);
      if ([...single.values()].some((l) => this._finish(l).totalUsd > 0)) consumedMessages++;
    }
    for (const r of byMsg.values()) this._add(lines, provider, false, r, 1);
    if (modelUsage) this._addMissing(lines, provider, modelUsage, startedAt);
    const list = [...lines.values()].map((l) => this._finish(l));
    return {
      taskId, provider, billing: this._billing(provider, events), startedAt, consumedMessages,
      lines: list, totalUsd: this._round(list.reduce((n, l) => n + l.totalUsd, 0)), cliUsd,
    };
  }

  private static _req(model: string, u: Record<string, unknown>, ts: number): Req {
    const cc = (u.cache_creation || null) as Record<string, unknown> | null;
    const create = num(u.cache_creation_input_tokens);
    const cw1h = cc ? num(cc.ephemeral_1h_input_tokens) : 0;
    // 没有细分对象（或细分加起来不足）时，剩余部分按 5 分钟 TTL 计（CLI 默认）
    const cw5m = cc ? Math.max(num(cc.ephemeral_5m_input_tokens), create - cw1h) : create;
    const stu = (u.server_tool_use || null) as Record<string, unknown> | null;
    return {
      model,
      ts: num(ts),
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cw5m,
      cw1h,
      web: stu ? num(stu.web_search_requests) : 0,
      fast: u.speed === 'fast',
      reported: typeof u.cost === 'number' && Number.isFinite(u.cost) ? u.cost : null,
    };
  }

  private static _blank(provider: string, model: string, extra: boolean): ApiCostLine {
    return {
      model, priced: this._isPriced(provider, model), extra, requests: 0, reportedUsd: 0, reportedRequests: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, webSearches: 0,
      usd: { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, webSearch: 0 },
      totalUsd: 0,
    };
  }

  // 每个请求单独计价（长上下文 / fast / 峰谷按单次请求判定），再累加进按模型的行
  private static _add(lines: Map<string, ApiCostLine>, provider: string, extra: boolean, r: Req, requests: number): void {
    const key = `${extra ? 'x:' : ''}${r.model}`;
    const line = lines.get(key) || this._blank(provider, r.model, extra);
    lines.set(key, line);
    line.requests += requests;
    line.inputTokens += r.input;
    line.outputTokens += r.output;
    line.cacheReadTokens += r.cacheRead;
    line.cacheWrite5mTokens += r.cw5m;
    line.cacheWrite1hTokens += r.cw1h;
    line.webSearches += r.web;
    if (requests && r.reported !== null) {
      line.reportedUsd = (line.reportedUsd || 0) + r.reported;
      line.reportedRequests = (line.reportedRequests || 0) + requests;
    }
    const rt = this._rates(provider, r);
    if (!rt) return;
    line.usd.input += r.input * rt.input;
    line.usd.output += r.output * rt.output;
    line.usd.cacheRead += r.cacheRead * rt.cacheRead;
    line.usd.cacheWrite5m += r.cw5m * rt.cw5m;
    line.usd.cacheWrite1h += r.cw1h * rt.cw1h;
    line.usd.webSearch += r.web * rt.web;
  }

  private static _isPriced(provider: string, model: string): boolean {
    switch (this._source(provider, model)) {
      case 'openrouter': return !!OpenRouterPrices.lookup(model);
      case 'deepseek': return !!this._dsPrice(model);
      default: return !!this._price(model);
    }
  }

  private static _rates(provider: string, r: Req): Rates | null {
    switch (this._source(provider, r.model)) {
      case 'openrouter': return this._orRates(r);
      case 'deepseek': return this._dsRates(r);
      default: return this._officialRates(r);
    }
  }

  // Anthropic 官方价目：缓存写 5m=1.25x、1h=2x；老 Sonnet 4.x 超 200K 长上下文加价；fast 整体倍率
  private static _officialRates(r: Req): Rates | null {
    const p = this._price(r.model);
    if (!p) return null;
    const long = !!p.longContext && r.input + r.cacheRead + r.cw5m + r.cw1h > LONG_CONTEXT_THRESHOLD;
    const fast = r.fast && p.fastMult ? p.fastMult : 1;
    const inMult = (long ? LONG_CONTEXT_INPUT_MULT : 1) * fast;
    const input = (p.input * inMult) / MTOK;
    return {
      input,
      output: (p.output * (long ? LONG_CONTEXT_OUTPUT_MULT : 1) * fast) / MTOK,
      cacheRead: p.cacheRead !== undefined ? (p.cacheRead * inMult) / MTOK : input * CACHE_READ_DEFAULT_MULT,
      cw5m: input * CACHE_WRITE_5M_MULT,
      cw1h: input * CACHE_WRITE_1H_MULT,
      web: WEB_SEARCH_USD,
    };
  }

  // DeepSeek 官方价目：没有「缓存写」这项，写进缓存按未命中输入价计；高峰/非高峰按请求发生时间判定
  private static _dsRates(r: Req): Rates | null {
    const p = this._dsPrice(r.model);
    if (!p) return null;
    const mult = isDeepSeekPeak(r.ts) ? 1 : DEEPSEEK_OFFPEAK_MULT;
    const input = (p.input * mult) / MTOK;
    return {
      input,
      output: (p.output * mult) / MTOK,
      cacheRead: (p.cacheRead * mult) / MTOK,
      cw5m: input,
      cw1h: input,
      web: 0,
    };
  }

  // OpenRouter 公开价目（每 token 美元）：按本次请求的输入总量套用最高一档 overrides；
  // 缺缓存价的模型：读按输入价、写按输入价、1h 写按 5m 写价
  private static _orRates(r: Req): Rates | null {
    const p = OpenRouterPrices.lookup(r.model);
    if (!p) return null;
    const promptTokens = r.input + r.cacheRead + r.cw5m + r.cw1h;
    const tier = p.overrides
      .filter((o) => promptTokens >= o.minPromptTokens)
      .sort((a, b) => b.minPromptTokens - a.minPromptTokens)[0];
    const input = tier?.prompt ?? p.prompt;
    const cw5m = tier?.cacheWrite ?? p.cacheWrite ?? input;
    return {
      input,
      output: tier?.completion ?? p.completion,
      cacheRead: tier?.cacheRead ?? p.cacheRead ?? input,
      cw5m,
      cw1h: tier?.cacheWrite1h ?? p.cacheWrite1h ?? cw5m,
      web: p.webSearch,
    };
  }

  // CLI 的 result.modelUsage 含后台调用（如 Haiku 生成标题），消息流里看不到 → 按差额补一行
  private static _addMissing(lines: Map<string, ApiCostLine>, provider: string, mu: ModelUsage, ts: number): void {
    for (const [model, m] of Object.entries(mu)) {
      const seen = [...lines.values()].filter((l) => !l.extra && this._norm(l.model) === this._norm(model));
      const sum = (f: (l: ApiCostLine) => number) => seen.reduce((s, l) => s + f(l), 0);
      const diff: Req = {
        model,
        ts,
        input: Math.max(0, num(m.inputTokens) - sum((l) => l.inputTokens)),
        output: Math.max(0, num(m.outputTokens) - sum((l) => l.outputTokens)),
        cacheRead: Math.max(0, num(m.cacheReadInputTokens) - sum((l) => l.cacheReadTokens)),
        cw5m: Math.max(0, num(m.cacheCreationInputTokens) - sum((l) => l.cacheWrite5mTokens + l.cacheWrite1hTokens)),
        cw1h: 0,
        web: Math.max(0, num(m.webSearchRequests) - sum((l) => l.webSearches)),
        fast: false,
        reported: null,
      };
      // 消息流里见过的模型：差额是最后一帧没带全的 token，并回该模型的行；没见过的才是后台调用
      if (diff.input + diff.output + diff.cacheRead + diff.cw5m + diff.web > 0) this._add(lines, provider, seen.length === 0, diff, 0);
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
    // 每个请求都有服务商实扣金额时以它为准（含渠道附加费等价目表看不到的部分），分项仍按价目给出
    const allReported = l.requests > 0 && l.reportedRequests === l.requests;
    return { ...l, usd, totalUsd: this._round(allReported ? l.reportedUsd || 0 : total), reportedUsd: this._round(l.reportedUsd || 0) };
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

  // DeepSeek 同理做最长前缀匹配：deepseek-v4-1-flash-260910 → deepseek-v4-1-flash
  private static _dsPrice(model: string): DeepSeekPrice | null {
    const id = String(model || '').toLowerCase().replace(/\[.*?\]/g, '').replace(/-\d{8}$/, '').trim();
    let best = '';
    for (const k of Object.keys(DEEPSEEK_PRICES)) {
      if ((id === k || id.startsWith(`${k}-`)) && k.length > best.length) best = k;
    }
    return best ? DEEPSEEK_PRICES[best] : null;
  }

  // 保留到 1e-9 美元，去掉浮点尾巴
  private static _round(v: number): number {
    return Math.round(v * 1e9) / 1e9;
  }
}
