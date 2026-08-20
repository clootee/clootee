// 第 7 章：做一个能发给同事用的网页小工具 —— 从需求到迭代到交付
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch07',
  icon: '🛠',
  minutes: 20,
  title: { zh: '做个小工具：从"要是有个网页能算就好了"到真的有', en: 'Build a tool: from "if only there were a page for this" to actually having one' },
  goal: {
    zh: '独立做出一个单文件网页小工具并发给同事用；看懂 HTML/CSS/JS 各管什么；学会描述 bug 和用 Git 存档。',
    en: 'Ship a single-file web tool a colleague can use; understand what HTML, CSS and JS each do; learn to report bugs and to snapshot work with Git.',
  },
  praise: {
    zh: '<p>你刚刚<b>做出了一个别人能用的软件</b>。三小时前你可能还觉得这是程序员才干的事。</p><p>最后一章是这门课的毕业设计：<b>用 TypeScript 给 Clootee 本身加一个真功能</b>——前端加界面、后端加接口、编译、重启、验证。听起来吓人，但你已经有全部方法论了。</p>',
    en: '<p>You just <b>shipped software other people can use</b>. Three hours ago you probably thought that was a programmer-only activity.</p><p>The final chapter is the capstone: <b>adding a real feature to Clootee itself in TypeScript</b> — a UI panel, a backend route, compile, restart, verify. It sounds intimidating, but you already have every method you need.</p>',
  },

  sections: [
    {
      h: { zh: '为什么从「单文件网页」开始', en: 'Why start with a single-file web page' },
      fig: 'html-css-js',
      body: {
        zh: `<div class="lp-oneline">一个 .html 文件，双击就能用，发给谁都行，对方什么都不用装。</div>
<p>网页由三部分组成，你不用会写，但要知道谁管什么——<b>说得准，改得就快</b>：</p>
<table>
<tr><th></th><th>管什么</th><th>类比</th></tr>
<tr><td><b>HTML</b></td><td>页面上有什么（输入框、按钮、表格）</td><td>墙和门窗</td></tr>
<tr><td><b>CSS</b></td><td>长什么样（颜色、字号、间距）</td><td>装修和家具</td></tr>
<tr><td><b>JavaScript</b></td><td>会做什么（点了按钮之后发生什么）</td><td>水电和开关</td></tr>
</table>
<p>「按钮颜色太浅」是 CSS 的事，「算出来的数不对」是 JS 的事。</p>
<details class="lp-fold"><summary>🍊 什么活值得做成小工具</summary><div class="lp-fold-body">
<p>判断标准：<b>同事每次都来问你「这个怎么算」</b>的那些东西。</p>
<p>报销单计算器、排班表生成器、提成计算、单位换算、话术模板选择器、问卷结果快速统计……规则明确、重复被问、结果可验证，三条都满足就该做。</p>
</div></details>`,
        en: `<div class="lp-oneline">One .html file, opens on double-click, sendable to anyone, nothing to install.</div>
<p>A page has three parts. You never write them, but knowing who owns what makes your requests precise — <b>and precise gets fixed fast</b>:</p>
<table>
<tr><th></th><th>Responsible for</th><th>Analogy</th></tr>
<tr><td><b>HTML</b></td><td>What is on the page (inputs, buttons, tables)</td><td>Walls and windows</td></tr>
<tr><td><b>CSS</b></td><td>How it looks (colour, size, spacing)</td><td>Decoration and furniture</td></tr>
<tr><td><b>JavaScript</b></td><td>What it does (what happens on click)</td><td>Wiring and switches</td></tr>
</table>
<p>"The button is too pale" is CSS. "The total is wrong" is JS.</p>
<details class="lp-fold"><summary>🍊 What deserves to become a tool</summary><div class="lp-fold-body">
<p>The test: <b>whatever colleagues keep asking you how to calculate.</b></p>
<p>Expense calculators, rota generators, commission maths, unit converters, message-template pickers, quick survey tallies… clear rules, asked repeatedly, verifiable output — all three ticked means build it.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '第一版：先能跑，别管好看', en: 'Version one: make it work, forget pretty' },
      fig: 'mvp-grow',
      body: {
        zh: `<div class="lp-oneline">一次把所有需求说完 = 得到一个又大又乱、改哪儿都怕的东西。</div>
<p>先要一个能跑的最小版本，然后<b>一次改一件事</b>。</p>
<details class="lp-fold"><summary>📝 第一条指令（照抄改改）</summary><div class="lp-fold-body">
<pre>【目标】做一个「差旅报销计算器」网页，部门同事自己填自己算。
【产出】单个 HTML 文件 报销计算器.html，双击能在浏览器打开，
      不依赖任何外网资源（对方公司内网也要能用）。
【功能】第一版只要最基本的：
  - 输入：出差天数、每天餐补标准、交通费、住宿费
  - 计算：餐补 = 天数 × 标准，合计 = 餐补 + 交通 + 住宿
  - 显示：分项明细 + 合计，金额保留两位小数
【约束】
  - 界面能用就行，先不要花时间做样式；
  - 所有计算在浏览器本地完成，不联网、不收集任何数据；
  - 代码里加中文注释，方便我以后让你改。</pre>
</div></details>
<details class="lp-fold"><summary>📝 之后的迭代长这样</summary><div class="lp-fold-body">
<pre>第 1 轮：住宿费改成「按晚数 × 单价」，晚数默认 = 天数 − 1，但允许手工改。
第 2 轮：住宿单价超过 500 时旁边显示红色提示，但不阻止提交。
第 3 轮：加「复制明细」按钮，把结果按固定格式复制到剪贴板。
第 4 轮：输入框做大一点，手机上也能看清。
第 5 轮：加「清空」和「示例数据」按钮，新人第一次用不会懵。</pre>
<p>注意第 2 轮：<b>提示是帮助，不是限制。</b>真实业务里总有需要超标的合理情况，别把人卡死。</p>
</div></details>
<details class="lp-fold"><summary>🍊 为什么必须一次只改一件</summary><div class="lp-fold-body">
<p>一次改五件，出问题时你根本<b>不知道是哪件引起的</b>——只能一件件退回去试，反而更慢。</p>
<p>像做菜时一次只调一味：多放盐还是多放糖，尝一口就知道。五样一起加，只知道难吃，不知道为什么。</p>
</div></details>
<p>拿到之后<b>立刻自己打开试</b>，包括故意填奇怪的值：0、负数、留空、汉字。这一步永远不能省。</p>`,
        en: `<div class="lp-oneline">Dumping every requirement at once = something big, tangled and scary to touch.</div>
<p>Get a minimum working version, then <b>change one thing at a time</b>.</p>
<details class="lp-fold"><summary>📝 The first instruction (copy and adapt)</summary><div class="lp-fold-body">
<pre>[Goal] A "travel expense calculator" page my team fills in themselves.
[Output] A single HTML file expenses.html that opens by double-click,
        with no external resources (must work behind a corporate firewall).
[Features] Version one, bare minimum:
  - Inputs: days away, daily meal allowance, transport, hotel
  - Calculation: meals = days × allowance; total = meals + transport + hotel
  - Display: itemised breakdown and total, two decimals
[Constraints]
  - Usable is enough — no time on styling yet;
  - All computation local in the browser: no network, no data collection;
  - Comment the code so you can modify it for me later.</pre>
</div></details>
<details class="lp-fold"><summary>📝 What iteration looks like</summary><div class="lp-fold-body">
<pre>Round 1: hotel becomes nights × rate; nights defaults to days − 1 but stays editable.
Round 2: show a red warning above 500 per night, but do not block submission.
Round 3: add a "copy breakdown" button that copies a fixed format to the clipboard.
Round 4: larger inputs, readable on a phone.
Round 5: add "clear" and "load example" so first-time users are not lost.</pre>
<p>Note round 2: <b>a warning helps, it does not restrict.</b> Real business always has legitimate exceptions — do not block people.</p>
</div></details>
<details class="lp-fold"><summary>🍊 Why strictly one at a time</summary><div class="lp-fold-body">
<p>Change five things and when something breaks you <b>cannot tell which one did it</b> — you end up reverting them one by one, which is slower.</p>
<p>Like seasoning a dish: adjust one thing and taste. Add five at once and you only learn that it is bad, not why.</p>
</div></details>
<p>Then <b>open and test it yourself</b>, including deliberately odd inputs: 0, negatives, blanks, letters. Never skip this.</p>`,
      },
    },
    {
      h: { zh: '怎么说 bug，才能一次改对', en: 'How to report a bug so it is fixed in one round' },
      fig: 'bug-report',
      body: {
        zh: `<div class="lp-oneline">复现步骤 + 期望 + 实际。三样齐了，通常一次就好。</div>
<p>❌「不好使」「有问题」「不对」——这些等于什么都没说。</p>
<details class="lp-fold"><summary>📝 正确的样子</summary><div class="lp-fold-body">
<p>「天数填 3、餐补填 100、交通填 0、住宿单价填 300，点计算。<br>
<b>期望</b>：餐补 300，住宿 600（2 晚），合计 900。<br>
<b>实际</b>：合计显示 1200，住宿算成了 3 晚。<br>
应该是晚数默认没有减 1。」</p>
<p>同事的模糊反馈也要由你翻译成这种形式。比如「手机上看不清」→「在手机浏览器打开时输入框和字体太小，请把输入框和正文字号调大，并让布局在窄屏下自动换行」。</p>
</div></details>`,
        en: `<div class="lp-oneline">Steps + expected + actual. With all three, one round usually does it.</div>
<p>❌ "It does not work" / "something is off" — that says nothing.</p>
<details class="lp-fold"><summary>📝 What it should look like</summary><div class="lp-fold-body">
<p>"Days = 3, meal allowance = 100, transport = 0, nightly rate = 300, click calculate.<br>
<b>Expected</b>: meals 300, hotel 600 (2 nights), total 900.<br>
<b>Actual</b>: total shows 1200 — hotel computed as 3 nights.<br>
Looks like the nights default is not subtracting 1."</p>
<p>Vague feedback from colleagues is yours to translate too: "unreadable on mobile" → "on a phone the inputs and text are too small; increase input and body font sizes and let the layout wrap on narrow screens".</p>
</div></details>`,
      },
    },
    {
      h: { zh: 'Git：你的后悔药', en: 'Git: your undo button' },
      fig: 'git-snapshots',
      body: {
        zh: `<div class="lp-oneline">Git 就是给整个文件夹拍快照，随时能回到任意一张。</div>
<p>改到第 5 轮你可能发现<b>第 3 轮其实更好用</b>——没存档就回不去了。AI 的记忆受上下文限制，不能当版本管理用。</p>
<table>
<tr><th>术语</th><th>大白话</th></tr>
<tr><td>仓库 repository</td><td>被 Git 管起来的那个文件夹</td></tr>
<tr><td>提交 commit</td><td>拍一张快照，附一句「这次改了什么」</td></tr>
<tr><td>回滚 revert</td><td>回到之前某一张快照</td></tr>
<tr><td>推送 push</td><td>传到远端，换电脑也能拿到</td></tr>
</table>
<details class="lp-fold"><summary>📝 你不用背命令，说人话就行</summary><div class="lp-fold-body">
<pre>把当前文件夹初始化成 git 仓库，加一个 .gitignore 排除临时文件，
然后提交第一版，提交信息写「报销计算器 v1：基础计算功能」。
以后我每说一次「存档」，你就帮我提交一次，提交信息写清这次改了什么。</pre>
<p>Clootee 侧栏还有 <b>⇪ 一键提交推送</b>，相当于 add + commit + push 一步到位。</p>
<p><b>什么时候该存档</b>：每个「刚做完一件事、现在是好的」的时刻。改砸了最多损失最近这一点。</p>
</div></details>`,
        en: `<div class="lp-oneline">Git snapshots a whole folder so you can return to any version.</div>
<p>By round 5 you may realise <b>round 3 was better</b> — without snapshots you cannot go back. The AI's memory is bounded by context; it is not version control.</p>
<table>
<tr><th>Term</th><th>Plain meaning</th></tr>
<tr><td>repository</td><td>The folder Git is managing</td></tr>
<tr><td>commit</td><td>A snapshot with a note about what changed</td></tr>
<tr><td>revert</td><td>Go back to an earlier snapshot</td></tr>
<tr><td>push</td><td>Upload it so another machine can get it</td></tr>
</table>
<details class="lp-fold"><summary>📝 No commands to memorise — just say it</summary><div class="lp-fold-body">
<pre>Initialise this folder as a git repository, add a .gitignore for temp files,
then commit version one with the message "expense calculator v1: basic calculation".
From now on, whenever I say "snapshot", commit with a message describing what changed.</pre>
<p>Clootee's sidebar also has <b>⇪ one-click commit and push</b> — add + commit + push in one go.</p>
<p><b>When to snapshot</b>: every moment where something just started working. Then a bad change costs only that change.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '交给同事之前的三件事', en: 'Three things before you hand it over' },
      fig: 'share-file',
      body: {
        zh: `<div class="lp-oneline">「我这儿能打开」不代表别人能打开。</div>
<ol>
<li><b>确认不依赖外网。</b>最常见的翻车：你有网所以正常，同事在内网打开是一片空白。</li>
<li><b>写三行使用说明。</b>这是干什么的、怎么打开、哪个框填什么。</li>
<li><b>说清楚数据去哪了。</b>纯本地计算的话，就在页面底部写明白：「所有计算在你的浏览器本地完成，数据不会上传到任何服务器。」</li>
</ol>
<details class="lp-fold"><summary>⚠️ 别让 AI 替你承诺</summary><div class="lp-fold-body">
<p>页面上写「数据不会上传」，是<b>你对同事的承诺</b>，不是 AI 的。所以必须自己核实：</p>
<pre>这个页面有没有任何联网请求？包括字体、图标、统计代码。请逐条列出来。</pre>
<p>然后自己断网打开试一遍。字体、图标、统计代码都可能偷偷联网。</p>
</div></details>`,
        en: `<div class="lp-oneline">"It opens on my machine" proves nothing about theirs.</div>
<ol>
<li><b>Confirm no external dependencies.</b> The classic failure: fine for you online, blank for a colleague behind a firewall.</li>
<li><b>Write three lines of instructions.</b> What it does, how to open it, what each field means.</li>
<li><b>State where the data goes.</b> If it is purely local, say so at the bottom of the page: "All calculations happen locally in your browser; no data is uploaded anywhere."</li>
</ol>
<details class="lp-fold"><summary>⚠️ Do not let the AI promise for you</summary><div class="lp-fold-body">
<p>"No data is uploaded" on the page is <b>your promise to colleagues</b>, not the AI's. So verify it yourself:</p>
<pre>Does this page make any network request at all — fonts, icons, analytics? List every one.</pre>
<p>Then disconnect and open it. Fonts, icons and analytics all sneak in network calls.</p>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: 'HTML', en: 'HTML' }, d: { zh: '页面上有什么（结构与内容）', en: 'What is on the page — structure and content' } },
    { k: { zh: 'CSS', en: 'CSS' }, d: { zh: '页面长什么样（颜色、字号、布局）', en: 'How the page looks — colour, size, layout' } },
    { k: { zh: 'JavaScript', en: 'JavaScript' }, d: { zh: '页面会做什么（交互与计算逻辑）', en: 'What the page does — interaction and logic' } },
    { k: { zh: '单文件 / 无外部依赖', en: 'Single file / no external deps' }, d: { zh: '所有内容打包在一个文件里，断网也能正常使用', en: 'Everything bundled in one file; works offline' } },
    { k: { zh: 'Git', en: 'Git' }, d: { zh: '给文件夹拍快照的工具，随时能回到任一版本', en: 'A tool that snapshots a folder so you can return to any version' } },
    { k: { zh: 'commit / 提交', en: 'Commit' }, d: { zh: '拍一张快照并附上"这次改了什么"', en: 'Take a snapshot with a note describing the change' } },
    { k: { zh: '复现步骤', en: 'Steps to reproduce' }, d: { zh: '描述 bug 时说明"怎么操作能重现问题"', en: 'The steps that reproduce a bug' } },
    { k: { zh: 'MVP / 最小可用版本', en: 'MVP (minimum usable version)' }, d: { zh: '先做能跑的最小功能集，再逐步加', en: 'The smallest working feature set, extended step by step' } },
  ],

  quiz: [
    { t: 'single', fig: 'share-file',
      q: { zh: '为什么推荐从「单文件 HTML」开始做小工具？', en: 'Why start tools as a single HTML file?' },
      o: [
        { zh: '因为 HTML 是最强大的语言', en: 'Because HTML is the most powerful language' },
        { zh: '因为一个文件双击就能用，对方不用装任何东西，交付成本最低', en: 'Because one file opens on double-click, the recipient installs nothing, and delivery is trivial' },
        { zh: '因为它运行最快', en: 'Because it runs fastest' },
        { zh: '因为它不用写代码', en: 'Because it requires no code' },
      ], a: 1,
      e: { zh: '交付成本低是关键——同事能真的用起来，工具才有价值。', en: 'Low delivery cost is the point — a tool only matters if colleagues actually use it.' } },

    { t: 'multi', fig: 'html-css-js',
      q: { zh: 'HTML / CSS / JavaScript 分别管什么？（多选，选出正确的对应）', en: 'Match HTML / CSS / JavaScript to their jobs (multiple):' },
      o: [
        { zh: 'HTML 管页面上有什么（结构与内容）', en: 'HTML: what is on the page (structure and content)' },
        { zh: 'CSS 管页面长什么样（颜色、字号、布局）', en: 'CSS: how it looks (colour, size, layout)' },
        { zh: 'JavaScript 管页面会做什么（交互与计算）', en: 'JavaScript: what it does (interaction and logic)' },
        { zh: 'CSS 管计算逻辑', en: 'CSS: the calculation logic' },
      ], a: [0, 1, 2],
      e: { zh: '计算逻辑归 JS。分清楚职责，你提需求才准。', en: 'Logic belongs to JS. Knowing the split makes your requests precise.' } },

    { t: 'single', fig: 'html-css-js',
      q: { zh: '「按钮颜色太浅看不清」这个反馈，本质上是哪一部分的问题？', en: '"The button colour is too pale to read" is essentially a problem in:' },
      o: [
        { zh: 'HTML', en: 'HTML' },
        { zh: 'CSS', en: 'CSS' },
        { zh: 'JavaScript', en: 'JavaScript' },
        { zh: '浏览器', en: 'The browser' },
      ], a: 1,
      e: { zh: '样式问题归 CSS。', en: 'Styling is CSS.' } },

    { t: 'single', fig: 'html-css-js',
      q: { zh: '「点了计算按钮，合计金额算错了」是哪一部分的问题？', en: '"Clicking calculate gives the wrong total" is a problem in:' },
      o: [
        { zh: 'HTML', en: 'HTML' },
        { zh: 'CSS', en: 'CSS' },
        { zh: 'JavaScript', en: 'JavaScript' },
        { zh: '操作系统', en: 'The operating system' },
      ], a: 2,
      e: { zh: '计算逻辑归 JS。', en: 'Calculation logic is JS.' } },

    { t: 'single', fig: 'mvp-grow',
      q: { zh: '第一版小工具最应该追求的是：', en: 'What should version one aim for?' },
      o: [
        { zh: '功能全、界面漂亮', en: 'Every feature, beautiful UI' },
        { zh: '能跑起来的最小功能集，样式先放一边', en: 'The smallest working feature set; styling can wait' },
        { zh: '代码最少', en: 'The fewest lines of code' },
        { zh: '支持所有浏览器', en: 'Support for every browser' },
      ], a: 1,
      e: { zh: '先能跑，再好看。一上来全要，得到的是又大又乱、不敢改的东西。', en: 'Working first, pretty later. Asking for everything up front yields something big and untouchable.' } },

    { t: 'judge', fig: 'one-change',
      q: { zh: '一次提五个修改需求，比一次提一个效率更高。', en: 'Sending five change requests at once is more efficient than one at a time.' },
      a: false,
      e: { zh: '一次改五件，出问题时无法定位是哪件引起的。一次一件是基本纪律。', en: 'Five at once means you cannot tell which one broke things. One at a time is basic discipline.' } },

    { t: 'single', fig: 'bug-report',
      q: { zh: '描述 bug 的正确格式是：', en: 'The right format for a bug report is:' },
      o: [
        { zh: '「不好使」', en: '"It does not work"' },
        { zh: '复现步骤 + 期望结果 + 实际结果', en: 'Steps to reproduce + expected + actual' },
        { zh: '「再改改」', en: '"Fix it more"' },
        { zh: '把整个文件重发一遍', en: 'Resend the whole file' },
      ], a: 1,
      e: { zh: '三件套齐全，通常一轮就能改对。', en: 'With all three, it is usually fixed in one round.' } },

    { t: 'multi', fig: 'edge-cases',
      q: { zh: '做好第一版后应该立刻做什么？（多选）', en: 'What should you do immediately after version one? (multiple)' },
      o: [
        { zh: '打开试一遍，填几组正常数据', en: 'Open it and try several normal inputs' },
        { zh: '故意填奇怪的值：0、负数、留空、汉字', en: 'Deliberately try odd inputs: 0, negatives, blanks, letters' },
        { zh: '检查计算结果是否符合预期', en: 'Check the results against your expectation' },
        { zh: '直接发给全部门', en: 'Send it to the whole department' },
      ], a: [0, 1, 2],
      e: { zh: '没自己试过就群发，是最容易翻车的一步。', en: 'Mass-sending something you never tested is the fastest way to embarrass yourself.' } },

    { t: 'single', fig: 'offline-html',
      q: { zh: '同事打开你发的网页是一片空白，最可能的原因是：', en: 'A colleague opens your page and it is blank. Most likely cause:' },
      o: [
        { zh: '他电脑太旧', en: 'Their computer is old' },
        { zh: '页面依赖了外网资源，他的网络环境访问不到', en: 'The page depends on external resources their network cannot reach' },
        { zh: '文件传输损坏', en: 'The file was corrupted in transit' },
        { zh: '他没装浏览器', en: 'They have no browser' },
      ], a: 1,
      e: { zh: '这就是要求「不依赖任何外网资源」的原因。', en: 'This is exactly why you require "no external resources".' } },

    { t: 'single', fig: 'git-snapshots',
      q: { zh: '用一句大白话解释 Git：', en: 'Explain Git in one plain sentence:' },
      o: [
        { zh: '一个云盘', en: 'A cloud drive' },
        { zh: '给整个文件夹拍快照的工具，随时能回到任意一张', en: 'A tool that snapshots a whole folder so you can return to any of them' },
        { zh: '一个代码编辑器', en: 'A code editor' },
        { zh: '一种编程语言', en: 'A programming language' },
      ], a: 1,
      e: { zh: '每次 commit 就是拍一张快照并写一句说明。', en: 'Each commit is a snapshot with a note.' } },

    { t: 'single', fig: 'git-snapshots',
      q: { zh: '「commit（提交）」的含义是：', en: 'A "commit" means:' },
      o: [
        { zh: '把文件发给别人', en: 'Sending files to someone' },
        { zh: '拍一张当前状态的快照，并附一句"这次改了什么"', en: 'Snapshotting the current state with a note about what changed' },
        { zh: '删除旧版本', en: 'Deleting old versions' },
        { zh: '把代码发布上线', en: 'Deploying to production' },
      ], a: 1,
      e: { zh: '提交信息写清楚，以后找回某个版本才不用一个个试。', en: 'A clear message is what lets you find the right version later.' } },

    { t: 'judge', fig: 'git-snapshots',
      q: { zh: '应该在「刚做完一件事、现在是好的」这种时刻存档（commit）。', en: 'You should commit at moments when "something just started working".' },
      a: true,
      e: { zh: '这样改砸了最多损失最近这一点改动。', en: 'Then a bad change costs you only that change.' } },

    { t: 'single', fig: 'git-snapshots',
      q: { zh: 'Clootee 侧栏的 ⇪ 按钮做什么？', en: 'What does Clootee\'s ⇪ sidebar button do?' },
      o: [
        { zh: '上传文件到云端', en: 'Upload files to the cloud' },
        { zh: '一步完成 git add / commit / push', en: 'Run git add / commit / push in one step' },
        { zh: '导出会话记录', en: 'Export the session log' },
        { zh: '升级 Clootee', en: 'Upgrade Clootee' },
      ], a: 1,
      e: { zh: '相当于一键存档并推到远端。', en: 'One-click snapshot and push.' } },

    { t: 'multi', fig: 'share-file',
      q: { zh: '交付小工具给同事前，应该做哪些事？（多选）', en: 'Before handing a tool to colleagues, you should: (multiple)' },
      o: [
        { zh: '确认页面不依赖外网资源，断网也能用', en: 'Confirm it has no external dependencies and works offline' },
        { zh: '写一份三行的使用说明', en: 'Write a three-line usage note' },
        { zh: '在页面上说清楚数据是否会上传', en: 'State clearly on the page whether data is uploaded' },
        { zh: '把源代码加密防止别人修改', en: 'Encrypt the source so nobody can change it' },
      ], a: [0, 1, 2],
      e: { zh: '加密既做不到也没必要，反而妨碍别人自己改进。', en: 'Encryption is neither achievable nor useful here, and it blocks improvement.' } },

    { t: 'single', fig: 'local-only',
      q: { zh: '要在页面上写「数据不会上传到任何服务器」，你必须先：', en: 'Before writing "no data is uploaded" on the page, you must first:' },
      o: [
        { zh: '相信 AI 的说法', en: 'Trust the AI\'s word' },
        { zh: '让它逐条列出页面的所有联网请求，并自己断网实测一遍', en: 'Have it list every network request, then verify offline yourself' },
        { zh: '加一个免责声明', en: 'Add a disclaimer' },
        { zh: '不用管，写了就行', en: 'Just write it' },
      ], a: 1,
      e: { zh: '这是一句对外承诺，必须自己核实——字体、图标、统计代码都可能偷偷联网。', en: 'That is a public promise, so verify it yourself — fonts, icons and analytics all sneak in network calls.' } },

    { t: 'single', fig: 'consolidate',
      q: { zh: '「代码里加中文注释，方便我以后让你改」这条要求的价值是：', en: 'Why ask for commented code "so you can modify it for me later"?' },
      o: [
        { zh: '让代码看起来更长', en: 'To make the code longer' },
        { zh: '下次继续改时，AI（和你）能更快看懂各段代码的作用', en: 'Next time, both the AI and you can understand each part faster' },
        { zh: '注释会提高运行速度', en: 'Comments speed it up' },
        { zh: '防止别人抄袭', en: 'To prevent copying' },
      ], a: 1,
      e: { zh: '你的小工具会活很久，可读性直接决定后续维护成本。', en: 'Your tool will live a long time; readability is maintenance cost.' } },

    { t: 'single', fig: 'share-file',
      q: { zh: '下面哪个需求最适合做成一个网页小工具？', en: 'Which is the best candidate for a small web tool?' },
      o: [
        { zh: '替我做出是否裁员的决策', en: 'Deciding whether to lay people off' },
        { zh: '同事每次都来问的「提成怎么算」', en: 'The "how is commission calculated" question colleagues keep asking' },
        { zh: '预测明年的市场行情', en: 'Predicting next year\'s market' },
        { zh: '和客户谈判', en: 'Negotiating with a client' },
      ], a: 1,
      e: { zh: '规则明确、重复被问、结果可验证——三条都满足。', en: 'Clear rules, repeatedly asked, verifiable output — all three boxes ticked.' } },

    { t: 'judge', fig: 'offline-html',
      q: { zh: '「我机器上能正常打开」就意味着同事那边也没问题。', en: '"It opens fine on my machine" means it will work for colleagues too.' },
      a: false,
      e: { zh: '网络环境、浏览器版本都可能不同。必须在对方环境验证一次。', en: 'Network and browser differ. Verify in their environment.' } },

    { t: 'single', fig: 'rollback',
      q: { zh: '迭代到第 5 轮时发现第 3 轮的版本更好用，如果一直没存档，结果是：', en: 'At round 5 you decide round 3 was better. Without snapshots:' },
      o: [
        { zh: '可以随时回去', en: 'You can go back any time' },
        { zh: '回不去了，只能凭记忆让 AI 重新改回来，很可能改不回原样', en: 'You cannot; you must reconstruct it from memory and probably will not match' },
        { zh: '浏览器会自动保存', en: 'The browser saved it automatically' },
        { zh: 'AI 记得所有历史版本', en: 'The AI remembers every past version' },
      ], a: 1,
      e: { zh: 'AI 的记忆受上下文限制，不能当版本管理用。', en: "The AI's memory is bounded by context; it is not version control." } },

    { t: 'multi', fig: 'mvp-grow',
      q: { zh: '「第一版只要最基本的」这种写法，好处是：（多选）', en: 'Benefits of "version one, bare minimum": (multiple)' },
      o: [
        { zh: '很快能拿到能用的东西，早发现方向对不对', en: 'You get something usable fast and learn early whether the direction is right' },
        { zh: '代码简单，后面改动风险小', en: 'Simple code means later changes are lower risk' },
        { zh: '避免一次性提太多需求导致产出混乱', en: 'Avoids the tangle caused by dumping all requirements at once' },
        { zh: '第一版做得越简陋，最终版本质量越高', en: 'The cruder version one is, the better the final version' },
      ], a: [0, 1, 2],
      e: { zh: '最后一条是误读——简陋不是目的，快速验证方向才是。', en: 'The last is a misreading: crudeness is not the goal, fast direction-checking is.' } },

    { t: 'single', fig: 'edge-cases',
      q: { zh: '「住宿单价超过 500 时显示红色提示，但不阻止提交」，这种设计的考虑是：', en: '"Warn in red above 500 per night, but do not block submission" reflects:' },
      o: [
        { zh: '让页面更好看', en: 'Aesthetics' },
        { zh: '提示是帮助而不是限制——例外情况总是存在，不能把人卡死', en: 'A warning helps rather than restricts — exceptions exist and users should not be blocked' },
        { zh: '技术上做不到阻止', en: 'Blocking is technically impossible' },
        { zh: '为了省代码', en: 'To save code' },
      ], a: 1,
      e: { zh: '内部工具尤其如此：真实业务里总有需要超标的合理情况。', en: 'Especially true for internal tools: real business always has legitimate exceptions.' } },

    { t: 'single', fig: 'example-copy',
      q: { zh: '让 AI 加一个「示例数据」按钮，主要解决什么问题？', en: 'A "load example" button mainly solves:' },
      o: [
        { zh: '页面太空', en: 'The page looks empty' },
        { zh: '新人第一次打开不知道每个框该填什么', en: 'First-time users not knowing what each field expects' },
        { zh: '计算不准', en: 'Inaccurate calculation' },
        { zh: '加载太慢', en: 'Slow loading' },
      ], a: 1,
      e: { zh: '一个示例胜过一段说明——这和"范例驱动"是同一个道理。', en: 'One example beats a paragraph of instructions — the same idea as example-driven prompting.' } },

    { t: 'single', fig: 'local-only',
      q: { zh: '在指令里写「所有计算在浏览器本地完成，不要联网」，这属于：', en: '"All computation local, no network calls" is a:' },
      o: [
        { zh: '产出格式要求', en: 'Output format spec' },
        { zh: '约束（涉及隐私与可用性的红线）', en: 'Constraint (a privacy and availability red line)' },
        { zh: '受众说明', en: 'Audience note' },
        { zh: '角色设定', en: 'Role setting' },
      ], a: 1,
      e: { zh: '这条约束同时解决了隐私顾虑和内网可用性两个问题。', en: 'This single constraint addresses both privacy concerns and firewall availability.' } },

    { t: 'judge', fig: 'git-snapshots',
      q: { zh: '「.gitignore」的作用是告诉 Git 哪些文件不需要纳入版本管理。', en: '".gitignore" tells Git which files to leave out of version control.' },
      a: true,
      e: { zh: '临时文件、日志、密钥文件都应该排除在外。', en: 'Temp files, logs and secret files all belong outside version control.' } },

    { t: 'single', fig: 'bug-report',
      q: { zh: '同事反馈「在手机上看不清」，你应该怎么转达给 AI？', en: 'A colleague says "unreadable on mobile". How do you relay that?' },
      o: [
        { zh: '「手机上不好用，改一下」', en: '"Bad on mobile, fix it"' },
        { zh: '「在手机浏览器打开时输入框和字体太小，请把输入框和正文字号调大，并让布局在窄屏下自动换行」', en: '"On a phone the inputs and text are too small — increase input and body font sizes and let the layout wrap on narrow screens"' },
        { zh: '「做个 App 吧」', en: '"Just make an app"' },
        { zh: '「手机不重要，不用管」', en: '"Mobile does not matter"' },
      ], a: 1,
      e: { zh: '把模糊反馈翻译成具体的、可执行的改动要求，是你的职责。', en: 'Translating vague feedback into concrete actionable changes is your job.' } },

    { t: 'single', fig: 'share-file',
      q: { zh: '「复制明细」按钮把结果按固定格式复制到剪贴板，这种功能的价值在于：', en: 'A "copy breakdown" button that copies a fixed-format result is valuable because:' },
      o: [
        { zh: '技术上比较炫', en: 'It is technically flashy' },
        { zh: '衔接了工具和真实工作流——算完就能直接粘进聊天或表单', en: 'It bridges the tool and the real workflow — paste straight into chat or a form' },
        { zh: '能减少计算错误', en: 'It reduces calculation errors' },
        { zh: '能加快页面加载', en: 'It speeds up loading' },
      ], a: 1,
      e: { zh: '工具能不能被用起来，往往取决于它和现有流程衔接得顺不顺。', en: 'Whether a tool gets used usually depends on how smoothly it fits the existing workflow.' } },

    { t: 'multi', fig: 'one-change',
      q: { zh: '哪些是「一次改一件事」的正确实践？（多选）', en: 'Which follow "one change at a time"? (multiple)' },
      o: [
        { zh: '每轮只提一个改动，改完立刻试', en: 'One change per round, tested immediately' },
        { zh: '试过没问题就存档一次', en: 'Snapshot after it works' },
        { zh: '出问题时能明确知道是哪次改动引起的', en: 'When something breaks, you know which change caused it' },
        { zh: '把所有想法一次性写成 20 条发过去', en: 'Sending all 20 ideas in one message' },
      ], a: [0, 1, 2],
      e: { zh: '一次 20 条，等于放弃了定位问题的能力。', en: 'Twenty at once means giving up the ability to localise a problem.' } },

    { t: 'single', fig: 'consolidate',
      q: { zh: '你想让这个小工具以后自己也能改，最该向 AI 提的要求是：', en: 'To be able to modify the tool yourself later, the best thing to ask for is:' },
      o: [
        { zh: '「代码越短越好」', en: '"Make the code as short as possible"' },
        { zh: '「结构清晰、关键处加中文注释，并在文件开头写明各部分的作用」', en: '"Clear structure, comments at key points, and a header explaining what each part does"' },
        { zh: '「用最新的技术」', en: '"Use the newest technology"' },
        { zh: '「代码全部压缩成一行」', en: '"Minify everything to one line"' },
      ], a: 1,
      e: { zh: '可读性是你未来自主性的来源。', en: 'Readability is where your future autonomy comes from.' } },

    { t: 'practice', fig: 'local-only',
      q: { zh: '实操：做出一个能双击打开的单文件小工具。', en: 'Hands-on: ship a single-file tool that opens on double-click.' },
      task: {
        zh: `<p>选一个你工作中<b>真实</b>会用到的小计算（报销、提成、排班、单位换算都行），让 Claude Code 做成一个单文件 HTML：</p>
<ol>
<li>第一条指令按四要素写，明确要求：<b>单文件、不依赖任何外网资源、所有计算在本地完成</b>；</li>
<li>做完<b>自己打开试</b>，至少试 3 组数据，包括 1 组异常输入（0 / 负数 / 留空）；</li>
<li>发现问题时，按「复现步骤 + 期望 + 实际」的格式报给 AI，改好再试。</li>
</ol>
<p>把下面内容粘过来：你的第一条指令、你试的 3 组数据与结果、以及至少一次的 bug 报告（如果一次就对了，就说明你试了哪些异常输入、结果是否符合预期）。</p>`,
        en: `<p>Pick a calculation you <b>actually</b> do at work (expenses, commission, rota, unit conversion) and have Claude Code build it as a single HTML file:</p>
<ol>
<li>Write the first instruction with all four parts, explicitly requiring: <b>single file, no external resources, all computation local</b>;</li>
<li><b>Open and test it yourself</b> with at least 3 input sets, including one abnormal set (0 / negative / blank);</li>
<li>Report any problem as "steps + expected + actual", then retest after the fix.</li>
</ol>
<p>Paste below: your first instruction, the 3 input sets and their results, and at least one bug report (or, if it was right first time, which abnormal inputs you tried and whether the results matched).</p>`,
      },
      rubric: {
        zh: `1. 第一条指令必须包含"单文件 + 不依赖外网 + 本地计算"三项要求。每缺一项扣 15 分。
2. 必须给出至少 3 组具体的测试数据与实际结果（有数字），且其中至少 1 组是异常输入。缺失扣 30 分。
3. 必须体现"自己试过"——只说"AI 说做好了"不算。无实测证据扣 30 分。
4. 若提交了 bug 报告，需符合"复现步骤 + 期望 + 实际"格式；格式不全扣 10 分（一次做对且说明了异常输入测试的，不扣此项）。
5. 未真正执行、纯编造给 0 分。`,
        en: `1. The first instruction must include: single file, no external resources, local computation. Deduct 15 per missing item.
2. At least 3 concrete input sets with actual numeric results must be shown, one of them abnormal. Deduct 30 if missing.
3. Evidence of the learner testing it personally is required; "the AI said it was done" does not count. Deduct 30 without it.
4. Any bug report must follow steps + expected + actual; deduct 10 if incomplete (no deduction if it worked first time and abnormal-input testing is described).
5. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '「自己试过」是这道题唯一的核心，其余都是形式。', en: '"You tested it yourself" is the whole point of this exercise.' } },

    { t: 'practice', fig: 'git-snapshots',
      q: { zh: '实操：用 Git 给你的小工具存三次档，并成功回退一次。', en: 'Hands-on: make three Git snapshots of your tool and roll one back.' },
      task: {
        zh: `<p>接着上一题的工具：</p>
<ol>
<li>让 Claude Code 把该文件夹初始化为 git 仓库，提交第一版（提交信息写清楚版本与内容）；</li>
<li>做<b>两次改进</b>（每次只改一件事），每次改完各提交一次，共三个提交；</li>
<li>让它列出提交历史；</li>
<li><b>故意</b>把第三次的改动回退掉（回到第二个提交的状态），确认工具恢复成第二版的样子。</li>
</ol>
<p>把提交历史（三条提交信息）、你执行回退时用的指令、以及回退后的验证结果，粘到下面。</p>`,
        en: `<p>Continuing with the tool from the previous task:</p>
<ol>
<li>Have Claude Code initialise the folder as a git repository and commit version one with a descriptive message;</li>
<li>Make <b>two improvements</b> (one change each) and commit after each — three commits total;</li>
<li>Have it list the commit history;</li>
<li><b>Deliberately</b> roll back the third change (return to the second commit) and confirm the tool is back to version two.</li>
</ol>
<p>Paste below: the commit history (three messages), the instruction you used to roll back, and how you verified the rollback worked.</p>`,
      },
      rubric: {
        zh: `1. 必须有三条真实的提交历史，且提交信息能看出各自改了什么（"1"、"update" 这类无意义信息扣 15 分）。缺少历史扣 35 分。
2. 必须有回退动作的指令或命令记录。缺失扣 30 分。
3. 必须有回退后的验证结果——说明工具确实回到了第二版的状态（例如某个功能消失了/某处显示变回去了）。只说"回退成功"而无具体验证扣 20 分。
4. 三次改动如果是一次性提交的（没有分三次），扣 20 分。
5. 未真正执行、纯编造给 0 分。`,
        en: `1. Three real commits must be shown with messages describing each change (meaningless messages like "1" or "update" cost 15). Deduct 35 if history is missing.
2. The rollback instruction or command must be shown. Deduct 30 if missing.
3. Post-rollback verification is required — evidence the tool really returned to version two (a feature gone, a display reverted). Deduct 20 for "rollback succeeded" with no specifics.
4. Deduct 20 if the three changes were committed all at once rather than separately.
5. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '会存档、会回退，你才敢大胆地改。这是从"不敢动"到"随便改"的关键一步。', en: 'Snapshot and rollback are what make you brave enough to change things freely.' } },
  ],
});
