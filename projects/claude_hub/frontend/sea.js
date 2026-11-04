// sea.js — 深海主题的动效背景（仅 body.sea 时激活）
// 效果：① 顶部摇曳的光柱(god rays) ② 缓缓上浮、左右轻摆的气泡 ③ 偶尔飘过的发光水母与小鱼群。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1;
  let bubbles = [], rays = [], jellies = [], schools = [], whales = [], sharks = [];
  let lastT = 0, elapsed = 0, nextJelly = 0, nextSchool = 0, nextWhale = 0, nextShark = 0;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  function build() {
    root = document.createElement('div');
    root.id = 'seaFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'seaCanvas';
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
    // 气泡
    bubbles = [];
    const n = Math.min(130, Math.max(40, Math.round(area / 9000)));
    for (let i = 0; i < n; i++) {
      bubbles.push({
        x: Math.random(), y: Math.random(),
        r: rand(1.2, 5.5),            // 像素（未乘 DPR）
        v: rand(0.03, 0.10),          // 上浮速度（归一化/秒）
        ph: rand(0, Math.PI * 2), amp: rand(0.002, 0.012),
        a: rand(0.12, 0.4),
      });
    }
    // 顶部光柱：数量固定，位置/角度随机
    rays = [];
    const m = 4;
    for (let i = 0; i < m; i++) {
      rays.push({
        x: rand(0.1, 0.9), w: rand(0.05, 0.14), slant: rand(-0.12, 0.12),
        a: rand(0.05, 0.11), ph: rand(0, Math.PI * 2), sp: rand(0.2, 0.5),
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

  function spawnJelly() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    jellies.push({
      x: rand(0.15, 0.85), y: 1.12,           // 从底部升起
      s: rand(0.7, 1.4),                       // 缩放
      vy: rand(0.02, 0.045), vx: dir * rand(0.004, 0.012),
      ph: rand(0, Math.PI * 2),                // 伞盖脉动相位
      hue: Math.random() < 0.5 ? '120,230,240' : '150,180,255',
    });
  }
  function spawnSchool() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y0 = rand(0.25, 0.8), n = Math.round(rand(6, 11));
    const members = [];
    for (let i = 0; i < n; i++) {
      members.push({ ox: rand(-0.05, 0.05), oy: rand(-0.05, 0.05), ph: rand(0, Math.PI * 2), sc: rand(0.7, 1.2) });
    }
    schools.push({ x: dir === 1 ? -0.1 : 1.1, y: y0, dir, vx: dir * rand(0.05, 0.09), members });
  }

  // 每 3 分钟一只很大的鲸鱼优雅地游过（缓慢巡游 + 身体起伏 + 尾鳍摆动 + 胸鳍轻划）
  function spawnWhale() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y0 = rand(0.34, 0.66);
    whales.push({
      x: dir === 1 ? -0.28 : 1.28, y: y0, y0, dir,
      vx: dir * rand(0.017, 0.024),   // 归一化/秒，横穿约 60~90s，从容优雅
      s: rand(4.8, 6.6),              // 巨大（约为原来 3 倍，且随机大小范围）
      ph: rand(0, Math.PI * 2),       // 摆尾/起伏相位
    });
  }

  function drawWhale(w) {
    const S = w.s * DPR;
    const flap = Math.sin(w.ph) * 0.32;          // 尾鳍摆动
    const swim = Math.sin(w.ph * 0.6);           // 巡游俯仰/起伏
    const fin = Math.sin(w.ph * 0.9 + 0.7) * 0.16;
    ctx.save();
    ctx.translate(w.x * W, w.y * H);
    ctx.scale(w.dir, 1);                          // 按方向水平翻转（头朝前）
    ctx.rotate(swim * 0.05);                      // 优雅俯仰
    ctx.scale(S, S);

    // 体外柔光（幽蓝辉光包裹，衬托庞大身躯）
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(0, 0, 12, 0, 0, 100);
    ag.addColorStop(0, 'rgba(95,195,225,0.12)');
    ag.addColorStop(1, 'rgba(95,195,225,0)');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(0, 2, 100, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // 体色渐变（背深腹浅）+ 发光轮廓
    const bg = ctx.createLinearGradient(0, -26, 0, 30);
    bg.addColorStop(0, 'rgba(120,205,232,0.58)');
    bg.addColorStop(0.55, 'rgba(70,160,198,0.52)');
    bg.addColorStop(1, 'rgba(42,112,152,0.5)');
    ctx.fillStyle = bg;
    ctx.strokeStyle = 'rgba(175,240,252,0.42)';
    ctx.lineWidth = 1.3;

    // 尾鳍（在身体之后绘制，随 flap 摆动的宽大新月尾叉）
    ctx.save();
    ctx.translate(-48, 4); ctx.rotate(flap);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(-14, -6, -31, -21);       // 上叶尖
    ctx.quadraticCurveTo(-18, -9, -14, -2);         // 上叶内缘
    ctx.quadraticCurveTo(-16, 3, -14, 7);           // 中央尾叉凹口
    ctx.quadraticCurveTo(-18, 13, -31, 25);         // 下叶尖
    ctx.quadraticCurveTo(-14, 11, 4, 4);            // 回到尾柄
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // 身体（丰满的须鲸身形）
    ctx.beginPath();
    ctx.moveTo(-48, 3);
    ctx.bezierCurveTo(-28, -18, 8, -24, 38, -16);    // 背线上扬
    ctx.bezierCurveTo(56, -11, 64, -1, 61, 7);        // 头部圆钝
    ctx.bezierCurveTo(58, 15, 49, 19, 38, 19);        // 下颚
    ctx.bezierCurveTo(12, 23, -26, 23, -48, 8);       // 腹线回到尾柄
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 背鳍（靠后的小三角）
    ctx.beginPath();
    ctx.moveTo(-30, -15);
    ctx.quadraticCurveTo(-25, -25, -17, -18);
    ctx.quadraticCurveTo(-22, -15, -25, -14);
    ctx.closePath();
    ctx.fill();

    // 腹部纹沟（须鲸喉腹褶）
    ctx.strokeStyle = 'rgba(150,220,240,0.22)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 4; i++) {
      const gx = 44 - i * 16;
      ctx.beginPath();
      ctx.moveTo(gx, 15); ctx.quadraticCurveTo(gx - 6, 8, gx - 12, 12);
      ctx.stroke();
    }

    // 胸鳍（近侧，轻轻划水）
    ctx.save();
    ctx.translate(26, 13); ctx.rotate(fin);
    ctx.fillStyle = 'rgba(56,138,178,0.6)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-7, 15, -18, 21);
    ctx.quadraticCurveTo(-5, 11, -2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 眼睛
    ctx.fillStyle = 'rgba(12,30,42,0.85)';
    ctx.beginPath(); ctx.arc(47, 5, 1.7, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // 偶尔一条鲨鱼悠然游过（比鲸鱼更小、身形更修长，速度更快）
  function spawnShark() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y0 = rand(0.3, 0.7);
    sharks.push({
      x: dir === 1 ? -0.3 : 1.3, y: y0, y0, dir,
      vx: dir * rand(0.05, 0.075),    // 更快
      s: rand(1.8, 2.6),
      ph: rand(0, Math.PI * 2),
    });
  }

  function drawShark(k) {
    const S = k.s * DPR;
    const flap = Math.sin(k.ph) * 0.28;
    const swim = Math.sin(k.ph * 0.6);
    const fin = Math.sin(k.ph * 0.9 + 0.6) * 0.12;
    ctx.save();
    ctx.translate(k.x * W, k.y * H);
    ctx.scale(k.dir, 1);
    ctx.rotate(swim * 0.04);
    ctx.scale(S, S);

    // 体外柔光
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(0, 0, 10, 0, 0, 96);
    ag.addColorStop(0, 'rgba(120,160,185,0.10)');
    ag.addColorStop(1, 'rgba(120,160,185,0)');
    ctx.fillStyle = ag;
    ctx.beginPath(); ctx.arc(0, 0, 96, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // 体色（背青灰、腹浅）+ 发光轮廓
    const bg = ctx.createLinearGradient(0, -14, 0, 12);
    bg.addColorStop(0, 'rgba(120,150,170,0.6)');
    bg.addColorStop(0.55, 'rgba(78,108,132,0.55)');
    bg.addColorStop(1, 'rgba(150,180,196,0.5)');
    ctx.fillStyle = bg;
    ctx.strokeStyle = 'rgba(190,225,240,0.4)';
    ctx.lineWidth = 1.2;

    // 尾鳍（歪尾：上叶更长，随 flap 摆动）
    ctx.save();
    ctx.translate(-58, 3); ctx.rotate(flap);
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(-26, -28);       // 长上叶
    ctx.lineTo(-14, -4);
    ctx.lineTo(-18, 2);
    ctx.lineTo(-11, 13);        // 短下叶
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // 修长身体 + 尖吻
    ctx.beginPath();
    ctx.moveTo(-58, 2);
    ctx.bezierCurveTo(-34, -13, 6, -15, 40, -11);
    ctx.quadraticCurveTo(64, -8, 80, -1);        // 尖吻
    ctx.quadraticCurveTo(64, 6, 40, 9);
    ctx.bezierCurveTo(6, 13, -34, 12, -58, 6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // 高耸背鳍（后掠三角）
    ctx.beginPath();
    ctx.moveTo(-8, -13);
    ctx.lineTo(2, -34);
    ctx.lineTo(16, -11);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 小后背鳍
    ctx.beginPath();
    ctx.moveTo(-40, -10);
    ctx.lineTo(-34, -19);
    ctx.lineTo(-28, -9);
    ctx.closePath();
    ctx.fill();

    // 胸鳍（后掠）
    ctx.save();
    ctx.translate(32, 8); ctx.rotate(fin);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-20, 22);
    ctx.lineTo(2, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 鳃裂
    ctx.strokeStyle = 'rgba(60,85,105,0.5)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const gx = 46 - i * 5;
      ctx.beginPath();
      ctx.moveTo(gx, -7); ctx.quadraticCurveTo(gx - 2, 0, gx, 7);
      ctx.stroke();
    }

    // 眼睛
    ctx.fillStyle = 'rgba(10,22,30,0.9)';
    ctx.beginPath(); ctx.arc(58, -1, 1.5, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawRays() {
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rays) {
      const sway = Math.sin(elapsed * r.sp + r.ph) * 0.02;
      const topX = (r.x + sway) * W;
      const botX = (r.x + sway + r.slant) * W;
      const halfTop = r.w * 0.5 * W, halfBot = r.w * 1.4 * 0.5 * W;
      const a = r.a * (0.7 + 0.3 * Math.sin(elapsed * r.sp * 1.3 + r.ph));
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(150,225,240,${a})`);
      g.addColorStop(1, 'rgba(150,225,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(topX - halfTop, 0); ctx.lineTo(topX + halfTop, 0);
      ctx.lineTo(botX + halfBot, H); ctx.lineTo(botX - halfBot, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBubbles() {
    for (const b of bubbles) {
      const x = (b.x + Math.sin(b.ph) * b.amp) * W, y = b.y * H, R = b.r * DPR;
      ctx.strokeStyle = `rgba(200,238,248,${b.a})`;
      ctx.lineWidth = Math.max(1, R * 0.16);
      ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${b.a * 0.7})`;
      ctx.beginPath(); ctx.arc(x - R * 0.3, y - R * 0.3, R * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawJelly(j) {
    const x = j.x * W, y = j.y * H, s = j.s * DPR;
    const pulse = 0.85 + 0.15 * Math.sin(j.ph);
    const bw = 22 * s * pulse, bh = 18 * s;
    ctx.globalCompositeOperation = 'lighter';
    // 伞盖辉光
    const g = ctx.createRadialGradient(x, y, 2 * s, x, y, bw * 1.3);
    g.addColorStop(0, `rgba(${j.hue},0.42)`);
    g.addColorStop(0.6, `rgba(${j.hue},0.16)`);
    g.addColorStop(1, `rgba(${j.hue},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, bw, bh, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y, bw, bh * 0.5, 0, 0, Math.PI); ctx.fill();
    // 触须
    ctx.strokeStyle = `rgba(${j.hue},0.28)`;
    ctx.lineWidth = 1.4 * s;
    for (let i = 0; i < 5; i++) {
      const tx = x + (i - 2) * bw * 0.32;
      ctx.beginPath();
      ctx.moveTo(tx, y);
      for (let k = 1; k <= 4; k++) {
        const ty = y + k * 9 * s;
        const wob = Math.sin(j.ph * 1.4 + i + k * 0.7) * 3 * s;
        ctx.lineTo(tx + wob, ty);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFish(x, y, dir, s) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = 'rgba(130,220,235,0.55)';
    ctx.beginPath();                                   // 身体
    ctx.ellipse(0, 0, 6 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();                                   // 尾鳍
    ctx.moveTo(-5 * s, 0); ctx.lineTo(-10 * s, -3.2 * s); ctx.lineTo(-10 * s, 3.2 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    drawRays();
    drawBubbles();
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;

    ctx.clearRect(0, 0, W, H);
    drawRays();

    // 气泡上浮
    for (const b of bubbles) {
      b.y -= b.v * dt; b.ph += dt * 1.4;
      if (b.y < -0.05) { b.y = 1.05; b.x = Math.random(); }
    }
    drawBubbles();

    // 水母
    if (elapsed > nextJelly && jellies.length < 2) { spawnJelly(); nextJelly = elapsed + rand(10, 24); }
    for (let i = jellies.length - 1; i >= 0; i--) {
      const j = jellies[i];
      j.y -= j.vy * dt; j.x += j.vx * dt; j.ph += dt * 2.2;
      if (j.y < -0.15) { jellies.splice(i, 1); continue; }
      drawJelly(j);
    }

    // 鱼群
    if (elapsed > nextSchool && schools.length < 1) { spawnSchool(); nextSchool = elapsed + rand(16, 34); }
    for (let i = schools.length - 1; i >= 0; i--) {
      const sc = schools[i];
      sc.x += sc.vx * dt;
      if (sc.x < -0.2 || sc.x > 1.2) { schools.splice(i, 1); continue; }
      for (const m of sc.members) {
        m.ph += dt * 6;
        const fx = (sc.x + m.ox) * W;
        const fy = (sc.y + m.oy + Math.sin(m.ph) * 0.006) * H;
        drawFish(fx, fy, sc.dir, m.sc * DPR);
      }
    }

    // 鲸鱼：每 3 分钟一只，缓缓优雅横穿
    if (elapsed > nextWhale && whales.length < 1) { spawnWhale(); nextWhale = elapsed + 180; }
    for (let i = whales.length - 1; i >= 0; i--) {
      const w = whales[i];
      w.x += w.vx * dt; w.ph += dt * 1.1;
      w.y = w.y0 + Math.sin(w.ph * 0.6) * 0.02;      // 轻柔上下起伏
      if (w.x < -0.35 || w.x > 1.35) { whales.splice(i, 1); continue; }
      drawWhale(w);
    }

    // 鲨鱼：偶尔一条，速度更快
    if (elapsed > nextShark && sharks.length < 1) { spawnShark(); nextShark = elapsed + rand(120, 240); }
    for (let i = sharks.length - 1; i >= 0; i--) {
      const k = sharks[i];
      k.x += k.vx * dt; k.ph += dt * 1.6;
      k.y = k.y0 + Math.sin(k.ph * 0.6) * 0.018;
      if (k.x < -0.4 || k.x > 1.4) { sharks.splice(i, 1); continue; }
      drawShark(k);
    }

    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!built) build();
    if (reduced) { drawStatic(); return; }     // 尊重减少动态：只画静态一帧
    if (raf) return;
    lastT = 0;
    nextJelly = elapsed + rand(3, 8);
    nextSchool = elapsed + rand(6, 14);
    nextWhale = elapsed + rand(12, 22);        // 首只鲸鱼稍早登场，之后每 3 分钟一只
    nextShark = elapsed + rand(35, 70);        // 鲨鱼偶尔登场
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.Sea = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
