// Claude Code 原生会话存储工具：定位 / 列举 / 读取 ~/.claude/projects 下的会话 JSONL。
// 业务无关——只懂 Claude 的存储约定（按工作目录绝对路径编码成目录名），不懂"对话"语义。
// 跨平台：用 os.homedir() 取当前运行身份的 home（Linux=claudeuser，Windows=当前用户）。
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface NativeSessionFile {
  sessionId: string;  // 文件名去掉 .jsonl，即 claude session uuid
  file: string;       // 绝对路径
  mtimeMs: number;
  size: number;
}

export class ClaudeStoreHelper {
  // claude 配置目录（~/.claude，可用 CLAUDE_CONFIG_DIR 覆盖）
  static configDir(): string {
    return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  }

  // claude 全局设置文件（~/.claude/settings.json）
  static settingsFile(): string {
    return path.join(this.configDir(), 'settings.json');
  }

  // ~/.claude/projects 根（可用环境变量覆盖 claude 配置目录）
  static projectsRoot(): string {
    return path.join(this.configDir(), 'projects');
  }

  // Claude 把工作目录绝对路径里所有非字母数字字符替换为 '-' 作为存储目录名
  static encodePath(absPath: string): string {
    if (!absPath || typeof absPath !== 'string')
      throw new Error(`ClaudeStoreHelper.encodePath: invalid absPath=${absPath}`);
    return absPath.replace(/[^a-zA-Z0-9]/g, '-');
  }

  // 某工作目录对应的会话存储目录
  static projectDir(absPath: string): string {
    return path.join(this.projectsRoot(), this.encodePath(absPath));
  }

  // 列出该工作目录下所有会话文件，按修改时间倒序；目录不存在返回 []
  static listSessionFiles(absPath: string): NativeSessionFile[] {
    const dir = this.projectDir(absPath);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => {
        const fp = path.join(dir, f);
        const st = fs.statSync(fp);
        return { sessionId: f.replace(/\.jsonl$/, ''), file: fp, mtimeMs: st.mtimeMs, size: st.size };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  // 单个会话文件绝对路径
  static sessionFile(absPath: string, sessionId: string): string {
    if (!sessionId || typeof sessionId !== 'string')
      throw new Error(`ClaudeStoreHelper.sessionFile: invalid sessionId=${sessionId}`);
    return path.join(this.projectDir(absPath), `${sessionId}.jsonl`);
  }

  // 该会话的 jsonl 是否真实存在（用于决定能否 --resume；不存在则不可续接）
  static sessionExists(absPath: string, sessionId: string): boolean {
    if (!sessionId) return false;
    return fs.existsSync(this.sessionFile(absPath, sessionId));
  }

  // 读取文件为非空行数组（每行一个 JSON 帧，调用方负责解析）；不存在抛错
  static readLines(file: string): string[] {
    if (!fs.existsSync(file)) throw new Error(`ClaudeStoreHelper.readLines: file not found ${file}`);
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  }

  // 删除某工作目录下指定会话的 jsonl（不存在则忽略）
  static removeSessionFile(absPath: string, uuid: string): void {
    const f = this.sessionFile(absPath, uuid);
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
      /* 文件可能已不存在/被占用 */
    }
  }

  // 文件最近修改时间（毫秒）；不存在返回 0
  static mtimeMs(file: string): number {
    try {
      return fs.statSync(file).mtimeMs;
    } catch {
      return 0;
    }
  }
}
