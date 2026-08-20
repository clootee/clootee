'use strict';
/**
 * npm 源选择（安装脚本版）—— 与 src/helper/RegistryPicker.ts 是同一套规则的两份实现。
 * 为什么要两份：本文件要在「TypeScript 还没装、dist 还没编译」时就能用，只能是纯 JS；
 * 而运行期（界面里点「安装内置引擎」）用的是编译进 dist 的 TS 版。改规则时请两边一起改。
 *
 * 优先级：用户已配置的源 > 竞速最快的公共源 > 官方源。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const OFFICIAL = 'https://registry.npmjs.org/';
const MIRROR = 'https://registry.npmmirror.com/';
const PROBE_TIMEOUT_MS = 2000;

function valid(url) {
  return /^https?:\/\/\S+$/.test(url);
}

function normalize(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function readNpmrc(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
      const m = /^\s*registry\s*=\s*(\S+)\s*$/.exec(line);
      if (m && valid(m[1])) return normalize(m[1]);
    }
  } catch {
    /* 没有 .npmrc 就是没配置 */
  }
  return null;
}

// 用户显式配置过的源（环境变量或 .npmrc），没有则 null
function configured() {
  const env = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY;
  if (env && valid(env)) return normalize(env);
  return readNpmrc(path.join(os.homedir(), '.npmrc')) || readNpmrc(path.join(process.cwd(), '.npmrc'));
}

// 探测单个源的响应延迟（毫秒）；超时/出错返回 null
function probe(registry) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const u = new URL('-/ping', registry);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname, method: 'HEAD', timeout: PROBE_TIMEOUT_MS },
        (res) => {
          res.resume();
          done(res.statusCode && res.statusCode < 500 ? Date.now() - started : null);
        }
      );
      req.on('timeout', () => {
        req.destroy();
        done(null);
      });
      req.on('error', () => done(null));
      req.end();
    } catch {
      done(null);
    }
  });
}

/**
 * 选出该用的 registry。
 * 返回 { registry, reason, timings }：reason = configured | fastest | fallback
 */
async function pick() {
  const conf = configured();
  if (conf) return { registry: conf, reason: 'configured', timings: {} };

  const cands = [OFFICIAL, MIRROR];
  const results = await Promise.all(cands.map(probe));
  const timings = {};
  cands.forEach((c, i) => {
    timings[c] = results[i];
  });

  let best = null;
  let bestMs = Infinity;
  cands.forEach((c, i) => {
    if (results[i] !== null && results[i] < bestMs) {
      bestMs = results[i];
      best = c;
    }
  });
  if (best) return { registry: best, reason: 'fastest', timings };
  return { registry: OFFICIAL, reason: 'fallback', timings };
}

module.exports = { pick, configured, OFFICIAL, MIRROR };
