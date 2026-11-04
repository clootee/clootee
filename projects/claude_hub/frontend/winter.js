// winter.js — 冬季主题的雪景动效（仅 body.winter 时激活）
// 场景：远山（两道，淡而朦胧）→ 山间薄雾 → 山坡上一间很小、盖着雪的小木屋（暖窗+炊烟）→ 近处雪地 → 落雪。
// 基调：整体朦胧、留白、低对比，弱化插画感（远景做模糊 + 薄雾叠层营造空气透视）。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1;
  let flakes = [], ridges = [], trees = [], smoke = [];
  let lastT = 0, elapsed = 0, nextSmoke = 0;

  // 很小、很远的小木屋，坐在近山山坡上（x、y 归一化；w/h 以 H 为单位保持比例，取值很小）
  const CABIN = { x: 0.66, y: 0.545, w: 0.032, h: 0.026 };
  const DOOR_X = CABIN.x + 0.012;       // 出入口（山坡上很短一段路）
  const VIEW_X = CABIN.x + 0.05;        // 眺望点
  // 小女孩(红棉衣)+小白狗 状态机：屋里待→走出→眺望→走回
  const cast = { st: 'inside', t: 0, wait: 6, x: DOOR_X, dir: 1, walk: 4, gaze: 6 };

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  function build() {
    root = document.createElement('div');
    root.id = 'winterFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'winterCanvas';
    root.appendChild(canvas);
    document.body.appendChild(root);
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', onResize);
    if (!reduced) document.addEventListener('visibilitychange', onVis);
    built = true;
    onResize();
  }

  function genRidge(baseY, topY, hi, count, top, bottom) {
    const pts = [];
    for (let i = 0; i <= count; i++) {
      const x = -0.08 + (1.16 * i) / count + rand(-0.03, 0.03);
      pts.push({ x, y: rand(topY, hi) });                          // 峰
      if (i < count) pts.push({ x: x + 0.55 / count, y: baseY - rand(0, 0.02) }); // 谷
    }
    return { baseY, topY, pts, top, bottom };
  }

  function genField() {
    const area = window.innerWidth * window.innerHeight;
    // 只两道山：远（更淡更矮、偏高处）→ 近（略深、峰更低）。峰数少 → 山更少。
    ridges = [
      genRidge(0.70, 0.36, 0.46, 3, '#d3dcea', '#e0e8f2'),
      genRidge(0.70, 0.47, 0.57, 3, '#bcc9dc', '#cdd8e8'),
    ];
    // 稀疏、细小、发灰的松树，散落在山坡（弱化数量与存在感，去插画感）
    trees = [];
    const tn = 12;
    for (let i = 0; i < tn; i++) {
      const nearCabin = i < 4;                                     // 少数几棵陪着小屋
      const x = nearCabin ? CABIN.x + rand(-0.06, 0.07) : rand(0.06, 0.94);
      const y = rand(0.585, 0.675);
      trees.push({ x, y, h: rand(0.018, 0.032), a: rand(0.28, 0.5) });
    }
    trees.sort((a, b) => a.y - b.y);
    // 雪花：分层（近大快、远小慢），整体偏柔和
    flakes = [];
    const n = Math.min(220, Math.max(80, Math.round(area / 7200)));
    for (let i = 0; i < n; i++) {
      const depth = rand(0.15, 1);
      flakes.push({
        x: Math.random(), y: Math.random(),
        r: rand(1.0, 3.0) * (1.2 - depth * 0.55),
        v: rand(0.045, 0.11) * (1.25 - depth * 0.6),
        ph: rand(0, Math.PI * 2), sway: rand(0.6, 1.6), amp: rand(0.004, 0.016),
        a: (1.05 - depth) * rand(0.4, 0.75),
      });
    }
  }

  function onResize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    canvas.width = W; canvas.height = H;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    genField();
    if (reduced || !raf) drawScene();
  }

  function onVis() { if (document.hidden) stop(); else if (active) start(); }

  // ── 场景各部分 ──
  function drawRidge(r) {
    ctx.beginPath();
    ctx.moveTo(-0.08 * W, r.baseY * H);
    for (const p of r.pts) ctx.lineTo(p.x * W, p.y * H);
    ctx.lineTo(1.08 * W, r.baseY * H);
    ctx.lineTo(1.08 * W, H); ctx.lineTo(-0.08 * W, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, r.topY * H, 0, r.baseY * H);
    g.addColorStop(0, r.top); g.addColorStop(1, r.bottom);
    ctx.fillStyle = g; ctx.fill();
    // 峰顶淡淡雪痕（低对比，不抢戏）
    ctx.fillStyle = 'rgba(247,250,253,0.55)';
    for (const p of r.pts) {
      if (p.y > r.topY + 0.05) continue;
      const w = 0.018 * W, drop = 0.035 * H;
      ctx.beginPath();
      ctx.moveTo(p.x * W, p.y * H);
      ctx.lineTo(p.x * W - w, p.y * H + drop);
      ctx.quadraticCurveTo(p.x * W, p.y * H + drop * 0.5, p.x * W + w, p.y * H + drop);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawTree(t) {
    const x = t.x * W, base = t.y * H, h = t.h * H;
    ctx.globalAlpha = t.a;
    ctx.fillStyle = '#7c8b82';
    const wBot = h * 0.46;
    for (let k = 0; k < 3; k++) {
      const ty = base - h * (0.30 + k * 0.30);
      const half = wBot * (1 - k * 0.24);
      ctx.beginPath();
      ctx.moveTo(x, ty - h * 0.30);
      ctx.lineTo(x - half, ty);
      ctx.lineTo(x + half, ty);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(244,248,252,0.8)';
    ctx.beginPath(); ctx.arc(x, base - h * 0.86, wBot * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 山间/谷底薄雾：几条柔和横向渐变带，营造朦胧空气感
  function drawHaze() {
    const bands = [
      { y: 0.50, h: 0.09, a: 0.16 },
      { y: 0.585, h: 0.10, a: 0.26 },
      { y: 0.66, h: 0.085, a: 0.34 },
    ];
    for (const b of bands) {
      const g = ctx.createLinearGradient(0, (b.y - b.h) * H, 0, (b.y + b.h) * H);
      g.addColorStop(0, 'rgba(236,243,251,0)');
      g.addColorStop(0.5, `rgba(236,243,251,${b.a})`);
      g.addColorStop(1, 'rgba(236,243,251,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, (b.y - b.h) * H, W, b.h * 2 * H);
    }
  }

  function drawGround() {
    ctx.beginPath();
    ctx.moveTo(0, 0.70 * H);
    const seg = 6, step = W / seg;
    for (let i = 1; i <= seg; i++) {
      const cx = (i - 0.5) * step, cy = (0.70 + Math.sin(i * 1.7) * 0.006) * H;
      ctx.quadraticCurveTo((i - 1) * step, 0.70 * H, cx, cy);
      ctx.quadraticCurveTo(cx, cy, i * step, 0.70 * H);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0.70 * H, 0, H);
    g.addColorStop(0, '#eef3fa');
    g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.fill();
  }

  // 很小、盖着雪的小木屋（暖窗与门分列两侧，绝不重叠）
  function drawCabin() {
    const cx = CABIN.x * W, base = CABIN.y * H;
    const w = CABIN.w * H, h = CABIN.h * H;
    const left = cx - w / 2, top = base - h;
    // 山坡上的一小抔雪堆，让小屋落地不悬空
    ctx.fillStyle = 'rgba(246,250,254,0.9)';
    ctx.beginPath(); ctx.ellipse(cx, base + h * 0.05, w * 0.95, h * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    // 墙体（发灰的暖棕，低饱和）
    ctx.fillStyle = '#6f5847';
    ctx.fillRect(left, top, w, h);
    // 暖窗（左）—— 轻微烛光闪
    const flick = 0.82 + 0.18 * Math.sin(elapsed * 5.5) * Math.sin(elapsed * 2.0);
    const ww = w * 0.26, wh = h * 0.34, wx = left + w * 0.14, wy = top + h * 0.30;
    const glow = ctx.createRadialGradient(wx + ww / 2, wy + wh / 2, 0.5, wx + ww / 2, wy + wh / 2, ww * 2.4);
    glow.addColorStop(0, `rgba(255,210,130,${0.55 * flick})`);
    glow.addColorStop(1, 'rgba(255,210,130,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(wx + ww / 2, wy + wh / 2, ww * 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,214,132,${0.92 * flick})`;
    ctx.fillRect(wx, wy, ww, wh);
    // 门（右）—— 与窗分列，绝不重叠
    const dw = w * 0.24, dh = h * 0.5, dx = left + w * 0.58, dy = base - dh;
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(dx, dy, dw, dh);
    // 屋顶（棕檐 + 厚白雪）
    const eave = w * 0.18, apex = top - h * 0.66;
    ctx.fillStyle = '#4a3626';
    ctx.beginPath();
    ctx.moveTo(left - eave, top); ctx.lineTo(cx, apex); ctx.lineTo(left + w + eave, top); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f6f9fd';
    ctx.beginPath();
    ctx.moveTo(left - eave, top); ctx.lineTo(cx, apex);
    ctx.lineTo(left + w + eave, top);
    ctx.lineTo(left + w + eave, top - h * 0.10);
    ctx.lineTo(cx, apex - h * 0.12);
    ctx.lineTo(left - eave, top - h * 0.10);
    ctx.closePath(); ctx.fill();
    // 墙头一线积雪
    ctx.fillStyle = 'rgba(246,250,254,0.85)';
    ctx.fillRect(left, top, w, h * 0.1);
    // 烟囱（细小）
    const chX = left + w * 0.66, chW = w * 0.12, chTop = top - h * 0.34;
    ctx.fillStyle = '#4a3626'; ctx.fillRect(chX, chTop, chW, h * 0.36);
    ctx.fillStyle = '#f6f9fd'; ctx.fillRect(chX - DPR, chTop - h * 0.06, chW + 2 * DPR, h * 0.07);
  }

  function drawSmoke() {
    for (const s of smoke) {
      ctx.fillStyle = `rgba(226,231,238,${s.a})`;
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── 很小的小女孩 + 小白狗（山坡上的叙事焦点）──
  function drawGirl(gx, gy, dir, moving, phase) {
    const u = 0.02 * H;
    const y = gy + (moving ? Math.sin(phase * 2) * u * 0.04 : 0);
    ctx.save(); ctx.translate(gx, y); ctx.scale(dir, 1);
    ctx.strokeStyle = '#39445c'; ctx.lineWidth = u * 0.16; ctx.lineCap = 'round';
    const sw = moving ? Math.sin(phase * 2) * u * 0.18 : u * 0.06;
    ctx.beginPath(); ctx.moveTo(-u * 0.05, -u * 0.3); ctx.lineTo(-u * 0.05 + sw, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(u * 0.05, -u * 0.3); ctx.lineTo(u * 0.05 - sw, 0); ctx.stroke();
    ctx.fillStyle = '#d1493c';
    ctx.beginPath();
    ctx.moveTo(-u * 0.24, -u * 0.3); ctx.lineTo(u * 0.24, -u * 0.3);
    ctx.lineTo(u * 0.18, -u * 0.8); ctx.lineTo(-u * 0.18, -u * 0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0c6a0';
    ctx.beginPath(); ctx.arc(0, -u * 0.96, u * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b03a2f';
    ctx.beginPath(); ctx.arc(0, -u * 1.02, u * 0.2, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, -u * 1.2, u * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawDog(dx, dy, dir, moving, phase) {
    const u = 0.013 * H;
    ctx.save(); ctx.translate(dx, dy); ctx.scale(dir, 1);
    ctx.fillStyle = '#fdfdff'; ctx.strokeStyle = 'rgba(150,168,190,0.7)'; ctx.lineWidth = Math.max(1, DPR);
    ctx.beginPath(); ctx.ellipse(0, -u * 0.5, u * 0.62, u * 0.36, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = u * 0.2; ctx.lineCap = 'round';
    const sw = moving ? Math.sin(phase * 2) * u * 0.22 : 0;
    ctx.beginPath(); ctx.moveTo(-u * 0.3, -u * 0.26); ctx.lineTo(-u * 0.3 + sw, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(u * 0.3, -u * 0.26); ctx.lineTo(u * 0.3 - sw, 0); ctx.stroke();
    ctx.fillStyle = '#fdfdff'; ctx.strokeStyle = 'rgba(150,168,190,0.7)'; ctx.lineWidth = Math.max(1, DPR);
    ctx.beginPath(); ctx.arc(u * 0.64, -u * 0.72, u * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.arc(u * 0.92, -u * 0.72, u * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fdfdff'; ctx.lineWidth = u * 0.2;
    const wag = Math.sin(elapsed * 8) * u * 0.34;
    ctx.beginPath(); ctx.moveTo(-u * 0.56, -u * 0.6); ctx.quadraticCurveTo(-u * 0.92, -u * 0.82, -u * 0.86 + wag, -u * 1.04); ctx.stroke();
    ctx.restore();
  }

  function updateCast(dt) {
    cast.t += dt;
    switch (cast.st) {
      case 'inside':
        if (cast.t >= cast.wait) { cast.st = 'out'; cast.t = 0; }
        break;
      case 'out':
        cast.x = DOOR_X + (VIEW_X - DOOR_X) * smooth(cast.t / cast.walk); cast.dir = 1;
        if (cast.t >= cast.walk) { cast.st = 'gaze'; cast.t = 0; cast.gaze = rand(5, 9); }
        break;
      case 'gaze':
        cast.x = VIEW_X; cast.dir = 1;
        if (cast.t >= cast.gaze) { cast.st = 'back'; cast.t = 0; }
        break;
      case 'back':
        cast.x = VIEW_X + (DOOR_X - VIEW_X) * smooth(cast.t / cast.walk); cast.dir = -1;
        if (cast.t >= cast.walk) { cast.st = 'inside'; cast.t = 0; cast.wait = rand(8, 15); }
        break;
    }
  }

  function drawCast() {
    if (cast.st === 'inside') return;
    const moving = cast.st === 'out' || cast.st === 'back';
    const gx = cast.x * W, gy = CABIN.y * H, phase = elapsed * 6;
    ctx.fillStyle = 'rgba(90,112,142,0.14)';
    ctx.beginPath(); ctx.ellipse(gx, gy + 1.2 * DPR, 0.013 * H, 0.013 * H * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    const dgx = (cast.x - cast.dir * 0.02) * W;
    ctx.beginPath(); ctx.ellipse(dgx, gy + 1.2 * DPR, 0.009 * H, 0.009 * H * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    drawDog(dgx, gy, cast.dir, moving, phase + 1);
    drawGirl(gx, gy, cast.dir, moving, phase);
  }

  // ── 组装（远→近，远景做模糊营造空气透视/朦胧感）──
  function drawScene() {
    ctx.clearRect(0, 0, W, H);
    // 远山：更模糊
    ctx.save(); ctx.filter = `blur(${2.6 * DPR}px)`; drawRidge(ridges[0]); ctx.restore();
    // 近山 + 松树 + 小屋 + 炊烟：轻度模糊，融进雾里
    ctx.save();
    ctx.filter = `blur(${1.2 * DPR}px)`;
    drawRidge(ridges[1]);
    for (const t of trees) drawTree(t);
    drawCabin();
    drawSmoke();
    ctx.restore();
    // 薄雾叠层
    drawHaze();
    // 山坡上的小女孩与白狗（叙事焦点，仅极轻微模糊，融入雪雾又能看清）
    ctx.save(); ctx.filter = `blur(${0.5 * DPR}px)`; drawCast(); ctx.restore();
    // 近处雪地（清晰）
    drawGround();
    // 落雪（最前层，清晰）
    for (const f of flakes) {
      const x = (f.x + Math.sin(f.ph) * f.amp) * W, y = f.y * H;
      ctx.fillStyle = `rgba(255,255,255,${f.a})`;
      ctx.beginPath(); ctx.arc(x, y, f.r * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;

    // 落雪
    for (const f of flakes) {
      f.y += f.v * dt; f.ph += dt * f.sway;
      if (f.y > 1.04) { f.y = -0.04; f.x = Math.random(); }
    }
    // 炊烟（细小、随小屋烟囱升腾）
    if (elapsed > nextSmoke) {
      const chX = (CABIN.x * W - CABIN.w * H / 2) + CABIN.w * H * 0.72;
      smoke.push({ x: chX / W, y: CABIN.y - CABIN.h - 0.02, r: rand(1.6, 3), a: 0.24, vy: rand(0.02, 0.032), vx: rand(0.002, 0.005), grow: rand(2.5, 4.5) });
      nextSmoke = elapsed + rand(0.7, 1.3);
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const s = smoke[i];
      s.y -= s.vy * dt; s.x += s.vx * dt; s.r += s.grow * dt; s.a -= dt * 0.10;
      if (s.a <= 0) smoke.splice(i, 1);
    }
    updateCast(dt);

    drawScene();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!built) build();
    if (reduced) { drawScene(); return; }     // 尊重减少动态：静态一帧
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.Winter = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
