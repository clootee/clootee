// Kimi ↔ Codex 协议转换（纯函数，业务无关，可独立测试）。
// 背景：codex 0.141 只支持 OpenAI「Responses API」（wire_api=responses），而 Kimi(Moonshot)
// 只提供「Chat Completions」。本 helper 负责两个方向的纯数据变换：
//   1) codex 发来的 Responses 请求体  →  Kimi Chat Completions 请求体
//   2) Kimi 的（非流式）应答           →  codex 期望的一串 Responses SSE 事件对象
// 不做任何 IO、不认识 http/socket，只做结构映射，便于单测。

export interface SseEvent {
  type: string;
  data: Record<string, unknown>; // 已含 type 字段，序列化后即 SSE 的 data 行
}

export class KimiTranslateHelper {
  // Responses.input[] / instructions  →  Chat messages[]
  static buildChatPayload(body: any): any {
    if (!body || typeof body !== 'object')
      throw new Error(`KimiTranslateHelper.buildChatPayload: invalid body=${typeof body}`);
    const messages: any[] = [];
    if (body.instructions) messages.push({ role: 'system', content: String(body.instructions) });

    const input = Array.isArray(body.input) ? body.input : [];
    for (const it of input) {
      if (!it || typeof it !== 'object') continue;
      if (it.type === 'function_call') {
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: it.call_id || it.id,
              type: 'function',
              function: { name: it.name, arguments: it.arguments || '{}' },
            },
          ],
        });
      } else if (it.type === 'function_call_output') {
        messages.push({
          role: 'tool',
          tool_call_id: it.call_id,
          content: typeof it.output === 'string' ? it.output : JSON.stringify(it.output ?? ''),
        });
      } else {
        // message / 其它带 role 的项：Moonshot 不认识 developer 角色 → 归并为 system
        const role = it.role === 'developer' ? 'system' : it.role || 'user';
        messages.push({ role, content: this._flattenContent(it.content) });
      }
    }

    const payload: any = { model: body.model || 'kimi-k3', messages, stream: false };
    const tools = this._buildTools(body.tools);
    if (tools) payload.tools = tools;
    if (typeof body.temperature === 'number') payload.temperature = body.temperature;
    return payload;
  }

  // Kimi 非流式应答  →  codex 需要的 Responses SSE 事件序列。
  // mkId：外部注入的唯一 id 生成器（保持本函数无副作用/可测）。
  static buildEvents(kimiJson: any, respId: string, mkId: (prefix: string) => string): SseEvent[] {
    if (!kimiJson || !Array.isArray(kimiJson.choices))
      throw new Error('KimiTranslateHelper.buildEvents: missing choices in kimi response');
    const msg = (kimiJson.choices[0] && kimiJson.choices[0].message) || {};
    const events: SseEvent[] = [];
    const output: any[] = [];
    let oi = 0;

    events.push({
      type: 'response.created',
      data: { type: 'response.created', response: { id: respId, object: 'response', model: kimiJson.model, status: 'in_progress', output: [] } },
    });

    if (msg.content) {
      const mid = mkId('msg');
      const text = String(msg.content);
      events.push({ type: 'response.output_item.added', data: { type: 'response.output_item.added', output_index: oi, item: { type: 'message', id: mid, status: 'in_progress', role: 'assistant', content: [] } } });
      events.push({ type: 'response.output_text.delta', data: { type: 'response.output_text.delta', item_id: mid, output_index: oi, content_index: 0, delta: text } });
      events.push({ type: 'response.output_text.done', data: { type: 'response.output_text.done', item_id: mid, output_index: oi, content_index: 0, text } });
      const item = { type: 'message', id: mid, status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] };
      events.push({ type: 'response.output_item.done', data: { type: 'response.output_item.done', output_index: oi, item } });
      output.push(item);
      oi++;
    }

    for (const tc of msg.tool_calls || []) {
      const fid = mkId('fc');
      const callId = tc.id || mkId('call');
      const args = (tc.function && tc.function.arguments) || '{}';
      const name = tc.function && tc.function.name;
      events.push({ type: 'response.output_item.added', data: { type: 'response.output_item.added', output_index: oi, item: { type: 'function_call', id: fid, call_id: callId, name, arguments: '', status: 'in_progress' } } });
      events.push({ type: 'response.function_call_arguments.delta', data: { type: 'response.function_call_arguments.delta', item_id: fid, output_index: oi, delta: args } });
      const item = { type: 'function_call', id: fid, call_id: callId, name, arguments: args, status: 'completed' };
      events.push({ type: 'response.output_item.done', data: { type: 'response.output_item.done', output_index: oi, item } });
      output.push(item);
      oi++;
    }

    const u = kimiJson.usage || {};
    events.push({
      type: 'response.completed',
      data: {
        type: 'response.completed',
        response: {
          id: respId,
          object: 'response',
          model: kimiJson.model,
          status: 'completed',
          output,
          usage: { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0, total_tokens: u.total_tokens || 0 },
        },
      },
    });
    return events;
  }

  // GET /v1/models 的应答体（codex 期望顶层含 models 字段）。
  static modelsBody(): Record<string, unknown> {
    const item = { id: 'kimi-k3', object: 'model', owned_by: 'moonshot' };
    return { object: 'list', data: [item], models: [item] };
  }

  // ── 内部纯工具 ──
  private static _flattenContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return content == null ? '' : String(content);
    return content
      .map((p: any) => (p && typeof p === 'object' && 'text' in p ? String(p.text ?? '') : typeof p === 'string' ? p : ''))
      .join('');
  }

  private static _buildTools(tools: unknown): any[] | undefined {
    if (!Array.isArray(tools)) return undefined;
    const out: any[] = [];
    for (const t of tools as any[]) {
      if (!t || t.type !== 'function') continue;
      const fn = t.function || t; // Responses 里 function 工具字段是平铺的
      out.push({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description || '',
          parameters: fn.parameters || { type: 'object', properties: {} },
        },
      });
    }
    return out.length ? out : undefined;
  }
}
