// 任务队列调度（实现）：填充运行期状态（进程句柄/被杀集合）与持久化广播细节
import { EngineRunner, LaunchResult, TaskQueueStruct } from '../logic_struct/TaskQueueStruct';
import { RunCallbacks } from '../logic_struct/ClaudeRunnerStruct';
import { SpawnHandle } from '../helper/ProcessSpawner';
import { EventBus } from '../helper/EventBus';
import { ErrorHandler } from '../helper/ErrorHandler';
import { Ids } from '../helper/Ids';
import { AppConfig } from '../config/AppConfig';
import { SessionManager } from './SessionManager';
import { SessionMeta } from './SessionMeta';
import { TraceStore } from './TraceStore';
import { ProjectPrompt } from './ProjectPrompt';
import { Session, Task, Message } from '../models/Types';

interface RunState {
  taskId: string;
  handle: SpawnHandle;
}

export class TaskQueue extends TaskQueueStruct {
  // 每个会话当前运行的进程句柄
  private static _running = new Map<string, RunState>();
  // 被手动停止/暂停而杀掉的任务，用于忽略其进程退出回调
  private static _killed = new Set<string>();

  // 启动执行器。execute 可能在 spawn 之前就抛错（找不到 claude、内置 node 缺失、权限被拒），
  // 这类异常以前会一路抛到 HTTP 层或事件回调里丢掉，任务却已经是 running → 界面永远转圈。
  // 这里一律接住，转成带现场信息的失败原因交给调度层收尾。
  protected static _launchRunner(
    runner: EngineRunner,
    session: Session,
    rootPath: string,
    prompt: string,
    cb: RunCallbacks,
  ): LaunchResult {
    try {
      return { handle: runner.execute(session, rootPath, prompt, cb) };
    } catch (e: unknown) {
      const message = ErrorHandler.handle(e, `TaskQueue.launch(${session.engine})`);
      return {
        error: `${session.engine} 启动失败：${message}\n工作目录：${rootPath}\n${AppConfig.ENGINE_SILENT_HINT}`,
      };
    }
  }

  static _isRunning(sessionId: string): boolean {
    return this._running.has(sessionId);
  }

  static _runningTaskId(sessionId: string): string | null {
    return this._running.get(sessionId)?.taskId ?? null;
  }

  protected static _setHandle(sessionId: string, taskId: string, handle: unknown): void {
    this._running.set(sessionId, { taskId, handle: handle as SpawnHandle });
    const session = SessionManager.getSession(sessionId);
    const task = session.tasks.find((t) => t.id === taskId);
    if (!task || task.status !== 'running') {
      this._running.delete(sessionId);
    }
  }

  protected static _killHandle(sessionId: string, taskId: string): void {
    const state = this._running.get(sessionId);
    if (state) {
      // 有真实进程：标记为手动杀掉（其退出回调将被忽略），再杀进程
      this._killed.add(this._key(sessionId, taskId));
      state.handle.kill();
      this._running.delete(sessionId);
    }
    // 无句柄（如重启后的僵尸任务）：无需标记，调用方会直接 finishTask 收尾
  }

  protected static _consumeKilled(sessionId: string, taskId: string): boolean {
    const key = this._key(sessionId, taskId);
    if (this._killed.has(key)) {
      this._killed.delete(key);
      return true;
    }
    // 正常结束：清理运行句柄
    this._running.delete(sessionId);
    return false;
  }

  protected static _appendTasks(sessionId: string, tasks: Task[], prepend: boolean): void {
    const session = SessionManager.getSession(sessionId);
    if (prepend) {
      // 补充任务插到第一个仍在排队(pending)且非补充的任务之前：
      // 既越过被暂停冻结的后续任务，又保持多个补充任务之间的 FIFO 顺序
      const at = session.tasks.findIndex((t) => t.status === 'pending' && !t.supplement);
      if (at < 0) session.tasks.push(...tasks);
      else session.tasks.splice(at, 0, ...tasks);
    } else {
      session.tasks.push(...tasks);
    }
    SessionManager.saveSession(session);
  }

  protected static _dropTask(sessionId: string, taskId: string): void {
    const session = SessionManager.getSession(sessionId);
    const i = session.tasks.findIndex((t) => t.id === taskId);
    if (i < 0) throw new Error(`_dropTask: task not found, id=${taskId}`);
    session.tasks.splice(i, 1);
    SessionManager.saveSession(session);
  }

  protected static _patchTaskPrompt(sessionId: string, taskId: string, prompt: string): void {
    const session = SessionManager.getSession(sessionId);
    const task = session.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`_patchTaskPrompt: task not found, id=${taskId}`);
    task.prompt = prompt;
    SessionManager.saveSession(session);
    EventBus.broadcast({ kind: 'task', sessionId, task });
  }

  protected static _patchTaskHeld(sessionId: string, taskId: string, held: boolean): void {
    const session = SessionManager.getSession(sessionId);
    const task = session.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`_patchTaskHeld: task not found, id=${taskId}`);
    task.held = held;
    SessionManager.saveSession(session);
    EventBus.broadcast({ kind: 'task', sessionId, task });
  }

  protected static _markRunning(sessionId: string, taskId: string): void {
    const session = SessionManager.getSession(sessionId);
    const task = session.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`_markRunning: task not found, id=${taskId}`);
    task.status = 'running';
    task.startedAt = Date.now();
    // 标题不再由 hub 设定：一律取自 claude jsonl（summary / 首条用户消息）
    SessionManager.saveSession(session);
    EventBus.broadcast({ kind: 'task', sessionId, task });
  }

  protected static _finishTask(
    sessionId: string,
    taskId: string,
    status: Task['status'],
    error?: string,
  ): void {
    const session = SessionManager.getSession(sessionId);
    const task = session.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`_finishTask: task not found, id=${taskId}`);
    task.status = status;
    task.finishedAt = Date.now();
    if (error) task.error = error;
    SessionManager.saveSession(session);
    // 轨迹：任务收尾（含最终状态与 hub 侧总耗时，与引擎自报的 result 互为印证）
    TraceStore.record(this._traceSessionId(sessionId), {
      kind: 'task_end',
      taskId,
      name: status,
      text: error || '',
      engine: session.engine,
      raw: { startedAt: task.startedAt, finishedAt: task.finishedAt, wallMs: (task.finishedAt || 0) - (task.startedAt || 0) },
    });
    const state = this._running.get(sessionId);
    if (state?.taskId === taskId) this._running.delete(sessionId);
    EventBus.broadcast({ kind: 'task', sessionId, task });
  }

  // 消息不再持久化（正文以 claude 原生 jsonl 为准），仅实时广播给前端即时展示
  protected static _recordUserMessage(sessionId: string, task: Task): void {
    const msg = this._newMessage(task.id, 'user', task.prompt);
    EventBus.broadcast({ kind: 'message', sessionId, taskId: task.id, message: msg });
  }

  protected static _recordAssistantMessage(sessionId: string, taskId: string, text: string): void {
    const msg = this._newMessage(taskId, 'assistant', text);
    EventBus.broadcast({ kind: 'message', sessionId, taskId, message: msg });
  }

  // 校正：把 claude 实际使用的 session_id 回写到（内存）会话。草稿首跑后即在此拿到真实 uuid，
  // 之后续接走 --resume。绝不自造 id，一律以 claude 回报为准。
  protected static _reconcileSessionId(sessionId: string, realId: string): void {
    if (!realId) return;
    const session = SessionManager.getSession(sessionId);
    if (session.claudeSessionId === realId) return;
    const oldTraceId = this._traceSessionId(sessionId); // 校正前的轨迹文件（草稿 id）
    session.claudeSessionId = realId;
    SessionMeta.migrate(session.id, `${session.rootId}:${realId}`);
    // 首跑前几条事件写在草稿文件里，这里并入真实 uuid 的轨迹文件，保证一个会话一份完整轨迹
    TraceStore.migrate(oldTraceId, `${session.rootId}:${realId}`);
    SessionManager.saveSession(session);
    EventBus.broadcast({ kind: 'session', session });
  }

  protected static _setPaused(sessionId: string, paused: boolean): void {
    const session = SessionManager.getSession(sessionId);
    session.paused = paused;
    SessionManager.saveSession(session);
    EventBus.broadcast({ kind: 'session', session });
  }

  // 轨迹文件归属：已拿到 claude 真实 uuid 就用 `<rootId>:<uuid>`，否则仍是草稿 id
  protected static _traceSessionId(sessionId: string): string {
    const session = SessionManager.getSession(sessionId);
    return session.claudeSessionId ? `${session.rootId}:${session.claudeSessionId}` : session.id;
  }

  protected static _ensureProjectPrompt(rootPath: string): void {
    try {
      ProjectPrompt.ensure(rootPath);
    } catch {
      // 写不进去（只读目录/权限等）不影响任务本身
    }
  }

  protected static _newMessage(taskId: string, role: Message['role'], text: string): Message {
    return { id: Ids.short('msg'), taskId, role, text, createdAt: Date.now() };
  }

  private static _key(sessionId: string, taskId: string): string {
    return `${sessionId}::${taskId}`;
  }
}
