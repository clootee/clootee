// 访问鉴权（调度骨架）。密码由用户首次安装时自行设定，持久化为 {salt, hash}。
// token = 存储的 hash 本身（= sha256(密码 + 盐)），跨重启稳定；客户端持久保存，一次登录长期免登。
// 具体文件 IO（读写 auth.json、生成随机盐）由 Realize 实现。
import { Hash } from '../helper/Hash';

export interface AuthRecord {
  salt: string;
  hash: string;
}

export class AuthManagerStruct {
  // 是否尚未设定密码（首次安装 → 前端引导用户设定）
  static needsSetup(): boolean {
    return this._read() === null;
  }

  // 新手引导（设定密码之前）需要访问的接口白名单（相对 /api 的路径）。
  // 顺序：先走完引导（语言/主题/引擎/服务商/模型）→ 最后才设定密码，故这些接口必须在无 token 时可用。
  static readonly SETUP_OPEN_PATHS: string[] = [
    '/settings',
    '/engine/status',
    '/engine/providers',
    '/engine/models',
    '/engine/update',
    '/engine/config',
    '/codex/key',
    '/codex/profile',
    // 引导第一步就是网络体检（没网/连不上 Claude 时先给出路），必须在设密码之前可用
    '/net/check',
    '/net/quick',
    // 引导里的「登录 Claude 账号」整套流程（起流程 / 拿链接 / 交授权码 / 放弃）
    '/claude/auth/status',
    '/claude/auth/session',
    '/claude/auth/login',
    '/claude/auth/code',
    '/claude/auth/cancel',
    // 引导里缺什么装什么（Node / Git / 引擎）
    '/toolchain/status',
    '/toolchain/install',
  ];

  // 是否属于「尚未设定密码期间」可免鉴权的引导接口。
  // 只有 needsSetup()（此时任何人都能 POST /api/auth/setup 接管本实例）才放开，设定密码后立即收紧。
  static isOpenDuringSetup(path: string): boolean {
    if (typeof path !== 'string' || !path)
      throw new Error(`isOpenDuringSetup: invalid path=${path}`);
    return this.needsSetup() && this.SETUP_OPEN_PATHS.indexOf(path) >= 0;
  }

  // 首次设定密码：仅在尚未设定时允许；返回登录 token
  static setup(password: string): string {
    if (this._read() !== null)
      throw new Error('setup: 密码已设定，不能重复初始化');
    if (!password || password.length < 4)
      throw new Error('setup: 密码至少 4 位');
    const salt = this._genSalt();
    const hash = Hash.sha256(password + '::' + salt);
    this._write({ salt, hash });
    return hash;
  }

  // 校验密码，正确则返回长期有效的 token
  static login(password: string): string {
    if (!password) throw new Error('login: empty password');
    const rec = this._read();
    if (!rec) throw new Error('login: 尚未设定密码，请先初始化');
    const hash = Hash.sha256(password + '::' + rec.salt);
    if (!Hash.equals(hash, rec.hash)) throw new Error('login: invalid password');
    return rec.hash;
  }

  // 修改密码：需先验证旧密码
  static changePassword(oldPassword: string, newPassword: string): string {
    this.login(oldPassword); // 旧密码不对会抛错
    if (!newPassword || newPassword.length < 4) throw new Error('changePassword: 新密码至少 4 位');
    const salt = this._genSalt();
    const hash = Hash.sha256(newPassword + '::' + salt);
    this._write({ salt, hash });
    return hash;
  }

  // 重置密码（忘记旧密码用）：不校验旧密码，仅供已通过鉴权（持有有效 token）的调用者使用。
  // 安全性依赖路由层的鉴权中间件——能调到这里说明已是本机授权用户。
  static resetPassword(newPassword: string): string {
    if (this._read() === null) throw new Error('resetPassword: 尚未设定密码，请先初始化');
    if (!newPassword || newPassword.length < 4) throw new Error('resetPassword: 新密码至少 4 位');
    const salt = this._genSalt();
    const hash = Hash.sha256(newPassword + '::' + salt);
    this._write({ salt, hash });
    return hash;
  }

  // 命令行强制设定/修改密码：无论是否已设定都直接覆盖，不校验旧密码。
  // 仅供本机命令行（authctl）调用——能执行到本机命令行即视为最高权限，用于「忘记密码/被锁在外面」时救急。
  static cliSetPassword(newPassword: string): string {
    if (!newPassword || newPassword.length < 4) throw new Error('cliSetPassword: 新密码至少 4 位');
    const salt = this._genSalt();
    const hash = Hash.sha256(newPassword + '::' + salt);
    this._write({ salt, hash });
    return hash;
  }

  // 解除密码锁定：删除已设定的密码，恢复到「尚未设定」状态（needsSetup=true）。
  // 之后前端重新走引导设定新密码；仅供本机命令行救急，避免忘记密码后彻底无法访问。
  // 返回是否确实删除了记录（原本无密码则返回 false）。
  static clear(): boolean {
    if (this._read() === null) return false;
    this._delete();
    return true;
  }

  // 当前有效 token（= 存储的 hash）；未设定时返回空串（一律校验不过）
  static token(): string {
    const rec = this._read();
    return rec ? rec.hash : '';
  }

  // 校验客户端提交的 token 是否有效
  static verify(token: string | undefined): boolean {
    if (!token) return false;
    const rec = this._read();
    if (!rec) return false;
    return Hash.equals(token, rec.hash);
  }

  // ── IO 钩子（Realize 实现）──
  protected static _read(): AuthRecord | null {
    throw new Error('Not implemented');
  }
  protected static _write(_rec: AuthRecord): void {
    throw new Error('Not implemented');
  }
  protected static _genSalt(): string {
    throw new Error('Not implemented');
  }
  protected static _delete(): void {
    throw new Error('Not implemented');
  }
}
