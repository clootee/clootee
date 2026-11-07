'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const http = require('node:http');
const vm = require('node:vm');
const { buildWeb, sha256 } = require('../build-web.cjs');
const root = path.resolve(__dirname, '../..');
const backend = path.join(root, 'projects/claude_hub/backend');
const express = require(path.join(backend, 'node_modules/express'));
const { Paths } = require(path.join(backend, 'dist/paths'));
const { FrontendAssets } = require(path.join(backend, 'dist/helper/FrontendAssets'));

test('LAN HTTP integrity fallback agrees with SHA-256 across padding and block boundaries', () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 127, 128, 1024, 1000000]) {
    const bytes = crypto.randomBytes(length);
    assert.equal(sha256(bytes), crypto.createHash('sha256').update(bytes).digest('hex'));
  }
});

test('built frontend serves compressed immutable bundles and keeps source/API fallback', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-web-test-'));
  const original = Paths.FRONTEND_DIR;
  let server;
  try {
    const out = path.join(temp, 'dist');
    const stats = buildWeb(root, out);
    assert.equal(stats.initialFiles, 2);
    assert.ok(stats.initialGzipBytes < 350000);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
    for (const [name, meta] of Object.entries(manifest.files)) {
      const bytes = fs.readFileSync(path.join(out, 'static', name));
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), meta.sha256);
      assert.deepEqual(zlib.gunzipSync(fs.readFileSync(path.join(out, 'static', name + '.gz'))), bytes);
      if (meta.type === 'js') new vm.Script(bytes.toString());
    }
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(!html.includes('<script src="'));
    assert.ok(html.includes('ClooteeAssets'));
    assert.ok(!html.includes('cos.accelerate'));
    for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(code);
    fs.writeFileSync(path.join(temp, 'index.html'), 'source fallback');
    Paths.FRONTEND_DIR = temp;
    const app = express();
    FrontendAssets.mount(app);
    app.get('/api/private', (_req, res) => res.sendStatus(401));
    server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const page = await fetch(base, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('content-encoding'), 'gzip');
    assert.equal(page.headers.get('cache-control'), 'no-cache');
    assert.equal(await page.text(), html);
    const asset = manifest.groups.core.find(x => x.type === 'js').file;
    const response = await fetch(base + '/static/' + asset);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.match(response.headers.get('cache-control'), /immutable/);
    assert.equal(sha256(new Uint8Array(await response.arrayBuffer())), manifest.files[asset].sha256);
    const plain = await fetch(base + '/index.html', { headers: { 'Accept-Encoding': 'gzip;q=0, identity' } });
    assert.equal(plain.headers.get('content-encoding'), null);
    assert.equal(await plain.text(), html);
    const head = await fetch(base + '/static/' + asset, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal((await fetch(base + '/api/private')).status, 401);
    assert.equal((await fetch(base + '/static/missing.js')).status, 404);
    fs.renameSync(path.join(out, 'index.html'), path.join(out, 'index.saved'));
    assert.equal(await (await fetch(base)).text(), 'source fallback');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    Paths.FRONTEND_DIR = original;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
