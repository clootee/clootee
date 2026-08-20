// 会话工具命令执行（实现）：填充上下文组装、claude 输出聚合、临时会话清理
import { CommandRunnerStruct, CommandContext } from '../logic_struct/CommandRunnerStruct';
import { CommandSpec } from '../config/CommandsConfig';
import { SessionManager } from './SessionManager';
import { RootManager } from './RootManager';
import { ClaudeRunner } from './ClaudeRunner';
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { Logger } from '../helper/Logger';
import { Session } from '../models/Types';

export class CommandRunner extends CommandRunnerStruct {
  protected static _resolveContext(sessionId: string, spec: CommandSpec): CommandContext {
    const session = SessionManager.getSession(sessionId);
    // 斜杠命令是 Claude Code 的概念，codex 引擎不适用
    if (session.engine !== 'claude') {
      throw new Error(`命令「${spec.slash}」仅支持 Claude Code 引擎的会话`);
    }
    const rootPath = RootManager.getRoot(session.rootId).path;

    if (spec.needsSession) {
      // 依赖当前对话上下文（如 /compact）：必须有真实 jsonl 才能 --resume 续接执行
      const started =
        !!session.claudeSessionId && ClaudeStoreHelper.sessionExists(rootPath, session.claudeSessionId);
      if (!started) {
        throw new Error(`命令「${spec.slash}」需要一个已经开始对话的会话`);
      }
      return { session, rootPath, throwaway: false };
    }

    // 与对话无关的独立命令（如 /usage）：剥掉会话 id 让 claude 新建临时会话，
    // 跑完由 _cleanup 删除其 jsonl，避免在会话列表里留下一条垃圾会话。
    return { session: { ...session, claudeSessionId: '' }, rootPath, throwaway: true };
  }

  protected static _exec(
    session: Session,
    rootPath: string,
    slash: string,
    timeoutMs: number,
  ): Promise<{ output: string; realSessionId: string }> {
    return new Promise((resolve) => {
      const textParts: string[] = []; // assistant 文本块（如 /compact 的提示 / 摘要）
      const errParts: string[] = []; // stderr
      let resultText = ''; // result 事件的最终文本（如 /usage 的用量信息）
      let realSessionId = '';
      let settled = false;
      let timer: NodeJS.Timeout;

      const finish = (fallbackErr?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // 反馈优先级：result 文本 > assistant 文本 > stderr > 兜底错误信息
        const output =
          resultText.trim() ||
          textParts.join('').trim() ||
          errParts.join('').trim() ||
          (fallbackErr || '').trim();
        resolve({ output, realSessionId });
      };

      // 复用 ClaudeRunner.execute（参数组装 / stream-json 解析全一致），只是把回调用于收集而非广播
      const handle = ClaudeRunner.execute(session, rootPath, slash, {
        onThinking: () => {},
        onTool: () => {},
        onOutput: () => {},
        onFinal: () => {},
        onSessionId: (id) => {
          if (id) realSessionId = id;
        },
        onEvent: (ev) => {
          if (ev.kind === 'result' && ev.text) resultText = ev.text;
          else if (ev.kind === 'text' && ev.text) textParts.push(ev.text);
          else if (ev.kind === 'stderr' && ev.text) errParts.push(ev.text);
        },
        onDone: (success, error) => finish(success ? undefined : error),
      });

      // 安全超时：超时则杀掉进程并返回已收集到的输出（时长由命令自身指定，/compact 等长任务更宽松）
      timer = setTimeout(() => {
        Logger.warn('CommandRunner', 'slash command timeout, killing', { slash, timeoutMs });
        try {
          handle.kill();
        } catch {
          /* 进程可能已退出 */
        }
        finish('命令执行超时');
      }, timeoutMs);
    });
  }

  protected static _cleanup(rootPath: string, realSessionId: string): void {
    if (!realSessionId) return;
    ClaudeStoreHelper.removeSessionFile(rootPath, realSessionId);
    Logger.info('CommandRunner', 'cleaned throwaway session jsonl', { rootPath, realSessionId });
  }
}
