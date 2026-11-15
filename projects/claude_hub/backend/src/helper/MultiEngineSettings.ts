import { MultiEngineEntry } from '../models/Types';
import { isProvider, isEffort, PROVIDERS } from '../logic_struct/EngineConfigStruct';
import { resolveProvider } from '../config/ProviderCatalog';

export class MultiEngineSettings {
  static validate(raw: any): { enabled: boolean; engines: MultiEngineEntry[] } {
    if (!raw || typeof raw.enabled !== 'boolean' || !Array.isArray(raw.engines)) throw new Error('Invalid multi-engine settings');
    if (raw.engines.length > 10 || (raw.enabled && raw.engines.length < 2)) throw new Error('多引擎需要 2–10 个引擎 / Configure 2–10 engines');
    const names = new Set<string>();
    const engines = raw.engines.map((entry: any): MultiEngineEntry => {
      const name = String(entry?.name || '').trim();
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) throw new Error('名称须以英文字母开头，仅含英文字母、数字、下划线，最多40字符 / Invalid engine directory name');
      if (names.has(name.toLowerCase())) throw new Error('引擎名称不能重复 / Duplicate engine name');
      names.add(name.toLowerCase());
      if (entry.engine !== 'claude' && entry.engine !== 'codex') throw new Error('Invalid engine');
      const c = entry.config;
      if (!c || !isProvider(c.provider) || !isEffort(c.effort)) throw new Error('Invalid engine provider');
      const config = { provider: c.provider, apiKey: String(c.apiKey || '').trim(), model: String(c.model || '').trim(), effort: c.effort || '', baseUrl: String(c.baseUrl || '').trim(), ...(typeof c.modelsUrl === 'string' && c.modelsUrl.trim() ? { modelsUrl: c.modelsUrl.trim() } : {}) };
      if (config.provider !== 'official') {
        if (!config.apiKey || !config.model) throw new Error(`${name}: 需要 API Key 和模型 / API key and model required`);
        if (config.provider === 'custom') {
          const url = new URL(config.baseUrl);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid Base URL');
        } else {
          const meta = resolveProvider(config.provider, config.apiKey, PROVIDERS);
          if (!(entry.engine === 'claude' ? meta?.anthropicBase : meta?.chatBase)) throw new Error(`${name}: 服务商不支持此引擎 / Incompatible provider`);
        }
      }
      return { name, engine: entry.engine, config };
    });
    return { enabled: raw.enabled, engines };
  }
}
