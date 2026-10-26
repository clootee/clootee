const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { UpdateCheckerStruct } = require('../dist/logic_struct/UpdateCheckerStruct');
(async () => {
  class Failed extends UpdateCheckerStruct {
    static _pull() { return Promise.resolve({ok:false, output:'network failed'}); }
    static _triggerRestart() { throw new Error('must not restart'); }
  }
  await assert.rejects(() => Failed.apply(), /network failed/);
  await assert.rejects(() => Failed.apply(), /network failed/);
  let finish;
  let restarts=0;
  class Pending extends UpdateCheckerStruct {
    static _pull() { return new Promise(r => { finish=r; }); }
    static _triggerRestart() { restarts++; }
  }
  const applying=Pending.apply();
  await assert.rejects(() => Pending.apply(), /already in progress/);
  finish({ok:true,output:'ok'});
  await applying;
  assert.equal(restarts,1);
  await assert.rejects(() => Pending.apply(), /already in progress/);
  const app=fs.readFileSync(require('path').join(__dirname,'../../frontend/app.js'),'utf8');
  const start=app.indexOf('function waitForAppRestart(');
  const end=app.indexOf('\n}',start)+2;
  let tick, reloads=0, instance='old';
  const context={setTimeout:fn=>{tick=fn;},api:async()=>({instance}),location:{reload:()=>reloads++},T:()=>'{s}'};
  vm.createContext(context);
  vm.runInContext(app.slice(start,end),context);
  context.waitForAppRestart({textContent:'',scrollTop:0,scrollHeight:0},'old');
  await tick();assert.equal(reloads,0);
  instance='new';await tick();assert.equal(reloads,1);
  process.stdout.write('PASS: failed pulls, duplicate apply, and old-process restart polling\n');
})().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
