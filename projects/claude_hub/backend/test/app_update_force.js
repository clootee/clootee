// Real local Git repositories: confirmation, force reset, and data preservation.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const { UpdateChecker } = require('../dist/logic_realize/UpdateChecker');
const { Paths } = require('../dist/paths');
const { LogConfig } = require('../dist/config/LogConfig');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee force update '));
const originalRoot = Paths.PROJECT_ROOT, originalLogs = Paths.LOGS_DIR, originalLog = LogConfig.FILE_PATH;
function git(cwd, ...args) {
  const result = cp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' } });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
function identity(root) {
  git(root, 'config', 'user.name', 'Update test'); git(root, 'config', 'user.email', 'update@example.invalid');
  git(root, 'config', 'commit.gpgsign', 'false');
}
const origin = path.join(base, 'origin.git');
const seed = path.join(base, 'seed');
fs.mkdirSync(seed);
git(base, 'init', '--bare', origin);
git(seed, 'init', '-b', 'main'); identity(seed);
write(path.join(seed, '.gitignore'), 'projects/claude_hub/data/\nprojects/user-project/\n');
write(path.join(seed, 'projects/claude_hub/backend/package.json'), '{"version":"1.0.0"}');
write(path.join(seed, 'code.txt'), 'initial');
write(path.join(seed, 'projects/clootee_console/source.js'), 'console initial');
git(seed, 'add', '.'); git(seed, 'commit', '-m', 'initial');
git(seed, 'remote', 'add', 'origin', origin); git(seed, 'push', '-u', 'origin', 'main');
function fixture(name) {
  const root = path.join(base, name);
  git(base, 'clone', '--branch', 'main', origin, root); identity(root);
  Paths.PROJECT_ROOT = path.join(root, 'projects/claude_hub');
  Paths.LOGS_DIR = path.join(root, 'projects/claude_hub/data/logs');
  fs.mkdirSync(Paths.LOGS_DIR, { recursive: true });
  LogConfig.FILE_PATH = path.join(Paths.LOGS_DIR, 'app.log');
  let restarts = 0;
  class Test extends UpdateChecker { static _triggerRestart() { restarts++; } }
  return { root, Test, restarts: () => restarts };
}
function publish(value) {
  write(path.join(seed, 'code.txt'), value);
  git(seed, 'add', 'code.txt'); git(seed, 'commit', '-m', value); git(seed, 'push', 'origin', 'main');
}
(async () => {
  try {
    const dirty = fixture('dirty');
    write(path.join(seed, 'projects/clootee_console/source.js'), 'console remote update');
    git(seed, 'add', 'projects/clootee_console/source.js');
    publish('remote-v2');
    write(path.join(dirty.root, 'code.txt'), 'local changes');
    const consoleFile = 'projects/clootee_console/source.js';
    write(path.join(dirty.root, consoleFile), 'console staged change');
    git(dirty.root, 'add', consoleFile);
    write(path.join(dirty.root, consoleFile), 'console unstaged change');
    const head = git(dirty.root, 'rev-parse', 'HEAD');
    const sentinels = [
      path.join(dirty.root, 'projects/user-project/source.js'),
      path.join(dirty.root, 'projects/claude_hub/data/settings.json'),
      path.join(dirty.root, 'untracked-project/source.js'),
      path.join(base, 'external-project/source.js'),
    ];
    for (const file of sentinels) write(file, 'keep me');
    const answer = await dirty.Test.apply();
    assert.equal(answer.requiresConfirmation, true);
    assert.equal(dirty.Test.status().applying, false);
    assert.equal(dirty.restarts(), 0);
    assert.equal(git(dirty.root, 'rev-parse', 'HEAD'), head);
    assert.equal(fs.readFileSync(path.join(dirty.root, 'code.txt'), 'utf8'), 'local changes');
    assert.equal((await dirty.Test.apply()).requiresConfirmation, true, 'declining must allow another attempt');
    assert.equal((await dirty.Test.apply(undefined, true)).ok, true);
    assert.equal(dirty.restarts(), 1);
    assert.equal(fs.readFileSync(path.join(dirty.root, 'code.txt'), 'utf8'), 'remote-v2');
    for (const file of sentinels) assert.equal(fs.readFileSync(file, 'utf8'), 'keep me');
    assert.equal(fs.readFileSync(path.join(dirty.root, consoleFile), 'utf8'), 'console unstaged change');
    assert.equal(git(dirty.root, 'show', `:${consoleFile}`), 'console staged change');
    process.stdout.write('PASS: local edits require consent; confirmed update preserves other projects and user data\n');

    const diverged = fixture('diverged');
    write(path.join(diverged.root, 'code.txt'), 'local commit');
    git(diverged.root, 'add', 'code.txt'); git(diverged.root, 'commit', '-m', 'local commit');
    publish('remote-v3');
    const divergedHead = git(diverged.root, 'rev-parse', 'HEAD');
    assert.equal((await diverged.Test.apply()).requiresConfirmation, true);
    assert.equal(git(diverged.root, 'rev-parse', 'HEAD'), divergedHead);
    assert.equal(diverged.restarts(), 0);
    assert.equal((await diverged.Test.apply(undefined, true)).ok, true);
    assert.equal(fs.readFileSync(path.join(diverged.root, 'code.txt'), 'utf8'), 'remote-v3');
    process.stdout.write('PASS: clean but diverged local commits are never reset without consent\n');

    const collision = fixture('untracked-collision');
    write(path.join(collision.root, 'new-code.txt'), 'local untracked code');
    write(path.join(seed, 'new-code.txt'), 'remote code');
    git(seed, 'add', 'new-code.txt'); git(seed, 'commit', '-m', 'add code'); git(seed, 'push', 'origin', 'main');
    assert.equal((await collision.Test.apply()).requiresConfirmation, true);
    assert.equal(fs.readFileSync(path.join(collision.root, 'new-code.txt'), 'utf8'), 'local untracked code');
    assert.equal((await collision.Test.apply(undefined, true)).ok, true);
    assert.equal(fs.readFileSync(path.join(collision.root, 'new-code.txt'), 'utf8'), 'remote code');
    process.stdout.write('PASS: untracked code collisions require consent\n');

    const merging = fixture('unfinished-merge');
    write(path.join(merging.root, 'code.txt'), 'local merge code');
    git(merging.root, 'add', 'code.txt'); git(merging.root, 'commit', '-m', 'local merge edit');
    publish('remote-v4');
    git(merging.root, 'fetch', 'origin');
    const conflict = cp.spawnSync('git', ['merge', '--no-edit', 'origin/main'], {
      cwd: merging.root, encoding: 'utf8', windowsHide: true,
    });
    assert.notEqual(conflict.status, 0);
    assert.equal(fs.existsSync(path.join(merging.root, '.git/MERGE_HEAD')), true);
    assert.equal((await merging.Test.apply()).requiresConfirmation, true);
    assert.equal((await merging.Test.apply(undefined, true)).ok, true);
    assert.equal(fs.readFileSync(path.join(merging.root, 'code.txt'), 'utf8'), 'remote-v4');
    assert.equal(fs.existsSync(path.join(merging.root, '.git/MERGE_HEAD')), false);
    process.stdout.write('PASS: confirmed update recovers an unfinished Clootee merge\n');

    const offline = fixture('offline');
    write(path.join(offline.root, 'code.txt'), 'keep local code');
    git(offline.root, 'remote', 'set-url', 'origin', path.join(base, 'missing-origin'));
    const offlineHead = git(offline.root, 'rev-parse', 'HEAD');
    await assert.rejects(() => offline.Test.apply(undefined, true), /fetch|repository|origin/i);
    assert.equal(fs.readFileSync(path.join(offline.root, 'code.txt'), 'utf8'), 'keep local code');
    assert.equal(git(offline.root, 'rev-parse', 'HEAD'), offlineHead);
    assert.equal(offline.Test.status().applying, false);
    assert.equal(offline.restarts(), 0);
    process.stdout.write('PASS: failed force fetch leaves local code intact and permits retry\n');

    const bootstrap = fixture('bootstrap');
    write(path.join(bootstrap.root, '.git/clootee-bootstrap'), 'pending');
    write(path.join(bootstrap.root, 'code.txt'), 'custom ZIP code');
    assert.equal((await bootstrap.Test.apply()).requiresConfirmation, true);
    assert.equal(fs.readFileSync(path.join(bootstrap.root, 'code.txt'), 'utf8'), 'custom ZIP code');
    assert.equal((await bootstrap.Test.apply(undefined, true)).ok, true);
    assert.equal(fs.readFileSync(path.join(bootstrap.root, 'code.txt'), 'utf8'), 'remote-v4');
    process.stdout.write('PASS: ZIP/bootstrap recovery also requires overwrite consent\n');

    const zipRoot = path.join(base, 'fresh-zip');
    Paths.PROJECT_ROOT = path.join(zipRoot, 'projects/claude_hub');
    Paths.LOGS_DIR = path.join(Paths.PROJECT_ROOT, 'data/logs');
    fs.mkdirSync(Paths.LOGS_DIR, { recursive: true });
    LogConfig.FILE_PATH = path.join(Paths.LOGS_DIR, 'app.log');
    write(path.join(zipRoot, 'code.txt'), 'custom ZIP files');
    write(path.join(zipRoot, 'projects/claude_hub/backend/package.json'), '{"version":"1.0.0"}');
    class FreshZip extends UpdateChecker { static _triggerRestart() {} }
    assert.equal((await FreshZip.apply()).requiresConfirmation, true);
    assert.equal(fs.existsSync(path.join(zipRoot, '.git')), false, 'declining must not initialize or overwrite the ZIP');
    const previousConfig = process.env.GIT_CONFIG_GLOBAL;
    const config = path.join(base, 'local-git.config');
    write(config, `[url "${origin.split(path.sep).join('/')}"]\n insteadOf = https://github.com/clootee/clootee.git\n`);
    process.env.GIT_CONFIG_GLOBAL = config;
    try {
      assert.equal((await FreshZip.apply(undefined, true)).ok, true);
      assert.equal(fs.readFileSync(path.join(zipRoot, 'code.txt'), 'utf8'), 'remote-v4');
      assert.equal(git(zipRoot, 'branch', '--show-current'), 'main');
    } finally {
      if (previousConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
      else process.env.GIT_CONFIG_GLOBAL = previousConfig;
    }
    process.stdout.write('PASS: fresh ZIP only initializes Git after confirmation and updates on main\n');

    const clean = fixture('normal-update');
    write(path.join(clean.root, 'projects/clootee_console/source.js'), 'only another project changed');
    publish('remote-v5');
    const normal = await clean.Test.apply();
    assert.equal(normal.ok, true);
    assert.equal(normal.requiresConfirmation, undefined);
    assert.equal(clean.restarts(), 1);
    assert.equal(fs.readFileSync(path.join(clean.root, 'code.txt'), 'utf8'), 'remote-v5');
    assert.equal(fs.readFileSync(path.join(clean.root, 'projects/clootee_console/source.js'), 'utf8'), 'only another project changed');
    process.stdout.write('PASS: ordinary fast-forward updates do not prompt for unrelated project changes\n');

    Paths.PROJECT_ROOT = path.join(bootstrap.root, 'nested/projects/claude_hub');
    fs.mkdirSync(Paths.PROJECT_ROOT, { recursive: true });
    const refused = bootstrap.Test._forcePull('main');
    assert.equal(refused.ok, false);
    assert.match(refused.output, /outside the Clootee installation/);
    process.stdout.write('PASS: force update rejects a parent repository outside the installation\n');
  } finally {
    Paths.PROJECT_ROOT = originalRoot; Paths.LOGS_DIR = originalLogs; LogConfig.FILE_PATH = originalLog;
    if (path.dirname(base) === path.resolve(os.tmpdir()) && path.basename(base).startsWith('clootee force update ')) {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
