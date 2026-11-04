// 会话计费（调度骨架）
// 职责：对会话里每个 claude 轮次按每条 assistant 消息的 usage 精确计价：
// 输入 / 输出 / 缓存读 / 缓存写(5m、1h 分开) / web search / fast 倍率，按模型分行给出明细。
// 价目按服务商分派：订阅登录 → Claude 官方价目给等价估价（billing=subscription，前端标「订阅」）；
// OpenRouter → 它自己的公开价目；DeepSeek → DeepSeek 官方价目（含峰谷）。Clootee 自有服务商另行记账，不在此列。
// 数据源：TraceStore 实时捕获的事件（task_start 里记了服务商，assistant 帧带 msgId 去重）。
import { TraceStore } from '../logic_realize/TraceStore';
import { API_COST_MAX_BATCH } from '../config/ClaudePricing';
import { ApiSessionCost, ApiSessionTotals, TraceEvent } from '../models/Types';

export class ApiCostStruct {
  // 单会话：每轮（任务）明细 + 合计；轨迹文件没变就走缓存
  static session(sessionId: string): ApiSessionCost {
    if (!sessionId) throw new Error(`ApiCost.session: invalid sessionId=${sessionId}`);
    const { stamp, events } = TraceStore.liveEvents(sessionId);
    return this._cached(sessionId, stamp, () => this._compute(sessionId, events));
  }

  // 会话列表：只要合计（没有轮次的会话不出现在结果里）；sub 是其中订阅轮次的等价估价
  static totals(ids: string[]): Record<string, ApiSessionTotals> {
    if (!Array.isArray(ids) || ids.length > API_COST_MAX_BATCH)
      throw new Error(`ApiCost.totals: invalid ids length=${ids && ids.length}`);
    return this._totals(ids);
  }

  protected static _cached(_id: string, _stamp: string, fn: () => ApiSessionCost): ApiSessionCost {
    return fn();
  }

  protected static _compute(_sessionId: string, _events: TraceEvent[]): ApiSessionCost {
    throw new Error('ApiCost._compute: not implemented');
  }

  protected static _totals(_ids: string[]): Record<string, ApiSessionTotals> {
    throw new Error('ApiCost._totals: not implemented');
  }
}
