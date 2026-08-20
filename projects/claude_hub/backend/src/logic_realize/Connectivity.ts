// 网络体检（实现）：真正去发探测请求、读代理环境变量。
// 探测本身全在纯工具 NetProbe 里（可独立测试），这里只负责接线与日志。
import { ConnectivityStruct } from '../logic_struct/ConnectivityStruct';
import { NetProbe, ProbeResult, ProxyInfo } from '../helper/NetProbe';
import { Logger } from '../helper/Logger';

export class Connectivity extends ConnectivityStruct {
  protected static async _probeAll(urls: string[], timeoutMs: number): Promise<ProbeResult[]> {
    const results = await NetProbe.all(urls, timeoutMs);
    Logger.info('Connectivity', 'probe done', {
      ok: results.filter((r) => r.ok).length,
      total: results.length,
    });
    return results;
  }

  protected static _proxy(): ProxyInfo {
    return NetProbe.proxy();
  }
}
