// Kimi 转译代理（实现）：http 服务器 + 上游 https 请求 + SSE 写出等 IO。
// 监听 127.0.0.1:<port>，对外暴露 OpenAI Responses 兼容面（供 codex 的 kimi provider 指向），
// 内部转译到 Kimi(Moonshot) 的 Chat Completions。跨平台：纯 Node 内置模块，无平台差异。
import * as http from 'http';
import * as https from 'https';
import { KimiProxyStruct, KimiUpstreamResult } from '../logic_struct/KimiProxyStruct';
import { AppConfig } from '../config/AppConfig';
import { Logger } from '../helper/Logger';
import { EngineConfig } from './EngineConfig';

export class KimiProxy extends KimiProxyStruct {
  private static _seq = 0;
  private static _started = false;

  protected static _port(): number {
    return AppConfig.KIMI_PROXY_PORT;
  }

  protected static _mkId(prefix: string): string {
    this._seq = (this._seq + 1) % 1e9;
    return `${prefix}_${Date.now().toString(36)}_${this._seq}`;
  }

  protected static _serve(port: number): void {
    if (this._started) return;
    this._started = true;
    const server = http.createServer((req, res) => {
      const url = req.url || '';
      if (req.method === 'GET' && url.startsWith('/v1/models')) {
        let body: Record<string, unknown>;
        try {
          const cfg = EngineConfig.codexUpstream();
          const item = { id: cfg.model, object: 'model', owned_by: cfg.label };
          body = { object: 'list', data: [item], models: [item] };
        } catch {
          body = { object: 'list', data: [], models: [] };
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
        return;
      }
      if (req.method === 'POST' && url.startsWith('/v1/responses')) {
        this._handleResponses(req, res);
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
    });
    server.on('error', (e) => {
      this._started = false;
      Logger.error('KimiProxy', 'server error', { port, message: (e as Error).message });
    });
    server.listen(port, '127.0.0.1', () =>
      Logger.info('KimiProxy', 'listening', { url: `http://127.0.0.1:${port}/v1` }),
    );
  }

  private static _handleResponses(req: http.IncomingMessage, res: http.ServerResponse): void {
    // 优先用 codex 转发来的 Bearer（claude-hub 已注入真实 KIMI_API_KEY），回退到本进程环境变量
    const auth = String(req.headers['authorization'] || '');
    const forwarded = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const key = forwarded && forwarded !== 'sk-x' ? forwarded : process.env.KIMI_API_KEY || null;

    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      let body: any;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'invalid json body' } }));
        return;
      }
      let headersSent = false;
      const emit = (type: string, data: Record<string, unknown>) => {
        if (!headersSent) {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          headersSent = true;
        }
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      try {
        await this.dispatchResponses(body, key, emit);
        res.end();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        Logger.error('KimiProxy', 'dispatch failed', { message });
        if (!headersSent) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message } }));
        } else {
          // 已开流：以 response.failed 事件如实上报，codex 会展示
          res.write(`event: response.failed\n`);
          res.write(`data: ${JSON.stringify({ type: 'response.failed', response: { status: 'failed', error: { message } } })}\n\n`);
          res.end();
        }
      }
    });
  }

  protected static _postKimi(payload: any, key: string | null): Promise<KimiUpstreamResult> {
    return new Promise((resolve, reject) => {
      let cfg: ReturnType<typeof EngineConfig.codexUpstream>;
      try { cfg = EngineConfig.codexUpstream(); } catch (e) { reject(e); return; }
      const actualKey = cfg.apiKey || key;
      if (!actualKey) { reject(new Error('Codex 第三方 API Key 未配置')); return; }
      const endpoint = new URL(`${cfg.baseUrl}/chat/completions`);
      payload.model = cfg.model;
      payload.messages = Array.isArray(payload.messages) ? payload.messages : [];
      payload.messages.unshift({
        role: 'system',
        content: `Runtime metadata: the exact serving model ID is ${cfg.model}. If asked which model you are running, answer exactly ${cfg.model}.`,
      });
      const data = JSON.stringify(payload);
      const transport = endpoint.protocol === 'http:' ? http : https;
      const r = transport.request(
        {
          protocol: endpoint.protocol,
          hostname: endpoint.hostname,
          port: endpoint.port || undefined,
          path: `${endpoint.pathname}${endpoint.search}`,
          method: 'POST',
          headers: {
            Authorization: `Bearer ${actualKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (up) => {
          let b = '';
          up.on('data', (c) => (b += c));
          up.on('end', () => {
            let json: any = null;
            try {
              json = JSON.parse(b);
            } catch {
              /* 保留 raw 供上层报错展示 */
            }
            resolve({ status: up.statusCode || 0, json, raw: b });
          });
        },
      );
      r.on('error', reject);
      r.write(data);
      r.end();
    });
  }
}
