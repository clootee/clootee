const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('http://update.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://update.test/');
    const frontend = path.resolve(__dirname, '../../frontend');
    const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.setContent(html);
    await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, 'styles.css'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(frontend, 'trans.js'), 'utf8') });
    const app = fs.readFileSync(path.join(frontend, 'app.js'), 'utf8');
    await page.addScriptTag({ content: app.slice(app.indexOf('function confirmAppUpdateOverwrite()'), app.indexOf('async function applyAppUpdate()')) });
    await page.evaluate(() => {
      window.$ = id => document.getElementById(id);
      window.UpdateApplyLog = { watch() {}, stop() {} };
      window.waitForAppRestart = (_box, instance) => { window.restartedFrom = instance; };
    });
    for (const lang of ['zh', 'en']) {
      await page.evaluate(lang => { setLang(lang); window.decision = confirmAppUpdateOverwrite(); }, lang);
      await page.locator('#updateConflictModal').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#updConflictCancel').textContent(), lang === 'zh' ? '放弃更新' : 'Cancel update');
      assert.equal(await page.locator('#updConflictForce').textContent(), lang === 'zh' ? '强制更新' : 'Force update');
      const design = await page.evaluate(() => ({
        cancel: getComputedStyle($('updConflictCancel')).backgroundColor,
        force: getComputedStyle($('updConflictForce')).backgroundColor,
        enabled: !$('updConflictCancel').disabled,
        focus: document.activeElement.id,
        fits: $('updateConflictModal').getBoundingClientRect().right <= innerWidth,
      }));
      assert.deepEqual(design, { cancel: 'rgb(107, 114, 128)', force: 'rgb(37, 99, 235)', enabled: true, focus: 'updConflictCancel', fits: true });
      await page.locator('#updConflictCancel').click();
      assert.equal(await page.evaluate(() => window.decision), false);
    }
    await page.evaluate(() => { window.decision = confirmAppUpdateOverwrite(); });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.decision), false);
    process.stdout.write('PASS: bilingual dialog, gray cancel, blue force, default cancel focus, mobile fit, Escape cancellation\n');

    async function flow(mode, startup = false) {
      await page.evaluate(({ mode, startup }) => {
        window.writes = []; window.failures = 0; window.restartedFrom = '';
        window.api = async (url, body) => {
          if (url === '/api/auth/check') return { instance: 'old-instance' };
          window.writes.push(body);
          if (!body.force) return { ok: false, requiresConfirmation: true, output: 'local changes' };
          if (mode === 'error') throw new Error('fetch unavailable');
          return { ok: true, output: 'updated' };
        };
        $('appUpdApplyBtn').disabled = true;
        if (startup) $('updateModal').hidden = false;
        const box = $(startup ? 'updModalLog' : 'appUpdStatus');
        window.updating = runAppUpdate(box, () => { window.failures++; $('appUpdApplyBtn').disabled = false; });
      }, { mode, startup });
      await page.locator('#updateConflictModal').waitFor({ state: 'visible' });
      await page.locator(mode === 'cancel' ? '#updConflictCancel' : '#updConflictForce').click();
      await page.evaluate(() => window.updating);
      return page.evaluate(startup => ({
        writes: window.writes, failures: window.failures, restart: window.restartedFrom,
        retryEnabled: !$('appUpdApplyBtn').disabled, startupClosed: $('updateModal').hidden,
        text: $(startup ? 'updModalLog' : 'appUpdStatus').textContent,
      }), startup);
    }
    const cancel = await flow('cancel');
    assert.deepEqual(cancel.writes, [{ force: false }]);
    assert.equal(cancel.restart, ''); assert.equal(cancel.retryEnabled, true); assert.equal(cancel.failures, 1);
    const startupCancel = await flow('cancel', true);
    assert.equal(startupCancel.startupClosed, true);
    const accept = await flow('force');
    assert.deepEqual(accept.writes, [{ force: false }, { force: true }]);
    assert.equal(accept.restart, 'old-instance'); assert.equal(accept.failures, 0);
    const error = await flow('error');
    assert.equal(error.restart, ''); assert.equal(error.retryEnabled, true); assert.match(error.text, /fetch unavailable/);
    process.stdout.write('PASS: cancel never forces; settings/startup cancellation restores controls; force requires click; force failure permits retry\n');
  } finally { await browser.close(); }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
