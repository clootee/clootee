// 各服务商的按量价目（美元 / 百万 token），核对日期 2026-10。
// 计价来源按「服务商优先、否则看模型 id」判定（见 ApiCost._source）：
//   openrouter → OpenRouter 公开价目（它自己的 /api/v1/models，运行时缓存）
//   deepseek   → DeepSeek 官方价目（本文件，含峰谷时段）
//   其它       → Claude 官方价目（本文件）
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead?: number;
  longContext?: boolean;   // 单次请求输入（含缓存读写）超过 200K 时输入类 ×2、输出 ×1.5（仅老 Sonnet 4 / 4.5）
  fastMult?: number;       // usage.speed === 'fast' 时整体倍率
}

// Claude 官方 API 标准价。缓存写：5 分钟 TTL = 输入价 × 1.25，1 小时 TTL = 输入价 × 2；缓存读默认 = 输入价 × 0.1。
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

// DeepSeek 官方价目（无缓存写费用：写进缓存按「未命中输入」价计）。峰谷价见 isDeepSeekPeak。
export interface DeepSeekPrice {
  input: number;      // 未命中输入
  cacheRead: number;  // 命中输入
  output: number;
}

export const DEEPSEEK_PRICES: Record<string, DeepSeekPrice> = {
  // deepseek-flash = DeepSeek-V4.1-Flash（官方模型 id；旧 id 一并按 Flash 价计）
  'deepseek-flash': { input: 0.3, cacheRead: 0.006, output: 1.2 },
  'deepseek-v4-1-flash': { input: 0.3, cacheRead: 0.006, output: 1.2 },
  'deepseek-v4-flash': { input: 0.3, cacheRead: 0.006, output: 1.2 },
  'deepseek-v4-pro': { input: 1.32, cacheRead: 0.044, output: 3.96 },
  'deepseek-v4-1-pro': { input: 1.32, cacheRead: 0.044, output: 3.96 },
};

export const DEEPSEEK_OFFPEAK_MULT = 0.5; // 非高峰时段半价

// 高峰时段：周一至周五 UTC 01:00-04:00 与 06:00-10:00（北京时间 09:00-12:00、14:00-18:00）；
// 其余时段与整个周末半价。
export function isDeepSeekPeak(ts: number): boolean {
  const d = new Date(Number(ts) || 0);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const h = d.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

// 订阅登录（没有 API Key，不发生按量扣费）——只给它算「相当于多少钱」的估价，前端标「订阅」。
export const SUBSCRIPTION_PROVIDERS = ['official'];
// 由 Clootee 自有服务商（console.clootee.com）计费的轮次：本模块不重复统计。
export const CLOOTEE_PROVIDER = 'clootee';

export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const OPENROUTER_PRICES_TTL_MS = 6 * 3600 * 1000;
export const API_COST_MAX_BATCH = 300;
