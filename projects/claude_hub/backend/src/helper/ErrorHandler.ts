// 统一错误处理 + 报警扩展点。所有 catch 块必须经由此类
import { Logger } from './Logger';

export class ErrorHandler {
  static handle(error: unknown, context?: string): string {
    const message = error instanceof Error ? error.message : String(error);
    const full = context ? `${context}: ${message}` : message;
    Logger.error('ErrorHandler', full, error);
    this._alert(full, error);
    return full;
  }

  // 报警接入点：只需修改此方法即可接入钉钉/飞书/Sentry，无需改动调用方
  private static _alert(_message: string, _error: unknown): void {
    /* 预留：接入告警平台 */
  }
}
