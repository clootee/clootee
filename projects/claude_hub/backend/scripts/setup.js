#!/usr/bin/env node
'use strict';
/**
 * claude-hub 安装器 / 自检器（install & doctor）—— 跨平台唯一实现
 * ============================================================================
 * 各平台的启动脚本（scripts/start-windows.bat、scripts/start-unix.sh）只负责「找到一个可用的 Node」，
 * 之后所有安装与检查逻辑都在这里，Windows / macOS / Linux 共用同一份代码。
 *
 * 为什么是 .js 而不是 .ts：本脚本要在「TypeScript / ts-node 还没装」的时刻运行，
 * 必须只依赖 Node 内置模块。
 *
 * AI 引擎（claude / codex）**不随包内置**，一律 `npm install -g`（源在官方与国内镜像间竞速选出）。
 * 默认也**不自动下载**：它们体积很大（各 400~500MB），而且
 *   ① 多数人本机已装过，PATH 命中就什么都不用做；
 *   ② 没装的人在界面引导「选引擎」那一步点一下即可安装，那里有进度显示，
 *      比在这个黑窗口里静默跑几分钟 npm 的体验好得多。
 * 这里只做「报告」，除非你显式要求安装。
 *
 * 用法：
 *   node scripts/setup.js               自动模式：缺什么补什么，已就绪则秒退（start 脚本用）
 *   node scripts/setup.js --full        完整安装：校验依赖 + 重新编译（仍不下载引擎）
 *   node scripts/setup.js --check       只体检不改动，打印一份环境报告
 *   node scripts/setup.js --with-claude 顺便 npm 全局安装/更新 claude code
 *   node scripts/setup.js --with-codex  顺便 npm 全局安装/更新 codex
 *   node scripts/setup.js --with-tools  上面两个都装
 *   node scripts/setup.js --no-tools    一律不碰引擎（优先级最高）
 *   node scripts/setup.js --with-git    缺 git 就装：Windows 下便携版 MinGit 到 out_end/git（走镜像），
 *                                       Linux/macOS 走系统包管理器
 *   node scripts/setup.js --with-git-full  同上，但 Windows 装完整版 PortableGit（含 Git Bash / 凭据管理器）
 *
 * 退出码：0 = 就绪（用 dist 运行）  2 = 降级就绪（dist 不可用，请用 ts-node 运行）  1 = 失败
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const builder = require('./build');
const registryPicker = require('./registry');
const gitInstaller = require('./git');

const BACKEND = path.resolve(__dirname, '..');
const HUB = path.resolve(BACKEND, '..');
const OUT_END = path.join(HUB, 'out_end');
const TOOLS = path.join(OUT_END, 'tools');
const GIT_DIR = path.join(OUT_END, 'git');
const DATA = path.join(HUB, 'data');
const FRONTEND = path.join(HUB, 'frontend');
const DIST_ENTRY = path.join(BACKEND, 'dist', 'index.js');

const MIN_NODE_MAJOR = 18;
const ENGINE_PKGS = {
  claude: '@anthropic-ai/claude-code@latest',
  codex: '@openai/codex@latest',
};

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const MODE = has('--check') ? 'check' : has('--full') ? 'full' : 'auto';
const NO_TOOLS = has('--no-tools');
// --no-tools 优先级最高：明确说了别碰引擎，就一律不碰
const WANT_ENGINE = {
  claude: !NO_TOOLS && (has('--with-claude') || has('--with-tools')),
  codex: !NO_TOOLS && (has('--with-codex') || has('--with-tools')),
};
const QUIET = has('--quiet');
const WANT_GIT_FULL = has('--with-git-full');
const WANT_GIT = WANT_GIT_FULL || has('--with-git');

// 选定的 npm 源（启动时探测一次，见 scripts/registry.js）
let REGISTRY = null;
let REGISTRY_REASON = '';

const problems = [];
const warnings = [];

// ── 输出 ───────────────────────────────────────────────────────────────────
const say = (s) => console.log(s);
const ok = (s) => {
  if (!QUIET) console.log(`  [ok]   ${s}`);
};
const step = (s) => console.log(`  [..]   ${s}`);
const warn = (s) => {
  warnings.push(s);
  console.log(`  [warn] ${s}`);
};
const fail = (s) => {
  problems.push(s);
  console.log(`  [FAIL] ${s}`);
};

// ── npm 定位与执行（不依赖 shell / PATH，直接用当前 Node 跑 npm-cli.js） ──────
function npmCli() {
  const nodeDir = path.dirname(process.execPath);
  const cands = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Windows 便携版 & 官方安装包
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'), // Unix 便携版 / 系统安装
    path.join(nodeDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

function runNpm(args, cwd) {
  const cli = npmCli();
  // 清掉 NODE_ENV=production：否则 npm 会跳过 devDependencies（typescript 装不上就没法编译 dist）
  const env = { ...process.env };
  delete env.NODE_ENV;
  const opts = { cwd: cwd || BACKEND, stdio: 'inherit', env };
  if (cli) return spawnSync(process.execPath, [cli, ...args], opts);
  // 兜底：走 PATH 上的 npm（Windows 是 npm.cmd，必须 shell:true）
  return spawnSync('npm', args, { ...opts, shell: process.platform === 'win32' });
}

// 选定 npm 源：用户配过就用用户的，否则并发探测官方源与国内镜像，谁快用谁。
// 比「按时区猜国内外」准：挂代理的国内机器往往官方源更快。
async function pickRegistry() {
  if (REGISTRY) return REGISTRY;
  const r = await registryPicker.pick();
  REGISTRY = r.registry;
  REGISTRY_REASON = r.reason;
  const detail =
    r.reason === 'configured'
      ? '你已配置 / your own setting'
      : r.reason === 'fallback'
        ? '两个源都探测不通，先按官方源试 / both probes failed, trying official'
        : Object.entries(r.timings)
            .map(([u, ms]) => `${new URL(u).hostname}=${ms === null ? '超时' : ms + 'ms'}`)
            .join('  ');
  ok(`npm 源 / registry: ${REGISTRY}  (${detail})`);
  return REGISTRY;
}

// 另一个候选源（首选失败时换它重试）
function otherRegistry() {
  return REGISTRY === registryPicker.MIRROR ? registryPicker.OFFICIAL : registryPicker.MIRROR;
}

// 带换源重试的 npm 安装：先用选定源，失败再换另一个公共源试一次。
// 用户自己配了私服时不乱换（换了大概率也装不上，反而掩盖真正的错误）。
function npmInstallWithFallback(args, cwd, label) {
  let r = runNpm([...args, `--registry=${REGISTRY}`], cwd);
  if (r.status === 0) return r;
  if (REGISTRY_REASON === 'configured') return r;
  warn(`${label}: 换另一个源重试 / retrying with ${new URL(otherRegistry()).hostname} ...`);
  return runNpm([...args, `--registry=${otherRegistry()}`], cwd);
}

function onPath(cmd) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], { encoding: 'utf-8' });
  if (r.status !== 0 || !r.stdout) return null;
  const first = String(r.stdout).trim().split(/\r?\n/)[0];
  return first || null;
}

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

// ── 1. Node 版本 ───────────────────────────────────────────────────────────
function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    fail(
      `Node 版本过低 / Node too old: v${process.versions.node}（需要 >= ${MIN_NODE_MAJOR}）。` +
        `删除 out_end/node 后重跑 install 脚本可下载内置便携版。`
    );
    return false;
  }
  ok(`Node v${process.versions.node} (${process.platform}/${process.arch}) — ${process.execPath}`);
  return true;
}

// ── 2. npm 可用性 ──────────────────────────────────────────────────────────
function checkNpm() {
  const cli = npmCli();
  if (cli) {
    ok(`npm: ${cli}`);
    return true;
  }
  const p = onPath('npm');
  if (p) {
    warn(`未在 Node 目录下找到 npm，改用 PATH 上的 npm / falling back to PATH npm: ${p}`);
    return true;
  }
  fail('找不到 npm / npm not found —— 请重新安装 Node.js，或删除 out_end/node 后重跑 install 脚本');
  return false;
}

// ── 3. 后端依赖 ────────────────────────────────────────────────────────────
// 运行期只需要 express + ws；typescript 用于构建 dist；ts-node 仅作为构建失败时的兜底运行方式。
const RUNTIME_DEPS = ['express', 'ws'];
const BUILD_DEPS = ['typescript', '@types/node', '@types/express', '@types/ws'];

function missingDeps(list) {
  return list.filter((m) => {
    // @types/* 没有入口文件，require.resolve 解析不了，改看包目录是否存在
    if (m.startsWith('@types/')) {
      return !fs.existsSync(path.join(BACKEND, 'node_modules', ...m.split('/'), 'package.json'));
    }
    try {
      require.resolve(m, { paths: [BACKEND] });
      return false;
    } catch {
      return true;
    }
  });
}

// 依赖指纹：只看 package.json 里的依赖声明本身（不看文件时间戳——改个 scripts 字段
// 不应该触发重装，否则每次启动都会白跑一遍 npm install）。安装成功后写入 node_modules。
const DEPS_STAMP = path.join(BACKEND, 'node_modules', '.claude-hub-deps.json');

function depsFingerprint() {
  const pkg = JSON.parse(fs.readFileSync(path.join(BACKEND, 'package.json'), 'utf-8'));
  return JSON.stringify({
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
    node: Number(process.versions.node.split('.')[0]),
  });
}

function writeDepsStamp() {
  try {
    fs.writeFileSync(DEPS_STAMP, depsFingerprint());
  } catch {
    /* 写不进去只影响下次能否走快速路径，不算失败 */
  }
}

function depsFresh() {
  if (!fs.existsSync(path.join(BACKEND, 'node_modules'))) return false;
  if (missingDeps([...RUNTIME_DEPS, ...BUILD_DEPS]).length) return false;
  try {
    return fs.readFileSync(DEPS_STAMP, 'utf-8') === depsFingerprint();
  } catch {
    return false;
  }
}

async function installDeps() {
  // --include=dev：NODE_ENV=production 时 npm 默认跳过 devDependencies，会导致没有 typescript 可编译
  const base = ['install', '--include=dev', '--no-audit', '--no-fund'];
  await pickRegistry();
  step('安装后端依赖 / installing backend dependencies ...');
  const r = npmInstallWithFallback(base, BACKEND, '依赖 / dependencies');
  if (r.status !== 0) {
    fail('依赖安装失败 / npm install failed —— 请检查网络或代理设置后重试');
    return false;
  }
  const missing = missingDeps([...RUNTIME_DEPS, ...BUILD_DEPS]);
  if (missing.length) {
    fail(`依赖安装后仍缺失 / still missing after install: ${missing.join(', ')}`);
    return false;
  }
  writeDepsStamp();
  ok('后端依赖就绪 / dependencies ready');
  return true;
}

async function checkDeps() {
  if (depsFresh()) {
    ok('后端依赖已是最新 / dependencies up to date');
    return true;
  }
  const missing = missingDeps([...RUNTIME_DEPS, ...BUILD_DEPS]);
  if (MODE === 'check') {
    if (missing.length) {
      fail(`缺少依赖 / missing dependencies: ${missing.join(', ')} —— 运行 install 脚本即可修复`);
      return false;
    }
    warn('依赖已安装但缺少安装标记 / installed but not stamped —— 运行一次 install 脚本即可');
    return true;
  }
  return installDeps();
}

// ── 4. 编译产物 dist（运行期只需要 dist + express/ws，无需 TypeScript） ────────
function checkBuild() {
  if (builder.isFresh()) {
    ok('编译产物 dist 已是最新 / dist is up to date');
    return true;
  }
  if (MODE === 'check') {
    fail('dist 缺失或过期 / dist missing or stale —— 运行 install 脚本即可修复');
    return false;
  }
  step('编译 TypeScript → dist / compiling ...');
  const r = builder.build({ force: MODE === 'full' });
  if (!r.ok) {
    // 编译失败不直接判死：只要 ts-node 在，仍可用源码直跑（降级）
    if (missingDeps(['ts-node']).length === 0) {
      warn(`${r.error} —— 将降级用 ts-node 直接运行源码 / falling back to ts-node`);
      return 'degraded';
    }
    fail(r.error);
    return false;
  }
  ok(`编译完成 / build done${r.skipped ? '（跳过）' : ''}`);
  return true;
}

// ── 5. 数据目录可写 ────────────────────────────────────────────────────────
function checkData() {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.mkdirSync(path.join(DATA, 'logs'), { recursive: true });
    const probe = path.join(DATA, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    ok(`数据目录可写 / data dir writable: ${DATA}`);
    return true;
  } catch (e) {
    fail(`数据目录不可写 / data dir not writable: ${DATA} (${e.message})`);
    return false;
  }
}

// ── 6. 前端静态资源 ────────────────────────────────────────────────────────
function checkFrontend() {
  const entry = path.join(FRONTEND, 'index.html');
  if (!fs.existsSync(entry)) {
    fail(`缺少前端文件 / frontend missing: ${entry}`);
    return false;
  }
  ok('前端静态文件就绪 / frontend ready');
  return true;
}

// ── 7. AI 引擎（claude / codex）──────────────────────────────────────────────
// 引擎不再内置，一律 npm 全局安装。这里保留对老版本 out_end/tools 里那份的识别，
// 免得已经装过的用户被重复提示「未安装」。
function legacyBundledEngine(name) {
  const p =
    process.platform === 'win32'
      ? path.join(TOOLS, `${name}.cmd`)
      : path.join(TOOLS, 'bin', name);
  return fs.existsSync(p) ? p : null;
}

async function installEngine(name) {
  await pickRegistry();
  step(`全局安装 ${name} / npm install -g ${ENGINE_PKGS[name]}（约 400-500MB，请耐心）...`);
  const args = ['install', '-g', ENGINE_PKGS[name], '--no-audit', '--no-fund'];
  const r = npmInstallWithFallback(args, HUB, name);
  if (r.status !== 0) {
    warn(`${name} 安装失败（不影响启动，可稍后在界面里一键安装）/ install failed`);
    return false;
  }
  ok(`${name} 就绪 / ready`);
  return true;
}

// 引擎缺失只警告不判死：软件能启动，界面引导里可以带进度条一键装。
// 默认**不下载**（各 400-500MB）：只有显式 --with-claude / --with-codex / --with-tools 才装。
async function checkEngines() {
  for (const name of ['claude', 'codex']) {
    const sys = onPath(name);
    const bun = legacyBundledEngine(name);
    if (sys || bun) {
      ok(`${name}: ${sys ? `已安装 / installed (${sys})` : ''}${sys && bun ? ' + ' : ''}${bun ? '旧内置版 / legacy bundled' : ''}`);
      if (WANT_ENGINE[name] && MODE !== 'check') await installEngine(name); // 显式要求 = 更新到最新版
      continue;
    }
    if (WANT_ENGINE[name] && MODE !== 'check') {
      await installEngine(name);
      continue;
    }
    if (name === 'claude') {
      warn('claude 未安装 / not installed —— 启动后在引导页「选引擎」一步可一键安装（带进度），' +
        `或此处加 --with-claude 现在装，或自行执行 npm install -g ${ENGINE_PKGS.claude}`);
    } else {
      warn('codex 未安装 / not installed —— 只在你要用 Codex 引擎时才需要，界面里可一键安装，' +
        `或此处加 --with-codex，或自行执行 npm install -g ${ENGINE_PKGS.codex}`);
    }
  }
  return true;
}

// ── 8. git（会话里的「推送到云端」功能依赖它）────────────────────────────────
// 默认只报告不下载（同引擎的策略）：加 --with-git 才装。Windows 装便携版到 out_end/git，
// 免管理员、不写注册表、下载源在国内镜像与 GitHub 之间竞速；Linux/macOS 走系统包管理器。
async function checkGit() {
  const sys = onPath('git');
  const bun = gitInstaller.bundled(GIT_DIR);
  if (sys || bun) {
    ok(`git: ${sys || `${bun}（内置 / bundled）`}`);
    return true;
  }
  if (!WANT_GIT || MODE === 'check') {
    warn(
      '未检测到 git / git not found —— 会话内的 git 推送功能将不可用（其余功能不受影响）。' +
        `加 --with-git 可自动安装${process.platform === 'win32' ? '便携版（约 41MB，走镜像）' : ''}，` +
        `或手动：${gitInstaller.manualHint()}`
    );
    return true;
  }
  step('安装 git / installing git ...');
  const r = await gitInstaller.install(GIT_DIR, { full: WANT_GIT_FULL, log: (s) => step(s) });
  if (!r.ok) {
    warn(`git 安装失败 / install failed: ${r.error} —— 手动安装：${gitInstaller.manualHint()}`);
    return true;
  }
  ok(`git 就绪 / ready: ${r.bin}${r.version ? ` (${r.version})` : ''}`);
  return true;
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
async function main() {
  const title =
    MODE === 'check' ? '环境体检 / doctor' : MODE === 'full' ? '完整安装 / full install' : '启动前自检 / preflight';
  if (!QUIET || MODE !== 'auto') {
    say('');
    say(`==> claude-hub ${title}`);
  }

  let degraded = false;
  const hard = [checkNode(), checkNpm()];
  if (hard.includes(false)) return finish(false, false);

  if ((await checkDeps()) === false) return finish(false, false);

  const b = checkBuild();
  if (b === false) return finish(false, false);
  if (b === 'degraded') degraded = true;

  const rest = [checkData(), checkFrontend()];
  await checkEngines();
  await checkGit();
  return finish(!rest.includes(false), degraded);
}

function finish(good, degraded) {
  const okAll = good && problems.length === 0;
  if (!okAll) {
    say('');
    say('==> 安装未完成 / setup incomplete:');
    for (const p of problems) say(`    - ${p}`);
    return process.exit(1);
  }
  if (!QUIET || MODE !== 'auto') {
    say('');
    if (degraded) {
      say('==> 环境就绪（降级：用 ts-node 跑源码）/ ready (degraded: running from source)');
    } else {
      say(`==> 环境就绪 / ready — 运行入口 / entry: ${path.relative(HUB, DIST_ENTRY)}`);
    }
    if (warnings.length) say(`    ${warnings.length} 条提醒见上 / see warnings above`);
  }
  return process.exit(degraded ? 2 : 0);
}

main().catch((e) => {
  console.log(`  [FAIL] 安装脚本内部错误 / setup crashed: ${(e && e.stack) || e}`);
  process.exit(1);
});
