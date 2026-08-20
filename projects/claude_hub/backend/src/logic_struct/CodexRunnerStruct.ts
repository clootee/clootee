// Codex 执行器（调度骨架）：对单个任务调用本地 codex CLI（codex exec --json），流式解析事件。
// 与 ClaudeRunnerStruct 对称：只负责"运行一个任务并把事件吐出去"，不负责排队/调度。
import { ProcessSpawner, SpawnHandle } from '../helper/ProcessSpawner';
import { CodexBin } from '../helper/CodexBin';
import { RunDiag, RunDiagInput } from '../helper/RunDiag';
import { AppConfig } from '../config/AppConfig';
import { Logger } from '../helper/Logger';
import { Session } from '../models/Types';
import { RunCallbacks } from './ClaudeRunnerStruct';
import { Settings } from '../logic_realize/Settings';
import { Toolchain } from '../logic_realize/Toolchain';

export class CodexRunnerStruct {
  // ── 调度骨架：execute ──
  static execute(
    session: Session,
    rootPath: string,
    prompt: string,
    cb: RunCallbacks,
  ): SpawnHandle {
    if (!session || !session.id) throw new Error('execute: invalid session');
    if (!rootPath) throw new Error(`execute: invalid rootPath=${rootPath}`);
    if (!prompt || !prompt.trim()) throw new Error('execute: empty prompt');

    const cliArgs = this._buildArgs(session, rootPath);
    const { bin, prefixArgs, useShell } = CodexBin.resolve(
      AppConfig.CODEX_BIN,
      Toolchain.preferBundled('codex'),
    );
    const args = [...prefixArgs, ...cliArgs];

    Logger.info('CodexRunner', 'execute start', {
      sessionId: session.id,
      bin,
      args,
      cwd: rootPath,
      resume: !!session.claudeSessionId,
      codexSessionId: session.claudeSessionId,
      promptLen: prompt.length,
      promptHead: prompt.slice(0, 120),
    });

    let stderrBuf = '';
    let sawOutput = false; // 是否收到过任何输出（用于判定「跑完了却一声不吭」）
    const startedAt = Date.now();
    // 诊断上下文：所有报错都带上它，用户一眼能看出跑的是哪个 codex、在哪跑的
    const diag = (extra: Partial<RunDiagInput>) =>
      RunDiag.format({ bin, args, cwd: rootPath, ...extra });

    // prompt 通过 stdin 传入（args 里用 '-' 占位），避免命令行参数被 shell 截断
    return ProcessSpawner.run(
      bin,
      args,
      rootPath,
      {
        onLine: (line) => {
          sawOutput = true;
          this._parseLine(line, cb);
        },
        onStderr: (chunk) => {
          sawOutput = true;
          stderrBuf += chunk;
          Logger.warn('CodexRunner', 'stderr', { sessionId: session.id, chunk });
          cb.onOutput(`[stderr] ${chunk}`);
        },
        // 启动后长时间零输出：进程还活着，但界面上什么都没有 → 主动把现场信息推给用户
        onStartupSilence: (elapsedMs) => {
          Logger.warn('CodexRunner', 'no output since start', {
            sessionId: session.id,
            bin,
            cwd: rootPath,
            elapsedMs,
          });
          cb.onNotice?.(
            'warn',
            `codex 已启动 ${Math.round(elapsedMs / 1000)} 秒，但没有任何输出。\n` +
              diag({ elapsedMs, hint: AppConfig.ENGINE_SILENT_HINT }),
          );
        },
        onExit: (code) => {
          const stderr = stderrBuf.trim();
          const elapsedMs = Date.now() - startedAt;
          // 退出码 0 却全程零输出 = 静默失败，绝不能当成功（否则界面上什么都不显示）
          if (code === 0 && !sawOutput) {
            Logger.error('CodexRunner', 'exit 0 without any output', {
              sessionId: session.id,
              bin,
              cwd: rootPath,
            });
            cb.onDone(
              false,
              `codex 退出码 0，但全程没有任何输出。\n` +
                diag({ exitCode: code, elapsedMs, hint: AppConfig.ENGINE_SILENT_HINT }),
            );
            return;
          }
          if (code === 0) {
            Logger.info('CodexRunner', 'execute done', { sessionId: session.id, code });
            cb.onDone(true);
            return;
          }
          Logger.error('CodexRunner', 'execute failed', {
            sessionId: session.id,
            code,
            cwd: rootPath,
            stderr: stderr.slice(0, 2000),
          });
          cb.onDone(
            false,
            `codex 执行失败。\n` +
              diag({ exitCode: code, elapsedMs, stderr, hint: stderr ? '' : AppConfig.ENGINE_SILENT_HINT }),
          );
        },
        onError: (err) => {
          Logger.error('CodexRunner', 'spawn error', {
            sessionId: session.id,
            bin,
            cwd: rootPath,
            message: err.message,
          });
          cb.onDone(
            false,
            `${RunDiag.explain(err, bin)}\n工作目录：${rootPath}\n${AppConfig.ENGINE_SILENT_HINT}`,
          );
        },
      },
      prompt,
      useShell,
      AppConfig.ENGINE_SILENCE_WARN_MS,
    );
  }

  // 组装 codex 参数：已有会话 id 且其 rollout 存在 → resume 续接；否则首跑（codex 生成新 id 并经 --json 回报）
  protected static _buildArgs(_session: Session, _rootPath: string): string[] {
    throw new Error('Not implemented');
  }

  // 解析一行 codex --json 事件，分发到对应回调
  protected static _parseLine(_line: string, _cb: RunCallbacks): void {
    throw new Error('Not implemented');
  }
}
