// 第 6 章：让 AI 长期记住你的规矩 —— CLAUDE.md、上下文管理、任务拆分
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch06',
  icon: '🧠',
  minutes: 17,
  title: { zh: '别再重复交代：让 AI 长期记住你的规矩', en: 'Stop repeating yourself: make the AI remember your rules' },
  goal: {
    zh: '用 CLAUDE.md 把项目规矩固化下来，理解上下文为什么会「忘」以及怎么管，学会把大任务拆成能跑完的小任务。',
    en: 'Freeze your project rules into CLAUDE.md, understand why context runs out and how to manage it, and learn to split big jobs into ones that finish.',
  },
  praise: {
    zh: '<p>这一章是从「会用」到「用得好」的分水岭。你现在知道<b>为什么它会忘</b>、<b>怎么让它别忘</b>，也知道大任务该怎么切。很多用了半年 AI 的人都不知道 CLAUDE.md 的存在。</p><p>接下来两章开始做东西：先做一个<b>能发给同事用的网页小工具</b>，再挑战<b>用 TypeScript 给 Clootee 加一个真功能</b>。</p>',
    en: '<p>This chapter is the line between "can use it" and "uses it well". You now know <b>why it forgets</b>, <b>how to stop that</b>, and how to slice a big job. Plenty of people six months in have never heard of CLAUDE.md.</p><p>The next two chapters build things: first a <b>web tool you can hand to a colleague</b>, then the real challenge — <b>adding a working feature to Clootee in TypeScript</b>.</p>',
  },

  sections: [
    {
      h: { zh: 'CLAUDE.md：写给 AI 的部门手册', en: 'CLAUDE.md: the team handbook, written for the AI' },
      fig: 'rulebook',
      body: {
        zh: `<div class="lp-oneline">把每次都要重复交代的规矩写进这个文件，它每次开工前自动读。</div>
<p>它就是项目根目录下的一个普通文本文件。有了它，你的指令能短很多：<b>「按项目约定，把 data/ 下三个月的数据合并成年度明细。」</b>——口径、目录、验收方式它都知道了。</p>
<details class="lp-fold"><summary>🍊 打个比方</summary><div class="lp-fold-body">
<p>新同事入职第一天，你是每天口头叮嘱一遍「报销要贴发票、周报周五交」，还是<b>直接给他一份部门手册</b>？</p>
<p>CLAUDE.md 就是那份手册。区别在于：这位新同事每天早上都会重读一遍。</p>
</div></details>
<details class="lp-fold"><summary>📝 一份能用的 CLAUDE.md（照抄改改）</summary><div class="lp-fold-body">
<pre># 本项目工作约定

## 目录规矩
- 原始数据在 data/，只读，任何情况下不修改、不删除
- 所有产出写到 out/
- 脚本放 scripts/，一次性脚本也要留下，不要用完就删

## 数据口径
- 销售额 = 不含税成交额
- 日期一律输出 YYYY-MM-DD
- 金额保留两位小数，报告中用千分位

## 干活方式
- 超过 3 个步骤的任务，先给我计划，我确认后再动手
- 批量修改文件前，先输出「旧 → 新」对照表
- 遇到无法确定的情况不要猜，记录到 out/问题清单.csv 并告诉我

## 输出习惯
- 结论先说，理由后说
- 不确定的地方明确写「不确定」，不要用模糊表述掩盖</pre>
</div></details>
<details class="lp-fold"><summary>🔍 在 Clootee 里怎么用 + 两个提醒</summary><div class="lp-fold-body">
<p>两条路：① 新建项目时选一个<b>项目模板</b>，它会自动写入 CLAUDE.md；② 在设置里填<b>预设系统提示词</b>，Clootee 每次发消息前会确保它被写进当前项目的 CLAUDE.md / AGENTS.md。</p>
<p>懒人做法：直接说「根据我们刚才的工作方式，帮我起草一份 CLAUDE.md」——它比你更记得你反复强调过什么。</p>
<p><b>提醒一</b>：它大幅提高遵守概率，但<b>不是硬开关</b>。「不要删除」这类关键约束，在具体指令里再说一遍，成本一行字。</p>
<p><b>提醒二</b>：CLAUDE.md 经常会被提交到代码仓库或分享给同事，<b>绝不能写密钥密码</b>。</p>
</div></details>`,
        en: `<div class="lp-oneline">Put the rules you keep repeating into this file; it is read automatically before every job.</div>
<p>It is a plain text file at your project root. With it, instructions get short: <b>"Per project conventions, merge the three months in data/ into an annual detail file."</b> — definitions, directories and verification are already known.</p>
<details class="lp-fold"><summary>🍊 An analogy</summary><div class="lp-fold-body">
<p>When a new colleague joins, do you repeat "expenses need receipts, updates are due Friday" every morning — or <b>hand them the team handbook</b>?</p>
<p>CLAUDE.md is that handbook. The difference: this colleague rereads it every single morning.</p>
</div></details>
<details class="lp-fold"><summary>📝 A working CLAUDE.md (copy and adapt)</summary><div class="lp-fold-body">
<pre># Working agreements for this project

## Directory rules
- Raw data lives in data/ and is read-only — never modify or delete it
- All output goes to out/
- Scripts live in scripts/; keep one-off scripts too, do not delete after use

## Data definitions
- Revenue = net of tax
- Always output dates as YYYY-MM-DD
- Amounts to two decimals; thousands separators in reports

## How to work
- For tasks over 3 steps, give me the plan first and wait for confirmation
- Before bulk file changes, output an old → new mapping
- Never guess on ambiguous cases: log them to out/issues.csv and tell me

## Output habits
- Conclusion first, reasoning after
- Say "unsure" explicitly instead of hiding it behind vague wording</pre>
</div></details>
<details class="lp-fold"><summary>🔍 Using it in Clootee + two warnings</summary><div class="lp-fold-body">
<p>Two routes: ① pick a <b>project template</b> when creating a project — it writes CLAUDE.md for you; ② set a <b>default system prompt</b> in Settings, and Clootee ensures it lands in the current project's CLAUDE.md / AGENTS.md before each message.</p>
<p>The lazy route: "Draft a CLAUDE.md based on how we have been working." It remembers what you kept repeating better than you do.</p>
<p><b>Warning 1</b>: it raises compliance a lot but is <b>not a hard switch</b>. Restate critical constraints like "do not delete" in the instruction too — it costs one line.</p>
<p><b>Warning 2</b>: CLAUDE.md often gets committed or shared, so <b>never put secrets in it</b>.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '它为什么会「忘」，忘了怎么办', en: 'Why it forgets, and what to do about it' },
      fig: 'memory-fade',
      body: {
        zh: `<div class="lp-oneline">对话越长，桌子越满，最早的内容被挤掉——这就是「忘」。</div>
<p>一次对话里，这些都在占位置：你发的每条消息、它的每条回复、它读过的文件内容、它跑命令的输出、项目的 CLAUDE.md。</p>
<p><b>快满的信号</b>：忘记早期要求、反复问你已经说过的事、重做已经做完的步骤。看到这些就别跟它较劲了。</p>
<details class="lp-fold"><summary>🔍 三个应对手段</summary><div class="lp-fold-body">
<table>
<tr><th>手段</th><th>怎么做</th><th>什么时候用</th></tr>
<tr><td><b>压缩</b></td><td>让它总结当前进展，只留结论继续</td><td>任务没做完但对话很长</td></tr>
<tr><td><b>换新会话</b></td><td>把关键结论写进文件，新会话读文件</td><td>换阶段 / 换一件事</td></tr>
<tr><td><b>控制读入量</b></td><td>限制读哪些文件、不要读内容、只看前 N 行</td><td><b>每次都该做</b></td></tr>
</table>
<p>Clootee 设置里有<b>自动压缩</b>开关（设一个 token 阈值让它自动整理），侧栏会话工具里有 <code>/usage</code> 随时看用量。</p>
</div></details>
<details class="lp-fold"><summary>📝 跨会话交接的标准写法</summary><div class="lp-fold-body">
<pre>我们的对话已经很长了。请把当前进展写进 progress.md：
1. 已完成的步骤和产出文件路径
2. 已确认的口径与决定（包括我否决过的方案）
3. 还没做的事，按顺序列出
4. 下一步该做什么
写完后我会开一个新会话，让它读这个文件继续。</pre>
<p>注意第 2 条里的「<b>包括我否决过的方案</b>」——不写这个，新会话很可能又给你提一遍你已经拒绝的方案。</p>
</div></details>
<details class="lp-fold"><summary>🍊 最重要的一条习惯</summary><div class="lp-fold-body">
<p><b>重要结论落到文件里，不要只留在对话里。</b></p>
<p>对话像沙滩上的字，会被压缩、会被挤出去；文件像刻在石头上的。你在对话里聊出来的所有有价值的决定，都值得让它写进一个文件。</p>
</div></details>`,
        en: `<div class="lp-oneline">The longer the conversation, the fuller the desk — the earliest content gets pushed off. That is "forgetting".</div>
<p>Competing for room: every message you send, every reply, the contents of files it read, command output, and the project's CLAUDE.md.</p>
<p><b>Signals it is nearly full</b>: forgetting early requirements, re-asking answered questions, redoing finished steps. Stop arguing with it when you see these.</p>
<details class="lp-fold"><summary>🔍 Three remedies</summary><div class="lp-fold-body">
<table>
<tr><th>Remedy</th><th>How</th><th>When</th></tr>
<tr><td><b>Compact</b></td><td>Have it summarise progress and continue from the summary</td><td>Task unfinished, conversation long</td></tr>
<tr><td><b>New session</b></td><td>Write conclusions to a file, fresh session reads it</td><td>New phase or different job</td></tr>
<tr><td><b>Limit intake</b></td><td>Restrict which files, forbid reading contents, cap to first N lines</td><td><b>Every single time</b></td></tr>
</table>
<p>Clootee has an <b>auto-compact</b> setting (a token threshold), and the session tools include <code>/usage</code> to check consumption.</p>
</div></details>
<details class="lp-fold"><summary>📝 The standard handover message</summary><div class="lp-fold-body">
<pre>This conversation has grown long. Write the current state into progress.md:
1. Steps completed and the paths of what was produced
2. Definitions and decisions already agreed (including options I rejected)
3. What remains, in order
4. What the next step is
I will start a fresh session and have it read this file to continue.</pre>
<p>Note "<b>including options I rejected</b>" in point 2 — without it, the fresh session will happily re-propose something you already turned down.</p>
</div></details>
<details class="lp-fold"><summary>🍊 The single most important habit</summary><div class="lp-fold-body">
<p><b>Put important conclusions into files, not just the chat.</b></p>
<p>Chat is writing in sand — it gets compacted and pushed out. Files are carved in stone. Every valuable decision you reach in conversation deserves to be written down.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '大任务怎么拆', en: 'How to slice a big job' },
      fig: 'split-steps',
      body: {
        zh: `<div class="lp-oneline">判断标准只有一条：每一步都要有一个你能打开检查的产出物。</div>
<p>「把整个部门的年度资料重新整理一遍」直接发出去，结果通常是做了一半、上下文爆了、或者做出来的东西你不想要。</p>
<details class="lp-fold"><summary>📝 拆成五步的样子</summary><div class="lp-fold-body">
<ol>
<li>扫描 <code>docs/</code>，输出 <code>盘点.csv</code>：文件名、类型、大小、修改时间、所在子目录。<b>只盘点，不动文件。</b></li>
<li>基于盘点提出分类方案写进 <code>分类方案.md</code>，说明分几类、判断依据。<b>等我确认。</b></li>
<li>按确认后的方案生成 <code>迁移计划.csv</code>（旧路径 → 新路径）。<b>先不要动。</b></li>
<li>执行迁移，保留计划文件用于回滚，输出 <code>迁移报告.md</code>。</li>
<li>为新结构生成 <code>README.md</code> 索引。</li>
</ol>
<p>共同点：<b>每步产出一个文件，风险大的步骤前面都有「等我确认」。</b>这样第 3 步方案错了，你只损失第 3 步。</p>
</div></details>
<details class="lp-fold"><summary>🔍 配合任务队列使用</summary><div class="lp-fold-body">
<p>这五步可以一次性排进同一个会话的队列，但建议把<b>第 2 步之后设成暂停点</b>——让它做完盘点和方案就停下来等你。</p>
<p>Clootee 支持随时暂停、插话、重排顺序。</p>
</div></details>`,
        en: `<div class="lp-oneline">One test only: every step must produce something you can open and inspect.</div>
<p>"Reorganise the department's entire annual archive" sent as one instruction usually ends half-done, out of context, or producing something you did not want.</p>
<details class="lp-fold"><summary>📝 What five slices look like</summary><div class="lp-fold-body">
<ol>
<li>Scan <code>docs/</code> and write <code>inventory.csv</code>: filename, type, size, modified time, subdirectory. <b>Inventory only, touch nothing.</b></li>
<li>Propose a taxonomy in <code>taxonomy.md</code> with the rule behind each category. <b>Wait for my confirmation.</b></li>
<li>Generate <code>migration_plan.csv</code> (old path → new path). <b>Do not move anything yet.</b></li>
<li>Execute the migration, keep the plan for rollback, write <code>migration_report.md</code>.</li>
<li>Generate a <code>README.md</code> index for the new structure.</li>
</ol>
<p>What they share: <b>each produces a file, and every risky step is preceded by "wait for my confirmation".</b> A wrong taxonomy at step 3 costs you step 3 only.</p>
</div></details>
<details class="lp-fold"><summary>🔍 Pair it with the queue</summary><div class="lp-fold-body">
<p>All five can be queued in one session, but make <b>step 2 a stopping point</b> — let it inventory and propose, then wait for you.</p>
<p>Clootee lets you pause, interject and reorder at any time.</p>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: 'CLAUDE.md', en: 'CLAUDE.md' }, d: { zh: '放在项目根目录、AI 开工前自动读取的项目约定文件', en: 'A project-root file the AI reads automatically before working' } },
    { k: { zh: 'AGENTS.md', en: 'AGENTS.md' }, d: { zh: '同类作用的约定文件，Codex 等工具使用', en: 'The equivalent conventions file used by tools like Codex' } },
    { k: { zh: '压缩 / Compact', en: 'Compact' }, d: { zh: '把长对话总结成要点，腾出上下文空间继续干活', en: 'Summarising a long conversation into key points to free context' } },
    { k: { zh: '系统提示词', en: 'System prompt' }, d: { zh: 'Clootee 设置里的预设要求，会被写进项目的 CLAUDE.md / AGENTS.md', en: "Clootee's default requirements, written into the project's CLAUDE.md / AGENTS.md" } },
    { k: { zh: '项目模板', en: 'Project template' }, d: { zh: '新建项目时可套用的一套约定文件与目录结构', en: 'A set of conventions and structure applied when creating a project' } },
    { k: { zh: '进展文件 / progress.md', en: 'Progress file (progress.md)' }, d: { zh: '记录已完成、已确认、待办的文件，跨会话交接用', en: 'A file recording what is done, agreed and pending — used to hand over between sessions' } },
    { k: { zh: '暂停点', en: 'Checkpoint' }, d: { zh: '任务拆分中特意设置的"等我确认"节点', en: 'A deliberate "wait for my confirmation" checkpoint in a split task' } },
  ],

  quiz: [
    { t: 'single', fig: 'rulebook',
      q: { zh: 'CLAUDE.md 是什么？', en: 'What is CLAUDE.md?' },
      o: [
        { zh: 'Claude 的安装日志', en: "Claude's install log" },
        { zh: '放在项目根目录、AI 每次开工前自动读取的项目约定文件', en: 'A project-root conventions file the AI reads automatically before each job' },
        { zh: '一个必须付费的功能', en: 'A paid feature' },
        { zh: '存放 API Key 的文件', en: 'Where the API key is stored' },
      ], a: 1,
      e: { zh: '相当于新同事入职时发的《部门工作手册》。', en: 'It is the team handbook you hand a new colleague.' } },

    { t: 'multi', fig: 'rulebook',
      q: { zh: '下面哪些内容适合写进 CLAUDE.md？（多选）', en: 'Which belong in CLAUDE.md? (multiple)' },
      o: [
        { zh: '目录规矩：原始数据只读，产出写到 out/', en: 'Directory rules: data/ is read-only, output goes to out/' },
        { zh: '数据口径：销售额=不含税，日期用 YYYY-MM-DD', en: 'Definitions: revenue is net of tax, dates as YYYY-MM-DD' },
        { zh: '干活方式：超过 3 步先给计划', en: 'Working style: plan first for tasks over 3 steps' },
        { zh: '你的 API Key', en: 'Your API key' },
      ], a: [0, 1, 2],
      e: { zh: 'API Key 绝不能写进任何会被分享或提交的文件。', en: 'An API key must never go into a file that gets shared or committed.' } },

    { t: 'single', fig: 'rulebook',
      q: { zh: '有了 CLAUDE.md 之后，你的日常指令会发生什么变化？', en: 'What changes about your day-to-day instructions once CLAUDE.md exists?' },
      o: [
        { zh: '必须写得更长', en: 'They must get longer' },
        { zh: '可以短很多，因为口径、目录、验收方式它已经知道了', en: 'They get much shorter — definitions, directories and verification are already known' },
        { zh: '必须用英文写', en: 'They must be in English' },
        { zh: '不能再发指令了', en: 'You can no longer send instructions' },
      ], a: 1,
      e: { zh: '「按项目约定，把 data/ 下三个月数据合并」——一句话就够。', en: '"Per project conventions, merge the three months in data/" — one line is enough.' } },

    { t: 'judge', fig: 'rulebook',
      q: { zh: '把要求写进 CLAUDE.md 之后，AI 就一定会严格遵守，不需要在具体指令里再提。', en: 'Once a rule is in CLAUDE.md, the AI will definitely comply and you never need to restate it.' },
      a: false,
      e: { zh: '它大幅提高遵守概率但不是硬开关。关键约束（如"不要删除"）值得再强调一次。', en: 'It raises compliance a lot but is not a hard switch. Critical constraints deserve restating.' } },

    { t: 'multi', fig: 'context-fill',
      q: { zh: '一次对话里，哪些东西会占用上下文？（多选）', en: 'What consumes context inside one conversation? (multiple)' },
      o: [
        { zh: '你发的消息和它的回复', en: 'Your messages and its replies' },
        { zh: '它读过的文件内容', en: 'The contents of files it read' },
        { zh: '它执行命令后的输出', en: 'The output of commands it ran' },
        { zh: '你电脑上没被它读过的文件', en: 'Files on your computer it never read' },
      ], a: [0, 1, 2],
      e: { zh: '没被读过的文件不占上下文——这正是"限制读入量"能省上下文的原因。', en: 'Unread files cost nothing — which is exactly why limiting intake saves context.' } },

    { t: 'single', fig: 'memory-fade',
      q: { zh: '「它反复问你已经说过的信息」，最可能的原因是：', en: 'It keeps asking for information you already gave. The likely cause:' },
      o: [
        { zh: '它在故意拖延', en: 'It is stalling' },
        { zh: '上下文快满了，早期内容已被挤出去', en: 'Context is nearly full and the early content was pushed out' },
        { zh: '你的网络不稳定', en: 'Unstable network' },
        { zh: '模型需要更新', en: 'The model needs updating' },
      ], a: 1,
      e: { zh: '这是最典型的上下文告急信号，应该压缩或换会话。', en: 'The classic context-pressure signal — compact or start fresh.' } },

    { t: 'single', fig: 'handover-file',
      q: { zh: '跨会话交接时，最重要的一件事是：', en: 'When handing over between sessions, the most important thing is:' },
      o: [
        { zh: '复制粘贴整段对话历史', en: 'Copy-pasting the whole chat history' },
        { zh: '把已完成的产出、已确认的口径、待办事项写进一个进展文件', en: 'Writing what is done, what was agreed and what remains into a progress file' },
        { zh: '换一个更强的模型', en: 'Switching to a stronger model' },
        { zh: '重新描述整个需求', en: 'Re-describing the whole requirement' },
      ], a: 1,
      e: { zh: '文件是跨会话唯一可靠的载体，对话不是。', en: 'Files are the only reliable carrier across sessions; chat is not.' } },

    { t: 'multi', fig: 'handover-file',
      q: { zh: '进展文件（progress.md）里应该包含什么？（多选）', en: 'What belongs in progress.md? (multiple)' },
      o: [
        { zh: '已完成的步骤和产出文件路径', en: 'Completed steps and output file paths' },
        { zh: '已确认的口径与决定，包括被否决的方案', en: 'Agreed definitions and decisions, including rejected options' },
        { zh: '还没做的事，按顺序列出', en: 'What remains, in order' },
        { zh: '每一条对话的完整原文', en: 'The full verbatim chat log' },
      ], a: [0, 1, 2],
      e: { zh: '交接的是结论和状态，不是原始对话——否则上下文一样会爆。', en: 'You hand over conclusions and state, not raw chat — otherwise context blows up again.' } },

    { t: 'single', fig: 'split-steps',
      q: { zh: '判断「大任务拆得好不好」的标准是：', en: 'How do you judge whether a big job is well sliced?' },
      o: [
        { zh: '步骤越多越好', en: 'More steps is better' },
        { zh: '每一步都有一个你能直接打开检查的产出物', en: 'Every step produces something you can open and inspect' },
        { zh: '每一步字数相同', en: 'Every step is the same length' },
        { zh: '能在一条消息里说完', en: 'It fits in one message' },
      ], a: 1,
      e: { zh: '可检查 = 可止损。错了只损失当前这一步。', en: 'Inspectable means containable — a mistake costs one step.' } },

    { t: 'single', fig: 'checkpoint',
      q: { zh: '在「盘点 → 分类方案 → 迁移计划 → 执行 → 索引」这五步里，最该设「等我确认」的是：', en: 'In "inventory → taxonomy → migration plan → execute → index", where should you insist on confirmation?' },
      o: [
        { zh: '第 1 步之前', en: 'Before step 1' },
        { zh: '第 2 步（分类方案）之后，以及第 3 步（迁移计划）之后', en: 'After step 2 (taxonomy) and after step 3 (migration plan)' },
        { zh: '第 5 步之后', en: 'After step 5' },
        { zh: '不需要确认', en: 'No confirmation needed' },
      ], a: 1,
      e: { zh: '方案错了后面全错；计划确认后才真正动文件，这两处最值钱。', en: 'A wrong taxonomy ruins everything downstream, and the plan is the last gate before files actually move.' } },

    { t: 'judge', fig: 'handover-file',
      q: { zh: '「重要结论只留在对话里就够了，反正随时能往上翻。」', en: '"Keeping conclusions in the chat is fine — I can always scroll up."' },
      a: false,
      e: { zh: '对话会被压缩、会被挤出上下文；文件不会。结论必须落盘。', en: 'Chats get compacted and pushed out of context; files do not. Conclusions must be written down.' } },

    { t: 'single', fig: 'rulebook',
      q: { zh: 'Clootee 设置里的「预设系统提示词」实际做了什么？', en: 'What does the "default system prompt" setting in Clootee actually do?' },
      o: [
        { zh: '改变界面文案', en: 'Changes UI wording' },
        { zh: '在每次发消息前，确保这段要求被写进当前项目的 CLAUDE.md / AGENTS.md', en: 'Ensures that text is written into the current project\'s CLAUDE.md / AGENTS.md before each message' },
        { zh: '自动翻译你的指令', en: 'Auto-translates your instruction' },
        { zh: '限制模型的回复长度', en: 'Caps the reply length' },
      ], a: 1,
      e: { zh: '所以它等价于"给所有项目都配一份默认约定"。', en: 'It is effectively "a default set of conventions for every project".' } },

    { t: 'single', fig: 'intake-limit',
      q: { zh: '「限制读入量」最典型的写法是：', en: 'The most typical way to limit intake is:' },
      o: [
        { zh: '「请仔细阅读所有文件」', en: '"Read every file carefully"' },
        { zh: '「只读文件名不要读内容」「只看每个文件前 50 行」', en: '"Filenames only, no contents" / "first 50 lines of each file only"' },
        { zh: '「快点做」', en: '"Do it fast"' },
        { zh: '「用小一点的模型」', en: '"Use a smaller model"' },
      ], a: 1,
      e: { zh: '明确限制读什么，是最有效也最容易被忽略的省上下文手段。', en: 'Explicitly bounding what it reads is the most effective and most neglected way to save context.' } },

    { t: 'single', fig: 'compact-squeeze',
      q: { zh: '「压缩（compact）」的本质是：', en: 'What does "compacting" actually do?' },
      o: [
        { zh: '把文件打成压缩包', en: 'Zipping files' },
        { zh: '把长对话总结成要点，腾出上下文空间继续干活', en: 'Summarising the long conversation into key points to free context' },
        { zh: '删除历史记录', en: 'Deleting history' },
        { zh: '降低模型精度', en: 'Lowering model precision' },
      ], a: 1,
      e: { zh: '总结会损失细节，所以关键细节要事先写进文件。', en: 'Summarising loses detail — which is why key details belong in files beforehand.' } },

    { t: 'multi', fig: 'session-lanes',
      q: { zh: '哪些是良好的「会话卫生」习惯？（多选）', en: 'Which are good session hygiene habits? (multiple)' },
      o: [
        { zh: '一件事一个会话，名字起清楚', en: 'One job per session, clearly named' },
        { zh: '重要结论落到文件里', en: 'Conclusions written into files' },
        { zh: '长任务定期更新进展文件', en: 'Updating a progress file during long tasks' },
        { zh: '尽量把所有项目都塞进一个会话，方便回顾', en: 'Cramming every project into one session for easy review' },
      ], a: [0, 1, 2],
      e: { zh: '塞在一起既污染上下文，也让检索变得不可能。', en: 'Cramming pollutes context and makes retrieval impossible.' } },

    { t: 'single', fig: 'memory-fade',
      q: { zh: '一个任务做到一半，AI 开始重做已经完成的步骤，你应该：', en: 'Mid-task the AI starts redoing finished steps. You should:' },
      o: [
        { zh: '骂它一顿让它认真点', en: 'Tell it off and demand focus' },
        { zh: '让它把当前进展写进 progress.md，然后开新会话读文件继续', en: 'Have it write progress.md, then continue in a fresh session that reads the file' },
        { zh: '重启电脑', en: 'Reboot the computer' },
        { zh: '把任务放弃', en: 'Abandon the task' },
      ], a: 1,
      e: { zh: '这是上下文耗尽的典型表现，跟它较劲成本更高。', en: 'That is context exhaustion; arguing with it costs more than a handover.' } },

    { t: 'single', fig: 'template-file',
      q: { zh: '项目模板（Template）在 Clootee 里的作用是：', en: 'What do project templates do in Clootee?' },
      o: [
        { zh: '换主题配色', en: 'Change the colour theme' },
        { zh: '新建/选择项目时，把一套约定文件（如 CLAUDE.md）和目录结构写进项目', en: 'Write a set of conventions (like CLAUDE.md) and structure into the project when you create or pick it' },
        { zh: '自动生成代码', en: 'Auto-generate code' },
        { zh: '限制文件大小', en: 'Limit file sizes' },
      ], a: 1,
      e: { zh: '相当于新项目开局就带上一份工作手册。', en: 'Every new project starts with a handbook already in place.' } },

    { t: 'judge', fig: 'checkpoint',
      q: { zh: '在同一个会话里排队执行五个步骤时，可以把某一步设为暂停点，等你确认后再继续。', en: 'When queueing five steps in one session, you can make one a stopping point and continue only after your confirmation.' },
      a: true,
      e: { zh: 'Clootee 支持随时暂停、插话、重排队列。', en: 'Clootee supports pausing, interjecting and reordering at any time.' } },

    { t: 'single', fig: 'read-first',
      q: { zh: '为什么「盘点」这一步要明确写「只盘点，不动文件」？', en: 'Why must the inventory step say "inventory only, touch nothing"?' },
      o: [
        { zh: '为了让它跑得快一点', en: 'To make it run faster' },
        { zh: '防止它在你还没看到全貌时就开始改动文件', en: 'To stop it changing files before you have seen the full picture' },
        { zh: '为了节省磁盘空间', en: 'To save disk space' },
        { zh: '格式要求', en: 'A formatting requirement' },
      ], a: 1,
      e: { zh: '「先看清再动手」在任何工程里都是铁律。', en: '"Look before you touch" is a hard rule in any engineering work.' } },

    { t: 'single', fig: 'rulebook',
      q: { zh: '你希望所有项目都默认遵守「不要删除原文件」，最省事的做法是：', en: 'You want "never delete originals" to apply to every project. The least-effort way:' },
      o: [
        { zh: '每条指令都手打一遍', en: 'Type it into every instruction' },
        { zh: '写进 Clootee 的预设系统提示词，它会被带进每个项目的约定文件', en: 'Put it in Clootee\'s default system prompt so it lands in every project\'s conventions file' },
        { zh: '把文件设为只读', en: 'Make the files read-only' },
        { zh: '不用管，AI 不会删文件', en: 'Do nothing — the AI never deletes files' },
      ], a: 1,
      e: { zh: '把文件设为只读也是好习惯，但系统提示词是最省事的通用做法。', en: 'Read-only files are also good practice, but the default system prompt is the general low-effort answer.' } },

    { t: 'multi', fig: 'memory-fade',
      q: { zh: '上下文快满时可能出现哪些症状？（多选）', en: 'Which symptoms appear when context is nearly full? (multiple)' },
      o: [
        { zh: '忘记早期提过的要求', en: 'Forgetting early requirements' },
        { zh: '重复询问已经说过的信息', en: 'Re-asking answered questions' },
        { zh: '重做已经完成的步骤', en: 'Redoing completed steps' },
        { zh: '文件权限被自动修改', en: 'File permissions changing by themselves' },
      ], a: [0, 1, 2],
      e: { zh: '前三个是典型症状；文件权限与上下文无关。', en: 'The first three are typical; file permissions are unrelated.' } },

    { t: 'single', fig: 'rulebook',
      q: { zh: '「AGENTS.md」和「CLAUDE.md」的关系是：', en: 'The relationship between AGENTS.md and CLAUDE.md:' },
      o: [
        { zh: '完全无关', en: 'Unrelated' },
        { zh: '作用相同的约定文件，面向不同工具（Codex 等）', en: 'The same kind of conventions file, aimed at different tools (Codex and others)' },
        { zh: 'AGENTS.md 是加密版', en: 'AGENTS.md is the encrypted version' },
        { zh: 'CLAUDE.md 已被废弃', en: 'CLAUDE.md is deprecated' },
      ], a: 1,
      e: { zh: 'Clootee 的模板会同时写两份，因为它支持两种引擎。', en: 'Clootee templates write both, because it supports two engines.' } },

    { t: 'single', fig: 'key-wallet',
      q: { zh: '一份好的 CLAUDE.md，最不该出现的内容是：', en: 'What should never appear in a good CLAUDE.md?' },
      o: [
        { zh: '目录约定', en: 'Directory conventions' },
        { zh: '数据口径', en: 'Data definitions' },
        { zh: '密钥、密码等敏感信息', en: 'Secrets such as keys and passwords' },
        { zh: '输出习惯要求', en: 'Output style requirements' },
      ], a: 2,
      e: { zh: 'CLAUDE.md 常常会被提交到代码仓库或分享给同事。', en: 'CLAUDE.md often gets committed or shared with colleagues.' } },

    { t: 'judge', fig: 'rulebook',
      q: { zh: '让 AI「根据我们刚才的工作方式，帮我起草一份 CLAUDE.md」是可行的。', en: 'Asking the AI to "draft a CLAUDE.md based on how we have been working" is a valid approach.' },
      a: true,
      e: { zh: '它比你更记得刚才反复强调过什么，起草后你再删改即可。', en: 'It remembers what you kept repeating; draft first, then trim.' } },

    { t: 'single', fig: 'reuse-script',
      q: { zh: '把「一次性脚本也要留下，不要用完就删」写进 CLAUDE.md 的理由是：', en: 'Why write "keep one-off scripts, do not delete after use" into CLAUDE.md?' },
      o: [
        { zh: '占硬盘让电脑变慢', en: 'To fill the disk' },
        { zh: '脚本是可复用资产，下次同类任务能直接改一改再跑', en: 'Scripts are reusable assets — next time you tweak and rerun' },
        { zh: '为了让项目看起来更大', en: 'To make the project look bigger' },
        { zh: '没有理由，习惯而已', en: 'No reason, just habit' },
      ], a: 1,
      e: { zh: '这与第 3 章「让它写脚本」的思路是一脉相承的。', en: 'This follows directly from Chapter 3\'s "have it write a script".' } },

    { t: 'single', fig: 'split-steps',
      q: { zh: '哪种拆分方式更好？', en: 'Which split is better?' },
      o: [
        { zh: '「第一步：完成整个项目的前一半」', en: '"Step 1: do the first half of the project"' },
        { zh: '「第一步：扫描 docs/ 输出盘点.csv，只盘点不动文件」', en: '"Step 1: scan docs/ and write inventory.csv; inventory only, touch nothing"' },
        { zh: '「第一步：随便看看」', en: '"Step 1: have a look around"' },
        { zh: '「第一步：全部搞定」', en: '"Step 1: finish everything"' },
      ], a: 1,
      e: { zh: '有明确产出、有明确边界，才是可执行、可验收的一步。', en: 'A concrete deliverable plus a clear boundary makes a step executable and verifiable.' } },

    { t: 'single', fig: 'token-meter',
      q: { zh: '`/usage` 这个会话工具命令的用途是：', en: 'What is the `/usage` session tool for?' },
      o: [
        { zh: '压缩上下文', en: 'Compacting context' },
        { zh: '查看用量情况', en: 'Checking your usage' },
        { zh: '删除会话', en: 'Deleting the session' },
        { zh: '切换模型', en: 'Switching models' },
      ], a: 1,
      e: { zh: '它是一次性的状态查看工具，不进任务队列。', en: 'It is a one-off status tool and does not enter the task queue.' } },

    { t: 'multi', fig: 'compact-squeeze',
      q: { zh: '哪些做法能真正减少上下文压力？（多选）', en: 'Which genuinely reduce context pressure? (multiple)' },
      o: [
        { zh: '限制它读哪些文件、读多少', en: 'Bounding which files and how much it reads' },
        { zh: '把结论写进文件，然后换新会话继续', en: 'Writing conclusions to a file and continuing in a new session' },
        { zh: '让它总结当前进展后继续（压缩）', en: 'Having it summarise progress and continue (compacting)' },
        { zh: '把回复语言换成英文', en: 'Switching the reply language' },
      ], a: [0, 1, 2],
      e: { zh: '语言会轻微影响 token 数，但不是解决上下文压力的手段。', en: 'Language slightly affects token counts but is not a remedy for context pressure.' } },

    { t: 'single', fig: 'rulebook',
      q: { zh: '「结论先说，理由后说」这条要求写进 CLAUDE.md 的价值是：', en: 'Putting "conclusion first, reasoning after" into CLAUDE.md is valuable because:' },
      o: [
        { zh: '让 AI 写得更快', en: 'It writes faster' },
        { zh: '固化你偏好的沟通方式，之后每次回复都省你的阅读时间', en: 'It locks in your preferred communication style and saves your reading time every time' },
        { zh: '减少 token 消耗', en: 'It cuts token usage' },
        { zh: '提高准确率', en: 'It improves accuracy' },
      ], a: 1,
      e: { zh: '输出习惯类的约定，收益在于每一次交互都省一点。', en: 'Output-habit conventions pay off a little on every single interaction.' } },

    { t: 'judge', fig: 'split-steps',
      q: { zh: '任务拆分之后，每一步的产出物应该是「你能打开看的东西」，而不是「它口头说做完了」。', en: 'After slicing, each step should produce something you can open — not just a verbal "done".' },
      a: true,
      e: { zh: '可检查的产出物是止损能力的来源。', en: 'Inspectable deliverables are where your ability to contain damage comes from.' } },
  ],
});
