// Public source and desktop payloads share this fail-closed publication boundary.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'scripts/release/public-files.json')));
const privateName = /(?:^|\.)(?:special|speical|claude|agents|mem|struct|memory)\.md$/i;
const privateParts = new Set(['.git', '.claude', '.codex', '.secrets', '.state', 'data', 'logs', 'traces', 'deploy', 'test', 'e2e', 'test-results', 'playwright-report', 'knowledge_ai']);
export function privatePath(name) {
  const parts = name.replaceAll('\\', '/').split('/');
  return parts.some(p => privateParts.has(p.toLowerCase()) || p.startsWith('.env') || privateName.test(p)
    || /\.(?:bak(?:-.*)?|log|tmp|pem|key|pfx|gpg|sqlite|db)$/i.test(p));
}
export function publicPath(name) {
  if (privatePath(name)) return false;
  if (policy.files.includes(name)) return true;
  return Object.entries(policy.trees).some(([prefix, extensions]) => name.startsWith(prefix) && extensions.includes(path.posix.extname(name)));
}
// Never print a matched value: logs identify only the offending filename/category.
export function auditBytes(name, bytes) {
  const text = bytes.toString('utf8');
  const checks = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----(?:\r?\n|\\n)\s*[A-Za-z0-9+/=]{32,}/],
    ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ['cloud credential', /\b(?:AKID[A-Za-z0-9]{28,}|AKIA[A-Z0-9]{16})\b/],
    ['model credential', /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{32,}\b/],
    ['private deployment location', /(?:\/home\/claudeuser\/|\/www\/wwwroot\/|D:\/projects\/devokai\/)/i],
  ];
  for (const [category, pattern] of checks) if (pattern.test(text)) throw Error(`Publication blocked: ${category} in ${name}`);
}
export function gitFiles(ref = 'HEAD') {
  return execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', ref], { cwd: root }).toString().split('\0').filter(Boolean);
}
export function check(ref = 'HEAD') {
  const files = gitFiles(ref);
  for (const name of files) {
    if (!publicPath(name)) throw Error(`Publication blocked: non-public file ${name}`);
    auditBytes(name, execFileSync('git', ['show', `${ref}:${name}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 }));
  }
  return files;
}
export function checkIndex() {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  for (const name of files) {
    if (!publicPath(name)) throw Error(`Publication blocked: non-public staged file ${name}`);
    auditBytes(name, execFileSync('git', ['show', `:${name}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 }));
  }
  return files.length;
}
export function checkHistory(ref) {
  const entries = execFileSync('git', ['rev-list', '--objects', ref], { cwd: root, maxBuffer: 32 * 1024 * 1024 }).toString().split('\n');
  for (const entry of entries) {
    const name = entry.slice(entry.indexOf(' ') + 1);
    if (!entry.includes(' ')) continue;
    if (privatePath(name) || (path.posix.extname(name) && !publicPath(name))) throw Error(`Publication blocked: non-public historical path ${name}`);
  }
}
export function archive(target, desktop = false) {
  const files = check();
  const selected = desktop ? files.filter(name => !name.startsWith('.github/') && !name.startsWith('scripts/release/')) : files;
  execFileSync('git', ['archive', '--format=tar', '-o', target, 'HEAD', '--', ...selected], { cwd: root });
  return selected.length;
}
export function checkPayload(dir) {
  let count = 0;
  function visit(base, relative = '') {
    for (const item of fs.readdirSync(base, { withFileTypes: true })) {
      const name = relative ? relative + '/' + item.name : item.name;
      // Dependency test folders and private instruction files are stripped before this check.
      if (privatePath(name)) throw Error(`Publication blocked: private payload path ${name}`);
      const full = path.join(base, item.name);
      if (item.isSymbolicLink()) {
        const resolved = fs.realpathSync(full);
        if (!resolved.startsWith(path.resolve(dir) + path.sep)) throw Error(`Publication blocked: escaping payload symlink ${name}`);
        auditBytes(name, fs.readFileSync(full)); count++; continue;
      }
      if (item.isDirectory()) visit(full, name);
      else { auditBytes(name, fs.readFileSync(full)); count++; }
    }
  }
  visit(dir);
  return count;
}
export function stripDependencyNotes(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, item.name);
    // Keep all license/notice files, including Markdown licenses.
    const license = /^(?:licen[cs]e|copying|notice|copyright)(?:[.-]|$)/i.test(item.name);
    if (!license && (privatePath(item.name) || /^(?:tests?|__tests__|examples?|docs?|man|\.github|\.vscode)$/i.test(item.name)
      || /\.(?:md|markdown|map)$/i.test(item.name))) fs.rmSync(target, { recursive: true, force: true });
    else if (item.isDirectory()) stripDependencyNotes(target);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, target] = process.argv.slice(2);
  if (command === 'archive' && target) console.log(`Public snapshot: ${archive(path.resolve(target), process.argv.includes('--desktop'))} files`);
  else if (command === 'payload' && target) console.log(`Public payload: ${checkPayload(path.resolve(target))} files verified`);
  else if (command === 'index') console.log(`Public staged tree: ${checkIndex()} files verified`);
  else if (command === 'history') { checkHistory(target || 'HEAD'); console.log('Public history verified'); }
  else if (command === 'check') console.log(`Public repository: ${check(target || 'HEAD').length} files verified`);
  else throw Error('Usage: public-snapshot.mjs check [ref] | archive <tar> [--desktop] | payload <directory>');
}
