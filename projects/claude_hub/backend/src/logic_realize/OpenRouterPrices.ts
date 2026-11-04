// OpenRouter 公开价目（实现）：拉取 /api/v1/models → 转成数值价目 → 落盘 data/openrouter_prices.json。
import { OpenRouterPricesStruct, OpenRouterPrice } from '../logic_struct/OpenRouterPricesStruct';
import { HttpJson } from '../helper/HttpJson';
import { JsonStore } from '../helper/JsonStore';
import { Logger } from '../helper/Logger';
import { Paths } from '../paths';
import { OPENROUTER_MODELS_URL, OPENROUTER_PRICES_TTL_MS } from '../config/ClaudePricing';

interface PriceFile {
  fetchedAt: number;
  models: Record<string, OpenRouterPrice>;
}

const opt = (v: unknown): number | null => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? null : n;
};

export class OpenRouterPrices extends OpenRouterPricesStruct {
  private static _mem: PriceFile | null = null;
  private static _loading = false;
  private static _lastTry = 0;

  private static _file(): PriceFile {
    if (!this._mem) this._mem = JsonStore.read<PriceFile>(Paths.OPENROUTER_PRICES_FILE, { fetchedAt: 0, models: {} });
    return this._mem;
  }

  protected static _table(): Record<string, OpenRouterPrice> {
    return this._file().models;
  }

  protected static _stale(): boolean {
    return Date.now() - this._file().fetchedAt > OPENROUTER_PRICES_TTL_MS;
  }

  protected static _refreshInBackground(): void {
    // 失败后 5 分钟内不重试，避免每次计费都打一遍网络
    if (this._loading || Date.now() - this._lastTry < 5 * 60 * 1000) return;
    this._loading = true;
    this._lastTry = Date.now();
    HttpJson.get(OPENROUTER_MODELS_URL, {}, 20000)
      .then((r) => {
        const list = Array.isArray(r.json?.data) ? r.json.data : [];
        if (r.status !== 200 || !list.length) throw new Error(`status=${r.status} models=${list.length}`);
        const models: Record<string, OpenRouterPrice> = {};
        for (const m of list) {
          if (m && typeof m.id === 'string' && m.pricing) models[m.id] = this._parse(m.pricing);
        }
        this._mem = { fetchedAt: Date.now(), models };
        JsonStore.write(Paths.OPENROUTER_PRICES_FILE, this._mem);
        Logger.info('OpenRouterPrices', `refreshed ${Object.keys(models).length} models`);
      })
      .catch((e) => Logger.warn('OpenRouterPrices', `refresh failed: ${(e as Error).message}`))
      .finally(() => { this._loading = false; });
  }

  private static _parse(p: Record<string, unknown>): OpenRouterPrice {
    const overrides = Array.isArray(p.overrides) ? (p.overrides as Record<string, unknown>[]) : [];
    return {
      prompt: opt(p.prompt) ?? 0,
      completion: opt(p.completion) ?? 0,
      cacheRead: opt(p.input_cache_read),
      cacheWrite: opt(p.input_cache_write),
      cacheWrite1h: opt(p.input_cache_write_1h),
      webSearch: opt(p.web_search) ?? 0,
      overrides: overrides.map((o) => ({
        minPromptTokens: opt(o.min_prompt_tokens) ?? 0,
        prompt: opt(o.prompt) ?? undefined,
        completion: opt(o.completion) ?? undefined,
        cacheRead: opt(o.input_cache_read) ?? undefined,
        cacheWrite: opt(o.input_cache_write) ?? undefined,
        cacheWrite1h: opt(o.input_cache_write_1h) ?? undefined,
      })),
    };
  }

  // 精确 id 优先；Claude Code 有时回的是 Anthropic 风格 id（claude-opus-5-5 / 带日期），转成 anthropic/claude-opus-5.5 再查
  protected static _match(table: Record<string, OpenRouterPrice>, model: string): OpenRouterPrice | null {
    const id = model.trim().toLowerCase();
    if (table[id]) return table[id];
    const bare = id.replace(/^anthropic\//, '').replace(/\[.*?\]/g, '').replace(/-\d{8}$/, '');
    const dotted = bare.replace(/-(\d+)-(\d+)$/, '-$1.$2');
    for (const cand of [`anthropic/${bare}`, `anthropic/${dotted}`]) {
      if (table[cand]) return table[cand];
    }
    return null;
  }
}
