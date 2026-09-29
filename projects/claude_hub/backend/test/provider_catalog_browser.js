'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { EngineConfigStruct } = require('../dist/logic_struct/EngineConfigStruct');

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const frontend = path.resolve(__dirname, '../../frontend');
    await page.route('http://catalog.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('http://catalog.test/');
    const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    await page.setContent(html);
    for (const file of ['trans.js', 'health.js', 'onboard.js', 'app.js']) {
      let source = fs.readFileSync(path.join(frontend, file), 'utf8');
      if (file === 'app.js') source = source.replace(/main\(\);\s*$/, '');
      await page.addScriptTag({ content: source });
    }
    const result = await page.evaluate(async (providers) => {
      const writes = [];
      api = async (url, body) => {
        if (body) { writes.push({ url, body }); return {}; }
        if (url === '/api/engine/providers') return { providers };
        if (url === '/api/engine/config') return { codex: { provider: 'openrouter', apiKey: 'sk-or-test', model: 'test-model' } };
        if (url.startsWith('/api/engine/models')) throw new Error('HTTP 404');
        return {};
      };
      await loadEngineProvider('codex');
      await loadProviderCatalog('claude');
      const codexIds = [...providerUi('codex').select.options].map((o) => o.value);
      const claudeIds = [...providerUi('claude').select.options].map((o) => o.value);
      const u = providerUi('codex');
      u.modelInput.value = 'manual-model';
      await onModelSelect('codex');
      const draftWrites = writes.length;
      await fetchEngineModels('codex');
      const keptModel = modelValue('codex');
      Onboard.engine = 'codex'; Onboard.provider = 'openrouter'; Onboard.model = 'manual-model';
      Onboard.providers = providers;
      hideOnboard = () => {};
      applyText = () => {};
      loadSettings = async () => {};
      await onboardFinish('sk-or-test');
      return { codexIds, claudeIds, draftWrites, keptModel, writes, keyVisible: !u.cfg.hidden, modelVisible: !u.modelInput.hidden };
    }, EngineConfigStruct.providerList());
    assert.ok(result.codexIds.length > 100);
    assert.ok(result.codexIds.includes('openrouter'));
    assert.ok(result.claudeIds.includes('alibaba-token-plan-cn'));
    assert.ok(!result.claudeIds.includes('siliconflow-cn'));
    assert.equal(result.draftWrites, 0);
    assert.equal(result.keptModel, 'manual-model');
    assert.ok(result.keyVisible && result.modelVisible);
    assert.deepEqual(result.writes[0], { url: '/api/engine/config', body: {
      engine: 'codex', provider: 'openrouter', apiKey: 'sk-or-test', model: 'manual-model',
    } });
    assert.equal(result.writes[1].url, '/api/settings');
    process.stdout.write(`Browser checks passed: ${result.codexIds.length} Codex options, ${result.claudeIds.length} Claude options; draft isolation, manual model, onboarding persistence.\n`);
  } finally {
    await browser.close();
  }
}
main().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exitCode = 1; });
