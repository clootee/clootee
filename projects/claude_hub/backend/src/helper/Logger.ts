// 统一日志输出（含文件 I/O）。禁止在其他地方直接 console.*
import * as fs from 'fs';
import * as path from 'path';
import { LogConfig, LogLevel } from '../config/LogConfig';

const ORDER: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export class Logger {
  static debug(module: string, message: string, data?: unknown): void {
    this._write('DEBUG', module, message, data);
  }
  static info(module: string, message: string, data?: unknown): void {
    this._write('INFO', module, message, data);
  }
  static warn(module: string, message: string, data?: unknown): void {
    this._write('WARN', module, message, data);
  }
  static error(module: string, message: string, error?: unknown): void {
    this._write('ERROR', module, message, error);
  }

  private static _write(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (!LogConfig.ENABLED) return;
    if (ORDER[level] < ORDER[LogConfig.MIN_LEVEL]) return;
    if (LogConfig.MODULE_FILTER.length > 0 && !LogConfig.MODULE_FILTER.includes(module)) return;

    const ts = new Date().toISOString();
    const extra = data === undefined ? '' : ' ' + this._safe(data);
    const line = `[${ts}] [${level}] [${module}] ${message}${extra}`;
    // eslint-disable-next-line no-console
    console.log(line);
    if (LogConfig.FILE_ENABLED) this._toFile(line);
  }

  private static _safe(data: unknown): string {
    try {
      if (typeof data === 'string') return data;
      // Error 的 message/stack 是不可枚举属性，JSON.stringify(err) 只会得到 "{}"，
      // 结果就是日志里一行 uncaughtException {} ——什么线索都没有。必须手动摊平。
      if (data instanceof Error) return `${data.name}: ${data.message}\n${data.stack || ''}`;
      return JSON.stringify(data) ?? String(data);
    } catch {
      return String(data);
    }
  }

  private static _toFile(line: string): void {
    try {
      fs.mkdirSync(path.dirname(LogConfig.FILE_PATH), { recursive: true });
      fs.appendFileSync(LogConfig.FILE_PATH, line + '\n');
    } catch {
      /* 文件写入失败不应影响主流程 */
    }
  }
}
