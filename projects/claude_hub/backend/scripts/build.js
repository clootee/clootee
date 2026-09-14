#!/usr/bin/env node
'use strict';
/**
 * 构建脚本 / build script
 *   backend/src/**.ts  --tsc-->  backend/dist/**.js
 *   backend/src 下的非 TS 资源（config/templates/*.md）复制到 dist —— tsc 不会搬运它们。
 *
 * 为什么是 .js 而不是 .ts：本脚本会在「TypeScript 尚未安装 / dist 尚未生成」的时刻被调用，
 * 只能依赖 Node 内置模块，不能经过编译或 ts-node。
 *
 * 单独使用： node scripts/build.js        （等价于 npm run build）
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND = path.resolve(__dirname, '..');
const SRC = path.join(BACKEND, 'src');
const DIST = path.join(BACKEND, 'dist');
const TSCONFIG = path.join(BACKEND, 'tsconfig.json');
// tsc 不认识的资源后缀：编译后需要原样出现在 dist 里（TemplatesConfig 用 __dirname 读取）
const ASSET_EXT = ['.md', '.json', '.html', '.txt'];

// ── 收集 src 下所有文件（用于「是否需要重新编译」的时间戳比较与资源复制） ──────────
function walk(dir, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function mtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

// src / tsconfig / package.json 里最新一次改动的时间
function newestSourceMtime() {
  let newest = Math.max(mtime(TSCONFIG), mtime(path.join(BACKEND, 'package.json')));
  for (const f of walk(SRC)) newest = Math.max(newest, mtime(f));
  return newest;
}

// 编译产物是否已是最新（dist 存在、资源齐全、且比任何源文件都新）
function isFresh() {
  const entry = path.join(DIST, 'index.js');
  if (!fs.existsSync(entry)) return false;
  for (const rel of assetList()) {
    if (!fs.existsSync(path.join(DIST, rel))) return false;
  }
  return mtime(entry) >= newestSourceMtime();
}

// src 下需要原样复制到 dist 的资源（相对 src 的路径）
function assetList() {
  return walk(SRC)
    .filter((f) => ASSET_EXT.includes(path.extname(f).toLowerCase()))
    .map((f) => path.relative(SRC, f));
}

function copyAssets() {
  const list = assetList();
  for (const rel of list) {
    const to = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(SRC, rel), to);
  }
  return list.length;
}

// 解析 typescript 自带的 tsc 入口（不走 npx，避免联网与 shell 差异）
function tscEntry() {
  const p = path.join(BACKEND, 'node_modules', 'typescript', 'bin', 'tsc');
  return fs.existsSync(p) ? p : null;
}

/**
 * 执行编译。opts.force=true 时即使产物是最新的也重新编译。
 * 返回 { ok, skipped, assets, error }
 */
function build(opts) {
  const force = !!(opts && opts.force);
  if (!force && isFresh()) return { ok: true, skipped: true, assets: 0 };

  const tsc = tscEntry();
  if (!tsc) {
    return { ok: false, error: '未找到 typescript（请先 npm install） / typescript is not installed' };
  }
  const r = spawnSync(process.execPath, [tsc, '-p', TSCONFIG], { cwd: BACKEND, stdio: 'inherit' });
  if (r.status !== 0) {
    return { ok: false, error: `tsc 编译失败 / tsc failed (exit ${r.status})` };
  }
  const assets = copyAssets();
  if (!fs.existsSync(path.join(DIST, 'index.js'))) {
    return { ok: false, error: '编译完成但缺少 dist/index.js / dist/index.js missing after build' };
  }
  return { ok: true, skipped: false, assets };
}

module.exports = { build, copyAssets, isFresh, newestSourceMtime, assetList, DIST, BACKEND };

if (require.main === module) {
  const force = process.argv.includes('--force');
  const r = build({ force });
  if (!r.ok) {
    console.error(`[build] ${r.error}`);
    process.exit(1);
  }
  console.log(r.skipped ? '[build] 已是最新，跳过 / up to date' : `[build] 完成 / done (assets: ${r.assets})`);
}
