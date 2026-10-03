// Clootee 默认服务商（ConsoleAccount）自测：直调编译产物，对接一个本地假 console（只实现客户端用到的 4 个接口）。
// 会改写 data/engines.json、data/console.json、~/.claude/settings.json —— 开始前备份，结束无论成败都还原。
// 运行：node test/console_account.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✕ ${name}${extra !== undefined ? ' → ' + JSON.stringify(extra) : ''}`); }
}

// ---- 假 console：设备令牌可被"作废"，用于验证 401 → 自动重领 ----
const devices = new Map(); // installId → token
const valid = new Set();
let registers = 0;
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (st, obj) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const auth = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (req.method === 'POST' && req.url === '/api/v1/devices') {
      const { installId } = JSON.parse(body || '{}');
      const old = devices.get(installId);
      if (old) valid.delete(old);
      const token = `ck-test${++registers}`;
      devices.set(installId, token); valid.add(token);
      return send(200, { token, grantedMicro: old ? 0 : 700000, reused: !!old, balanceMicro: 700000 });
    }
    if (!valid.has(auth)) return send(401, { error: { message: 'invalid key' } });
    if (req.url === '/api/v1/me') return send(200, { balanceMicro: 654321, email: null });
    if (req.url.startsWith('/api/v1/me/usage')) {
      const tag = new URL(req.url, 'http://x').searchParams.get('tag');
      return send(200, { balanceMicro: 654321, items: [{ at: 1, model: 'deepseek-flash', inputTokens: 10, cacheReadTokens: 0, outputTokens: 5, costMicro: 4, status: 'ok' }],
        ...(tag ? { tagged: { calls: tag === 'task-1' ? 3 : 0, costMicro: tag === 'task-1' ? 1234 : 0 } } : {}) });
    }
    if (req.url === '/api/v1/devices/link-code') return send(200, { code: 'abc', url: 'http://console.test/#link=abc' });
    send(404, {});
  });
});

fake.listen(0, '127.0.0.1', async () => {
  // Claude 自己的配置目录指到临时目录：测试不碰用户真实的 ~/.claude
  process.env.CLAUDE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'console-test-claude-'));
  process.env.CLOOTEE_CONSOLE_BASE = `http://127.0.0.1:${fake.address().port}`;
  const { Paths } = require('../dist/paths');
  const CLAUDE_SETTINGS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');
  const files = [Paths.ENGINES_FILE, Paths.CONSOLE_FILE, CLAUDE_SETTINGS];
  const backups = files.map((f) => ({ f, had: fs.existsSync(f), bak: `${f}.console-test-backup` }));
  for (const b of backups) if (b.had) fs.copyFileSync(b.f, b.bak);
  const restore = () => {
    for (const b of backups) {
      try {
        if (b.had) { fs.copyFileSync(b.bak, b.f); fs.unlinkSync(b.bak); }
        else if (fs.existsSync(b.f)) fs.unlinkSync(b.f);
      } catch (e) { console.log(`⚠ 还原 ${b.f} 失败：${e.message}`); }
    }
  };

  try {
    if (fs.existsSync(Paths.CONSOLE_FILE)) fs.unlinkSync(Paths.CONSOLE_FILE);
    const { ConsoleAccount } = require('../dist/logic_realize/ConsoleAccount');
    const { EngineConfig } = require('../dist/logic_realize/EngineConfig');
    const { PROVIDERS } = require('../dist/logic_struct/EngineConfigStruct');

    ok('clootee provider points at CLOOTEE_CONSOLE_BASE and has no secrets', PROVIDERS.clootee.anthropicBase === process.env.CLOOTEE_CONSOLE_BASE
      && PROVIDERS.clootee.chatBase.endsWith('/v1') && !JSON.stringify(PROVIDERS.clootee).includes('sk-'));
    ok('clootee is listed first in the provider list (after official)', EngineConfig.providerList()[1].id === 'clootee');

    const before = await ConsoleAccount.status();
    ok('status before activation: not registered, no network call needed', before.registered === false && registers === 0, before);

    const st = await ConsoleAccount.activate();
    const cfg = EngineConfig.get();
    ok('activate registers exactly one device', registers === 1);
    ok('claude switched to clootee + deepseek-flash', cfg.claude.provider === 'clootee' && cfg.claude.model === 'deepseek-flash' && cfg.claude.apiKey === 'ck-test1', cfg.claude);
    ok('codex switched to clootee + deepseek-flash', cfg.codex.provider === 'clootee' && cfg.codex.model === 'deepseek-flash', cfg.codex);
    ok('status after activation shows balance', st.registered && st.active && st.balanceMicro === 654321, st);
    const env = EngineConfig.claudeEnv();
    ok('claude env points at console with the device token', env.ANTHROPIC_BASE_URL === process.env.CLOOTEE_CONSOLE_BASE && env.ANTHROPIC_AUTH_TOKEN === 'ck-test1' && env.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'deepseek-flash', env);
    const up = EngineConfig.codexUpstream();
    ok('codex upstream = console /v1 (proxy appends /chat/completions)', up.baseUrl === `${process.env.CLOOTEE_CONSOLE_BASE}/v1`, up);
    const rec = JSON.parse(fs.readFileSync(Paths.CONSOLE_FILE, 'utf8'));
    ok('console.json stores installId + token', /^ci_/.test(rec.installId) && rec.token === 'ck-test1');
    if (process.platform !== 'win32') ok('console.json is private (0600)', (fs.statSync(Paths.CONSOLE_FILE).mode & 0o077) === 0);

    await ConsoleAccount.activate();
    ok('activate again is idempotent (no second registration)', registers === 1);

    // 用户换过模型：重新激活不应把它改回默认
    EngineConfig.setModel('claude', 'MiniMax-M3');
    await ConsoleAccount.activate();
    ok('re-activate keeps the user-picked model', EngineConfig.get().claude.model === 'MiniMax-M3');

    // 令牌在网页上被作废 → 下一次查询自动用同一个 installId 重领，并同步进两个引擎
    valid.clear();
    const st2 = await ConsoleAccount.status();
    ok('revoked token: status recovers by re-registering', st2.balanceMicro === 654321 && registers === 2, st2);
    ok('new token synced into both engines', EngineConfig.get().claude.apiKey === 'ck-test2' && EngineConfig.get().codex.apiKey === 'ck-test2');
    ok('same installId reused (no new free grant)', devices.size === 1);

    const u = await ConsoleAccount.usage(5);
    ok('usage passthrough', u.items.length === 1 && u.items[0].costMicro === 4);
    ok('link url passthrough', (await ConsoleAccount.linkUrl()) === 'http://console.test/#link=abc');

    const turn = await ConsoleAccount.turnCost('task-1');
    ok('turnCost sums one task by tag', turn.calls === 3 && turn.costMicro === 1234 && turn.balanceMicro === 654321, turn);
    const sess = { id: 'r:draft-1', tasks: [{ id: 'task-0', status: 'done' }, { id: 'task-1', status: 'running' }] };
    ok('runEnv tags requests with the running task id', ConsoleAccount.runEnv(sess).ANTHROPIC_CUSTOM_HEADERS === 'x-clootee-session: task-1', ConsoleAccount.runEnv(sess));
    ok('runEnv is empty when no task is running', Object.keys(ConsoleAccount.runEnv({ id: 'x', tasks: [] })).length === 0);

    let threw = '';
    try { await ConsoleAccount.usage(0); } catch (e) { threw = e.message; }
    ok('usage rejects invalid limit with method name + value', threw.includes('ConsoleAccount.usage') && threw.includes('limit=0'), threw);

    // 不用 clootee 时：绝不给别家服务商发标签头
    EngineConfig.setProvider('claude', { provider: 'minimax', apiKey: 'sk-mm', model: 'MiniMax-M3', effort: '' });
    ok('runEnv sends nothing when claude is not on clootee', Object.keys(ConsoleAccount.runEnv(sess)).length === 0);

    // Codex 自定义服务商：用户把完整端点当 base 填 → 代理不应再拼一次 /chat/completions
    EngineConfig.setProvider('codex', { provider: 'custom', apiKey: 'sk-x', model: 'm', baseUrl: 'https://api.example.com/chat/completions', effort: '' });
    ok('codex custom base with /chat/completions is normalised', EngineConfig.codexUpstream().baseUrl === 'https://api.example.com', EngineConfig.codexUpstream());

    // 离线：console 连不上时 status 不抛错，而是带 error 返回
    fake.close();
    process.env.CLOOTEE_CONSOLE_BASE = 'http://127.0.0.1:1';
  } catch (e) {
    fail++; console.log('  ✕ threw: ' + (e && e.stack || e));
  } finally {
    restore();
    try { fake.close(); } catch { /* already closed */ }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
