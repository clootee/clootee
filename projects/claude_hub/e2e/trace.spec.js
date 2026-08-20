// Playwright E2E：过程轨迹 Trace 的两个入口
//   ① 每条 AI 消息头部「🔍」→ 内联展开该轮全过程（工具入参/输出/耗时）
//   ② 头部 🕒 →「全过程」抽屉（整会话时间线 + 耗时统计）
const { test, expect } = require('@playwright/test');

// 测试口令从环境变量读取（不在仓库里写死任何口令）：
//   E2E_PASSWORD='你本机设定的访问口令' npm run e2e
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) throw new Error('缺少 E2E_PASSWORD 环境变量：请设为本机 claude-hub 的访问口令');

test('trace: 消息内联展开 + 全过程抽屉', async ({ page }) => {
  test.setTimeout(180000);
  page.on('dialog', async (d) => d.accept());

  await page.goto('/');
  await expect(page.locator('#loginOverlay')).toBeVisible();
  await page.fill('#loginPwd', PASSWORD);
  await page.click('#loginBtn');
  await expect(page.locator('#loginOverlay')).toBeHidden();

  // 先选根目录 claudecode（本仓库自身，会话里有真实历史与轨迹）
  // 选项异步加载，先等 claudecode 出现再选（避免竞态）
  await page.waitForFunction(
    () => [...document.querySelectorAll('#rootSelect option')].some((o) => o.textContent.includes('claudecode')),
    null,
    { timeout: 20000 },
  );
  const rootValue = await page.evaluate(
    () => [...document.querySelectorAll('#rootSelect option')].find((o) => o.textContent.includes('claudecode')).value,
  );
  await page.selectOption('#rootSelect', rootValue);

  // 选一个已有会话（列表第一个），它应当有历史消息
  const firstSession = page.locator('.session-item').first();
  await expect(firstSession).toBeVisible({ timeout: 20000 });
  await firstSession.click();
  await expect(page.locator('.msg').first()).toBeVisible({ timeout: 20000 });

  // ① 消息内联「🔍 过程」
  const traceBtn = page.locator('.msg.assistant .trace-btn').last();
  await expect(traceBtn).toBeVisible();
  await traceBtn.click();
  const inline = page.locator('.msg.assistant .tr-inline').last();
  await expect(inline).toBeVisible();
  // 要么有事件（小结条 + 事件行），要么明确提示这轮没有留存
  await expect(inline.locator('.tr-inline-sum, .tr-inline-empty').first()).toBeVisible({ timeout: 15000 });
  const sum = inline.locator('.tr-inline-sum');
  if (await sum.count()) {
    console.log('内联小结:', (await sum.innerText()).replace(/\s+/g, ' '));
    await expect(inline.locator('.tr-ev').first()).toBeVisible();
    // 展开第一条事件，确认能看到完整入参/输出
    await inline.locator('.tr-ev').first().locator('summary').click();
    await expect(inline.locator('.tr-ev').first().locator('pre')).toBeVisible();
  }
  // 再点一次收起
  await traceBtn.click();
  await expect(page.locator('.msg.assistant .tr-inline')).toHaveCount(0);

  // ② 全过程抽屉
  await page.click('#traceBtn');
  await expect(page.locator('#trOverlay')).toBeVisible();
  await expect(page.locator('#trStats')).toContainText('事件', { timeout: 20000 });
  console.log('抽屉统计:', (await page.locator('#trStats').innerText()).replace(/\s+/g, ' '));
  const chips = page.locator('#trFilters .tr-chip');
  expect(await chips.count()).toBeGreaterThan(0);
  const events = page.locator('#trList .tr-ev');
  expect(await events.count()).toBeGreaterThan(0);

  // 种类过滤：只留第一个 chip
  const firstChipText = await chips.first().innerText();
  await chips.first().click();
  await expect(page.locator('#trList .tr-ev').first()).toBeVisible();
  console.log('过滤为:', firstChipText.trim(), '→ 剩余', await page.locator('#trList .tr-ev').count());

  await page.click('#trClose');
  await expect(page.locator('#trOverlay')).toBeHidden();
});
