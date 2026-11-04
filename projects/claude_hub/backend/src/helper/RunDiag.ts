// 运行诊断文本（业务无关）：把「跑了哪个命令、在哪跑、怎么结束的」拼成人能直接看懂的一段话。
// 用途：子进程静默失败（没输出、没报错）时，前端界面要能显示到底发生了什么，而不是一片空白。
// 纯函数：只做字符串处理，不读配置、不碰进程、不写日志。
export interface RunDiagInput {
  bin: string;                 // 实际启动的可执行文件
  args?: string[];             // 命令行参数
  cwd?: string;                // 工作目录
  exitCode?: number | null;    // 退出码（未退出则不传）
  stderr?: string;             // 子进程 stderr 累积内容
  elapsedMs?: number;          // 从启动到现在/退出的耗时
  hint?: string;               // 给用户的处置建议（可选，追加在末尾）
}

// spawn 抛出的系统错误码 → 人话解释
const ERRNO_TEXT: Record<string, string> = {
  ENOENT: '找不到可执行文件（文件不存在，或它依赖的解释器不在 PATH 里）',
  EACCES: '没有执行权限（文件不可执行，或被安全软件拦截）',
  EPERM: '操作被系统拒绝（常见于杀毒软件/权限限制）',
  ENOEXEC: '文件不是本机可执行格式（下载损坏或平台/架构不匹配）',
  EFTYPE: '目标不是可执行程序（路径指向了普通文件，或下载损坏）',
  EMFILE: '系统打开的文件句柄过多',
  UNKNOWN: '系统未提供具体原因（Windows 上常见于被安全软件拦截）',
};

const MAX_STDERR = 1500;

export class RunDiag {
  // 拼装诊断文本：每行一条事实，最后可选一行处置建议
  static format(input: RunDiagInput): string {
    if (!input || typeof input.bin !== 'string')
      throw new Error(`RunDiag.format: invalid input=${JSON.stringify(input)}`);
    const lines: string[] = [];
    lines.push(`命令：${input.bin || '(空)'}`);
    if (input.args && input.args.length) lines.push(`参数：${this._brief(input.args)}`);
    if (input.cwd) lines.push(`工作目录：${input.cwd}`);
    if (input.exitCode !== undefined) lines.push(`退出码：${String(input.exitCode)}`);
    if (input.elapsedMs !== undefined) lines.push(`耗时：${Math.round(input.elapsedMs / 1000)} 秒`);
    const err = (input.stderr || '').trim();
    if (err) lines.push(`错误输出：\n${err.slice(0, MAX_STDERR)}`);
    if (input.hint) lines.push(input.hint);
    return lines.join('\n');
  }

  // 把 spawn/exec 抛出的错误翻译成「原因 + 原始信息」
  static explain(error: unknown, bin: string): string {
    const code = this._errno(error);
    const raw = error instanceof Error ? error.message : String(error);
    const why = code && ERRNO_TEXT[code] ? ERRNO_TEXT[code] : '';
    const head = why ? `启动失败：${why}` : '启动失败';
    return `${head}\n命令：${bin || '(空)'}\n原始信息：${raw}`;
  }

  private static _errno(error: unknown): string {
    const c = (error as { code?: unknown } | null)?.code;
    return typeof c === 'string' ? c : '';
  }

  // 参数过长时只保留头尾，避免把整段系统提示词灌进界面
  private static _brief(args: string[]): string {
    const one = args.map((a) => (a.length > 120 ? `${a.slice(0, 60)}…(共${a.length}字)` : a)).join(' ');
    return one.length > 600 ? `${one.slice(0, 600)}…` : one;
  }
}
