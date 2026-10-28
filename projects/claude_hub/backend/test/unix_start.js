// Run Linux/macOS launchers in isolated fixtures with mocked OS processes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const source = path.resolve(__dirname, '../../../..');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee unix start '));
const shellPath = value => process.platform === 'win32'
  ? value.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase()) : value;
function script(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents.replace(/\r\n/g, '\n'), { mode: 0o755 });
}
try {
  for (const file of ['Linux_Start.sh', 'Mac_Start.command', 'scripts/start-unix.sh', 'scripts/stop-unix.sh',
    'projects/claude_hub/Linux_Start.sh', 'projects/claude_hub/Mac_Start.command']) {
    script(path.join(root, file), fs.readFileSync(path.join(source, file), 'utf8'));
  }
  const bin = path.join(root, 'bin');
  const state = path.join(root, 'old-server');
  const trace = path.join(root, 'trace');
  script(path.join(root, 'scripts/node-env.sh'), 'NODE_EXE="$FIXTURE_BIN/mock-node"\nexport NODE_EXE\n');
  fs.mkdirSync(path.join(root, 'projects/claude_hub/backend/dist'), { recursive: true });
  script(path.join(bin, 'mock-node'), `#!/usr/bin/env bash
case "$1" in
 *setup.js) echo setup >> "$FIXTURE_TRACE" ;;
 *) echo start >> "$FIXTURE_TRACE"; touch "$FIXTURE_STARTED" ;;
esac
`);
  script(path.join(bin, 'ps'), `#!/usr/bin/env bash
[ "$FIXTURE_MODE" != ps-failed ] || exit 1
entry="$FIXTURE_BACKEND/dist/index.js"
if [ "$FIXTURE_MODE" = legacy ]; then entry=dist/index.js; fi
if [ "$1" = -ax ]; then
 [ -f "$FIXTURE_STATE" ] || exit 0
 printf '12345 node %s\n' "$entry"; exit
fi
[ -f "$FIXTURE_STATE" ] || exit 1
[ "$2" = 12345 ] || exit 1
case "$4" in command=) printf 'node %s\n' "$entry" ;; comm=) echo node ;; stat=) echo S ;; esac
`);
  script(path.join(bin, 'lsof'), `#!/usr/bin/env bash
if [ "$1" = -a ]; then printf 'n%s\n' "$FIXTURE_BACKEND"; exit; fi
if [ "$FIXTURE_MODE" = foreign ]; then echo 99999
elif [ -f "$FIXTURE_STATE" ] && [ "$FIXTURE_MODE" != booting ]; then echo 12345
elif [ -f "$FIXTURE_STARTED" ]; then echo 67890
fi
`);
  script(path.join(bin, 'ss'), `#!/usr/bin/env bash
if [ -f "$FIXTURE_STATE" ] && [ "$FIXTURE_MODE" != booting ]; then echo 'LISTEN users:(("node",pid=12345,fd=20))'; fi
`);
  script(path.join(bin, 'readlink'), '#!/usr/bin/env bash\n[ "$FIXTURE_OS" != Darwin ] || exit 1\nprintf "%s\\n" "$FIXTURE_BACKEND"\n');
  script(path.join(bin, 'pm2'), `#!/usr/bin/env bash
if [ "$FIXTURE_MODE" = pm2-failed ]; then
 if [ "$1" = describe ]; then exit 0; fi
 echo pm2-stop >> "$FIXTURE_TRACE"; exit 1
fi
exit 1
`);
  script(path.join(bin, 'uname'), '#!/usr/bin/env bash\necho "$FIXTURE_OS"\n');
  for (const name of ['sleep', 'open', 'xdg-open']) script(path.join(bin, name), '#!/usr/bin/env bash\nexit 0\n');
  const shellEnv = path.join(root, 'shell-env');
  script(shellEnv, `export PATH="$FIXTURE_BIN:/usr/bin:/bin:$PATH"
kill() {
 if [ "$1" = -9 ]; then echo force >> "$FIXTURE_TRACE"; else echo stop >> "$FIXTURE_TRACE"; fi
 [ "$FIXTURE_MODE" != stop-failed ] || return 1
 if [ "$FIXTURE_MODE" = force ] && [ "$1" != -9 ]; then return 0; fi
 rm -f "$FIXTURE_STATE"
}
command() {
 if [ "$1" = -v ] && [ "$FIXTURE_MODE" = no-lsof ] && [ "$2" = lsof ]; then return 1; fi
 builtin command "$@"
}
`);
  const cases = [
    ['absent', false, 0, ['setup', 'start']],
    ['running', true, 0, ['stop', 'setup', 'start']],
    ['booting', true, 0, ['stop', 'setup', 'start']],
    ['legacy', true, 0, ['stop', 'setup', 'start']],
    ['force', true, 0, ['stop', 'force', 'setup', 'start']],
    ['no-lsof', true, 0, ['stop', 'setup', 'start']],
    ['stop-failed', true, 1, ['stop']],
    ['pm2-failed', true, 1, ['pm2-stop']],
    ['ps-failed', true, 1, []],
    ['foreign', false, 1, []],
  ];
  for (const platform of ['Linux', 'Darwin']) {
    const launcher = platform === 'Linux' ? 'Linux_Start.sh' : 'Mac_Start.command';
    for (const [mode, active, expectedCode, expectedTrace] of cases) {
      for (const file of [state, path.join(root, 'started')]) if (fs.existsSync(file)) fs.unlinkSync(file);
      if (active) fs.writeFileSync(state, '12345');
      fs.writeFileSync(trace, '');
      const result = spawnSync(bash, [shellPath(path.join(root, launcher))], {
        cwd: root, encoding: 'utf8', timeout: 15000, windowsHide: true,
        env: { ...process.env, BASH_ENV: shellPath(shellEnv),
          PATH: shellPath(bin) + ':' + (process.platform === 'win32' ? '/usr/bin:/bin' : process.env.PATH),
          FIXTURE_BIN: shellPath(bin), FIXTURE_STATE: shellPath(state), FIXTURE_TRACE: shellPath(trace),
          FIXTURE_STARTED: shellPath(path.join(root, 'started')), FIXTURE_MODE: mode,
          FIXTURE_BACKEND: shellPath(path.join(root, 'projects/claude_hub/backend')), FIXTURE_OS: platform },
      });
      if (result.error) throw result.error;
      const actual = fs.readFileSync(trace, 'utf8').trim().split(/\r?\n/).filter(Boolean);
      const details = `${platform}/${mode}\n${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, expectedCode, details);
      assert.deepEqual(actual, expectedTrace, details);
      process.stdout.write(`PASS: ${platform}/${mode}: ${actual.join(' -> ') || 'no start'}\n`);
    }
  }
} finally {
  if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('clootee unix start ')) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
