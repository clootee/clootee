// 访问鉴权（实现）：读写 data/auth.json + 生成随机盐。
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuthManagerStruct, AuthRecord } from '../logic_struct/AuthManagerStruct';
import { Paths } from '../paths';

export class AuthManager extends AuthManagerStruct {
  protected static _read(): AuthRecord | null {
    try {
      if (!fs.existsSync(Paths.AUTH_FILE)) return null;
      const j = JSON.parse(fs.readFileSync(Paths.AUTH_FILE, 'utf8'));
      if (j && typeof j.salt === 'string' && typeof j.hash === 'string') return j as AuthRecord;
      return null;
    } catch {
      return null;
    }
  }

  protected static _write(rec: AuthRecord): void {
    fs.mkdirSync(path.dirname(Paths.AUTH_FILE), { recursive: true });
    fs.writeFileSync(Paths.AUTH_FILE, JSON.stringify(rec, null, 2), 'utf8');
  }

  protected static _genSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  protected static _delete(): void {
    if (fs.existsSync(Paths.AUTH_FILE)) fs.unlinkSync(Paths.AUTH_FILE);
  }
}
