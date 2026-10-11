// Claude 官方 API 价目表（美元 / 百万 token，Anthropic 一方 API 标准价，核对日期 2026-10）。
// 缓存写：5 分钟 TTL = 输入价 × 1.25，1 小时 TTL = 输入价 × 2；缓存读默认 = 输入价 × 0.1（个别模型单独标价）。
// longContext：单次请求输入（含缓存读写）超过 200K 时输入类 ×2、输出 ×1.5（仅老 Sonnet 4 / 4.5）。
// fastMult：usage.speed === 'fast' 时整体倍率。新模型上线就往这里加一行。
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  longContext?: boolean;
  fastMult?: number;
}

export const CLAUDE_PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-mythos-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, fastMult: 2 },
  'claude-opus-5': { input: 5, output: 25, fastMult: 2 },
  'claude-opus-4-8': { input: 5, output: 25, fastMult: 2 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25, fastMult: 6 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-opus-4-1': { input: 15, output: 75 },
  'claude-opus-4': { input: 15, output: 75 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15, longContext: true },
  'claude-sonnet-4': { input: 3, output: 15, longContext: true },
  'claude-3-7-sonnet': { input: 3, output: 15 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
};

export const CACHE_WRITE_5M_MULT = 1.25;
export const CACHE_WRITE_1H_MULT = 2;
export const CACHE_READ_DEFAULT_MULT = 0.1;
export const LONG_CONTEXT_THRESHOLD = 200_000;
export const LONG_CONTEXT_INPUT_MULT = 2;
export const LONG_CONTEXT_OUTPUT_MULT = 1.5;
export const WEB_SEARCH_USD = 0.01; // $10 / 1000 次
// 只有这些服务商（按量计费的 Key）才统计：anthropic 用上面的官方价目，openrouter 用 OpenRouter 公开价目
export const API_COST_PROVIDERS = ['anthropic', 'openrouter'];
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const OPENROUTER_PRICES_TTL_MS = 6 * 3600 * 1000;
export const API_COST_MAX_BATCH = 300;
