// 任务队列调度（调度骨架）
// 职责：把任务排队、顺序执行、支持停止当前任务（跳到下一个）、暂停/继续整条任务流
// 运行期状态（进程句柄、被杀任务集合）由 Realize 用内部 Map/Set 持有
import { Ids } from '../helper/Ids';
import { EventBus } from '../helper/EventBus';
import { Logger } from '../helper/Logger';
import { SessionManager } from '../logic_realize/SessionManager';
import { RootManager } from '../logic_realize/RootManager';
import { ClaudeRunner } from '../logic_realize/ClaudeRunner';
import { CodexRunner } from '../logic_realize/CodexRunner';
import { TraceStore } from '../logic_realize/TraceStore';
import { ProjectPrompt } from '../logic_realize/ProjectPrompt';
import { RunCallbacks } from './ClaudeRunnerStruct';
import { Session, Task, Message } from '../models/Types';

// 执行器（ClaudeRunner / CodexRunner）对外的统一形状：只要能按此签名跑起来即可
export interface EngineRunner {
  execute(session: Session, rootPath: string, prompt: string, cb: RunCallbacks): unknown;
}

// 启动结果：拿到进程句柄，或拿到「为什么没起来」的说明（二者必居其一）
export interface LaunchResult {
  handle?: unknown;
  error?: string;
}

export class TaskQueueStruct {
  // ── 调度骨架：addTasks ─────────────────────────────────────────────
  // 一次可提交多个任务，全部以 pending 入队；若当前正在执行则自动累计，等前一个完成再继续
  // this._appendTasks  → 把任务写入会话并落盘（realize）
  // this._tick         → 触发调度，尝试启动下一个任务
  static addTasks(sessionId: string, prompts: string[]): Task[] {
    if (!sessionId) throw new Error(`addTasks: invalid sessionId=${sessionId}`);
    const cleaned = prompts.map((p) => (p || '').trim()).filter((p) => p.length > 0);
    if (cleaned.length === 0) throw new Error('addTasks: no valid prompts');

    // 暂停整条序列期间新增 = 「补充任务」：插到冻结队列最前，并可越过暂停立即执行（视为对被暂停任务的补充）
    const supplement = SessionManager.getSession(sessionId).paused === true;
    const tasks = cleaned.map<Task>((prompt) => ({
      id: Ids.short('task'),
      prompt,
      status: 'pending',
      createdAt: Date.now(),
      supplement,
    }));

    this._appendTasks(sessionId, tasks, supplement);
    tasks.forEach((t) => EventBus.broadcast({ kind: 'task', sessionId, task: t }));
    this._tick(sessionId);
    return tasks;
  }

  // ── 调度骨架：restoreAndResume（启动恢复）────────────────────────────
  // 进程重启后：把持久化的队列载回内存，再对未暂停且仍有 pending 的会话触发调度，
  // 让重启前排队的任务自动继续（被暂定 held 的仍跳过）
  static restoreAndResume(): void {
    const restored = SessionManager.restorePersisted();
    for (const s of restored) {
      // 每个会话独立恢复：某个会话根目录已删/异常时只跳过它，
      // 不能连累其余会话的 pending 任务无法续跑。
      try {
        // _tick 自身按暂停态过滤：未暂停会续跑下一个 pending；暂停中仅补充任务(supplement)会续跑
        if (s.tasks.some((t) => t.status === 'pending' && !t.held)) this._tick(s.id);
      } catch (e) {
        Logger.warn('TaskQueue', `restoreAndResume: skip session=${s.id}`, e);
      }
    }
  }

  // ── 调度骨架：_tick ────────────────────────────────────────────────
  // 调度的唯一入口：当前空闲 且 有可执行 pending → 启动下一个任务
  // 暂停中：仅「补充任务」(supplement) 可越过暂停执行，其余 pending 冻结等待「继续任务流」
  // 暂定（held）的 pending 任务始终被跳过，保留在队列中等待恢复
  static _tick(sessionId: string): void {
    const session = SessionManager.getSession(sessionId);
    if (this._isRunning(sessionId)) return;
    const next = session.tasks.find(
      (t) => t.status === 'pending' && !t.held && (!session.paused || t.supplement),
    );
    if (!next) return;
    this._startTask(session, next);
  }

  // ── 调度骨架：_startTask ───────────────────────────────────────────
  // RootManager.getRoot         → 取根目录路径作为 claude 工作目录
  // this._ensureProjectPrompt   → 确保预设系统提示词已写入项目（realize，失败不阻断）
  // TraceStore.record           → 记录任务起点（含完整 prompt 与工作目录）
  // this._markRunning           → 任务置为 running 并落盘 + 广播（realize）
  // this._recordUserMessage     → 记录用户消息进入最终消息列表（realize）
  // this._launchRunner          → 启动引擎子进程，启动期异常转成失败原因（realize）
  // this._setHandle             → 保存进程句柄以便后续停止（realize）
  // 注意顺序：可能抛异常的准备动作（取根目录、落轨迹）一律排在 _markRunning 之前——
  // 一旦任务被置为 running 之后再抛，队列就会永远停在"执行中"，界面上表现为发消息没反应。
  static _startTask(session: Session, task: Task): void {
    const root = RootManager.getRoot(session.rootId);
    this._ensureProjectPrompt(root.path);

    // 轨迹：记录任务起点（含完整 prompt 与工作目录），后续引擎事件都挂在这个 taskId 下
    TraceStore.record(session.id, {
      kind: 'task_start',
      taskId: task.id,
      engine: session.engine,
      name: session.engine,
      text: task.prompt,
      raw: { cwd: root.path, claudeSessionId: session.claudeSessionId },
    });

    this._markRunning(session.id, task.id);
    this._recordUserMessage(session.id, task);

    // 按会话选定的引擎分发执行器（两者 execute 签名一致）
    const runner: EngineRunner = session.engine === 'codex' ? CodexRunner : ClaudeRunner;
    const started = this._launchRunner(runner, session, root.path, task.prompt, {
      onThinking: (text) =>
        EventBus.broadcast({ kind: 'thinking', sessionId: session.id, taskId: task.id, text }),
      onTool: (name, detail) =>
        EventBus.broadcast({ kind: 'tool', sessionId: session.id, taskId: task.id, name, detail }),
      onOutput: (text) =>
        EventBus.broadcast({ kind: 'output', sessionId: session.id, taskId: task.id, text }),
      onFinal: (text) => this._recordAssistantMessage(session.id, task.id, text),
      // 全过程轨迹：引擎每个事件原样落盘（会话 id 取最新值，草稿首跑中途会被校正为真实 uuid）
      onEvent: (ev) => TraceStore.record(this._traceSessionId(session.id), { ...ev, taskId: task.id }),
      onSessionId: (realId) => this._reconcileSessionId(session.id, realId),
      // 运行中的异常提示（不结束任务）：直接广播到界面，别让用户对着空白猜
      onNotice: (level, message) =>
        EventBus.broadcast({ kind: 'notice', sessionId: session.id, taskId: task.id, level, message }),
      onDone: (success, error) => this._onTaskDone(session.id, task.id, success, error),
    });

    // 启动本身就失败（找不到 claude/内置 node 缺失/权限被拒）：按失败收尾并把原因带到界面，
    // 绝不能让任务永远停在 running——那正是"发消息没反应也不报错"的来源
    if (started.error) {
      this._onTaskDone(session.id, task.id, false, started.error);
      return;
    }
    this._setHandle(session.id, task.id, started.handle);
  }

  // ── 调度骨架：_onTaskDone ──────────────────────────────────────────
  // 任务进程结束。若是被手动停止/暂停杀掉的，忽略（状态已由 stop/pause 处理）；
  // 否则按成功/失败收尾，然后继续下一个任务
  static _onTaskDone(sessionId: string, taskId: string, success: boolean, error?: string): void {
    if (this._consumeKilled(sessionId, taskId)) return;
    const current = SessionManager.getSession(sessionId).tasks.find((t) => t.id === taskId);
    if (!current || current.status !== 'running') return;
    // 成功执行却没拿到 claude 的真实 session_id → 视为失败报错（绝不退而求其次自造 id）
    if (success && !SessionManager.getSession(sessionId).claudeSessionId) {
      this._finishTask(sessionId, taskId, 'error', '引擎未返回 session_id，无法确定会话 id');
      this._tick(sessionId);
      return;
    }
    this._finishTask(sessionId, taskId, success ? 'done' : 'error', error);
    this._tick(sessionId);
  }

  // ── 调度骨架：removeTask ───────────────────────────────────────────
  // 删除一个尚未开始（pending）的任务：校验状态后从会话移除并广播
  // 只允许删 pending，running/done/error/stopped 不可删（运行中请用 stop）
  static removeTask(sessionId: string, taskId: string): void {
    if (!sessionId) throw new Error(`removeTask: invalid sessionId=${sessionId}`);
    if (!taskId) throw new Error(`removeTask: invalid taskId=${taskId}`);
    const session = SessionManager.getSession(sessionId);
    const task = session.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`removeTask: task not found, id=${taskId}`);
    if (task.status !== 'pending')
      throw new Error(`removeTask: only pending task removable, status=${task.status}`);
    this._dropTask(sessionId, taskId);
    EventBus.broadcast({ kind: 'taskRemoved', sessionId, taskId });
  }

  // ── 调度骨架：removeTasks（批量删除）────────────────────────────────
  // 一次删除多个 pending 任务；非 pending / 不存在的 id 自动跳过，逐个广播移除
  static removeTasks(sessionId: string, taskIds: string[]): void {
    if (!sessionId) throw new Error(`removeTasks: invalid sessionId=${sessionId}`);
    if (!Array.isArray(taskIds) || taskIds.length === 0)
      throw new Error('removeTasks: no taskIds');
    const session = SessionManager.getSession(sessionId);
    const removable = taskIds.filter((id) => {
      const t = session.tasks.find((x) => x.id === id);
      return t !== undefined && t.status === 'pending';
    });
    removable.forEach((id) => {
      this._dropTask(sessionId, id);
      EventBus.broadcast({ kind: 'taskRemoved', sessionId, taskId: id });
    });
  }

  // ── 调度骨架：updateTask（修改 pending 任务文案）─────────────────────
  // 只允许改 pending 任务的 prompt；空文案拒绝
  static updateTask(sessionId: string, taskId: string, prompt: string): void {
    if (!sessionId) throw new Error(`updateTask: invalid sessionId=${sessionId}`);
    if (!taskId) throw new Error(`updateTask: invalid taskId=${taskId}`);
    const cleaned = (prompt || '').trim();
    if (!cleaned) throw new Error('updateTask: empty prompt');
    const session = SessionManager.getSession(sessionId);
    const task = session.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`updateTask: task not found, id=${taskId}`);
    if (task.status !== 'pending')
      throw new Error(`updateTask: only pending task editable, status=${task.status}`);
    this._patchTaskPrompt(sessionId, taskId, cleaned);
  }

  // ── 调度骨架：setHold（暂定 / 恢复某个 pending 任务）─────────────────
  // held=true：调度器跳过该任务；held=false：解除并触发调度（可能立即执行）
  static setHold(sessionId: string, taskId: string, held: boolean): void {
    if (!sessionId) throw new Error(`setHold: invalid sessionId=${sessionId}`);
    if (!taskId) throw new Error(`setHold: invalid taskId=${taskId}`);
    const session = SessionManager.getSession(sessionId);
    const task = session.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`setHold: task not found, id=${taskId}`);
    if (task.status !== 'pending')
      throw new Error(`setHold: only pending task holdable, status=${task.status}`);
    this._patchTaskHeld(sessionId, taskId, held);
    if (!held) this._tick(sessionId);
  }

  // ── 调度骨架：stopCurrent ──────────────────────────────────────────
  // 停止当前任务并跳到下一个：杀进程(若有句柄) → 标记 stopped → 调度下一个
  static stopCurrent(sessionId: string): void {
    const taskId = this._currentRunningTaskId(sessionId);
    if (!taskId) return;
    this._killHandle(sessionId, taskId);
    this._finishTask(sessionId, taskId, 'stopped');
    this._tick(sessionId);
  }

  // ── 调度骨架：pauseFlow ────────────────────────────────────────────
  // 暂停任务流：停止当前任务且不再执行后续（保留 pending 等待继续）
  static pauseFlow(sessionId: string): void {
    this._setPaused(sessionId, true);
    const taskId = this._currentRunningTaskId(sessionId);
    if (taskId) {
      this._killHandle(sessionId, taskId);
      this._finishTask(sessionId, taskId, 'stopped');
    }
  }

  // 当前运行中的任务 id：优先内存句柄；没有句柄时回退到磁盘上标记 running 的任务
  // （后端重启后内存句柄会丢，但磁盘仍是 running，需能把这种"僵尸"任务停掉）
  protected static _currentRunningTaskId(sessionId: string): string | null {
    const live = this._runningTaskId(sessionId);
    if (live) return live;
    const t = SessionManager.getSession(sessionId).tasks.find((x) => x.status === 'running');
    return t ? t.id : null;
  }

  // 注：任务队列纯内存（不落盘），后端重启即清空，不存在"僵尸 running"，无需启动恢复。

  // ── 调度骨架：resumeFlow ───────────────────────────────────────────
  // 继续任务流：解除暂停并触发调度
  static resumeFlow(sessionId: string): void {
    this._setPaused(sessionId, false);
    this._tick(sessionId);
  }

  // ── 以下为需内部状态的细节方法，由 Realize 覆写 ──

  // 启动执行器：捕获启动期异常（可执行文件找不到/权限不足等），转成可读的失败原因返回
  protected static _launchRunner(
    _runner: EngineRunner,
    _session: Session,
    _rootPath: string,
    _prompt: string,
    _cb: RunCallbacks,
  ): LaunchResult { throw new Error('Not implemented'); }

  // 运行期状态查询
  static _isRunning(_sessionId: string): boolean { throw new Error('Not implemented'); }
  static _runningTaskId(_sessionId: string): string | null { throw new Error('Not implemented'); }
  protected static _setHandle(_sessionId: string, _taskId: string, _handle: unknown): void { throw new Error('Not implemented'); }
  protected static _killHandle(_sessionId: string, _taskId: string): void { throw new Error('Not implemented'); }
  protected static _consumeKilled(_sessionId: string, _taskId: string): boolean { throw new Error('Not implemented'); }

  // 持久化 + 广播
  protected static _appendTasks(_sessionId: string, _tasks: Task[], _prepend: boolean): void { throw new Error('Not implemented'); }
  protected static _dropTask(_sessionId: string, _taskId: string): void { throw new Error('Not implemented'); }
  protected static _patchTaskPrompt(_sessionId: string, _taskId: string, _prompt: string): void { throw new Error('Not implemented'); }
  protected static _patchTaskHeld(_sessionId: string, _taskId: string, _held: boolean): void { throw new Error('Not implemented'); }
  protected static _markRunning(_sessionId: string, _taskId: string): void { throw new Error('Not implemented'); }
  protected static _finishTask(_sessionId: string, _taskId: string, _status: Task['status'], _error?: string): void { throw new Error('Not implemented'); }
  protected static _recordUserMessage(_sessionId: string, _task: Task): void { throw new Error('Not implemented'); }
  protected static _recordAssistantMessage(_sessionId: string, _taskId: string, _text: string): void { throw new Error('Not implemented'); }
  // 把 claude 实际使用的 session_id 回写到会话（与传入不同则校正并落盘）
  protected static _reconcileSessionId(_sessionId: string, _realId: string): void { throw new Error('Not implemented'); }
  protected static _setPaused(_sessionId: string, _paused: boolean): void { throw new Error('Not implemented'); }

  // 轨迹落盘用的会话 id：草稿首跑中途 claude 会回报真实 uuid，之后事件必须写进真实 id 的文件
  protected static _traceSessionId(_sessionId: string): string { throw new Error('Not implemented'); }

  // 预设系统提示词写入（失败不得阻断任务执行）
  protected static _ensureProjectPrompt(_rootPath: string): void { throw new Error('Not implemented'); }

  // 供 Realize 内部构造消息复用
  protected static _newMessage(_taskId: string, _role: Message['role'], _text: string): Message { throw new Error('Not implemented'); }
}
