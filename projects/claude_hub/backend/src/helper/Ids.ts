// ID 生成工具（业务无关）
import { randomUUID } from 'crypto';

export class Ids {
  // 标准 UUID（用于 claude --session-id）
  static uuid(): string {
    return randomUUID();
  }

  // 短 ID（用于任务、消息等内部标识）
  static short(prefix = ''): string {
    const s = randomUUID().replace(/-/g, '').slice(0, 12);
    return prefix ? `${prefix}_${s}` : s;
  }
}
