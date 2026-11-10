// Kimi / Ark 人民币计价回归：node backend/test/api_cost.js（先构建 backend/dist）。
const assert = require('node:assert/strict');
const { ApiCost } = require('../dist/logic_realize/ApiCost');
const { TraceStore } = require('../dist/logic_realize/TraceStore');

const usage = {
  input_tokens: 49098,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 25088,
  output_tokens: 1050,
  cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
  server_tool_use: { web_search_requests: 0 },
};
const modelUsage = {
  'ep-20261110085056-mxsnh': {
    inputTokens: 49098,
    outputTokens: 1050,
    cacheReadInputTokens: 25088,
    cacheCreationInputTokens: 0,
    webSearchRequests: 0,
    costUSD: 0.284284,
  },
};
const kimiEvents = [
  { kind: 'task_start', taskId: 'kimi-task', engine: 'claude', ts: 1, raw: { provider: 'custom', model: 'ep-20261110085056-mxsnh' } },
  { kind: 'assistant', taskId: 'kimi-task', engine: 'claude', ts: 2, msgId: 'ark-request', model: 'kimi-k3-1-pro-261024', usage, raw: {} },
  { kind: 'result', taskId: 'kimi-task', engine: 'claude', ts: 3, costUsd: 0.284284, raw: { model_usage: modelUsage } },
];
const officialEvents = [
  { kind: 'task_start', taskId: 'official-task', engine: 'claude', ts: 1, raw: { provider: 'official' } },
  { kind: 'assistant', taskId: 'official-task', engine: 'claude', ts: 2, msgId: 'official-request', model: 'claude-opus-5', usage: {
    input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 200,
  }, raw: {} },
];

const originalLiveEvents = TraceStore.liveEvents;
TraceStore.liveEvents = (id) => ({ stamp: `fixture-${id}`, events: id === 'kimi-session' ? kimiEvents : officialEvents });
try {
  const kimi = ApiCost.session('kimi-session');
  assert.equal(kimi.totalUsd, 0, 'CNY must not leak into USD');
  assert.equal(kimi.totalCny, 0.7422884, 'Ark list-price inference cost');
  assert.equal(kimi.turns.length, 1);
  assert.equal(kimi.turns[0].lines.length, 1, 'ep-* modelUsage must not duplicate kimi-* messages');
  assert.equal(kimi.turns[0].cliUsd, null, 'incorrect Claude-priced CLI reference must be hidden');
  assert.equal(kimi.turns[0].consumedMessages, 1);
  const line = kimi.turns[0].lines[0];
  assert.equal(line.model, 'kimi-k3-1-pro-261024');
  assert.equal(line.currency, 'CNY');
  assert.equal(line.priced, true);
  assert.equal(line.inputTokens, 49098);
  assert.equal(line.cacheReadTokens, 25088);
  assert.equal(line.outputTokens, 1050);
  assert.equal(line.cny.input, 0.638274);
  assert.equal(line.cny.cacheRead, 0.0326144);
  assert.equal(line.cny.output, 0.0714);
  assert.equal(line.usd.input, 0);
  assert.equal(ApiCost.estimate('custom', line.model, 1000, 'off'), null, 'CNY estimates must not use USD fields');

  const official = ApiCost.session('official-session');
  assert.equal(official.totalUsd, 0.0076);
  assert.equal(official.totalCny, 0);
  assert.equal(official.turns[0].lines[0].currency, 'USD');

  const totals = ApiCost.totals(['kimi-session', 'official-session']);
  assert.equal(totals['kimi-session'].cny, 0.7422884);
  assert.equal(totals['kimi-session'].usd, 0);
  assert.equal(totals['kimi-session'].breakdownCny.input, 0.638274);
  assert.equal(totals['official-session'].usd, 0.0076);
  assert.equal(totals['official-session'].cny, 0);

  assert.equal(TraceStore._aggregate('kimi-stats', kimiEvents).usage.costUsd, 0, 'trace stats must hide mismatched Kimi USD');
  assert.equal(TraceStore._aggregate('official-stats', [...officialEvents, { kind: 'result', taskId: 'official-task', ts: 3, costUsd: 0.5 }]).usage.costUsd, 0.5);
  console.log('api_cost: 26 assertions passed (Kimi CNY, alias dedupe, CLI mismatch guards, USD regression)');
} finally {
  TraceStore.liveEvents = originalLiveEvents;
}
