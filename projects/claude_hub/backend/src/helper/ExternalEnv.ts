// 纯工具：把「外部消息注入 API」需要的几个值拼成环境变量，注入到 claude/codex 子进程里。
// 目的：跑在会话里的 AI 自己读 `env` 就能拿到当前 rootId/sessionId/token/可达地址，
// 不需要人工告诉它——它要往 bug_tracker 之类的外部系统建确认条目时，直接照抄这几个变量拼 bridge 参数。
import { Root } from '../models/Types';

export class ExternalEnv {
  static build(root: Root, sessionId: string): Record<string, string> {
    const env: Record<string, string> = {
      CLOOTEE_ROOT_ID: root.id,
      CLOOTEE_SESSION_ID: sessionId,
    };
    if (root.externalApiToken) env.CLOOTEE_EXTERNAL_TOKEN = root.externalApiToken;
    if (root.externalApiBaseUrl) env.CLOOTEE_EXTERNAL_BASE_URL = root.externalApiBaseUrl;
    return env;
  }
}
