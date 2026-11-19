// Regression: a saved official model that is not in the (stale) catalog must survive reload.
// Uses an in-memory subclass: never touches data/engines.json or ~/.claude.
const assert = require('assert');
const { EngineConfig } = require('../dist/logic_realize/EngineConfig');
let disk = null;
class T extends EngineConfig {
  static _read() { return disk ? JSON.parse(JSON.stringify(disk)) : null; }
  static _write(c) { disk = JSON.parse(JSON.stringify(c)); }
  static _writeFile(c) { disk = JSON.parse(JSON.stringify(c)); }
  static applyEnv() {}
}
const builtin = ['opus', 'sonnet'].map((id) => ({ id, source: 'builtin' }));
// 1) new slotted file: official model absent from catalog is kept
disk = { claude: { provider: 'official', slots: { official: { apiKey: '', model: 'claude-fable-5-2', effort: '', models: builtin } } }, codex: { provider: 'official', slots: {} } };
assert.strictEqual(T.get().claude.model, 'claude-fable-5-2');
// 2) save round-trip keeps it
T.setProvider('claude', { provider: 'official', apiKey: '', model: 'claude-fable-5-2', effort: '' });
assert.strictEqual(T.get().claude.model, 'claude-fable-5-2');
assert.strictEqual(disk.claude.slots.official.model, 'claude-fable-5-2');
// 3) setModel / auto
T.setModel('claude', 'fable'); assert.strictEqual(T.get().claude.model, 'fable');
T.setModel('claude', ''); assert.strictEqual(T.get().claude.model, '');
// 4) codex official with a model not in the catalog is kept too
disk = { claude: { provider: 'official', slots: {} }, codex: { provider: 'official', slots: { official: { model: 'gpt-9-new', models: [{ id: 'gpt-6', source: 'catalog' }] } } } };
assert.strictEqual(T.get().codex.model, 'gpt-9-new');
// 5) legacy flat leftovers (other provider's model on official) are still dropped
disk = { claude: { provider: 'official', apiKey: '', model: 'deepseek-flash', models: [{ id: 'opus', source: 'builtin' }] }, codex: { provider: 'official' } };
assert.strictEqual(T.get().claude.model, '');
console.log('engine_model_persist: all passed');
