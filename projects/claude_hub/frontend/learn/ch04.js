// 第 4 章：文字活 —— 纪要、周报、邮件、翻译，把重复写作变成流水线
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch04',
  icon: '✍️',
  minutes: 16,
  title: { zh: '文字活：会议纪要、周报、对外邮件', en: 'Writing work: minutes, weekly updates, client emails' },
  goal: {
    zh: '学会把素材喂给 AI、用「角色 + 受众 + 风格 + 长度」控制文风，把每周都要写的东西做成可复用的提示词模板。',
    en: 'Feed it your material, control tone with role + audience + style + length, and turn recurring writing into reusable prompt templates.',
  },
  praise: {
    zh: '<p>会写提示词模板的人，和不会的人，效率差的不是一点半点 —— 你现在有了自己的<b>模板库</b>，每周的纪要和周报可以在两分钟内出初稿。</p><p>下一章我们把文字换成<b>数字和图</b>：让 AI 做一份带图表的分析报告。</p>',
    en: '<p>The gap between people who keep prompt templates and people who do not is enormous — you now have a <b>template library</b>, and your weekly minutes and updates can be drafted in two minutes.</p><p>Next we swap words for <b>numbers and charts</b>: a full analysis report with visuals.</p>',
  },

  sections: [
    {
      h: { zh: '它写得空，八成是你没给素材', en: 'Empty writing usually means you gave it nothing to work with' },
      fig: 'material-in',
      body: {
        zh: `<div class="lp-oneline">它不知道会上谁说了什么、你们项目叫什么、老板在意什么。这些得你给。</div>
<p>给素材三种方式：<b>短的直接贴对话框</b>；<b>长的存成文件放工作目录，告诉它文件名</b>；<b>散在多处的让它自己去读</b>（「读一下 docs/ 下所有 md，总结项目现状」）。</p>
<details class="lp-fold"><summary>⚠️ 交出去之前想一秒</summary><div class="lp-fold-body">
<p>薪资、身份证号、客户联系方式、未公开的财务数据——<b>这个任务真的需要这些字段吗？</b></p>
<p>不需要就先删掉或换成占位符。判断标准就这一句话。</p>
</div></details>`,
        en: `<div class="lp-oneline">It does not know who said what, what your project is called, or what your boss cares about. That is on you.</div>
<p>Three ways to supply material: <b>short — paste it in</b>; <b>long — save a file in the workspace and name it</b>; <b>scattered — let it go read</b> ("read every md under docs/ and summarise the status").</p>
<details class="lp-fold"><summary>⚠️ One second before you hand it over</summary><div class="lp-fold-body">
<p>Salaries, ID numbers, client contacts, unreleased financials — <b>does this task actually need those fields?</b></p>
<p>If not, strip them or use placeholders. That one question is the whole test.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '控制文风的四个旋钮', en: 'Four knobs that control tone' },
      fig: 'tone-knobs',
      body: {
        zh: `<div class="lp-oneline">角色 + 受众 + 风格 + 长度。其中「长度」见效最快。</div>
<table>
<tr><th>旋钮</th><th>怎么写</th></tr>
<tr><td><b>角色</b></td><td>「你是一位做过五年项目管理的 PM」</td></tr>
<tr><td><b>受众</b></td><td>「读者是不懂技术细节的销售总监」</td></tr>
<tr><td><b>风格</b></td><td>「简洁、直接、不要客套话」</td></tr>
<tr><td><b>长度</b></td><td>「不超过 300 字」「每条不超过两行」</td></tr>
</table>
<details class="lp-fold"><summary>🍊 还有一招比这四个都好使</summary><div class="lp-fold-body">
<p><b>给它一份范例。</b></p>
<pre>下面是我们团队上周的纪要，请严格按这个格式和语气写本周的：
（贴上上周纪要）</pre>
<p>像教新人写周报：与其讲十条"要简洁、要突出重点"，不如直接甩一份写得好的过去看。<b>你手上任何一份"写得对"的旧文档，都是免费范例。</b></p>
</div></details>`,
        en: `<div class="lp-oneline">Role + audience + style + length. "Length" works fastest.</div>
<table>
<tr><th>Knob</th><th>How to write it</th></tr>
<tr><td><b>Role</b></td><td>"You are a PM with five years of delivery experience"</td></tr>
<tr><td><b>Audience</b></td><td>"The reader is a sales director with no technical background"</td></tr>
<tr><td><b>Style</b></td><td>"Concise, direct, no pleasantries"</td></tr>
<tr><td><b>Length</b></td><td>"Under 250 words", "max two lines per bullet"</td></tr>
</table>
<details class="lp-fold"><summary>🍊 One trick beats all four</summary><div class="lp-fold-body">
<p><b>Give it an example.</b></p>
<pre>Here is last week's minutes from our team. Match this format and tone exactly for this week:
(paste last week's minutes)</pre>
<p>Like training a new hire: ten rules about "be concise, lead with the point" lose to one good past example. <b>Any old document that reads right is a free sample.</b></p>
</div></details>`,
      },
    },
    {
      h: { zh: '会议纪要：关键是把猜测和事实分开', en: 'Minutes: the trick is separating guesses from facts' },
      fig: 'trace-quote',
      body: {
        zh: `<div class="lp-oneline">纪要出事故，都是因为把 AI 的猜测写成了结论。</div>
<p>两个要求就能挡住：<b>每条待办带一列「来源原话」</b>，<b>结尾加一节「我不确定的地方」</b>。这样你只需要重点核对那几条。</p>
<details class="lp-fold"><summary>📝 完整指令（照抄改改）</summary><div class="lp-fold-body">
<pre>读取 meeting_raw.txt，这是一次项目周会的语音转写稿，有错别字和口水话。

【产出】生成 会议纪要.md，结构固定：
一、会议信息（时间、参会人——只写原文能识别到的）
二、结论与决议（只写已经拍板的，每条一句话）
三、待办事项（表格：事项 / 负责人 / 截止时间 / 来源原话）
四、争议与未决（有分歧没结论的，注明各方观点）
五、我不确定的地方（转写有歧义、听不清、责任人不明的，全列出来）

【风格】客观，不加评论，不要出现「大家一致认为」这类你推断出来的内容。
【约束】
- 只写原文确实说过的，不要补充你认为合理的部分；
- 没提截止时间就写「未指定」，不要自己编一个；
- 「来源原话」要摘录原文对应那句，方便我回查。</pre>
</div></details>
<details class="lp-fold"><summary>🔍 什么叫「幻觉」</summary><div class="lp-fold-body">
<p>AI 编造出<b>看起来完全合理、但根本不存在</b>的内容，叫幻觉（hallucination）。</p>
<p>它最危险的地方不是错得离谱，而是<b>错得很像对的</b>——「张经理确认下周五前完成」，读起来天衣无缝，但会上没人说过这句。</p>
<p>所以那两个要求（来源原话 + 不确定清单）不是形式主义，是把幻觉挡在正式文档外面的唯一手段。</p>
</div></details>`,
        en: `<div class="lp-oneline">Minutes go wrong when the AI's guess gets written down as a decision.</div>
<p>Two requirements stop it: <b>a "source quote" column on every action item</b>, and <b>a closing section listing what it was unsure about</b>. Then you only verify those few lines.</p>
<details class="lp-fold"><summary>📝 Full instruction (copy and adapt)</summary><div class="lp-fold-body">
<pre>Read meeting_raw.txt — a raw voice transcript of a weekly project meeting, with typos and filler.

[Output] Produce minutes.md with this fixed structure:
1. Meeting info (time, attendees — only those identifiable in the text)
2. Decisions (only what was actually decided; one sentence each)
3. Action items (table: item / owner / due date / source quote)
4. Open disagreements (debated without conclusion, with each side's position)
5. Things I am unsure about (ambiguous transcription, inaudible parts, unclear ownership)

[Style] Objective, no commentary, no invented consensus like "everyone agreed".
[Constraints]
- Only write what the transcript says; do not add what seems reasonable;
- If no due date was mentioned, write "unspecified" — never invent one;
- The source quote must be the matching line so I can trace it back.</pre>
</div></details>
<details class="lp-fold"><summary>🔍 What "hallucination" means</summary><div class="lp-fold-body">
<p>When an AI produces content that is <b>perfectly plausible and completely nonexistent</b>, that is a hallucination.</p>
<p>The danger is not wild nonsense — it is <b>being wrong in a way that reads right</b>: "Zhang confirmed delivery by next Friday" is seamless prose, and nobody said it.</p>
<p>So those two requirements are not bureaucracy; they are the only thing keeping hallucination out of an official document.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '周报：做成模板，以后两分钟出初稿', en: 'Weekly updates: template it once, draft in two minutes forever' },
      fig: 'template-file',
      body: {
        zh: `<div class="lp-oneline">每周都写、格式不变、只有内容换 —— 这种活就该做成模板文件。</div>
<p>在工作目录建 <code>prompts/周报.md</code>，把固定要求写进去。之后每周只要说：<b>「按 prompts/周报.md 的要求，用下面这些内容写周报：……」</b></p>
<details class="lp-fold"><summary>📝 模板内容（照抄改改）</summary><div class="lp-fold-body">
<pre>你是我的助理，帮我写本周周报。

【读者】我的直属领导。他关心进度、风险和需要他决策的事，不关心过程细节。
【结构】
1. 本周完成（3-5 条，一条一行，写结果不写过程，能量化就量化）
2. 下周计划（3-5 条）
3. 风险与需要支持（没有就写「无」，不要凑数）
【风格】陈述句，不堆形容词，不写「积极推进」「持续赋能」这类空话。
【长度】全文不超过 400 字。</pre>
<p>注意「没有就写『无』，不要凑数」——固定结构 + 不许留空 = 逼它编。要主动允许留空。</p>
</div></details>
<details class="lp-fold"><summary>🔍 更省事的做法</summary><div class="lp-fold-body">
<p>如果你的工作痕迹本来就在文件里（会话记录、改过的文件、任务清单），直接让它去读：</p>
<pre>读一下我这周在 work/ 下改动过的文件和 notes/ 里的日志，按周报模板起草。</pre>
<p>连素材都不用自己整理了。但<b>核对这一步永远省不掉</b>。</p>
</div></details>`,
        en: `<div class="lp-oneline">Written weekly, same format, only the content changes — the perfect thing to template.</div>
<p>Create <code>prompts/weekly.md</code> in your workspace with the fixed requirements. From then on: <b>"Follow prompts/weekly.md and write my update from this material: …"</b></p>
<details class="lp-fold"><summary>📝 The template (copy and adapt)</summary><div class="lp-fold-body">
<pre>You are my assistant writing my weekly update.

[Reader] My direct manager. He cares about progress, risks and decisions he must make — not process detail.
[Structure]
1. Done this week (3-5 bullets, one line each, outcomes not activities, quantified where possible)
2. Next week (3-5 bullets)
3. Risks and support needed (write "none" if none — do not pad)
[Style] Declarative sentences. No adjective stacking, no corporate filler.
[Length] Under 300 words total.</pre>
<p>Note "write 'none' if none — do not pad": a fixed structure plus no-empty-sections forces invention. Explicitly permit "none".</p>
</div></details>
<details class="lp-fold"><summary>🔍 An even lazier version</summary><div class="lp-fold-body">
<p>If your work already leaves traces in files (session logs, changed files, task lists), point it there:</p>
<pre>Read the files I changed this week under work/ and the logs in notes/, then draft the update using the template.</pre>
<p>No manual gathering at all. But <b>verification is still never optional</b>.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '对外邮件：风险最高，多走一步', en: 'External emails: highest risk, one extra step' },
      fig: 'external-risk',
      body: {
        zh: `<div class="lp-oneline">发出去就收不回来，所以永远让它给两版，你来挑。</div>
<p>对比着看，比只看一版更容易发现哪句话不合适。</p>
<details class="lp-fold"><summary>📝 客诉回复（照抄改改）</summary><div class="lp-fold-body">
<pre>客户投诉我们上周交付延迟了三天。事实是：延迟属实，原因是他们那边接口调整，
我们已经补上，后续不会再延。

请写一封回复邮件，给我两个版本：
A 版 —— 正式、克制，适合抄送双方领导；
B 版 —— 稍缓和、偏合作口吻，适合只发对接人。

两版都要：先承认事实、再说明原因（不推卸也不过度道歉）、最后给具体补救与承诺。
不要出现「深表歉意」「高度重视」这类套话。每版不超过 200 字。</pre>
</div></details>
<details class="lp-fold"><summary>⚠️ 发出去之前必须自己看的五样</summary><div class="lp-fold-body">
<p><b>数字、日期、人名、金额、承诺的时间点。</b></p>
<p>特别注意：它会把「下周五」翻译成一个具体日期，<b>而那个日期很可能是错的</b>。</p>
<p>翻译任务同理：让它「输出两列表格，左列原文右列译文」，逐句核对成本最低。</p>
</div></details>`,
        en: `<div class="lp-oneline">It cannot be recalled once sent — so always ask for two versions and pick one.</div>
<p>Comparing two drafts surfaces awkward lines that a single draft hides.</p>
<details class="lp-fold"><summary>📝 Complaint reply (copy and adapt)</summary><div class="lp-fold-body">
<pre>A client complained our delivery slipped three days. Facts: the delay is real, caused by an interface change
on their side, we have caught up, and it will not recur.

Write a reply in two versions:
A — formal and restrained, suitable for cc'ing both managers;
B — warmer, collaborative, for the counterpart only.

Both must: acknowledge the fact, explain the cause (neither deflecting nor over-apologising),
and end with a concrete remedy and commitment. No corporate filler. Under 150 words each.</pre>
</div></details>
<details class="lp-fold"><summary>⚠️ Five things to check yourself before sending</summary><div class="lp-fold-body">
<p><b>Numbers, dates, names, amounts, committed deadlines.</b></p>
<p>Especially: it will happily turn "next Friday" into a concrete date, <b>and that date is often wrong</b>.</p>
<p>Same for translation — ask for "a two-column table, source left, translation right" so verification is nearly free.</p>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: '提示词模板', en: 'Prompt template' }, d: { zh: '把固定要求写成文件，每次只换素材，重复写作的标准做法', en: 'Fixed requirements saved as a file; only the material changes each time' } },
    { k: { zh: '角色设定', en: 'Role setting' }, d: { zh: '「你是一位…」，决定 AI 用什么专业视角写', en: '"You are a…" — sets the professional lens the AI writes from' } },
    { k: { zh: '受众', en: 'Audience' }, d: { zh: '文章写给谁看，决定详略、术语量和语气', en: 'Who reads it — sets depth, jargon level and tone' } },
    { k: { zh: '范例驱动', en: 'Example-driven prompting' }, d: { zh: '给一份写得对的旧文档当样板，比描述风格有效得多', en: 'Handing over a correct old document as a sample beats describing style' } },
    { k: { zh: '幻觉 / Hallucination', en: 'Hallucination' }, d: { zh: 'AI 编造出看起来合理但并不存在的内容', en: 'The AI inventing plausible content that does not exist' } },
    { k: { zh: '可追溯', en: 'Traceability' }, d: { zh: '每条结论都能指回原文出处，纪要类文档的必备属性', en: 'Every conclusion points back to its source — essential for minutes' } },
  ],

  quiz: [
    { t: 'single', fig: 'doc-draft',
      q: { zh: 'AI 写出来的周报「不像人话、全是空话」，最可能的根因是：', en: 'Your AI-written weekly update is "all corporate filler". The most likely root cause:' },
      o: [
        { zh: '模型不够聪明', en: 'The model is not smart enough' },
        { zh: '你没给素材，也没给受众、风格、长度的约束', en: 'You gave no material, and no audience, style or length constraints' },
        { zh: '用错了语言', en: 'Wrong language' },
        { zh: '网络太慢', en: 'Slow network' },
      ], a: 1,
      e: { zh: '没有素材它只能造词；没有约束它默认写"安全"的官腔。', en: 'With no material it can only generate filler; with no constraints it defaults to safe corporate tone.' } },

    { t: 'multi', fig: 'tone-knobs',
      q: { zh: '控制文风的四个旋钮是哪些？（多选）', en: 'Which are the four tone knobs? (multiple)' },
      o: [
        { zh: '角色', en: 'Role' },
        { zh: '受众', en: 'Audience' },
        { zh: '风格', en: 'Style' },
        { zh: '长度', en: 'Length' },
      ], a: [0, 1, 2, 3],
      e: { zh: '四个都是。其中长度限制往往是立竿见影的那一个。', en: 'All four. Length is usually the one with the most immediate effect.' } },

    { t: 'single', fig: 'example-copy',
      q: { zh: '想让 AI 写出「和我们团队一贯风格一致」的文档，最有效的做法是：', en: 'To get output matching your team\'s established style, the most effective move is:' },
      o: [
        { zh: '用形容词详细描述你们的风格', en: 'Describe your style with many adjectives' },
        { zh: '直接给它一份写得对的旧文档当范例', en: 'Hand it a correct old document as an example' },
        { zh: '让它多写几遍', en: 'Have it write several drafts' },
        { zh: '换更贵的模型', en: 'Use a more expensive model' },
      ], a: 1,
      e: { zh: '范例驱动是控制风格性价比最高的手段。', en: 'Example-driven prompting is the highest-leverage way to control style.' } },

    { t: 'single', fig: 'hallucination',
      q: { zh: '会议纪要里为什么要加一节「我不确定的地方」？', en: 'Why add a "things I am unsure about" section to minutes?' },
      o: [
        { zh: '让纪要看起来更长', en: 'To make the minutes longer' },
        { zh: '把 AI 的猜测和事实分开，你只需重点核对这几条', en: 'To separate the AI\'s guesses from facts so you only verify a few lines' },
        { zh: '规避责任', en: 'To dodge responsibility' },
        { zh: '凑格式', en: 'To fill out the format' },
      ], a: 1,
      e: { zh: '纪要事故的根源就是「猜测被当成了结论」。', en: 'Minutes go wrong when a guess is recorded as a decision.' } },

    { t: 'single', fig: 'trace-quote',
      q: { zh: '待办事项表里要求加一列「来源原话」，主要价值是：', en: 'Requiring a "source quote" column in the action-item table mainly gives you:' },
      o: [
        { zh: '凑字数', en: 'More words' },
        { zh: '可追溯——每条待办都能回查原文，避免断章取义', en: 'Traceability — every item can be checked against the transcript' },
        { zh: '让 AI 更努力', en: 'It makes the AI try harder' },
        { zh: '方便打印', en: 'Better printing' },
      ], a: 1,
      e: { zh: '可追溯是所有会议文档的必备属性。', en: 'Traceability is essential for any meeting document.' } },

    { t: 'judge', fig: 'hallucination',
      q: { zh: '原文没提截止时间时，让 AI 按常理补一个合理的日期，是可以接受的。', en: 'When no due date was mentioned, it is acceptable for the AI to fill in a reasonable one.' },
      a: false,
      e: { zh: '这就是幻觉进入正式文档的典型路径。应写"未指定"。', en: 'That is exactly how hallucination enters an official document. Write "unspecified".' } },

    { t: 'single', fig: 'hallucination',
      q: { zh: '「幻觉（Hallucination）」指的是：', en: '"Hallucination" refers to:' },
      o: [
        { zh: 'AI 运行速度变慢', en: 'The AI slowing down' },
        { zh: 'AI 编造出看起来合理但并不存在的内容', en: 'The AI inventing plausible content that does not exist' },
        { zh: 'AI 拒绝回答', en: 'The AI refusing to answer' },
        { zh: '屏幕闪烁', en: 'Screen flicker' },
      ], a: 1,
      e: { zh: '看起来越合理越危险，因为不容易被发现。', en: 'The more plausible it looks, the more dangerous — it slips past review.' } },

    { t: 'multi', fig: 'material-in',
      q: { zh: '给 AI 提供素材有哪些方式？（多选）', en: 'Which are valid ways to supply material? (multiple)' },
      o: [
        { zh: '直接贴进对话框', en: 'Paste into the chat box' },
        { zh: '放进工作目录并告诉它文件名', en: 'Put it in the workspace and name the file' },
        { zh: '让它自己去读某个目录下的所有文件', en: 'Let it read every file under a directory' },
        { zh: '把资料放在只有你公司内网能访问的系统里，然后告诉它网址', en: 'Leave it in an intranet system and give it the URL' },
      ], a: [0, 1, 2],
      e: { zh: '它访问不到你公司内网的系统，必须先把内容取出来。', en: 'It cannot reach your intranet; the content must be extracted first.' } },

    { t: 'single', fig: 'template-file',
      q: { zh: '写周报最值得做成模板的原因是：', en: 'Weekly updates are worth templating because:' },
      o: [
        { zh: '周报最难写', en: 'They are the hardest to write' },
        { zh: '每周都要写、格式固定、只有内容变', en: 'Written every week, fixed format, only content changes' },
        { zh: '领导要求必须用模板', en: 'Your manager demands a template' },
        { zh: '模板能提高文采', en: 'Templates improve prose' },
      ], a: 1,
      e: { zh: '高频 + 格式稳定 = 模板化收益最大。', en: 'High frequency plus stable format = maximum templating payoff.' } },

    { t: 'single', fig: 'two-versions',
      q: { zh: '对外邮件为什么建议让 AI 一次给两个版本？', en: 'Why ask for two versions of an external email?' },
      o: [
        { zh: '显得工作量大', en: 'To look busy' },
        { zh: '对外内容不可撤回，两版可选让你在语气上有余地、也更容易发现问题', en: 'External content cannot be recalled; two options give you tonal room and surface issues' },
        { zh: '模型更喜欢写两版', en: 'The model prefers writing two' },
        { zh: '第二版一定更好', en: 'The second is always better' },
      ], a: 1,
      e: { zh: '对比着看，比只看一版更容易发现哪句话不合适。', en: 'Comparing two drafts surfaces awkward lines that a single draft hides.' } },

    { t: 'multi', fig: 'external-risk',
      q: { zh: '对外邮件发出前，哪些内容必须你自己再核一遍？（多选）', en: 'Before sending an external email, which must you personally verify? (multiple)' },
      o: [
        { zh: '具体日期和时间点', en: 'Specific dates and deadlines' },
        { zh: '金额与数字', en: 'Amounts and figures' },
        { zh: '人名与公司名', en: 'Names of people and companies' },
        { zh: '段落之间的空行数量', en: 'The number of blank lines between paragraphs' },
      ], a: [0, 1, 2],
      e: { zh: '「下周五」被翻译成一个具体日期时，很可能是错的。', en: '"Next Friday" turned into a concrete date is very often wrong.' } },

    { t: 'single', fig: 'trace-quote',
      q: { zh: '翻译任务要求「输出两列表格，左列原文右列译文」，好处是：', en: 'Asking for a two-column table (source | translation) helps because:' },
      o: [
        { zh: '表格更美观', en: 'Tables look nicer' },
        { zh: '方便逐句核对，也方便同事复用', en: 'It enables line-by-line verification and reuse by colleagues' },
        { zh: '省 token', en: 'It saves tokens' },
        { zh: '翻译质量会自动提高', en: 'Translation quality automatically improves' },
      ], a: 1,
      e: { zh: '对照排版让核对成本降到最低。', en: 'Side-by-side layout makes verification nearly free.' } },

    { t: 'single', fig: 'tone-knobs',
      q: { zh: '「你是一位做过五年项目管理的 PM」这句话属于哪个旋钮？', en: '"You are a PM with five years of delivery experience" is which knob?' },
      o: [
        { zh: '角色', en: 'Role' },
        { zh: '受众', en: 'Audience' },
        { zh: '长度', en: 'Length' },
        { zh: '约束', en: 'Constraint' },
      ], a: 0,
      e: { zh: '角色决定它用什么专业视角组织内容。', en: 'Role sets the professional lens it organises content through.' } },

    { t: 'single', fig: 'tone-knobs',
      q: { zh: '「读者是不了解技术细节的销售总监」这句话的作用是：', en: 'What does "the reader is a sales director with no technical background" do?' },
      o: [
        { zh: '决定文章长度', en: 'Sets the length' },
        { zh: '决定详略程度和术语使用量', en: 'Sets the depth and how much jargon to use' },
        { zh: '决定用什么模型', en: 'Selects the model' },
        { zh: '没有实际作用', en: 'Nothing useful' },
      ], a: 1,
      e: { zh: '同一件事写给技术和写给销售，详略完全不同。', en: 'The same content written for engineers versus sales differs completely in depth.' } },

    { t: 'judge', fig: 'length-cap',
      q: { zh: '「全文不超过 400 字」这类长度限制，是控制啰嗦最有效的手段之一。', en: 'A hard length cap like "under 300 words" is one of the most effective anti-waffle tools.' },
      a: true,
      e: { zh: '长度一限，废话自动消失，因为它必须做取舍。', en: 'Cap the length and filler disappears — it is forced to prioritise.' } },

    { t: 'single', fig: 'issues-funnel',
      q: { zh: '把会上「有分歧但没结论」的内容单独列一节，价值在于：', en: 'A separate section for "debated but undecided" items is valuable because:' },
      o: [
        { zh: '让纪要更长', en: 'It lengthens the minutes' },
        { zh: '避免把未决事项写成结论，也提醒相关方还需要跟进', en: 'It prevents open items being recorded as decisions and flags what still needs follow-up' },
        { zh: '让 AI 更客观', en: 'It makes the AI objective' },
        { zh: '方便存档', en: 'It helps archiving' },
      ], a: 1,
      e: { zh: '「假装达成一致」是纪要最常见的失真方式。', en: 'Faking consensus is the most common way minutes distort reality.' } },

    { t: 'single', fig: 'prompt-4parts',
      q: { zh: '「不要出现『大家一致认为』这类你推断出来的内容」属于：', en: '"Do not write invented consensus like \'everyone agreed\'" is a:' },
      o: [
        { zh: '产出要求', en: 'Output spec' },
        { zh: '约束（防止 AI 补充事实）', en: 'Constraint (preventing invented facts)' },
        { zh: '角色设定', en: 'Role setting' },
        { zh: '受众说明', en: 'Audience note' },
      ], a: 1,
      e: { zh: '凡是「不许做什么」，都是约束。', en: 'Anything phrased as "do not" is a constraint.' } },

    { t: 'multi', fig: 'mask-data',
      q: { zh: '哪些内容在交给 AI 之前应该先考虑删除或脱敏？（多选）', en: 'Which should you consider stripping or masking before handing over? (multiple)' },
      o: [
        { zh: '员工薪资明细', en: 'Individual salary data' },
        { zh: '客户身份证号 / 手机号', en: 'Customer ID numbers or phone numbers' },
        { zh: '尚未公开的财务数据', en: 'Unreleased financial data' },
        { zh: '公司官网的公开介绍', en: 'The public blurb on your website' },
      ], a: [0, 1, 2],
      e: { zh: '判断标准很简单：这个任务真的需要这个字段吗？', en: 'The test is simple: does this task actually need that field?' } },

    { t: 'single', fig: 'material-in',
      q: { zh: '素材有一份 8 万字的转写稿，最合适的给法是：', en: 'Your material is an 80,000-word transcript. The best way to supply it:' },
      o: [
        { zh: '全部贴进对话框', en: 'Paste it all into the chat box' },
        { zh: '存成文件放进工作目录，让 AI 去读', en: 'Save it as a file in the workspace and let the AI read it' },
        { zh: '截图发过去', en: 'Send screenshots' },
        { zh: '分 50 次发送', en: 'Send it in 50 messages' },
      ], a: 1,
      e: { zh: '长素材走文件，既方便复用，也不会把对话框撑爆。', en: 'Long material goes through files — reusable, and it does not blow up the chat.' } },

    { t: 'single', fig: 'length-cap',
      q: { zh: '让 AI 起草周报时，「写结果不写过程，能量化就量化」这条要求解决的问题是：', en: 'In a weekly update, "outcomes not activities, quantified where possible" fixes:' },
      o: [
        { zh: '字数太少', en: 'Too few words' },
        { zh: '避免写成流水账，让领导一眼看到进展', en: 'Avoiding an activity log so your manager sees progress at a glance' },
        { zh: '避免错别字', en: 'Typos' },
        { zh: '提高翻译准确度', en: 'Translation accuracy' },
      ], a: 1,
      e: { zh: '「做了三次沟通」和「方案已定稿并通过评审」，价值天差地别。', en: '"Held three meetings" versus "spec finalised and approved" — completely different value.' } },

    { t: 'judge', fig: 'template-file',
      q: { zh: '把提示词模板存成文件放在工作目录里，比每次重新描述要求更高效。', en: 'Saving a prompt template as a file beats re-describing requirements each time.' },
      a: true,
      e: { zh: '模板是可复用资产，和第 3 章的脚本是同一个道理。', en: 'A template is a reusable asset — the same idea as the script in Chapter 3.' } },

    { t: 'single', fig: 'tone-knobs',
      q: { zh: '客户投诉邮件的回复中，「不推卸也不过度道歉」这条要求属于：', en: 'In a complaint reply, "neither deflecting nor over-apologising" is:' },
      o: [
        { zh: '长度', en: 'Length' },
        { zh: '风格 / 语气', en: 'Style / tone' },
        { zh: '受众', en: 'Audience' },
        { zh: '产出结构', en: 'Output structure' },
      ], a: 1,
      e: { zh: '语气分寸属于风格旋钮。', en: 'Calibrating tone is the style knob.' } },

    { t: 'single', fig: 'intake-limit',
      q: { zh: '让 AI 直接读 <code>docs/</code> 下所有文件来总结项目现状，最需要注意的是：', en: 'When letting it read every file under <code>docs/</code> to summarise status, watch out for:' },
      o: [
        { zh: '文件名要用英文', en: 'Filenames must be ASCII' },
        { zh: '目录里如果有大量无关或过期文件，会浪费上下文并污染结论', en: 'Irrelevant or outdated files waste context and pollute the conclusion' },
        { zh: '必须先压缩文件', en: 'Files must be compressed first' },
        { zh: '只能读 5 个文件', en: 'It can only read five files' },
      ], a: 1,
      e: { zh: '给它读之前，先想清楚这个目录里都有什么。', en: 'Know what is in the directory before pointing it there.' } },

    { t: 'multi', fig: 'doc-draft',
      q: { zh: '一条好的纪要指令通常会包含哪些部分？（多选）', en: 'A good minutes instruction usually includes: (multiple)' },
      o: [
        { zh: '固定的输出结构（几个章节分别写什么）', en: 'A fixed output structure (what goes in each section)' },
        { zh: '「只写原文说过的内容」这类防幻觉约束', en: 'Anti-hallucination constraints like "only what the transcript says"' },
        { zh: '不确定内容的处理方式', en: 'How to handle uncertain content' },
        { zh: '要求 AI 评价与会者表现', en: 'A request to rate the attendees\' performance' },
      ], a: [0, 1, 2],
      e: { zh: '评价与会者既超出职责，也是纯粹的猜测。', en: 'Rating attendees is both out of scope and pure speculation.' } },

    { t: 'single', fig: 'tone-knobs',
      q: { zh: '同样是「帮我改一下这段话」，加上哪句话效果提升最大？', en: 'For "polish this paragraph", which addition helps most?' },
      o: [
        { zh: '「改得好一点」', en: '"Make it better"' },
        { zh: '「改给不懂技术的客户看，控制在 100 字内，去掉所有专业术语」', en: '"For a non-technical client, under 80 words, no jargon"' },
        { zh: '「用你最擅长的方式改」', en: '"Use whatever style you like"' },
        { zh: '「多改几版」', en: '"Give me lots of versions"' },
      ], a: 1,
      e: { zh: '受众 + 长度 + 风格，三个旋钮一次拧到位。', en: 'Audience, length and style — three knobs set at once.' } },

    { t: 'single', fig: 'hallucination',
      q: { zh: '你发现 AI 写的纪要里有一条结论，会上其实没人这么说。你应该：', en: 'You find a "decision" in the minutes that nobody actually made. You should:' },
      o: [
        { zh: '算了，反正差不多', en: 'Let it go — close enough' },
        { zh: '删掉它，并在下次指令里强化「只写原文说过的内容」和「来源原话」要求', en: 'Remove it, and strengthen "only what the transcript says" plus the source-quote requirement next time' },
        { zh: '责怪模型', en: 'Blame the model' },
        { zh: '换一个模型重写', en: 'Rewrite with another model' },
      ], a: 1,
      e: { zh: '发现幻觉后要改进指令，否则下次还会犯。', en: 'After catching a hallucination, harden the instruction or it recurs.' } },

    { t: 'judge', fig: 'example-copy',
      q: { zh: '让 AI 参考上周的纪要格式来写本周的，属于「范例驱动」。', en: 'Having it match last week\'s minutes format is example-driven prompting.' },
      a: true,
      e: { zh: '你手上任何一份"写得对"的旧文档都是免费范例。', en: 'Any old document that reads right is a free example.' } },

    { t: 'single', fig: 'hallucination',
      q: { zh: '「风险与需要支持：没有就写『无』，不要凑数」这条约束防止的是：', en: '"Risks: write \'none\' if none — do not pad" prevents:' },
      o: [
        { zh: '文章太短', en: 'Short documents' },
        { zh: 'AI 为了填满结构而编造不存在的风险', en: 'The AI inventing risks just to fill the structure' },
        { zh: '格式错乱', en: 'Broken formatting' },
        { zh: '翻译错误', en: 'Translation errors' },
      ], a: 1,
      e: { zh: '固定结构 + 不许留空 = 逼它编。要主动允许留空。', en: 'Fixed structure plus no-empty-sections forces invention. Explicitly permit "none".' } },

    { t: 'single', fig: 'material-in',
      q: { zh: '把工作痕迹（改动过的文件、日志）直接让 AI 读来起草周报，最大的好处是：', en: 'Pointing it at your actual work traces to draft the update mainly gives you:' },
      o: [
        { zh: '周报会更长', en: 'A longer update' },
        { zh: '省掉自己整理素材这一步，而且内容更贴近实际做的事', en: 'It skips manual gathering and stays closer to what you actually did' },
        { zh: '自动发送给领导', en: 'Automatic sending to your manager' },
        { zh: '不需要再核对', en: 'No need to verify' },
      ], a: 1,
      e: { zh: '省掉整理，但核对这一步永远省不掉。', en: 'It saves gathering, never verification.' } },

    { t: 'single', fig: 'external-risk',
      q: { zh: '为什么说「对外的内容风险最高」？', en: 'Why are external documents the highest-risk category?' },
      o: [
        { zh: '因为要用英文', en: 'Because they are in another language' },
        { zh: '因为发出去就收不回来，错误会直接损害信任与合作关系', en: 'Because they cannot be recalled; errors damage trust and the relationship directly' },
        { zh: '因为字数多', en: 'Because they are longer' },
        { zh: '因为需要审批', en: 'Because they need approval' },
      ], a: 1,
      e: { zh: '内部文档错了可以改，对外的错了只能道歉。', en: 'An internal mistake is edited; an external one is apologised for.' } },
  ],
});
