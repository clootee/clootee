// Claude 执行器（调度骨架）：对单个任务调用本地 claude CLI，流式解析事件
// 不负责排队/调度，只负责"运行一个任务并把事件吐出去"
import { ProcessSpawner, SpawnHandle } from '../helper/ProcessSpawner';
import { ClaudeBin } from '../helper/ClaudeBin';
import { RunDiag, RunDiagInput } from '../helper/RunDiag';
import { AppConfig } from '../config/AppConfig';
import { Logger } from '../helper/Logger';
import { Session } from '../models/Types';
import { Settings } from '../logic_realize/Settings';
import { Toolchain } from '../logic_realize/Toolchain';
import { TraceInput } from './TraceStoreStruct';

// 执行器上报的轨迹事件：taskId 由队列侧补（执行器不关心任务编号）
export type RunTrace = Omit<TraceInput, 'taskId'>;

// 运行期回调：thinking/tool/output 属于过程视图；final 是最终消息文本
export interface RunCallbacks {
  onThinking: (text: string) => void;
  onTool: (name: string, detail: string) => void;
  onOutput: (text: string) => void;
  onFinal: (text: string) => void;
  onDone: (success: boolean, error?: string) => void;
  // 运行中的异常提示（不结束任务）：如「启动 45 秒仍无任何输出」。
  // 直接送到界面上显示——静默卡死时用户至少知道发生了什么，而不是对着空白干等。
  onNotice?: (level: 'warn' | 'error', message: string) => void;
  // 全过程轨迹：每个引擎事件都原样上报（不截断），由 TraceStore 落盘。
  // 与上面几个回调的分工：onThinking/onTool/onOutput 是给实时过程面板看的压缩视图，
  // onEvent 是给"回看/分析工作过程"用的完整数据，两者都发，互不影响。
  onEvent?: (ev: RunTrace) => void;
  // claude 实际使用的 session_id（从 stream-json 读回）。可能与传入的不同（id 冲突/版本差异），
  // 用于回写校正，保证 hub 记录的 id 与真实 jsonl 文件名一致（否则查不到历史/重复显示）。
  onSessionId?: (id: string) => void;
}

export class ClaudeRunnerStruct {
  // ── 调度骨架：execute ──────────────────────────────────────────────
  // this._buildArgs       → 组装 claude CLI 参数（realize，依赖会话状态）
  // ProcessSpawner.run    → 在根目录下启动 claude 子进程，按行流式回调
  // this._parseLine       → 把一行 stream-json 解析并分发到回调（realize）
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

    // 解析真实可执行文件：Windows 下把 claude.cmd 解析成 claude.exe/`node cli.js` 并用 shell:false，
    // 避免含换行/引号的 --append-system-prompt 在 shell 拼接时截断命令、丢掉 --resume（会话分裂根因）。
    // 用本机版还是内置版由「运行环境」面板的偏好决定（默认本机优先，本机没有才用内置）。
    const { bin, prefixArgs, useShell } = ClaudeBin.resolve(
      AppConfig.CLAUDE_BIN,
      Toolchain.preferBundled('claude'),
    );
    const args = [...prefixArgs, ...cliArgs];

    // 启动前记录完整上下文：命令、参数、工作目录、prompt 摘要、会话状态
    Logger.info('ClaudeRunner', 'execute start', {
      sessionId: session.id,
      bin,
      useShell,
      args,
      cwd: rootPath,
      resume: !!session.claudeSessionId,
      claudeSessionId: session.claudeSessionId,
      promptLen: prompt.length,
      promptHead: prompt.slice(0, 120),
    });

    // 累积 stderr，便于失败时一次性记录真实报错原因
    let stderrBuf = '';
    let sawOutput = false; // 是否收到过任何输出（用于判定「跑完了却一声不吭」）
    const startedAt = Date.now();
    // 诊断上下文：所有报错都带上它，用户一眼能看出跑的是哪个 claude、在哪跑的
    const diag = (extra: Partial<RunDiagInput>) =>
      RunDiag.format({ bin, args, cwd: rootPath, ...extra });

    // prompt 通过 stdin 传入，避免命令行参数在 Windows shell 下被空格截断
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
          Logger.warn('ClaudeRunner', 'stderr', { sessionId: session.id, chunk });
          cb.onOutput(`[stderr] ${chunk}`);
          cb.onEvent?.({ kind: 'stderr', text: chunk, engine: session.engine });
        },
        // 启动后长时间零输出：进程还活着，但界面上什么都没有 → 主动把现场信息推给用户
        onStartupSilence: (elapsedMs) => {
          Logger.warn('ClaudeRunner', 'no output since start', {
            sessionId: session.id,
            bin,
            cwd: rootPath,
            elapsedMs,
          });
          cb.onNotice?.(
            'warn',
            `claude 已启动 ${Math.round(elapsedMs / 1000)} 秒，但没有任何输出。\n` +
              diag({ elapsedMs, hint: AppConfig.ENGINE_SILENT_HINT }),
          );
        },
        onExit: (code) => {
          const stderr = stderrBuf.trim();
          const elapsedMs = Date.now() - startedAt;
          // 退出码 0 却全程零输出 = 静默失败（内置 node/引擎装坏、被安全软件拦下都是这个表现）。
          // 绝不能当成功，否则界面上就是「发了消息什么都没有、也不报错」。
          if (code === 0 && !sawOutput) {
            Logger.error('ClaudeRunner', 'exit 0 without any output', {
              sessionId: session.id,
              bin,
              cwd: rootPath,
            });
            cb.onDone(
              false,
              `claude 退出码 0，但全程没有任何输出。\n` +
                diag({ exitCode: code, elapsedMs, hint: AppConfig.ENGINE_SILENT_HINT }),
            );
            return;
          }
          if (code === 0) {
            Logger.info('ClaudeRunner', 'execute done', { sessionId: session.id, code });
            cb.onDone(true);
            return;
          }
          Logger.error('ClaudeRunner', 'execute failed', {
            sessionId: session.id,
            code,
            cwd: rootPath,
            stderr: stderr.slice(0, 2000),
          });
          // 失败时把真实 stderr 与完整命令上下文一并带回前端，而不仅是 exit code
          cb.onDone(
            false,
            `claude 执行失败。\n` +
              diag({ exitCode: code, elapsedMs, stderr, hint: stderr ? '' : AppConfig.ENGINE_SILENT_HINT }),
          );
        },
        onError: (err) => {
          Logger.error('ClaudeRunner', 'spawn error', {
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

  // 组装 claude 参数：已有会话且其 jsonl 真实存在 → --resume 续接（绝不 --fork-session）；
  // 否则当首跑（不传 --resume），让 claude 生成新 id 再从 stream-json 回读校正。
  protected static _buildArgs(_session: Session, _rootPath: string): string[] {
    throw new Error('Not implemented');
  }

  // 解析一行 stream-json，分发到对应回调
  protected static _parseLine(_line: string, _cb: RunCallbacks): void {
    throw new Error('Not implemented');
  }
}
