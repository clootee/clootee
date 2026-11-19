// SubscriptionUsage: missing credentials must give an explicit reason (not a silent blank), and work on any OS.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'subuse-'));
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'claude');
process.env.CODEX_HOME = path.join(tmp, 'codex');
const { SubscriptionUsage: S } = require('../dist/helper/SubscriptionUsage');
(async () => {
  const empty = await S.read('Claude');
  assert.strictEqual(empty.status, 'unavailable'); assert.strictEqual(empty.reason, 'no-credentials');
  fs.mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, '.credentials.json'), JSON.stringify({ claudeAiOauth: {} }));
  assert.strictEqual((await S.read('Claude')).reason, 'no-token');
  const codex = await S.read('ChatGPT');
  assert.strictEqual(codex.status, 'unavailable'); assert(codex.reason, 'reason present');
  console.log('subscription_usage:', process.platform, 'passed');
})().catch((e) => { console.error(e.stack); process.exit(1); });
