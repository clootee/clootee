// 引擎服务商配置（调度骨架）：claude / codex 各自选择「原版 / minimax / kimi」，
// 第三方需填 apiKey 并选 model（模型列表实时从服务商拉取）。
// - claude：第三方走 Anthropic 兼容端点，托管环境变量（MANAGED_ENV_KEYS）同时注入本进程
//   和 ~/.claude/settings.json 的 env 段，两处始终一致。
// - 模型列表：走服务商 OpenAI 兼容 /v1/models（实时），**无内置兜底**，失败即报错让用户改 Key。
// 具体 IO（读写 data/engines.json、HTTP 拉取、写 ~/.claude/settings.json）由 Realize 实现。
import {
  EffortLevel,
  EngineFileEntry,
  EnginesConfig,
  EnginesFile,
  EngineProvider,
  EngineProviderConfig,
  ModelDetect,
  ModelOption,
  ProviderSlot,
} from '../models/Types';
import { EnvHelper } from '../helper/EnvHelper';

// 思考强度候选。claude 原生支持全部 5 档（`--effort`）；
// codex 的 model_reasoning_effort 只认 low/medium/high，故 xhigh/max 在 codex 侧降级到 high。
export const EFFORT_LEVELS: Array<{ id: Exclude<EffortLevel, ''>; label: string; codex: string }> = [
  { id: 'low', label: '低（最快、最省）', codex: 'low' },
  { id: 'medium', label: '中（均衡）', codex: 'medium' },
  { id: 'high', label: '高（更仔细）', codex: 'high' },
  { id: 'xhigh', label: '极高（复杂任务）', codex: 'high' },
  { id: 'max', label: '最高（最强推理，最慢）', codex: 'high' },
];

// 某字符串是否为合法 effort（''=自动，合法）
export function isEffort(v: unknown): v is EffortLevel {
  return v === '' || v === undefined || v === null
    ? true
    : typeof v === 'string' && EFFORT_LEVELS.some((e) => e.id === v);
}

// 各服务商元信息（域内配置，非通用 helper）
export interface ProviderMeta {
  anthropicBase: string; // 供 claude 第三方使用的 Anthropic 兼容 base_url
  chatBase: string;      // OpenAI Chat Completions 兼容 base_url（供 Codex 内置转换代理）
  modelsUrl: string;     // OpenAI 兼容模型列表端点
  // ── 以下供前端「新手引导」展示：名称、开通/购买入口、使用指南、一句话说明 ──
  label: string;
  signupUrl: string;  // 注册并创建 API Key 的页面
  docsUrl: string;    // 官方文档
  note: string;       // 一句话卖点/提示（新手看这句就够）
  vision?: boolean;   // 是否支持图片识别（前端会标出「支持图片识别」）
  recommended?: boolean; // 是否首推（前端「推荐」角标；国产模型里目前首推 MiniMax）
  extraEnv?: Record<string, string>; // 该服务商官方要求的额外环境变量（键必须在 MANAGED_ENV_KEYS 内）
  // 自动选默认模型时的偏好顺序（不区分大小写的子串匹配）。
  // ⚠ 这不是兜底模型列表：只用于在服务商 API **真实返回**的 id 里排序挑一个，
  //   API 返回空仍然照旧报错（见 listModels），绝不拿写死的名字去请求。
  preferModels?: string[];
  // 「订阅制 Key」走独立域名、与按量计费 Key 互不通用的服务商填这里。
  // Key 前缀命中时，上面三个 base 全部换成这里的（见 _bases）。
  subscription?: { keyPrefix: string; anthropicBase: string; chatBase: string; modelsUrl: string };
}

// 由本工具托管的 claude 环境变量：既注入 process.env，也写进 ~/.claude/settings.json 的 env 段。
// 切回原版订阅时这些键会被一并清除（不碰用户自己加的其他键）。
export const MANAGED_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  // claude 会按 sonnet/opus/haiku 别名请求模型，第三方端点不认这些别名 → 三个都指向选定模型
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'CLAUDE_CODE_EFFORT_LEVEL',
];

// 顺序即前端展示顺序：首推的服务商放最前
export const PROVIDERS: Record<Exclude<EngineProvider, 'official' | 'custom'>, ProviderMeta> = {
  minimax: {
    anthropicBase: 'https://api.minimaxi.com/anthropic',
    chatBase: 'https://api.minimaxi.com/v1',
    modelsUrl: 'https://api.minimaxi.com/v1/models',
    label: 'MiniMax',
    signupUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    docsUrl: 'https://platform.minimaxi.com/docs/token-plan/claude-code',
    note: 'MiniMax 最新模型（列表实时拉取），代码能力强且支持图片识别，国产模型首推',
    vision: true,
    recommended: true,
    // 官方 Claude Code 接入文档要求：把自动压缩窗口对齐到 1M 上下文
    extraEnv: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1000000' },
    // 官方文档推荐 M3（M2.x 只有 text+tools，图片识别要 M3）
    preferModels: ['MiniMax-M3', 'MiniMax-M2'],
  },
  xiaomi: {
    // 按量计费 Key（sk-）走 api 域名
    anthropicBase: 'https://api.xiaomimimo.com/anthropic',
    chatBase: 'https://api.xiaomimimo.com/v1',
    modelsUrl: 'https://api.xiaomimimo.com/v1/models',
    // 订阅制 Token Plan 的 Key（tp-）是**另一套域名**，两者互不通用：
    // 拿 tp- Key 打 api.xiaomimimo.com 会直接鉴权失败。国内集群用 -cn
    // （官方还有 -sgp / -ams 两个海外集群，要用的人走「自定义服务商」填）。
    subscription: {
      keyPrefix: 'tp-',
      anthropicBase: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      chatBase: 'https://token-plan-cn.xiaomimimo.com/v1',
      modelsUrl: 'https://token-plan-cn.xiaomimimo.com/v1/models',
    },
    label: '小米 MiMo',
    signupUrl: 'https://platform.xiaomimimo.com',
    docsUrl: 'https://platform.xiaomimimo.com/docs',
    note: '小米自研模型，国内直连；按量计费 Key（sk-）与订阅 Token Plan Key（tp-）都支持，粘进来自动识别',
  },
  kimi: {
    anthropicBase: 'https://api.moonshot.cn/anthropic',
    chatBase: 'https://api.moonshot.cn/v1',
    modelsUrl: 'https://api.moonshot.cn/v1/models',
    label: 'Kimi 开放平台（按量计费）',
    // platform.moonshot.cn 已 301 到 platform.kimi.com，直接写新地址免得多跳一次
    signupUrl: 'https://platform.kimi.com/console/api-keys',
    docsUrl: 'https://platform.kimi.com/docs',
    note: '国内直连，长上下文见长，按量计费需先充值；Key 在开放平台控制台创建',
    extraEnv: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '1048576', CLAUDE_CODE_EFFORT_LEVEL: 'max' },
  },
  // Kimi Code 是月之暗面的**包月订阅**产品，和上面的开放平台按量计费是两套东西：
  // 端点不同（api.kimi.com/coding）、Key 不同（kimi.com/code 控制台单独创建）、模型名也不同
  // （kimi-for-coding / k3 …）。官方明确两者 Key 不通用，混用报 401 invalid_authentication_error。
  // ⚠ 不能像小米那样按 Key 前缀自动区分——两边都是 sk- 开头，所以只能单列一个服务商让用户自己选。
  kimicode: {
    anthropicBase: 'https://api.kimi.com/coding',
    chatBase: 'https://api.kimi.com/coding/v1',
    modelsUrl: 'https://api.kimi.com/coding/v1/models',
    label: 'Kimi Code（包月订阅）',
    signupUrl: 'https://www.kimi.com/code/console',
    docsUrl: 'https://www.kimi.com/code/docs/',
    note: '已买 Kimi Code 月卡的选这个；Key 要在 kimi.com/code 控制台单独建，和开放平台的 Key 不通用（都是 sk- 开头，别拿错）',
  },
};

// 第三方服务商 id 列表（唯一来源：PROVIDERS 的键，新增服务商只需改 PROVIDERS）
export const THIRD_PARTY_PROVIDERS = Object.keys(PROVIDERS) as Exclude<EngineProvider, 'official' | 'custom'>[];

// 某字符串是否为合法服务商 id
export function isProvider(v: unknown): v is EngineProvider {
  return v === 'official' || v === 'custom' || (typeof v === 'string' && v in PROVIDERS);
}

const DEFAULT: EnginesConfig = {
  claude: { provider: 'official', apiKey: '', model: '', effort: '' },
  codex: { provider: 'official', apiKey: '', model: '', effort: '' },
};

// 空槽（每个服务商的出厂设置）
function emptySlot(): ProviderSlot {
  return { apiKey: '', model: '', effort: '' };
}

export class EngineConfigStruct {
  // 读取配置：把「当前选中服务商」那一槽投影成扁平视图。
  // 所有下游（ClaudeRunner / CodexRunner / ModelManager / 前端）都读这个投影，
  // 因此换服务商后绝不可能看到别的服务商的 Key / 模型 / 候选列表。
  static get(): EnginesConfig {
    const file = this._readFile();
    return {
      claude: this._project(file.claude),
      codex: this._project(file.codex),
    };
  }

  // 读取全部服务商的槽（供前端「换服务商即回显该服务商自己上次的设置」）
  static slots(engine: keyof EnginesConfig): Partial<Record<EngineProvider, ProviderSlot>> {
    this._assertEngine('slots', engine);
    return this._readFile()[engine].slots;
  }

  // 把「当前选中服务商」的槽投影成扁平视图
  private static _project(entry: EngineFileEntry): EngineProviderConfig {
    const provider = entry.provider;
    const slot = entry.slots[provider] || emptySlot();
    return {
      provider,
      // official 没有 API Key 的概念——投影时强制清空，
      // 免得任何下游（含 claudeEnv/codexUpstream）误把第三方 Key 用在原版上。
      apiKey: provider === 'official' ? '' : slot.apiKey || '',
      model: slot.model || '',
      effort: isEffort(slot.effort) ? (slot.effort as EffortLevel) || '' : '',
      baseUrl: provider === 'custom' ? slot.baseUrl || '' : '',
      modelsUrl: provider === 'custom' ? slot.modelsUrl || '' : '',
      models: Array.isArray(slot.models) ? slot.models : undefined,
      detected: slot.detected,
    };
  }

  private static _assertEngine(who: string, engine: unknown): void {
    if (engine !== 'claude' && engine !== 'codex')
      throw new Error(`${who}: invalid engine=${engine}`);
  }

  // 更新某引擎的服务商配置；只写「该服务商自己那一槽」，其余服务商的设置原样保留。
  // 写盘后应用 claude 环境变量到本进程。
  static setProvider(engine: keyof EnginesConfig, cfg: EngineProviderConfig): EnginesConfig {
    this._assertEngine('setProvider', engine);
    const provider = cfg?.provider;
    if (!isProvider(provider))
      throw new Error(`setProvider: invalid provider=${provider}（可选 official/${THIRD_PARTY_PROVIDERS.join('/')}）`);
    if (provider !== 'official' && (!cfg.apiKey || !cfg.apiKey.trim()))
      throw new Error(`setProvider: ${provider} 需要填写 API Key`);
    if (provider === 'custom') this._assertUrl(cfg.baseUrl, 'Base URL');
    // 无兜底模型：claude 走第三方端点时必须选定真实模型，否则 claude 会按 sonnet 别名请求 → 对方 404
    if (engine === 'claude' && provider !== 'official' && !(cfg.model || '').trim())
      throw new Error(`setProvider: ${provider} 需要先「拉取模型」并选定一个模型`);
    if (!isEffort(cfg.effort))
      throw new Error(`setProvider: invalid effort=${cfg.effort}`);

    const file = this._readFile();
    const entry = file[engine];
    const prevSlot = entry.slots[provider] || emptySlot();
    // 候选列表随「Key / Base URL」变化而失效（换了账号 → 可用模型可能不同），
    // 同一服务商同一 Key 则保留缓存，免得每次保存都要重新拉一遍。
    const apiKey = provider === 'official' ? '' : (cfg.apiKey || '').trim();
    const baseUrl = provider === 'custom' ? this._cleanUrl(cfg.baseUrl || '') : '';
    const keyChanged = prevSlot.apiKey !== apiKey || (prevSlot.baseUrl || '') !== baseUrl;

    entry.provider = provider;
    entry.slots[provider] = {
      apiKey,
      model: (cfg.model || '').trim(),
      effort: (cfg.effort || '') as EffortLevel,
      baseUrl: provider === 'custom' ? baseUrl : undefined,
      modelsUrl: provider === 'custom' && cfg.modelsUrl ? this._cleanUrl(cfg.modelsUrl) : undefined,
      models: keyChanged ? undefined : prevSlot.models,
      detected: keyChanged ? undefined : prevSlot.detected,
    };
    this._writeFile(file);
    this.applyEnv();
    return this.get();
  }

  // 只改「选定模型」，不动服务商/apiKey。'' = 自动（由引擎自己决定）。写入当前服务商的槽。
  static setModel(engine: keyof EnginesConfig, model: string): EnginesConfig {
    this._assertEngine('setModel', engine);
    if (typeof model !== 'string') throw new Error(`setModel: invalid model=${model}`);
    this._patchSlot(engine, (slot) => ({ ...slot, model: model.trim() }));
    this.applyEnv();
    return this.get();
  }

  // 只改「思考强度」。'' = 自动（不传 --effort / model_reasoning_effort）。写入当前服务商的槽。
  static setEffort(engine: keyof EnginesConfig, effort: string): EnginesConfig {
    this._assertEngine('setEffort', engine);
    if (!isEffort(effort))
      throw new Error(
        `setEffort: invalid effort=${effort}（可选 ''(自动)/${EFFORT_LEVELS.map((e) => e.id).join('/')}）`,
      );
    this._patchSlot(engine, (slot) => ({ ...slot, effort: (effort || '') as EffortLevel }));
    this.applyEnv();
    return this.get();
  }

  // 缓存检测结果（候选列表 / 当前模型），供前端下拉与状态展示。写入当前服务商的槽，
  // 因此 MiniMax 的候选列表绝不会出现在原版下。
  static setCache(
    engine: keyof EnginesConfig,
    patch: { models?: ModelOption[]; detected?: ModelDetect },
  ): EnginesConfig {
    this._assertEngine('setCache', engine);
    this._patchSlot(engine, (slot) => ({
      ...slot,
      models: patch.models !== undefined ? patch.models : slot.models,
      detected: patch.detected !== undefined ? patch.detected : slot.detected,
    }));
    return this.get();
  }

  // 对「当前选中服务商」那一槽做局部更新（唯一的槽写入通道）
  private static _patchSlot(
    engine: keyof EnginesConfig,
    fn: (slot: ProviderSlot) => ProviderSlot,
  ): void {
    const file = this._readFile();
    const entry = file[engine];
    entry.slots[entry.provider] = fn(entry.slots[entry.provider] || emptySlot());
    this._writeFile(file);
  }

  // 解析某服务商在**这把 Key** 下实际要用的三个 base。
  // 端点不能只看服务商：小米 MiMo 的订阅 Key（tp-）与按量 Key（sk-）走不同域名且互不通用，
  // 用错域名会直接鉴权失败。official / custom 不走内置端点表 → 返回 null 由调用方处理。
  private static _bases(provider: EngineProvider, apiKey: string): ProviderMeta | null {
    if (provider === 'official' || provider === 'custom') return null;
    const meta = PROVIDERS[provider];
    if (!meta) return null;
    const sub = meta.subscription;
    if (!sub || !String(apiKey || '').trim().startsWith(sub.keyPrefix)) return meta;
    return { ...meta, anthropicBase: sub.anthropicBase, chatBase: sub.chatBase, modelsUrl: sub.modelsUrl };
  }

  // 当前 claude 服务商对应的托管环境变量（official / 未填 Key → 空对象＝全部清除）
  static claudeEnv(): Record<string, string> {
    const cfg = this.get().claude;
    if (cfg.provider === 'official') return {};
    const meta = this._bases(cfg.provider, cfg.apiKey);
    const baseUrl = cfg.provider === 'custom' ? cfg.baseUrl : meta?.anthropicBase;
    if (!baseUrl || !cfg.apiKey) return {};
    const env: Record<string, string> = {
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_AUTH_TOKEN: cfg.apiKey,
      ...(meta?.extraEnv || {}),
    };
    // 用户显式选了思考强度 → 覆盖服务商 extraEnv 里写死的那个（如 kimi 的 max）。
    // 命令行 `--effort` 也会传同一个值，两处保持一致。
    if (cfg.effort) env.CLAUDE_CODE_EFFORT_LEVEL = cfg.effort;
    if (!cfg.model) return env;
    return {
      ...env,
      ANTHROPIC_MODEL: cfg.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: cfg.model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: cfg.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: cfg.model,
      ANTHROPIC_DEFAULT_FABLE_MODEL: cfg.model,
      CLAUDE_CODE_SUBAGENT_MODEL: cfg.model,
    };
  }

  // codex 侧的思考强度取值（''=自动/不传）。codex 的 model_reasoning_effort 只认
  // low/medium/high，所以 claude 的 xhigh/max 按 EFFORT_LEVELS 映射降级到 high。
  static codexEffort(): string {
    const effort = this.get().codex.effort;
    if (!effort) return '';
    const meta = EFFORT_LEVELS.find((e) => e.id === effort);
    return meta ? meta.codex : '';
  }

  static codexUpstream(): { baseUrl: string; apiKey: string; model: string; label: string } {
    const cfg = this.get().codex;
    if (cfg.provider === 'official') throw new Error('Codex 当前使用原版 ChatGPT，无第三方上游');
    const meta = this._bases(cfg.provider, cfg.apiKey);
    const baseUrl = cfg.provider === 'custom' ? cfg.baseUrl || '' : meta?.chatBase || '';
    if (!baseUrl || !cfg.apiKey || !cfg.model)
      throw new Error('Codex 第三方服务商缺少 Base URL、API Key 或模型');
    return {
      baseUrl: this._cleanUrl(baseUrl),
      apiKey: cfg.apiKey,
      model: cfg.model,
      label: meta?.label || '自定义服务商',
    };
  }

  // 应用 claude 服务商配置：注入本进程环境（spawn 的 claude 子进程继承）
  // + 同步写 ~/.claude/settings.json 的 env 段（用户直接开终端跑 claude 也一致）。
  // official → 两处的托管键都清除，回到订阅登录流程。
  static applyEnv(): void {
    const env = this.claudeEnv();
    EnvHelper.applyManaged(process.env, MANAGED_ENV_KEYS, env);
    this._syncClaudeSettings(env);
    const codex = this.get().codex;
    if (codex.provider !== 'official' && codex.apiKey)
      process.env.CLAUDE_HUB_CODEX_API_KEY = codex.apiKey;
    else
      delete process.env.CLAUDE_HUB_CODEX_API_KEY;
    this._syncCodexConfig(codex);
  }

  // 实时拉取某服务商模型列表（OpenAI 兼容 /v1/models）。
  // 不做任何内置兜底：Key 错/网络不通/返回空 → 直接抛错让用户改 Key，避免拿假列表去跑。
  static async listModels(
    provider: EngineProvider,
    apiKey: string,
    baseUrl = '',
    modelsUrl = '',
  ): Promise<string[]> {
    if (provider === 'official')
      throw new Error('listModels: official（原版订阅）无需选择模型');
    // 端点随 Key 走（订阅 Key 与按量 Key 不同域名），所以要把 apiKey 一起交给 _bases
    const meta = this._bases(provider, apiKey);
    if (provider !== 'custom' && !meta) throw new Error(`listModels: invalid provider=${provider}`);
    if (!apiKey || !apiKey.trim()) throw new Error('listModels: 需要填写 API Key 才能拉取模型列表');
    if (provider === 'custom') this._assertUrl(baseUrl, 'Base URL');
    const url = provider === 'custom'
      ? (modelsUrl ? this._cleanUrl(modelsUrl) : `${this._cleanUrl(baseUrl)}/models`)
      : meta!.modelsUrl;
    const ids = await this._fetchModels(url, apiKey.trim());
    if (!ids.length)
      throw new Error(
        `listModels: ${provider} 返回了空模型列表——请确认这个 API Key 属于该服务商且已开通模型权限`,
      );
    return ids;
  }

  // 在服务商 API 真实返回的模型 id 里挑一个作默认（供前端「换服务商即自动选模型」）。
  // 规则：先按该服务商的 preferModels 顺序找子串命中，都没命中就用 API 返回的第一个。
  // ⚠ 不引入任何写死的兜底模型名——ids 为空就返回 ''，由调用方按「没有可用模型」处理。
  static pickDefaultModel(provider: EngineProvider, ids: string[]): string {
    if (!Array.isArray(ids) || !ids.length) return '';
    const meta = provider === 'official' || provider === 'custom' ? null : PROVIDERS[provider];
    for (const want of meta?.preferModels || []) {
      const hit = ids.find((id) => id.toLowerCase().includes(want.toLowerCase()));
      if (hit) return hit;
    }
    return ids[0];
  }

  // 供前端「新手引导 / 设置」展示的服务商清单（含开通链接与说明）
  static providerList(): Array<{ id: EngineProvider } & Partial<ProviderMeta>> {
    return [
      {
        id: 'official' as EngineProvider,
        label: '原版（官方订阅登录）',
        note: '用已有的 Claude / ChatGPT 账号登录，不需要 API Key',
        signupUrl: 'https://claude.com/claude-code',
        docsUrl: 'https://docs.claude.com/en/docs/claude-code/overview',
      },
      ...THIRD_PARTY_PROVIDERS.map((id) => ({ id: id as EngineProvider, ...PROVIDERS[id] })),
      {
        id: 'custom' as EngineProvider,
        label: '自定义服务商',
        note: '填写兼容 Base URL、模型列表 URL 与 API Key',
      },
    ];
  }

  // 读盘并归一化成分槽结构（兼容旧版扁平格式）
  private static _readFile(): EnginesFile {
    const raw = this._read() as any;
    return {
      claude: this._normalizeEntry(raw?.claude),
      codex: this._normalizeEntry(raw?.codex),
    };
  }

  // 归一化一个引擎条目。
  // **向后兼容**：旧版 engines.json 是扁平的 `{provider, apiKey, model, models, detected}`，
  // 所有服务商共用一份字段（正是「选原版却看到 MiniMax 模型」的根因）。
  // 迁移策略：把旧的那一份数据**只归到它当时选中的那个服务商槽**里；
  // 若旧记录是 official 却带着第三方 Key/模型缓存（历史脏数据），一并丢弃——
  // official 槽永远不该有 Key，模型候选也应由内置清单重新生成。
  private static _normalizeEntry(raw: any): EngineFileEntry {
    const provider: EngineProvider = isProvider(raw?.provider) ? raw.provider : 'official';
    const slots: Partial<Record<EngineProvider, ProviderSlot>> = {};

    if (raw && typeof raw === 'object' && raw.slots && typeof raw.slots === 'object') {
      for (const [k, v] of Object.entries(raw.slots as Record<string, any>)) {
        if (!isProvider(k) || !v || typeof v !== 'object') continue;
        slots[k] = this._normalizeSlot(k as EngineProvider, v);
      }
    } else if (raw && typeof raw === 'object') {
      // 旧版扁平结构 → 迁移到当前服务商那一槽
      slots[provider] = this._normalizeSlot(provider, raw);
    }
    if (!slots[provider]) slots[provider] = emptySlot();
    return { provider, slots };
  }

  private static _normalizeSlot(provider: EngineProvider, v: any): ProviderSlot {
    const isOfficial = provider === 'official';
    // official 槽强制无 Key：历史脏数据（official 却存着第三方 Key）在这里被清掉
    const apiKey = isOfficial ? '' : String(v.apiKey || '');
    let models = Array.isArray(v.models) ? (v.models as ModelOption[]) : undefined;
    let model = String(v.model || '');
    if (isOfficial) {
      // `source:'api'` 的候选只可能来自第三方 /v1/models —— 原版永远不该有。
      // 这是「选原版却在下拉里看到 MiniMax / 小米模型」的最后一道闸：
      // 无论是旧版扁平脏数据还是别处写歪，读出来就被过滤掉。
      const legit = (models || []).filter((m) => m && m.source !== 'api');
      models = legit.length ? legit : undefined;
      // 选定模型若来自第三方候选（不在剩余候选里、且这条记录带过第三方 Key）→ 一并丢弃
      if (model && v.apiKey && !legit.some((m) => m.id === model)) model = '';
    }
    return {
      apiKey,
      model,
      effort: isEffort(v.effort) ? ((v.effort || '') as EffortLevel) : '',
      baseUrl: provider === 'custom' ? String(v.baseUrl || '') : undefined,
      modelsUrl: provider === 'custom' ? String(v.modelsUrl || '') : undefined,
      models,
      detected: v.detected,
    };
  }

  // ── IO 钩子（Realize 实现）──
  // 返回落盘的原始 JSON（可能是旧的扁平结构，由 _normalizeEntry 兼容处理）
  protected static _read(): EnginesConfig | null {
    throw new Error('Not implemented');
  }
  protected static _write(_c: EnginesConfig): void {
    throw new Error('Not implemented');
  }
  // 写入分槽结构。默认转调 _write（Realize 里两者都落到同一个文件）。
  protected static _writeFile(c: EnginesFile): void {
    this._write(c as unknown as EnginesConfig);
  }
  // 拉取模型 id 列表（Realize 用 HttpJson 实现）
  protected static _fetchModels(_url: string, _apiKey: string): Promise<string[]> {
    throw new Error('Not implemented');
  }
  // 把托管环境变量同步进 ~/.claude/settings.json 的 env 段（Realize 实现读改写）
  protected static _syncClaudeSettings(_env: Record<string, string>): void {
    throw new Error('Not implemented');
  }
  protected static _syncCodexConfig(_cfg: EngineProviderConfig): void {
    throw new Error('Not implemented');
  }

  private static _cleanUrl(url: string): string {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  private static _assertUrl(url: unknown, label: string): void {
    const value = this._cleanUrl(String(url || ''));
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new Error(`${label} 不是有效 URL`); }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      throw new Error(`${label} 只支持 http/https`);
  }

  static DEFAULT = DEFAULT;
}
