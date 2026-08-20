// 从命令行工具的输出里把「登录授权链接」抠出来（业务无关，可独立测试）。
//
// claude auth login 在非交互终端下的真实输出（实测 claude 2.1.224）：
//   Opening browser to sign in…
//   If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=…
//   Paste code here if prompted >
// 所以做两件事：抓授权链接、判断「是不是已经在等我粘贴授权码了」。
//
// 链接可能被终端换行截断，故先把输出拼接后整体匹配，并去掉行尾可能带的标点与 ANSI 控制符。

// ANSI 颜色/光标控制序列（CLI 输出里常见，会污染 URL 与关键字匹配）
const ANSI = /\[[0-9;?]*[ -/]*[@-~]/g;

// 授权链接：任意 http(s) 链接，但必须像 oauth/授权页（避免把文档链接、更新提示当成登录链接）
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
const AUTHY = /(oauth|authorize|login|device|activate|verify)/i;

// 一眼认出「这是链接，不是授权码」。授权码形如 `xxxxx#yyyyy`，绝不会以 http 打头；
// 只要以 http(s):// 开头，就一定是把邮箱里的验证链接粘错地方了（写进 stdin 只会让登录失败）。
const LINK_HEAD_RE = /^https?:\/\//i;

// 「请粘贴授权码」的提示（中英文都可能出现）
const PASTE_RE = /(paste\s+(the\s+)?code|授权码|粘贴|enter\s+the\s+code|authorization\s+code)/i;

export class AuthUrl {
  // 去掉 ANSI 控制符，便于后续匹配与展示
  static clean(text: string): string {
    if (typeof text !== 'string') throw new Error(`AuthUrl.clean: invalid text=${text}`);
    return text.replace(ANSI, '');
  }

  // 抽取授权链接；没有则返回 ''
  static extract(text: string): string {
    if (typeof text !== 'string') throw new Error(`AuthUrl.extract: invalid text=${text}`);
    const found = this.clean(text).match(URL_RE) || [];
    for (const raw of found) {
      const url = this._trim(raw);
      if (AUTHY.test(url)) return url;
    }
    return '';
  }

  // 输出里是否已经在等用户粘贴授权码
  static awaitsCode(text: string): boolean {
    if (typeof text !== 'string') throw new Error(`AuthUrl.awaitsCode: invalid text=${text}`);
    return PASTE_RE.test(this.clean(text));
  }

  // 用户粘回来的这一串是不是链接（而不是授权码）
  static isLink(text: string): boolean {
    if (typeof text !== 'string') throw new Error(`AuthUrl.isLink: invalid text=${text}`);
    return LINK_HEAD_RE.test(this.clean(text).trim());
  }

  // 去掉链接尾部粘上的标点（句号、引号、右括号等）
  private static _trim(url: string): string {
    return url.replace(/[)\]}>.,;:'"`。，、）】]+$/, '');
  }
}
