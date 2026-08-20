// 纯数据类型定义（无逻辑）

export interface RootLink {
  label: string;
  url: string;
}

export interface Root {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  note?: string;        // 备注
  links?: RootLink[];   // 快捷链接（点击 _blank 打开）
  favorites?: string[]; // 重点文件夹（相对根目录的路径，文件管理器快捷访问）
  templateSkipped?: boolean; // 用户已明确选择「不使用模板」→ 之后不再弹模板选择
}

// 执行引擎：claude code（默认）或 codex。会话创建时选定，一旦开始（有 claudeSessionId 或任务）即锁定。
export type Engine = 'claude' | 'codex';

// 引擎服务商：official=原版订阅登录流程；其余=第三方 API（填 apiKey + 选 model）
// xiaomi=小米 MiMo 开放平台，kimi=月之暗面开放平台（按量），kimicode=Kimi Code 包月订阅，minimax=MiniMax
// ⚠ kimi 与 kimicode 是**两个独立服务商**：端点、Key、模型名全不一样且 Key 不通用，
//   而两者的 Key 都是 sk- 开头（认不出来），所以只能各占一个槽让用户明确选。
export type EngineProvider = 'official' | 'xiaomi' | 'minimax' | 'kimi' | 'kimicode' | 'custom';

// 思考强度（effort）。**空字符串 = 自动**（不传参数，由引擎自己决定）。
// 取值来自 claude CLI 的 `--effort <level>`；codex 走 `-c model_reasoning_effort=<level>`
// （codex 只认 low/medium/high，xhigh/max 会被降级到 high，见 EFFORT_LEVELS 的 codex 字段）。
export type EffortLevel = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// 某个服务商自己的一套设置。**每个服务商一槽，互不干扰**——
// 这是「选原版却看到 MiniMax 模型」那个 bug 的根治：Key/模型/候选缓存都不再跨服务商共用。
export interface ProviderSlot {
  apiKey: string;          // 第三方 API Key（official 槽恒为空）
  model: string;           // 选定模型 id，''=自动
  effort: EffortLevel;     // 思考强度，''=自动
  baseUrl?: string;        // 仅 custom
  modelsUrl?: string;      // 仅 custom；为空时默认 baseUrl + /models
  models?: ModelOption[];  // 「检测可用模型」结果缓存（供前端下拉）
  detected?: ModelDetect;  // 「检测当前模型」结果缓存
}

// 一个引擎的服务商配置。
// ⚠ 这是**投影后的视图**：`provider` 是当前选中的服务商，其余字段全部取自该服务商自己的槽
// （EngineConfigStruct.get() 负责投影）。落盘结构见 EnginesFile.slots。
export interface EngineProviderConfig {
  provider: EngineProvider;
  apiKey: string; // 第三方 API Key（official 时恒为空）
  // custom 时必填；Claude 填 Anthropic 兼容 Base URL，Codex 填 OpenAI Chat Completions Base URL。
  baseUrl?: string;
  // custom 拉模型的完整 URL；为空时默认 baseUrl + /models。
  modelsUrl?: string;
  // 选定的模型 id。**空字符串 = 自动**（不传 --model / -m，完全由引擎自己决定）。
  // official 时也生效：claude 传 `--model`，codex 传 `-m`。
  model: string;
  // 思考强度。''=自动（不传）。claude 传 `--effort`，codex 传 `-c model_reasoning_effort=`。
  effort: EffortLevel;
  models?: ModelOption[];  // 上次「检测可用模型」的结果缓存（供前端下拉）
  detected?: ModelDetect;  // 上次「检测当前模型」的结果缓存
}

export interface EnginesConfig {
  claude: EngineProviderConfig;
  codex: EngineProviderConfig;
}

// 单个引擎的落盘结构：当前选中的服务商 + 每个服务商各自一套设置
export interface EngineFileEntry {
  provider: EngineProvider;
  slots: Partial<Record<EngineProvider, ProviderSlot>>;
}

// data/engines.json 的落盘结构
export interface EnginesFile {
  claude: EngineFileEntry;
  codex: EngineFileEntry;
}

// ── 模型选择能力 ──
// 模型候选来源：catalog=引擎自带模型目录(codex debug models)；api=服务商 /v1/models；
// builtin=内置候选清单（原版 claude 无列表接口时用）；detected=实测当前生效的模型。
export type ModelSource = 'catalog' | 'api' | 'builtin' | 'detected';

export interface ModelOption {
  id: string;        // 传给引擎的模型 id / 别名
  label?: string;    // 展示名
  source: ModelSource;
  verified?: boolean; // 是否经过真实调用验证可用（undefined=未验证）
  // 备注：解析结果（'→ 全名'）或验证失败原因；固定原因用稳定编码，前端按编码翻译
  note?: string;
}

export interface ModelDetect {
  engine: Engine;
  model: string;   // 实测当前生效模型（空=拿不到）
  // 来源的稳定编码（'claude-init' / 'codex-toml' / 'codex-catalog' / 'codex'），前端按编码翻译展示
  source: string;
  ok: boolean;
  error?: string;
  at: number;      // 检测时间
}

export interface EngineModelState {
  engine: Engine;
  provider: EngineProvider;
  selected: string;        // ''=自动
  effort: EffortLevel;     // ''=自动
  // 可选的思考强度档位（供前端下拉，避免前端写死一份）
  efforts: Array<{ id: string; label: string }>;
  options: ModelOption[];
  detected?: ModelDetect;
}

export interface ModelsState {
  claude: EngineModelState;
  codex: EngineModelState;
}

export type TaskStatus = 'pending' | 'running' | 'done' | 'stopped' | 'error';

export interface Task {
  id: string;
  prompt: string;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  held?: boolean;             // 暂定：仍在队列但调度器跳过、不执行（仅对 pending 有意义）
  supplement?: boolean;       // 补充任务：暂停整条序列期间新增，插到冻结队列最前、可越过暂停立即执行
}

// 会话文件元信息（用于聊天内附件卡片 / 文件面板 / 预览）
export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'sheet' | 'md' | 'text' | 'doc' | 'other';

export interface FileMeta {
  name: string; // 相对根目录的路径（统一用 / 分隔）
  sizeKb: number;
  ext: string;
  kind: FileKind;
  previewable: boolean; // 是否支持网页内预览（grid/md/text/pdf/img）
  editable?: boolean;   // 是否可在内置编辑器编辑（纯文本/md/代码）
  mtime: number;
}

// ── 文件管理器（右侧抽屉）：子目录浏览 / 面包屑 / 编辑 / 搜索 / 重点文件夹 ──
export interface DirMeta {
  name: string; // 目录名
  rel: string;  // 相对根目录的路径（统一用 / 分隔）
  mtime: number;
}

export interface Crumb {
  name: string; // 显示名（根目录为根名）
  rel: string;  // 相对根目录的路径（根为 ''）
}

export interface BrowseResult {
  cwd: string;            // 当前相对目录（根为 ''）
  breadcrumb: Crumb[];    // 面包屑（从根到当前）
  dirs: DirMeta[];        // 子目录
  files: FileMeta[];      // 当前目录下的文件（非递归）
  favorites: string[];    // 该根目录设定的重点文件夹（相对路径）
}

export interface FileContent {
  meta: FileMeta;
  content: string;        // 文本内容
  truncated: boolean;     // 是否因过大被截断（截断时不可保存）
}

export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  taskId: string;
  role: MessageRole;
  text: string;
  createdAt: number;
}

// 会话 = Claude Code 自己的会话（~/.claude/projects 下的 jsonl）。hub 不再持久化任何会话/消息，
// 唯一数据源就是 claude 的 jsonl。这里的 Session 只是把 jsonl 元信息 + 运行期队列状态拼到一起的"视图"。
export interface Session {
  // 会话 id = `<rootId>:<claude uuid>`（自描述：含根目录，便于无状态定位 jsonl）。
  // 尚未开始的"新会话草稿"为 `<rootId>:draft-<rand>`，纯运行期、不落盘、发首条消息后由 claude 生成真实 uuid。
  id: string;
  rootId: string;             // 关联的根目录 id
  engine: Engine;             // 执行引擎：claude / codex。草稿创建时选定，开始后锁定
  name: string;               // 标题：取自 claude jsonl（summary / 首条用户消息），草稿为占位
  // claude 会话 uuid（jsonl 文件名）。唯一来源 = claude code 生成并经 stream-json 回报；我们绝不自造。
  // 空 = 草稿尚未开始（首条任务不传 --session-id，让 claude 生成后回写）；有值 = --resume 它。
  claudeSessionId: string;
  paused: boolean;            // 任务流是否暂停（运行期状态，不落盘）
  createdAt: number;
  updatedAt: number;
  tasks: Task[];              // 任务队列（运行期状态，不落盘；后端重启即清空）
  messages: Message[];        // 仅展示用，实时从 claude jsonl 解析，不存第二份
  // 会话来源（从 jsonl 的 promptSource 判定，仅用于前端标记）：
  //   typed=终端/本系统手动输入  sdk=SDK/脚本发起  empty=空会话(无对话)  其余=other
  source: 'typed' | 'sdk' | 'empty' | 'other';
  lastUser?: string;          // 最近一条用户消息（列表项预览用，取自 jsonl，≤120 字）
  pinned?: boolean;           // 是否置顶（hub 自己的标注，与 jsonl 无关，最多同时 3 个）
  favorite?: boolean;         // 是否收藏（hub 自己的全局标注，与 jsonl 无关）
  status?: 'active' | 'testing' | 'completed'; // 手动标记状态（hub 自己的标注），默认 active，可任意互相切换
  customTitle?: string;        // 手动设置的会话标题；为空时按消息/name 自动推导
}

// 全文搜索命中：某会话在标题或对话正文里命中了关键词。
// snippet = 正文命中时的上下文片段（标题命中为空）；前端据 id 在已加载会话列表里放行并展示片段。
export interface SessionSearchHit {
  id: string;       // 命中会话 id（`rootId:uuid`）
  snippet: string;  // 正文命中片段（标题命中时为空串）
}

// ── 过程轨迹（Trace）：Claude/Codex 工作全过程的逐事件记录 ──
// 目的：完整留存 AI 干活的每一步（思考原文、工具完整入参与完整输出、耗时、token），
// 用于回看"它到底做了什么、慢在哪"。与 messages（只有最终回复）互补。
export type TraceKind =
  | 'task_start'   // hub 开始执行一个任务
  | 'task_end'     // 任务结束（成功/失败/被停）
  | 'system'       // 引擎 init 帧：模型、可用工具、cwd、mcp 等
  | 'thinking'     // 思考原文（只有实时流里有，claude 落盘的 jsonl 会抹掉正文）
  | 'text'         // 助手可见正文分段
  | 'tool_use'     // 工具调用（含完整入参，不截断）
  | 'tool_result'  // 工具返回（含完整输出，不截断）
  | 'stderr'       // 子进程 stderr
  | 'result'       // 本轮结束统计：总耗时 / token / 费用
  | 'raw';         // 未识别的引擎事件，原样保留，绝不丢信息

export interface TraceEvent {
  seq: number;              // 该会话内自增序号（同毫秒事件的稳定排序依据）
  ts: number;               // 事件时间（epoch ms）
  taskId: string;           // 归属任务（原生终端会话解析出来的为 `native`）
  kind: TraceKind;
  engine?: Engine;
  name?: string;            // 工具名 / 任务结束状态
  toolId?: string;          // toolu_xxx：tool_use ↔ tool_result 的配对键
  text?: string;            // thinking / text / stderr 全文
  input?: unknown;          // 工具完整入参（对象原样）
  output?: string;          // 工具完整输出
  isError?: boolean;
  model?: string;
  usage?: Record<string, unknown>; // token 用量原样
  costUsd?: number;
  numTurns?: number;
  raw?: unknown;            // kind=raw 时的原始事件
  // ↓ 以下为读取时计算，不落盘
  durationMs?: number;      // tool_result：与配对 tool_use 的间隔（=工具真实执行耗时）
  gapMs?: number;           // 与上一个事件的间隔（=模型生成/等待耗时）
  source?: 'live' | 'jsonl';// 来自实时捕获 还是 claude 落盘 jsonl 反推
}

export interface TraceToolStat {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
  maxMs: number;
}

export interface TraceSlow {
  name: string;
  ms: number;
  ts: number;
  brief: string; // 入参摘要（≤200 字），用于一眼认出是哪次调用
}

// 细分耗时（按相邻事件的间隙归类；单位 ms）。best-effort：
// hub 亲自跑的会话有 thinking_tokens 心跳与真实间隙，分得最准；
// 纯终端 jsonl 反推的会话没有心跳，think/ttft 会并入 genText/genTool，只有工具与总量准确。
export interface TracePhaseBreakdown {
  ttft: number;     // 每轮「工具结果回来 → 模型吐出第一个 token」的等待累计（含思考首字）
  think: number;    // 思考(extended thinking)生成
  genTool: number;  // 生成工具调用（含大 Edit 的入参逐字吐出）
  genText: number;  // 生成可见文字
  toolExec: number; // 工具真实执行（tool_use ↔ tool_result 间隔）
  bgTask: number;   // 后台任务（task_started/task_notification，如编译/PowerShell）
  idle: number;     // 任务之间的用户空闲（不算 AI 工作时间）
  startup: number;  // 启动/init 到首个请求
  other: number;    // 未归类
}

export interface TraceTaskStat {
  taskId: string;
  startedAt: number;
  endedAt: number;
  totalMs: number;
  toolMs: number;
  modelMs: number;
  toolCalls: number;
  phases: TracePhaseBreakdown; // 该任务内的细分耗时
}

// 各类「次数/数量」计数：一眼看清这个会话里 AI 到底做了多少动作、写了多少字。
export interface TraceCounts {
  tasks: number;          // 任务数（task_start）
  turns: number;          // 助手回合数（result 事件）
  textBlocks: number;     // 可见文字段落数
  textChars: number;      // 可见文字总字数
  thinkingBlocks: number; // 思考段数
  thinkingChars: number;  // 思考正文总字数（仅实时捕获的会话有，落盘 jsonl 会被抹掉）
  toolUses: number;       // 工具调用次数
  toolErrors: number;     // 工具报错次数（tool_result.isError）
  toolOutputChars: number;// 工具输出总字数（喂回给模型的量）
  stderrs: number;        // 子进程 stderr 事件数
  retries: number;        // API 重试次数（system:api_retry）
  bgTasks: number;        // 后台任务启动次数（system:task_started）
}

export interface TraceStats {
  sessionId: string;
  events: number;
  spanMs: number;    // 首末事件时间跨度（含任务之间的用户空闲）
  activeMs: number;  // AI 真正工作时间 = spanMs - phases.idle
  rounds: number;    // 模型请求轮数（每次工具结果后重新起一个请求算一轮）
  toolMs: number;    // 工具执行总耗时
  modelMs: number;   // 模型生成/等待总耗时（事件间隙里非工具执行的部分）
  phases: TracePhaseBreakdown; // 全会话细分耗时（thinking/生成/等首token/工具/空闲…）
  counts: TraceCounts;         // 各类次数/数量统计
  toolCalls: number;
  byTool: TraceToolStat[]; // 按总耗时倒序
  slowest: TraceSlow[];    // 最慢的 10 次调用
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
  };
  byTask: TraceTaskStat[];
}

export interface TraceResult {
  sessionId: string;
  events: TraceEvent[];
  liveCount: number;   // 实时捕获的事件数
  jsonlCount: number;  // 从 claude jsonl 反推的事件数
  stats: TraceStats;
}

// ── WebSocket 实时事件（过程视图）。thinking/tool/output 不进入最终消息列表 ──
export type WsEvent =
  | { kind: 'thinking'; sessionId: string; taskId: string; text: string }
  | { kind: 'tool'; sessionId: string; taskId: string; name: string; detail: string }
  | { kind: 'output'; sessionId: string; taskId: string; text: string }
  | { kind: 'message'; sessionId: string; taskId: string; message: Message }
  | { kind: 'task'; sessionId: string; task: Task }
  | { kind: 'session'; session: Session }
  // 运行提示：任务没结束、但出现了用户必须知道的情况（如启动后长时间零输出）
  | { kind: 'notice'; sessionId: string; taskId: string; level: 'warn' | 'error'; message: string }
  // 后端级异常（未捕获异常/Promise 未处理）：与具体会话无关，前端顶部横幅提示
  | { kind: 'serverError'; message: string }
  // 过程轨迹事件（完整不截断）：前端"全过程"视图实时追加用
  | { kind: 'trace'; sessionId: string; taskId: string; event: TraceEvent };
