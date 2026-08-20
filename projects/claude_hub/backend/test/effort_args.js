// 验证 effort 真的进了 CLI 参数（claude --effort / codex -c model_reasoning_effort）。
// 只读 _buildArgs，不真跑引擎。同样备份并还原真实配置。
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✕ ${n}${x !== undefined ? ' → ' + JSON.stringify(x) : ''}`); } };

const { Paths } = require('../dist/paths');
const ENGINES = Paths.ENGINES_FILE;
const BACKUP = ENGINES + '.effort-test-backup';
const had = fs.existsSync(ENGINES);
if (had) fs.copyFileSync(ENGINES, BACKUP);
const CLAUDE_SETTINGS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');
const CS_BACKUP = CLAUDE_SETTINGS + '.effort-test-backup';
const hadCs = fs.existsSync(CLAUDE_SETTINGS);
if (hadCs) fs.copyFileSync(CLAUDE_SETTINGS, CS_BACKUP);
process.on('exit', () => {
  try { if (had) { fs.copyFileSync(BACKUP, ENGINES); fs.unlinkSync(BACKUP); } else if (fs.existsSync(ENGINES)) fs.unlinkSync(ENGINES); } catch (e) { console.log('⚠ 还原失败 ' + e.message); }
  try { if (hadCs) { fs.copyFileSync(CS_BACKUP, CLAUDE_SETTINGS); fs.unlinkSync(CS_BACKUP); } } catch (e) { console.log('⚠ 还原失败 ' + e.message); }
});

const { EngineConfig } = require('../dist/logic_realize/EngineConfig');
const { ClaudeRunner } = require('../dist/logic_realize/ClaudeRunner');
const { CodexRunner } = require('../dist/logic_realize/CodexRunner');

// _buildArgs 是 protected（TS 层面），运行期就是普通静态方法，可直接调用
const session = { id: 'r1:draft-x', engine: 'claude', claudeSessionId: '' };
const cwd = process.cwd();

console.log('\n[claude] --model / --effort 透传');
EngineConfig.setProvider('claude', { provider: 'official', apiKey: '', model: 'opus', effort: 'max' });
let a = ClaudeRunner._buildArgs(session, cwd);
ok('带 --model opus', a.includes('--model') && a[a.indexOf('--model') + 1] === 'opus', a);
ok('带 --effort max', a.includes('--effort') && a[a.indexOf('--effort') + 1] === 'max', a);

EngineConfig.setEffort('claude', '');
a = ClaudeRunner._buildArgs(session, cwd);
ok('自动时不传 --effort', !a.includes('--effort'), a);

EngineConfig.setModel('claude', '');
a = ClaudeRunner._buildArgs(session, cwd);
ok('自动时不传 --model', !a.includes('--model'), a);

console.log('\n[codex] -m / -c model_reasoning_effort 透传');
const cs = { id: 'r1:draft-y', engine: 'codex', claudeSessionId: '' };
EngineConfig.setProvider('codex', { provider: 'official', apiKey: '', model: 'gpt-5.5', effort: 'high' });
let b = CodexRunner._buildArgs(cs, cwd);
ok('带 -m gpt-5.5', b.includes('-m') && b[b.indexOf('-m') + 1] === 'gpt-5.5', b);
ok('带 -c model_reasoning_effort=high', b.includes('model_reasoning_effort=high'), b);

EngineConfig.setEffort('codex', 'max');
b = CodexRunner._buildArgs(cs, cwd);
ok('max 降级写成 =high', b.includes('model_reasoning_effort=high'), b);

EngineConfig.setEffort('codex', '');
b = CodexRunner._buildArgs(cs, cwd);
ok('自动时不传 -c model_reasoning_effort', !b.some((x) => String(x).includes('model_reasoning_effort')), b);

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'}：${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
