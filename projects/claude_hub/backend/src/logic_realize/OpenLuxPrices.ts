// USD per million tokens, using the lowest listed group for each model.
// Capture the quote in the turn trace so a later price change cannot reprice history.
export interface OpenLuxPrice { input: number; output: number; cacheRead: number; group: string }
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export class OpenLuxPrices {
  private static table?: Promise<Map<string, OpenLuxPrice>>;
  private static expires = 0;

  static parse(catalog: any): Map<string, OpenLuxPrice> {
    const table = new Map<string, OpenLuxPrice>();
    for (const row of catalog?.data || []) {
      if (row.quota_type !== 0 || !valid(row.model_ratio) || !valid(row.completion_ratio)
        || !Array.isArray(row.enable_groups) || typeof row.model_name !== 'string') continue;
      for (const group of row.enable_groups) {
        const ratio = catalog.group_ratio?.[group];
        if (!valid(ratio)) continue;
        const input = 2 * row.model_ratio * ratio;
        const prev = table.get(row.model_name);
        if (!prev || input < prev.input) table.set(row.model_name, {
          group, input, output: input * row.completion_ratio,
          cacheRead: input * (valid(row.cache_ratio) ? row.cache_ratio : 1),
        });
      }
    }
    return table;
  }

  static async quote(model: string): Promise<OpenLuxPrice | undefined> {
    if (!this.table || Date.now() >= this.expires) {
      this.expires = Date.now() + 60000;
      this.table = fetch('https://api.openlux.ai/api/pricing', { signal: AbortSignal.timeout(8000) })
        .then(async r => r.ok ? this.parse(await r.json()) : new Map<string, OpenLuxPrice>())
        .catch(() => new Map<string, OpenLuxPrice>());
    }
    return (await this.table).get(model.replace(/^models\//, ''));
  }
}
