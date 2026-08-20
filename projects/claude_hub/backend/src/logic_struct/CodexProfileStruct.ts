// Codex 档位切换（调度骨架）：在「原版 ChatGPT」与「Kimi K3」之间切换本地 codex 的 config.toml。
// 只负责调度：读现状 → 校验 → 变换文本 → 落盘 → 注入密钥到进程环境。
// 具体 IO（读写 config.toml、读写密钥文件、取 config 路径）由 Realize 实现；纯文本变换在 CodexTomlHelper。
import { CodexTomlHelper, CodexProfileName } from '../helper/CodexTomlHelper';
import { AppConfig } from '../config/AppConfig';

export interface CodexProfileStatus {
  profile: CodexProfileName; // 当前生效档位
  configPath: string;        // config.toml 绝对路径
  configExists: boolean;     // 文件是否存在
  hasKimiKey: boolean;       // 是否已保存 kimi 密钥
  kimiKeyMasked: string | null; // 脱敏后的密钥（仅用于展示）
  ok: boolean;               // 读取/解析是否成功
  error: string | null;      // 失败时的原因（如实展示在页面）
}

export class CodexProfileStruct {
  // 读取当前状态；即便 config 读取失败也返回结构化结果（ok=false + error），不抛出。
  static status(): CodexProfileStatus {
    const configPath = this._tomlPath();
    const key = this._readKey();
    this._applyEnv(key);
    let profile: CodexProfileName = 'chatgpt';
    let configExists = false;
    let ok = true;
    let error: string | null = null;
    try {
      const text = this._readToml();
      configExists = text !== null;
      profile = CodexTomlHelper.detectProfile(text || '');
    } catch (e) {
      ok = false;
      error = e instanceof Error ? e.message : String(e);
    }
    return {
      profile,
      configPath,
      configExists,
      hasKimiKey: !!key,
      kimiKeyMasked: this._mask(key),
      ok,
      error,
    };
  }

  // 切换档位：切到 kimi 时必须已保存密钥；写盘失败时抛出（路由层转成 success:false + error 展示）。
  static setProfile(profile: CodexProfileName): CodexProfileStatus {
    if (profile !== 'chatgpt' && profile !== 'kimi')
      throw new Error(`setProfile: invalid profile=${profile}`);
    const key = this._readKey();
    if (profile === 'kimi' && !key)
      throw new Error('setProfile: 尚未配置 Kimi API Key，无法切换到 Kimi K3。请先在设置中填写密钥。');
    const existing = this._readToml() || '';
    const next = CodexTomlHelper.render(existing, profile, `http://127.0.0.1:${AppConfig.KIMI_PROXY_PORT}/v1`);
    this._writeToml(next);
    this._applyEnv(key);
    return this.status();
  }

  // 保存/更新 Kimi 密钥（校验前缀），并注入到当前进程环境供 codex 子进程读取。
  static setKimiKey(key: string): CodexProfileStatus {
    if (!key || typeof key !== 'string' || !key.trim())
      throw new Error('setKimiKey: 密钥不能为空');
    const trimmed = key.trim();
    if (!/^sk-/.test(trimmed))
      throw new Error(`setKimiKey: 密钥格式不正确（应以 sk- 开头），got=${trimmed.slice(0, 6)}…`);
    this._writeKey(trimmed);
    this._applyEnv(trimmed);
    return this.status();
  }

  private static _mask(key: string | null): string | null {
    if (!key) return null;
    return key.length <= 10 ? '****' : `${key.slice(0, 6)}…${key.slice(-4)}`;
  }

  // 把密钥注入到本进程环境；claude-hub spawn codex 时 env 沿用 process.env，故 codex 能读到 KIMI_API_KEY。
  private static _applyEnv(key: string | null): void {
    if (key) process.env.KIMI_API_KEY = key;
  }

  // ── IO 钩子（Realize 实现）──
  protected static _tomlPath(): string {
    throw new Error('Not implemented');
  }
  protected static _readToml(): string | null {
    throw new Error('Not implemented');
  }
  protected static _writeToml(_text: string): void {
    throw new Error('Not implemented');
  }
  protected static _readKey(): string | null {
    throw new Error('Not implemented');
  }
  protected static _writeKey(_key: string): void {
    throw new Error('Not implemented');
  }
}
