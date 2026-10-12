// Browser regression: node backend/test/api_cost_selection.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../node_modules/@playwright/test');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend');
  const app = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8');
  const bill = app.slice(app.indexOf('const ApiBill = {'), app.indexOf('// ── Clootee 默认服务商'));
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  const dict = new Function('localStorage', 'navigator', fs.readFileSync(path.join(frontend, 'trans.js'), 'utf8') + '\nreturn DICT;')(
    { getItem: () => 'zh', setItem() {} }, { language: 'zh' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent('<span id="batchCost"></span><button id="batchCostDetails"></button>' + html.match(/<dialog id="batchCostModal"[\s\S]*?<\/dialog>/)[0]);
    await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, 'styles.css'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(frontend, 'helper/ErrorHandler.js'), 'utf8') });
    await page.evaluate((dictionary) => {
      window.lang = 'zh';
      window.T = (key) => dictionary[key]?.[window.lang] || key;
      window.$ = (id) => document.getElementById(id);
      window.escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      window.fmtNum = (n) => String(n);
      window.State = { selectedSessions: new Set(['a', 'b', 'zero']) };
      const entry = (usd, consumedMessages) => ({ usd, sub: 0, consumedMessages,
        breakdown: { cacheRead: usd / 10, cacheWrite5m: usd / 10, cacheWrite1h: usd / 10, input: usd / 5, output: usd / 2, webSearch: 0 },
        tokens: { cacheRead: 10, cacheWrite: 20, input: 30, output: 40 } });
      window.fixture = { a: entry(1, 1), b: entry(3, 3), zero: entry(0, 99) };
      window.calls = [];
      window.api = async (_url, { ids }) => {
        window.calls.push(ids.length);
        if (window.fail) throw new Error('fixture error');
        return Object.fromEntries(ids.filter((id) => window.fixture[id]).map((id) => [id, window.fixture[id]]));
      };
    }, dict);
    await page.addScriptTag({ content: bill + '\nwindow.Bill = ApiBill;' });
    await page.evaluate(() => {
      $('batchCostDetails').onclick = () => Bill.showSelection();
      $('batchCostClose').onclick = () => $('batchCostModal').close();
      Bill.paintSelection();
    });
    await page.click('#batchCostDetails');
    await page.waitForSelector('#batchCostBody table');
    assert.match(await page.locator('#batchCostBody').innerText(), /有消耗的会话数: 2 · 有消耗的消息数: 4/);
    const cells = await page.locator('.batch-cost-total td').allTextContents();
    assert.deepEqual(cells.slice(2), ['$4.0000', '$2.0000', '$1.0000']);
    assert.deepEqual(await page.locator('#batchCostBody tbody tr').first().locator('td').allTextContents(),
      ['缓存读取', '20', '$0.400000', '$0.200000', '$0.100000']);
    await page.click('#batchCostClose');
    assert.equal(await page.locator('#batchCostModal').evaluate((el) => el.open), false);
    await page.evaluate(() => { window.lang = 'en'; State.selectedSessions = new Set(['zero']); Bill.paintSelection(); });
    await page.click('#batchCostDetails');
    await page.waitForSelector('#batchCostBody table');
    assert.match(await page.locator('#batchCostBody').innerText(), /Sessions with cost: 0 · Messages with cost: 0/);
    assert.deepEqual((await page.locator('.batch-cost-total td').allTextContents()).slice(2), ['$0.000000', '—', '—']);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#batchCostModal').evaluate((el) => el.open), false);
    await page.evaluate(() => { State.selectedSessions = new Set(Array.from({ length: 301 }, (_, i) => String(i))); window.calls = []; });
    await page.click('#batchCostDetails');
    await page.waitForSelector('#batchCostBody table');
    assert.deepEqual(await page.evaluate(() => window.calls), [300, 1]);
    await page.click('#batchCostClose');
    await page.evaluate(() => { window.fail = true; });
    await page.click('#batchCostDetails');
    await page.waitForFunction(() => document.getElementById('batchCostBody').textContent.includes('fixture error'));
    assert.deepEqual(errors, []);
    process.stdout.write('api_cost_selection: browser checks passed\n');
  } finally { await browser.close(); }
}
main().catch((e) => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
