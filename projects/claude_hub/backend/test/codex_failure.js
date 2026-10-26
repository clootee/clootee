const assert = require('node:assert/strict');
const { CodexRunner } = require('../dist/logic_realize/CodexRunner');
const { ProcessSpawner } = require('../dist/helper/ProcessSpawner');
const { CodexBin } = require('../dist/helper/CodexBin');
const { EngineAccess } = require('../dist/helper/EngineAccess');
const { RunAsUser } = require('../dist/helper/RunAsUser');
const { Settings } = require('../dist/logic_realize/Settings');
const { Toolchain } = require('../dist/logic_realize/Toolchain');
const { RootManager } = require('../dist/logic_realize/RootManager');
const { ExternalEnv } = require('../dist/helper/ExternalEnv');
const { Logger } = require('../dist/helper/Logger');

// Isolated process: no CLI, configuration writes, credentials, or network requests.
CodexRunner._buildArgs = () => ['exec', '--json', '-'];
CodexBin.resolve = () => ({ bin: 'codex', prefixArgs: [], useShell: false });
EngineAccess.ensureDir = () => {};
RunAsUser.wrap = (bin, args) => ({ bin, args });
Settings.runAsUser = () => '';
Toolchain.preferBundled = () => false;
RootManager.ensureExternalApi = () => ({});
ExternalEnv.build = () => ({});
Logger.info = Logger.warn = Logger.error = () => {};

function run(events, exitCode, stderr = '') {
  let processCallbacks;
  let result;
  let completions = 0;
  ProcessSpawner.run = (_bin, _args, _cwd, callbacks) => {
    processCallbacks = callbacks;
    return { kill() { throw new Error('unexpected process kill'); } };
  };
  CodexRunner.execute({ id: 'test:draft', rootId: 'test' }, process.cwd(), 'test', {
    onOutput() {}, onFinal() {}, onThinking() {}, onTool() {},
    onDone(ok, error) { result = { ok, error }; completions++; },
  });
  for (const event of events) processCallbacks.onLine(JSON.stringify(event));
  if (stderr) processCallbacks.onStderr(stderr);
  processCallbacks.onExit(exitCode);
  assert.equal(completions, 1);
  return result;
}

const failure = { type: 'turn.failed', error: { message: 'exceeded retry limit, last status: 429 Too Many Requests' } };
for (const code of [1, 0]) {
  const result = run([failure], code, 'failed to refresh available models: request timed out');
  assert.equal(result.ok, false, 'semantic turn failure overrides physical exit status');
  assert.match(result.error, /429 Too Many Requests/);
  assert.match(result.error, /request timed out/);
  assert.doesNotMatch(result.error, /杀毒|首次运行需要登录/);
}
const success = run([{ type: 'error', message: 'Reconnecting... 1/5' }, { type: 'turn.completed' }], 0);
assert.equal(success.ok, true, 'recovered transient errors must not fail a completed turn');
const unknown = run([], 1);
assert.equal(unknown.ok, false);
assert.match(unknown.error, /常见原因/);
console.log('codex_failure: terminal error preserved, exit-zero failure rejected, recovered retry succeeds, unknown failure retains diagnostics');
