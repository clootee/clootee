# Rubato（原 Claude Hub）记忆文件

> 本地 Claude 多会话任务队列工作台。每次有进展务必更新此文件。

## 设置板块化：首页只放导航，逐板块点进去 + 模型跟随服务商自动定档（2026-08-05）⭐ 后端需重启
- 需求：设置原来是一长条平铺列表（默认引擎/局域网/内置引擎/更新/系统提示词/快捷标签/模板路径/引擎子面板入口/改密码），太乱。
  改为**分板块、每个板块点进去再设**；尽可能折叠；**模型取决于服务商——选了服务商若没有模型，要自动检测并自动选默认的**。
- **结构（index.html）**：
  - `#settingsOverlay` 的 body 只剩 `#settingsNav`（**首页零输入控件**，实测 `inputsOnHome=0`）。原来的 `.sx-foot` 保存按钮移走。
  - 新增 `#settingsPaneOverlay`（`.sx-overlay-sub`，复用既有 z-index:65）：头部 `‹`(`#settingsPaneBack`) + 标题 + `✕`，body 里 5 个 `.sx-pane`（一次只显示一个），foot 一个 `#settingsPaneSave`。
  - **删掉 `#engineSubOverlay`**（旧的引擎子面板），其两个 `.eng-acc` 折叠块整体搬进 `#pane-engine`，并在前面加上「默认引擎」——这样"用 CC 还是 Codex + 两者的服务商/模型"终于在**同一个板块**里。
  - 5 个板块：`engine`🤖 / `network`🌐(局域网+改密码) / `prompt`📝(系统提示词+快捷标签) / `template`📁 / `runtime`🔧(优先内置+更新引擎)。
  - **两级折叠**：引擎折叠块内的检测按钮/逐个验证收进 `.sx-adv`「高级选项」（默认收起）；模型整块包进 `#{engine}ModelBox`，**服务商=official 时整块隐藏**（原版订阅由官方账号定模型，没得选）。
- **app.js**：
  - `SETTINGS_PANES` 配置数组（`{id,icon,title,desc,summary,fill,save/saveKeys}`）驱动一切；`renderSettingsNav()` 渲染卡片（图标+标题+说明+**当前状态摘要**，不点进去也能看到状态）；`openSettingsPane/backToSettingsNav/closeSettingsPane`；`CurrentPane` 记录当前板块。
  - **逐板块保存**：`saveCurrentPane()` → 各 pane 的 `save()` 走 `patchSettings(局部字段)`。可行因为后端 `SettingsStruct.update` 本就是**只认传入键的 patch**。返回/关闭都会先保存，不会改了没生效。旧的 `saveSettings()`（一次提交全部字段）改为 `backToSettingsNav()` 的薄壳。
  - **模型自动定档** `autoPickModel(engine)`：official→提示无需设置；已有模型→不动（不覆盖用户选择）；无 Key→提示"填好 Key 会自动检测"；否则 `fetchEngineModels(engine, auto=true)`。
    触发点三处：①换服务商(`onEngineProviderChange`) ②API Key 填完(`change`/Enter，`onApiKeySettled`) ③进面板时已存第三方+Key 但无模型(`loadEngineProvider` 末尾)。另外 `saveEngineProvider` 在第三方缺模型时先自动补一次再报错。
    **只改表单下拉、不落盘**——落盘仍由「保存」按钮走 `/api/engine/config`（否则会把新模型配到旧的已保存服务商上）。
  - `fetchEngineModels(engine, auto)`：`auto` 时提示写模型状态行（紧贴下拉）、否则写服务商状态行；选中优先级 **用户原选 > 后端 recommended > models[0]**。
  - 修掉两处「标签跟不上表单」：新增 `syncModelProviderTag()` 让「模型 xxx」小标跟随表单选中的服务商（原来一直显示上次已保存的）；`loadEngineProvider` 的状态文案 `当前：`→`已保存：`（它描述的是已保存态，表单可能已改）。
  - 顺带把这一片的 `set-note` 类名统一成markup 声明的 `sx-note`（两个类 CSS 里都有，不影响观感，只是之前 JS 覆盖成了另一个）。
- **后端**（`EngineConfigStruct` + Server，需重启）：
  - `ProviderMeta` 加 `preferModels?: string[]`；新增 `pickDefaultModel(provider, ids)`：按 preferModels 顺序在**API 真实返回的 id** 里找子串命中，没命中用 `ids[0]`，空列表返回 `''`。
    ⚠ **这不是兜底模型列表**（不违反 2026-08-04「去掉兜底模型」的决定）：只做排序挑选，API 返回空仍照旧在 `listModels` 抛错，绝不拿写死的名字去请求。
  - `minimax.preferModels = ['MiniMax-M3','MiniMax-M2']`（官方文档推荐 M3，M2.x 无图片识别）。其余服务商不猜模型名，直接用 API 返回的第一个。
  - `/api/engine/models` 响应加 `recommended`。
- **styles.css**：`.sx-nav/.sx-navi(+ic/tx/sum/arrow)`（板块卡片，hover 上浮 accent 描边）、`.sx-back`、`.sx-pane`、`.sx-adv(+head/arrow/body)`（虚线胶囊折叠头）；
  ⚠ 修了 `.sx-body > .sx-sec:first-child` / `.sx-lbl:first-child` —— 板块化后 pane 才是 `.sx-body` 的直接子元素，补上 `.sx-pane > …:first-child` 否则每个板块首个标题会带一条多余分隔线。
- **验证**：Playwright file:// 渲染 + 桩 `api()`（注意 `State` 是 `const` 词法全局、不挂 window，只能 `Object.assign(State.settings, …)`；`api` 是函数声明故可 `window.api=` 覆盖）：
  5 个板块摘要正确、首页 0 输入控件、逐个点进去**只显示对应 pane**、`minimax`+Key → **自动选中 recommended 的 `MiniMax-M3`（而非 models[0] 的 MiniMax-Text-01）**、换回原版 → 模型清空且整块隐藏、高级选项默认收起可展开、0 产品报错。逐板块截图肉眼确认。
- 版本号 styles/trans/app `?v=20260805c`。⚠ 前端刷新即用（板块化/折叠/自动选模型都在前端）；但 `recommended` 字段来自新后端，**未重启前自动选中会回退到 models[0]**（不报错，只是可能不是推荐的那个）。tsc + node --check 通过。
- 顺带发现（未改）：`trans.js` 顶层有 4 个重复 key `cancel/selectAll/save/edit`（同名后者覆盖前者，值一致故无实际影响）。

## 品牌改名 Rubato + 左上角标题与一句话介绍（2026-08-05）
- 产品名由 **Claude Hub** 改为 **Rubato**（用户面对的文案全改；`pm2` 应用名 `claude-hub`、目录 `claude_hub`、`package.json` name、`Server.ts` 启动日志、codex `model_providers.claude_hub`、`PromptBlock` 注释标记等**基础设施标识不动**——已写进用户本机 `~/.codex/config.toml` 与既有 CLAUDE.md 的标记块，改了会失配）。
- 改动点：`index.html` `<title>`→Rubato；`trans.js` `title` 字典 zh/en 均为 `Rubato`、英文 guide 欢迎语；5 份模板 `*.CLAUDE.md` 抬头「由 Claude Hub 模板生成」→「由 Rubato 模板生成」；`README.md` 标题；本文件标题。
- **左上角品牌区**（侧栏 `header`）：原先 `applyText()` 里把 `#appTitle` 清空 + `display:none`（2026-07-21 工作台模式时移除的），现改为显示 `T('title')`，`title` 属性挂 tagline。
  - 新增 `#appTagline`（`<p class="app-tagline">`）放在按钮组**之后**，靠 `.sidebar header{flex-wrap:wrap}` + `.app-tagline{flex-basis:100%}` **独占第二行**——窄侧栏(336px)也能完整换行，不与右侧按钮组抢空间。
  - trans 新增 `tagline`（**2026-08-05 定稿**，无句号）：zh「让 Claude Code / Codex 更易用」/ en「Making Claude Code / Codex easier to use」。
    同一句也进**浏览器标签页标题**：`index.html` 静态 `<title>Rubato — 让 Claude Code / Codex 更易用</title>` 作首屏默认值，
    `applyText()` 里 `document.title = \`${T('title')} — ${T('tagline')}\`` 使其随语言切换。
  - `.sidebar header h1` 改 18px / 700 / letter-spacing 1px / `var(--accent)`（跟随主题变色，10 个主题通用）。
- ⚠ 副作用（已知、可接受）：标题占了 67px 后，336px 侧栏里按钮组换行，`📖` 落到第二行右侧——是 header 既有的 `flex-wrap` 响应式行为，非报错。
- 版本号 styles/trans/app bump `?v=20260805b`。Playwright 无头渲染断言 tagline 在标题与按钮行**之下**且整行宽(303px)、截图确认。纯前端静态，刷新即用，**无需重启后端**。

## /compact 等快捷命令：按命令自定超时 + 专属进度条（2026-08-05）⭐ 后端需重启
- 需求：右下角「快捷命令」里的 /compact 执行时间长，需要更长超时（10 分钟），并加一个专属进度条。
- **后端**（超时改为逐命令指定，/compact 单独放宽）：
  - `AppConfig` 新增 `COMMAND_COMPACT_TIMEOUT_MS`（默认 `1000*60*10`=10 分钟，可用同名环境变量覆盖）；原 `COMMAND_TIMEOUT_MS`（1 分钟）保留给 /usage 等快命令。
  - `CommandsConfig.CommandSpec` 新增 `timeoutMs` 字段，逐条登记：usage→`COMMAND_TIMEOUT_MS`、compact→`COMMAND_COMPACT_TIMEOUT_MS`（config 引入 AppConfig，无循环依赖）。
  - `CommandRunnerStruct.run` 把 `spec.timeoutMs` 透传给 `_exec`；`_exec` 签名加 `timeoutMs`（struct+realize 同步）。`CommandRunner._exec` 的安全超时 `setTimeout` 用传入的 `timeoutMs` 取代写死的 `AppConfig.COMMAND_TIMEOUT_MS`（并移除该已无用的 import）。
- **前端**（命令弹窗 `#cmdOverlay` 内新增专属进度条）：斜杠命令无流式进度 → 用「不确定态滑动动画进度条 + 已用时长 mm:ss 计时」。
  - index.html：`#cmdProgress`（含 `.cmd-progress-bar>span` 动画条、`#cmdProgressLabel`、`#cmdProgressTime`），放在 cmd-desc 与 cmd-output 之间。
  - app.js：`openCmdResult(item,out,running)` 执行中隐藏 `#cmdOutput`、`startCmdProgress()`（`setInterval` 每秒刷新 mm:ss，用 `Date.now()`）；完成/关闭 `stopCmdProgress()`。执行中禁用「知道了」按钮避免关掉后结果覆盖。
  - styles.css：`.cmd-progress*` + `@keyframes cmdProgSlide`（translateX 滑动，用 var(--accent) 渐变）。
- ✅ backend `tsc --noEmit` 通过、前端 `node --check` 通过。版本号 styles/trans/app `?v=20260805a`。**后端超时改动需 `pm2 restart claude-hub` 生效**；纯前端进度条刷新即用。

## 侧栏「已执行」醒目标识：任务刚停止且用户还没点开看（2026-08-04）
- 需求：会话刚从执行中停下来（不再处在执行状态），但用户还没点进去看这个会话的内容 → 左侧会话列表要有一个醒目色标「已执行」提示。
- 纯前端实现（`app.js`）：`State.justFinished`（新增 Set，与既有 `State.running` 同级同模式，纯内存、不跨窗口共享，符合本项目既有全局 State 惯例）。
  - `updateRunningFromTask(sessionId, task)`：任务状态从 running → 非 running 的瞬间，若该会话当前不是打开的会话（`sessionId !== State.sessionId`）就把它加进 `justFinished`；任务重新变 running 时清掉（避免重新执行还残留旧标记）。
  - `selectSession(id)`：点开会话时立即 `State.justFinished.delete(id)`，标记消失。
  - `renderSessions()`：`!running && justFinished` 时渲染 `<span class="just-finished-tag">`，放在 runTag 之后（两者不会同时出现，位置上刚好"接棒"）。
- `trans.js` 新增 `justFinishedTag: { en: 'finished', zh: '已执行' }`。
- `styles.css` 新增 `.just-finished-tag`（橙色系 + `pulse` 动画，明显区别于灰色 doneTag / 蓝色 runTag/testingTag，浅色主题单独配色）。
- 该标记是纯运行期概念（不落盘，符合 `tasks` 本身也是运行期状态、后端重启即清空的既有设计），只在当前打开的 hub 页面里，从"正在执行"到"停止"这次实时转换开始生效；不追溯页面刷新前已经结束的任务。
- 版本号 index.html 的 app.js/trans.js/styles.css bump 到 `?v=20260804b`。纯前端改动，无需重启后端，刷新即用。

## 加号「添加工作目录」引导 + 项目模板体系（2026-08-02）⭐ 后端需重启
- 需求：加号加根目录时给引导——①选已有目录 ②新建项目（名称仅英文/数字/下划线，选父目录默认 `D:\projects`/无 D 盘则 `C:\projects`/mac-linux `~/projects`，projects 不存在则建）。不论新建/选择，若根目录**缺 CLAUDE.md 与 AGENTS.md 都没有**→引导选模板：内置(网页工具 ts / 网页游戏 2D·3D ts / Python 工具)/自定义/不选。选内置写对应 CLAUDE.md+AGENTS.md（抽取本项目理念：记忆 mem.md、双语 zh/en、双主题、松耦合、复用、统一日志、CSS 独立文件、弹窗 max-height 内滚不遮按钮——**不含 struct.md 框架**）。设置里「模板集合路径」(如 `D:\templates`)：其每个直接子文件夹作模板，选中即复制覆盖到项目。
- **后端**：
  - `FsHelper` 加 `preferredBase()`(win 优先 D:\ 否则 C:\；unix ~)、`hasFileCI(dir,name)`(大小写不敏感查文件)、`copyDirInto(src,dst)`(递归复制覆盖，跳过噪声目录)。
  - `FsBrowserStruct.defaultProjectDir()`→`{path:<base>/projects}`；路由 `GET /api/fs/default-project-dir`。
  - `RootManagerStruct.createProject(name,parentDir)`：校验名 `^[A-Za-z0-9_]+$`、父目录递归建、项目目录已存在则报错、mkdir+addRoot；路由 `POST /api/root/create-project`。
  - `SettingsStruct` 加字段 `templateCollectionPath`(get/update/_patch)。
  - 新模块 `TemplateManagerStruct`+realize `TemplateManager`(全 helper 可达、薄 realize)：`needsTemplate(rootId)`(两文件都无→needed)、`listTemplates()`(内置 config + 集合路径子目录)、`applyTemplate(rootId,kind,templateId)`(builtin 写 md / custom copyDirInto)。路由 `GET /api/template/need|list`、`POST /api/template/apply`。
  - `config/TemplatesConfig.ts` + `config/templates/<id>.{CLAUDE,AGENTS}.md`(4×2=8 份，运行时 fs 读，非 import)。
- **前端**：新增 `frontend/rootwizard.js`(引导/新建项目/模板选择全流程)；`addRoot()` 改调 `openAddRootGuide()`。index.html 加 3 个 overlay(#addRootGuideOverlay/#newProjectOverlay/#templatePickOverlay) + 设置项 #templateCollectionPathInput；引入 rootwizard.js。app.js settings 读写加 templateCollectionPath；guide/template overlay 遮罩点击关闭。trans.js 加 arg*/np*/tp*/browse 词条(zh/en)。styles.css 加 `.rw-*` 卡片样式(rw-body flex+overflow 保证长内容内滚、按钮常驻)。
  - ⚠ 修复潜在层叠 bug：`#pickerOverlay` z-index 提到 120——目录浏览器可从新建项目/工作台弹窗内部唤起，原同 z-index:100 且 DOM 靠前会被后来的 overlay 盖住。
- ✅ backend `tsc --noEmit` 通过、前端 `node --check` 通过。版本号 styles/trans/app/rootwizard `?v=20260802j`。**后端新路由需外部 `pm2 restart claude-hub` 生效**（本会话不自重启）；纯前端部分刷新即用。

## 修复：收藏夹里会话不显示「执行中」（2026-08-02）⭐ 后端需重启
- 现象：选目录时某会话显示「执行中」，切到收藏夹同一会话却不显示。
- 根因：侧栏「执行中」由 `sessionHasRunning(s)=s.tasks 有 running` 驱动。**目录模式** `listSessions` 靠 `claudeSessionId` 建 `liveByUuid` 匹配 live 会话并合并 `tasks`，key 分叉也拿得到；**收藏夹** `listFavoriteSessions`→`getSession(收藏id=自然id `rootId:uuid`)`→`_get(id)` 精确按 `_live` 键查找。但 `_live` 以会话最初 id（草稿 id / 首个 uuid）为键，reconcile 换 uuid 后 **meta（含收藏标记）migrate 到自然 id、`_live` 键却没变** → `_get(自然id)` miss → 回退 `_buildMeta`（只读 jsonl，无运行期 tasks）→ 不显示执行中。
- 修复（`SessionManagerStruct.getSession` + realize `SessionManager`）：`_get(id)` miss 时按**自然 id 兜底** `_getLiveByNaturalId(id)`（遍历 `_live` 找 `rootId:claudeSessionId===id`）；`_hydrateLiveMeta(live, wantId)` 统一用 `wantId` 作返回 id（避免兜底命中草稿键 live 时把返回 id 退回草稿 id、丢收藏标记与前端选中）。前端无改动。tsc 通过。需外部 `pm2 restart claude-hub` 生效。

## 这是什么
一个兼容 PC + 移动端的本地工具：通过本地 `claude` CLI 执行任务，支持多会话并行、历史会话查看、任务队列顺序执行、停止/暂停/继续，过程（思考/工具）实时可见但不进入最终消息列表。用 pm2 启动。

## 当前进度（2026-06-28）
- [x] 后端骨架（Struct/Realize 分层）+ Express + WebSocket
- [x] 根目录管理 RootManager（增删查，会话按根目录隔离）
- [x] 会话管理 SessionManager（每会话一个 JSON 文件，绑定 claude session uuid）
- [x] ClaudeRunner：调用 `claude -p --output-format stream-json --verbose`，首个任务 `--session-id` 固定、后续 `--resume` 续接上下文；解析 thinking/tool/text/result
- [x] TaskQueue 调度：addTasks(可一次多个/累计)、顺序执行、stopCurrent(跳下一个)、pauseFlow/resumeFlow
- [x] 前端单页（响应式 PC+移动，i18n zh/en，独立 css），过程面板与最终消息分离
- [x] pm2 ecosystem.config.js（Windows 用 interpreter:'node' 避免 EFTYPE）
- [x] 端到端冒烟测试通过（claude 实际执行并返回最终消息）

## 关键设计
- 过程视图（thinking/tool/output）只走 WebSocket 广播，不持久化、不入 messages；只有 `result` 的最终文本和用户输入存入 `session.messages`。
- 会话与根目录关联：`session.rootId`，前端切根目录只列该根目录会话。
- 停止/暂停的去重：TaskQueue._killed 集合标记被手动杀掉的任务，其进程退出回调 `_onTaskDone` 被忽略，避免重复收尾/重复调度。
- claude 工作目录 = 根目录的绝对 path（spawn cwd）。

## 运行
```
cd backend && npm install
pm2 start ../ecosystem.config.js   # 或 npm run dev
# 访问 http://localhost:8970
pm2 restart claude-hub             # 改后端后重启
```

## 鉴权 + 主题 + 测试（2026-06-28 追加）
- [x] 访问密码登录：`AuthManager`，token = sha256(密码+盐)，跨重启稳定；客户端 localStorage 持久保存，登录一次长期免登。密码在 `AppConfig.ACCESS_PASSWORD`（默认 `iloveweilai1000`，可用环境变量覆盖）。
- [x] 鉴权中间件保护所有 `/api/*`（除 `/api/auth/login`）+ WebSocket 用 `?token=` 校验。
- [x] 深 / 浅双主题：`body.dark` / `body.light` CSS 变量，右上角 🌗 切换，localStorage 持久。
- [x] **关键修复**：prompt 原通过命令行参数传给 claude，在 Windows `shell:true` 下被空格截断（claude 只收到首词）。改为 `--input-format text` + stdin 传入，`ProcessSpawner.run` 增加 stdinInput 参数。
- [x] Playwright E2E（`e2e/hub.spec.js`）：登录→主题切换→加根目录→建会话→提交 2 个任务→实际创建 alpha.txt/beta.txt 并校验内容→过程/消息分离→刷新免登。全绿（40s）。
  - 运行：`cd claude_hub && npx playwright test`（config 指向已缓存 chromium-1223 避免下载）。

## 目录选择器（2026-06-28 追加）
- [x] 后端 `FsHelper`（通用：drives/listSubdirs/searchSubdirs BFS）+ `FsBrowser`(Struct/Realize)。
- [x] 接口：`GET /api/fs/list?path=`（空=主目录，返回 dirs+drives+parent）、`GET /api/fs/search?base=&q=`（当前路径下 BFS 搜索文件夹，限 50 结果/4000 节点）。
- [x] 前端目录选择器弹窗替代 prompt 输入路径：盘符快捷、主目录/上级、可编辑路径栏(Enter 前往)、实时搜索(300ms 防抖)、文件夹列表点击进入、显示名默认=目录名、「选择此目录」确认。
- [x] E2E 已更新为走选择器（导航到上级→搜索 e2e-workdir→点击进入→命名→选择），全绿(18s)。

## 移动端体验重构（2026-06-28 追加）
- [x] 侧栏改为左侧抽屉：左上角 ☰ 按钮（`#drawerBtn`）滑入/滑出，`body.drawer-open` 控制，带 `#scrim` 背景遮罩点击关闭；选中会话自动收起抽屉。
- [x] 主区 ChatGPT 风格：消息占满、输入框沉底（含 `env(safe-area-inset-bottom)` 安全区）。
- [x] 过程面板移动端改为全屏覆盖层，由头部 ⚙（`#procBtn`）切换、✕（`#closeProcessBtn`）关闭；移除旧的底部 `mobile-tabs`。
- [x] `.icon-btn`/`.scrim`/`.proc-close` 桌面端隐藏，仅 ≤860px 显示；桌面端布局不变。
- [x] Playwright 移动视口(390×844)测试通过：抽屉滑入滑出、遮罩、过程覆盖层、composer 在视口内；桌面全量 E2E 无回归。

## 任务输入交互（2026-06-28 追加）
- [x] 回车=提交单任务，Shift+回车=换行（含输入法 isComposing 保护）。
- [x] 任务队列「展开/收起」按钮（`#queueToggle`），展开后纵向完整清单（带序号、完整文本、max-height 46vh），避免小框滚动。
- [x] 按钮紧凑化（`.sm`）；单任务提交按钮改名 **Submit** 置于右下角；新增 **批量任务** 按钮（`#addTasksBtn`）在左上角 → 打开弹窗，每行一个任务、自由数量、实时计数，「加入队列」一次性追加多个任务并按序执行（后端 prompts[] 已支持）。
- [x] Playwright 验证：批量弹窗输入 3 行→提交→队列 3 个→展开序号可见→three 个文件依次创建。全绿。

## 根目录链接/备注 + 浅色主题修复 + 紧凑 UI（2026-06-28 追加）
- [x] Root 增加 `note` 与 `links[{label,url}]`；`RootManager.updateRoot` + `POST /api/root/update`；`_sanitizeLinks`(realize) 去空、缺协议补 https://。
- [x] 前端：侧栏 rootMeta 显示备注 + 链接（`target=_blank rel=noopener`）；编辑入口集成在 rootMeta（有内容显示 ✎，无内容显示低调「＋ 添加备注/链接」），不再有独立 Edit 按钮。
- [x] **浅色主题 bug 修复**：`.session-item.active` 等原硬编码深色 `#243049`/`#2a3040`，改为 `--active`/`--hover` 主题变量（深/浅各一套），并补 `body.light .badge.paused`。会话在浅色主题下不再发黑。
- [x] 紧凑 UI：添加根目录改为方形「＋」图标按钮（`.icon-square`），删除为「🗑」，下拉占满宽度（`.root-row`）。
- [x] Playwright 验证：浅色主题下选中会话背景亮色(r>180)、＋按钮、集成备注编辑入口、链接持久化补协议，全绿。

## 运行身份修复（2026-06-28 追加）⚠️ 重要（仅 Linux 部署，Windows 无此限制，代码不依赖 claudeuser）
- 现象：spawn 出的 claude 报 `--dangerously-skip-permissions cannot be used with root/sudo privileges`，任务全部失败。
- 根因：claude-hub 当时注册在 **root 的 pm2**，进程以 root 运行；`--permission-mode bypassPermissions` 等价于 `--dangerously-skip-permissions`，被 claude 拒绝（root 安全限制）。spawn 用 `env: process.env` 继承父进程身份，所以子 claude 也是 root。
- 修复：① `sudo pm2 delete claude-hub`（从 root pm2 移除）；② `sudo chown -R claudeuser:claudeuser` 整个项目（否则 claudeuser 无法写 data/）；③ 以 **claudeuser** 身份 `pm2 start ecosystem.config.js`；④ `pm2 save` 持久化。
- 验证：以 claudeuser 用后端同参数跑 claude，`bypassPermissions` 正常返回 result，无 root 报错。
- **铁律：claude-hub 必须用 claudeuser 启动，绝不可用 root/sudo pm2 启动。** 其余 pm2 服务(ai-service/devokai-site/uicom-dev-server)也都是 claudeuser。

## 消息复制按钮（2026-06-28 追加）
- 每条最终消息(`.msg`)头部行 `.msg-head` 改为 flex 两端对齐：左 `.who`，右 `.copy-btn`(📋)。点击复制整条原文。
- `copyText()`：优先 `navigator.clipboard`，非安全上下文(局域网 http)回退 `textarea+execCommand`；按钮短暂显示 ✓/✕ 反馈(1.2s)。
- `addMessageEl` 改用 DOM 构建 + `body.textContent`(原 innerHTML+escapeHtml)；正文 `.msg-body` 保留 pre-wrap。
- trans 新增 `copy`/`copied`。纯前端静态文件，改完无需重启 pm2。

## 删除等待中的任务（2026-06-29 追加）
- 仅 `pending`（已加入但尚未开始）的任务可直接删除：队列每条 pending 任务右侧有 ✕ 按钮。
- 后端 `TaskQueueStruct.removeTask`（校验仅 pending 可删）→ `_dropTask`(realize 从 session.tasks 移除并落盘)→ 广播 `{kind:'taskRemoved', sessionId, taskId}`；路由 `POST /api/task/remove {sessionId, taskId}`。
- 前端 `taskEl` 对 pending 渲染 `.qdel`(✕，stopPropagation 防误触选中)，`removeTask()` 调接口，WS `taskRemoved` → `removeTaskLocal()` 移除并重渲染。运行中任务请用 stop，非 pending 后端拒绝。

## 会话标题 + 搜索（2026-06-29 追加）
- 会话列表与主区标题不再显示 "Session 时间戳"，改为取第一条消息（优先用户消息）首句（≤60 字，折叠空白）。无消息时回退到 `untitledSession`（新会话）。
- 实现：前端 `sessionTitle(s)`（纯前端派生，后端 session.name 不变）。`renderSessions`/`selectSession` 均改用它。WS `message` 事件首条到达时刷新主区标题与列表（`wasEmpty` 判定 + 同步 State.sessions 内对应对象的 messages）。
- 会话标题旁 🔍（`#searchToggleBtn`）切换搜索栏（`#searchBar`）：默认按标题过滤；勾选「全文搜索」（`#advSearch`）后扩展到所有对话消息全文，命中非标题时在条目下显示上下文片段（`matchSnippet` + `.snippet`）。纯客户端，基于已加载的当前根目录会话（含 messages）。
- trans 新增 search/searchSessions/advancedSearch/noSearchResults/untitledSession。纯前端静态文件，改完无需重启 pm2。

## AI 消息 Markdown 渲染（2026-06-29 追加）
- AI（assistant）消息按 markdown 渲染：标题/列表/代码块/表格/引用/分隔线/图片/链接等。用户输入仍保持纯文本（`textContent`），避免 prompt 被误解析。
- 依赖本地 vendor（不走 CDN，适配局域网/离线）：`frontend/vendor/marked.min.js`(v12) + `frontend/vendor/purify.min.js`(DOMPurify v3)，由 `express.static(FRONTEND_DIR)` 直接服务。`index.html` 在 trans.js 前引入。
- 实现：`app.js` 新增 `initMarkdown()`（`marked.setOptions{gfm,breaks}` + DOMPurify `afterSanitizeAttributes` 钩子，给所有 `<a>` 强制 `target=_blank rel=noopener noreferrer`）与 `renderMarkdown(el,text)`（marked→DOMPurify.sanitize→innerHTML，失败回退 textContent，并加 `.md` class）。`addMessageEl` 对非 user 角色调用 `renderMarkdown`。
- 链接一律新标签打开（不在当前页跳出）。XSS 由 DOMPurify 净化。
- 样式：`styles.css` `.msg-body.md`（关闭 pre-wrap，块级元素自排版，代码/表格用 `--codebg`/`--border`，表头 `--hover`），深浅主题通用。
- 纯前端静态文件，改完无需重启 pm2（已确认 vendor 文件经 8970 端口正常服务）。

## 森林绿主题·竹林动效（2026-08-01 追加）
- 需求：绿色背景主题背后应有竹子。新增 `frontend/bamboo.js`（仿 sea.js/aurora.js 模式，`window.Bamboo.setActive(theme==='green')`）。
- 效果：多层景深竹竿（渐变高光+竹节暗环、随微风整体轻摆，越前越浓翠）、竿梢竹叶簇、缓缓旋转飘落的竹叶；浅绿林间光背景。尊重 prefers-reduced-motion（只画静态帧）。
- CSS：`#bambooFx`（fixed, z-index:-1, 浅绿径向+线性渐变背景），`body.green #bambooFx{display:block}`；`body.green .messages/.content/.main` 透明以透出竹林；**删除**原 `body.green .messages` 静态叶片 SVG 花纹（竹林取代，且其源码在插入块之后会覆盖透明设置）。
- 接线：app.js applyTheme 增 `window.Bamboo.setActive`；index.html 引入 bamboo.js 并把 app.js/bamboo.js 版本号 bump 到 `?v=20260801j`。纯前端静态文件，无需重启 pm2。

## 使用指南弹窗（2026-08-01 追加）
- 语言图标 `#langBtn` 右侧新增 `#guideBtn`（📖），点开一个非常友好的「使用指南」弹窗，专门介绍 claude hub 的用法。
- 弹窗 `#guideOverlay`（复用 `.login-overlay`）+ `.guide-card`（head 标题+✕ / body 可滚动分区 / foot「明白啦」按钮）；点背景/✕/按钮均可关闭。
- 内容分区（zh/en 双语，存于 trans.js `guideHtml`）：选工作目录→新建会话交代任务→任务队列→实时过程面板→会话管理(活跃/待测试/已完成/搜索/收藏)→主题&⇪一键推送→⚙引擎与模型设置，末尾小提示。语气温暖、带 emoji。
- app.js：`renderGuide/openGuide/closeGuide`；`applyText` 切语言时若弹窗打开则重渲染。CSS `.guide-*` 于 styles.css，深浅主题通用。纯前端静态文件，无需重启 pm2；index.html trans/app/styles 版本号 bump 到 20260802c。

## 命令行改密码 / 解除密码锁定（2026-08-01 追加）
- 需求：忘记密码或被锁在 Web 界面外时，能用命令行改密码，避免彻底无法访问；同时命令行可「解除密码锁定」。
- 新增 CLI 入口 `backend/src/cli/authctl.ts`（入口层，只转发给 AuthManager，不写业务）。用法（在 backend 目录）：
  - `npm run passwd -- set <新密码>` 或 `npx ts-node src/cli/authctl.ts set <新密码>`：强制设定/修改密码，**不校验旧密码**，直接覆盖（救急）。
  - `npm run passwd -- clear`：解除密码锁定——删除 `data/auth.json`，恢复到 needsSetup 状态，前端重新走首启引导设新密码。
  - `npm run passwd -- status`：查看是否已设密码。
- Struct 新增 `AuthManagerStruct.cliSetPassword(pw)`（强制覆盖，≥4 位）、`clear()`（删除记录返回是否删过）、IO 钩子 `_delete()`；Realize `AuthManager._delete()` = `fs.unlinkSync(AUTH_FILE)`（存在才删）。package.json 加 `"passwd"` 脚本。
- ⚠️ 注意：`data/auth.json` 是 gitignore 的本地文件，删了不可恢复（无 git 备份）。CLI 不进 server 进程，改后无需重启 pm2。tsc --noEmit 通过，CLI set/clear/status 全流程实测正常。

## 允许局域网访问·手机/其他电脑访问教程（2026-08-01 追加）
- 需求：勾选设置里「允许局域网访问」后，展开一段友好教程——手机或另一台电脑（需同一 WiFi/局域网）如何访问，给出地址并带复制按钮。
- 后端：新增 `helper/NetHelper.ts`（纯工具，`os.networkInterfaces()` 取非内部 IPv4 → `lanIps()`/`lanUrls(port)`，兼容 family 'IPv4'|4，跨平台）。`SettingsStruct` `AppSettings` 增可选 `port`/`lanUrls`，`get()` 里用 `NetHelper.lanUrls(AppConfig.PORT)` 填充（与 `outEndReady:OutEnd.exists()` 同模式；`_patch` 的 merged 不含二者故不落盘，纯运行时派生）。**改后端需重启 pm2 才会返回 lanUrls。**
- 前端：index.html allowLan 勾选行下新增 `#lanGuide`（默认 hidden）：标题+步骤(同一 WiFi→打开地址)+`#lanAddrList`(地址行，每行 `.lan-addr-url`+`.lan-copy-btn`📋 复用 `copyText`)+`#lanGuideHint`。styles.css 加 `.lan-guide/.lan-addr-*` 深浅通用。app.js：State.settings 增 `lanUrls/port`，loadSettings 存入；`renderLanGuide()` 按勾选展开并渲染地址（无地址给未连网提示；未保存时 hint 提示需重启生效）；openSettings 调用 + `allowLanChk` change 监听实时展开/收起。
- index.html styles.css/app.js 版本号 bump 到 `20260802d`。tsc --noEmit 通过。

## 消息收拢模式：显式展开/收起按钮（2026-08-01 追加）
- 问题：收拢模式下 AI 消息默认折叠成一张卡片，整卡可点开但无明显提示，用户不知能点。
- 改法（app.js）：① `addAssistantGroupEl` 折叠卡由 `<button>` 改为 `<div>`（避免嵌套按钮非法），底部加居中「▾ 展开」按钮（`.ai-collapse-foot` + `.ai-collapse-toggle-btn`，图标+文字），整卡仍可点；② `addExpandedAssistantGroupEl` 把原来放在 `.msg-head` 的收起按钮（旧 `.ai-inline-collapse-btn`）移到消息底部，改为「▴ 收起」，与展开位置对称。
- CSS（styles.css）：`.ai-collapsed-msg` 加 `cursor:pointer`；删除 `.ai-inline-collapse-btn`，新增 `.ai-collapse-foot`（flex 居中，margin-top:8px）+ `.ai-collapse-toggle-btn`（胶囊描边、图标+文字）。复用已有 trans `expand`/`collapse`。纯前端静态文件，无需重启 pm2。

## 过程面板桌面端可折叠（2026-06-29 追加）
- 问题：桌面端右侧过程面板（`.process-panel`）原 `display:flex` 永久打开（38%/min280px），⚙ 在桌面端隐藏、✕ 也仅移动端显示，导致面板关不掉、挤占消息区"挡视角"。
- 修复（styles.css）：① `.process-panel` 默认 `display:none`，`body.show-process .process-panel{display:flex}`（与移动端统一）；② `.proc-close` 桌面端也显示；③ `.proc-btn`(⚙) 与 `.files-btn` 一样桌面端 `inline-flex` 显示。JS 切换逻辑(procBtn→show-process / closeProcessBtn→remove)本就正确，无需改。
- 纯前端静态文件，刷新即可，无需重启 pm2。

## ⚠️ 真凶：文件层覆盖 hidden 属性（2026-06-29 修复）
- 现象：一进页面右侧就被一大块铺满"挡住视角"。一开始误判为过程面板/浏览器缓存，均不是。
- 根因：新加的 `#fpOverlay.fp-overlay`、`#filesOverlay.files-overlay` 在 index.html 上写了 `hidden`，但 styles.css 里 `.fp-overlay/.files-overlay { ... display:flex }` 优先级高于 UA 的 `[hidden]{display:none}`，导致 hidden 失效、两个文件层默认全屏显示。用 Playwright `elementsFromPoint` 探测右侧才定位到（fp-drawer 宽 998px、files-drawer 380px）。
- 修复：styles.css 顶部加 `[hidden] { display: none !important; }`，让 hidden 始终生效。Playwright 复测：fpOverlay/filesOverlay/process-panel 三者 display 均为 none，页面正常。
- 教训：自定义 overlay 用 `display:flex` 时务必兼容 `hidden` 属性（或用 `:not([hidden])`）。

## 会话文件 下载/预览 + 图表能力（2026-06-29 追加，参考 baojia1 供应链助手）
参考 `D:\projects\baojia1\projects\nexar` 的供应链助手（KucunChatPage/FilePreview/KucunChart/ChartParse），把「文件下载、预览、图表」能力搬到 claude_hub（不搬 api/mcp）。

### 文件下载/预览（后端已分层落地）
- 后端：`SessionFilesStruct`(调度) + `SessionFiles`(realize 按扩展名分类 kind/previewable) + `FsHelper.listFilesRecursive/safeResolve`（递归列举、防越界）。
- Types 加 `FileMeta{name,sizeKb,ext,kind,previewable,mtime}` + `FileKind`。
- 路由：`GET /api/session/files?id=`（列举）、`POST /api/session/files-resolve {id,names}`（消息中文件名→真实文件）、`GET /api/session/file?id=&name=&download=1`（流式下载/内联预览，带 token 鉴权）。
- 前端 app.js：AI 消息正则抽取候选文件名→resolve→渲染「附件卡片」(预览/下载)；右侧「📁 文件」抽屉(`filesOverlay`)列全部文件；预览抽屉(`fpOverlay`)：xlsx/csv→SheetJS(`XLSX.sheet_to_html`) 多 sheet 切换、md→marked、txt/json/代码→pre、pdf→iframe、图片→img。
- vendor：`xlsx.full.min.js`（已加）。预览归类前后端对齐。

### 图表能力（本次新增）
- vendor 新增 `echarts.min.js`(v5.5.1)，index.html 引入（在 xlsx 后、trans 前）。
- app.js：`parseCharts(raw)` 从 AI 正文抽取 `<chart type bar/line/pie/table title x y>JSON数组</chart>` 块（正文移除该块），`chartCardEl`/`renderChart` 用 ECharts 渲染（bar/line/pie），table 渲染数据表。`addMessageEl` 对 AI 消息先 parseCharts 再渲染 markdown，图表单独成 `.msg-chart` 卡片。
- 主题自适应：renderChart 读 `--text/--muted/--border` CSS 变量设轴线/文字/网格色，深浅主题通用；窗口 resize 统一重绘（`_charts` 集中管理）。
- styles.css 加 `.msg-chart/.mc-chart(高320)/.mc-title/.mc-table`，版本号 `?v=20260629c`。
- **让 AI 会输出图表**：`AppConfig.CHART_SYSTEM_PROMPT` + ClaudeRunner `--append-system-prompt` 注入提示，告知可用 `<chart>` 块（仅数据适合可视化时，不强制）。可用环境变量覆盖/置空关闭。
- tsc --noEmit 通过；parseCharts 单测通过。

## 文件编辑器/预览 语法高亮（2026-06-29 追加，CodeMirror 5）
- 需求：文件编辑器要适应不同文件类型（php/js/...）有语法高亮。
- 方案：本地 vendor CodeMirror 5.65.16（离线/局域网可用，不走 CDN）。文件在 `frontend/vendor/cm/`：core(js/css) + theme `material-darker`(深色) + addon(matchbrackets/closebrackets/active-line) + mode(javascript/xml/css/htmlmixed/clike/php/python/ruby/go/rust/shell/sql/yaml/markdown/sass/dart/swift)。index.html 在 trans 前按依赖顺序引入（xml→javascript→css→htmlmixed→clike→php…）。
- 编辑器（edOverlay）：`openEditor` 用 `CodeMirror.fromTextArea($('edArea'))` 懒创建单例 `Editor.cm`，每次打开按扩展名 `extToCmMode(ext)` 设 mode、setValue、clearHistory、按主题设 theme。lineNumbers/matchBrackets/autoCloseBrackets/styleActiveLine，indentUnit=tabSize=2。Ctrl/Cmd+S 经 `extraKeys` 保存。`edMarkDirty` 监听 cm `change`，`saveEditor/closeEditor` 改读 `Editor.cm.getValue()`。
- 预览（fpOverlay）：代码类文件（mode 命中）改用只读 `CodeMirror(host,{readOnly})` 高亮，其余仍 `<pre>`；md/grid/pdf/img 分支不变。
- 主题联动：`applyTheme` 同步 `Editor.cm.setOption('theme', light?default:material-darker)`（typeof 守卫避免 TDZ）。
- CSS：`.ed-drawer .CodeMirror{flex:1;min-height:0;height:100%}`、`.fp-code .CodeMirror{min-height:60vh;边框}`。版本号统一 `?v=20260629e`。
- 纯前端静态文件（含 vendor），改完无需重启 pm2。

## 终端原生会话聚合 + 续接（2026-06-29 追加，参考 baojia1/projects/cc）
- 目标：打开一个根目录，能看到该目录下**所有** Claude Code 会话——包括没在本系统里、而是直接在 `claude` 终端聊的；并且可只读查看、可"接着聊"（等价终端里对同一会话连续追问）。
- 原生会话存储：`~/.claude/projects/<编码目录>/<uuid>.jsonl`，编码规则=工作目录绝对路径里所有非字母数字字符替换为 `-`（`D:\projects\claudecode`→`D--projects-claudecode`）。每行一个 JSON 帧（user/assistant/summary…）。
- 跨平台：`helper/ClaudeStoreHelper` 用 `os.homedir()`+`path.join` 定位，编码正则对 Linux(`/home/claudeuser/x`→`-home-claudeuser-x`)与 Windows 通用；可用 `CLAUDE_CONFIG_DIR` 覆盖 `.claude` 目录。
- 分层：
  - `helper/ClaudeStoreHelper`：projectsRoot/encodePath/projectDir/listSessionFiles/sessionFile/readLines/mtimeMs（纯存储约定，业务无关）。
  - `logic_struct/NativeSessionStruct` + `logic_realize/NativeSession`：把 jsonl 解析成 hub `Session` 形态。metas()=轻量列表(标题/时间)、full()=全文消息、importMessages()=接管用。`_plainText` 只取 text 段(忽略 thinking/tool_use/tool_result)，`_isToolEcho` 跳过工具结果回灌的 user 帧。
  - `SessionManagerStruct`：`listSessions` 合并 内部会话+原生会话，按 `claudeSessionId`(uuid) 去重(内部优先)；`getSession` 对 `native:` 前缀走原生解析；新增 `adoptNative`。原生相关为 Struct 钩子(`_nativeSessions/_nativeSession/_adoptNative/_isNativeId`)，实现落在 `SessionManager` realize（依赖 RootManager 拿根目录绝对路径）。
- 原生会话 id 形如 `native:<rootId>:<uuid>`（rootId/uuid 均无冒号，split(':') 还原）。`Session` 新增可选 `origin:'native'`。
- 接管(adopt)：向原生会话发消息时前端先调 `POST /api/session/adopt {id}` → 建一个内部会话，`claudeSessionId=原生uuid`、`claudeStarted=true`(首条任务即 `--resume`)、导入终端历史到 messages；已接管过则复用。之后发任务=续接原会话。
- 前端(app.js)：`ensureSendableSession()` 在 addTask/submitTasks 前把 `native:` 会话接管并切换；会话列表对 `origin==='native'` 显示「终端」徽章(`.src-badge`)、隐藏删除(不动 ~/.claude 终端记录)。trans 加 nativeBadge/nativeSessionHint。styles 加 `.src-badge`。index.html 版本号 `?v=20260629f`。
- ⚠️ 尚未编译/重启验证（按用户要求暂缓 restart.sh）。

## 任务队列：已完成任务折叠（2026-06-29 追加）
- 需求：已完成的任务默认折叠到一个带数字的按钮，点击展开/再收起。
- 实现(纯前端 app.js)：`Queue.showDone`(默认 false) + `FINISHED=['done','stopped','error']`。`renderQueue` 把队列里已完成任务折到一个 `.done-toggle` 按钮（`✓ 已完成 (N) ▼/▲`，点击 `toggleDone`）；pending/running 始终显示，已完成项仅在展开时渲染（序号沿用真实位置）。
- trans 加 `doneTasks`；styles 加 `.done-toggle`（虚线胶囊）。版本号仍 `?v=20260629f`（本会话未重启，沿用）。

## 停止信号原生化 + 斜杠命令 + 文件上传（2026-06-29 追加）
- **原生停止信号**：`helper/ProcessSpawner` 的 `kill()` 改为"优雅中断优先、超时再强杀"。Unix 先 `SIGINT`(=终端 Ctrl+C/ESC 原生中断)，3s 未退出再 `SIGKILL`；Windows 先 `taskkill /t`(请求结束进程树)，3s 未退出再 `taskkill /t /f`。stopCurrent/pauseFlow 调用链不变，停止动作更接近终端原生行为。
- **斜杠命令(/)**：纯前端，输入框打 `/` 弹候选菜单(`#slashMenu`)，**透传给 claude 的原生 slash 命令**(clear/compact/cost/context/model/review/init/memory/help/status)。`updateSlashMenu`(input 时按 `/前缀` 过滤)、`renderSlashMenu`、上下键/Enter/Tab 选中(`moveSlash`/`pickSlash`)、Esc 或失焦关闭。选中后填入命令名+空格，可补参数再回车发给 claude(走普通 addTask)。SLASH_COMMANDS 列表在 app.js，可增删。
- **文件上传到 <会话根目录>/tmp/**：
  - 后端：`UploaderStruct`(调度+校验) + `Uploader`(realize：建 tmp/、`_safeName` 清洗文件名(剔除 `<>:"/\|?*` 与控制符)、`_dedupe` 防重名 foo-1.foo-2、`fs.writeFileSync`)。路由 `POST /api/session/upload?id=&name=`，用 `express.raw({type:'*/*',limit:'200mb'})` 收原始二进制 body(不走全局 json 解析、不加依赖)。上传只需 session→rootId→root.path，原生(native:)会话未接管也能传。
  - 前端：composer 加 📎(`#uploadBtn`)+隐藏 `#fileInput`(multiple)。`uploadFiles` 用 fetch 把 File 原始字节 POST 上去(带 x-auth-token)，成功后把返回的 `tmp/xxx` 相对路径插入输入框便于 prompt 引用。
- trans 加 uploadFile/uploadFailed；styles 加 `.slash-menu/.slash-item`、`.composer-input{position:relative}`。index.html 版本号 `?v=20260629g`。
- ✅ 已 `tsc --noEmit` 通过 + `bash restart.sh -s` 重启，pm2 online、`/` 返回 200、日志无报错。

## 消息单一数据源：以 claude 原生 jsonl 为准，不存第二份（2026-06-29 追加）
- 决策：会话正文(messages)**不再在 hub 持久化**，统一以 `~/.claude/projects` 原生 jsonl 为准；任务队列(`tasks`/`paused`)等 hub 独有状态仍存盘。好处：不再两头存、终端里续聊的内容也能正确反映。
- 后端改动：
  - `SessionManagerStruct.saveSession` 落盘时剥离 messages（写 `{...session, messages:[]}`；内存对象不变）。
  - `getSession(id)`=**仅元信息**(messages:[])，供调度热路径(TaskQueue 的 append/mark/finish/tick 等)避免每次解析 jsonl；`getSessionFull(id)`=元信息+正文(内部会话经 `_loadMessages` 实时解析原生 jsonl，原生会话本就含全文)，供前端 `/api/session/get` 与 adopt 返回。
  - `_loadMessages`(realize)：`!claudeStarted` 或文件不存在/异常→[]，否则 `NativeSession.importMessages(root.path, claudeSessionId)`。
  - `listSessions` 内部会话一律 `messages:[]`（不下发正文）。
  - `TaskQueue._recordUser/AssistantMessage` 改为**只 WS 广播、不持久化**；`appendMessage` 已删除。
  - 列表标题：`_markRunning` 首条任务时把默认名 `Session …` 替换为任务摘要(≤60字，仅作 label，非存正文)。
  - `_adoptNative` 不再导入正文(messages:[])，返回前用 `_loadMessages` 补正文供前端即时展示。
- 前端：列表不再随会话下发正文 → **全文搜索仅覆盖"当前打开的会话"**(其余需打开后；标题搜索不受影响)。新增 `sessionMessages(s)`：打开中的会话取 `State.session.messages`，否则取 `s.messages`(通常空)。WS message 仍即时入内存+DOM，刷新/切换后由 getSessionFull 从原生重读(无重复)。版本号 `?v=20260629h`。
- 注：旧 data/sessions/*.json 里残留的 messages 为死数据，下次 saveSession 即被剥离，读取一律忽略，无害。
- ✅ tsc 通过 + restart.sh -s 重启，online、/ 200、无报错。

## 执行中动画气泡（2026-06-29 追加）
- 任务执行(running)时，消息区底部显示一个动画气泡(三点跳动 + "执行中"标签)，结束/最终消息到达即移除。纯前端。
- app.js：`isSessionRunning()`(看 tasks 有无 running) + `syncTypingIndicator/showTypingIndicator/removeTypingIndicator`(气泡 id=typingMsg)。`renderMessages` 末尾 syncTypingIndicator；WS `message` 事件先 remove 再 add 消息再 sync(保证气泡始终在底部)；WS `task` 事件后 sync(running→显示，结束→移除)。
- styles.css：`.msg.typing` + `.typing-dots i`(@keyframes typingBlink 跳动)。版本号 `?v=20260629i`。纯静态，无需重启 pm2。

## 会话项复制 session id（2026-06-29 追加）
- 每个会话项右下角加 ⧉ 按钮(hover 显现)，点击复制该会话的 `claudeSessionId`(uuid，可用于终端 `claude --resume <uuid>`)。
- app.js：`copyText` 增加 `restore` 参数(反馈后恢复的图标，默认 📋)；renderSessions 右侧改为 `.si-actions` 纵向栈(del 在上、copy-id 在下=右下角)，点击 stopPropagation 防选中。trans 加 `copySessionId`。styles 加 `.si-actions/.copy-id`。版本号 `?v=20260629j`。纯静态，无需重启。

## ⚠️ 重大修复：session-id 校正 + 幽灵会话清理 + 图表围栏兼容 + 附件硬规则（2026-06-29）
- **根因**：claude 2.1.195 传入 `--session-id <uuid>` 时**并不总采用**（id 冲突/边界情况会自己另生成一个 id），导致 hub 记录的 `claudeSessionId` ≠ 真实 jsonl 文件名。messages 改以原生 jsonl 为准后，这些错位会话就①点开看不到历史 ②真实对话以另一个"原生会话"出现 → 重复。统计当时 7 正常 / 23 错位。
- **根治**：ClaudeRunner 从 stream-json 每个事件读回真实 `session_id`（新增 `RunCallbacks.onSessionId`），TaskQueue 新增 `_reconcileSessionId` 回写校正 `session.claudeSessionId` 并广播。以后无论 claude 用什么 id，hub 都以它实际用的为准。
- **一次性清理**：把 jsonl 缺失/根目录已删的 23 个幽灵会话移到 `data/sessions_ghost_backup/`（可恢复，未硬删）。真实对话仍在 ~/.claude，会以「终端」会话出现在列表。
- **图表看不到的真因**：AI 实际输出的是 markdown 围栏 ```chart + `{type,title,data:[{name,value}]}` schema，而前端 `parseCharts` 只认 `<chart></chart>` 标签 → 匹配不到。已让 `parseCharts` 同时兼容【<chart>标签】和【```chart 围栏】两种格式 + 数组/`{data|rows}`对象 schema（新增 `_buildChart`）。{name,value} 行经 chartCardEl 默认 x=name/y=value 正常渲染。
- **附件硬规则**：消息下的附件卡片（预览/下载）排除 `mem.md` / `struct.md` / `CLAUDE.md`（attachFilesToMessage 按 basename 小写比对跳过）。
- 版本号 `?v=20260629k`。后端已 tsc + 重启；前端静态刷新生效。

## 会话一视同仁：去掉 CLI 区分 + 删除连 jsonl（2026-06-29）
- 需求：hub 建的会话与终端会话本质相同（都是真实 claude 会话/jsonl），不再区分，统一对待。
- 前端：会话列表**移除 CLI 徽章**，所有会话都显示删除 ✕（不再按 origin 隐藏）。`src-badge`/`nativeBadge`/`nativeSessionHint` 不再使用（保留定义无害）。
- 删除统一且真正生效（修复"删了又以原生身份冒出来"）：`removeSession` 现在删 hub 记录的同时**删除对应 claude 原生 jsonl**；native: 会话则直接删其 jsonl。新增 `ClaudeStoreHelper.removeSessionFile` + struct 钩子 `_removeNativeSession`/`_removeNativeOf`（realize 经 RootManager 定位删除）。确认文案改为"将连同 Claude Code 对话记录一起永久删除"。
- 版本号 `?v=20260629l`。tsc 通过 + 重启。

## 彻底以 claude id 为准：不再自造 id + 去掉 claudeStarted 冗余（2026-06-29）
- 铁律：**绝不自造 session id**。`claudeSessionId` 唯一来源 = claude code 自己生成、经 stream-json 回报。
- 规则极简（删除 `claudeStarted` 字段，它可由 claudeSessionId 推出=冗余）：
  - `claudeSessionId` 为空 → 首条任务**不传 `--session-id`**，让 claude 生成；从输出读回真实 id 回写（onSessionId/_reconcileSessionId）。
  - 有值 → `--resume` 它。
  - 成功执行却没拿到 session_id → `_onTaskDone` 直接判 error（"claude 未返回 session_id"），不退而求其次。
- 改动点：Types 去 claudeStarted；createSession claudeSessionId=''（不再 Ids.uuid）；ClaudeRunner._buildArgs 仅按 claudeSessionId 决定 resume/首跑；_loadMessages/removeSession/adopt/native meta 全部改用 claudeSessionId；_markRunning 不再设 claudeStarted。
- 一次性迁移：清空所有"jsonl 不存在"的 claudeSessionId（7 个），并从存量记录删除 claudeStarted 字段。这样旧的"未开始"会话不会拿残留随机 id 去 resume 报错。
- 前端：claudeSessionId 为空时不显示 ⧉ 复制按钮。版本号 `?v=20260629n`。tsc 通过 + 重启。

## 修复"僵尸 running 停不掉"（2026-06-29）
- 现象：任务运行中后端被重启 → 内存进程句柄(`_running` Map)丢失，但磁盘 task 仍是 `running`；`stopCurrent` 只查内存 Map → 查不到直接返回 → 停不掉，永远卡 running。
- 修复：
  - 启动恢复 `TaskQueue.recoverStuckRunning()`（在 `Server.start` 最前调用）：进程重启后没有任务真在跑，把磁盘上所有 `running` 收尾为 `stopped`。
  - `stopCurrent`/`pauseFlow` 改用 `_currentRunningTaskId`：优先内存句柄，没有则回退到磁盘上 status==='running' 的任务，照样能收尾。
  - `_killHandle` 仅在有真实句柄时才标记 `_killed`（僵尸无句柄，直接 finishTask）。
  - 新增 `SessionManager.allSessions()` 供启动恢复遍历。
- 已验证：重启后 sess_c98c63632239(ea895297) 的 running → stopped。tsc 通过 + 重启。

## 新建会话防重复空会话（2026-06-29）
- 当前会话若已是空的新会话（`!claudeSessionId && tasks.length===0`），点「新会话」不再创建新的，直接复用当前并聚焦输入框。版本号 `?v=20260629o`。纯前端。

## 会话 id 链：修复续接 fork 导致历史不全/重复出现新会话（2026-06-29）
- 根因：`claude -p --resume <id>`(续接非最新会话时)会 **fork 出新的 session id**(新 jsonl，旧历史以 context 嵌入、不再作为可显示消息)。原先 reconcile 把会话 id 直接替换成新 id → ①只读到新文件 = 历史不全 ②旧 id 不再被去重 = 以"终端会话"重复出现(用户误以为"自己创建了新会话")。
- 解法：Session 增加 `sessionChain: string[]`(按时间记录用过的所有 claude id；`claudeSessionId`=链尾 tip)。
  - reconcile：拿到新 id 时**追加到链**并把 tip 指向它（不再替换丢弃）。
  - `_loadMessages`：合并链上**所有** jsonl，按帧 uuid 去重(NativeSession 解析时 message.id 改用 claude 帧 `uuid`)、按时间排序 → 完整历史。
  - `listSessions` 去重：`taken` 覆盖每个会话的**整条链**，旧 id 不再作为原生条目冒出来。
  - `removeSession`：删除整条链的所有 jsonl。adopt/native meta 初始化 `sessionChain=[uuid]`。
- 续接仍用 tip(`--resume claudeSessionId`)，等价终端发一条消息（参考 cc 跟随新 id 的思路，但额外保留整条链以合并完整历史）。
- 已修复 sess_c98c63632239 的链=[ea895297,b47e824c]。**实测**：合并后 35 条(29+6)、首条=最初提问、列表不再重复；reconcile 链增长/去重/同 id 不重复均通过。版本号无需变(纯后端)。tsc 通过+重启+200。

## ⭐ 彻底单一数据源：删除 hub 会话存储，左侧列表 = claude 自己的会话（2026-06-30）
- 背景：左侧会话与 claude code 实际会话长期不一致。根因=**双数据源**（hub 自建 `data/sessions/*.json` + claude jsonl），靠合并/去重/reconcile/sessionChain/幽灵清理一堆补丁维持，天然脆弱（空草稿落盘、fork 重复、id 错位、标题分叉）。
- 决策（用户要求）：**hub 不再持久化任何会话/消息**，唯一数据源 = `~/.claude/projects` 的 jsonl。运行期状态（任务队列/暂停）**纯内存**，后端重启即清空（不存在僵尸 running）。
- 后端改动：
  - Types：`Session` 去掉 `sessionChain`/`origin`；`id` 改为自描述 `<rootId>:<claude uuid>`，草稿为 `<rootId>:draft-<rand>`（纯内存）。
  - `SessionManagerStruct/SessionManager`：彻底重写。`_live` 内存 Map（草稿+带队列的会话）取代磁盘。`listSessions` = 扫 jsonl 元信息(NativeSession.metas) + 叠加内存队列/暂停（保留运行期 id，草稿首跑后选中不丢）。`createSession`=只建内存草稿（不落盘、不自造 id）。`getSession` 内存优先否则由 id 解析 uuid 从 jsonl 构造。`getSessionFull` 正文实时解析 jsonl。`removeSession`=删 jsonl + 清内存。删除 adopt/native 前缀/_loadMessages 链合并/allSessions。
  - `NativeSession`：id 形如 `rootId:uuid`（去 `native:`），新增 `metaOne` 单文件元信息。
  - `TaskQueue`：`_reconcileSessionId` 简化为只回写 claudeSessionId（无链）；`_markRunning` 不再设标题（标题一律取自 jsonl）。删 `recoverStuckRunning`。
  - `Server`：删 `/api/session/adopt` 路由与启动恢复调用。`paths.ts` 删 `SESSIONS_DIR`。
  - 前端：删 `ensureSendableSession`/adopt/native 分支，直接对当前会话发任务；session WS 事件同步 claudeSessionId。
- 清理：删除 `data/sessions/`(27) 与 `data/sessions_ghost_backup/`(23) 死数据。
- 实测：tsc 通过+重启 online；claudecode 根 API 会话数 15 == 磁盘 jsonl 15，完全一致。

## 多引擎：Claude Code / Codex 可选 + 默认引擎设置 + 侧栏执行中标识（2026-07-02）
- 需求：新建会话时可选引擎（claude code 默认 / codex），一旦开始（有会话 id 或已入队任务）即锁定；设置里可改默认引擎；codex 也要能像 claude 一样续接。侧栏会话「执行中」需有标识，完成即消失。
- **数据模型**：`Session` 新增 `engine:'claude'|'codex'`。`claudeSessionId` 字段复用为「引擎会话 id」（codex=rollout/thread uuid）。会话 id 仍是 `rootId:uuid`（两引擎 uuid 命名空间不相交）。
- **Codex 执行**（对称于 claude 那套）：
  - `helper/CodexStoreHelper`：定位 `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`（可 `CODEX_HOME` 覆盖）。首行 `session_meta.payload` 有 `id/cwd`；按 cw==根目录绝对路径过滤（`_readFirstLine` 只读文件头 64KB 块直到首个换行，避免整体载入大对话文件）。index/listByCwd/findFile/sessionExists/removeSessionFile/readLines。
  - `helper/CodexBin`：Windows 解析 `codex.cmd`→`codex.js`，用 `node codex.js` shell:false spawn（同 ClaudeBin 思路，避免 shell 截断）；非 win 直接 `codex`。
  - `logic_struct/CodexRunnerStruct` + `logic_realize/CodexRunner`：`codex exec [resume <id>] --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox -`（prompt 走 stdin，`-` 占位）。已有会话 id 且 rollout 存在→resume 续接；否则首跑。解析 `--json` 事件：`thread.started`→onSessionId(thread_id)；`item.completed` 按 item.type 分发（agent_message=onFinal，reasoning=onThinking，command_execution/file_change/mcp_tool_call/web_search/todo=onTool，error=onOutput）。RunCallbacks 复用 ClaudeRunnerStruct 的接口。
  - `logic_struct/CodexSessionStruct` + `logic_realize/CodexSession`：解析 rollout 为 hub Session/messages。只取 `response_item` 的 role user/assistant 的 *_text，跳过 developer 角色与 `<environment_context|permissions|user_instructions>` 注入帧。实测 nexar/backend 下 6 个 codex 会话、标题/正文解析正确。
- **SessionManager**：`listSessions` = claude jsonl metas + codex metas 合并去重（`_codexMetas` 钩子）。`_buildMeta` 先试 claude 再试 codex。`_loadMessages`/`_removeJsonl` 按 `session.engine` 分流。`createSession(rootId,name,engine)` 草稿带引擎（缺省=Settings/AppConfig.DEFAULT_ENGINE）。新增 `setEngine(id,engine)`：仅草稿(未开始)可改，已开始抛错锁定。
- **TaskQueueStruct._startTask**：`runner = engine==='codex'?CodexRunner:ClaudeRunner`（两者 execute 同签名）。`_onTaskDone` 未拿到 session_id 的报错文案改中性「引擎未返回 session_id」。
- **Settings**：`logic_struct/SettingsStruct`+`logic_realize/Settings` 读写 `data/settings.json`（`defaultEngine`）。路由 `GET/POST /api/settings`。`AppConfig` 加 `CODEX_BIN/DEFAULT_ENGINE`。`paths.SETTINGS_FILE`。
- **路由**：新增 `POST /api/session/engine`；`session/create` 透传 `engine`。
- **前端**：主区标题旁 `#engineSelect`（草稿可选）/`#engineBadge`（开始后锁定徽章）由 `refreshEngineControl()` 切换；`onEngineChange`→`/api/session/engine`。侧栏 ⚙`#settingsBtn`→设置弹窗（`#defaultEngineSelect`）改默认引擎。会话列表项加引擎徽章 `.eng-badge`（claude/codex）+ **执行中标识** `.run-tag`(脉冲圆点)：`State.running` Set 由 loadSessions 初建、WS `task` 事件 `updateRunningFromTask` 增量更新（running→加入，结束→移除）；跨会话生效（task 分支移到当前会话早退之前）。版本号 `?v=20260702a`。
- ⚠️ 后端改动需重启才生效（本次按用户要求**未重启**，服务仍跑旧代码）；前端静态刷新即用，但新端点在重启前会 404（已 try/catch 降级，不致崩）。tsc 通过、app.js/trans.js node --check 通过、codex 解析实测通过。

## 侧栏会话项布局优化（2026-07-04）
- 标题最多 2 行（原单行省略号），可看到更多内容。
- 操作按钮（✕ 删除 / ⧉ 复制）改为**绝对定位悬浮右上角**，默认不占横向空间，hover 才浮现 → 标题用满整宽。
- 时间与所有徽章（执行中脉冲点 / 引擎 / 来源）合并到**同一行**并缩小（9px）。
- 新增「最近一条用户消息」预览行：后端 `Session.lastUser`（`NativeSession`/`CodexSession` 解析 jsonl 时持续覆盖 user 文本取最后一条，≤120 字），前端在标题下渲染 `.last-user`（2 行、紧凑、与标题相同则不显示）。
- 侧边栏加宽 20%：280px→336px（移动抽屉仍 84vw/max330px）。
- 版本号 `?v=20260704d`。tsc 通过。**后端改动需重启**才返回 lastUser。

## 待办 / 可扩展
- [ ] 任务"一次性多个"前端目前一次加一条（后端已支持 prompts[] 批量），可加批量输入 UI
- [ ] 会话重命名、过程日志落盘可选项
- [ ] 鉴权（当前仅本地无鉴权）
- [ ] 模型选择 / effort 选择（claude --model / --effort）透出到前端

## 2026-07-07
- 新增仓库根目录 restart.sh（转发到 projects/claude_hub/restart.sh），根目录即可一键类型检查+重启
- 服务已通过 pm2 启动（claude-hub, http://localhost:8970, 返回 200）

## 修复 Windows「无法解析 claude.exe」导致任务无法添加（2026-07-10）
- 现象：前端 `Server.task.add: ClaudeBin: 无法在 Windows 上解析 claude.exe`，任务加不进去。
- 根因：`ClaudeBin._resolveWindowsExe` 只走 `where claude.cmd` 再从 .cmd 文本里正则抽 `claude.exe`。但本机 npm 版 claude.cmd 内容是 `node ...\cli.js`（不含任何 .exe 路径）→ 正则匹配不到 → 返回 null → 抛错。而本机其实有**原生安装**的真实 `C:\Users\admin\.local\bin\claude.exe` 直接在 PATH 上。
- 修复：`_resolveWindowsExe` 先 `where claude.exe`（`_whereExe`）拿原生真实 exe 直接用（shell:false spawn，无分裂风险）；拿不到再回退旧的从 .cmd 解析（`_resolveFromCmd`）。
- 验证：`ClaudeBin.resolve('')` 返回 `.local\bin\claude.exe`；tsc 通过 + restart.sh -s 重启 online。

## 消息时间戳（精确到秒）+ 任务耗时显示（2026-07-14）
- 需求：每条消息显示精确到秒的时间；每次发消息后 AI 完成或用户取消，界面上显示「耗时：X」。
- 时间戳：`addMessageEl` 头部 `.who` 后插入 `.msg-time`（用 `m.createdAt`，`fmtDateTime` 格式化为 `YYYY-MM-DD HH:MM:SS`），`margin-right:auto` 使其紧跟角色名、复制按钮仍靠右。
- 耗时（**唯一一条**，修订 v=20260714b）：只统计「本轮 AI 最后一条回复距离触发它的用户消息」的时间，完成后仅出现一条。`renderElapsedNotes()` 走 `messages`：记录 lastUserTime，遇 assistant 且它是本轮最后一条（下一条是 user，或它是全场最后一条且 `!isSessionRunning()`）时，在该消息 DOM 节点后插入 `.msg-elapsed`（`耗时：X`，`fmtElapsed`：<60s 用 X.X秒，否则 X分Y秒）。消息 DOM 加 `data-mid=m.id` 供定位。不再按 task 逐条列，不再有取消/出错标签。
- 调用点：`renderMessages`、WS `message` 与 `task` 事件后各调一次；每次先清空旧 `.msg-elapsed` 再重建（幂等）。纯运行期，后端重启即清空。
- trans 加 elapsed。styles 加 `.msg-time`/`.msg-elapsed`。版本号 `?v=20260714b`。纯前端静态，无需重启 pm2。

## 文件上传增强：拖拽 / 粘贴图片 / 截屏（2026-07-17，参考 baojia1 供应链助手）
- 参考 `D:\projects\baojia1\projects\nexar\frontend\src\pages\KucunChatPage.tsx` 的上传/拖拽/截屏，搬到 claude_hub（纯前端，复用已有 `/api/session/upload` 端点，走 `uploadFiles(files)` 统一通道）。
- **拖拽**：`initDragUpload()` 给 `#composer` 绑定 dragover/dragleave/drop；拖入含 Files 时高亮（`.drag-over` 虚线 + `#dropHint` 覆盖层「松开即上传」），drop 即上传。
- **粘贴图片**：`#taskInput` 绑 `paste`→`onPasteImage`，从 clipboardData 取 `image/*` 文件直接上传，无图片则放行正常文本粘贴。
- **截屏**：`#shotBtn`(📷)→`captureScreenshot` 用 `getDisplayMedia` 抓一帧→`#shotOverlay` 预览弹窗；可在 `#shotStage` 上 pointer 拖拽框选（归一 0~1，`Shot.sel`），确定时 `cropShot` 按原图分辨率裁剪→`dataUrlToFile`→上传；不框选=整图。Esc/取消关闭。
- `uploadFiles` 增加无名文件回退名 `pasted-<ts>.<ext>`（粘贴/截屏图片无 name）。
- trans 加 screenshot/shotUnsupported/shotPreview/shotDragTip/confirm/cancel/dropToUpload。styles 加 `.composer.drag-over`/`.drop-hint`/`.shot-*`。index.html 加 `#shotBtn`、`#dropHint`、`#shotOverlay` 弹窗，版本号 `?v=20260717a`。
- **停止按钮文案**：`stopTask` 由「停止当前 → 下一个 / Stop Current → Next」改为「停止 / Stop」。
- 纯前端静态，node --check 通过，无需重启 pm2。

## 修复两个前端加载报错（2026-07-21）
- `rust.min.js: e.defineSimpleMode is not a function`：rust mode 依赖 CodeMirror `addon/mode/simple.js`，vendor 里缺失。补下载 `vendor/cm/addon/mode/simple.min.js` 并在 index.html mode 脚本前引入。
- `closeWsDir is not defined`：`workspace.js`（定义 closeWsDir/wsUseTypedDir 等）原在 app.js **之后**加载，而 app.js 载入即跑 `main()→bind()` 绑定这些函数 → 未定义。把 workspace.js 调到 app.js **之前**加载。
- 版本号 `?v=20260721b`。纯前端静态，无需重启 pm2。

## 工作台模式（跨目录会话合并，独立于经典模式，2026-07-21）
- 需求：新增可一键切换的「工作台模式」。不再左上角选根目录，每个会话各自绑定目录；跨目录（尤其近期）会话合并展示在左侧，列表显示会话所属根目录末段名；新建会话前先选目录（近期用过 / 手动添加，可勾选「不存在则创建」）；目录一经绑定不可改；也有搜索 + 活跃/待测试/已完成/所有四板块。整套独立、不改乱经典模式。
- **后端（最小追加）**：
  - `RootManagerStruct.ensureRoot(path, create)`：同路径根复用；否则可选 `mkdirSync(recursive)` 后 addRoot（名默认取末段）。`_samePath`（win32 大小写不敏感、去尾斜杠）/`_baseName`。路由 `POST /api/root/ensure`。
  - `SessionManagerStruct.listAllSessions()`：遍历 `_rootIds()`（realize=RootManager.listRoots().map(id)）合并各根 listSessions，置顶优先+updatedAt 倒序。路由 `GET /api/session/list-all`。
  - 复用既有 `status`(active/testing/completed)/`pinned`/status 路由/目录选择器，无需新表。
- **前端**：`State.mode`(localStorage `hubMode`) + `isWorkspace()`/`applyMode()`(body.mode-workspace)/`toggleMode()`。守卫式分支：`loadSessions` 走 list-all；`renderSessions` 加 `.dir-badge`(rootName=root.path 末段)；`newSession` 走 `openWsDir()`；`selectSession` 同步 `setTabRootId(session.rootId)` 让文件抽屉/上传按会话目录工作。目录选择器加 `Picker.onPick` 回调（工作台浏览时仅回填路径不加根）。
  - 新文件 `frontend/workspace.js`：选目录弹窗（近期目录列表=State.roots、手动输入路径+浏览+「不存在则创建」勾选、确认→ensure→create→select）。仅交互时调用，无加载顺序问题。
  - 头部加 `#modeToggleBtn`（🗂经典/🧭工作台）；`#wsDirOverlay` 弹窗；`#rootSection` id 供 CSS 在工作台模式隐藏根目录栏。**左上角标题「Claude 工作台」文字移除**（appTitle 置空+display:none）。
  - trans 加 mode*/ws* 词条。版本号 `?v=20260721a`（html/css/app/trans/workspace）。
- ✅ tsc 通过 + JS node --check 通过 + 重启 online；/ 与 /workspace.js 200，/api/session/list-all 与 /api/root/ensure 401（需鉴权=路由存在）。

## 根目录「前往」按钮（仅 Windows，2026-07-13）
- 需求：Windows 下在根目录旁放一个「前往」图标，点击在系统文件管理器中打开该文件夹。
- 后端：`FolderOpenerStruct`(校验 rootId→取 root.path→_openFolder) + `FolderOpener`(realize：win32=`explorer`，darwin=`open`，其余=`xdg-open`，均 detached+unref)。路由 `POST /api/root/open {rootId}`。
- 平台下发：`SettingsStruct.get()` 追加 `platform: process.platform`，前端据此显示/隐藏按钮。
- 前端：root-row 内新增 `#openFolderBtn`(📂，默认 hidden)，`loadSettings` 读 platform 后仅 win32 显示；`openFolder()` 调 `/api/root/open`。版本号 `?v=20260713a`。
- tsc 通过。**后端改动需重启**才生效。

## 外设库 out_end + 自洽打开即用（首启密码 / 局域网开关 / 服务商 / 更新）（2026-07-23）
目标：让 claude-hub 成为"下载到本地双击 start.bat 即可用、国内外通用"的自洽工具。

- **out_end 外设库**（`projects/claude_hub/out_end/`）：内置便携 Node + claude code + codex。
  - 约定：`out_end/node/`（便携 Node，win: node.exe；unix: bin/node）、`out_end/tools/`（npm --prefix 装的 claude/codex）。
  - `bootstrap.bat`/`bootstrap.sh`：下载便携 Node（可切国内 npmmirror 镜像）+ `npm i -g @anthropic-ai/claude-code@latest @openai/codex@latest --prefix tools`。二进制不入库（out_end/.gitignore 忽略 node/、tools/）。
  - `helper/OutEnd.ts`：定位 nodeExe/claudeCmd/codexCmd/toolsDir（存在才返回，从不抛错）。
- **优先系统、缺失回退内置**（设置项 `preferBundled`，默认 false=优先电脑已装）：
  - `ClaudeBin`/`CodexBin` 重写：`resolve(configured, preferBundled)`，按序尝试 [系统, 内置] 或 [内置, 系统]；新增 `prefixArgs`（支持 `node cli.js` 形式）+ `clearCache()`。ClaudeRunnerStruct/CodexRunnerStruct 传 `Settings.get().preferBundled` 并前置 prefixArgs。
- **首启密码由用户设定**（file-backed，替换旧 env 密码）：
  - `AuthManagerStruct` 重写 + `AuthManager` realize 读写 `data/auth.json`（`{salt,hash}`，token=hash）。`needsSetup/setup/login/changePassword/token/verify`。
  - 路由：`GET /api/auth/status`（无鉴权，needsSetup）、`POST /api/auth/setup`（首次设定）、`POST /api/auth/change`（改密，需旧密码）。前端 `#setupOverlay` 首启引导两次输入创建密码；main() 先探测 status。
  - ⚠️ 部署后旧 token 失效：无 auth.json 则走首启设定；本机 data/auth.json 已是 {salt,hash} 兼容格式。
- **仅 localhost，可选局域网**（设置项 `allowLan`，默认 false）：`Server` 按 allowLan 绑 `0.0.0.0`/`127.0.0.1`（改动需重启，前端会提示）。
- **引擎服务商**（`data/engines.json`，`EngineConfigStruct`+`EngineConfig`+`helper/HttpJson`）：
  - claude：original/minimax/kimi + apiKey + model。第三方经 `ANTHROPIC_BASE_URL/AUTH_TOKEN/MODEL` 注入进程环境（official=清除覆盖，回到订阅登录流程）。index.ts 启动时 `applyEnv()`。
  - 模型列表实时拉取：`GET /api/engine/models?provider=&apiKey=`（OpenAI 兼容 /v1/models，失败回退内置候选 PROVIDERS.fallbackModels）。
  - `GET/POST /api/engine/config`。前端设置面板「Claude 服务商」块（provider 选择/apiKey/拉取模型/保存）。
  - codex 仍用既有 CodexProfile（原版 ChatGPT ↔ Kimi K3，config.toml + kimi 代理）；engines.json 的 codex 字段暂存但未接管 codex 执行（codex 用 config.toml，非 ANTHROPIC_*）。⏳ 待办：codex minimax/统一。
- **手动更新引擎**：`EngineUpdaterStruct`+`EngineUpdater`：`npm i -g <pkg>@latest --prefix out_end/tools` 装进内置库，完清 Bin 缓存。`POST /api/engine/update {engine}`（`_wrapAsync`）。前端设置面板「更新 Claude Code / 更新 Codex」按钮。
- **启动器**：根目录 `start.bat`/`start.sh`（优先 out_end 内置 node，无则系统 node；缺依赖自动 npm install；前台 ts-node 跑后端 + 开浏览器；不强依赖 pm2）。
- **Server 新增**：`_wrapAsync`（异步端点）。前端版本号 `?v=20260723a`；设置面板样式 `.set-hr/.set-h/.set-check/.set-lbl/.set-note`。
- ✅ tsc 通过 + app.js node --check 通过 + 重启后新端点实测：auth/status={needsSetup:false}、settings 含 allowLan/preferBundled/outEndReady、engine/config 返回默认。

## 目录选择器支持新建目录（2026-07-25 追加）
- [x] `FsHelper.makeDir/joinChild/isValidDirName`；`FsBrowserStruct.createDir(parent,name)`（校验父目录存在、名称单层合法、不重名）。
- [x] 接口 `POST /api/fs/mkdir { parent, name }` → 返回 `{name,path}`。
- [x] 前端选择器工具栏新增「➕ 新建文件夹」(`#pickerNewDir`)：prompt 输入名称 → 在当前路径下创建 → 自动进入新目录（显示名自动填好，可直接「选择此目录」）。i18n: `newFolder` / `newFolderPrompt`。

## 过程轨迹 Trace：AI 工作全过程留存（2026-07-28 追加）⭐
- 目的：完整回看 Claude Code 干活的每一步，定位"慢在哪"。**详细数据说明见 `data.md`**。
- 存储：`data/traces/<rootId>/<claudeSessionId>.jsonl`，一行一个 `TraceEvent`，只追加、**字段一律不截断**。
- 新增代码：`helper/JsonlStore.ts`（纯工具）、`logic_struct/TraceStoreStruct.ts` + `logic_realize/TraceStore.ts`、
  `RunCallbacks.onEvent`（ClaudeRunner/CodexRunner 上报完整事件）、TaskQueue 接线（task_start/task_end/草稿 id 迁移）、
  `/api/session/trace`、`/api/session/trace-stats`、前端 🕒「全过程」抽屉、`backend/test/trace_e2e.ts`。
- 两路数据源合并：live（stream-json 实时捕获，独有任务边界/stderr/init/费用）+ jsonl（claude 自己落盘，覆盖终端手跑会话、官方时间戳）。
  冲突时 text/tool_use/tool_result **以 jsonl 为准**，live 只补缺失种类，故不重复。
- 统计：`spanMs = toolMs + modelMs`，另有 byTool / slowest / usage(token+费用) / byTask，用于判断瓶颈在模型侧还是工具侧。
- ⚠ **已知限制（实测确认）**：claude CLI 在 `-p` 模式下把 thinking 正文抹成空串、只留加密 signature，
  **实时流与落盘 jsonl 都一样**（扫本机历史 963 个 thinking 块全为空）。所以"想了什么"拿不到，
  但"何时思考、思考多久"可由 gapMs 得出。CLI 若放开，现有代码无需改动即可自动带上正文。
- 顺带：实时过程面板的压缩摘要阈值放宽（入参 300→2000、输出 500→4000 字符）；完整内容始终在轨迹里。
- 自测：`cd backend && npx ts-node test/trace_e2e.ts`（真跑建 xlsx 任务，11 项断言全绿）。

## 收藏夹：去掉「默认收藏」徽章 + 根目录快速筛选（2026-07-29）
- 「New session」按钮不再在收藏夹模式下附加 `default-favorite-badge`（`refreshNewSessionButton` 改为纯 textContent）。
- 🔍 右侧新增 🗂 `#favDirFilterBtn`（仅收藏夹模式显示），点击在 Active 分栏**上方**展开标签行 `#favDirFilter`（不是弹窗）：
  列出所有收藏会话涉及的根目录末段名 + 会话数，紧凑胶囊；点一个只显示该目录，再点取消；旁边 ✕ 一键清空。
- 纯前端筛选：`FavDir={open,rootId}` + `favDirOptions()`（对 `State.sessions` 去重计数）+ `renderSessions` 里
  `State.favoritesOnly && FavDir.rootId` 时过滤，零请求、即时响应。切出收藏夹时重置。
- i18n 加 `filterByDir`/`clearFilter`；样式 `.fav-dir-filter/.fdf-tag/.fdf-clear`。版本号 `?v=20260729a`。纯静态，无需重启。

## 快捷前缀标签 [quick]/[quick2]/[quick3]（2026-07-30）
- 输入框上方新增标签行 `#quickBar`：三个胶囊 `[quick] [quick2] [quick3]`，**单选**（点选中，再点同一个取消）。
- 热键 **Ctrl+1/2/3** 分别切换（document keydown，同样支持重复按取消；排除 alt/shift/meta 组合）。
- 选中后发送时自动加前缀：用户输入「请帮我分析这个文件」→ 实际发送「[quick2] 请帮我分析这个文件」。单任务(`addTask`)与批量任务(`submitTasks`，逐行加)均生效。
- **按会话持久化**：`Quick.map[sessionId] = tag` 存 localStorage key `hubQuickTag`；`selectSession` 开头调 `renderQuick()` 刷新选中态。
- 纯前端：app.js 新增 `QUICK_TAGS/Quick/quickLoad/quickSave/quickKey/currentQuick/setQuick/renderQuick/applyQuickPrefix`；
  styles.css 加 `.quick-bar/.quick-tag(.on)`；index.html 加 `#quickBar`。版本号 `?v=20260730a`。无需重启 pm2。

## Trace 界面入口（2026-07-28 追加）
- **每条 AI 消息头部「🔍」**：内联展开**该轮**全过程（小结条：本轮耗时/工具次数与耗时/模型耗时/事件数 + 可展开的事件列表）。
  归属靠时间窗（上一条消息时间 → 本条消息时间 +1.5s 容差）`buildMsgWindows()`/`traceEventsIn()`。
- **头部 🕒 抽屉**：整会话时间线 + 统计 + 种类过滤 + raw 开关；执行中按 1.2s 节流刷新。
- 前端按会话缓存轨迹（`ensureTrace`），收到 `trace` WS 事件标脏。
- 注意：`.icon-btn` 桌面端默认 `display:none`，新增头部图标按钮必须加进
  `.ai-collapse-btn, .files-btn, .proc-btn, .trace-hdr-btn` 这条白名单，否则桌面端点不到。
- E2E：`e2e/trace.spec.js`（内联展开 + 抽屉 + 过滤），已通过。
  `e2e/hub.spec.js` 目录选择器那步为**既有失败**（改动前同样失败），与 Trace 无关。

## 2026-07-30 开源前安全清理（claude_hub 侧）
- **移除硬编码 Kimi API Key**（`logic_realize/CodexProfile.ts` 的 `DEFAULT_KIMI_API_KEY`，真 key，已请用户吊销）。
  现在 `_readKey()` 顺序：`data/codex.json` → `KIMI_API_KEY` 环境变量 → `null`（未配置就报错提示去设置里填）。
- **删除死配置** `AppConfig.ACCESS_PASSWORD` / `AUTH_SALT`（曾写死 `iloveweilai1000` 与弱盐）。
  实际登录早已走 `AuthManager`：首次打开界面由用户设定密码，随机盐 + sha256 落盘 `data/auth.json`。**项目现在不含任何默认口令。**
- e2e 口令改读 `E2E_PASSWORD` 环境变量（`e2e/hub.spec.js`、`e2e/trace.spec.js`，缺失即抛错）。
- `data/session_meta.json`（本机会话 id）、`data/settings.json`（个人 systemPrompt）取消 git 跟踪并加进 `data/.gitignore`；
  删 `data/test-chart.xlsx`。缺文件时 `SettingsStruct` 会回落默认值，无副作用。
- 根目录新增 `LICENSE`(MIT)、重写根 `README.md`（含 bypassPermissions = 任意命令执行的安全须知）、
  新增 `OPENSOURCE_CHECKLIST.md`（开源发布必须新建仓库 + 排除清单）。
- 清掉 `backend/dist/`（陈旧产物里仍有旧口令，hub 走 ts-node 不需要它）与 `test-results/`。

## 新手引导改为强制前置，密码最后设（2026-07-30）⭐
- 新 key **`settings.setupDone`**（旧 `onboarded` 保留兼容，仅作历史标记）：表示语言/主题/引擎/服务商/模型都设好了。
- 顺序变了：`main()` 里 `auth/status.needsSetup=true`（还没密码=新用户）→ 先看 `setupDone`：
  false 就 `showOnboard()`（**不可跳过**，`#onboardSkip` 恒 hidden，`skipOnboard` 已删）；
  引导保存成功后 `onboardFinish` 判断全局 `NEEDS_SETUP` → `showSetup()` 设密码 → `doSetup` 进主界面。
  中途刷新（setupDone=true 但没密码）直接到设密码。
- **老用户（已有密码）绝不弹引导**：`startApp()` 里 `markSetupDone()` 静默把 `setupDone` 补成 true（原 `maybeOnboard` 已删）。
- 每步必须显式选择才能下一步：`Onboard.langSet/themeSet` + `engine/provider` 初始为空串（Next disabled）；
  第 4 步 claude 引擎必须已获取并选中模型（`obNeedModel`），codex 模型由 profile 固定故只校验 Key。
- 后端放开引导期免鉴权：`AuthManagerStruct.SETUP_OPEN_PATHS` + `isOpenDuringSetup(path)`（**仅 needsSetup 期间**生效，
  设完密码立刻收紧）；Server 鉴权中间件开头调用。白名单：settings / engine.status|providers|models|update|config / codex.key|profile。
- 设密码弹窗文案改走 i18n（`setupTitle/setupHint/setupPwd/setupPwd2/setupBtn/setupTooShort/setupMismatch/setupFail`），因为它现在排在选语言之后。
- 版本号 `?v=20260730e`。tsc 通过；本机 smoke：needsSetup=false → 白名单全关，符合预期。

## 首启体验补齐 + 全流程 e2e（2026-07-30 续）
- 修 bug：引导第 2 步换引擎时会**自动替用户选**服务商（`list[0].id`），导致第 3 步的「必须显式选」形同虚设。
  现在只在「已选的服务商不再可选」时清空为 ''。
- 新增**空白主区域上手引导** `gettingStartedEl()`（app.js，`.getting-started` 样式）：无会话时在 messages 区显示三步
  ① 添加项目目录 ② 选中该目录 ③ 新建会话+输入任务，按 `State.roots.length` / `State.rootId` 判定当前步高亮，
  底部按钮直接执行该步（addRoot / focus rootSelect / newSession）。i18n `gsTitle/gsStep1..3(+Hint)/gsAddRoot/gsPickRoot/gsNewSession`。
  ⚠ 关键接线：`selectSession(null)` 原来直接 `$('messages').innerHTML=''`，改为 `renderMessages()`，否则引导永远不显示。
- e2e：`e2e/onboard_flow.spec.js`（`HUB_URL=... npx playwright test e2e/onboard_flow.spec.js`，需 data/ 无 auth.json 的实例）
  覆盖：引导强制弹出、无「以后再说」、每步未选时 Next 置灰、缺 Key/缺模型被拦、密码在最后、进入后上手引导、加目录、老用户只登录不弹引导。
- 验证方式：`git clone` 到 D:\projects\hubtest（backend/node_modules 用 junction 复用）+ `PORT=8975` 跑 ts-node，
  playwright 打全流程截图逐帧看。**清理时注意**：先 `rmdir` 掉 junction 再 `rm -rf`，否则会删掉真的 node_modules。
- 踩坑（测试侧非产品 bug）：目录选择器刚打开时首屏 `navigatePicker('')` 是异步的，脚本立刻 fill `#pickerPath` 会被主目录覆盖 →
  必须先等 `#pickerPath` 非空再填。

## 多主题 + 主题选择面板 + 对话背景花纹（2026-08-01）⭐
- 需求：在原「经典深/浅」两主题外，非侵入地新增 **大海蓝**（ocean，深色系海洋蓝）与 **粉色少女心**（pink，浅粉系）两主题（主要背景色+字体色）；对话会话区引入主题花纹（经典黑白无花纹）；点主题处改为一个选择面板。
- 数据：沿用原 `localStorage.theme`，取值从 `dark|light` 扩展为 `dark|light|ocean|pink`；`body.<theme>` class 承载 CSS 变量。
- **CSS**（styles.css）：新增 `body.ocean` / `body.pink` 两套变量块（bg/panel/text/accent/hover/active/codebg… 全套，与深浅对齐）+ 各自 `.plog.*` 配色。
  - 花纹：`body.ocean .messages`=蓝色波浪 SVG（data-uri，opacity .09），`body.pink .messages`=粉色爱心 SVG（opacity .07），`background-repeat:repeat` + `background-attachment:local`；经典深/浅的 `.messages` 无 background-image。
  - 主题面板样式 `.theme-panel`（fixed top:52 left:12，弹层）+ `.theme-opt/.theme-sw(三色卡)/.theme-nm/.theme-chk`。
- **app.js**：`applyTheme` 现移除全部 4 个 class 再加当前；`THEMES` 数组（id/name/三色样本）；`currentTheme()`/`isLightTheme()`(light|pink 用 CodeMirror `default`，其余 `material-darker`)/`cmTheme()`（原 3 处 `contains('light')?...` 改用它）；`renderThemePanel/pickTheme/toggleThemePanel/closeThemePanel`。
  - 主题按钮 🌗→🎨，click 打开面板（stopPropagation），document click 点面板外关闭；选主题后面板不关，可连续预览切换。
- **index.html**：`.app` 内新增 `#themePanel`（title+grid，默认 hidden）。**trans.js** 加 `themePick/themeDark/themeLight/themeOcean/themePink`。版本号 `?v=20260801b`。
- 纯前端静态，node --check 通过，served 校验含新规则；无需重启 pm2，刷新即用。

## 创意主题扩展：森林绿/宠物猫/银河系/机械/赛博朋克/蒸汽朋克（2026-08-01 续）⭐
- 在 dark/light/ocean/pink 基础上再加 6 个创意主题，共 **10 主题**。均沿用同一套 `body.<id>` CSS 变量 + `.messages` 花纹机制。
  - **green 森林绿**（浅色，叶片 SVG）、**cat 宠物猫**（暖奶油+姜黄，猫爪印 SVG）、**galaxy 银河系**（深空紫，星点=CSS 径向渐变）、
    **mecha 机械**（钢铁灰+工业琥珀，铆钉网格=CSS 线性+径向渐变）、**cyber 赛博朋克**（深紫+霓虹品红/青，网格=CSS repeating-linear）、
    **steam 蒸汽朋克**（古铜棕，齿轮 SVG）。
- **isLightTheme**：改为 `LIGHT_THEMES=['light','pink','green','cat']` 集合判断（决定 CodeMirror 用 default 还是 material-darker）。
- **applyTheme**：移除类改为 `THEMES.forEach(t=>remove(t.id))` 动态清全部主题类，避免遗漏。
- trans 加 themeGreen/Cat/Galaxy/Mecha/Cyber/Steam。版本号 `?v=20260801c`。
- **验证**：Playwright 无头渲染 10 个主题（真实 8970 端口的 styles.css），逐一截图肉眼确认 + 断言背景色/花纹/文字色；经典深浅 hasPattern=false，8 创意主题 hasPattern=true，全部正确。纯前端，刷新即用。

### 微调：宠物猫脚印更清晰 + 银河系更壮丽（2026-08-01 再续）
- **cat 猫爪**：opacity 0.08→0.18，脚掌/脚趾略放大，填充色 #e08a3c→#d97a28（更深），奶油底上清晰可见。
- **galaxy 前景偏白**：`--text` #e6e2ff→#f6f7ff、`--muted` #9a92c8→#b9b3e0；`--bg` #0a0820→#06041a。THEMES 色卡同步。
- **galaxy 壮丽星云背景**：`.messages` 改多层背景——上层白色星点(8 层平铺、alpha 0.7~0.95)＋中层大幅星云云团(5 个 radial-gradient no-repeat：紫/品红/青/靛，营造银河)＋底层深空斜向 linear-gradient。用逗号分隔的 background-size/repeat 分层控制(星点 200px repeat、星云 100% no-repeat)。
- 版本号 `?v=20260801d`。Playwright 复渲染 cat/galaxy 截图确认。纯前端，刷新即用。

### 赛博朋克「信号不好」动效（2026-08-01 再续）
- 需求：cyber 主题要有赛博感 = 那种信号不好（CRT/坏信号）的动态感觉。纯 CSS 动效，仅作用于对话主区 `.main`，`pointer-events:none` 不挡交互。
- **`body.cyber .main`** 加 `position:relative; overflow:hidden`（承载绝对定位覆盖层，裁掉滚动带）。
- **`.main::before`**（z40）：CRT 扫描线（`repeating-linear-gradient` 1px 暗线/3px 一循环）+ 竖向青色细纹；三条动画叠加：`cyber-scan`(背景位移 steps 抖动滚动) + `cyber-flicker`(opacity .28~.62 不规则闪烁) + `cyber-glitch`(92%~97% 关键帧做几帧 translateX 抖动=信号跳变)。
- **`.main::after`**（z41）：一条青/品红/白的柔和「垂直同步带」，`cyber-roll` 从顶部 translateY 滚到 `100vh+180px`，模拟老电视 vertical-hold 失步的滚动亮带。
- **`.messages > *`**：`cyber-neon` 让气泡霓虹辉光轻微脉冲。
- **可访问性**：`@media (prefers-reduced-motion: reduce)` 关闭全部动画（滚动带 display:none）。
- 文字始终清晰可读（覆盖层为半透明线纹，非整块变暗）。版本号 `?v=20260801f`。Playwright 截图确认扫描线/同步带/可读性。纯前端，刷新即用。

### 银河系动态星空 + 蓝黑气泡（2026-08-01 再续）⭐
- 新文件 `frontend/galaxy.js`：`window.Galaxy.setActive(on)`，`applyTheme` 里按 `theme==='galaxy'` 开关。canvas 全屏动态星空：
  - **视口固定层** `#galaxyFx`（`position:fixed; z-index:-1`，CSS 画壮丽星云渐变），对话区在 galaxy 主题下 `.messages/.content/.main` 背景透明以透出星空（气泡本身不透明）。
  - **canvas** `#galaxyCanvas` 逐帧绘制：星星(数量按屏面积自适应、约 1/3 闪烁、亮星十字辉光、多深度)、**鼠标视差**(近星位移更大=整体轻微转视角，移动端用 deviceorientation)、**稀有流星**(间隔 9~26s、拖尾淡入淡出)、**偶尔飞船**(间隔 38~80s、船体+尾焰+闪烁信号灯)、**远处不规则星系微光**(4~8 个椭圆光斑随机不重复)。
  - 性能：`requestAnimationFrame`、DPR≤2、`visibilitychange` 隐藏即停；`prefers-reduced-motion` 只画静态一帧。
- **蓝黑气泡改色**（用户要求把银河系紫色气泡/字改偏蓝黑，深底字偏白，保持整体一致）：galaxy 变量 `--panel #0b1226 / --panel2 #0f1a33 / --border #223452 / --accent #3b82f6(蓝) / --hover #16233f / --active #1e3358 / --bg #05070f / --text #f2f6ff / --muted #aab9d6`；plog thinking/tool 改蓝(#93b4ff/#7dd3fc)。THEMES 色卡同步为蓝。星云背景保留紫/品红（太空自然色，与蓝气泡协调）。
- ⚠ 注意：`index.html` 现引入 galaxy.js + 其他主题效果脚本(cyber.js/rain.js/sea.js/aurora.js，其它会话在做)。版本号 `?v=20260801i`。
- 验证：Playwright 无头渲染，截图确认星云/视差/流星/飞船/远处星系 + 蓝黑气泡近白字可读；无 console 报错。纯前端，刷新即用。

## AI 消息收拢默认开启（2026-08-01）
- 需求：右上角「收拢 AI 消息」按钮(`#aiCollapseBtn`)，新用户默认应为选中(收拢)。
- 改动(纯前端 app.js)：`State.aiCollapsed` 初始化由 `localStorage.getItem('aiCollapsed') === '1'`
  改为 `!== '0'` —— 新用户(null)默认收拢；只有用户显式关闭写入 '0' 才展开。toggle 逻辑不变(写 '1'/'0')。
- 纯前端静态文件，刷新即可，无需重启 pm2。

## 无会话时直接提交自动新建会话（2026-08-01）
- 需求：新根目录、之前无任何会话，用户没点「新会话」而直接在右下角输入框提交时，原来 `addTask` 因 `!State.sessionId` 直接 return，点提交毫无反应。
- 改动(纯前端 app.js)：新增 `ensureSession()`——无当前会话时按模式自动创建：收藏夹→草稿；工作台→走选目录(openWsDir)返回 false；经典模式有 rootId→`/api/session/create`+loadSessions+selectSession；无 rootId→提示 selectRootFirst。`addTask` 改为 `if (!raw) return; if (!State.sessionId && !(await ensureSession())) return;` 之后照常发任务。等价「输入即自动开新会话」，最健壮（复用 newSession 的创建逻辑，不新增后端接口）。
- 纯前端静态文件，node --check 通过，刷新即可，无需重启 pm2。

## 启动器延迟开浏览器 + 上手引导「选择目录」按钮修复（2026-08-01）
- **start.bat / 启动.bat：等服务就绪再开网页**：原来在启动后端**之前**就 `start "" http://localhost:8970`，网页开太早、ts-node 还在启动/编译 → 首屏加载到未就绪服务显示报错，几秒后才好。改为先后台起一个 PowerShell 探测器（TCP `Connect('127.0.0.1',8970)` 轮询，最多 60s、每 500ms 一次），端口真正可连上后再 `Start-Process` 开浏览器；start.bat 里放在前台跑后端**之前**（`start /b` 后台）。跨平台仅影响 Windows 启动器，不动代码。
- **上手引导第 2 步「选择目录」按钮此前点了没反应**：`gettingStartedEl` stage 2（已有根但未选中）原 `$('rootSelect').focus(); $('rootSelect').click();`——多数浏览器不会用脚本弹开原生 `<select>` 下拉 → 无反应。改为新函数 `guidePickRoot()`：打开目录选择器（openPicker 回调）浏览并选中项目目录，走 `POST /api/root/ensure {path,create:false}`（同路径复用不重复添加），选完 `loadRoots()`+`applyRootSelection(root.id)` 进入下一步。
- 顺带抽出 `applyRootSelection(id)`（同步下拉框值/setTabRootId/renderWorkdirBar/renderRootMeta/loadSessions），`rootSelect` 的 change 事件与引导按钮共用。
- 版本号 `?v=20260801g`。纯前端 + bat，node --check 通过、PowerShell 一行解析通过、8970 在线且已服务新 app.js，刷新即用，无需重启 pm2。

## 每个主题专属「执行中」加载图标（2026-08-01）
- 需求：不同主题的加载动效图标也要契合主题——如粉色少女心应是几颗爱心在跳动，而不是统一的三个圆点。
- 载体：执行中的「typing 指示器」（app.js `showTypingIndicator` 里的 `.typing-dots > i×3`），原来所有主题都是三个 `--accent` 圆点弹跳。
- 改动（纯 CSS，styles.css，无需改 JS）：按 `body.<theme>` 覆写 `.typing-dots i`：
  - 粉色 pink：`::before` 换 💗，`heartBeat` 缩放怦怦跳；
  - 大海 ocean/深海 sea：🫧 气泡；下雨 rain：💧；森林 green：🍃；宠物猫 cat：🐾（沿用 typingBlink 弹跳）；
  - 银河 galaxy：✨；机械 mecha/蒸汽 steam：⚙️；赛博 cyber：保留方块但加霓虹 `box-shadow` 辉光；经典深/浅仍用原圆点。
- **关键：所有主题统一沿用原来的「波浪感」动效（`typingBlink` 三点错峰依次抬起），只换元素，不做一大一小的缩放/旋转。** 初版曾给 pink 做 heartBeat 缩放、galaxy 旋转、齿轮 spin，效果不佳被否掉，已移除。
- 版本号 `styles.css?v=20260801k`。纯前端静态文件，刷新即用，无需重启 pm2。

## 动效主题标记（2026-08-01）
- 需求：有动效的主题在主题选择面板里应有一个额外标记，让用户一眼看出。
- `THEMES` 里给带 canvas/背景动效的 6 个主题加 `anim:true`：green(竹林)/galaxy(星空)/cyber(信号不好)/rain(雨窗)/sea(深海)/aurora(极光)——即 `applyTheme` 里有 `window.X.setActive` 的那几个。
- `renderThemePanel` 对 `t.anim` 渲染一枚 `.theme-anim` 徽章（`✨ 动效`）；trans 加 `themeAnim`(动效/Animated)；styles 加 `.theme-anim`（accent 色胶囊，`color-mix` 半透明底+描边）。
- onboard 只提供 dark/light（无动效），未改。版本号 `?v=20260801m`（styles/trans/app）。纯前端静态，node --check 通过，无需重启 pm2。

## 银河系：白色自绘加载图标 + 飞船微倾角（2026-08-01）
- 加载图标：银河系原用 emoji `✨`，改为**自绘白色四角星**（sparkle）。从 emoji 共享规则组里摘出 galaxy，单独一块：`body.galaxy .typing-dots i` 用 `clip-path: polygon(...)` 画 12px 白色四角星 + `drop-shadow` 微光，`::before{content:none}`，沿用 `typingBlink` 三点波浪弹跳。
- 飞船不再完全水平：`spawnShip` 加 `tilt`(~0.07~0.16 rad≈4°~9°)；`drawShip` 在 scale 前 `ctx.rotate(-sp.tilt*sp.dir)` 使机头按行进方向微微上扬（左右向都上扬，角度经 dir 校正）。
- 版本号 styles.css/galaxy.js `?v=20260801n`。纯前端静态，node --check 通过，无需重启 pm2。

## 银河系飞船：行进方向与倾角一致（2026-08-01 修订）
- 上一版飞船有倾角但仍水平飞（vy=0），机头朝向与航向不一致。改为**沿机头方向飞**：`spawnShip` 由 `tilt` 推出 `vy = -speed*tan(tilt)*(W/H)`（W/H 纵横比校正，使屏幕运动角==绘制倾角），loop 里 `sp.y += sp.vy*dt`，越过顶部(y<-0.2)即回收。流星本就沿速度矢量画尾迹，无需改。
- 版本号 galaxy.js `?v=20260801p`。纯前端静态，node --check 通过，无需重启 pm2。

## 主题选择面板改精美：双列卡片布局（2026-08-01）
- 需求：主题弹窗更精美、布局交互合理优雅（此前单列全宽按钮 + 内联「✨ 动效」文字，拥挤易溢出）。
- 布局重构（styles.css）：`.theme-grid` 改 `grid` 双列；`.theme-opt` 改竖排卡片——顶部 34px 色板预览带（三色按 5:3:2 加权 flex，`--panel/accent/text` 主次分明）+ 下方名称（`text-overflow:ellipsis` 截断不溢出）。悬浮上浮 2px+阴影，选中态 accent 描边+inset 环。
- 角标替代内联文字：动效主题左上角 ✨ 圆形徽章（`.theme-anim`，半透明底+blur），选中右上角 ✓ accent 圆徽（`.theme-chk`，白字）；面板标题右侧加一行 `.theme-legend`「✨ 动效」图例说明含义。
- 面板：宽 300→320，圆角 14，`themePop` 弹出动画（.16s 从上方缩放淡入）。`renderThemePanel` 相应改结构（标题 innerHTML 加图例，✨ 只留图标）。
- 版本号 styles.css/app.js `?v=20260801r`。纯前端静态，node --check 通过，刷新即用，无需重启 pm2。

## 宠物猫主题：小猫探头动效（2026-08-01 续）⭐
- 需求：宠物猫(cat)主题「应该有一个小猫咪时不时探出头」。
- 新文件 `frontend/cat.js`：`window.Cat.setActive(on)`，`applyTheme` 里按 `theme==='cat'` 开关（同 galaxy/rain 等约定）。
  - 独立固定层 `#catFx`（`z-index:5`、`pointer-events:none`、`overflow:hidden`，绝不挡交互/弹层），内含 `.cat-peeker`（一只内联 SVG 姜黄虎斑猫头 + 两只扒着边缘的爪子）。
  - 默认 `translateY(118%)` 藏在屏幕底边之下；探头时加 `.peeking` → `translateY(8%) rotate(var(--peek-tilt))`，弹性 cubic-bezier 探出。
  - 调度：`setActive` 后随机 2.5~6s 首次探头 → 随机水平落点(`left`)+随机微偏头(`--peek-tilt` -7~7°) → 停留 2.8~4.8s → 缩回 → 间隔 13~30s 再来。`visibilitychange` 切后台即缩回停表。`prefers-reduced-motion` 则完全不探头。
  - CSS 动画：`.cat-eye` 眨眼(`catBlink` scaleY)、探头后 `.cat-inner` 轻晃东张西望(`catBob`)。
- **cat 主题标 `anim:true`**（面板显示「✨ 动效」徽章）。index.html 引入 `cat.js?v=20260801q`。
- 验证：Playwright 无头 file:// 渲染，强制 `body.cat`+触发探头截图确认（猫头/耳/眼/胡须/爪清晰，layer display:block、pointer-events:none、2 只眼），无产品报错。纯前端静态，刷新即用，无需重启 pm2。
- ⚠ 协同注意：本次与另一会话并行，对方 `git add -A` 把我的临时验证文件(cat_render.js/cat_peek.png)一并提交进 41559a2，已在 876abc2 里 `git rm` 清除。

## 冬季主题重做：远山小屋 + 朦胧感（2026-08-01 续）⭐
- 需求（用户逐条美术指导）：小房子要在**很远的地方、很小、在山上**；整体要**朦胧**、**不要那么像插画**；小房子也要**盖着雪**；**窗户和门不要重叠**；**山少一些**。
- winter.js 重写：
  - **小屋**：`CABIN={x:.66,y:.545,w:.032,h:.026}`（w/h 以 H 为单位，极小），坐在近山山坡上，下方垫一小抔雪堆防悬空。**窗（左 0.14~0.40w，暖光闪）与门（右 0.58~0.82w，深色）分列不重叠**；屋顶厚白雪 + 墙头一线积雪 + 细烟囱冒炊烟。
  - **朦胧/去插画**：远景做**空气透视**——远山 `ctx.filter blur(2.6*DPR)`、近山+树+小屋+炊烟 `blur(1.2*DPR)`，近处雪地与落雪保持清晰；叠加 `drawHaze()` 三条柔和横向雾带（山间/谷底薄雾）；配色整体低饱和低对比。
  - **山少**：三道→**两道**山脊，每道峰数 5~6→**3**。
  - **移除小女孩+白狗剧情**（drawGirl/drawDog/updateCast/drawCast/cast 状态机全删）——与「很远很小的山上小屋」尺度不兼容，且是最插画化的部分。若日后想要人物需另议。
- index.html `winter.js?v=20260801x`。Playwright 无头 file:// 渲染确认：两道朦胧远山、山坡上很小的雪顶小屋（暖窗在左/门在右不重叠）、稀疏发灰松树、谷底薄雾、落雪；无 console 报错。纯前端静态，刷新即用，无需重启 pm2。

## 「耗时：X」移入气泡内部（2026-08-01 续）
- 需求：本轮结束后 AI 最后一条回复下的「耗时：1分18秒」文字，应显示在气泡**内部**（末尾），而不是气泡外的独立一行。
- 改动（纯前端）：
  - app.js `renderElapsedNotes()`：`node.after(el)` → `node.appendChild(el)`，把 `.msg-elapsed` 挂进 `.msg` 气泡末尾（原来是气泡的兄弟节点，故在外面）。
  - styles.css `.msg-elapsed`：改为气泡内页脚样式——`margin:8px 0 0; padding-top:6px; border-top:1px dashed var(--border); text-align:right`，与正文用虚线分隔、右对齐小字。移除原来的外部行 margin。
- 只标注 assistant 本轮末条，不涉及 user 气泡。版本号随 index.html 到 `?v=20260801u`（另一会话并行已同步 bump app.js/styles.css）。node --check 通过。纯前端静态，刷新即用，无需重启 pm2。

## 新主题「乡村兔子」rabbit（2026-08-01 续）⭐
- 需求：远处一个乡村（老房子、老树、田地），中央一片木栅围栏地，里面一群兔子随机做动作（蹦跳/吃胡萝卜/睡觉/洗脸等），随机但切换周期较慢。
- 新文件 `frontend/rabbit.js`：`window.Rabbit.setActive(on)`，`applyTheme` 里按 `theme==='rabbit'` 开关（同 winter/cat 等约定）。独立固定层 `#rabbitFx`（z-index:-1，pointer-events:none），天空由 CSS 渐变透出、canvas 只画其余部分。
  - **远景**：两道起伏绿丘 → 3 座老房子（暖墙灰顶+门窗+烟囱）→ 4 棵老树（大圆树冠+粗干）→ 左右两块条纹田地（透视梯形 furrow）。
  - **围栏地**：透视梯形木栅——`drawBackFence`（后栏+两侧斜栏，先画）/ `drawFrontFence`（前栏粗横杆，兔子之后画，形成纵深），草皮地面 + 草点缀 + 几根胡萝卜。
  - **兔子群**（5 只，4 色皮毛）：状态机 idle/hop/eat/sleep/wash，`chooseNext` 加权随机、时长 2.5~17s（**切换周期慢**）。hop 计算围栏内落点分几跳到达；eat 先蹦到最近胡萝卜旁再低头啃；sleep 趴平+Zzz+呼吸起伏；wash 前爪擦脸；idle 耳朵微抖 + 随机眨眼。按 y 升序绘制（后→前），`rabbitScale` 越前越大。
  - `prefers-reduced-motion` 只画静态一帧；`visibilitychange` 切后台停表。
- 接线：THEMES 加 `{id:'rabbit', anim:true}`；`LIGHT_THEMES` 加 rabbit；`applyTheme` 加 `window.Rabbit.setActive`；trans `themeRabbit`(乡村兔子/Rabbit Meadow)；styles.css 加 `body.rabbit` 变量（田园绿）+ plog 色 + `#rabbitFx` 天空渐变 + 对话区透明；index.html 引入 `rabbit.js?v=20260801z`，bump styles/trans/app 到 `?v=20260801z`。
- 验证：Playwright 无头 file:// 渲染 6s 截图确认——绿丘/老房子/老树/条纹田地/木栅围栏 + 围栏里 5 只兔子分别在坐/蹦/吃萝卜/睡(带Zzz)，前栏压前排产生纵深；无 console 报错。node --check 全过。纯前端静态，刷新即用，无需重启 pm2。

## 任务清单「展开管理」弹窗 + 队列持久化（2026-08-01）⭐ 需重启后端
- **需求**：pending 任务多时内联区太憋屈；展开应是一个独立整体弹窗（更大空间、更多功能）：批量删除、修改、复制、暂定（暂时不执行）。另：用户反馈「任务清单一直是 0」。
- **根因（0 问题）**：任务队列原为**纯内存、不落盘、后端重启即清空**（见本文件设计说明）。本会话期间并行多会话 + 版本 bump 导致 pm2 **重启了 18 次**，每次重启把各会话的队列清空 → 用户看到一直是 0（`curl /api/session/get` 证实进程存活期间 tasks 正常返回）。
- **前端（app.js/styles.css/index.html/trans.js，已随 `?v=20260801s+` 服务，纯静态刷新即用）**：
  - 内联队列只展示前 `QUEUE_INLINE_CAP=8` 个紧凑 chip，超出显示「+N 更多」；`queueToggle`「📋 任务清单 (N) 展开管理」与 chip、+N 均打开弹窗 `#queueModal`。移除旧的内联 `.expanded` 纵向展开。
  - 弹窗 `renderQueueModal/qmRow`：每行 = 选择框(仅 pending) + 序号 + 状态点 + 正文 + 操作(复制/修改/暂定▶⏸/删除)。工具栏全选 + 「删除所选(N)」批量删除。修改=行内 textarea 保存。`QueueModal={selected:Set,editing}`；WS task/taskRemoved 变更时 `syncQueueModal` 重绘（编辑中且任务仍在则保留输入不冲掉）。
  - 暂定(held)：pending 任务打 `held` 标记，调度器跳过、保留在队列，可「恢复」。
- **后端（需 `pm2 restart claude-hub` 生效）**：
  - Task 增 `held?:boolean`；`_tick` 跳过 `pending && held`。
  - 新路由：`/api/task/removeBatch{taskIds[]}`、`/api/task/update{taskId,prompt}`（仅 pending 可改）、`/api/task/hold{taskId,held}`（解除 held 后 `_tick` 续跑）。Struct `TaskQueueStruct.removeTasks/updateTask/setHold` + realize `_patchTaskPrompt/_patchTaskHeld`（改后 broadcast `{kind:'task'}`）。
  - **队列持久化（根治 0 问题）**：`SessionManager._put/_del` 现把带任务/暂停的会话写入 `data/queue_state.json`（`_persist`，去正文）；启动 `SessionManagerStruct.restorePersisted()` 载回内存，把中断的 `running` 规整为 `stopped`（不自动重跑，避免重复执行），pending/held 原样保留；`TaskQueueStruct.restoreAndResume()`（`index.ts` 启动调用）对未暂停且有 pending 的会话 `_tick` 续跑。`paths.QUEUE_STATE_FILE` 新增。tsc 通过。
- ⚠ **未由本会话重启后端**：本任务本身作为 claude-hub 的子进程运行，`pm2 restart claude-hub` 会连同杀掉本会话进程。故后端改动（新路由 + 持久化）需**外部**重启一次才生效；重启后队列不再因重启丢失。

## 赛博朋克主题增强：旋转霓虹齿轮 + 街道蒸汽羽流（2026-08-01 续）⭐
- 需求：赛博朋克(cyber)主题「要有更多的齿轮、蒸汽效果」——在原合成波场景上叠加机械朋克齿轮群与蒸汽。
- cyber.js 新增（不改动原有 sun/skyline/grid/rain/glitch，非侵入叠加）：
  - **旋转霓虹齿轮**：`gears[]`（视口比例坐标，drawGear 换算像素适配 resize）。7 个齿轮压在四角/边缘、成对咬合、交替正反转（`spd`）。`drawGear` 生成梯形齿廓（每齿 谷→升→顶→降）+ 暗底填充 `rgba(6,2,20,0.42)`（深底上呈暗铁盘）+ 霓虹描边发光(shadowBlur) + 中心轮毂圆 + 6 根辐条。loop 里 `g.ang += g.spd*dt` 旋转。
  - **街道蒸汽羽流**：`emitters[]`（屏幕底部 3~4 个排气口）+ `steam[]` 粒子。`updateSteam` 按 rate 生成，向上升腾(vy 递减)、边升边扩散(r 增)、水平正弦飘移；`drawSteam` 用 `globalCompositeOperation='lighter'` + 径向渐变(青/品红→白→透明)画霓虹辉光雾，`sin(k·π)` 淡入淡出，上限 260 粒。
  - 层序：sky→sun→skyline→**gears**→grid→rain→**steam**→glitch。
  - `prefers-reduced-motion`：`seedSteamStatic()` 预铺一批静态蒸汽，齿轮静止绘一帧。
- index.html `cyber.js?v=20260801z1`。Playwright 无头渲染确认：7 齿轮咬合旋转（青/品红/紫）+ 底部蒸汽辉光升腾 + 原合成波场景，0 console 报错。纯前端静态，刷新即用，无需重启 pm2。

## 机械主题动态齿轮背景（2026-08-02）⭐
- 需求：机械(mecha)主题「要有齿轮、机械、效果」——此前 mecha 仅 CSS 铆钉网格，无动效。
- 新文件 `frontend/mecha.js`：`window.Mecha.setActive(on)`，`applyTheme` 里按 `theme==='mecha'` 开关（同 galaxy/cat 约定）。
  - 固定层 `#mechaFx`(`z-index:-1`、`pointer-events:none`) + canvas `#mechaCanvas` 逐帧绘制。
  - **咬合传动链** `makeTrain`：模数 m 固定 → 相邻齿轮节圆相切(中心距=Rp1+Rp2)、齿距一致、反向旋转、转速按齿数比(prev.speed*prev.z/z)；咬合相位对齐(齿对齿槽)。梯形齿廓、钢铁径向渐变、部分齿轮琥珀齿圈高光、轮辐(环+辐条挖空感)、中心轮毂+6 螺栓。
  - 场景：3 个远景大齿轮(alpha 0.08~0.10 做景深)、左下/右上两条清晰咬合链(主视觉，含琥珀齿轮)、中部一对小齿轮；**两处活塞** `drawPiston`：连杆挂在主齿轮曲柄销上，随旋转沿竖直气缸往复(气缸+连杆+活塞头+琥珀曲柄销)。钢板底色渐变 + 径向暗角。
  - 性能：`requestAnimationFrame`、DPR≤2、`visibilitychange` 隐藏即停；`prefers-reduced-motion` 只画静态一帧。
- 接线：THEMES 的 mecha 加 `anim:true`(面板显示「✨ 动效」徽章)；styles.css 加 `#mechaFx` 固定层 + `body.mecha .messages/.content/.main` 透明(透出齿轮，移除原 CSS 铆钉网格；气泡本身不透明，阅读不受影响)。index.html 引入 `mecha.js?v=20260802a`，styles/app bump `?v=20260802a`。
- 验证：Playwright 无头 setContent + addScriptTag 渲染 body.mecha 截图确认——咬合齿轮/钢铁质感/琥珀高光/轮辐螺栓/活塞连杆/景深大齿轮/暗角，layer display:block、无 console 报错。node --check 通过。纯前端静态，刷新即用，无需重启 pm2。

## 深海主题：每 3 分钟一只大鲸鱼优雅游过（2026-08-02）
- 需求：深海(sea)主题「每 3 分钟一只很大的鲸鱼优雅地游过，姿态优美」。
- `frontend/sea.js` 新增鲸鱼系统（非侵入，叠加在原光柱/气泡/水母/鱼群之上）：
  - 状态 `whales[]` + `nextWhale`；`spawnWhale` 从左或右屏外(x=∓0.28)入场，`vx≈0.02/秒`（横穿约 60~90s，从容优雅），`s=1.6~2.2`（很大）。
  - `drawWhale`：体外幽蓝径向柔光 + 背深腹浅体色渐变 + 发光轮廓；丰满须鲸身形(bezier)、靠后小背鳍、宽大新月尾叉(随 `flap=sin(ph)` 摆动)、近侧胸鳍(轻划)、喉腹褶纹沟、眼睛。整体随 `sin(ph*0.6)` 做优雅俯仰 + 轻柔上下起伏(`y=y0+sin*0.02`)。
  - loop 中 `elapsed>nextWhale && whales.length<1` 触发，spawn 后 `nextWhale=elapsed+180`（每 3 分钟）；`start()` 里首只 `elapsed+rand(12,22)` 稍早登场。出屏(x<-0.35||>1.35)即回收。
  - `prefers-reduced-motion` 静态帧不含鲸鱼（仅逐帧动画绘制），符合减少动态约定。
- index.html `sea.js?v=20260802b`。Playwright 无头渲染(强制鲸鱼即时出现)确认造型/0 报错。纯前端静态，刷新即用，无需重启 pm2。

## 重启不丢未执行任务：已实现 + 恢复健壮化（2026-08-02）
- 用户担忧：发多条消息后有 pending 任务未执行，一重启会不会丢。**核查结论：早已解决**（commit `0f7544d`「任务队列持久化」已上线，`data/queue_state.json` 正被运行进程实时写入）。
- 机制回顾：`SessionManager._put/_del`→`_persist` 把带任务/暂停的会话（去正文）落 `queue_state.json`；启动 `TaskQueue.restoreAndResume()`（index.ts）→ `SessionManager.restorePersisted()` 载回内存、把中断的 `running` 规整为 `stopped`（不自动重跑，避免副作用重复），pending/held 原样保留 → 对未暂停且有 pending 的会话 `_tick` 续跑。
- 本次修复的健壮性穴：`restoreAndResume` 循环里 `_tick` 未逐会话包 try/catch。若某会话根目录已删 → `RootManager.getRoot` throw → 整个循环中断，**其后所有会话的 pending 不再续跑**（index.ts 只包了外层）。改为**每会话独立 try/catch**，坏会话只跳过并 `Logger.warn`，不连累其余。tsc 通过。
- ⚠ 后端改动需外部 `pm2 restart claude-hub` 才生效（本会话是 claude-hub 子进程，不能自重启）。已有持久化不受影响。

## 全文搜索覆盖全部会话（2026-08-02）
- 问题：全文搜索「有时候无效」，用户的很多输入（尤其历史/其他会话里每次的输入）搜不到。根因：全文搜索原本纯前端，只在**当前打开的那一个会话**的正文里找（`sessionMessages` 仅当前会话有 messages，其余会话列表元信息 `messages:[]`）——所以除当前会话外，任何正文命中都被漏掉。
- 修复：新增后端跨会话全文搜索。
  - Struct `SessionManagerStruct.searchSessions(query, rootId?)`：rootId 传入=只搜该根目录（经典模式），缺省=跨全部根目录（工作台/收藏夹）。调度=取候选会话列表→逐个 `_matchSessionText`→收集命中。
  - Realize `_matchSessionText`：先比标题/预览（`customTitle`/`name`/`lastUser`，免读盘），未中再 `_loadMessages` 逐条读 jsonl 正文找首个命中，`_snippetAround`（前20后30字、折叠空白、补省略号）截片段。返回 `{id, snippet}`。
  - 路由 `GET /api/session/search?q=&rootId=` → `SessionSearchHit[]`（Types 新增）。
- 前端：`Search.hits`（id→片段）。勾选「全文搜索」或改关键词时 `scheduleFullTextSearch()`（300ms 防抖 + `reqSeq` 防竞态）请求后端；`renderSessions` 过滤放行 `Search.hits.has(id)`，片段优先本地 `matchSnippet`（当前会话即时）否则用后端片段。当前打开会话仍保留本地即时命中，无需等后端。
- 版本号 app.js/styles.css bump 到 `?v=20260802b`。后端改动需 `pm2 restart claude-hub` 生效；tsc 通过。

## 收藏夹加目录按钮 + 停止二选一 + 暂停序列补充执行（2026-08-02）⭐ 后端需重启
四个改动，围绕「收藏夹发送目录引导」与「停止/暂停语义」：
1. **收藏夹「添加新目录」**（纯前端）：收藏夹草稿会话未绑根目录时，主区 `favoriteDraftRootPickerEl` 的下拉+确定旁新增「＋ 添加新目录」按钮（`pickNewFavoriteRoot`）——与左侧「＋」一致（openPicker 选目录），选好后 `POST /api/root/ensure{path,create:true}`（同路径复用/可创建）→ `loadRoots` → **直接 `bindFavoriteDraftRoot(root.id)` 绑定并选用**（区别于左侧＋只添加不选）。i18n `addNewDir`。未选目录点发送仍 alert `favoriteRootRequired`（草稿主区本就显示该选择器）。
2. **提交按钮文案**：已是「提交/Submit」(`addTask` 词条)，无需改。
3. **停止按钮仅运行时显示**（纯前端）：新增 `refreshComposerControls()` 统管输入区控件——`stopBtn` 仅 `isSessionRunning()` 时 `display`；`pauseBtn`(继续任务流)+`#pauseHint` 仅暂停时显示；暂停时提交按钮改「补充并执行」(`supplementSubmit`)、输入框 placeholder 改 `supplementPlaceholder`。在 `renderQueue` 末尾、`refreshPauseBtn`、`applyText` 里调用。
4. **停止二选一弹窗**（前端+后端）：`stopTask` 若「未暂停且有后续 pending(非 held)」→ 弹 `#stopChoiceOverlay`：
   - **暂停整个任务序列** → `/api/flow/pause`（复用既有 pauseFlow：停当前+冻结后续）。
   - **停止当前，开始下一个** → `/api/task/stop`（stopCurrent）。
   - 已暂停 / 无后续 pending → 直接 stop，不弹。
   - **补充任务机制（后端核心，需重启）**：`Task` 加 `supplement?`。暂停期间 `addTasks` 检测 `session.paused` → 任务标 `supplement:true` 且 `_appendTasks(...,prepend=true)` **插到第一个 pending 非补充任务之前**（越过冻结队列、补充间 FIFO）。`_tick` 改为不再顶层 `if(paused)return`，而是 `find(pending && !held && (!paused||supplement))` —— 暂停中**仅补充任务越过暂停立即执行**，其余冻结等「继续任务流」。`restoreAndResume` 去掉 `if(s.paused)continue`（交由 _tick 过滤，使重启后 pending 补充也能续跑）。
- CSS：`.pause-hint`（虚线提示条）、`.stop-choice-*`（弹窗描述+两个纵向选项卡）。版本号 styles/trans/app bump `?v=20260802e`。
- ✅ 后端 tsc 通过、前端 node --check 通过。⚠ **本会话是 claude-hub 子进程（claude.exe←node.exe PID293504=8970 端口），不能自重启**——前端静态刷新即用（含停止按钮/弹窗/加目录，且 pause/stop 走既有路由）；但「暂停中新消息补充并执行」依赖新后端，需**外部重启**一次才生效（未重启时暂停中发消息只会入队不执行）。

## 引导第二步「选择目录」改为选已有目录（2026-08-01）
- 问题：空白主区引导 `gettingStartedEl` stage2 的「选择目录」直接开目录浏览器逼用户去浏览/创建，但用户往往早已加过很多目录。
- 改：stage2 改用 `gsRootChooserEl()`——列出已有根目录的下拉（选中即 `applyRootSelection`）＋「＋ 添加新目录」按钮（`guidePickRoot` 走浏览新增）。stage1/3 保持单按钮。
- CSS 新增 `.getting-started .gs-root-chooser`。版本号 styles/app bump `?v=20260802f`。纯前端，静态刷新即生效。

## 移除会话顶部 CC/CD 引擎徽章（2026-08-01）
- 需求：会话顶部主区标题旁那个 CC/CD（引擎短标签）徽章不需要，直接去掉。
- 改（纯前端 `app.js` `refreshEngineControl`）：徽章 `#engineBadge` 恒 `display:none`；草稿会话仍显示 `#engineSelect` 下拉可选引擎，非草稿（已开始）两者都不显示。`engineShortLabel`(CC/CD) 保留仅供会话列表项 `.eng-badge` 用。
- 版本号 app.js bump `?v=20260802i`。[launch]：push→devokai 服务器(43.153.20.26, conn5) `git pull`(先备份/恢复运行中的 data/queue_state.json 让 merge 通过)→`pm2 restart claude-hub`(claudeuser)，8970 已服务新版本，已验证。

## 默认新用户不预置 quick 快捷标签分组（2026-08-02）
- 需求：默认新用户不要有那个默认的 [quick]/[quick2]/[quick3] 快捷标签组。
- 改：`SettingsStruct.defaultQuickGroups()` 从返回 `[{name:'quick',tags:[quick,quick2,quick3]}]` 改为返回 `[]`。get() 里当 settings.json 无 quickGroups 字段时用它做出厂值 → 新用户标签行为空、不显示（前端 `quickGroups()` 空数组即不渲染，无自注入默认）。已有用户已保存的 quickGroups 不受影响，仍可在系统设置里自行添加分组。
- 后端 tsc 通过。改动在 Struct 出厂常量，无实现细节。

## 会话内文件下载卡片：裸文件名回退到子目录查找（2026-08-02）
- 背景：AI 回复里提到的、根目录内真实存在的文件本就会在该条消息下方渲染「附件卡片」（图标+名+大小+预览+⬇下载，`app.js attachFilesToMessage`→`/api/session/files-resolve`→`SessionFilesStruct.resolve`）。此功能早已存在且优雅。
- 问题：`resolve()` 原本只按**字面相对路径**在根目录内匹配（safeResolve）。AI 常只写裸文件名（如 `报表.xlsx`）而文件实际在子目录（`out/报表.xlsx`）→ 匹配失败 → 不出卡片 → 用户以为"不能下载"。
- 修复：`resolve` 加**惰性 basename 回退**——字面路径未命中时才 `_buildBaseIndex(base)`（`FsHelper.listFilesRecursive` 已按 mtime 倒序，建 basename小写→最近修改文件 的 Map），用裸名兜底命中根目录树内任意子目录里的同名文件。字面命中仍优先，索引仅在需要时构建一次（性能友好）。
- 仅后端 Struct 改动，tsc 通过。需外部 `pm2 restart claude-hub` 生效（本会话是子进程不能自重启）。前端无改动，卡片/预览/下载既有逻辑不变。

## 加目录引导：先选模板再执行 + 进度条 + 日常办公模板（2026-08-03）
- 问题：原流程「选/建目录 → ensure/create-project → loadRoots → 检测 need → 才弹模板」，低配机上用户要干等才能选模板，很卡。
- 改（`rootwizard.js` 重构）：
  - 选目录/填完项目名后**立刻** `maybePickTemplate(dirPath)`——按**路径**（而非 rootId）问后端是否缺 CLAUDE/AGENTS，缺则弹模板窗；`pickTemplate()` 改为返回 `Promise<{kind,id}|null>`（卡片/不选/✕ 都 resolve），不再自己 apply。
  - 选完才 `runRootFlow(choice, makeRoot)`：进度条弹窗下依次 准备目录(20%) → setTabRootId+loadRoots(55%) → apply 模板(80%) → 完成(100%)。移除 `onRootReady/checkTemplateNeed/applyTemplateChoice`。
- 后端：`TemplateManagerStruct.needsTemplateAtPath(dirPath)`（hasFileCI 对不存在目录返回 false→needed=true，新建项目天然需要模板）；`GET /api/template/need` 支持 `?path=`（有 path 走路径版，否则原 rootId 版）。
- 新内置模板 `daily-office`（**排在清单最前**）：办公工作区约定（输入/输出/草稿 目录、`YYYYMMDD_主题_版本` 命名、不覆盖原件、数字可追溯、对外内容只出草稿、敏感信息脱敏），含 CLAUDE.md + AGENTS.md。
- 新增 `#rwProgressOverlay`（rwpTitle/rwpBar/rwpStep）+ CSS `.rw-prog-*`（含 shimmer 动画）+ i18n `rwWorking/rwStepDir/rwStepList/rwStepTpl/rwStepDone`。版本号 styles/trans/rootwizard bump `?v=20260803a`。
- ✅ tsc 通过、node --check 通过。后端改动（need?path= 与新模板）需 `pm2 restart claude-hub` 生效。

## 游戏模板双端化 + TS 模板统一 trans.json/trans.ts 多语言规范（2026-08-03）
- **游戏模板（web-game-2d / web-game-3d 的 CLAUDE+AGENTS 共 4 份）新增「双端支持」硬性章节**：同一份代码跑手机+电脑，不做两套项目/两套逻辑。
  - 输入抽象为语义动作（move/fire/look…），逻辑层只认动作不认设备；电脑=键盘(WASD/方向/空格，可重映射)+鼠标(瞄准/左右键/滚轮)，3D 第一人称用 Pointer Lock 且给退出提示；手机=触屏(虚拟摇杆/拖拽/点按/长按/双指缩放；3D 为左摇杆移动+右拖转视角，陀螺仪可选可关)，触点≥44px，避开 `env(safe-area-inset-*)`。
  - 统一 Pointer Events 采集；`pointerType` 只决定 UI 呈现、**不得分叉游戏逻辑**；能力探测用 `matchMedia('(pointer: coarse)')`，**禁 UA 判断机型**；`viewport-fit=cover`、画布 `touch-action:none`、禁双击缩放/长按菜单、处理横竖屏与 resize（3D 同时重算相机宽高比）；按 DPR 渲染（3D 上限≤2 + 画质档位）。交付前两端实测。
  - 技术栈行改为「全部 TypeScript，禁止 JS 写业务」+ Vite + `strict` / `resolveJsonModule`。
- **统一多语言规范**（写进 web-tool / web-game-2d / web-game-3d 的 CLAUDE.md 与 AGENTS.md，共 6 份）：
  - 核心：**一个 key 一条记录、所有语言同条**，改文案只动一处，禁止 zh.json/en.json 两份互相对照。
  - `src/i18n/trans.json` 唯一数据源：`"hud.score": { "zh": "得分：{n}", "en": "Score: {n}" }`；key 全小写 `模块.用途` 点分、按字母序、禁中文 key；每条必含 zh+en，缺一即 bug；加语言只加字段永不新增文件；变量用 `{name}` 占位符，禁字符串拼接。
  - `src/i18n/trans.ts` 唯一出口（模板里给了完整参考实现）：`Lang`、`TransKey`（由 JSON 推导→key 写错编译期报错）、`t(key,params?)`、`getLang()`、`setLang()`（存 localStorage + 派发 `langchange`）。
  - 禁令：裸中英文字面量、`if (lang==='en')` 分支、绕过 trans.ts 直接读 json；切语言必须即时重渲染。默认 zh 可配置。
- 同步把上述规范（更详细版，重写 X1.5 章节）写入 **`D:\templates\example1`** 的 CLAUDE.md 与 AGENTS.md（两文件保持逐字一致，用 cp 同步）。该目录不在本仓库内，未纳入 git。
- TemplatesConfig 两个游戏模板 desc 改为「手机触屏/电脑键鼠双端 + 双语」。tsc 通过。模板文本改动**不需重启**（apply 时实时读盘），仅 desc 变化需重启后端才在列表显示。

## 游戏模板双端化 + 全局严格 trans.json/trans.ts 双语规范（2026-08-03）
- **游戏模板（web-game-2d / web-game-3d，CLAUDE+AGENTS 各两份）** 新增「双端支持（强制）」章节：同一份代码跑手机+电脑，输入抽象成语义动作（逻辑层不认设备）；电脑=键盘(WASD/方向/空格可重映射)+鼠标(瞄准/左右键/滚轮)，手机=触屏(虚拟摇杆/拖拽/点按/长按/双指缩放，3D 为左摇杆+右拖视角、陀螺仪可选可关)；统一 Pointer Events，`pointerType` **只决定 UI 呈现不分叉玩法逻辑**；能力用 `matchMedia('(pointer: coarse)')` 探测，**禁止 UA 判断**；移动端 `viewport-fit=cover` / `touch-action:none` / 禁双击缩放长按菜单 / 横竖屏 resize；DPR 渲染（3D 上限 ≤2 + 画质档位）；交付前两端实测。技术栈强调**全部 TS**（strict + resolveJsonModule）+ Vite。
- **统一双语规范**（写进 web-tool / web-game-2d / web-game-3d 的 CLAUDE+AGENTS，以及 `D:\templates\example1` 的 CLAUDE.md/AGENTS.md）：核心是**一个 key 一条记录、所有语言同条**，改文案只动一处，禁止 zh.json/en.json 两份对照。
  - `src/i18n/trans.json` 唯一数据源：`"hud.score": { "zh": "得分：{n}", "en": "Score: {n}" }`；key 全小写 `模块.用途` 点分、按字母序；每条必须同时含 zh/en（缺一即 bug）；加语言只加字段永不新增文件；变量用 `{name}` 占位符禁止拼接。
  - `src/i18n/trans.ts` 唯一出口（薄封装，模板里给了完整参考实现）：`Lang` / `TransKey`（由 JSON 推导，key 写错编译期报错）/ `t(key, params?)` / `getLang()` / `setLang()`（存 localStorage + 派发 `langchange`）。
  - 禁令：禁止裸中英文字面量、禁止 `if (lang === 'en')`、禁止绕过 trans.ts 直接读 json；切语言即时重渲染不许刷新页面；默认 zh 可配置。
- `TemplatesConfig` 两个游戏模板 desc 改为强调「手机触屏/电脑键鼠双端 + 双语」。
- 侧边栏版本号 `#appVersion` 右靠齐：按钮组加 `flex:1;justify-content:flex-end;flex-wrap:wrap`，版本号 `margin-left:auto`——窄侧栏时不再被挤出可视区，而是右对齐换行。
- ✅ tsc 通过。模板文本改动即时生效（无需重启，applyTemplate 每次现读文件）；前端刷新即用。

## 全 TS 模板补充「pm2 启动 + 端口自检 + 先 build 再启动」（2026-08-03）
- 需求：所有 TS 模板都要写明用 pm2 启动服务；端口先检测是否被占用；每次启动默认走 build 产物，避免开发中途影响上一个正在使用的版本。
- 落地到 6 份文件：`web-tool` / `web-game-2d` / `web-game-3d` 的 CLAUDE.md（新增「启动与部署」完整章节）与 AGENTS.md（压缩成一条硬性约定）。python-tool / daily-office 非 TS 服务型，未加。
- 规范内容：
  - **pm2 唯一启动方式**，根目录 `ecosystem.config.js`（固定 app 名 + cwd/script/env）+ `pm2 save`；禁止 `npm run dev` 当正式服务。
  - **端口先探测再用**：`net.createServer()` 捕 `EADDRINUSE`；Windows `netstat -ano | findstr :<port>`、Linux/macOS `lsof -i:<port>`。占用时二选一：顺延到下一个可用端口 / 报错退出并打印占用者；**禁止杀别人进程**；实际端口打印日志 + 写 `.runtime-port`（方便前端与手机联调取）。
  - **默认走构建产物**：`npm run build` → `dist/`，pm2 跑 dist 不跑源码；构建**先进临时目录、成功后原子替换 `dist/`**，失败保留旧产物继续服务 → 半成品不影响上一版本（3D 模板额外强调大资源不能出现半份模型/贴图）。
  - 约定 `npm run start` = 端口自检 → build → `pm2 restart <app> --update-env`（不存在则 `pm2 start ecosystem.config.js`）；完成后主动告知需重启的服务与命令；游戏模板要求给出局域网 IP + 实际端口供手机联调。
- 同步写入 `D:\templates\example1`（不在本仓库）：X2 章节由原「编译与重启原则」重写为「服务启动、端口与构建原则」，保留 phone 端 esbuild 与告知命令两条，新增 pm2/端口自检/原子替换 dist/交付路径必须 build+pm2（dev server 仅本地调试且不与之抢端口）。CLAUDE.md 与 AGENTS.md 用 cp 保持逐字一致（各 103 行）。

## 全模板加入「pm2 启动 + 端口自检 + 先 build 再启动」规范（2026-08-03）
- 需求：所有模板都要写明用 pm2 启动服务；端口先检测是否被占用；每次启动默认走 build 产物，避免开发中的半成品影响上一个正在使用的版本。
- 落地到 8 份模板文档（web-tool / web-game-2d / web-game-3d / python-tool 的 CLAUDE.md + AGENTS.md），CLAUDE.md 给完整章节、AGENTS.md 给压缩单条：
  - **pm2**：根目录 `ecosystem.config.js`（固定 app 名、cwd/script/env）+ `pm2 save`；禁止 `npm run dev`（python 是禁止裸 `python xxx.py`）当正式服务。
  - **端口自检**：Node 用 `net.createServer().listen(port)` 捕 `EADDRINUSE`，Python 用 `socket.bind` 捕 `OSError`；命令行 Windows `netstat -ano | findstr :<port>` / Linux `lsof -i:<port>`。被占用时**顺延到下一个可用端口**或**报错退出并打印占用者**，二选一且告知用户；**明令禁止杀掉别人的进程**；实际端口写日志 + `.runtime-port` 文件。
  - **先 build 再启动**：`npm run build` → `dist/`，pm2 跑产物不跑源码；构建**先进临时目录、成功后原子替换 `dist/`**，失败保留旧产物继续服务（3D 特别强调防加载半份模型/贴图）；约定 `npm run start` = 端口自检 → build → `pm2 restart <app> --update-env`。python 版对应「先过 mypy/ruff/pytest 再切版本」。
  - 游戏模板另加：手机联调要给出局域网 IP + 实际端口。
- `D:\templates\example1` 的 CLAUDE.md / AGENTS.md 已同步同一套规范（X2 章节重写为「服务启动、端口与构建原则」，两文件逐字一致）。
- 纯文档改动，无代码变更；模板文本 apply 时实时读盘，**不需要重启后端**。

## TS 模板补 UI 规范 + 禁止全局「当前 xxx」状态（2026-08-03）
- 加到 web-tool / web-game-2d / web-game-3d 的 CLAUDE.md（完整章节）与 AGENTS.md（压缩条），以及 `D:\templates\example1`（新增 X3.5 / X3.6 两节，两文件 cp 同步）。python-tool 不加（用户限定「仅限 ts 的」）。
- **UI 规范**：① 任何弹窗禁止点遮罩/旁边自动关闭，必须点 ✕ 或明确按钮（Esc 可选但有未保存内容需二次确认）；② 弹窗过长时关闭/提交按钮**总是可见**——卡片 `max-height:85vh`、仅内容区 `overflow-y:auto`、标题栏与底部操作栏 sticky；③ **明暗双主题右上角切换 + 配色集中管理**：字体色最多 6 种、背景色最多 6 种（均含按钮），全部 CSS 变量（`--text-1..6`/`--bg-1..6`），**只允许定义在 `theme-light.css` 与 `theme-dark.css` 两个文件**（同名变量两套值，切 `data-theme`），**其他任何地方（组件 css/内联 style/ts）禁止再定义字体色与背景色**，只能 `var(--*)`；主题持久化、切换即时生效。游戏模板另注明 Canvas/3D 场景内取色也要从 CSS 变量读（`getComputedStyle`），不得另立色板。
- **状态隔离**：禁止「当前项目/当前会话/当前存档」这类全局单例；上下文由浏览器窗口自带（URL query/hash + `sessionStorage`，**不用**跨窗口共享的 localStorage）；验收标准＝**两个浏览器窗口同时打开可独立互不干扰地工作**；后端按请求参数取上下文，不得在服务端记「当前项目」。
- 纯文档改动，apply 时实时读盘，无需重启后端。

## ⭐ 服务商彻底隔离（分槽存储）+ 思考强度 effort 可选（2026-08-12）⭐ 需重启后端
- **两个需求**：① 要能选 effort（至少原版）；② **"我用原版的，结果还给我出小米或者 minimax 的大模型"——必须充分隔离**。
- **隔离 bug 的真凶（已用实测证据锁定）**：`data/engines.json` 旧结构是**扁平的**，一个引擎只有一份
  `{provider, apiKey, model, models, detected}`，**所有服务商共用这一份字段**。换服务商时只清了 `model`
  （见旧 `setProvider` 那行三元表达式），`apiKey` 与 `models` 候选缓存**原样留着** → 选回原版，下拉里还是
  MiniMax/小米那批模型。用户本机 engines.json 实测就是这个现场：`provider:"official"` 却带着
  `apiKey:"sk-ch5usl…"`（第三方 Key）。
- **根治：按服务商分槽（slots）**，而不是继续打补丁清字段。
  - Types 新增 `ProviderSlot`（apiKey/model/effort/baseUrl/modelsUrl/models/detected）、
    `EngineFileEntry{provider, slots}`、`EnginesFile`、`EffortLevel`。
  - 落盘变成 `{claude:{provider, slots:{official:{…}, minimax:{…}}}, codex:{…}}`。
  - `EngineConfigStruct.get()` 做**投影**：只把「当前选中服务商」那一槽摊平成原来的
    `EngineProviderConfig` 形状 → **所有下游（ClaudeRunner/CodexRunner/ModelManager/前端）一行都不用改
    就自动隔离**。official 投影时 `apiKey` 恒为 ''（第三方 Key 绝不可能漏到原版）。
  - 所有写入走 `_patchSlot()` 这**唯一通道**（setModel/setEffort/setCache），只动当前服务商的槽。
  - `setProvider` 只写目标服务商的槽，其余槽保留 → **切回去还能恢复自己上次的 Key/模型/强度**
    （这是"分槽"比"一律清空"更好的地方）。仅当 Key/BaseURL 变了才作废该槽的候选缓存。
  - **旧数据迁移** `_normalizeEntry`/`_normalizeSlot`：扁平结构归到"它当时选中的那个服务商"槽；
    且 official 槽额外过滤 `source:'api'` 的候选（那只可能来自第三方 `/v1/models`）——
    这是最后一道闸，无论旧脏数据还是别处写歪，读出来就干净。**自测正是在这里抓到一个真 bug**
    （首版只清了 apiKey，MiniMax 的 model 与 models 还留在 official 槽里，3 条断言红了才补上）。
  - 新增 `slots(engine)` + 路由 `GET /api/engine/slots?engine=` 供前端换服务商时回显该服务商自己的设置。
- **effort（思考强度）**：CLI 能力已实测确认——`claude --effort <low|medium|high|xhigh|max>`；
  **codex 没有 --effort**，走 `-c model_reasoning_effort=<level>`，且只认 low/medium/high。
  - `EFFORT_LEVELS`（Struct 常量，含 `codex` 映射字段）：xhigh/max 在 codex 侧**降级到 high**；
    `codexEffort()` 负责这个映射。`isEffort()` 校验，''=自动=不传参数。
  - `ClaudeRunner._buildArgs` 加 `--effort`；`CodexRunner._buildArgs` 加 `-c model_reasoning_effort=`。
  - `claudeEnv()`：用户显式选的 effort 会**覆盖服务商 extraEnv 里写死的值**（kimi 原本硬写 `max`），
    命令行与环境变量两处保持一致。
  - 路由 `POST /api/model/effort {engine, effort}`；`/api/model/state` 的 `EngineModelState`
    新增 `effort` + `efforts[]`（档位由后端下发，前端不写死；前端仅留 `EFFORT_FALLBACK` 供后端未重启时降级）。
- **前端**：index.html 两个引擎各加「思考强度」下拉（`claudeEffortSelect`/`codexEffortSelect`）+ 说明；
  `providerUi` 加 `effort`；新增 `renderEffortSelect`/`onEffortSelect`；`renderAccSummary` 摘要在非自动时
  追加强度；保存时带上 effort。
  - **`onEngineProviderChange` 改为 async 并彻底重写**：先把表单（Key/BaseURL/模型/强度）全清干净，
    再拉 `/api/engine/slots` 回显该服务商自己那一槽，没配过才 `autoPickModel`。
    这是隔离的前端一半——原来只清 `u.model`，Key 输入框里还留着上一个服务商的值。
- **自测（新增两个，直调 dist，不跑真引擎）**：
  - `backend/test/provider_isolation.js` —— **32 条断言全绿**：旧脏数据迁移、MiniMax↔原版来回切换互不污染、
    切回去能恢复自己的设置、原版下 `claudeEnv()` 为空、effort 覆盖 kimi 的 max、非法值被拒、
    codex 降级映射、slots 回显、落盘确为分槽结构。
  - `backend/test/effort_args.js` —— 8 条全绿：`--model/--effort` 真的进了参数、自动时不传、
    codex `-m` 与 `-c model_reasoning_effort=`、max 降级写成 high。
  - ⚠ 两个自测会改写真实 `data/engines.json` 与 `~/.claude/settings.json`（`Paths` 是固定常量、
    无法用环境变量重定向），**已在脚本里备份 + `process.on('exit')` 无条件还原**，跑完实测确认
    用户原配置完好、无残留 `*-test-backup`。日后改这两个脚本务必保留这层保护。
  - 另实跑一次真 CLI 确认 `--effort max --model opus` 被接受（init 帧回报 `model: claude-opus-5`）。
- ✅ `tsc --noEmit` 干净、`build.js` 通过、`node --check` 通过。版本号 `?v=20260812a`。
- ⚠ **后端改动（分槽存储 + effort + 两个新路由）需外部重启 claude-hub 才生效**（本会话是它的子进程，
  不能自重启）。未重启前：前端 effort 下拉会因 `/api/model/effort` 404 而报保存失败，
  `/api/engine/slots` 404 会降级成"当作没配过"，不致崩。**重启后旧的扁平 engines.json 会在首次读取时
  自动迁移成分槽结构**（用户那份残留的第三方 Key 会被自动清掉）。

## 允许原版 Claude 选择模型（2026-08-11）
- 需求：使用原版claude（official）时，用户希望能选择具体的模型（如 opus, sonnet, haiku, fable），而不是自动隐藏模型选择框。
- 前端改动（`app.js`）：
  - `syncProviderVisibility`：移除 `u.modelBox.hidden = provider === 'official'` 逻辑，模型选择框始终显示
  - `autoPickModel`：在 official 模式下，如果没有选定模型，自动从后端获取内置候选列表并填充下拉框，默认选中 opus
  - `loadEngineProvider`：在 official 模式下如果没有选定模型，自动调用 `autoPickModel` 加载候选列表
  - `fetchEngineModels`：在 official 模式下，调用 `/api/model/available` 获取内置候选列表（而非直接返回）
- 后端已支持：`ModelManager._availableClaude()` 在 official 模式下返回 `CLAUDE_BUILTIN_MODELS`（opus/sonnet/haiku/fable 及其全名）
- `ClaudeRunner._buildArgs()` 已支持：如果 `EngineConfig.get().claude.model` 不为空，会添加 `--model` 参数
- 版本号：`?v=20260811a`。纯前端静态文件，刷新即用，无需重启 pm2。

## UI 规范 / 状态隔离 / 命令超时 三条规范写入全部 TS 模板（2026-08-03）
- **UI 规范（强制）**：① 任何弹窗**禁止点遮罩/旁边自动关闭**，必须点 `✕` 或明确按钮（Esc 可选且有未保存内容要二次确认）；② 弹窗再长，**关闭/提交按钮不滚动就可见可点**——卡片 `max-height:85vh`、只内容区 `overflow-y:auto`、标题栏与底部操作栏 sticky；③ **明/暗双主题 + 右上角切换**，**字体色最多 6 种、背景色最多 6 种（含按钮）**，只允许在 `theme-light.css` / `theme-dark.css` 两个文件里以 `--text-1..6` / `--bg-1..6` 定义，切 `<html data-theme>`；**其他任何地方（组件 css、内联 style、ts）禁止写死字体色/背景色**，只能 `var(--x)`；游戏模板补充：Canvas/3D 场景内取色也要 `getComputedStyle` 读 CSS 变量，不得另立色板。
- **状态隔离（强制）**：禁止「当前项目/当前会话/当前存档」这类全局单例状态；上下文由**浏览器窗口自带**（URL query/hash + `sessionStorage`，不用跨窗口共享的 `localStorage`）；验收标准=**两个窗口同时打开可独立互不干扰工作**；后端按请求参数取上下文，不得在服务端记「当前 xxx」。
- **命令执行与长任务（效率）**：不涉及下载的命令**超时一律 ≤ 10 秒**（很多命令 0.1 秒就返回），只有确实超时才逐步调大；长任务用**分阶段执行 + 每阶段短超时（≤10 秒）**轮询，避免静默卡死。
- 落点：web-tool / web-game-2d / web-game-3d 的 CLAUDE.md（成章节）与 AGENTS.md（压缩条目），以及 `D:\templates\example1` 的 CLAUDE.md + AGENTS.md（新增 X3.5 UI 规范 / X3.6 状态隔离 / X3.7 命令执行，两文件逐字一致）。python-tool 与 daily-office 不涉及（仅限 ts 的）。
- 纯文档改动，模板 apply 时实时读盘，**不需要重启后端**。

## 模板弹窗：选目录工作时也询问 + 「不使用模板」记住不再问（2026-08-03）⭐ 后端需重启
- **Bug**：新建/选择目录后没弹模板选择。根因＝上次加的 `GET /api/template/need?path=` **后端未重启**，老代码忽略 `path` 走 `needsTemplate('')` 抛错 → 前端 catch 里 `return null` 静默跳过。
- **修复 + 增强**（`rootwizard.js`）：
  - `maybePickTemplate(dirPath)` 返回四态：`{kind,id}` / `'skip'`（用户明确不用模板）/ `null`（无需问）/ **`'unknown'`（按路径检测失败）**。`runRootFlow` 收到 `'unknown'` 时，在**进度条收起后**按 rootId 再补问一次 → 即使后端没重启也不会再漏弹。
  - 新增 `offerTemplateForRoot(rootId)`：`GET need?rootId=` → 需要则 `pickTemplate()` → 选了就 apply、跳过就 `POST /api/template/skip`。用 `TemplateAsk.busy` 防并发重复弹、`TemplateAsk.asked` 防同一会话重复问。
  - `app.js applyRootSelection(id)` 末尾调用 `offerTemplateForRoot(id)` → **任何时候选用某工作目录（下拉切换/引导选目录），缺 CLAUDE.md 与 AGENTS.md 就至少弹一次**。
- **后端**：`Root` 加 `templateSkipped?: boolean`；`RootManagerStruct.markTemplateSkipped(id)`；`TemplateManagerStruct.needsTemplate` 里 `templateSkipped` 为真直接 `needed:false`；`skipTemplate(rootId)` + 路由 `POST /api/template/skip`。规则：**两个文件都没有才问；有任一个就不问；用户选过「不使用模板」永久不再问**。
- 版本号 app.js/rootwizard.js bump `?v=20260803b`。tsc + node --check 通过。⚠ 前端刷新即用（含 unknown 兜底补问）；但**「不使用模板」的持久化记忆依赖新路由，需外部 `pm2 restart claude-hub`**，未重启时跳过只在当前页面会话内生效。

## 国产模型首推改为 MiniMax（标记支持图片识别）（2026-08-03）
- 需求：国产服务商首推从小米 MiMo 改为 MiniMax，并标出 MiniMax 支持图片识别。
- 后端 `logic_struct/EngineConfigStruct.ts`：`ProviderMeta` 新增 `vision?`/`recommended?` 两个可选元字段；`PROVIDERS` **键顺序即前端展示顺序**，把 minimax 挪到第一位（vision:true, recommended:true, note 改为「代码能力强且支持图片识别，国产模型首推」），xiaomi note 去掉「新手推荐」改成「想先免费试用可选它」。`providerList()` 直接展开 PROVIDERS，故无需再改。
- 前端 `onboard.js`：推荐角标由硬编码 `p.id === 'xiaomi'` 改为读 `p.recommended`；新增 `p.vision` → `obVision` 角标。以后新增服务商只改后端 PROVIDERS 即可。
- `trans.js` 新增 `obVision`（支持图片识别 / Image input supported）；`obStepProviderSub` 文案改为首推 MiniMax。
- `index.html` 设置页「Claude 服务商」下拉是硬编码的，原来漏了 xiaomi：现为 minimax（推荐，支持图片识别）/ 小米 MiMo（有免费额度）/ Kimi。
- 已过 tsc --noEmit。前端为静态文件，如线上缓存需要 bump `?v=`。
- 追加（同日）：**推荐只给 MiniMax 一家**。去掉小米 MiMo 的推荐性文案（note 改为「小米自研模型，国内直连」、设置页下拉去掉「有免费额度」），`onboard.js` 第 4 步的 `freeOrPaid` 不再按 xiaomi 走 `obKeyStepFree`，统一用 `obKeyStepPaid`（`obKeyStepFree` 保留未用）。

## 会话批量选择：新增「批量操作」下拉（2026-08-03）
- 需求：多选工具条上要有一个操作按钮，点开展开：删除 / 标记为已完成 / 标记为待测试。
- `index.html` batchBar 里把原 `batchDeleteBtn` 收进 `.batch-actions > #batchActBtn（批量操作 ▾）+ #batchMenu` 下拉，菜单项：✅ 标记为已完成 / 🧪 标记为待测试 / 🔥 标记为活跃 / 🗑 删除所选（danger）。
- `app.js`：`refreshBatchBar` 改为控制 `batchActBtn`（禁用态 + 显示已选数，n=0 自动收起菜单）；新增 `toggleBatchMenu/closeBatchMenu` 与 `markSelectedSessions(status)`（逐个 `POST /api/session/status` 后退出批量模式并刷新）；document 点击空白处收起菜单；取消按钮也收菜单。
- `trans.js` 新增 `batchActions`（Actions / 批量操作）；标记文案复用已有 markActive/markTesting/markCompleted。
- `styles.css` 新增 `.batch-actions/.batch-menu/.batch-mi`（绝对定位右对齐下拉）。
- 纯前端改动，asset 版本号统一 bump 到 `?v=20260803c`，刷新即用，无需重启后端。

## 收藏夹「添加新目录」按钮与左侧「＋」体验统一（2026-08-04）
- 需求：收藏夹新建会话时右侧「＋ 添加新目录」按钮，效果应与左侧「＋」（`addRoot`）一致——都走「已有目录/新建项目」二选一引导 + 缺模板即弹选（带进度条），不管新建还是选已有目录，最后都自动新建会话并默认收藏。
- 问题：原 `pickNewFavoriteRoot` 只是直接 `openPicker` 打开目录选择器 → `root/ensure(create:true)` → 绑定，跳过了「新建项目」选项，也完全没有模板选择步骤，体验和左侧「＋」不一致。
- 改（纯前端）：
  - `rootwizard.js`：`openAddRootGuide`/`chooseExistingRoot`/`openNewProjectForm`/`createNewProject`/`runRootFlow` 统一加一个可选末尾参数 `onRootReady(rootId)`——整套引导（含模板选择、进度条）跑完后才回调；左侧「＋」调用 `openAddRootGuide()` 不传，行为不变（沿用 runRootFlow 内部 `setTabRootId` 选中目录）。
  - `app.js` `pickNewFavoriteRoot()` 改为 `openAddRootGuide((rootId) => bindFavoriteDraftRoot(rootId))`——完整走一遍与左侧「＋」相同的引导+模板流程，结束后再绑定当前收藏草稿会话（`bindFavoriteDraftRoot` 内部本就是创建会话+置为收藏）。
  - `bindFavoriteDraftRoot` 绑定成功后追加 `offerTemplateForRoot(rootId)`（不 await，同 `applyRootSelection` 的既有模式）——收藏夹里从「已添加过的目录」下拉直接选用时，也补上模板检测，避免这条路径被漏问；`TemplateAsk.asked` 保证走「＋添加新目录」全流程时不会重复问。
- 版本号 app.js/rootwizard.js bump 到 `?v=20260804a`。node --check 通过。纯前端改动，无需重启后端，刷新即用。
- 追加（同日）：MiniMax 官方 Claude Code 接入文档 = `https://platform.minimaxi.com/docs/token-plan/claude-code`（国内站）/ `https://platform.minimax.io/docs/token-plan/claude-code`（国际站）。要点：**国内 base 是 `api.minimaxi.com/anthropic`（多一个 i），国际才是 `api.minimax.io/anthropic`**；官方现推荐 `ANTHROPIC_MODEL=MiniMax-M3`（M2.x 只有 text+tools，**图片识别要 M3**）；还建议设 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000`；接入前需清掉已有 ANTHROPIC_* 环境变量，进 claude 后用 `/status` `/model` 验证。我们代码目前只写死国际站 base，且未注入 AUTO_COMPACT_WINDOW —— 待定改造项。docsUrl 已改指该文档页，note 不再写死 M2。

## 去掉兜底模型 + 自动生成 ~/.claude/settings.json（2026-08-04）
- 需求：不要任何内置兜底模型（Key 错就报错），并把「自动生成的 settings.json」做对。
- **无兜底**：`ProviderMeta.fallbackModels` 整个字段删除（三家服务商都删）。`listModels()` 去掉 try/catch，`_fetchModels` 的 HTTP 错误直接往上抛；返回空列表也抛「请确认这个 API Key 属于该服务商且已开通模型权限」。前端引导第 4 步 / 设置页「拉取模型」会把这条错误原文显示出来。
- **必须选模型**：`setProvider` 新增校验——engine=claude 且第三方时 model 不能为空（否则 claude 会按 sonnet/opus/haiku **别名**请求，第三方端点 404）。前端 `saveClaudeProvider` 同步加了先拉取再保存的提示。
- **托管环境变量**（`MANAGED_ENV_KEYS`，唯一来源）：BASE_URL / AUTH_TOKEN / MODEL / DEFAULT_SONNET_MODEL / DEFAULT_OPUS_MODEL / DEFAULT_HAIKU_MODEL / CLAUDE_CODE_AUTO_COMPACT_WINDOW。三个 DEFAULT_*_MODEL 全部指向用户选定模型（照 MiniMax 官方 Claude Code 文档做法）；`PROVIDERS.minimax.extraEnv` = `{CLAUDE_CODE_AUTO_COMPACT_WINDOW:'1000000'}`（官方要求对齐 1M 上下文）。
- **applyEnv 现在做两件事**：`EnvHelper.applyManaged(process.env, ...)`（spawn 的 claude 子进程继承，见 ProcessSpawner `env: process.env`）+ `_syncClaudeSettings(env)` 写 `~/.claude/settings.json`（`CLAUDE_CONFIG_DIR` 优先，`ClaudeStoreHelper.configDir()/settingsFile()` 新增）。
- `helper/EnvHelper.ts` 新增（业务无关）：先删 managedKeys 再写入 values，且 values 的键必须在 managedKeys 内（防止漏登记新键导致切回原版清不掉）。
- `_syncClaudeSettings` 语义（已用临时脚本 4 个用例实测通过）：① 原版订阅 + 文件不存在 → 不造文件；② 只增删托管键，`permissions` 等其他字段和用户自己的 env 键原样保留；③ 切回 official → 托管键清除、用户键保留；④ 文件非法 JSON/非对象 → 另存 `settings.json.broken` 后重建。
- 遗留：`PROVIDERS.minimax` 只配了国际站 `api.minimax.io/anthropic`；国内站账号（platform.minimaxi.com）的 Key 需用 `api.minimaxi.com/anthropic`，暂未做站点切换。

## 自定义服务商 + Codex 本地代理转发（承接上条，2026-08-04，本次提交时发现是之前会话遗留的未提交改动）
- `EngineProvider` 新增 `'custom'`：Claude 填 Anthropic 兼容 Base URL，Codex 填 OpenAI Chat Completions Base URL（`baseUrl`/`modelsUrl` 落到 `EngineProviderConfig`）；`PROVIDERS` 三家各加 `chatBase`（Codex 用，走本地 KimiProxy 转发到该 Base）。
- `EngineConfigStruct.codexUpstream()`：Codex 第三方服务商时把 apiKey/model/baseUrl 交给 `KimiProxy`（本地 `127.0.0.1:${KIMI_PROXY_PORT}` 起一个 OpenAI 兼容代理，`config.toml` 里 Codex 只认本地地址，实际请求由代理转发到真正的第三方 chatBase）。`_syncCodexConfig` 用 `CodexTomlHelper.renderProvider` 写 `~/.codex/config.toml`。
- `MANAGED_ENV_KEYS` 补了 `ANTHROPIC_DEFAULT_FABLE_MODEL`/`CLAUDE_CODE_SUBAGENT_MODEL`/`CLAUDE_CODE_EFFORT_LEVEL`；Kimi 的 `extraEnv` 加 `CLAUDE_CODE_AUTO_COMPACT_WINDOW:'1048576'` + `CLAUDE_CODE_EFFORT_LEVEL:'max'`。
- MiniMax base 改回国内站 `api.minimaxi.com`（上条遗留项已处理）。
- tsc 通过；这部分是这次会话开始时发现的历史未提交改动（编译干净、逻辑自洽），随本次改动一并提交。

## 模型跟随服务商联动 + 设置页「AI 引擎」收进独立子面板（2026-08-04）
- **需求背景**：用户反馈「从 MiniMax 切回原版 Claude 后，实际还在用 MiniMax 的模型」，并且设置页里「模型选择」「Claude Code服务商」「Codex服务商」三个区块互相独立、没有联动，模型不跟着服务商变化。
- **根因**：`ClaudeRunner`/`CodexRunner` 不分服务商，一律把 `EngineConfig.get().claude.model`（非空则）当 `--model`/`-m` 传给 CLI（`Types.ts` 里本来就写明"official 时也生效"，为了让原版订阅也能强制选 opus/sonnet 别名）。但 `EngineConfigStruct.setProvider` 切换到 `official` 时不会强制清空 `model`——如果前端提交了残留的第三方模型 id（典型场景：设置页里"Claude Code服务商"区把 provider 下拉切到官方后，模型下拉被隐藏但 DOM 值没清，点保存时把旧模型字符串原样带上），`official` 也会被打上第三方模型 id，CLI 实际执行时仍然用着 MiniMax 的模型名。
- **后端修复**（`EngineConfigStruct.setProvider`）：`provider === 'official' && provider !== prev.provider` 时强制 `model = ''`，不管请求体里传了什么；同服务商内调整模型、或切到另一个第三方（校验已强制要求带上新模型）不受影响。用隔离的 `CLAUDE_CONFIG_DIR`（临时目录）+ 备份/还原 `data/engines.json` 的临时脚本验证：minimax→official 二连调用后 `model` 确认清空。
- **前端修复**（`app.js`）：`onEngineProviderChange`（真实由用户手动改下拉触发的 change 事件）现在会清空 `${p}ModelSelect` 的选项与选中值；新增 `syncProviderVisibility`（只管显示/隐藏 apiKey/custom 区，不清模型）供"读取已保存配置后同步一次界面"的场景（`loadEngineProvider`）单独调用，避免刚从后端读回来的当前模型被自己的联动逻辑误清空。
- **UI 重组（把两个原本各自为政的模型/服务商区块合并 + 移进独立子面板）**：
  - 原设置弹窗里平铺的「模型选择」（`mdlClaudeSelect`/`mdlCodexSelect`，走 `/api/model/*`）与「Claude Code服务商」/「Codex服务商」（`claudeModelSelect`/`codexModelSelect`，走 `/api/engine/config`）两套下拉合并成一个：统一复用 `claudeModelSelect`/`codexModelSelect` 这一个 DOM 元素，`renderModelSection`（读 `/api/model/state`，含 verified 标记与已检测模型）与 `fetchEngineModels`（表单态、未保存 apiKey 也能拉，走 `/api/engine/models`）都往同一个下拉写。
  - 主设置列表里原三个区块（模型选择 / Claude Code服务商 / Codex服务商）删掉，替换成一行入口按钮「管理 Claude Code / Codex 服务商与模型 →`；点击打开新的 `#engineSubOverlay`（独立叠加层，`.sx-overlay-sub` z-index 65，不是塞进主设置的长列表），里面 Claude Code / Codex 各一个可折叠 `.eng-acc` 块（点标题栏 `▸`/`▾` 切换，`toggleAcc`/`setAccOpen`），折叠时标题栏右侧一行摘要 `renderAccSummary`（`服务商 · 模型`，如 `MiniMax · MiniMax-M3` / `原版 · 自动`）方便一眼看当前状态。默认打开 Claude、收起 Codex。引擎数据只在打开子面板时才拉取（`openEngineSub`），不再随主设置弹窗一起加载。
- **验证**：① 独立 ts-node 脚本（临时 `CLAUDE_CONFIG_DIR` + 备份还原 `data/engines.json`）确认 `setProvider` 的清空逻辑生效；② Playwright 对着本机真实跑着的服务实测（临时把 `data/auth.json` 的 hash 换成已知测试密码、测完还原，全程未点「获取模型」「保存」按钮，因此没有写 `~/.claude/settings.json` 或 `data/engines.json`）：子面板打开、Claude 默认展开/Codex 默认收起、切换服务商清空模型下拉与摘要联动更新、切回原版后模型下拉值/候选皆为空、手风琴双向折叠、关闭按钮、控制台零报错，并用截图确认布局正常。
- 未做：没有加"删除 `.claude/settings.json`"按钮——已有的 `_syncClaudeSettings`（见上条）切回官方时只清管理的那几个 key、保留用户自己的其余配置（permissions 等），这比整份删除更安全，符合用户"换回原版后不残留第三方配置"的真实诉求。
- tsc 通过、node --check 通过。纯前端 UI 改动刷新即用；`EngineConfigStruct.setProvider` 的模型清空是后端逻辑，需要 `pm2 restart claude-hub` 才生效（本次改完已重启验证）。

## 发送按钮左侧「快捷命令」菜单：真跑 /usage /compact 并展示输出（2026-08-04）⭐ 需重启后端
- 需求：发送按钮左边加个小符号（`/`），点开菜单选 `/usage`、`/compact` 等命令——**必须真有效、真看到反馈**，并给每个命令**专门的用途解释**。（区别于早已有的"输入框打 / 透传"斜杠菜单：那个只填输入框等用户回车；这个点一下直接执行并弹窗展示结果。）
- **核心验证（实测 `claude -p` stream-json）**：`/usage` 的输出在 `result` 事件的 `result` 文本里（用量/额度）；`/compact` 的输出在 assistant `text` 块里（result 为空，如"Not enough messages to compact."或压缩摘要）。故聚合时**优先级：result 文本 > assistant text > stderr**，两者都收才不漏。
- **后端（Struct/Realize，需外部重启才生效）**：
  - `config/CommandsConfig.ts`：命令白名单 `{id,slash,needsSession}`。`usage`(needsSession:false)、`compact`(needsSession:true)。只在这里登记，绝不放行任意斜杠串。
  - `logic_struct/CommandRunnerStruct.ts`（调度）：`run(sessionId,id)` = 白名单校验 → `_resolveContext` → `_exec` → 临时命令 `_cleanup`。
  - `logic_realize/CommandRunner.ts`（实现）：
    - `_resolveContext`：仅 claude 引擎；`needsSession` 命令必须有真实 jsonl(可 --resume)否则报"需要已开始的会话"；否则(如 /usage)剥掉 claudeSessionId 走**临时一次性执行**。
    - `_exec`：复用 `ClaudeRunner.execute`（参数/解析全一致），回调只收集不广播（onEvent 取 result/text/stderr），`onSessionId` 记真实 uuid；`COMMAND_TIMEOUT_MS`(默认 60s)安全超时杀进程。
    - `_cleanup`：`/usage` 这类独立命令 claude 会**新建一个 jsonl**→用回读到的真实 session_id `ClaudeStoreHelper.removeSessionFile` 删掉，**避免会话列表被垃圾会话污染**。
  - `AppConfig.COMMAND_TIMEOUT_MS` 新增；`Server` 加路由 `GET /api/command/list`、`POST /api/command/run {id:<sessionId>, cmd:<命令id>}`(用 `_wrapAsync`)。
- **前端（静态，刷新即生效）**：composer `.controls` 里 spacer 与发送按钮之间加 `.cmd-wrap`(`#cmdMenuBtn` 显示 `/` + `#cmdMenu` 向上弹的菜单)。`app.js` `CMD_ITEMS=[usage,compact]`、`toggleCmdMenu/renderCmdMenu/runCommand/openCmdResult`；点命令→`/api/command/run`→结果弹窗 `#cmdOverlay`(执行中→输出/错误)。`/compact` 完后 `selectSession` 刷新会话。i18n `trans.js` 加 `cmdMenuBtn/cmdRunning/cmdNoOutput/cmdFailed/cmd_usage_name|desc/cmd_compact_name|desc`(zh/en，含用途解释)。`styles.css` 加 `.cmd-wrap/.cmd-btn/.cmd-menu/.cmd-item*/.cmd-card/.cmd-desc/.cmd-output`。版本号 styles/trans/app bump `?v=20260804a`。
- ✅ 后端 `tsc --noEmit` 通过；用临时 ts-node 脚本**直连 CommandRunner 实测**：/usage 返回真实用量+清理临时 jsonl、/compact 真实会话返回"Not enough messages to compact."、/compact 草稿报友好错、未知命令被白名单拒。
- ⚠ **本会话是 claude-hub 子进程（claude.exe←node.exe PID6824=8970 端口，由 start.bat 拉起），不能自重启**。前端刷新即见按钮/菜单/弹窗；但两个新后端路由需**外部重启**一次才生效——用 `D:\projects\claudecode\tmp\restart_hub.ps1`（分离进程：延时→杀 8970 及其 start.bat 窗口→等端口释放→重新 start.bat）。未重启前点命令会 404。

## 开源化整理：.gitignore 重写 + 开发文档移出仓库（2026-08-05）
- 需求：只看当前版本（不看历史、不含 claude_relay），把不适合开源的东西挡在 git 外。
- **重写根 `.gitignore`**：① `data/` 下全部密钥与状态（auth/engines/codex/settings/session_meta/queue_state/traces/sessions/logs/roots）；② 测试与调试产物 `.provider-e2e-temp/`、`*-debug.json`、`test-results/`、`playwright-report/`；③ 证书私钥 `*.pem/key/crt/pfx`、`.git-credentials`、`*.local.js`；④ 本机产物 `tmp/`、`pm2-list.txt`、`restart-output.txt`、`*-output.txt`、`nohup.out`、截图/录屏；⑤ 办公文档 `*.docx/xlsx/pptx`；⑥ **开发过程文档**：`CLAUDE.md`/`AGENTS.md`/`struct.md`/`mem.md`/`data.md`/`OPENSOURCE_CHECKLIST.md`（同名匹配，`backend/src/config/templates/*.CLAUDE.md` 内置模板不受影响）。
- **取消跟踪（`git rm --cached`，文件都还在本地磁盘）**：上述 6 份文档 + `pm2-list.txt`（空文件）+ `restart-output.txt`（pm2 乱码输出）+ `tmp/`（本机截图 + 硬编码 D:\ 路径的 restart_hub.ps1）。
- `restart.sh` 注释里的真实中继域名 `connector.xfeixie.com` 去掉，改为「自己部署的 relay」。
- 复查结论：tracked 的非 relay 文件里**已无**内网/公网 IP、真实域名、口令、API Key、个人账号名（e2e 走 `E2E_PASSWORD`，`ecosystem.config.js` 纯变量，`data/` 已全挡）。
- ⚠️ **副作用**：`mem.md` 等文档不再随 git 同步/备份到云端，只存在本地磁盘；若要保留云端备份，需另起一个私有仓库或把 mem.md 重新 `git add -f`。撤销方式：`git revert d31711e`。
- 提交 d31711e 已 push。纯文档/配置改动，无需重启后端。

## 侧栏「已执行」改叫「刚完成」+ 新增运行状态筛选行（2026-08-05）
- 需求：把标签「已执行」改成「刚完成」；在原筛选（活跃/待测试/已完成/所有）**下方**再加一行三个筛选：执行中 / 刚完成 / 所有。
- 设计：新行是**独立维度**（运行状态），与上方状态筛选**叠加生效**，默认「所有」。用 `.r-tab` / `data-runtab` 与原 `.s-tab` / `data-tab` 区分，避免共用 click 绑定。
- `index.html`：sessionTabs 之后加 `<div class="session-tabs run-tabs" id="sessionRunTabs">`，三个按钮 runTabRunningBtn / runTabJustFinishedBtn / runTabAllBtn（默认 all 高亮）。
- `styles.css`：`.session-tabs.run-tabs { margin-top:4px }`，`.s-tab` / `.s-tab.active` 选择器扩为 `.s-tab, .r-tab`（复用同一套样式，颜色仍走 CSS 变量）。
- `app.js`：`State.runTab='all'`；`switchRunTab()`；`renderSessions` 里在状态过滤后追加 `running → State.running.has(id)`、`justFinished → !running && State.justFinished.has(id)`；空列表文案优先用 runTab 的（noRunningSessions / noJustFinishedSessions）；`applyText` 补三个按钮文案；`.r-tab` click 绑定挨着 `.s-tab` 那行。
- `trans.js`：`justFinishedTag` zh 改「刚完成」(en 'just finished')；新增 runTabRunning / runTabJustFinished / runTabAll / noRunningSessions / noJustFinishedSessions。
- 语义提醒：「刚完成」沿用既有 `State.justFinished` 集合——**用户点开该会话后就会被清除**，所以这个筛选=「已结束但还没看过」的未读列表，不是历史完成列表。
- ⚠ 教训：用 PowerShell `Get-Content -Raw | Out-File` 改 index.html 的版本号把 UTF-8 中文全变成乱码（PS 5.1 读时按 ANSI 解码），已 `git checkout --` 还原后改用 Edit 工具。**以后改含中文的文件一律用 Edit，不要走 PowerShell 文本替换。**
- 纯前端改动，asset 版本号 bump 到 `?v=20260805e`，刷新即用，无需重启后端。node --check 通过。

## 运行状态筛选改为「所有在前 + 执行中/刚完成 可多选」（2026-08-05）
- 需求：这行筛选把「所有」放最前面；「执行中」和「刚完成」可**同时勾选**（勾中的显示 ✓），二者与「所有」**互斥**。
- 数据结构从单值改集合：`State.runTab` → **`State.runFilters = new Set()`**，空集即「所有」。`toggleRunFilter(key)`：`all` → `clear()`；其余 → 有则删无则加。
- `syncRunTabs()` 统一刷新三个按钮（class active + `✓ ` 前缀 + i18n 文案），`applyText()` 里原来三行 textContent 赋值改为调用它，切语言/切换状态共用同一处渲染。新增 `RUN_TAB_LABELS` 映射 key→i18n key。
- 过滤取**并集**：抽出 `matchRunFilters(s)`（running 命中 `State.running`；justFinished 命中 `!running && State.justFinished`），`renderSessions` 里 `if (State.runFilters.size) sessions = sessions.filter(matchRunFilters)`。
- 空列表文案：`runFilterEmptyKey()`——单勾给专属文案，两个都勾给新增的 `noRunOrFinishedSessions`（暂无执行中或刚完成的会话）。
- `index.html` 按钮顺序改为 all（默认 active）→ running → justFinished。
- 纯前端，asset 版本号 bump `?v=20260805f`（styles 未再改，仍 e），刷新即用，无需重启后端。node --check 通过。

## 安装体系重做：install.bat/sh + 统一 setup.js + 运行编译产物 dist（2026-08-05）
- 需求：把安装做强——start.bat（及 mac/linux 对应）要确保「所有必要的东西都会有」；并明确「运行期理论上不需要 TS，用的是编译产物 dist」。
- **结论先说**：现在**运行期只需要 `express` + `ws`**。TypeScript / ts-node 只在**构建时**用；pm2、start 脚本跑的都是 `backend/dist/index.js`。
- **唯一实现 `backend/scripts/setup.js`（纯 JS）**：Windows/macOS/Linux 共用一份安装与体检逻辑。之所以是 .js 不是 .ts——它要在「TypeScript 还没装」的时刻运行，只能用 Node 内置模块。检查项：
  ① Node ≥ 18；② npm（直接定位 node 旁边的 npm-cli.js，不依赖 shell/PATH）；③ 后端依赖（`npm install --include=dev`，官方源失败自动换 `registry.npmmirror.com` 重试）；④ 编译产物 dist（过期自动重编译）；⑤ data 目录可写；⑥ 前端文件齐全；⑦ claude/codex（有则报告，`--full` 缺 claude 会装内置版，`--with-tools` 强制装/更新两个）；⑧ git（缺只警告）。
  - 模式：默认 auto（start 用，缺什么补什么，全新鲜就秒退）/ `--full`（install 用）/ `--check`（只体检）/ `--with-tools` / `--no-tools`（优先级最高）/ `--quiet`。
  - **退出码约定：0=就绪(dist)，2=降级(编译失败但 ts-node 在，用源码跑)，1=不可启动**。start 脚本据此选运行方式；restart 脚本把 2 也当失败（避免 pm2 拿旧 dist 起服务）。
  - **依赖新鲜度用「依赖声明指纹」而不是文件 mtime**：`node_modules/.claude-hub-deps.json` 存 `{dependencies, devDependencies, node大版本}` 的 JSON，装完写入。否则改个 scripts 字段就会触发重装、甚至每次启动都白跑一次 npm install。
- **`backend/scripts/build.js`**：`tsc -p tsconfig.json` + **把 src 下的非 TS 资源（.md/.json/.html/.txt）复制到 dist**。⚠ 关键坑：`TemplatesConfig.DIR = __dirname/templates`，tsc 不会搬 `src/config/templates/*.md`，不复制就会「编译后模板全丢」。以后新增这类资源不用改配置，按后缀自动复制。
  - 另一处已验证：`paths.ts`（src 根）与 `LogConfig.ts`（src/config）的相对深度在 dist 下**完全一致**，DATA_ROOT/FRONTEND_DIR/日志路径编译后仍指向 `claude_hub/data`、`claude_hub/frontend`，无需改动。
- **脚本分层（消除重复实现）**：`scripts/node-env.bat|sh`（只干一件事：找到可用 Node —— out_end 内置 → 系统 Node **且版本 ≥18** → 自动 bootstrap 下载）→ 根目录 `install.bat|sh`（完整安装，话多）与 `start.bat|sh`（自检 + 端口检查 + 跑 dist）。`projects/claude_hub/start.bat|sh` **改为纯转发**到根目录同名脚本，不再各写一份。
- **bootstrap.bat/sh 增强**：新增 `-y`（非交互，不 pause）与 `--node-only`（只下 Node 不装引擎，start 自动兜底时用），下载与 npm 安装**官方源失败自动换国内镜像重试**。
- **pm2 路线同步**：`ecosystem.config.js` 改跑 `dist/index.js`（不再 ts-node）；`restart.sh`/`restart.bat` 的「tsc --noEmit 类型检查」换成跑 `setup.js`（装依赖 + 真编译，等价且更严），失败即中止重启。
- 实测：`install.bat --check` / `bash install.sh --check` / `install.sh --full`（真装了内置 claude+codex 到 out_end/tools，942MB，gitignored）/ `start.bat`（端口占用报错路径）全部通过；并把 dist 复制到临时沙箱（独立 data 目录 + 临时 `CLAUDE_CONFIG_DIR` + 端口 8975）**真启动过一次**：HTTP 200、返回 39KB 页面、模板 10 个文件齐全 → 编译产物可用。
- 文档：README.md / README_zh.md 快速开始加「安装」一列与安装器保证的 5 件事；CLAUDE.md 的「启动/重启」章节改为「安装/启动/重启」并写明 dist 运行与脚本分层。

## 文案再定稿：「刚完成」→「刚执行」（2026-08-05）
- 原因：用户指出「刚完成」和状态筛选里的「已完成」容易混淆，改为**「刚执行」**（强调刚跑过，与"已完成"这个人工标记状态区分开）。
- 只改文案，不动逻辑与 key（内部仍叫 `justFinished` / `State.justFinished`）：`trans.js` 的 `justFinishedTag`（刚执行 / just ran）、`runTabJustFinished`（刚执行 / Just ran）、`noJustFinishedSessions`（暂无刚执行的会话）、`noRunOrFinishedSessions`（暂无执行中或刚执行的会话）。
- 同步把 app.js / index.html / styles.css 里提到「已执行」「刚完成」的注释统一成「刚执行」，避免注释与 UI 文案对不上。
- 三个语义澄清（写下来防以后又改回去）：**执行中**=正在跑；**刚执行**=刚跑完且用户还没点开看过（点开即消失，是未读提醒）；**已完成**=用户手动标记的会话状态。
- asset 版本号 bump `?v=20260805g`（三个文件都动了，styles 也一起）。纯前端，刷新即用，无需重启后端。node --check 通过。

## 文案终定：中文用「刚执行完」（2026-08-05）
- 承接上条，中文再调一次：标签与筛选按钮的中文统一为**「刚执行完」**（英文保持 `just ran` / `Just ran`）；空列表文案「暂无刚执行完的会话」「暂无执行中或刚执行完的会话」。
- 只动 `trans.js` 四个 value + index.html 一行注释；逻辑、DOM id、内部 key（`justFinished`）全不变。
- trans.js 版本号 bump `?v=20260805h`（app.js/styles.css 未改，仍 g）。纯前端，刷新即用。

## 不再内置引擎 + npm 源「实测竞速」选择 + 安装进度可见（2026-08-05）⭐ 需重启后端
- 背景：实测内置引擎体积——claude-code **532MB**（`bin/claude.exe` 266MB + `node_modules/@anthropic-ai/claude-code-win32-x64` 266MB，同一个二进制存了两份）、codex **409MB**（npm 的 optionalDependencies 已经只装当前平台，这是真实单平台体积），合计 ~950MB。结论：**不内置**，改按需下载。核心理由：这软件离线本来就没用（claude 要联网调 API），所以「首次要联网」几乎不增加成本；且多数人本机已装 claude（系统 PATH 命中＝0 下载）；内置版还会很快过期。
- **默认不下载引擎**：`setup.js` 的引擎步骤只做检测+报告；`--with-claude` / `--with-codex` / `--with-tools` 才装，`--no-tools` 优先级最高。`install.bat --full` 不再自动装 claude。bootstrap 也翻转成**默认只下 Node（~30MB）**，`--with-tools` 才装引擎（`--node-only` 保留为兼容写法）。
- **npm 源选择＝「实测竞速」，不是猜地区**（`helper/RegistryPicker.ts` + `scripts/registry.js` 两份实现，规则一致，改一处要同步另一处；两份的原因：安装脚本要在 TS 没装时就能跑）：
  ① 用户自己配过（`npm_config_registry` 环境变量 / `~/.npmrc` 或项目 `.npmrc` 的 `registry=`）→ 原样用，绝不覆盖；
  ② 否则**并发 HEAD 探测** `registry.npmjs.org` 与 `registry.npmmirror.com` 的 `/-/ping`（2 秒超时），取延迟低的；
  ③ 都探不通 → 回退官方源，让 npm 自己报错（它的信息更具体）。
  实测本机：官方 1493ms vs 镜像 523ms → 选镜像。比按时区猜准：挂代理的国内机器往往官方源更快。
  失败重试规则：**用户配过私服就不换源**（换了也装不上，反而掩盖真错误），否则自动换另一个公共源重试一次。
- **Node 下载源同理**：bootstrap.sh 用 `curl -sI --connect-timeout 2 -w '%{time_total}'` 各探一次，bootstrap.bat 用 PowerShell `WebRequest`+`Timeout=2000` 探，谁快先用谁，失败换另一个。取代了原来「先等官方源超时再换镜像」（最坏要白等 30-60 秒）。
- **安装进度可见（几百 MB 的静默等待＝被当成卡死）**：
  - `EngineUpdaterStruct.update(engine, onProgress?)` 调度：选源 → `_npmInstall(pkg, registry, onProgress)` → 清 Bin 缓存；`UpdateResult` 新增 `registry` 字段。`_pickRegistry` / `_npmInstall` 两个 Realize 实现点。
  - `EngineUpdater` 逐行切分 npm 的 stdout/stderr 回传（保留半行 pending 到下次），失败时按上面的规则换源重试。
  - `Server` 的 `/api/engine/update` 把 onProgress 转成 `EventBus.broadcast({kind:'engineInstall', engine, line})`。
  - 前端 `app.js` 新增全局 `EngineInstall`（watch/emit/stop）+ `startEngineInstallProgress(el, head)`（每秒刷新「已用时」+ 显示 npm 最新一行），WS 分支 `engineInstall` **必须放在按 sessionId 过滤之前**（它没有 sessionId）。引导页与设置页「更新引擎」都用它；失败时给出手动命令 `npm install -g @anthropic-ai/claude-code` 并把按钮变成「重试」。
  - `trans.js` 新增 obInstallRetry / obInstallManual / engInstElapsed / engInstWaiting，obInstallWarn 文案改为「约 400-500MB」；`styles.css` 加 `.ob-pre`；asset 版本 bump（styles h / trans i / onboard 20260805a / app h）。
- 验证：`--full` 编译通过；用编译产物直接跑 `RegistryPicker.pick()` 与 `EngineUpdater._npmInstall('is-odd', ...)`，确认选源、`--registry` 传参、逐行进度回调、返回摘要全部正常（测完已删掉 is-odd）。
- ⚠ 前端刷新即用；**`/api/engine/update` 的进度广播与换源重试是后端逻辑，需外部重启 claude-hub 才生效**（本会话是它的子进程，不能自重启）。

## 会话列表左侧竖条：只表示「当前会话」（2026-08-06）
- 需求：左边那条竖色条以前 active / pinned（金）/ favorite（强调色）三种情况都会出现，语义混乱。**现在只有点开的那个会话（.active）才有竖条，其余一律没有。**
- 改法（`styles.css` 一处）：基线 `.session-item { border-left: 3px solid transparent }` 占位防抖动；`.active` 只改 `border-left-color: var(--accent)`；**删掉** `.session-item.pinned` 与 `.session-item.favorite:not(.active):not(.pinned)` 两条 border-left 规则。
- 置顶/收藏的身份仍由列表里的 `pin-tag` / `favorite-tag` 徽章体现，不靠竖条。
- 纯前端，styles 版本号 bump `?v=20260806a`，刷新即用，无需重启后端。

## 安装体系补齐：git 按需安装（2026-08-06）
- 起因：`setup.js` 原来对 git 只「检测 + 警告」，从不安装，而会话里的「推送到云端」依赖它。
- **npm 上没有官方 git**：`dugite` 之类的包只是在 postinstall 去 GitHub 下同一份便携版，国内还常被墙。所以不绕 npm，直接下便携包并**优先走国内镜像**。
- 新增 `backend/scripts/git.js`（纯 JS，同样要在 TS 没装时可跑）：
  - Windows：默认 **MinGit**（下载 ~41MB，解压 **91MB**；含 `cmd/git.exe`、`usr/bin/ssh.exe`、`git-credential-wincred.exe`，够 add/commit/push；不含 Git Bash / GCM 浏览器登录）→ 解压到 `out_end/git`，**免管理员、不写注册表**。`--with-git-full` 改用 **PortableGit**（~59MB 自解压 exe，解压 ~350MB，完整版）。
  - 版本不写死：抓 `https://registry.npmmirror.com/-/binary/git-for-windows/` 的目录清单，正则挑最大的 `vX.Y.Z.windows.N`，探不通才回退常量 `v2.51.0.windows.1`。⚠ 资源名里的版本号规则：`.windows.1` → `2.51.0`，`.windows.3` → `2.55.0.3`。
  - 下载源**实测竞速**（同 registry.js 思路）：npmmirror 二进制镜像 vs GitHub Releases 各发一次 HEAD（2s 超时），快的先用，失败换另一个。实测 775ms vs 1214ms → 走镜像。
  - 解压：先 `tar -xf`（Win10 1803+ 自带 bsdtar，能解 zip 且快），失败回退 `Expand-Archive`；PortableGit 是 7z 自解压器，用 `-o<dir> -y` 静默解。
  - Linux/macOS 没有官方便携包 → 走系统包管理器（apt-get/dnf/yum/zypper/pacman/apk/brew），是 root（或 brew）就直接装，否则返回 `sudo <cmd>` 让用户自己跑。
- `setup.js`：`checkGit()` 改成 async，策略与引擎一致——**默认只报告不下载**，`--with-git` / `--with-git-full` 才装；缺失时的警告里直接给出开关和手动命令。`install.bat/sh` 只是转发参数，加注释即可。
- 运行期定位：新增 `helper/GitBin.ts`（`GIT_BIN` 环境变量 > 系统 PATH > `out_end/git/cmd/git.exe`，带缓存），`OutEnd` 加 `gitDir()/gitExe()`；`GitPusher` 从写死的 `'git'` 改为 `GitBin.find()`，缺 git 时返回可读提示而不是 execFileSync 的原始报错。
- 实测：临时目录跑通全流程（竞速 → 自动取到 v2.55.0.windows.3 → 下载 37MB → tar 解压 → `git --version` 正常），测完已删；`setup.js --check` 全绿。
- ⚠ 纯安装期 + GitPusher 改动，前端无关；GitPusher 走的是 dist，**已编译**，需重启后端才生效。

## 新增 test_uninstall.bat：一键清空环境，用来验证「光机安装」（2026-08-06）
- 用途：把 claude/codex、Node.js、git 与项目产物卸干净，验证 `install.bat` 在裸机上能否从零装好。
- 范围开关可叠加，都不给＝全做：`--claude` / `--git` / `--node` / `--local`；另有 `--check`（只体检不删，**先跑这个**）、`-y`（无人值守）、`--claude-config`（把 `%USERPROFILE%\.claude` **改名备份**，绝不删除——里面是登录态与会话）。
- 安全设计：默认交互式，先打印现状 + 计划，必须**手输 UNINSTALL** 才动手；`--check` 会自动置 YES 以免脚本化调用卡在 `pause`。
- 卸载方式：优先 `winget uninstall --id`（Git.Git / OpenJS.NodeJS[.LTS]），回退 ① Git 的 Inno 卸载器 `unins000.exe /VERYSILENT`，② 注册表 Uninstall 键里 `DisplayName -like 'Node.js*'` → `msiexec /x {GUID} /qn`（实测能取到 `Node.js {8E3EF5A2-...}`）。claude 走 `npm uninstall -g` + 原生安装路径 `%USERPROFILE%\.local\bin\claude.exe` + `out_end\tools`。
- ⚠ **踩坑：.bat 里不能写中文。** UTF-8 无 BOM + `chcp 65001` 会让 cmd.exe 按字节偏移续读时错位，整个脚本被拆成乱码命令（实测满屏 `'��' is not recognized`）。本文件因此**全 ASCII 英文**，并在头部注释里写明原因。
- ⚠ 另一个坑：`%ProgramFiles(x86)%` 里的右括号会破坏 `if (...)` 代码块的括号配对 → 在块外先 `set "PF86=%ProgramFiles(x86)%"` 再用。
- 收尾提示「当前窗口 PATH 还是旧的，要新开 cmd 再测安装」——不然卸完立刻跑 install.bat 会误判。

## 修复启动失败：上次会话留下的编译错误让服务起不来（2026-08-06）
- 现象：双击 `start.bat` 后窗口在跑、进程还活着，但 8970 **从来没监听**，浏览器打不开；`data/logs/app.log` 只有 `[Process] uncaughtException {}` 和 `[KimiProxy] server error EADDRINUSE 8972`。
- **误导点**：EADDRINUSE 8972 是**结果不是原因**。真实顺序是——`Server.start()` 在 index.ts 最后一行同步抛错 → 被 uncaughtException 捕获但只打了空对象 `{}`（Logger 序列化 Error 得到 `{}`，看不到 message）→ 进程因为 KimiProxy 的 server 还挂在事件循环上**没退出**，变成占着 8972 的僵尸；下一次启动就报 8972 被占。**排查这类问题要先把真错误抓出来**：`node -e "require('./dist/server/Server').Server.start()"` 直接打印堆栈。
- 真因：`TypeError: this._sanitizeToolPrefs is not a function`。`SettingsStruct.get()` 引用了 `_sanitizeToolPrefs`，但 Struct 里没声明这个钩子、Realize 里也没实现——上次加 `toolPrefs`/Toolchain 功能时漏掉的。
- `tsc --noEmit` 一跑就露馅，共两处编译错误：① `SettingsStruct.ts` 两次调用不存在的 `_sanitizeToolPrefs`；② `helper/OutEnd.ts` 里 `gitDir()`/`gitExe()` **各定义了两遍**（TS2393）。**tsc 默认 emit-on-error**，所以 dist 照样生成了，坏代码就这样跑起来了。
- 修法：① Struct 补 `_sanitizeToolPrefs(_raw, _legacyPreferBundled): ToolPrefMap` 钩子声明，Realize `Settings.ts` 实现（只认 node/git/claude/codex 四个 id 与 auto/system/bundled 三个值，其余回落到旧字段 `preferBundled` 的迁移值）；`ToolId` 用 `import type` 引入，编译期擦除，不会和 `Toolchain.ts → Settings` 形成运行时循环依赖。② 删掉 OutEnd 里后定义的那对 `gitDir`/`gitExe`（后者是 Windows-only 的窄版本，留下前面跨平台的那对）。
- 顺手补：`out_end/.gitignore` 漏了 `git/`，装完便携版 git 会有 91MB 想进库，已加。
- **待办（本次没动）**：`Server.session.filesResolve: Not implemented` 在日志里反复出现，是另一个没实现的钩子，功能是坏的。
- **建议**：`backend/scripts/build.js` 里给 tsc 加 `--noEmitOnError`（或 tsconfig 开 `noEmitOnError`），否则编译报错还会继续产出能跑坏的 dist。
- 本机状态：git 之前完全没装（PATH 里没有），已用 `node scripts/setup.js --with-git` 装到 `out_end/git`（v2.55.0.windows.3，走 npmmirror 335ms 胜出）。

## 运行环境面板：node/git/claude/codex 各自「本机 or 内置」（2026-08-06）⭐ 需重启后端
- 需求：独立板块提供内置 Node / Git / Claude Code（codex 不内置，只能安装），面板里能看到装了什么、还缺什么，能选用全局还是内置，缺的可点安装——目标是「拿来就能用」，且**本机有就优先用本机的**。
- 后端：`logic_struct/ToolchainStruct.ts`（TOOLS 清单 + status/one/setPref/install/preferBundled/applyPath 调度）+ `logic_realize/Toolchain.ts`（探测/偏好读写/安装/PATH 注入）。偏好三态 `auto`(本机优先，默认) / `system` / `bundled`，选中的那边缺失时自动回退另一边，`active` 反映真实使用的那份。
- 探测细节：`where`/`which` 结果**排除 out_end 目录**（start 脚本会把内置目录塞进 PATH，不能算本机已装）；Windows 上 `where claude` 会同时列出无后缀脚本/.cmd/.ps1，**优先取 .exe > .cmd**，且 `.cmd/.bat` 取版本号必须经 `cmd.exe /c` 才有输出。
- 安装：claude/codex → npm 全局(`-g`) 或内置(`--prefix out_end/tools`)；node → 复用 out_end/bootstrap 脚本；git → Windows 下载 MinGit zip 解压到 out_end/git（国内走 npmmirror 的 git-for-windows 镜像），mac/Linux 提示用包管理器。源都走 RegistryPicker。
- PATH：`Toolchain.applyPath()` 用纯工具 `helper/ToolEnv.compose()` 先剔除所有本工具注入过的 out_end 目录再把选中的放最前，`index.ts` 启动时调用一次，setPref/install 后再调——这样 spawn 出去的 claude/codex 才会命中内置 node/git。
- 设置持久化：`AppSettings.toolPrefs`（`Settings._sanitizeToolPrefs` 清洗；旧字段 `preferBundled=true` 迁移成 bundled）。ClaudeRunner/CodexRunner 改用 `Toolchain.preferBundled(engine)` 取代 `Settings.get().preferBundled`。
- 路由：`GET /api/toolchain/status`、`POST /api/toolchain/prefer {tool,pref}`、`POST /api/toolchain/install {tool,target}`（进度经 EventBus 广播 `kind:'toolInstall'`）。
- 前端：设置里原「运行时与更新」板块整体换成工具链卡片列表（每工具：用途/状态徽章/本机·内置两处版本+路径/来源下拉/安装按钮），`tcRefreshBtn` 重新检测；进度复用 `startEngineInstallProgress`，WS 分支加 `toolInstall`。删掉了 preferBundledChk 与两个「更新引擎」按钮（被工具链取代，`updateEngine()` 函数暂留未用）。styles 加 `.tc-*`；index.html 版本 bump 到 20260806b。
- 实测（编译产物直调）：node=本机 v24.19.0、claude=本机 2.1.223、codex=本机 0.145.0、git=内置 2.55.0（本会话 PATH 里没有系统 git）——本机优先的语义正确。
- ⚠ 后端逻辑改动需外部重启 claude-hub 才生效；前端刷新即用。

## 依赖来源一键模式「全部使用内置」（2026-08-06）⭐ 需重启后端
- 需求：设置的运行环境板块里能一键「全部使用内置」——Claude Code 及其依赖的 node、git 全走内置版，完全不理会本机；codex 不参与（不内置）。
- `ToolchainStruct`：新增 `SELF_CONTAINED=['node','git','claude']`、`preset(mode:'bundled'|'auto')`（批量写偏好 → 清 Bin 缓存 → 重注入 PATH → 返回新状态）、`isSelfContained()`。路由 `POST /api/toolchain/preset {mode}`。
- 前端 pane-runtime 顶部加「依赖来源（一键设置）」：`全部使用内置` / `自动（本机优先）` / `重新检测` 三个按钮 + 当前模式标签；若切到全内置但某项还没下载内置版，红字提示会临时回退本机并指引去点「下载内置版」。styles 加 `.tc-preset*`；版本 bump 20260806c。
- 实测（编译产物直调）：preset('bundled') → node/git/claude 的 pref 与 active 全变 bundled，PATH 头部依次插入 out_end\node、git\cmd、git\mingw64\bin、tools；preset('auto') 复原且 PATH 只留 git（本机无 git）。codex 始终不受影响。
- 本机已内置：node v22.14.0(92MB)、git 2.55.0(90MB)、claude 2.1.223(535MB)，均实测可直接执行；二进制在 .gitignore 内，只随文件夹分发，不进 git。

## 根目录密码重置入口 passwd.bat / passwd.sh（2026-08-07）
- 背景：密码救急 CLI（`backend/src/cli/authctl.ts` → `AuthManager.cliSetPassword` / `clear`）本来就有，但只能在 `backend/` 里用 `npm run passwd`，还依赖 ts-node，忘记密码的人根本找不到。
- 新增仓库根目录两个转发脚本，用法一致：`passwd.bat set <新密码>` / `clear` / `status`，Linux·macOS 是 `./passwd.sh`。
  - 复用 `scripts/node-env.bat|sh` 解析 Node（内置便携版 → 系统 18+ → 自动下载），不做 setup.js 全量自检（太慢，没必要）。
  - 优先跑 `backend/dist/cli/authctl.js`；dist 不在就降级 `node_modules/ts-node/dist/bin.js src/cli/authctl.ts`；两者都没有才报错让人先 install。
  - 无参数时打印用法并 pause（照顾双击运行的人），出错时也 pause。
- 踩过的坑照旧：**passwd.bat 全文只用 ASCII 英文**（mem 里 test_uninstall.bat 那条教训——bat 里的中文在 cmd 下必乱码）；中文提示交给 node 侧输出（authctl 自己 print，chcp 65001 下正常）。`.gitattributes` 已保证 .bat=CRLF、.sh=LF，不用手动处理。
- 顺手把 authctl.ts 的用法文案从 `ts-node src/cli/authctl.ts ...` 改成根目录的 `passwd.bat ...`（已重新 build 进 dist），README.md / README_zh.md 的启动说明里补了「忘记密码怎么办」。
- 验证：`.\passwd.bat status` → `已设定密码`；`.\passwd.bat badcmd` → 打印新用法、exit 1。set/clear 未在本机实跑（会改掉现有密码），走的是同一条已验证的代码路径。

## 静默失败可见化：发消息没反应也不报错 → 界面上必须看到原因（2026-08-07）⭐ 需重启后端
- 现象（部分机器）：用内置 git / node 时发消息，界面什么都不回、也不报错。根因不是一处，是**四条路径都会把错误吞掉**：
  1. **前端从来不显示 `task.error`**——后端其实已经把 stderr/exit code 塞进了 task.error，但 UI 只画一个状态点（"出错"两字），正文区一片空白。这是最主要的原因。
  2. `ClaudeBin.resolve()` 找不到 claude 时**抛异常**，而 `_startTask` 已经 `_markRunning`，异常抛到 HTTP 层 → 任务永远停在 running，界面一直转圈。
  3. 引擎**退出码 0 却零输出**（内置 node/引擎装坏、被杀软拦下的典型表现）被当成功。
  4. 进程活着但**一直不吭声**（等登录/被拦截/代理不通）→ 没有任何超时或提示，用户只能干等。
  另外 spawn 失败时写 stdin 会抛 EPIPE，没有监听器就是 uncaughtException，能把整个后端悄悄搞挂。
- 后端改动：
  - 新增 `helper/RunDiag.ts`（纯函数）：`format()` 拼「命令/参数/工作目录/退出码/耗时/stderr/建议」；`explain(err,bin)` 把 ENOENT/EACCES/EPERM/ENOEXEC/EFTYPE/UNKNOWN 翻译成人话。
  - `ProcessSpawner.run()` 加第 7 个参数 `startupSilenceMs` 与 `cb.onStartupSilence`：**启动后一直没有任何 stdout/stderr 就触发一次**（拿到输出/退出即解除，只看启动窗口，不会在长工具调用中误报）。同时给 stdin 挂空 error 监听防 EPIPE 崩溃。
  - `ClaudeRunnerStruct` / `CodexRunnerStruct`：跟踪 `sawOutput`；**退出码 0 + 零输出一律判失败**；所有失败信息都带 RunDiag 现场；新增 `RunCallbacks.onNotice(level,message)` 上报「启动 N 秒零输出」。阈值 `AppConfig.ENGINE_SILENCE_WARN_MS`(45s)，建议文案 `AppConfig.ENGINE_SILENT_HINT`。
  - `TaskQueueStruct._startTask`：**调整顺序**——可能抛异常的准备动作（`RootManager.getRoot`、`TraceStore.record`）全部挪到 `_markRunning` 之前（置为 running 之后再抛就会永远卡住）；启动改走新钩子 `_launchRunner()`（Realize 里 try/catch，把启动期异常转成失败原因），失败即 `_onTaskDone(false, 原因)`。`onNotice` 转成 `EventBus.broadcast({kind:'notice',...})`。
  - `Logger._safe`：`data instanceof Error` 时输出 `name: message + stack`——修掉之前那个害人的 `uncaughtException {}`（见 2026-08-06「修复启动失败」那条）。
  - `index.ts`：uncaughtException / unhandledRejection 除了写日志，还 `broadcast({kind:'serverError'})` 推到界面。
  - `Toolchain._version` → `_probe`：**探测失败不再吞成空字符串**，把原因写进 `ToolCopy.error`（"文件在、版本号空白"正是内置 node/git 被拦截或装坏的样子）。
- 前端改动（`app.js` / `styles.css` / `trans.js`，版本号全部 bump 到 `?v=20260807a`）：
  - `State.notices` + `renderNotices()`：正文区显示红色失败卡片，来源两处——① 任务 `status='error'` 的 `task.error`；② WS `kind:'notice'` 的运行提示（黄色告警）。卡片带「复制错误信息」按钮，插在"执行中"动画之前。任务最终 `done` 时撤掉它中途的告警（`dropTaskNotices`）。
  - WS：`serverError` 分支放在按 sessionId 过滤**之前**（它没有 sessionId），顶部红色横幅 `#globalError`；`notice` 分支紧随 `task` 之后。
  - 任务队列：内联 chip 的 title 带上失败原因；管理弹窗里失败任务下方直接摊开 `.qm-error`。
  - 运行环境面板：`tc-copy` 探测失败时标红并显示 `.tc-err` 原因。
- 验证（都是编译产物直调，不需要跑真引擎）：① spawn 不存在的 exe → `启动失败：找不到可执行文件…spawn … ENOENT`，且没有因 stdin EPIPE 崩溃；② `node -e setTimeout(2.5s)` + silenceMs=800 → 800ms 触发 SILENCE；③ `TaskQueue._launchRunner` 传一个会抛错的假 runner → 返回带工作目录与处置建议的 error，没有句柄泄漏；④ `Toolchain._probe` 对不存在的 exe / 非程序文件分别给出 ENOENT、EFTYPE 的中文解释；健康工具仍正常出版本号。
- ⚠ 前端刷新即用；**后端逻辑需外部重启 claude-hub 才生效**（本会话仍是它的子进程，不能自重启）。本机实测内置 git 可用：`git version 2.55.0.windows.3`，且当前 PATH 里的 `git` 就是 `out_end\git\cmd\git.exe`。

## start 脚本：端口被占用改为「自动跑 stop 释放后继续启动」（2026-08-07）
- 需求：`start.bat` 遇到 8970 被占，不要再报错让人手动去跑 stop.bat——**自动执行 stop.bat 的逻辑，再继续启动**。
- `stop.bat` 加 `--no-pause` 开关（`if /i "%~1"=="--no-pause" set NOPAUSE=1`，两处 `pause` 改成 `if not defined NOPAUSE pause`）。不加开关时行为完全不变，仍然会 pause 给双击运行的人看结果。
- `start.bat`：端口检查抽成子程序 `:checkport`（放在最后 `exit /b 1` 之后，只经 `call` 到达），流程改为 **占用 → 打 warn → `call "%ROOT%stop.bat" --no-pause` → 再 `call :checkport` → 仍占用才 `goto :portbusy`**。`:portbusy` 文案改成「跑过 stop.bat 后端口仍被占」+ 排查三步（关掉别的 start 窗口 / pm2 list / 管理员 taskkill）。
- ⚠ **不能把 `call :checkport` 和后面的 `if defined PORTPID` 写在同一个 `( )` 块里**——块内 `%PORTPID%` 在解析期就展开了，拿到的是调用前的旧值。这里全部用 goto 标签平铺，避开延迟展开。（`if defined` 本身是运行期判断，所以 for 块里的 `if not defined PORTPID set PORTPID=%%p` 是安全的。）
- `start.sh` 同步同样语义：`port_pid()` 函数 + `WASBUSY` 标记，占用则 `bash "$ROOT/stop.sh" || true` 再复查；stop.sh 本来就没有 pause，无需改。
- 验证：把 `:checkport` 抽到临时 bat 单测，8970（服务在跑）→ `BUSY PID=8452`，8971 → `FREE`，子程序里 `%PORT%` 展开正常。未真跑 start.bat 全流程（会踢掉正在跑的服务）。纯启动脚本改动，与后端 dist 无关，无需重启。

## 引擎不再内置：claude/codex 一律 npm 全局安装 + 引导页选引擎必须先装（2026-08-07）
- 需求：claude code / codex 都不内置，改用 `npm install -g <pkg> --registry=<更快的源>`；源的选法是向 npmjs 与 npmmirror 的 `/-/ping` 各发一次请求测耗时，谁快用谁（RegistryPicker 早已是这个实现，直接复用）。
- 后端：`ToolchainStruct.TOOLS` 里 claude 改 `bundlable:false`（codex 本来就是），`SELF_CONTAINED` 只剩 node/git；`applyPath` 里 out_end/tools 改成"存在就挂 PATH 末尾"（兼容老用户旧的内置引擎）。`Toolchain._installBundled` 删掉 claude/codex 分支，`_installBundledNpm` 整个删除。
- **关键坑**：`_detectSystem` 原本一律排除 out_end 目录。但用内置便携 Node 时 `npm install -g` 的落点就是 `out_end/node/`（实测 `npm root -g` = out_end\node\node_modules），排除了就会"装完还是显示未安装"。改为：bundlable 的（node/git）才排除 out_end，claude/codex 在整个 PATH 里找（`_whichIn(name, excludeOutEnd)`）。
- `EngineUpdater._spawnNpm` 去掉 `--prefix out_end/tools`，纯 `npm install -g pkg@latest --registry=...`；失败时 `_permHint` 识别 EACCES/EPERM 补一句人话（Windows 提管理员、Unix 提 sudo / npm config set prefix）。
- `setup.js`：`--with-claude/--with-codex/--with-tools` 改成全局安装，`bundledEngine` → `legacyBundledEngine`（只用于识别老版本那份）。
- 前端引导第 2 步重写（onboard.js）：每个引擎一张卡，**未安装的卡不能选**（`.locked`，点了提示"请先安装"），卡内一个实心大按钮「⤓ 立即安装」+ 下面 `npm install -g <pkg>` 小字 + 本卡自己的实时进度区（复用 startEngineInstallProgress）；装好后按钮变成「选择这个引擎」（选中后变绿并打勾）。`onboardNext` 加兜底：引擎没 ready 不放行。同一时刻只允许装一个引擎（`Onboard.installing`）。
- styles.css 新增 `.ob-engine/.ob-act/.ob-act-inst/.ob-act-pick/.ob-inst-msg`，`.ob-foot button.primary` 也加大——之前"安装/选择"两个动作都不显眼是这次的主要吐槽点。
- 设置页运行环境面板：`TC_SELF_CONTAINED` 去掉 claude，index.html 两处文案改为"Node/Git 有内置版；Claude Code/Codex 走 npm 全局安装"。资源版本号 bump 到 `?v=20260807b`（styles/trans/onboard/app）。
- 验证：tsc --noEmit 干净；`Toolchain.status()` 实测 claude bundlable=false / active=system / 2.1.223；用 is-odd 试跑了一遍与代码同形的 `npm install -g ... --registry=npmmirror`（exit 0，装到 out_end\node，随后卸载）；registry 竞速实测选中 npmmirror。服务已重启（start.bat 那个 cmd 父进程会自动拉起），首页 200。

## 新增系统文档 docs/SYSTEM_zh.md + docs/architecture.svg（2026-08-07）
- 需求：一份「不含任何代码、只讲结构/功能/思想」的系统文档，外加一张架构图。
- `docs/SYSTEM_zh.md`：十一节——这是什么 / 七条设计思想 / 整体分层 / 功能地图 / 一条消息的完整生命周期 / 数据放在哪 / 安全模型 / 远程访问 / 维护收益 / 自检清单 / 本质。全文零代码片段，Struct/Realize、jsonl 唯一数据源、静默失败可见化、源竞速、跨平台等思想都用自然语言表述。
- `docs/architecture.svg`：1600×1240 九层架构图（使用者 → relay → 前端 → 传输 → 接入 → 调度 logic_struct → 实现 logic_realize → helper/config/models → 外部世界），带事件回流虚线。纯手写 SVG，已用 XmlDocument 校验通过（139 个元素）。
- ⚠ 校验坑：PowerShell `Get-Content -Raw` 按 ANSI 读 UTF-8 文件会把中文读成乱码，进而误报 XML 不闭合；必须用 `StreamReader(..., UTF8)` 再 `LoadXml`。
- 纯文档改动，不涉及后端 dist，无需编译或重启。

## 失败提示卡片可关闭 + 发新消息自动清空（2026-08-10）
- 需求：正文区那张「✕ 任务执行失败」的红卡片要能手动关掉；并且**开始新一轮消息时，过去的错误应当清空**。
- 卡片来源有两处（见 2026-08-07「静默失败可见化」）：① `task.status='error'` 的 `task.error`（后端持久化，前端删不掉）；② WS `kind:'notice'` 存在 `State.notices` 的运行提示。所以关闭只能做成**前端级隐藏**：
  - `State.dismissedNotices: Set<key>` 记住被关掉的卡片 key，`noticeItems()` 末尾统一 filter 掉。
  - `State.notices` 每条补一个自增 `id`（模块级 `NOTICE_SEQ`），key 从 `notice:${下标}` 改成 `notice:${n.id}`——原来用数组下标当 key，一旦触发 60 条上限的 `splice` 裁剪，下标整体前移，隐藏状态会张冠李戴。
  - `dismissNotice(key)`：加进 dismissed；若是 notice 类还顺手从 `State.notices` 里删掉（内存也别留）。
  - `clearNotices()`：把当前可见的全部 key 加进 dismissed + 丢掉本会话的 notices + 隐藏顶部 `#globalError` 横幅，然后重渲染。
- 接入点：`addTask()`（单条发送）与 `submitTasks()`（批量弹窗）在调 `/api/task/add` 前调用 `clearNotices()`。`runCommand()`（斜杠工具命令）不接——它是独立弹窗，不算聊天消息。
- UI：`noticeEl()` 头部加第三个按钮 `.mn-close`（✕，title/aria-label 走新翻译键 `noticeClose`）；`.mn-head` 是 `space-between`，三个孩子会被均分撑开，所以给 `.mn-title` 加 `flex:1 1 auto` 把两个按钮挤到右侧，`.mn-close` 用 `margin-left:-6px` 抵掉一半 gap。
- 资源版本号 `styles.css / trans.js / app.js` 全部 bump 到 `?v=20260810a`。
- 纯前端改动，`node --check` 通过；不涉及 backend/dist，无需编译或重启，刷新页面即生效。

## 小白可用三件套：Claude 自动登录 / 网络体检 / 跨平台安装（2026-08-10）⭐ 需重启后端
- 目标：**没装过任何东西的人拿来也能用**。三件事一起做：① claude 没登录就在网页里把它登上；② 先查网络，连不上 Claude 时当场给出路；③ 安装逻辑按 win/mac/linux 分别处理。
- **① Claude 登录（`ClaudeLoginStruct` + `ClaudeLogin`）**
  - 关键发现（实测 claude 2.1.224/226）：`claude auth login` 在**非交互终端下照样能用**——它会打印 `If the browser didn't open, visit: <oauth url>`，然后停在 `Paste code here if prompted >` 等 stdin。于是整套 OAuth 可以纯网页完成：起进程 → 抠链接 → 前端做成大按钮 + 四步指引 → 用户在浏览器授权 → 把授权码粘回来 → 写进 stdin。**服务器在远端也成立**（链接在用户本地浏览器打开，授权码手动粘回）。
  - 登录态**不要去猜凭据文件**（Win/Linux 在 `~/.claude/.credentials.json`，macOS 在钥匙串）：`claude auth status --json` 直接给 `{loggedIn, authMethod, email, orgName, subscriptionType}`。
  - 不能用 ProcessSpawner：它写完 stdin 就 `end()`，这里要**先等链接、稍后再写授权码**，是长时间保持打开的交互式 stdin，故 Realize 自己 spawn 管句柄。
  - 输出必须按**原始片段**处理，不能按行——`Paste code here if prompted >` 不带换行，按行读永远等不到。
  - 走第三方服务商（MiniMax/Kimi/小米）时用 ANTHROPIC_AUTH_TOKEN，**根本不需要登录**：状态里用 `needsLogin` 区分「没登录」与「不需要登录」，否则会把配好国产模型的用户吓一跳。
  - 纯工具 `helper/AuthUrl.ts`：抠链接（去 ANSI、去行尾标点、必须像 oauth 页才认，避免把文档链接当登录链接）+ `awaitsCode()`。
- **② 网络体检（`ConnectivityStruct` + `Connectivity` + `helper/NetProbe.ts`）**
  - 判定原则：**只看有没有 HTTP 响应，不看状态码**。`api.anthropic.com` 裸访问必然 401/405，那正是「连得上」的证据（实测 405）；把 4xx 当失败会把「能用」误报成「不通」。
  - **必须跟随代理环境变量**：Node 的 http/https 默认不认 HTTPS_PROXY，直连探测会在「用户已开科学上网、claude 其实能用」时误报不通。https 目标走 CONNECT 隧道探，与 claude CLI 实际路径一致。
  - 七个探测点：npmmirror/npmjs（有没有网）、api.anthropic.com + claude.com（Claude 通不通）、minimax/kimi/xiaomi（国产哪几家可达）。结论三态 `ok` / `anthropicOnly`（有网但连不上 Claude）/ `noInternet`。
  - 连不上时**报告自带出路**：hint 直接写「开科学上网重测，或改用国产模型（当前实测可用：…）」，前端据此在同一界面给按钮——这是国内小白最需要的那条路。
- **③ 跨平台安装**：`TOOLS` 里 git 的 `bundlable/globalInstallable` 改成**按平台算**（Windows 有 MinGit 便携版 → bundlable；mac/Linux 没有官方便携包 → 走包管理器 → globalInstallable）。新增 `_installSystemGit`：macOS 优先 brew、否则 `xcode-select --install`；Linux 依次探 apt-get/dnf/yum/zypper/pacman/apk；**没有 root 时不静默失败**，而是把该敲的那条 `sudo …` 原样交给用户。`preset()` 改用 `selfContained()`（剔除本平台不可内置的），否则会写下一个永远回退的偏好。`_run` 失败补 `_permHint`（三平台解法不同）。内置 Node 走 bootstrap 脚本，它自己按 uname 判断 linux/darwin + x64/arm64。
- 路由：`GET /api/net/check`、`GET /api/net/quick`、`GET /api/claude/auth/status|session`、`POST /api/claude/auth/login|code|cancel`。这些**全部加进 `SETUP_OPEN_PATHS`**（引导在设密码之前跑，否则 401）。
- 前端：新增 `frontend/health.js`（引导页与设置页**共用**同一份体检卡片 + 登录卡片实现，避免两处跑偏）。引导从 4 步改 **5 步**：语言/主题 → **网络体检** → 引擎 → 服务商 → **登录 Claude（原版）/ 填 Key（第三方）**。体检结果缓存在 `Onboard.net`，来回切步骤不重测。登录卡片有「稍后再登录」退路，不把人堵死。WS 新分支 `claudeLogin` **必须放在按 sessionId 过滤之前**（它没有 sessionId）。设置页「运行环境」板块顶部加 `#hcBox` / `#clBox`。资源版本号 bump 到 `?v=20260810b`。
- 验证：tsc 干净；编译产物直调实测——体检 7/7 通、代理死掉时报「代理不可用」、DNS 不通报「域名解析失败」；`claude auth status --json` 解析正确；`auth login` 真跑到 `awaitCode` 并抠出链接，cancel 后登录态未受影响。HTTP 层用临时实例（8979）验证全部新路由。**Playwright 跑通了新的 5 步引导全流程**（用 8975 上的空 data 实例）——失败点在其后的「添加工作目录」，那是本次没动的既有用例陈旧（现在先弹 `#addRootGuideOverlay`），已顺手修掉。
- ⚠ 踩坑：测试期间本机 claude 的 npm 垫片被中断的自动更新清掉了（`AppData\Roaming\npm` 只剩 `.claude-*` 暂存文件、native 包也没了），表现为「claude.exe 在但命令找不到」。已用 `/api/toolchain/install {tool:'claude',target:'global'}` 走自家接口重装恢复（顺带升到 2.1.226），也算把这条安装路径实测了一遍。
- ⚠ 前端刷新即用；**后端逻辑需外部重启 claude-hub 才生效**（本会话是它的子进程，不能自重启）。

## 「刚执行完」筛选：点开的会话本轮不立即消失（2026-08-10）· 纯前端
- 问题：在「刚执行完」筛选下点一个会话，点开即清 `justFinished` 待读标识 → 该会话当场从列表里消失，点一个少一个，体验很差。
- 解法：`State.justFinishedSeen`（新增 Set）——本轮筛选内被点开过的 id。`selectSession` 清 `justFinished` 的同时，若当前正勾着「刚执行完」就记入 seen；`matchRunFilters` 对 justFinished 分支放行 `justFinished ∪ justFinishedSeen`；`toggleRunFilter`（点「所有」或任何筛选切换）清空 seen——即"状态照常更新，但要等用户切走筛选再回来才真正移出列表"。
- 只动 `frontend/app.js`，index.html 里 `app.js?v=` bump 到 20260810c；无需编译/重启后端，刷新即生效。

## 错误提示改为右下角悬浮小圆圈（2026-08-10）· 纯前端
- 需求：出错不要再在正文里整块展开一张大卡片，改成**会话右下角一个小圆圈**，点它才展开这些错误。
- HTML：`.content` 里给 `#messages` 外面包了一层 `.msg-wrap`（`flex:1; display:flex; min-width/min-height:0; position:relative`）。**必须包这一层**——圆圈要相对「会话区」定位，直接放 `#messages` 里会跟着消息一起滚，放 `.content` 里在过程面板打开时会跑到面板上去。`.msg-wrap` 在桌面（row）与移动端（column）两种 `.content` 布局下都正确。
- 结构：`#noticeDock`（absolute right/bottom，`flex-direction:column; align-items:flex-end`，bottom 锚定所以浮层自然往上长）→ 里面 `#noticePop`（浮层，在上）+ `#noticeFab`（圆圈，在下）+ 圆圈右上角 `#noticeCount` 角标（只有 ≥2 条才显数字）。
- `app.js`：`State.noticeOpen`；`renderNotices()` 重写为「无条目→整个 dock hidden 并强制收起；有条目→亮圆圈、算 warn/error 配色、只在展开时才往 pop 里塞卡片（头部带「全部关闭」）」。新增 `toggleNoticePop(open?)`、`pulseNoticeFab()`。卡片本体 `noticeEl()` 原样复用（复制/单条关闭都还在）。
- 交互：点圆圈开合；点浮层外、按 Esc 收起；新提示到达**只脉冲两下不自动展开**（自动展开等于又把正文挡住）；`clearNotices()` 与 `selectSession()` 都会收起（换会话别把上一个会话的展开态带过来）。任务 `status='error'` 时也 pulse。
- ⚠ 坑：`.notice-dock` / `.notice-pop` 设了 `display:flex`，会**盖掉 UA 的 `[hidden]{display:none}`**，必须补 `.notice-dock[hidden], .notice-pop[hidden] { display:none }`，否则 hidden 属性完全失效。
- ⚠ 配色用的变量要真实存在：`--card` / `--danger` 在本项目**没有定义**（旧代码靠 `var(--danger, #e5534b)` 的兜底值在跑）。浮层背景改用 `--panel2`、角标用 `--panel`、圆圈用 `--red`，这样 dark/light/ocean 各主题都跟着走。
- `.msg-notice` 从「跨整行大卡片」瘦身为浮层内条目（padding 减小、`.mn-body` max-height 320→260）；移动端 dock 缩到 right:10/bottom:8、浮层 44vh。
- 资源版本号 `styles.css / trans.js / app.js` bump 到 `?v=20260810d`；新增翻译键 `noticeFabOpen/noticeFabClose/noticePopTitle/noticeClearAll`。
- 验证：`node --check app.js|trans.js` 通过；静态文件由运行中的服务直接读取（`curl styles.css?v=20260810d` 已含 notice-dock），**无需编译或重启后端**，刷新页面即生效。

## 上下文自动压缩：新增独立设置板块 + 压缩事件可见化（2026-08-13）⭐ 需重启后端
- 起因："用这个工具好像不会自动压缩了"。先做了事实核查：`~/.claude/projects/**/*.jsonl` 里能 grep 到 13 条 `"trigger":"auto"` 的 `compact_boundary` —— **自动压缩在 -p 模式下本来就在跑**，问题是①界面上完全看不出来（压缩帧被当普通 system 帧只进轨迹），②没有任何地方能调它。
- claude CLI（实测 2.1.228）的开关是 `--autocompact <auto|tokens>`：取值只能是 `auto` 或 **100k–1M** 之间的数，`off` / `5` 都会在参数校验阶段直接报错退出（**没有"关闭"这个取值**，所以板块里不提供关闭项）。
- 后端：
  - `SettingsStruct` 新增 `autoCompact: {mode:'auto'|'custom', tokens}` + 常量 `AUTO_COMPACT_MIN/MAX/DEFAULT_TOKENS`(10万/100万/20万)，走 get/update/_patch 三处；新增公开接口 `Settings.autoCompactArg()`（custom 才返回 token 字符串，auto 返回 ''）。
  - `Settings._sanitizeAutoCompact`（Realize）：老配置无该字段 → 回落 auto（行为与改动前**完全一致**：一个参数都不传）；custom 的 tokens **夹在 100k–1M**，因为越界会让 claude 在启动阶段直接参数报错。
  - `ClaudeRunner._buildArgs`：`autoCompactArg()` 非空才 push `--autocompact <n>`。**默认不传**很重要——第三方服务商（MiniMax 1000000 / Kimi 1048576）是靠 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 环境变量设窗口的，显式传 flag 会盖掉它。
  - `ClaudeRunner._parseLine` 的 system 分支：`subtype==='compact_boundary'` 时额外 `cb.onOutput('[上下文自动压缩] 前面的对话已压缩成摘要后继续（压缩前约 N tokens）')`，其余照旧只进轨迹。压缩不吭声正是"感觉没在压缩"的由来。
- 前端：`#pane-context` 新板块（🗜️ 上下文自动压缩，排在项目模板之前）——压缩窗口下拉「自动/自定义」+ 自定义时的 number 输入（min/max 100000/1000000）+ 说明；`SETTINGS_PANES` 加 `context` 条目（summary 显示"自动"或"自定义窗口：xx 万 tokens"），`fillContextPane/saveContextPane/syncAutoCompactMode/formatTokens`；`loadSettings`、`patchSettings`、`State.settings` 默认值三处同步 autoCompact。trans.js 加 `paneContext*` 五个键（中英）。资源版本号 `trans.js/app.js` bump 到 `?v=20260813a`。
- Codex 没有对应 CLI 开关（自带压缩机制），板块内直接写明该设置只作用于 Claude Code。
- 验证（编译产物直调）：默认 `{auto,200000}` → arg=''；`tokens:5`→夹到 100000、`9e9`→1000000、`mode:'xx'`+`tokens:'abc'`→回落 auto/200000；custom 时 `_buildArgs` 确实带 `--autocompact 300000`，auto 时不含该参数；伪造 compact_boundary 帧 → 拿到中文压缩提示。另用真 CLI 确认 `--autocompact 300000` 通过参数校验（失败点在空 prompt，不是参数）。tsc --noEmit 干净，build 通过。
- ⚠ 前端刷新即用；**后端需外部重启 claude-hub 才生效**（实测本会话进程链 powershell ← claude.exe ← node dist\index.js(5852) ← cmd.exe，就是 hub 的子进程，自重启会把自己杀掉）。

## 工具命令菜单去掉 /compact，只留 /usage（2026-08-13）⭐ 需重启后端
- 需求：输入框旁（右下角）的工具命令菜单只保留 `/usage`。
- 前后端都拿掉，不是只藏前端：`CommandsConfig.LIST` 删掉 compact 条目（白名单，删掉后 `/api/command/run {cmd:'compact'}` 直接被 `CommandsConfig.get` 拒绝）；`app.js` 的 `CMD_ITEMS` 删掉该项，并顺手删掉 `runCommand` 里"compact 跑完刷新会话视图"的死分支；`trans.js` 删 `cmd_compact_name/desc`。
- 自动压缩板块的说明文案里"也可以手动执行 /compact"那句一并删掉（菜单里已经没有了，留着会指向不存在的入口）。
- 保留不动：`AppConfig.COMMAND_COMPACT_TIMEOUT_MS`（配置项，日后要加回来就用它）、输入框里打 `/` 的原生命令透传补全列表（那是另一个功能，不是这个菜单）。
- 资源版本号 `trans.js/app.js` bump 到 `?v=20260813b`。验证：`CommandsConfig.list()` 只剩 usage，`get('compact')` 抛 unknown command。

## 修复：会话里追加排队消息会让侧栏「执行中」消失（2026-08-13）· 纯前端
- 现象：会话正在跑时再发一条消息（排队），左侧会话列表那条的「执行中」标识立刻没了（还会被误标成「刚执行」）。
- 根因：`TaskQueueStruct.add()` 对每条新任务广播 `kind:'task'` 且 `status:'pending'`；前端 `updateRunningFromTask` 是"只要来的不是 running 事件就 `State.running.delete(sessionId)`"，把别的任务的 pending 事件当成了"本会话跑完了"。
- 修法：**按任务 id 记账**。`State.runningTasks: Map<sessionId, Set<taskId>>`，running 集合 = 它的非空键集；running 事件加 id，其它状态只删该 id，集合空了才撤「执行中」/ 记 justFinished。pending/held 的任务事件因 id 不在集合里，天然是 no-op。
- 5 处 `State.running = new Set(sessions.filter(sessionHasRunning)...)` 统一换成新的 `rebuildRunning()`（同时重建两份结构，后端列表为准）；原 `sessionHasRunning` 已无引用，删除。
- 验证：`node --check` 通过；把真实的 `rebuildRunning/updateRunningFromTask` 源码抠出来在 node 里跑事件序列——rebuild→running；连发两条 pending 仍 running 且 justFinished 为空；t1 done→撤销；t2 running→恢复；非当前会话 pending 不误标、真结束才标 justFinished。
- `index.html` 里 `app.js?v=` bump 到 20260813c。不涉及 backend/dist，无需编译或重启，刷新页面即生效。

## 修复：同一个会话在收藏夹里出现两遍（meta 键二义性）（2026-08-13）⭐ 需重启后端
- 现象：`2bd46524-…` 这个会话在左侧收藏夹列表里重复出现两条，内容完全一样。实测**共 4 个会话**中招。
- 根因是 **一个会话有两个可用 id，而标注按传入 id 记账**：
  - 新建会话 id = `rootId:draft-xxxx`；首跑后 `TaskQueue._reconcileSessionId` 调 `SessionMeta.migrate(草稿id → rootId:uuid)`，把收藏/置顶**搬到自然 id 并删掉草稿键**。
  - 但 `listSessions` 故意**继续用草稿 id 显示**（`SessionManagerStruct:31` 的 `useLiveId`，为了首跑前后前端选中不丢）。于是用户在列表里再点一次 ★ → 写回**草稿键** → 同一会话两条 meta。
  - `listFavoriteSessions` 是**遍历 meta 的 key** 逐个 getSession，而两个 id 都能解析到同一会话（`_getLiveByNaturalId` + `_hydrateLiveMeta` 本来就是为此设计的）→ 吐出两条。普通会话列表有 `usedIds` 去重，所以只在收藏夹里能看到。
- 三层修法（全在 `SessionManagerStruct`）：
  - **规范键**：私有 `_canonicalKey(s)` = 有 uuid 就 `rootId:uuid`，否则草稿 id。`setPinned/setFavorite/setStatus/setTitle` 一律先 `getSession(id)` 再按规范键写；`_withMeta` 也按规范键读（`meta[规范键] || meta[s.id]` 兜底历史数据）。**读写同一个键**是关键。
  - **去重**：`listFavoriteSessions` 按规范键去重，且先把非 draft 的键排前面（保留自然 id 那条）；取会话改用新钩子 `_getSessionSafe`（Realize 里 try/catch，Struct 不再直接写 try/catch）。
  - **清历史**：`restorePersisted` 末尾跑 `_normalizeMeta(restored)`，把还记在草稿 id 上的标注 `migrate` 并回规范键（migrate 自带合并：收藏/置顶取或、时间取大）。`SessionMeta.migrate` 改为返回 boolean 便于计数与 `Logger.info` 记录。
  - `removeSession` 也顺带清掉另一个 id 上的残留标注（**必须在删 jsonl / 删运行期之前**取规范键，否则推不出来）。
- 验证（编译产物直调真实 data）：`restorePersisted` 一次合并 **17 条**草稿键，meta 键 193→187，收藏键 179→174（15 条草稿收藏全部迁到自然键，**无丢失**）；收藏夹 127 条、零重复；目标会话在普通列表 1 条、收藏夹 1 条；按**草稿 id** 收藏/取消 → 实际读写的是**自然键**，不再新建草稿键。tsc --noEmit 干净。
- ⚠ 数据修复在本次跑测时**已落盘生效**（session_meta.json 已归一），且 SessionMeta 每次都从磁盘读、无缓存，所以**重复条目立刻就没了**；重启只是让「防再次产生」的新逻辑生效。

## 展开/收起折叠消息不再把滚动条推到底 + 简易动效（2026-08-19）· 纯前端
- 问题：折叠的 AI 消息点「展开」后，会话被整个滚到最底部，用户想看的那一条反而跑没了。收起同理。
- 根因：`renderMessages()` 是整块 `innerHTML=''` 重渲染，结尾**无条件** `box.scrollTop = box.scrollHeight`。展开/收起走的也是这条路径。
- 修法（`app.js`）：加**渲染锚点**。新增模块级 `MsgRenderAnchor` + 三个函数：
  - `toggleAssistantGroup(key, expand)` —— 展开/收起的唯一入口（折叠卡片的 click、收起按钮都改调它）。重渲染**之前**记下该组元素相对 `#messages` 视口顶的 `top` 和当时的 `offsetHeight`，再改 `State.aiExpandedGroups` 并 `renderMessages()`。
  - `findGroupEl(box, key)` —— 按 `dataset.groupKey` 在 box 的直接子节点里找（**不用 querySelector**：group key 形如 `rootId:uuid:msgid:n`，含 `:`，做选择器还得 `CSS.escape`，不如直接扫）。
  - `applyMsgScroll(box)` 取代原来那行硬滚底：**有锚点**就 `box.scrollTop += 新top - 旧top` 把这条钉回原位；**没锚点**（新消息到达、切会话等一切其它重渲染）保持原来的滚到底行为不变。锚点元素找不到（key 变了）也退回滚到底。
- 动效（2026-08-19 当天迭代三版才对：180ms → 800ms → 重做）。**光把外框高度补间是不够的**：重渲染是把这一条整个换成**另一个元素**（折叠卡片 ⇄ 完整消息），第 0 帧就是「预览小字啪地变成正文」，外框再慢也只像"框在变大"，不像展开。最终三件事叠在一起：
  - **外框高度补间** `MSG_TOGGLE_MS=800`，缓动换成 `cubic-bezier(.4,0,.2,1)`（从静止起步、到静止收住）。原来那条 `(.2,.7,.3,1)` 起手斜率 3.5，一上来就窜出去，时长拉长后「先弹一下再磨蹭」特别明显——**这才是"不自然"的主因**。实测前 200ms 只走 14.9%。
  - **旧样子快照淡出**（`msgToggleGhost` + `.ai-toggle-ghost`）：重渲染**之前**把旧元素 `cloneNode(true)`，渲染后绝对定位盖回新元素里淡出（360ms），被新外框的 overflow 一起裁着。⚠ 绝对定位的包含块是 **padding 盒**，要和新元素的边框盒对齐必须 `top/left = -borderWidth`（实测 t=0 l=0 对齐）；克隆时要先剔掉里面可能残留的上一张快照（`querySelectorAll('.ai-toggle-ghost').remove()`），否则连点会套娃。⚠ 快照带着 `.msg` 的 `max-width:80%`，会把显式宽度夹掉，CSS 里必须 `max-width:none`。
  - **新正文淡入落定**（`fadeInMsgBody`）：opacity 0→1 + translateY ∓6px，480ms、**延迟 160ms**、`fill:'backwards'` —— backwards 让它在延迟这段保持透明，才和正在淡出的旧样子真正交叠，而不是两层同时全亮。
- ⚠ **`.ai-toggling` 必须带 `flex:none`**（真坑）：`.messages` 是 column flex 且内容溢出（负剩余空间），平时靠 `min-height:auto` 撑着不被压缩；一旦加 `overflow:hidden`，这一条的 min-height 退化成 0 → **全部负剩余空间都压到正在动画的这条头上，把它挤扁**。另加 `position:relative` 给快照当定位基准。
- ⚠ 关键顺序：先 `scrollTop` 归位、再启动动画。反过来的话动画中的高度会污染归位时的测量。
- 资源版本号最终 `?v=20260819c`（当天 a→b→c 三版）。
- 中途打断是安全的：动画期间元素的 `offsetHeight` 返回的是**当前动画高度**，所以连点两下时新一轮补间正好从眼下看到的高度接着走，不会跳。
- 验证两层：① 假 DOM 单测（8 例）—— 展开/收起锚点 top 不变、无锚点仍滚到底、锚点丢失退回滚到底、高度几乎不变不动画、减少动效偏好整套跳过、连点两下快照不套娃、三条动画的时长/延迟/fill 都对。② **真浏览器探针 `e2e/_msg_toggle_probe.js`**（playwright-core + 本机 Chrome `channel:'chrome'`，本机没有 ms-playwright 缓存所以不能用自带 chromium；不碰运行中的 hub 因为要口令，改成把那 8 个真函数从 app.js 抠出来 + 真 styles.css + 真 DOM 结构自建页面）：25 项全过 —— 第 0 帧外框仍是旧高度(82px)、快照 t=0/l=0 对齐、新正文 opacity=0；中途 152→436→532 单调增长且锚点 top 一直是 313；结束 555px 正好等于自然高度（**证明 flex 没把它挤扁**）、快照已自行移除；收起同理回到 82px；中途打断 298→298 不跳、只有一张快照。⚠ 探针里量高度和点击必须在**同一次 evaluate** 内，分两次往返的 20~30ms 动画还在长，会把往返耗时误判成跳变。
- 静态文件由运行中的服务直接读取，**无需编译或重启后端**，刷新页面即生效。
## 2026-08-20（第十轮）· 站点图标 favicon（之前一直没有）

浏览器标签页此前是空白图标：`index.html` / `learn.html` / `assist/index.html` 三个页面
**一个 `rel="icon"` 都没有**，仓库里也没有任何图标文件。

### 图形

蓝紫渐变圆角方块（`#5b8cff → #8b5cf6`，就是默认主题 `--accent`）+ **右侧开口的粗 C 环**
+ **中心白色圆角小方块**（既是 C 的中心，也像终端光标）。C = Clootee，16px 下仍读得出。
第一版 C 环 r=15/线宽 9，16px 预览留白偏多，改成 **r=16/线宽 10**、光标半边长 4.4。

### 文件

| 文件 | 说明 |
|---|---|
| `frontend/favicon.svg` | 矢量源（603B），现代浏览器优先用它 |
| `frontend/favicon.ico` | 16/32/48 三档，内嵌 PNG（Vista+ 与所有现代浏览器都认） |
| `frontend/apple-touch-icon.png` | 180px（iOS 加到主屏） |
| `frontend/icon-192.png` / `icon-512.png` | 备用大图（PWA/安卓，暂无 manifest） |
| `backend/scripts/gen_favicon.js` | **位图生成器：纯 Node、零依赖** |

`gen_favicon.js` 自己做光栅化（圆角矩形 SDF + 带圆头的圆弧 SDF，4×4 超采样抗锯齿）
并手写 PNG（zlib deflate + 自算 CRC32）与 ICO 容器，所以 Windows / Linux 都能跑，
不需要 canvas / sharp / imagemagick。改了 `favicon.svg` 就同步文件顶部那几个常量再
`node backend/scripts/gen_favicon.js`。

三个页面各插 3 行 `<link>`（ico + svg + apple-touch），带 `?v=20260820a`；
`assist/index.html` 在子目录，路径带 `../`。`index.html` 的 UTF-8 BOM 已保留（改用 utf-8-sig 读写）。

### 已验证

16px 与 512px 都实际渲出来看过（C 形清楚、光标方块没糊）；`favicon.svg` 通过 XML 解析；
本机 hub 三个地址 200（ico 2583B `image/x-icon`、svg 603B `image/svg+xml`、apple-touch 4202B），
`learn.html` 回源已带新 link；四个图标文件都没被 `.gitignore` 吃掉。
**前端改动，不需要编译也不需要重启**（`express.static` 直读磁盘）。

### 上线（[launch]）

- ✅ **本机 Clootee**：静态文件即时生效。
- ✅ **公司内网云端入口 `http://172.16.4.41/relay/`**：`claude-relay-agent-trio` 又从 pm2 里没了，
  已按 connect.md 的内联 env 重新 `pm2 start` + `pm2 save`，日志 `registered as "plxiao-win"`。
- ❌ **learn.xfeixie.com 仍未上线**，但**卡点变了**：凭据已经有了（连接器 hub 在跑，
  `id=4 root@106.13.193.3`，`exec-sudo` 可自动应答密码），**这次是网络到不了**——
  `/api/session/open` 返回 `connect EACCES 106.13.193.3:22`，ping 100% 丢包，
  `galaxy/teach/claudecode.xfeixie.com` 全部 000，而 baidu / github / 172.16.4.41 都正常。
  即：**106.13.193.3 从公司这条网络整台不可达**。换网络（或服务器恢复）后按
  `deploy/README.md` 四步即可，htpasswd 那步要一个口令（还没给）。

### 图形改版（同日，第二稿）：避开 ©，做成折角方括号

用户担心第一稿（圆环 C + 中心方块）**会被认为侵权**。确实：圆环包 C 最容易被读成 **©**，
而且"圆环 + 中心圆点/方块"这种构图撞车概率高。第二稿换成纯原创几何：

- **折角方括号 C** —— 5 点折线 `(41.5,16.5) (26,16.5) (14.5,32) (26,47.5) (52,47.5)`，
  线宽 9.5，圆头圆角；**没有任何圆弧**（所以绝不会读成 ©），
  且**上臂短、下臂长**（41.5 vs 52）—— 刻意不对称，是这个 mark 的签名特征
- **竖条文本光标** —— 圆角胶囊 7.6×12（不是方块），压在折线开口内侧
- 背景渐变与圆角不变（`#5b8cff → #8b5cf6`，rx 14）
- 第一次试 h=15.6 的长光标，16px 下和上下臂粘住了，缩到 h=12 才有清晰间隙

生成器同步重写：`sdArc` 换成 **`sdPolyline`（点到线段距离）+ `sdRoundBox`**，
`sdMark = 折线 ∪ 光标`，其余（4×4 超采样、手写 PNG/ICO）不变。
三个页面 favicon 的 `?v=` 提到 **20260820b**（图形变了，防缓存）。

**已验证**：16px / 512px 都渲出来看过（16px 下"C 形 + 光标"仍分得开）；svg 通过 XML 解析；
本机 hub 三个地址 200 且字节数与磁盘一致（ico 2526 / svg 675 / apple-touch 3707）；
`git diff --stat` 确认只动了 favicon 三行 + 图标 + 生成器，learn.html 其他资源版本号没被误改。

### 图形第三稿（同日，定稿）：CLT 三字母字标

用户说折角方括号「不太好看」，要求直接用 **CLT** 三个字母。

- 3 个字母要在 16px 下还分得开，只能**压缩字形 + 粗笔画**：字高 30（中线 y 20.5→43.5）、
  笔画宽 7、圆头圆角，三个字母横排占满 x 6.5→57
- **C 必须有真圆角**：第一版只靠笔画自带的圆角（半径 = 半线宽 3.5），读起来是方括号「[」而不是 C。
  改成中线自带 r=6 的上下圆角（`arcPts()` 采样成折线；SVG 侧对应 `A6 6 0 0 0`）后才像字母
- L = 竖干 + 底横；T = 顶横 + 中竖（两条独立折线）
- **试过小尺寸整体加粗**（`GROW`，光学字号的土办法）：16px 下反而把 C 的开口糊住、读成「a」，
  **已删掉**——4×4 超采样本身就够
- `?v=` 提到 **20260820c**

生成器结构不变（`sdSegment` + 折线并集 + 手写 PNG/ICO），只换 `GLYPHS`。
**已验证**：16 / 32 / 48 / 512 都渲出来看过，16px 与 32px 都能读出 CLT；`node --check` 过；
svg 通过 XML 解析；本机 hub 四个地址 200 且字节与磁盘一致（ico 2720 / svg 702 / apple-touch 4369 / icon-512 14385）。

## 2026-08-20（第十一轮）· learn.xfeixie.com 终于上线了

前两轮记的两个卡点（缺凭据 / 网络不通）这轮都绕过了：连接器 hub 里已有 `id=4 root@106.13.193.3`，
而公司这条网络到 personal1 **时通时断**（同一小时内在 EACCES 和 302 之间来回跳）——
**在通的窗口期里用连接器会话一口气做完**，本机验证不了就改从公司服务器（connectionId=1）curl。

按 `deploy/README.md` 四步，实际有两处要补：

1. **acme 签发前 443 vhost 起不来**（证书文件还不存在 → `nginx -t` 直接失败）。
   先放一个**只有 80 端口 + acme location**的临时 conf，签完再 `cp` 正式 conf。
2. **`--server letsencrypt` 要显式写**（acme.sh 默认可能是 ZeroSSL，会 `retryafter=86400`），
   `--install-cert` 还要带 **`--ecc`**（签出来的是 ECC 证书，不带这个找不到）。

口令：用户始终没给，**沿用 teach.xfeixie.com 的 `iloveai7788`**（用户名 `learn`），
理由是同一台机、同类站点，少记一个；`.htpasswd` 只在服务器上（clootee 是公开仓库）。
改口令一条命令：`htpasswd -b /www/wwwroot/learn.xfeixie.com_auth/.htpasswd learn '新口令'`，不用 reload。

**验收（服务器本机 + 172.16.4.41 两处一致）**：无口令 401；带口令 200 / 4687B；
`/assist/assistant.js` 免口令 200 / 27556B；`favicon.ico` 200 / 2720B（正是新的 CLT 图标）；http → 301。
本机（公司网络）当时又断了，所以是从这两处验的。

**以后更新**：`cd /www/wwwroot/clootee && git pull` —— 纯静态，root 直指检出目录，不重启任何东西。

## 2026-08-20（第十二轮）· Claude 账号登录搬到「AI 引擎 → 原版」下

用户：「claude 登录及账号这个应该放在 ai 引擎 选择原版的时候，因为其他时候都不需要。」
确实——第三方服务商（MiniMax / Kimi / 小米 / 自定义）全走 API Key，压根没有 Anthropic 账号可言，
可登录卡一直摆在「运行环境」板块里，跟服务商选择隔着两个板块，还对第三方用户显示一句「无需登录」的废话。

### 改了什么（纯前端，4 个文件）

- `index.html`：`<div id="clBox">` 从 `pane-runtime` **删掉**，移到 `pane-engine` 里
  Claude 服务商下拉的正下方，默认 `hidden`；原先那行只显示邮箱的 `claudeOfficialWho` 一并删除
  （登录卡是它的超集：账号 + 组织 + 套餐 + 重登/重新检测按钮）
- `app.js`：`providerUi().who` → `providerUi().login`（只有 claude 侧有，codex 侧为 null）；
  删掉 `renderOfficialWho` / `officialWhoText`（约 25 行），换成一行 `renderClaudeLoginBox()`；
  显隐统一由 `syncProviderVisibility()` 管：`provider === 'official'` 才显示并渲染，否则隐藏 + 清空 innerHTML；
  `fillRuntimePane()` 不再渲染登录卡（只剩网络体检）
- `health.js`：`claudeLoginHtml` 新增 `Health.loginOpts.forceOfficial` 分支
- `trans.js`：删掉 6 个再无人用的 `engWho*` 文案

### 两个当时想清楚了的坑

1. **`forceOfficial` 是必需的**。登录卡原本会先看后端返回的 `provider`，非 official 就画成「无需登录」。
   但用户在下拉里刚切到「原版」**还没点保存**时，后端记的仍是 MiniMax ——
   不加这个标记，正要去登录的人会被这张「无需登录」的卡挡在门外。调用方（引擎板块）自己知道这就是原版，直接告诉它。
2. **别重复拉 auth status**。`renderClaudeLogin` 自己每次都会调 `/api/claude/auth/status`，
   而那个接口要起一个 `claude` 子进程。所以删掉了 `loadEngineProvider` 里那句「强制重读」——
   它前面的 `syncProviderVisibility` 已经渲染过一次了，留着就是每次开板块拉两遍。
   现在只有「打开板块」和「切到原版」两个时机会拉。
   切语言重画走 `paintClaudeLogin()`（纯重绘、不拉接口），且加了 `Health.loginBox === login` 判断——
   `Health.loginBox` 是全局单例，可能还指着引导页那个已经脱离 DOM 的框。

### 验证

`node --check` 三个 js 全过；`clBox` 全仓只剩 1 处定义 1 处引用；`engWho` / `OfficialWho` 零残留。
`index.html` 里 `trans/health/app.js` 的 `?v=` 统一提到 **20260820a**（不提的话老浏览器会拿缓存里的旧 app.js 配新 html，clBox 永远不显示）。
`index.html` 的 UTF-8 BOM + CRLF 都保留了（改用 utf-8-sig 读、手动回写 CRLF）。
**UI 实跑没验成**：本机 hub（PID 22312，16:18 就在跑，不是这次起的）有访问口令，
playwright 探针停在登录遮罩前，口令没问到。纯前端改动，`express.static` 直读磁盘，**不用编译也不用重启**。

## 2026-08-20（第十三轮）· 收藏夹切目录时自动打开该目录第一条会话

用户：「切换目录的时候，同时就选择这个目录的最顶端的那个任务。」
指的是收藏夹里那排目录标签（`FavDir` / `.fdf-tag`），原来只过滤列表，右侧还停在旧会话上。

改动只在 `frontend/app.js`：`pickFavDir()` 里 `renderSessions()` 之后加一句
`if (FavDir.rootId) selectTopVisibleSession()`，新函数直接取 `#sessionList` 里第一个
`.session-item` 的 `data-sid` 去 `selectSession`。

三个刻意的选择：
1. **读 DOM 而不是重算一遍列表**。renderSessions 里叠了 目录/状态 tab/运行状态/搜索 四层过滤 +
   排序，重算等于把那段逻辑抄第二份，以后必然走偏；渲染完的第一条就是「最顶端那个」。
2. **只在选中目录时触发**，再点一次取消筛选（rootId 变空）不动当前会话——那时候没有「这个目录」可言。
3. **批量模式直接 return**：那个模式下点击行是勾选而不是打开，自动选会误勾。
   另外命中同一会话时也 return，省掉一次无谓的会话加载。

`index.html` 的 `app.js?v=` 提到 **20260820b**（trans.js 没改，仍 a）。
`node --check` 过；纯前端，不用编译不用重启。

## 2026-08-20（第十四轮）· 刷新后保持收藏夹视图

用户：「任何一个页面刷新的时候，如果我点了收藏，应该保持是进入收藏夹的状态，而不是重新来过。」

原来 `State.favoritesOnly` 是纯内存态（初始写死 `false`），刷新即回到普通会话列表。
改动只在 `frontend/app.js`，跟着既有的 `rootId` 用同一套 **sessionStorage** 持久化（按标签页，
不跨窗口串台）：

- `favoritesOnly: sessionStorage.getItem('favoritesOnly') === '1'` 作为初始值；
  新增 `setFavoritesOnly(on)`（与 `setTabRootId` 并列），所有写入点统一改走它：
  `toggleFavorites()` / `toggleMode()` / `applyRootSelection()`。
- `FavDir.rootId` 一并持久化（`favDirRootId` + `setFavDir()`），刷新后还停在原目录标签下。
- `loadFavoriteSessions()` 末尾校验：恢复的 `FavDir.rootId` 若在收藏集里已无成员（取消收藏/删目录），
  自动 `setFavDir('')`，不然列表看起来是空的。

不需要额外的 UI 恢复代码：启动链 `startApp → loadRoots → loadSessions` 里 `loadSessions()`
本来就有 `favoritesOnly` 分支走 `loadFavoriteSessions()`，而 `renderSessions()` 开头就调
`syncFavoritesButton() + renderFavDirFilter()`，body class / 按钮箭头 / 标题一次到位。

`index.html` 的 `app.js?v=` 提到 **20260820c**。`node --check` 过；纯前端，不用编译不用重启。

### 发布（同轮）

`learn.xfeixie.com` 纯静态、nginx root 直指 git 检出目录，所以上线就一条命令
（经连接器 `POST /api/exec`，connectionId=**4** = root@106.13.193.3）：
`cd /www/wwwroot/clootee && git pull` —— 不拷文件、不重启、无 pm2。

服务器原本落后两个提交（`c2807e5..40e1793`，含前两轮的收藏夹改动与 Claude 登录卡搬家），
一次 fast-forward 全部带上（app.js / health.js / index.html / trans.js）。

**验收**：服务器磁盘上的 `app.js` 与 https 回源都能 grep 到 `setFavoritesOnly`（各 4 处），
`learn.html` 带口令 200；本机 hub `127.0.0.1:8970/app.js` 同样是新版。

## 2026-08-21（第十五轮）· 统计详情：空闲可以统计，加了「含空闲」开关

用户问「AI 工作时间花在哪（不含空闲）这个时间为啥不含空闲？空闲能统计吗」。

**空闲一直是算得出来的**，而且早就在算：`TraceStore._phases()` 把相邻事件的每个间隙归类到
ttft/think/genTool/genText/toolExec/bgTask/startup/idle/other 九个桶，各桶之和恒等于 spanMs；
判 idle 的规则是「间隙 > `IDLE_GAP_MS`(120s)」或「下一个事件是 task_start」，
`activeMs = spanMs - idle`。汇总条里的「用户空闲」就是它。
之前只有那张阶段条形图排除 idle，纯粹是**显示口径**问题：一次过夜的会话 idle 能有十几个小时，
画进同一张按 ms 取值的横条图里，其余工作阶段全被压成看不见的细线。

### 改法（纯前端，4 个文件）

在阶段标题行右侧加一个 `含空闲` 复选框（`#statsIdleTg`），勾上之后：
- 条形图 + 图例把 `idle` 一起画进来，标题换成 `statsPhaseTitleAll`（「整段时间花在哪（含空闲）」）；
- 占比分母从 `activeMs` 换成 `spanMs`——两种模式下各段百分比之和都≈100%，不会出现「超过 100%」；
- 「按任务」表的列同步多出一列 idle。

实现上：`Stats` 新增 `withIdle`（`localStorage.statsWithIdle` 持久化）+ `data`（缓存本次接口结果）；
`toggleStatsIdle()` 只改状态然后 `renderSessionStats(Stats.data)` 整段重绘，**不重新打接口**；
`closeSessionStats()` 里把 `Stats.data` 清掉。CSS 加 `.st-h-row` / `.st-tg`。
复选框的 `title` 提示写清了口径（>2 分钟的间隙 + 任务开始前的等待）。

一个容易记错的点：**按任务表里的 idle 之和 < 总 idle**。`_byTask` 用 task_start 的时间戳切窗，
任务之间的那段空闲跨在窗与窗的边界上，不落进任何一个窗；任务内的 idle 只有执行途中 >2 分钟的长间隙。

`node --check` 过 app.js / trans.js；`index.html` 的 `styles.css / trans.js / app.js` 的 `?v=` 统一提到
**20260821a**（不提老浏览器会拿旧 app.js 配新 css，开关没样式）。纯前端，不用编译不用重启。

### 同日回退：「含空闲」开关撤掉，标题也不再写「（不含空闲）」

用户：「用户空闲当然不要统计了，也不要加入（不含空闲）来误导我！」

上一轮方向做反了。空闲本来就不该进这张图——它衡量的是 **AI 的工作时间怎么分配**，
人不在键盘前的那段跟 AI 干了什么无关，画进去只会稀释所有真实阶段的占比。
而标题里那句「（不含空闲）」更糟：它暗示这张图**漏掉**了本该有的东西，
让人以为统计不完整、去追问一个根本不存在的缺口。

所以：`frontend/{app.js,styles.css,trans.js,index.html}` 全部 `git checkout e8d6e55^ --` 回到加开关之前
（`Stats.withIdle` / `Stats.data` / `toggleStatsIdle()` / `statsPhaseTitleAll` / `statsIdleToggle` /
`statsIdleHint` / `.st-h-row` / `.st-tg` 全删干净），只保留一处新改动：
`statsPhaseTitle` 去掉括号，变成「AI 工作时间花在哪」/「Where AI working time went」。

`?v=` 提到 **20260821b**（不能退回 `20260820c`——已经拿到 `a` 版的浏览器会一直缓存着带开关的 app.js）。
汇总条里的「用户空闲」chip 保留：它是 `总跨度 - AI 实际工作` 的那笔差额，删了这两个数就对不上账；
它只是一行事实，不参与阶段图的占比。

**教训**：用户问「为什么排除 X」时，先判断 X 该不该在里面，而不是默认「能加就加」。
标注一个刻意的排除，等于把设计决策写成缺陷。

## 2026-08-21（第十六轮）· 收藏夹的目录筛选行改成常驻，去掉 🗂 开关

用户：「进入收藏夹之后，按工作目录筛选这个不要隐藏了，也不需要我点那个文件夹图形来展开，默认都可以看到这些目录」。

原来这行标签是折叠的：标题栏一个 `🗂`（`#favDirFilterBtn`）控制 `FavDir.open`，
不点就看不到自己收藏里有哪些目录——而收藏夹的主用途恰恰就是「按项目跳」，
把入口藏在图标后面等于每次进收藏夹都要多点一下。

改法（纯前端 4 个文件，无后端、不用编译）：
- `index.html` 删掉 `#favDirFilterBtn`；`app.js` 删掉 `toggleFavDirFilter()`、它的 click 监听、
  `FavDir.open` 字段以及 `toggleFavorites()` 里的 `FavDir.open = false`。
- `renderFavDirFilter()` 简化成：在收藏夹且非 workspace 时算 `favDirOptions()`，
  `box.hidden = opts.length === 0`，其余照旧渲染 `.fdf-tag` + 选中时的 `✕`（clearFavDir）。
  即「有目录就显示整行，没有就整行收掉」，不再有第三种折叠态。
- 顺手删掉两处死代码：`.fav-dir-filter .fdf-empty`（空态文案不再出现，空态直接隐藏整行）
  和 `trans.js` 的 `filterByDir`（按钮 title 没了，key 无人引用）。

`FavDir.rootId` 的 sessionStorage 持久化、`pickFavDir()` 切目录自动打开顶部会话都不变。
`renderFavDirFilter()` 唯一调用点仍是 `renderSessions()` 开头，所以收藏/取消收藏后这行的计数会自动跟着刷新。
`?v=` → **20260821c**。

## 2026-08-21（第十七轮）· 收藏夹新建会话继承筛选目录 + 顶部工作目录改成标签

用户：「如果在收藏夹里，用户已经选择了一个目录，这个时候点 new session 应该就是这个工作目录的，没选就要用户选。
然后顶部的工作目录啊，字要清晰一些（文字和背景对比要显著一些，边框也显著一些）」。

### 一、收藏夹里的「新建会话」跟着目录筛选走

原来收藏夹点「新建会话」一律走 `createFavoriteDraftSession()`——建一个 `rootId: ''` 的草稿，
正文区弹出「请选择工作目录」的绑定条。但用户此刻明明已经在 `FavDir.rootId` 这个目录里筛着列表，
再问一次目录纯属多余。

改法（`app.js`，纯前端）：
- 新增 `favFilterRootId()`：返回 `FavDir.rootId`，但先用 `State.roots` 校验这个根还活着
  （目录被删过 → 返回 ''，退回原来的「让用户选」路径，不会拿一个死 id 去建会话而报错）。
- `newSession()` 的收藏夹分支：先取 `favRoot`，建草稿后立刻 `await bindFavoriteDraftRoot(favRoot)`
  ——复用已有的绑定流程（`/api/session/create` + `/api/session/favorite` + 模板询问），
  一步到位得到一个真实的、已收藏的、落在该目录的会话；没筛选目录时行为完全不变。
- 同时加了和主列表一致的复用守卫：当前会话就是该目录下一个「没 claudeSessionId、没任务」的空会话时，
  直接 `selectSession` + 聚焦输入框，不再重复建（否则连点两次会攒出两个空会话）。
- `ensureSession()`（无会话时直接在输入框提交）同样接上 `favFilterRootId()`：
  以前这条路必定撞上 `favoriteRootRequired` 弹窗，现在筛着目录就直接发得出去。

### 二、顶部工作目录：从灰字改成有边框的标签

`.workdir-bar` 原来是 `color: var(--muted)` 的 12px 等宽灰字，直接贴在 `.main-header` 的 panel 底上，
没有边框也没有底色——在深色主题下几乎糊成一片。

改法（`index.html` + `styles.css` + `app.js`）：
- HTML 外面套一层 `#workdirRow.workdir-row`（`flex: 1 0 100%`，负责「独占标题栏第一行」这件事），
  里层 `.workdir-bar` 变成 `width` 随内容的标签：`padding 2px 9px` + `border-radius 6px` +
  `background: var(--panel2)` + `border: 1px solid var(--gray)` + `color: var(--text)` + `font-weight 500`。
  用 `--gray` 而不是 `--border` 做边框：`--border` 和 panel 太接近，等于没画；15 套主题都定义了 `--gray`。
- 显隐搬到外层：`renderWorkdirBar()` 改成设 `row.hidden`（收藏夹视图 / 无根目录时整行收掉），
  内层不再自己 hidden——否则会剩一条带边框的空标签。移动端那条 `.workdir-bar { display: none }` 同步改成 `.workdir-row`。

`?v=` → **20260821d**。纯前端，不用编译不用重启。

## 2026-08-21（第十七轮）· 会话右键菜单加「📂 打开工作目录」（Windows）

用户：「windows 上，右键点到会话，会有多一个按钮：打开工作目录（就是真的打开目录了）」。

**后端一行没动**——能力早就有：`FolderOpenerStruct.open(rootId)` → `RootManagerStruct.getRoot()` 取绝对路径
→ realize 里按 `process.platform` 分别 `explorer` / `open` / `xdg-open`（detached + unref，
因为 explorer 打开成功也可能返回非 0 退出码），路由 `POST /api/root/open` 也已在 `dist` 里。
之前只有设置面板那个 `#openFolderBtn`（📂「前往」）用它，作用对象是**当前选中的根目录**；
这轮只是把同一个能力挂到**每个会话**上，作用对象换成 `session.rootId`。

改动全在前端 3 个文件：
- `index.html`：`#sessionCtxMenu` 里 `#ctxTraceStats` 后面加 `<button id="ctxOpenWorkdir" class="ctx-item" hidden>`。
- `app.js`：静态文案表加 `T('ctxOpenWorkdir')`；`openSessionCtxMenu()` 里
  `hidden = State.settings.platform !== 'win32' || !session.rootId`（`platform` 来自 `/api/settings`，
  是**服务器本机**的平台，不是浏览器的——手机连过来时这项自然不出现，因为目录只能开在服务器那台机器上）；
  新增 `ctxOpenWorkdir()`：先存下 `ctxSession.rootId` 再 `closeSessionCtxMenu()`（关菜单会把 `ctxSession` 置空，
  顺序反了就拿不到 id 了），然后 `api('/api/root/open', { rootId })`。
- 菜单高度估值 `mh` 从 240 提到 280（多一项，靠底部右键时不会被视口裁掉）。
- `trans.js` 新增 `ctxOpenWorkdir`（zh「📂 打开工作目录」/ en「📂 Open working folder」）。

纯前端，不用编译不用重启，`?v=` → **20260821d**。

## 2026-08-21（第十八轮）· 收藏夹目录标签右上角加状态圆点

用户：「收藏夹里顶部的工作目录，应该在目录按钮的右上角适当放置一些点：执行中=闪烁的点，
刚执行完=蓝色静态点，小一点但能看到；有几个这种会话就几个点，其他会话不用点代表。」

`favDirOptions()` 除 `count` 外再累计 `running` / `justFinished`，口径与会话列表里的标识完全一致：
`State.running.has(s.id)` 优先，`else if State.justFinished.has(s.id)`（停了且用户还没点开看过）。
两个集合本来就随 WS 任务事件维护（`updateRunningFromTask`），且它在 `after !== before` 时会 `renderSessions()`，
而 `renderFavDirFilter()` 就挂在 `renderSessions()` 开头 —— 所以点会自动跟着开始/结束刷新，
`selectSession()` 里 `justFinished.delete(id)` 之后也会重渲染，点开即消。**没有新增任何轮询或接口。**

渲染：`favDirDots(o)` 吐 `<span class="fdf-dots">` + n 个 `<span class="fdf-dot run|fin">`，
`FDF_DOT_MAX = 6` 截断（画不下），`favDirTitle(o)` 把**准确条数**放进 title，所以截断不会骗人。
点用 `<span>` 而不是 `<i>`：`.fdf-tag i` 那条规则（opacity .6 / 10px）是给计数用的，会把点也调淡。

CSS 有个坑：`.fdf-tag` 原本 `overflow: hidden; text-overflow: ellipsis`，绝对定位到 `top:-3px` 的点会被整片裁掉。
改成 `.fdf-tag { position: relative }`（去掉 overflow），把省略号下移到内层 `.fdf-nm { min-width:0; overflow:hidden; text-overflow:ellipsis }`；
`.fav-dir-filter` 加 `padding-top: 3px` 给溢出的点留位。点 5px，`box-shadow: 0 0 0 1px var(--panel)` 描一圈底色，
压在标签边框/选中态的 accent 底上也分得清。`run` 用 `var(--accent)` + 复用 `@keyframes pulse`（1s），`fin` 用固定 `#38bdf8`。

**注意**：`--accent` 本身就是蓝的（#5b8cff，ocean 主题下更是 #38bdf8），
所以这两种点主要靠「闪 / 不闪」区分，颜色差别不大——这正是用户描述的区分方式，但换主题时别指望靠色相认。

纯前端 3 个文件，不用编译不用重启，`?v=` → **20260821e**。

## 2026-08-24（第十九轮）· 软件版本自动更新（对比本地 git 与 GitHub 最新 commit）⭐ 后端需重启

需求：加一个「检查更新」功能——启动时自动探测 GitHub 上是否有新版本，用户确认后一键 `git pull` + 重新编译 + 重启。
本项目没有独立的发行版本号，**版本号 = git commit sha**，提交即发布。

### 后端（Struct/Realize 新增一对）

`logic_struct/UpdateCheckerStruct.ts` + `logic_realize/UpdateChecker.ts`：
- `check()`：`_currentBranch()` 拿**上游跟踪分支**（`git rev-parse --abbrev-ref --symbolic-full-name @{u}`，
  取 `/` 后的部分）→ `_localCommit()`（`git log -1 --format=%H%n%h%n%cI%n%s`）→
  `_remoteCommit(branch)`（`HttpJson.get` 打 `https://api.github.com/repos/<owner>/<repo>/commits/<branch>`，
  owner/repo 从 `git remote get-url origin` 正则解析，不写死，换 fork 也能用）→ 对比 sha 出 `hasUpdate`。
- `apply()`：`_pull()`（`spawn git pull --ff-only`，逐行回调）成功后 `_triggerRestart()`
  ——**复用 restart.sh / restart.bat**（唯一的自检+编译+pm2重启实现，不在 TS 里重复一份 pm2 逻辑），
  `detached:true, stdio:'ignore'` 拉起，不受当前进程随后被杀掉影响。
- 路由：`GET /api/update/check`、`POST /api/update/apply`（`kind:'updateApply'` 逐行广播 git pull 输出）。
- `paths.ts` 新增 `Paths.PROJECT_ROOT`（= claude_hub 文件夹本身），git 命令 cwd 用它、restart 脚本路径也用它。

**一个真实踩坑，务必记住**：本仓库当前本地分支叫 `master`，但它的上游跟踪分支是 `origin/main`
（`git status` 显示 `## master...origin/main`，`origin/master` 是另一个早就没更新的远端分支）。
最初直接拿 `git rev-parse --abbrev-ref HEAD`（='master'）去查 GitHub 的 `/commits/master`，
查到的是一个**明显更旧**的 commit，导致 `hasUpdate` 误判——本地分支名和它实际跟踪/pull 的远端分支名可以不一样，
必须用 `@{u}` 查真正的上游，`git pull` 拉的也是这个上游，两者必须一致才不会答非所问。

### 前端（设置面板新增板块「软件更新」）

`SETTINGS_PANES` 追加 `id:'appupdate'`（图标⬆️），对应 `#pane-appupdate`：分支/当前/最新 commit 三行 +
「检查更新」按钮 + 有更新时才显示的「拉取更新并重启」按钮（`confirm()` 二次确认，与本项目其余危险操作一致）+
实时进度框（`UpdateApplyLog`，写法完全照抄 `EngineInstall` 那套 pub-sub，两者语义不同不合并）。
拉取成功后 `waitForAppRestart()`：每 3 秒探一次 `/api/auth/check`，通了就 `location.reload()`，最多等 2 分钟。

**齿轮按钮（`#settingsBtn`，在左侧栏头部，即左上角）右上角加了个红点** `#settingsUpdateDot`：
`startApp()` 里不 `await` 地静默调用 `checkAppUpdateSilently()`（每次启动检测一次，不打断使用，
失败也不提示——留给用户手动点「检查更新」时看具体错误），有更新才点亮。这是用户追加的明确要求
（「这个自动更新功能在左上角设置这里也要有」）——齿轮本来就在左侧栏，加点即满足，没有另建入口。

`?v=` → **20260824a**（app.js/trans.js/styles.css 都改了）。**后端要重启**（新路由 + paths.ts 改动）。

### 一次真实的事故与教训（务必读完）

验证后端逻辑时**直接跑了 `node dist/index.js`**（换了个端口图快），结果 `TaskQueue` 启动时
按 `data/queue_state.json` 里某会话 `status:"running"` 的任务自动恢复执行，
真的 spawn 了一个 `claude.exe --resume <sessionId> --permission-mode bypassPermissions`
在**本仓库真实目录**里无人监管地跑了起来——而且那个任务的 prompt 和当时这轮对话的用户请求**一字不差**，
说明 claude-hub 自己的会话数据里正好有一条同名任务在"运行中"（大概是用户也在 claude-hub 网页端提过同一个请求，
但当时没有真的服务在跑，所以一直卡在 running，直到被我这次误起的测试进程捡起来真正执行）。
`kill %1`（git-bash）没能真正杀掉 Windows 下的子进程树，进程孤儿化后继续跑了几秒才用
`taskkill /PID <pid> /T /F` 补杀掉；事后 `git status` 核对确认没有产生意外改动，算是侥幸。

**结论：以后验证 claude-hub 后端逻辑，禁止直接 `node dist/index.js` 起整个服务**
（哪怕换端口）——那样会把 `data/` 下真实的队列状态当真执行。只用
`node -e "require('./dist/logic_realize/Xxx').Xxx.someMethod().then(console.log)"`
这种直接调用单个 Realize 类方法的方式验证逻辑，不经过 Server/TaskQueue 的启动流程。

### 用「本地故意落后一个 commit」的方式做端到端测试（不碰真实在跑的服务）

用户要求「做一个很小的测试性改动，把版本改大上传，然后再把本地的改回来」来验证检测/拉取真的有效。
做法：
1. 改 `backend/package.json` 的 `version`（1.0.0→1.0.1）、提交、`git push` 到 `origin/main`。
2. **本地** `git reset --hard HEAD^` 退回到 push 前的那个 commit——GitHub 上的提交完好保留，
   本地现在真实地落后远端一个 commit，天然构造出「有新版本」的状态，不用造假数据。
3. 用上面那条"直接调用 Realize 方法"的安全方式跑 `UpdateChecker.check()`，确认 `hasUpdate:true`
   且 current/latest 的 commit 信息都对得上——这就是 `/api/update/check` 会返回给前端的真实数据，
   不需要也不该自己去起一个新服务或者去动那个正在跑的真实进程（会撞见上面那条事故的坎）。
4. 之后正常开发时 `git pull --ff-only` 把本地追回来即可，这一步本身也顺带验证了「拉取」逻辑本身没问题。

**没有做、也不该做的事**：没有自己触发 8970 端口上那个真实进程的重启去看浏览器弹窗——
它不是 pm2 管起来的（`restart.sh` 的 `pm2 restart claude-hub` 对它不生效，新起一个还会跟它抢端口），
而且任何新起的实例都会读同一份 `data/queue_state.json` 去恢复真实任务，跟上面那次事故是同一个坎。
这部分交给用户在浏览器里自己点，或者明确要求"帮我点一下"时再做。

## 2026-08-24（第二十轮）· 顶部版本徽章改成读真实的 package.json 版本号，不再写死

用户发现：顶部一直显示写死的 `V 2.0`，测试更新功能时把 `backend/package.json` 的 `version` 改到了 `1.0.1`
也没变——质问"应该按照这个需要不断增加啊"。原来的 `#appVersion` 就是 HTML 里一个静态字符串，
从来没有任何 JS 去改它，跟软件真实版本完全脱节。

**改法**：新增 `helper/PackageInfo.ts`（纯文件读取 + 缓存：`fs.readFileSync` 本软件自己的
`backend/package.json`，取 `version` 字段，读不到兜底 `'0.0.0'`）。`SettingsStruct.get()` 里
直接 `version: PackageInfo.version()`（helper 可达，不用 throw，跟 `outEndReady`/`platform` 同款写法），
挂进 `AppSettings.version`，随 `/api/settings` 一起下发。前端 `loadSettings()` 拿到后
`$('appVersion').textContent = 'V ' + State.settings.version`；`index.html` 里的静态占位从
写死的 `V&nbsp;2.0` 改成空字符串，登录/启动后一小下就被真实值填上。

**这也是把「版本号该怎么用」这件事钉死成一条约定，以后必须遵守**：
`backend/package.json` 的 `version` 字段从此是**真实展示给用户的版本号**，不是随手写写的元数据——
**以后每次上线一个值得让用户感知到的改动（新功能/明显修复），都要顺手把这个字段往上加一格**
（配合 [[项目本身的更新检测]]：更新检测本身按 git commit sha 判断，跟这个字段无关，
但用户是靠这个字段判断的"到底是不是最新版"，两者必须一起维护，否则又会退回"数字对不上"的老问题）。
这一轮顺手把版本定成 `1.1.0`（新增了这个动态版本徽章本身）。

`app.js?v=` → **20260824b**。**后端要重启**（`SettingsStruct.ts` + 新 helper）。

## 2026-08-25 · 新建会话后聚焦输入框（仅桌面端）

需求：点「新建会话」之后应该自动 focus 到任务输入框，方便直接打字；移动端不需要（软键盘会挡内容，且断点判断依赖屏幕宽度更合理）。

现状排查发现聚焦并不统一：`newSession()` 里「复用已有空会话」的两个分支已有 `$('taskInput').focus()`，`workspace.js` 的 `wsCreateSessionInRoot`（工作台模式选完目录建会话）也有，但**最常用的「非工作台/非收藏夹」正常建会话路径**（`newSession()` 里 `api('/api/session/create')` 之后）反而没有；收藏夹新建草稿会话（`createFavoriteDraftSession`）也没有——纯属遗漏，不是有意为之。

改法（`app.js`）：新增 `focusTaskInputIfDesktop()`（用 `matchMedia('(min-width: 861px)')` 判断，断点与 `styles.css` 里 `@media (max-width: 860px)` 抽屉布局的断点保持一致，没有 `matchMedia` 时默认当桌面处理），替换掉原来所有 `$('taskInput').focus()` 直接调用（含 `app.js` 两处、`workspace.js` 一处），并在此前遗漏的两个创建路径（普通建会话、收藏夹建草稿）里补上调用。`workspace.js` 依赖 `app.js` 全局的注释里也补了这个新函数名。

纯前端静态文件（`app.js`/`workspace.js`），无需重启后端；`index.html` 里两者 `?v=` bump 到 `20260825a`。

## 2026-08-25（续）· 点内联任务 chip 打开管理弹窗后，自动滚动定位到该任务并闪烁高亮一次

需求：任务队列区域的内联紧凑 chip（`.qtask`，`taskEl()` 渲染）点了会打开「任务管理」大弹窗（`QueueModal`/`#queueModal`），
但弹窗打开后停在列表顶部，点的是哪一条完全没有视觉呼应，长列表里得自己找。

**改法（纯前端，`app.js` + `styles.css`）**：
- `openQueueModal()` 加一个可选参数 `focusTaskId`；`taskEl()` 里内联 chip 的点击从裸引用 `openQueueModal`
  改成 `() => openQueueModal(t.id)`，把点的是哪个任务带进去。「+N 更多」按钮和 `toggleQueue()` 走的是不带
  参数的路径（没有具体指向哪条），保持不变。
- 新增 `focusQueueModalTask(taskId)`：`renderQueueModal()` 把行渲染完之后（`requestAnimationFrame` 延一帧，
  确保 `hidden=false` 已生效、弹窗已经真正可见可布局），按 `[data-task="..."]`（`qmRow()` 本来就设了
  `row.dataset.task = t.id`）查到对应行，`scrollIntoView({block:'center', behavior:'smooth'})` 定位，
  再给这一行加 `flash-highlight` class 触发一次背景色闪烁动画（CSS `@keyframes qmRowFlash`，
  用 `color-mix(in srgb, var(--accent) 40%, var(--panel2))` 在浅/深色主题下都能自然过渡），
  `animationend` 后自动摘掉 class；重复点同一条任务时先 `remove` 再强制 `void row.offsetWidth` 重排，
  保证动画能重新触发而不是因为 class 没变化被浏览器忽略。
- 裸函数引用要小心：`addEventListener('click', openQueueModal)` 这种写法一旦函数签名从「无参」
  变成「可选参数」，事件对象会被当成第一个参数传进去——所以所有这类调用点都要显式包一层箭头函数
  （`() => openQueueModal()` 或 `() => openQueueModal(t.id)`），不能留裸引用。

## 2026-08-31 · 收藏夹新建会话目录绑定三连改（无需确认→需确认→保留原有下拉+新增完整引导→发消息即确认）+ 修复 Linux 上历史会话消息读空的根因 bug

**前半段（纯前端 `app.js`，三次迭代，最终版本）**：
1. 最初 `newSession()`/`ensureSession()` 在收藏夹按目录筛选时会**直接自动绑定该目录**创建真会话，
   用户反馈"太鲁莽"——即使筛选了目录也该让用户确认一次，不确认就不该工作，只是把该目录预选为默认项。
2. 改成完全复用左侧「＋」的完整引导流程（`openAddRootGuide`：选已有目录走文件浏览器 / 新建项目走输入名字+选父目录）
   ——结果又改过头了：用户要的是保留原有那个"下拉选已注册目录 + 确认按钮"的简单交互，只是**右边**
   「＋新建目录」按钮才需要走完整引导流程。两种诉求不冲突，是两个入口分别对应两条路径。
3. 最终定型：`favoriteDraftRootPickerEl()` 左边是 `<select>`（列出已注册根目录，默认预选 `preferredRootId`，
   即按目录筛选进来时的那个目录）+「确认」按钮点了才 `bindFavoriteDraftRoot`；右边「＋新建目录」按钮点了才
   `openAddRootGuide(rootId => bindFavoriteDraftRoot(rootId))`，与左侧全局「＋」同一套体验。
   `sel` 的 `change` 事件只把选中值记到 `State.session.pendingRootId`（草稿会话上的临时字段），**不**自动绑定。
4. 最后一个体验点：既然下拉框已经有默认选中值，用户直接在输入框发消息/提交批量任务时，不该再逼用户多点一次
   「确认」——`addTask()`/`submitTasks()` 里补上：`State.session.rootId` 为空但 `pendingRootId` 有值时，
   发送前先 `await bindFavoriteDraftRoot(pendingRootId)` 静默完成绑定，等价于替用户点了那次确认。
   `app.js?v=` bump 到 **20260831a**。

**后半段（后端 bug，跨平台部署踩坑，`backend/src`）**：用户反馈 xfeixie 个人服务器上的 claude-hub 实例
"能正常会话/工作，但点开历史会话消息是空的"。排查（`Explore` agent 定位 + 人工验证）：

- `GET /api/session/get` → `SessionManager._loadMessages` → `NativeSession.importMessages` →
  `ClaudeStoreHelper.sessionFile/readLines`，链路上有个**吞错的 try/catch**（`_loadMessages` 找不到文件/解析
  失败一律安静返回 `[]`），把真正的病因（文件路径错）掩盖成了"历史会话就是空的"。
- 真正病因：`ClaudeStoreHelper.configDir()` 用的是 `os.homedir()`，即**当前 Node 进程自己的家目录**；但
  `RunAsUser.wrap()`（`helper/RunAsUser.ts`）在「Linux + 以 root 身份跑 pm2 + `runAsUserEnabled`（默认值就是
  `isRoot()`，见 `SettingsStruct.ts`）」这个组合下，会把**实际的 claude/codex 子进程**用
  `sudo -H -u claudeuser --` 包一层去跑——子进程的 `$HOME` 因此是 `/home/claudeuser`，而 jsonl 真正落盘在
  `/home/claudeuser/.claude/projects/...`。可后端进程本身仍是 root，`os.homedir()` 返回 `/root`，
  于是**读会话永远读错目录**，配合上面的吞错 catch，表现就是"历史消息一律空"。
  这正是 xfeixie 的服务器们习惯用 root 身份起 pm2（如 galaxy-xfeixie/ai-xfeixie-backend 等）与本项目
  CLAUDE.md 里"Linux 必须用 claudeuser 身份跑 pm2"这条纪律冲突时的典型症状——理论上不该发生，但一旦有人
  图省事直接用 root 起了这个服务，就会精确复现这个 bug。
- **同一根因还偷偷造成了一个更隐蔽的次生 bug**：`ClaudeRunner._buildArgs` 判断要不要 `--resume` 续接，
  靠的也是同一个 `ClaudeStoreHelper.sessionExists`（用 root 的 `os.homedir()` 去 `/root/.claude/...` 找，
  永远找不到）——这意味着**每条消息都会被当成"jsonl 不存在，退回首跑新建"**，claude 每次都新开一个会话，
  聊天历史/上下文在这类部署下实际上从未真正连续过，只是因为 hub 自己另存了消息列表，界面上看不出断裂。
- **修法**（不引入"业务参数污染 helper"的问题：本质是 OS 用户身份，不是业务数据，走显式参数传递，
  不让 helper 反向 import 业务层 Settings）：
  - `helper/RunAsUser.ts` 新增 `isActive(cfg)`（把 `wrap()` 内部那段"是否真的会切用户"的判断抽出来复用）
    和 `homeDirFor(user)`（`getent passwd` 解析目标用户家目录，取不到就退回约定路径 `/home/<user>`）。
  - `logic_struct/SettingsStruct.ts` 新增 `effectiveHomeDir()`：只有 `RunAsUser.isActive()` 为真时才返回
    目标用户家目录，否则 `undefined`（调用方按 `os.homedir()` 原样处理）。
  - `helper/ClaudeStoreHelper.ts` 的 `configDir/settingsFile/projectsRoot/projectDir/sessionFile/
    sessionExists/removeSessionFile/listSessionFiles` 全部加一个可选末位参数 `homeDir?: string`，
    有值就顶替 `os.homedir()`。`logic_struct/NativeSessionStruct.ts` 的 `metas/metaOne/full/importMessages`
    同步加 `homeDir?` 并透传给 `ClaudeStoreHelper`。
  - 调用方（`logic_realize/SessionManager.ts`、`ClaudeRunner.ts`、`CommandRunner.ts`、`EngineConfig.ts`、
    `TraceStore.ts`）在调用这些方法时统一传入 `Settings.effectiveHomeDir()`。Windows / 未启用 runAsUser /
    非 root 场景下该值恒为 `undefined`，行为与改动前完全一致，不影响本机开发。
  - `EngineConfig._syncClaudeSettings` 顺手一并修了：写 `~/.claude/settings.json` 的 env 段（切换服务商用）
    同样受这个 bug 影响——root 身份下会写到 `/root/.claude/settings.json`，实际跑的 claude 进程根本读不到，
    "切换服务商不生效"很可能也是同一根因的另一种表现，虽然本轮没有专门收到这条反馈。
  - 后端版本号 `backend/package.json` bump 到 **1.1.1**，需要 `bash restart.sh` 重新编译重启（Linux 侧
    尤其是那些误用 root 起 pm2 的实例，重启后历史会话应该能正常读到，--resume 续接也会开始真正生效）。

纯前端静态文件（`app.js`/`styles.css`/`index.html`），无需重启后端；`?v=` bump 到 **20260825b**。

## 外部消息注入 API + 会话右上角 🛰 齿轮（2026-09-02）供第三方系统接入（如 bug_tracker）⭐ 后端需重启
- 起因：用户在 bug_tracker 建 confirm 条目问同事问题，同事在企微免登录页回复后，本地 clootee 收不到通知，只能靠 [dev] 定期拉取。想做成闭环：外部系统回复来了，能自动推成本会话的一条用户消息。
- 设计原则：clootee 完全不知道 bug_tracker 的存在，只单纯开放一个通用接口，谁都能接——松耦合。
- 新增 `models/Types.ts`：Root 加 `externalApiOpen?`（undefined 视为 true，默认开放）、`externalApiToken?`。
- 新增 `logic_struct/RootManagerStruct.ts`：`ensureExternalApi`（查询，顺带补默认值+生成 token）、`setExternalApiOpen`、`resetExternalApiToken`。全是 JsonStore 直写，无 throw。
- 新增 `logic_struct/ExternalInboxStruct.ts` + `logic_realize/ExternalInbox.ts`：`postMessage(rootId, token, sessionId, content)`，校验根目录开放状态+token 后调 `TaskQueue.addTasks`，复用现有发消息链路，等价于用户亲自发了一条消息。
- `server/Server.ts`：`POST /api/external/message` 注册在登录鉴权中间件**之前**（外部调用方鉴权走 rootId 自己的 token，不走登录 token）；另加 `GET/POST /api/root/external`、`POST /api/root/external/reset-token`（走登录鉴权，供前端齿轮面板用）。
- 前端：会话顶部工具条新增 🛰 按钮（`extApiBtn`），点开弹窗 `#extApiOverlay`——开关（默认勾选=开放）、token（复制/重置）、curl 调用示例（照抄即用）。文案全部走 trans.js 的 T()，符合 X1.5 多语言规范。
- 联动：bug_tracker 那边建 confirm 条目时可选带 `bridge:{baseUrl,rootId,sessionId,token}`，确认人回复后自动 POST 到这里；见 bug_tracker mem.md。
- ⚠️ 待办：本地未重启验证，改动后端 → 需 `npm run build`（已跑通 tsc --noEmit + build.js 无报错）+ 重启 pm2 claude-hub 才生效；前端已 bump `app.js/trans.js` 的 `?v=` 到 20260902a。

## 右下角 `/` 命令菜单扩展：/goal + /skill，斜杠"前缀标记"机制（2026-09-02）纯前端
- 起因：用户希望在发送按钮左侧的 `/` 命令菜单（`cmdMenuBtn`/`cmdMenu`）里加常用命令（先做 /goal 和 /skill），
  但明确担心"选中命令后把输入框已经打好的文字冲掉"。
- 设计：新增第三种命令类型 **'prefix'**（区别于原有 'exec' 立即执行、新增 'group' 二级展开）——点击后
  **不触碰输入框内容**，只是把 `SlashPrefix.cmd` 置为该命令、渲染成输入框上方一个可关闭的胶囊
  （`#slashPrefixPill`，样式类比已有的 `.quick-tag` 前缀标签机制，二者可同时叠加），发送时才在
  `addTask()` 里拼到正文最前面（`applySlashPrefix` → `applyQuickPrefix`），发送成功后自动清除（单次
  使用），发送失败则保留胶囊方便重试。点 ✕ 可随时手动取消。
- `/goal` 是 'prefix' 叶子；`/skill` 是 'group'，二级列表硬编码 `SKILL_LIST`（对齐当前会话可用 skill
  名：dataviz/update-config/keybindings-help/code-review/simplify/fewer-permission-prompts/loop/
  schedule/claude-api/run/init/security-review），点进去每个 skill 名同样按 'prefix' 处理。
  后续再加常用命令，只需往 `CMD_ITEMS` 加一项 `{id, slash, type}`，'prefix' 类型无需额外接后端。
- 涉及文件：`app.js`（CMD_ITEMS/buildCmdItemRow/setSlashPrefix/applySlashPrefix 等，都在原"斜杠命令"注释块
  内）、`index.html`（新增 `#slashPrefixPill`）、`styles.css`（`.slash-prefix-pill`/`.cmd-back`/
  `.cmd-item-arrow`）、`trans.js`（cmd_goal_*/cmd_skill_* 中英文案）。
  注意：`buildCmdItemRow` 用 `DICT['cmd_'+id+'_name'] != null` 判断有没有配文案，没配（如各 skill 叶子）就
  只显示命令本身，不调 `T()` 兜底——因为 `T()` 缺 key 时会直接原样吐出 key 字符串，会露馅。
- 纯前端静态文件，无需重启后端；`?v=` bump 到 **20260902b**（`app.js`/`trans.js`/`styles.css`）。


## 2026-09-04 模型候选补 Fable 5.1
- 现象：终端 claude 能选 Fable 5.1，clootee 下拉看不到。
- 原因：原版订阅无模型列表接口，候选来自 ModelManagerStruct.CLAUDE_BUILTIN_MODELS 硬编码，只有 claude-fable-5。
- 修复：加 claude-fable-5-1。注意候选会缓存在 EngineConfig（c.models），前端需重新点「检测可用模型」才刷新。
- 另：本机 claude code 已从 2.1.241 升到 2.1.260。

## 2026-09-07 排查"服务动不动被杀"：不是被人 kill，是本机关机/断电
- 事件日志（System 1074/41/6008）：09-02 11:03 Windows Update 计划重启；09-02 23:04 和 09-07 15:02 都是 TRIO\plxiao 在开始菜单点「关闭电源」；09-04 18:17 无 1074 的非正常断电（BugcheckCode=0，非蓝屏）。
- pm2 里各 app 15:00~15:02 的退出码 0xC000013A(Ctrl-C) / 0xC000026B(会话注销) 就是关机时系统发的信号，不是别的进程 kill。
- 结构性问题：本机 claude-hub 已不在 pm2 里，是双击 Windows_Start.bat 起的（cmd.exe ← explorer，session 1）；pm2 daemon 也是普通用户进程；没有任何服务/计划任务/自启项。所以每次关机/注销后没人拉起来，且 15:24 的 dump.pm2 已被覆盖成只剩 connector-hub-backend，`pm2 resurrect` 也救不回其他 app。
- 建议：注册「登录时」计划任务跑 Windows_Start.bat（或 pm2 save + 登录时 pm2 resurrect），不要靠手动双击。

## 2026-09-07 服务中断取证：新增 lifecycle.log（端口占用者点名 + 心跳 + 退出原因）
- 背景：用户反馈"页面动不动打不开"。先查系统事件日志确认今天几次是关机/断电（09-04 18:17 无 1074 的掉电，
  09-02 11:03 Windows Update 重启，09-02 23:04 / 09-07 15:02 用户手动关机）。用户表示还有别的中断，要求加日志。
- 新增 `helper/PortOwner.ts`（纯工具）：`of/describe/isOwnedBy`，查 TCP 端口 LISTEN 的占用进程并展开
  pid/进程名/属主/启动时间/命令行。Windows 走 netstat -ano + tasklist + PowerShell CIM（实测 ~1.1s），
  Linux/macOS 走 ss/lsof + ps。全部 execSync 带 4s 超时，任何失败都返回空，绝不把主流程搞挂。
- 新增 `logic_struct/LifeGuardStruct.ts` + `logic_realize/LifeGuard.ts`：install/reportBindFailure/
  reportShutdown/beat。60s 心跳（HEARTBEAT_MS 环境变量可调，测试用）+ 心跳时校验端口是否还在自己名下，
  易主就点名新占用者。
- `Logger.life()` + `LogConfig.LIFECYCLE_PATH` → `data/logs/lifecycle.log`，同时也进 app.log。
  不受 MIN_LEVEL/MODULE_FILTER 影响，永远留底。
- ⚠️ 关键坑：`server.on('error')` 必须注册在 `new WebSocketServer({server})` **之前**。ws 会往 server 上挂
  一个「把 error 转发给 wss」的监听器，wss 没人接 error 就当场抛成 uncaughtException，排它后面的处理器
  永远轮不到——第一版就是这么失效的。同时给 wss 也加了 error 监听。
- 日志怎么读：`▶ 服务启动` 之前若没有 `⏹ 服务退出`，说明上次是被强杀/掉电/蓝屏（Windows 上 TerminateProcess
  不走信号处理器，实测确认）；最后一条 `♥ 存活` 就是服务最后活着的时刻，精确到 1 分钟内。
  `❌ 端口绑定失败` 后面紧跟的就是抢端口的那个进程的完整命令行。
- ⚠️ 本机 claude-hub 不是 pm2 起的，是 Windows_Start.bat（out_end/node + dist\index.js），且本会话很可能
  就跑在它上面，故未自动重启，需用户自行重启才生效。
