// 通用哈希工具（业务无关）
import { createHash, timingSafeEqual } from 'crypto';

export class Hash {
  // sha256 十六进制
  static sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  // 定长安全比较，避免时序攻击
  static equals(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
