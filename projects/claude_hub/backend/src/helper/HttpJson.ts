// 通用 JSON over HTTP(S) 工具（业务无关）：GET/POST，返回解析后的 JSON。
// 用于实时拉取服务商模型列表等。跨平台：纯 Node 内置模块。
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface HttpJsonResult {
  status: number;
  json: any;
  raw: string;
}

export class HttpJson {
  static get(url: string, headers: Record<string, string> = {}, timeoutMs = 15000): Promise<HttpJsonResult> {
    return this._request('GET', url, headers, undefined, timeoutMs);
  }

  static post(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
    timeoutMs = 15000,
  ): Promise<HttpJsonResult> {
    return this._request('POST', url, headers, JSON.stringify(body ?? {}), timeoutMs);
  }

  private static _request(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs: number,
  ): Promise<HttpJsonResult> {
    return new Promise((resolve, reject) => {
      let u: URL;
      try {
        u = new URL(url);
      } catch (e) {
        reject(new Error(`HttpJson: invalid url=${url}`));
        return;
      }
      const lib = u.protocol === 'http:' ? http : https;
      const h: Record<string, string> = { Accept: 'application/json', ...headers };
      if (body !== undefined) {
        h['Content-Type'] = h['Content-Type'] || 'application/json';
        h['Content-Length'] = String(Buffer.byteLength(body));
      }
      const req = lib.request(
        { method, hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: h },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            let json: any = null;
            try {
              json = JSON.parse(raw);
            } catch {
              /* 保留 raw 供上层报错 */
            }
            resolve({ status: res.statusCode || 0, json, raw });
          });
        },
      );
      req.setTimeout(timeoutMs, () => req.destroy(new Error(`HttpJson: timeout ${timeoutMs}ms`)));
      req.on('error', reject);
      if (body !== undefined) req.write(body);
      req.end();
    });
  }
}
