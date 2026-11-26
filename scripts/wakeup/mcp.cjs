// Dependency-free MCP stdio adapter. Credentials stay inside the child process.
const readline = require('node:readline');
const text = { type: 'string', minLength: 1 };
const positive = { type: 'integer', minimum: 1 };
const sessionId = { type: ['string', 'null'], description: 'Project session ID. Null selects a fresh session at delivery. For the current session use CLOOTEE_SESSION_ID.' };
const schedule = { prompt: text, sessionId, at: { ...positive, description: 'Future Unix milliseconds' }, afterSeconds: positive };
const states = ['pending', 'sending', 'queued', 'cancelled', 'failed', 'revoked', 'unknown'];
const tools = [];
function define(name, description, properties, required = []) {
  tools.push({ name: 'wakeup_' + name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false } });
}
define('list', 'List wakeups across all sessions in this project. Pass nextCursor as cursor for the next page.',
  { status: { enum: states }, limit: { ...positive, maximum: 100 }, cursor: { type: 'integer', minimum: 0 } });
define('status', 'Read a project wakeup, including delivery state and queue task ID.', { id: text }, ['id']);
define('create', 'Schedule a one-time wakeup. Omit sessionId for a new session. Supply exactly one time and a unique idempotencyKey. Reuse that key when retrying.', { ...schedule, idempotencyKey: text }, ['prompt', 'idempotencyKey']);
define('update', 'Edit a pending wakeup. Omit unchanged fields. Pass sessionId=null for a new session. Supply at most one time.', { id: text, ...schedule }, ['id']);
define('cancel', 'Cancel a pending wakeup. Repeating cancellation is safe.', { id: text }, ['id']);

async function call(params) {
  const tool = tools.find(t => t.name === params?.name);
  if (!tool) throw new Error('Unknown tool');
  const args = params.arguments ?? {};
  const schema = tool.inputSchema;
  if (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !Object.hasOwn(schema.properties, k))
      || schema.required.some(k => typeof args[k] !== 'string' || !args[k])) throw new Error('Invalid tool arguments');
  const { idempotencyKey, ...fields } = args;
  const rootId = process.env.CLOOTEE_ROOT_ID;
  const token = process.env.CLOOTEE_EXTERNAL_TOKEN;
  if (!rootId || !token) throw new Error('Clootee project credentials unavailable');
  const operation = tool.name.slice('wakeup_'.length);
  const suffix = operation === 'create' ? '' : '/' + operation;
  const port = Number(process.env.CLOOTEE_WAKEUP_PORT || 19873);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid scheduler port');
  const response = await fetch(`http://127.0.0.1:${port}/v1/wakeups` + suffix, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({ ...fields, rootId, token }),
  });
  return { isError: !response.ok, content: [{ type: 'text', text: await response.text() }] };
}

async function handle(line) {
  let id = null;
  const send = result => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...result }) + '\n');
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ error: { code: -32700, message: 'Invalid JSON' } }); }
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return send({ error: { code: -32600, message: 'Invalid request' } });
  if (!Object.hasOwn(msg, 'id')) return;
  id = msg.id;
  switch (msg.method) {
    case 'initialize':
      return send({ result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'clootee-wakeup', version: '1.0.0' } } });
    case 'ping': return send({ result: {} });
    case 'tools/list': return send({ result: { tools } });
    case 'tools/call':
      try { return send({ result: await call(msg.params) }); }
      catch (e) { return send({ result: { isError: true, content: [{ type: 'text', text: e.message }] } }); }
    default: return send({ error: { code: -32601, message: 'Unknown method' } });
  }
}
readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', handle);
