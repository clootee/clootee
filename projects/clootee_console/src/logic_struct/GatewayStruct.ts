// HTTP 网关（调度）：路由 → 账户校验 → 上游转发 → 写回 → 记账。
// 所有 IO（server、socket、body、响应写出）由 Realize 的 _xxx 步骤完成。
import * as http from 'http';
import { Config, validateConfig } from '../config';
import { HttpError } from '../helper/HttpError';
import { sanitizeTag } from '../helper/Validate';
import { DeviceRecord, EngineKind, ForwardResult } from '../models/Types';
import { Ledger } from '../logic_realize/Ledger';
import { Upstream } from '../logic_realize/Upstream';

export class GatewayStruct {
  static start(): void {
    validateConfig();
    this._listen(Config.HOST, Config.PORT);
  }

  // 单一入口：异常统一映射成 JSON 错误，不让进程退出。
  static async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (req.method === 'OPTIONS') { this._writeCors(res); return; }
      const url = new URL(req.url || '/', 'http://localhost');
      const path = url.pathname;
      if (req.method === 'GET' && path === '/health') { this._sendJson(res, 200, this._health()); return; }
      if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
        this._sendHtml(res, 200, this._renderHome(this._linkInfo(url)));
        return;
      }
      if (req.method === 'POST' && path === '/api/v1/devices') { await this._register(req, res); return; }
      if (req.method === 'GET' && path === '/api/v1/me') {
        this._sendJson(res, 200, Ledger.status(this._device(req)));
        return;
      }
      if (req.method === 'GET' && path === '/api/v1/me/usage') {
        this._sendJson(res, 200, Ledger.usage(this._device(req), url.searchParams.get('limit'), url.searchParams.get('tag')));
        return;
      }
      if (req.method === 'POST' && path === '/api/v1/devices/link-code') {
        this._sendJson(res, 200, { url: Ledger.linkUrl(this._device(req)) });
        return;
      }
      if (req.method === 'GET' && path === '/v1/models') {
        const models = Upstream.listModels();
        this._sendJson(res, 200, { object: 'list', data: models, models });
        return;
      }
      if (req.method === 'POST' && (path === '/v1/messages' || path === '/v1/chat/completions' || path === '/v1/messages/count_tokens')) {
        await this._proxyAi(req, res, path);
        return;
      }
      throw new HttpError(404, `Gateway.handle: no route for ${req.method} ${path}`);
    } catch (e) {
      this._fail(res, e);
    }
  }

  protected static _health(): Record<string, unknown> {
    return { ok: true, service: 'clootee-console', upstreamModel: Config.UPSTREAM_MODEL, models: Upstream.listModels().map((m) => m.id) };
  }

  protected static async _register(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this._readJson(req);
    const result = Ledger.register(body.installId, body.name, this._clientIp(req));
    this._sendJson(res, 200, result);
  }

  protected static async _proxyAi(req: http.IncomingMessage, res: http.ServerResponse, path: string): Promise<void> {
    const device = this._device(req);
    Ledger.assertBudget();
    Ledger.assertRate(device);
    Ledger.assertBalance(device);
    const body = await this._readJson(req);
    const tag = sanitizeTag(this._header(req, 'x-clootee-session'));
    const kind: EngineKind = path === '/v1/chat/completions' ? 'openai' : 'anthropic';
    const forward = await Upstream.forward(kind, path, body, req.headers, tag);
    this._writeUpstream(res, forward);
    const usage = await forward.usage;
    if (path !== '/v1/messages/count_tokens') {
      Ledger.record(device, String(body.model || ''), usage, tag, forward.status === 200 ? 'ok' : `http_${forward.status}`);
    }
  }

  protected static _device(req: http.IncomingMessage): DeviceRecord {
    const auth = this._header(req, 'authorization');
    const key = this._header(req, 'x-api-key');
    const token = (auth.replace(/^Bearer\s+/i, '').trim() || key.trim());
    const device = Ledger.authenticate(token);
    if (!device) throw new HttpError(401, 'Gateway._device: invalid or missing API key');
    return device;
  }

  protected static _linkInfo(url: URL): { balanceMicro: number; usage: unknown } | null {
    const hash = String(url.hash || '');
    const match = hash.match(/#link=([A-Za-z0-9_-]{10,64})/);
    if (!match) return null;
    return Ledger.linkInfo(match[1]);
  }

  protected static _clientIp(req: http.IncomingMessage): string {
    const forwarded = this._header(req, 'x-real-ip') || this._header(req, 'x-forwarded-for').split(',')[0];
    const ip = forwarded.trim() || String((req.socket as any).remoteAddress || '');
    return ip.slice(0, 64);
  }

  protected static _header(req: http.IncomingMessage, name: string): string {
    const value = req.headers[name];
    if (Array.isArray(value)) return value[0] || '';
    return String(value || '');
  }

  protected static _fail(res: http.ServerResponse, e: unknown): void {
    const err = e instanceof Error ? e : new Error(String(e));
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) this._log('error', err.message);
    if (!res.headersSent) this._sendJson(res, status, { error: { message: err.message, type: status === 401 ? 'authentication_error' : 'api_error' } });
    else if (!res.writableEnded) res.end();
  }

  // ── 细节步骤（Realize 覆写） ─────────────────────────────────────────────
  protected static _listen(_host: string, _port: number): void { throw new Error('Not implemented'); }
  protected static _readJson(_req: http.IncomingMessage): Promise<Record<string, any>> { throw new Error('Not implemented'); }
  protected static _sendJson(_res: http.ServerResponse, _status: number, _body: unknown): void { throw new Error('Not implemented'); }
  protected static _sendHtml(_res: http.ServerResponse, _status: number, _html: string): void { throw new Error('Not implemented'); }
  protected static _writeCors(_res: http.ServerResponse): void { throw new Error('Not implemented'); }
  protected static _writeUpstream(_res: http.ServerResponse, _forward: ForwardResult): void { throw new Error('Not implemented'); }
  protected static _renderHome(_info: { balanceMicro: number; usage: unknown } | null): string { throw new Error('Not implemented'); }
  protected static _log(_level: 'info' | 'error', _message: string): void { throw new Error('Not implemented'); }
}
