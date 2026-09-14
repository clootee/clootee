// mecha.js — 机械主题的动态齿轮机械背景（仅 body.mecha 时激活）
// 效果：多组互相咬合、正反向旋转的工业齿轮（钢铁灰 + 琥珀高光），大小不同转速不同；
//       远景大齿轮缓慢转动做景深，两处活塞随连杆上下往复；整体钢板质感 + 暗角。
// 非侵入：独立 <canvas> 固定在视口最底层(z-index:-1)，对话区透明即可透出；不改其它主题。
(function () {
  let root = null, canvas = null, ctx = null, raf = 0;
  let active = false, built = false;
  let W = 0, H = 0, DPR = 1, S = 1;              // S = 基准尺度(取 min(W,H)/1000)
  let gears = [], pistons = [];
  let lastT = 0, t = 0;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  function build() {
    root = document.createElement('div');
    root.id = 'mechaFx';
    root.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.id = 'mechaCanvas';
    root.appendChild(canvas);
    document.body.appendChild(root);
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    built = true;
    onResize();
  }

  // 生成一条互相咬合的齿轮传动链（模数 m 固定 → 相邻齿轮节圆相切、齿距一致）
  // seed: {x,y}(节点位置，视口比例) drive:第一齿轮转速  chain:[{z, dir, ang}] 每级齿数/方向/相对上一齿轮的连接方位
  function makeTrain(seed, module, driveSpeed, chain, opt) {
    opt = opt || {};
    const out = [];
    let prev = null;
    for (let i = 0; i < chain.length; i++) {
      const c = chain[i];
      const Rp = module * c.z / 2;               // 节圆半径
      let cx, cy, speed, dir, phase;
      if (!prev) {
        cx = seed.x * W; cy = seed.y * H;
        dir = 1; speed = driveSpeed;
        // 相位：让参考方向上出现一个齿槽（便于下一齿轮的齿插入）
        phase = 0;
      } else {
        const d = prev.Rp + Rp;                  // 中心距 = 两节圆半径之和
        const ang = c.ang;                       // 从上一齿轮指向本齿轮的方位角
        cx = prev.cx + Math.cos(ang) * d;
        cy = prev.cy + Math.sin(ang) * d;
        dir = -prev.dir;                          // 咬合齿轮反向
        speed = prev.speed * prev.z / c.z;        // 齿数比决定转速
        // 咬合相位：本齿轮在指向上一齿轮(ang+π)的方位上放一个「齿」正对其齿槽
        phase = ang + Math.PI;
      }
      const g = {
        cx, cy, Rp, z: c.z, module,
        dir, speed,
        ang0: (prev ? phase : rand(0, TAU)),      // 静态相位基准
        amber: !!c.amber,
        alpha: opt.alpha != null ? opt.alpha : 1,
        spokes: c.spokes != null ? c.spokes : (c.z >= 16 ? 6 : (c.z >= 10 ? 5 : 0)),
      };
      out.push(g);
      prev = g;
    }
    return out;
  }

  function genScene() {
    gears = [];
    pistons = [];
    const m = 12 * S;                              // 基准模数

    // —— 远景大齿轮（低透明度、缓慢，做景深）——
    gears.push(...makeTrain({ x: 0.16, y: 0.20 }, m * 2.4, 0.08,
      [{ z: 30, spokes: 7 }], { alpha: 0.10 }));
    gears.push(...makeTrain({ x: 0.86, y: 0.30 }, m * 2.0, -0.10,
      [{ z: 24, spokes: 6 }], { alpha: 0.09 }));
    gears.push(...makeTrain({ x: 0.60, y: 0.88 }, m * 3.0, 0.06,
      [{ z: 38, spokes: 8 }], { alpha: 0.08 }));

    // —— 左下角：一条咬合传动链（主视觉，较清晰）——
    gears.push(...makeTrain({ x: 0.10, y: 0.82 }, m, 0.55,
      [
        { z: 22, spokes: 6, amber: true },
        { z: 12, ang: -1.05 },
        { z: 16, ang: -0.15, amber: true, spokes: 5 },
        { z: 9, ang: -1.7 },
      ], { alpha: 0.55 }));

    // —— 右上角：另一条传动链 ——
    gears.push(...makeTrain({ x: 0.93, y: 0.14 }, m, -0.5,
      [
        { z: 20, spokes: 6 },
        { z: 11, ang: 2.2, amber: true },
        { z: 15, ang: 3.05, spokes: 5 },
      ], { alpha: 0.5 }));

    // —— 中部一对小齿轮 ——
    gears.push(...makeTrain({ x: 0.44, y: 0.4 }, m * 0.85, 0.7,
      [
        { z: 13, spokes: 5, amber: true },
        { z: 10, ang: 0.6 },
      ], { alpha: 0.16 }));

    // —— 活塞：连杆挂在某个齿轮的曲柄销上，随其旋转上下往复 ——
    // 绑定左下主齿轮(gears[3])与右上主齿轮(gears[7])
    if (gears[3]) pistons.push({ g: gears[3], crank: gears[3].Rp * 0.62, len: 150 * S, dir2: -1, alpha: 0.4 });
    if (gears[7]) pistons.push({ g: gears[7], crank: gears[7].Rp * 0.6, len: 140 * S, dir2: 1, alpha: 0.36 });
  }

  function onResize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    S = Math.min(W, H) / 1000;
    canvas.width = W; canvas.height = H;
    genScene();
    if (!active) return;
    if (reduced) { drawFrame(true); }              // 静态一帧
  }

  function onVis() {
    if (document.hidden) stop();
    else if (active && !reduced) start();
  }

  // ——— 绘制单个齿轮 ———
  function drawGear(g) {
    const a = g.ang0 + g.dir * g.speed * t;
    const m = g.module;
    const Rp = g.Rp;
    const outerR = Rp + m * 1.0;                    // 齿顶
    const rootR = Rp - m * 1.15;                    // 齿根
    const step = TAU / g.z;

    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(a);
    ctx.globalAlpha = g.alpha;

    // 齿廓（梯形齿）
    ctx.beginPath();
    for (let i = 0; i < g.z; i++) {
      const b = i * step;
      const gapL = b - step * 0.5, gapR = b + step * 0.5;
      const topL = b - step * 0.22, topR = b + step * 0.22;
      if (i === 0) ctx.moveTo(Math.cos(gapL) * rootR, Math.sin(gapL) * rootR);
      else ctx.lineTo(Math.cos(gapL) * rootR, Math.sin(gapL) * rootR);
      ctx.lineTo(Math.cos(topL) * outerR, Math.sin(topL) * outerR);
      ctx.lineTo(Math.cos(topR) * outerR, Math.sin(topR) * outerR);
      ctx.lineTo(Math.cos(gapR) * rootR, Math.sin(gapR) * rootR);
    }
    ctx.closePath();

    // 钢铁质感径向渐变
    const grd = ctx.createRadialGradient(-outerR * 0.28, -outerR * 0.28, outerR * 0.1, 0, 0, outerR);
    grd.addColorStop(0, '#59636b');
    grd.addColorStop(0.55, '#3b444b');
    grd.addColorStop(1, '#232a2f');
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.lineWidth = 1.4 * DPR;
    ctx.strokeStyle = 'rgba(12,16,20,.9)';
    ctx.stroke();

    // 琥珀色齿圈高光（部分齿轮）
    if (g.amber) {
      ctx.beginPath();
      ctx.arc(0, 0, Rp * 0.86, 0, TAU);
      ctx.lineWidth = 2.4 * DPR;
      ctx.strokeStyle = 'rgba(234,179,8,.55)';
      ctx.stroke();
    }

    // 轮辐（挖空感：深色环 + 辐条）
    const hubR = Math.max(m * 1.0, Rp * 0.24);
    const ringR = Rp * 0.66;
    if (g.spokes > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, ringR, 0, TAU);
      ctx.lineWidth = Math.max(2, ringR * 0.14);
      ctx.strokeStyle = 'rgba(16,20,24,.75)';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(16,20,24,.7)';
      ctx.lineWidth = Math.max(2.5, hubR * 0.55);
      for (let s = 0; s < g.spokes; s++) {
        const sa = s * TAU / g.spokes;
        ctx.beginPath();
        ctx.moveTo(Math.cos(sa) * hubR * 0.9, Math.sin(sa) * hubR * 0.9);
        ctx.lineTo(Math.cos(sa) * ringR, Math.sin(sa) * ringR);
        ctx.stroke();
      }
    }

    // 中心轮毂 + 螺栓
    ctx.beginPath();
    ctx.arc(0, 0, hubR, 0, TAU);
    ctx.fillStyle = '#2a3237';
    ctx.fill();
    ctx.lineWidth = 1.4 * DPR;
    ctx.strokeStyle = 'rgba(12,16,20,.9)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, hubR * 0.34, 0, TAU);
    ctx.fillStyle = g.amber ? 'rgba(234,179,8,.85)' : '#12161a';
    ctx.fill();
    // 轮毂螺栓
    const bolts = 6;
    ctx.fillStyle = '#12161a';
    for (let s = 0; s < bolts; s++) {
      const sa = s * TAU / bolts;
      ctx.beginPath();
      ctx.arc(Math.cos(sa) * hubR * 0.66, Math.sin(sa) * hubR * 0.66, Math.max(1.4, hubR * 0.12), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ——— 活塞连杆机构（曲柄销在齿轮上，活塞沿 dir2 方向往复）———
  function drawPiston(p) {
    const g = p.g;
    const a = g.ang0 + g.dir * g.speed * t;
    const crankX = g.cx + Math.cos(a) * p.crank;
    const crankY = g.cy + Math.sin(a) * p.crank;
    // 气缸方向：垂直方向 dir2（上/下）；活塞头在连杆末端沿气缸轴滑动
    // 简化：气缸轴为竖直线，位于齿轮 x；活塞头 y = crankY - dir2*len 的竖直投影近似
    const axisX = g.cx;
    // 连杆末端(活塞销)：从曲柄销沿连杆到气缸轴上的交点
    const dx = axisX - crankX;
    const rodLen = p.len;
    let dyy = rodLen * rodLen - dx * dx;
    dyy = dyy > 0 ? Math.sqrt(dyy) : 0;
    const pinY = crankY + p.dir2 * dyy;

    ctx.save();
    ctx.globalAlpha = p.alpha;
    // 气缸
    const cylW = 26 * S, cylTop = pinY - p.dir2 * 70 * S;
    ctx.strokeStyle = 'rgba(120,132,140,.5)';
    ctx.lineWidth = 3 * DPR;
    ctx.strokeRect(axisX - cylW / 2, Math.min(pinY, cylTop) - 4 * S, cylW, Math.abs(pinY - cylTop) + 8 * S);
    // 连杆
    ctx.beginPath();
    ctx.moveTo(crankX, crankY);
    ctx.lineTo(axisX, pinY);
    ctx.lineWidth = 7 * S;
    ctx.strokeStyle = 'rgba(90,100,108,.75)';
    ctx.lineCap = 'round';
    ctx.stroke();
    // 活塞头
    ctx.fillStyle = 'rgba(60,68,75,.9)';
    ctx.fillRect(axisX - cylW / 2 + 3 * S, pinY - 9 * S, cylW - 6 * S, 18 * S);
    ctx.strokeStyle = 'rgba(12,16,20,.8)';
    ctx.lineWidth = 1.4 * DPR;
    ctx.strokeRect(axisX - cylW / 2 + 3 * S, pinY - 9 * S, cylW - 6 * S, 18 * S);
    // 曲柄销
    ctx.beginPath();
    ctx.arc(crankX, crankY, 5 * S, 0, TAU);
    ctx.fillStyle = 'rgba(234,179,8,.8)';
    ctx.fill();
    ctx.restore();
  }

  function drawFrame() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 钢板底色
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#181c1f');
    bg.addColorStop(0.5, '#14181b');
    bg.addColorStop(1, '#101315');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 齿轮（远景先画，前景后画）
    for (const g of gears) drawGear(g);
    for (const p of pistons) drawPiston(p);

    // 暗角
    ctx.globalAlpha = 1;
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function loop(now) {
    if (!active || document.hidden) return;
    if (!lastT) lastT = now;
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    t += dt;
    drawFrame();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (reduced) { drawFrame(); return; }
    stop();
    lastT = 0;
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  window.Mecha = {
    setActive(on) {
      active = !!on;
      if (on) {
        if (!built) build();
        if (reduced) { drawFrame(); return; }
        if (!document.hidden) start();
      } else {
        stop();
      }
    },
  };
})();
