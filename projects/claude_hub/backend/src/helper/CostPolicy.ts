import type { AppSettings } from '../logic_struct/SettingsStruct';
import type { PromptCacheMode } from './PromptCache';

export interface CostPolicySettings {
  mode: 'auto' | 'manual' | 'off';
  scope: 'both' | 'subscription' | 'apikey';
  guard: boolean;
  strict: boolean;
  enhance: boolean;
  thresholdTokens: number;
  minExtraUsd: number;
  cheapModel: string;
}

export class CostPolicy {
  static defaults(): CostPolicySettings {
    return { mode: 'auto', scope: 'both', guard: true, strict: false, enhance: true,
      thresholdTokens: 50000, minExtraUsd: 0.1, cheapModel: '' };
  }
  static sanitize(raw: unknown): CostPolicySettings {
    const r = raw && typeof raw === 'object' ? raw as Partial<CostPolicySettings> : {};
    const d = this.defaults();
    return { mode: r.mode === 'manual' || r.mode === 'off' ? r.mode : 'auto',
      scope: r.scope === 'subscription' || r.scope === 'apikey' ? r.scope : 'both',
      guard: typeof r.guard === 'boolean' ? r.guard : d.guard,
      strict: typeof r.strict === 'boolean' ? r.strict : d.strict,
      enhance: typeof r.enhance === 'boolean' ? r.enhance : d.enhance,
      thresholdTokens: Number.isFinite(r.thresholdTokens) ? Math.max(1000, Math.min(1000000, Number(r.thresholdTokens))) : d.thresholdTokens,
      minExtraUsd: Number.isFinite(r.minExtraUsd) ? Math.max(0, Math.min(100, Number(r.minExtraUsd))) : d.minExtraUsd,
      cheapModel: typeof r.cheapModel === 'string' ? r.cheapModel.trim().slice(0, 200) : '' };
  }
  static effective(s: AppSettings): CostPolicySettings {
    const p = this.sanitize(s.costOptimization);
    return p.mode === 'auto' ? { ...this.defaults(), scope: p.scope } : p;
  }
  static applies(p: CostPolicySettings, subscription: boolean): boolean {
    return p.mode !== 'off' && (p.scope === 'both' || p.scope === (subscription ? 'subscription' : 'apikey'));
  }
  static cache(s: AppSettings, sessionMode?: PromptCacheMode, subscription = false): PromptCacheMode {
    const p = this.effective(s);
    return p.mode === 'auto' && this.applies(p, subscription) ? '1h' : sessionMode || s.claudePromptCache;
  }
}
