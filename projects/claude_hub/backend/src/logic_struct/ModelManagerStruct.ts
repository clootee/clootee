// 模型选择（调度骨架）：让用户为 claude / codex 各自选定模型，默认「自动」（完全交给引擎）。
//
// 三个能力：
//   state()      —— 当前选择 + 缓存的候选列表 + 上次检测结果
//   detect()     —— 检测「当前实际生效的模型」（真实探测，不猜）
//   available()  —— 检测「有哪些模型可用」，结果写回候选列表供前端下拉
//
// 各引擎的真实探测手段（实测确认，见 mem.md）：
//   claude：`-p --output-format stream-json --verbose` 的首个 system/init 帧带 `model` 字段，
//           且是**解析后的全名**（`--model haiku` → `claude-haiku-4-5-20251001`）。
//           拿到 init 帧即杀进程，不产生模型调用、几乎零开销。
//           ⚠️ init 帧不校验模型是否真实存在（传 bogus 也会原样回显），所以"可用性"另说。
//   claude 可用列表：原版订阅没有列表接口 → 用内置候选清单（verified 留空）；
//           第三方服务商 → 走 OpenAI 兼容 /v1/models（EngineConfig.listModels）。
//           可选 verify：对每个候选发起一次极小的真实调用，按是否报错判定（慢、有极小用量）。
//   codex：`codex debug models` 直接输出**真实模型目录 JSON**（slug/display_name/...）。
//           当前生效模型 = ~/.codex/config.toml 的 `model =`，缺失则取目录里 priority 最高的。
//
// 具体 IO（spawn 引擎、读 config.toml、HTTP）由 Realize 实现。
import { Engine, EngineModelState, ModelDetect, ModelOption, ModelsState } from '../models/Types';
import { EngineConfig } from '../logic_realize/EngineConfig';
import { EFFORT_LEVELS } from './EngineConfigStruct';

// 原版 claude 的内置候选：别名（会被 CLI 解析成最新全名）+ 常用全名。
// 只作为下拉候选，不代表账号一定有权限；真实可用性由 verify 或 detect 确认。
export const CLAUDE_BUILTIN_MODELS: ModelOption[] = [
  { id: 'opus', label: 'opus（别名→最新 Opus）', source: 'builtin' },
  { id: 'sonnet', label: 'sonnet（别名→最新 Sonnet）', source: 'builtin' },
  { id: 'haiku', label: 'haiku（别名→最新 Haiku）', source: 'builtin' },
  { id: 'fable', label: 'fable（别名→最新 Fable）', source: 'builtin' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', source: 'builtin' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', source: 'builtin' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', source: 'builtin' },
  { id: 'claude-fable-5', label: 'Claude Fable 5', source: 'builtin' },
];

export class ModelManagerStruct {
  // ── 当前状态（纯读，绝不触发探测）──
  static state(): ModelsState {
    return { claude: this._one('claude'), codex: this._one('codex') };
  }

  // ── 选定模型（''=自动）──
  static setModel(engine: Engine, model: string): ModelsState {
    this._assertEngine('setModel', engine);
    EngineConfig.setModel(engine, model || '');
    return this.state();
  }

  // ── 选定思考强度（''=自动）──
  static setEffort(engine: Engine, effort: string): ModelsState {
    this._assertEngine('setEffort', engine);
    EngineConfig.setEffort(engine, effort || '');
    return this.state();
  }

  // ── 检测当前实际生效的模型 ──
  static async detect(engine: Engine): Promise<ModelDetect> {
    this._assertEngine('detect', engine);
    const selected = this._one(engine).selected;
    const r = engine === 'claude' ? await this._detectClaude(selected) : await this._detectCodex(selected);
    EngineConfig.setCache(engine, { detected: r });
    return r;
  }

  // ── 检测可用模型；写回候选列表 ──
  // verify=true 时对每个候选做一次真实极小调用来确认（仅 claude 原版有意义，较慢）。
  static async available(engine: Engine, verify = false): Promise<ModelOption[]> {
    this._assertEngine('available', engine);
    const opts =
      engine === 'claude' ? await this._availableClaude(verify) : await this._availableCodex();
    const merged = this._mergeDetected(opts, this._one(engine).detected);
    EngineConfig.setCache(engine, { models: merged });
    return merged;
  }

  // 把「实测当前模型」并入候选（否则用户可能在下拉里看不到自己正在用的那个）
  private static _mergeDetected(opts: ModelOption[], d?: ModelDetect): ModelOption[] {
    if (!d || !d.ok || !d.model) return opts;
    if (opts.some((o) => o.id === d.model)) return opts;
    // 展示名不在这里拼（前端按 source==='detected' 加「当前实际」后缀，文案随语言走）
    return [{ id: d.model, source: 'detected', verified: true }, ...opts];
  }

  // 当前状态取自 EngineConfig.get() 的**投影视图**（只含当前服务商那一槽），
  // 所以 options/selected 绝不会混进别的服务商的模型。
  private static _one(engine: Engine): EngineModelState {
    const c = EngineConfig.get()[engine];
    return {
      engine,
      provider: c.provider,
      selected: c.model || '',
      effort: c.effort || '',
      efforts: EFFORT_LEVELS.map((e) => ({ id: e.id, label: e.label })),
      options: c.models || [],
      detected: c.detected,
    };
  }

  private static _assertEngine(who: string, engine: Engine): void {
    if (engine !== 'claude' && engine !== 'codex')
      throw new Error(`${who}: invalid engine=${engine}`);
  }

  // ── Realize 钩子 ──
  protected static _detectClaude(_selected: string): Promise<ModelDetect> {
    throw new Error('Not implemented');
  }
  protected static _detectCodex(_selected: string): Promise<ModelDetect> {
    throw new Error('Not implemented');
  }
  protected static _availableClaude(_verify: boolean): Promise<ModelOption[]> {
    throw new Error('Not implemented');
  }
  protected static _availableCodex(): Promise<ModelOption[]> {
    throw new Error('Not implemented');
  }
}
