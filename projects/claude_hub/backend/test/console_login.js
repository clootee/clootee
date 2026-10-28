const assert = require('node:assert/strict');
const { ConsoleAccount } = require('../dist/logic_realize/ConsoleAccount');
let record={installId:'ci_test_install_id_1234',token:''};let approved=false;const calls=[];
ConsoleAccount._readRecord=()=>({...record});
ConsoleAccount._writeRecord=value=>{record={...value};};
ConsoleAccount._syncEngines=()=>{};
ConsoleAccount._call=async(method,path,token,body)=>{
 calls.push(path);
 if(path==='/api/device/start')return {device_code:'dc_private',user_code:'12345678'};
 if(path==='/api/device/token'){assert.equal(body.device_code,'dc_private');return approved?{token:'ck-'+'a'.repeat(32)}:{pending:true};}
 throw Object.assign(new Error('Unauthorized'),{status:401});
};
(async()=>{
 await assert.rejects(ConsoleAccount.ensureToken(),/CLOOTEE_LOGIN_REQUIRED/);
 const login=await ConsoleAccount.beginLogin();
 assert.match(login.url,/\/connect\?user_code=12345678$/);
 assert.ok(!JSON.stringify(login).includes('dc_private'));
 assert.deepEqual(await ConsoleAccount.finishLogin(login.loginId),{pending:true});
 await assert.rejects(ConsoleAccount.finishLogin('unknown'),/expired/);
 approved=true;
 assert.deepEqual(await ConsoleAccount.finishLogin(login.loginId),{pending:false});
 assert.match(await ConsoleAccount.ensureToken(),/^ck-/);
 await assert.rejects(ConsoleAccount.finishLogin(login.loginId),/expired/);
 await assert.rejects(ConsoleAccount._authed('GET','/api/v1/me',record.token),/CLOOTEE_LOGIN_REQUIRED/);
 assert.equal(record.token,'');
 assert.ok(!calls.includes('/api/v1/devices'));
 process.stdout.write('console_login: 11 assertions passed\n');
})().catch(e=>{process.stderr.write(String(e.stack)+'\n');process.exitCode=1;});
