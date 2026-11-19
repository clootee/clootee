// Browser regression for the engine model dropdown (real frontend, mocked API, no backend started).
const { chromium } = require('../../node_modules/playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const FE = path.resolve(__dirname, '../../frontend');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };

async function scenario(browser, name, { cfgModel, stateOptions, catalogFails, catalog }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const saved = [];
  const cfg = { provider: 'official', apiKey: '', model: cfgModel, effort: '', models: stateOptions };
  await page.route('http://hub.test/**', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/api/')) {
      const j = (d) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: d, ...(d && typeof d === 'object' ? d : {}) }) });
      const p = u.pathname;
      if (p === '/api/engine/config' && r.request().method() === 'POST') { const b = r.request().postDataJSON(); saved.push(b); if (b.engine === 'claude') cfg.model = b.model; return j({}); }
      if (p === '/api/engine/config') return j({ claude: cfg, codex: { provider: 'official', apiKey: '', model: '', effort: '' } });
      if (p === '/api/model/state') return j({ claude: { engine: 'claude', provider: 'official', selected: cfg.model, effort: '', efforts: [], options: stateOptions }, codex: { engine: 'codex', provider: 'official', selected: '', effort: '', efforts: [], options: [] } });
      if (p === '/api/engine/models') return catalogFails ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'boom' }) }) : j({ models: catalog });
      if (p === '/api/engine/providers' || p === '/api/engine/catalog') return j({ providers: [{ id: 'official', engines: ['claude', 'codex'] }, { id: 'deepseek', engines: ['claude'] }] });
      if (p === '/api/auth/status') return j({ needsSetup: false, passwordEnabled: false, instance: 'x' });
      return j({});
    }
    let f = path.join(FE, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await page.goto('http://hub.test/');
  await page.waitForFunction(() => typeof providerUi === 'function' && typeof loadEngineProvider === 'function');
  // Drive the same code path as opening the settings pane.
  await page.evaluate(async () => { await loadEngineProvider('claude'); await loadModelState(); });
  const read = () => page.evaluate(() => { const s = document.getElementById('claudeModelSelect'); return { hidden: s.hidden, value: s.value, opts: [...s.options].map((o) => o.value), text: [...s.options].map((o) => o.text) }; });
  return { page, ctx, read, saved, errors, name };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const builtinLike = [];

  // 1) The reported bug: saved model absent from catalog, catalog options empty.
  let s = await scenario(browser, 'saved-not-in-catalog', { cfgModel: 'claude-fable-5-2', stateOptions: [], catalog: [] });
  let r = await s.read();
  assert.strictEqual(r.hidden, false, 'dropdown must be visible');
  assert.strictEqual(r.value, 'claude-fable-5-2');
  for (const id of ['', 'opus', 'sonnet', 'haiku', 'fable']) assert(r.opts.includes(id), 'missing ' + id);
  assert.strictEqual(new Set(r.opts).size, r.opts.length, 'no duplicates');

  // 2) Re-render (what happens after save / reopening) keeps selection
  await s.page.evaluate(async () => { await loadModelState(); });
  r = await s.read(); assert.strictEqual(r.value, 'claude-fable-5-2'); assert.strictEqual(r.hidden, false);

  // 3) Fetch fails: dropdown and selection must stay
  await s.ctx.close();
  s = await scenario(browser, 'fetch-fails', { cfgModel: 'claude-fable-5-2', stateOptions: [], catalogFails: true });
  await s.page.evaluate(async () => { await fetchEngineModels('claude'); });
  r = await s.read(); assert.strictEqual(r.hidden, false); assert.strictEqual(r.value, 'claude-fable-5-2'); assert(r.opts.includes('opus'));
  await s.ctx.close();

  // 4) Fetch succeeds: catalog merged, selection kept, aliases still present
  s = await scenario(browser, 'fetch-ok', { cfgModel: 'claude-fable-5-2', stateOptions: [], catalog: [{ id: 'claude-opus-5', label: 'Claude Opus 5', source: 'catalog' }, { id: 'claude-fable-5-2', label: 'Fable 5.2', source: 'catalog' }] });
  await s.page.evaluate(async () => { await fetchEngineModels('claude'); });
  r = await s.read(); assert.strictEqual(r.value, 'claude-fable-5-2'); assert(r.opts.includes('claude-opus-5') && r.opts.includes('fable'));
  assert.strictEqual(new Set(r.opts).size, r.opts.length);
  await s.ctx.close();

  // 5) Auto (empty model) shows dropdown on "Auto"
  s = await scenario(browser, 'auto', { cfgModel: '', stateOptions: [] });
  r = await s.read(); assert.strictEqual(r.hidden, false); assert.strictEqual(r.value, '');
  // 6) user picks fable 5.2 -> becomes dirty; saved payload contains the model
  await s.page.evaluate(() => { const sel = document.getElementById('claudeModelSelect'); sel.value = 'fable'; sel.dispatchEvent(new Event('change')); });
  await s.page.evaluate(async () => { await saveEngineProvider('claude'); });
  assert.strictEqual(s.saved.at(-1).model, 'fable');
  r = await s.read(); assert.strictEqual(r.value, 'fable');
  // 7) switch to official from a third party and back keeps dropdown visible
  await s.page.evaluate(async () => { const p = providerUi('claude').select; p.value = 'deepseek'; await onEngineProviderChange('claude'); });
  await s.page.evaluate(async () => { const p = providerUi('claude').select; p.value = 'official'; await onEngineProviderChange('claude'); });
  r = await s.read(); assert.strictEqual(r.hidden, false); assert(r.opts.includes('opus'));
  await s.ctx.close();

  await browser.close();
  console.log('engine_model_browser: all passed');
})().catch((e) => { console.error(e.stack); process.exit(1); });
