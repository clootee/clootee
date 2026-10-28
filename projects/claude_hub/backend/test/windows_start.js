// Run the real launcher against isolated stop/build/start adapters, no live service.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
if (process.platform !== 'win32') process.exit(0);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-start-order-'));
const scripts = path.join(root, 'scripts');
const backend = path.join(root, 'projects/claude_hub/backend');
const writeBat = (name, body) => fs.writeFileSync(path.join(scripts, name), body.replace(/\r?\n/g, '\r\n'));
try {
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(path.join(backend, 'scripts'), { recursive: true });
  fs.copyFileSync(path.resolve(__dirname, '../../../../Windows_Start.bat'), path.join(root, 'Windows_Start.bat'));
  fs.copyFileSync(path.resolve(__dirname, '../../../../scripts/start-windows.bat'), path.join(scripts, 'start-windows.bat'));
  writeBat('node-env.bat', `@echo off\nset "NODE_EXE=${process.execPath}"\nexit /b 0\n`);
  fs.writeFileSync(path.join(backend, 'scripts/setup.js'), `require('fs').appendFileSync(${JSON.stringify(path.join(root, 'trace.log'))}, 'setup\\n');`);
  // Deliberately fail the final start so the fixture never opens a browser.
  fs.writeFileSync(path.join(scripts, 'win-service.ps1'), `Add-Content -LiteralPath '${path.join(root, 'trace.log').replace(/'/g, "''")}' -Value 'start'\nexit 1\n`);
  for (const [state, code] of [['not-running', 0], ['running', 0], ['stop-failed', 1]]) {
    fs.writeFileSync(path.join(root, 'trace.log'), '');
    writeBat('stop-windows.bat', `@echo off\necho stop-${state}>>"%~dp0..\\trace.log"\nexit /b ${code}\n`);
    const result = spawnSync('cmd.exe', ['/d', '/s', '/c', 'Windows_Start.bat'], {
      cwd: root, input: '\r\n', encoding: 'utf8', timeout: 15000, windowsHide: true,
    });
    if (result.error) throw result.error;
    const trace = fs.readFileSync(path.join(root, 'trace.log'), 'utf8').trim().split(/\r?\n/);
    assert.deepEqual(trace, code ? [`stop-${state}`] : [`stop-${state}`, 'setup', 'start'], result.stdout + result.stderr);
    assert.equal(result.status, 1); // intentional fixture start failure or stop rejection
    process.stdout.write(`PASS: Windows_Start ${state}: ${trace.join(' -> ')}\n`);
  }
} finally {
  if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('clootee-start-order-')) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
