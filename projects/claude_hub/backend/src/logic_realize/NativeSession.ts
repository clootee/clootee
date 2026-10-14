// 原生会话解析实现：填充 NativeSessionStruct 的钩子（解析 JSONL 帧、归一纯文本）。
import { NativeSessionStruct } from '../logic_struct/NativeSessionStruct';
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { FsHelper } from '../helper/FsHelper';
import { AppConfig } from '../config/AppConfig';
import { Session, Message, MessageRole } from '../models/Types';

interface RawFrame {
  type?: string;
  summary?: string;
  timestamp?: string;
  uuid?: string; // claude 为每帧分配的全局唯一 id（跨文件去重用）
  promptSource?: string; // 'typed'(手动输入) / 'sdk'(脚本发起) 等，用于判定会话来源
  message?: { role?: string; content?: unknown };
}

// 一段行（文件头或文件尾）扫描出的元信息；头尾各扫一遍再合并
interface ScanResult {
  title: string; // 摘要帧 / 首条提问
  firstUser: string;
  lastUser: string;
  createdAt: number;
  frames: number; // user/assistant 帧数（仅用于判「空会话」）
  hasTyped: boolean;
  hasSdk: boolean;
}

export class NativeSession extends NativeSessionStruct {
  protected static _meta(rootId: string, uuid: string, file: string, mtimeMs: number, _size: number): Session {
    // 只读文件头尾：标题、来源、首条时间在头部，最近一条提问在尾部。
    // 最大的会话文件已超 30MB，全文逐行解析会让列表慢到十几秒；头尾各 256KB 足够。
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
      // 文件读不到：保持空标题、frames=0（与旧实现一致，损坏文件不阻断列表）
    }
    const head = this._scan(headLines);
    const tail = this._scan(tailLines);
    const frames = head.frames + tail.frames;
    // 尾部窗口有提问就直接用；没有则说明最近一条提问离文件尾部太远（助手长篇输出会在其之后），
    // 从末尾向前回溯找它——绝不能退回 head（那是最早的一条，预览会严重失真）。
    const lastUser = tail.lastUser || this._lastUserBackward(file) || head.lastUser;
    // 来源判定：手动输入 > sdk 脚本 > 空会话(无对话) > 其它
    const source: Session['source'] = head.hasTyped || tail.hasTyped
      ? 'typed'
      : head.hasSdk || tail.hasSdk
        ? 'sdk'
        : frames === 0
          ? 'empty'
          : 'other';

    return {
      id: `${rootId}:${uuid}`, // 自描述 id：含根目录 + claude uuid
      rootId,
      engine: 'claude',
      name: head.title || tail.title || '(未命名会话)',
      claudeSessionId: uuid, // 发消息一律走 --resume
      paused: false,
      createdAt: head.createdAt || tail.createdAt || mtimeMs,
      updatedAt: mtimeMs,
      tasks: [],
      messages: [],
      source,
      lastUser,
    };
  }

  // 从文件末尾向前找最近一条真实用户提问（跳过工具结果回灌的空帧）
  private static _lastUserBackward(file: string): string {
    let found = '';
    FsHelper.tailBatches(
      file,
      AppConfig.SESSION_META_SCAN_CHUNK_BYTES,
      AppConfig.SESSION_META_SCAN_BYTES,
      (lines) => {
        for (let i = lines.length - 1; i >= 0; i--) {
          const o = this._parse(lines[i]);
          if (!o || o.type !== 'user' || !o.message) continue;
          if (this._isToolEcho(o.message.content)) continue;
          const t = this._plainText(o.message.content);
          if (!t) continue;
          found = t.replace(/\s+/g, ' ').slice(0, 120);
          return true;
        }
        return false;
      },
    );
    return found;
  }

  // 扫一段 JSONL 行，取出标题、首/末条提问、时间与来源标记
  private static _scan(lines: string[]): ScanResult {
    let title = '';
    let firstUser = '';
    let lastUser = '';
    let createdAt = 0;
    let frames = 0;
    let hasTyped = false;
    let hasSdk = false;
    for (const ln of lines) {
      const o = this._parse(ln);
      if (!o) continue;
      // typed=终端手动；queued/system=经 hub 队列等人为发起，一并归为「手动」
      if (o.promptSource === 'typed' || o.promptSource === 'queued' || o.promptSource === 'system') hasTyped = true;
      if (o.promptSource === 'sdk') hasSdk = true;
      if (o.type === 'user' || o.type === 'assistant') frames++;
      if (!createdAt && o.timestamp) {
        const ts = Date.parse(o.timestamp);
        if (!isNaN(ts)) createdAt = ts;
      }
      if (!title && o.type === 'summary' && o.summary) title = String(o.summary).slice(0, 60);
      if (o.type === 'user' && o.message && !this._isToolEcho(o.message.content)) {
        const t = this._plainText(o.message.content);
        if (t) {
          const clean = t.replace(/\s+/g, ' ');
          if (!firstUser) firstUser = clean.slice(0, 120);
          lastUser = clean.slice(0, 120); // 持续覆盖 → 本段扫完即最近一条用户消息
        }
      }
    }
    return { title: title || firstUser.slice(0, 60), firstUser, lastUser, createdAt, frames, hasTyped, hasSdk };
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
