// ApiCost 计价自测：node test/api_cost.js（需先 npm run build）
// 覆盖：msgId 去重、5m/1h 缓存写分开计价、缓存读专属价、modelUsage 补差、非 anthropic 任务不计费。
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
assert.strictEqual(r.turns.length, 1, 'only anthropic task billed');
const t = r.turns[0];
const opus = t.lines.find((l) => l.model === 'claude-opus-5-5');
// 4/MTok 输入、20 输出、0.2 缓存读、5m=5、1h=8
const exp = 10 * 4e-6 + 500 * 20e-6 + 1000 * 0.2e-6 + 2000 * 5e-6 + 1000 * 8e-6;
assert.ok(Math.abs(opus.totalUsd - exp) < 1e-9, `opus ${opus.totalUsd} vs ${exp}`);
assert.strictEqual(opus.requests, 1);
const haiku = t.lines.find((l) => l.extra);
assert.ok(haiku && Math.abs(haiku.totalUsd - (200 * 1e-6 + 20 * 5e-6)) < 1e-9, 'haiku background diff');
assert.ok(Math.abs(t.totalUsd - (exp + 0.0003)) < 1e-9);

// 订阅开局、中途切到官方 API Key：只有切换后的轮次计费，会话合计从那一轮开始累加
const mixed = [
  { kind: 'task_start', taskId: 'a', engine: 'claude', ts: 1, raw: { provider: 'official' } },
  { kind: 'text', taskId: 'a', ts: 2, model: 'claude-opus-5-5', msgId: 'x1', usage: usage({ input_tokens: 1000, output_tokens: 1000 }) },
  { kind: 'task_start', taskId: 'b', engine: 'claude', ts: 3, raw: { provider: 'anthropic' } },
  { kind: 'text', taskId: 'b', ts: 4, model: 'claude-opus-5-5', msgId: 'x2', usage: usage({ input_tokens: 100, output_tokens: 10 }) },
  { kind: 'result', taskId: 'b', ts: 5, raw: { model_usage: { 'claude-opus-5-5': { inputTokens: 100, outputTokens: 50 } } } },
];
const m = ApiCost._compute('m', mixed);
assert.deepStrictEqual(m.turns.map((x) => x.taskId), ['b']);
// 同模型的最终 token 差额并回原行，不算「后台调用」
assert.strictEqual(m.turns[0].lines.length, 1);
assert.strictEqual(m.turns[0].lines[0].outputTokens, 50);
assert.ok(Math.abs(m.totalUsd - (100 * 4e-6 + 50 * 20e-6)) < 1e-9);

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
console.log('api_cost ok', t.totalUsd, m.totalUsd, c.totalUsd, o.totalUsd);
