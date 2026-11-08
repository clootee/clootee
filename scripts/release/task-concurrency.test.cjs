'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.resolve(__dirname, '../../projects/claude_hub/backend/dist');
const { TaskQueue } = require(path.join(base, 'logic_realize/TaskQueue'));
const { SessionManager } = require(path.join(base, 'logic_realize/SessionManager'));
const { Settings } = require(path.join(base, 'logic_realize/Settings'));
const { EventBus } = require(path.join(base, 'helper/EventBus'));

test('limit pauses persist, resume once on increase, and respect manual pauses', () => {
  const originals = [];
  const patch = (obj, key, value) => { const old = obj[key]; originals.push(() => obj[key] = old); obj[key] = value; };
  const sessions = new Map();
  const events = [], starts = [];
  let max = 1, running = 1;
  const add = id => sessions.set(id, { id, paused: false, tasks: [{ id: `${id}-task`, status: 'pending', prompt: 'original message' }] });
  patch(SessionManager, 'getSession', id => structuredClone(sessions.get(id)));
  patch(SessionManager, 'saveSession', session => sessions.set(session.id, structuredClone(session)));
  patch(SessionManager, 'restorePersisted', () => [...sessions.values()].map(s => structuredClone(s)));
  patch(Settings, 'get', () => ({ maxConcurrentTasks: max }));
  patch(EventBus, 'broadcast', event => events.push(structuredClone(event)));
  patch(TaskQueue, '_isRunning', id => sessions.get(id).tasks.some(t => t.status === 'running'));
  patch(TaskQueue, '_runningCount', () => running);
  patch(TaskQueue, '_runningInfo', () => []);
  patch(TaskQueue, '_currentRunningTaskId', () => null);
  patch(TaskQueue, '_startTask', (session, task) => {
    starts.push([session.id, task.id, task.prompt]);
    task.status = 'running'; running++;
    SessionManager.saveSession(session);
  });
  try {
    add('blocked'); TaskQueue._tick('blocked');
    assert.equal(sessions.get('blocked').paused, true);
    assert.equal(sessions.get('blocked').concurrencyPaused, true);
    assert.equal(starts.length, 0);
    TaskQueue.onConcurrencyIncreased(1); // unchanged limit
    assert.equal(starts.length, 0);
    running = 0; TaskQueue._tick('blocked'); // free slot alone does not unpause
    assert.equal(starts.length, 0);
    running = 1; max = 2; TaskQueue.onConcurrencyIncreased(1);
    assert.deepEqual(starts, [['blocked', 'blocked-task', 'original message']]);
    assert.equal(sessions.get('blocked').paused, false);
    TaskQueue.onConcurrencyIncreased(1);
    assert.equal(starts.length, 1);
    add('manual'); TaskQueue._tick('manual'); TaskQueue.pauseFlow('manual');
    max = 3; TaskQueue.onConcurrencyIncreased(2);
    assert.equal(sessions.get('manual').paused, true);
    assert.equal(starts.length, 1);
    TaskQueue.resumeFlow('manual');
    assert.equal(starts.length, 2);
    add('restored'); TaskQueue._tick('restored');
    TaskQueue.restoreAndResume();
    assert.equal(sessions.get('restored').concurrencyPaused, true);
    max = 4; TaskQueue.onConcurrencyIncreased(3);
    assert.equal(starts.at(-1)[0], 'restored');
    add('older'); TaskQueue._tick('older');
    add('selected'); TaskQueue._tick('selected');
    max = 5; TaskQueue.onConcurrencyIncreased(4, 'selected');
    assert.equal(starts.at(-1)[0], 'selected');
    assert.equal(sessions.get('older').paused, true);
    assert.ok(events.some(e => e.kind === 'session' && e.session.concurrencyPaused));
  } finally { originals.reverse().forEach(restore => restore()); }
});
