// 回归测试：会话列表的元信息（标题 / 最近一条提问 / 首条时间）由「只读文件头尾」近似得出，
// 必须与「全文逐行扫描」的参考实现一致。头尾窗口的边界处理（对齐行首、按字节找换行）
// 一旦出错，最近一条提问会静默退回最早那条，预览严重失真——这个测试就是拿来兜住它的。
//
// 用法：node test/session_meta_parity.js
// 依赖本机的真实会话文件；没有会话时跳过（退出 0）。
const fs = require('fs');
const { SessionManager } = require('../dist/logic_realize/SessionManager');
const { ClaudeStoreHelper } = require('../dist/helper/ClaudeStoreHelper');
const { CodexStoreHelper } = require('../dist/helper/CodexStoreHelper');

const isToolEcho = (c) => Array.isArray(c) && c.some((x) => x && x.type === 'tool_result');
const plainText = (c) => {
  if (typeof c === 'string') return c.trim();
  if (!Array.isArray(c)) return '';
  return c.filter((x) => x && x.type === 'text' && x.text).map((x) => String(x.text)).join('\n').trim();
};
const injected = (t) =>
  /^\s*<(environment_context|permissions|user_instructions|recommended_plugins)\b/i.test(t) ||
  /^\s*#\s*AGENTS\.md instructions for\b[\s\S]*<INSTRUCTIONS>/i.test(t) ||
  /^\s*<INSTRUCTIONS\b[\s\S]*<\/INSTRUCTIONS>\s*$/i.test(t);
const cxPlain = (content, drop) => {
  if (typeof content === 'string') return drop && injected(content) ? '' : content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((c) => c && typeof c === 'object' && String(c.type || '').endsWith('text') && c.text)
    .map((c) => String(c.text))
    .filter((t) => !(drop && injected(t)))
    .join('\n')
    .trim();
};

// 参考实现：全文逐行扫描（旧行为，慢但直接）
function refClaude(file) {
  let title = '', lastUser = '', count = 0, hasTyped = false, hasSdk = false, createdAt = 0;
  for (const ln of ClaudeStoreHelper.readLines(file)) {
    let o; try { o = JSON.parse(ln); } catch { continue; }
    if (!o) continue;
    if (['typed', 'queued', 'system'].includes(o.promptSource)) hasTyped = true;
    if (o.promptSource === 'sdk') hasSdk = true;
    if (o.type === 'user' || o.type === 'assistant') count++;
    if (!createdAt && o.timestamp) { const t = Date.parse(o.timestamp); if (!isNaN(t)) createdAt = t; }
    if (!title && o.type === 'summary' && o.summary) title = String(o.summary).slice(0, 60);
    if (o.type === 'user' && o.message && !isToolEcho(o.message.content)) {
      const t = plainText(o.message.content);
      if (t) { const c = t.replace(/\s+/g, ' '); if (!title) title = c.slice(0, 60); lastUser = c.slice(0, 120); }
    }
  }
  return { name: title || '(未命名会话)', lastUser, createdAt };
}
function refCodex(file) {
  let title = '', lastUser = '', count = 0;
  for (const ln of CodexStoreHelper.readLines(file)) {
    let o; try { o = JSON.parse(ln); } catch { continue; }
    if (!o || o.type !== 'response_item' || !o.payload || o.payload.type !== 'message') continue;
    const role = o.payload.role; if (role !== 'user' && role !== 'assistant') continue;
    const text = cxPlain(o.payload.content, role === 'user'); if (!text) continue;
    count++;
    if (role === 'user') { const c = text.replace(/\s+/g, ' '); if (!title) title = c.slice(0, 60); lastUser = c.slice(0, 120); }
  }
  return { name: title || '(未命名会话)', lastUser };
}

const all = SessionManager.listAllSessions();
let checked = 0;
const bad = [];
for (const s of all) {
  const file = SessionManager._sessionFile(s);
  if (!file || !fs.existsSync(file)) continue;
  checked++;
  const ref = s.engine === 'codex' ? refCodex(file) : refClaude(file);
  for (const k of Object.keys(ref)) {
    if ((s[k] || '') !== (ref[k] || '')) {
      bad.push(`${s.id} [${s.engine}] ${k}: got=${JSON.stringify(String(s[k]).slice(0, 40))} want=${JSON.stringify(String(ref[k]).slice(0, 40))}`);
    }
  }
}
if (checked === 0) { console.log('session meta parity: 本机没有会话，跳过'); process.exit(0); }
if (bad.length > 0) {
  console.error(`session meta parity FAILED: ${bad.length}/${checked} 会话与全文扫描不一致`);
  for (const b of bad.slice(0, 10)) console.error('  ' + b);
  process.exit(1);
}
console.log(`session meta parity passed（${checked} 个会话与全文扫描一致）`);
