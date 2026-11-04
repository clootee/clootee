// 服务生命周期看护（调度骨架）：回答事故发生后最难查的三个问题——
//   ① 服务是什么时候没的？          → 心跳日志（最后一条心跳＝服务最后活着的时刻）
//   ② 是被谁停的？                  → 信号/退出钩子（SIGINT=关机或 Ctrl-C，SIGTERM=被 kill/pm2 停）
//   ③ 端口被谁抢了？                → 绑定失败 & 端口易主时，把占用方的 pid/进程名/命令行写进日志
// 只做调度，实际的 process.on / setInterval / 查端口 / 写日志全在 Realize。
export type ExitReason = 'signal' | 'exit' | 'fatal';

// 心跳间隔：60 秒。太密会把日志刷爆，太疏则事故时间点定位不准；
// 60 秒意味着「最后一条心跳 + 1 分钟」内就是服务断掉的时刻，足够对上系统事件日志。
export const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS) || 60_000;

// 进程收到这些信号时都应留一句话再走。SIGBREAK/SIGHUP 仅部分平台有，Realize 负责按平台过滤。
export const WATCHED_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK', 'SIGQUIT'] as const;
export type WatchedSignal = (typeof WATCHED_SIGNALS)[number];

export class LifeGuardStruct {
  // 启动看护：记一条开机行 → 挂上信号/退出钩子 → 开始心跳。
  static install(port: number): void {
    if (!Number.isFinite(port) || port <= 0)
      throw new Error(`LifeGuardStruct.install: invalid port=${port}`);
    this._logBoot(port);
    this._hookSignals();
    this._startHeartbeat(port);
  }

  // 端口绑定失败（EADDRINUSE 等）：这是「页面打不开」最常见的直接原因，必须点名占用者。
  static reportBindFailure(port: number, error: unknown): void {
    if (!Number.isFinite(port) || port <= 0)
      throw new Error(`LifeGuardStruct.reportBindFailure: invalid port=${port}`);
    const message = error instanceof Error ? error.message : String(error);
    this._logEvent(`❌ 端口 ${port} 绑定失败：${message}`);
    this._logPortOwner(port);
  }

  // 进程即将退出：把「谁让我退的」记下来。signal 为空表示自然退出。
  static reportShutdown(reason: ExitReason, detail: string): void {
    if (!reason) throw new Error(`LifeGuardStruct.reportShutdown: invalid reason=${reason}`);
    this._logEvent(`⏹ 服务退出（${reason}）：${detail}`);
  }

  // 一次心跳：确认端口还在自己手上。易主说明服务是被别人顶掉的，而不是自己崩的。
  static beat(port: number): void {
    if (!Number.isFinite(port) || port <= 0)
      throw new Error(`LifeGuardStruct.beat: invalid port=${port}`);
    if (this._ownsPort(port)) {
      this._logEvent(`♥ 存活 端口=${port} ${this._usage()}`);
      return;
    }
    this._logEvent(`⚠ 端口 ${port} 已不在本进程名下——服务可能被别的程序顶掉了`);
    this._logPortOwner(port);
  }

  // ── 钩子（Realize 实现）──
  protected static _logBoot(_port: number): void {
    throw new Error('Not implemented');
  }
  protected static _logEvent(_line: string): void {
    throw new Error('Not implemented');
  }
  protected static _logPortOwner(_port: number): void {
    throw new Error('Not implemented');
  }
  protected static _hookSignals(): void {
    throw new Error('Not implemented');
  }
  protected static _startHeartbeat(_port: number): void {
    throw new Error('Not implemented');
  }
  protected static _ownsPort(_port: number): boolean {
    throw new Error('Not implemented');
  }
  protected static _usage(): string {
    throw new Error('Not implemented');
  }
}
