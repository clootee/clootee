const originalPlatform=Object.getOwnPropertyDescriptor(process,'platform');Object.defineProperty(process,'platform',{value:'win32'});
process.chdir(require('path').resolve(__dirname, '../../../..'));
const assert=require('assert');const fs=require('fs'),path=require('path'),os=require('os');const {EventEmitter}=require('events');const cp=require('child_process');
const {FolderOpener}=require('../dist/logic_realize/FolderOpener');const {RootManagerStruct}=require('../dist/logic_struct/RootManagerStruct');
(async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'clootee-folder-'));const folder=path.join(base,'reports');fs.mkdirSync(folder);const file=path.join(folder,'提案.pdf');fs.writeFileSync(file,'test');
 const originalGet=RootManagerStruct.getRoot,originalSpawn=cp.spawn;let observed,fail=false;
 RootManagerStruct.getRoot=()=>({path:base});cp.spawn=(cmd,args,opts)=>{observed={cmd,args,opts};const child=new EventEmitter();child.unref=()=>{};queueMicrotask(()=>child.emit(fail?'error':'spawn',fail?new Error('launch failed'):undefined));return child;};
 try{
  assert.deepEqual(await FolderOpener.openContaining('root','reports/提案.pdf'),{ok:true});assert.equal(observed.cmd,'explorer.exe');assert.deepEqual(observed.args,[folder]);assert.equal(observed.opts.shell,false);
  observed=null;await assert.rejects(FolderOpener.openContaining('root','../outside.pdf'));assert.equal(observed,null);
  await assert.rejects(FolderOpener.openContaining('root','missing.pdf'));
  fail=true;await assert.rejects(FolderOpener.openContaining('root','reports/提案.pdf'),/launch failed/);
  console.log('PASS folder validation, correct containing directory, no shell, traversal/missing file rejection, spawn failure');
 }finally{Object.defineProperty(process,'platform',originalPlatform);RootManagerStruct.getRoot=originalGet;cp.spawn=originalSpawn;fs.unlinkSync(file);fs.rmdirSync(folder);fs.rmdirSync(base);}
})().catch(e=>{console.error(e);process.exit(1)});
