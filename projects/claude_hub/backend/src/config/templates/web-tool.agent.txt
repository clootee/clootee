# AGENTS 指南 · 网页工具（TypeScript）

面向自动化编码代理（Codex / Claude 等）的协作约定，与本目录 `CLAUDE.md` 一致，二者请同步维护。

## 开始前 / 结束后
- 开始任务前先读根目录 `mem.md`（记忆文件）；完成后把进展、决策、坑写回 `mem.md`。

## 硬性约定
- 语言：全部 **TypeScript**；样式独立成 `.css` 文件；Vite 构建。
- **启动与部署**：服务一律 **pm2** 启动（根目录 `ecosystem.config.js` + `pm2 save`），禁止用 `npm run dev` 当正式服务。**端口先检测再用**（`net.createServer()` 捕 `EADDRINUSE`；Windows `netstat -ano | findstr :<port>`、Linux `lsof -i:<port>`），被占用则顺延到下一个可用端口或报错退出并说明是谁占的，**禁止杀别人的进程**；实际端口打印到日志并写入 `.runtime-port`。**每次启动默认先 `npm run build` 走产物**（pm2 跑 `dist/` 不跑源码），构建先进临时目录成功后原子替换 `dist/`，失败保留旧产物继续服务，**不影响上一个正在使用的版本**。`npm run start` = 端口自检 → build → `pm2 restart <app> --update-env`。完成后主动告知需重启的服务与命令。
- **弹窗**：禁止点击遮罩/旁边自动关闭，必须点 `✕` 或明确按钮才关；卡片 `max-height: 85vh`、只有内容区滚动，标题栏与底部操作栏 sticky，**关闭/提交按钮永远不用滚动就可见可点**。
- **双主题（明/暗）+ 右上角切换**：**字体颜色最多 6 种、背景颜色最多 6 种（含按钮）**，全部 CSS 变量，**只允许定义在 `theme-light.css` 与 `theme-dark.css` 两个文件**（同名变量两套取值，切 `data-theme`）；**其他任何地方（组件 css / 内联 style / ts）禁止写死字体色与背景色**，只能 `var(--text-n)` / `var(--bg-n)`；主题持久化、切换即时生效。响应式适配桌面/手机。
- **禁止全局「当前 xxx」状态**：不做「当前项目/当前会话」这类全局单例；上下文由浏览器窗口自带（URL query/hash + `sessionStorage`，不用共享的 `localStorage`）。验收标准：**两个浏览器窗口同时打开可独立工作、互不干扰**；后端按请求参数取上下文，不得在服务端记「当前项目」。
- **国际化（严格格式）**：`src/i18n/trans.json` 唯一数据源，**一个 key 一条记录、zh 与 en 写在同一条里**（`"btn.switchModel": { "zh": "切换模型", "en": "Switch Model" }`）；key 小写点分、按字母序；缺任一语言即 bug；加语言只加字段、不新增文件；变量用 `{name}` 占位符，禁止字符串拼接。`src/i18n/trans.ts` 是唯一出口，导出 `Lang` / `TransKey`（由 JSON 推导，key 写错编译期报错）/ `t(key, params?)` / `getLang()` / `setLang()`（持久化 + 派发 `langchange`）；`tsconfig.json` 开 `resolveJsonModule`。禁止裸文案字面量、禁止 `if (lang === 'en')`、禁止绕过 trans.ts 直接读 json；切换语言即时重渲染。
- 松耦合分层（UI / 逻辑 / 数据），复用优先，统一 Logger 与错误处理，不裸用 `console.log`。
- 入口校验非法输入，错误信息含函数名与非法值。
- 跨平台差异用运行时判断处理，不写死单一平台。
- **命令执行效率**：不涉及下载的命令**超时一律 ≤ 10 秒**（很多命令 0.1 秒就返回，挂几分钟是无谓等待），确实超时了才逐步调大；长任务用**分阶段执行 + 每阶段短超时（≤10 秒）**轮询进度，避免静默卡死。

## 完成标准
- 关键流程本地走通、无报错；按项目约定提交。
