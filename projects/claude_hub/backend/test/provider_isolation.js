// 服务商隔离 + effort 自测（直调编译产物，不跑真引擎）。
// 用临时 DATA_DIR，绝不碰用户真实的 data/engines.json。
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✕ ${name}${extra ? ' → ' + JSON.stringify(extra) : ''}`); }
}

const { Paths } = require('../dist/paths');
const ENGINES = Paths.ENGINES_FILE;
fs.mkdirSync(path.dirname(ENGINES), { recursive: true });

// 这个自测会改写真实的 engines.json（Paths 是固定常量，无法重定向）。
// 先备份，结束时无论成败都还原 —— 绝不能把用户配好的服务商设置弄丢。
const BACKUP = ENGINES + '.isolation-test-backup';
const had = fs.existsSync(ENGINES);
if (had) fs.copyFileSync(ENGINES, BACKUP);
// ~/.claude/settings.json 的 env 段也会被 applyEnv 改写，同样先备份
const os2 = require('os');
const CLAUDE_SETTINGS = path.join(
  process.env.CLAUDE_CONFIG_DIR || path.join(os2.homedir(), '.claude'),
  'settings.json',
);
const CS_BACKUP = CLAUDE_SETTINGS + '.isolation-test-backup';
const hadCs = fs.existsSync(CLAUDE_SETTINGS);
if (hadCs) fs.copyFileSync(CLAUDE_SETTINGS, CS_BACKUP);

function restore() {
  try {
    if (had) { fs.copyFileSync(BACKUP, ENGINES); fs.unlinkSync(BACKUP); }
    else if (fs.existsSync(ENGINES)) fs.unlinkSync(ENGINES);
  } catch (e) { console.log('⚠ 还原 engines.json 失败：' + e.message); }
  try {
    if (hadCs) { fs.copyFileSync(CS_BACKUP, CLAUDE_SETTINGS); fs.unlinkSync(CS_BACKUP); }
  } catch (e) { console.log('⚠ 还原 claude settings.json 失败：' + e.message); }
}
process.on('exit', restore);
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });

// ── 1. 旧版扁平脏数据的迁移：official 却带着第三方 Key 与 MiniMax 模型缓存 ──
// 这正是用户遇到的现场：选原版，却在模型下拉里看到 MiniMax/小米的模型。
fs.writeFileSync(ENGINES, JSON.stringify({
  claude: {
    provider: 'official',
    apiKey: 'sk-leaked-minimax-key',
    model: 'MiniMax-M3',
    models: [{ id: 'MiniMax-M3', source: 'api' }, { id: 'MiniMax-Text-01', source: 'api' }],
  },
  codex: { provider: 'official', apiKey: 'sk-also-leaked', model: '' },
}), 'utf8');

delete require.cache[require.resolve('../dist/logic_realize/EngineConfig')];
const { EngineConfig } = require('../dist/logic_realize/EngineConfig');

console.log('\n[1] 旧脏数据迁移（official 不该有第三方 Key / 模型缓存）');
let c = EngineConfig.get();
ok('official 的 apiKey 被清空', c.claude.apiKey === '', c.claude.apiKey);
ok('official 不再带 MiniMax 模型', c.claude.model !== 'MiniMax-M3', c.claude.model);
ok('official 不再带 MiniMax 候选列表',
  !(c.claude.models || []).some((m) => /minimax/i.test(m.id)),
  c.claude.models);
ok('codex official 的 apiKey 也被清空', c.codex.apiKey === '', c.codex.apiKey);
ok('effort 默认为自动', c.claude.effort === '', c.claude.effort);

// ── 2. 分槽隔离：配好 MiniMax 后切回原版，原版必须干净 ──
console.log('\n[2] 分槽隔离：MiniMax ↔ 原版来回切换');
EngineConfig.setProvider('claude', {
  provider: 'minimax', apiKey: 'sk-minimax-real', model: 'MiniMax-M3', effort: 'high',
});
c = EngineConfig.get();
ok('切到 minimax 后读到 minimax 的 Key', c.claude.apiKey === 'sk-minimax-real', c.claude.apiKey);
ok('切到 minimax 后读到 minimax 的模型', c.claude.model === 'MiniMax-M3', c.claude.model);
ok('minimax 的 effort=high', c.claude.effort === 'high', c.claude.effort);

// 给 minimax 槽塞一份候选缓存（模拟「拉取模型」）
EngineConfig.setCache('claude', {
  models: [{ id: 'MiniMax-M3', source: 'api' }, { id: 'MiniMax-Text-01', source: 'api' }],
});

// 切回原版
EngineConfig.setProvider('claude', { provider: 'official', apiKey: '', model: 'opus', effort: 'max' });
c = EngineConfig.get();
ok('原版 apiKey 为空（不继承 minimax 的 Key）', c.claude.apiKey === '', c.claude.apiKey);
ok('原版模型是 opus', c.claude.model === 'opus', c.claude.model);
ok('原版 effort=max', c.claude.effort === 'max', c.claude.effort);
ok('原版看不到 MiniMax 候选',
  !(c.claude.models || []).some((m) => /minimax/i.test(m.id)),
  c.claude.models);

// 再切回 minimax —— 它自己的设置必须还在（这是「分槽」而非「清空」的价值）
EngineConfig.setProvider('claude', {
  provider: 'minimax', apiKey: 'sk-minimax-real', model: 'MiniMax-M3', effort: 'high',
});
c = EngineConfig.get();
ok('切回 minimax 恢复它自己的 Key', c.claude.apiKey === 'sk-minimax-real', c.claude.apiKey);
ok('切回 minimax 恢复它自己的候选缓存',
  (c.claude.models || []).some((m) => /minimax/i.test(m.id)),
  c.claude.models);
ok('切回 minimax 恢复它自己的 effort', c.claude.effort === 'high', c.claude.effort);

// 原版槽也还在
EngineConfig.setProvider('claude', { provider: 'official', apiKey: '', model: 'opus', effort: 'max' });
c = EngineConfig.get();
ok('原版槽独立保留 opus/max', c.claude.model === 'opus' && c.claude.effort === 'max',
  { model: c.claude.model, effort: c.claude.effort });

// ── 3. 环境变量隔离：原版下绝不能注入 ANTHROPIC_* ──
console.log('\n[3] 环境变量隔离');
let env = EngineConfig.claudeEnv();
ok('原版下 claudeEnv 为空（不注入第三方端点）', Object.keys(env).length === 0, env);

EngineConfig.setProvider('claude', {
  provider: 'minimax', apiKey: 'sk-minimax-real', model: 'MiniMax-M3', effort: 'low',
});
env = EngineConfig.claudeEnv();
ok('minimax 下注入 BASE_URL', /minimaxi/.test(env.ANTHROPIC_BASE_URL || ''), env.ANTHROPIC_BASE_URL);
ok('minimax 下注入 AUTH_TOKEN', env.ANTHROPIC_AUTH_TOKEN === 'sk-minimax-real');
ok('显式 effort 覆盖服务商写死的值', env.CLAUDE_CODE_EFFORT_LEVEL === 'low', env.CLAUDE_CODE_EFFORT_LEVEL);

// kimi 的 extraEnv 写死 max；不选 effort 时应保留它，选了则覆盖
EngineConfig.setProvider('claude', {
  provider: 'kimi', apiKey: 'sk-kimi', model: 'kimi-k2', effort: '',
});
env = EngineConfig.claudeEnv();
ok('未选 effort 时保留 kimi 自带的 max', env.CLAUDE_CODE_EFFORT_LEVEL === 'max', env.CLAUDE_CODE_EFFORT_LEVEL);
EngineConfig.setEffort('claude', 'low');
env = EngineConfig.claudeEnv();
ok('选了 low 则覆盖 kimi 的 max', env.CLAUDE_CODE_EFFORT_LEVEL === 'low', env.CLAUDE_CODE_EFFORT_LEVEL);

// ── 3b. 小米 MiMo：订阅 Key（tp-）与按量 Key（sk-）走不同域名 ──
// 官方文档：sk- 打 api.xiaomimimo.com，tp-（Token Plan 订阅）打 token-plan-cn.xiaomimimo.com，两者不通用。
console.log('\n[3b] 小米 订阅/按量 端点区分');
EngineConfig.setProvider('claude', {
  provider: 'xiaomi', apiKey: 'sk-mimo-payg', model: 'mimo-v2.5-pro', effort: '',
});
EngineConfig.setCache('claude', { models: [{ id: 'mimo-v2.5-pro', source: 'api' }] });
env = EngineConfig.claudeEnv();
ok('按量 sk- Key 走 api.xiaomimimo.com',
  env.ANTHROPIC_BASE_URL === 'https://api.xiaomimimo.com/anthropic', env.ANTHROPIC_BASE_URL);

EngineConfig.setProvider('claude', {
  provider: 'xiaomi', apiKey: 'tp-mimo-plan', model: 'mimo-v2.5-pro', effort: '',
});
env = EngineConfig.claudeEnv();
ok('订阅 tp- Key 走 token-plan-cn.xiaomimimo.com',
  env.ANTHROPIC_BASE_URL === 'https://token-plan-cn.xiaomimimo.com/anthropic', env.ANTHROPIC_BASE_URL);
ok('换 Key 后模型候选缓存失效（两套 Key 可用模型可能不同）',
  !(EngineConfig.get().claude.models || []).length, EngineConfig.get().claude.models);

EngineConfig.setProvider('codex', {
  provider: 'xiaomi', apiKey: 'tp-mimo-plan', model: 'mimo-v2.5-pro', effort: '',
});
ok('codex 上游同样按 tp- 切到 token-plan-cn',
  EngineConfig.codexUpstream().baseUrl === 'https://token-plan-cn.xiaomimimo.com/v1',
  EngineConfig.codexUpstream().baseUrl);
EngineConfig.setProvider('codex', {
  provider: 'xiaomi', apiKey: 'sk-mimo-payg', model: 'mimo-v2.5-pro', effort: '',
});
ok('codex 上游按 sk- 回到 api 域名',
  EngineConfig.codexUpstream().baseUrl === 'https://api.xiaomimimo.com/v1',
  EngineConfig.codexUpstream().baseUrl);

// ── 3c. Kimi：开放平台（按量）与 Kimi Code（订阅）是两个独立服务商，各占一槽 ──
// 两边 Key 都是 sk- 开头，认不出来，所以靠「分成两个服务商」而不是前缀自动切。
console.log('\n[3c] Kimi 开放平台 / Kimi Code 分槽');
EngineConfig.setProvider('claude', {
  provider: 'kimi', apiKey: 'sk-kimi-openplatform', model: 'kimi-k2', effort: '',
});
ok('开放平台走 api.moonshot.cn',
  EngineConfig.claudeEnv().ANTHROPIC_BASE_URL === 'https://api.moonshot.cn/anthropic',
  EngineConfig.claudeEnv().ANTHROPIC_BASE_URL);

EngineConfig.setProvider('claude', {
  provider: 'kimicode', apiKey: 'sk-kimi-code-plan', model: 'kimi-for-coding', effort: '',
});
env = EngineConfig.claudeEnv();
ok('Kimi Code 走 api.kimi.com/coding',
  env.ANTHROPIC_BASE_URL === 'https://api.kimi.com/coding', env.ANTHROPIC_BASE_URL);
ok('Kimi Code 用自己的 Key', env.ANTHROPIC_AUTH_TOKEN === 'sk-kimi-code-plan', env.ANTHROPIC_AUTH_TOKEN);
ok('Kimi Code 不继承 kimi 的 extraEnv（未配 = 不注入）',
  env.CLAUDE_CODE_AUTO_COMPACT_WINDOW === undefined, env.CLAUDE_CODE_AUTO_COMPACT_WINDOW);

const kslots = EngineConfig.slots('claude');
ok('两个 Kimi 各自一槽、Key 互不覆盖',
  (kslots.kimi || {}).apiKey === 'sk-kimi-openplatform'
    && (kslots.kimicode || {}).apiKey === 'sk-kimi-code-plan',
  { kimi: kslots.kimi, kimicode: kslots.kimicode });

// 其他服务商没有 subscription 配置 → 不受 Key 前缀影响
EngineConfig.setProvider('claude', {
  provider: 'kimi', apiKey: 'tp-not-a-plan-key', model: 'kimi-k2', effort: '',
});
ok('无订阅端点的服务商不受 tp- 前缀影响',
  EngineConfig.claudeEnv().ANTHROPIC_BASE_URL === 'https://api.moonshot.cn/anthropic',
  EngineConfig.claudeEnv().ANTHROPIC_BASE_URL);

// ── 4. effort 校验与 codex 降级映射 ──
console.log('\n[4] effort 校验与 codex 降级');
let threw = false;
try { EngineConfig.setEffort('claude', 'bogus'); } catch { threw = true; }
ok('非法 effort 被拒', threw);
threw = false;
try { EngineConfig.setEffort('nope', 'low'); } catch { threw = true; }
ok('非法 engine 被拒', threw);

EngineConfig.setProvider('codex', { provider: 'official', apiKey: '', model: '', effort: 'xhigh' });
ok('codex xhigh 降级为 high', EngineConfig.codexEffort() === 'high', EngineConfig.codexEffort());
EngineConfig.setEffort('codex', 'max');
ok('codex max 降级为 high', EngineConfig.codexEffort() === 'high', EngineConfig.codexEffort());
EngineConfig.setEffort('codex', 'medium');
ok('codex medium 原样', EngineConfig.codexEffort() === 'medium', EngineConfig.codexEffort());
EngineConfig.setEffort('codex', '');
ok('codex 自动时返回空串', EngineConfig.codexEffort() === '', EngineConfig.codexEffort());

// ── 5. slots() 供前端回显 ──
console.log('\n[5] slots() 回显');
const slots = EngineConfig.slots('claude');
ok('slots 同时含 official 与 minimax 两槽',
  !!slots.official && !!slots.minimax, Object.keys(slots));
ok('official 槽无 Key', (slots.official || {}).apiKey === '', slots.official);
ok('minimax 槽保有自己的 Key', (slots.minimax || {}).apiKey === 'sk-minimax-real', slots.minimax);

// ── 6. 落盘结构确实是分槽的 ──
console.log('\n[6] 落盘结构');
const onDisk = JSON.parse(fs.readFileSync(ENGINES, 'utf8'));
ok('落盘为 {provider, slots}', !!onDisk.claude.slots && typeof onDisk.claude.provider === 'string',
  Object.keys(onDisk.claude));

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'}：${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
