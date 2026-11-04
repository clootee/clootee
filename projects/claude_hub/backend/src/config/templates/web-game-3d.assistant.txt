# 网页游戏 · 3D（TypeScript + HTML / WebGL）

> 本文件由 Clootee 模板生成，是给 AI 与协作者的开发约定。可按需增删。

## 记忆（最重要）
- 根目录维护 `mem.md`。**每次任务前先读，完成后把进展/技术选型/踩坑写回**（写清「改了什么、为什么、怎么验证」）。

## 技术栈
- **全部 TypeScript**（禁止用 JS 写业务），3D 渲染基于 WebGL（推荐 three.js 之类成熟库，避免手写底层）。样式独立成 `.css` 文件。
- 用 Vite 打包/热更；`tsconfig.json` 开 `"strict": true` 与 `"resolveJsonModule": true`。

## 启动与部署（强制：pm2 + 端口自检 + 先 build 再启动）
- **一律用 pm2 启动服务**（本地预览服务器 / 静态托管 / 资源与排行榜后端都算），禁止拿 `npm run dev` 当正式服务跑。根目录放 `ecosystem.config.js`，应用名固定（如 `<项目名>-server`），写清 `cwd` / `script` / `env`；`pm2 save` 保证机器重启后自动拉起。
- **端口必须先检测再用**，禁止盲目启动导致端口冲突、更禁止随手杀掉占用端口的别人的进程：
  - 代码里探测：`net.createServer().listen(port)` 捕获 `EADDRINUSE`；命令行排查：Windows `netstat -ano | findstr :<port>`，Linux/macOS `lsof -i:<port>`。
  - 被占用时的行为二选一并明确告知用户：**顺延到下一个可用端口**，或**报错退出并打印是谁占用了**。
  - 实际使用的端口要打印到日志并写入 `.runtime-port` 之类的文件，方便用户与手机端调试时获取。
- **每次启动默认走构建产物**（`npm run build` → `dist/`），pm2 跑的是 build 结果而不是源码热跑。
  - 构建**先输出到临时目录，成功后再原子替换 `dist/`**；build 失败就保留旧 `dist/` 继续服务——保证开发中途的半成品**不影响上一个正在玩的版本**（3D 资源大，替换更要原子化，避免加载到半份模型/贴图）。
  - 约定 `npm run start` = 端口自检 → `npm run build` → `pm2 restart <app> --update-env`（应用不存在则 `pm2 start ecosystem.config.js`）。
- 每次开发完主动告诉用户**哪些服务需要重启、具体命令是什么**；手机端联调请给出局域网访问地址（IP + 实际端口）。

## 双端支持（强制：手机触屏 + 电脑鼠标键盘）
同一份代码同时跑手机与电脑，**不做两套项目、不写两套玩法逻辑**。
- **输入抽象成语义动作**（`move` / `look` / `interact` / `zoom` …），逻辑层只认动作不认设备：
  - **电脑**：键盘（WASD / 方向键 / 空格，可重映射）+ 鼠标（移动视角、左右键、滚轮缩放）；第一人称可用 Pointer Lock，**必须提供退出提示**。
  - **手机**：触屏（左半屏虚拟摇杆移动 + 右半屏拖拽转视角、点按、长按、双指缩放/旋转），可选陀螺仪但**必须能关**；触点直径 ≥ 44px，按钮放拇指可达区，避开刘海与手势条（`env(safe-area-inset-*)`）。
- 统一用 **Pointer Events** 采集；`pointerType` 只用来**决定 UI 呈现**（显示虚拟摇杆还是按键提示），**不允许分叉游戏逻辑**。
- 设备能力运行时探测（`matchMedia('(pointer: coarse)')`、`'ontouchstart' in window`），**禁止 UA 判断机型**；二合一设备中途换输入方式要实时适应。
- 移动端必做：`viewport-fit=cover`；画布 `touch-action: none`；禁双击缩放、长按选中与系统菜单；处理横竖屏切换与 `resize` 重算画布与相机宽高比。
- 按 `devicePixelRatio` 渲染但**移动端要设上限**（如 ≤2）防止发热掉帧；提供画质档位（阴影/抗锯齿/后处理开关），低端机自动降档。
- **交付前两端都要实测**：桌面浏览器走键鼠路径，手机真机走触摸路径。

## 架构（松耦合分层）
- 分层清晰，互相通过接口通信：
  - **渲染层**：场景 / 相机 / 光照 / 材质，只负责画。
  - **游戏逻辑层**：实体、组件、系统（ECS 思路优先）；`update(dt)` 推进世界，不直接操作渲染细节。
  - **输入层**：键鼠/触摸/陀螺仪集中采集，映射为语义动作。
  - **资源层**：模型/贴图/音效异步加载与缓存，带加载进度。
- **松耦合、高内聚**：逻辑与渲染解耦，便于替换渲染实现或复用逻辑；数据驱动关卡与实体。

## 国际化（强制：单文件双语，格式严格遵守）
**一个 key 一条记录，所有语言写在同一条里**——改一句文案只动一个地方，禁止 zh.json / en.json 两份文件对照着找。

【数据源】`src/i18n/trans.json`：
```json
{
  "btn.start":  { "zh": "开始",         "en": "Start" },
  "hud.health": { "zh": "生命：{n}",    "en": "HP: {n}" }
}
```
- key 全小写、`模块.用途` 点分（`hud.health`、`menu.settings.title`），**禁止中文或整句英文当 key**；按字母序维护。
- 每条**必须同时有 `zh` 和 `en`**，缺一个即 bug；扩展语言只加字段（如 `"ja"`），**永不新增文件**。
- 变量统一 `{name}` 占位符由 `t()` 注入，**禁止字符串拼接文案**。

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
【禁令】`.ts` / `.html` 里禁止任何面向用户的中英文字面量，一律 `t('key')`；禁止 `if (lang === 'en')` 之类语言分支；禁止绕过 trans.ts 直接读 json；切换语言必须监听 `langchange` 即时重渲染。默认语言 zh，可配置。

## 表现与性能
- 固定时间步长更新物理/逻辑，渲染插值，保证不同帧率下手感一致。
- `requestAnimationFrame` 驱动；页面隐藏（`visibilitychange`）暂停渲染与音频；释放不再使用的 GPU 资源（几何体/纹理）避免泄漏。
- 尊重 `prefers-reduced-motion`，提供画质/特效档位以适配低端设备。
- **响应式**：画布随窗口自适应，正确处理 DPR 与相机宽高比。

## UI 规范（强制）
1. **弹窗禁止「点旁边就关」**：设置/暂停/结算等任何弹窗都不允许点遮罩自动关闭，必须点 `✕` 或明确的「继续 / 返回 / 确定」按钮才关，避免游戏中误触。
2. **操作按钮恒可见**：弹窗再长，关闭与提交按钮也**不需要滚动就能看到并点到**——卡片 `max-height: 85vh`，只让内容区 `overflow-y: auto`，标题栏与底部操作栏 sticky 固定。
3. **双主题（明/暗）+ 右上角切换，全局配色集中管理**：
   - **字体颜色最多 6 种、背景颜色最多 6 种**（都**包含按钮**在内），全部以 CSS 变量定义（`--text-1..6` / `--bg-1..6`）。
   - 这些颜色**只允许定义在 `theme-light.css` 与 `theme-dark.css` 两个文件里**（同名变量、两套取值），切换主题＝切换 `<html data-theme="light|dark">`。
   - **其他任何地方一律禁止写死字体颜色与背景色**（UI/HUD 的 css、内联 style、ts 里都不行），只能引用变量；3D 场景里的 UI 色值（HUD、标签、材质上的 UI 贴图）也要从 CSS 变量读（`getComputedStyle`），不得另立一套色板。
   - 主题选择持久化，右上角切换即时生效。

## 状态隔离（禁止全局「当前 xxx」）
- 除非明确要求，**禁止「当前存档 / 当前关卡 / 当前玩家」这类全局单例状态**。
- 上下文一律由**浏览器窗口自己携带**：放在 URL（query / hash）里，配合 `sessionStorage`（**不是**全窗口共享的 `localStorage`）。
- 硬性验收：**同时开两个浏览器窗口能各玩各的、互不干扰**——一个窗口换关卡/换存档绝不影响另一个窗口。
- 后端同理：按请求参数取上下文，**不得在服务端记「当前局」**这类全局态。

## 命令执行与长任务（效率）
- 执行命令必须设**尽量短的超时**：**不涉及下载的命令，超时一律不超过 10 秒**——很多命令 0.1 秒就返回，挂几分钟纯属无谓等待。
- **只有确实收到超时反馈才逐步调大**；下载类操作可例外放宽。
- 长任务禁止一条命令闷跑到底：采用**分阶段执行 + 每阶段短超时（通常 ≤ 10 秒）**轮询进度，避免静默卡死却无从察觉。

## 工程原则
- 复用优先；统一 Logger 与错误处理，不裸用 `console.log`；入口校验非法状态，错误含函数名与非法值；跨平台差异运行时判断。

## 交付
- 每次改动后**在电脑和手机两端**各实际运行确认画面/交互正常、无报错，再按项目约定提交。
