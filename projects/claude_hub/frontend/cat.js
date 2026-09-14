// cat.js — 宠物猫主题的「小猫探头」动效（仅 body.cat 时激活）
// 效果：一只姜黄小猫时不时从屏幕底边探出头（爪子扒着边缘），东张西望、眨眨眼，几秒后又缩回去。
// 非侵入：独立固定层 #catFx（z 低、pointer-events:none，绝不挡交互/弹层）；不改其它主题。
(function () {
  let layer = null, peeker = null;
  let active = false, built = false;
  let waitTimer = 0, holdTimer = 0;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);

  // 姜黄小猫：头 + 两只扒着边缘的爪子（viewBox 底边即屏幕边缘，爪子正好搭在上面）
  const CAT_SVG = `
<svg class="cat-svg" viewBox="0 0 132 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="catFur" cx="50%" cy="38%" r="65%">
      <stop offset="0%" stop-color="#f2a75a"/>
      <stop offset="100%" stop-color="#e08a3c"/>
    </radialGradient>
  </defs>
  <g class="cat-inner">
    <!-- 爪子（扒着边缘） -->
    <g>
      <ellipse cx="44" cy="112" rx="16" ry="12" fill="#e08a3c" stroke="#4a3928" stroke-width="2.4"/>
      <ellipse cx="88" cy="112" rx="16" ry="12" fill="#e08a3c" stroke="#4a3928" stroke-width="2.4"/>
      <g fill="#fbe0c4">
        <ellipse cx="38" cy="108" rx="2.6" ry="3.4"/><ellipse cx="44" cy="106" rx="2.6" ry="3.4"/><ellipse cx="50" cy="108" rx="2.6" ry="3.4"/>
        <ellipse cx="82" cy="108" rx="2.6" ry="3.4"/><ellipse cx="88" cy="106" rx="2.6" ry="3.4"/><ellipse cx="94" cy="108" rx="2.6" ry="3.4"/>
      </g>
    </g>
    <!-- 头 -->
    <g class="cat-head">
      <!-- 耳朵 -->
      <path d="M34 44 L30 8 L60 32 Z" fill="url(#catFur)" stroke="#4a3928" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M98 44 L102 8 L72 32 Z" fill="url(#catFur)" stroke="#4a3928" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M38 38 L36 18 L52 32 Z" fill="#f3b9a0"/>
      <path d="M94 38 L96 18 L80 32 Z" fill="#f3b9a0"/>
      <!-- 脸 -->
      <ellipse cx="66" cy="58" rx="40" ry="35" fill="url(#catFur)" stroke="#4a3928" stroke-width="2.6"/>
      <!-- 额头虎斑纹 -->
      <g stroke="#c56f21" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.85">
        <path d="M66 26 L66 40"/><path d="M54 28 L57 41"/><path d="M78 28 L75 41"/>
      </g>
      <!-- 奶白口鼻区 -->
      <ellipse cx="66" cy="70" rx="24" ry="17" fill="#fbe9d0"/>
      <!-- 眼睛（眨眼动画在 .cat-eye 上） -->
      <g fill="#3a2c1e">
        <ellipse class="cat-eye" cx="50" cy="58" rx="7" ry="9"/>
        <ellipse class="cat-eye" cx="82" cy="58" rx="7" ry="9"/>
      </g>
      <circle cx="48" cy="54" r="2.3" fill="#fff"/>
      <circle cx="80" cy="54" r="2.3" fill="#fff"/>
      <!-- 鼻子 + 嘴 -->
      <path d="M61 66 L71 66 L66 72 Z" fill="#e0728a" stroke="#b5566d" stroke-width="0.8"/>
      <path d="M66 72 L66 76 M66 76 C 62 80 58 79 56 76 M66 76 C 70 80 74 79 76 76"
            fill="none" stroke="#7a5a3e" stroke-width="2" stroke-linecap="round"/>
      <!-- 胡须 -->
      <g stroke="#c9a986" stroke-width="1.6" stroke-linecap="round" opacity="0.9">
        <path d="M42 66 L14 60"/><path d="M42 70 L12 71"/><path d="M42 74 L15 82"/>
        <path d="M90 66 L118 60"/><path d="M90 70 L120 71"/><path d="M90 74 L117 82"/>
      </g>
    </g>
  </g>
</svg>`;

  function build() {
    layer = document.createElement('div');
    layer.id = 'catFx';
    layer.setAttribute('aria-hidden', 'true');
    peeker = document.createElement('div');
    peeker.className = 'cat-peeker';
    peeker.innerHTML = CAT_SVG;
    layer.appendChild(peeker);
    document.body.appendChild(layer);
    document.addEventListener('visibilitychange', onVis);
    built = true;
  }

  function onVis() {
    if (document.hidden) sleep();
    else if (active) schedule(rand(1500, 4000));
  }

  function schedule(delay) {
    clearTimeout(waitTimer);
    waitTimer = setTimeout(peek, delay);
  }

  function peek() {
    if (!active || document.hidden) return;
    // 随机水平落点（避开最边缘），随机左右偏头一点，显得东张西望
    const maxLeft = Math.max(40, window.innerWidth - 172);
    peeker.style.left = rand(12, maxLeft) + 'px';
    peeker.style.setProperty('--peek-tilt', rand(-7, 7).toFixed(1) + 'deg');
    peeker.classList.add('peeking');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(retreat, rand(2800, 4800));
  }

  function retreat() {
    peeker.classList.remove('peeking');
    schedule(rand(13000, 30000));   // 下次探头的间隔
  }

  // 暂停：缩回并停掉所有计时（切后台 / 关闭主题）
  function sleep() {
    clearTimeout(waitTimer);
    clearTimeout(holdTimer);
    if (peeker) peeker.classList.remove('peeking');
  }

  window.Cat = {
    setActive(on) {
      active = !!on;
      if (on) {
        if (!built) build();
        if (reduced) return;                 // 尊重「减少动态」：不探头
        if (!document.hidden) schedule(rand(2500, 6000));
      } else {
        sleep();
      }
    },
  };
})();
