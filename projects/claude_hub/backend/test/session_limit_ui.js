const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../node_modules/@playwright/test');

async function main() {
  const frontend = path.resolve(__dirname, '../../frontend');
  const dict = new Function('localStorage', 'navigator', fs.readFileSync(path.join(frontend, 'trans.js'), 'utf8') + '\nreturn DICT;')(
    { getItem: () => 'zh', setItem() {} }, { language: 'zh' });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 780 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent('<body class="dark"><div id="messages"></div><textarea id="taskInput">Unsent draft</textarea><button id="addTaskBtn">Send</button></body>');
    await page.addStyleTag({ content: fs.readFileSync(path.join(frontend, 'styles.css'), 'utf8') });
    await page.evaluate(dict => {
      window.$ = id => document.getElementById(id);
      window.lang = 'zh';
      window.T = key => dict[key]?.[window.lang] || key;
      window.State = { sessionId: 'old', session: { rootId: 'root' } };
      window.ErrorHandler = { handle: e => e.message };
      window.alerts = [];
      window.alert = text => alerts.push(text);
      window.newSession = () => { State.sessionId = 'new'; };
      window.fixture = { count: 14, queued: 0, warnAt: 15, max: 20, warning: false, blocked: false };
      window.api = async () => ({ ...fixture });
    }, dict);
    await page.addScriptTag({ content: fs.readFileSync(path.join(frontend, 'session-limit.js'), 'utf8') + '\nwindow.Ui = SessionLimitUi;' });
    await page.evaluate(() => Ui.load());
    assert.equal(await page.locator('#sessionLimitBanner').count(), 0);
    await page.evaluate(() => { fixture.count = 15; fixture.warning = true; return Ui.load(); });
    assert.match(await page.locator('#sessionLimitBanner').innerText(), /强烈建议/);
    assert.equal(await page.locator('#sessionLimitBanner').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(239, 68, 68)');
    assert.equal(await page.locator('#addTaskBtn').isEnabled(), true);
    await page.evaluate(() => {
      const panel = document.createElement('div');
      panel.id = 'settingsPaneOverlay'; panel.hidden = true;
      panel.style.cssText = 'position:fixed;inset:20px;background:white;overflow:auto;height:250px;z-index:10';
      panel.innerHTML = '<div style="height:700px"></div><div id="costMessageLimits" tabindex="-1"><input id="costWarnMessages" value="15"><input id="costMaxMessages" value="20"></div><div style="height:700px"></div>';
      document.body.appendChild(panel);
      window.openSettings = () => {};
      window.openSettingsPane = id => { window.openedPane = id; panel.hidden = false; panel.scrollTop = 0; };
    });
    for (const blocked of [false, true]) {
      await page.evaluate(blocked => { fixture.blocked = blocked; fixture.count = blocked ? 20 : 15; fixture.warning = true; return Ui.load(); }, blocked);
      assert.match(await page.locator('#sessionLimitBanner').innerText(), /您可以在设置中修改阈值/);
      await page.click('.session-limit-settings-link');
      await page.waitForFunction(() => document.activeElement?.id === 'costMessageLimits');
      await page.waitForFunction(() => {
        const target = document.getElementById('costMessageLimits').getBoundingClientRect();
        const panel = document.getElementById('settingsPaneOverlay').getBoundingClientRect();
        return target.top >= panel.top && target.bottom <= panel.bottom;
      });
      assert.equal(await page.evaluate(() => openedPane), 'cost');
      await page.evaluate(() => { document.getElementById('settingsPaneOverlay').hidden = true; });
    }
    await page.evaluate(() => { fixture.count = 19; return Ui.load(); });
    await page.evaluate(() => { fixture.blocked = false; return Ui.load(); });
    assert.equal(await page.evaluate(() => Ui.prepare(1)), true);
    assert.equal(await page.evaluate(() => Ui.prepare(2)), false);
    assert.equal(await page.locator('#taskInput').inputValue(), 'Unsent draft');
    await page.evaluate(() => { fixture.count = 20; fixture.blocked = true; return Ui.load(); });
    assert.match(await page.locator('#sessionLimitBanner').innerText(), /必须开新会话/);
    assert.equal(await page.locator('#addTaskBtn').isDisabled(), true);
    assert.equal(await page.evaluate(() => Ui.prepare(1)), false);
    for (const language of ['zh', 'en']) {
      await page.evaluate(language => { window.lang = language; Ui.render(); }, language);
      assert.equal(await page.locator('#sessionLimitBanner').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'mobile banner fits');
    }
    await page.click('#sessionLimitBanner > button');
    await page.evaluate(() => Ui.render());
    assert.equal(await page.locator('#sessionLimitBanner').count(), 0);
    assert.equal(await page.locator('#addTaskBtn').isEnabled(), true);
    assert.equal(await page.locator('#taskInput').inputValue(), 'Unsent draft');
    // A late response for the previous session must never lock the new one.
    await page.evaluate(async () => {
      let resolve;
      window.api = () => new Promise(r => { resolve = r; });
      const pending = Ui.load();
      State.sessionId = 'another';
      resolve({ ...fixture });
      await pending;
      Ui.render();
    });
    assert.equal(await page.locator('#addTaskBtn').isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log('session_limit_ui: red warning, hard stop, batch limits, draft retention, mobile, zh/en and stale responses passed');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
