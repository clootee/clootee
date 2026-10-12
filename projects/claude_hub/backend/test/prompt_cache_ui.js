const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../node_modules/@playwright/test');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend');
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  const dict = new Function('localStorage', 'navigator', fs.readFileSync(path.join(frontend, 'trans.js'), 'utf8') + '\nreturn DICT;')(
    { getItem: () => 'zh', setItem() {} }, { language: 'zh' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setContent('<button id="sessionPromptCache"></button>' + html.match(/<div class="prompt-cache-settings">[\s\S]*?<\/div>/)[0] +
      html.match(/<dialog id="promptCacheModal"[\s\S]*?<\/dialog>/)[0]);
    await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, 'styles.css'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(frontend, 'helper/ErrorHandler.js'), 'utf8') });
    await page.evaluate((dictionary) => {
      window.lang = 'zh';
      window.T = (key) => dictionary[key]?.[window.lang] || key;
      window.$ = (id) => document.getElementById(id);
      window.State = { sessionId: 'draft', session: { id: 'draft', rootId: 'root', engine: 'claude', promptCache: '1h', promptCacheConfirmed: false, tasks: [], messages: [] },
        settings: { claudePromptCache: '1h', askClaudePromptCache: true } };
      window.setPaneNotice = () => {};
      window.api = async (_url, data) => {
        window.lastPayload = data;
        if (window.fail) throw new Error('test save error');
        return { promptCache: data.mode, promptCacheConfirmed: true };
      };
    }, dict);
    await page.addScriptTag({ content: fs.readFileSync(path.join(frontend, 'prompt-cache.js'), 'utf8') + '\nwindow.CacheUi = PromptCacheUi;' });
    await page.evaluate(() => { CacheUi.bind(); CacheUi.fill(); CacheUi.applyText(); });
    assert.equal(await page.locator('#claudePromptCache').inputValue(), '1h');
    assert.equal(await page.locator('#askClaudePromptCache').isChecked(), true);
    assert.equal(await page.locator('#sessionPromptCache').innerText(), '缓存：1 小时');
    await page.evaluate(() => { window.choice = null; CacheUi.ensure().then((ok) => { window.choice = ok; }); });
    await page.waitForSelector('#promptCacheModal[open]');
    assert.equal(await page.locator('input[name=promptCacheChoice][value="1h"]').isChecked(), true);
    assert.equal(await page.evaluate(() => CacheUi.pending), true);
    await page.click('#promptCacheCancel');
    await page.waitForFunction(() => window.choice === false);
    assert.equal(await page.evaluate(() => State.session.promptCacheConfirmed), false);
    await page.click('#sessionPromptCache');
    await page.locator('input[name=promptCacheChoice][value="5m"]').check();
    await page.click('#promptCacheConfirm');
    await page.waitForFunction(() => !document.getElementById('promptCacheModal').open);
    assert.equal(await page.evaluate(() => State.session.promptCache), '5m');
    await page.waitForFunction(() => !CacheUi.pending);
    assert.equal(await page.evaluate(() => CacheUi.ensure()), true);
    await page.evaluate(() => { window.lang = 'en'; CacheUi.applyText(); });
    await page.click('#sessionPromptCache');
    await page.click('#promptCacheAdvanced');
    await page.locator('input[name=promptCacheChoice][value=off]').check();
    await page.evaluate(() => { window.fail = true; });
    await page.click('#promptCacheConfirm');
    await page.waitForFunction(() => document.getElementById('promptCacheError').textContent.includes('test save error'));
    assert.equal(await page.locator('#promptCacheModal').evaluate((el) => el.open), true);
    assert.equal(await page.evaluate(() => State.session.promptCache), '5m');
    await page.evaluate(() => { window.fail = false; });
    await page.click('#promptCacheConfirm');
    await page.waitForFunction(() => !document.getElementById('promptCacheModal').open);
    assert.equal(await page.evaluate(() => State.session.promptCache), 'off');
    await page.evaluate(() => { State.session.engine = 'codex'; CacheUi.render(); });
    assert.equal(await page.locator('#sessionPromptCache').isVisible(), false);
    assert.equal(await page.evaluate(() => CacheUi.ensure()), true);
    assert.deepEqual(errors, []);
    process.stdout.write('prompt_cache_ui: choices, cancellation, retry, mobile viewport and languages passed\n');
  } finally { await browser.close(); }
}
main().catch((e) => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
