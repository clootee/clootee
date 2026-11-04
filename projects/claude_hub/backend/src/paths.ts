// 路径常量：集中管理 data 目录下各资源位置
import * as path from 'path';

const DATA_ROOT = path.resolve(__dirname, '../../data');
// 项目根目录（claude_hub 文件夹本身，即 restart.sh/restart.bat 所在处）；
// 版本更新功能据此定位重启脚本，git 命令的 cwd 也用它（git 会自动向上找到 .git，不要求它正好是仓库顶层）
const PROJECT_ROOT = path.resolve(__dirname, '../..');

export const Paths = {
  DATA_ROOT,
  PROJECT_ROOT,
  ROOTS_FILE: path.join(DATA_ROOT, 'roots.json'),
  // 目录私有密码（每个根目录独立：盐 + 哈希）；有记录=该目录已设为私有
  ROOT_LOCKS_FILE: path.join(DATA_ROOT, 'root_locks.json'),
  SETTINGS_FILE: path.join(DATA_ROOT, 'settings.json'),
  SESSION_META_FILE: path.join(DATA_ROOT, 'session_meta.json'),
  // 运行期任务队列快照：进程重启后据此恢复各会话的 pending/暂停状态，避免队列丢失
  QUEUE_STATE_FILE: path.join(DATA_ROOT, 'queue_state.json'),
  // 首启由用户设定的访问密码（盐 + 哈希）持久化于此；不存在=尚未初始化，需先设定密码
  AUTH_FILE: path.join(DATA_ROOT, 'auth.json'),
  // 各引擎（claude/codex）服务商配置（原版 / minimax / kimi + apiKey + model）
  ENGINES_FILE: path.join(DATA_ROOT, 'engines.json'),
  // Clootee 默认服务商（console.clootee.com）发给本机的设备令牌与安装 id；真实凭据，已在 .gitignore
  CONSOLE_FILE: path.join(DATA_ROOT, 'console.json'),
  // OpenRouter 公开价目缓存（/api/v1/models），计费用；定期刷新
  OPENROUTER_PRICES_FILE: path.join(DATA_ROOT, 'openrouter_prices.json'),
  LOGS_DIR: path.join(DATA_ROOT, 'logs'),
  // 过程轨迹：data/traces/<rootId>/<claudeSessionId>.jsonl（AI 工作全过程逐事件记录）
  TRACES_DIR: path.join(DATA_ROOT, 'traces'),
  FRONTEND_DIR: path.resolve(__dirname, '../../frontend'),
  // 外设库：内置便携版 node / claude code / codex，随软件下发，双击即用
  OUT_END_DIR: path.resolve(__dirname, '../../out_end'),
};
