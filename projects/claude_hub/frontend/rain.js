// rain.js — 雨天窗户主题的动效背景（仅 body.rain 时激活）
// 效果：① 背景斜雨快速下落（失焦朦胧）② 玻璃上凝结的雾珠 ③ 大雨珠沿玻璃下滑并划出湿痕。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1;
  let streaks = [], specks = [], runners = [], trail = [];
  let lastT = 0, elapsed = 0, nextRunner = 0;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  function build() {
    root = document.createElement('div');
    root.id = 'rainFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'rainCanvas';
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
    // 背景斜雨：数量按面积自适应
    streaks = [];
    const n = Math.min(240, Math.max(80, Math.round(area / 6500)));
    for (let i = 0; i < n; i++) {
      streaks.push({
        x: Math.random(), y: Math.random(),
        len: rand(10, 26),          // 屏幕像素（未乘 DPR）
        v: rand(0.9, 1.7),          // 归一化/秒（相对屏高）
        a: rand(0.06, 0.18),
      });
    }
    // 玻璃凝结的雾珠：静态小点，营造起雾质感
    specks = [];
    const m = Math.min(360, Math.max(120, Math.round(area / 4200)));
    for (let i = 0; i < m; i++) {
      specks.push({
        x: Math.random(), y: Math.random(),
        r: rand(0.5, 1.8), a: rand(0.04, 0.13),
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

  function spawnRunner() {
    runners.push({
      x: rand(0.04, 0.96),
      y: rand(-0.04, 0.35),
      r: rand(2.2, 5.2),           // 像素（未乘 DPR）
      vy: 0,
      wob: rand(0, Math.PI * 2),   // 轻微左右摆动相位
    });
  }

  // 大雨珠：偏冷的折射透镜感（顶部高光 + 底部暗边）
  function drawDroplet(cx, cy, r) {
    const R = r * DPR;
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, 'rgba(214,232,244,0.55)');
    g.addColorStop(0.55, 'rgba(150,188,214,0.30)');
    g.addColorStop(1, 'rgba(40,66,84,0.16)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,34,44,0.35)';
    ctx.lineWidth = Math.max(1, R * 0.14);
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(cx - R * 0.32, cy - R * 0.36, R * 0.26, 0, Math.PI * 2); ctx.fill();
  }

  function drawSpecks() {
    for (const s of specks) {
      ctx.fillStyle = `rgba(198,216,228,${s.a})`;
      ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawStreaks() {
    ctx.lineCap = 'round';
    ctx.lineWidth = DPR;
    for (const s of streaks) {
      const x = s.x * W, y = s.y * H;
      const dx = 2.4 * DPR, dy = s.len * DPR;   // 轻微风偏
      const g = ctx.createLinearGradient(x, y, x - dx, y - dy);
      g.addColorStop(0, `rgba(190,214,230,${s.a})`);
      g.addColorStop(1, 'rgba(190,214,230,0)');
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx, y - dy); ctx.stroke();
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    drawSpecks();
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;

    ctx.clearRect(0, 0, W, H);
    drawSpecks();

    // 背景斜雨
    for (const s of streaks) {
      s.y += s.v * dt;
      s.x -= 0.02 * s.v * dt;                 // 风向左偏
      if (s.y > 1.05) { s.y = -0.05; s.x = Math.random(); }
    }
    drawStreaks();

    // 玻璃湿痕（雨珠划过的残留），逐渐变淡
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i];
      p.life -= dt;
      if (p.life <= 0) { trail.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(170,200,220,${0.16 * (p.life / p.max)})`;
      ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r * DPR, 0, Math.PI * 2); ctx.fill();
    }

    // 大雨珠：先凝聚，越大越快下滑，途中留下湿痕
    if (elapsed > nextRunner) { spawnRunner(); nextRunner = elapsed + rand(0.5, 1.6); }
    for (let i = runners.length - 1; i >= 0; i--) {
      const d = runners[i];
      d.vy += (0.02 + d.r * 0.006) * dt;      // 重力加速：大珠更快
      d.y += d.vy * dt;
      d.wob += dt * 3;
      const cx = (d.x + Math.sin(d.wob) * 0.0015) * W;
      const cy = d.y * H;
      if (d.vy > 0.03) {                       // 已在下滑：留湿痕
        trail.push({ x: d.x, y: d.y, r: d.r * 0.5, life: 1.4, max: 1.4 });
      }
      if (d.y > 1.06) { runners.splice(i, 1); continue; }
      drawDroplet(cx, cy, d.r);
    }
    if (runners.length > 90) runners.splice(0, runners.length - 90);
    if (trail.length > 900) trail.splice(0, trail.length - 900);

    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!built) build();
    if (reduced) { drawStatic(); return; }     // 尊重减少动态：只画静态雾面
    if (raf) return;
    lastT = 0;
    nextRunner = elapsed + rand(0.2, 0.8);
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.Rain = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
