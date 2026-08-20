// 通用 JSON 文件读写工具（业务无关）。原子写入，自动建目录
import * as fs from 'fs';
import * as path from 'path';

export class JsonStore {
  static read<T>(file: string, fallback: T): T {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  }

  static write(file: string, data: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  static remove(file: string): void {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  static listJsonFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  }
}
