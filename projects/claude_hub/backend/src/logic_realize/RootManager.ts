// 根目录管理（实现）。多数接口在 Struct 以 helper 实现；此处补充需细节处理的方法
import { RootManagerStruct } from '../logic_struct/RootManagerStruct';
import { RootLink } from '../models/Types';

export class RootManager extends RootManagerStruct {
  // 清洗链接：丢弃空 url，trim，url 缺协议时补 https://
  protected static _sanitizeLinks(links: RootLink[]): RootLink[] {
    if (!Array.isArray(links)) return [];
    const out: RootLink[] = [];
    for (const l of links) {
      const url = (l?.url || '').trim();
      if (!url) continue;
      const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url) ? url : 'https://' + url;
      out.push({ label: (l?.label || '').trim() || normalized, url: normalized });
    }
    return out;
  }
}
