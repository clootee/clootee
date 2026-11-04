// 纯工具：读取本机所有非内网回环的 IPv4 地址，拼成局域网访问 URL。
// 与业务无关，可独立测试。跨平台（依赖 Node 内置 os，Linux/Windows/macOS 通用）。
// 结果按「越像真实局域网网卡」排序：192.168.* > 10.* > 172.16-31.*，虚拟网卡/VPN 降权，
// 使排在最前的地址最可能是手机/其他设备真正能访问的那个（前端据此打「推荐」标签）。
import * as os from 'os';

// 虚拟网卡/VPN/回环别名等（这些地址别的设备一般路由不到，应排在最后）。
const VIRTUAL_IFACE = /(vethernet|virtual|hyper-?v|default switch|wsl|docker|vmware|vbox|loopback|vpn|tun|tap|singbox|clash|shadow|zerotier|tailscale|utun|ppp|radmin)/i;
// 常见的物理无线/以太网卡名（略加权）。
const PHYSICAL_IFACE = /(wlan|wi-?fi|wireless|ethernet|以太网|无线|局域网|\ben\d|\beth\d)/i;

export class NetHelper {
  // 给某个 (ip, 网卡名) 打分：分数越高越优先展示。
  private static _rank(ip: string, ifName: string): number {
    let score = 0;
    if (/^192\.168\./.test(ip)) score += 100;              // 最常见的家庭/办公局域网
    else if (/^10\./.test(ip)) score += 60;                // 较大规模内网
    else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) score += 20; // 私网，但多为 Docker/Hyper-V/VPN 虚拟网段
    else score += 40;                                      // 其它（一般也是私网）
    if (VIRTUAL_IFACE.test(ifName)) score -= 60;           // 虚拟网卡/VPN：其它设备一般连不上
    if (PHYSICAL_IFACE.test(ifName)) score += 10;          // 物理无线/以太网卡：更可信
    return score;
  }

  // 返回本机所有可用于访问的 IPv4（去掉内部/回环），按优先级从高到低排序。
  static lanIps(): string[] {
    const ifaces = os.networkInterfaces();
    const rows: Array<{ ip: string; score: number }> = [];
    for (const name of Object.keys(ifaces)) {
      for (const a of ifaces[name] || []) {
        const isV4 = a.family === 'IPv4' || (a.family as unknown as number) === 4;
        if (!isV4 || a.internal || a.address === '127.0.0.1') continue;
        rows.push({ ip: a.address, score: this._rank(a.address, name) });
      }
    }
    // 分数降序；同分保持原顺序稳定
    rows.sort((x, y) => y.score - x.score);
    return rows.map((r) => r.ip);
  }

  // 拼成 http://<ip>:<port> 列表（供前端展示 + 复制），已按优先级排序，第一个即推荐地址。
  static lanUrls(port: number): string[] {
    if (!Number.isFinite(port) || port <= 0)
      throw new Error(`NetHelper.lanUrls: invalid port=${port}`);
    return this.lanIps().map((ip) => `http://${ip}:${port}`);
  }
}
