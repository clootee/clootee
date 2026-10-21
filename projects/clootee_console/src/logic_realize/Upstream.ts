// 上游转发（实现）：https 请求、SSE 透传、用量提取。只做 IO 细节，不做调度。
import * as https from 'https';
import { PassThrough } from 'stream';
import { Config } from '../config';
import { SseUsageParser } from '../helper/SseUsage';
import { UpstreamResponse, UpstreamStruct, UpstreamTarget } from '../logic_struct/UpstreamStruct';
import { EngineKind, TokenUsage } from '../models/Types';

const TIMEOUT_MS = 600_000;

function firstHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export class Upstream extends UpstreamStruct {
  protected static _buildTarget(kind: EngineKind, path: string, body: Record<string, unknown>): UpstreamTarget {
    const payload: Record<string, unknown> = { ...body };
    const requested = String(payload.model || '');
    payload.model = Config.MODEL_MAP.get(requested) || Config.UPSTREAM_MODEL;
    if (kind === 'openai') {
      if (payload.stream === true) {
        const opts = (payload.stream_options && typeof payload.stream_options === 'object') ? payload.stream_options as Record<string, unknown> : {};
        payload.stream_options = { ...opts, include_usage: true };
      }
      return { url: `${Config.ARK_OPENAI_BASE}/chat/completions`, payload };
    }
    return { url: `${Config.ARK_ANTHROPIC_BASE}${path}`, payload };
  }

  protected static _request(
    target: UpstreamTarget,
    headers: Record<string, string | string[] | undefined>,
    tag: string,
  ): Promise<UpstreamResponse> {
    const data = JSON.stringify(target.payload);
    const url = new URL(target.url);
    const forward: Record<string, string> = {
      authorization: `Bearer ${Config.ARK_KEY}`,
      'content-type': 'application/json',
      accept: firstHeader(headers.accept) || 'application/json',
      'content-length': String(Buffer.byteLength(data)),
    };
    const version = firstHeader(headers['anthropic-version']);
    if (version) forward['anthropic-version'] = version;
    const beta = firstHeader(headers['anthropic-beta']);
    if (beta) forward['anthropic-beta'] = beta;
    if (tag) forward['x-clootee-session'] = tag;

    return new Promise<UpstreamResponse>((resolve, reject) => {
      const req = https.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: forward,
        },
        (res) => {
          const status = res.statusCode || 502;
          const contentType = String(res.headers['content-type'] || 'application/json');
          const outHeaders: Record<string, string> = {};
          for (const key of ['request-id', 'x-request-id', 'retry-after']) {
            const v = firstHeader(res.headers[key]);
            if (v) outHeaders[key] = v;
          }
          if (contentType.includes('text/event-stream')) {
            res.setTimeout(TIMEOUT_MS, () => res.destroy(new Error('Upstream._request: upstream stream timed out')));
            const pass = new PassThrough();
            res.pipe(pass);
            res.on('error', (e) => pass.destroy(e));
            resolve({ status, contentType, headers: outHeaders, body: null, stream: pass });
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve({ status, contentType, headers: outHeaders, body: Buffer.concat(chunks), stream: null }));
          res.on('error', reject);
        },
      );
      req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('Upstream._request: upstream request timed out')));
      req.on('error', (e) => reject(new Error(`Upstream._request: ${e.message}`)));
      req.end(data);
    });
  }

  protected static _watchUsage(kind: EngineKind, upstream: UpstreamResponse): Promise<TokenUsage | null> {
    if (!upstream.stream) return Promise.resolve(this._usageFromBody(kind, upstream.body));
    const parser = new SseUsageParser(kind);
    return new Promise<TokenUsage | null>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve(parser.result());
      };
      upstream.stream!.on('data', (chunk: Buffer | string) => {
        try { parser.feed(String(chunk)); } catch { /* 解析失败不影响转发 */ }
      });
      upstream.stream!.on('end', done);
      upstream.stream!.on('close', done);
      upstream.stream!.on('error', done);
    });
  }

  private static _usageFromBody(kind: EngineKind, body: Buffer | null): TokenUsage | null {
    if (!body || !body.length) return null;
    let json: any;
    try { json = JSON.parse(body.toString('utf8')); } catch { return null; }
    const usage = json?.usage;
    if (!usage || typeof usage !== 'object') return null;
    if (kind === 'anthropic') {
      return {
        inputTokens: Number(usage.input_tokens) || 0,
        cacheReadTokens: Number(usage.cache_read_input_tokens) || 0,
        outputTokens: Number(usage.output_tokens) || 0,
      };
    }
    return {
      inputTokens: Number(usage.prompt_tokens) || 0,
      cacheReadTokens: Number(usage.prompt_tokens_details?.cached_tokens) || 0,
      outputTokens: Number(usage.completion_tokens) || 0,
    };
  }
}
