// galaxy.js — 银河系主题的动态星空背景（仅 body.galaxy 时激活）
// 效果：鼠标视差(整体轻微移动)、部分星星闪烁、稀有流星、偶尔飞船飞过、远处不规则星系微光。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1;
  let stars = [], farObjs = [], meteors = [], ships = [];
  let mx = 0, my = 0, tmx = 0, tmy = 0;      // 平滑/目标视差偏移（-1..1）
  let lastT = 0, elapsed = 0, nextMeteor = 0, nextShip = 0;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  function build() {
    root = document.createElement('div');
    root.id = 'galaxyFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'galaxyCanvas';
    root.appendChild(canvas);
    document.body.appendChild(root);
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', onResize);
    if (!reduced) {
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('deviceorientation', onTilt, { passive: true });
      document.addEventListener('visibilitychange', onVis);
    }
    built = true;
    onResize();
  }

  function genField() {
    // 星星：数量按屏幕面积自适应；depth 小=近(视差大、略大)，大=远(视差小)
    stars = [];
    const area = (window.innerWidth * window.innerHeight);
    const n = Math.min(460, Math.max(140, Math.round(area / 3200)));
    for (let i = 0; i < n; i++) {
      const depth = rand(0.12, 1);
      stars.push({
        x: Math.random(), y: Math.random(),
        r: rand(0.4, 1.7) * (1.25 - depth * 0.5),
        a: rand(0.22, 0.95),
        tw: Math.random() < 0.32,          // 约 1/3 闪烁
        ph: rand(0, Math.PI * 2),
        tws: rand(0.5, 2.1),
        depth,
        c: Math.random() < 0.82 ? '255,255,255'
          : (Math.random() < 0.5 ? '200,214,255' : '226,210,255'),
      });
    }
    // 远处「小信息」：少量微弱星系/星团椭圆光斑，随机不规则，不重复
    farObjs = [];
    const m = Math.round(rand(4, 8));
    for (let i = 0; i < m; i++) {
      farObjs.push({
        x: Math.random(), y: Math.random(),
        rx: rand(20, 52), ry: rand(8, 22), rot: rand(0, Math.PI),
        a: rand(0.05, 0.11),
        c: Math.random() < 0.5 ? '168,130,246' : '120,180,240',
        depth: rand(0.75, 1),
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
    if (reduced || !raf) drawFrame(0); // 静止模式/未运行时也画一帧
  }

  function onMove(e) {
    tmx = (e.clientX / window.innerWidth - 0.5) * 2;
    tmy = (e.clientY / window.innerHeight - 0.5) * 2;
  }
  function onTilt(e) {
    if (e.gamma == null || e.beta == null) return;
    tmx = Math.max(-1, Math.min(1, e.gamma / 30));
    tmy = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  }
  function onVis() { if (document.hidden) stop(); else if (active) start(); }

  function spawnMeteor() {
    const fromLeft = Math.random() < 0.5;
    const ang = rand(Math.PI * 0.12, Math.PI * 0.30);
    const speed = rand(0.5, 0.9);
    const dir = fromLeft ? 1 : -1;
    meteors.push({
      x: rand(0.08, 0.92), y: rand(-0.05, 0.22),
      vx: Math.cos(ang) * speed * dir, vy: Math.sin(ang) * speed,
      life: 0, max: rand(0.7, 1.2), len: rand(90, 190),
    });
  }
  function spawnShip() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    // 略微倾斜（机头微微上扬），不完全水平；随机 ~4°~9°
    const tilt = rand(0.07, 0.16);
    const speed = rand(0.05, 0.09);
    // 行进方向必须与倾角一致：机头朝斜上方，就朝斜上方飞。
    // y 用高度占比、x 用宽度占比，故给 vy 乘 W/H 做纵横比校正，使屏幕上的运动角==绘制倾角。
    const aspect = H ? W / H : 1;
    ships.push({
      x: dir === 1 ? -0.12 : 1.12, y: rand(0.24, 0.7),
      vx: dir * speed, vy: -speed * Math.tan(tilt) * aspect,
      dir, blink: 0, tilt,
    });
  }

  function drawFarObjs() {
    for (const o of farObjs) {
      const px = mx * 10 * o.depth * DPR, py = my * 10 * o.depth * DPR;
      ctx.save();
      ctx.translate(o.x * W + px, o.y * H + py);
      ctx.rotate(o.rot);
      ctx.scale(1, o.ry / o.rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, o.rx * DPR);
      g.addColorStop(0, `rgba(${o.c},${o.a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, o.rx * DPR, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawStars(now) {
    for (const s of stars) {
      const par = 1 - s.depth;                       // 近星视差更大
      const px = mx * 28 * (0.2 + par) * DPR;
      const py = my * 28 * (0.2 + par) * DPR;
      let a = s.a;
      if (!reduced && s.tw) a *= 0.55 + 0.45 * Math.sin(s.ph + now * s.tws);
      const x = s.x * W + px, y = s.y * H + py;
      ctx.fillStyle = `rgba(${s.c},${a})`;
      ctx.beginPath(); ctx.arc(x, y, s.r * DPR, 0, Math.PI * 2); ctx.fill();
      if (s.r > 1.35) {                              // 亮星加十字辉光
        const L = s.r * 3 * DPR;
        ctx.strokeStyle = `rgba(${s.c},${a * 0.22})`;
        ctx.lineWidth = DPR;
        ctx.beginPath();
        ctx.moveTo(x - L, y); ctx.lineTo(x + L, y);
        ctx.moveTo(x, y - L); ctx.lineTo(x, y + L);
        ctx.stroke();
      }
    }
  }

  function drawMeteors(dt) {
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      const k = m.life / m.max;
      if (k >= 1 || m.y > 1.25 || m.x < -0.25 || m.x > 1.25) { meteors.splice(i, 1); continue; }
      const alpha = Math.sin(Math.min(1, k) * Math.PI);
      const hx = m.x * W, hy = m.y * H;
      const tx = hx - m.vx * m.len * DPR, ty = hy - m.vy * m.len * DPR;
      const g = ctx.createLinearGradient(hx, hy, tx, ty);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`);
      g.addColorStop(0.3, `rgba(200,220,255,${0.5 * alpha})`);
      g.addColorStop(1, 'rgba(160,180,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2 * DPR; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`;
      ctx.beginPath(); ctx.arc(hx, hy, 1.6 * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawShip(sp) {
    const x = sp.x * W, y = sp.y * H + my * 8 * DPR, s = DPR;
    ctx.save();
    ctx.translate(x, y);
    // 先按行进方向轻微仰角（机头略上扬），再按方向水平翻转
    ctx.rotate(-sp.tilt * sp.dir);
    ctx.scale(sp.dir, 1);
    // 引擎尾焰
    const g = ctx.createLinearGradient(-72 * s, 0, -12 * s, 0);
    g.addColorStop(0, 'rgba(56,189,248,0)');
    g.addColorStop(1, 'rgba(56,189,248,0.5)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-14 * s, -2 * s); ctx.lineTo(-72 * s, 0); ctx.lineTo(-14 * s, 2 * s); ctx.closePath(); ctx.fill();
    // 船体
    ctx.fillStyle = 'rgba(212,222,242,0.92)';
    ctx.beginPath();
    ctx.moveTo(17 * s, 0); ctx.lineTo(-6 * s, -5 * s); ctx.lineTo(-14 * s, -3 * s);
    ctx.lineTo(-14 * s, 3 * s); ctx.lineTo(-6 * s, 5 * s); ctx.closePath(); ctx.fill();
    // 舱窗
    ctx.fillStyle = 'rgba(120,200,255,0.95)';
    ctx.beginPath(); ctx.arc(5 * s, 0, 2.3 * s, 0, Math.PI * 2); ctx.fill();
    // 闪烁信号灯
    const blink = Math.sin(sp.blink * 8) > 0 ? 1 : 0.15;
    ctx.fillStyle = `rgba(255,80,120,${blink})`;
    ctx.beginPath(); ctx.arc(-12 * s, -3 * s, 1.5 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFrame(now) {
    ctx.clearRect(0, 0, W, H);
    drawFarObjs();
    drawStars(now);
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;

    mx += (tmx - mx) * Math.min(1, dt * 3);
    my += (tmy - my) * Math.min(1, dt * 3);

    drawFrame(elapsed);

    if (elapsed > nextMeteor) { spawnMeteor(); nextMeteor = elapsed + rand(9, 26); } // 流星很少
    drawMeteors(dt);

    if (elapsed > nextShip) { spawnShip(); nextShip = elapsed + rand(38, 80); }       // 飞船更少
    for (let i = ships.length - 1; i >= 0; i--) {
      const sp = ships[i];
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.blink += dt;
      if (sp.x < -0.16 || sp.x > 1.16 || sp.y < -0.2) { ships.splice(i, 1); continue; }
      drawShip(sp);
    }

    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!built) build();
    if (reduced) { drawFrame(0); return; }   // 尊重减少动态：只画静态一帧
    if (raf) return;
    lastT = 0;
    nextMeteor = elapsed + rand(5, 12);
    nextShip = elapsed + rand(18, 34);
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.Galaxy = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
