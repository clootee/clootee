// 第 8 章（毕业设计）：用 TypeScript 给 Clootee 加一个真功能
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch08',
  icon: '🎓',
  minutes: 25,
  title: { zh: '毕业设计：用 TypeScript 给 Clootee 加一个真功能', en: 'Capstone: add a real feature to Clootee in TypeScript' },
  goal: {
    zh: '读懂一个真实项目的结构，走完「加后端接口 + 加前端界面 + 编译 + 重启 + 验证」的全流程，并知道改坏了怎么退回去。',
    en: 'Read a real project’s structure and complete the full loop: add a backend route, add UI, compile, restart, verify — and know how to back out when you break it.',
  },
  praise: {
    zh: '<p>🎓 <b>你毕业了。</b></p><p>回头看一下你走过的路：从"这东西到底是什么"，到整理文件、处理表格、写文档、做分析、立规矩、做工具，最后给一个真实的软件加了一个真实的功能。</p><p>你现在具备的不是"会用某个 AI 工具"，而是一套<b>可迁移的工作方法</b>：说清楚（四要素）→ 先计划 → 小步改 → 自己验收 → 沉淀成可复用资产。换任何工具、任何模型，这套方法都成立。</p><p>去把它用在你真正的工作上吧。</p>',
    en: '<p>🎓 <b>You graduated.</b></p><p>Look back at the path: from "what is this thing", through sorting files, spreadsheets, writing, analysis, house rules and building a tool — to adding a real feature to real software.</p><p>What you have is not "knows one AI tool" but a <b>transferable working method</b>: be explicit (four parts) → plan first → change in small steps → verify yourself → turn it into a reusable asset. That survives any change of tool or model.</p><p>Now go use it on your actual job.</p>',
  },

  sections: [
    {
      h: { zh: 'TypeScript 是什么，对你有什么用', en: 'What TypeScript is, and what it does for you' },
      fig: 'ts-shield',
      body: {
        zh: `<div class="lp-oneline">TypeScript = JavaScript + 类型。类型能在写代码阶段就拦下一大堆错误。</div>
<p>类型就是提前说清「这个是数字」「那个是文字」。对你有两个实际好处：</p>
<ol>
<li><b>AI 出错率更低</b>——编译器当场就把一类错误挡回去了。</li>
<li><b>你多了一道不用看懂代码的验收关卡</b>——让它跑一次「类型检查」，通不过就是有问题。</li>
</ol>
<details class="lp-fold"><summary>🍊 打个比方</summary><div class="lp-fold-body">
<p>没有类型，像<b>寄快递不写收件人电话</b>：包裹发出去了，等送到门口才发现联系不上。</p>
<p>有类型，像<b>下单时系统就提示「手机号格式不对」</b>：还没发出去就拦下来了。</p>
</div></details>
<details class="lp-fold"><summary>⚠️ 一个必须记住的坑</summary><div class="lp-fold-body">
<p>TypeScript <b>不能直接运行</b>，要先编译成 JavaScript。</p>
<p>所以：<b>改了后端代码 → 必须编译 → 必须重启服务</b>。漏掉任何一步，你都会遇到「我明明改了，怎么一点变化都没有」。这是本章最常见的困惑。</p>
</div></details>`,
        en: `<div class="lp-oneline">TypeScript = JavaScript + types. Types catch a whole class of errors while the code is being written.</div>
<p>A type just declares up front "this is a number", "that is text". Two practical benefits:</p>
<ol>
<li><b>The AI errs less</b> — the compiler blocks a class of mistakes immediately.</li>
<li><b>You gain a verification gate that needs no code reading</b> — run a type check; if it fails, something is wrong.</li>
</ol>
<details class="lp-fold"><summary>🍊 An analogy</summary><div class="lp-fold-body">
<p>Without types: <b>posting a parcel with no phone number</b>. It ships, and only at the door does anyone discover they cannot reach you.</p>
<p>With types: <b>the form rejects the phone number as you type it</b>. Caught before anything ships.</p>
</div></details>
<details class="lp-fold"><summary>⚠️ The trap to remember</summary><div class="lp-fold-body">
<p>TypeScript <b>cannot run directly</b> — it must be compiled to JavaScript.</p>
<p>So: <b>edit backend code → compile → restart the service</b>. Skip any step and you hit "I definitely changed it, why is nothing different?" — the classic confusion of this chapter.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '第一步：先让它带你读懂项目', en: 'Step one: have it walk you through the project' },
      fig: 'read-first',
      body: {
        zh: `<div class="lp-oneline">改陌生项目永远从「读」开始。别猜，也别让 AI 猜。</div>
<p><b>动手之前先 git 提交一次</b>——这是本章唯一的强制要求。</p>
<details class="lp-fold"><summary>📝 五点提问（照抄）</summary><div class="lp-fold-body">
<pre>先不要改任何代码。请帮我读懂这个项目：
1. 目录结构是怎么组织的？每个目录负责什么？
2. 后端怎么把一个 HTTP 请求路由到具体业务代码？举一个现有接口为例。
3. 前端怎么调用后端接口？也举一个例子。
4. 有没有约定文件（CLAUDE.md 之类）？里面有哪些必须遵守的规矩？
5. 改完代码之后，跑什么命令编译、怎么重启服务？
请按这五点回答，每点配上具体文件路径。</pre>
<p>第 5 点最重要——不知道怎么编译重启，你后面所有改动都验证不了。</p>
</div></details>
<details class="lp-fold"><summary>🔍 Clootee 的结构（顺便当教材看）</summary><div class="lp-fold-body">
<table>
<tr><th>目录</th><th>职责</th><th>类比</th></tr>
<tr><td><code>logic_struct/</code></td><td>调度：先做什么、后做什么、参数合不合法</td><td>流程图</td></tr>
<tr><td><code>logic_realize/</code></td><td>实现：具体怎么读文件、怎么发请求</td><td>操作手册</td></tr>
<tr><td><code>helper/</code></td><td>纯工具，与业务无关</td><td>工具箱</td></tr>
<tr><td><code>server/</code></td><td>路由：只接请求转发，不写业务</td><td>前台接待</td></tr>
<tr><td><code>frontend/</code></td><td>静态前端，改完刷新浏览器，不用编译</td><td>门面</td></tr>
</table>
<p>为什么这么分：<b>调度骨架一眼读完，改实现细节不会误伤架构。</b>你加功能时也要照着这个写——<b>照着项目已有的写法写，是新人最重要的美德。</b></p>
</div></details>`,
        en: `<div class="lp-oneline">Changing an unfamiliar project always starts with reading. Do not guess, and do not let the AI guess.</div>
<p><b>Make a git commit before you start</b> — the one mandatory rule of this chapter.</p>
<details class="lp-fold"><summary>📝 The five-point question (copy it)</summary><div class="lp-fold-body">
<pre>Do not change any code yet. Help me understand this project:
1. How is the directory structure organised? What is each directory responsible for?
2. How does the backend route an HTTP request to business code? Use an existing endpoint.
3. How does the frontend call the backend? Give an example.
4. Are there convention files (CLAUDE.md or similar)? Which rules are mandatory?
5. After editing code, what command compiles it and how do I restart the service?
Answer those five points, each with concrete file paths.</pre>
<p>Point 5 matters most — without it you cannot verify a single change you make.</p>
</div></details>
<details class="lp-fold"><summary>🔍 Clootee's structure (a teaching example in itself)</summary><div class="lp-fold-body">
<table>
<tr><th>Directory</th><th>Responsibility</th><th>Analogy</th></tr>
<tr><td><code>logic_struct/</code></td><td>Orchestration: order of steps, validation</td><td>The flowchart</td></tr>
<tr><td><code>logic_realize/</code></td><td>Implementation: reading files, making requests</td><td>The manual</td></tr>
<tr><td><code>helper/</code></td><td>Business-agnostic utilities</td><td>The toolbox</td></tr>
<tr><td><code>server/</code></td><td>Routes: receive and forward only</td><td>The front desk</td></tr>
<tr><td><code>frontend/</code></td><td>Static — refresh the browser, no build</td><td>The storefront</td></tr>
</table>
<p>Why split this way: <b>the skeleton reads in one pass, and changing details cannot damage the architecture.</b> Follow it when you add things — <b>writing the way the project already writes is a newcomer's most important virtue.</b></p>
</div></details>`,
      },
    },
    {
      h: { zh: '第二步：选一个小到能做完的功能', en: 'Step two: pick something small enough to finish' },
      fig: 'add-only',
      body: {
        zh: `<div class="lp-oneline">目的是走通全流程，不是做大。横跨前后端、一天能做完，最合适。</div>
<p>几个合适的选题：<b>工作目录磁盘占用统计</b>、<b>会话导出成 Markdown</b>、<b>常用指令收藏夹</b>、<b>把当前项目的 CLAUDE.md 显示在侧栏</b>。</p>
<details class="lp-fold"><summary>📝 需求要写到这个程度</summary><div class="lp-fold-body">
<pre>【功能】工作目录磁盘占用统计
【后端】新增接口 GET /api/root/disk-usage?rootId=xxx
  返回：该目录下每个直接子文件夹的名称、文件数、总字节数，以及总计。
  只统计直接子目录，不递归到每一层（避免超大目录卡死）。
  按项目分层：logic_struct 放调度与参数校验，logic_realize 放真正的文件遍历。
【前端】在根目录信息区加一个「📊 占用」按钮，点击弹出面板显示上述数据，
  按占用从大到小排序，大小显示成 KB/MB/GB。文案必须走 trans.js，中英文都要有。
【约束】
  - 不修改任何现有文件的既有逻辑，只做新增；
  - 遍历失败（无权限等）的目录不要让整个接口报错，跳过并在返回里标注；
  - 完成后告诉我跑什么命令编译、要不要重启。</pre>
</div></details>
<details class="lp-fold"><summary>🍊 「只做新增」是新手的护身符</summary><div class="lp-fold-body">
<p>新增文件出错了，<b>删掉就行</b>；改坏了别人的代码，可能整个软件都起不来。</p>
<p>像在别人家里帮忙：加一把新椅子随时能搬走，把承重墙敲了就麻烦了。</p>
</div></details>`,
        en: `<div class="lp-oneline">The goal is completing the loop, not size. Something spanning frontend and backend that fits in a day.</div>
<p>Good candidates: <b>workspace disk usage</b>, <b>export a session to Markdown</b>, <b>prompt favourites</b>, <b>show the project's CLAUDE.md in the sidebar</b>.</p>
<details class="lp-fold"><summary>📝 Write the requirement to this level</summary><div class="lp-fold-body">
<pre>[Feature] Workspace disk usage
[Backend] New endpoint GET /api/root/disk-usage?rootId=xxx
  Returns: for each immediate subfolder — name, file count, total bytes — plus a total.
  Immediate subdirectories only; no full recursion (huge trees would hang).
  Follow the layering: logic_struct for orchestration and validation, logic_realize for the walk.
[Frontend] Add a "📊 usage" button in the workspace info area opening a panel with that data,
  sorted largest first, sizes as KB/MB/GB. All copy through trans.js, both languages.
[Constraints]
  - Add only; do not change the existing logic of any existing file;
  - A directory that fails to read must not fail the whole endpoint — skip and flag it;
  - When done, tell me which command compiles it and whether a restart is needed.</pre>
</div></details>
<details class="lp-fold"><summary>🍊 "Add only" is a newcomer's amulet</summary><div class="lp-fold-body">
<p>A broken new file can just be <b>deleted</b>. Broken existing code can stop the whole application from starting.</p>
<p>Like helping out in someone else's house: an extra chair can be carried out again; knocking through a load-bearing wall cannot.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '第三步：改完必做的四件事', en: 'Step three: four things to do after every change' },
      fig: 'build-restart',
      body: {
        zh: `<div class="lp-oneline">类型检查 → 编译 → 重启 → 自己点一遍。缺一步都不算做完。</div>
<ol>
<li><b>类型检查</b>（本项目 <code>npm run typecheck</code>）。通不过就别往下走。</li>
<li><b>编译</b>（<code>npm run build</code>）。不编译 = 白改。</li>
<li><b>重启</b>后端（<code>restart.bat</code> / <code>restart.sh</code>）。前端只需<b>强制刷新</b> Ctrl+F5 绕开缓存。</li>
<li><b>真的点一遍</b>，还要试异常：空目录、没选工作目录、超大目录。</li>
</ol>
<details class="lp-fold"><summary>📝 把这四步写进指令，让它自己汇报</summary><div class="lp-fold-body">
<pre>每次改完代码，请依次执行并把结果贴给我：
1) 类型检查；2) 编译；3) 告诉我需要重启哪个服务、用什么命令。
如果类型检查或编译报错，先把错误原文贴给我，不要自行改动其他文件来「绕过」它。</pre>
</div></details>
<details class="lp-fold"><summary>⚠️ 最危险的一句话</summary><div class="lp-fold-body">
<p>「报错了，我把那段类型检查关掉 / 把断言注释掉就好了。」</p>
<p><b>绝对不行。</b>报错是在告诉你哪里不对，关掉它等于<b>把家里的火警拆了</b>——烟还在，只是不响了。</p>
<p>让它把错误原文给你，一起看是什么问题。</p>
</div></details>`,
        en: `<div class="lp-oneline">Type-check → build → restart → click it yourself. Skip one and it is not done.</div>
<ol>
<li><b>Type check</b> (<code>npm run typecheck</code> here). If it fails, stop.</li>
<li><b>Build</b> (<code>npm run build</code>). No build = no change.</li>
<li><b>Restart</b> the backend (<code>restart.bat</code> / <code>restart.sh</code>). The frontend just needs a <b>hard refresh</b>, Ctrl+F5, to dodge the cache.</li>
<li><b>Actually click it</b>, and try the edge cases: empty directory, no workspace selected, a huge directory.</li>
</ol>
<details class="lp-fold"><summary>📝 Put all four in the instruction so it self-reports</summary><div class="lp-fold-body">
<pre>After every code change, run these in order and paste the results:
1) type check; 2) build; 3) tell me which service to restart and with which command.
If the type check or build fails, paste the raw error first — do not edit other files to work around it.</pre>
</div></details>
<details class="lp-fold"><summary>⚠️ The most dangerous sentence</summary><div class="lp-fold-body">
<p>"It errored, so I disabled that check / commented out the assertion."</p>
<p><b>Never.</b> The error is telling you something is wrong; silencing it is <b>removing the smoke alarm</b> — the smoke is still there, it just stopped beeping.</p>
<p>Get the raw error and look at it together.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '第四步：改坏了怎么退回去', en: 'Step four: how to back out when you break it' },
      fig: 'rollback',
      body: {
        zh: `<div class="lp-oneline">你一定会改坏一次，这很正常。区别只在于有没有退路。</div>
<ol>
<li><b>让它自己回退</b>：「刚才那次改动导致服务起不来了，请把你改的文件恢复到改动前，我们重新想办法。」</li>
<li><b>用 git 回到上一个快照</b>——这就是开头那次提交的价值。</li>
<li><b>删掉新增文件</b>——如果你严格遵守了「只做新增」，删掉新文件 + 撤销路由注册就回到原点。</li>
</ol>
<details class="lp-fold"><summary>📝 排查问题的正确姿势</summary><div class="lp-fold-body">
<pre>重启后服务起不来。我做了什么：改了 A 文件，新增了 B、C 文件。
控制台报错原文如下（完整贴上，不要截断）：
...
请先告诉我这个报错是什么意思、最可能是哪一处引起的，再给出修复方案。
不要直接大改，先让我知道原因。</pre>
<p>最后那句很关键：<b>没找到原因的修复，通常只是把问题挪了个地方。</b></p>
</div></details>
<details class="lp-fold"><summary>⚠️ 报错一定要整段贴</summary><div class="lp-fold-body">
<p>新手最爱只贴最后一行「Error」。<b>真正有用的信息往往在上面几行</b>：哪个文件、第几行、什么类型的错。</p>
<p>全贴，一个字都别删。</p>
</div></details>`,
        en: `<div class="lp-oneline">You will break it at least once. The only thing that matters is having a way back.</div>
<ol>
<li><b>Have it revert</b>: "That last change stopped the service from starting. Restore the files you changed and let us rethink."</li>
<li><b>Git back to the last snapshot</b> — this is what that first commit bought you.</li>
<li><b>Delete the new files</b> — if you truly only added things, deleting them and undoing the route registration returns you to the start.</li>
</ol>
<details class="lp-fold"><summary>📝 How to ask for help</summary><div class="lp-fold-body">
<pre>The service will not start after restart. What I did: changed file A, added files B and C.
Full console error below (complete, not truncated):
...
First tell me what this error means and which change most likely caused it, then propose a fix.
Do not make sweeping changes — I want the cause first.</pre>
<p>That last line matters: <b>a fix without a diagnosis usually just relocates the problem.</b></p>
</div></details>
<details class="lp-fold"><summary>⚠️ Always paste the whole error</summary><div class="lp-fold-body">
<p>Beginners paste only the last "Error" line. <b>The useful information is usually a few lines above</b>: which file, which line, which kind of error.</p>
<p>Paste all of it, unedited.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '最后一步：把经验沉淀下来', en: 'Last step: turn the experience into an asset' },
      fig: 'consolidate',
      body: {
        zh: `<div class="lp-oneline">这一步区分了「做了一次」和「学会了」。</div>
<pre>功能已经验证通过。请帮我做三件事：
1. 更新项目的 CLAUDE.md，补上这次总结出来的规矩
   （例如：新增接口必须在 logic_struct 和 logic_realize 分层；前端文案必须走 trans.js）；
2. 写一份 docs/新增功能流程.md，记录从需求到验证的完整步骤和踩过的坑；
3. 用一句话总结这次改动作为提交信息，然后提交。</pre>
<details class="lp-fold"><summary>🎓 整门课，一句话回顾</summary><div class="lp-fold-body">
<p><b>说清楚</b>（目标+范围+产出+约束）<br>
→ <b>先计划</b>（确认理解再动手）<br>
→ <b>小步改</b>（一次一件事，随时能退）<br>
→ <b>自己验收</b>（对总数、抽样、跑检查）<br>
→ <b>沉淀</b>（脚本、模板、CLAUDE.md）</p>
<p>换任何 AI 工具、任何模型、任何岗位，这五步都成立。你学的不是「某个软件怎么用」，是一套工作方法。</p>
</div></details>`,
        en: `<div class="lp-oneline">This is what separates "did it once" from "learned it".</div>
<pre>The feature is verified. Please do three things:
1. Update the project's CLAUDE.md with the rules this surfaced
   (e.g. new endpoints split across logic_struct and logic_realize; frontend copy through trans.js);
2. Write docs/adding-a-feature.md recording the full path from requirement to verification, traps included;
3. Summarise the change in one line as a commit message, then commit.</pre>
<details class="lp-fold"><summary>🎓 The whole course in one line</summary><div class="lp-fold-body">
<p><b>Be explicit</b> (goal + scope + output + constraints)<br>
→ <b>plan first</b> (confirm understanding before acting)<br>
→ <b>small steps</b> (one change at a time, always reversible)<br>
→ <b>verify yourself</b> (totals, spot-checks, automated checks)<br>
→ <b>consolidate</b> (scripts, templates, CLAUDE.md)</p>
<p>Every one of those survives a change of tool, model or job. You did not learn "how to use one piece of software" — you learned a way of working.</p>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: 'TypeScript', en: 'TypeScript' }, d: { zh: 'JavaScript 加上类型；能在写代码阶段就拦下大量错误', en: 'JavaScript plus types; catches a large class of errors while writing' } },
    { k: { zh: '类型检查 / typecheck', en: 'Type check' }, d: { zh: '不运行程序、只检查类型是否自洽的一道质检', en: 'A check of type consistency without running the program' } },
    { k: { zh: '编译 / build', en: 'Build' }, d: { zh: '把 TypeScript 转成能运行的 JavaScript，不编译改动不生效', en: 'Turning TypeScript into runnable JavaScript; without it, changes do nothing' } },
    { k: { zh: '接口 / API 路由', en: 'API route' }, d: { zh: '前端向后端要数据的一个固定地址，如 /api/root/list', en: 'A fixed address the frontend calls for data, e.g. /api/root/list' } },
    { k: { zh: '分层：调度 / 实现', en: 'Layering: orchestration / implementation' }, d: { zh: '调度层写"先做什么后做什么"，实现层写"具体怎么做"', en: 'Orchestration says what happens in what order; implementation says how' } },
    { k: { zh: '只做新增', en: 'Add-only' }, d: { zh: '改陌生项目时的护身符：不动既有逻辑，出错可直接删除', en: 'The newcomer\'s amulet: touch no existing logic so mistakes are deletable' } },
    { k: { zh: '强制刷新', en: 'Hard refresh' }, d: { zh: 'Ctrl+F5，绕过浏览器缓存加载最新前端文件', en: 'Ctrl+F5 — bypass the browser cache to load the latest frontend files' } },
    { k: { zh: '报错原文', en: 'Raw error text' }, d: { zh: '排查问题时必须完整提供的错误信息，不要只贴最后一行', en: 'The complete error text needed for diagnosis — never just the last line' } },
  ],

  quiz: [
    { t: 'single', fig: 'ts-shield',
      q: { zh: 'TypeScript 和 JavaScript 的关系是：', en: 'The relationship between TypeScript and JavaScript:' },
      o: [
        { zh: '两种完全无关的语言', en: 'Two unrelated languages' },
        { zh: 'TypeScript 是 JavaScript 加上「类型」，需要编译成 JS 才能运行', en: 'TypeScript is JavaScript plus types, compiled to JS before it runs' },
        { zh: 'TypeScript 只能写后端', en: 'TypeScript is backend-only' },
        { zh: 'JavaScript 已被淘汰', en: 'JavaScript is obsolete' },
      ], a: 1,
      e: { zh: '「加类型」和「必须编译」是两个关键点，后者最容易忘。', en: '"Adds types" and "must be compiled" — the second is the one people forget.' } },

    { t: 'multi', fig: 'ts-shield',
      q: { zh: '类型（Type）给你带来的实际好处有哪些？（多选）', en: 'What do types actually buy you? (multiple)' },
      o: [
        { zh: 'AI 写代码时出错率更低，编译器当场拦下一类错误', en: 'The AI errs less because the compiler catches a class of mistakes immediately' },
        { zh: '你多了一道不用看懂代码的验收关卡（类型检查）', en: 'You gain a verification gate that needs no code reading (the type check)' },
        { zh: '改了一个函数，所有用到它的地方会被标出来', en: 'Changing a function highlights every place that calls it' },
        { zh: '程序运行速度提升 10 倍', en: 'The program runs ten times faster' },
      ], a: [0, 1, 2],
      e: { zh: '类型是开发期的保障，不影响运行速度。', en: 'Types are a development-time safeguard; they do not affect runtime speed.' } },

    { t: 'single', fig: 'read-first',
      q: { zh: '改一个陌生项目，第一步应该是：', en: 'The first step when changing an unfamiliar project:' },
      o: [
        { zh: '直接让 AI 开始写功能', en: 'Have the AI start writing the feature' },
        { zh: '先让 AI 带你读懂项目结构、路由方式、约定文件和编译重启方式', en: 'Have the AI walk you through the structure, routing, conventions and build/restart flow' },
        { zh: '先把所有文件备份到 U 盘', en: 'Back everything up to a USB stick' },
        { zh: '先重写一遍代码风格', en: 'Rewrite the code style first' },
      ], a: 1,
      e: { zh: '不读就改，等于闭着眼睛动手术。', en: 'Changing without reading is operating blindfolded.' } },

    { t: 'multi', fig: 'layers',
      q: { zh: '在 Clootee 的分层结构里，各目录的职责是：（多选正确项）', en: "In Clootee's layering, which responsibilities are correct? (multiple)" },
      o: [
        { zh: 'logic_struct 负责调度：先做什么、后做什么、参数校验', en: 'logic_struct: orchestration — order of steps and validation' },
        { zh: 'logic_realize 负责实现：具体怎么读文件、怎么发请求', en: 'logic_realize: implementation — actually reading files and making requests' },
        { zh: 'server 只负责接请求转发，不写业务逻辑', en: 'server: receives and forwards requests only, no business logic' },
        { zh: 'helper 存放所有业务规则', en: 'helper: holds all the business rules' },
      ], a: [0, 1, 2],
      e: { zh: 'helper 是与业务无关的纯工具（发 HTTP、算哈希等）。', en: 'helper holds business-agnostic utilities (HTTP, hashing, etc.).' } },

    { t: 'single', fig: 'add-only',
      q: { zh: '「只做新增，不改既有逻辑」这条约束的价值是：', en: 'The value of "add only, do not change existing logic":' },
      o: [
        { zh: '代码量更少', en: 'Less code' },
        { zh: '新增文件出错了删掉就行；改坏既有代码可能让整个软件起不来', en: 'A broken new file can be deleted; broken existing code can stop the whole app' },
        { zh: '编译更快', en: 'Faster compilation' },
        { zh: '不需要测试', en: 'No testing needed' },
      ], a: 1,
      e: { zh: '这是新手改真实项目最重要的护身符。', en: "A newcomer's most important amulet on a real project." } },

    { t: 'single', fig: 'build-restart',
      q: { zh: '你改了后端 TypeScript 代码，重启后发现毫无变化，最可能的原因是：', en: 'You edited backend TypeScript, restarted, and nothing changed. Most likely:' },
      o: [
        { zh: '浏览器缓存', en: 'Browser cache' },
        { zh: '忘了编译（build）——TS 必须编译成 JS 才生效', en: 'You forgot to build — TS must be compiled to JS to take effect' },
        { zh: '模型不够聪明', en: 'The model is not smart enough' },
        { zh: '需要重装系统', en: 'You need to reinstall the OS' },
      ], a: 1,
      e: { zh: '这是本章最常见的坑：改了后端不编译 = 白改。', en: "This chapter's classic trap: editing the backend without building changes nothing." } },

    { t: 'single', fig: 'hard-refresh',
      q: { zh: '你改了前端文件，刷新页面却还是旧的，第一个该试的是：', en: 'You changed a frontend file but the page still shows the old version. First try:' },
      o: [
        { zh: '重装浏览器', en: 'Reinstall the browser' },
        { zh: '强制刷新（Ctrl+F5）绕开缓存', en: 'Hard refresh (Ctrl+F5) to bypass the cache' },
        { zh: '重启电脑', en: 'Reboot the computer' },
        { zh: '重新编译后端', en: 'Rebuild the backend' },
      ], a: 1,
      e: { zh: '前端是静态文件，问题通常出在缓存而不是编译。', en: 'The frontend is static; the issue is caching, not compilation.' } },

    { t: 'multi', fig: 'build-restart',
      q: { zh: '改完代码后必做的检查包括：（多选）', en: 'Mandatory checks after a code change: (multiple)' },
      o: [
        { zh: '跑类型检查', en: 'Run the type check' },
        { zh: '编译（build）', en: 'Build' },
        { zh: '重启后端服务', en: 'Restart the backend service' },
        { zh: '在界面上真的点一遍，并试异常情况', en: 'Actually click it in the UI and try edge cases' },
      ], a: [0, 1, 2, 3],
      e: { zh: '四步缺一不可，最后一步最容易被"它说做好了"糊弄过去。', en: 'All four. The last is the one "it said it was done" most easily replaces.' } },

    { t: 'judge', fig: 'ts-shield',
      q: { zh: '类型检查报错时，让 AI 把那处检查关掉或注释掉，是一种可以接受的临时办法。', en: 'When the type check fails, having the AI disable or comment out that check is an acceptable stopgap.' },
      a: false,
      e: { zh: '报错是在告诉你哪里不对，关掉它等于把火警拆了。要看错误原文找原因。', en: 'The error is telling you something is wrong; silencing it removes the fire alarm. Read the raw error.' } },

    { t: 'single', fig: 'git-snapshots',
      q: { zh: '动手改真实项目之前，唯一的强制动作是：', en: 'The one mandatory action before changing a real project:' },
      o: [
        { zh: '先做一次 git 提交（存档）', en: 'Make a git commit (snapshot) first' },
        { zh: '通知全部门', en: 'Notify the whole department' },
        { zh: '把项目复制 10 份', en: 'Make ten copies of the project' },
        { zh: '先学会 TypeScript', en: 'Learn TypeScript first' },
      ], a: 0,
      e: { zh: '有存档，改坏了最多损失这一次改动。', en: 'With a snapshot, a bad change costs only that change.' } },

    { t: 'single', fig: 'full-error',
      q: { zh: '服务起不来时，向 AI 求助最该提供的是：', en: 'When the service will not start, the most important thing to provide is:' },
      o: [
        { zh: '「起不来了，快修」', en: '"It is broken, fix it"' },
        { zh: '你做了哪些改动 + 完整的报错原文（不截断）', en: 'What you changed plus the complete, untruncated error text' },
        { zh: '你的电脑配置', en: 'Your computer specs' },
        { zh: '一张截图就够了', en: 'A screenshot is enough' },
      ], a: 1,
      e: { zh: '真正有用的信息常在报错的上面几行：哪个文件、第几行、什么类型的错。', en: 'The useful information is usually a few lines above the last one: file, line, error kind.' } },

    { t: 'single', fig: 'mvp-grow',
      q: { zh: '毕业设计选题的正确标准是：', en: 'The right criterion for choosing a capstone feature:' },
      o: [
        { zh: '越大越好，能体现水平', en: 'The bigger the better, to show off' },
        { zh: '横跨前后端但一天能做完——目的是走通全流程', en: 'Spans frontend and backend but fits in a day — the goal is completing the loop' },
        { zh: '只改前端最安全', en: 'Frontend-only is safest' },
        { zh: '照抄别人做过的', en: 'Copy what someone else did' },
      ], a: 1,
      e: { zh: '完整走一遍流程的价值，远大于做一个大而未完成的功能。', en: 'Completing the loop once is worth far more than a big unfinished feature.' } },

    { t: 'multi', fig: 'prompt-4parts',
      q: { zh: '一份合格的功能需求应该写清楚哪些内容？（多选）', en: 'A solid feature requirement specifies: (multiple)' },
      o: [
        { zh: '后端接口的地址、参数和返回内容', en: 'The endpoint path, parameters and response shape' },
        { zh: '前端加在哪里、点击后是什么效果、文案怎么国际化', en: 'Where the UI goes, what clicking does, how copy is internationalised' },
        { zh: '边界情况怎么处理（无权限、空目录、超大目录）', en: 'How edge cases are handled (permissions, empty, huge directories)' },
        { zh: '代码必须写多少行', en: 'How many lines of code it must be' },
      ], a: [0, 1, 2],
      e: { zh: '行数不是需求，是结果。', en: 'Line count is an outcome, not a requirement.' } },

    { t: 'single', fig: 'rulebook',
      q: { zh: '「前端文案必须走 trans.js，中英文都要有」这条要求属于：', en: '"All frontend copy must go through trans.js in both languages" is:' },
      o: [
        { zh: '性能要求', en: 'A performance requirement' },
        { zh: '项目既有约定，新增功能必须遵守', en: 'An existing project convention new code must follow' },
        { zh: '可选的建议', en: 'An optional suggestion' },
        { zh: '安全要求', en: 'A security requirement' },
      ], a: 1,
      e: { zh: '照着项目已有的写法写，是新人最重要的美德。', en: "Writing the way the project already writes is a newcomer's most important virtue." } },

    { t: 'judge', fig: 'edge-cases',
      q: { zh: '统计目录占用时，「只统计直接子目录、不递归展开每一层」是一种合理的取舍。', en: 'For disk usage, "only immediate subdirectories, no full recursion" is a reasonable trade-off.' },
      a: true,
      e: { zh: '超大目录全量递归会让接口卡死。先做能用的版本，需要再深入。', en: 'Full recursion on a huge tree hangs the endpoint. Ship the usable version first.' } },

    { t: 'single', fig: 'issues-funnel',
      q: { zh: '「遍历失败的目录不要让整个接口报错，跳过并在返回里标注」，这体现的原则是：', en: '"A directory that fails to read must not fail the whole endpoint — skip and flag it" reflects:' },
      o: [
        { zh: '性能优先', en: 'Performance first' },
        { zh: '局部失败不应导致整体失败，且失败必须可见不能静默', en: 'A local failure should not fail the whole, and failures must be visible, never silent' },
        { zh: '代码越少越好', en: 'Less code is better' },
        { zh: '用户体验优先于正确性', en: 'UX over correctness' },
      ], a: 1,
      e: { zh: '「不静默失败」是这门课反复强调的原则，从第 2 章的问题清单到这里一脉相承。', en: '"Never fail silently" runs through the whole course, from Chapter 2\'s issues list to here.' } },

    { t: 'single', fig: 'consolidate',
      q: { zh: '功能做完并验证通过之后，最后一步应该做什么？', en: 'After the feature works and is verified, the last step is:' },
      o: [
        { zh: '直接开始下一个功能', en: 'Start the next feature' },
        { zh: '把经验沉淀：更新 CLAUDE.md、写流程文档、提交存档', en: 'Consolidate: update CLAUDE.md, write the process doc, commit' },
        { zh: '删掉调试代码就够了', en: 'Just delete the debug code' },
        { zh: '通知同事庆祝', en: 'Tell everyone and celebrate' },
      ], a: 1,
      e: { zh: '这一步区分了「做了一次」和「学会了」。', en: 'This is what separates "did it once" from "learned it".' } },

    { t: 'single', fig: 'ts-shield',
      q: { zh: '「让它跑一次类型检查」对不懂代码的你来说，价值在于：', en: 'For someone who cannot read code, running a type check is valuable because:' },
      o: [
        { zh: '能看懂代码', en: 'It lets you read the code' },
        { zh: '这是一道不需要看懂代码就能用的免费质检——通不过就说明有问题', en: 'It is free quality control requiring no code reading: a failure means something is wrong' },
        { zh: '能提高运行速度', en: 'It speeds up execution' },
        { zh: '能自动修复 bug', en: 'It auto-fixes bugs' },
      ], a: 1,
      e: { zh: '自动化检查是外行验收代码最可靠的抓手。', en: 'Automated checks are a non-coder\'s most reliable way to verify code.' } },

    { t: 'multi', fig: 'rollback',
      q: { zh: '改坏了之后可用的退路有哪些？（多选）', en: 'Which are valid ways back after breaking something? (multiple)' },
      o: [
        { zh: '让 AI 把刚才改的文件恢复到改动前的状态', en: 'Have the AI restore the files it just changed' },
        { zh: '用 git 回到上一个提交', en: 'Use git to return to the previous commit' },
        { zh: '如果严格只做新增，删掉新文件并撤销路由注册', en: 'If you only added things, delete the new files and undo the route registration' },
        { zh: '重装 Clootee，反正数据都在云端', en: 'Reinstall Clootee — the data is in the cloud anyway' },
      ], a: [0, 1, 2],
      e: { zh: 'Clootee 的数据在本地 data/ 目录，不在云端；重装不是退路。', en: "Clootee's data lives in the local data/ folder, not the cloud; reinstalling is not a way back." } },

    { t: 'single', fig: 'full-error',
      q: { zh: '「不要直接大改，先让我知道原因」这句话防止的是：', en: '"Do not make sweeping changes — tell me the cause first" prevents:' },
      o: [
        { zh: 'AI 写代码太慢', en: 'The AI writing too slowly' },
        { zh: 'AI 在没搞清病因的情况下大范围改动，把问题掩盖或扩散', en: 'The AI changing a lot without knowing the cause, hiding or spreading the problem' },
        { zh: '代码文件太大', en: 'Large code files' },
        { zh: '编译时间过长', en: 'Long build times' },
      ], a: 1,
      e: { zh: '没找到原因的修复，通常只是把问题挪了个地方。', en: 'A fix without a diagnosis usually just relocates the problem.' } },

    { t: 'judge', fig: 'hard-refresh',
      q: { zh: '前端是静态文件，改完不需要编译，刷新浏览器即可生效。', en: 'The frontend is static: no build needed, a browser refresh suffices.' },
      a: true,
      e: { zh: '但要注意强制刷新绕开缓存。后端则必须编译 + 重启。', en: 'Just remember the hard refresh. The backend still needs build plus restart.' } },

    { t: 'single', fig: 'layers',
      q: { zh: '为什么 Clootee 要把「调度」和「实现」分开写？', en: 'Why does Clootee separate orchestration from implementation?' },
      o: [
        { zh: '为了让代码看起来更多', en: 'To make the codebase look bigger' },
        { zh: '让调度骨架一眼读完，改实现细节时不会误伤整体架构', en: 'So the skeleton reads in one pass and changing details cannot damage the architecture' },
        { zh: '为了兼容旧版本', en: 'For backward compatibility' },
        { zh: '这是 TypeScript 的强制要求', en: 'TypeScript requires it' },
      ], a: 1,
      e: { zh: '「做什么」和「怎么做」分离，是这套结构的核心思想。', en: 'Separating what from how is the core idea of the structure.' } },

    { t: 'single', fig: 'graduation',
      q: { zh: '整门课的方法论浓缩成五步，正确的是：', en: 'The course method in five steps:' },
      o: [
        { zh: '提问 → 等待 → 复制 → 粘贴 → 提交', en: 'Ask → wait → copy → paste → submit' },
        { zh: '说清楚 → 先计划 → 小步改 → 自己验收 → 沉淀成可复用资产', en: 'Be explicit → plan first → small steps → verify yourself → consolidate into reusable assets' },
        { zh: '换模型 → 换提示词 → 换工具 → 换电脑 → 放弃', en: 'Switch model → switch prompt → switch tool → switch machine → give up' },
        { zh: '写代码 → 编译 → 重启 → 上线 → 庆祝', en: 'Code → build → restart → deploy → celebrate' },
      ], a: 1,
      e: { zh: '这五步与工具无关，换任何 AI、任何岗位都成立。', en: 'These five are tool-independent — they hold for any AI and any role.' } },

    { t: 'single', fig: 'layers',
      q: { zh: '你想加的功能需要读取当前工作目录的 CLAUDE.md 展示出来。按项目分层，读文件这件事应该写在：', en: 'Your feature must read the workspace CLAUDE.md and display it. Under the project layering, the file reading belongs in:' },
      o: [
        { zh: 'server（路由层）', en: 'server (routing)' },
        { zh: 'logic_realize（实现层）', en: 'logic_realize (implementation)' },
        { zh: 'frontend', en: 'frontend' },
        { zh: 'logic_struct（调度层）', en: 'logic_struct (orchestration)' },
      ], a: 1,
      e: { zh: '真正的 IO（读文件、发请求）属于实现层；调度层只负责流程与校验。', en: 'Real IO (file reads, requests) belongs to implementation; orchestration only sequences and validates.' } },

    { t: 'multi', fig: 'edge-cases',
      q: { zh: '下面哪些属于该在需求里写明的「边界情况」？（多选）', en: 'Which edge cases belong in the requirement? (multiple)' },
      o: [
        { zh: '还没有选择工作目录时点这个按钮会怎样', en: 'What happens if the button is clicked with no workspace selected' },
        { zh: '目录是空的时候显示什么', en: 'What is shown when the directory is empty' },
        { zh: '目录特别大时会不会卡死', en: 'Whether a huge directory hangs it' },
        { zh: '按钮用什么字体', en: 'Which font the button uses' },
      ], a: [0, 1, 2],
      e: { zh: '边界情况决定这个功能会不会在真实使用中翻车。', en: 'Edge cases decide whether the feature survives real use.' } },

    { t: 'judge', fig: 'edge-cases',
      q: { zh: '「AI 说功能已经完成」可以直接作为验收通过的依据。', en: '"The AI says the feature is complete" is sufficient grounds for acceptance.' },
      a: false,
      e: { zh: '必须自己打开界面点一遍，还要试异常情况。这是全课反复强调的。', en: 'You must open the UI, click it, and try the edge cases. The course repeats this for a reason.' } },

    { t: 'single', fig: 'layers',
      q: { zh: '新增一个后端接口，按 Clootee 的约定，路由注册应该写在：', en: 'Registering a new backend route in Clootee belongs in:' },
      o: [
        { zh: 'frontend/app.js', en: 'frontend/app.js' },
        { zh: 'backend/src/server/ 下的路由文件，且只做接收与转发', en: 'The route file under backend/src/server/, doing only receive-and-forward' },
        { zh: 'helper 目录', en: 'The helper directory' },
        { zh: '随便哪个文件都行', en: 'Any file works' },
      ], a: 1,
      e: { zh: '路由层只接请求转发，业务逻辑一律下沉。', en: 'The route layer only receives and forwards; business logic sinks down.' } },

    { t: 'single', fig: 'consolidate',
      q: { zh: '把这次改动的经验写进 CLAUDE.md，最大的收益是：', en: 'Writing this experience into CLAUDE.md mainly gives you:' },
      o: [
        { zh: '文件变多显得项目正规', en: 'More files, looks professional' },
        { zh: '下次（以及下一个人）不用重新踩同样的坑，AI 也会自动遵守', en: 'Next time — and the next person — avoids the same traps, and the AI follows it automatically' },
        { zh: '能加快编译', en: 'Faster builds' },
        { zh: '能减少 token', en: 'Fewer tokens' },
      ], a: 1,
      e: { zh: '这就是第 6 章的核心思想在真实项目上的落地。', en: "This is Chapter 6's core idea landing on a real project." } },

    { t: 'practice', fig: 'read-first',
      q: { zh: '实操（毕业设计上半场）：读懂项目 + 写出一份合格的功能需求。', en: 'Hands-on (capstone, part 1): understand the project and write a solid requirement.' },
      task: {
        zh: `<p>把 Clootee 的项目文件夹添加为工作目录，然后：</p>
<ol>
<li><b>动手前先 git 提交一次</b>（存档）。</li>
<li>发出「先不要改代码，请帮我读懂这个项目」的五点提问，拿到它对目录结构、路由方式、约定文件、编译重启方式的回答。</li>
<li>从课程给的选题里挑一个（或自选一个同等规模的），写出一份完整的功能需求：包含后端接口定义、前端交互、边界情况处理、以及「只做新增不改既有逻辑」的约束。</li>
</ol>
<p>把下面内容粘过来：AI 对项目结构的回答要点（重点是<b>编译与重启用什么命令</b>）、以及你写的完整需求。</p>`,
        en: `<p>Add the Clootee project folder as a workspace, then:</p>
<ol>
<li><b>Make a git commit first</b> (snapshot).</li>
<li>Send the five-point "do not change code yet, help me understand this project" question and collect its answers on structure, routing, conventions and the build/restart flow.</li>
<li>Pick one of the suggested features (or one of similar size) and write a complete requirement: backend endpoint definition, frontend interaction, edge-case handling, and the "add only, do not change existing logic" constraint.</li>
</ol>
<p>Paste below: the key points of its structural answer (especially <b>the build and restart commands</b>) and your full requirement.</p>`,
      },
      rubric: {
        zh: `1. 必须包含 AI 对项目结构的实际回答，且能看出编译命令与重启方式（例如 npm run build / restart 脚本）。缺失扣 30 分。
2. 学员写的需求必须包含四项：后端接口（地址+返回内容）、前端交互（加在哪、点了怎样）、边界情况、"只做新增"约束。每缺一项扣 15 分。
3. 需求若只有一句话（如"加个统计功能"），最高 40 分。
4. 必须提到动手前已做 git 提交（存档）。缺失扣 10 分。
5. 未真正执行、纯编造给 0 分。`,
        en: `1. The AI's actual structural answer must be included, showing the build command and restart method (e.g. npm run build / restart script). Deduct 30 if missing.
2. The learner's requirement must cover four things: backend endpoint (path + response), frontend interaction (where, what happens on click), edge cases, and the add-only constraint. Deduct 15 per missing item.
3. A one-line requirement ("add a stats feature") caps at 40.
4. A git commit before starting must be mentioned. Deduct 10 if missing.
5. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '需求写清楚的那一刻，功能其实已经做完一半了。', en: 'The moment the requirement is clear, half the feature is already built.' } },

    { t: 'practice', fig: 'build-restart',
      q: { zh: '实操（毕业设计下半场）：把功能真正做出来并验证。', en: 'Hands-on (capstone, part 2): actually ship the feature and verify it.' },
      task: {
        zh: `<p>基于上一题的需求，让 Claude Code 实现它，并走完完整流程：</p>
<ol>
<li>实现（后端 + 前端）；</li>
<li>跑<b>类型检查</b>和<b>编译</b>，把结果贴出来；如果报错，把错误原文交给 AI 分析后修复，<b>不允许通过关闭检查来"解决"</b>；</li>
<li>按它给的方式<b>重启服务</b>，前端<b>强制刷新</b>；</li>
<li><b>自己在界面上点一遍</b>，并试至少一个边界情况；</li>
<li>验证通过后，让它更新 CLAUDE.md 并提交存档。</li>
</ol>
<p>把下面内容粘过来：类型检查/编译的结果、重启用的命令、你在界面上实际看到的效果（描述或数据）、你试的边界情况及表现、以及最后的提交信息。</p>
<p><b>如果没做成也如实写</b>——写清楚卡在哪一步、报错是什么、你怎么退回去的。诚实的失败记录同样得分。</p>`,
        en: `<p>Have Claude Code implement the requirement from the previous task and complete the full loop:</p>
<ol>
<li>Implement it (backend + frontend);</li>
<li>Run the <b>type check</b> and <b>build</b>, pasting the results. On failure, give the AI the raw error and fix the cause — <b>disabling the check is not allowed</b>;</li>
<li><b>Restart the service</b> as instructed and <b>hard-refresh</b> the frontend;</li>
<li><b>Click it yourself</b> in the UI and try at least one edge case;</li>
<li>Once verified, have it update CLAUDE.md and commit.</li>
</ol>
<p>Paste below: type-check/build results, the restart command, what you actually saw in the UI (description or data), the edge case you tried and its behaviour, and the final commit message.</p>
<p><b>If it did not work, say so honestly</b> — where you got stuck, what the error was, how you backed out. An honest failure report scores too.</p>`,
      },
      rubric: {
        zh: `1. 必须包含类型检查与编译的实际结果（通过或具体报错），以及重启服务的命令。缺失各扣 20 分。
2. 必须包含学员在界面上的实际验证——看到了什么、数据是否合理。只说"做好了"扣 30 分。
3. 必须包含至少一个边界情况的测试及其表现（空目录、未选目录、超大目录等）。缺失扣 20 分。
4. 若学员如实报告"没做成"，但完整说明了卡在哪一步、报错原文、以及如何回退（git 回退或删除新增文件），按 80 分处理——诚实的失败记录同样体现了本章能力。
5. 如果出现"报错后把类型检查关掉/注释掉"这类做法，扣 40 分并在反馈中明确指出。
6. 未真正执行、纯编造给 0 分。`,
        en: `1. Actual type-check and build results (pass or the specific error) plus the restart command are required. Deduct 20 each if missing.
2. The learner's own UI verification is required — what they saw, whether the data made sense. Deduct 30 for "it works".
3. At least one edge case and its observed behaviour must be included (empty directory, no workspace, huge directory). Deduct 20 if missing.
4. If the learner honestly reports failure but fully documents where they got stuck, the raw error, and how they backed out (git revert or deleting new files), score 80 — an honest failure report still demonstrates this chapter's skills.
5. If they "solved" an error by disabling or commenting out the type check, deduct 40 and say so explicitly in the feedback.
6. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '走通一次完整流程，比做出多大的功能重要得多。', en: 'Completing the loop once matters far more than the size of the feature.' } },
  ],
});
