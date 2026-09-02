// 外部消息注入（调度骨架）：供第三方系统（如 bug_tracker）把一条消息推给指定会话，
// 效果等价于用户在该会话里亲自发了一条消息。鉴权走目标根目录自己的 externalApiToken，
// 与本系统登录 token 无关 —— 每个根目录可独立开放/关闭、独立换 token，互不影响。
import { RootManager } from '../logic_realize/RootManager';
import { TaskQueue } from '../logic_realize/TaskQueue';
import { Task } from '../models/Types';

export class ExternalInboxStruct {
  // RootManager.getRoot → 校验根目录存在，读取开放状态与 token
  // TaskQueue.addTasks  → 把内容作为一条普通用户消息塞进该会话任务队列（复用现有发送链路）
  static postMessage(rootId: string, token: string, sessionId: string, content: string): Task[] {
    if (!rootId) throw new Error(`postMessage: invalid rootId=${rootId}`);
    if (!sessionId || !sessionId.startsWith(rootId + ':'))
      throw new Error(`postMessage: sessionId does not belong to rootId, sessionId=${sessionId} rootId=${rootId}`);
    if (!content || !content.trim()) throw new Error(`postMessage: empty content`);
    const root = RootManager.getRoot(rootId);
    if (root.externalApiOpen === false)
      throw new Error(`postMessage: external api closed for rootId=${rootId}`);
    if (!token || !root.externalApiToken || token !== root.externalApiToken)
      throw new Error(`postMessage: invalid token for rootId=${rootId}`);
    return TaskQueue.addTasks(sessionId, [content]);
  }
}
