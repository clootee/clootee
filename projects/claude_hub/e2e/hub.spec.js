// Playwright E2E：登录 / 主题 / 多任务执行（实际创建本地文件）/ 过程与消息分离
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:8970';
// 测试口令从环境变量读取（不在仓库里写死任何口令）：
//   E2E_PASSWORD='你本机设定的访问口令' npm run e2e
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) throw new Error('缺少 E2E_PASSWORD 环境变量：请设为本机 claude-hub 的访问口令');
// 用一个干净的工作目录作为根目录，任务会在此创建文件
const WORKDIR = path.resolve(__dirname, '../data/e2e-workdir');

test.beforeAll(() => {
  fs.rmSync(WORKDIR, { recursive: true, force: true });
  fs.mkdirSync(WORKDIR, { recursive: true });
});

test('login, theme, multi-task file creation', async ({ page }) => {
  test.setTimeout(180000);

  // 自动应答 confirm()（删除确认等）
  page.on('dialog', async (d) => d.accept());

  await page.goto(BASE);

  // 1) 登录遮罩出现
  await expect(page.locator('#loginOverlay')).toBeVisible();
  await page.fill('#loginPwd', PASSWORD);
  await page.click('#loginBtn');
  await expect(page.locator('#loginOverlay')).toBeHidden();

  // 2) 主题切换：深 -> 浅 -> 深
  await expect(page.locator('body')).toHaveClass(/dark/);
  await page.click('#themeBtn');
  await expect(page.locator('body')).toHaveClass(/light/);
  await page.click('#themeBtn');
  await expect(page.locator('body')).toHaveClass(/dark/);

  // 3) 添加根目录：用目录选择器（导航 + 搜索）
  await page.click('#addRootBtn');
  await expect(page.locator('#pickerOverlay')).toBeVisible();
  // 导航到 workdir 的上级目录
  const parent = path.dirname(WORKDIR);
  await page.fill('#pickerPath', parent);
  await page.press('#pickerPath', 'Enter');
  await expect(page.locator('#pickerList')).toContainText('e2e-workdir');
  // 用搜索框过滤并点击结果进入该目录
  await page.fill('#pickerSearch', 'e2e-workdir');
  const row = page.locator('.dir-row', { hasText: 'e2e-workdir' }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('#pickerPath')).toHaveValue(WORKDIR);
  // 命名并选择
  await page.fill('#pickerName', 'e2e-root');
  await page.click('#pickerSelect');
  await expect(page.locator('#pickerOverlay')).toBeHidden();
  await expect(page.locator('#rootSelect')).toContainText('e2e-root');

  // 4) 新建会话
  await page.click('#newSessionBtn');
  await expect(page.locator('.session-item.active')).toBeVisible();

  // 5) 一次性提交多个任务（多任务队列）
  const tasks = [
    'Create a file named alpha.txt containing exactly the text: ALPHA_OK',
    'Create a file named beta.txt containing exactly the text: BETA_OK',
  ];
  for (const t of tasks) {
    await page.fill('#taskInput', t);
    await page.click('#addTaskBtn');
    await page.waitForTimeout(300);
  }
  // 队列中应出现两个任务
  await expect(page.locator('#queue .qtask')).toHaveCount(2);

  // 6) 过程面板应出现实时活动（思考/工具）
  await expect(page.locator('#processLog .plog').first()).toBeVisible({ timeout: 60000 });

  // 7) 等待两个文件被实际创建（顺序执行）
  const alpha = path.join(WORKDIR, 'alpha.txt');
  const beta = path.join(WORKDIR, 'beta.txt');
  await expect.poll(() => fs.existsSync(alpha), { timeout: 120000, intervals: [2000] }).toBe(true);
  await expect.poll(() => fs.existsSync(beta), { timeout: 120000, intervals: [2000] }).toBe(true);
  expect(fs.readFileSync(alpha, 'utf8')).toContain('ALPHA_OK');
  expect(fs.readFileSync(beta, 'utf8')).toContain('BETA_OK');

  // 8) 最终消息列表里应有用户消息与助手消息（思考过程不在此处）
  await expect(page.locator('.msg.user')).toHaveCount(2, { timeout: 10000 });
  await expect(page.locator('.msg.assistant').first()).toBeVisible();

  // 9) 持久登录：刷新后不需要重新登录
  await page.reload();
  await expect(page.locator('#loginOverlay')).toBeHidden();
});
