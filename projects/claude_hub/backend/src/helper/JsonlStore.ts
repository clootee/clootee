// 通用 JSONL（每行一个 JSON 对象）追加型存储工具（业务无关）。
// 与 JsonStore 的区别：这里是"只追加、可流式读"的日志型文件，适合过程轨迹这类高频写入。
// 跨平台：只用 fs/path，不依赖任一平台的 shell 或路径写法。
import * as fs from 'fs';
import * as path from 'path';

export class JsonlStore {
  // 追加一个对象为一行。自动建目录。序列化失败抛错（含文件名，便于定位）。
  static append(file: string, obj: unknown): void {
    if (!file) throw new Error(`JsonlStore.append: invalid file=${file}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let line: string;
    try {
      line = JSON.stringify(obj);
    } catch (e) {
      throw new Error(`JsonlStore.append: stringify failed for ${file}: ${(e as Error).message}`);
    }
    fs.appendFileSync(file, line + '\n', 'utf-8');
  }

  // 读取全部行并逐行解析；坏行（写入中断产生的半行）静默跳过，不让单行毁掉整个文件。
  static readAll<T>(file: string): T[] {
    if (!fs.existsSync(file)) return [];
    const out: T[] = [];
    for (const ln of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
      if (!ln.trim()) continue;
      try {
        out.push(JSON.parse(ln) as T);
      } catch {
        /* 半行/坏行：跳过 */
      }
    }
    return out;
  }

  static exists(file: string): boolean {
    return fs.existsSync(file);
  }

  // 改名（用于草稿 id → 真实 id 的迁移）。源不存在则忽略；目标已存在则把源内容追加进去后删源。
  static rename(from: string, to: string): void {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (fs.existsSync(to)) {
      fs.appendFileSync(to, fs.readFileSync(from, 'utf-8'), 'utf-8');
      fs.unlinkSync(from);
      return;
    }
    fs.renameSync(from, to);
  }

  static remove(file: string): void {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  static sizeBytes(file: string): number {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  }
}
