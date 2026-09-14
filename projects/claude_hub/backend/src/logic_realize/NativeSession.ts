// 原生会话解析实现：填充 NativeSessionStruct 的钩子（解析 JSONL 帧、归一纯文本）。
import { NativeSessionStruct } from '../logic_struct/NativeSessionStruct';
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { Session, Message, MessageRole } from '../models/Types';

interface RawFrame {
  type?: string;
  summary?: string;
  timestamp?: string;
  uuid?: string; // claude 为每帧分配的全局唯一 id（跨文件去重用）
  promptSource?: string; // 'typed'(手动输入) / 'sdk'(脚本发起) 等，用于判定会话来源
  message?: { role?: string; content?: unknown };
}

export class NativeSession extends NativeSessionStruct {
  protected static _meta(rootId: string, uuid: string, file: string, mtimeMs: number): Session {
    let title = '';
    let lastUser = '';
    let count = 0;
    let createdAt = 0;
    let hasTyped = false;
    let hasSdk = false;
    try {
      for (const ln of ClaudeStoreHelper.readLines(file)) {
        const o = this._parse(ln);
        if (!o) continue;
        // typed=终端手动；queued/system=经 hub 队列等人为发起，一并归为「手动」
        if (o.promptSource === 'typed' || o.promptSource === 'queued' || o.promptSource === 'system')
          hasTyped = true;
        if (o.promptSource === 'sdk') hasSdk = true;
        if (o.type === 'user' || o.type === 'assistant') count++;
        if (!createdAt && o.timestamp) {
          const ts = Date.parse(o.timestamp);
          if (!isNaN(ts)) createdAt = ts;
        }
        if (!title && o.type === 'summary' && o.summary) title = String(o.summary).slice(0, 60);
        if (o.type === 'user' && o.message && !this._isToolEcho(o.message.content)) {
          const t = this._plainText(o.message.content);
          if (t) {
            const clean = t.replace(/\s+/g, ' ');
            if (!title) title = clean.slice(0, 60);
            lastUser = clean.slice(0, 120); // 持续覆盖 → 循环结束即最近一条用户消息
          }
        }
      }
    } catch {
      // 文件损坏：保持空标题、count=0
    }
    // 来源判定：手动输入 > sdk 脚本 > 空会话(无对话) > 其它
    const source: Session['source'] = hasTyped
      ? 'typed'
      : hasSdk
        ? 'sdk'
        : count === 0
          ? 'empty'
          : 'other';

    return {
      id: `${rootId}:${uuid}`, // 自描述 id：含根目录 + claude uuid
      rootId,
      engine: 'claude',
      name: title || '(未命名会话)',
      claudeSessionId: uuid, // 发消息一律走 --resume
      paused: false,
      createdAt: createdAt || mtimeMs,
      updatedAt: mtimeMs,
      tasks: [],
      messages: [],
      source,
      lastUser,
    };
  }

  protected static _parseMessages(lines: string[], uuid: string): Message[] {
    const out: Message[] = [];
    let i = 0;
    for (const ln of lines) {
      const o = this._parse(ln);
      if (!o || !o.message) continue;
      if (o.type !== 'user' && o.type !== 'assistant') continue;
      if (this._isToolEcho(o.message.content)) continue; // 跳过工具结果回灌的 user 帧
      const text = this._plainText(o.message.content);
      if (!text) continue;
      const role: MessageRole = o.type === 'assistant' || o.message.role === 'assistant' ? 'assistant' : 'user';
      out.push({
        id: o.uuid || `${uuid}-${i++}`, // 优先用 claude 帧 uuid，便于合并会话链时按 uuid 去重
        taskId: `native-${uuid}`,
        role,
        text,
        createdAt: o.timestamp ? Date.parse(o.timestamp) || 0 : 0,
      });
    }
    return out;
  }

  // ── 内部纯解析（业务实现，非调度）──
  private static _parse(ln: string): RawFrame | null {
    try {
      return JSON.parse(ln) as RawFrame;
    } catch {
      return null;
    }
  }

  // 仅提取纯文本段，忽略 thinking / tool_use / tool_result（展示与续接都只关心对话文本）
  private static _plainText(content: unknown): string {
    if (typeof content === 'string') return content.trim();
    if (!Array.isArray(content)) return '';
    const parts: string[] = [];
    for (const c of content as Array<Record<string, unknown>>) {
      if (!c || typeof c !== 'object') continue;
      if (c.type === 'text' && c.text) parts.push(String(c.text));
    }
    return parts.join('\n').trim();
  }

  // 该帧是否为工具结果回灌（content 数组里含 tool_result）——这类 user 帧不是真实用户输入
  private static _isToolEcho(content: unknown): boolean {
    if (!Array.isArray(content)) return false;
    return (content as Array<Record<string, unknown>>).some((c) => c && c.type === 'tool_result');
  }
}
