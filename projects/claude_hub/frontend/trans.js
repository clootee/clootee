// 国际化字典与翻译函数。至少支持 zh / en
const DICT = {
  title: { en: 'Clootee', zh: 'Clootee' },
  tagline: {
    en: 'Making Claude Code / Codex easier to use',
    zh: '让 Claude Code / Codex 更易用',
  },
  root: { en: 'Workspace', zh: '工作目录' },
  addRoot: { en: 'Add Workspace', zh: '添加工作目录' },
  // ── 添加工作目录引导 / 新建项目 / 选择模板 ──
  argTitle: { en: 'Add a working directory', zh: '添加工作目录' },
  argExistingT: { en: 'Choose an existing directory', zh: '选择已有目录' },
  argExistingD: { en: 'Pick a folder already on your computer', zh: '从电脑里已有的文件夹中选择' },
  argNewT: { en: 'Create a new project', zh: '新建项目' },
  argNewD: { en: 'Name it and pick where to create it', zh: '取个名字并选择创建位置' },
  npTitle: { en: 'Create a new project', zh: '新建项目' },
  npNameLabel: { en: 'Project name', zh: '项目名称' },
  npNameHint: {
    en: 'Letters, digits and underscore only (no spaces or Chinese) — it becomes the folder name.',
    zh: '只能是英文字母、数字和下划线（不能有空格或中文）——它就是文件夹名。',
  },
  npParentLabel: { en: 'Create inside', zh: '创建到' },
  npCreate: { en: 'Create project', zh: '创建项目' },
  npNameInvalid: { en: 'Invalid name: only A–Z a–z 0–9 _ allowed', zh: '名称非法：只允许英文字母、数字和下划线' },
  npParentRequired: { en: 'Please choose a directory to create in', zh: '请选择创建到的目录' },
  npWillCreate: { en: 'Will create: ', zh: '将创建：' },
  npFolderExists: {
    en: 'The folder already exists:\n{path}\n\nUse it as the workspace? Nothing inside will be modified or deleted.',
    zh: '该文件夹已存在：\n{path}\n\n是否直接使用它作为工作目录？不会修改或删除其中的任何文件。',
  },
  tpTitle: { en: 'Pick a project template', zh: '选择项目模板' },
  tpHint: {
    en: 'This project has no CLAUDE.md / AGENTS.md yet. Pick a template to add sensible dev conventions, or skip.',
    zh: '该项目还没有 CLAUDE.md / AGENTS.md。选一个模板自动写入合理的开发规范，也可以跳过。',
  },
  tpCustomLabel: { en: 'Your templates', zh: '你的模板' },
  tpNoneT: { en: 'No template', zh: '不使用模板' },
  tpNoneD: { en: 'Start empty, add conventions later', zh: '先留空，之后再补规范' },
  rwWorking: { en: 'Setting up…', zh: '正在准备…' },
  rwStepDir: { en: 'Preparing directory…', zh: '正在准备目录…' },
  rwStepList: { en: 'Refreshing workspace…', zh: '正在刷新工作区…' },
  rwStepTpl: { en: 'Writing template files…', zh: '正在写入模板文件…' },
  rwStepDone: { en: 'Done', zh: '完成' },
  tpApplying: { en: 'Applying template…', zh: '正在写入模板…' },
  tpDone: { en: 'Template applied', zh: '模板已写入' },
  browse: { en: 'Browse…', zh: '浏览…' },
  rootName: { en: 'Name', zh: '名称' },
  rootPath: { en: 'Absolute Path', zh: '绝对路径' },
  removeRoot: { en: 'Remove', zh: '删除' },
  editRoot: { en: 'Edit', zh: '编辑' },
  noteLinks: { en: 'Note & links', zh: '备注与链接' },
  addNoteLink: { en: '＋ Add note / links', zh: '＋ 添加备注 / 链接' },
  editRootTitle: { en: 'Directory note & links', zh: '目录备注与链接' },
  gitPushing: { en: 'Running git push…', zh: '正在执行 git push…' },
  gitPushOk: { en: 'git push done', zh: 'git push 完成' },
  gitPushFail: { en: 'git push failed', zh: 'git push 失败' },
  note: { en: 'Note', zh: '备注' },
  notePlaceholder: { en: 'A note for this directory…', zh: '该目录的备注…' },
  links: { en: 'Links', zh: '链接' },
  addLink: { en: '＋ Link', zh: '＋ 链接' },
  linkLabel: { en: 'Label', zh: '名称' },
  linkUrl: { en: 'URL', zh: '网址' },
  save: { en: 'Save', zh: '保存' },
  noLinks: { en: 'No links', zh: '暂无链接' },
  // 工作台模式
  modeClassic: { en: '🗂 Classic', zh: '🗂 经典' },
  modeWorkspace: { en: '🧭 Workspace', zh: '🧭 工作台' },
  modeToggleHint: { en: 'Switch between classic and workspace mode', zh: '在经典模式与工作台模式间切换' },
  wsPickDirTitle: { en: 'Choose a working directory', zh: '选择工作目录' },
  wsRecentLabel: { en: 'Recent directories', zh: '近期目录' },
  wsNoRecent: { en: 'No recent directories yet — add one below', zh: '暂无近期目录，请在下方添加' },
  wsAddDirLabel: { en: 'Add a directory', zh: '添加目录' },
  wsDirPathPlaceholder: { en: 'Absolute path (e.g. D:\\projects\\foo)', zh: '绝对路径（如 D:\\projects\\foo）' },
  wsBrowse: { en: 'Browse…', zh: '浏览…' },
  wsCreateIfMissing: { en: 'Create the directory if it does not exist', zh: '目录不存在则创建' },
  wsUseDir: { en: 'Use this directory & new session', zh: '使用此目录并新建会话' },
  sessions: { en: 'Sessions', zh: '会话' },
  newSession: { en: 'New Session', zh: '新建会话' },
  noSessions: { en: 'No sessions under this workspace', zh: '该工作目录下暂无会话' },
  search: { en: 'Search', zh: '搜索' },
  searchSessions: { en: 'Search session titles…', zh: '搜索会话标题…' },
  advancedSearch: { en: 'Full-text', zh: '全文搜索' },
  noSearchResults: { en: 'No matching sessions', zh: '没有匹配的会话' },
  tabActive: { en: 'Active', zh: '活跃' },
  tabTesting: { en: 'Testing', zh: '待测试' },
  tabCompleted: { en: 'Completed', zh: '已完成' },
  tabAll: { en: 'All', zh: '所有' },
  runTabRunning: { en: 'Running', zh: '执行中' },
  runTabJustFinished: { en: 'Just ran', zh: '刚执行完' },
  runTabAll: { en: 'All', zh: '所有' },
  noRunningSessions: { en: 'No running sessions', zh: '暂无执行中的会话' },
  noJustFinishedSessions: { en: 'No just-ran sessions', zh: '暂无刚执行完的会话' },
  noRunOrFinishedSessions: { en: 'No running or just-ran sessions', zh: '暂无执行中或刚执行完的会话' },
  noActiveSessions: { en: 'No active sessions', zh: '暂无活跃会话' },
  noTestingSessions: { en: 'No sessions pending test', zh: '暂无待测试会话' },
  noCompletedSessions: { en: 'No completed sessions', zh: '暂无已完成会话' },
  markActive: { en: 'Mark as active', zh: '标记为活跃' },
  markTesting: { en: 'Mark as pending test', zh: '标记为待测试' },
  markCompleted: { en: 'Mark as completed', zh: '标记为已完成' },
  renameSession: { en: 'Rename title', zh: '修改标题' },
  renameSessionPrompt: { en: 'Edit session title. Leave empty to use the automatic title.', zh: '修改会话标题。留空则恢复自动标题。' },
  pinSession: { en: 'Pin', zh: '置顶' },
  unpinSession: { en: 'Unpin', zh: '取消置顶' },
  // ── 会话统计详情（右键 → 统计详情）：时间花在哪 ──
  ctxTraceStats: { en: '📊 Timing stats', zh: '📊 统计详情' },
  statsTitle: { en: 'Timing stats', zh: '统计详情' },
  statsLoading: { en: 'Loading…', zh: '加载中…' },
  statsFailed: { en: 'Failed to load: ', zh: '读取失败：' },
  statsEmpty: { en: 'No trace data (this session may not have run any task yet).', zh: '没有过程数据（该会话可能还没跑过任务）。' },
  statsNeedRestart: { en: 'Backend not restarted yet — the detailed breakdown needs one hub restart to take effect.', zh: '后端还没重启——细分统计需要重启一次 hub 后端才会生效。' },
  statsSpan: { en: 'Total span', zh: '总跨度' },
  statsActive: { en: 'AI working', zh: 'AI 实际工作' },
  statsIdle: { en: 'User idle', zh: '用户空闲' },
  statsRounds: { en: 'Model rounds', zh: '模型轮数' },
  statsEvents: { en: 'Events', zh: '事件' },
  statsCost: { en: 'Cost', zh: '费用' },
  statsPhaseTitle: { en: 'Where AI working time went (idle excluded)', zh: 'AI 工作时间花在哪（不含空闲）' },
  statsPhaseTitleAll: { en: 'Where the whole span went (idle included)', zh: '整段时间花在哪（含空闲）' },
  statsIdleToggle: { en: 'include idle', zh: '含空闲' },
  statsIdleHint: {
    en: 'Idle = gaps longer than 2 minutes, plus the wait before each task starts (nobody at the keyboard). Including it makes percentages count against the total span instead of AI working time.',
    zh: '空闲 = 相邻事件间隔超过 2 分钟的部分，以及每个任务开始前的等待（人不在键盘前）。勾上后占比按总跨度算，而不是按 AI 实际工作时间算。',
  },
  statsCountsTitle: { en: 'Activity counts', zh: '动作与数量' },
  cTasks: { en: ' tasks', zh: ' 个任务' },
  cTurns: { en: ' turns', zh: ' 个回合' },
  cToolUses: { en: ' tool calls', zh: ' 次工具调用' },
  cToolErrors: { en: ' tool errors', zh: ' 次工具报错' },
  cBgTasks: { en: ' bg tasks', zh: ' 个后台任务' },
  cRetries: { en: ' API retries', zh: ' 次API重试' },
  cTextBlocks: { en: ' text blocks', zh: ' 段文字' },
  cThinkingBlocks: { en: ' thinking blocks', zh: ' 段思考' },
  cTextChars: { en: ' chars of text', zh: ' 字正文' },
  cThinkingChars: { en: ' chars of thinking', zh: ' 字思考' },
  cToolOutputChars: { en: ' chars of tool output', zh: ' 字工具输出' },
  statsSeconds: { en: 'seconds', zh: '秒' },
  statsByTaskTitle: { en: 'Per task', zh: '按任务' },
  statsSlowTitle: { en: 'Slowest tool calls', zh: '最慢的工具调用' },
  statsTaskCol: { en: 'Task', zh: '任务' },
  statsNote: {
    en: 'Note: thinking / first-token waits are measured accurately only for sessions run inside the hub; terminal-only sessions fold them into generation.',
    zh: '说明：思考 / 等首 token 仅对在本系统内跑的会话测得准；纯终端会话会把这两项并入生成耗时。',
  },
  phTtft: { en: 'First-token wait', zh: '等首 token' },
  phThink: { en: 'Thinking', zh: '思考' },
  phGenTool: { en: 'Generating tool calls', zh: '生成工具调用' },
  phGenText: { en: 'Generating text', zh: '生成文字' },
  phToolExec: { en: 'Tool execution', zh: '工具执行' },
  phBgTask: { en: 'Background tasks', zh: '后台任务' },
  phIdle: { en: 'User idle', zh: '用户空闲' },
  phStartup: { en: 'Startup', zh: '启动' },
  phOther: { en: 'Other', zh: '其他' },
  favoriteSession: { en: 'Add to favorites', zh: '收藏会话' },
  unfavoriteSession: { en: 'Remove from favorites', zh: '取消收藏' },
  favoritesFolder: { en: 'Favorites', zh: '收藏夹' },
  backToSessions: { en: 'Back to sessions', zh: '返回会话' },
  defaultFavorite: { en: 'Default favorite', zh: '默认收藏' },
  favoriteRootRequired: { en: 'Choose a workspace before starting this favorite session.', zh: '请先选择工作目录，再开始这个收藏会话。' },
  noFavoriteSessions: { en: 'No favorite sessions', zh: '暂无收藏会话' },
  favoriteTag: { en: 'favorite', zh: '收藏' },
  filterByDir: { en: 'Filter by workspace', zh: '按工作目录筛选' },
  clearFilter: { en: 'Clear filter', zh: '清除筛选' },
  pinLimitReached: { en: 'Pin limit reached (3) — oldest pin will be replaced', zh: '置顶已达上限(3个)，将替换最早的置顶' },
  pinnedTag: { en: 'pinned', zh: '置顶' },
  testingTag: { en: 'testing', zh: '待测试' },
  untitledSession: { en: 'New session', zh: '新会话' },
  srcTyped: { en: 'terminal', zh: '终端' },
  srcSdk: { en: 'Web', zh: '网页' },
  srcEmpty: { en: 'empty', zh: '空' },
  nativeBadge: { en: 'CLI', zh: '终端' },
  nativeSessionHint: {
    en: 'Session created directly in the Claude Code terminal. Send a message to continue it (resumes the original session).',
    zh: '在 Claude Code 终端里直接创建的会话。发送消息即可续接（resume 原会话）。',
  },
  selectRootFirst: { en: 'Select or add a workspace first', zh: '请先选择或添加工作目录' },
  messages: { en: 'Messages', zh: '最终消息' },
  process: { en: 'Process (thinking / tools)', zh: '执行过程（思考 / 工具）' },
  queue: { en: 'Task Queue', zh: '任务队列' },
  inputPlaceholder: { en: 'Enter a task for Claude…', zh: '输入要让 Claude 执行的任务…' },
  addTask: { en: 'Submit', zh: '提交' },
  addTasks: { en: 'Add tasks', zh: '批量任务' },
  multiTaskTitle: { en: 'Add multiple tasks', zh: '一次添加多个任务' },
  multiTaskHint: {
    en: 'One task per line. They are queued and run in order.',
    zh: '每行一个任务，将按顺序排队依次执行。',
  },
  submitTasks: { en: 'Add to queue', zh: '加入队列' },
  tasksCountN: { en: 'tasks', zh: '个任务' },
  stopTask: { en: 'Stop', zh: '停止' },
  pauseFlow: { en: 'Pause Flow', zh: '暂停任务流' },
  resumeFlow: { en: 'Resume Flow', zh: '继续任务流' },
  paused: { en: 'PAUSED', zh: '已暂停' },
  // 收藏夹：为待绑定的收藏会话新增根目录并直接选用
  addNewDir: { en: 'Add new directory', zh: '添加新目录' },
  // 停止时的二选一弹窗（存在后续排队任务时）
  stopChoiceTitle: { en: 'Stop the running task', zh: '停止当前任务' },
  stopChoiceDesc: {
    en: 'There are queued tasks after this one. How would you like to stop?',
    zh: '后面还有排队中的任务，你想怎么停止？',
  },
  stopChoicePause: { en: 'Pause the whole sequence', zh: '暂停整个任务序列' },
  stopChoicePauseDesc: {
    en: 'Stops the current task and freezes the queue — nothing else runs. A new message you send is treated as a supplement to the paused task: it jumps to the front and runs right away.',
    zh: '停止当前任务并冻结队列——后续任务不再自动执行。你此时发送的新消息会被视为对暂停任务的补充：插入到最前面并立即执行。',
  },
  stopChoiceNext: { en: 'Stop current, start next', zh: '停止当前，开始下一个' },
  stopChoiceNextDesc: {
    en: 'Stops only the current task and continues with the next queued task.',
    zh: '仅停止当前任务，随后继续执行队列中的下一个任务。',
  },
  // 暂停整条序列后的输入区提示与提交按钮文案
  supplementSubmit: { en: 'Supplement & run', zh: '补充并执行' },
  supplementPlaceholder: {
    en: 'Sequence paused. Your message will jump to the front and run now…',
    zh: '任务序列已暂停，你的消息将插入最前并立即执行…',
  },
  pauseHint: {
    en: 'Sequence paused. A new message here is a supplement to the paused task — it runs immediately, ahead of the frozen queue. Click “Resume Flow” to continue the rest.',
    zh: '任务序列已暂停。此处发送的新消息将作为对暂停任务的补充，越过被冻结的队列立即执行。点「继续任务流」可恢复后续任务。',
  },
  running: { en: 'running', zh: '执行中' },
  details: { en: 'details', zh: '详情' },
  delete: { en: 'Delete', zh: '删除' },
  pending: { en: 'pending', zh: '等待中' },
  done: { en: 'done', zh: '已完成' },
  stopped: { en: 'stopped', zh: '已停止' },
  error: { en: 'error', zh: '出错' },
  you: { en: 'You', zh: '你' },
  assistant: { en: 'Claude', zh: 'Claude' },
  copy: { en: 'Copy', zh: '复制' },
  copied: { en: 'Copied', zh: '已复制' },
  // ── 执行失败 / 引擎无响应的界面提示 ──
  runFailedTitle: { en: 'Task failed', zh: '任务执行失败' },
  runWarnTitle: { en: 'Engine produced no output', zh: '引擎没有任何输出' },
  runFailedHint: {
    en: 'The engine did not run successfully. Details below (command, working directory, error output).',
    zh: '引擎没有正常跑起来。下面是现场信息（命令、工作目录、错误输出）。',
  },
  copyDiag: { en: 'Copy details', zh: '复制错误信息' },
  noticeClose: { en: 'Dismiss', zh: '关闭这条提示' },
  noticeFabOpen: { en: 'Show errors', zh: '查看错误提示' },
  noticeFabClose: { en: 'Hide errors', zh: '收起错误提示' },
  noticePopTitle: { en: 'Errors & warnings', zh: '错误与提示' },
  noticeClearAll: { en: 'Dismiss all', zh: '全部关闭' },
  serverErrorTitle: { en: 'Backend error', zh: '后端异常' },
  elapsed: { en: 'Elapsed', zh: '耗时' },
  aiCollapseAll: { en: 'Collapse AI messages', zh: '收拢 AI 消息' },
  aiExpandAll: { en: 'Expand all AI messages', zh: '展开全部 AI 消息' },
  aiExpandGroup: { en: 'Click to expand this AI message group', zh: '点击展开这组 AI 消息' },
  aiCollapseGroup: { en: 'Collapse this AI message again', zh: '重新收拢这条 AI 消息' },
  aiCollapsedCount: { en: '{n} AI messages collapsed', zh: '已收拢 {n} 条 AI 消息' },
  aiCollapsedEmpty: { en: 'No text content', zh: '无文本内容' },
  clearProcess: { en: 'Clear', zh: '清空' },
  confirmRemoveRoot: {
    en: 'Remove this workspace? This only removes the reference in this tool — the actual folder on disk will NOT be deleted.',
    zh: '确定删除该工作目录？仅在当前工具中删除对该目录的引用，不会删除实际的工作目录文件夹。',
  },
  confirmRemoveSession: {
    en: 'Delete this session? The conversation (incl. the Claude Code transcript) will be permanently removed.',
    zh: '确定删除该会话？将连同 Claude Code 的对话记录一起永久删除。',
  },
  // ── 批量管理（根目录 / 会话） ──
  manageRoots: { en: 'Manage workspaces', zh: '管理工作目录' },
  manageRootsTitle: { en: 'Manage workspaces', zh: '管理工作目录' },
  batchSelect: { en: 'Batch select', zh: '批量选择' },
  selectAll: { en: 'Select all', zh: '全选' },
  selectedCount: { en: 'Selected: {n}', zh: '已选 {n} 项' },
  deleteSelected: { en: 'Delete selected', zh: '删除所选' },
  batchActions: { en: 'Actions', zh: '批量操作' },
  cancel: { en: 'Cancel', zh: '取消' },
  noRoots: { en: 'No workspaces yet', zh: '暂无工作目录' },
  confirmRemoveRoots: {
    en: 'Remove the selected {n} workspace(s)? This only removes the references in this tool — the actual folders on disk will NOT be deleted.',
    zh: '确定删除所选 {n} 个工作目录？仅在当前工具中删除对这些目录的引用，不会删除实际的工作目录文件夹。',
  },
  confirmRemoveSessions: {
    en: 'Delete the selected {n} session(s)? The conversations (incl. Claude Code transcripts) will be permanently removed.',
    zh: '确定删除所选 {n} 个会话？将连同 Claude Code 的对话记录一起永久删除。',
  },
  nothingSelected: { en: 'Nothing selected', zh: '未选择任何项' },
  lang: { en: '中文', zh: 'EN' },
  // ── 教程入口菜单（点 📖 弹出：快速上手 / 小白教程）──
  guideMenuTitle: { en: 'TUTORIALS', zh: '教程' },
  guideMenuQuickT: { en: 'Quick start guide', zh: '快速上手指南' },
  guideMenuQuickD: {
    en: 'One page: what every button does. 3 minutes.',
    zh: '一页说清每个按钮干什么，3 分钟看完。',
  },
  guideMenuLearnT: { en: 'Beginner course (from zero)', zh: '小白教程（零基础）' },
  guideMenuLearnD: {
    en: '8 chapters, quizzes, hands-on tasks — learn to get real work done with Claude Code.',
    zh: '8 章知识点 + 测验 + 实操，一步步学会用 Claude Code 干真实工作。',
  },
  // ── 使用指南 ──
  guideTitle: { en: '📖 Quick Start Guide', zh: '📖 使用指南' },
  guideBtn: { en: 'Tutorials', zh: '教程' },
  guideGotIt: { en: 'Got it, let’s go!', zh: '明白啦，开始使用！' },
  guideHtml: {
    zh: `
      <p class="guide-intro">👋 欢迎使用 <b>Claude 工作台</b>！这是一个让 Claude 帮你自动完成编程任务的本地工具。下面用几步带你快速上手～</p>
      <div class="guide-sec">
        <h3>📁 第一步 · 选择工作目录</h3>
        <p>在顶部选一个「工作目录」（也就是你的项目文件夹），Claude 会在这里干活。第一次用可以点 <b>＋</b> 添加，或用 <b>🗂</b> 管理多个目录。</p>
      </div>
      <div class="guide-sec">
        <h3>💬 第二步 · 新建会话，交代任务</h3>
        <p>点「新建会话」，在底部输入框用大白话告诉 Claude 你想做什么，比如「帮我给登录页加一个忘记密码按钮」。<b>回车</b>发送，<b>Shift+回车</b>换行。</p>
      </div>
      <div class="guide-sec">
        <h3>📋 第三步 · 任务队列，排队干活</h3>
        <p>可以一次派好几个任务：点「批量任务」，一行写一个，它们会<b>按顺序自动执行</b>。执行中随时能 ⏸ 暂停、⏹ 停止，或删掉还没开始的任务。</p>
      </div>
      <div class="guide-sec">
        <h3>👀 实时看它怎么想、怎么做</h3>
        <p>Claude 的思考过程和用到的工具会实时显示在「过程」面板里（手机上点 <b>⚙</b> 查看）；只有最终结果才进入对话记录，界面干净清爽。</p>
      </div>
      <div class="guide-sec">
        <h3>🗂 管理你的会话</h3>
        <p>会话可标记为<b>活跃 / 待测试 / 已完成</b>方便分类，还能 🔍 搜索、★ 收藏、置顶。标题会自动取你的第一句话，一眼就认得出。</p>
      </div>
      <div class="guide-sec">
        <h3>🎨 换主题 &amp; ⇪ 一键推送</h3>
        <p>点 <b>🎨</b> 换个喜欢的主题（还有会动的特效主题哦）；改完代码点 <b>⇪</b> 就能一键 git 提交并推送到云端。</p>
      </div>
      <div class="guide-sec">
        <h3>⚙ 设置引擎与模型</h3>
        <p>在 <b>⚙</b> 设置里可切换执行引擎（Claude Code / Codex）、服务商、模型和 API Key。第一次使用会有引导带你配置好。</p>
      </div>
      <p class="guide-tip">💡 小提示：随时点右上角的 <b>📖</b> 就能再打开这份指南。祝你用得开心！</p>`,
    en: `
      <p class="guide-intro">👋 Welcome to <b>Clootee</b>! It’s a local tool that lets Claude do your coding tasks for you. Here’s how to get going in a few steps~</p>
      <div class="guide-sec">
        <h3>📁 Step 1 · Pick a working directory</h3>
        <p>Choose a “workspace” (your project folder) at the top — that’s where Claude works. First time? Click <b>＋</b> to add one, or <b>🗂</b> to manage several.</p>
      </div>
      <div class="guide-sec">
        <h3>💬 Step 2 · Start a session &amp; describe the task</h3>
        <p>Click “New Session” and just tell Claude what you want in plain words, e.g. “add a Forgot Password button to the login page”. <b>Enter</b> sends, <b>Shift+Enter</b> makes a new line.</p>
      </div>
      <div class="guide-sec">
        <h3>📋 Step 3 · Queue up tasks</h3>
        <p>Hand over several tasks at once: click “Batch tasks”, one per line, and they run <b>automatically in order</b>. Anytime you can ⏸ pause, ⏹ stop, or delete tasks that haven’t started.</p>
      </div>
      <div class="guide-sec">
        <h3>👀 Watch it think &amp; act, live</h3>
        <p>Claude’s reasoning and the tools it uses show up live in the “Process” panel (tap <b>⚙</b> on mobile). Only the final result lands in the chat — nice and tidy.</p>
      </div>
      <div class="guide-sec">
        <h3>🗂 Manage your sessions</h3>
        <p>Mark sessions as <b>Active / Testing / Completed</b> to stay organized, and 🔍 search, ★ favorite, or pin them. Titles are taken from your first message automatically.</p>
      </div>
      <div class="guide-sec">
        <h3>🎨 Themes &amp; ⇪ one-click push</h3>
        <p>Hit <b>🎨</b> for a theme you love (some are even animated!). Done coding? Click <b>⇪</b> to git commit &amp; push to the cloud in one tap.</p>
      </div>
      <div class="guide-sec">
        <h3>⚙ Engine &amp; model settings</h3>
        <p>Under <b>⚙</b> Settings you can switch the engine (Claude Code / Codex), provider, model and API key. A guided setup walks you through it on first run.</p>
      </div>
      <p class="guide-tip">💡 Tip: click <b>📖</b> in the top-right anytime to reopen this guide. Have fun!</p>`,
  },
  // ── 主题选择面板 ──
  themePick: { en: 'Choose a theme', zh: '选择主题' },
  themeDark: { en: 'Classic Dark', zh: '经典深色' },
  themeLight: { en: 'Classic Light', zh: '经典浅色' },
  themeOcean: { en: 'Ocean Blue', zh: '大海蓝' },
  themePink: { en: 'Sweet Pink', zh: '粉色少女心' },
  themeGreen: { en: 'Fresh Green', zh: '森林绿' },
  themeCat: { en: 'Kitty', zh: '宠物猫' },
  themeGalaxy: { en: 'Galaxy', zh: '银河系' },
  themeMecha: { en: 'Mecha', zh: '机械' },
  themeCyber: { en: 'Cyberpunk', zh: '赛博朋克' },
  themeSteam: { en: 'Steampunk', zh: '蒸汽朋克' },
  themeRain: { en: 'Rainy Window', zh: '雨天窗户' },
  themeSea: { en: 'Deep Sea', zh: '深海' },
  themeAurora: { en: 'Aurora', zh: '极光' },
  themeWinter: { en: 'Winter Snow', zh: '冬季' },
  themeRabbit: { en: 'Countryside', zh: '乡村' },
  themeAnim: { en: 'Animated', zh: '动效' },
  // ── 新手引导（onboard.js）──
  obStepLang: { en: 'Step 1: Language & appearance', zh: '第 1 步：语言与外观' },
  obStepLangSub: { en: 'Pick the language and theme you are comfortable with. You can change both anytime from the top bar.', zh: '先选你习惯的界面语言和明暗主题，之后在右上角随时能改。' },
  obLanguage: { en: 'Interface language', zh: '界面语言' },
  obTheme: { en: 'Appearance', zh: '外观主题' },
  obDark: { en: 'Dark', zh: '深色' },
  obLight: { en: 'Light', zh: '浅色' },
  obStepNet: { en: 'Step 2: Network check', zh: '第 2 步：网络体检' },
  obStepNetSub: {
    en: "Let's first make sure this computer can reach Claude. If it can't, you'll get two ways out right here — turn on a VPN, or switch to a China-based model that needs none.",
    zh: '先确认这台电脑能不能连上 Claude。连不上也没关系：这一步会当场给你两条出路——开科学上网，或者换成完全不需要翻墙的国产模型。',
  },
  obStepEngine: { en: 'Step 3: Which AI does the work?', zh: '第 3 步：用哪个 AI 来干活？' },
  obStepEngineSub: { en: 'An engine must be installed before you can pick it — click Install on the card and wait for it to finish. Not sure which? Claude Code is the recommended default and you can switch later in Settings.', zh: '引擎要先装好才能选：在卡片上点「立即安装」，等进度跑完即可。不确定就选 Claude Code —— 这是默认推荐，之后在设置里随时能换。' },
  obClaudeDesc: { en: "Anthropic's official coding CLI. The main engine of this tool (recommended).", zh: 'Anthropic 官方命令行编程助手，本工具的主力引擎（推荐）' },
  obCodexDesc: { en: "OpenAI's coding CLI. A solid alternative.", zh: 'OpenAI 的命令行编程助手，可作为备选' },
  obInstalled: { en: 'Installed', zh: '已安装' },
  obNotInstalled: { en: 'Not installed', zh: '未安装' },
  obFromBoth: { en: 'Both your system copy and the bundled copy work', zh: '电脑已装 + 内置库均可用' },
  obFromSystem: { en: 'Ready to use — installed on this computer', zh: '已装在这台电脑上，可以直接用' },
  obFromBundled: { en: 'Using the copy bundled with this tool', zh: '使用本工具内置的版本' },
  obInstallHint: { en: 'Install it first (about 400-500MB, a few minutes). We pick the faster npm registry for you — no Node or PATH setup needed.', zh: '要先装好才能选（联网下载约 400-500MB，通常几分钟）。会自动挑更快的 npm 源，你不需要自己装 Node 或改环境变量。' },
  obNeedInstallFirst: { en: 'Not installed yet — click the Install button on this card first.', zh: '还没安装：请先点这张卡片上的「立即安装」按钮。' },
  obEngineInstall: { en: 'Install now', zh: '立即安装' },
  obEnginePick: { en: 'Use this engine', zh: '选择这个引擎' },
  obEnginePicked: { en: 'Selected', zh: '已选择' },
  obInstallWarn: { en: 'not detected yet. Install it now with npm (downloads roughly 400-500MB, a few minutes).', zh: '还没检测到。可以现在用 npm 装上（联网下载约 400-500MB，通常几分钟）。' },
  obInstallBtn: { en: 'Install now', zh: '立即安装' },
  obInstalling: { en: 'installing, please keep this page open…', zh: '正在安装，请勿关闭页面…' },
  obInstallOk: { en: 'Installed ✓', zh: '安装完成 ✓' },
  obInstallFail: { en: 'Install failed: ', zh: '安装失败：' },
  obInstallRetry: { en: 'Retry', zh: '重试' },
  obInstallManual: { en: 'Or install it yourself in a terminal, then click Retry:', zh: '也可以自己在终端里装好，再点「重试」：' },
  engInstElapsed: { en: 'elapsed {s}s', zh: '已用时 {s} 秒' },
  engInstWaiting: { en: 'picking the fastest npm registry…', zh: '正在选择最快的 npm 源…' },
  obStepProvider: { en: 'Step 4: Whose models?', zh: '第 4 步：用哪家的模型？' },
  obStepProviderSub: { en: 'Already subscribed to Claude / ChatGPT? Pick "Official". Otherwise pick a provider and paste an API key (MiniMax is the recommended pick — strong at code and supports image input).', zh: '已有 Claude / ChatGPT 订阅就选「原版」；没有的话选一家服务商，注册后拿一个 API Key 即可（国产模型首推 MiniMax，代码强且支持图片识别）。' },
  obNoKeyNeeded: { en: 'No API key needed', zh: '无需 API Key' },
  obKeyNeeded: { en: 'API key required', zh: '需要 API Key' },
  obRecommended: { en: 'Recommended', zh: '推荐' },
  obVision: { en: 'Image input supported', zh: '支持图片识别' },
  obCodexOnly: { en: 'Codex currently supports only "Official ChatGPT" and "Kimi". To use Xiaomi MiMo / MiniMax, choose Claude Code as the engine.', zh: 'Codex 目前只支持「原版 ChatGPT」与「Kimi」两种；想用小米 MiMo / MiniMax 请把引擎选为 Claude Code。' },
  obStepLogin: { en: 'Step 5: Sign in to your Claude account', zh: '第 5 步：登录 Claude 账号' },
  obStepLoginSub: {
    en: 'Last step. Claude Code has to be signed in, otherwise messages you send get no reply at all. Follow the four steps below — it takes about half a minute.',
    zh: '最后一步。Claude Code 必须先登录账号，否则你发出去的消息不会有任何回应。按下面四步走完即可，大约半分钟。',
  },
  obLoginSkip: { en: 'Skip for now — I will sign in later in Settings', zh: '稍后再登录（之后可在「设置 → 运行环境」里完成）' },
  obStepKey: { en: 'Step 5: Paste your API key', zh: '第 5 步：填入 API Key' },
  obStepKeySub: { en: "The key is stored only on your own computer (this tool's data folder). It is never uploaded anywhere.", zh: 'API Key 只保存在你自己的电脑上（本工具的 data 目录），不会上传到任何地方。' },
  obHowToKey: { en: 'How do I get an API key?', zh: '怎么拿到 API Key？' },
  obKeyStep1: { en: 'Open the provider console below and sign up / log in', zh: '点开下面的开放平台链接，用手机号 / 账号注册登录' },
  obKeyStep2: { en: 'Find "API Keys" in the console and click Create', zh: '在控制台里找到「API Key / 密钥管理」，点「创建」' },
  obKeyStep3: { en: 'Copy the key (usually starts with sk-) and paste it below', zh: '复制生成的密钥（通常以 sk- 开头），粘贴到下面' },
  obKeyStepFree: { en: 'Xiaomi MiMo gives new users a free quota — you can start without paying', zh: '小米 MiMo 新用户可直接领取免费额度，不充值也能先跑起来' },
  obKeyStepPaid: { en: 'Pay-as-you-go: top up a small amount first (a few yuan is enough to try)', zh: '按量计费，需先充值少量金额（几元即可试用）' },
  obOpenConsole: { en: 'Open console ↗', zh: '打开开放平台 ↗' },
  obOfficialDocs: { en: 'Official docs / guide ↗', zh: '官方文档 / 使用指南 ↗' },
  obKeyPlaceholder: { en: 'Paste API key (sk-...)', zh: '粘贴 API Key（sk-...）' },
  obFetchModels: { en: 'Verify key & list models', zh: '验证并获取可用模型' },
  obPickModel: { en: 'Pick a model (the first one is fine)', zh: '选择模型（不确定就用第一个）' },
  obNeedKeyFirst: { en: 'Please paste the API key first', zh: '请先粘贴 API Key' },
  obConnecting: { en: 'Connecting to provider…', zh: '正在连接服务商…' },
  obGotModels: { en: 'models available ✓', zh: '个可用模型 ✓' },
  obFetchFail: { en: 'Failed: check the key and your network — ', zh: '获取失败：请检查 Key 是否正确、网络是否通 —— ' },
  obNeedKeyOrOfficial: { en: 'Please paste an API key (or go back and choose "Official")', zh: '请先填入 API Key（或返回上一步选「原版」）' },
  obSaveFail: { en: 'Save failed: ', zh: '保存失败：' },
  obSaving: { en: 'Saving…', zh: '保存中…' },
  obSkip: { en: 'Later', zh: '以后再说' },

  // ── 网络体检（health.js；引导页与设置页共用）──
  hcTitle: { en: 'Network check', zh: '网络体检' },
  hcChecking: { en: 'Checking your network and whether Claude is reachable…', zh: '正在检测网络，以及能不能连上 Claude…' },
  hcOk: { en: 'All good', zh: '一切正常' },
  hcNoNet: { en: 'No network', zh: '没有网络' },
  hcNoClaude: { en: "Can't reach Claude", zh: '连不上 Claude' },
  hcFailed: { en: 'Check failed', zh: '检测失败' },
  hcRetry: { en: 'Check again', zh: '重新检测' },
  hcRetryAfterVpn: { en: "I've turned on my VPN — check again", zh: '我已开启科学上网，重新检测' },
  hcUseDomestic: { en: 'Switch to {name} instead', zh: '改用 {name}（国产，无需翻墙）' },
  hcUnreachable: { en: 'unreachable', zh: '不通' },
  hcDetail: { en: 'Show each check', zh: '查看逐项检测结果' },
  hcProxyFound: { en: 'Proxy detected: {url} (from {from})', zh: '已检测到代理：{url}（来自环境变量 {from}）' },
  hcGuide: {
    en: 'Two ways out: ① turn on a VPN / proxy on this machine, then check again; ② keep using this tool with a China-based model — no VPN needed. Pick one below.',
    zh: '两条出路，任选其一：① 在这台电脑上开启科学上网（VPN / 代理），然后点「重新检测」；② 直接改用国产大模型，完全不需要翻墙。下面点一下就行。',
  },

  // ── Claude 账号登录（health.js）──
  clTitle: { en: 'Claude account', zh: 'Claude 账号' },
  clChecking: { en: 'Checking login status…', zh: '正在检查登录状态…' },
  clStatusFail: { en: 'Could not read login status: ', zh: '读取登录状态失败：' },
  clLoggedIn: { en: 'Signed in', zh: '已登录' },
  clNeedLogin: { en: 'Sign-in required', zh: '需要登录' },
  clNotNeeded: { en: 'Not required', zh: '无需登录' },
  clNoCli: { en: 'Claude Code missing', zh: '未安装 Claude Code' },
  clNoCliHint: {
    en: 'Claude Code is not installed yet. Install it first (engine step, or Settings → Runtime), then come back.',
    zh: '还没有安装 Claude Code。请先装好它（引导里的「选引擎」这一步，或设置 → 运行环境），再回来登录。',
  },
  clThirdParty: {
    en: 'You are using the {p} provider, which connects with an API key — no Anthropic account needed.',
    zh: '你当前用的是 {p} 服务商，直接用 API Key 连接，不需要 Anthropic 账号，这一步可以跳过。',
  },
  clWhy: {
    en: 'Claude Code needs to be signed in to your Anthropic account. Without it, messages you send get no reply at all. Click below and finish it in your browser — takes about 30 seconds.',
    zh: 'Claude Code 必须先登录 Anthropic 账号，否则你发出去的消息不会有任何回应。点下面的按钮，在浏览器里完成登录即可，大约 30 秒。',
  },
  clStart: { en: 'Sign in to Claude', zh: '开始登录 Claude' },
  clRelogin: { en: 'Sign in with another account', zh: '重新登录 / 换账号' },
  clDoneOutside: { en: 'I signed in elsewhere — re-check', zh: '我已在别处登录，重新检测' },
  clRecheck: { en: 'Re-check', zh: '重新检测' },
  clManual: { en: 'Prefer a terminal? Run: ', zh: '也可以在终端里手动执行：' },
  clStarting: { en: 'Starting sign-in, getting your authorization link…', zh: '正在启动登录，获取授权链接…' },
  clCancel: { en: 'Cancel', zh: '取消登录' },
  clOpenUrl: { en: '① Open the authorization page ↗', zh: '① 打开授权页面 ↗' },
  clCopyUrl: { en: 'Copy link', zh: '复制链接' },
  clCopied: { en: 'Link copied — open it in any browser.', zh: '链接已复制，可在任意浏览器里打开。' },
  clRunHint: {
    en: 'Open the authorization page with the blue button below, then pick A or B — whichever matches what that page actually shows you.',
    zh: '先点下面的蓝色按钮打开授权页面，然后按你在页面上实际看到的情况，选下面的 A 或 B。',
  },
  clWhichCase: { en: '② Which one are you seeing on that page?', zh: '② 在授权页面上，你遇到的是哪一种？' },
  clWayCode: { en: 'A · The page gave me a code', zh: 'A · 页面给了我一串授权码' },
  clWayCodeSub: { en: 'Looks like xxxxxx#yyyyyy, copyable', zh: '形如 xxxxxx#yyyyyy，可以直接复制' },
  clWayLink: { en: 'B · It only asked for my email', zh: 'B · 只让我填邮箱，验证链接发到了邮箱' },
  clWayLinkSub: { en: 'A verification link was mailed to me, no code on the page', zh: '邮箱收到一条验证链接，页面上没有授权码' },

  // 情况 A：页面直接给码
  clAStep1: {
    en: 'Sign in with your Claude account on that page, then click "Authorize".',
    zh: '在授权页面上用你的 Claude 账号登录，然后点「Authorize」。',
  },
  clAStep2: {
    en: 'The page then shows an authorization code (like xxxxxx#yyyyyy) — copy it.',
    zh: '页面会给出一串授权码（形如 xxxxxx#yyyyyy），复制它。',
  },
  clAStep3: { en: 'Paste it into the box below and click Finish.', zh: '粘贴到下面的输入框，点「完成登录」。' },

  // 情况 B：页面只让填邮箱，验证链接发到邮箱，页面上没有授权码
  clBKey: {
    en: '⚠ Key point: the link in that email must be opened in the SAME browser you just opened the authorization page in. Opening it on your phone or in another browser will say "signed in", but no code will ever appear here and you will have to start over.',
    zh: '⚠ 关键：邮件里的验证链接，必须放回「刚才打开授权页面的那个浏览器」里访问。用手机、或换一个浏览器打开，验证会显示成功，但这边永远拿不到授权码，只能从头再来。',
  },
  clBStep1: {
    en: 'That email contains a verification link, not a code — it means this browser is not signed in to Claude yet, so Claude verifies it is really you first.',
    zh: '邮件给的是「验证链接」而不是授权码 —— 说明这个浏览器还没登录 Claude 账号，Claude 要先确认是你本人。',
  },
  clBStep2: {
    en: 'Copy the link from the email into the box below and click "Open in this browser" — that guarantees the same browser is used.',
    zh: '把邮件里的链接复制到下面的输入框，点「在同一浏览器里打开」（这样开的就是同一个浏览器，最保险）。',
  },
  clBStep3: {
    en: 'Click the verify button on the page that opens; seeing "signed in" is enough. There is no code on that page — that is normal. Do not close the browser.',
    zh: '在打开的页面上点验证按钮，看到「登录成功 / Signed in」就够了。此时页面上没有授权码，这是正常的，别关浏览器。',
  },
  clBStep4: {
    en: 'Come back here and click "Open the authorization page again". Now that the browser is signed in, the page shows "Authorize" — click it and you get the code.',
    zh: '回到这里点「再打开一次授权页」。浏览器已经是登录态了，这次页面才会出现「Authorize」，点它就会给出授权码。',
  },
  clBStep5: {
    en: 'With the code in hand, click "I have the code now", switch back to A, paste it and submit.',
    zh: '拿到授权码后点「我拿到授权码了」，切回 A 的输入框粘贴、提交。',
  },
  clBNote: {
    en: 'Do not click Cancel or reload this page meanwhile — the background sign-in process has to stay alive to receive the code.',
    zh: '这期间别点「取消登录」，也别刷新本页：后台那个登录进程要一直开着才能接收授权码。',
  },
  clLinkPlaceholder: { en: 'Paste the verification link from the email here', zh: '把邮件里的验证链接粘贴到这里' },
  clOpenLink: { en: 'Open in this browser', zh: '在同一浏览器里打开' },
  clReopenAuth: { en: 'Open the authorization page again', zh: '再打开一次授权页' },
  clGotCode: { en: 'I have the code now', zh: '我拿到授权码了' },
  clNeedLink: {
    en: 'Paste the verification link from the email first (it starts with http).',
    zh: '请先粘贴邮件里的验证链接（以 http 开头）。',
  },
  clLinkOpened: {
    en: 'Link opened in a new tab. When verification is done, come back and click "Open the authorization page again".',
    zh: '已在新标签页打开验证链接。完成验证后回来点「再打开一次授权页」。',
  },
  clReopened: {
    en: 'Authorization page reopened. If you are signed in now, click "Authorize" there to get the code.',
    zh: '已重新打开授权页。如果已经是登录态，点页面上的「Authorize」就会给出授权码。',
  },
  clCodeIsLink: {
    en: 'That is a link, not an authorization code — switched you to case B, follow the steps below.',
    zh: '你粘的是一个链接，不是授权码 —— 已帮你切到情况 B，按下面的步骤来。',
  },
  clCodePlaceholder: { en: 'Paste the authorization code here', zh: '把授权码粘贴到这里' },
  clSubmit: { en: 'Finish sign-in', zh: '完成登录' },
  clSubmitting: { en: 'Signing in…', zh: '登录中…' },
  clNeedCode: { en: 'Please paste the authorization code first.', zh: '请先粘贴授权码。' },

  gsTitle: { en: 'Getting started', zh: '开始使用' },
  gsStep1: { en: 'Add a project directory', zh: '添加项目目录' },
  gsStep1Hint: {
    en: 'The folder Claude will work in — pick one of your project folders.',
    zh: 'Claude 干活的文件夹 —— 选一个你的项目工作目录。',
  },
  gsStep2: { en: 'Select that directory', zh: '选中该目录' },
  gsStep2Hint: {
    en: 'Top-left dropdown. Sessions and tasks all belong to the selected directory.',
    zh: '左上角下拉框。会话和任务都归属于选中的目录。',
  },
  gsStep3: { en: 'New session, then type a task', zh: '新建会话，然后输入任务' },
  gsStep3Hint: {
    en: 'Describe what you want in the box below and press Enter.',
    zh: '在下方输入框描述你要做的事，回车发送。',
  },
  gsAddRoot: { en: 'Add a directory', zh: '添加目录' },
  gsPickRoot: { en: 'Select a directory', zh: '选择目录' },
  gsNewSession: { en: 'New session', zh: '新建会话' },
  obNeedModel: { en: 'Please verify the key and pick a model first', zh: '请先验证 Key 并选择一个模型' },
  setupTitle: { en: 'Set an access password', zh: '设定访问密码' },
  setupHint: {
    en: 'Last step: set a password (at least 4 characters). You will need it every time you open this tool.',
    zh: '最后一步：为本工具设定一个访问密码（至少 4 位）。以后打开都需用它登录。',
  },
  setupPwd: { en: 'Password', zh: '设定密码' },
  setupPwd2: { en: 'Repeat password', zh: '再次输入密码' },
  setupBtn: { en: 'Create & enter', zh: '创建并进入' },
  setupTooShort: { en: 'Password must be at least 4 characters', zh: '密码至少 4 位' },
  setupMismatch: { en: 'The two passwords do not match', zh: '两次输入的密码不一致' },
  setupFail: { en: 'Setup failed', zh: '设定失败' },
  obBack: { en: 'Back', zh: '上一步' },
  obNext: { en: 'Next', zh: '下一步' },
  obDone: { en: 'Finish', zh: '完成' },
  obSelected: { en: 'Selected', zh: '已选' },
  loginTitle: { en: 'Sign in', zh: '登录' },
  password: { en: 'Password', zh: '密码' },
  loginBtn: { en: 'Enter', zh: '进入' },
  wrongPassword: { en: 'Wrong password', zh: '密码错误' },
  logout: { en: 'Log out', zh: '退出登录' },
  themeToggle: { en: 'Theme', zh: '主题' },
  pickDir: { en: 'Choose Directory', zh: '选择目录' },
  searchDir: { en: 'Type a path (e.g. C:\\projects) or search folder name…', zh: '输入路径（如 C:\\projects）或搜索文件夹名…' },
  selectThisDir: { en: 'Select This Directory', zh: '选择此目录' },
  up: { en: 'Up', zh: '上级' },
  home: { en: 'Home', zh: '主目录' },
  close: { en: 'Close', zh: '关闭' },
  dirNameLabel: { en: 'Display name', zh: '显示名称' },
  emptyDir: { en: 'No subfolders', zh: '没有子文件夹' },
  newFolder: { en: 'New Folder', zh: '新建文件夹' },
  newFolderPrompt: { en: 'New folder name, created under:', zh: '新文件夹名称，将创建于：' },
  noResults: { en: 'No matches', zh: '无匹配结果' },
  go: { en: 'Go', zh: '前往' },
  taskListN: { en: 'Tasks', zh: '任务清单' },
  doneTasks: { en: 'Completed', zh: '已完成' },
  copySessionId: { en: 'Copy session id', zh: '复制会话 id' },
  engine: { en: 'Engine', zh: '引擎' },
  engineClaude: { en: 'Claude Code', zh: 'Claude Code' },
  engineCodex: { en: 'Codex', zh: 'Codex' },
  engineLockedHint: { en: 'Engine is locked once the session starts', zh: '会话开始后引擎即锁定' },
  settings: { en: 'Settings', zh: '设置' },
  settingsTitle: { en: 'Settings', zh: '设置' },
  defaultEngine: { en: 'Default engine (for new sessions)', zh: '默认引擎（新建会话用）' },
  defaultEngineNote: {
    en: 'Which engine a brand-new session uses. You can still switch it per session before it starts.',
    zh: '新建会话默认用哪个引擎。会话开始前仍可在会话标题旁单独切换。',
  },
  back: { en: 'Back', zh: '返回' },
  advOptions: { en: 'Advanced', zh: '高级选项' },
  // ── 设置板块（每个板块点进去单独设置）──
  paneEngine: { en: 'AI engines', zh: 'AI 引擎' },
  paneEngineDesc: {
    en: 'Default engine, plus the provider and model for Claude Code and Codex',
    zh: '默认引擎，以及 Claude Code 与 Codex 各自的服务商与模型',
  },
  paneNetwork: { en: 'Access & network', zh: '访问与网络' },
  paneNetworkDesc: {
    en: 'LAN access from your phone or another computer, and the access password',
    zh: '手机/其他电脑的局域网访问，以及访问密码',
  },
  paneNetworkOn: { en: 'LAN access on', zh: '已允许局域网访问' },
  paneNetworkOff: { en: 'Local only', zh: '仅本机可访问' },
  panePrompt: { en: 'Prompts & quick tags', zh: '提示词与快捷标签' },
  panePromptDesc: {
    en: 'A preset system prompt written into the project, and the quick prefix tags above the input box',
    zh: '写入项目的预设系统提示词，以及输入框上方的快捷前缀标签',
  },
  panePromptSet: { en: 'Preset prompt set', zh: '已设提示词' },
  panePromptEmpty: { en: 'No preset prompt', zh: '未设提示词' },
  paneQuickN: { en: '{n} tag group(s)', zh: '{n} 个标签分组' },
  paneContext: { en: 'Context auto-compact', zh: '上下文自动压缩' },
  paneContextDesc: {
    en: 'When a conversation nears the context limit, compact earlier turns into a summary and keep going',
    zh: '对话接近上下文上限时，把前面的内容压缩成摘要后继续，避免聊着聊着就报超长',
  },
  paneContextAuto: { en: 'Auto (model default window)', zh: '自动（跟随模型默认窗口）' },
  paneContextCustom: { en: 'Custom window: {n} tokens', zh: '自定义窗口：{n} tokens' },
  paneContextScope: {
    en: 'This window applies to Claude Code. Codex compacts on its own and has no matching switch. Current default engine: {engine}.',
    zh: '该窗口设置作用于 Claude Code；Codex 自带压缩机制、没有对应开关。当前默认引擎：{engine}。',
  },
  paneTemplate: { en: 'Project templates', zh: '项目模板' },
  paneTemplateDesc: {
    en: 'A folder whose subfolders become templates for new working directories',
    zh: '一个目录，其子文件夹会成为新建工作目录时可选的模板',
  },
  paneTemplateEmpty: { en: 'Not set', zh: '未设置' },
  paneRuntime: { en: 'Runtime & updates', zh: '运行时与更新' },
  paneRuntimeDesc: {
    en: 'Whether to prefer the bundled engines, and update Claude Code / Codex',
    zh: '优先用内置引擎还是系统已装的，以及更新 Claude Code / Codex',
  },
  paneRuntimeBundled: { en: 'Bundled engines first', zh: '优先内置引擎' },
  paneRuntimeSystem: { en: 'System engines first', zh: '优先系统已装' },
  outEndReady: { en: 'Bundled library (out_end): ready', zh: 'out_end 内置库：已就绪' },
  outEndMissing: {
    en: 'Bundled library (out_end): not ready — run out_end/bootstrap to download the bundled Node/Claude/Codex; otherwise the ones installed on this computer are used.',
    zh: 'out_end 内置库：未就绪（运行 out_end/bootstrap 下载内置 Node/Claude/Codex；否则用电脑已安装的）',
  },
  lanNeedRestart: {
    en: 'Changing “Allow LAN access” takes effect after restarting the service.',
    zh: '「允许局域网访问」的更改需重启服务后生效。',
  },
  // ── 模型跟随服务商自动定档 ──
  modelAutoOfficial: {
    en: 'The official subscription picks the model for you — nothing to set here.',
    zh: '原版订阅由官方账号决定模型，这里无需设置。',
  },
  modelNeedKey: {
    en: 'Fill in the API Key and the model will be detected automatically.',
    zh: '填好 API Key 后会自动检测并选择模型。',
  },
  modelNeedBase: { en: 'Fill in the Base URL first.', zh: '请先填写 Base URL。' },
  modelAutoDetecting: { en: 'Detecting available models…', zh: '正在自动检测可用模型…' },
  modelFetching: { en: 'Fetching the model list from the provider…', zh: '正在从服务商 API 获取模型列表…' },
  modelAutoPicked: {
    en: 'Auto-selected {model} (of {n} available). Click Save to apply.',
    zh: '已自动选择 {model}（共 {n} 个可用）。点「保存」生效。',
  },
  modelFetched: { en: 'Got {n} models from the provider.', zh: '已从服务商 API 获取 {n} 个模型。' },
  modelFetchFail: { en: 'Could not get models: {err}', zh: '获取模型失败：{err}' },
  modelEmptyList: {
    en: 'The provider returned an empty model list — check that this API Key belongs to this provider and has model access.',
    zh: '服务商返回了空模型列表——请确认这个 API Key 属于该服务商且已开通模型权限。',
  },
  modelPickFirst: {
    en: 'Could not settle on a model. Open Advanced → “Re-fetch models” and pick one, then save.',
    zh: '没能定下模型。请展开「高级选项」→「重新拉取模型」选一个后再保存。',
  },
  // ── AI 引擎板块：服务商 / 模型 / 思考强度（静态文案 + 运行时提示）──
  // 服务商展示名：下拉选项、模型旁的小标、折叠标题摘要三处共用同一份，避免各写各的
  pvOfficial: { en: 'Official', zh: '原版' },
  pvOfficialClaude: {
    en: 'Official (subscription login; you will be guided to log in)',
    zh: '原版（订阅登录，未登录会引导登录）',
  },
  pvOfficialCodex: { en: 'Official ChatGPT (account login)', zh: '原版 ChatGPT（账号登录）' },
  pvMinimax: { en: 'MiniMax', zh: 'MiniMax' },
  pvMinimaxTag: { en: ' (recommended, supports image input)', zh: '（推荐，支持图片识别）' },
  pvXiaomi: { en: 'Xiaomi MiMo', zh: '小米 MiMo' },
  pvKimi: { en: 'Kimi Open Platform (pay-as-you-go)', zh: 'Kimi 开放平台（按量计费）' },
  pvKimicode: { en: 'Kimi Code (monthly subscription)', zh: 'Kimi Code（包月订阅）' },
  pvCustom: { en: 'Custom provider', zh: '自定义服务商' },
  // 服务商一句话说明（新手引导的卡片；后端只给 id，文案在这里）
  pvNoteMinimax: {
    en: 'MiniMax latest models (list fetched live). Strong at code and supports image input — the pick we recommend.',
    zh: 'MiniMax 最新模型（列表实时拉取），代码能力强且支持图片识别，国产模型首推',
  },
  pvNoteXiaomi: {
    en: 'Xiaomi in-house models, direct connection. Both pay-as-you-go keys (sk-) and Token Plan subscription keys (tp-) work — paste either and the endpoint is picked automatically.',
    zh: '小米自研模型，国内直连；按量计费 Key（sk-）与订阅 Token Plan Key（tp-）都支持，粘进来自动识别',
  },
  pvNoteKimi: {
    en: 'Direct connection, strong on long context, pay-as-you-go (top up first). Create the key in the open-platform console.',
    zh: '国内直连，长上下文见长，按量计费需先充值；Key 在开放平台控制台创建',
  },
  pvNoteKimicode: {
    en: 'Pick this if you bought a Kimi Code monthly plan. The key must be created in the kimi.com/code console — open-platform keys do not work here (both start with sk-, do not mix them up).',
    zh: '已买 Kimi Code 月卡的选这个；Key 要在 kimi.com/code 控制台单独建，和开放平台的 Key 不通用（都是 sk- 开头，别拿错）',
  },
  engProviderLabel: { en: 'Provider', zh: '服务商' },
  engModelLabel: { en: 'Model', zh: '模型' },
  engEffortLabel: { en: 'Thinking effort', zh: '思考强度' },
  engApiKeyLabel: { en: 'API Key', zh: 'API Key' },
  engApiKeyPh: {
    en: 'sk-… (once filled in, a model is detected and picked automatically)',
    zh: 'sk-…（填好后会自动检测并选一个模型）',
  },
  engBaseUrlClaude: { en: 'Anthropic-compatible Base URL', zh: 'Anthropic 兼容 Base URL' },
  engBaseUrlCodex: { en: 'OpenAI Chat Completions Base URL', zh: 'OpenAI Chat Completions Base URL' },
  engBaseUrlPhClaude: { en: 'e.g. https://example.com/anthropic', zh: '例如 https://example.com/anthropic' },
  engBaseUrlPhCodex: { en: 'e.g. https://example.com/v1', zh: '例如 https://example.com/v1' },
  engModelsUrlLabel: { en: 'Model list URL (optional)', zh: '模型列表 URL（可选）' },
  engModelsUrlPh: { en: 'Defaults to Base URL + /models', zh: '默认 Base URL + /models' },
  engModelPh: { en: 'Type a model id, e.g. gpt-4o', zh: '直接填写模型 id，例如 gpt-4o' },
  engModelHintCustom: {
    en: 'Type the model id yourself. Fetched candidates show up as suggestions while typing.',
    zh: '模型 id 可以直接手填；拉取到的候选会在输入时作为提示出现。',
  },
  engEffortNoteClaude: {
    en: 'Higher effort means longer thinking and higher cost. “Auto” = let the engine decide.',
    zh: '强度越高思考越久、消耗越多；「自动」= 交给引擎决定。',
  },
  engEffortNoteCodex: {
    en: 'Codex only has low/medium/high — picking “Very high/Max” runs as “High”.',
    zh: 'Codex 只有低/中/高三档，选「极高/最高」会按「高」执行。',
  },
  engRefetchModels: { en: 'Re-fetch models', zh: '重新拉取模型' },
  engDetectCurrent: { en: 'Detect current model', zh: '检测当前模型' },
  engDetectAvailable: { en: 'Detect available models', zh: '检测可用模型' },
  engVerifyTitle: { en: 'Verify each candidate for real', zh: '逐个真实验证可用性' },
  engVerifyDesc: {
    en: 'Sends one tiny request per candidate — slower, but accurate',
    zh: '每个候选发一次极小请求，较慢但更准确',
  },
  engSaveClaude: { en: 'Save Claude Code settings', zh: '保存 Claude Code 设置' },
  engSaveCodex: { en: 'Save Codex settings', zh: '保存 Codex 设置' },
  // 思考强度档位（后端只下发 id，文案在这里）
  effAuto: { en: 'Auto (let the engine decide)', zh: '自动（交给引擎决定）' },
  effAutoShort: { en: 'auto', zh: '自动' },
  effLow: { en: 'Low (fastest, cheapest)', zh: '低（最快、最省）' },
  effMedium: { en: 'Medium (balanced)', zh: '中（均衡）' },
  effHigh: { en: 'High (more careful)', zh: '高（更仔细）' },
  effXhigh: { en: 'Very high (complex tasks)', zh: '极高（复杂任务）' },
  effMax: { en: 'Max (strongest reasoning, slowest)', zh: '最高（最强推理，最慢）' },
  // 模型候选：内置别名的展示名 + 两种后缀
  mdlAliasOpus: { en: 'opus (alias → latest Opus)', zh: 'opus（别名→最新 Opus）' },
  mdlAliasSonnet: { en: 'sonnet (alias → latest Sonnet)', zh: 'sonnet（别名→最新 Sonnet）' },
  mdlAliasHaiku: { en: 'haiku (alias → latest Haiku)', zh: 'haiku（别名→最新 Haiku）' },
  mdlAliasFable: { en: 'fable (alias → latest Fable)', zh: 'fable（别名→最新 Fable）' },
  mdlSuffixDetected: { en: ' (currently active)', zh: '（当前实际）' },
  mdlSuffixSelected: { en: ' (selected)', zh: '（已选定）' },
  // 「检测当前模型」的来源说明（后端下发稳定编码，文案在这里）
  srcClaudeInit: { en: 'claude stream-json init frame', zh: 'claude stream-json init 帧' },
  srcCodexToml: { en: 'codex config.toml (model=)', zh: 'codex config.toml（model=）' },
  srcCodexCatalog: {
    en: 'default entry of the codex model catalog (config.toml has no model=)',
    zh: 'codex 模型目录默认项（config.toml 未指定 model）',
  },
  srcCodex: { en: 'codex', zh: 'codex' },
  // 后端探测失败的固定原因（其余为引擎/网络原样返回的报错，原样展示）
  errInitNoModel: { en: 'the init frame carried no model field', zh: '未从 init 帧读到 model 字段' },
  errCodexCatalogEmpty: { en: 'the model catalog is empty', zh: '模型目录为空' },
  errProbeTimeout: { en: 'the probe timed out', zh: '探测超时' },
  mdlUnknownReason: { en: 'unknown reason', zh: '未知原因' },
  // 模型区的运行时提示
  mdlStateFail: { en: 'Could not read the model state: {err}', zh: '无法读取模型状态：{err}' },
  mdlLastDetect: { en: 'Last check: currently active model {model} (source: {src})', zh: '上次检测：当前实际模型 {model}（来源：{src}）' },
  mdlLastDetectFail: { en: 'Last check failed: {err}', zh: '上次检测失败：{err}' },
  mdlDetecting: {
    en: 'Detecting the current model (starting the engine to read the real model, hold on)…',
    zh: '正在检测当前模型（启动引擎读取实际模型，请稍候）…',
  },
  mdlDetected: { en: 'Currently active model: {model} (source: {src})', zh: '当前实际模型：{model}（来源：{src}）' },
  mdlDetectFail: { en: 'Check failed: {err}', zh: '检测失败：{err}' },
  mdlVerifying: {
    en: 'Verifying each candidate for real — this can take a minute or two…',
    zh: '正在逐个真实验证候选模型，可能需要一两分钟…',
  },
  mdlListing: { en: 'Fetching the list of available models…', zh: '正在获取可用模型列表…' },
  mdlGotN: { en: 'Got {n} available models.', zh: '已获取 {n} 个可用模型。' },
  mdlGotNVerified: {
    en: 'Got {n} available models (✓ = verified working, ✕ = verification failed).',
    zh: '已获取 {n} 个可用模型（✓=实测可用，✕=实测失败）。',
  },
  mdlGetFail: { en: 'Fetch failed: {err}', zh: '获取失败：{err}' },
  mdlSelected: { en: '{model} selected — applies to the next task.', zh: '已选定 {model}，下一个任务生效。' },
  mdlSelectedAuto: { en: 'Set to auto — applies to the next task.', zh: '已设为自动，下一个任务生效。' },
  mdlAutoPickedOne: { en: 'Auto-selected {model}', zh: '已自动选择 {model}' },
  mdlListFail: { en: 'Could not get the model list: {err}', zh: '获取模型列表失败：{err}' },
  effortSet: { en: 'Thinking effort set to “{label}” — applies to the next task.', zh: '思考强度已设为「{label}」，下一个任务生效。' },
  effortSetAuto: { en: 'Thinking effort set to auto — applies to the next task.', zh: '思考强度已设为自动，下一个任务生效。' },
  engSaveFail: { en: 'Save failed: {err}', zh: '保存失败：{err}' },
  engSavedOfficialClaude: { en: 'Saved: official subscription login flow.', zh: '已保存：原版订阅登录流程。' },

  engSavedOfficialCodex: { en: 'Saved: official ChatGPT login flow.', zh: '已保存：原版 ChatGPT 登录流程。' },
  engSavedProvider: { en: 'Saved: {provider}', zh: '已保存：{provider}' },
  engSavedProviderModel: { en: 'Saved: {provider} (model {model})', zh: '已保存：{provider}（模型 {model}）' },
  engLoadFail: { en: 'Could not read the {engine} provider config: {err}', zh: '读取 {engine} 服务商配置失败：{err}' },
  engSavedOk: {
    en: 'Saved. New sessions/tasks will use this provider and model.',
    zh: '已保存。新会话/新任务即使用该服务商与模型。',
  },
  runningTag: { en: 'running', zh: '执行中' },
  justFinishedTag: { en: 'just ran', zh: '刚执行完' },
  uploadFile: { en: 'Upload file to tmp/', zh: '上传文件到 tmp/' },
  uploadFailed: { en: 'Upload failed', zh: '上传失败' },
  // ── 会话工具命令（/usage /compact …）──
  cmdMenuBtn: { en: 'Quick commands', zh: '快捷命令' },
  cmdRunning: { en: 'Running…', zh: '执行中…' },
  cmdNoOutput: { en: '(command finished with no output)', zh: '（命令执行完成，无输出）' },
  cmdFailed: { en: 'Command failed:', zh: '命令执行失败：' },
  cmd_usage_name: { en: 'Usage', zh: '用量' },
  cmd_usage_desc: {
    en: 'Show your Claude Code usage and rate-limit status: how much of the current session / week you have used and when it resets. Read-only — it does not touch this conversation.',
    zh: '查看你的 Claude Code 用量与额度状态：当前会话 / 本周已用多少、何时重置。只读，不会改动当前对话。',
  },
  screenshot: { en: 'Screenshot', zh: '截屏' },
  shotUnsupported: { en: 'Screenshot not supported in this browser', zh: '当前浏览器不支持截屏' },
  shotPreview: { en: 'Screenshot preview', zh: '截屏预览' },
  shotDragTip: { en: 'Drag to select an area (optional), or upload the full image', zh: '可拖拽框选区域（可选），或直接上传整图' },
  confirm: { en: 'Confirm', zh: '确定' },
  cancel: { en: 'Cancel', zh: '取消' },
  dropToUpload: { en: 'Drop files to upload', zh: '松开即上传' },
  expand: { en: 'Expand', zh: '展开' },
  collapse: { en: 'Collapse', zh: '收起' },
  noTasks: { en: 'No tasks yet', zh: '暂无任务' },
  more: { en: 'more', zh: '更多' },
  expandManage: { en: 'Expand & manage', zh: '展开管理' },
  manageTasks: { en: 'Manage tasks', zh: '管理任务' },
  selectAll: { en: 'Select all', zh: '全选' },
  batchDelete: { en: 'Delete selected', zh: '删除所选' },
  selectedN: { en: 'selected', zh: '已选' },
  edit: { en: 'Edit', zh: '修改' },
  save: { en: 'Save', zh: '保存' },
  hold: { en: 'Hold', zh: '暂定' },
  held: { en: 'Held', zh: '已暂定' },
  resume: { en: 'Resume', zh: '恢复' },
  confirmDeleteTasks: { en: 'Delete the selected tasks?', zh: '确定删除所选任务？' },
  onlyPendingEditable: { en: 'Only pending tasks can be edited/removed', zh: '仅等待中的任务可修改/删除' },
  taskDoneNoSelect: { en: 'This task is already done and cannot be selected', zh: '该任务已经完成，无法勾选' },
  files: { en: 'Files', zh: '文件' },
  noFiles: { en: 'No files in this directory', zh: '该目录暂无文件' },
  preview: { en: 'Preview', zh: '预览' },
  download: { en: 'Download', zh: '下载' },
  loading: { en: 'Loading…', zh: '加载中…' },
  previewFail: { en: 'Preview failed', zh: '预览失败' },
  // 文件管理器
  fileManager: { en: 'Files', zh: '文件管理' },
  emptyFolder: { en: 'Empty folder', zh: '空文件夹' },
  searchFiles: { en: 'Search files in this workspace…', zh: '在此工作目录下搜索文件…' },
  searchResults: { en: 'Search results', zh: '搜索结果' },
  refresh: { en: 'Refresh', zh: '刷新' },
  favorites: { en: 'Pinned', zh: '重点文件夹' },
  pin: { en: 'Pin folder', zh: '设为重点' },
  unpin: { en: 'Unpin folder', zh: '取消重点' },
  edit: { en: 'Edit', zh: '编辑' },
  saved: { en: 'Saved', zh: '已保存' },
  saveFail: { en: 'Save failed', zh: '保存失败' },
  unsaved: { en: 'Unsaved changes', zh: '未保存' },
  confirmDiscard: { en: 'Discard unsaved changes?', zh: '放弃未保存的修改？' },
  tooLargeToEdit: { en: 'File too large — opened read-only (truncated).', zh: '文件过大，只读打开（已截断）。' },
  noFilesHere: { en: 'No files or folders here', zh: '此处暂无文件或文件夹' },
  loadFail: { en: 'Load failed', zh: '加载失败' },
};

let LANG = localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');

function T(key) {
  const e = DICT[key];
  if (!e) return key;
  return e[LANG] || e.en;
}

function toggleLang() {
  LANG = LANG === 'zh' ? 'en' : 'zh';
  localStorage.setItem('lang', LANG);
  location.reload();
}

// 就地切换语言（不刷新页面）：新手引导里选语言时用，切完由调用方重绘
function setLang(lang) {
  if (lang !== 'zh' && lang !== 'en') throw new Error(`setLang: invalid lang=${lang}`);
  LANG = lang;
  localStorage.setItem('lang', LANG);
  if (typeof applyText === 'function') applyText();
}

function currentLang() {
  return LANG;
}
