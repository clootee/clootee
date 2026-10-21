export interface DeviceRecord {
  installId: string;
  token: string;
  name: string;
  ip: string;
  createdAt: number;
  grantMicro: number;
  spentMicro: number;
}

export interface UsageRecord {
  at: number;
  installId: string;
  model: string;
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  costMicro: number;
  status: string;
  tag: string;
}

export interface LedgerData {
  devices: DeviceRecord[];
  usage: UsageRecord[];
  issuedPerIp: Record<string, { day: string; count: number }>;
  daily: { day: string; spentMicro: number };
}

export interface LinkCodeRecord {
  code: string;
  token: string;
  expiresAt: number;
}

export interface TokenUsage {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
}

export interface RegistrationResult {
  token: string;
  grantedMicro: number;
  reused: boolean;
  balanceMicro: number;
}

export interface UsageItem {
  at: number;
  model: string;
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  costMicro: number;
  status: string;
}

export interface UsageResult {
  items: UsageItem[];
  balanceMicro: number;
  tagged: { calls: number; costMicro: number } | null;
}

export interface StatusResult {
  balanceMicro: number;
  email: string | null;
}

export interface ForwardResult {
  status: number;
  contentType: string;
  headers: Record<string, string>;
  body: Buffer | null;
  stream: NodeJS.ReadableStream | null;
  usage: Promise<TokenUsage | null>;
}

export type EngineKind = 'anthropic' | 'openai';
