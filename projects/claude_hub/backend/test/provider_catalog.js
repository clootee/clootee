'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EngineConfigStruct, PROVIDERS, isProvider } = require('../dist/logic_struct/EngineConfigStruct');

// In-memory implementation: never touch engines.json, CLI settings or real credentials.
class Config extends EngineConfigStruct {
  static file = null;
  static calls = [];
  static _read() { return this.file; }
  static _write(c) { this.file = structuredClone(c); }
  static applyEnv() {}
  static async _fetchModels(url, key) { this.calls.push({ url, key }); return ['test-model']; }
}
function save(engine, provider, apiKey, model = 'test-model') {
  return Config.setProvider(engine, { provider, apiKey, model, effort: '' });
}

test('catalog exposes compatible providers, rejects prototype names', () => {
  assert.ok(Config.providerList().length > 100);
  for (const id of ['openrouter', 'alibaba-cn', 'tencent', 'siliconflow-cn', 'deepseek', 'zhipuai-coding-plan'])
    assert.ok(isProvider(id), id);
  for (const id of ['constructor', '__proto__', 'toString', 'unknown']) assert.equal(isProvider(id), false);
  assert.throws(() => save('codex', 'constructor', 'test'), /invalid provider/);
});

for (const [provider, key, chat, anthropic] of [
  ['xiaomi', 'tp-test', 'https://token-plan-cn.xiaomimimo.com/v1', 'https://token-plan-cn.xiaomimimo.com/anthropic'],
  ['xiaomi', 'sk-test', 'https://api.xiaomimimo.com/v1', 'https://api.xiaomimimo.com/anthropic'],
  ['tencent', 'sk-sp-test', 'https://api.lkeap.cloud.tencent.com/coding/v3', 'https://api.lkeap.cloud.tencent.com/coding/anthropic'],
  ['tencent', 'sk-tp-test', 'https://api.lkeap.cloud.tencent.com/plan/v3', 'https://api.lkeap.cloud.tencent.com/plan/anthropic'],
  ['tencent', 'sk-test', 'https://api.lkeap.cloud.tencent.com/v1', 'https://api.lkeap.cloud.tencent.com/anthropic'],
  ['tencent-tokenhub', 'sk-tp-test', 'https://api.lkeap.cloud.tencent.com/plan/v3', 'https://api.lkeap.cloud.tencent.com/plan/anthropic'],
  ['alibaba-cn', 'sk-test', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'https://dashscope.aliyuncs.com/apps/anthropic'],
  ['alibaba-coding-plan-cn', 'sk-sp-test', 'https://coding.dashscope.aliyuncs.com/v1', 'https://coding.dashscope.aliyuncs.com/apps/anthropic'],
  ['alibaba-token-plan-cn', 'sk-sp-test', 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic'],
  ['openrouter', 'sk-or-test', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/api'],
  ['xiaomi-token-plan-sgp', 'tp-test', 'https://token-plan-sgp.xiaomimimo.com/v1', 'https://token-plan-sgp.xiaomimimo.com/anthropic'],
]) {
  test(`${provider} ${key}: models and both runtimes use the same billing route`, async () => {
    save('codex', provider, ` ${key} `);
    save('claude', provider, ` ${key} `);
    assert.equal(Config.codexUpstream().baseUrl, chat);
    assert.equal(Config.claudeEnv().ANTHROPIC_BASE_URL, anthropic);
    assert.equal(Config.claudeEnv().ANTHROPIC_AUTH_TOKEN, key);
    await Config.listModels(provider, ` ${key} `);
    assert.deepEqual(Config.calls.at(-1), { url: `${chat}/models`, key });
  });
}

test('ambiguous or mismatched plan keys fail before storage or network', async () => {
  for (const [p, k] of [['alibaba-cn', 'sk-sp-test'], ['alibaba', 'sk-sp-test'], ['tencent-token-plan', 'sk-test'], ['tencent-coding-plan', 'sk-tp-test'], ['alibaba-token-plan-cn', 'sk-test'], ['xiaomi-token-plan-cn', 'sk-test']]) {
    const before = JSON.stringify(Config.file);
    const count = Config.calls.length;
    assert.throws(() => save('codex', p, k));
    assert.equal(JSON.stringify(Config.file), before);
    await assert.rejects(Config.listModels(p, k));
    assert.equal(Config.calls.length, count);
  }
});

test('OpenAI-only catalog provider is usable with Codex, not silently configured as Claude', () => {
  save('codex', 'siliconflow-cn', 'test');
  assert.equal(Config.codexUpstream().baseUrl, 'https://api.siliconflow.cn/v1');
  assert.throws(() => save('claude', 'siliconflow-cn', 'test'), /Anthropic/);
  assert.deepEqual(Config.providerList().find((p) => p.id === 'siliconflow-cn').engines, ['codex']);
});

test('provider isolation, changed-key cache invalidation and official login remain intact', () => {
  save('codex', 'openrouter', 'sk-or-one');
  Config.setCache('codex', { models: [{ id: 'old-model', source: 'api' }] });
  save('codex', 'tencent', 'sk-tp-one');
  assert.equal(Config.get().codex.models, undefined);
  assert.equal(Config.slots('codex').openrouter.apiKey, 'sk-or-one');
  save('codex', 'openrouter', 'sk-or-two');
  assert.equal(Config.get().codex.models, undefined);
  save('claude', 'openrouter', 'sk-or-test');
  assert.equal(Config.claudeEnv().ANTHROPIC_API_KEY, '');
  save('claude', 'official', '', '');
  assert.deepEqual(Config.claudeEnv(), {});
  assert.equal(Config.get().claude.apiKey, '');
});

test('auth errors do not trigger paid fallback or return catalog models as verified', async () => {
  class Failed extends Config {
    static async _fetchModels(url) { this.calls.push(url); throw new Error('HTTP 401'); }
  }
  Failed.calls = [];
  await assert.rejects(Failed.listModels('tencent', 'sk-tp-test'), /401/);
  assert.deepEqual(Failed.calls, ['https://api.lkeap.cloud.tencent.com/plan/v3/models']);
  for (const meta of Object.values(PROVIDERS)) assert.ok(meta.chatBase.startsWith('https://'));
});
