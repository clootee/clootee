// bamboo.js — 森林绿主题的动效背景（仅 body.green 时激活）
// 效果：① 多层景深的竹竿（带竹节），随微风整体轻摆，越靠前越清晰浓绿 ② 竿梢的竹叶簇随风摇曳
//        ③ 缓缓飘落、旋转打转的竹叶。整体是清新的浅绿林间光感。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1;
  let culms = [], leaves = [];
  let lastT = 0, elapsed = 0, nextLeaf = 0;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  // 竹色：由后景(偏浅雾绿)到前景(浓翠绿)线性插值。depth 0=最前 1=最后。
  const lerp = (a, b, t) => a + (b - a) * t;
  function culmColor(depth, light) {
    // light: 0 暗侧 1 亮侧
    const r = lerp(lerp(58, 150, depth), lerp(120, 190, depth), light);
    const g = lerp(lerp(140, 195, depth), lerp(190, 220, depth), light);
    const b = lerp(lerp(62, 150, depth), lerp(96, 165, depth), light);
    return [Math.round(r), Math.round(g), Math.round(b)];
  }

  function build() {
    root = document.createElement('div');
    root.id = 'bambooFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'bambooCanvas';
    root.appendChild(canvas);
    document.body.appendChild(root);
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', onResize);
    if (!reduced) document.addEventListener('visibilitychange', onVis);
    built = true;
    onResize();
  }

  function genField() {
    const area = window.innerWidth * window.innerHeight;
    // 竹竿：按景深分布，靠边分布更密，中间留白给对话区
    culms = [];
    const n = Math.min(14, Math.max(6, Math.round(area / 130000)));
    for (let i = 0; i < n; i++) {
      // x 偏向两侧（用平方把点往 0/1 推）
      let x = Math.random();
      x = x < 0.5 ? 0.5 - Math.pow(1 - x * 2, 1.6) * 0.5 : 0.5 + Math.pow((x - 0.5) * 2, 1.6) * 0.5;
      const depth = rand(0, 1);
      culms.push({
        x,
        depth,
        w: lerp(26, 9, depth),                 // 底部宽度（px，未乘 DPR），前粗后细
        top: rand(-0.08, 0.12),                // 竿顶归一化 y（可略出屏）
        sway: rand(0.008, 0.02) * (1.1 - depth * 0.5),
        sp: rand(0.25, 0.5),
        ph: rand(0, Math.PI * 2),
        nodes: Math.round(rand(4, 7)),         // 竹节数
        side: Math.random() < 0.5 ? -1 : 1,    // 叶簇朝向
      });
    }
    culms.sort((a, b) => b.depth - a.depth);   // 后景先画
    leaves = [];
  }

  function onResize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    canvas.width = W; canvas.height = H;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    genField();
    if (reduced || !raf) drawStatic();
  }

  function onVis() { if (document.hidden) stop(); else if (active) start(); }

  function spawnLeaf() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    leaves.push({
      x: rand(0.05, 0.95), y: -0.05,
      s: rand(0.7, 1.5),
      vy: rand(0.03, 0.07), vx: dir * rand(0.006, 0.02),
      rot: rand(0, Math.PI * 2), vr: dir * rand(0.6, 1.4),
      ph: rand(0, Math.PI * 2),
      a: rand(0.28, 0.55),
    });
  }

  // 一片竹叶（细长、两端尖），已在调用处 translate/rotate/scale
  function leafPath(len, wid) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
    ctx.closePath();
  }

  function drawLeafCluster(x, y, dir, s, depth, wind) {
    const [r, g, b] = culmColor(depth, 0.55);
    ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
    const blades = 5;
    for (let i = 0; i < blades; i++) {
      const ang = dir * (0.15 + i * 0.32) + Math.sin(wind + i) * 0.05;
      ctx.save();
      ctx.translate(x, y - i * 2 * s);
      ctx.rotate(ang);
      leafPath(30 * s, 5 * s);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCulm(c) {
    const wind = Math.sin(elapsed * c.sp + c.ph);
    const baseX = c.x * W;
    const topY = c.top * H, botY = H * 1.02;
    const halfBase = c.w * 0.5 * DPR;
    const halfTop = halfBase * 0.55;
    const N = 10;
    const [dr, dg, db] = culmColor(c.depth, 0.15);   // 暗侧
    const [lr, lg, lb] = culmColor(c.depth, 0.95);   // 亮侧
    const alpha = lerp(0.7, 0.22, c.depth);

    // 采样中心线（越往上摆动越大）
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;                       // 0 底 → 1 顶
      const y = lerp(botY, topY, t);
      const bend = c.sway * Math.pow(t, 1.7) * wind * W;
      const half = lerp(halfBase, halfTop, t);
      pts.push({ x: baseX + bend, y, half });
    }
    // 竿身：左右边缘构成多边形，横向渐变（暗→亮）模拟圆柱高光
    ctx.beginPath();
    ctx.moveTo(pts[0].x - pts[0].half, pts[0].y);
    for (let i = 1; i <= N; i++) ctx.lineTo(pts[i].x - pts[i].half, pts[i].y);
    for (let i = N; i >= 0; i--) ctx.lineTo(pts[i].x + pts[i].half, pts[i].y);
    ctx.closePath();
    const gx = ctx.createLinearGradient(baseX - halfBase, 0, baseX + halfBase, 0);
    gx.addColorStop(0, `rgba(${dr},${dg},${db},${alpha})`);
    gx.addColorStop(0.4, `rgba(${lr},${lg},${lb},${alpha})`);
    gx.addColorStop(1, `rgba(${dr},${dg},${db},${alpha})`);
    ctx.fillStyle = gx;
    ctx.fill();

    // 竹节：暗环 + 上方细高光
    ctx.lineCap = 'round';
    for (let k = 1; k <= c.nodes; k++) {
      const t = k / (c.nodes + 0.4);
      const idx = t * N;
      const i0 = Math.min(N - 1, Math.floor(idx));
      const f = idx - i0;
      const cx = lerp(pts[i0].x, pts[i0 + 1].x, f);
      const cy = lerp(pts[i0].y, pts[i0 + 1].y, f);
      const half = lerp(pts[i0].half, pts[i0 + 1].half, f);
      ctx.strokeStyle = `rgba(${dr},${dg},${db},${alpha})`;
      ctx.lineWidth = Math.max(1.4, half * 0.28);
      ctx.beginPath();
      ctx.moveTo(cx - half, cy + half * 0.16);
      ctx.lineTo(cx + half, cy + half * 0.16);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${lr},${lg},${lb},${alpha * 0.8})`;
      ctx.lineWidth = Math.max(1, half * 0.16);
      ctx.beginPath();
      ctx.moveTo(cx - half, cy - half * 0.12);
      ctx.lineTo(cx + half, cy - half * 0.12);
      ctx.stroke();
    }

    // 竿梢叶簇
    const tp = pts[N];
    drawLeafCluster(tp.x, tp.y, c.side, lerp(1.3, 0.7, c.depth), c.depth, elapsed * c.sp + c.ph);
  }

  function drawFallingLeaf(l) {
    const x = l.x * W, y = l.y * H, s = l.s * DPR;
    const [r, g, b] = culmColor(0.4, 0.6);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(l.rot + Math.sin(l.ph) * 0.4);
    ctx.fillStyle = `rgba(${r},${g},${b},${l.a})`;
    leafPath(18 * s, 3.4 * s);
    ctx.fill();
    // 叶脉
    ctx.strokeStyle = `rgba(${Math.round(r * 0.7)},${Math.round(g * 0.8)},${Math.round(b * 0.7)},${l.a})`;
    ctx.lineWidth = Math.max(0.6, 0.8 * s);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18 * s, 0); ctx.stroke();
    ctx.restore();
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    for (const c of culms) drawCulm(c);
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;

    ctx.clearRect(0, 0, W, H);
    for (const c of culms) drawCulm(c);

    // 飘落竹叶
    if (elapsed > nextLeaf && leaves.length < 14) { spawnLeaf(); nextLeaf = elapsed + rand(1.2, 3.2); }
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.y += l.vy * dt;
      l.x += (l.vx + Math.sin(l.ph) * 0.01) * dt;
      l.rot += l.vr * dt; l.ph += dt * 1.6;
      if (l.y > 1.1) { leaves.splice(i, 1); continue; }
      drawFallingLeaf(l);
    }

    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!built) build();
    if (reduced) { drawStatic(); return; }
    if (raf) return;
    lastT = 0;
    nextLeaf = elapsed + rand(0.5, 2);
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.Bamboo = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
