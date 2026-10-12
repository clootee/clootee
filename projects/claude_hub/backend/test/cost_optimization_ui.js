const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../node_modules/@playwright/test');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend');
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  const dict = new Function('localStorage', 'navigator', fs.readFileSync(path.join(frontend, 'trans.js'), 'utf8') + '\nreturn DICT;')(
    { getItem: () => 'zh', setItem() {} }, { language: 'zh' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent(html);
    await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, 'styles.css'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(frontend, 'helper/ErrorHandler.js'), 'utf8') });
    await page.evaluate(dictionary => {
      window.lang = 'zh'; window.T = key => dictionary[key]?.[window.lang] || key;
      window.$ = id => document.getElementById(id);
      window.TOKEN = 'test'; window.fmtNum = n => String(n);
      window.ApiBill = { usd: n => '$' + Number(n).toFixed(4) };
      window.State = { sessionId: 'old', session: { id: 'old', rootId: 'root', engine: 'claude', tasks: [] },
        settings: { claudePromptCache: '1h', costOptimization: { mode: 'auto', scope: 'both' } } };
      window.fillContextPane = () => { $('autoCompactModeSelect').value = 'auto'; $('autoCompactTokensInput').value = 200000; };
      window.setPaneNotice = () => {};
      window.patchSettings = async p => { State.settings = { ...State.settings, ...p }; return State.settings; };
      window.fixture = { active: true, blocked: true, strict: true, tokens: 100000, cacheState: 'expired',
        costs: { warmUsd: 0.02, coldUsd: 0.8 }, fingerprint: 'state', canCompact: true };
      window.calls = [];
      window.api = async (p, b) => {
        window.calls.push({ p, b });
        if (p === '/api/cost/check') return { ...window.fixture };
        if (p === '/api/cost/approve') return { approvals: ['permit'] };
        if (p === '/api/cost/compact') throw new Error('cost_compact_not_confirmed');
        return {};
      };
      window.fetch = async () => new Response([
        { stage: 'checking', progress: 10 }, { stage: 'enhancing', progress: 45 }, { stage: 'creating', progress: 85 },
        { stage: 'ready', progress: 100, data: { sessionId: 'new', prompt: 'Change the settings label to Apply.', helperUsd: 0.001 } },
      ].map(e => JSON.stringify(e)).join('\n') + '\n', { status: 200 });
    }, dict);
    await page.addScriptTag({ content: fs.readFileSync(path.join(frontend, 'prompt-cache.js'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(frontend, 'cost-optimization.js'), 'utf8') + '\nwindow.Ui = CostUi;' });
    await page.evaluate(() => { Ui.bind(); Ui.applyText(); Ui.fill(); $('settingsPaneOverlay').hidden = false; $('pane-cost').hidden = false; });
    assert.equal(await page.locator('#costMode').inputValue(), 'auto');
    assert.equal(await page.locator('#costScope').inputValue(), 'both');
    assert.equal(await page.locator('#costManual').isVisible(), false);
    await page.selectOption('#costMode', 'manual');
    assert.equal(await page.locator('#costManual').isVisible(), true);
    await page.check('#costStrict'); await page.evaluate(() => Ui.save());
    assert.equal(await page.evaluate(() => State.settings.costOptimization.strict), true);
    await page.evaluate(() => { $('settingsPaneOverlay').hidden = true; window.answer = undefined; Ui.prepare(['Continue']).then(r => { window.answer = r; }); });
    await page.waitForSelector('#costGuardModal[open]');
    assert.equal(await page.locator('#costContinue').isVisible(), false, 'strict mode hides the bypass');
    await page.click('#costCompact');
    await page.waitForFunction(() => document.getElementById('costGuardError').textContent.length > 0);
    assert.equal(await page.locator('#costGuardModal').evaluate(el => el.open), true, 'failed compaction must not send');
    await page.click('#costCancel');
    await page.waitForFunction(() => window.answer === null);
    assert.equal(await page.evaluate(() => window.calls.some(c => c.p === '/api/task/add')), false);
    await page.evaluate(() => { window.answer = undefined; Ui.prepare(['Continue']).then(r => { window.answer = r; }); });
    await page.waitForSelector('#costGuardModal[open]');
    await page.click('#costNew');
    await page.waitForSelector('#costPrepared', { state: 'visible' });
    assert.equal(await page.locator('#costProgressBar').evaluate(el => el.value), 100);
    assert.equal(await page.evaluate(() => window.answer), undefined, 'prepared text requires explicit review');
    await page.fill('#costPreparedInput', 'Change the title to Apply, then run tests.');
    await page.click('#costPreparedSend');
    await page.waitForFunction(() => window.answer?.sessionId === 'new');
    assert.deepEqual(await page.evaluate(() => window.answer.prompts), ['Change the title to Apply, then run tests.']);
    await page.evaluate(() => { window.lang = 'en'; Ui.applyText(); window.fixture.strict = false; window.answer = undefined; Ui.prepare(['Independent task']).then(r => { window.answer = r; }); });
    await page.waitForSelector('#costGuardModal[open]');
    assert.equal(await page.locator('#costContinue').isVisible(), true);
    await page.click('#costContinue');
    await page.waitForFunction(() => window.answer?.costApprovals?.length === 1);
    assert.deepEqual(errors, []);
    process.stdout.write('cost_optimization_ui: centralized modes, strict lock, failure, progress, review and approvals passed\n');
  } finally { await browser.close(); }
}
main().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
