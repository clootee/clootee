process.chdir(require('path').resolve(__dirname, '../../../..'));
const {chromium}=require('../../node_modules/playwright');
const fs=require('fs'),assert=require('assert');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.setContent('<body class="light"><div id="message"></div></body>');
 await page.addStyleTag({path:'projects/claude_hub/frontend/styles.css'});
 await page.addScriptTag({path:'projects/claude_hub/frontend/vendor/marked.min.js'});await page.addScriptTag({path:'projects/claude_hub/frontend/vendor/purify.min.js'});
 const s=fs.readFileSync('projects/claude_hub/frontend/app.js','utf8');
 await page.addScriptTag({content:`const State={rootId:'head',settings:{platform:'win32'},roots:[{id:'head',path:'D:/projects/head1'}]}; const TOKEN='test'; const words={messageLinkFolder:'打开所在文件夹',download:'下载',messageLinkCopyPath:'复制路径',messageLinkCopyText:'复制文字',close:'关闭'}; const T=k=>words[k]||k; let fail=false,calls=[]; const api=async(url,body)=>{calls.push({url,body}); if(fail)throw Error('test failure');}; const copyText=()=>{}; ${s.slice(s.indexOf('function markdownLocalPath('),s.indexOf('// ── AI 内联图表'))} ${s.slice(s.indexOf('function fmFileUrl('),s.indexOf('async function toggleFilesPanel('))}`});
 for(const width of [1280,390,320]) for(const theme of ['light','dark']) {
  await page.setViewportSize({width,height:800});await page.evaluate(theme=>{document.body.className=theme;renderMarkdown(document.querySelector('#message'),'[下载新版PPT](D:/projects/head1/reports/智能小头_双平台产品与商业化提案.pptx)')},theme);
  await page.locator('#message a').click();
  const rect=await page.locator('dialog').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width+1);
  assert(await page.locator('.ml-folder').isVisible());assert(await page.locator('.ml-download').isVisible());
  assert(await page.locator('.ml-folder').evaluate(e=>e.getBoundingClientRect().height>=44));
  await page.locator('.ml-folder').click();await page.waitForFunction(()=>calls.length>0);
  assert.equal(await page.evaluate(()=>calls.at(-1).body.rel),'reports/智能小头_双平台产品与商业化提案.pptx');
  await page.evaluate(()=>fail=true);await page.locator('.ml-folder').click();await page.waitForFunction(()=>document.querySelector('.ml-status').textContent.includes('test failure'));
  assert.equal(await page.locator('.ml-folder').isDisabled(),false);await page.evaluate(()=>fail=false);
  await page.screenshot({path:`tmp/link-dialog-${width}-${theme}.png`});
  await page.getByRole('button',{name:'关闭',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
 }
 await page.evaluate(()=>{State.settings.platform='linux';renderMarkdown(document.querySelector('#message'),'[file](reports/a.pdf)')});await page.locator('#message a').click();assert.equal(await page.locator('.ml-folder').count(),0);await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 await browser.close();console.log('PASS desktop/390/320 light+dark, no overflow, touch targets, Windows action payload, API error recovery, close and non-Windows visibility');
})().catch(e=>{console.error(e);process.exit(1)});
