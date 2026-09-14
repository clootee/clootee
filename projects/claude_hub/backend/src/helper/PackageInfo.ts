// 读取本软件自身 backend/package.json 的 version 字段（业务无关，纯文件读取，带缓存）。
// 前端顶部版本徽章、设置面板据此显示「当前跑的是哪个版本」，不再是写死的字符串。
import * as fs from 'fs';
import * as path from 'path';

export class PackageInfo {
  private static _cache: string | null = null;

  static version(): string {
    if (this._cache) return this._cache;
    this._cache = this._readVersion();
    return this._cache;
  }

  private static _readVersion(): string {
    try {
      const raw = fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8');
      const pkg = JSON.parse(raw);
      return typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}
