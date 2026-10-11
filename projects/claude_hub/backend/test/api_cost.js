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
console.log('api_cost ok', t.totalUsd);
