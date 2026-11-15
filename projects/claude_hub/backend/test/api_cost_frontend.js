// 费用前端回归：只加载 ApiBill 对象，不启动浏览器或完整 app.js。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../frontend/app.js'), 'utf8');
const start = source.indexOf('const ApiBill = {');
const end = source.indexOf('// ── Clootee 默认服务商', start);
assert.ok(start >= 0 && end > start, 'ApiBill source block must exist');
const context = {
  T: (key) => key,
  fmtNum: String,
  escapeHtml: String,
  document: { createElement: () => ({ className: '', innerHTML: '', addEventListener() {} }) },
};
vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.ApiBill = ApiBill;`, context);
const bill = context.ApiBill;

assert.equal(bill.money({ usd: 0, cny: 0.7422884 }), '¥0.742288');
assert.equal(bill.money({ usd: 1, cny: 2 }), '$1.0000 + ¥2.0000');
assert.equal(bill.tagHtml({ usd: 0, cny: 0.7422884, sub: 0 }), '¥0.742288');

const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, webSearch: 0 };
const line = {
  model: 'kimi-k3-1-pro-261024', currency: 'CNY', priced: true, extra: false,
  requests: 1, reportedRequests: 0, inputTokens: 49098, outputTokens: 1050,
  cacheReadTokens: 25088, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, webSearches: 0,
  usd: { ...zero }, cny: { ...zero, input: 0.638274, output: 0.0714, cacheRead: 0.0326144 },
  totalUsd: 0, totalCny: 0.7422884,
};
const turn = {
  taskId: 'kimi-task', provider: 'custom', billing: 'apikey', startedAt: 1,
  consumedMessages: 1, lines: [line], totalUsd: 0, totalCny: 0.7422884, cliUsd: null,
};
const box = bill.detail(turn, { turns: [turn] });
assert.ok(box.innerHTML.includes('apiCny'));
assert.ok(box.innerHTML.includes('¥0.742288'));
assert.ok(box.innerHTML.includes('apiArkNote'));
assert.ok(!box.innerHTML.includes('$0.284284'));

const stats = bill.selectionStats({
  kimi: {
    usd: 0, cny: 0.7422884, sub: 0, consumedMessages: 1,
    breakdown: { ...zero }, breakdownCny: line.cny,
    tokens: { input: 49098, output: 1050, cacheRead: 25088, cacheWrite: 0 },
  },
});
assert.equal(stats.usd, 0);
assert.equal(stats.cny, 0.7422884);
assert.equal(stats.costsCny.input, 0.638274);
assert.equal(stats.tokens.input, 49098);
const html = bill.selectionHtml(stats);
assert.ok(html.includes('(CNY)'));
assert.ok(!html.includes('(USD)'));
console.log('api_cost_frontend: 14 assertions passed (CNY display, mixed currencies, Ark note, batch totals)');

// Loading one tab must not replace the parent group's aggregate with that tab's cost.
(async () => {
  const requests=[];
  context.State={sessions:[{id:'parent',multiParent:true,multiSessionIds:['parent','child']}],session:{id:'parent'},selectedSessions:new Set()};
  context.renderElapsedNotes=()=>{};
  context.api=async (url, body)=>{
    requests.push({url,body});
    return url.startsWith('/api/session/api-cost') ? {turns:[{}],totalUsd:2,totalCny:0,subscriptionUsd:2}
      : {parent:{usd:7,cny:0,sub:7}};
  };
  bill.paintListTag=()=>{};bill.paintSelection=()=>{};
  bill.load('parent');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bill.totals.parent.usd,7);
  bill.onTaskEnd('child');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bill.totals.parent.usd,7);
  assert.ok(requests.some(r=>r.url==='/api/sessions/api-cost' && r.body.ids.includes('parent')));
  assert.ok(bill.tagHtml({usd:0,cny:0,unpriced:1}).includes('apiUnpriced'));

  bill.listTag({id:'parent',multiParent:true,multiSessionIds:['parent','child']});
  context.State.sessions=[];context.State.session=null;
  bill.onTaskEnd('child');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bill.totals.parent.usd,7,'background child completion must refresh its remembered parent');
  const sid='root:native', draft='root:draft-original';
  context.State={sessionId:sid,session:{id:sid,rootId:'root',claudeSessionId:'native',multiGroup:'group',multiSessionIds:[sid,draft]},sessions:[{id:draft,multiParent:true,multiSessionIds:[sid,draft]}]};
  const waiting=[];
  context.api=(url,body)=>url.startsWith('/api/session/api-cost') ? new Promise(resolve=>waiting.push(resolve)) : Promise.resolve({[draft]:{usd:1.9927152,cny:0,sub:1.9927152}});
  const response=(usd,available=true)=>({turns:[{taskId:'turn',startedAt:1,billing:'subscription',consumedMessages:available?1:0,totalUsd:usd,totalCny:0,lines:available?[{model:'gpt-6.1-sol'}]:[]}],totalUsd:usd,totalCny:0,subscriptionUsd:usd});
  bill.load(sid);
  bill.onTaskEnd(draft);
  assert.equal(waiting.length,2,'draft completion must refresh detail keyed by native alias');
  waiting[1](response(1.9927152));await new Promise(resolve=>setImmediate(resolve));
  waiting[0](response(0,false));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bill.bySession[sid].totalUsd,1.9927152,'late zero response must not overwrite completed costs');
  bill.bySession[sid]=response(0,false);
  bill.syncMemberCosts([{id:draft,cost:{usd:1.9927152,cny:0,consumedMessages:1}}]);
  assert.equal(waiting.length,3,'fresh tab cost must repair stale per-turn detail');
  waiting[2](response(1.9927152));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bill.bySession[sid].turns[0].totalUsd,1.9927152);
  bill.invalidate(sid);delete bill.observedCosts[sid];
  bill.load(sid);
  bill.syncMemberCosts([{id:draft,cost:{usd:1.9927152,cny:0,consumedMessages:1,missingUsageTurns:1}}]);
  assert.equal(waiting.length,5,'new tab totals must invalidate an older in-flight detail request');
  waiting[4](response(1.9927152));await new Promise(resolve=>setImmediate(resolve));
  waiting[3](response(0,false));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bill.bySession[sid].totalUsd,1.9927152);
  const totals=[];context.api=()=>new Promise(resolve=>totals.push(resolve));
  const old=bill.requestTotals([draft]),fresh=bill.requestTotals([draft]);
  totals[1]({[draft]:{usd:7}});await fresh;totals[0]({[draft]:{usd:0}});await old;
  assert.equal(bill.totals[draft].usd,7,'late list response must not overwrite new aggregate');
  const missing={taskId:'missing',startedAt:1,totalUsd:0,totalCny:0,consumedMessages:0,usageStatus:'missing',lines:[]};
  const unknown=bill.detail(missing,{turns:[missing]});
  assert.ok(unknown.innerHTML.includes('apiUsageMissingNote'));
  assert.ok(unknown.innerHTML.includes('apiCostUnconfirmed'));
  assert.ok(bill.money({usd:1.9927152,missingUsageTurns:1}).includes('apiCostUnconfirmed'));
  console.log('api_cost_frontend: request races, native/draft aliases, tab/detail consistency and missing-usage display passed');
  console.log('api_cost_frontend: parent aggregate cache and child completion refresh passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
