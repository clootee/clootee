// 路径常量：集中管理 data 目录下各资源位置
import * as path from 'path';

const DATA_ROOT = path.resolve(__dirname, '../../data');

export const Paths = {
  DATA_ROOT,
  ROOTS_FILE: path.join(DATA_ROOT, 'roots.json'),
  SETTINGS_FILE: path.join(DATA_ROOT, 'settings.json'),
  SESSION_META_FILE: path.join(DATA_ROOT, 'session_meta.json'),
  // 运行期任务队列快照：进程重启后据此恢复各会话的 pending/暂停状态，避免队列丢失
  QUEUE_STATE_FILE: path.join(DATA_ROOT, 'queue_state.json'),
  // 首启由用户设定的访问密码（盐 + 哈希）持久化于此；不存在=尚未初始化，需先设定密码
  AUTH_FILE: path.join(DATA_ROOT, 'auth.json'),
  // 各引擎（claude/codex）服务商配置（原版 / minimax / kimi + apiKey + model）
  ENGINES_FILE: path.join(DATA_ROOT, 'engines.json'),
  LOGS_DIR: path.join(DATA_ROOT, 'logs'),
  // 过程轨迹：data/traces/<rootId>/<claudeSessionId>.jsonl（AI 工作全过程逐事件记录）
  TRACES_DIR: path.join(DATA_ROOT, 'traces'),
  FRONTEND_DIR: path.resolve(__dirname, '../../frontend'),
  // 外设库：内置便携版 node / claude code / codex，随软件下发，双击即用
  OUT_END_DIR: path.resolve(__dirname, '../../out_end'),
};
