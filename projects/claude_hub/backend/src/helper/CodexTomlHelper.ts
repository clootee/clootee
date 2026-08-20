// Codex config.toml 纯文本变换工具（业务无关，可独立测试）。
// 只懂「如何在保留其余内容的前提下，切换顶层 model / model_provider 以及维护 kimi provider 块」，
// 不做任何文件 IO、不读环境、不认识"引擎/设置"等业务概念。
//
// 设计：claude-hub 只托管三样东西——
//   1) 顶层（首个 [table] 之前）的 model / model_provider / model_reasoning_effort
//   2) 由标记注释包裹的 [model_providers.kimi] 块
// 其余一切（[projects.*] / [windows] / [mcp_servers.*] / [tui.*] …）原样保留。

export type CodexProfileName = 'chatgpt' | 'kimi';

export interface CodexProfileSpec {
  model?: string;
  modelProvider?: string;
  reasoningEffort?: string;
}

export interface CodexManagedProvider {
  name: string;
  model: string;
  baseUrl: string;
}

const MARK_START = '# >>> claude-hub:kimi-provider (auto-managed, do not edit) >>>';
const MARK_END = '# <<< claude-hub:kimi-provider <<<';

export class CodexTomlHelper {
  // claude-hub 通用第三方档位：Codex 仅支持 Responses，因此 baseUrl 指向本项目内置转换代理。
  static renderProvider(existing: string, provider: CodexManagedProvider | null): string {
    const lines = this._stripManagedBlock(existing).split(/\r?\n/);
    const firstTable = lines.findIndex((l) => /^\s*\[/.test(l));
    const cut = firstTable === -1 ? lines.length : firstTable;
    const keptPre = lines.slice(0, cut).filter(
      (l) => !/^\s*(model|model_provider|model_reasoning_effort)\s*=/.test(l),
    );
    const rest = lines.slice(cut);
    const body = this._trimEdgeBlanks([...keptPre, ...rest]);
    if (!provider) return body.length ? `${body.join('\n')}\n` : '';
    const header = [
      `model = "${this._tomlString(provider.model)}"`,
      'model_provider = "claude_hub"',
      'model_reasoning_effort = "low"',
    ];
    const block = [
      MARK_START,
      '[model_providers.claude_hub]',
      `name = "${this._tomlString(provider.name)}"`,
      `base_url = "${this._tomlString(provider.baseUrl)}"`,
      'env_key = "CLAUDE_HUB_CODEX_API_KEY"',
      'wire_api = "responses"',
      MARK_END,
    ];
    return [...header, ...body, '', ...block, ''].join('\n');
  }
  // 两个内置档位的顶层键定义。chatgpt 走 codex 原生 openai provider（读 auth.json 的 ChatGPT 登录），
  // 故不写 model_provider；kimi 指向自定义 provider。
  static specOf(profile: CodexProfileName): CodexProfileSpec {
    if (profile === 'kimi')
      return { model: 'kimi-k3', modelProvider: 'kimi', reasoningEffort: 'low' };
    if (profile === 'chatgpt')
      return {};
    throw new Error(`CodexTomlHelper.specOf: unknown profile=${profile}`);
  }

  // 从现有 toml 文本判断当前档位：顶层（首个 table 前）出现 model_provider = "kimi" 即视为 kimi。
  static detectProfile(text: string): CodexProfileName {
    const pre = this._preambleLines(this._stripManagedBlock(text));
    const hit = pre.some((l) => /^\s*model_provider\s*=\s*["']kimi["']/.test(l));
    return hit ? 'kimi' : 'chatgpt';
  }

  // 生成切换到指定档位后的完整 toml 文本（保留未托管内容）。
  // kimiBaseUrl：本地 Kimi 转译代理的 base_url（含 /v1）。codex 0.141 只支持 Responses API，
  // 故 kimi provider 指向本地代理而非 Moonshot 原始域名。
  static render(
    existing: string,
    profile: CodexProfileName,
    kimiBaseUrl = 'http://127.0.0.1:8972/v1',
  ): string {
    if (profile !== 'chatgpt' && profile !== 'kimi')
      throw new Error(`CodexTomlHelper.render: invalid profile=${profile}`);
    const spec = this.specOf(profile);

    const lines = this._stripManagedBlock(existing).split(/\r?\n/);
    const firstTable = lines.findIndex((l) => /^\s*\[/.test(l));
    const cut = firstTable === -1 ? lines.length : firstTable;
    const preamble = lines.slice(0, cut);
    const rest = lines.slice(cut);

    // 丢弃 preamble 里由我们托管的顶层键，保留用户其它顶层键/注释
    const keptPre = preamble.filter(
      (l) => !/^\s*(model|model_provider|model_reasoning_effort)\s*=/.test(l),
    );

    const header: string[] = [];
    if (spec.model) header.push(`model = "${spec.model}"`);
    if (spec.modelProvider) header.push(`model_provider = "${spec.modelProvider}"`);
    if (spec.reasoningEffort) header.push(`model_reasoning_effort = "${spec.reasoningEffort}"`);

    const providerBlock = [
      MARK_START,
      '[model_providers.kimi]',
      'name = "Kimi (Moonshot)"',
      `base_url = "${kimiBaseUrl}"`,
      'env_key = "KIMI_API_KEY"',
      'wire_api = "responses"',
      MARK_END,
    ];

    const body = [...header, ...this._trimEdgeBlanks(keptPre), ...rest];
    const trimmed = this._trimEdgeBlanks(body);
    if (profile === 'chatgpt') return trimmed.length ? `${trimmed.join('\n')}\n` : '';
    return [...trimmed, '', ...providerBlock, ''].join('\n');
  }

  // ── 内部纯变换 ──
  private static _stripManagedBlock(text: string): string {
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    let skipping = false;
    for (const l of lines) {
      if (l.trim() === MARK_START) {
        skipping = true;
        continue;
      }
      if (l.trim() === MARK_END) {
        skipping = false;
        continue;
      }
      if (!skipping) out.push(l);
    }
    return out.join('\n');
  }

  private static _preambleLines(text: string): string[] {
    const lines = text.split(/\r?\n/);
    const firstTable = lines.findIndex((l) => /^\s*\[/.test(l));
    return firstTable === -1 ? lines : lines.slice(0, firstTable);
  }

  private static _trimEdgeBlanks(lines: string[]): string[] {
    let s = 0;
    let e = lines.length;
    while (s < e && lines[s].trim() === '') s++;
    while (e > s && lines[e - 1].trim() === '') e--;
    return lines.slice(s, e);
  }

  private static _tomlString(value: string): string {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }
}
