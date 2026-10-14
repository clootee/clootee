// 纯工具：按「文件签名」做进程内缓存。
// 与业务无关：只认键 + 签名，不认值的语义。同一个文件签名（mtime + 大小）不变时，
// 复用上次算好的值，避免对没变过的文件反复做昂贵的解析。
import * as fs from 'fs';

interface Entry<T> {
  sig: string;
  value: T;
}

export class SignatureCache<T> {
  private readonly _map = new Map<string, Entry<T>>();
  private readonly _max: number;

  // maxEntries：容量上限，超出后按插入顺序淘汰最旧的一条（Map 保持插入序）
  constructor(maxEntries = 500) {
    if (!Number.isFinite(maxEntries) || maxEntries < 1) {
      throw new Error(`SignatureCache: invalid maxEntries=${maxEntries}`);
    }
    this._max = Math.floor(maxEntries);
  }

  // 文件当前签名（`mtimeMs:size`）。文件不存在 / 读取失败返回 ''（调用方据此放弃缓存，不要当成失效）。
  static fileSignature(file: string): string {
    if (!file) return '';
    try {
      const st = fs.statSync(file);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return '';
    }
  }

  // 签名一致才命中；不一致（文件已变）视为未命中并丢弃旧值。
  get(key: string, sig: string): T | undefined {
    if (!key || !sig) return undefined;
    const hit = this._map.get(key);
    if (!hit) return undefined;
    if (hit.sig !== sig) {
      this._map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, sig: string, value: T): T {
    if (!key || !sig) return value;
    this._map.delete(key);
    this._map.set(key, { sig, value });
    while (this._map.size > this._max) {
      const oldest = this._map.keys().next();
      if (oldest.done) break;
      this._map.delete(oldest.value);
    }
    return value;
  }

  // 取缓存，未命中则计算并写入。sig 为空（文件读不到）时直接计算、不缓存。
  memo(key: string, sig: string, make: () => T): T {
    const hit = this.get(key, sig);
    if (hit !== undefined) return hit;
    return this.set(key, sig, make());
  }

  clear(): void {
    this._map.clear();
  }

  get size(): number {
    return this._map.size;
  }
}
