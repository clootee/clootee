// 外部消息注入（调度骨架）：供第三方系统（如 bug_tracker）把一条消息推给指定会话，
// 效果等价于用户在该会话里亲自发了一条消息。鉴权走目标根目录自己的 externalApiToken，
// 与本系统登录 token 无关 —— 每个根目录可独立开放/关闭、独立换 token，互不影响。
//
// 健壮性考虑（回复可能在任意时刻到达，AI 不一定在"等着"）：
// - 目标会话正忙（AI 正在处理别的任务）：天然安全——TaskQueue.addTasks 只是把消息追加进该会话
//   自己的任务队列，不影响当前任务，忙完了自动轮到它，无需额外处理。
// - 目标会话已被删除：`this._resolveDeliverySession` 兜底改投到同根目录下新建的会话（打上收藏标记，
//   content 前缀说明原因），消息不会丢，只是换了个会话承载。
// - 目标根目录本身已被删除：无处可投，只能原样报错——这一层已经没有更下游的兜底位置了，
//   失败信息需要包含 rootId，方便调用方（如 bug_tracker）记录下来供人工排查。
import { RootManager } from '../logic_realize/RootManager';
import { TaskQueue } from '../logic_realize/TaskQueue';
import { Task } from '../models/Types';

// 消息实际投递到哪个会话：fallback=true 表示原 sessionId 已不存在，改投的新会话
export interface DeliveryTarget {
  sessionId: string;
  fallback: boolean;
}

export class ExternalInboxStruct {
  // RootManager.getRoot         → 校验根目录存在，读取开放状态与 token
  // this._resolveDeliverySession → 确定实际投递的会话（原会话已删则兜底新建，realize 实现）
  // TaskQueue.addTasks          → 把内容作为一条普通用户消息塞进该会话任务队列（复用现有发送链路）
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
    const target = this._resolveDeliverySession(rootId, sessionId);
    const text = target.fallback
      ? `[外部消息 - 原会话已不存在，已改投新会话]\n${content}`
      : content;
    return TaskQueue.addTasks(target.sessionId, [text]);
  }

  // 目标会话是否仍存在；不存在则在同根目录下新建一个会话兜底承接（并标记收藏，避免消息悄悄丢失）
  protected static _resolveDeliverySession(_rootId: string, _sessionId: string): DeliveryTarget {
    throw new Error('Not implemented');
  }
}
