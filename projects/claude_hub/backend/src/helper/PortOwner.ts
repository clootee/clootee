// 纯工具（业务无关）：查「某个 TCP 端口现在被哪个进程占着」，并把它描述成人能看懂的一段话。
// 用途：后端起不来（EADDRINUSE）或端口被别人抢走时，日志里要能直接指名道姓，
// 而不是只留一句 "address already in use" 让人事后无从追查。
//
// 跨平台：Windows 用 netstat + tasklist + PowerShell(取命令行)，Linux/macOS 用 ss/lsof + ps。
// 全部走同步 execSync 且带超时：调用点都在「出事时」或「低频心跳」，不在热路径上。
import { execSync } from 'child_process';

export interface PortOwnerInfo {
  pid: number;
  name?: string;      // 进程名（node.exe / node）
  cmdline?: string;   // 完整命令行，用来区分「是我自己」还是「别人」
  user?: string;      // 属主
  startedAt?: string; // 进程启动时间
}

const EXEC_TIMEOUT_MS = 4000;
const MAX_CMDLINE = 300;

export class PortOwner {
  // 查占用该端口（LISTEN 状态）的所有进程。查不到返回空数组；命令本身失败也返回空数组，绝不抛。
  static of(port: number): PortOwnerInfo[] {
    if (!Number.isFinite(port) || port <= 0)
      throw new Error(`PortOwner.of: invalid port=${port}`);
    const pids = this._listeningPids(port);
    return pids.map((pid) => this._describe(pid));
  }

  // 拼成一行行人话，直接写进日志。查不到占用者时给出明确说明（这本身也是线索）。
  static describe(port: number): string {
    const list = this.of(port);
    if (list.length === 0)
      return `端口 ${port} 当前查不到监听进程（可能已释放，或本进程权限不足以看到对方）`;
    return list
      .map((p) => {
        const parts = [`pid=${p.pid}`];
        if (p.name) parts.push(`进程=${p.name}`);
        if (p.user) parts.push(`用户=${p.user}`);
        if (p.startedAt) parts.push(`启动于=${p.startedAt}`);
        if (p.cmdline) parts.push(`命令行=${p.cmdline}`);
        return `端口 ${port} 被占用：${parts.join(' ')}`;
      })
      .join('\n');
  }

  // 该端口是否正被「本进程」监听（心跳自检用：端口易主是服务被顶掉的直接证据）。
  static isOwnedBy(port: number, pid: number): boolean {
    if (!Number.isFinite(pid) || pid <= 0)
      throw new Error(`PortOwner.isOwnedBy: invalid pid=${pid}`);
    return this._listeningPids(port).includes(pid);
  }

  // ── 内部：取监听该端口的 pid 列表 ──
  private static _listeningPids(port: number): number[] {
    const out =
      process.platform === 'win32'
        ? this._run('netstat -ano -p tcp')
        : this._run(`ss -lptnH 'sport = :${port}'`) || this._run(`lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    if (!out) return [];
    return process.platform === 'win32' ? this._winPids(out, port) : this._nixPids(out);
  }

  // netstat 输出形如：  TCP    127.0.0.1:8970    0.0.0.0:0    LISTENING    20044
  private static _winPids(out: string, port: number): number[] {
    const pids = new Set<number>();
    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      const cols = line.trim().split(/\s+/);
      const local = cols[1] || '';
      if (!new RegExp(`[:.]${port}$`).test(local)) continue;
      const pid = Number(cols[cols.length - 1]);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  }

  // ss:   users:(("node",pid=1234,fd=20))      lsof: node  1234 user ...
  private static _nixPids(out: string): number[] {
    const pids = new Set<number>();
    for (const m of out.matchAll(/pid=(\d+)/g)) pids.add(Number(m[1]));
    if (pids.size === 0) {
      for (const line of out.split(/\r?\n/).slice(1)) {
        const pid = Number((line.trim().split(/\s+/)[1] || '').trim());
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
    }
    return [...pids];
  }

  // ── 内部：把 pid 展开成进程详情 ──
  private static _describe(pid: number): PortOwnerInfo {
    return process.platform === 'win32' ? this._winInfo(pid) : this._nixInfo(pid);
  }

  private static _winInfo(pid: number): PortOwnerInfo {
    const info: PortOwnerInfo = { pid };
    // tasklist 一定有，先拿到进程名（CSV："node.exe","20044","Console","1","67,300 K"）
    const tl = this._run(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
    const name = tl && tl.startsWith('"') ? tl.split('","')[0].replace(/^"/, '') : '';
    if (name && !/^INFO:/i.test(name)) info.name = name;
    // 命令行/属主/启动时间要靠 CIM，取不到就算了（不影响主要线索）
    const ps = this._run(
      'powershell -NoProfile -NonInteractive -Command ' +
        `"$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}';` +
        `if($p){$o=Invoke-CimMethod -InputObject $p -MethodName GetOwner;` +
        `Write-Output ($p.CommandLine + '|' + $o.User + '|' + $p.CreationDate.ToString('s'))}"`,
    );
    if (ps) {
      const [cmdline, user, startedAt] = ps.split('|');
      if (cmdline) info.cmdline = cmdline.slice(0, MAX_CMDLINE);
      if (user) info.user = user;
      if (startedAt) info.startedAt = startedAt;
    }
    return info;
  }

  private static _nixInfo(pid: number): PortOwnerInfo {
    const info: PortOwnerInfo = { pid };
    const out = this._run(`ps -o comm=,user=,lstart=,args= -p ${pid}`);
    if (!out) return info;
    const cols = out.split(/\s+/);
    info.name = cols[0];
    info.user = cols[1];
    info.startedAt = cols.slice(2, 7).join(' ');
    info.cmdline = cols.slice(7).join(' ').slice(0, MAX_CMDLINE);
    return info;
  }

  // 跑一条命令拿 stdout；失败/超时一律返回空串（诊断代码不允许把主流程搞挂）
  private static _run(cmd: string): string {
    try {
      return execSync(cmd, {
        timeout: EXEC_TIMEOUT_MS,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch {
      return '';
    }
  }
}
