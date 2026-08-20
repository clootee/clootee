// Codex CLI 原生会话存储工具（业务无关）：定位 / 列举 / 读取 ~/.codex/sessions 下的 rollout JSONL。
// 只懂 Codex 的存储约定，不懂"对话"语义。
// 与 Claude 不同：Codex 按日期分目录（sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl），
// 文件里第一行 session_meta 记录 cwd。要按根目录过滤，需读每个文件首行拿 cwd 比对。
// 跨平台：用 os.homedir() 取当前身份 home（可用 CODEX_HOME 覆盖）。
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CodexSessionFile {
  sessionId: string; // session_meta.payload.id（uuid）
  file: string;      // 绝对路径
  cwd: string;       // 该会话的工作目录（首行 session_meta.payload.cwd）
  mtimeMs: number;
  createdAt: number; // 首行 timestamp（毫秒）
}

export class CodexStoreHelper {
  // ~/.codex（可用 CODEX_HOME 覆盖）
  static codexHome(): string {
    return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  }

  static sessionsRoot(): string {
    return path.join(this.codexHome(), 'sessions');
  }

  // 递归收集 sessions 目录下所有 rollout-*.jsonl 的绝对路径
  private static _walkFiles(dir: string, out: string[]): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) this._walkFiles(fp, out);
      else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) out.push(fp);
    }
  }

  // 只读文件开头若干块，取到第一行换行为止（避免为拿首行元信息而整体载入大对话文件）
  private static _readFirstLine(file: string): string {
    const CHUNK = 64 * 1024;
    const MAX = 4 * 1024 * 1024; // 首行（含 base_instructions）上限，超出即放弃
    let fd = -1;
    try {
      fd = fs.openSync(file, 'r');
      const buf = Buffer.alloc(CHUNK);
      let acc = '';
      let pos = 0;
      while (pos < MAX) {
        const n = fs.readSync(fd, buf, 0, CHUNK, pos);
        if (n <= 0) break;
        acc += buf.toString('utf8', 0, n);
        const nl = acc.indexOf('\n');
        if (nl >= 0) return acc.slice(0, nl);
        pos += n;
      }
      return acc;
    } catch {
      return '';
    } finally {
      if (fd >= 0) try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }

  // 读取文件首行（session_meta），失败返回 null
  private static _readMeta(file: string): { id: string; cwd: string; createdAt: number } | null {
    try {
      const first = this._readFirstLine(file);
      if (!first) return null;
      const o = JSON.parse(first);
      const p = o && o.payload ? o.payload : {};
      if (!p.id) return null;
      const ts = p.timestamp || o.timestamp;
      const createdAt = ts ? Date.parse(ts) || 0 : 0;
      return { id: String(p.id), cwd: String(p.cwd || ''), createdAt };
    } catch {
      return null;
    }
  }

  // 全量索引：扫描所有 rollout 文件，解析首行拿 id/cwd（按 mtime 倒序）
  static index(): CodexSessionFile[] {
    const files: string[] = [];
    this._walkFiles(this.sessionsRoot(), files);
    const out: CodexSessionFile[] = [];
    for (const file of files) {
      const meta = this._readMeta(file);
      if (!meta) continue;
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(file).mtimeMs;
      } catch {
        continue;
      }
      out.push({ sessionId: meta.id, file, cwd: meta.cwd, mtimeMs, createdAt: meta.createdAt || mtimeMs });
    }
    return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  // 路径归一（Windows 大小写/斜杠不敏感）
  private static _norm(p: string): string {
    let s = (p || '').replace(/[\\/]+/g, '/').replace(/\/+$/, '');
    if (process.platform === 'win32') s = s.toLowerCase();
    return s;
  }

  // 某工作目录下的所有 codex 会话（cwd 精确匹配根目录绝对路径）
  static listByCwd(absPath: string): CodexSessionFile[] {
    const target = this._norm(absPath);
    return this.index().filter((f) => this._norm(f.cwd) === target);
  }

  // 按 uuid 定位文件（全量索引里查）
  static findFile(uuid: string): CodexSessionFile | null {
    if (!uuid) return null;
    return this.index().find((f) => f.sessionId === uuid) || null;
  }

  // 该会话是否存在（用于决定能否 resume）
  static sessionExists(uuid: string): boolean {
    return !!this.findFile(uuid);
  }

  // 读取为非空行数组（每行一个 JSON 帧）；不存在抛错
  static readLines(file: string): string[] {
    if (!fs.existsSync(file)) throw new Error(`CodexStoreHelper.readLines: file not found ${file}`);
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  }

  // 删除指定会话的 rollout 文件（不存在则忽略）
  static removeSessionFile(uuid: string): void {
    const f = this.findFile(uuid);
    if (!f) return;
    try {
      if (fs.existsSync(f.file)) fs.unlinkSync(f.file);
    } catch {
      /* 文件可能已不存在/被占用 */
    }
  }
}
