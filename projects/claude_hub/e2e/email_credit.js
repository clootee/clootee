// Run from the repository root: node projects/claude_hub/e2e/email_credit.js
const {chromium}=require(process.env.PLAYWRIGHT || '@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
 const page=await browser.newPage();
 await page.route('http://clootee.test/**', r=>r.fulfill({body:'<div id="onboardOverlay"><div id="onboardSteps"></div><h1 id="onboardTitle"></h1><p id="onboardSub"></p><div id="onboardBody"></div><button id="onboardSkip"></button><button id="onboardBack"></button><button id="onboardNext"></button></div>'}));
 await page.goto('http://clootee.test/');
 await page.addScriptTag({path:'projects/claude_hub/frontend/trans.js'});
 await page.addScriptTag({content:`
 const $=id=>document.getElementById(id); let NEEDS_SETUP=false, TOKEN='', done=false, approved=false, fail=false;
 const calls=[]; const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const applyText=()=>{}, startApp=async()=>{done=true;};
 async function api(url,body){calls.push(url);if(fail)throw Error('HTTP 404: service endpoint missing');
 if(url==='/api/console/login')return {userCode:'12345678',url:'https://console.clootee.com/connect?user_code=12345678',expiresAt:Date.now()+600000,interval:100};
 if(url==='/api/console/activate')return approved?{email:'test@example.com',balanceMicro:700000}:{pending:true};
 if(url.startsWith('/api/engine/status'))return {claude:{ready:true}};
 return {};}
 `});
 await page.addScriptTag({path:'projects/claude_hub/frontend/onboard.js'});
 await page.evaluate(()=>{setLang('zh');renderOnboard();});
 assert.match(await page.locator('#onboardSub').innerText(),/邮箱登录.*\$0\.50/);
 assert.equal(await page.locator('#onboardSkip').innerText(),'使用自己的供应商');
 await page.evaluate(()=>runQuickStart());
 assert.equal(await page.locator('#onboardBody a').getAttribute('target'),'_blank');
 assert.match(await page.locator('#onboardBody').innerText(),/12345678/);
 assert.deepEqual(await page.evaluate(()=>calls),['/api/console/login']);
 await page.evaluate(()=>runQuickStart());
 assert.equal(await page.evaluate(()=>done),false);
 assert.equal(await page.evaluate(()=>Onboard.quick.stage),1);
 await page.evaluate(()=>{setLang('en');renderOnboard();});
 assert.match(await page.locator('#onboardBody').innerText(),/Sign in with your email/);
 await page.click('#onboardSkip');
 assert.equal(await page.evaluate(()=>Onboard.mode),'advanced');
 await page.evaluate(()=>{Onboard.mode='quick';approved=true;});
 await page.evaluate(()=>runQuickStart());
 assert.equal(await page.evaluate(()=>done),true);
 assert.equal(await page.evaluate(()=>calls.filter(x=>x==='/api/settings').length),1);
 await page.evaluate(()=>{Onboard.quick=null;Onboard.mode='quick';done=false;fail=true;});
 await page.evaluate(()=>runQuickStart());
 assert.match(await page.locator('#onboardBody').innerText(),/HTTP 404/);
 assert.doesNotMatch(await page.locator('#onboardBody').innerText(),/Check your network/);
 assert.equal(await page.locator('#onboardSkip').isEnabled(),true);
 console.log('PASS: bilingual email/$0.50 disclosure, explicit own-provider path, external sign-in link/code, pending gate, authorization resume, installation/settings completion, actionable errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
