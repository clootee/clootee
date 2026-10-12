const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PromptCache } = require('../dist/helper/PromptCache');
const { Settings } = require('../dist/logic_realize/Settings');
const { EngineStatus } = require('../dist/logic_realize/EngineStatus');
const { EngineConfig } = require('../dist/logic_realize/EngineConfig');
const { ClaudeRunner } = require('../dist/logic_realize/ClaudeRunner');
const { SessionManager } = require('../dist/logic_realize/SessionManager');
const { SessionMeta } = require('../dist/logic_realize/SessionMeta');

let saved = null;
let meta = {};
Settings._read = () => saved;
Settings._write = (s) => { saved = s; };
EngineStatus.get = () => ({ claude: { ready: true }, codex: { ready: true } });
EngineConfig.get = () => ({ claude: {} });
SessionMeta._read = () => structuredClone(meta);
SessionMeta._write = (m) => { meta = structuredClone(m); };
SessionManager._persist = () => {};
assert.equal(Settings.get().claudePromptCache, '1h');
assert.equal(Settings.get().askClaudePromptCache, false);
const draft = SessionManager.createSession('cache-test', '', 'claude');
assert.equal(draft.promptCache, '1h');
assert.equal(draft.promptCacheConfirmed, true);
Settings.update({ claudePromptCache: '5m', askClaudePromptCache: true, costOptimization: { mode: 'manual' } });
assert.equal(SessionManager.getSession(draft.id).promptCache, '1h', 'existing session retains snapshot');
const short = SessionManager.createSession('cache-test', '', 'claude');
assert.equal(short.promptCache, '5m');
assert.equal(short.promptCacheConfirmed, false);
SessionManager.setPromptCache(short.id, 'off');
assert.equal(SessionManager.getSession(short.id).promptCache, 'off');
assert.equal(SessionManager.getSession(short.id).promptCacheConfirmed, true);
SessionMeta.migrate(short.id, 'cache-test:natural');
assert.equal(meta['cache-test:natural'].promptCache, 'off');
assert.throws(() => Settings.update({ claudePromptCache: '2h' }), /Invalid/);
assert.throws(() => SessionManager.setPromptCache(draft.id, '2h'), /Invalid/);
const codex = SessionManager.createSession('cache-test', '', 'codex');
assert.throws(() => SessionManager.setPromptCache(codex.id, '1h'), /requires Claude/);

for (const mode of ['1h', '5m', 'off']) {
  const env = PromptCache.env(mode);
  assert.equal(env.CLAUDE_CODE_PROMPT_CACHE_TTL, mode === 'off' ? '1h' : mode);
  assert.equal(env.CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL, env.CLAUDE_CODE_PROMPT_CACHE_TTL);
  assert.equal(env.DISABLE_PROMPT_CACHING, mode === 'off' ? '1' : '0');
  assert.equal(env.FORCE_PROMPT_CACHING_5M, mode === '5m' ? '1' : '0');
  const args = ClaudeRunner._buildArgs({ ...draft, promptCache: mode }, os.tmpdir());
  const cli = JSON.parse(args[args.indexOf('--settings') + 1]);
  assert.deepEqual(cli.env, env);
  assert.equal(cli.subagentPromptCacheTtl, cli.promptCacheTtl);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-cache-'));
try {
  fs.mkdirSync(path.join(temp, '.claude'));
  const file = path.join(temp, '.claude/settings.json');
  fs.writeFileSync(file, JSON.stringify({ permissions: { allow: ['Read'] }, env: { EXISTING: 'keep', FORCE_PROMPT_CACHING_5M: '1' } }));
  PromptCache.sync('1h', temp);
  const cfg = JSON.parse(fs.readFileSync(file));
  assert.equal(cfg.env.EXISTING, 'keep');
  assert.equal(cfg.env.FORCE_PROMPT_CACHING_5M, '0');
  assert.equal(cfg.promptCacheTtl, '1h');
  assert.equal(cfg.subagentPromptCacheTtl, '1h');
  assert.deepEqual(cfg.permissions.allow, ['Read']);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
process.stdout.write('prompt_cache: defaults, session persistence, CLI settings and user config passed\n');
