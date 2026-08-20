// 日志配置（开关、级别、模块过滤、文件路径）
import * as path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export const LogConfig = {
  ENABLED: true,
  MIN_LEVEL: 'INFO' as LogLevel,
  MODULE_FILTER: [] as string[],
  FILE_ENABLED: true,
  FILE_PATH: path.resolve(__dirname, '../../../data/logs/app.log'),
};
