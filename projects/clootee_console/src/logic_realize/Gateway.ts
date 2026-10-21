// HTTP 网关（实现）：http server、请求体读取、响应写出、静态首页。只做 IO。
import * as http from 'http';
import { Config } from '../config';
import { HttpError } from '../helper/HttpError';
import { microToYuan } from '../helper/Money';
import { GatewayStruct } from '../logic_struct/GatewayStruct';
import { ForwardResult } from '../models/Types';

const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-api-key, content-type, anthropic-version, anthropic-beta, x-clootee-session',
  'access-control-max-age': '86400',
};

function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export class Gateway extends GatewayStruct {
  protected static _listen(host: string, port: number): void {
    const server = http.createServer((req, res) => {
      const started = Date.now();
      res.on('finish', () => this._log('info', `${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`));
      void this.handle(req, res);
    });
    server.on('error', (e) => this._log('error', `server error: ${e.message}`));
    server.listen(port, host, () => this._log('info', `listening on http://${host}:${port} (models: ${Config.MODEL_MAP.size})`));
  }

  protected static _readJson(req: http.IncomingMessage): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > Config.MAX_BODY_BYTES) {
          reject(new HttpError(413, `Gateway._readJson: body larger than ${Config.MAX_BODY_BYTES} bytes`));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text.trim()) { resolve({}); return; }
        try {
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            reject(new HttpError(400, 'Gateway._readJson: body must be a JSON object'));
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(new HttpError(400, `Gateway._readJson: invalid JSON (${(e as Error).message})`));
        }
      });
      req.on('error', (e) => reject(new Error(`Gateway._readJson: ${e.message}`)));
    });
  }

  protected static _sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    if (res.headersSent) return;
    const text = JSON.stringify(body);
    res.writeHead(status, { ...CORS, 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  }

  protected static _sendHtml(res: http.ServerResponse, status: number, html: string): void {
    if (res.headersSent) return;
    res.writeHead(status, { ...CORS, 'content-type': 'text/html; charset=utf-8', 'content-length': Buffer.byteLength(html) });
    res.end(html);
  }

  protected static _writeCors(res: http.ServerResponse): void {
    res.writeHead(204, CORS);
    res.end();
  }

  protected static _writeUpstream(res: http.ServerResponse, forward: ForwardResult): void {
    if (res.headersSent) return;
    res.writeHead(forward.status, {
      ...CORS,
      'content-type': forward.contentType,
      'cache-control': forward.stream ? 'no-cache' : 'no-store',
      ...(forward.stream ? { connection: 'keep-alive', 'x-accel-buffering': 'no' } : {}),
      ...forward.headers,
    });
    if (forward.stream) {
      forward.stream.pipe(res);
      forward.stream.on('error', () => { if (!res.writableEnded) res.end(); });
      res.on('close', () => {
        const s = forward.stream as NodeJS.ReadableStream & { destroyed?: boolean; destroy?: () => void };
        if (!s.destroyed && typeof s.destroy === 'function') s.destroy();
      });
      return;
    }
    res.end(forward.body || Buffer.alloc(0));
  }

  protected static _renderHome(info: { balanceMicro: number; usage: unknown } | null): string {
    const models = [...Config.MODEL_MAP.keys()].map((m) => `<li><code>${esc(m)}</code></li>`).join('');
    let panel = '';
    if (info) {
      const usage = info.usage as { items?: Array<{ at: number; model: string; costMicro: number; inputTokens: number; outputTokens: number }> } | null;
      const rows = (usage && Array.isArray(usage.items) ? usage.items : []).slice(0, 20).map((u) => {
        const at = new Date(u.at).toLocaleString();
        return `<tr><td>${esc(at)}</td><td>${esc(u.model)}</td><td>${u.inputTokens}</td><td>${u.outputTokens}</td><td>${microToYuan(u.costMicro)}</td></tr>`;
      }).join('');
      panel = `<section class="card"><h2>设备状态 / Device</h2>
        <p class="balance">余额 / Balance: <strong>${microToYuan(info.balanceMicro)}</strong></p>
        <table><thead><tr><th>时间 / Time</th><th>模型 / Model</th><th>输入 / In</th><th>输出 / Out</th><th>费用 / Cost</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">暂无用量 / No usage yet</td></tr>'}</tbody></table>
        <p class="hint">绑定链接 10 分钟内有效；关闭页面后设备令牌仍在本地客户端。</p></section>`;
    }
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clootee Console</title>
<style>
:root{color-scheme:light dark}
body{margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#0f1115;color:#e6e8ee}
main{max-width:820px;margin:0 auto;padding:48px 24px}
h1{font-size:26px;margin:0 0 6px}
.sub{color:#8a93a6;margin:0 0 28px}
.card{background:#171a21;border:1px solid #262b36;border-radius:12px;padding:20px 22px;margin:0 0 18px}
h2{font-size:17px;margin:0 0 12px}
code{background:#0b0d11;border:1px solid #262b36;border-radius:6px;padding:2px 6px}
ul{padding-left:20px;margin:6px 0}
.balance{font-size:17px;margin:0 0 14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #262b36;white-space:nowrap}
th{color:#8a93a6;font-weight:500}
.hint{color:#8a93a6;font-size:13px;margin:12px 0 0}
a{color:#7ea6ff}
</style></head><body><main>
<h1>Clootee Console</h1>
<p class="sub">Clootee 默认 AI 服务 / Clootee default AI service · DeepSeek · 按用量计费</p>
${panel}
<section class="card"><h2>可用模型 / Models</h2><ul>${models}</ul>
<p class="hint">在 Clootee 的设置 → AI 引擎里选择「Clootee（默认，免注册）」即可，无需填 Key。</p></section>
<section class="card"><h2>接口 / API</h2>
<ul><li><code>POST /v1/messages</code>（Anthropic 兼容）</li>
<li><code>POST /v1/chat/completions</code>（OpenAI 兼容）</li>
<li><code>GET /v1/models</code></li>
<li><code>GET /health</code></li></ul>
<p class="hint">鉴权：<code>Authorization: Bearer ck-…</code>，令牌由客户端首次使用时自动领取。</p></section>
</main></body></html>`;
  }

  protected static _log(level: 'info' | 'error', message: string): void {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
    if (level === 'error') console.error(line);
    else console.log(line);
  }
}
