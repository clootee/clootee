// 教程配图库：纯内联 SVG + CSS 动画，无外部依赖。
// 关键约定：图里**不写文字**（只用符号、数字、箭头、色块），这样中英文共用同一张图，不需要翻译。
// 用法：Fig('token-meter') 返回一段 HTML；找不到 key 返回空串（不影响页面）。
const F = (() => {
  const S = (inner, h = 96) => `<svg viewBox="0 0 240 ${h}" class="lp-svg" aria-hidden="true">${inner}</svg>`;
  // 基础图元：c=样式类，d=动画延迟（秒）
  const b = (x, y, w, h, c = 'fb', o = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r == null ? 4 : o.r}" class="${c}"${o.d ? ` style="animation-delay:${o.d}s"` : ''}/>`;
  const ci = (x, y, r, c = 'fb', o = {}) =>
    `<circle cx="${x}" cy="${y}" r="${r}" class="${c}"${o.d ? ` style="animation-delay:${o.d}s"` : ''}/>`;
  const ln = (x1, y1, x2, y2, c = 'fl', o = {}) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${c}"${o.d ? ` style="animation-delay:${o.d}s"` : ''}/>`;
  const pt = (d, c = 'fl', o = {}) => `<path d="${d}" class="${c}"${o.d ? ` style="animation-delay:${o.d}s"` : ''}/>`;
  // 右向箭头（含箭头尖）
  const ar = (x, y, w, c = 'fl', o = {}) =>
    `<g class="${o.g || ''}"${o.d ? ` style="animation-delay:${o.d}s"` : ''}><line x1="${x}" y1="${y}" x2="${x + w - 5}" y2="${y}" class="${c}"/><polygon points="${x + w},${y} ${x + w - 7},${y - 4} ${x + w - 7},${y + 4}" class="${c === 'fl' ? 'fp' : c.replace('fl', 'fp')}"/></g>`;
  // 文件/文档小图标
  const doc = (x, y, c = 'fb', o = {}) =>
    `<g${o.d ? ` style="animation-delay:${o.d}s"` : ''} class="${o.g || ''}">${b(x, y, 22, 28, c, { r: 3 })}${ln(x + 5, y + 8, x + 17, y + 8, 'fl2')}${ln(x + 5, y + 14, x + 17, y + 14, 'fl2')}${ln(x + 5, y + 20, x + 13, y + 20, 'fl2')}</g>`;
  // 文件夹
  const fold = (x, y, w = 40, h = 30, c = 'fb') =>
    pt(`M${x} ${y + h} L${x} ${y + 6} Q${x} ${y + 3} ${x + 3} ${y + 3} L${x + 14} ${y + 3} L${x + 18} ${y + 9} L${x + w - 3} ${y + 9} Q${x + w} ${y + 9} ${x + w} ${y + 12} L${x + w} ${y + h} Z`, c);
  // 表格（r 行 × 3 列）
  const tbl = (x, y, w, rows, c = 'fb', o = {}) => {
    let s = b(x, y, w, 8 + rows * 9, c, { r: 3, d: o.d });
    for (let i = 0; i < rows; i++) s += ln(x + 4, y + 8 + i * 9, x + w - 4, y + 8 + i * 9, 'fl2');
    return `<g${o.g ? ` class="${o.g}"` : ''}>${s}</g>`;
  };
  const tick = (x, y, c = 'fok') => pt(`M${x} ${y} l4 5 l8 -10`, c);
  const cross = (x, y, c = 'fbad') => `${ln(x, y - 5, x + 10, y + 5, c)}${ln(x + 10, y - 5, x, y + 5, c)}`;
  const q = (x, y) => `<text x="${x}" y="${y}" class="fsym">?</text>`;
  const sym = (x, y, t, c = 'fsym') => `<text x="${x}" y="${y}" class="${c}">${t}</text>`;

  return { S, b, ci, ln, pt, ar, doc, fold, tbl, tick, cross, q, sym };
})();

const FIGS = {
  // ── 第 0 节：准备工作 ──
  // 同一个 .md 文件：左边用记事本打开（挤成一行 / 乱码），右边用 VS Code（分行高亮）
  'install-editor': F.S(
    `${F.b(14, 16, 96, 74, 'fb2', { r: 5 })}${F.b(14, 16, 96, 12, 'fb', { r: 5 })}
     ${F.ln(22, 40, 104, 40, 'fbadl')}
     ${[0, 1, 2].map((i) => F.sym(22 + i * 26, 62, '▨▨', 'ftiny fbadt')).join('')}
     ${F.cross(52, 82)}
     ${F.b(130, 16, 96, 74, 'fb2', { r: 5 })}${F.b(130, 16, 96, 12, 'fb', { r: 5 })}
     ${F.b(138, 34, 26, 6, 'facc fa-seq', { r: 2 })}${F.ln(168, 37, 218, 37, 'fl2')}
     ${F.b(138, 46, 40, 6, 'fokf fa-seq', { r: 2, d: 0.3 })}${F.ln(182, 49, 212, 49, 'fl2')}
     ${F.b(138, 58, 20, 6, 'fyf fa-seq', { r: 2, d: 0.6 })}${F.ln(162, 61, 218, 61, 'fl2')}
     ${F.tick(170, 84)}`),
  // 文件名从「清单」变成「清单.md」，右边一个复选框被勾上
  'show-ext': F.S(
    `${F.b(14, 20, 130, 26, 'fb', { r: 4 })}${F.b(22, 27, 12, 12, 'fdim', { r: 2 })}
     ${F.ln(42, 33, 92, 33, 'fl2')}${F.q(110, 39)}
     ${F.b(14, 58, 130, 26, 'fb', { r: 4 })}${F.b(22, 65, 12, 12, 'facc', { r: 2 })}
     ${F.ln(42, 71, 92, 71, 'fl2')}${F.sym(96, 76, '.md', 'ftiny facct fa-blink')}
     ${F.ar(150, 52, 20, 'fl', { g: 'fa-pulse' })}
     ${F.b(180, 42, 18, 18, 'fb2', { r: 3 })}${F.tick(183, 50, 'fok fa-blink')}
     ${F.ln(204, 51, 226, 51, 'fl2')}`),

  // ── 第 1 章：概念 ──
  // 左：只会说话的气泡；右：真的把文件搬进文件夹
  'chat-vs-do': F.S(
    `${F.pt('M14 20 h60 q6 0 6 6 v26 q0 6 -6 6 h-38 l-12 10 v-10 h-10 q-6 0 -6 -6 v-26 q0 -6 6 -6 z', 'fb')}
     ${F.ln(26, 34, 66, 34, 'fl2')}${F.ln(26, 44, 58, 44, 'fl2')}
     ${F.sym(46, 84, '…', 'fsym')}
     ${F.ln(120, 14, 120, 84, 'fdiv')}
     ${F.fold(190, 46, 40, 30, 'fb2')}
     ${F.doc(140, 30, 'facc', { g: 'fa-fly' })}
     ${F.ar(166, 58, 20, 'fl', { g: 'fa-pulse' })}
     ${F.tick(196, 60)}`),
  // 一句话被切成一个个 token 方块
  'token-meter': F.S(
    `${F.b(20, 30, 200, 22, 'fb2', { r: 6 })}
     ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => F.b(26 + i * 24, 34, 20, 14, 'facc fa-seq', { r: 3, d: i * 0.15 })).join('')}
     ${F.sym(20, 74, '¥', 'fsym')}${F.ar(36, 69, 26)}${F.sym(70, 74, '↑', 'fsym')}
     ${F.sym(150, 74, '⏱', 'fsym')}${F.ar(170, 69, 26)}${F.sym(204, 74, '↑', 'fsym')}`),
  // 容器装满，最早的块被挤出顶部
  'context-fill': F.S(
    `${F.b(70, 24, 100, 64, 'fb2', { r: 6 })}
     ${F.b(76, 74, 88, 10, 'facc', { r: 2 })}
     ${F.b(76, 60, 88, 10, 'facc', { r: 2 })}
     ${F.b(76, 46, 88, 10, 'facc', { r: 2 })}
     ${F.b(76, 32, 88, 10, 'facc fa-blink', { r: 2 })}
     ${F.b(76, 8, 88, 10, 'fbadf fa-escape', { r: 2 })}
     ${F.sym(184, 18, '↑', 'fsym fbadt')}`),
  // 硬盘里只圈出一个文件夹，围栏之外碰不到
  'scope-folder': F.S(
    `${F.b(10, 20, 220, 62, 'fb2', { r: 8 })}
     ${F.fold(24, 34, 34, 26, 'fb')}${F.fold(72, 34, 34, 26, 'fb')}
     ${F.b(118, 24, 62, 54, 'fdash fa-dash', { r: 8 })}
     ${F.fold(130, 38, 38, 28, 'facc')}
     ${F.fold(192, 34, 30, 26, 'fb')}
     ${F.cross(28, 74)}${F.cross(76, 74)}${F.tick(140, 74)}${F.cross(196, 74)}`),
  // 两条互不干扰的会话泳道
  'session-lanes': F.S(
    `${F.b(14, 20, 212, 26, 'fb2', { r: 13 })}
     ${F.b(14, 58, 212, 26, 'fb2', { r: 13 })}
     ${[0, 1, 2, 3].map((i) => F.ci(40 + i * 46, 33, 7, 'facc fa-run', { d: i * 0.25 })).join('')}
     ${[0, 1, 2, 3].map((i) => F.ci(40 + i * 46, 71, 7, 'fokf fa-run', { d: 0.4 + i * 0.25 })).join('')}`),
  // 钥匙 = 钱包
  'key-wallet': F.S(
    `${F.ci(50, 48, 16, 'fyf')}${F.ci(50, 48, 6, 'fb2')}${F.b(64, 44, 44, 8, 'fyf', { r: 2 })}${F.b(96, 52, 8, 10, 'fyf', { r: 2 })}
     ${F.sym(126, 56, '=', 'fsym')}
     ${F.b(150, 30, 60, 40, 'fb', { r: 6 })}${F.b(150, 42, 60, 8, 'fyf', { r: 0 })}${F.ci(196, 54, 5, 'fyf')}
     ${F.sym(176, 88, '⚠', 'fsym fbadt')}`),
  // 实习生：手很快，但脑袋上一堆问号
  intern: F.S(
    `${F.ci(60, 34, 14, 'fb')}${F.pt('M38 84 q0 -24 22 -24 q22 0 22 24 z', 'fb')}
     ${F.q(84, 24)}${F.q(96, 38)}
     ${F.b(120, 40, 100, 8, 'fb2', { r: 4 })}
     ${F.b(120, 40, 100, 8, 'facc fa-fill', { r: 4 })}
     ${F.sym(120, 74, '⚡', 'fsym facct')}${F.sym(196, 74, '✓', 'fsym fokt')}`),
  // 盾牌 + 锁：跳过权限确认，别暴露公网
  'shield-lock': F.S(
    `${F.pt('M120 14 l40 14 v26 q0 26 -40 34 q-40 -8 -40 -34 v-26 z', 'fbadf fa-glow')}
     ${F.b(110, 46, 20, 16, 'fb2', { r: 3 })}${F.pt('M114 46 v-6 q0 -6 6 -6 q6 0 6 6 v6', 'fl')}
     ${F.sym(24, 56, '127.0.0.1', 'ftiny fokt')}${F.sym(176, 56, 'WAN', 'ftiny fbadt')}
     ${F.tick(24, 70)}${F.cross(186, 70)}`),
  // Clootee 是壳，Claude Code 是引擎
  'engine-shell': F.S(
    `${F.b(30, 20, 180, 60, 'fb2', { r: 10 })}
     ${F.b(30, 20, 180, 14, 'fb', { r: 10 })}
     ${F.ci(120, 56, 16, 'facc fa-spin')}${F.ci(120, 56, 6, 'fb2')}
     ${[0, 1, 2, 3].map((i) => F.b(118, 34, 4, 8, 'facc fa-spin', { r: 1 })).join('')}
     ${F.b(46, 44, 40, 10, 'fb', { r: 3 })}${F.b(46, 60, 28, 10, 'fb', { r: 3 })}
     ${F.b(158, 44, 40, 10, 'fb', { r: 3 })}${F.b(170, 60, 28, 10, 'fb', { r: 3 })}`),
  // 越界检查：可逆 vs 不可逆
  'risk-scale': F.S(
    `${F.ln(120, 20, 120, 40, 'fl')}${F.ln(60, 40, 180, 40, 'fl')}
     ${F.b(38, 44, 44, 26, 'fokf fa-tilt', { r: 4 })}${F.tick(54, 55, 'fl2b')}
     ${F.b(158, 44, 44, 26, 'fbadf', { r: 4 })}${F.cross(174, 57, 'fl2b')}
     ${F.sym(52, 90, '↺', 'fsym fokt')}${F.sym(172, 90, '✕', 'fsym fbadt')}`),

  // ── 第 2 章：派活 ──
  // 四要素依次点亮
  'prompt-4parts': F.S(
    `${[0, 1, 2, 3].map((i) => F.b(16 + i * 56, 30, 48, 34, 'facc fa-seq', { r: 6, d: i * 0.35 })).join('')}
     ${[0, 1, 2, 3].map((i) => F.sym(30 + i * 56, 52, ['◎', '▣', '⇩', '⛔'][i], 'fsymw')).join('')}
     ${F.ar(16, 78, 208, 'fl', { g: 'fa-pulse' })}`),
  // 先出计划 → 确认 → 才动手
  'plan-then-act': F.S(
    `${F.tbl(16, 22, 60, 5, 'fb')}
     ${F.ar(84, 48, 26)}
     ${F.ci(128, 48, 16, 'fokf fa-blink')}${F.tick(121, 47, 'fl2b')}
     ${F.ar(152, 48, 26)}
     ${F.ci(200, 48, 18, 'facc fa-spin')}${F.ci(200, 48, 7, 'fb2')}`),
  // 一堆文件飞进三个文件夹
  'files-sort': F.S(
    `${[0, 1, 2, 3].map((i) => F.doc(14 + i * 8, 16 + i * 4, 'fb', { g: 'fa-fly', d: i * 0.3 })).join('')}
     ${F.ar(70, 48, 30, 'fl', { g: 'fa-pulse' })}
     ${F.fold(112, 14, 38, 26, 'facc')}${F.fold(112, 46, 38, 26, 'fokf')}${F.fold(112, 78, 38, 18, 'fyf')}
     ${F.tbl(176, 22, 52, 6, 'fb2')}`),
  // 旧名 → 新名 对照表
  'rename-map': F.S(
    `${F.b(16, 18, 84, 62, 'fb2', { r: 5 })}${F.b(140, 18, 84, 62, 'fb2', { r: 5 })}
     ${[0, 1, 2].map((i) => F.b(22, 26 + i * 18, 72, 12, 'fb', { r: 2 })).join('')}
     ${[0, 1, 2].map((i) => F.b(146, 26 + i * 18, 72, 12, 'facc fa-seq', { r: 2, d: i * 0.3 })).join('')}
     ${[0, 1, 2].map((i) => F.ar(102, 32 + i * 18, 34, 'fl', { g: 'fa-pulse', d: i * 0.3 })).join('')}`),
  // 任务排队，一个个通过
  queue: F.S(
    `${F.b(14, 34, 212, 30, 'fb2', { r: 15 })}
     ${[0, 1, 2, 3].map((i) => F.b(24 + i * 40, 40, 30, 18, 'facc fa-queue', { r: 4, d: i * 0.5 })).join('')}
     ${F.ci(206, 49, 10, 'fokf fa-blink')}${F.tick(200, 48, 'fl2b')}
     ${F.sym(14, 84, '‖', 'fsym')}${F.sym(40, 84, '↕', 'fsym')}`),
  // 过程三层：思考 / 工具调用 / 输出
  'tools-log': F.S(
    `${F.b(20, 14, 200, 20, 'fb2', { r: 4 })}${F.sym(30, 28, '◌', 'fsym')}${F.ln(48, 24, 190, 24, 'fl2')}
     ${F.b(20, 40, 200, 24, 'facc fa-glow', { r: 4 })}${F.sym(30, 56, '⚙', 'fsymw')}${F.ln(48, 50, 190, 50, 'fl2w')}${F.ln(48, 57, 150, 57, 'fl2w')}
     ${F.b(20, 70, 200, 20, 'fb2', { r: 4 })}${F.sym(30, 84, '≡', 'fsym')}${F.ln(48, 80, 190, 80, 'fl2')}
     ${F.sym(226, 58, '←', 'fsym fbadt')}`),
  // 47 → 47 对上了
  'verify-count': F.S(
    `${F.b(20, 30, 70, 40, 'fb', { r: 5 })}${F.sym(40, 57, '47', 'fnum')}
     ${F.sym(112, 58, '=', 'fsym')}
     ${F.b(150, 30, 70, 40, 'fb', { r: 5 })}${F.sym(164, 57, '20', 'fnums')}${F.sym(190, 57, '+27', 'fnums')}
     ${F.ci(120, 22, 11, 'fokf fa-blink')}${F.tick(114, 21, 'fl2b')}`),
  // 原件只读，产出写新目录
  'copy-safe': F.S(
    `${F.fold(20, 34, 46, 34, 'fb')}${F.sym(30, 84, '🔒', 'fsym')}
     ${F.ar(76, 50, 34, 'fl', { g: 'fa-pulse' })}
     ${F.fold(126, 34, 46, 34, 'fokf')}${F.doc(190, 34, 'fokf', { g: 'fa-fly' })}
     ${F.cross(34, 20, 'fbad')}${F.sym(46, 24, '✎', 'fsym fbadt')}`),
  // bug 三件套
  'bug-report': F.S(
    `${[0, 1, 2].map((i) => F.b(20, 14 + i * 26, 200, 20, 'fb2 fa-seq', { r: 4, d: i * 0.4 })).join('')}
     ${[0, 1, 2].map((i) => F.sym(30, 28 + i * 26, ['①', '②', '③'][i], 'fsym')).join('')}
     ${[0, 1, 2].map((i) => F.ln(50, 24 + i * 26, 150 + i * 20, 24 + i * 26, 'fl2')).join('')}
     ${F.ci(206, 76, 9, 'fokf fa-blink')}${F.tick(201, 75, 'fl2b')}`),
  // 中途叫停
  'stop-mid': F.S(
    `${F.b(14, 38, 150, 22, 'facc', { r: 11 })}
     ${F.b(14, 38, 150, 22, 'fb2 fa-shrink', { r: 11 })}
     ${F.ci(190, 49, 20, 'fbadf fa-glow')}${F.b(183, 42, 5, 14, 'fb2', { r: 1 })}${F.b(192, 42, 5, 14, 'fb2', { r: 1 })}`),

  // ── 第 3 章：表格 ──
  // 人工一行行 vs 脚本一把梭
  'script-loop': F.S(
    `${F.tbl(16, 14, 60, 8, 'fb')}
     ${F.ar(84, 48, 26)}
     ${F.ci(128, 48, 18, 'facc fa-spin')}${F.ci(128, 48, 7, 'fb2')}
     ${F.ar(152, 48, 26)}
     ${F.tbl(190, 14, 40, 8, 'fokf', { g: 'fa-blink' })}
     ${F.sym(112, 88, '×1 → ×∞', 'ftiny facct')}`),
  // 12 张表合成 1 张
  'csv-merge': F.S(
    `${[0, 1, 2, 3].map((i) => F.tbl(14, 8 + i * 22, 46, 1, 'fb', { d: i * 0.2, g: 'fa-seq' })).join('')}
     ${F.ar(70, 48, 34, 'fl', { g: 'fa-pulse' })}
     ${F.tbl(122, 16, 66, 6, 'facc')}
     ${F.b(198, 16, 26, 62, 'fokf', { r: 4 })}${F.sym(203, 52, '↧', 'fsymw')}`),
  // 行数两头对账
  reconcile: F.S(
    `${[0, 1, 2].map((i) => F.b(16, 16 + i * 24, 54, 18, 'fb', { r: 3 })).join('')}
     ${[0, 1, 2].map((i) => F.sym(30, 30 + i * 24, ['10', '12', '11'][i], 'fnums')).join('')}
     ${F.sym(84, 52, '=', 'fsym')}
     ${F.b(112, 26, 54, 18, 'facc', { r: 3 })}${F.sym(126, 40, '31', 'fnumw')}
     ${F.sym(174, 40, '+', 'fsym')}
     ${F.b(190, 26, 40, 18, 'fyf', { r: 3 })}${F.sym(202, 40, '2', 'fnumw')}
     ${F.ci(150, 74, 12, 'fokf fa-blink')}${F.tick(144, 73, 'fl2b')}`),
  // 脏数据被挑出来
  'dirty-flag': F.S(
    `${F.b(16, 14, 130, 74, 'fb2', { r: 5 })}
     ${[0, 1, 2, 3, 4].map((i) => F.b(22, 20 + i * 14, 118, 10, i === 1 || i === 3 ? 'fbadf fa-blink' : 'fb', { r: 2, d: i * 0.2 })).join('')}
     ${F.ar(154, 40, 24, 'fl', { g: 'fa-pulse' })}
     ${F.b(190, 26, 40, 40, 'fyf', { r: 4 })}${F.sym(203, 52, '⚑', 'fsymw')}`),
  // 两行一模一样：真重复还是两笔？
  'dup-rows': F.S(
    `${F.b(30, 26, 130, 16, 'fb', { r: 3 })}${F.b(30, 50, 130, 16, 'fb', { r: 3 })}
     ${F.ln(36, 34, 150, 34, 'fl2')}${F.ln(36, 58, 150, 58, 'fl2')}
     ${F.b(26, 22, 138, 48, 'fdash fa-dash', { r: 6 })}
     ${F.q(184, 54)}`),
  // "1,234.50" 被当成文本
  'text-number': F.S(
    `${F.b(16, 32, 96, 30, 'fb', { r: 4 })}${F.sym(26, 52, '"1,234.50"', 'fnums')}
     ${F.ar(120, 47, 26, 'fl', { g: 'fa-pulse' })}
     ${F.b(160, 32, 66, 30, 'fbadf fa-blink', { r: 4 })}${F.sym(184, 52, '0', 'fnumw')}
     ${F.cross(126, 78)}`),
  // 极值一眼看出来
  extremes: F.S(
    `${[14, 30, 22, 26, 70, 18, 24, 20, 4, 28].map((v, i) =>
      F.b(18 + i * 22, 78 - v, 14, v, v > 50 ? 'fbadf fa-blink' : v < 6 ? 'fyf fa-blink' : 'facc', { r: 2, d: i * 0.1 })).join('')}
     ${F.ln(12, 80, 228, 80, 'fl')}`),
  // 漏斗：好行 / 问题行
  'issues-funnel': F.S(
    `${[0, 1, 2, 3, 4].map((i) => F.b(24 + i * 20, 10, 14, 12, i === 2 ? 'fbadf' : 'fb', { r: 2, d: i * 0.15, })).join('')}
     ${F.pt('M20 30 L130 30 L92 58 L58 58 Z', 'fb2')}
     ${F.b(46, 66, 58, 22, 'fokf', { r: 4 })}${F.tick(66, 74, 'fl2b')}
     ${F.ar(136, 44, 26, 'fl', { g: 'fa-pulse' })}
     ${F.b(174, 30, 52, 40, 'fyf', { r: 4 })}${F.sym(190, 56, '⚑', 'fsymw')}`),
  // 脚本存下来，下个月再跑
  'reuse-script': F.S(
    `${F.b(84, 26, 72, 44, 'facc', { r: 6 })}${F.sym(100, 56, '</>', 'fsymw')}
     ${F.pt('M60 48 a48 30 0 1 1 14 26', 'fl fa-dash')}
     ${F.sym(20, 30, 'M1', 'ftiny')}${F.sym(196, 30, 'M2', 'ftiny')}${F.sym(196, 82, 'M3', 'ftiny')}
     ${F.ci(30, 48, 6, 'fokf fa-seq')}${F.ci(206, 48, 6, 'fokf fa-seq', { d: 0.5 })}${F.ci(118, 86, 6, 'fokf fa-seq', { d: 1 })}`),
  // 敏感字段先遮掉
  'mask-data': F.S(
    `${F.b(20, 20, 200, 60, 'fb2', { r: 5 })}
     ${[0, 1, 2].map((i) => `${F.b(28, 28 + i * 18, 60, 12, 'fb', { r: 2 })}${F.b(96, 28 + i * 18, 50, 12, 'fb', { r: 2 })}${F.b(154, 28 + i * 18, 58, 12, 'fbadf fa-mask', { r: 2, d: i * 0.2 })}`).join('')}
     ${F.sym(160, 22, '●●●●', 'ftiny fbadt')}`),

  // ── 第 4 章：文字 ──
  // 素材进去，稿子出来
  'doc-draft': F.S(
    `${F.doc(18, 20, 'fb')}${F.doc(18, 54, 'fb')}
     ${F.ar(50, 48, 30, 'fl', { g: 'fa-pulse' })}
     ${F.b(96, 14, 128, 74, 'fb2', { r: 5 })}
     ${[0, 1, 2, 3, 4].map((i) => F.ln(106, 28 + i * 13, i === 4 ? 170 : 212, 28 + i * 13, 'fl2 fa-seq', { d: i * 0.25 })).join('')}`),
  // 四个旋钮
  'tone-knobs': F.S(
    `${[0, 1, 2, 3].map((i) => `${F.ln(30 + i * 56, 18, 30 + i * 56, 72, 'fl')}${F.ci(30 + i * 56, 30 + i * 12, 9, 'facc fa-slide', { d: i * 0.3 })}`).join('')}
     ${[0, 1, 2, 3].map((i) => F.sym(23 + i * 56, 92, ['👤', '🎯', '🎨', '📏'][i], 'fsym')).join('')}`),
  // 给个范例，照着写
  'example-copy': F.S(
    `${F.b(20, 18, 80, 62, 'fokf', { r: 5 })}${[0, 1, 2, 3].map((i) => F.ln(30, 30 + i * 13, 90, 30 + i * 13, 'fl2w')).join('')}
     ${F.ar(110, 48, 28, 'fl', { g: 'fa-pulse' })}
     ${F.b(148, 18, 80, 62, 'fb2', { r: 5 })}${[0, 1, 2, 3].map((i) => F.ln(158, 30 + i * 13, 218, 30 + i * 13, 'fl2 fa-seq', { d: i * 0.3 })).join('')}`),
  // 文档里冒出一句红色的编造
  hallucination: F.S(
    `${F.b(30, 14, 180, 74, 'fb2', { r: 5 })}
     ${[0, 1, 3, 4].map((i) => F.ln(42, 30 + i * 14, 196, 30 + i * 14, 'fl2')).join('')}
     ${F.b(42, 58, 120, 10, 'fbadf fa-ghost', { r: 2 })}
     ${F.sym(178, 68, '✨', 'fsym fbadt')}`),
  // 结论 ←→ 原文可追溯
  'trace-quote': F.S(
    `${F.b(16, 20, 90, 58, 'fb2', { r: 5 })}${[0, 1, 2].map((i) => F.ln(26, 34 + i * 16, 96, 34 + i * 16, 'fl2')).join('')}
     ${F.b(26, 44, 70, 10, 'facc fa-blink', { r: 2 })}
     ${F.b(140, 20, 84, 58, 'fb2', { r: 5 })}${[0, 1, 2].map((i) => F.ln(150, 34 + i * 16, 214, 34 + i * 16, 'fl2')).join('')}
     ${F.b(150, 60, 56, 10, 'facc fa-blink', { r: 2, d: 0.3 })}
     ${F.pt('M100 49 q22 4 44 16', 'fl fa-dash')}`),
  // A / B 两版
  'two-versions': F.S(
    `${F.b(28, 16, 76, 68, 'fb', { r: 5 })}${F.sym(58, 52, 'A', 'fnum')}
     ${F.b(136, 16, 76, 68, 'fb', { r: 5 })}${F.sym(166, 52, 'B', 'fnum')}
     ${F.ci(66, 16, 10, 'fokf fa-choose')}${F.ci(174, 16, 10, 'fokf fa-choose', { d: 1.2 })}`),
  // 模板文件：只换素材
  'template-file': F.S(
    `${F.b(80, 12, 80, 76, 'facc', { r: 6 })}${[0, 1, 2, 3].map((i) => F.ln(92, 28 + i * 16, 148, 28 + i * 16, 'fl2w')).join('')}
     ${F.doc(16, 20, 'fb', { g: 'fa-fly' })}${F.doc(16, 54, 'fb', { g: 'fa-fly', d: 0.5 })}
     ${F.ar(46, 48, 26, 'fl', { g: 'fa-pulse' })}
     ${F.ar(166, 48, 24, 'fl', { g: 'fa-pulse' })}
     ${F.doc(202, 34, 'fokf', { g: 'fa-blink' })}`),
  // 长素材走文件，不要贴对话框
  'material-in': F.S(
    `${F.b(14, 24, 60, 56, 'fbadf', { r: 5 })}${F.sym(22, 58, '≣≣≣', 'fsymw')}${F.cross(36, 16)}
     ${F.b(96, 24, 60, 56, 'fokf', { r: 5 })}${F.sym(112, 58, '⎘', 'fsymw')}${F.tick(118, 12, 'fok')}
     ${F.ar(162, 52, 24, 'fl', { g: 'fa-pulse' })}
     ${F.ci(212, 52, 18, 'facc fa-spin')}${F.ci(212, 52, 7, 'fb2')}`),
  // 长度一限，废话消失
  'length-cap': F.S(
    `${F.b(20, 16, 200, 26, 'fb2', { r: 4 })}${[0, 1, 2, 3, 4, 5].map((i) => F.ln(28, 24 + (i % 3) * 7, 28 + 60 + (i % 3) * 40, 24 + (i % 3) * 7, 'fl2')).join('')}
     ${F.ar(112, 54, 24, 'fl', { g: 'fa-pulse' })}
     ${F.b(20, 62, 200, 26, 'fokf fa-shrinkw', { r: 4 })}
     ${F.sym(196, 34, '400', 'ftiny fbadt')}${F.sym(196, 80, '150', 'ftiny fokt')}`),
  // 对外发出去收不回来
  'external-risk': F.S(
    `${F.ci(38, 50, 16, 'fb')}${F.ar(60, 50, 60, 'fl', { g: 'fa-pulse' })}
     ${F.ci(180, 50, 16, 'fb')}
     ${F.doc(96, 36, 'facc', { g: 'fa-fly' })}
     ${F.pt('M120 78 q-30 12 -56 -6', 'fl fdim')}${F.cross(60, 82)}
     ${F.sym(88, 20, '↩', 'fsym fbadt')}${F.cross(104, 18)}`),

  // ── 第 5 章：分析 ──
  // 先有问题，再有图
  'question-first': F.S(
    `${F.ci(44, 48, 22, 'facc fa-glow')}${F.sym(37, 58, '?', 'fsymw')}
     ${F.ar(74, 48, 30, 'fl', { g: 'fa-pulse' })}
     ${F.b(118, 56, 18, 24, 'fb', { r: 2 })}${F.b(142, 40, 18, 40, 'fb', { r: 2 })}${F.b(166, 28, 18, 52, 'fb', { r: 2 })}
     ${F.ln(112, 82, 224, 82, 'fl')}
     ${F.ci(206, 40, 12, 'fokf fa-blink')}${F.tick(200, 39, 'fl2b')}`),
  // 分子没变，分母变了
  denominator: F.S(
    `${F.sym(48, 42, '95', 'fnum')}${F.ln(30, 52, 100, 52, 'fl')}${F.b(30, 60, 70, 22, 'fbadf fa-widen', { r: 3 })}
     ${F.sym(120, 60, '≠', 'fsym')}
     ${F.sym(166, 42, '95', 'fnum')}${F.ln(148, 52, 218, 52, 'fl')}${F.b(148, 60, 40, 22, 'facc', { r: 3 })}
     ${F.q(212, 78)}`),
  // 一根柱子把平均值拉飞
  outlier: F.S(
    `${[20, 24, 18, 22, 20].map((v, i) => F.b(18 + i * 22, 80 - v, 14, v, 'facc', { r: 2 })).join('')}
     ${F.b(138, 12, 14, 68, 'fbadf fa-grow', { r: 2 })}
     ${F.ln(12, 80, 228, 80, 'fl')}
     ${F.ln(12, 58, 228, 58, 'fbadl fa-dash')}${F.sym(206, 52, '↑', 'fsym fbadt')}`),
  // 5 个点 vs 100 个点
  'sample-small': F.S(
    `${F.b(16, 20, 90, 60, 'fb2', { r: 5 })}${[0, 1, 2, 3, 4].map((i) => F.ci(34 + (i % 3) * 20, 38 + Math.floor(i / 3) * 22, 5, 'fbadf fa-blink', { d: i * 0.2 })).join('')}
     ${F.sym(120, 56, 'vs', 'fsym')}
     ${F.b(150, 20, 76, 60, 'fb2', { r: 5 })}
     ${Array.from({ length: 24 }, (_, i) => F.ci(160 + (i % 8) * 9, 30 + Math.floor(i / 8) * 18, 3.5, 'fokf')).join('')}
     ${F.cross(52, 88)}${F.tick(180, 86, 'fok')}`),
  // 一起动 ≠ 一个导致另一个
  'corr-causal': F.S(
    `${F.pt('M20 70 L52 52 L84 58 L116 34 L148 40 L180 20', 'facl')}
     ${F.pt('M20 82 L52 66 L84 72 L116 50 L148 56 L180 36', 'fokl')}
     ${F.ar(196, 48, 26, 'fbadl', { g: 'fa-pulse' })}
     ${F.cross(200, 66)}`),
  // 三种图轮播
  'chart-types': F.S(
    `${F.b(16, 20, 66, 60, 'fb2', { r: 5 })}${[16, 30, 24].map((v, i) => F.b(28 + i * 16, 72 - v, 10, v, 'facc fa-cycle', { r: 2, d: 0 })).join('')}
     ${F.b(90, 20, 66, 60, 'fb2', { r: 5 })}${F.pt('M100 68 L116 48 L132 56 L148 32', 'facl fa-cycle', { d: 1.2 })}
     ${F.b(164, 20, 62, 60, 'fb2', { r: 5 })}${F.ci(195, 50, 22, 'facc fa-cycle', { d: 2.4 })}${F.pt('M195 50 L195 28 A22 22 0 0 1 214 61 Z', 'fokf fa-cycle', { d: 2.4 })}`),
  // 依赖外网 → 别人打开是空白
  'offline-html': F.S(
    `${F.b(16, 20, 90, 60, 'fb2', { r: 5 })}${F.b(16, 20, 90, 12, 'fb', { r: 5 })}${F.b(28, 44, 30, 22, 'fokf', { r: 2 })}${F.ln(64, 50, 96, 50, 'fl2')}${F.ln(64, 60, 88, 60, 'fl2')}
     ${F.pt('M118 46 q6 -12 18 -10 q4 -10 16 -8 q12 2 12 14 q10 2 8 12 l-56 0 q-8 -4 2 -8', 'fdim')}${F.cross(134, 68)}
     ${F.b(190, 20, 40, 60, 'fbadf fa-blink', { r: 5 })}${F.sym(202, 56, '␀', 'fsymw')}`),
  // 平均数被拉走，中位数不动
  'median-mean': F.S(
    `${[0, 1, 2, 3, 4, 5].map((i) => F.ci(30 + i * 16, 50, 6, 'facc')).join('')}
     ${F.ci(208, 50, 9, 'fbadf fa-blink')}
     ${F.ln(70, 30, 70, 70, 'fokl')}${F.sym(56, 24, 'Md', 'ftiny fokt')}
     ${F.ln(128, 30, 128, 70, 'fbadl fa-slide2')}${F.sym(118, 84, 'Avg', 'ftiny fbadt')}`),
  // 结论最多三条
  'three-findings': F.S(
    `${[0, 1, 2].map((i) => `${F.b(20, 14 + i * 24, 150, 18, 'fokf fa-seq', { r: 4, d: i * 0.3 })}${F.sym(28, 28 + i * 24, ['①', '②', '③'][i], 'fsymw')}`).join('')}
     ${F.b(20, 86, 150, 8, 'fdim fa-fadeout', { r: 4 })}
     ${F.b(184, 14, 42, 66, 'fb2', { r: 4 })}${F.sym(192, 54, '≤3', 'fnums')}`),

  // ── 第 6 章：规矩与上下文 ──
  // CLAUDE.md 一直喂给 AI
  rulebook: F.S(
    `${F.b(20, 18, 66, 62, 'facc', { r: 4 })}${[0, 1, 2, 3].map((i) => F.ln(30, 32 + i * 14, 76, 32 + i * 14, 'fl2w')).join('')}
     ${F.ar(94, 48, 30, 'fl', { g: 'fa-pulse' })}
     ${F.b(136, 26, 66, 46, 'fb2', { r: 8 })}${F.ci(154, 46, 5, 'facc')}${F.ci(184, 46, 5, 'facc')}${F.ln(152, 62, 186, 62, 'fl')}
     ${F.ci(214, 34, 9, 'fokf fa-blink')}${F.tick(209, 33, 'fl2b')}`),
  // 早期消息淡出
  'memory-fade': F.S(
    `${[0, 1, 2, 3, 4, 5].map((i) => F.b(16 + i * 37, 36, 30, 24, i < 2 ? 'fdim fa-fadeout' : 'facc', { r: 4, d: i * 0.2 })).join('')}
     ${F.ar(16, 80, 208, 'fl')}`),
  // 会话 A → 文件 → 会话 B
  'handover-file': F.S(
    `${F.b(14, 30, 56, 40, 'fb2', { r: 8 })}${F.sym(30, 56, 'A', 'fnums')}
     ${F.ar(76, 50, 24, 'fl', { g: 'fa-pulse' })}
     ${F.doc(108, 34, 'fokf', { g: 'fa-blink' })}
     ${F.ar(140, 50, 24, 'fl', { g: 'fa-pulse', d: 0.4 })}
     ${F.b(172, 30, 56, 40, 'fb2', { r: 8 })}${F.sym(190, 56, 'B', 'fnums')}`),
  // 大块切成 5 小块
  'split-steps': F.S(
    `${F.b(14, 30, 60, 40, 'fbadf', { r: 5 })}
     ${F.ar(82, 50, 24, 'fl', { g: 'fa-pulse' })}
     ${[0, 1, 2, 3, 4].map((i) => F.b(116 + i * 24, 34, 18, 32, 'fokf fa-seq', { r: 4, d: i * 0.25 })).join('')}
     ${[0, 1, 2, 3, 4].map((i) => F.tick(119 + i * 24, 46, 'fl2b')).join('')}`),
  // 队列中途的确认闸门
  checkpoint: F.S(
    `${F.b(14, 38, 212, 22, 'fb2', { r: 11 })}
     ${[0, 1].map((i) => F.b(24 + i * 34, 42, 26, 14, 'fokf', { r: 3 })).join('')}
     ${F.b(104, 24, 8, 50, 'fyf fa-glow', { r: 2 })}
     ${F.q(122, 22)}
     ${[0, 1, 2].map((i) => F.b(126 + i * 34, 42, 26, 14, 'fb fa-wait', { r: 3, d: i * 0.2 })).join('')}`),
  // 只读需要的那一点
  'intake-limit': F.S(
    `${F.b(16, 14, 76, 74, 'fb2', { r: 5 })}${Array.from({ length: 8 }, (_, i) => F.b(24, 22 + i * 9, 60, 6, 'fb', { r: 1 })).join('')}
     ${F.b(24, 22, 60, 15, 'facc fa-blink', { r: 1 })}
     ${F.ar(102, 48, 26, 'fl', { g: 'fa-pulse' })}
     ${F.b(142, 34, 84, 30, 'fb2', { r: 5 })}${F.b(150, 42, 30, 14, 'facc', { r: 2 })}
     ${F.sym(190, 56, '↓ token', 'ftiny fokt')}`),
  // 长对话压成要点
  'compact-squeeze': F.S(
    `${F.b(14, 20, 100, 58, 'fb2', { r: 5 })}${Array.from({ length: 6 }, (_, i) => F.ln(24, 30 + i * 9, 104, 30 + i * 9, 'fl2')).join('')}
     ${F.ar(124, 48, 26, 'fl', { g: 'fa-squeeze' })}
     ${F.b(166, 34, 60, 30, 'facc', { r: 5 })}${F.ln(176, 44, 216, 44, 'fl2w')}${F.ln(176, 54, 200, 54, 'fl2w')}`),

  // ── 第 7 章：做工具 ──
  // 房子三层：结构 / 装修 / 水电
  'html-css-js': F.S(
    `${F.pt('M60 44 L110 18 L160 44 L160 84 L60 84 Z', 'fb2')}
     ${F.b(76, 56, 26, 28, 'fb', { r: 2 })}${F.b(118, 56, 26, 20, 'fb', { r: 2 })}
     ${F.b(180, 16, 44, 16, 'fb fa-seq', { r: 3 })}${F.sym(186, 28, 'HTML', 'ftiny')}
     ${F.b(180, 40, 44, 16, 'facc fa-seq', { r: 3, d: 0.4 })}${F.sym(190, 52, 'CSS', 'ftinyw')}
     ${F.b(180, 64, 44, 16, 'fyf fa-seq', { r: 3, d: 0.8 })}${F.sym(196, 76, 'JS', 'ftinyw')}`),
  // 小盒子一步步长大
  'mvp-grow': F.S(
    `${[0, 1, 2, 3].map((i) => F.b(20 + i * 56, 74 - i * 16, 42, 12 + i * 16, i === 0 ? 'fokf' : 'facc', { r: 4, d: i * 0.3, })).join('')}
     ${[0, 1, 2].map((i) => F.ar(64 + i * 56, 60, 14, 'fl', { g: 'fa-pulse', d: i * 0.3 })).join('')}
     ${F.ln(12, 86, 228, 86, 'fl')}`),
  // 一次改一件 vs 一次改五件
  'one-change': F.S(
    `${F.b(16, 18, 90, 64, 'fb2', { r: 5 })}${[0, 1, 2, 3, 4].map((i) => F.b(26, 26 + i * 12, 70, 8, 'fbadf fa-blink', { r: 2, d: i * 0.1 })).join('')}${F.q(84, 92)}
     ${F.b(134, 18, 90, 64, 'fb2', { r: 5 })}${[0, 1, 2, 3, 4].map((i) => F.b(144, 26 + i * 12, 70, 8, i === 2 ? 'fokf fa-blink' : 'fb', { r: 2 })).join('')}
     ${F.tick(174, 90, 'fok')}`),
  // 胶片式快照 + 回退
  'git-snapshots': F.S(
    `${F.b(14, 30, 212, 36, 'fb2', { r: 4 })}
     ${[0, 1, 2, 3].map((i) => F.b(24 + i * 52, 36, 40, 24, i === 2 ? 'fokf fa-blink' : 'fb', { r: 3, d: i * 0.2 })).join('')}
     ${[0, 1, 2, 3].map((i) => F.ci(44 + i * 52, 74, 4, 'facc')).join('')}
     ${F.ln(44, 74, 200, 74, 'fl')}
     ${F.pt('M200 84 q-40 14 -78 0', 'fbadl fa-dash')}${F.sym(110, 96, '↩', 'fsym fbadt')}`),
  // 一个文件发给同事
  'share-file': F.S(
    `${F.ci(34, 50, 15, 'fb')}${F.pt('M14 84 q0 -20 20 -20 q20 0 20 20 z', 'fb')}
     ${F.doc(102, 36, 'facc', { g: 'fa-fly' })}
     ${F.ar(66, 50, 30, 'fl', { g: 'fa-pulse' })}${F.ar(140, 50, 30, 'fl', { g: 'fa-pulse', d: 0.4 })}
     ${F.ci(204, 50, 15, 'fb')}${F.pt('M184 84 q0 -20 20 -20 q20 0 20 20 z', 'fb')}
     ${F.tick(196, 24, 'fok')}`),
  // 纯本地计算，不联网
  'local-only': F.S(
    `${F.b(60, 20, 120, 58, 'fb2', { r: 6 })}${F.b(60, 20, 120, 12, 'fb', { r: 6 })}
     ${F.b(74, 42, 40, 12, 'fb', { r: 2 })}${F.b(74, 60, 40, 12, 'fb', { r: 2 })}
     ${F.b(128, 42, 38, 30, 'fokf fa-blink', { r: 3 })}${F.sym(140, 62, '=', 'fsymw')}
     ${F.pt('M198 30 q6 -10 16 -8 q10 -8 18 4 q8 6 0 12 l-38 0 q-6 -6 4 -8', 'fdim')}${F.cross(206, 56)}`),
  // 回滚箭头
  rollback: F.S(
    `${[0, 1, 2, 3].map((i) => F.b(24 + i * 52, 30, 40, 26, i === 3 ? 'fbadf' : 'fb', { r: 4 })).join('')}
     ${F.pt('M200 68 q-46 18 -90 4 q-30 -10 -42 -4', 'fokl fa-dash')}
     ${F.sym(60, 90, '←', 'fsym fokt')}${F.tick(140, 84, 'fok')}`),

  // ── 第 8 章：改真实项目 ──
  // 类型挡下错误
  'ts-shield': F.S(
    `${F.b(16, 34, 70, 28, 'fb', { r: 4 })}${F.sym(26, 54, 'abc', 'fnums')}
     ${F.ar(94, 48, 22, 'fbadl', { g: 'fa-bounce' })}
     ${F.pt('M140 20 l26 9 v22 q0 20 -26 27 q-26 -7 -26 -27 v-22 z', 'fokf fa-glow')}${F.sym(130, 56, 'T', 'fsymw')}
     ${F.b(184, 34, 46, 28, 'fb2', { r: 4 })}${F.sym(196, 54, '123', 'fnums')}
     ${F.cross(96, 78)}`),
  // TS → JS → 重启
  'build-restart': F.S(
    `${F.b(14, 34, 52, 30, 'facc', { r: 5 })}${F.sym(28, 54, 'TS', 'fsymw')}
     ${F.ar(72, 49, 24, 'fl', { g: 'fa-pulse' })}
     ${F.b(104, 34, 52, 30, 'fyf', { r: 5 })}${F.sym(118, 54, 'JS', 'fsymw')}
     ${F.ar(162, 49, 20, 'fl', { g: 'fa-pulse', d: 0.4 })}
     ${F.ci(206, 49, 18, 'fokf fa-spin')}${F.ci(206, 49, 7, 'fb2')}`),
  // 四层结构
  layers: F.S(
    `${[0, 1, 2, 3].map((i) => F.b(30, 14 + i * 20, 180, 16, i === 1 ? 'facc fa-blink' : 'fb', { r: 3, d: i * 0.2 })).join('')}
     ${[0, 1, 2, 3].map((i) => F.sym(216, 26 + i * 20, ['①', '②', '③', '④'][i], 'fsym')).join('')}
     ${[0, 1, 2].map((i) => F.ln(120, 30 + i * 20, 120, 34 + i * 20, 'fl')).join('')}`),
  // 老代码上锁，只加新块
  'add-only': F.S(
    `${[0, 1, 2].map((i) => `${F.b(20 + i * 56, 34, 46, 30, 'fb', { r: 4 })}${F.sym(36 + i * 56, 54, '🔒', 'fsym')}`).join('')}
     ${F.b(188, 34, 44, 30, 'fokf fa-blink', { r: 4 })}${F.sym(204, 55, '+', 'fsymw')}`),
  // 先读再改
  'read-first': F.S(
    `${F.ci(52, 46, 22, 'fb2')}${F.ci(52, 46, 14, 'facc fa-scan')}${F.ln(68, 62, 84, 78, 'fl')}
     ${F.b(112, 16, 116, 72, 'fb2', { r: 5 })}
     ${[0, 1, 2, 3, 4].map((i) => F.ln(122, 30 + i * 13, i % 2 ? 200 : 218, 30 + i * 13, 'fl2 fa-seq', { d: i * 0.2 })).join('')}
     ${F.cross(24, 86)}`),
  // 报错要整段贴
  'full-error': F.S(
    `${F.b(16, 14, 208, 74, 'fb2', { r: 5 })}
     ${[0, 1, 2, 3].map((i) => F.ln(28, 28 + i * 14, 206, 28 + i * 14, 'fbadl fa-seq', { d: i * 0.15 })).join('')}
     ${F.b(24, 20, 190, 42, 'fdash fa-dash', { r: 4 })}
     ${F.sym(112, 96, '↑', 'fsym fbadt')}`),
  // 正常 + 边界都要点一遍
  'edge-cases': F.S(
    `${F.b(20, 24, 80, 52, 'fb2', { r: 5 })}${F.ci(60, 50, 14, 'fokf fa-blink')}${F.tick(53, 49, 'fl2b')}
     ${F.b(136, 24, 84, 52, 'fb2', { r: 5 })}
     ${[0, 1, 2].map((i) => F.b(146, 32 + i * 15, 64, 10, 'fyf fa-seq', { r: 2, d: i * 0.3 })).join('')}
     ${F.sym(54, 94, '✓', 'fsym fokt')}${F.sym(146, 94, '0  −  ␀  ∞', 'ftiny fyt')}`),
  // 强制刷新
  'hard-refresh': F.S(
    `${F.b(50, 18, 140, 60, 'fb2', { r: 6 })}${F.b(50, 18, 140, 12, 'fb', { r: 6 })}
     ${F.b(64, 40, 50, 26, 'fdim', { r: 3 })}${F.sym(74, 58, 'old', 'ftinyw')}
     ${F.b(126, 40, 50, 26, 'fokf fa-blink', { r: 3 })}${F.sym(136, 58, 'new', 'ftinyw')}
     ${F.pt('M204 34 a18 18 0 1 0 6 14', 'fl fa-spin2')}${F.sym(198, 88, 'Ctrl+F5', 'ftiny facct')}`),
  // 经验写回文件
  consolidate: F.S(
    `${F.ci(50, 44, 20, 'fb2')}${F.sym(42, 52, '💡', 'fsym')}
     ${F.ar(78, 46, 26, 'fl', { g: 'fa-pulse' })}
     ${F.b(118, 16, 52, 62, 'facc', { r: 4 })}${[0, 1, 2, 3].map((i) => F.ln(126, 30 + i * 14, 162, 30 + i * 14, 'fl2w')).join('')}
     ${F.ar(178, 46, 22, 'fl', { g: 'fa-pulse', d: 0.4 })}
     ${F.ci(220, 46, 12, 'fokf fa-blink')}${F.sym(215, 51, '∞', 'fsymw')}`),
  // 毕业帽
  graduation: F.S(
    `${F.pt('M120 24 L184 46 L120 68 L56 46 Z', 'facc')}
     ${F.b(104, 58, 32, 18, 'fb', { r: 3 })}
     ${F.ln(178, 48, 178, 74, 'fl')}${F.ci(178, 78, 5, 'fyf fa-blink')}
     ${[0, 1, 2, 3, 4, 5].map((i) => F.ci(24 + i * 38, 14 + (i % 3) * 6, 4, ['fokf', 'fyf', 'fbadf'][i % 3] + ' fa-seq', { d: i * 0.2 })).join('')}`),
};

// 取一张图；key 不存在返回空串，页面不受影响
function Fig(key) {
  if (!key) return '';
  const svg = FIGS[key];
  if (!svg) return '';
  return `<div class="lp-fig">${svg}</div>`;
}
