// 入口：启动 HTTP + WebSocket 服务
import { Server } from './server/Server';
import { Logger } from './helper/Logger';
import { EventBus } from './helper/EventBus';
import { CodexProfile } from './logic_realize/CodexProfile';
import { KimiProxy } from './logic_realize/KimiProxy';
import { EngineConfig } from './logic_realize/EngineConfig';
import { TaskQueue } from './logic_realize/TaskQueue';
import { Toolchain } from './logic_realize/Toolchain';

// 后端级异常：既写日志，也推到界面。否则用户只看到"点了没反应"，日志在服务器上没人会去翻。
function reportFatal(kind: string, e: unknown): void {
  Logger.error('Process', kind, e);
  const message = e instanceof Error ? `${e.message}` : String(e);
  EventBus.broadcast({ kind: 'serverError', message: `后端异常（${kind}）：${message}` });
}
process.on('uncaughtException', (e) => reportFatal('uncaughtException', e));
process.on('unhandledRejection', (e) => reportFatal('unhandledRejection', e));

// 按「运行环境」面板的偏好组装 PATH：选了内置 node / git 时，spawn 出去的子进程才能命中它们。
try {
  Toolchain.applyPath();
} catch (e) {
  Logger.warn('Process', 'toolchain applyPath on boot failed', e);
}

// 启动时把已保存的 Kimi 密钥注入进程环境，供 spawn 的 codex 子进程读取 KIMI_API_KEY。
try {
  CodexProfile.status();
} catch (e) {
  Logger.warn('Process', 'codex profile status on boot failed', e);
}

// 启动时应用 claude 服务商配置（minimax/kimi → 注入 ANTHROPIC_* 环境变量；official → 清除覆盖）。
try {
  EngineConfig.applyEnv();
} catch (e) {
  Logger.warn('Process', 'engine config applyEnv on boot failed', e);
}

// 启动 Kimi 转译代理（codex kimi provider 指向它；始终运行，仅在 kimi 档位下被使用）。
try {
  KimiProxy.start();
} catch (e) {
  Logger.warn('Process', 'kimi proxy start failed', e);
}

// 恢复上次持久化的任务队列，并继续执行重启前排队的 pending 任务。
try {
  TaskQueue.restoreAndResume();
} catch (e) {
  Logger.warn('Process', 'task queue restore failed', e);
}

Server.start();
