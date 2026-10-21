// 上游转发（调度）：把客户端请求映射到 Volcano Ark 的 Anthropic / OpenAI 协议面。
// 只负责顺序（建目标 → 发请求 → 等用量），HTTP 与 SSE 细节在 Realize。
import { Config } from '../config';
import { EngineKind, ForwardResult, TokenUsage } from '../models/Types';

export interface UpstreamTarget {
  url: string;
  payload: Record<string, unknown>;
}

export interface UpstreamResponse {
  status: number;
  contentType: string;
  headers: Record<string, string>;
  body: Buffer | null;
  stream: NodeJS.ReadableStream | null;
}

export class UpstreamStruct {
  // 对外公开的模型列表（供 /v1/models 与设置页选择）
  // 同时带 OpenAI（object/owned_by）与 Anthropic（type/display_name/created_at）字段，
  // Claude Code 会拉 /v1/models 校验模型名，缺 type 会被判成 unrecognized_model。
  static listModels(): { id: string; object: string; owned_by: string; type: string; display_name: string; created_at: string }[] {
    if (!Config.UPSTREAM_MODEL) throw new Error('Upstream.listModels: UPSTREAM_MODEL is empty');
    const createdAt = new Date().toISOString();
    return [...Config.MODEL_MAP.keys()].map((id) => ({
      id,
      object: 'model',
      owned_by: 'clootee',
      type: 'model',
      display_name: id,
      created_at: createdAt,
    }));
  }

  // 调度：解析模型 → 生成上游目标 → 发出请求 → 挂上用量采集
  static async forward(
    kind: EngineKind,
    path: string,
    body: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    tag: string,
  ): Promise<ForwardResult> {
    if (kind !== 'anthropic' && kind !== 'openai') throw new Error(`Upstream.forward: invalid kind=${String(kind)}`);
    if (!path || !path.startsWith('/v1/')) throw new Error(`Upstream.forward: invalid path=${String(path)}`);
    const target = this._buildTarget(kind, path, body);
    const upstream = await this._request(target, headers, tag);
    const usage = this._watchUsage(kind, upstream);
    return {
      status: upstream.status,
      contentType: upstream.contentType,
      headers: upstream.headers,
      body: upstream.body,
      stream: upstream.stream,
      usage,
    };
  }

  // ── 细节步骤（Realize 覆写） ─────────────────────────────────────────────
  protected static _buildTarget(_kind: EngineKind, _path: string, _body: Record<string, unknown>): UpstreamTarget { throw new Error('Not implemented'); }
  protected static _request(_target: UpstreamTarget, _headers: Record<string, string | string[] | undefined>, _tag: string): Promise<UpstreamResponse> { throw new Error('Not implemented'); }
  protected static _watchUsage(_kind: EngineKind, _upstream: UpstreamResponse): Promise<TokenUsage | null> { throw new Error('Not implemented'); }
}
