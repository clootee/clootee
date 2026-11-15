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
      const originals = { list:EngineConfig.listModels, cache:EngineConfig.setCache, catalog:ModelManager._codexCatalog };
      const calls = [];
      EngineConfig.listModels = async (provider, key, base, modelsUrl) => { calls.push({ provider, key, base, modelsUrl }); return [key+'-first',key+'-second']; };
      EngineConfig.setCache = () => { throw new Error('Discovery must not change main cache'); };
      ModelManager._codexCatalog = async () => {
        assert.equal(EngineConfig.get().codex.provider, 'official');
        return [{id:'native-codex',source:'catalog'}];
      };
      try {
        const [one,two] = await Promise.all([MultiEngine.models('codex',{...config(0),modelsUrl:'https://example.com/models'}),MultiEngine.models('codex',config(1))]);
        assert.notDeepEqual(one.models,two.models);
        assert.equal(calls[0].key,config(0).apiKey);assert.equal(calls[1].base,config(1).baseUrl);
        assert.equal(calls[0].modelsUrl,'https://example.com/models');
        assert.equal((await MultiEngine.models('codex',{provider:'official',apiKey:''})).models[0].id,'native-codex');
        assert.ok((await MultiEngine.models('claude',{provider:'official',apiKey:''})).models.length>0);
        await assert.rejects(MultiEngine.models('invalid',{provider:'official',apiKey:''}),/Invalid engine/);
      } finally { EngineConfig.listModels=originals.list;EngineConfig.setCache=originals.cache;ModelManager._codexCatalog=originals.catalog; }
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
      first = MultiEngine.create(root.id, '', 'multi'); members = MultiEngine.members(first.id);
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
      SessionManager._live.clear(); SessionManager.restorePersisted();
      assert.equal(MultiEngine.members(`${s.rootId}:native-engine-one`).length, 3);
      assert.equal(MultiEngine.members(`${s.rootId}:native-engine-one`)[0].id, first.id);
      assert.equal(SessionManager.getSession(`${s.rootId}:native-engine-one`).multiName, 'codex_one');
    });
    await t.test('rejects symlink work directories', () => {
      settings.multiEngine = { enabled: true, engines: entries };
      const unsafe = path.join(temp, 'unsafe'); fs.mkdirSync(unsafe); fs.symlinkSync(rootDir, path.join(unsafe, 'divide'));
      const r = RootManager.addRoot('Unsafe', unsafe);
      assert.throws(() => MultiEngine.create(r.id, '', 'multi'), /Unsafe divide directory/);
    });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
