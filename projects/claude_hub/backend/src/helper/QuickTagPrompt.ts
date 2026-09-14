// 纯工具：把「快捷标签」分组渲染成一段说明文字，用于写进 CLAUDE.md/AGENTS.md，
// 帮助 AI 理解消息开头可能出现的 [标签] 前缀含义。与调用方是否真的用到某个标签无关。
export interface QuickTagLike {
  label: string;
  prompt?: string;
}
export interface QuickGroupLike {
  name: string;
  prompt?: string;
  tags: QuickTagLike[];
}

export class QuickTagPrompt {
  static render(groups: QuickGroupLike[]): string {
    const lines: string[] = [];
    for (const g of groups || []) {
      const groupPrompt = (g.prompt || '').trim();
      for (const t of g.tags || []) {
        const label = (t.label || '').trim();
        if (!label) continue;
        const meaning = (t.prompt || '').trim();
        const desc = [meaning, groupPrompt ? `（分组"${g.name}"提示词：${groupPrompt}）` : '']
          .filter(Boolean)
          .join(' ');
        lines.push(desc ? `- [${label}]：${desc}` : `- [${label}]`);
      }
    }
    if (!lines.length) return '';
    return ['## 快捷标签说明（消息开头可能出现 [标签] 前缀，含义如下）', ...lines].join('\n');
  }
}
