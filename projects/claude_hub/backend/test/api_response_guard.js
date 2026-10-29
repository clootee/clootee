process.chdir(require('path').resolve(__dirname, '../../../..'));
const fs=require('fs'),vm=require('vm'),assert=require('assert');
(async()=>{const s=fs.readFileSync('projects/claude_hub/frontend/app.js','utf8');let response;const context=vm.createContext({TOKEN:'test',T:k=>k,fetch:async()=>response,showLogin:()=>{}});vm.runInContext(s.slice(s.indexOf('async function api('),s.indexOf('// ── 目录私有密码')),context);
response={status:404,headers:{get:()=> 'text/html'},json:()=>{throw Error('should not parse HTML')}};await assert.rejects(vm.runInContext("api('/api/fm/open-containing',{})",context),/messageLinkRestartNeeded/);
response={status:502,headers:{get:()=> 'text/html'}};await assert.rejects(vm.runInContext("api('/api/settings')",context),/apiUnexpectedResponse/);
response={status:200,headers:{get:()=> 'application/json; charset=utf-8'},json:async()=>({success:true,data:{ok:true}})};assert.equal((await vm.runInContext("api('/api/fm/open-containing',{})",context)).ok,true);
console.log('PASS missing endpoint HTML, gateway HTML and successful JSON');})().catch(e=>{console.error(e);process.exit(1)});
