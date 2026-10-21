import { EngineKind, TokenUsage } from '../models/Types';

// 从 SSE 文本流里提取 token 用量（Anthropic message_start/message_delta；OpenAI 末块 usage）。
// 纯解析：只接受文本增量，不碰网络。
export class SseUsageParser {
  private _buffer = '';
  private _input = 0;
  private _cacheRead = 0;
  private _output = 0;

  constructor(private readonly _kind: EngineKind) {}

  feed(text: string): void {
    this._buffer += text;
    let idx: number;
    while ((idx = this._buffer.indexOf('\n')) >= 0) {
      const line = this._buffer.slice(0, idx).replace(/\r$/, '');
      this._buffer = this._buffer.slice(idx + 1);
      this._line(line);
    }
  }

  result(): TokenUsage | null {
    if (!this._input && !this._output && !this._cacheRead) return null;
    return { inputTokens: this._input, cacheReadTokens: this._cacheRead, outputTokens: this._output };
  }

  private _line(line: string): void {
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') return;
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return;
    }
    if (this._kind === 'anthropic') this._anthropic(json);
    else this._openai(json);
  }

  private _anthropic(json: any): void {
    const usage = json?.usage || json?.message?.usage;
    if (!usage || typeof usage !== 'object') return;
    if (Number.isFinite(usage.input_tokens)) this._input = Math.max(this._input, Number(usage.input_tokens));
    if (Number.isFinite(usage.output_tokens)) this._output = Math.max(this._output, Number(usage.output_tokens));
    if (Number.isFinite(usage.cache_read_input_tokens)) this._cacheRead = Math.max(this._cacheRead, Number(usage.cache_read_input_tokens));
  }

  private _openai(json: any): void {
    const usage = json?.usage;
    if (!usage || typeof usage !== 'object') return;
    if (Number.isFinite(usage.prompt_tokens)) this._input = Math.max(this._input, Number(usage.prompt_tokens));
    if (Number.isFinite(usage.completion_tokens)) this._output = Math.max(this._output, Number(usage.completion_tokens));
    const cached = usage.prompt_tokens_details?.cached_tokens;
    if (Number.isFinite(cached)) this._cacheRead = Math.max(this._cacheRead, Number(cached));
  }
}
