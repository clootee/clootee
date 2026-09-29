'use strict';
// Refresh reviewed public endpoint metadata only. Never send credentials to models.dev.
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const response = await fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`models.dev: HTTP ${response.status}`);
  const data = await response.json();
  const providers = {};
  for (const [id, p] of Object.entries(data).sort(([a], [b]) => a.localeCompare(b))) {
    if (!['@ai-sdk/openai-compatible', '@ai-sdk/openai', '@openrouter/ai-sdk-provider'].includes(p.npm)) continue;
    if (typeof p.api !== 'string' || !p.api.startsWith('https://') || /[${}]/.test(p.api)) continue;
    if (!Array.isArray(p.env) || p.env.length !== 1) continue;
    const url = new URL(p.api);
    if (url.username || url.password || url.search || url.hash) continue;
    providers[id] = { label: p.name, chatBase: p.api.replace(/\/+$/, ''), docsUrl: p.doc || '' };
  }
  if (Object.keys(providers).length < 30) throw new Error('Unexpectedly small catalog; retaining previous snapshot');
  fs.writeFileSync(path.join(__dirname, '../src/config/provider-catalog.json'), JSON.stringify({
    source: 'https://github.com/anomalyco/models.dev',
    fetchedAt: new Date().toISOString(), providers,
  }, null, 2) + '\n');
  process.stdout.write(`Imported ${Object.keys(providers).length} providers. Review endpoint changes before committing.\n`);
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
