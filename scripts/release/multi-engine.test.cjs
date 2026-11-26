'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'clootee-multi-'));
const base = path.resolve(__dirname, '../../projects/claude_hub/backend/dist');
const { Paths } = require(path.join(base, 'paths'));
const originalData = Paths.DATA_ROOT;
for (const [key, value] of Object.entries(Paths)) if (typeof value === 'string' && (value === originalData || value.startsWith(originalData + path.sep))) Paths[key] = path.join(temp, path.relative(originalData, value));
const load = name => require(path.join(base, name));
const { MultiEngineSettings } = load('helper/MultiEngineSettings');
const { Settings } = load('logic_realize/Settings');
const { MultiEngine } = load('logic_realize/MultiEngine');
const { SessionManager } = load('logic_realize/SessionManager');
const { RootManager } = load('logic_realize/RootManager');
const { TaskQueue } = load('logic_realize/TaskQueue');
const { EngineConfig } = load('logic_realize/EngineConfig');
const { EventBus } = load('helper/EventBus');
const { CostPolicy } = load('helper/CostPolicy');
const config = i => ({ provider: 'custom', apiKey: `test-key-${i}`, baseUrl: `http://localhost:${22000+i}/v1`, model: `test-model-${i}`, effort: 'high' });
const entries = ['codex_one','codex_two','claude_one'].map((name, i) => ({ name, engine: i === 2 ? 'claude' : 'codex', config: config(i) }));
const settings = { multiEngine: { enabled: true, engines: entries }, claudePromptCache: '1h', askClaudePromptCache: false, systemPrompt: 'Shared instruction', quickGroups: [], costOptimization: CostPolicy.sanitize({}), maxConcurrentTasks: 3, autoCompact: { mode: 'auto' } };
Settings.get = () => settings; Settings.runAsUser = () => ({ enabled: false, user: '' }); Settings.effectiveHomeDir = () => undefined;
EventBus.broadcast = () => {};

test('named engine infrastructure', async t => {
  try {
    await t.test('Antigravity resumes the selected conversation and treats user input as data', t => {
      const { AntigravityRunner } = load('logic_realize/AntigravityRunner');
      const { AntigravityBin } = load('helper/AntigravityBin');
      const { ProcessSpawner } = load('helper/ProcessSpawner');
      t.mock.method(AntigravityBin, 'find', () => 'agy');
      let launch;
      t.mock.method(ProcessSpawner, 'run', (...args) => { launch = args; return {}; });
      const prior = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = 'test-credential';
      try {
        const calls = [], prompt = 'line one\n--model sample';
        AntigravityRunner.execute({ claudeSessionId: 'session-a' }, temp, prompt, {
          onOutput: text => calls.push(text), onFinal: text => calls.push(text),
          onDone: (ok, error) => calls.push([ok, error]),
        });
        const [bin, args, cwd, callbacks, input, shell] = launch;
        assert.equal(bin, 'agy'); assert.equal(cwd, temp); assert.equal(shell, false);
        assert.ok(args.includes('--dangerously-skip-permissions'));
        assert.equal(args[args.indexOf('--conversation') + 1], 'session-a');
        assert.equal(args.includes(prompt) || args.includes('test-credential'), false);
        assert.equal(JSON.parse(input).message.content, prompt);
        callbacks.onLine(JSON.stringify({ event: 'step_update', step_update: { step_type: 'agent_response', text_delta: 'hello' } }));
        callbacks.onLine(JSON.stringify({ event: 'result', result: { status: 'ERROR', error: 'bad test-credential' } }));
        callbacks.onExit(0);
        assert.deepEqual(calls, ['hello', [false, 'bad [redacted]']]);
      } finally {
        if (prior === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prior;
      }
    });
    await t.test('Antigravity profiles isolate concurrent launches and native model discovery', async t => {
      const { AntigravityProfile } = load('logic_realize/AntigravityProfile');
      const { HttpJson } = load('helper/HttpJson');
      const first = { ...config(1), baseUrl: 'http://localhost:22001/v1beta', model: 'models/gemini-one' };
      const second = { ...config(2), baseUrl: 'http://localhost:22002', model: 'gemini-two', effort: 'low' };
      const before = EngineConfig.get();
      const scoped = await Promise.all([first, second].map(profile =>
        EngineConfig.withConfig({ antigravity: profile }, async () => {
          await new Promise(resolve => setImmediate(resolve));
          return AntigravityProfile.launch(EngineConfig.get().antigravity);
        })
      ));
      for (const [i, profile] of [first, second].entries()) {
        const { args, env } = scoped[i];
        const id = profile.model.replace(/^models\//, '');
        assert.equal(env.GEMINI_API_KEY, profile.apiKey);
        assert.equal(env.GOOGLE_GEMINI_BASE_URL, profile.baseUrl.replace(/\/v1beta$/, ''));
        assert.equal(args[args.indexOf('--effort') + 1], profile.effort);
        assert.equal(args[args.indexOf('--model') + 1], id);
        const settings = JSON.parse(args[args.indexOf('--settings') + 1]);
        assert.equal(settings.customModelsConfig.customModels[id].modelName, 'gemini-api://' + id);
        assert.ok(!args.join(' ').includes(profile.apiKey));
      }
      const calls = [];
      t.mock.method(HttpJson, 'get', async (url, headers) => {
        calls.push([url, headers['x-goog-api-key']]);
        const page = calls.length === 1 ? { models: [{ name: 'models/gemini-one' }], nextPageToken: 'next' }
          : { models: [{ name: 'models/embed', supportedGenerationMethods: ['embedContent'] }, { name: 'models/gemini-two' }] };
        return { status: 200, json: page };
      });
      const { models } = await MultiEngine.models('antigravity', first);
      assert.deepEqual(models.map(m => m.id), ['gemini-one', 'gemini-two']);
      assert.deepEqual(calls, [
        ['http://localhost:22001/v1beta/models', first.apiKey],
        ['http://localhost:22001/v1beta/models?pageToken=next', first.apiKey],
      ]);
      assert.deepEqual(EngineConfig.get(), before);
    });
    await t.test('toggle and credential updates persist independently, including initial setup', () => {
      const before = structuredClone(settings), original = Settings._patch;
      Settings._patch = patch => Object.assign(settings, patch);
      try {
        settings.multiEngine = { enabled:false, engines:[] };
        assert.equal(Settings.update({multiEngine:{enabled:true}}).multiEngine.enabled, true);
        assert.deepEqual(settings.multiEngine.engines, []);
        assert.throws(() => Settings.update({multiEngine:{engines:[entries[0]]}}), /2–10/);
        Settings.update({multiEngine:{engines:entries}});
        Settings.update({multiEngine:{enabled:false}});
        assert.deepEqual(settings.multiEngine.engines, entries);
        const edited = structuredClone(entries); edited[0].config.apiKey = 'edited-fixture';
        Settings.update({multiEngine:{engines:edited}});
        assert.equal(settings.multiEngine.enabled, false);
        assert.equal(settings.multiEngine.engines[0].config.apiKey, 'edited-fixture');
        Settings.update({multiEngine:{enabled:true}});
        assert.equal(settings.multiEngine.engines[0].config.apiKey, 'edited-fixture');
      } finally { Settings._patch = original; Object.assign(settings, before); }
    });
    await t.test('model HTTP transport follows configured proxy settings', async () => {
      const http=require('node:http'),{spawn}=require('node:child_process');let request;
      const server=http.createServer((req,res)=>{request={url:req.url,auth:req.headers.authorization};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'proxy-model'}]}));});
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const proxy='http://127.0.0.1:'+server.address().port;
      const code=`const {HttpJson}=require(${JSON.stringify(path.join(base,'helper/HttpJson'))});HttpJson.get('http://models.example.invalid/v1/models',{Authorization:'Bearer fixture-proxy'}).then(r=>{console.log(JSON.stringify({status:r.status,count:r.json.data.length}));},()=>process.exit(1));`;
      const child=spawn(process.execPath,['-e',code],{env:{...process.env,HTTP_PROXY:proxy,http_proxy:proxy,NO_PROXY:'',no_proxy:''},stdio:['ignore','pipe','pipe']});
      let output='';child.stdout.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
      try {
        const exit=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
        assert.equal(exit,0);assert.deepEqual(JSON.parse(output),{status:200,count:1});
        assert.equal(request.url,'http://models.example.invalid/v1/models');assert.equal(request.auth,'Bearer fixture-proxy');
      } finally {clearTimeout(timer);child.kill();await new Promise(resolve=>server.close(resolve));}
    });
    await t.test('model requests use native Anthropic headers and retain OpenAI-compatible authentication', async () => {
      const { HttpJson } = load('helper/HttpJson'); const original = HttpJson.get; const requests=[];
      HttpJson.get = async (url, headers) => { requests.push({url,headers}); return {status:200,json:{data:[{id:'model-fixture'}]},raw:''}; };
      try {
        assert.deepEqual(await EngineConfig._fetchModels('https://api.anthropic.com/v1/models','fixture-native'),['model-fixture']);
        assert.deepEqual(requests[0].headers,{'x-api-key':'fixture-native','anthropic-version':'2023-06-01'});
        await EngineConfig._fetchModels('https://example.com/v1/models','fixture-compatible');
        assert.deepEqual(requests[1].headers,{Authorization:'Bearer fixture-compatible'});
      } finally { HttpJson.get=original; }
    });
    await t.test('model discovery uses each instance credential without changing main provider caches', async () => {
      const { ModelManager } = load('logic_realize/ModelManager');
      const originals = { list:EngineConfig.listModels, cache:EngineConfig.setCache, catalog:ModelManager._codexCatalog, claudeCatalog:ModelManager._claudeCatalog };
      const calls = [];
      EngineConfig.listModels = async (provider, key, base, modelsUrl) => { calls.push({ provider, key, base, modelsUrl }); return [key+'-first',key+'-second']; };
      EngineConfig.setCache = () => { throw new Error('Discovery must not change main cache'); };
      ModelManager._codexCatalog = async () => {
        assert.equal(EngineConfig.get().codex.provider, 'official');
        return [{id:'native-codex',source:'catalog'}];
      };
      // The official Claude catalog is read from the real CLI, which CI runners do not have installed.
      ModelManager._claudeCatalog = async () => {
        assert.equal(EngineConfig.get().claude.provider, 'official');
        return [{id:'native-claude',source:'catalog'}];
      };
      try {
        const [one,two] = await Promise.all([MultiEngine.models('codex',{...config(0),modelsUrl:'https://example.com/models'}),MultiEngine.models('codex',config(1))]);
        assert.notDeepEqual(one.models,two.models);
        assert.equal(calls[0].key,config(0).apiKey);assert.equal(calls[1].base,config(1).baseUrl);
        assert.equal(calls[0].modelsUrl,'https://example.com/models');
        assert.equal((await MultiEngine.models('codex',{provider:'official',apiKey:''})).models[0].id,'native-codex');
        assert.ok((await MultiEngine.models('claude',{provider:'official',apiKey:''})).models.length>0);
        await assert.rejects(MultiEngine.models('invalid',{provider:'official',apiKey:''}),/Invalid engine/);
      } finally { EngineConfig.listModels=originals.list;EngineConfig.setCache=originals.cache;ModelManager._codexCatalog=originals.catalog;ModelManager._claudeCatalog=originals.claudeCatalog; }
    });
    await t.test('validates names, duplicate names, count and provider requirements', () => {
      assert.equal(MultiEngineSettings.validate(settings.multiEngine).engines.length, 3);
      for (const name of ['../bad','中文','bad-name','_bad','CON','a/b']) assert.throws(() => MultiEngineSettings.validate({ enabled: true, engines: [{ ...entries[0], name }, entries[1]] }));
      assert.throws(() => MultiEngineSettings.validate({ enabled: true, engines: [entries[0], { ...entries[1], name: 'CODEX_ONE' }] }));
      assert.throws(() => MultiEngineSettings.validate({ enabled: true, engines: [entries[0]] }));
      assert.throws(() => MultiEngineSettings.validate({ enabled: true, engines: [{ ...entries[0], config: { ...config(0), apiKey: '' } }, entries[1]] }));
    });
    const rootDir = path.join(temp, 'project'); fs.mkdirSync(rootDir); fs.writeFileSync(path.join(rootDir, 'claude.md'), 'Root Claude rule'); fs.writeFileSync(path.join(rootDir, 'agents.md'), 'Root agent rule');
    const root = RootManager.addRoot('Project', rootDir);
    await t.test('enabled capability never converts explicitly single or legacy sessions', () => {
      const claude = MultiEngine.create(root.id,'','claude');
      const codex = MultiEngine.create(root.id,'','codex');
      const legacy = MultiEngine.create(root.id,'');
      for (const s of [claude,codex,legacy]) { assert.equal(s.multiGroup,undefined);assert.equal(s.rootId,root.id); }
      assert.equal(claude.engine,'claude');assert.equal(codex.engine,'codex');
      assert.equal(fs.existsSync(path.join(rootDir,'divide')),false);
      const tick=TaskQueue._tick;TaskQueue._tick=()=>{};
      try { assert.equal(MultiEngine.submit(codex.id,['Only Codex']).length,1); } finally { TaskQueue._tick=tick; }
      settings.multiEngine.enabled=false;
      assert.throws(()=>MultiEngine.create(root.id,'','multi'),/Enable multiple engines/);
      settings.multiEngine.enabled=true;
      assert.equal(SessionManager.getSession(codex.id).engine,'codex');
      assert.deepEqual(SessionManager.getSession(codex.id).tasks.map(t=>t.prompt),['Only Codex']);
    });
    let first, members;
    await t.test('creates three isolated directories, copies case variants and applies shared prompts', () => {
      const events=[]; const broadcast=EventBus.broadcast; EventBus.broadcast=e=>events.push(e);
      try { first = MultiEngine.create(root.id, '', 'multi'); } finally { EventBus.broadcast=broadcast; }
      assert.equal(events.filter(e=>e.kind==='session').length,1);
      assert.equal(events[0].session.multiParent,true); assert.equal(events[0].session.rootId,root.id);
      members = MultiEngine.members(first.id);
      assert.equal(members.length, 3);
      assert.throws(() => SessionManager.setEngine(first.id, 'claude'), /engine is fixed/); assert.equal(new Set(members.map(s => s.id)).size, 3);
      assert.deepEqual(members.map(s => s.multiName), entries.map(e => e.name));
      members.forEach((s, i) => {
        const dir = RootManager.getRoot(s.rootId).path;
        assert.equal(dir, path.join(rootDir, 'divide', entries[i].name));
        assert.match(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /Root Claude rule/);
        assert.match(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /Root agent rule/);
        assert.match(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), /Shared instruction/);
        assert.equal(MultiEngine.parentRoot(s.rootId), root.id);
        assert.equal(JSON.stringify(s).includes('test-key'), false);
      });
      assert.equal(fs.statSync(path.join(temp, 'multi_engine_groups.json')).mode & 0o777, 0o600);
    });
    await t.test('uploads from every engine share the parent tmp and keep single-engine uploads local', () => {
      const { Uploader } = load('logic_realize/Uploader');
      for (const [index, member] of members.entries()) {
        const result = Uploader.save(member.id, 'shared.txt', Buffer.from('engine-' + index));
        assert.equal(path.dirname(result.absolutePath), path.join(rootDir, 'tmp'));
        assert.equal(fs.readFileSync(result.absolutePath, 'utf8'), 'engine-' + index);
        assert.equal(result.rel, 'tmp/' + result.name);
        assert.equal(fs.existsSync(path.join(RootManager.getRoot(member.rootId).path, 'tmp', result.name)), false);
      }
      assert.equal(fs.readFileSync(path.join(rootDir, 'tmp', 'shared.txt'), 'utf8'), 'engine-0');
      const single = SessionManager.createSession(members[0].rootId, '', 'claude');
      const local = Uploader.save(single.id, 'local.txt', Buffer.from('single'));
      assert.equal(path.dirname(local.absolutePath), path.join(RootManager.getRoot(single.rootId).path, 'tmp'));
    });
    await t.test('parent listing hides child sessions and directories before pagination in every scope', async () => {
      const { SessionList } = load('logic_realize/SessionList');
      const catalog = SessionList._catalog; SessionList._catalog = async () => [];
      try {
        const roots = MultiEngine.visibleRoots();
        assert.equal(roots.some(r => members.some(s => s.rootId === r.id)), false);
        assert.deepEqual(new Set(roots.find(r => r.id === root.id).multiChildRootIds), new Set(members.map(s => s.rootId)));
        for (const mode of ['single', 'workspace', 'indexed']) {
          const page = await SessionList.page({mode,rootId:root.id,limit:50});
          const grouped = page.items.filter(s => s.multiGroup === first.multiGroup);
          assert.equal(grouped.length,1); assert.equal(grouped[0].rootId,root.id);
          assert.equal(grouped[0].multiParent,true); assert.equal(grouped[0].multiSessionIds.length,3);
          assert.equal(page.directories.some(d => members.some(s => s.rootId === d.rootId)),false);
        }
        const page = await SessionList.page({mode:'workspace',filterRootId:root.id,limit:1});
        assert.equal(page.items.length,1);
        assert.equal(MultiEngine.visibleSessions(members).length,1);
        assert.equal(MultiEngine.anchorId(members[2].id), first.id);
      } finally { SessionList._catalog = catalog; }
    });
    await t.test('instruction files carry zero-based snapshot identity without changing root rules', () => {
      for (const [index, member] of members.entries()) {
        const dir=RootManager.getRoot(member.rootId).path;
        for (const filename of ['CLAUDE.md','AGENTS.md']) {
          const file=path.join(dir,filename), before=fs.readFileSync(file,'utf8');
          assert.ok(before.includes(`从 0 开始): ${index}`));assert.ok(before.includes(`引擎名称: ${entries[index].name}`));
          MultiEngine.ensureIdentity(member);assert.equal(fs.readFileSync(file,'utf8'),before);
          assert.equal(before.split('<!-- clootee:engine-identity:start -->').length,2);
        }
      }
      assert.equal(fs.readFileSync(path.join(rootDir,'claude.md'),'utf8').includes('clootee:engine-identity'),false);
      const dir=RootManager.getRoot(members[1].rootId).path;
      const file=path.join(dir,'AGENTS.md'), lower=path.join(dir,'agents.md');
      fs.renameSync(file,lower);fs.writeFileSync(lower,'Keep my local rules\n');
      const original=settings.multiEngine;settings.multiEngine={enabled:true,engines:[...entries].reverse()};
      try { MultiEngine.ensureIdentity(members[1]); } finally {settings.multiEngine=original;}
      const text=fs.readFileSync(lower,'utf8');assert.match(text,/Keep my local rules/);assert.match(text,/从 0 开始\): 1/);assert.match(text,/引擎名称: codex_two/);
      assert.equal(fs.existsSync(file),false);
      fs.unlinkSync(lower);fs.unlinkSync(path.join(dir,'CLAUDE.md'));
      MultiEngine.ensureIdentity(members[1]);
      assert.ok(fs.existsSync(file));assert.ok(fs.existsSync(path.join(dir,'CLAUDE.md')));
      fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('从 0 开始): 1','从 0 开始): 9'));
      MultiEngine.ensureIdentity(members[1]);assert.match(fs.readFileSync(file,'utf8'),/从 0 开始\): 1/);
      const external=path.join(temp,'external-rule.md');fs.writeFileSync(external,'untouched');fs.unlinkSync(file);fs.symlinkSync(external,file);
      try { assert.throws(()=>MultiEngine.ensureIdentity(members[1]),/Unsafe instruction/);assert.equal(fs.readFileSync(external,'utf8'),'untouched'); }
      finally {fs.unlinkSync(file);MultiEngine.ensureIdentity(members[1]);}
    });
    await t.test('Codex API-equivalent prices differ by model and parent totals include every engine', () => {
      const { ApiCost } = load('logic_realize/ApiCost');
      const fixture=(model,taskId)=>[
        {kind:'task_start',engine:'codex',taskId,ts:1,raw:{provider:'official',model,codexAuth:'chatgpt'}},
        {kind:'raw',engine:'codex',taskId,ts:2,name:'turn.completed',usage:{input_tokens:1000000,cached_input_tokens:200000,output_tokens:100000}},
      ];
      let reads=0;
      const unknown=ApiCost._compute('unknown-fixture',fixture('not-a-known-price','unknown-task'));
      ApiCost._cached('price-refresh','same-trace',()=>{reads++;return unknown;});
      ApiCost._cached('price-refresh','same-trace',()=>{reads++;return unknown;});
      assert.equal(reads,2,'unknown prices must be reconsidered after background pricing refresh');
      const interrupted=ApiCost._compute('interrupted-fixture',fixture('gpt-6.1-sol','old-task').slice(0,1));
      assert.equal(interrupted.turns[0].usageStatus,'missing');assert.equal(interrupted.missingUsageTurns,1);
      const resumed=ApiCost._compute('mixed-fixture',[...fixture('gpt-6.1-sol','old-task').slice(0,1),...fixture('gpt-6.1-sol','new-task')]);
      assert.equal(resumed.missingUsageTurns,1);assert.equal(resumed.totalUsd,2.62);
      assert.equal(resumed.turns[1].usageStatus,'available');
      const zero=fixture('gpt-6.1-sol','free-task');zero[1].usage={input_tokens:0,cached_input_tokens:0,output_tokens:0};
      const free=ApiCost._compute('zero-fixture',zero);
      assert.equal(free.totalUsd,0);assert.equal(free.turns[0].usageStatus,'available');assert.equal(free.missingUsageTurns,0);
      const sol=ApiCost._compute('sol-fixture',fixture('gpt-6.1-sol','sol-task'));
      const astra=ApiCost._compute('astra-fixture',fixture('gpt-6-astra','astra-task'));
      assert.equal(sol.totalUsd,2.62);assert.equal(astra.totalUsd,13.2);
      assert.equal(sol.subscriptionUsd,sol.totalUsd);assert.equal(astra.turns[0].lines[0].model,'gpt-6-astra');
      const { TraceStore }=load('logic_realize/TraceStore');const live=TraceStore.liveEvents;
      TraceStore.liveEvents=id=>({stamp:'multi-price-fixture',events:fixture(id===members[0].id?'gpt-6.1-sol':'gpt-6-astra',id)});
      try {
        const individual=ApiCost.totals(members.map(s=>s.id));
        const parent=MultiEngine.costTotals([first.id])[first.id];
        assert.ok(Math.abs(parent.usd-29.02)<1e-9);assert.ok(Math.abs(parent.sub-29.02)<1e-9);
        assert.equal(parent.consumedMessages,3);assert.equal(parent.tokens.input,2400000);
        assert.equal(individual[members[0].id].usd,2.62,'individual costs must stay separate from parent totals');
        TraceStore.liveEvents=id=>({stamp:'missing-member-fixture',events:id===members[0].id?fixture('gpt-6.1-sol',id).slice(0,1):fixture('gpt-6-astra',id)});
        const partial=MultiEngine.costTotals([first.id])[first.id];
        assert.equal(partial.missingUsageTurns,1);assert.equal(partial.usd,26.4);

      } finally {TraceStore.liveEvents=live;ApiCost._cache.clear();}
    });
    await t.test('existing groups freeze names, order, models, providers and credentials across settings edits and reload', () => {
      const before=structuredClone(settings.multiEngine);
      const snapshots=members.map(s=>MultiEngine.config(s));
      const identities=members.map(s=>({id:s.id,rootId:s.rootId,name:s.multiName}));
      try {
        settings.multiEngine.engines.forEach((entry,i)=>{
          entry.name='renamed_'+i;entry.engine=entry.engine==='codex'?'claude':'codex';
          entry.config.model='new-model-'+i;entry.config.provider='official';entry.config.apiKey='new-key-'+i;
          entry.config.baseUrl='https://changed.example/v1';entry.config.effort='low';
        });
        settings.multiEngine.engines.reverse();settings.multiEngine.enabled=false;
        for(const [i,member] of members.entries()) {
          assert.deepEqual(MultiEngine.config(member),snapshots[i]);
          const returned=MultiEngine.config(member);returned.name='accidental-edit';returned.config.model='accidental-model';
          assert.deepEqual(MultiEngine.config(member),snapshots[i]);
          MultiEngine.withSession(member,()=>{EngineConfig.get()[member.engine].model='accidental-runner-edit';});
          assert.deepEqual(MultiEngine.config(member),snapshots[i]);
          MultiEngine.ensureIdentity(member);
          const text=fs.readFileSync(path.join(RootManager.getRoot(member.rootId).path,'AGENTS.md'),'utf8');
          assert.ok(text.includes(`引擎名称: ${snapshots[i].name}`));assert.ok(text.includes(`从 0 开始): ${i}`));
          assert.equal(SessionManager.getSession(member.id).multiName,snapshots[i].name);
        }
        // Reload group data exactly as a fresh process does, while global settings remain changed.
        MultiEngine._groupCache=undefined;
        assert.deepEqual(MultiEngine.members(first.id).map(s=>({id:s.id,rootId:s.rootId,name:s.multiName})),identities);
        members.forEach((s,i)=>assert.deepEqual(MultiEngine.config(s),snapshots[i]));
        settings.multiEngine.engines=[];
        members.forEach((s,i)=>assert.deepEqual(MultiEngine.config(s),snapshots[i]));
        settings.multiEngine={enabled:true,engines:before.engines.map((e,i)=>({...e,name:'future_'+i,config:{...e.config,model:'future-model-'+i}}))};
        const next=MultiEngine.create(root.id,'','multi');
        assert.deepEqual(MultiEngine.members(next.id).map(s=>s.multiName),['future_0','future_1','future_2']);
        assert.equal(MultiEngine.config(next).config.model,'future-model-0');
        members.forEach((s,i)=>assert.deepEqual(MultiEngine.config(s),snapshots[i]));
        MultiEngine.remove(next.id);
      } finally {settings.multiEngine=before;}
    });
    await t.test('configuration is a snapshot and async contexts do not mix', async () => {
      settings.multiEngine = { enabled: false, engines: [] };
      await Promise.all(members.map((s, i) => MultiEngine.withSession(s, async () => {
        await new Promise(resolve => setTimeout(resolve, 5 + i));
        assert.equal(EngineConfig.get()[s.engine].apiKey, `test-key-${i}`);
        if (s.engine === 'codex') assert.equal(EngineConfig.codexUpstream().model, `test-model-${i}`);
      })));
    });
    await t.test('each send creates one task per engine, while single sessions stay single', () => {
      const original = TaskQueue._tick; TaskQueue._tick = () => {};
      try {
        assert.equal(MultiEngine.submit(first.id, ['One shared request']).length, 3);
        assert.equal(MultiEngine.submit(members[1].id, ['Follow up']).length, 3);
        members.forEach(s => assert.deepEqual(SessionManager.getSession(s.id).tasks.map(t => t.prompt), ['One shared request', 'Follow up']));
        assert.throws(() => MultiEngine.submit(first.id, ['']), /Invalid prompts/);
        const single = MultiEngine.create(root.id, '', 'claude'); assert.equal(MultiEngine.members(single.id).length, 1);
      } finally { TaskQueue._tick = original; }
    });
    await t.test('delivery scope targets only the selected engine or explicitly fans out', () => {
      const tick=TaskQueue._tick; TaskQueue._tick=()=>{};
      try {
        const before=members.map(s=>SessionManager.getSession(s.id).tasks.length);
        assert.equal(MultiEngine.submit(members[1].id,['Current only'],[],'current').length,1);
        assert.deepEqual(members.map(s=>SessionManager.getSession(s.id).tasks.length),before.map((n,i)=>n+(i===1?1:0)));
        assert.equal(MultiEngine.submit(members[2].id,['Everyone'],[],'all').length,3);
        assert.throws(()=>MultiEngine.submit(first.id,['Invalid'],[],'unknown'),/Invalid delivery scope/);
      } finally {TaskQueue._tick=tick;}
    });
    await t.test('capacity failure prevents partial submission to the other engines', () => {
      const original = SessionManager.getSessionFull;
      const before = members.map(s => SessionManager.getSession(s.id).tasks.length);
      SessionManager.getSessionFull = id => {
        const s = original.call(SessionManager, id);
        if (id === members[1].id) s.messages = Array.from({length:100}, () => ({ role:'user', text:'past request' }));
        return s;
      };
      try {
        assert.throws(() => MultiEngine.submit(first.id, ['Do not partly enqueue']), /session_message_limit_reached/);
        assert.deepEqual(members.map(s => SessionManager.getSession(s.id).tasks.length), before);
      } finally { SessionManager.getSessionFull = original; }
    });
    await t.test('runners use separate provider routes and child credentials without logging API keys in args', () => {
      const { ProcessSpawner } = load('helper/ProcessSpawner');
      const { CodexBin } = load('helper/CodexBin'); const { ClaudeBin } = load('helper/ClaudeBin');
      const { Toolchain } = load('logic_realize/Toolchain'); const { ConsoleAccount } = load('logic_realize/ConsoleAccount');
      CodexBin.resolve = ClaudeBin.resolve = () => ({ bin: process.execPath, prefixArgs: [], useShell: false });
      Toolchain.preferBundled = () => false; ConsoleAccount.runEnv = () => ({});
      const captured = [];
      ProcessSpawner.run = (bin, args, cwd, cb, prompt, shell, timeout, env) => { captured.push({ args, cwd, env, prompt }); return { child: new EventEmitter(), kill() {} }; };
      const cb = { onThinking() {}, onTool() {}, onOutput() {}, onFinal() {}, onDone() {} };
      members.forEach(s => {
        const runner = load(`logic_realize/${s.engine === 'codex' ? 'CodexRunner' : 'ClaudeRunner'}`)[s.engine === 'codex' ? 'CodexRunner' : 'ClaudeRunner'];
        runner.execute(s, RootManager.getRoot(s.rootId).path, 'shared prompt', cb);
      });
      assert.equal(captured.length, 3);
      assert.notEqual(captured[0].env.CLOOTEE_DIVIDE_KEY, captured[1].env.CLOOTEE_DIVIDE_KEY);
      assert.equal(captured[2].env.ANTHROPIC_AUTH_TOKEN, 'test-key-2');
      assert.equal(captured[2].env.ANTHROPIC_BASE_URL, config(2).baseUrl);
      assert.ok(captured.slice(0, 2).every(r => r.args.includes('model_provider="divide"')));
      assert.equal(JSON.stringify(captured.map(r => r.args)).includes('test-key'), false);
      const file = captured[2].args[captured[2].args.indexOf('--settings') + 1];
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      assert.equal(JSON.parse(fs.readFileSync(file)).env.ANTHROPIC_AUTH_TOKEN, 'test-key-2');
      const { CodexRunner } = load('logic_realize/CodexRunner');
      const args = EngineConfig.withConfig({ codex: { provider:'official', apiKey:'', model:'', effort:'' } }, () => CodexRunner._buildArgs(members[0], captured[0].cwd));
      assert.ok(args.includes('model_provider="openai"'));
      assert.ok(args.includes('model_reasoning_effort=medium'));
      assert.equal(args[args.indexOf('-m') + 1], load('config/ClaudePricing').CODEX_DEFAULT_MODEL);
    });
    await t.test('proxy dispatch keeps simultaneous Codex requests on their own upstream', async () => {
      const { KimiProxy } = load('logic_realize/KimiProxy');
      const original = KimiProxy.dispatchResponses;
      KimiProxy.dispatchResponses = async (body, key) => {
        await new Promise(resolve => setTimeout(resolve, body.delay));
        assert.equal(EngineConfig.codexUpstream().baseUrl, body.baseUrl);
        assert.equal(EngineConfig.codexUpstream().apiKey, key);
      };
      try {
        await Promise.all([0,1].map(i => new Promise((resolve, reject) => {
          const token = KimiProxy.registerEngine(config(i));
          const req = new EventEmitter(); req.headers = { authorization: `Bearer ${token}` };
          const res = { writeHead(code) { if (code >= 400) reject(new Error('Proxy dispatch failed')); }, write() {}, end: resolve };
          KimiProxy._handleResponses(req, res);
          req.emit('data', JSON.stringify({ delay: 10-i*5, baseUrl: config(i).baseUrl })); req.emit('end');
        })));
      } finally { KimiProxy.dispatchResponses = original; }
    });
    await t.test('new groups reuse initial directories and preserve existing files', () => {
      settings.multiEngine = { enabled: true, engines: entries };
      const marker = path.join(rootDir, 'divide', 'codex_one', 'work.txt'); fs.writeFileSync(marker, 'existing work');
      const next = MultiEngine.create(members[0].rootId, '', 'multi');
      assert.equal(RootManager.getRoot(next.rootId).path, path.join(rootDir, 'divide', 'codex_one'));
      assert.equal(fs.readFileSync(marker, 'utf8'), 'existing work');
      assert.notEqual(next.multiGroup, first.multiGroup);
    });
    await t.test('group metadata survives queue restoration and IDs becoming native IDs', () => {
      const s = SessionManager.getSession(first.id); s.claudeSessionId = 'native-engine-one'; SessionManager.saveSession(s);
      const snapshot=MultiEngine.config(s), saved=settings.multiEngine;
      settings.multiEngine={enabled:false,engines:[]};
      try {
        SessionManager._live.clear(); MultiEngine._groupCache=undefined; SessionManager.restorePersisted();
        assert.deepEqual(MultiEngine.config(SessionManager.getSession(`${s.rootId}:native-engine-one`)),snapshot);
        assert.deepEqual(MultiEngine.members(`${s.rootId}:native-engine-one`).map(m=>m.multiName),entries.map(e=>e.name));
      } finally {settings.multiEngine=saved;}
      assert.equal(MultiEngine.members(`${s.rootId}:native-engine-one`).length, 3);
      assert.equal(MultiEngine.members(`${s.rootId}:native-engine-one`)[0].id, first.id);
      assert.equal(SessionManager.getSession(`${s.rootId}:native-engine-one`).multiName, 'codex_one');
    });
    await t.test('group state, annotations and full-text search belong to the parent after restart', async () => {
      const { SessionList } = load('logic_realize/SessionList');
      const catalog=SessionList._catalog;SessionList._catalog=async()=>[];
      const restored=MultiEngine.members(first.id), child=restored[2];
      const tasks=child.tasks, messages=child.messages;
      try {
        SessionManager.setTitle(MultiEngine.anchorId(child.id),'Group title');
        SessionManager.setFavorite(MultiEngine.anchorId(child.id),true);
        child.tasks=[{id:'running-fixture',status:'running'}]; child.messages=[{role:'user',text:'unique-child-search'}];
        const page=await SessionList.page({mode:'favorites',rootId:root.id});
        assert.equal(page.items.filter(s=>s.multiGroup===first.multiGroup).length,1);
        assert.equal(page.items[0].customTitle,'Group title');assert.equal(page.running[0].id,first.id);
        assert.equal(SessionManager.getSession(child.id).customTitle,'Group title');
        const search=await SessionList.page({mode:'workspace',q:'unique-child-search',fullText:true});
        assert.equal(search.items.length,1);assert.equal(search.items[0].id,first.id);
      } finally {child.tasks=tasks;child.messages=messages;SessionList._catalog=catalog;}
    });
    await t.test('removing the parent removes every member and keeps work directories internal', () => {
      const ids=MultiEngine.members(first.id).map(s=>s.id);
      MultiEngine.remove(first.id);
      assert.equal(SessionManager.runtimeSessions().some(s=>ids.includes(s.id)),false);
      assert.equal(MultiEngine.visibleRoots().some(r=>members.some(s=>s.rootId===r.id)),false);
      assert.equal(fs.readFileSync(path.join(rootDir,'divide','codex_one','work.txt'),'utf8'),'existing work');
    });
    await t.test('identity files are created even without source files or a shared prompt', () => {
      const saved=settings.systemPrompt;settings.systemPrompt='';settings.multiEngine={enabled:true,engines:entries};
      const dir=path.join(temp,'blank-project');fs.mkdirSync(dir);
      try {
        const r=RootManager.addRoot('Blank',dir), s=MultiEngine.create(r.id,'','multi');
        for(const [index,member] of MultiEngine.members(s.id).entries()) for(const filename of ['CLAUDE.md','AGENTS.md']) {
          const text=fs.readFileSync(path.join(RootManager.getRoot(member.rootId).path,filename),'utf8');
          assert.ok(text.includes(`从 0 开始): ${index}`));assert.ok(text.includes(`引擎名称: ${entries[index].name}`));
        }
      } finally {settings.systemPrompt=saved;}
    });
    await t.test('rejects symlink work directories', () => {
      settings.multiEngine = { enabled: true, engines: entries };
      const unsafe = path.join(temp, 'unsafe'); fs.mkdirSync(unsafe); fs.symlinkSync(rootDir, path.join(unsafe, 'divide'));
      const r = RootManager.addRoot('Unsafe', unsafe);
      assert.throws(() => MultiEngine.create(r.id, '', 'multi'), /Unsafe divide directory/);
    });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
