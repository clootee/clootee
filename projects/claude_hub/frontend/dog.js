// Quiet autonomous companion, driven by one decision timer.
(function () {
  let layer, pet, timer = 0, active = false, x = 0;
  let state = 'rest', lastReaction = -2000, stroke = 0, previous = null;
  let drag = null, suppressClick = false;
  let renderer = 'code';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rand = (a, b) => a + Math.random() * (b - a);
  const size = () => layer ? layer.getBoundingClientRect().width : 164;
  const limit = () => Math.max(0, window.innerWidth - size());
  const clamp = value => Math.max(0, Math.min(limit(), value));
  function later(fn, ms) {
    clearTimeout(timer);
    timer = 0;
    if (active && !document.hidden) timer = setTimeout(fn, ms);
  }
  function pose(next) { state = next; layer.dataset.state = next; }
  function position(next, duration = 0) {
    x = next;
    layer.style.setProperty('--dog-travel', duration + 'ms');
    layer.style.transform = `translate3d(${x}px, 0, 0)`;
  }
  function stay(next, min, max) { pose(next); later(decide, rand(min, max)); }
  function move(next, hiding) {
    const from = layer.getBoundingClientRect().left;
    const distance = Math.abs(next - from);
    if (distance < 24) { stay('sniff', 1500, 3000); return; }
    const running = Math.random() < .35;
    const duration = Math.max(1400, distance / (running ? rand(110, 160) : rand(45, 80)) * 1000);
    const speed = distance / duration * 1000;
    layer.style.setProperty('--dog-gait', Math.max(.28, Math.min(1.1, (running ? 48 : 34) * size() / 164 / speed)) + 's');
    pet.style.setProperty('--dog-facing', next < from ? '1' : '-1');
    pose(running ? 'run' : 'walk');
    position(next, duration);
    later(() => {
      if (hiding) {
        pose('hidden');
        layer.inert = true;
        later(appear, rand(12000, 25000));
      } else stay(Math.random() < .5 ? 'sniff' : 'rest', 1600, 3800);
    }, duration);
  }
  function appear() {
    layer.inert = false;
    layer.style.bottom = Math.round(rand(78, Math.min(180, window.innerHeight * .24))) + 'px';
    move(clamp(x < 0 ? rand(12, 100) : limit() - rand(12, 100)), false);
  }
  function decide() {
    if (!active || document.hidden || drag) return;
    if (motion.matches) { stay(Math.random() < .5 ? 'sleep' : 'rest', 20000, 40000); return; }
    const roll = Math.random();
    if (state === 'sleep') { move(rand(8, Math.max(8, limit() - 8)), false); return; }
    if (roll < .13) stay('sleep', 14000, 28000);
    else if (roll < .23) stay('rest', 2500, 5000);
    else if (roll < .34) stay('sniff', 1800, 3500);
    else if (roll < .96) {
      let target = rand(8, Math.max(8, limit() - 8));
      if (Math.abs(target - x) < Math.min(140, limit() / 3)) target = x < limit() / 2 ? limit() - 8 : 8;
      move(clamp(target), false);
    }
    else move(x < limit() / 2 ? -size() - 12 : window.innerWidth + 12, true);
  }
  function stopMoving() { position(layer.getBoundingClientRect().left); }
  // Deterministic curls, all vector geometry: no texture or raster dependency.
  function drawing() {
    let seed = 23;
    const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    function fur(cx, cy, rx, ry, count) {
      let out = '';
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * Math.PI * 2;
        out += `<circle cx="${(cx + Math.cos(a)*rx*.98).toFixed(1)}" cy="${(cy + Math.sin(a)*ry*.98).toFixed(1)}" r="${(2 + noise()*1.7).toFixed(1)}" fill="#89512f"/>`;
      }
      for (let i = 0; i < count; i++) {
        const a = noise() * Math.PI * 2, radius = Math.sqrt(noise()) * .96;
        const x = cx + Math.cos(a) * rx * radius, y = cy + Math.sin(a) * ry * radius;
        const r = 1.7 + noise() * 2.8;
        out += `<g opacity="${(.18 + noise() * .22).toFixed(2)}"><path d="M${(x-r*.7).toFixed(1)} ${(y+r*.4).toFixed(1)}c${(-r).toFixed(1)} ${(-r*1.8).toFixed(1)} ${(r*1.8).toFixed(1)} ${(-r*1.7).toFixed(1)} ${(r*1.4).toFixed(1)} ${(-r*.3).toFixed(1)}q${(-r*.2).toFixed(1)} ${r.toFixed(1)} ${(-r*.8).toFixed(1)} ${(r*.3).toFixed(1)}" fill="none" stroke="${noise() < .45 ? '#60391f' : '#c18a59'}" stroke-width="1.1" stroke-linecap="round"/></g>`;
      }
      return out;
    }
    const leg = (name, x, y) => `<g class="dog-leg ${name}" style="transform-origin:${x+5}px ${y}px"><path d="M${x-4} ${y-6}q-4 15 1 29q6 6 15-1l2-26Z" fill="url(#dogFur)"/>${fur(x+5,y+10,10,17,24)}<g class="dog-lower-leg" style="transform-origin:${x+6}px ${y+22}px"><path d="M${x-1} ${y+18}l-1 22q-9 4-7 8q10 6 22 1q3-4-3-9l5-21Z" fill="url(#dogFur)"/>${fur(x+5,y+34,7,13,20)}</g></g>`;
    return `<svg class="dog-vector" viewBox="0 0 240 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><radialGradient id="dogFur" cx="40%" cy="25%" r="80%"><stop stop-color="#995e38"/><stop offset=".55" stop-color="#814928"/><stop offset="1" stop-color="#60391f"/></radialGradient>
      <radialGradient id="dogFace"><stop stop-color="#ac784d"/><stop offset="1" stop-color="#82502e"/></radialGradient></defs>
      <ellipse class="dog-shadow" cx="128" cy="179" rx="88" ry="6" fill="#362316" opacity=".12"/>
      <g class="dog-animal">
        ${leg('dog-back-far',172,127)}${leg('dog-front-far',95,127)}
        ${leg('dog-back-near',187,129)}${leg('dog-front-near',111,130)}
        <g class="dog-body"><g class="dog-tail-vector"><path d="M195 105q29-15 19-33" fill="none" stroke="#87502d" stroke-width="16" stroke-linecap="round"/>${fur(214,78,10,12,24)}</g>
        <ellipse cx="145" cy="118" rx="66" ry="40" fill="url(#dogFur)"/>${fur(145,118,65,39,260)}</g>
        <g class="dog-head-vector"><ellipse cx="72" cy="100" rx="44" ry="43" fill="url(#dogFur)"/>${fur(72,99,43,42,200)}
          <g class="dog-ear-vector"><ellipse cx="100" cy="111" rx="17" ry="27" fill="#774324"/>${fur(100,111,16,26,65)}</g>
          <g class="dog-open-eyes"><ellipse cx="49" cy="111" rx="3.4" ry="4" fill="#201810"/><ellipse cx="76" cy="110" rx="3.6" ry="4.2" fill="#201810"/><circle cx="48.1" cy="109.5" r=".9" fill="#e7d7bf"/><circle cx="75" cy="108.7" r="1" fill="#e7d7bf"/></g>
          <g class="dog-closed-eyes" fill="none" stroke="#392518" stroke-width="1.8" stroke-linecap="round"><path d="M45 112q4 2 8-1M72 111q4 2 8-1"/></g>
          <ellipse cx="55" cy="129" rx="23" ry="14" fill="url(#dogFace)"/>${fur(55,129,22,13,50)}
          <path d="M33 129q7-5 13 0q1 7-6 8q-8-1-7-8" fill="#30251e"/><path d="M35 129q3-1 5 0" stroke="#786655" stroke-width="1.2" fill="none"/>
          <path d="M42 138q9 3 17-1" fill="none" stroke="#613d26" stroke-width="1"/>
        </g>
      </g></svg>`;
  }
  function touch(stroking) {
    if (!active || document.hidden || state === 'hidden') return;
    const now = performance.now();
    if (now - lastReaction < 1400) return;
    lastReaction = now;
    stopMoving();
    const sleepy = state === 'sleep';
    pose(stroking ? 'petted' : 'notice');
    later(() => stay(sleepy ? 'sleep' : 'rest', 5000, 12000), stroking ? 1800 : 1000);
  }
  function build() {
    layer = document.createElement('aside');
    layer.id = 'dogFx';
    pet = document.createElement('button');
    pet.type = 'button';
    pet.className = 'dog-pet';
    const sprite = document.createElement('span');
    sprite.className = 'dog-sprite';
    sprite.setAttribute('aria-hidden', 'true');
    pet.appendChild(sprite);
    pet.insertAdjacentHTML('beforeend', drawing());
    layer.dataset.renderer = renderer;
    layer.appendChild(pet);
    document.body.appendChild(layer);
    pet.addEventListener('click', () => {
      if (suppressClick) { suppressClick = false; return; }
      touch(false);
    });
    pet.addEventListener('pointermove', event => {
      if (drag && event.pointerId === drag.id) {
        const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        pose('drag');
        position(clamp(drag.left + dx));
        layer.style.bottom = Math.max(0, Math.min(Math.max(0, window.innerHeight - size()), drag.bottom - dy)) + 'px';
        return;
      }
      if (previous) stroke += Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
      previous = { x: event.clientX, y: event.clientY };
      if (stroke > 45) { stroke = 0; touch(true); }
    });
    pet.addEventListener('pointerleave', () => { previous = null; stroke = 0; });
    pet.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      previous = null; stroke = 0; suppressClick = false;
      stopMoving();
      clearTimeout(timer);
      const rect = layer.getBoundingClientRect();
      drag = { id:event.pointerId, startX:event.clientX, startY:event.clientY,
        left:rect.left, bottom:window.innerHeight - rect.bottom, moved:false };
      pet.setPointerCapture(event.pointerId);
    });
    function endDrag(event) {
      if (!drag || drag.id !== event.pointerId) return;
      const moved = drag.moved;
      drag = null;
      suppressClick = moved;
      if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
      if (active && !document.hidden) stay('rest', 5000, 10000);
    }
    pet.addEventListener('pointerup', endDrag);
    pet.addEventListener('pointercancel', endDrag);
    pet.addEventListener('lostpointercapture', endDrag);
    document.addEventListener('visibilitychange', () => {
      clearTimeout(timer);
      if (!active) return;
      stopMoving();
      if (!document.hidden) {
        layer.inert = false;
        position(clamp(x));
        stay('rest', 3000, 6000);
      }
    });
    window.addEventListener('resize', () => {
      if (!active || state === 'hidden') return;
      position(clamp(layer.getBoundingClientRect().left));
      const bottom = parseFloat(getComputedStyle(layer).bottom);
      layer.style.bottom = Math.max(0, Math.min(Math.max(0, window.innerHeight - size()), bottom)) + 'px';
      stay('rest', 3000, 6000);
    });
    motion.addEventListener('change', () => {
      if (!active || document.hidden) return;
      stopMoving();
      layer.inert = false;
      position(clamp(x));
      stay('rest', 3000, 6000);
    });
  }
  window.Dog = { setActive(on) {
    const wasActive = active;
    active = !!on;
    if (active && !layer) build();
    if (!layer) return;
    pet.setAttribute('aria-label', T('dogPet'));
    layer.hidden = !active;
    if (!active) {
      clearTimeout(timer);
      if (drag && pet.hasPointerCapture(drag.id)) pet.releasePointerCapture(drag.id);
      drag = null;
      return;
    }
    if (wasActive) return;
    layer.inert = false;
    position(clamp(window.innerWidth - size() - 28));
    stay('rest', 1800, 3200);
  }, setRenderer(mode) {
    if (mode !== 'code' && mode !== 'image') return;
    renderer = mode;
    if (layer) layer.dataset.renderer = mode;
  } };
})();
