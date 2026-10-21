import { TokenUsage } from '../models/Types';

// 微单位金额（1,000,000 micro = 1 货币单位），计费完全由参数决定，不含业务常量。
export function costMicro(usage: TokenUsage, inputMicroPerM: number, outputMicroPerM: number): number {
  const input = Math.max(0, Number(usage.inputTokens) || 0);
  const cached = Math.max(0, Number(usage.cacheReadTokens) || 0);
  const output = Math.max(0, Number(usage.outputTokens) || 0);
  // 缓存读取按输入价的 25% 计（与主流服务商一致），计费口径集中在这里
  return Math.round(((input * inputMicroPerM) + (cached * inputMicroPerM * 0.25) + (output * outputMicroPerM)) / 1_000_000);
}

export function microToYuan(micro: number): string {
  return (Math.max(0, micro) / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}
