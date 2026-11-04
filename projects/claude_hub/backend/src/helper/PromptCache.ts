import * as fs from 'fs';
import * as path from 'path';
import { ClaudeStoreHelper } from './ClaudeStoreHelper';

export type PromptCacheMode = '1h' | '5m' | 'off';

export class PromptCache {
  static valid(value: unknown): value is PromptCacheMode {
    return value === '1h' || value === '5m' || value === 'off';
  }

  // Override inherited switches as well as settings-file env for each CLI launch.
  static env(mode: PromptCacheMode): Record<string, string> {
    return {
      CLAUDE_CODE_PROMPT_CACHE_TTL: mode === 'off' ? '1h' : mode,
      CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL: mode === 'off' ? '1h' : mode,
      ENABLE_PROMPT_CACHING_1H: mode === '1h' ? '1' : '0',
      ENABLE_PROMPT_CACHING_1H_BEDROCK: '0',
      FORCE_PROMPT_CACHING_5M: mode === '5m' ? '1' : '0',
      DISABLE_PROMPT_CACHING: mode === 'off' ? '1' : '0',
      DISABLE_PROMPT_CACHING_OPUS: '0',
      DISABLE_PROMPT_CACHING_SONNET: '0',
      DISABLE_PROMPT_CACHING_HAIKU: '0',
      DISABLE_PROMPT_CACHING_FABLE: '0',
    };
  }

  static settings(mode: PromptCacheMode): Record<string, unknown> {
    return { promptCacheTtl: mode === 'off' ? '1h' : mode,
      subagentPromptCacheTtl: mode === 'off' ? '1h' : mode, env: this.env(mode) };
  }

  static sync(mode: PromptCacheMode, home?: string): void {
    const file = ClaudeStoreHelper.settingsFile(home);
    const json = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Invalid Claude settings');
    const settings = this.settings(mode);
    Object.assign(json, settings, { env: { ...(json.env || {}), ...this.env(mode) } });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }
}
