// cyber.js — 赛博朋克主题的夸张科幻背景（仅 body.cyber 时激活）
// 效果：合成波(synthwave)透视霓虹网格地面 + 霓虹落日(扫描带) + 远处霓虹城市天际线
//       + 天空数字雨(矩阵字符) + 旋转霓虹齿轮群(机械朋克) + 街道霓虹蒸汽羽流
//       + 偶发 RGB 信号错位(glitch) + 鼠标视差。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
// 尊重 prefers-reduced-motion：只画一帧静态场景。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1, horizon = 0;
  let scroll = 0, elapsed = 0, lastT = 0;
  let mx = 0, my = 0, tmx = 0, tmy = 0;         // 平滑/目标视差(-1..1)
  let rain = [], sky = [], buildings = [];
  let gears = [], steam = [], emitters = [];    // 齿轮 / 蒸汽粒子 / 蒸汽发生点
  let glitch = { t: 0, next: 0, bars: [] };

  const CYAN = '5,217,232', MAG = '255,42,109', YEL = '249,240,2', PUR = '185,103,255';
  const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺﾊﾋﾌﾍﾎ0123456789=+*<>#@$%&ΞΛΔ01';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const gl = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  function build() {
    root = document.createElement('div');
    root.id = 'cyberFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'cyberCanvas';
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

  function genScene() {
    horizon = Math.round(H * 0.46);
    // 天空数字雨：按宽度自适应列数
    rain = [];
    const cols = Math.min(120, Math.max(28, Math.round(W / (16 * DPR))));
    const step = W / cols;
    for (let i = 0; i < cols; i++) {
      rain.push({
        x: i * step + step * 0.5,
        y: rand(-H, horizon),
        sp: rand(60, 180) * DPR,           // 下落速度 px/s
        len: (rand(6, 18) | 0),            // 尾迹字符数
        fs: rand(10, 15) * DPR,            // 字号
        c: Math.random() < 0.6 ? CYAN : (Math.random() < 0.5 ? MAG : PUR),
        ph: rand(0, 999),
      });
    }
    // 天空零星霓虹亮点
    sky = [];
    const sn = Math.round((W * horizon) / (26000 * DPR));
    for (let i = 0; i < sn; i++) {
      sky.push({ x: Math.random(), y: rand(0.02, 0.42), a: rand(0.2, 0.8), tw: rand(0.6, 2.2), ph: rand(0, 6.28),
        c: Math.random() < 0.5 ? CYAN : MAG });
    }
    // 天际线：地平线附近的霓虹城市剪影（顶边发光）
    buildings = [];
    let bx = -0.05;
    while (bx < 1.05) {
      const bw = rand(0.02, 0.06);
      const bh = rand(0.04, 0.20);
      buildings.push({ x: bx, w: bw, h: bh, c: Math.random() < 0.5 ? CYAN : MAG, lit: Math.random() < 0.5 });
      bx += bw + rand(0.004, 0.02);
    }
    // 旋转霓虹齿轮群：坐标用视口比例，绘制时换算像素以适配 resize；
    // 大齿轮压在角落半出屏，小齿轮咬合其边缘，交替正反转。ph 为随机初相。
    gears = [
      { x: 0.09, y: 0.15, r: 0.15, teeth: 14, c: CYAN, spd: 0.30, ph: rand(0, 6.28) },
      { x: 0.235, y: 0.235, r: 0.075, teeth: 10, c: MAG, spd: -0.62, ph: rand(0, 6.28) },
      { x: 0.93, y: 0.10, r: 0.12, teeth: 12, c: MAG, spd: -0.36, ph: rand(0, 6.28) },
      { x: 0.815, y: 0.255, r: 0.06, teeth: 9, c: PUR, spd: 0.78, ph: rand(0, 6.28) },
      { x: 0.05, y: 0.9, r: 0.13, teeth: 13, c: MAG, spd: 0.28, ph: rand(0, 6.28) },
      { x: 0.235, y: 0.985, r: 0.08, teeth: 10, c: CYAN, spd: -0.5, ph: rand(0, 6.28) },
      { x: 0.97, y: 0.92, r: 0.11, teeth: 12, c: CYAN, spd: 0.4, ph: rand(0, 6.28) },
    ];
    // 蒸汽发生点：屏幕底部若干街道排气口，蒸汽向上升腾。
    emitters = [];
    const en = 3 + (Math.random() * 2 | 0);
    for (let i = 0; i < en; i++) {
      emitters.push({ x: rand(0.1, 0.9), y: rand(0.94, 1.03), rate: rand(0.7, 1.5),
        c: Math.random() < 0.5 ? CYAN : MAG, acc: 0 });
    }
    steam = [];
    if (reduced) seedSteamStatic();
  }

  // 静态帧（reduced-motion）预铺一批已升起的蒸汽，避免空场
  function seedSteamStatic() {
    for (const e of emitters) {
      for (let k = 0; k < 6; k++) {
        const life = rand(0.6, 4.5), max = rand(4, 6.5);
        steam.push({ x: e.x * W + rand(-24, 24) * DPR, y: e.y * H - life * 30 * DPR,
          r: (22 + life * 16) * DPR, vy: 26 * DPR, vx: 0, life, max, c: e.c, seed: rand(0, 6.28) });
      }
    }
  }

  function onResize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    canvas.width = W; canvas.height = H;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    genScene();
    if (reduced || !raf) drawFrame();
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

  // 霓虹落日：地平线上方的圆，下半部被水平暗带切割（合成波经典）
  function drawSun() {
    const cx = W / 2 + mx * 18 * DPR;
    const cy = horizon - H * 0.02;
    const r = Math.min(W, H) * 0.17;
    const pulse = reduced ? 1 : 0.9 + 0.1 * Math.sin(elapsed * 2);
    ctx.save();
    // 外辉光
    const gg = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 2.1);
    gg.addColorStop(0, `rgba(${MAG},${0.28 * pulse})`);
    gg.addColorStop(1, `rgba(${MAG},0)`);
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2); ctx.fill();
    // 圆盘：从黄到品红的竖直渐变
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    const disk = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    disk.addColorStop(0, `rgba(${YEL},0.95)`);
    disk.addColorStop(0.5, `rgba(${MAG},0.95)`);
    disk.addColorStop(1, `rgba(${PUR},0.9)`);
    ctx.fillStyle = disk;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // 下半部扫描带（挖空成条纹）
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let i = 0; i < 9; i++) {
      const yy = cy + (i / 9) * r + i * 1.5 * DPR;
      const bh = (2 + i * 0.9) * DPR;
      ctx.fillRect(cx - r, yy, r * 2, bh);
    }
    ctx.restore();
    ctx.restore();
  }

  function drawSky(now) {
    for (const s of sky) {
      let a = s.a;
      if (!reduced) a *= 0.5 + 0.5 * Math.sin(s.ph + now * s.tw);
      const x = s.x * W + mx * 10 * DPR, y = s.y * horizon + my * 6 * DPR;
      ctx.fillStyle = `rgba(${s.c},${a})`;
      ctx.beginPath(); ctx.arc(x, y, 1.1 * DPR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawSkyline() {
    const base = horizon + 1 * DPR;
    for (const b of buildings) {
      const px = mx * 8 * DPR;
      const x = b.x * W + px, w = b.w * W, h = b.h * H;
      ctx.fillStyle = 'rgba(6,2,20,0.9)';
      ctx.fillRect(x, base - h, w, h);
      // 顶边霓虹线
      ctx.strokeStyle = `rgba(${b.c},0.85)`;
      ctx.lineWidth = 1.4 * DPR;
      ctx.shadowColor = `rgba(${b.c},0.9)`; ctx.shadowBlur = 8 * DPR;
      ctx.beginPath(); ctx.moveTo(x, base - h); ctx.lineTo(x + w, base - h); ctx.stroke();
      ctx.shadowBlur = 0;
      // 零星窗灯
      if (b.lit && h > 0.06 * H) {
        ctx.fillStyle = `rgba(${b.c},0.5)`;
        for (let k = 0; k < 3; k++) {
          const wx = x + rand(0.2, 0.8) * w, wy = base - rand(0.15, 0.85) * h;
          ctx.fillRect(wx, wy, 1.5 * DPR, 1.5 * DPR);
        }
      }
    }
  }

  // 透视霓虹网格地面：横线向观者滚动 + 竖线汇聚到消失点
  function drawGrid() {
    const gh = H - horizon;
    const vpx = W / 2 + mx * 24 * DPR;
    ctx.save();
    ctx.lineWidth = 1.2 * DPR;
    // 竖线（静止，汇聚到消失点）
    for (let i = -12; i <= 12; i++) {
      const bx = W / 2 + (i / 12) * W * 1.6 + mx * 40 * DPR;
      const a = 0.22 * (1 - Math.abs(i) / 14);
      ctx.strokeStyle = `rgba(${CYAN},${Math.max(0.05, a)})`;
      ctx.beginPath(); ctx.moveTo(vpx, horizon); ctx.lineTo(bx, H); ctx.stroke();
    }
    // 横线（透视压缩 + 滚动）
    const N = 20;
    for (let k = 0; k < N; k++) {
      let t = ((k + scroll) % N) / N;         // 0(近地平线)..1(近观者)
      const y = horizon + gh * t * t;         // 透视：近地平线密、近观者疏
      const a = 0.30 * t + 0.05;              // 越近越亮
      ctx.strokeStyle = `rgba(${CYAN},${a})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // 地平线亮线 + 辉光
    ctx.strokeStyle = `rgba(${CYAN},0.9)`;
    ctx.shadowColor = `rgba(${CYAN},0.9)`; ctx.shadowBlur = 14 * DPR;
    ctx.lineWidth = 2 * DPR;
    ctx.beginPath(); ctx.moveTo(0, horizon); ctx.lineTo(W, horizon); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawRain(dt) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const c of rain) {
      if (!reduced) c.y += c.sp * dt;
      if (c.y - c.len * c.fs > horizon) { c.y = rand(-H * 0.4, -c.fs); c.x = rand(0, W); }
      ctx.font = `${c.fs}px "Courier New", monospace`;
      for (let i = 0; i < c.len; i++) {
        const y = c.y - i * c.fs;
        if (y < -c.fs || y > horizon) continue;
        const head = i === 0;
        const a = head ? 0.95 : 0.5 * (1 - i / c.len);
        ctx.fillStyle = head ? `rgba(255,255,255,${a})` : `rgba(${c.c},${a})`;
        // 头部字符随机跳变，产生流动感
        ctx.fillText(head && Math.random() < 0.5 ? gl() : GLYPHS[(c.ph + i) % GLYPHS.length | 0], c.x, y);
      }
    }
    ctx.restore();
  }

  // 旋转霓虹齿轮：梯形齿廓外圈 + 暗底填充 + 中心轮毂/辐条，描边发光。
  function drawGear(g) {
    const cx = g.x * W + mx * 12 * DPR, cy = g.y * H + my * 9 * DPR;
    const R = g.r * Math.min(W, H);
    const rootR = R * 0.82, tipR = R, n = g.teeth;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(g.ph + (g.ang || 0));
    // 齿廓路径（每齿：谷→升→顶→降）
    ctx.beginPath();
    const seg = (Math.PI * 2) / n, q = seg * 0.28;
    for (let i = 0; i < n; i++) {
      const a = i * seg;
      ctx.lineTo(Math.cos(a - q) * rootR, Math.sin(a - q) * rootR);
      ctx.lineTo(Math.cos(a - q * 0.5) * tipR, Math.sin(a - q * 0.5) * tipR);
      ctx.lineTo(Math.cos(a + q * 0.5) * tipR, Math.sin(a + q * 0.5) * tipR);
      ctx.lineTo(Math.cos(a + q) * rootR, Math.sin(a + q) * rootR);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,2,20,0.42)';
    ctx.fill();
    ctx.lineWidth = 2 * DPR;
    ctx.strokeStyle = `rgba(${g.c},0.55)`;
    ctx.shadowColor = `rgba(${g.c},0.85)`;
    ctx.shadowBlur = 12 * DPR;
    ctx.stroke();
    // 轮毂
    ctx.beginPath(); ctx.arc(0, 0, R * 0.30, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    // 辐条
    ctx.strokeStyle = `rgba(${g.c},0.35)`;
    ctx.lineWidth = 1.6 * DPR;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.30, Math.sin(a) * R * 0.30);
      ctx.lineTo(Math.cos(a) * rootR * 0.92, Math.sin(a) * rootR * 0.92);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawGears() { for (const g of gears) drawGear(g); }

  // 蒸汽羽流：从底部排气口升腾，边升边扩散并淡出；lighter 混合出霓虹辉光。
  function updateSteam(dt) {
    for (const e of emitters) {
      e.acc += dt * e.rate * 9;
      while (e.acc >= 1 && steam.length < 260) {
        e.acc -= 1;
        steam.push({ x: e.x * W + rand(-22, 22) * DPR, y: e.y * H, r: rand(18, 42) * DPR,
          vy: rand(20, 44) * DPR, vx: rand(-8, 8) * DPR, life: 0, max: rand(3.6, 6.2),
          c: e.c, seed: rand(0, 6.28) });
      }
    }
    for (let i = steam.length - 1; i >= 0; i--) {
      const p = steam[i];
      p.life += dt;
      if (p.life >= p.max) { steam.splice(i, 1); continue; }
      p.y -= p.vy * dt;
      p.x += (p.vx + Math.sin(p.life * 0.8 + p.seed) * 12 * DPR) * dt;
      p.r += 15 * DPR * dt;
      p.vy *= (1 - 0.1 * dt);
    }
  }
  function drawSteam() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of steam) {
      const k = p.life / p.max;
      const a = Math.sin(Math.min(1, k) * Math.PI) * 0.13;   // 淡入淡出
      if (a <= 0.002) continue;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(${p.c},${a})`);
      g.addColorStop(0.4, `rgba(205,222,255,${a * 0.55})`);
      g.addColorStop(1, `rgba(${p.c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // 偶发信号错位：随机水平条带做 RGB 撕裂 + 亮闪
  function drawGlitch(dt) {
    if (reduced) return;
    if (elapsed > glitch.next) {
      glitch.next = elapsed + rand(2.5, 6.5);
      glitch.t = rand(0.12, 0.35);
      glitch.bars = [];
      const n = 2 + (Math.random() * 4 | 0);
      for (let i = 0; i < n; i++) {
        glitch.bars.push({ y: rand(0, H), h: rand(4, 26) * DPR, dx: rand(-24, 24) * DPR,
          c: Math.random() < 0.5 ? CYAN : MAG });
      }
    }
    if (glitch.t > 0) {
      glitch.t -= dt;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const b of glitch.bars) {
        ctx.fillStyle = `rgba(${b.c},0.18)`;
        ctx.fillRect(b.dx, b.y, W, b.h);
        ctx.fillStyle = `rgba(255,255,255,0.10)`;
        ctx.fillRect(-b.dx, b.y + b.h * 0.3, W, b.h * 0.4);
      }
      ctx.restore();
    }
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    drawSky(elapsed);
    drawSun();
    drawSkyline();
    drawGears();
    drawGrid();
    drawRain(0);
    drawSteam();
    drawGlitch(0);
  }

  function loop(t) {
    if (!lastT) lastT = t;
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t; elapsed += dt;
    mx += (tmx - mx) * Math.min(1, dt * 3);
    my += (tmy - my) * Math.min(1, dt * 3);
    scroll += dt * 1.1;                       // 网格向观者滚动速度
    for (const g of gears) g.ang = (g.ang || 0) + g.spd * dt;  // 齿轮旋转
    updateSteam(dt);

    ctx.clearRect(0, 0, W, H);
    drawSky(elapsed);
    drawSun();
    drawSkyline();
    drawGears();
    drawGrid();
    drawRain(dt);
    drawSteam();
    drawGlitch(dt);

    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!built) build();
    if (reduced) { drawFrame(); return; }
    if (raf) return;
    lastT = 0;
    glitch.next = elapsed + rand(1.5, 3.5);
    raf = requestAnimationFrame(loop);
  }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  window.Cyber = {
    setActive(on) {
      active = !!on;
      if (on) { if (!built) build(); if (!document.hidden) start(); }
      else { stop(); }
    },
  };
})();
