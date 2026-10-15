const assert = require('node:assert/strict');
const { SessionLimit } = require('../dist/helper/SessionLimit');
const { CostPolicy } = require('../dist/helper/CostPolicy');
const { SessionManager } = require('../dist/logic_realize/SessionManager');
const { Settings } = require('../dist/logic_realize/Settings');
const { TaskQueueStruct } = require('../dist/logic_struct/TaskQueueStruct');
const { EventBus } = require('../dist/helper/EventBus');

const messages = n => Array.from({ length: n }, (_, i) => ({ role: 'user', text: `prompt ${i}`, createdAt: i + 1 }));
let session = { id: 'root:draft-test', rootId: 'root', engine: 'codex', tasks: [], messages: [] };
let policy = CostPolicy.defaults();
const status = () => SessionLimit.status(session, session.messages, policy);
assert.equal(status().count, 0);
assert.equal(status().warnAt, 15);
assert.equal(status().max, 20);
session.messages = messages(14).concat(Array.from({ length: 80 }, () => ({ role: 'assistant', createdAt: 1 })));
assert.equal(status().warning, false, 'assistant fragments never count');
session.messages = messages(15);
assert.equal(status().warning, true);
assert.equal(status().blocked, false);
session.messages = messages(19);
SessionLimit.assertCapacity(status(), 1);
assert.throws(() => SessionLimit.assertCapacity(status(), 2), /session_message_limit_reached/);
session.tasks = [{ id: 'queued', status: 'pending' }];
assert.equal(status().blocked, true);
assert.throws(() => SessionLimit.assertCapacity(status(), 1), /session_message_limit_reached/);
session.tasks = [{ id: 'running', status: 'running', startedAt: 20 }];
assert.equal(status().count, 20, 'reserve a running turn before JSONL is flushed');
session.messages = messages(20);
assert.equal(status().count, 20, 'do not count the running turn twice after JSONL is flushed');
session.tasks = [];
for (const engine of ['claude', 'codex']) {
  for (const mode of ['auto', 'manual', 'off']) {
    session.engine = engine;
    policy = { ...CostPolicy.defaults(), mode, warnMessages: 3, maxMessages: 5 };
    assert.equal(status().max, 5, 'message limits apply to both engines in all cost modes');
    assert.throws(() => SessionLimit.assertCapacity(status(), 1), /session_message_limit_reached/);
    assert.equal(CostPolicy.effective({ costOptimization: policy }).maxMessages, 5);
  }
}
const sanitized = CostPolicy.sanitize({ warnMessages: 40.8, maxMessages: 4.9 });
assert.equal(sanitized.maxMessages, 4);
assert.equal(sanitized.warnMessages, 3);
assert.equal(CostPolicy.sanitize({ maxMessages: -1, warnMessages: NaN }).maxMessages, 2);

// Exercise actual queue entry points without launching an AI or touching disk.
policy = CostPolicy.defaults();
Settings.get = () => ({ costOptimization: policy });
SessionManager.getSessionFull = SessionManager.getSession = () => session;
SessionManager.saveSession = () => {};
EventBus.broadcast = () => {};
class Queue extends TaskQueueStruct {
  static _appendTasks(_id, tasks) { session.tasks.push(...tasks); }
  static _tick() {}
}
for (const engine of ['claude', 'codex']) {
  session = { ...session, engine, messages: messages(19), tasks: [] };
  assert.throws(() => Queue.addTasks(session.id, ['one', 'two']), /session_message_limit_reached/);
  assert.equal(session.tasks.length, 0, 'oversized batches fail atomically');
  Queue.addTasks(session.id, ['last slot']);
  assert.equal(session.tasks.length, 1);
  assert.throws(() => Queue.addTasks(session.id, ['external bypass'], true), /session_message_limit_reached/);
  session.messages = messages(20);
  const pending = session.tasks[0];
  Queue._startTask(session, pending);
  assert.equal(pending.held, true, 'existing queues are rechecked before launch');
}
console.log('session_limit: defaults, boundaries, running/queued reservations, modes, engines and queue enforcement passed');
