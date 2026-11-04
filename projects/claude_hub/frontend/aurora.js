// aurora.js — 极光主题的动效背景（仅 body.aurora 时激活）
// 效果：① 顶部流动的极光帷幔(绿/青/紫，波形起伏、明暗呼吸) ② 星空微闪。（雪归「冬季」主题）
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1;
  let bands = [], stars = [];
  let lastT = 0, elapsed = 0;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  function build() {
    root = document.createElement('div');
    root.id = 'auroraFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'auroraCanvas';
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
    // 极光帷幔：三层不同色/相位，靠上悬垂
    bands = [
      { baseY: 0.16, hue: '74,222,128', amp: 0.05, k: 4.2, sp: 0.28, a: 0.16, ph: 0.0, hgt: 0.42 },
      { baseY: 0.11, hue: '94,234,212', amp: 0.06, k: 3.1, sp: 0.20, a: 0.14, ph: 1.7, hgt: 0.50 },
      { baseY: 0.22, hue: '167,139,250', amp: 0.045, k: 5.0, sp: 0.34, a: 0.11, ph: 3.4, hgt: 0.36 },
    ];
    // 星空（上半屏为主）
    stars = [];
    const n = Math.min(220, Math.max(80, Math.round(area / 7000)));
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random(), y: Math.random() * 0.72,
        r: rand(0.4, 1.5), a: rand(0.2, 0.9),
        tw: Math.random() < 0.4, ph: rand(0, Math.PI * 2), tws: rand(0.6, 2.0),
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
    if (reduced || !raf) drawStatic();
  }

  function onVis() { if (document.hidden) stop(); else if (active) start(); }

  function drawAurora() {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bands) {
      const breath = 0.7 + 0.3 * Math.sin(elapsed * b.sp * 1.3 + b.ph);
      const top = (x01) => {
        const px = x01 * Math.PI * 2 * b.k;
        return (b.baseY
          + b.amp * Math.sin(px + elapsed * b.sp + b.ph)
          + b.amp * 0.5 * Math.sin(px * 2.3 + elapsed * b.sp * 1.7 + b.ph)) * H;
      };
      ctx.beginPath();
      const step = 0.02;
      ctx.moveTo(0, top(0));
      for (let x = step; x <= 1.0001; x += step) ctx.lineTo(x * W, top(x));
      const bottom = (b.baseY + b.hgt) * H;
      ctx.lineTo(W, bottom); ctx.lineTo(0, bottom); ctx.closePath();
      const g = ctx.createLinearGradient(0, b.baseY * H - b.amp * H, 0, bottom);
      g.addColorStop(0, `rgba(${b.hue},${b.a * breath})`);
      g.addColorStop(0.5, `rgba(${b.hue},${b.a * breath * 0.4})`);
      g.addColorStop(1, `rgba(${b.hue},0)`);
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawStars() {
    for (const s of stars) {
      let a = s.a;
      if (!reduced && s.tw) a *= 0.5 + 0.5 * Math.sin(s.ph + elapsed * s.tws);
      ctx.fillStyle = `rgba(230,240,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    drawAurora();
    drawStars();
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;

    ctx.clearRect(0, 0, W, H);
    drawAurora();
    drawStars();

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

  window.Aurora = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
