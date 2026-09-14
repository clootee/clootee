// 网络体检（调度骨架）：回答小白用户最容易卡住的两个问题——
//   ① 这台机器有没有网？
//   ② 能不能连上 Claude（api.anthropic.com / claude.com）？
// 连不上时不能只报错，必须给出**两条可执行的出路**：开科学上网，或直接换国产模型。
// 所以报告里同时带上国产服务商的实测连通情况，前端据此在同一个界面里给「一键换国产模型」。
//
// 判定原则：只看「有没有 HTTP 响应」，不看状态码——api.anthropic.com 裸访问必然 401/404，
// 那正是「连得上」的证据。具体探测（NetProbe / 代理环境变量）由 Realize 实现。
import { ProbeResult, ProxyInfo } from '../helper/NetProbe';

export type NetGroup = 'baseline' | 'anthropic' | 'domestic';
// ok            —— Claude 直接可用
// anthropicOnly —— 有网，但连不上 Claude（最常见：国内没开科学上网）→ 开代理 或 换国产
// noInternet    —— 整台机器都没网（连国内站点都不通）
// unknown       —— 探测本身出错，不下结论（宁可不说，也别误导）
export type NetVerdict = 'ok' | 'anthropicOnly' | 'noInternet' | 'unknown';

export interface NetTarget {
  key: string;
  label: string;
  url: string;
  group: NetGroup;
  provider?: string; // group=domestic 时对应的服务商 id，供前端「换成这个」按钮直接用
}

export interface NetCheckItem extends NetTarget {
  ok: boolean;
  ms: number;
  status?: number;
  viaProxy?: boolean;
  error?: string;
}

export interface ConnectivityReport {
  verdict: NetVerdict;
  internet: boolean;          // 至少有一个基准站点通
  anthropic: boolean;         // Claude 官方端点可达
  domestic: string[];         // 实测可达的国产服务商 id（前端据此只推能用的）
  proxy: ProxyInfo;           // 当前进程可见的代理设置
  items: NetCheckItem[];      // 逐项明细（界面可展开看）
  hint: string;               // 一句话结论（直接展示给用户）
  checkedAt: number;
}

// 探测目标清单（顺序即界面展示顺序）。
// baseline 放两个：国内 + 国际，任意一个通就说明「这台机器有网」。
export const NET_TARGETS: NetTarget[] = [
  { key: 'npmmirror', label: '国内网络（npmmirror）', url: 'https://registry.npmmirror.com/-/ping', group: 'baseline' },
  { key: 'npmjs', label: '国际网络（npmjs）', url: 'https://registry.npmjs.org/-/ping', group: 'baseline' },
  { key: 'anthropic-api', label: 'Claude API（api.anthropic.com）', url: 'https://api.anthropic.com/v1/models', group: 'anthropic' },
  { key: 'claude-com', label: 'Claude 登录站（claude.com）', url: 'https://claude.com/', group: 'anthropic' },
  { key: 'minimax', label: 'MiniMax（国产）', url: 'https://api.minimaxi.com/v1/models', group: 'domestic', provider: 'minimax' },
  { key: 'kimi', label: 'Kimi 开放平台（国产）', url: 'https://api.moonshot.cn/v1/models', group: 'domestic', provider: 'kimi' },
  { key: 'kimicode', label: 'Kimi Code 订阅（国产）', url: 'https://api.kimi.com/coding/v1/models', group: 'domestic', provider: 'kimicode' },
  { key: 'xiaomi', label: '小米 MiMo（国产）', url: 'https://api.xiaomimimo.com/v1/models', group: 'domestic', provider: 'xiaomi' },
];

// 单个目标的探测超时。给到 6 秒：被墙的连接常常是「慢到超时」而不是立刻失败，
// 太短会把「网络差但能用」误判成「不通」。
export const NET_TIMEOUT_MS = 6000;

export class ConnectivityStruct {
  // 完整体检：并发探测全部目标 → 合成结论
  static async check(): Promise<ConnectivityReport> {
    const targets = NET_TARGETS;
    const results = await this._probeAll(targets.map((t) => t.url), NET_TIMEOUT_MS);
    const proxy = this._proxy();
    const items = this._merge(targets, results);
    return this._compose(items, proxy);
  }

  // 只看「Claude 通不通」的快速检查（发消息前用，比完整体检快）
  static async quick(): Promise<boolean> {
    const targets = NET_TARGETS.filter((t) => t.group === 'anthropic');
    const results = await this._probeAll(targets.map((t) => t.url), NET_TIMEOUT_MS);
    return results.some((r) => r.ok);
  }

  // 探测结果并回目标清单（保持顺序，前端直接渲染）
  private static _merge(targets: NetTarget[], results: ProbeResult[]): NetCheckItem[] {
    return targets.map((t, i) => {
      const r = results[i] || { url: t.url, ok: false, ms: 0, error: '未探测' };
      return { ...t, ok: r.ok, ms: r.ms, status: r.status, viaProxy: r.viaProxy, error: r.error };
    });
  }

  // 合成结论：先看有没有网，再看 Claude 通不通
  private static _compose(items: NetCheckItem[], proxy: ProxyInfo): ConnectivityReport {
    const okIn = (g: NetGroup) => items.some((i) => i.group === g && i.ok);
    const internet = okIn('baseline') || okIn('anthropic') || okIn('domestic');
    const anthropic = okIn('anthropic');
    const domestic = items.filter((i) => i.group === 'domestic' && i.ok && i.provider).map((i) => i.provider as string);
    const verdict: NetVerdict = anthropic ? 'ok' : internet ? 'anthropicOnly' : 'noInternet';
    return {
      verdict,
      internet,
      anthropic,
      domestic,
      proxy,
      items,
      hint: this._hint(verdict, proxy, domestic),
      checkedAt: Date.now(),
    };
  }

  // 一句话结论（前端直接展示，不需要再翻译）
  private static _hint(verdict: NetVerdict, proxy: ProxyInfo, domestic: string[]): string {
    if (verdict === 'ok')
      return proxy.enabled ? `网络正常，Claude 可用（经代理 ${proxy.url}）` : '网络正常，Claude 可用';
    if (verdict === 'noInternet')
      return '这台电脑当前没有网络：国内外站点都连不上。请先检查网线 / Wi-Fi / 公司防火墙。';
    const way = domestic.length
      ? `或者直接改用国产模型（当前实测可用：${domestic.join('、')}），无需科学上网`
      : '或者改用国产模型（当前国产服务商也未探通，请一并检查网络）';
    return proxy.enabled
      ? `有网，但连不上 Claude。已检测到代理 ${proxy.url}，但它没能连通 Claude：请检查代理是否正常工作；${way}。`
      : `有网，但连不上 Claude（国内直连通常会被拦截）。请开启科学上网后重新检测；${way}。`;
  }

  // ── Realize 实现点 ──
  protected static _probeAll(_urls: string[], _timeoutMs: number): Promise<ProbeResult[]> {
    throw new Error('ConnectivityStruct._probeAll: Not implemented');
  }
  protected static _proxy(): ProxyInfo {
    throw new Error('ConnectivityStruct._proxy: Not implemented');
  }
}
