const assert = require('node:assert/strict');
const { CostPolicy } = require('../dist/helper/CostPolicy');
const { CostOptimizer } = require('../dist/logic_realize/CostOptimizer');
const { Settings } = require('../dist/logic_realize/Settings');
const { EngineConfig } = require('../dist/logic_realize/EngineConfig');
const { SessionManager } = require('../dist/logic_realize/SessionManager');
const { TraceStore } = require('../dist/logic_realize/TraceStore');
const { TaskQueue } = require('../dist/logic_realize/TaskQueue');

async function main() {
  const now = Date.now();
  let settings = { claudePromptCache: '1h', costOptimization: CostPolicy.defaults() };
  let provider = 'anthropic';
  const s = { id: 'root:uuid', rootId: 'root', engine: 'claude', claudeSessionId: 'uuid', tasks: [], messages: [], promptCache: '1h' };
  let events = [
    { kind: 'task_start', taskId: 't', ts: now - 7200000, raw: { cacheMode: '1h' } },
    { kind: 'text', taskId: 't', ts: now - 7190000, msgId: 'm', model: 'claude-opus-5-5', usage: {
      input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 90000, cache_creation_input_tokens: 10000,
      cache_creation: { ephemeral_1h_input_tokens: 10000, ephemeral_5m_input_tokens: 0 } } },
  ];
  Settings.get = () => settings;
  EngineConfig.get = () => ({ claude: { provider, model: 'claude-opus-5-5', models: [] } });
  SessionManager.getSession = () => s;
  SessionManager.getSessionFull = () => ({ ...s, messages: [{ role: 'user', text: 'Change the save button in settings from Save to Apply. Then run the UI tests.' }] });
  TraceStore.read = () => ({ events });
  TraceStore.liveEvents = () => ({ stamp: 'test', events: [] });
  let c = CostOptimizer.check(s.id, 'Continue');
  assert.equal(c.blocked, true);
  assert.equal(c.tokens, 100000);
  assert.equal(c.cacheState, 'expired');
  assert.deepEqual(c.costs, { warmUsd: 0.02, coldUsd: 0.8 });
  const token = CostOptimizer.approve(s.id, 'Continue', c.fingerprint);
  assert.equal(CostOptimizer.allowed(s.id, 'Continue', token), true);
  assert.equal(CostOptimizer.allowed(s.id, 'Different input', token), false, 'approval is bound to the exact input');
  CostOptimizer.consume(token);
  assert.equal(CostOptimizer.allowed(s.id, 'Continue', token), false, 'approval is one-use');
  settings.costOptimization = { ...CostPolicy.defaults(), mode: 'manual', strict: true };
  assert.throws(() => CostOptimizer.approve(s.id, 'Continue', c.fingerprint), /strict_locked/);
  assert.equal(CostOptimizer.allowed(s.id, 'Continue', token), false);
  const task = { id: 'blocked', prompt: 'Continue', status: 'pending' };
  s.tasks = [task];
  SessionManager.saveSession = () => {};
  TaskQueue._startTask(s, task);
  assert.equal(task.held, true);
  assert.equal(task.costBlocked, true, 'server guard must stop execution before launching');
  s.tasks = [];
  settings.costOptimization.scope = 'subscription';
  assert.equal(CostOptimizer.check(s.id).active, false);
  provider = 'official';
  assert.equal(CostOptimizer.check(s.id).active, true);
  provider = 'anthropic';
  settings.costOptimization = CostPolicy.defaults();
  events[0].ts = now - 60000; events[1].ts = now - 50000;
  assert.equal(CostOptimizer.check(s.id).blocked, false, 'warm long context is not stopped');
  events[1].usage.cache_creation = { ephemeral_5m_input_tokens: 10000 };
  events[0].ts = now - 400000; events[1].ts = now - 390000;
  assert.equal(CostOptimizer.check(s.id).cacheMode, '5m', 'actual old writes override newly selected one-hour setting');
  assert.equal(CostOptimizer.check(s.id).blocked, true);
  events[1].usage.cache_read_input_tokens = 1000;
  assert.equal(CostOptimizer.check(s.id).blocked, false, 'small context is not stopped');

  let calls = []; let created = 0;
  CostOptimizer.ai = async (_s, prompt, model) => { calls.push({ prompt, model }); return { text: '{"independent":true}', usd: 0.001 }; };
  SessionManager.createSession = () => ({ ...s, id: `root:draft-${++created}`, claudeSessionId: '' });
  SessionManager.removeSession = () => {};
  const independent = 'Change the text on the settings save button to Apply.';
  let r = await CostOptimizer.migrate(s.id, independent, () => {}, () => true);
  assert.equal(r.prompt, independent);
  assert.equal(calls.length, 1, 'an independent instruction must not be rewritten');
  assert.equal(calls[0].model, 'claude-haiku-4-5');
  calls = [];
  CostOptimizer.ai = async (_s, prompt, model) => { calls.push({ prompt, model }); return { text: calls.length === 1 ? '{"independent":false}' : independent, usd: 0.001 }; };
  const stages = [];
  r = await CostOptimizer.migrate(s.id, 'Continue', stage => stages.push(stage), () => true);
  assert.equal(r.prompt, independent);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].model, 'claude-opus-5-5', 'expansion uses the currently selected API provider model');
  assert.ok(stages.includes('enhancing'));
  assert.equal(r.helperUsd, 0.002);
  settings.costOptimization = { ...CostPolicy.defaults(), mode: 'manual', enhance: false };
  calls = [];
  r = await CostOptimizer.migrate(s.id, 'Continue', () => {}, () => true);
  assert.equal(r.prompt, 'Continue');
  assert.equal(calls.length, 0, 'disabled checking does not spend money');
  settings.costOptimization = CostPolicy.defaults();
  CostOptimizer.ai = async () => ({ text: 'bad response', usd: 0.001 });
  const count = created;
  await assert.rejects(CostOptimizer.migrate(s.id, 'Continue', () => {}, () => true), /classification_invalid/);
  assert.equal(created, count, 'failure must not create or send a new task');
  assert.equal(CostOptimizer.busy.size, 0, 'failure must release the operation lock');
  process.stdout.write('cost_optimization: strict server guard, approvals, TTL, scopes, classifier and migration passed\n');
}
main().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
