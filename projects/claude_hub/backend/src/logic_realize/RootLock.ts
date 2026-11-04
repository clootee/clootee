// 目录私有密码：每个根目录独立一把锁。
// 设了密码的目录，其会话/文件只有携带解锁凭据（浏览器 cookie rootKeys）的请求才能访问；
// 凭据 = sha256('unlock:' + 密码哈希)，改密码后旧凭据自动失效。
import { randomBytes } from 'crypto';
import { JsonStore } from '../helper/JsonStore';
import { Hash } from '../helper/Hash';
import { Paths } from '../paths';

interface LockRec {
  salt: string;
  hash: string;
}

export class RootLock {
  private static _cache: Record<string, LockRec> | null = null;

  private static _all(): Record<string, LockRec> {
    if (!this._cache) this._cache = JsonStore.read<Record<string, LockRec>>(Paths.ROOT_LOCKS_FILE, {});
    return this._cache;
  }

  private static _save(all: Record<string, LockRec>): void {
    JsonStore.write(Paths.ROOT_LOCKS_FILE, all);
    this._cache = all;
  }

  private static _token(rec: LockRec): string {
    return Hash.sha256(`unlock:${rec.hash}`);
  }

  private static _check(rec: LockRec, password: string): boolean {
    return Hash.equals(Hash.sha256(`${rec.salt}:${password}`), rec.hash);
  }

  static isLocked(rootId: string): boolean {
    return !!rootId && !!this._all()[rootId];
  }

  // 该请求携带的凭据能否打开此目录（未加锁的目录恒为 true）
  static canAccess(rootId: string, keys: Record<string, string>): boolean {
    const rec = this._all()[rootId];
    if (!rec) return true;
    const k = keys[rootId];
    return typeof k === 'string' && Hash.equals(k, this._token(rec));
  }

  // 设置 / 修改密码：已加锁时必须给出旧密码。返回新的解锁凭据
  static setPassword(rootId: string, password: string, oldPassword?: string): { token: string } {
    if (!rootId) throw new Error('setPassword: invalid rootId');
    if (!password || password.length < 4) throw new Error('密码至少 4 位');
    const all = { ...this._all() };
    const cur = all[rootId];
    if (cur && !this._check(cur, String(oldPassword || ''))) throw new Error('旧密码不正确');
    const salt = randomBytes(16).toString('hex');
    const rec = { salt, hash: Hash.sha256(`${salt}:${password}`) };
    all[rootId] = rec;
    this._save(all);
    return { token: this._token(rec) };
  }

  // 关闭私有：需要当前密码
  static clear(rootId: string, password: string): { id: string } {
    const all = { ...this._all() };
    const cur = all[rootId];
    if (!cur) return { id: rootId };
    if (!this._check(cur, String(password || ''))) throw new Error('密码不正确');
    delete all[rootId];
    this._save(all);
    return { id: rootId };
  }

  // 输入密码解锁：返回凭据，由浏览器自己保存
  static unlock(rootId: string, password: string): { token: string } {
    const cur = this._all()[rootId];
    if (!cur) throw new Error('该目录未设置私有密码');
    if (!this._check(cur, String(password || ''))) throw new Error('密码不正确');
    return { token: this._token(cur) };
  }

  // 从 cookie 解析各目录凭据：rootKeys=<encodeURIComponent(JSON)>
  static keysFromCookie(cookie: string | undefined): Record<string, string> {
    const m = /(?:^|;\s*)rootKeys=([^;]*)/.exec(cookie || '');
    if (!m) return {};
    try {
      const obj = JSON.parse(decodeURIComponent(m[1]));
      return obj && typeof obj === 'object' ? obj : {};
    } catch {
      return {};
    }
  }
}
