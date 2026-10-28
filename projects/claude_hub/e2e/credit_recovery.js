// Browser contract tests for persisted errors and their recovery links.
const {chromium}=require(process.env.PLAYWRIGHT || '@playwright/test');
const fs=require('node:fs');const assert=require('node:assert/strict');
const source=fs.readFileSync('projects/claude_hub/frontend/app.js','utf8');
const fn=name=>{const a=source.indexOf('function '+name+'(');const b=source.indexOf('\nfunction ',a+1);return source.slice(a,b<0?undefined:b);};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();page.on('pageerror',e=>console.error('Browser error:',e.message));await page.route('http://clootee.test/**',r=>r.fulfill({body:'<div id="messages"></div><button id="clooteeBal"></button>'}));await page.goto('http://clootee.test/');
  await page.addScriptTag({path:'projects/claude_hub/frontend/trans.js'});
  await page.addScriptTag({content:`
   const $=id=>document.getElementById(id);
   const err='API Error: 402 Insufficient available balance to reserve this request. Add credits or lower the output token limit.';
   const State={session:{engine:'claude',messages:[]},settings:{defaultEngine:'claude'}};
   let settingsOpened=false;const openSettings=()=>{settingsOpened=true;};
   const escapeHtml=s=>String(s).replaceAll('<','&lt;');const assistantLabel=()=> 'AI';
   const parseCharts=text=>({text,charts:[]});const renderMarkdown=(node,text)=>node.textContent=text;
   const attachTraceBtn=()=>{},attachFilesToMessage=()=>{},dismissNotice=()=>{},toggleAssistantGroup=()=>{};
   const api=async()=>({registered:true,active:true,engines:['claude'],consoleUrl:'https://console.clootee.com',balanceMicro:0});
  `});
  const a=source.indexOf('const Clootee = {');const b=source.indexOf('// ── 渲染：执行失败',a);
  await page.addScriptTag({content:[source.slice(a,b),fn('addMessageEl'),fn('addAssistantGroupEl'),fn('assistantGroupPreview'),fn('noticeEl')].join('\n')});
  await page.evaluate(()=>{setLang('zh');Clootee.st={registered:true,active:true,engines:['claude'],consoleUrl:'https://console.clootee.com'};addMessageEl({id:'err1',role:'assistant',text:err});});
  assert.equal(await page.locator('.credit-actions a').innerText(),'去充值');
  assert.equal(await page.locator('.credit-actions a').getAttribute('href'),'https://console.clootee.com/billing?lang=zh');
  assert.equal(await page.locator('.credit-actions a').getAttribute('target'),'_blank');
  await page.evaluate(()=>Clootee.attachCreditActions($('messages').firstChild,err));assert.equal(await page.locator('.credit-actions').count(),1);
  await page.evaluate(()=>{setLang('en');addAssistantGroupEl({key:'g',messages:[{id:'err2',role:'assistant',text:err}]});});
  assert.equal(await page.locator('.ai-collapsed-msg .credit-actions a').innerText(),'Top up');
  await page.locator('.ai-collapsed-msg .credit-actions button').click();assert.equal(await page.evaluate(()=>settingsOpened),true);
  await page.evaluate(()=>{$('messages').appendChild(noticeEl({key:'e',level:'error',title:'Error',message:err}));});assert.equal(await page.locator('.msg-notice .credit-actions a').count(),1);
  assert.equal(await page.evaluate(()=>Clootee.isOutOfCredit('API Error: 401 invalid key')),false);
  assert.equal(await page.evaluate(()=>Clootee.isOutOfCredit('HTTP 500 upstream failure')),false);
  await page.evaluate(()=>{State.session.engine='codex';addMessageEl({id:'other',role:'assistant',text:err});});assert.equal(await page.locator('[data-mid="other"] .credit-actions').count(),0);
  await page.evaluate(()=>{State.session.engine='claude';Clootee.st=null;State.session.messages=[{id:'late',role:'assistant',text:err}];addMessageEl(State.session.messages[0]);});
  assert.equal(await page.locator('[data-mid="late"] .credit-actions').count(),0);
  await page.evaluate(()=>Clootee.refresh());assert.equal(await page.locator('[data-mid="late"] .credit-actions a').count(),1);
  await page.evaluate(()=>Clootee.showOutOfCredit());assert.equal(await page.locator('#clooteeOut').count(),1);
  console.log('PASS: reservation 402, persisted errors, collapsed groups, task notices, billing href, bilingual actions, deduplication, own provider, no cross-provider link, late status refresh and modal.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
