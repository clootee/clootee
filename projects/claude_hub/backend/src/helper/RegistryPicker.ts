// npm 源选择（业务无关）：决定 npm install 该走哪个 registry。
// 优先级（先命中先用）：
//   1) 用户已经配置过的源（环境变量 npm_config_registry / NPM_CONFIG_REGISTRY，或 ~/.npmrc 的 registry=）
//      —— 用户自己配过（公司私服、自选镜像）就尊重他的选择，绝不覆盖。
//   2) 竞速：并发探测官方源与国内镜像的响应延迟，谁快用谁。
//      比「按时区/语言猜国内外」准：挂了代理的国内用户往往官方源更快，而海外机器探测同样有效。
//   3) 都探测不通时回退官方源，把最终的失败留给 npm 自己去报（它的错误信息更具体）。
// 探测结果在进程内缓存，避免每次安装都重新测。
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';
import { URL } from 'url';

export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';
export const MIRROR_REGISTRY = 'https://registry.npmmirror.com/';

const PROBE_TIMEOUT_MS = 2000;
const CACHE_MS = 10 * 60 * 1000;

export class RegistryPicker {
  private static _cached: string | null = null;
  private static _cachedAt = 0;

  // 返回应当使用的 registry 地址（末尾带 /）
  static async pick(): Promise<string> {
    const configured = this.configured();
    if (configured) return configured;
    if (this._cached && Date.now() - this._cachedAt < CACHE_MS) return this._cached;
    const picked = await this._race();
    this._cached = picked;
    this._cachedAt = Date.now();
    return picked;
  }

  // 用户显式配置过的源（没有则 null）
  static configured(): string | null {
    const env = process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY;
    if (env && this._valid(env)) return this._normalize(env);
    for (const file of [path.join(os.homedir(), '.npmrc'), path.join(process.cwd(), '.npmrc')]) {
      const fromFile = this._readNpmrc(file);
      if (fromFile) return fromFile;
    }
    return null;
  }

  static clearCache(): void {
    this._cached = null;
    this._cachedAt = 0;
  }

  // 并发探测所有候选源，返回延迟最低的那个
  private static async _race(): Promise<string> {
    const cands = [OFFICIAL_REGISTRY, MIRROR_REGISTRY];
    const results = await Promise.all(cands.map((c) => this._probe(c)));
    let best: string | null = null;
    let bestMs = Number.POSITIVE_INFINITY;
    results.forEach((ms, i) => {
      if (ms !== null && ms < bestMs) {
        bestMs = ms;
        best = cands[i];
      }
    });
    return best || OFFICIAL_REGISTRY;
  }

  // 探测单个源的响应延迟（毫秒）；超时/出错返回 null
  private static _probe(registry: string): Promise<number | null> {
    return new Promise((resolve) => {
      const started = Date.now();
      let settled = false;
      const done = (v: number | null) => {
        if (settled) return;
        settled = true;
        resolve(v);
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

  private static _readNpmrc(file: string): string | null {
    try {
      const text = fs.readFileSync(file, 'utf-8');
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*registry\s*=\s*(\S+)\s*$/.exec(line);
        if (m && this._valid(m[1])) return this._normalize(m[1]);
      }
    } catch {
      /* 文件不存在或读不了：当作没配置 */
    }
    return null;
  }

  private static _valid(url: string): boolean {
    return /^https?:\/\/\S+$/.test(url);
  }

  private static _normalize(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
  }
}
