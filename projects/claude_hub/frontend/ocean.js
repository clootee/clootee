// ocean.js — 大海蓝主题的动效海面（仅 body.ocean 时激活）
// 效果：① 多层横向滚动的海浪(远淡近深、起伏错位) ② 海面月光粼粼(闪烁光斑) ③ 浪尖细碎浪花。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1;
  let layers = [], glints = [], foam = [];
  let lastT = 0, elapsed = 0;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  function build() {
    root = document.createElement('div');
    root.id = 'oceanFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'oceanCanvas';
    root.appendChild(canvas);
    document.body.appendChild(root);
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', onResize);
    if (!reduced) document.addEventListener('visibilitychange', onVis);
    built = true;
    onResize();
  }

  function genField() {
    // 海浪层：远(高、淡、慢) → 近(低、深、快)，靠画面下半部
    layers = [
      { baseY: 0.52, amp: 0.018, k: 2.6, sp: 0.35, col: '90,160,200', a: 0.22 },
      { baseY: 0.62, amp: 0.024, k: 2.1, sp: 0.5, col: '54,128,175', a: 0.30 },
      { baseY: 0.73, amp: 0.030, k: 1.7, sp: 0.7, col: '30,92,140', a: 0.42 },
      { baseY: 0.85, amp: 0.036, k: 1.4, sp: 0.95, col: '16,62,104', a: 0.62 },
    ];
    // 月光粼粼：集中在反射光带(reflection column)内的闪烁光斑
    glints = [];
    const cx = 0.62, halfW = 0.12;                 // 反射带中心/半宽
    const n = 90;
    for (let i = 0; i < n; i++) {
      const spread = (1 - Math.abs(rand(-1, 1))) ;   // 越靠中心越密
      glints.push({
        x: cx + rand(-1, 1) * halfW,
        y: rand(0.5, 0.96),
        len: rand(6, 22) * spread + 4,
        ph: rand(0, Math.PI * 2), sp: rand(1.5, 3.5),
        a: rand(0.1, 0.4),
      });
    }
    // 浪花：浪尖上的细碎白点
    foam = [];
    for (let i = 0; i < 60; i++) {
      foam.push({ x: Math.random(), ly: Math.floor(rand(1, 4)), off: rand(0, 1), ph: rand(0, Math.PI * 2), r: rand(0.6, 1.6) });
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
    if (reduced || !raf) drawStatic();
  }

  function onVis() { if (document.hidden) stop(); else if (active) start(); }

  function waveY(l, x01) {
    const px = x01 * Math.PI * 2 * l.k;
    return (l.baseY
      + l.amp * Math.sin(px + elapsed * l.sp)
      + l.amp * 0.4 * Math.sin(px * 2.7 - elapsed * l.sp * 1.5)) * H;
  }

  function drawLayers() {
    for (const l of layers) {
      ctx.beginPath();
      ctx.moveTo(0, waveY(l, 0));
      const step = 0.02;
      for (let x = step; x <= 1.0001; x += step) ctx.lineTo(x * W, waveY(l, x));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      const g = ctx.createLinearGradient(0, l.baseY * H - l.amp * H, 0, H);
      g.addColorStop(0, `rgba(${l.col},${l.a})`);
      g.addColorStop(1, `rgba(${l.col},${Math.min(1, l.a + 0.25)})`);
      ctx.fillStyle = g;
      ctx.fill();
      // 浪尖高光线
      ctx.strokeStyle = `rgba(150,200,230,${l.a * 0.5})`;
      ctx.lineWidth = DPR;
      ctx.beginPath();
      ctx.moveTo(0, waveY(l, 0));
      for (let x = step; x <= 1.0001; x += step) ctx.lineTo(x * W, waveY(l, x));
      ctx.stroke();
    }
  }

  function drawGlints() {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const g of glints) {
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(g.ph + elapsed * g.sp));
      const a = g.a * tw;
      if (a < 0.03) continue;
      const x = g.x * W, y = g.y * H, len = g.len * DPR;
      ctx.strokeStyle = `rgba(210,232,248,${a})`;
      ctx.lineWidth = 1.6 * DPR;
      ctx.beginPath(); ctx.moveTo(x - len / 2, y); ctx.lineTo(x + len / 2, y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFoam() {
    for (const f of foam) {
      const l = layers[f.ly]; if (!l) continue;
      const x01 = (f.x + f.off) % 1;
      const y = waveY(l, x01) + Math.sin(f.ph) * 1.5 * DPR;
      const a = 0.35 + 0.35 * Math.sin(f.ph + elapsed * 2);
      ctx.fillStyle = `rgba(235,246,252,${Math.max(0, a) * 0.7})`;
      ctx.beginPath(); ctx.arc(x01 * W, y, f.r * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    drawLayers();
    drawGlints();
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;

    ctx.clearRect(0, 0, W, H);
    drawLayers();
    drawGlints();
    for (const f of foam) f.ph += dt * 2.2;
    drawFoam();

    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!built) build();
    if (reduced) { drawStatic(); return; }     // 尊重减少动态：只画静态一帧
    if (raf) return;
    lastT = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.Ocean = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
