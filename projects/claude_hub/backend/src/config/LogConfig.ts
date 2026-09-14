// 日志配置（开关、级别、模块过滤、文件路径）
import * as path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export const LogConfig = {
  ENABLED: true,
  MIN_LEVEL: 'INFO' as LogLevel,
  MODULE_FILTER: [] as string[],
  FILE_ENABLED: true,
  FILE_PATH: path.resolve(__dirname, '../../../data/logs/app.log'),
  // 生命周期日志：只记「服务起来了 / 被谁停了 / 端口被谁占了 / 还活着」这几类事件。
  // 单独成文件，是为了让「服务半夜挂了」这种事故能一眼看完，不必在几 MB 的 app.log 里翻。
  LIFECYCLE_PATH: path.resolve(__dirname, '../../../data/logs/lifecycle.log'),
};
