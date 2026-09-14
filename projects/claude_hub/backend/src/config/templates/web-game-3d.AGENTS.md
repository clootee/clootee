# AGENTS 指南 · 网页游戏 3D（TS + WebGL）

面向自动化编码代理的协作约定，与本目录 `CLAUDE.md` 一致，请同步维护。

## 开始前 / 结束后
- 任务前读根目录 `mem.md`；完成后把进展、技术选型、坑写回 `mem.md`。

## 硬性约定
- 语言：**全部 TypeScript**（`strict` + `resolveJsonModule`）；WebGL 渲染（推荐 three.js 等成熟库）；样式独立 `.css`；Vite 打包。
- **启动与部署**：服务（预览服务器/静态托管/资源与排行榜后端）一律 **pm2** 启动（根目录 `ecosystem.config.js` + `pm2 save`），禁止用 `npm run dev` 当正式服务。**端口先检测再用**（`net.createServer()` 捕 `EADDRINUSE`；Windows `netstat -ano | findstr :<port>`、Linux `lsof -i:<port>`），被占用则顺延到下一个可用端口或报错退出并说明是谁占的，**禁止杀别人的进程**；实际端口打印到日志并写入 `.runtime-port`。**每次启动默认先 `npm run build` 走产物**（pm2 跑 `dist/` 不跑源码），构建先进临时目录、成功后原子替换 `dist/`（3D 资源大，尤其不能出现半份模型/贴图），失败保留旧产物继续服务，**不影响上一个正在玩的版本**。`npm run start` = 端口自检 → build → `pm2 restart <app> --update-env`。完成后主动告知需重启的服务与命令，手机联调给出局域网 IP + 实际端口。
- 分层松耦合：渲染层 / 逻辑层（ECS 优先，`update(dt)`）/ 输入层（映射语义动作）/ 资源层（异步加载缓存）解耦。逻辑不直接摸渲染细节。
- **双端同一份代码**：电脑键盘（WASD/方向键/空格，可重映射）+ 鼠标（视角/左右键/滚轮），第一人称用 Pointer Lock 并给退出提示；手机触屏（左摇杆移动 + 右拖拽转视角、点按、长按、双指缩放），陀螺仪可选且可关，触点 ≥ 44px，避开安全区 `env(safe-area-inset-*)`。
- 输入统一 Pointer Events；`pointerType` 只决定 UI 呈现，**不得分叉游戏逻辑**；能力用 `matchMedia('(pointer: coarse)')` 运行时探测，**禁止 UA 判断机型**。
- 移动端：`viewport-fit=cover`、画布 `touch-action: none`、禁双击缩放/长按菜单、处理横竖屏与 `resize`（同时重算相机宽高比）；DPR 设上限（≤2）并提供画质档位，低端机自动降档。
- **国际化（严格格式）**：`src/i18n/trans.json` 唯一数据源，**一个 key 一条记录、zh 与 en 写在同一条里**（`"hud.health": { "zh": "生命：{n}", "en": "HP: {n}" }`）；key 小写点分、按字母序；缺任一语言即 bug；加语言只加字段、不新增文件；变量用 `{name}` 占位符，禁止字符串拼接。`src/i18n/trans.ts` 是唯一出口，导出 `Lang` / `TransKey` / `t()` / `getLang()` / `setLang()`（持久化 + 派发 `langchange`）。禁止裸文案字面量、禁止 `if (lang === 'en')`、禁止绕过 trans.ts 直接读 json；切换语言即时重渲染。
- 固定步长更新 + 渲染插值；rAF 驱动；页面隐藏即暂停渲染与音频；及时释放 GPU 资源防泄漏；尊重 `prefers-reduced-motion`。
- **弹窗**：禁止点遮罩/旁边自动关闭，必须点 `✕` 或明确按钮才关；卡片 `max-height: 85vh`、只有内容区滚动，标题栏与底部操作栏 sticky，**关闭/提交按钮永远不用滚动就可见可点**。
- **双主题（明/暗）+ 右上角切换**：**字体颜色最多 6 种、背景颜色最多 6 种（含按钮）**，全部 CSS 变量，**只允许定义在 `theme-light.css` 与 `theme-dark.css` 两个文件**（同名变量两套取值，切 `data-theme`）；**其他任何地方（UI/HUD css、内联 style、ts）禁止写死字体色与背景色**，只能 `var(--text-n)` / `var(--bg-n)`，3D 场景内的 UI 色值也从 CSS 变量读；主题持久化、切换即时生效。
- **禁止全局「当前 xxx」状态**：不做「当前存档/当前关卡」这类全局单例；上下文由浏览器窗口自带（URL query/hash + `sessionStorage`，不用共享的 `localStorage`）。验收标准：**两个浏览器窗口同时打开可各玩各的、互不干扰**；后端按请求参数取上下文。
- 统一 Logger 与错误处理，不裸用 `console.log`；入口校验非法状态，错误含函数名与非法值；跨平台差异运行时判断。
- **命令执行效率**：不涉及下载的命令**超时一律 ≤ 10 秒**（很多命令 0.1 秒就返回，挂几分钟是无谓等待），确实超时了才逐步调大；长任务用**分阶段执行 + 每阶段短超时（≤10 秒）**轮询进度，避免静默卡死。

## 完成标准
- 画面与交互在**电脑（键鼠）与手机（触摸）两端**都实测正常、无报错；按项目约定提交。
