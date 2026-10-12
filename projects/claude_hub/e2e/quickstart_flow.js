// 一键开始 → 真实对话 → 就地显示本轮花费 → 余额徽章 的浏览器端到端检查。
// 需要：一个全新数据目录的 hub（尚未设密码）+ 一个 console（CLOOTEE_CONSOLE_BASE 指向它）。
//   HUB=http://localhost:18970 PLAYWRIGHT=<playwright-core 路径> node e2e/quickstart_flow.js
const assert = require('assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');

const HUB = process.env.HUB || 'http://localhost:18970';
const SHOTS = process.env.SHOTS || '/tmp';
const ROOT_DIR = process.env.ROOT_DIR || '/tmp/hubtest/work';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 860 }, locale: 'zh-CN' });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));

  await p.goto(HUB);
  await p.waitForSelector('#onboardOverlay:not([hidden])');
  assert.equal(await p.textContent('#onboardTitle'), '欢迎使用 Clootee');
  assert.equal(await p.textContent('#onboardNext'), '一键开始');
  assert.ok(await p.isVisible('#onboardSkip'), 'advanced entry is visible');
  assert.equal(await p.isVisible('#onboardSteps'), false, 'no step dots on the quick screen');
  await p.screenshot({ path: `${SHOTS}/quick_1_welcome.png` });
  // 「高级」入口能进入原来的五步引导；刷新后回到一键开始
  await p.click('#onboardSkip');
  assert.ok(await p.isVisible('#onboardSteps'), 'advanced flow shows step dots');
  assert.match(await p.textContent('#onboardTitle'), /第 1 步/);
  await p.reload();
  await p.waitForSelector('#onboardOverlay:not([hidden])');
  assert.equal(await p.textContent('#onboardNext'), '一键开始');

  const t0 = Date.now();
  await p.click('#onboardNext');
  await p.waitForSelector('#onboardOverlay', { state: 'hidden', timeout: 240000 });
  console.log(`  quick start finished in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  assert.ok(await p.evaluate(() => !!localStorage.getItem('token')), 'browser holds the local token');
  assert.equal(await p.isVisible('#setupOverlay'), false, 'no password prompt');

  const st = await p.evaluate(async () => (await (await fetch('/api/console/status', { headers: { 'x-auth-token': localStorage.getItem('token') } })).json()).data);
  assert.equal(st.active, true); assert.equal(st.balanceMicro, 700000);
  await p.waitForSelector('#clooteeBal:not([hidden])');
  console.log('  badge:', await p.textContent('#clooteeBal'));

  // 建一个工作目录 + 会话，真实发一条消息
  const tok = await p.evaluate(() => localStorage.getItem('token'));
  const call = (path, body) => p.evaluate(async ([path, body, tok]) => {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'x-auth-token': tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return r.json();
  }, [path, body, tok]);
  require('fs').mkdirSync(ROOT_DIR, { recursive: true });
  const root = await call('/api/root/add', { path: ROOT_DIR, name: 'work' });
  assert.ok(root.success, JSON.stringify(root));
  const sess = await call('/api/session/create', { rootId: root.data.id, name: 'quick', engine: 'claude' });
  assert.ok(sess.success, JSON.stringify(sess));
  const sid = sess.data.id;
  const add = await call('/api/task/add', { sessionId: sid, prompts: ['Create hello.txt containing the word hi, then reply DONE.'] });
  assert.ok(add.success, JSON.stringify(add));
  // 等任务结束
  let s2;
  for (let i = 0; i < 120; i++) {
    s2 = await call(`/api/session/get?id=${encodeURIComponent(sid)}`);
    const tasks = (s2.data && s2.data.tasks) || [];
    if (tasks.length && tasks.every((t) => t.status === 'done' || t.status === 'error')) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const task = s2.data.tasks[0];
  assert.equal(task.status, 'done', `task failed: ${task.error}`);
  assert.equal(require('fs').readFileSync(`${ROOT_DIR}/hello.txt`, 'utf8').trim().toLowerCase(), 'hi');
  console.log(`  real task done in ${((task.finishedAt - task.startedAt) / 1000).toFixed(1)}s`);

  // UI：打开这个会话，回复下面的「耗时」后面要有「本次 $x · 剩余 $y」
  await p.reload();
  await p.waitForSelector('#clooteeBal:not([hidden])');
  await p.evaluate((id) => selectSession(id), sid);
  await p.waitForFunction(() => /本次 \$\d/.test((document.querySelector('.msg-elapsed') || {}).textContent || ''), null, { timeout: 20000 });
  const note = await p.textContent('.msg-elapsed');
  console.log('  turn note:', note);
  assert.match(note, /本次 \$0\.\d{4} · 剩余 \$0\.\d{4}/);
  const badge = await p.textContent('#clooteeBal');
  console.log('  badge after:', badge);
  assert.match(badge, /^◎ \$0\.6\d{3}$/, 'badge reflects spending');
  await p.screenshot({ path: `${SHOTS}/quick_2_app.png` });
  // 额度用完：清零余额后再发一条 → 任务失败 → 原地弹出「充值 / 改用自己的服务商」
  if (process.env.ZERO_CMD) {
    require('child_process').execSync(process.env.ZERO_CMD, { stdio: 'inherit' });
    await call('/api/task/add', { sessionId: sid, prompts: ['say hi'] });
    await p.waitForSelector('#clooteeOut', { timeout: 120000 });
    const txt = await p.textContent('#clooteeOut');
    console.log('  out-of-credit popup:', txt.replace(/\s+/g, ' ').trim().slice(0, 120));
    assert.ok(txt.includes('去充值') && txt.includes('改用自己的服务商'));
    await p.screenshot({ path: `${SHOTS}/quick_3_out.png` });
  }
  console.log('  page errors so far:', errs.length ? errs : 'none');
  await b.close();
  assert.deepEqual(errs, []);
  console.log('QUICKSTART UI PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
