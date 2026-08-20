// 主配置：端口、claude 可执行命令、权限模式等通用参数
export const AppConfig = {
  // HTTP / WebSocket 端口
  PORT: Number(process.env.PORT) || 8970,

  // 本地 claude CLI 命令名（在 PATH 中）
  CLAUDE_BIN: process.env.CLAUDE_BIN || 'claude',

  // 本地 codex CLI 命令名（在 PATH 中）
  CODEX_BIN: process.env.CODEX_BIN || 'codex',

  // Kimi 转译代理端口：codex 0.141 只支持 Responses API，而 Kimi 只有 Chat Completions，
  // 故本地起一个代理把 codex 的 kimi provider（base_url 指向此端口）转译到 Moonshot。
  KIMI_PROXY_PORT: Number(process.env.KIMI_PROXY_PORT) || 8972,

  // 新建会话时的默认引擎（可被前端设置覆盖并持久化到 data/settings.json）
  DEFAULT_ENGINE: (process.env.DEFAULT_ENGINE === 'codex' ? 'codex' : 'claude') as 'claude' | 'codex',

  // 任务自动执行时的权限模式（本地工具，默认跳过权限确认以便无人值守）
  // 可选：'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  PERMISSION_MODE: process.env.CLAUDE_PERMISSION_MODE || 'bypassPermissions',

  // claude 输出格式（流式 JSON，逐事件解析 thinking / tool / text）
  OUTPUT_FORMAT: 'stream-json',

  // 单条任务最大运行时长（毫秒），超时则强制结束
  TASK_TIMEOUT_MS: Number(process.env.TASK_TIMEOUT_MS) || 1000 * 60 * 30,

  // 引擎启动后多久仍无任何输出（stdout/stderr 都没有）就往界面上报一次「疑似卡住」提示。
  // 部分机器上内置 node/git 被安全软件拦截、或首次运行等待登录时，进程会一直挂着不吭声。
  ENGINE_SILENCE_WARN_MS: Number(process.env.ENGINE_SILENCE_WARN_MS) || 1000 * 45,

  // 引擎"没输出/静默失败"时给用户的处置建议（跟诊断信息一起显示在界面上）
  ENGINE_SILENT_HINT:
    '常见原因：① 内置 Node / Git / 引擎被杀毒软件拦截或没装全；② 引擎首次运行需要登录授权；' +
    '③ 网络或代理不通。可到「设置 → 运行环境」把工具切换为「本机版」后重试，' +
    '或点「重新检测」确认各工具是否可用；完整日志见 data/logs/app.log。',

  // 会话工具命令（/usage 等斜杠命令）最大运行时长（毫秒），超时则强制结束
  COMMAND_TIMEOUT_MS: Number(process.env.COMMAND_TIMEOUT_MS) || 1000 * 60,

  // /compact 需读取整段对话再压缩，耗时远超普通斜杠命令，单独给 10 分钟超时
  COMMAND_COMPACT_TIMEOUT_MS: Number(process.env.COMMAND_COMPACT_TIMEOUT_MS) || 1000 * 60 * 10,

  // 注意：访问密码不在此配置。密码由用户首次打开界面时自行设定，
  // 以 {随机盐, sha256(密码+盐)} 持久化到 data/auth.json（见 AuthManager）。
  // 本项目不存在任何内置/默认口令。

  // 追加系统提示：告知 AI 可在回复正文里用 <chart> 数据块绘制图表（前端 ECharts 渲染）。
  // 仅在数据天然适合可视化时使用，不强制。设为空字符串可关闭。
  CHART_SYSTEM_PROMPT:
    process.env.CHART_SYSTEM_PROMPT ??
    '当回复中包含适合可视化的结构化数据（趋势、占比、对比、排名等）时，' +
    '你可以在正文里插入图表数据块，前端会自动渲染成图表。格式：\n' +
    '<chart type="bar" title="标题" x="类别列名" y="数值列名">\n' +
    '[{"类别列名":"A","数值列名":12},{"类别列名":"B","数值列名":5}]\n' +
    '</chart>\n' +
    'type 可选 bar/line/pie/table；数据为 JSON 数组。不适合可视化时正常用文字/表格回答，不要强行画图。',
};
