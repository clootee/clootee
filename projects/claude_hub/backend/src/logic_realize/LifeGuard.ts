// 服务生命周期看护（实现）：真正去挂信号钩子、跑心跳、查端口占用、写 lifecycle.log。
// 调度顺序全在 LifeGuardStruct，这里只填实现细节。
import * as os from 'os';
import { LifeGuardStruct, HEARTBEAT_MS, WATCHED_SIGNALS } from '../logic_struct/LifeGuardStruct';
import { PortOwner } from '../helper/PortOwner';
import { Logger } from '../helper/Logger';

export class LifeGuard extends LifeGuardStruct {
  protected static _logBoot(port: number): void {
    Logger.life('▶ 服务启动', {
      pid: process.pid,
      ppid: process.ppid,
      port,
      node: process.version,
      platform: `${process.platform} ${os.release()}`,
      user: os.userInfo().username,
      cwd: process.cwd(),
      // 上次是怎么没的，看上一段日志的结尾：有 ⏹ 就是正常收到信号退出，
      // 什么都没有（直接断在 ♥ 心跳上）＝进程被强杀 / 整机断电 / 蓝屏。
      hint: '若上次没有 ⏹ 退出行，说明是被强杀或整机掉电，不是服务自己崩的',
    });
  }

  protected static _logEvent(line: string): void {
    Logger.life(line);
  }

  protected static _logPortOwner(port: number): void {
    try {
      Logger.life(PortOwner.describe(port));
    } catch (e) {
      Logger.life(`（查询端口 ${port} 占用者失败：${e instanceof Error ? e.message : String(e)}）`);
    }
  }

  protected static _hookSignals(): void {
    for (const sig of WATCHED_SIGNALS) {
      try {
        process.on(sig as NodeJS.Signals, () => {
          // 关机 / 注销 / Ctrl-C 都走 SIGINT，pm2 stop 和 kill 走 SIGTERM——记下来才分得清。
          this.reportShutdown('signal', `收到信号 ${sig}（pid=${process.pid}）`);
          process.exit(0);
        });
      } catch {
        /* 平台不支持该信号（如 Linux 上没有 SIGBREAK），跳过即可 */
      }
    }
    process.on('exit', (code) => this.reportShutdown('exit', `进程退出，code=${code}`));
  }

  protected static _startHeartbeat(port: number): void {
    const timer = setInterval(() => {
      try {
        this.beat(port);
      } catch (e) {
        Logger.warn('LifeGuard', 'heartbeat failed', e);
      }
    }, HEARTBEAT_MS);
    // 心跳不应拖住进程退出
    timer.unref();
  }

  protected static _ownsPort(port: number): boolean {
    try {
      return PortOwner.isOwnedBy(port, process.pid);
    } catch {
      // 查不了就别误报「端口易主」，当作正常
      return true;
    }
  }

  protected static _usage(): string {
    const rss = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const up = Math.round(process.uptime());
    return `内存=${rss}MB 已运行=${up}s`;
  }
}
