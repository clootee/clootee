// 运行配置：全部来自环境变量 / 项目根目录 .env（不覆盖已存在的环境变量）。
import * as fs from 'fs';
import * as path from 'path';

export const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(path.join(PROJECT_ROOT, '.env'));

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

// 模型映射："公开名|上游模型;公开名2|上游模型2"；未在表里的请求一律落到 UPSTREAM_MODEL。
function parseModelMap(raw: string, fallbackModel: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of raw.split(';')) {
    const [name, upstream] = pair.split('|').map((s) => s.trim());
    if (name) map.set(name, upstream || fallbackModel);
  }
  if (map.size === 0) map.set('deepseek-flash', fallbackModel);
  return map;
}

const ARK_BASE = str('CC_ARK_BASE', 'https://ark.cn-beijing.volces.com').replace(/\/+$/, '');
const UPSTREAM_MODEL = str('CC_UPSTREAM_MODEL', '');

export const Config = {
  HOST: str('CC_HOST', '127.0.0.1'),
  PORT: num('CC_PORT', 8980),
  PUBLIC_URL: str('CC_PUBLIC_URL', 'https://console.clootee.com').replace(/\/+$/, ''),
  DATA_DIR: path.resolve(PROJECT_ROOT, str('CC_DATA_DIR', 'data')),

  ARK_BASE,
  // Ark 的两套协议面：Anthropic /v1/messages 与 OpenAI /chat/completions
  ARK_ANTHROPIC_BASE: `${ARK_BASE}${str('CC_ARK_ANTHROPIC_PATH', '/api/compatible')}`,
  ARK_OPENAI_BASE: `${ARK_BASE}${str('CC_ARK_OPENAI_PATH', '/api/v3')}`,
  ARK_KEY: str('CC_ARK_KEY', ''),
  UPSTREAM_MODEL,
  MODEL_MAP: parseModelMap(str('CC_MODEL_MAP', ''), UPSTREAM_MODEL),

  GRANT_MICRO: num('CC_GRANT_MICRO', 5_000_000),
  PRICE_INPUT_MICRO_PER_M: num('CC_PRICE_INPUT_MICRO_PER_M', 1_000_000),
  PRICE_OUTPUT_MICRO_PER_M: num('CC_PRICE_OUTPUT_MICRO_PER_M', 2_000_000),

  DEVICES_PER_IP_PER_DAY: num('CC_DEVICES_PER_IP_PER_DAY', 10),
  // 全站每日预算（micro）：0 = 不限制。超出后所有调用返回 402，保护上游账户。
  DAILY_BUDGET_MICRO: num('CC_DAILY_BUDGET_MICRO', 100_000_000),
  RATE_LIMIT_RPM: num('CC_RATE_LIMIT_RPM', 120),
  MAX_BODY_BYTES: num('CC_MAX_BODY_BYTES', 32 * 1024 * 1024),
  USAGE_KEEP: num('CC_USAGE_KEEP', 5000),
};

// 启动前自检：缺 Key / 模型就直接拒绝起服务，错误信息带字段名。
export function validateConfig(): void {
  if (!Config.ARK_KEY) throw new Error('config.validate: ARK_KEY is empty (set it in projects/clootee_console/.env)');
  if (!Config.UPSTREAM_MODEL) throw new Error('config.validate: UPSTREAM_MODEL is empty (Volcano Ark endpoint id)');
  if (!Number.isInteger(Config.PORT) || Config.PORT <= 0 || Config.PORT > 65535) {
    throw new Error(`config.validate: invalid PORT=${Config.PORT}`);
  }
  if (Config.GRANT_MICRO < 0) throw new Error(`config.validate: invalid GRANT_MICRO=${Config.GRANT_MICRO}`);
}
