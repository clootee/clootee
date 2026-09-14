// 折叠消息展开/收起动效的真实浏览器探针（临时脚本，不入 playwright test runner）。
// 不碰运行中的 hub（要口令），而是把 app.js 里那几个真函数抠出来，
// 配上真实的 styles.css 与真实 DOM 结构，在真浏览器里量动画每一帧。
const fs = require('fs');
const { chromium } = require('playwright-core');

const FE = 'D:/projects/claudecode/projects/claude_hub/frontend';
const src = fs.readFileSync(FE + '/app.js', 'utf8');
const css = fs.readFileSync(FE + '/styles.css', 'utf8');

const grab = (n) => {
  const i = src.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('miss ' + n);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
};
const consts = src.match(/const MSG_TOGGLE_MS = \d+;[\s\S]*?const MSG_TOGGLE_EASE = '[^']+';/)[0];
const real = ['let MsgRenderAnchor=null;', consts,
  ...['toggleAssistantGroup', 'findGroupEl', 'applyMsgScroll', 'motionOk',
      'msgToggleGhost', 'animateMsgToggle', 'fadeOutMsgGhost', 'fadeInMsgBody'].map(grab)].join('\n');

const LONG = '这是一段很长的助手回复，用来撑出真实的高度。'.repeat(40);

const page_js = `
const LONG = ${JSON.stringify(LONG)};
const State = { aiExpandedGroups: new Set() };
const $ = (id) => document.getElementById(id);
${real}
function mk(role, text, cls) {
  const d = document.createElement('div');
  d.className = 'msg ' + role + (cls ? ' ' + cls : '');
  const h = document.createElement('div');
  h.className = 'msg-head';
  h.innerHTML = '<span class="who">Claude</span><span class="msg-time">12:00</span>';
  const b = document.createElement('div');
  b.className = 'msg-body' + (cls === 'ai-collapsed-msg' ? ' ai-collapse-preview' : '');
  b.textContent = text;
  const f = document.createElement('div');
  f.className = 'ai-collapse-foot';
  f.innerHTML = '<button type="button" class="ai-collapse-toggle-btn">x</button>';
  d.appendChild(h); d.appendChild(b); d.appendChild(f);
  return d;
}
// 真实 renderMessages 的等价物：整块清空重建，末尾走 applyMsgScroll
function renderMessages() {
  const box = $('messages');
  box.innerHTML = '';
  box.appendChild(mk('user', '用户第一条'));
  box.appendChild(mk('assistant', LONG));
  box.appendChild(mk('user', '用户第二条'));
  const on = State.aiExpandedGroups.has('g');
  const el = on ? mk('assistant', LONG, 'ai-expanded-last')
                : mk('assistant', '预览文字预览文字预览文字', 'ai-collapsed-msg');
  el.dataset.groupKey = 'g';
  box.appendChild(el);
  box.appendChild(mk('user', '用户第三条'));
  applyMsgScroll(box);
}
renderMessages();
window.__probe = () => {
  const box = $('messages'), el = findGroupEl(box, 'g');
  const g = el.querySelector('.ai-toggle-ghost');
  const er = el.getBoundingClientRect();
  const gr = g ? g.getBoundingClientRect() : null;
  return {
    h: er.height,
    top: er.top - box.getBoundingClientRect().top,
    toggling: el.classList.contains('ai-toggling'),
    ghosts: el.querySelectorAll('.ai-toggle-ghost').length,
    ghostT: gr ? gr.top - er.top : null,
    ghostL: gr ? gr.left - er.left : null,
    ghostW: gr ? gr.width : null,
    bodyOpacity: +getComputedStyle(el.querySelector(':scope > .msg-body')).opacity,
    natural: el.scrollHeight,
  };
};
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{margin:0}#stage{height:520px;width:760px;display:flex}</style></head>
<body class="dark"><div id="stage"><div class="msg-wrap"><div class="messages" id="messages"></div></div></div>
<script>${page_js}<\/script></body></html>`;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const fails = [];
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
  page.on('pageerror', (e) => { console.log('PAGE ERROR', e.message); fails.push('pageerror'); });

  await page.setContent(html);
  await page.waitForTimeout(300);

  const before = await page.evaluate(() => {
    const b = document.getElementById('messages');
    b.scrollTop = b.scrollHeight;
    return window.__probe();
  });
  console.log('折叠态：高度 ' + Math.round(before.h) + '，top ' + Math.round(before.top));
  ok(before.h < 90, '折叠卡片本身是矮的（' + Math.round(before.h) + 'px）');

  // ——— 展开 ———
  await page.evaluate(() => toggleAssistantGroup('g', true));
  const f0 = await page.evaluate(() => window.__probe());
  console.log('第0帧：h=' + Math.round(f0.h) + ' top=' + Math.round(f0.top) +
    ' ghost(t=' + f0.ghostT + ',l=' + f0.ghostL + ',w=' + Math.round(f0.ghostW || 0) + ')' +
    ' bodyOpacity=' + f0.bodyOpacity.toFixed(2));
  ok(Math.abs(f0.top - before.top) <= 1, '展开第0帧：锚点位置不变（' + Math.round(before.top) + '→' + Math.round(f0.top) + '）');
  ok(Math.abs(f0.h - before.h) <= 2, '展开第0帧：外框仍是旧高度，没一步到位（' + Math.round(f0.h) + 'px）');
  ok(f0.toggling && f0.ghosts === 1, 'ai-toggling 已加、旧样子快照已挂上');
  ok(f0.ghostT !== null && Math.abs(f0.ghostT) <= 0.6 && Math.abs(f0.ghostL) <= 0.6, '快照与新元素边框盒对齐');
  ok(f0.ghostW > 100, '快照有正常宽度（' + Math.round(f0.ghostW) + 'px）');
  ok(f0.bodyOpacity < 0.05, '第0帧新正文透明，让位给正在淡出的旧样子');

  const mid = [];
  let last = 0;
  for (const t of [200, 400, 600]) {
    await page.waitForTimeout(t - last); last = t;
    mid.push(await page.evaluate(() => window.__probe()));
  }
  console.log('中途高度：' + mid.map((m) => Math.round(m.h)).join(' → '));
  ok(mid[0].h > before.h && mid[1].h > mid[0].h && mid[2].h > mid[1].h, '高度单调增长，是在一点点撑开');
  ok(mid.every((m) => Math.abs(m.top - before.top) <= 1), '整个过程锚点位置都没动');

  await page.waitForTimeout(500);
  const end = await page.evaluate(() => window.__probe());
  console.log('结束：h=' + Math.round(end.h) + ' 自然高度=' + Math.round(end.natural));
  ok(!end.toggling, '结束后 ai-toggling 已摘掉');
  ok(end.ghosts === 0, '结束后快照已自行移除');
  ok(Math.abs(end.h - end.natural) <= 2, '结束后是自然完整高度，没被 flex 挤扁（' + Math.round(end.h) + ' vs ' + Math.round(end.natural) + '）');
  ok(end.bodyOpacity > 0.99, '正文完全不透明');
  ok(end.h > 300, '确实展开成了长消息（' + Math.round(end.h) + 'px）');

  // 起手缓不缓：按 800ms 的 cubic-bezier(.4,0,.2,1)，200ms（t=0.25）应只走了约 15%
  const prog = (mid[0].h - before.h) / (end.h - before.h);
  console.log('前 200ms 走了 ' + (prog * 100).toFixed(1) + '%');
  ok(prog < 0.3, '起手是缓的（前 200ms 只走了 ' + (prog * 100).toFixed(1) + '%），不再一上来就窜出去');

  // ——— 收起 ———
  const b2 = await page.evaluate(() => window.__probe());
  await page.evaluate(() => toggleAssistantGroup('g', false));
  const c0 = await page.evaluate(() => window.__probe());
  ok(Math.abs(c0.top - b2.top) <= 1, '收起第0帧：锚点位置不变');
  ok(Math.abs(c0.h - b2.h) <= 2, '收起第0帧：外框还是旧高度，慢慢收');
  ok(c0.ghosts === 1, '收起也有旧样子快照');
  await page.waitForTimeout(400);
  const c1 = await page.evaluate(() => window.__probe());
  ok(c1.h < b2.h && c1.h > 0, '高度在收缩中（' + Math.round(c1.h) + 'px）');
  await page.waitForTimeout(700);
  const c2 = await page.evaluate(() => window.__probe());
  ok(!c2.toggling && c2.ghosts === 0 && Math.abs(c2.h - before.h) <= 3,
    '收完回到折叠卡片高度（' + Math.round(c2.h) + 'px）');

  // ——— 中途打断 ———
  await page.evaluate(() => toggleAssistantGroup('g', true));
  await page.waitForTimeout(250);
  // 量高度和点击必须在同一次 evaluate 里：分两次往返的那 20~30ms 动画还在长，
  // 会把「往返耗时」误当成「跳变」
  const { midH, d0 } = await page.evaluate(() => {
    const midH = window.__probe().h;
    toggleAssistantGroup('g', false);
    return { midH, d0: window.__probe() };
  });
  ok(Math.abs(d0.h - midH) <= 20, '中途打断：从当下看到的高度接着走，不跳（' + Math.round(midH) + '→' + Math.round(d0.h) + '）');
  ok(d0.ghosts === 1, '中途打断只有一张快照，没有套娃');
  await page.waitForTimeout(900);
  const d1 = await page.evaluate(() => window.__probe());
  ok(!d1.toggling && d1.ghosts === 0, '打断后依然干净收尾');

  await browser.close();
  console.log(fails.length ? '\n失败 ' + fails.length + ' 项' : '\n全部通过');
  process.exit(fails.length ? 1 : 0);
})();
