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

test('official API providers: Anthropic key on Claude Code, OpenAI key on Codex', async () => {
  save('claude', 'anthropic', 'sk-ant-test');
  assert.equal(Config.claudeEnv().ANTHROPIC_BASE_URL, 'https://api.anthropic.com');
  assert.equal(Config.claudeEnv().ANTHROPIC_AUTH_TOKEN, 'sk-ant-test');
  await Config.listModels('anthropic', 'sk-ant-test');
  assert.deepEqual(Config.calls.at(-1), { url: 'https://api.anthropic.com/v1/models', key: 'sk-ant-test' });
  assert.throws(() => save('codex', 'anthropic', 'sk-ant-test'), /OpenAI/);
  assert.deepEqual(Config.providerList().find((p) => p.id === 'anthropic').engines, ['claude']);

  save('codex', 'openai', 'sk-openai-test');
  assert.equal(Config.codexUpstream().baseUrl, 'https://api.openai.com/v1');
  assert.equal(Config.codexUpstream().model, 'test-model');
  await Config.listModels('openai', 'sk-openai-test');
  assert.deepEqual(Config.calls.at(-1), { url: 'https://api.openai.com/v1/models', key: 'sk-openai-test' });
  assert.throws(() => save('claude', 'openai', 'sk-openai-test'), /Anthropic/);
  assert.deepEqual(Config.providerList().find((p) => p.id === 'openai').engines, ['codex']);
});

test('provider list leads with subscription / official API / OpenRouter, custom stays last', () => {
  const ids = Config.providerList().map((p) => p.id);
  assert.equal(ids[0], 'official');
  assert.deepEqual(ids.slice(1, 9), ['clootee', 'deepseek', 'anthropic', 'openai', 'openrouter', 'minimax', 'xiaomi', 'kimi']);
  assert.equal(ids[9], 'kimicode');
  assert.equal(ids.at(-1), 'custom');
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
  // Every provider needs at least one usable endpoint；官方 API 两家各只有一半
  // （anthropic 只有 Anthropic 协议、openai 只有 OpenAI 协议），空的那个不算数。
  for (const meta of Object.values(PROVIDERS)) {
    assert.ok(meta.anthropicBase || meta.chatBase, 'provider needs at least one endpoint');
    for (const base of [meta.anthropicBase, meta.chatBase])
      assert.ok(base === '' || base.startsWith('https://'), `bad base=${base}`);
  }
});

// 「上下文窗口」：用户声明的模型窗口必须同时写进两个 env 键 ——
// CLAUDE_CODE_MAX_CONTEXT_TOKENS 是「模型有多大」，CLAUDE_CODE_AUTO_COMPACT_WINDOW
// 会被 CLI 按模型窗口 Math.min 夹一次，只给后者等于没给（不认识的模型名仍按 200K 夹回）。
test('context window declaration drives both CLI env keys', () => {
  const withWindow = (provider, opts) =>
    Config.setProvider('claude', { provider, apiKey: 'sk-test', model: 'm', effort: '', ...opts });

  // 1) 自定义服务商：显式声明 1M
  withWindow('custom', { baseUrl: 'https://api.deepseek.com/anthropic', contextWindow: 1000000 });
  let env = Config.claudeEnv();
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '1000000');
  assert.equal(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '1000000');
  assert.equal(Config.get().claude.contextWindow, 1000000);

  // 2) 自定义服务商留空 / 0 → 出厂默认 1M（它的模型名 Claude Code 都不认识，
  //    不声明就会被按 200K 处理，约 16.7 万 token 就开始压缩）
  withWindow('custom', { baseUrl: 'https://api.deepseek.com/anthropic', contextWindow: 0 });
  env = Config.claudeEnv();
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '1000000');
  assert.equal(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '1000000');
  assert.equal(Config.get().claude.contextWindow, undefined);

  // 3) 用户显式值覆盖服务商 extraEnv 里写死的那个（clootee 出厂 1M）
  withWindow('clootee', { contextWindow: 300000 });
  env = Config.claudeEnv();
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '300000');
  assert.equal(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '300000');

  // 4) 低于 CLI 硬性下限时，MAX_CONTEXT_TOKENS 照实写、AUTO_COMPACT_WINDOW 夹到 100k
  withWindow('clootee', { contextWindow: 64000 });
  env = Config.claudeEnv();
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '64000');
  assert.equal(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '100000');

  // 5) 非法值当作没填；上限夹到 10M（防手抖多打几个 0）
  withWindow('clootee', { contextWindow: -5 });
  assert.equal(Config.get().claude.contextWindow, undefined);
  withWindow('clootee', { contextWindow: 'abc' });
  assert.equal(Config.get().claude.contextWindow, undefined);
  withWindow('clootee', { contextWindow: 999999999 });
  assert.equal(Config.get().claude.contextWindow, 10000000);

  // 6) 换 Key 不清掉窗口声明（窗口是模型的属性，和 Key 无关）
  withWindow('clootee', { contextWindow: 500000 });
  withWindow('clootee', { apiKey: 'sk-other', contextWindow: undefined });
  assert.equal(Config.get().claude.contextWindow, 500000);

  // 7) 每个服务商各存各的：清掉一个槽的声明，不影响另一个槽
  withWindow('custom', { baseUrl: 'https://api.deepseek.com/anthropic', contextWindow: 300000 });
  withWindow('clootee', { contextWindow: 0 });
  const slots = Config.slots('claude');
  assert.equal(slots.clootee.contextWindow, undefined);
  assert.equal(slots.custom.contextWindow, 300000);

  // 8) 原版：不注入任何窗口键（官方模型自带正确窗口）
  save('claude', 'official', '', '');
  assert.deepEqual(Config.claudeEnv(), {});
});

// 只声明 AUTO_COMPACT_WINDOW 的服务商：CLI 会拿它按「以为的模型窗口」夹一次，
// 必须同时写 MAX_CONTEXT_TOKENS，否则 1M 声明会被夹回 200K。
test('providers that only declare the compact window also declare the model window', () => {
  save('claude', 'minimax', 'sk-test', 'MiniMax-M3');
  let env = Config.claudeEnv();
  assert.equal(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '1000000');
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '1000000');
  save('claude', 'kimi', 'sk-test', 'kimi-for-coding');
  env = Config.claudeEnv();
  assert.equal(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '1048576');
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '1048576');
});

// 前端预设/默认值提示需要知道每个服务商的出厂窗口
test('provider list exposes the factory context window', () => {
  const byId = Object.fromEntries(Config.providerList().map((p) => [p.id, p]));
  assert.equal(byId.custom.defaultContextWindow, 1000000);
  assert.equal(byId.deepseek.defaultContextWindow, 1000000);
  assert.equal(byId.official.defaultContextWindow, undefined);
});

// DeepSeek 官方直连：deepseek-flash 是 1M 上下文，出厂就声明，不能等用户自己填。
test('built-in deepseek provider declares its 1M window and both endpoints', () => {
  save('claude', 'deepseek', 'sk-test', 'deepseek-flash');
  const env = Config.claudeEnv();
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.deepseek.com/anthropic');
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '1000000');
  assert.equal(env.CLAUDE_CODE_AUTO_COMPACT_WINDOW, '1000000');
  save('codex', 'deepseek', 'sk-test', 'deepseek-flash');
  assert.equal(Config.codexUpstream().baseUrl, 'https://api.deepseek.com/v1');
  assert.equal(Config.pickDefaultModel('deepseek', ['deepseek-v4-pro', 'deepseek-flash']), 'deepseek-flash');
});
