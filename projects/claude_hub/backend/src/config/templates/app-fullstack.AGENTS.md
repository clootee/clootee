# AGENTS 指南 · 开发应用（TypeScript 全栈 · 前后端 + SQLite）

面向自动化编码代理（Codex / Claude 等）的协作约定，与本目录 `CLAUDE.md` 一致，二者请同步维护。

## 开始前 / 结束后
- 开始任务前先读根目录 `mem.md`（记忆文件）与 `connect.md`（接口权威文档）；完成后把进展、决策、坑写回 `mem.md`。

## 硬性约定
- **技术栈**：前后端**都是 TypeScript**，不写裸 JS 业务逻辑。**必须前后端两端齐全**：`backend/`（Node + Express，只出 HTTP JSON 接口）+ `frontend/`（HTML + TS + Vite，样式独立成 `.css`）；两端各自 `package.json` / `tsconfig.json`，**前端不 import 后端源码**，共享类型放 `shared/types.ts`。不做「只有页面、数据存 localStorage」的假应用。
- **数据库固定 SQLite**（`better-sqlite3`），库文件 `data/app.db`，`data/` 进 `.gitignore`。唯一出口 `helper/Sqlite.ts`（单例连接 + `WAL` + `foreign_keys=ON` + `db()` / `tx(fn)`），**业务代码禁止自己 `new Database()`**。
- **模块化（最重要）**：后端固定五层 `config/`（纯配置零逻辑）、`helper/`（与业务无关的通用工具）、`logic_struct/`（调度骨架：校验 + 编排）、`logic_realize/`（实现细节）、`server/`（只做取参→调 logic→回 JSON，不写业务）。
  **一个业务模块 = `logic_struct/XxxStruct.ts` + `logic_realize/Xxx.ts` 一对**（`Xxx extends XxxStruct`，对外只暴露 `Xxx`）；**骨架层禁止 try/catch、循环、正则、`JSON.parse`、裸 `fetch`、裸 SQL**，一律下沉。
  模块间只通过导出的静态方法通信，**禁止 import 别人的私有函数、禁止绕过模块直接读它的表**；**每张表只有一个模块能写**。
  **单文件 300 行软上限 / 500 行硬上限**，超了拆模块，不靠注释分段糊过去。新功能优先「加一个模块」，不是往老文件塞 200 行。
  前端同样分层：`ui/`（渲染与事件，**禁止出现 `fetch`**）、`logic/`、`api/`（唯一后端调用出口，所有 `fetch` 都在这里，不写业务判断）、`i18n/`、`styles/`。
- **SQL 规矩**：SQL **只允许出现在 `logic_realize/`**（`server/` 与前端一行都不能有）；**一律参数化查询**（`?` + `prepare().run()`），禁止字符串拼 SQL；多写操作包一个 `tx(fn)` 事务；时间存**毫秒时间戳 INTEGER**，布尔存 `0/1`；每张表有主键与 `created_at`，高频查询条件建索引。
- **迁移只增不改，绝不破坏已有数据**：表结构集中在 `logic_realize/Migrations.ts`，`PRAGMA user_version` + 递增 `STEPS[]`，服务启动时（`listen` 之前）自动补齐。加字段用 `ALTER TABLE ADD COLUMN`（给默认值或允许 NULL）；改列类型/改名走「建新表→搬数据→换名」；**禁止 `DROP TABLE` 已有业务表、禁止删库重建来"对齐"结构**。有风险的结构调整前先 `npm run db:backup`。
- **启动与部署**：服务一律 **pm2** 启动（根目录 `ecosystem.config.js` + `pm2 save`），禁止用 `npm run dev` 当正式服务。**端口先检测再用**（`net.createServer()` 捕 `EADDRINUSE`；Windows `netstat -ano | findstr :<port>`、Linux `lsof -i:<port>`），被占用则顺延到下一个可用端口或报错退出并说明是谁占的，**禁止杀别人的进程**；实际端口打印到日志并写入 `.runtime-port`。**每次启动默认走构建产物**（后端 `tsc → dist/`，前端 `vite build → dist/`），构建先进临时目录成功后原子替换，失败保留旧产物继续服务，**不影响上一个正在使用的版本**。`npm run start` = 端口自检 → 后端 build → 前端 build → `pm2 restart <app> --update-env`。完成后主动告知需重启的服务与命令。
- **接口契约**：所有接口写在根目录 `connect.md`（唯一权威文档，禁止别处复制）。统一信封：成功 `{ ok: true, data }`、失败 `{ ok: false, code, msg }`，**HTTP 状态码照实给**（400/401/500），不要一律 200 里塞错误。**后端不写死中文报错**，只回 `code`，前端 `t('err.' + code)` 翻译。接口改动同步改 `connect.md` 与 `shared/types.ts`。
- **弹窗**：禁止点击遮罩/旁边自动关闭，必须点 `✕` 或明确按钮才关；卡片 `max-height: 85vh`、只有内容区滚动，标题栏与底部操作栏 sticky，**关闭/提交按钮永远不用滚动就可见可点**。
- **双主题（明/暗）+ 右上角切换**：**字体颜色最多 6 种、背景颜色最多 6 种（含按钮）**，全部 CSS 变量，**只允许定义在 `theme-light.css` 与 `theme-dark.css` 两个文件**（同名变量两套取值，切 `data-theme`）；**其他任何地方（组件 css / 内联 style / ts）禁止写死字体色与背景色**，只能 `var(--text-n)` / `var(--bg-n)`；主题持久化、切换即时生效。响应式适配桌面/手机。
- **禁止全局「当前 xxx」状态**：不做「当前项目/当前会话」这类全局单例；上下文由浏览器窗口自带（URL query/hash + `sessionStorage`，不用共享的 `localStorage`）。验收标准：**两个浏览器窗口同时打开可独立工作、互不干扰**；后端按请求参数取上下文，不得在服务端记「当前项目」。
- **国际化（默认双语，严格格式）**：`src/i18n/trans.json` 唯一数据源（前后端各一份，格式相同），**一个 key 一条记录、zh 与 en 写在同一条里**（`"btn.save": { "zh": "保存", "en": "Save" }`）；key 小写点分、按字母序；缺任一语言即 bug；加语言只加字段、不新增文件；变量用 `{name}` 占位符，禁止字符串拼接。`src/i18n/trans.ts` 是唯一出口，导出 `Lang` / `TransKey`（由 JSON 推导，key 写错编译期报错）/ `t(key, params?)` / `getLang()` / `setLang()`（持久化 + 派发 `langchange`）；`tsconfig.json` 开 `resolveJsonModule`；后端取语言用配置或 `Accept-Language`。禁止裸文案字面量、禁止 `if (lang === 'en')`、禁止绕过 trans.ts 直接读 json；切换语言即时重渲染。**数据库里的用户数据不翻译**，只有界面文案与错误码走 `t()`。
- 松耦合分层（UI / 逻辑 / 数据），复用优先（写新 helper 前先搜现有 `helper/`），统一 Logger 与错误处理，不裸用 `console.log`。
- 入口校验非法输入，错误信息含方法名与非法值。不写"以防万一"的配置项/抽象层/兜底分支。
- 跨平台差异用 `process.platform` 运行时判断，不写死单一平台。
- **命令执行效率**：不涉及下载的命令**超时一律 ≤ 10 秒**（很多命令 0.1 秒就返回，挂几分钟是无谓等待），确实超时了才逐步调大；长任务用**分阶段执行 + 每阶段短超时（≤10 秒）**轮询进度，避免静默卡死。

## 完成标准
- 前端关键流程本地走通、后端接口用真实请求验过、**重启服务确认迁移不丢数据**（与备份库对行数），无报错；按项目约定提交。
