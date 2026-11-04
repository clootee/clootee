// 外部消息注入（实现）：postMessage 本身全部由 helper 可达的服务类完成，Struct 已直接写完；
// 这里只覆写唯一需要判断"会话是否还在"的细节步骤。
import { ExternalInboxStruct, DeliveryTarget } from '../logic_struct/ExternalInboxStruct';
import { SessionManager } from './SessionManager';
import { Logger } from '../helper/Logger';

export class ExternalInbox extends ExternalInboxStruct {
  protected static _resolveDeliverySession(rootId: string, sessionId: string): DeliveryTarget {
    try {
      SessionManager.getSession(sessionId);
      return { sessionId, fallback: false };
    } catch {
      const created = SessionManager.createSession(rootId, '', undefined);
      SessionManager.setFavorite(created.id, true);
      Logger.warn('ExternalInbox', 'target session missing, fell back to a new session', {
        rootId,
        sessionId,
        newSessionId: created.id,
      });
      return { sessionId: created.id, fallback: true };
    }
  }
}
