process.chdir(require('path').resolve(__dirname, '../../../..'));
const { chromium } = require('../../node_modules/playwright');
const fs = require('fs');
const assert = require('assert');
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage();
 await page.setContent('<div id="message"></div>');
 await page.addScriptTag({path:'projects/claude_hub/frontend/vendor/marked.min.js'});
 await page.addScriptTag({path:'projects/claude_hub/frontend/vendor/purify.min.js'});
 const source = fs.readFileSync('projects/claude_hub/frontend/app.js','utf8');
 await page.addScriptTag({content:`const State={rootId:'head',settings:{platform:'win32'},roots:[{id:'head',path:'D:/projects/head1'}]}; const TOKEN='test'; const T=k=>k; let copied=''; const copyText=(text)=>{copied=text}; ${source.slice(source.indexOf('function markdownLocalPath('),source.indexOf('// ── AI 内联图表'))} ${source.slice(source.indexOf('function fmFileUrl('),source.indexOf('async function toggleFilesPanel('))}`});
 const files=['智能小头_双平台产品与商业化提案.pptx','智能小头_双平台产品与商业化提案.pdf','智能小头_双平台商业测算.xlsx'];
 for(const name of files){
  await page.evaluate(name=>renderMarkdown(document.querySelector('#message'),`[下载文件](D:/projects/head1/reports/${name})`),name);
  await page.locator('#message a').click();
  assert(await page.locator('dialog').isVisible());
  await page.getByRole('button',{name:'messageLinkCopyPath',exact:true}).click();
  assert.equal(await page.evaluate(()=>copied),'D:/projects/head1/reports/'+name);
  await page.getByRole('button',{name:'messageLinkCopyText',exact:true}).click();
  assert.equal(await page.evaluate(()=>copied),'下载文件');
  const url = new URL(await page.locator('dialog a').getAttribute('href'),'http://localhost');
  assert.equal(url.searchParams.get('rel'),'reports/'+name);
  assert.equal(url.searchParams.get('download'),'1');
  await page.keyboard.press('Escape'); await page.locator('dialog').waitFor({state:'detached'}); assert.equal(await page.locator('dialog').count(),0);
 }
 for(const [href,local] of [['file:///D:/projects/head1/reports/a%20b.pdf',true],['/tmp/report.pdf',true],['reports/a.pdf',true],['https://example.com/a',false],['javascript:alert(1)',false]]){
  await page.evaluate(href=>renderMarkdown(document.querySelector('#message'),`[test](${href})`),href);
  assert.equal(await page.locator('#message a').getAttribute('data-local-path')!==null,local);
  if(href.startsWith('javascript:')) assert.equal(await page.locator('#message a').getAttribute('href'),null);
 }
 await page.evaluate(()=>renderMarkdown(document.querySelector('#message'),'[web](https://example.com)'));
 await page.locator('#message a').click(); assert.equal(await page.locator('dialog button').count(),2);
 await page.keyboard.press('Escape');
 await browser.close(); console.log('PASS: actual PPT/PDF/XLSX links, copy text/path, download URL, Escape, file URL/relative/Unix/HTTPS and unsafe protocol');
})().catch(e=>{console.error(e);process.exit(1)});
