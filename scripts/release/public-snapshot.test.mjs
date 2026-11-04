import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publicPath, privatePath, auditBytes, checkPayload, stripDependencyNotes } from './public-snapshot.mjs';
test('publication rejects private notes in any allowed directory and unknown projects', () => {
  for (const name of ['special.md', 'speical.md', 'docs/mem.md', 'projects/claude_hub/frontend/CLAUDE.md',
    'projects/claude_hub/backend/src/config/templates/foo.AGENTS.md', 'projects/claude_hub/backend/src/.env',
    'projects/claude_hub/frontend/debug.log', 'projects/release_portal/server.mjs', 'projects/demo_studio/package.json',
    'projects/claude_hub/backend/src/unreviewed.sh']) assert.equal(publicPath(name), false, name);
  for (const name of ['README.md', 'projects/claude_hub/backend/src/index.ts',
    'projects/claude_hub/backend/src/config/templates/daily-office.assistant.txt', 'scripts/start-windows.bat']) assert.equal(publicPath(name), true, name);
});
test('secret matches are rejected without printing the matched secret', () => {
  const secret = 'gh' + 'p_' + 'x'.repeat(36);
  assert.throws(() => auditBytes('example.ts', Buffer.from(secret)), error => !error.message.includes(secret));
  assert.doesNotThrow(() => auditBytes('example.ts', Buffer.from('process.env.API_KEY')));
});
test('payload cleanup removes dependency notes and tests, retaining runtime and licenses', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-public-'));
  try {
    const pkg = path.join(dir, 'node_modules', 'sample-package'); fs.mkdirSync(pkg, {recursive:true});
    fs.writeFileSync(path.join(pkg,'index.js'),'module.exports = {};');
    fs.writeFileSync(path.join(pkg,'LICENSE.md'),'license terms');
    fs.writeFileSync(path.join(pkg,'CLAUDE.md'),'private notes');
    fs.writeFileSync(path.join(pkg,'HISTORY.md'),'old notes');
    fs.mkdirSync(path.join(pkg,'man'));fs.writeFileSync(path.join(pkg,'man','config.7'),'-----BEGIN '+'PRIVATE KEY-----');
    fs.mkdirSync(path.join(pkg,'test'));fs.writeFileSync(path.join(pkg,'test','fixture.js'),'fixture');
    assert.throws(() => checkPayload(dir), /private payload path/);
    stripDependencyNotes(path.join(dir,'node_modules'));
    assert.equal(checkPayload(dir),2);
    assert.ok(fs.existsSync(path.join(pkg,'index.js')));assert.ok(fs.existsSync(path.join(pkg,'LICENSE.md')));
    fs.writeFileSync(path.join(dir,'special.md'),'local');
    assert.throws(() => checkPayload(dir), /private payload path/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('PEM format labels in runtime code are allowed, encoded private keys are blocked', () => {
  const label = '-----BEGIN ' + 'PRIVATE KEY-----';
  assert.doesNotThrow(() => auditBytes('runtime.js', Buffer.from(label)));
  for (const newline of ['\n', '\\n']) assert.throws(() => auditBytes('secret.txt', Buffer.from(label + newline + 'A'.repeat(64))), /private key/);
});
