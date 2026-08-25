// Codex 登录（调度骨架）：和 ClaudeLoginStruct 是同一道坎，同一套解法——网页里全程可完成登录。
//
// 实测（codex-cli 0.149.1）：
//   `codex login`             起本地回调服务器（localhost:1455），要求浏览器和 codex 在同一台机器，
//                             部署在服务器上时用户的浏览器根本连不到它，行不通。
//   `codex login --device-auth` 才是服务器场景该用的：
//     打印一条固定链接 https://auth.openai.com/codex/device + 一个一次性短码（如 BBF5-ELZ6R），
//     用户在任意设备的浏览器里打开链接、手动填入短码即可，不需要往 codex 进程里写任何东西——
//     进程自己在后台轮询，用户填完码后自动退出（code 0=成功）。这比 claude 的「粘授权码回来」更简单。
//   `codex login --with-api-key` 则是从 stdin 读一个 API Key 直接落地，不需要打开浏览器——
//     对应「不用 ChatGPT 订阅、直接付费用量」的场景。
//   `codex login status` 用退出码判断：0=已登录，非 0 且 stderr 含 "Not logged in"=未登录。
//     没有 --json，拿不到结构化邮箱/套餐信息，只能把原始输出如实展示。
//
// 具体 IO（spawn codex、读 stdout、写 stdin）由 Realize 实现。
import { AuthUrl } from '../helper/AuthUrl';

export type LoginPhase =
  | 'idle'        // 没有进行中的登录
  | 'starting'    // 进程已起，还没拿到链接/短码
  | 'awaitAuth'   // 已拿到链接和短码，等用户在浏览器里填完（chatgpt 模式全自动，不需要粘任何东西回来）
  | 'submitting'  // apiKey 模式：已把密钥写进去，等 codex 落盘
  | 'done'
  | 'failed'
  | 'canceled';

// chatgpt=订阅登录（浏览器 device-auth，推荐，通常比按量计费的 API Key 更省钱）
// apiKey =直接使用 OpenAI API Key 按量计费，不需要 ChatGPT 账号
export type LoginMode = 'chatgpt' | 'apiKey';

export interface CodexAuthStatus {
  cliFound: boolean;
  cliPath: string;
  loggedIn: boolean;
  raw: string;       // codex login status 的原始输出（没有结构化字段，如实展示）
  provider: string;  // 当前 codex 档位（official=原版 ChatGPT，其余为第三方，如 kimi）
  error?: string;
}

export interface CodexLoginSession {
  phase: LoginPhase;
  mode: LoginMode;
  url: string;              // 授权链接
  code: string;             // 一次性短码（chatgpt 模式才有；apiKey 模式恒为空）
  message: string;          // 当前该让用户做什么（一句话）
  log: string[];            // codex 的原始输出
  error: string;
  startedAt: number;
}

// 等链接+短码出现的上限。codex 起进程很快，10 秒足够。
export const LOGIN_URL_TIMEOUT_MS = 20000;
// chatgpt 模式：等用户在浏览器里填完短码、进程自动退出的上限（给够时间去邮箱之类的操作）。
export const LOGIN_AUTH_TIMEOUT_MS = 15 * 60 * 1000;
// apiKey 模式：写完密钥等 codex 落盘的上限。
export const LOGIN_FINISH_TIMEOUT_MS = 30000;

export class CodexLoginStruct {
  // ── 当前登录态（纯读，不会启动任何登录流程）──
  static async status(): Promise<CodexAuthStatus> {
    const bin = this._binInfo();
    const provider = this._provider();
    if (!bin.found) return { cliFound: false, cliPath: '', loggedIn: false, raw: '', provider };
    const raw = await this._authStatus();
    return { cliFound: true, cliPath: bin.path, loggedIn: raw.loggedIn, raw: raw.raw, provider, error: raw.error };
  }

  // ── 开始登录 ──
  // mode='chatgpt'：起 device-auth 流程，等到链接+短码就返回（不阻塞到登录完成，完成态靠推送/轮询）。
  // mode='apiKey' ：apiKey 必填，写进去后一路等到 codex 落盘再返回。
  static async start(mode: LoginMode = 'chatgpt', apiKey = ''): Promise<CodexLoginSession> {
    if (mode !== 'chatgpt' && mode !== 'apiKey')
      throw new Error(`CodexLoginStruct.start: invalid mode=${mode}`);
    const bin = this._binInfo();
    if (!bin.found)
      throw new Error('CodexLoginStruct.start: codex 命令未找到，请先在「运行环境」里安装 Codex');
    if (mode === 'apiKey' && !apiKey.trim())
      throw new Error('CodexLoginStruct.start: apiKey 模式必须提供 API Key');
    this._killProc();
    this._reset(mode);
    if (mode === 'apiKey') {
      this._spawnApiKey(apiKey.trim());
      await this._waitExit(LOGIN_FINISH_TIMEOUT_MS);
      return this.session();
    }
    this._spawnChatgpt();
    await this._waitUrl(LOGIN_URL_TIMEOUT_MS);
    return this.session();
  }

  // ── 当前登录流程快照（前端轮询用；同时也会经 WebSocket 实时推送）──
  static session(): CodexLoginSession {
    return this._snapshot();
  }

  // ── 放弃登录 ──
  static cancel(): CodexLoginSession {
    this._killProc();
    this._markCanceled();
    return this.session();
  }

  // 用户粘回来的短码里如果混进了链接，直接挡下来，提示放错地方
  protected static _rejectIfLink(value: string, who: string): void {
    if (AuthUrl.isLink(value))
      throw new Error(`${who}: 这是一个链接不是短码（${value.slice(0, 60)}…）`);
  }

  // ── Realize 实现点 ──
  protected static _binInfo(): { found: boolean; path: string } {
    throw new Error('CodexLoginStruct._binInfo: Not implemented');
  }
  protected static _provider(): string {
    throw new Error('CodexLoginStruct._provider: Not implemented');
  }
  protected static _authStatus(): Promise<{ loggedIn: boolean; raw: string; error?: string }> {
    throw new Error('CodexLoginStruct._authStatus: Not implemented');
  }
  protected static _reset(_mode: LoginMode): void {
    throw new Error('CodexLoginStruct._reset: Not implemented');
  }
  protected static _spawnChatgpt(): void {
    throw new Error('CodexLoginStruct._spawnChatgpt: Not implemented');
  }
  protected static _spawnApiKey(_key: string): void {
    throw new Error('CodexLoginStruct._spawnApiKey: Not implemented');
  }
  protected static _waitUrl(_timeoutMs: number): Promise<void> {
    throw new Error('CodexLoginStruct._waitUrl: Not implemented');
  }
  protected static _waitExit(_timeoutMs: number): Promise<void> {
    throw new Error('CodexLoginStruct._waitExit: Not implemented');
  }
  protected static _killProc(): void {
    throw new Error('CodexLoginStruct._killProc: Not implemented');
  }
  protected static _markCanceled(): void {
    throw new Error('CodexLoginStruct._markCanceled: Not implemented');
  }
  protected static _snapshot(): CodexLoginSession {
    throw new Error('CodexLoginStruct._snapshot: Not implemented');
  }
}
