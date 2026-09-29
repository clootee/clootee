import catalog from './provider-catalog.json';
import type { ProviderMeta } from '../logic_struct/EngineConfigStruct';

// models.dev metadata is an offline, reviewable snapshot, not an authentication oracle.
// Only OpenAI Chat compatible providers with a concrete HTTPS endpoint are imported.
export const CATALOG_PROVIDERS: Record<string, ProviderMeta> = Object.fromEntries(
  Object.entries(catalog.providers).map(([id, p]) => [id, {
    ...p, anthropicBase: '', modelsUrl: `${p.chatBase}/models`,
    signupUrl: p.docsUrl, note: '',
  }]),
);

function endpoint(id: string, label: string, chatBase: string, anthropicBase: string, docsUrl: string): void {
  CATALOG_PROVIDERS[id] = { label, chatBase, anthropicBase, modelsUrl: `${chatBase}/models`, docsUrl, signupUrl: docsUrl, note: '' };
}

// Native Anthropic endpoints verified against official docs (see docs/provider-support.md).
CATALOG_PROVIDERS.openrouter.anthropicBase = 'https://openrouter.ai/api';
CATALOG_PROVIDERS.openrouter.extraEnv = { ANTHROPIC_API_KEY: '' };
for (const id of ['alibaba', 'alibaba-cn', 'alibaba-coding-plan', 'alibaba-coding-plan-cn', 'alibaba-token-plan', 'alibaba-token-plan-cn']) {
  const p = CATALOG_PROVIDERS[id];
  if (p) p.anthropicBase = `${new URL(p.chatBase).origin}/apps/anthropic`;
}
for (const region of ['cn', 'sgp', 'ams']) {
  const p = CATALOG_PROVIDERS[`xiaomi-token-plan-${region}`];
  if (p) p.anthropicBase = `${new URL(p.chatBase).origin}/anthropic`;
}
endpoint('tencent', 'Tencent LKEAP', 'https://api.lkeap.cloud.tencent.com/v1', 'https://api.lkeap.cloud.tencent.com/anthropic', 'https://cloud.tencent.com/document/product/1772/130550');
endpoint('tencent-coding-plan', 'Tencent Coding Plan', 'https://api.lkeap.cloud.tencent.com/coding/v3', 'https://api.lkeap.cloud.tencent.com/coding/anthropic', 'https://cloud.tencent.com/document/product/1823/130092');
endpoint('tencent-token-plan', 'Tencent Token Plan', 'https://api.lkeap.cloud.tencent.com/plan/v3', 'https://api.lkeap.cloud.tencent.com/plan/anthropic', 'https://cloud.tencent.com/document/product/1823/130119');

export function resolveProvider(provider: string, key: string, providers: Record<string, ProviderMeta>): ProviderMeta | null {
  if (!Object.prototype.hasOwnProperty.call(providers, provider)) return null;
  const meta = providers[provider];
  const k = key.trim();
  if (provider === 'tencent' || provider === 'tencent-tokenhub') {
    if (k.startsWith('sk-sp-')) return providers['tencent-coding-plan'];
    if (k.startsWith('sk-tp-')) return providers['tencent-token-plan'];
  }
  // Alibaba Coding and Token plans share sk-sp-. Never guess a billing endpoint.
  if (['alibaba', 'alibaba-cn'].includes(provider) && k.startsWith('sk-sp-'))
    throw new Error('请选择千问 Coding Plan 或 Token Plan 及区域 / Select Alibaba Coding Plan or Token Plan and region; sk-sp- is ambiguous.');
  if (/^alibaba-(coding|token)-plan/.test(provider) && !k.startsWith('sk-sp-'))
    throw new Error('套餐需要专属 sk-sp- Key / This plan requires its dedicated sk-sp- key.');
  if (provider === 'tencent-coding-plan' && !k.startsWith('sk-sp-'))
    throw new Error('Coding Plan 需要 sk-sp- Key / Coding Plan requires a sk-sp- key.');
  if (provider === 'tencent-token-plan' && !k.startsWith('sk-tp-'))
    throw new Error('Token Plan 需要 sk-tp- Key / Token Plan requires a sk-tp- key.');
  if (provider.startsWith('xiaomi-token-plan-') && !k.startsWith('tp-'))
    throw new Error('小米 Token Plan 需要 tp- Key / Xiaomi Token Plan requires a tp- key.');
  const sub = meta.subscription;
  return sub && k.startsWith(sub.keyPrefix) ? { ...meta, ...sub } : meta;
}
