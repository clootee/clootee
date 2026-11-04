import type { Session, Message } from '../models/Types';
import { CostPolicy } from './CostPolicy';

// Count user turns, never assistant fragments or tool calls. Pending tasks reserve slots.
export class SessionLimit {
  static status(session: Session, messages: Message[], rawPolicy: unknown) {
    const policy = CostPolicy.sanitize(rawPolicy);
    const users = messages.filter(m => m.role === 'user');
    const running = session.tasks.filter(t => t.status === 'running'
      && !users.some(m => m.createdAt >= (t.startedAt || t.createdAt)));
    const count = users.length + running.length;
    const queued = session.tasks.filter(t => t.status === 'pending').length;
    return { count, queued, warnAt: policy.warnMessages, max: policy.maxMessages,
      warning: count + queued >= policy.warnMessages, blocked: count + queued >= policy.maxMessages };
  }
  static assertCapacity(status: ReturnType<typeof SessionLimit.status>, incoming: number, includeQueued = true): void {
    if (status.count + (includeQueued ? status.queued : 0) + incoming > status.max) {
      throw new Error('session_message_limit_reached');
    }
  }
}
