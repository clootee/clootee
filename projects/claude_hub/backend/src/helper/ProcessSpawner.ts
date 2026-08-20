// 通用子进程工具（业务无关）：按行流式读取 stdout，提供 kill 句柄
import { spawn, ChildProcess } from 'child_process';

export interface SpawnHandle {
  child: ChildProcess;
  kill: () => void;
}

export interface SpawnCallbacks {
  onLine: (line: string) => void;       // stdout 每一行
  onStderr?: (chunk: string) => void;   // stderr 原始片段
  onExit: (code: number | null) => void;
  onError: (err: Error) => void;
  // 启动后长时间「stdout / stderr 都没有任何输出」时触发一次（进程仍活着）。
  // 用于把"发了消息什么都不回、也不报错"的卡死场景暴露到界面，而不是无限等待。
  onStartupSilence?: (elapsedMs: number) => void;
}

export class ProcessSpawner {
  static run(
    command: string,
    args: string[],
    cwd: string,
    cb: SpawnCallbacks,
    stdinInput?: string, // 若提供，写入子进程 stdin（避免命令行参数的引号/空格问题）
    useShell: boolean = process.platform === 'win32', // 是否经 shell 启动（默认沿用旧行为）
    startupSilenceMs = 0, // >0 时启用「启动后零输出」看门狗；0=不监控
  ): SpawnHandle {
    // 注意：shell:true 时参数仅被拼接、不转义，含换行/引号的参数（如 --append-system-prompt）
    // 会破坏命令行、丢失后续参数。调用方应尽量传入可直接执行的可执行文件并令 useShell=false。
    const child = spawn(command, args, {
      cwd,
      shell: useShell,
      windowsHide: true,
      env: process.env,
    });

    if (stdinInput !== undefined) {
      // 进程启动失败/秒退时写 stdin 会在流上抛 EPIPE；没有监听器会变成 uncaughtException
      // 让整个后端悄悄挂掉（表现就是"发消息没反应"）。真正的失败原因由 error/close 回调上报。
      child.stdin?.on('error', () => undefined);
      child.stdin?.write(stdinInput);
      child.stdin?.end();
    }

    // 「启动后零输出」看门狗：首次拿到任何输出、或进程结束时解除
    const startedAt = Date.now();
    let silenceTimer: NodeJS.Timeout | null =
      startupSilenceMs > 0
        ? setTimeout(() => {
            silenceTimer = null;
            cb.onStartupSilence?.(Date.now() - startedAt);
          }, startupSilenceMs)
        : null;
    const clearSilence = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = null;
    };

    let buffer = '';
    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      clearSilence();
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) cb.onLine(line);
      }
    });

    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => {
      clearSilence();
      cb.onStderr?.(chunk);
    });

    child.on('error', (err) => {
      clearSilence();
      cb.onError(err);
    });
    child.on('close', (code) => {
      clearSilence();
      const tail = buffer.trim();
      if (tail) cb.onLine(tail);
      cb.onExit(code);
    });

    return {
      child,
      // 停止：尽量用"原生中断"——等价于在终端按 Ctrl+C/ESC，让 claude 优雅收尾；
      // 超时仍未退出再强制结束。跨平台分别处理。
      kill: () => {
        try {
          if (process.platform === 'win32' && child.pid) {
            // Windows 无法投递 SIGINT：先 taskkill /t（请求结束进程树），3s 后未退出再 /f 强杀
            spawn('taskkill', ['/pid', String(child.pid), '/t'], { windowsHide: true });
            setTimeout(() => {
              if (child.exitCode === null && !child.killed && child.pid) {
                try {
                  spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
                } catch {
                  /* 已退出 */
                }
              }
            }, 3000);
          } else {
            // Unix：先 SIGINT（= Ctrl+C 原生中断），3s 后未退出再 SIGKILL 强杀
            child.kill('SIGINT');
            setTimeout(() => {
              if (child.exitCode === null && !child.killed) {
                try {
                  child.kill('SIGKILL');
                } catch {
                  /* 已退出 */
                }
              }
            }, 3000);
          }
        } catch {
          /* 进程可能已退出 */
        }
      },
    };
  }
}
