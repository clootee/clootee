// Kimi 转译代理（调度骨架）：把 codex 的 Responses 请求转译到 Kimi Chat Completions 并回吐 SSE。
// 只负责调度：校验 → 用 helper 生成上游请求 → 调 _postKimi 钩子 → 用 helper 生成事件 → 逐个 emit。
// 实际 http 服务器/上游请求/socket 写出等 IO 全部在 Realize；纯数据变换在 KimiTranslateHelper。
import { KimiTranslateHelper } from '../helper/KimiTranslateHelper';

export interface KimiUpstreamResult {
  status: number;
  json: any | null;
  raw: string;
}

export type SseEmit = (type: string, data: Record<string, unknown>) => void;

export class KimiProxyStruct {
  // 启动代理（Realize 实现真正的 http server）。
  static start(): void {
    const port = this._port();
    if (!port || port <= 0) throw new Error(`KimiProxyStruct.start: invalid port=${port}`);
    this._serve(port);
  }

  // 处理一次 /v1/responses：转译 → 调上游 → 逐个 emit 事件。失败抛出（Realize 负责转成错误响应）。
  static async dispatchResponses(body: any, key: string | null, emit: SseEmit): Promise<void> {
    if (!body) throw new Error('dispatchResponses: empty body');
    const payload = KimiTranslateHelper.buildChatPayload(body);
    const r = await this._postKimi(payload, key);
    if (!r || !r.json || !Array.isArray(r.json.choices)) {
      const detail = r ? `status=${r.status} body=${String(r.raw).slice(0, 400)}` : 'no response';
      throw new Error(`dispatchResponses: kimi upstream failed (${detail})`);
    }
    const respId = this._mkId('resp');
    const events = KimiTranslateHelper.buildEvents(r.json, respId, (p) => this._mkId(p));
    for (const e of events) emit(e.type, e.data);
  }

  // GET /v1/models 的应答体。
  static modelsBody(): Record<string, unknown> {
    return KimiTranslateHelper.modelsBody();
  }

  // ── 钩子（Realize 实现）──
  protected static _port(): number {
    throw new Error('Not implemented');
  }
  protected static _serve(_port: number): void {
    throw new Error('Not implemented');
  }
  protected static _postKimi(_payload: any, _key: string | null): Promise<KimiUpstreamResult> {
    throw new Error('Not implemented');
  }
  protected static _mkId(_prefix: string): string {
    throw new Error('Not implemented');
  }
}
