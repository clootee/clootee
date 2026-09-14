// 纯工具：在 markdown 文本里维护一个带标记的「预设系统提示词」块。
// 与业务无关，可独立测试。
export class PromptBlock {
  static readonly START = '<!-- claude-hub:preset-prompt:start -->';
  static readonly END = '<!-- claude-hub:preset-prompt:end -->';

  // 文本里是否已包含该提示词（标记块内容一致，或用户手写的原文已在文中）
  static has(content: string, prompt: string): boolean {
    const body = this._norm(prompt);
    if (!body) return true;
    const inBlock = this._blockBody(content);
    if (inBlock !== null && this._norm(inBlock) === body) return true;
    return this._norm(content).includes(body);
  }

  // 生成写入后的新文本；已存在（内容一致）返回 null 表示无需改动。
  // 标记块存在但内容变了 → 原地替换；不存在 → 追加到末尾。
  static upsert(content: string, prompt: string): string | null {
    if (this.has(content, prompt)) return null;
    const block = `${this.START}\n${prompt.trim()}\n${this.END}`;
    const s = content.indexOf(this.START);
    const e = content.indexOf(this.END);
    if (s >= 0 && e > s) {
      return content.slice(0, s) + block + content.slice(e + this.END.length);
    }
    const base = content.replace(/\s+$/, '');
    return base ? `${base}\n\n${block}\n` : `${block}\n`;
  }

  // 取标记块内的正文；没有块返回 null
  private static _blockBody(content: string): string | null {
    const s = content.indexOf(this.START);
    if (s < 0) return null;
    const e = content.indexOf(this.END, s + this.START.length);
    if (e < 0) return null;
    return content.slice(s + this.START.length, e);
  }

  // 归一化：统一换行、折叠空白、去首尾，便于「是否已写过」的比对
  private static _norm(text: string): string {
    return (text || '').replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
  }
}
