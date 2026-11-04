// 日志配置（开关、级别、模块过滤、文件路径）
import * as path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export const LogConfig = {
  ENABLED: true,
  MIN_LEVEL: 'INFO' as LogLevel,
  MODULE_FILTER: [] as string[],
  FILE_ENABLED: true,
  // 控制台副本：只在真的挂在终端上时才写（有人当场看着）。
  // 后台常驻运行时 stdout 被重定向进文件，没人看，而且那个文件没有任何轮转，
  // 每行再抄一份就会把它撑到无限大——日志反而变成新的故障源。
  // 启动器需要显式表态时用 CLOOTEE_LOG_CONSOLE=1/0 覆盖（Windows 后台启动会设 0）。
  CONSOLE_ENABLED: ((): boolean => {
    const forced = process.env.CLOOTEE_LOG_CONSOLE;
    if (forced === '1') return true;
    if (forced === '0') return false;
    return Boolean(process.stdout.isTTY);
  })(),
  FILE_PATH: path.resolve(__dirname, '../../../data/logs/app.log'),
  // 生命周期日志：只记「服务起来了 / 被谁停了 / 端口被谁占了 / 还活着」这几类事件。
  // 单独成文件，是为了让「服务半夜挂了」这种事故能一眼看完，不必在几 MB 的 app.log 里翻。
  LIFECYCLE_PATH: path.resolve(__dirname, '../../../data/logs/lifecycle.log'),
};
