// 会话元标记（实现）：读写 data/session_meta.json
import * as fs from 'fs';
import { SessionMetaStruct, SessionMetaEntry } from '../logic_struct/SessionMetaStruct';
import { Paths } from '../paths';

export class SessionMeta extends SessionMetaStruct {
  protected static _read(): Record<string, SessionMetaEntry> {
    try {
      if (!fs.existsSync(Paths.SESSION_META_FILE)) return {};
      return JSON.parse(fs.readFileSync(Paths.SESSION_META_FILE, 'utf8')) as Record<string, SessionMetaEntry>;
    } catch {
      return {};
    }
  }

  protected static _write(all: Record<string, SessionMetaEntry>): void {
    fs.writeFileSync(Paths.SESSION_META_FILE, JSON.stringify(all, null, 2), 'utf8');
  }
}
