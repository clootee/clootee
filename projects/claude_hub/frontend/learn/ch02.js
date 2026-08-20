// 第 2 章：第一次派活 —— 在 Clootee 里跑通一个完整任务，学会把话说清楚
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch02',
  icon: '🗂',
  minutes: 15,
  title: { zh: '第一次派活：把乱成一团的文件夹收拾干净', en: 'Your first job: taming a folder that is a mess' },
  goal: {
    zh: '独立跑通一个完整任务：建工作目录 → 新建会话 → 写清指令 → 看懂过程 → 验收结果。并学会「四要素指令法」。',
    en: 'Run one complete job end to end: add a workspace, start a session, write a clear instruction, read the process, verify the result — using the four-part instruction recipe.',
  },
  praise: {
    zh: '<p>你已经会派活了 🎉 —— 而且是<b>按方法</b>派，不是碰运气。「目标 + 范围 + 产出 + 约束」这四件套，你以后每一条指令都会用到，包括第 8 章写代码的时候。</p><p>下一章上强度：<b>Excel 和 CSV</b>——办公室里最耗人、最容易出错、也最值得交出去的活。</p>',
    en: '<p>You can assign work now 🎉 — and by method, not luck. Goal + scope + output + constraints is the recipe behind every instruction you will write from here on, including the code chapters.</p><p>Next up, the real grind: <b>Excel and CSV</b> — the most tedious, most error-prone, most worth-delegating work in any office.</p>',
  },

  sections: [
    {
      h: { zh: '开工前的两步', en: 'Two steps before you start' },
      fig: 'session-lanes',
      body: {
        zh: `<div class="lp-oneline">① 加一个工作目录 ② 新建一个会话。一件事一个会话。</div>
<p>左上角「工作目录」旁边的 <code>+</code>，选一个文件夹。然后点「新会话」，起个能认出来的名字，比如「整理报销截图」。</p>
<details class="lp-fold"><summary>⚠️ 第一次请用副本练手</summary><div class="lp-fold-body">
<p>别直接拿你真实的桌面练。新建一个 <code>D:\\练习</code>，丢十几个文件进去。</p>
<p>原因：<b>指令有歧义时，它会按自己的理解动手。</b>用副本练，错了删掉重来，零成本。等你对它的脾气有感觉了，再上真数据。</p>
</div></details>`,
        en: `<div class="lp-oneline">① Add a workspace ② Start a session. One job, one session.</div>
<p>Click <code>+</code> next to "Workspace" and pick a folder. Then "New session", named so you recognise it later, e.g. "sort receipts".</p>
<details class="lp-fold"><summary>⚠️ Practise on a copy first</summary><div class="lp-fold-body">
<p>Do not point it at your real desktop. Make <code>D:\\practice</code> and drop a dozen files in.</p>
<p>Why: <b>when your instruction is ambiguous, it acts on its own interpretation.</b> On a copy, a mistake costs nothing. Move to real data once you know its habits.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '四要素指令法（本章重点）', en: 'The four-part recipe (the key idea)' },
      fig: 'prompt-4parts',
      body: {
        zh: `<div class="lp-oneline">目标 + 范围 + 产出 + 约束。四样齐了，它基本不会跑偏。</div>
<table>
<tr><th>要素</th><th>回答什么</th><th>不写会怎样</th></tr>
<tr><td><b>目标</b></td><td>你要什么结果</td><td>它做了个别的东西</td></tr>
<tr><td><b>范围</b></td><td>动哪些、不动哪些</td><td>它动了不该动的</td></tr>
<tr><td><b>产出</b></td><td>交付物长什么样、放哪</td><td>格式不对，你返工</td></tr>
<tr><td><b>约束</b></td><td>红线、意外怎么办</td><td>它自作主张</td></tr>
</table>
<details class="lp-fold"><summary>📝 一条写全的指令（照抄改改）</summary><div class="lp-fold-body">
<p>❌ 反面：「帮我整理一下文件。」——整理哪些？按什么整？整成什么样？它只能瞎猜。</p>
<p>✅ 正面：</p>
<pre>【目标】把这个文件夹里的图片按拍摄年月归类。
【范围】只处理当前目录下的 jpg 和 png，子文件夹不动。
【产出】建 2026-01 这样的子文件夹把图片移进去；
      根目录生成 清单.csv，三列：原文件名、新路径、拍摄日期。
【约束】不要删除任何文件；读不到拍摄日期的放进「未知日期」并在清单里标出来；
      先告诉我你打算怎么做，我确认后再动手。</pre>
</div></details>
<details class="lp-fold"><summary>🍊 为什么最后那句最值钱</summary><div class="lp-fold-body">
<p>「<b>先告诉我你打算怎么做，我确认后再动手</b>」= 新手保命符。</p>
<p>像装修前先看效果图：花 30 秒看一眼计划，就知道它理解对没有。理解错了还越干越快，那才叫灾难。</p>
</div></details>`,
        en: `<div class="lp-oneline">Goal + scope + output + constraints. With all four, it rarely goes off course.</div>
<table>
<tr><th>Part</th><th>Answers</th><th>If omitted</th></tr>
<tr><td><b>Goal</b></td><td>What result you want</td><td>It builds something else</td></tr>
<tr><td><b>Scope</b></td><td>What to touch, what not to</td><td>It touches the wrong files</td></tr>
<tr><td><b>Output</b></td><td>Shape of the deliverable, where</td><td>Wrong format, you redo it</td></tr>
<tr><td><b>Constraints</b></td><td>Red lines, edge cases</td><td>It improvises</td></tr>
</table>
<details class="lp-fold"><summary>📝 A complete instruction (copy and adapt)</summary><div class="lp-fold-body">
<p>❌ Bad: "Tidy up my files." — Which files? By what rule? Into what? It can only guess.</p>
<p>✅ Good:</p>
<pre>[Goal] Sort the images in this folder by the year-month they were taken.
[Scope] Only jpg and png directly in this folder; leave subfolders alone.
[Output] Create subfolders like 2026-01 and move images in;
        write index.csv at the root: original name, new path, date taken.
[Constraints] Delete nothing; unreadable dates go to "unknown-date" and are flagged in the index;
        tell me your plan first and wait for my OK.</pre>
</div></details>
<details class="lp-fold"><summary>🍊 Why that last line is worth the most</summary><div class="lp-fold-body">
<p>"<b>Tell me your plan first and wait for my OK</b>" is a beginner's safety net.</p>
<p>Like checking the blueprint before the builders arrive: 30 seconds tells you whether it understood. Misunderstanding plus speed is the real disaster.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '看懂它在干什么', en: 'Reading what it is doing' },
      fig: 'tools-log',
      body: {
        zh: `<div class="lp-oneline">过程分三层：思考、工具调用、输出。出问题先看「工具调用」。</div>
<ul>
<li><b>思考</b>——它的内心独白。看它就知道有没有理解对。</li>
<li><b>工具调用</b>——它<b>真正动手</b>的地方：读了哪个文件、写了什么、跑了什么命令。<b>它只在这里改你的电脑</b>，所以事故一定留痕在这。</li>
<li><b>输出</b>——最后那段汇报。</li>
</ul>
<p>再看一眼 <b>token 消耗</b>：简单任务烧掉几万 token，多半是它读了不该读的大文件，说明你范围没划清。</p>
<details class="lp-fold"><summary>🔍 任务队列：下班前排一串活</summary><div class="lp-fold-body">
<p>不用等它做完再说下一句。一个会话里连着丢几个任务，它会自动排队依次执行，中途可以暂停、插话、重排顺序。</p>
<p>适合下班前把活排好，第二天来看结果。</p>
</div></details>`,
        en: `<div class="lp-oneline">Three layers: thinking, tool calls, output. When something breaks, read the tool calls first.</div>
<ul>
<li><b>Thinking</b> — its inner monologue. Tells you whether it understood you.</li>
<li><b>Tool calls</b> — where it <b>actually acts</b>: files read, content written, commands run. <b>This is the only place it changes your machine</b>, so the evidence is always here.</li>
<li><b>Output</b> — the closing report.</li>
</ul>
<p>Also glance at <b>token usage</b>: tens of thousands on a trivial task usually means it read a big file it should not have — your scope was too loose.</p>
<details class="lp-fold"><summary>🔍 The task queue: line work up before you leave</summary><div class="lp-fold-body">
<p>You do not have to wait. Drop several tasks into one session and it runs them in order — pause, interject or reorder any time.</p>
<p>Ideal for queueing work at the end of the day and reading results in the morning.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '三个照抄就能用的场景', en: 'Three scenarios you can copy' },
      fig: 'files-sort',
      body: {
        zh: `<div class="lp-oneline">它们有三个共同点：先出计划、留下记录、说清不确定的怎么办。</div>
<details class="lp-fold"><summary>📝 场景一 · 下载文件夹清场</summary><div class="lp-fold-body">
<pre>把工作目录里的文件按类型分到 文档/图片/表格/安装包/其他 五个子文件夹，按扩展名判断。
不要删除任何文件，重名时在文件名后加 _1 _2。
做完在根目录写 整理报告.md：每个文件夹放了多少个文件、哪些你不确定该归哪类。</pre>
</div></details>
<details class="lp-fold"><summary>📝 场景二 · 给一堆合同建索引</summary><div class="lp-fold-body">
<pre>读取工作目录下所有 PDF 的文件名（不要打开 PDF 内容），
按「客户名_合同类型_日期」解析出三个字段，生成 合同索引.csv。
文件名不符合规律的，客户名填「待人工确认」，并单独列在文件末尾。</pre>
<p>注意那句「不要打开 PDF 内容」——只需要文件名的时候明确禁止读内容，又快又省。</p>
</div></details>
<details class="lp-fold"><summary>📝 场景三 · 批量改名（带后悔药）</summary><div class="lp-fold-body">
<pre>把工作目录下所有 jpg 改名为「产品图_序号3位.jpg」，序号按修改时间从早到晚。
先生成「旧名 → 新名」对照表 rename_plan.csv 给我看，我确认后再真正改名。
改名后保留对照表，方便回滚。</pre>
<p>先出对照表 = 提前发现理解错误；保留对照表 = 出事能还原。批量操作永远这么干。</p>
</div></details>`,
        en: `<div class="lp-oneline">All three share: plan first, leave a record, say what to do when unsure.</div>
<details class="lp-fold"><summary>📝 Scenario 1 · Clear out downloads</summary><div class="lp-fold-body">
<pre>Sort files in the workspace into five subfolders — docs / images / sheets / installers / other — by extension.
Delete nothing; on name clashes append _1, _2.
Then write report.md at the root: how many files per folder, and which ones you were unsure about.</pre>
</div></details>
<details class="lp-fold"><summary>📝 Scenario 2 · Index a pile of contracts</summary><div class="lp-fold-body">
<pre>Read only the FILENAMES of every PDF here (do not open their contents).
Parse three fields from the pattern "client_type_date" into contracts.csv.
Filenames that do not match get "needs review" as the client, listed again at the end.</pre>
<p>Note "do not open their contents" — when only names are needed, forbidding reads is faster and cheaper.</p>
</div></details>
<details class="lp-fold"><summary>📝 Scenario 3 · Bulk rename (with an undo)</summary><div class="lp-fold-body">
<pre>Rename every jpg to "product_NNN.jpg", numbered by modified time, oldest first.
First write rename_plan.csv mapping old to new and show me. Rename only after I confirm.
Keep the mapping afterwards so I can roll back.</pre>
<p>Mapping first = catch a misread rule early. Keeping it = you can undo. Always do this for bulk work.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '验收，以及怎么告诉它错了', en: 'Verifying, and how to tell it what went wrong' },
      fig: 'verify-count',
      body: {
        zh: `<div class="lp-oneline">别只看它说「已完成」。三个动作，一分钟。</div>
<ol>
<li><b>对总数。</b>原来 47 个文件，各子文件夹加起来还是 47 吗？少了就出事了。</li>
<li><b>抽样看。</b>随便点开 2～3 个，是不是真按规则放的。</li>
<li><b>看它承认的例外。</b>好指令会让它列出「不确定的部分」——那段往往才是真正需要你处理的。</li>
</ol>
<details class="lp-fold"><summary>📝 发现做错了，这样说</summary><div class="lp-fold-body">
<p>❌「你做错了，重做。」</p>
<p>✅ <b>现象 + 你的判断 + 期望</b>：</p>
<pre>你把 2026-01 里的三张图放错了，它们的拍摄日期是 2025-12。
问题应该出在你用了文件修改时间，而不是 EXIF 里的拍摄时间。
请改用 EXIF 拍摄时间重新判断，并更新 清单.csv。</pre>
<p>而且要<b>在同一个会话里说</b>——它还留着上下文，改起来更准。别新开会话从头讲。</p>
</div></details>`,
        en: `<div class="lp-oneline">Do not settle for "done". Three checks, one minute.</div>
<ol>
<li><b>Count.</b> There were 47 files; do the subfolders still total 47? Missing files mean trouble.</li>
<li><b>Spot-check.</b> Open two or three at random — was the rule really applied?</li>
<li><b>Read its exceptions.</b> A good instruction makes it list what it was unsure about — usually the part that actually needs you.</li>
</ol>
<details class="lp-fold"><summary>📝 When it got something wrong, say it like this</summary><div class="lp-fold-body">
<p>❌ "You got it wrong, do it again."</p>
<p>✅ <b>Symptom + your hypothesis + expectation</b>:</p>
<pre>Three images in 2026-01 are misplaced — they were taken in 2025-12.
I think you used file modified time instead of the EXIF capture date.
Redo the classification using EXIF capture time and update index.csv.</pre>
<p>And say it <b>in the same session</b> — it still holds the context, so the fix is more precise. Do not start over in a new session.</p>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: '四要素指令法', en: 'Four-part instruction recipe' }, d: { zh: '目标 + 范围 + 产出 + 约束，写指令的标准结构', en: 'Goal + scope + output + constraints — the standard shape of an instruction' } },
    { k: { zh: '工具调用', en: 'Tool call' }, d: { zh: 'AI 真正动手的记录：读写文件、执行命令，可展开看入参与结果', en: 'The record of the AI actually acting: file reads/writes and commands, expandable' } },
    { k: { zh: '任务队列', en: 'Task queue' }, d: { zh: '一个会话里排多个任务自动依次执行，可暂停、插话、重排', en: 'Multiple tasks queued in one session, run in order, pausable and reorderable' } },
    { k: { zh: '干跑 / 计划先行', en: 'Plan first' }, d: { zh: '先让 AI 输出计划或对照表，确认后再真正执行', en: 'Have the AI output a plan or mapping first; execute only after you approve' } },
    { k: { zh: '对照表 / 回滚', en: 'Mapping file / rollback' }, d: { zh: '保留「旧 → 新」记录，出错时能还原', en: 'Keep an old→new mapping so mistakes can be undone' } },
    { k: { zh: 'EXIF', en: 'EXIF' }, d: { zh: '照片文件里记录拍摄时间、相机型号等信息的元数据', en: 'Photo metadata holding capture time, camera model and so on' } },
  ],

  quiz: [
    { t: 'single', fig: 'prompt-4parts',
      q: { zh: '「四要素指令法」指的是哪四个？', en: 'What are the four parts of the instruction recipe?' },
      o: [
        { zh: '时间、地点、人物、事件', en: 'Time, place, people, event' },
        { zh: '目标、范围、产出、约束', en: 'Goal, scope, output, constraints' },
        { zh: '主语、谓语、宾语、定语', en: 'Subject, verb, object, modifier' },
        { zh: '模型、Token、会话、目录', en: 'Model, token, session, directory' },
      ], a: 1,
      e: { zh: '目标=要什么，范围=动哪些，产出=交付物长什么样，约束=红线和例外。', en: 'Goal = what you want, scope = what to touch, output = deliverable shape, constraints = red lines and edge cases.' } },

    { t: 'single', fig: 'prompt-4parts',
      q: { zh: '「帮我整理一下文件」这条指令最主要的问题是：', en: 'What is mainly wrong with "tidy up my files"?' },
      o: [
        { zh: '太短了，AI 不喜欢短句', en: 'Too short — the AI dislikes short sentences' },
        { zh: '没说范围、规则和产出，AI 只能按自己的理解动手', en: 'No scope, rule or output, so the AI must improvise' },
        { zh: '没有用英文', en: 'It is not in English' },
        { zh: '没有加感叹号', en: 'No exclamation mark' },
      ], a: 1,
      e: { zh: '歧义是所有翻车的起点。', en: 'Ambiguity is where every failure starts.' } },

    { t: 'single', fig: 'copy-safe',
      q: { zh: '第一次练手时，为什么建议先复制一份测试数据而不是直接用真实桌面？', en: 'Why practise on copied test data instead of your real desktop?' },
      o: [
        { zh: '真实桌面文件太多会变慢', en: 'The real desktop has too many files and is slow' },
        { zh: '指令有歧义时 AI 会按自己的理解动手，用副本练错了可以直接删掉重来', en: 'Ambiguous instructions make the AI improvise; with a copy, a mistake costs nothing' },
        { zh: 'AI 读不了桌面', en: 'The AI cannot read the desktop' },
        { zh: '桌面文件不能重命名', en: 'Desktop files cannot be renamed' },
      ], a: 1,
      e: { zh: '零成本试错，是新手最该给自己留的余地。', en: 'Zero-cost mistakes are the margin every beginner should keep.' } },

    { t: 'single', fig: 'tools-log',
      q: { zh: '任务出了问题，你应该<b>最先</b>去看过程里的哪一部分？', en: 'When a task goes wrong, which part of the process should you check <b>first</b>?' },
      o: [
        { zh: '思考', en: 'Thinking' },
        { zh: '工具调用（读了哪个文件、写了什么、跑了什么命令）', en: 'Tool calls — which files it read/wrote, what commands it ran' },
        { zh: '最后的输出总结', en: 'The closing summary' },
        { zh: 'token 数量', en: 'The token count' },
      ], a: 1,
      e: { zh: '工具调用是它唯一真正改动你电脑的地方，事故必然在这里留痕。', en: 'Tool calls are the only place it actually changes your machine, so the evidence is there.' } },

    { t: 'single', fig: 'token-meter',
      q: { zh: '一个「把 20 个文件改名」的简单任务却烧掉了 8 万 token，最可能的原因是：', en: 'A trivial "rename 20 files" task burned 80k tokens. Most likely cause:' },
      o: [
        { zh: '模型太贵', en: 'The model is expensive' },
        { zh: '范围没划清楚，它去读了大文件的内容', en: 'Scope was too loose and it read large file contents' },
        { zh: '网络太慢', en: 'The network is slow' },
        { zh: '文件名太长', en: 'The filenames are long' },
      ], a: 1,
      e: { zh: '改名只需要文件名，不需要内容。指令里应写明「不要读取文件内容」。', en: 'Renaming needs filenames, not contents. Say "do not read file contents".' } },

    { t: 'judge', fig: 'plan-then-act',
      q: { zh: '任务比较大时，加一句「先告诉我你打算怎么做，我确认后再动手」是有价值的。', en: 'For a sizeable task, adding "tell me your plan first and wait for my OK" is worthwhile.' },
      a: true,
      e: { zh: '一眼看计划就知道它理解对没有，代价极低、收益极高。', en: 'One glance at the plan reveals misunderstandings — cheap to ask, high payoff.' } },

    { t: 'judge', fig: 'session-lanes',
      q: { zh: '发现 AI 做错了，最好的做法是新开一个会话，从头把需求再讲一遍。', en: 'When the AI gets it wrong, the best move is a new session and re-explaining from scratch.' },
      a: false,
      e: { zh: '应该在同一个会话里说清「现象 + 你的判断 + 期望」，它保留着上下文，改起来更准。', en: 'Stay in the same session and give symptom + hypothesis + expectation; it still has the context.' } },

    { t: 'single', fig: 'bug-report',
      q: { zh: '下面哪句是「描述问题」的正确姿势？', en: 'Which is the right way to report a problem?' },
      o: [
        { zh: '你做错了，重做。', en: 'You got it wrong, do it again.' },
        { zh: '2026-01 里有三张图日期不对，应该是 2025-12；我猜你用了修改时间而不是 EXIF 拍摄时间，请改用 EXIF 重来并更新清单。', en: 'Three images in 2026-01 have the wrong date (should be 2025-12). I suspect you used modified time instead of EXIF capture time — redo with EXIF and update the index.' },
        { zh: '不行，换一个思路。', en: 'Nope, try another approach.' },
        { zh: '这不是我要的效果。', en: 'This is not what I wanted.' },
      ], a: 1,
      e: { zh: '现象 + 你的判断 + 期望，三件套齐全，修起来又快又准。', en: 'Symptom + hypothesis + expectation — fast and precise to fix.' } },

    { t: 'multi', fig: 'verify-count',
      q: { zh: '验收 AI 的整理结果时，应该做哪些检查？（多选）', en: 'When verifying a tidy-up result, which checks apply? (multiple)' },
      o: [
        { zh: '核对文件总数有没有变少', en: 'Check the total file count did not shrink' },
        { zh: '随机抽 2～3 个看是否符合规则', en: 'Spot-check two or three against the rule' },
        { zh: '读它列出的「不确定的部分」', en: 'Read the list of cases it was unsure about' },
        { zh: '看它回复的字数是否够多', en: 'Check its reply is long enough' },
      ], a: [0, 1, 2],
      e: { zh: '回复长短与正确性无关。', en: 'Reply length says nothing about correctness.' } },

    { t: 'single', fig: 'rename-map',
      q: { zh: '要求 AI「先生成 rename_plan.csv 对照表，我确认后再改名」，最大的好处是：', en: 'Asking for a rename_plan.csv mapping before renaming mainly gives you:' },
      o: [
        { zh: '省 token', en: 'Token savings' },
        { zh: '既能提前发现规则理解错误，事后也能据此回滚', en: 'Catching a misunderstood rule early, and a way to roll back afterwards' },
        { zh: '让它跑得更快', en: 'Faster execution' },
        { zh: '避免使用命令行', en: 'Avoiding the command line' },
      ], a: 1,
      e: { zh: '可预览 + 可回滚，是批量操作的标准安全动作。', en: 'Preview plus rollback is the standard safety pattern for bulk operations.' } },

    { t: 'single', fig: 'session-lanes',
      q: { zh: '「一件事一个会话」的主要理由是：', en: 'The main reason for "one job, one session" is:' },
      o: [
        { zh: '会话数量越多越便宜', en: 'More sessions cost less' },
        { zh: '避免不相干的上下文互相干扰，同时节省 token', en: 'Avoid unrelated context interfering, and save tokens' },
        { zh: '系统限制单会话只能发 10 条消息', en: 'The system limits a session to 10 messages' },
        { zh: '方便截图', en: 'Easier screenshots' },
      ], a: 1,
      e: { zh: '混着用会把「写周报」的要求带进「整理发票」的任务里。', en: 'Mixing leaks the requirements of one job into another.' } },

    { t: 'single', fig: 'queue',
      q: { zh: 'Clootee 的「任务队列」能做什么？', en: 'What does Clootee\'s task queue do?' },
      o: [
        { zh: '同时启动 10 个模型比谁快', en: 'Race ten models at once' },
        { zh: '一个会话里排多个任务自动依次执行，可暂停、插话、重排', en: 'Queue several tasks in one session, run them in order, pause, interject or reorder' },
        { zh: '自动把任务发给同事', en: 'Send tasks to your colleagues' },
        { zh: '定时关机', en: 'Schedule a shutdown' },
      ], a: 1,
      e: { zh: '适合下班前排一串活让它自己跑。', en: 'Great for lining up work before you leave.' } },

    { t: 'multi', fig: 'prompt-4parts',
      q: { zh: '下面这条指令缺了哪些要素？「把这些图片按日期整理好。」（多选）', en: 'Which parts are missing from: "Sort these images by date."? (multiple)' },
      o: [
        { zh: '范围（哪些文件、子文件夹动不动）', en: 'Scope (which files, subfolders or not)' },
        { zh: '产出（建什么文件夹、要不要清单、放哪儿）', en: 'Output (what folders, an index or not, where)' },
        { zh: '约束（不能删文件、读不到日期怎么办）', en: 'Constraints (no deletion, what if the date is unreadable)' },
        { zh: '目标（按日期整理）', en: 'Goal (sort by date)' },
      ], a: [0, 1, 2],
      e: { zh: '目标是唯一说清楚的；范围、产出、约束全缺。', en: 'The goal is the only clear part; scope, output and constraints are all missing.' } },

    { t: 'judge', fig: 'prompt-4parts',
      q: { zh: '「按日期整理」这句话本身就有歧义——修改时间、创建时间、拍摄时间是三回事。', en: '"Sort by date" is itself ambiguous — modified time, created time and capture time are three different things.' },
      a: true,
      e: { zh: '这种「你以为只有一种理解」的词，正是最容易翻车的地方。要写明用哪个时间。', en: 'Words you assume have one meaning are exactly where things break. Say which timestamp.' } },

    { t: 'single', fig: 'intake-limit',
      q: { zh: '让 AI 给一堆 PDF 建索引，如果只需要用到文件名，指令里应该加上：', en: 'Indexing PDFs when only filenames matter — your instruction should add:' },
      o: [
        { zh: '「请仔细阅读每个 PDF 的全文」', en: '"Read every PDF in full, carefully"' },
        { zh: '「只读取文件名，不要打开 PDF 内容」', en: '"Read filenames only; do not open the PDF contents"' },
        { zh: '「用最贵的模型」', en: '"Use the most expensive model"' },
        { zh: '「越详细越好」', en: '"The more detail the better"' },
      ], a: 1,
      e: { zh: '明确禁止不必要的读取，既快又省，还避免上下文被撑爆。', en: 'Explicitly forbidding unnecessary reads is faster, cheaper and keeps context free.' } },

    { t: 'single', fig: 'tools-log',
      q: { zh: '「思考」这一段最大的用处是：', en: 'The "thinking" section is most useful for:' },
      o: [
        { zh: '看它有没有偷懒', en: 'Checking whether it is slacking' },
        { zh: '判断它有没有理解对你的需求', en: 'Judging whether it understood your requirement' },
        { zh: '统计 token', en: 'Counting tokens' },
        { zh: '没有用处，可以关掉', en: 'Nothing — you can hide it' },
      ], a: 1,
      e: { zh: '理解错了，越努力越糟。早发现早止损。', en: 'A misunderstanding only gets worse with effort. Catch it early.' } },

    { t: 'multi', fig: 'copy-safe',
      q: { zh: '一条好的批量操作指令通常包含哪些「安全动作」？（多选）', en: 'A good bulk-operation instruction usually includes which safety moves? (multiple)' },
      o: [
        { zh: '先出计划或对照表，确认后再执行', en: 'Plan or mapping first, execute after approval' },
        { zh: '明确「不要删除任何文件」', en: 'Explicitly "delete nothing"' },
        { zh: '规定不确定的情况怎么处理', en: 'Define what to do with uncertain cases' },
        { zh: '要求它不要写任何日志', en: 'Require that it writes no logs' },
      ], a: [0, 1, 2],
      e: { zh: '日志和记录恰恰要保留，它们是回滚和追溯的依据。', en: 'Logs and records are exactly what you keep — they enable rollback and audit.' } },

    { t: 'single', fig: 'copy-safe',
      q: { zh: '重名文件的处理，最稳妥的约束写法是：', en: 'For duplicate filenames, the safest constraint is:' },
      o: [
        { zh: '「重名就覆盖」', en: '"Overwrite on clash"' },
        { zh: '「重名时在文件名后加 _1 _2，不要覆盖」', en: '"On clash append _1, _2; never overwrite"' },
        { zh: '「重名就删掉一个」', en: '"Delete one of them"' },
        { zh: '不用管，AI 会处理', en: 'Ignore it — the AI will handle it' },
      ], a: 1,
      e: { zh: '覆盖和删除都不可逆，加后缀可逆。', en: 'Overwriting and deleting are irreversible; suffixing is not.' } },

    { t: 'judge', fig: 'verify-count',
      q: { zh: '让 AI 在整理完后写一份「整理报告.md」，说明每类多少个文件、哪些不确定，属于多此一举。', en: 'Asking for a report.md after tidying — counts per folder and uncertain cases — is redundant.' },
      a: false,
      e: { zh: '这份报告就是你的验收依据，还能暴露它自己也没把握的地方。', en: 'That report is your verification basis and surfaces what it was unsure about.' } },

    { t: 'single', fig: 'scope-folder',
      q: { zh: '你希望 AI 处理当前文件夹但<b>不要碰子文件夹</b>，正确做法是：', en: 'You want it to process the current folder but <b>not subfolders</b>. The right move is:' },
      o: [
        { zh: '不说，它默认不会进子文件夹', en: 'Say nothing — it never enters subfolders by default' },
        { zh: '在范围里写明「只处理当前目录下的文件，不递归子文件夹」', en: 'State in scope: "current directory only, do not recurse into subfolders"' },
        { zh: '把子文件夹先删掉', en: 'Delete the subfolders first' },
        { zh: '换一个模型', en: 'Switch models' },
      ], a: 1,
      e: { zh: '默认行为不可依赖，边界必须自己写清楚。', en: 'Never rely on default behaviour; state the boundary yourself.' } },

    { t: 'single', fig: 'session-lanes',
      q: { zh: '会话命名建议怎么起？', en: 'How should you name sessions?' },
      o: [
        { zh: '统一叫「新会话」', en: 'All called "new session"' },
        { zh: '能一眼认出这是哪件事，如「整理 2026 报销截图」', en: 'Recognisable at a glance, e.g. "sort 2026 receipts"' },
        { zh: '用随机数字', en: 'Random numbers' },
        { zh: '越长越好', en: 'The longer the better' },
      ], a: 1,
      e: { zh: '几十个会话之后，命名就是你唯一的检索手段。', en: 'After a few dozen sessions, the name is your only way to find things.' } },

    { t: 'single', fig: 'rulebook',
      q: { zh: '「新建项目」时 Clootee 提示要不要套用项目模板，模板的实际作用是：', en: 'When creating a project, Clootee offers a template. What does it actually do?' },
      o: [
        { zh: '换一套界面皮肤', en: 'Changes the UI skin' },
        { zh: '写入 CLAUDE.md 等规范文件，相当于提前给 AI 立规矩', en: 'Writes files like CLAUDE.md — house rules the AI will follow' },
        { zh: '自动付款', en: 'Sets up billing' },
        { zh: '压缩项目文件', en: 'Compresses the project' },
      ], a: 1,
      e: { zh: 'CLAUDE.md 是项目级的长期约束，第 6 章细讲。', en: 'CLAUDE.md is a long-lived project constraint — detailed in Chapter 6.' } },

    { t: 'multi', fig: 'prompt-4parts',
      q: { zh: '以下哪些是「产出」要素该写的内容？（多选）', en: 'Which belong to the "output" part? (multiple)' },
      o: [
        { zh: '生成哪些文件、叫什么名字', en: 'Which files to create and their names' },
        { zh: 'CSV 要有哪几列、列名叫什么', en: 'Which columns the CSV needs and their names' },
        { zh: '结果放在哪个目录', en: 'Which directory results go into' },
        { zh: '禁止删除文件', en: 'No file deletion' },
      ], a: [0, 1, 2],
      e: { zh: '「禁止删除」属于约束，不是产出。', en: '"No deletion" is a constraint, not an output spec.' } },

    { t: 'single', fig: 'stop-mid',
      q: { zh: '如果 AI 在执行到一半时你发现方向错了，最合适的操作是：', en: 'If you spot a wrong direction mid-execution, the best action is:' },
      o: [
        { zh: '直接关掉浏览器', en: 'Close the browser' },
        { zh: '用暂停/停止打断它，再说明问题让它调整', en: 'Pause or stop it, then explain the problem and let it adjust' },
        { zh: '拔网线', en: 'Unplug the network' },
        { zh: '等它做完再说', en: 'Wait until it finishes' },
      ], a: 1,
      e: { zh: '早打断早止损，越晚打断它改动越多。', en: 'Interrupt early; the longer it runs the more it changes.' } },

    { t: 'judge', fig: 'verify-count',
      q: { zh: 'AI 说「已完成」，就说明结果一定正确。', en: 'If the AI says "done", the result is certainly correct.' },
      a: false,
      e: { zh: '「完成」只代表它跑完了流程，正确性要你核对。', en: '"Done" means the process finished, not that the result is right.' } },

    { t: 'single', fig: 'issues-funnel',
      q: { zh: '为什么要求 AI「把不确定的情况单独列出来」？', en: 'Why ask the AI to list uncertain cases separately?' },
      o: [
        { zh: '让报告显得专业', en: 'To make the report look professional' },
        { zh: '这些正是真正需要人来判断的部分，能直接变成你的待办清单', en: 'Those are exactly the parts needing human judgement — they become your to-do list' },
        { zh: '增加 token 消耗', en: 'To burn more tokens' },
        { zh: '没有实际意义', en: 'No real purpose' },
      ], a: 1,
      e: { zh: '把「机器能定的」和「人要定的」分开，是自动化最关键的一刀。', en: 'Separating machine-decidable from human-decidable is the key cut in any automation.' } },

    { t: 'single', fig: 'risk-scale',
      q: { zh: '下列哪条约束最能防止「不可逆事故」？', en: 'Which constraint best prevents irreversible accidents?' },
      o: [
        { zh: '请尽快完成', en: 'Please finish quickly' },
        { zh: '不要删除或覆盖任何原文件，所有结果输出到新文件', en: 'Never delete or overwrite originals; write all results to new files' },
        { zh: '请用中文回复', en: 'Reply in my language' },
        { zh: '请写详细注释', en: 'Write detailed comments' },
      ], a: 1,
      e: { zh: '「只增不改」是处理别人数据时的黄金法则。', en: '"Add, never modify" is the golden rule when handling data you did not create.' } },

    { t: 'single', fig: 'queue',
      q: { zh: '同一个会话里连着丢三个任务会怎样？', en: 'What happens if you drop three tasks into one session in a row?' },
      o: [
        { zh: '后两个会被丢弃', en: 'The last two are discarded' },
        { zh: '进入任务队列依次执行，可暂停、重排', en: 'They queue and run in order; you can pause and reorder' },
        { zh: '三个同时跑，互相冲突', en: 'All three run at once and conflict' },
        { zh: '系统报错', en: 'The system errors out' },
      ], a: 1,
      e: { zh: '这是 Clootee 的队列机制，适合批量安排工作。', en: 'That is Clootee\'s queue, made for batching work.' } },

    { t: 'practice', fig: 'files-sort',
      q: { zh: '实操：用四要素指令法，让 Claude Code 为一个文件夹生成清单。', en: 'Hands-on: use the four-part recipe to have Claude Code index a folder.' },
      task: {
        zh: `<p>在 Clootee 里真的做一遍：</p>
<ol>
<li>随便建一个练习文件夹，往里放至少 5 个不同类型的文件（图片、文档、表格都行），把它添加为工作目录。</li>
<li>新建会话，写一条<b>包含目标、范围、产出、约束四要素</b>的指令，让 Claude Code 生成一份 <code>清单.md</code>，至少包含：文件名、扩展名、大小、修改时间四项信息。</li>
<li>约束里必须写明「不要修改或删除任何原文件」。</li>
<li>执行完打开 <code>清单.md</code> 核对：文件数量对不对、信息全不全。</li>
</ol>
<p>把你实际发出的那条指令，以及生成的清单内容（可截取前几行），一起粘到下面。</p>`,
        en: `<p>Do it for real in Clootee:</p>
<ol>
<li>Create a practice folder with at least 5 files of different types, and add it as a workspace.</li>
<li>Start a session and write an instruction containing <b>all four parts</b>, asking Claude Code to produce <code>index.md</code> with at least: filename, extension, size, modified time.</li>
<li>The constraints must include "do not modify or delete any original file".</li>
<li>Open <code>index.md</code> and verify: right number of files, all fields present.</li>
</ol>
<p>Paste below the exact instruction you sent and the generated index (first few lines are enough).</p>`,
      },
      rubric: {
        zh: `1. 提交的指令必须能明确看出四要素：目标（生成清单）、范围（哪个目录/哪些文件）、产出（清单.md 及所需字段）、约束（不修改不删除原文件）。缺一项扣 20 分。
2. 提交内容里应包含实际生成的清单片段，且清单里能看到文件名、扩展名、大小、修改时间这四类信息中的至少三类。缺失扣 20 分。
3. 如果只写了指令没有任何结果，或者结果明显是编的（例如文件名是"文件1 文件2 文件3"这种占位符），最高给 40 分。
4. 完全没做（空话、复述题目）给 0 分。`,
        en: `1. The submitted instruction must clearly show all four parts: goal (produce an index), scope (which directory/files), output (index.md and its fields), constraints (do not modify or delete originals). Deduct 20 per missing part.
2. The submission must include an actual generated index snippet showing at least three of: filename, extension, size, modified time. Deduct 20 if missing.
3. If only the instruction is given with no result, or the result is obviously fabricated (placeholder names like "file1 file2 file3"), cap the score at 40.
4. Nothing actually done (empty talk, restating the task) scores 0.`,
      },
      e: { zh: '这道题练的就是「把话说清楚 + 自己验收」这两个习惯。', en: 'This exercise drills the two habits: be explicit, then verify yourself.' } },

    { t: 'practice', fig: 'rename-map',
      q: { zh: '实操：写一条带「计划先行 + 可回滚」的批量改名指令。', en: 'Hands-on: write a bulk-rename instruction with plan-first and rollback.' },
      task: {
        zh: `<p>在练习文件夹里放 5 张以上图片，然后让 Claude Code 完成批量改名，要求：</p>
<ol>
<li><b>先</b>生成 <code>rename_plan.csv</code>（两列：旧文件名、新文件名），<b>不要直接改名</b>；</li>
<li>你看过对照表确认无误后，再发第二条消息让它执行改名；</li>
<li>改名后保留对照表，以便回滚。</li>
</ol>
<p>把你发的<b>两条</b>指令、对照表的前几行、以及改名后的实际文件名，粘到下面。</p>`,
        en: `<p>Put 5+ images in a practice folder and have Claude Code bulk-rename them, requiring that:</p>
<ol>
<li>It <b>first</b> writes <code>rename_plan.csv</code> (two columns: old name, new name) and does <b>not</b> rename yet;</li>
<li>After you review the mapping, a second message tells it to perform the rename;</li>
<li>The mapping file is kept afterwards for rollback.</li>
</ol>
<p>Paste below: <b>both</b> instructions, the first few rows of the mapping, and the resulting filenames.</p>`,
      },
      rubric: {
        zh: `1. 必须能看到两条指令：第一条明确要求"只生成对照表、不要改名"，第二条才是执行改名。少一条扣 30 分。
2. 必须包含 rename_plan.csv 的实际内容片段（能看出旧名与新名两列）。缺失扣 30 分。
3. 必须包含改名后的实际文件名，且与对照表的新名一致。不一致或缺失扣 20 分。
4. 指令中提到保留对照表用于回滚，加分项；完全没提扣 10 分。
5. 明显编造或未真正执行给 0 分。`,
        en: `1. Two instructions must be visible: the first explicitly says "produce the mapping only, do not rename", the second performs the rename. Deduct 30 if one is missing.
2. Must include a real snippet of rename_plan.csv showing old and new name columns. Deduct 30 if missing.
3. Must include the actual resulting filenames, consistent with the mapping. Deduct 20 if inconsistent or missing.
4. Mentioning that the mapping is kept for rollback is a plus; deduct 10 if never mentioned.
5. Obviously fabricated or not actually executed scores 0.`,
      },
      e: { zh: '预览 + 回滚，是所有批量操作的标准安全动作，值得形成肌肉记忆。', en: 'Preview plus rollback is the standard safety pattern for bulk work — make it muscle memory.' } },
  ],
});
