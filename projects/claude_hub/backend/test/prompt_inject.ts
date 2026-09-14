import * as fs from 'fs'; import * as os from 'os'; import * as path from 'path';
import { PromptBlock } from 'd:/projects/claudecode/projects/claude_hub/backend/src/helper/PromptBlock';
import { ProjectPrompt } from 'd:/projects/claudecode/projects/claude_hub/backend/src/logic_realize/ProjectPrompt';
import { Settings } from 'd:/projects/claudecode/projects/claude_hub/backend/src/logic_realize/Settings';
const ok=(c:boolean,m:string)=>{ if(!c) throw new Error('FAIL '+m); console.log('ok',m); };
// helper 纯逻辑
ok(PromptBlock.upsert('','hi')!.includes('hi'),'create');
const c1=PromptBlock.upsert('# T\n\nbody','hi')!;
ok(c1.startsWith('# T'),'append keeps原文');
ok(PromptBlock.upsert(c1,'hi')===null,'idempotent');
const c2=PromptBlock.upsert(c1,'hi2')!;
ok(c2.includes('hi2') && !c2.includes('hi\n'),'replace block');
ok((c2.match(/preset-prompt:start/g)||[]).length===1,'single block');
ok(PromptBlock.upsert('前面\n用户手写: hi\n','hi')===null,'手写已含则跳过');
// 端到端（临时目录 + 大小写变体）
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pp-'));
fs.writeFileSync(path.join(dir,'claude.md'),'# 小写文件\n');
(Settings as any).get=()=>({systemPrompt:'请用中文回答'});
const r1=ProjectPrompt.ensure(dir);
console.log(r1);
ok(fs.readFileSync(path.join(dir,'claude.md'),'utf8').includes('请用中文回答'),'写入小写 claude.md');
ok(fs.existsSync(path.join(dir,'AGENTS.md')),'创建 AGENTS.md');
ok(fs.readdirSync(dir).filter(n=>n.toLowerCase()==='claude.md').length===1,'未重复创建大写 CLAUDE.md');
const r2=ProjectPrompt.ensure(dir);
ok(r2.every((r:any)=>r.action==='skip'),'第二次全 skip');
(Settings as any).get=()=>({systemPrompt:''});
ok(ProjectPrompt.ensure(dir).length===0,'空提示词=空操作');
console.log('ALL PASS');
