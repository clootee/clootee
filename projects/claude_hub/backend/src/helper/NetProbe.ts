// 网络连通性探测（业务无关，可独立测试）：给一个 URL，回答「通不通、多快、为什么不通」。
//
// 两个设计要点：
//   1) **只看「有没有 HTTP 响应」，不看状态码**。api.anthropic.com 不带鉴权访问会返回 401/404，
//      那恰恰证明「连得上」。把 4xx 当失败会把「能用」误报成「不通」。
//   2) **跟随代理环境变量**。Node 的 http/https 默认不认 HTTPS_PROXY，直连探测会在
//      「用户已经开了科学上网、claude 其实能用」时误报不通。所以配了代理就走 CONNECT 隧道探，
//      与 claude CLI 实际走的路径一致。
//
// 跨平台：只依赖 Node 内置 http/https/url，Windows / macOS / Linux 行为一致。
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface ProbeResult {
  url: string;
  ok: boolean;
  ms: number;              // 耗时（毫秒）；失败时是放弃前的耗时
  status?: number;         // 拿到的 HTTP 状态码（有响应即算通，不论 2xx/4xx）
  viaProxy?: boolean;      // 本次是否经代理探测
  error?: string;          // 失败原因（人话）
}

export interface ProxyInfo {
  enabled: boolean;
  url: string;             // 生效的代理地址（已脱敏：去掉 user:pass）
  from: string;            // 来自哪个环境变量
}

const PROXY_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'];

export class NetProbe {
  // 当前进程可见的代理设置（没有则 enabled=false）
  static proxy(): ProxyInfo {
    for (const name of PROXY_VARS) {
      const raw = (process.env[name] || '').trim();
      if (!raw) continue;
      const parsed = this._parseProxy(raw);
      if (parsed) return { enabled: true, url: parsed.safe, from: name };
    }
    return { enabled: false, url: '', from: '' };
  }

  // 探测单个地址。timeoutMs 用尽即判失败。
  static one(url: string, timeoutMs = 4000): Promise<ProbeResult> {
    if (!/^https?:\/\/\S+$/.test(url))
      return Promise.resolve({ url, ok: false, ms: 0, error: `NetProbe.one: invalid url=${url}` });
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      return Promise.resolve({ url, ok: false, ms: 0, error: `NetProbe.one: invalid timeoutMs=${timeoutMs}` });
    const proxy = this.proxy();
    const target = new URL(url);
    // http 目标经代理时是普通转发请求，https 目标才需要 CONNECT 隧道；
    // 这里统一用「有代理就走代理」，http 目标直接把绝对 URL 发给代理。
    if (proxy.enabled) return this._viaProxy(target, timeoutMs);
    return this._direct(target, timeoutMs);
  }

  // 并发探测一组地址，顺序与入参一致
  static all(urls: string[], timeoutMs = 4000): Promise<ProbeResult[]> {
    if (!Array.isArray(urls)) throw new Error(`NetProbe.all: invalid urls=${urls}`);
    return Promise.all(urls.map((u) => this.one(u, timeoutMs)));
  }

  // ── 直连 ──────────────────────────────────────────────────────────────────
  private static _direct(target: URL, timeoutMs: number): Promise<ProbeResult> {
    return new Promise((resolve) => {
      const started = Date.now();
      const url = target.toString();
      const done = this._once(resolve);
      const mod = target.protocol === 'https:' ? https : http;
      try {
        const req = mod.request(
          {
            hostname: target.hostname,
            port: target.port || (target.protocol === 'https:' ? 443 : 80),
            path: target.pathname + target.search,
            method: 'HEAD',
            timeout: timeoutMs,
            // 自签/过期证书不该让「能不能连通」这件事变成失败：拿到响应就算通
            rejectUnauthorized: false,
          },
          (res) => {
            res.resume();
            done({ url, ok: true, ms: Date.now() - started, status: res.statusCode || 0 });
          },
        );
        req.on('timeout', () => {
          req.destroy();
          done({ url, ok: false, ms: Date.now() - started, error: `超时（>${timeoutMs}ms）` });
        });
        req.on('error', (e: NodeJS.ErrnoException) =>
          done({ url, ok: false, ms: Date.now() - started, error: this._explain(e) }),
        );
        req.end();
      } catch (e: unknown) {
        done({ url, ok: false, ms: Date.now() - started, error: this._explain(e) });
      }
    });
  }

  // ── 经代理 ────────────────────────────────────────────────────────────────
  // https 目标：CONNECT 隧道建立成功即视为通（代理只有在真正连上上游后才回 200）。
  // http  目标：直接把绝对 URL 发给代理，拿到响应即通。
  private static _viaProxy(target: URL, timeoutMs: number): Promise<ProbeResult> {
    const proxy = this.proxy();
    const parsed = this._parseProxy(proxy.url);
    if (!parsed) return this._direct(target, timeoutMs);
    return new Promise((resolve) => {
      const started = Date.now();
      const url = target.toString();
      const done = this._once(resolve);
      const isTls = target.protocol === 'https:';
      const port = target.port || (isTls ? 443 : 80);
      try {
        const req = http.request({
          host: parsed.host,
          port: parsed.port,
          method: isTls ? 'CONNECT' : 'HEAD',
          path: isTls ? `${target.hostname}:${port}` : url,
          timeout: timeoutMs,
          headers: parsed.auth ? { 'Proxy-Authorization': `Basic ${parsed.auth}` } : undefined,
        });
        req.on('connect', (res, socket) => {
          socket.destroy();
          const okTunnel = (res.statusCode || 0) < 300;
          done({
            url,
            ok: okTunnel,
            ms: Date.now() - started,
            status: res.statusCode || 0,
            viaProxy: true,
            error: okTunnel ? undefined : `代理拒绝连接（HTTP ${res.statusCode}）`,
          });
        });
        req.on('response', (res) => {
          res.resume();
          done({ url, ok: true, ms: Date.now() - started, status: res.statusCode || 0, viaProxy: true });
        });
        req.on('timeout', () => {
          req.destroy();
          done({ url, ok: false, ms: Date.now() - started, viaProxy: true, error: `经代理超时（>${timeoutMs}ms）` });
        });
        req.on('error', (e: NodeJS.ErrnoException) =>
          done({ url, ok: false, ms: Date.now() - started, viaProxy: true, error: `代理不可用：${this._explain(e)}` }),
        );
        req.end();
      } catch (e: unknown) {
        done({ url, ok: false, ms: Date.now() - started, viaProxy: true, error: this._explain(e) });
      }
    });
  }

  // ── 内部工具 ──────────────────────────────────────────────────────────────
  // 保证 resolve 只发生一次（timeout 与 error 常常接连触发）
  private static _once(resolve: (r: ProbeResult) => void): (r: ProbeResult) => void {
    let settled = false;
    return (r: ProbeResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
  }

  // 把 Node 的错误码翻译成用户能看懂的一句话
  private static _explain(e: unknown): string {
    const err = e as NodeJS.ErrnoException;
    const code = err?.code || '';
    const map: Record<string, string> = {
      ENOTFOUND: '域名解析失败（DNS 不通或被拦截）',
      EAI_AGAIN: '域名解析超时（DNS 不稳定）',
      ECONNREFUSED: '连接被拒绝',
      ECONNRESET: '连接被重置（常见于被防火墙掐断）',
      ETIMEDOUT: '连接超时',
      EHOSTUNREACH: '主机不可达（本机没有可用网络）',
      ENETUNREACH: '网络不可达（本机没有可用网络）',
      EPROTO: '协议错误（可能被中间设备劫持）',
      CERT_HAS_EXPIRED: '证书已过期',
    };
    return map[code] || err?.message || String(e);
  }

  // 解析代理地址；返回 host/port/basic 认证，以及脱敏后的展示串
  private static _parseProxy(raw: string): { host: string; port: number; auth: string; safe: string } | null {
    const text = /^\w+:\/\//.test(raw) ? raw : `http://${raw}`;
    try {
      const u = new URL(text);
      if (!u.hostname) return null;
      const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
      const auth =
        u.username || u.password
          ? Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString('base64')
          : '';
      return { host: u.hostname, port, auth, safe: `${u.protocol}//${u.hostname}:${port}` };
    } catch {
      return null;
    }
  }
}
