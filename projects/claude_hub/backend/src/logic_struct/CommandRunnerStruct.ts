// 会话工具命令执行（调度骨架）：把 /usage、/compact 等原生 claude 斜杠命令跑起来，
// 收集其输出作为"反馈"返回给前端。不进任务队列、不写对话消息——这是一次性的工具命令。
//
// 调度骨架（run）：
//   CommandsConfig.get   → 白名单校验并取命令定义（config）
//   this._resolveContext → 定位会话/根目录，决定 resume 真会话还是临时一次性执行（realize）
//   this._exec           → 真正启动 claude 跑命令并聚合输出（realize）
//   this._cleanup        → 临时命令跑完删除新建 jsonl，避免污染会话列表（realize）
import { CommandsConfig, CommandSpec } from '../config/CommandsConfig';
import { Session } from '../models/Types';

export interface CommandResult {
  id: string; // 命令标识
  slash: string; // 实际执行的斜杠命令
  output: string; // 命令输出（供前端展示的反馈文本）
}

// 执行上下文：在哪个会话/目录上跑、是否临时一次性
export interface CommandContext {
  session: Session; // 传给执行器的会话（临时命令为剥掉 claudeSessionId 的副本）
  rootPath: string; // claude 工作目录
  throwaway: boolean; // true=独立一次性执行，跑完删除新建 jsonl
}

export class CommandRunnerStruct {
  static async run(sessionId: string, id: string): Promise<CommandResult> {
    if (!sessionId) throw new Error(`CommandRunner.run: invalid sessionId=${sessionId}`);
    if (!id) throw new Error(`CommandRunner.run: invalid command id=${id}`);

    const spec = CommandsConfig.get(id);
    const ctx = this._resolveContext(sessionId, spec);
    const { output, realSessionId } = await this._exec(ctx.session, ctx.rootPath, spec.slash, spec.timeoutMs);
    if (ctx.throwaway) this._cleanup(ctx.rootPath, realSessionId);
    return { id: spec.id, slash: spec.slash, output };
  }

  // 组装执行上下文：校验引擎、定位根目录、决定 resume 真会话还是临时一次性执行
  protected static _resolveContext(_sessionId: string, _spec: CommandSpec): CommandContext {
    throw new Error('Not implemented');
  }

  // 执行斜杠命令并聚合输出，回报 claude 实际使用的 session_id（供临时命令清理）
  protected static _exec(
    _session: Session,
    _rootPath: string,
    _slash: string,
    _timeoutMs: number,
  ): Promise<{ output: string; realSessionId: string }> {
    throw new Error('Not implemented');
  }

  // 清理临时一次性执行新建的 jsonl，避免会话列表污染
  protected static _cleanup(_rootPath: string, _realSessionId: string): void {
    throw new Error('Not implemented');
  }
}
