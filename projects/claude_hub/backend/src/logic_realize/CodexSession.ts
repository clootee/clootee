// Codex 原生会话解析实现：解析 rollout JSONL 帧、归一为纯文本消息。
// rollout 帧形态：{ timestamp, type, payload }
//   type 'session_meta' → payload.id/cwd（首行，元信息）
//   type 'response_item' + payload.type 'message' → payload.role(user/assistant/developer) + content[]
//     content 项：{type:'input_text'|'output_text'|'text', text}
// 需过滤：developer 角色（权限说明）、以 <environment_context>/<permissions 开头的注入型 user 帧。
import { CodexSessionStruct } from '../logic_struct/CodexSessionStruct';
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { FsHelper } from '../helper/FsHelper';
import { AppConfig } from '../config/AppConfig';
import { Session, Message, MessageRole } from '../models/Types';

interface RawFrame {
  type?: string;
  timestamp?: string;
  payload?: {
    type?: string;
    role?: string;
    id?: string;
    content?: unknown;
  };
}

export class CodexSession extends CodexSessionStruct {
  protected static _meta(
    rootId: string,
    uuid: string,
    file: string,
    mtimeMs: number,
    _size: number,
    createdAt: number,
  ): Session {
    // 只读文件头尾：标题取首条用户消息、预览取最近一条用户消息，都在两端。
    // rollout 文件同样可能很大，全文逐行解析会让列表与打开会话都慢到不可用。
    let headLines: string[] = [];
    let tailLines: string[] = [];
    try {
      const edge = FsHelper.readEdgeLines(
        file,
        AppConfig.SESSION_META_HEAD_BYTES,
        AppConfig.SESSION_META_TAIL_BYTES,
      );
      headLines = edge.head;
      tailLines = edge.tail;
    } catch {
      // 文件读不到：保持空标题、count=0（损坏文件不阻断列表）
    }
    const head = this._scan(headLines);
    const tail = this._scan(tailLines);
    // 同 claude：尾部窗口无提问时从末尾向前回溯，避免退回最早的提问
    const lastUser = tail.lastUser || this._lastUserBackward(file) || head.lastUser;
    return {
      id: `${rootId}:${uuid}`,
      rootId,
      engine: 'codex',
      name: head.title || tail.title || '(未命名会话)',
      claudeSessionId: uuid, // 复用字段承载引擎会话 id（codex thread/rollout uuid）
      paused: false,
      createdAt: createdAt || mtimeMs,
      updatedAt: mtimeMs,
      tasks: [],
      messages: [],
      source: head.count + tail.count > 0 ? 'typed' : 'empty',
      lastUser,
    };
  }

  // 从文件末尾向前找最近一条用户消息（与 _scan 同一套帧过滤规则）
  private static _lastUserBackward(file: string): string {
    let found = '';
    FsHelper.tailBatches(
      file,
      AppConfig.SESSION_META_SCAN_CHUNK_BYTES,
      AppConfig.SESSION_META_SCAN_BYTES,
      (lines) => {
        for (let i = lines.length - 1; i >= 0; i--) {
          const msg = this._asMessage(this._parse(lines[i]));
          if (!msg || msg.role !== 'user' || !msg.text) continue;
          found = msg.text.replace(/\s+/g, ' ').slice(0, 120);
          return true;
        }
        return false;
      },
    );
    return found;
  }

  // 扫一段 rollout 行，取出标题（首条用户消息）、末条用户消息与消息条数
  private static _scan(lines: string[]): { title: string; lastUser: string; count: number } {
    let title = '';
    let lastUser = '';
    let count = 0;
    for (const ln of lines) {
      const o = this._parse(ln);
      const msg = this._asMessage(o);
      if (!msg) continue;
      count++;
      if (msg.role === 'user' && msg.text) {
        const clean = msg.text.replace(/\s+/g, ' ');
        if (!title) title = clean.slice(0, 60);
        lastUser = clean.slice(0, 120);
      }
    }
    return { title, lastUser, count };
  }

  protected static _parseMessages(lines: string[], uuid: string): Message[] {
    const out: Message[] = [];
    let i = 0;
    for (const ln of lines) {
      const o = this._parse(ln);
      const msg = this._asMessage(o);
      if (!msg || !msg.text) continue;
      out.push({
        id: (o && o.payload && o.payload.id) || `${uuid}-${i}`,
        taskId: `codex-${uuid}`,
        role: msg.role,
        text: msg.text,
        createdAt: o && o.timestamp ? Date.parse(o.timestamp) || 0 : 0,
      });
      i++;
    }
    return out;
  }

  // ── 内部纯解析 ──
  private static _parse(ln: string): RawFrame | null {
    try {
      return JSON.parse(ln) as RawFrame;
    } catch {
      return null;
    }
  }

  // 把一帧归一为 {role, text}；非真实对话帧（developer/注入上下文/非 message）返回 null
  private static _asMessage(o: RawFrame | null): { role: MessageRole; text: string } | null {
    if (!o || o.type !== 'response_item' || !o.payload) return null;
    if (o.payload.type !== 'message') return null;
    const role = o.payload.role;
    if (role !== 'user' && role !== 'assistant') return null; // 跳过 developer/system
    const text = this._plainText(o.payload.content, role === 'user');
    if (!text) return null;
    // 跳过 codex 注入的环境/权限上下文（伪装成 user 帧）
    return { role, text };
  }

  private static _plainText(content: unknown, dropInjectedUserText = false): string {
    if (typeof content === 'string') {
      if (dropInjectedUserText && this._isInjectedUserText(content)) return '';
      return content.trim();
    }
    if (!Array.isArray(content)) return '';
    const parts: string[] = [];
    for (const c of content as Array<Record<string, unknown>>) {
      if (!c || typeof c !== 'object') continue;
      const t = String(c.type || '');
      if (!t.endsWith('text') || !c.text) continue;
      const text = String(c.text);
      if (dropInjectedUserText && this._isInjectedUserText(text)) continue;
      parts.push(text);
    }
    return parts.join('\n').trim();
  }

  private static _isInjectedUserText(text: string): boolean {
    // recommended_plugins：codex 新版在首轮注入的"可安装插件清单"，会伪装成第一条 user 消息 → 污染标题与正文
    return /^\s*<(environment_context|permissions|user_instructions|recommended_plugins)\b/i.test(text)
      || /^\s*#\s*AGENTS\.md instructions for\b[\s\S]*<INSTRUCTIONS>/i.test(text)
      || /^\s*<INSTRUCTIONS\b[\s\S]*<\/INSTRUCTIONS>\s*$/i.test(text);
  }
}
