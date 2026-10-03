const assert = require('node:assert/strict');
const { SessionManager } = require('../dist/logic_realize/SessionManager');
const { TaskQueue } = require('../dist/logic_realize/TaskQueue');

// A streaming event must not read or parse session history, even for natural IDs.
const live = { id: 'root:draft-test', rootId: 'root', claudeSessionId: 'uuid', tasks: [] };
SessionManager._live.set(live.id, live);
SessionManager.getSession = () => { throw new Error('unexpected history hydration'); };
assert.equal(SessionManager.getRuntimeSession(live.id), live);
assert.equal(SessionManager.getRuntimeSession('root:uuid'), live);
for (let i = 0; i < 10000; i++) {
  assert.equal(TaskQueue._traceSessionId(live.id), 'root:uuid');
  TaskQueue._reconcileSessionId(live.id, 'uuid');
}
live.claudeSessionId = 'changed';
assert.equal(TaskQueue._traceSessionId(live.id), 'root:changed');
assert.equal(TaskQueue._traceSessionId('root:changed'), 'root:changed');
live.claudeSessionId = '';
assert.equal(TaskQueue._traceSessionId(live.id), live.id);
assert.throws(() => SessionManager.getRuntimeSession(''), /invalid id/);
let fallbackId;
SessionManager.getSession = id => { fallbackId = id; return live; };
assert.equal(SessionManager.getRuntimeSession('root:unloaded'), live);
assert.equal(fallbackId, 'root:unloaded');
process.stdout.write('runtime session streaming regression passed\n');
