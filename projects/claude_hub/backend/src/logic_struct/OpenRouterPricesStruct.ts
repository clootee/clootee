// OpenRouter 公开价目（调度骨架）
// 职责：缓存 https://openrouter.ai/api/v1/models 的每 token 价格（含缓存读写、1h 缓存写、分档 overrides），
// 供计费按模型查价。查询是同步的（读内存/文件缓存）；过期时后台刷新，不阻塞调用方。
export interface OpenRouterPrice {
  prompt: number;
  completion: number;
  cacheRead: number | null;
  cacheWrite: number | null;
  cacheWrite1h: number | null;
  webSearch: number;
  overrides: Array<{ minPromptTokens: number; prompt?: number; completion?: number; cacheRead?: number; cacheWrite?: number; cacheWrite1h?: number }>;
}

export class OpenRouterPricesStruct {
  // 按模型 id 查价；没有缓存时返回 null 并触发后台拉取
  static lookup(model: string): OpenRouterPrice | null {
    if (!model) throw new Error(`OpenRouterPrices.lookup: invalid model=${model}`);
    const table = this._table();
    if (this._stale()) this._refreshInBackground();
    return this._match(table, model);
  }

  // 启动时预热（异步，失败只记日志）
  static warm(): void {
    if (this._stale()) this._refreshInBackground();
  }

  protected static _table(): Record<string, OpenRouterPrice> {
    return {};
  }

  protected static _stale(): boolean {
    return false;
  }

  protected static _refreshInBackground(): void {
    throw new Error('OpenRouterPrices._refreshInBackground: not implemented');
  }

  protected static _match(_table: Record<string, OpenRouterPrice>, _model: string): OpenRouterPrice | null {
    return null;
  }
}
