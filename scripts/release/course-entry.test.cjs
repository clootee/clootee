const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('projects/claude_hub/frontend/app.js', 'utf8');
const script = source.slice(source.indexOf('let courseOpening = false;'), source.indexOf('// ── 使用指南', source.indexOf('let courseOpening = false;')));
function setup({ desktop = false, blocked = false, result, error, pending } = {}) {
  const opened = [], navigated = [], alerts = [], calls = [];
  const tab = { opener: {}, document: { title: '', body: {} }, closed: false, location: { replace: u => navigated.push(u) }, close() { this.closed = true; } };
  const context = vm.createContext({ URL, window: { clooteeDesktop: desktop, open: (...args) => { opened.push(args); return blocked ? null : tab; } }, closeGuideMenu() {}, T: k => k, currentLang: () => 'zh', alert: m => alerts.push(m), api: async (...args) => { calls.push(args); if (pending) await pending; if (error) throw error; return result || { url: 'https://clootee.com/learn/connect?lang=zh#ticket=test' }; } });
  vm.runInContext(script, context);
  return { context, opened, navigated, alerts, tab, calls, run: () => vm.runInContext('openLearnCourse()', context) };
}
test('browser opens synchronously, removes opener and navigates after handoff', async () => { const t = setup(); const p = t.run(); assert.equal(t.opened[0][0], 'about:blank'); assert.equal(t.tab.opener, null); await p; assert.match(t.navigated[0], /^https:\/\/clootee.com\/learn\/connect/); assert.equal(t.calls[0][0], '/api/console/course/link'); });
test('desktop opens final external URL without relying on a popup handle', async () => { const t = setup({ desktop: true }); await t.run(); assert.equal(t.opened.length, 1); assert.match(t.opened[0][0], /^https:\/\/clootee.com\/learn\/connect/); });
test('signed-out fallback uses normal hosted course entry', async () => { const t = setup({ result: { url: 'https://clootee.com/learn/?lang=zh' } }); await t.run(); assert.equal(t.navigated[0], 'https://clootee.com/learn/?lang=zh'); });
test('blocked popup does not issue a ticket; failure closes placeholder; untrusted redirect rejected', async () => { const blocked = setup({ blocked: true }); await blocked.run(); assert.equal(blocked.calls.length, 0); assert.equal(blocked.alerts[0], 'coursePopupBlocked'); for (const config of [{ error: Error('offline') }, { result: { url: 'https://evil.example/learn/' } }]) { const t = setup(config); await t.run(); assert.equal(t.navigated.length, 0); assert.equal(t.tab.closed, true); assert.equal(t.alerts.length, 1); } });
test('repeated click during handoff does not issue extra tickets', async () => { let finish; const pending = new Promise(r => { finish = r; }); const t = setup({ pending }); const first = t.run(); await t.run(); assert.equal(t.calls.length, 1); assert.equal(t.opened.length, 1); finish(); await first; });
