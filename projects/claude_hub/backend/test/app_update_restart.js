// Exercise restart monitoring with real child processes, without restarting a server.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { Paths } = require('../dist/paths');
const { UpdateChecker } = require('../dist/logic_realize/UpdateChecker');
const originalSpawn = cp.spawn;
const originalLogs = Paths.LOGS_DIR;
const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-update-test-'));
Paths.LOGS_DIR = logs;
const { LogConfig } = require('../dist/config/LogConfig');
const originalLogPath = LogConfig.FILE_PATH;
LogConfig.FILE_PATH = path.join(logs, 'app.log');
class TestUpdate extends UpdateChecker {
  static _pull() { return Promise.resolve({ ok: true, output: 'test pull' }); }
}
async function waitForFailure() {
  const deadline = Date.now() + 10000;
  while (TestUpdate.status().applying && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(TestUpdate.status().applying, false, 'restart exit must release lock');
}
(async () => {
  try {
    for (const code of [17, 0]) {
      cp.spawn = (_exe, _args, options) => originalSpawn(process.execPath,
        ['-e', `process.stderr.write('test restart diagnostic');process.exit(${code})`], options);
      assert.equal((await TestUpdate.apply()).ok, true);
      await waitForFailure();
      assert.match(TestUpdate.status().error, new RegExp(`exit=${code}`));
      assert.match(TestUpdate.status().error, /test restart diagnostic/);
    }
    cp.spawn = (_exe, _args, options) => originalSpawn(path.join(logs, 'missing-executable'), [], options);
    await assert.rejects(() => TestUpdate.apply(), /ENOENT/);
    assert.equal(TestUpdate.status().applying, false);
    process.stdout.write('PASS: real restart exit 17, exit 0 without restart, launch failure, and retry\n');
  } finally {
    cp.spawn = originalSpawn;
    Paths.LOGS_DIR = originalLogs;
    LogConfig.FILE_PATH = originalLogPath;
    fs.rmSync(logs, { recursive: true, force: true });
  }
})().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
