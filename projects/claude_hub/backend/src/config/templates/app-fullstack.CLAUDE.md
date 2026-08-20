# 开发应用项目（TypeScript 全栈 · 前后端 + SQLite）

> 本文件由 Clootee 模板生成，是给 AI 与协作者的开发约定。可按需增删。

## 记忆（最重要）
- 项目根目录维护一个 `mem.md` 记忆文件。**每次开始任务前先读 `mem.md`，任务完成后把关键进展/决策/坑追加进去**（写清「改了什么、为什么、验证结果」）。
- 记忆只记「不看代码就想不起来的东西」：需求背景、方案取舍、踩过的坑；不记代码本身能表达的结构。

## 技术栈（强制）
- **前后端都用 TypeScript**，不写裸 JavaScript 业务逻辑（仅「TS 还没装好就要跑」的引导脚本可例外用 `.js`）。
- **必须是前后端两端的应用**，不做「只有页面、数据存 localStorage」的假应用：
  - `backend/`：Node + Express（或同类），只对外暴露 HTTP JSON 接口，端口自检后启动。
  - `frontend/`：HTML + TS，用 Vite 构建；样式**全部独立成 `.css` 文件**，不写大段内联样式。
  - 两端各自独立 `package.json` 与 `tsconfig.json`，**前端不 import 后端源码**，共享的类型放 `shared/types.ts` 由两边各自引用。
- **数据库固定用 SQLite**（`better-sqlite3`，同步 API，省掉大半异步坑），数据库文件放 `data/app.db`，**`data/` 必须进 `.gitignore`**。

## 模块化开发（强制：一个模块 = 一个职责 = 一对文件）
后端 `backend/src/` 固定分五层，**目录即职责，禁止跨层乱调**：

```
backend/src/
  config/         纯配置与常量，零逻辑（端口、路径、限额、枚举）
  helper/         通用工具，与业务无关（Sqlite/Logger/HttpJson/Ids/Hash…），可被任何层调用
  logic_struct/   调度骨架：入口校验、流程编排、调用 helper 与 realize
  logic_realize/  实现细节：真正干活的代码（SQL、算法、外部 API）
  server/         HTTP 路由：只做「取参 → 调 logic → 回 JSON」，不写业务
  index.ts        启动入口
```

- **一个业务模块 = `logic_struct/XxxStruct.ts` + `logic_realize/Xxx.ts` 一对**：`Xxx extends XxxStruct`，对外只暴露 `Xxx`。
  骨架里放校验与编排，实现里放细节；**骨架层禁止出现 try/catch、循环、正则、`JSON.parse`、裸 `fetch`、裸 SQL**——这些一律下沉到 `logic_realize` 或 `helper`。
- **模块之间只通过导出的静态方法通信**，禁止一个模块 import 另一个模块的私有函数、禁止绕过模块直接读它的表。
  每张表**只有一个模块能写**（谁拥有谁负责），别的模块要改就调它的方法。
- **单文件 300 行为软上限、500 行为硬上限**。超了就按职责拆新模块，不许靠加注释分段糊过去。
- **禁止上帝文件**：一个函数不允许既画界面、又发请求、又拼 SQL。新增功能优先「加一个模块」，而不是「往老文件里再塞 200 行」。
- 前端 `frontend/src/` 同样分层：`ui/`（渲染与事件）、`logic/`（业务状态与流程）、`api/`（唯一的后端调用出口，所有 `fetch` 都在这里）、`i18n/`、`styles/`。
  **`ui/` 里禁止出现 `fetch`**，一律经 `api/`；`api/` 里禁止写业务判断。
- **复用优先**：写新 helper 前先搜一遍现有 `helper/`，能复用或轻微改造的绝不重造。

## 数据库（SQLite，强制）
- **唯一出口 `helper/Sqlite.ts`**：打开连接（单例）、开 `PRAGMA journal_mode = WAL`、`foreign_keys = ON`、暴露 `db()` / `tx(fn)`。
  **业务代码禁止自己 `new Database(...)`**。
- **表结构集中在 `logic_realize/Migrations.ts`**，用「版本号 + 递增迁移」管理，靠 `PRAGMA user_version` 记录当前版本，启动时自动补齐到最新：
  ```ts
  const STEPS: Array<(d: DB) => void> = [
    (d) => d.exec(`CREATE TABLE IF NOT EXISTS user(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL)`),
    (d) => d.exec(`ALTER TABLE user ADD COLUMN email TEXT`), // 新需求就往后追加一步
  ];
  ```
- **迁移只增不改：绝对不允许破坏已有数据**。加字段用 `ALTER TABLE ... ADD COLUMN`（给默认值或允许 NULL）；
  要改列类型/改名，走「建新表 → 搬数据 → 换名」三步，**禁止 `DROP TABLE` 已有业务表**、禁止靠删库重建来"对齐"结构。
- **SQL 只允许出现在 `logic_realize/`**，`server/` 与前端一行 SQL 都不能有。
- **一律用参数化查询**（`?` 占位 + `db.prepare().run(...)`），**禁止字符串拼 SQL**（注入 + 引号地狱）。
- 多写操作用一个事务包起来（`tx(fn)`），中途失败整体回滚，不留半截数据。
- 时间统一存**毫秒时间戳 INTEGER**（`Date.now()`），不存本地格式化字符串；布尔存 `0/1`。
- 每张表必须有主键与 `created_at`；高频查询条件要建索引，并在迁移里一起建。
- 备份：约定 `npm run db:backup` 把 `data/app.db` 复制成 `data/backup/app-<时间戳>.db`；**任何有风险的结构调整前先备份**。

## 启动与部署（强制：pm2 + 端口自检 + 先 build 再启动）
- **一律用 pm2 启动服务**，禁止拿 `npm run dev` 当正式服务跑。根目录放 `ecosystem.config.js`，应用名固定（如 `<项目名>-server`），写清 `cwd` / `script` / `env`；`pm2 save` 保证机器重启后自动拉起。
- **端口必须先检测再用**，禁止盲目启动导致端口冲突、更禁止随手杀掉占用端口的别人的进程：
  - 代码里探测：`net.createServer().listen(port)` 捕获 `EADDRINUSE`；命令行排查：Windows `netstat -ano | findstr :<port>`，Linux/macOS `lsof -i:<port>`。
  - 被占用时的行为二选一并明确告知用户：**顺延到下一个可用端口**，或**报错退出并打印是谁占用了**。
  - 实际使用的端口要打印到日志并写入 `.runtime-port` 之类的文件，方便前端与用户获取。
- **每次启动默认走构建产物**（后端 `tsc → dist/`，前端 `vite build → dist/`），pm2 跑的是 build 结果而不是源码热跑。
  - 构建**先输出到临时目录，成功后再原子替换 `dist/`**；build 失败就保留旧 `dist/` 继续服务——保证开发中途的半成品**不影响上一个正在使用的版本**。
  - 约定 `npm run start` = 端口自检 → 后端 build → 前端 build → `pm2 restart <app> --update-env`（应用不存在则 `pm2 start ecosystem.config.js`）。
- **数据库迁移在服务启动时自动执行**（`index.ts` 里先 `Migrations.up()` 再 `listen`），不需要用户手工跑 SQL。
- 每次开发完主动告诉用户**哪些服务需要重启、具体命令是什么**。
- 跨平台：脚本里进程/路径/shell 差异用 `process.platform` 运行时判断，不写死单一平台。

## 接口约定（前后端唯一契约）
- 所有接口写在根目录 `connect.md`，**这是唯一权威文档**：路径、方法、入参、返回、错误码各一份，禁止在别处复制粘贴。
- 统一返回信封：成功 `{ ok: true, data }`，失败 `{ ok: false, code, msg }`；**HTTP 状态码照实给**（400 参数错 / 401 未登录 / 500 内部错），不要一律 200 里塞错误。
- 报错文案**不在后端写死中文**：后端只回 `code`，前端用 `t('err.' + code)` 翻译，保证双语。
- 接口改动必须同步改 `connect.md` 与 `shared/types.ts`，两边类型对不上就是 bug。

## UI 规范（强制）
1. **弹窗禁止「点旁边就关」**：任何弹窗都不允许点击遮罩/空白处自动关闭，必须点 `✕` 或明确的「取消 / 关闭 / 确定」按钮才关闭，避免误触丢失已填内容。（`Esc` 可选支持，但有未保存内容时要二次确认。）
2. **操作按钮恒可见**：弹窗内容再长，关闭与提交按钮也**不需要滚动就能看到并点到**——卡片 `max-height: 85vh`，只让内容区 `overflow-y: auto`，标题栏与底部操作栏 sticky 固定在卡片上下沿。
3. **双主题（明/暗）+ 右上角切换，全局配色集中管理**：
   - **字体颜色最多 6 种、背景颜色最多 6 种**（都**包含按钮**在内），全部以 CSS 变量定义，如 `--text-1..6` / `--bg-1..6`。
   - 这些颜色**只允许定义在 `theme-light.css` 与 `theme-dark.css` 两个文件里**（同名变量、两套取值），切换主题＝切换 `<html data-theme="light|dark">`。
   - **其他任何地方一律禁止写死字体颜色与背景色**（组件 css、内联 style、ts 里都不行），只能 `var(--text-2)` / `var(--bg-3)` 这样引用。改一处全站生效，保证全局配色一致。
   - 主题选择持久化，右上角切换即时生效，不需要刷新。
4. **响应式**：同一套界面在桌面与手机都可用；弹性布局/断点适配，不写死像素宽度。
5. 交互要有即时反馈（加载中 / 成功 / 失败 状态），错误要给用户可读的提示。

## 状态隔离（禁止全局「当前 xxx」）
- 除非明确要求，**禁止「当前项目 / 当前会话 / 当前用户视图」这类全局单例状态**。
- 上下文一律由**浏览器窗口自己携带**：放在 URL（query / hash / path）里，配合 `sessionStorage`（**不是**全窗口共享的 `localStorage`），连贯的工作信息从窗口自带的信息还原。
- 硬性验收：**同时打开两个浏览器窗口，两边各自独立工作、互不干扰**——一个窗口切换项目绝不影响另一个窗口。
- 后端同理：按请求参数取上下文，**不得在服务端记「当前项目」**这类会话外的全局态。

## 国际化（强制：默认双语，单文件双语，格式严格遵守）
**默认就是中英双语，不是"以后再加"**。一个 key 一条记录，所有语言写在同一条里——改一句文案只动一个地方，禁止 zh.json / en.json 两份文件对照着找。

【数据源】`src/i18n/trans.json`（前后端各一份，格式相同）：
```json
{
  "btn.save":  { "zh": "保存",        "en": "Save" },
  "msg.saved": { "zh": "已保存 {n} 项", "en": "Saved {n} items" }
}
```
- key 全小写、`模块.用途` 点分（`btn.save`、`menu.settings.title`），**禁止中文或整句英文当 key**；按字母序维护。
- 每条**必须同时有 `zh` 和 `en`**，缺一个即 bug；扩展语言只加字段（如 `"ja"`），**永不新增文件**。
- 变量统一 `{name}` 占位符由 `t()` 注入，**禁止字符串拼接文案**（拼接会让别的语言语序错乱）。

【唯一出口】`src/i18n/trans.ts`（薄封装，不放业务）：
```ts
import raw from './trans.json';
export type Lang = keyof (typeof raw)[keyof typeof raw]; // 'zh' | 'en' | ...
export type TransKey = keyof typeof raw;                 // key 写错 → 编译期报错
let lang: Lang = (localStorage.getItem('lang') as Lang) || 'zh';
export function getLang(): Lang { return lang; }
export function setLang(next: Lang): void {
  if (!next) throw new Error(`setLang: invalid lang=${next}`);
  lang = next;
  localStorage.setItem('lang', next);
  window.dispatchEvent(new CustomEvent('langchange'));
}
export function t(key: TransKey, params?: Record<string, string | number>): string {
  const e = raw[key];
  if (!e) throw new Error(`t: unknown key=${String(key)}`);
  const s = e[lang] ?? e.zh;
  return params ? s.replace(/\{(\w+)\}/g, (_m, k) => String(params[k] ?? `{${k}}`)) : s;
}
```
（`tsconfig.json` 需开启 `"resolveJsonModule": true`；后端同理，只是把 `localStorage` 换成配置或 `Accept-Language` 请求头取语言。）

【禁令】`.ts` / `.html` 里禁止任何面向用户的中英文字面量，一律 `t('key')`；禁止 `if (lang === 'en')` 之类语言分支；禁止绕过 trans.ts 直接读 json；切换语言必须监听 `langchange` 即时重渲染，不许让用户刷新页面。默认语言 zh，可配置。
**数据库里存的用户数据不翻译**（那是内容不是文案）；只有界面文案与错误码走 `t()`。

## 命令执行与长任务（效率）
- 执行命令必须设**尽量短的超时**：**不涉及下载的命令，超时一律不超过 10 秒**——很多命令 0.1 秒就返回，挂几分钟纯属无谓等待。
- **只有确实收到超时反馈才逐步调大**；下载类操作可例外放宽。
- 长任务禁止一条命令闷跑到底：采用**分阶段执行 + 每阶段短超时（通常 ≤ 10 秒）**轮询进度，避免静默卡死却无从察觉。

## 工程原则
- **松耦合、高内聚**：UI 渲染、业务逻辑、数据访问分层，彼此通过清晰接口通信，避免一个函数既画界面又发请求又拼 SQL。
- **统一日志与错误处理**：不散落 `console.log`；用一个 Logger 封装（带开关/级别），catch 统一交给一个错误处理入口，方便日后接告警。
- 每个对外方法入口校验非法输入，错误信息带上「方法名 + 非法值」，便于定位。
- 不写"以防万一"的代码：没有当前需求的配置项、抽象层、兜底分支，一律不加。

## 交付
- 自测清单：前端关键流程走一遍 → 后端接口用真实请求验一遍 → **重启服务确认迁移不丢数据**（拿备份库对一下行数）。
- 明确告知用户要重启哪些服务、跑什么命令；没验证的部分如实说明「已改，未验证」。
- 每次改动完成后按项目约定提交代码。
