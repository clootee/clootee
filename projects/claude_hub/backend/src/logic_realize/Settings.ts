// 全局设置（实现）：读写 data/settings.json。
import * as fs from 'fs';
import {
  SettingsStruct,
  AppSettings,
  AutoCompactSetting,
  AUTO_COMPACT_DEFAULT_TOKENS,
  AUTO_COMPACT_MAX,
  AUTO_COMPACT_MIN,
  QuickGroup,
  QuickTag,
  ToolPrefMap,
} from '../logic_struct/SettingsStruct';
import type { ToolId } from '../logic_struct/ToolchainStruct';
import { Paths } from '../paths';

// 运行环境面板里可选来源的工具（与 ToolchainStruct.ToolId 一致；type-only 导入不产生运行时循环依赖）
const TOOL_IDS: ToolId[] = ['node', 'git', 'claude', 'codex'];

export class Settings extends SettingsStruct {
  protected static _read(): AppSettings | null {
    try {
      if (!fs.existsSync(Paths.SETTINGS_FILE)) return null;
      return JSON.parse(fs.readFileSync(Paths.SETTINGS_FILE, 'utf8')) as AppSettings;
    } catch {
      return null;
    }
  }

  protected static _write(s: AppSettings): void {
    fs.writeFileSync(Paths.SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf8');
  }

  // 清洗自定义快捷按钮分组：按钮文字去空白/去重（同组内）、丢弃空组，上限 10 组 × 10 按钮。
  // 每个按钮可带含义提示词 prompt（上限 2000 字），每组可带组提示词 prompt。
  protected static _sanitizeQuickGroups(raw: unknown): QuickGroup[] {
    if (!Array.isArray(raw)) return [];
    const clip = (v: unknown, n: number): string => (typeof v === 'string' ? v.trim().slice(0, n) : '');
    const out: QuickGroup[] = [];
    for (const g of raw.slice(0, 10)) {
      if (!g || typeof g !== 'object') continue;
      const src = Array.isArray((g as any).tags) ? (g as any).tags : [];
      const seen = new Set<string>();
      const tags: QuickTag[] = [];
      for (const t of src) {
        const label = typeof t === 'string' ? t : t && typeof t.label === 'string' ? t.label : '';
        const clean = String(label).trim().slice(0, 40);
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);
        const prompt = t && typeof t === 'object' ? clip((t as any).prompt, 2000) : '';
        tags.push(prompt ? { label: clean, prompt } : { label: clean });
        if (tags.length >= 10) break;
      }
      if (tags.length === 0) continue;
      const name = clip((g as any).name, 40) || `组${out.length + 1}`;
      const groupPrompt = clip((g as any).prompt, 2000);
      out.push(groupPrompt ? { name, prompt: groupPrompt, tags } : { name, tags });
    }
    return out;
  }

  // 清洗工具来源偏好：只认已知工具 id 与 auto/system/bundled 三种取值；
  // 未设置过的工具回落到旧字段 preferBundled 的迁移值（true → bundled，否则 auto）。
  protected static _sanitizeToolPrefs(raw: unknown, legacyPreferBundled: boolean): ToolPrefMap {
    const fallback = legacyPreferBundled ? 'bundled' : 'auto';
    const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const out: ToolPrefMap = {};
    for (const id of TOOL_IDS) {
      const v = src[id];
      out[id] = v === 'auto' || v === 'system' || v === 'bundled' ? v : fallback;
    }
    return out;
  }

  // 清洗自动压缩设置：老配置里没有该字段 → 回落 auto（行为与改动前完全一致，不传 CLI 参数）。
  // custom 的窗口必须落在 100k–1M：这是 claude CLI 对 `--autocompact` 的硬性限制，
  // 越界会让进程在启动阶段直接报参数错误，所以在这里夹住而不是原样透传。
  protected static _sanitizeAutoCompact(raw: unknown): AutoCompactSetting {
    const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const mode = src.mode === 'custom' ? 'custom' : 'auto';
    const n = Math.round(Number(src.tokens));
    const tokens = Number.isFinite(n) && n > 0
      ? Math.min(AUTO_COMPACT_MAX, Math.max(AUTO_COMPACT_MIN, n))
      : AUTO_COMPACT_DEFAULT_TOKENS;
    return { mode, tokens };
  }
}
