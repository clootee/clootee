// 新用户首启全流程：强制引导（语言/主题 → 网络体检 → 引擎 → 服务商 → 登录/API Key）
// → 最后设访问密码 → 进入主界面。
// 需要一个 data/ 为空（尚未设密码）的实例：HUB_URL=http://127.0.0.1:8975 npx playwright test e2e/onboard_flow.spec.js
const { test, expect } = require('@playwright/test');

const BASE = process.env.HUB_URL || 'http://127.0.0.1:8975';
const PWD = process.env.E2E_PASSWORD || 'test1234';

test('新用户必须走完引导才能设密码进入', async ({ page }) => {
  page.on('dialog', (d) => { console.log('[dialog]', d.message()); d.dismiss(); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(BASE);

  // ① 引导必须自动弹出，且没有「以后再说」
  const ob = page.locator('#onboardOverlay');
  await expect(ob).toBeVisible();
  await expect(page.locator('#onboardSkip')).toBeHidden();
  await expect(page.locator('#setupOverlay')).toBeHidden(); // 密码在最后，不能先弹
  await expect(page.locator('#loginOverlay')).toBeHidden();

  // 第 1 步：没选语言/主题前不能下一步
  await expect(page.locator('#onboardNext')).toBeDisabled();
  await page.click('[data-lang="zh"]');
  await expect(page.locator('#onboardNext')).toBeDisabled(); // 只选了语言
  await page.click('[data-theme="dark"]');
  await expect(page.locator('#onboardNext')).toBeEnabled();
  await page.click('#onboardNext');

  // 第 2 步：网络体检。体检跑完之前不放行；跑完后卡片必须给出结论（正常 / 没网 / 连不上 Claude）
  await expect(page.locator('#obNetBox .hc')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#obNetBox .hc-badge')).not.toHaveText('', { timeout: 30000 });
  await expect(page.locator('#onboardNext')).toBeEnabled({ timeout: 30000 });
  await page.click('#onboardNext');

  // 第 3 步：没选引擎前不能下一步
  await expect(page.locator('#onboardNext')).toBeDisabled();
  await page.click('[data-engine="claude"]');
  await expect(page.locator('#onboardNext')).toBeEnabled();
  await page.click('#onboardNext');

  // 第 4 步：没选服务商前不能下一步
  await expect(page.locator('#onboardNext')).toBeDisabled();
  await page.click('[data-pv="xiaomi"]');
  await page.click('#onboardNext');

  // 第 5 步（第三方服务商）：不填 Key 点完成 → 拦住
  await expect(page.locator('#onboardKey')).toBeVisible();
  await page.click('#onboardNext');
  await expect(page.locator('#onboardKeyMsg')).not.toHaveText('');
  await expect(page.locator('#setupOverlay')).toBeHidden();

  // 填了 Key 但没选模型 → 依然拦住
  await page.fill('#onboardKey', 'sk-fake-key-for-e2e');
  await page.click('#onboardNext');
  await expect(page.locator('#onboardKeyMsg')).not.toHaveText('');
  await expect(page.locator('#setupOverlay')).toBeHidden();

  // 退回第 4 步改选「原版」→ 原版 Claude 还有一步「登录账号」
  await page.click('#onboardBack');
  await page.click('[data-pv="official"]');
  await page.click('#onboardNext');

  // 第 5 步（原版 Claude）：登录卡片必须出现；未登录时「完成」不可点，
  // 但一定有「稍后再登录」这条退路——不能把新用户堵死在这里。
  await expect(page.locator('#obLoginBox .cl')).toBeVisible({ timeout: 30000 });
  if (await page.locator('#onboardNext').isDisabled()) {
    await page.click('#obLoginSkip');
    await expect(page.locator('#onboardNext')).toBeEnabled();
  }
  await page.click('#onboardNext');

  // ② 引导完成后才出现设密码，且是最后一步
  await expect(page.locator('#setupOverlay')).toBeVisible({ timeout: 15000 });
  await expect(ob).toBeHidden();

  await page.fill('#setupPwd', PWD);
  await page.fill('#setupPwd2', PWD);
  await page.click('#setupBtn');

  // ③ 进入主界面
  await expect(page.locator('#setupOverlay')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#onboardOverlay')).toBeHidden();

  // ④ 进入后主区域必须告诉用户下一步：先加项目目录（否则一片空白，不知道点哪个 ＋）
  const gs = page.locator('.getting-started');
  await expect(gs).toBeVisible();
  await expect(gs.locator('.gs-step.on .gs-t')).toHaveText(/directory|目录/);
  await page.click('#gsAction'); // = 添加目录 → 先弹「选已有目录 / 新建项目」引导
  await expect(page.locator('#addRootGuideOverlay')).toBeVisible();
  await page.click('#argExisting');
  await expect(page.locator('#pickerOverlay')).toBeVisible();
  await expect(page.locator('#pickerPath')).not.toHaveValue(''); // 等首屏（主目录）加载完，否则会被覆盖
  await page.fill('#pickerPath', process.env.E2E_ROOT || 'D:\\projects\\hubtest');
  await page.click('#pickerGo');
  await expect(page.locator('#pickerPath')).toHaveValue(/hubtest$/); // 等目录真的切过去
  await page.click('#pickerSelect');
  await expect(page.locator('#pickerOverlay')).toBeHidden({ timeout: 30000 });

  // 目录加完并选中（扫会话可能慢，给足时间）
  await expect
    .poll(() => page.evaluate(() => !!State.rootId), { timeout: 60000 })
    .toBe(true);

  // 该目录下没有会话时，引导前进到第 3 步「新建会话」；已有历史会话则直接打开会话（都不是空白）
  if (await gs.isVisible()) {
    await expect(gs.locator('.gs-step.on .gs-t')).toHaveText(/session|会话/);
    await page.click('#gsAction'); // = 新建会话
    await expect(page.locator('.getting-started')).toBeHidden({ timeout: 20000 });
  } else {
    await expect(page.locator('#messages')).not.toBeEmpty();
  }

  // ⑤ 老用户再打开：不再弹引导，只需登录
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.removeItem('token'));
  await page.reload();
  await expect(page.locator('#loginOverlay')).toBeVisible();
  await expect(page.locator('#onboardOverlay')).toBeHidden();
  await page.fill('#loginPwd', PWD);
  await page.locator('#loginForm button[type="submit"], #loginForm .primary').first().click();
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 15000 });
  await expect(page.locator('#onboardOverlay')).toBeHidden();
});
