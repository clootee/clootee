// rabbit.js — 乡村兔子主题动效（仅 body.rabbit 时激活）
// 场景：远处乡村（起伏绿丘 + 老房子 + 老树 + 条纹田地）→ 中央一片木栅围栏地 →
//       围栏里一群兔子随机做动作（发呆/蹦跳/吃胡萝卜/睡觉/洗脸），动作切换周期较慢。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1;
  let lastT = 0, elapsed = 0;
  let hills = [], houses = [], farTrees = [], fields = [], carrots = [], rabbits = [];

  // 围栏地（透视梯形，归一化坐标）：后窄前宽、后高前低。兔子活动区间。
  const PEN = { backY: 0.635, frontY: 0.93, backL: 0.30, backR: 0.70, frontL: 0.13, frontR: 0.87 };

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  // 围栏在给定 y（归一化）处的左右边界与「深度比」（0=最后 1=最前）
  const penDepth = (y) => clamp((y - PEN.backY) / (PEN.frontY - PEN.backY), 0, 1);
  const penLeftAt = (y) => lerp(PEN.backL, PEN.frontL, penDepth(y));
  const penRightAt = (y) => lerp(PEN.backR, PEN.frontR, penDepth(y));
  const rabbitScale = (y) => lerp(0.6, 1.18, penDepth(y)); // 越前越大

  function build() {
    root = document.createElement('div');
    root.id = 'rabbitFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'rabbitCanvas';
    root.appendChild(canvas);
    document.body.appendChild(root);
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', onResize);
    if (!reduced) document.addEventListener('visibilitychange', onVis);
    built = true;
    onResize();
  }

  // ── 生成场景（远景静态元素 + 兔子初始态）──
  function genScene() {
    // 起伏绿丘：两道，后淡前深
    hills = [
      { y: 0.44, amp: 0.05, top: '#bcd8a6', bottom: '#a9cc8f' },
      { y: 0.52, amp: 0.06, top: '#a6cf88', bottom: '#8fbf72' },
    ];
    // 老房子：散在丘上，暖墙灰顶，低饱和（“老”）
    houses = [
      { x: 0.20, y: 0.470, s: 0.030, wall: '#d8c3a2', roof: '#9a7b62', chimney: true },
      { x: 0.72, y: 0.455, s: 0.026, wall: '#cbb79a', roof: '#8d6f58', chimney: false },
      { x: 0.50, y: 0.500, s: 0.034, wall: '#dcc8a6', roof: '#a07f63', chimney: true },
    ];
    // 老树：大而圆的树冠 + 粗树干，靠着房子/丘边
    farTrees = [
      { x: 0.31, y: 0.505, r: 0.052, a: 0.95 },
      { x: 0.63, y: 0.490, r: 0.044, a: 0.92 },
      { x: 0.85, y: 0.520, r: 0.058, a: 0.9 },
      { x: 0.09, y: 0.520, r: 0.05, a: 0.9 },
    ];
    // 条纹田地：两块透视梯形，furrow 条纹
    fields = [
      { x0: 0.02, x1: 0.40, yTop: 0.545, yBot: 0.63, spread: 0.10, hue: 0 },
      { x0: 0.60, x1: 0.98, yTop: 0.545, yBot: 0.63, spread: 0.10, hue: 1 },
    ];
    // 围栏里的胡萝卜（几根，给吃萝卜的兔子当目标）
    carrots = [];
    const cn = 3;
    for (let i = 0; i < cn; i++) {
      const y = rand(PEN.backY + 0.05, PEN.frontY - 0.06);
      const x = rand(penLeftAt(y) + 0.05, penRightAt(y) - 0.05);
      carrots.push({ x, y, taken: false });
    }
    // 兔子群
    rabbits = [];
    const palette = [
      { fur: '#f3ece2', shade: '#ddd2c4', ear: '#f7b9c0' }, // 白
      { fur: '#c9a87f', shade: '#b1906a', ear: '#e2a9a0' }, // 棕
      { fur: '#b8b0a6', shade: '#9c948a', ear: '#e2b6b6' }, // 灰
      { fur: '#e8ddcb', shade: '#d0c4ad', ear: '#f2b6bd' }, // 米
    ];
    const rn = 5;
    for (let i = 0; i < rn; i++) {
      const y = rand(PEN.backY + 0.06, PEN.frontY - 0.05);
      const x = rand(penLeftAt(y) + 0.06, penRightAt(y) - 0.06);
      const col = palette[i % palette.length];
      const r = {
        x, y, bx: x, by: y, tx: x, ty: y,
        col, dir: Math.random() < 0.5 ? -1 : 1,
        st: 'idle', t: 0, dur: rand(2.5, 5),
        hopN: 0, hops: 0, earPh: rand(0, 6.28), blinkAt: rand(1.5, 5), blink: 0,
        target: null, seed: rand(0, 100),
      };
      rabbits.push(r);
    }
  }

  function onResize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    canvas.width = W; canvas.height = H;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    if (!rabbits.length) genScene();
    if (reduced || !raf) drawScene();
  }
  function onVis() { if (document.hidden) stop(); else if (active) start(); }

  // ── 远景 ──
  function drawHill(h) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, h.y * H);
    const seg = 8, step = W / seg;
    for (let i = 0; i <= seg; i++) {
      const x = i * step;
      const y = (h.y + Math.sin(i * 1.3 + h.y * 10) * h.amp) * H;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, h.y * H - h.amp * H, 0, (h.y + 0.18) * H);
    g.addColorStop(0, h.top); g.addColorStop(1, h.bottom);
    ctx.fillStyle = g; ctx.fill();
  }

  function drawHouse(ho) {
    const x = ho.x * W, base = ho.y * H, s = ho.s * H;
    const w = s, h = s * 0.85, left = x - w / 2, top = base - h;
    // 墙
    ctx.fillStyle = ho.wall;
    ctx.fillRect(left, top, w, h);
    // 门 + 窗
    ctx.fillStyle = 'rgba(90,68,50,0.55)';
    ctx.fillRect(left + w * 0.40, base - h * 0.55, w * 0.22, h * 0.55); // 门
    ctx.fillStyle = 'rgba(120,150,170,0.5)';
    ctx.fillRect(left + w * 0.12, top + h * 0.22, w * 0.20, h * 0.24);  // 窗
    // 屋顶（两坡）
    const eave = w * 0.14;
    ctx.fillStyle = ho.roof;
    ctx.beginPath();
    ctx.moveTo(left - eave, top);
    ctx.lineTo(x, top - h * 0.55);
    ctx.lineTo(left + w + eave, top);
    ctx.closePath(); ctx.fill();
    // 烟囱
    if (ho.chimney) {
      ctx.fillStyle = ho.roof;
      ctx.fillRect(left + w * 0.66, top - h * 0.42, w * 0.13, h * 0.34);
    }
  }

  function drawFarTree(t) {
    const x = t.x * W, base = t.y * H, r = t.r * H;
    // 树干
    ctx.fillStyle = 'rgba(96,70,48,0.9)';
    ctx.fillRect(x - r * 0.10, base - r * 0.5, r * 0.20, r * 0.85);
    // 圆润树冠（几团叠加）— 老树的大树冠
    ctx.globalAlpha = t.a;
    const blobs = [[0, -r * 0.9, r * 0.7], [-r * 0.55, -r * 0.65, r * 0.55], [r * 0.55, -r * 0.65, r * 0.55], [0, -r * 1.25, r * 0.55]];
    const g = ctx.createLinearGradient(0, base - r * 1.7, 0, base - r * 0.2);
    g.addColorStop(0, '#8fc06e'); g.addColorStop(1, '#6ba24d');
    ctx.fillStyle = g;
    for (const b of blobs) { ctx.beginPath(); ctx.arc(x + b[0], base + b[1], b[2], 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  // 条纹田地（透视梯形 + furrow 竖条）
  function drawField(f) {
    const yTop = f.yTop * H, yBot = f.yBot * H;
    const stripes = 9;
    for (let i = 0; i < stripes; i++) {
      const a0 = i / stripes, a1 = (i + 1) / stripes;
      // 顶窄底宽（向中心收拢的透视）
      const topL = lerp(f.x0 + f.spread, f.x1 - f.spread, a0) * W;
      const topR = lerp(f.x0 + f.spread, f.x1 - f.spread, a1) * W;
      const botL = lerp(f.x0, f.x1, a0) * W;
      const botR = lerp(f.x0, f.x1, a1) * W;
      ctx.beginPath();
      ctx.moveTo(topL, yTop); ctx.lineTo(topR, yTop);
      ctx.lineTo(botR, yBot); ctx.lineTo(botL, yBot); ctx.closePath();
      const even = (i + f.hue) % 2 === 0;
      ctx.fillStyle = even ? '#c9b978' : '#a7bd6e';
      ctx.fill();
    }
  }

  // ── 围栏（木栅）：后/侧栏先画，前栏后画（兔子夹在中间产生纵深）──
  function fencePost(x, yBase, top, wpx) {
    ctx.fillStyle = '#b58a5b';
    ctx.fillRect(x - wpx / 2, top, wpx, yBase - top);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x - wpx / 2, top, wpx * 0.35, yBase - top);
    ctx.fillStyle = '#7d5a38';
    ctx.beginPath();
    ctx.moveTo(x - wpx / 2, top); ctx.lineTo(x, top - wpx * 0.7); ctx.lineTo(x + wpx / 2, top); ctx.closePath(); ctx.fill();
  }
  function drawRail(x1, y1, x2, y2, th) {
    ctx.strokeStyle = '#a97f52'; ctx.lineWidth = th; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = th * 0.4;
    ctx.beginPath(); ctx.moveTo(x1, y1 - th * 0.28); ctx.lineTo(x2, y2 - th * 0.28); ctx.stroke();
  }

  function drawBackFence() {
    // 后栏（横在 backY）+ 两条侧栏（沿透视边到前）
    const by = PEN.backY;
    const bl = penLeftAt(by), br = penRightAt(by);
    const postTop = (y, l) => (y - 0.045) * H;
    // 后栏两条横杆
    drawRail(bl * W, by * H - 0.028 * H, br * W, by * H - 0.028 * H, 3 * DPR);
    drawRail(bl * W, by * H - 0.05 * H, br * W, by * H - 0.05 * H, 3 * DPR);
    // 后栏柱
    for (let i = 0; i <= 5; i++) {
      const x = lerp(bl, br, i / 5);
      fencePost(x * W, by * H, (by - 0.055) * H, 5 * DPR);
    }
    // 侧栏（左右各一条斜杆，从后到前，前端更粗）
    const fy = PEN.frontY;
    // 左
    drawRail(penLeftAt(by) * W, (by - 0.035) * H, penLeftAt(fy) * W, (fy - 0.06) * H, 3.2 * DPR);
    // 右
    drawRail(penRightAt(by) * W, (by - 0.035) * H, penRightAt(fy) * W, (fy - 0.06) * H, 3.2 * DPR);
    // 侧栏柱（左右各几根，越前越大）
    for (let i = 1; i <= 3; i++) {
      const a = i / 4;
      const yl = lerp(by, fy, a);
      fencePost(penLeftAt(yl) * W, yl * H, (yl - lerp(0.055, 0.085, a)) * H, lerp(5, 8, a) * DPR);
      fencePost(penRightAt(yl) * W, yl * H, (yl - lerp(0.055, 0.085, a)) * H, lerp(5, 8, a) * DPR);
    }
  }

  function drawFrontFence() {
    const fy = PEN.frontY;
    const fl = penLeftAt(fy), fr = penRightAt(fy);
    // 前栏两条横杆（粗，压在兔子前面）
    drawRail(fl * W, fy * H - 0.055 * H, fr * W, fy * H - 0.055 * H, 7 * DPR);
    drawRail(fl * W, fy * H - 0.09 * H, fr * W, fy * H - 0.09 * H, 7 * DPR);
    // 前栏柱
    for (let i = 0; i <= 6; i++) {
      const x = lerp(fl, fr, i / 6);
      fencePost(x * W, fy * H + 0.005 * H, (fy - 0.10) * H, 9 * DPR);
    }
  }

  // 围栏地面（草皮）
  function drawPenGround() {
    ctx.beginPath();
    ctx.moveTo(penLeftAt(PEN.backY) * W, PEN.backY * H);
    ctx.lineTo(penRightAt(PEN.backY) * W, PEN.backY * H);
    ctx.lineTo(penRightAt(PEN.frontY) * W, PEN.frontY * H);
    ctx.lineTo(penLeftAt(PEN.frontY) * W, PEN.frontY * H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, PEN.backY * H, 0, PEN.frontY * H);
    g.addColorStop(0, '#9ec973'); g.addColorStop(1, '#88b85f');
    ctx.fillStyle = g; ctx.fill();
    // 草点缀
    ctx.strokeStyle = 'rgba(80,130,60,0.35)'; ctx.lineWidth = Math.max(1, DPR);
    for (let i = 0; i < 60; i++) {
      const y = lerp(PEN.backY + 0.02, PEN.frontY - 0.02, ((i * 37) % 100) / 100);
      const x = lerp(penLeftAt(y) + 0.02, penRightAt(y) - 0.02, ((i * 61) % 100) / 100);
      const hh = lerp(2, 5, penDepth(y)) * DPR;
      ctx.beginPath(); ctx.moveTo(x * W, y * H); ctx.lineTo(x * W - hh * 0.3, y * H - hh); ctx.stroke();
    }
  }

  function drawCarrot(c, scale) {
    const x = c.x * W, y = c.y * H, u = 0.02 * H * scale;
    // 叶
    ctx.strokeStyle = '#4e9a3a'; ctx.lineWidth = u * 0.18; ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath(); ctx.moveTo(x, y - u * 0.6); ctx.lineTo(x + k * u * 0.35, y - u * 1.3); ctx.stroke();
    }
    // 萝卜身（橙三角）
    ctx.fillStyle = '#e88a30';
    ctx.beginPath(); ctx.moveTo(x - u * 0.32, y - u * 0.6); ctx.lineTo(x + u * 0.32, y - u * 0.6); ctx.lineTo(x, y + u * 0.55); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, DPR * 0.6);
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x - u * 0.2 + k * u * 0.2, y - u * 0.35); ctx.lineTo(x - u * 0.1 + k * u * 0.2, y - u * 0.1); ctx.stroke(); }
  }

  // ── 兔子绘制（按状态摆姿）──
  function drawRabbit(r) {
    const scale = rabbitScale(r.by);
    const u = 0.05 * H * scale;
    const gx = r.bx * W, gy = r.by * H;
    // 影子
    ctx.fillStyle = 'rgba(60,90,40,0.16)';
    ctx.beginPath(); ctx.ellipse(gx, gy + u * 0.06, u * 1.05, u * 0.32, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(r.dir, 1);

    const t = r.t, breathe = Math.sin(elapsed * 2 + r.seed) * 0.04;

    if (r.st === 'sleep') {
      // 趴睡：身体压扁，耳朵后倒，眼闭
      const br = 1 + Math.sin(elapsed * 1.6 + r.seed) * 0.05;
      ctx.fillStyle = r.col.shade;
      ctx.beginPath(); ctx.ellipse(0, -u * 0.34 * br, u * 1.25, u * 0.5 * br, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = r.col.fur;
      ctx.beginPath(); ctx.ellipse(0, -u * 0.42 * br, u * 1.18, u * 0.44 * br, 0, 0, Math.PI * 2); ctx.fill();
      // 头（贴地，前方）
      ctx.beginPath(); ctx.arc(u * 0.95, -u * 0.4, u * 0.42, 0, Math.PI * 2); ctx.fill();
      // 后倒的耳朵
      ctx.fillStyle = r.col.shade;
      ctx.save(); ctx.translate(u * 0.75, -u * 0.55); ctx.rotate(-0.9);
      ctx.beginPath(); ctx.ellipse(0, 0, u * 0.5, u * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // 闭眼
      ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = u * 0.08; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(u * 1.02, -u * 0.44); ctx.lineTo(u * 1.18, -u * 0.44); ctx.stroke();
      // 尾
      ctx.fillStyle = '#fbfaf6';
      ctx.beginPath(); ctx.arc(-u * 1.1, -u * 0.42, u * 0.24, 0, Math.PI * 2); ctx.fill();
      // Zzz
      const zt = (elapsed * 0.6 + r.seed) % 1;
      ctx.fillStyle = `rgba(120,140,160,${0.6 * (1 - zt)})`;
      ctx.font = `${u * (0.5 + zt * 0.4)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('z', u * 1.4, -u * (0.9 + zt * 0.8));
      ctx.restore();
      return;
    }

    // 直立/坐姿系（idle / hop / eat / wash 共用底子）
    const hopLift = r.st === 'hop' ? Math.abs(Math.sin(r.hopN * Math.PI)) : 0;
    const stretch = r.st === 'hop' ? 0.12 * Math.sin(r.hopN * Math.PI) : 0;
    const bodyY = -u * (0.85 + breathe);
    // 身体
    ctx.fillStyle = r.col.shade;
    ctx.beginPath(); ctx.ellipse(0, bodyY, u * (0.82 + stretch), u * (0.78 - stretch * 0.5), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = r.col.fur;
    ctx.beginPath(); ctx.ellipse(-u * 0.06, bodyY - u * 0.04, u * (0.74 + stretch), u * (0.7 - stretch * 0.5), 0, 0, Math.PI * 2); ctx.fill();
    // 后脚
    ctx.fillStyle = r.col.shade;
    ctx.beginPath(); ctx.ellipse(u * 0.5, -u * 0.1, u * 0.42, u * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    // 尾巴
    ctx.fillStyle = '#fbfaf6';
    ctx.beginPath(); ctx.arc(-u * 0.78, bodyY + u * 0.1, u * 0.26, 0, Math.PI * 2); ctx.fill();

    // 头部位置：eat 时低头，其它抬头
    let headX = u * 0.62, headY = bodyY - u * 0.72, headTilt = 0;
    if (r.st === 'eat') {
      const bob = (Math.sin(elapsed * 5 + r.seed) * 0.5 + 0.5);
      headX = u * 0.95; headY = -u * (0.28 + bob * 0.14); headTilt = 0.5;
    }
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(headTilt); // 低头（吃萝卜时）
    // 耳朵（idle 抖动 / hop 后倒）
    ctx.fillStyle = r.col.fur;
    const earBack = r.st === 'hop' ? -0.7 : 0;
    const twitch = r.st === 'idle' ? Math.sin(elapsed * 3 + r.earPh) * 0.12 : 0;
    for (const e of [[-0.18, -0.08 + twitch], [0.16, 0.06 + earBack]]) {
      ctx.save(); ctx.translate(e[0] * u, -u * 0.28); ctx.rotate(e[1]);
      ctx.beginPath(); ctx.ellipse(0, -u * 0.42, u * 0.15, u * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = r.col.ear;
      ctx.beginPath(); ctx.ellipse(0, -u * 0.42, u * 0.07, u * 0.34, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = r.col.fur;
      ctx.restore();
    }
    // 头
    ctx.fillStyle = r.col.fur;
    ctx.beginPath(); ctx.arc(0, 0, u * 0.44, 0, Math.PI * 2); ctx.fill();
    // 眼（眨眼）
    const eyeOpen = r.blink > 0 ? 0.15 : 1;
    ctx.fillStyle = '#3a2e24';
    ctx.beginPath(); ctx.ellipse(u * 0.16, -u * 0.02, u * 0.075, u * 0.11 * eyeOpen, 0, 0, Math.PI * 2); ctx.fill();
    // 鼻
    ctx.fillStyle = '#d98a8a';
    ctx.beginPath(); ctx.ellipse(u * 0.4, u * 0.06, u * 0.06, u * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    // 胡须
    ctx.strokeStyle = 'rgba(120,100,90,0.5)'; ctx.lineWidth = Math.max(1, DPR * 0.6);
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(u * 0.36, u * 0.06); ctx.lineTo(u * 0.72, u * 0.06 + k * u * 0.12); ctx.stroke(); }
    ctx.restore();

    // 洗脸：两只前爪在脸前来回擦
    if (r.st === 'wash') {
      const wipe = Math.sin(elapsed * 9 + r.seed);
      ctx.fillStyle = r.col.fur;
      const px = headX + u * 0.28, py = headY + u * 0.18 + wipe * u * 0.12;
      ctx.beginPath(); ctx.ellipse(px, py, u * 0.14, u * 0.2, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px - u * 0.18, py + u * 0.02, u * 0.12, u * 0.18, 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (r.st === 'idle' || r.st === 'eat') {
      // 前爪
      ctx.fillStyle = r.col.shade;
      ctx.beginPath(); ctx.ellipse(u * 0.5, -u * 0.02, u * 0.16, u * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ── 兔子状态机（切换周期较慢）──
  function chooseNext(r) {
    // 权重：发呆多、其它较均衡；睡觉/吃萝卜时长更久
    const roll = Math.random();
    if (roll < 0.34) { r.st = 'idle'; r.dur = rand(2.8, 5.5); }
    else if (roll < 0.55) { startHop(r); }
    else if (roll < 0.72) { startEat(r); }
    else if (roll < 0.86) { r.st = 'sleep'; r.dur = rand(9, 17); }
    else { r.st = 'wash'; r.dur = rand(3, 5.5); }
    r.t = 0;
  }

  function startHop(r) {
    r.st = 'hop';
    const ty = clamp(r.by + rand(-0.05, 0.05), PEN.backY + 0.05, PEN.frontY - 0.04);
    const tx = clamp(r.bx + rand(-0.14, 0.14), penLeftAt(ty) + 0.05, penRightAt(ty) - 0.05);
    r.fromX = r.bx; r.fromY = r.by; r.tx = tx; r.ty = ty;
    r.dir = tx >= r.bx ? 1 : -1;
    r.hops = Math.max(1, Math.round(Math.abs(tx - r.bx) / 0.05 + 1));
    r.dur = r.hops * rand(0.42, 0.55);
    r.t = 0;
  }

  function startEat(r) {
    // 找最近的胡萝卜，移到它旁边再吃
    let best = null, bd = 1e9;
    for (const c of carrots) {
      const d = Math.hypot(c.x - r.bx, c.y - r.by);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd > 0.02) {
      // 先蹦过去，落点在萝卜旁；到位后由 update 切 eat
      r.st = 'hop'; r.target = best;
      const ty = clamp(best.y, PEN.backY + 0.05, PEN.frontY - 0.04);
      const tx = clamp(best.x - r.dir * 0.03, penLeftAt(ty) + 0.04, penRightAt(ty) - 0.04);
      r.fromX = r.bx; r.fromY = r.by; r.tx = tx; r.ty = ty;
      r.dir = best.x >= r.bx ? 1 : -1;
      r.hops = Math.max(1, Math.round(bd / 0.05 + 1));
      r.dur = r.hops * rand(0.42, 0.55);
    } else {
      r.st = 'eat'; r.dur = rand(4, 7); r.dir = best && best.x < r.bx ? -1 : 1;
    }
    r.t = 0;
  }

  function updateRabbit(r, dt) {
    r.t += dt;
    // 眨眼
    r.blinkAt -= dt;
    if (r.blink > 0) { r.blink -= dt; }
    else if (r.blinkAt <= 0) { r.blink = 0.12; r.blinkAt = rand(2, 6); }

    if (r.st === 'hop') {
      const p = clamp(r.t / r.dur, 0, 1);
      r.hopN = (p * r.hops) % 1;                       // 单次跳的相位 0..1
      r.bx = lerp(r.fromX, r.tx, smooth(p));
      r.by = lerp(r.fromY, r.ty, smooth(p));
      // 跳跃抬升（叠加到绘制 by 上会让影子也动，简单用 by 直接偏移）
      if (p >= 1) {
        if (r.target) { r.st = 'eat'; r.dur = rand(4, 7); r.target = null; r.t = 0; }
        else { r.st = 'idle'; r.dur = rand(1.5, 3.5); r.t = 0; }
      }
    } else if (r.t >= r.dur) {
      chooseNext(r);
    }
  }

  // ── 组装 ──
  function drawScene() {
    ctx.clearRect(0, 0, W, H); // 天空留空 → 透出 CSS 渐变
    // 远景（轻微空气透视：远丘稍淡由配色体现）
    for (const h of hills) drawHill(h);
    for (const t of farTrees) drawFarTree(t);
    for (const ho of houses) drawHouse(ho);
    for (const f of fields) drawField(f);
    // 围栏地
    drawPenGround();
    drawBackFence();
    // 胡萝卜（在兔子之下）
    for (const c of carrots) drawCarrot(c, rabbitScale(c.y));
    // 兔子：按 y 升序（后→前）画
    const order = rabbits.slice().sort((a, b) => a.by - b.by);
    for (const r of order) drawRabbit(r);
    // 前栏（压在兔子前，形成纵深）
    drawFrontFence();
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;
    for (const r of rabbits) updateRabbit(r, dt);
    drawScene();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!built) build();
    if (reduced) { drawScene(); return; }
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.Rabbit = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
