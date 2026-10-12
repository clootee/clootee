// ApiCost 计价自测：node test/api_cost.js（需先 npm run build）
// 覆盖：msgId 去重、5m/1h 缓存写分开计价、缓存读专属价、modelUsage 补差、订阅轮次算等价估价、
// DeepSeek 峰谷价、老轨迹（task_start 没记服务商）按模型推断、Clootee 自有服务商不重复统计。
const assert = require('assert');
const { ApiCost } = require('../dist/logic_realize/ApiCost');

const usage = (o) => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...o });
const events = [
  { kind: 'task_start', taskId: 't1', engine: 'claude', ts: 1, raw: { provider: 'anthropic' } },
  // 同一条消息两帧：只算一次，取最终 output
  { kind: 'thinking', taskId: 't1', ts: 2, model: 'claude-opus-5-5', msgId: 'm1', usage: usage({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 1000, cache_creation_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 2000, ephemeral_1h_input_tokens: 1000 } }) },
  { kind: 'text', taskId: 't1', ts: 3, model: 'claude-opus-5-5', msgId: 'm1', usage: usage({ input_tokens: 10, output_tokens: 500, cache_read_input_tokens: 1000, cache_creation_input_tokens: 3000, cache_creation: { ephemeral_5m_input_tokens: 2000, ephemeral_1h_input_tokens: 1000 } }) },
  { kind: 'result', taskId: 't1', ts: 4, costUsd: 0.5, raw: { model_usage: {
    'claude-opus-5-5': { inputTokens: 10, outputTokens: 500, cacheReadInputTokens: 1000, cacheCreationInputTokens: 3000 },
    'claude-haiku-4-5-20251001': { inputTokens: 200, outputTokens: 20, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
  } } },
  { kind: 'task_start', taskId: 't2', engine: 'claude', ts: 5, raw: { provider: 'clootee' } },
  { kind: 'text', taskId: 't2', ts: 6, model: 'claude-opus-5-5', msgId: 'm2', usage: usage({ input_tokens: 999 }) },
];

const r = ApiCost._compute('s', events);
assert.strictEqual(r.turns.length, 1, 'clootee turn is not billed here');
assert.strictEqual(r.subscriptionUsd, 0, 'anthropic API key turn is not a subscription turn');
const t = r.turns[0];
assert.strictEqual(t.consumedMessages, 1, 'repeated frames count once; background usage adds no message');
const withZero = ApiCost._compute('zero', [
  ...events,
  { kind: 'text', taskId: 't1', ts: 3, model: 'claude-opus-5-5', msgId: 'zero', usage: usage({}) },
]);
assert.strictEqual(withZero.turns[0].consumedMessages, 1, 'zero-cost messages excluded');
const reportedZero = ApiCost._compute('reported-zero', [
  { kind: 'task_start', taskId: 'free', engine: 'claude', ts: 1, raw: { provider: 'anthropic' } },
  { kind: 'text', taskId: 'free', ts: 2, model: 'claude-opus-5-5', msgId: 'free', usage: usage({ output_tokens: 100, cost: 0 }) },
]);
assert.strictEqual(reportedZero.turns[0].consumedMessages, 0, 'provider-reported zero cost is excluded');
const originalSession = ApiCost.session;
ApiCost.session = (id) => id === 'zero' ? withZero : r;
try {
  const totals = ApiCost.totals(['s']);
  assert.strictEqual(totals.s.consumedMessages, 1);
  assert.strictEqual(totals.s.tokens.cacheWrite, 3000);
  assert.ok(Math.abs(totals.s.breakdown.cacheWrite5m + totals.s.breakdown.cacheWrite1h - 0.018) < 1e-9);
  assert.strictEqual(totals.s.usd, r.totalUsd);
} finally { ApiCost.session = originalSession; }
const opus = t.lines.find((l) => l.model === 'claude-opus-5-5');
// 4/MTok 输入、20 输出、0.2 缓存读、5m=5、1h=8
const exp = 10 * 4e-6 + 500 * 20e-6 + 1000 * 0.2e-6 + 2000 * 5e-6 + 1000 * 8e-6;
assert.ok(Math.abs(opus.totalUsd - exp) < 1e-9, `opus ${opus.totalUsd} vs ${exp}`);
assert.strictEqual(opus.requests, 1);
const haiku = t.lines.find((l) => l.extra);
assert.ok(haiku && Math.abs(haiku.totalUsd - (200 * 1e-6 + 20 * 5e-6)) < 1e-9, 'haiku background diff');
assert.ok(Math.abs(t.totalUsd - (exp + 0.0003)) < 1e-9);

// 订阅开局、中途切到官方 API Key：两轮都出数，订阅那轮标 billing=subscription 且计入 subscriptionUsd
const mixed = [
  { kind: 'task_start', taskId: 'a', engine: 'claude', ts: 1, raw: { provider: 'official' } },
  { kind: 'text', taskId: 'a', ts: 2, model: 'claude-opus-5-5', msgId: 'x1', usage: usage({ input_tokens: 1000, output_tokens: 1000 }) },
  { kind: 'task_start', taskId: 'b', engine: 'claude', ts: 3, raw: { provider: 'anthropic' } },
  { kind: 'text', taskId: 'b', ts: 4, model: 'claude-opus-5-5', msgId: 'x2', usage: usage({ input_tokens: 100, output_tokens: 10 }) },
  { kind: 'result', taskId: 'b', ts: 5, raw: { model_usage: { 'claude-opus-5-5': { inputTokens: 100, outputTokens: 50 } } } },
];
const m = ApiCost._compute('m', mixed);
assert.deepStrictEqual(m.turns.map((x) => x.taskId), ['a', 'b']);
const mA = m.turns[0];
const mB = m.turns[1];
assert.strictEqual(mA.billing, 'subscription', 'official login is a subscription turn');
assert.strictEqual(mA.provider, 'official');
assert.strictEqual(mA.startedAt, 1);
assert.ok(Math.abs(mA.totalUsd - (1000 * 4e-6 + 1000 * 20e-6)) < 1e-9, 'subscription turn still priced at list price');
assert.strictEqual(mB.billing, 'apikey');
// 同模型的最终 token 差额并回原行，不算「后台调用」
assert.strictEqual(mB.lines.length, 1);
assert.strictEqual(mB.lines[0].outputTokens, 50);
assert.ok(Math.abs(mB.totalUsd - (100 * 4e-6 + 50 * 20e-6)) < 1e-9);
assert.ok(Math.abs(m.totalUsd - (mA.totalUsd + mB.totalUsd)) < 1e-9);
assert.ok(Math.abs(m.subscriptionUsd - mA.totalUsd) < 1e-9, 'subscription share is separable from real spend');

// 老轨迹没记服务商：Claude 原生模型当时只能走订阅登录 → 当作订阅轮次
const legacy = [
  { kind: 'task_start', taskId: 'L', engine: 'claude', ts: 1, raw: {} },
  { kind: 'text', taskId: 'L', ts: 2, model: 'claude-opus-5-5', usage: usage({ output_tokens: 10 }) },
  { kind: 'text', taskId: 'L', ts: 3, model: 'claude-opus-5-5', usage: usage({ output_tokens: 10 }) },
];
const l = ApiCost._compute('L', legacy);
assert.strictEqual(l.turns[0].billing, 'subscription');
// 没有 msgId 时按「模型 + token 快照」去重：两帧完全一样 → 只算一次
assert.strictEqual(l.turns[0].lines[0].requests, 1, 'identical anonymous frames dedupe');

// DeepSeek：走 DeepSeek 官方价目（无缓存写费用，写按未命中输入价），高峰/非高峰按请求时间半价
const dsEvents = (ts) => [
  { kind: 'task_start', taskId: 'd', engine: 'claude', ts: 1, raw: { provider: 'custom' } },
  { kind: 'text', taskId: 'd', ts, model: 'deepseek-v4-1-flash', msgId: 'd1',
    usage: usage({ input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000, cache_creation_input_tokens: 300 }) },
];
const PEAK = Date.UTC(2026, 9, 12, 2, 0, 0);    // 周一 02:00 UTC
const OFF = Date.UTC(2026, 9, 12, 12, 0, 0);    // 周一 12:00 UTC
const dp = ApiCost._compute('d1', dsEvents(PEAK));
const df = ApiCost._compute('d2', dsEvents(OFF));
const dsLine = dp.turns[0].lines[0];
assert.strictEqual(dp.turns[0].billing, 'apikey');
assert.strictEqual(dsLine.model, 'deepseek-v4-1-flash');
const dsExp = 1000 * 0.3e-6 + 2000 * 0.006e-6 + 300 * 0.3e-6 + 500 * 1.2e-6;
assert.ok(Math.abs(dsLine.totalUsd - dsExp) < 1e-9, `deepseek peak ${dsLine.totalUsd} vs ${dsExp}`);
assert.ok(Math.abs(df.turns[0].totalUsd - dsExp / 2) < 1e-9, 'deepseek off-peak is half price');
assert.strictEqual(dsLine.usd.webSearch, 0, 'deepseek has no web-search fee');

// CLI 的 total_cost_usd / modelUsage 是会话累计值：第二轮只能按与上一次 result 的差额补
const cum = [
  { kind: 'task_start', taskId: 'p', engine: 'claude', ts: 1, raw: { provider: 'anthropic' } },
  { kind: 'text', taskId: 'p', ts: 2, model: 'claude-opus-5-5', msgId: 'p1', usage: usage({ output_tokens: 100 }) },
  { kind: 'result', taskId: 'p', ts: 3, costUsd: 1, raw: { model_usage: { 'claude-opus-5-5': { outputTokens: 100 } } } },
  { kind: 'task_start', taskId: 'q', engine: 'claude', ts: 4, raw: { provider: 'anthropic' } },
  { kind: 'text', taskId: 'q', ts: 5, model: 'claude-opus-5-5', msgId: 'q1', usage: usage({ output_tokens: 10 }) },
  { kind: 'result', taskId: 'q', ts: 6, costUsd: 1.5, raw: { model_usage: { 'claude-opus-5-5': { outputTokens: 110 } } } },
];
const c = ApiCost._compute('c', cum);
assert.strictEqual(c.turns[1].lines[0].outputTokens, 10, 'no cumulative overcount');
assert.strictEqual(c.turns[1].cliUsd, 0.5, 'cli cost is the per-turn delta');

// OpenRouter：按 OpenRouter 公开价目（每 token 美元，含 1h 缓存写与分档 overrides）计价
const { OpenRouterPrices } = require('../dist/logic_realize/OpenRouterPrices');
OpenRouterPrices._mem = { fetchedAt: Date.now(), models: {
  'anthropic/claude-opus-5.5': { prompt: 4e-6, completion: 20e-6, cacheRead: 0.2e-6, cacheWrite: 5e-6, cacheWrite1h: 8e-6, webSearch: 0.01, overrides: [] },
  'anthropic/claude-haiku-5.5': { prompt: 1e-7, completion: 5e-7, cacheRead: 1e-8, cacheWrite: 1.25e-7, cacheWrite1h: 2e-7, webSearch: 0.01,
    overrides: [{ minPromptTokens: 100000, prompt: 5e-7, completion: 2.5e-6, cacheRead: 5e-8 }] },
} };
const or = [
  { kind: 'task_start', taskId: 'o', engine: 'claude', ts: 1, raw: { provider: 'openrouter' } },
  { kind: 'text', taskId: 'o', ts: 2, model: 'anthropic/claude-opus-5.5', msgId: 'g1', usage: usage({ input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 300, cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 100 } }) },
  // Anthropic 风格 id 也能映射到 OpenRouter 的 anthropic/claude-haiku-5.5；输入超 10 万走高档价
  { kind: 'text', taskId: 'o', ts: 3, model: 'claude-haiku-5-5', msgId: 'g2', usage: usage({ input_tokens: 150000, output_tokens: 10 }) },
];
const o = ApiCost._compute('o', or);
assert.strictEqual(o.turns[0].provider, 'openrouter');
const oOpus = 10 * 4e-6 + 100 * 20e-6 + 1000 * 0.2e-6 + 200 * 5e-6 + 100 * 8e-6;
const oHaiku = 150000 * 5e-7 + 10 * 2.5e-6;
assert.ok(Math.abs(o.totalUsd - (oOpus + oHaiku)) < 1e-9, `openrouter ${o.totalUsd} vs ${oOpus + oHaiku}`);

// OpenRouter 在 usage.cost 回报实扣金额时，合计以它为准（实测与价目计算一致：24×$4/M + 200×$20/M = $0.004096）
const rep = ApiCost._compute('r', [
  { kind: 'task_start', taskId: 'r', engine: 'claude', ts: 1, raw: { provider: 'openrouter' } },
  { kind: 'text', taskId: 'r', ts: 2, model: 'anthropic/claude-opus-5.5', msgId: 'r1', usage: usage({ input_tokens: 24, output_tokens: 200, cost: 0.004096 }) },
  { kind: 'text', taskId: 'r', ts: 3, model: 'anthropic/claude-opus-5.5', msgId: 'r2', usage: usage({ input_tokens: 10, output_tokens: 10, cost: 0.5 }) },
]);
const rl = rep.turns[0].lines[0];
assert.strictEqual(rl.reportedRequests, 2);
assert.ok(Math.abs(rl.totalUsd - 0.504096) < 1e-9, 'reported cost wins');
assert.ok(Math.abs(rl.usd.input + rl.usd.output - (34 * 4e-6 + 210 * 20e-6)) < 1e-9, 'breakdown still at list price');
console.log('api_cost ok', t.totalUsd, m.totalUsd, c.totalUsd, o.totalUsd, rep.totalUsd,
  'sub=' + m.subscriptionUsd, 'ds=' + dp.turns[0].totalUsd + '/' + df.turns[0].totalUsd);
