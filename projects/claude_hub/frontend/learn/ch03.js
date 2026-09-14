// 第 3 章：表格活 —— Excel / CSV 批处理，办公室里最值得交出去的工作
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch03',
  icon: '📊',
  minutes: 18,
  title: { zh: '表格活：12 个月的销售表，5 分钟合完', en: 'Spreadsheets: merge twelve monthly sales files in five minutes' },
  goal: {
    zh: '把 Excel / CSV 的合并、清洗、汇总交给 AI，并且知道怎么验收数字。理解「让它写脚本」比「让它手工改」强在哪里。',
    en: 'Delegate merging, cleaning and summarising of Excel/CSV files — and know how to verify the numbers. Understand why "have it write a script" beats "have it edit by hand".',
  },
  praise: {
    zh: '<p>这一章的含金量最高 —— 你刚刚学会的东西，在很多岗位上<b>每个月能省掉一整天</b>。更重要的是你掌握了「让它写脚本、脚本可复用、结果可对账」这个思路。</p><p>下一章换个赛道：<b>文字活</b>。会议纪要、周报、对外邮件——同样是每周都要干的重复劳动。</p>',
    en: '<p>This is the highest-value chapter — what you just learned <b>saves a full day a month</b> in many roles. More importantly you now have the pattern: have it write a script, reuse the script, reconcile the result.</p><p>Next, a different track: <b>writing work</b>. Minutes, weekly updates, client emails — the other weekly grind.</p>',
  },

  sections: [
    {
      h: { zh: '关键一招：让它写脚本，别让它手工改', en: 'The key move: have it write a script, not edit by hand' },
      fig: 'script-loop',
      body: {
        zh: `<div class="lp-oneline">说「写个脚本来做这件事，然后运行它」，别说「你帮我把这些数据合并一下」。</div>
<table>
<tr><th></th><th>它手工读表再拼</th><th>它写个脚本去跑</th></tr>
<tr><td>速度</td><td>慢，每行都过一遍模型</td><td>快，几万行也是几秒</td></tr>
<tr><td>费用</td><td>贵，数据全变 token</td><td>便宜，只写几十行代码</td></tr>
<tr><td>准确</td><td>可能看串行</td><td>不会看花眼</td></tr>
<tr><td>下个月</td><td>整个重来</td><td>放新文件，再跑一次</td></tr>
</table>
<details class="lp-fold"><summary>🍊 打个比方</summary><div class="lp-fold-body">
<p>让 AI 手工处理数据，像<b>请人用手一颗一颗剥豆子</b>；让它写脚本，像<b>请人做一台剥豆机</b>。</p>
<p>做机器要多花两分钟，但从此以后每个月都是几秒钟的事。脚本是<b>资产</b>，手工是<b>消耗</b>。</p>
</div></details>
<details class="lp-fold"><summary>🔍 电脑没装 Python 怎么办</summary><div class="lp-fold-body">
<p>脚本一般是 Python（配 pandas 处理表格）。你不用看懂它，但要知道它存在——下个月说一句「用上次那个 merge.py 再跑一遍」就行。</p>
<p>没装的话直接说：「先检查有没有 Python，没有就告诉我怎么装。」或者「别用 Python，给我能用 Excel 打开的 CSV。」说清限制，它会自己绕。</p>
</div></details>`,
        en: `<div class="lp-oneline">Say "write a script to do this, then run it" — not "please merge this data for me".</div>
<table>
<tr><th></th><th>It reads and stitches by hand</th><th>It writes a script</th></tr>
<tr><td>Speed</td><td>Slow — every row passes the model</td><td>Fast — tens of thousands in seconds</td></tr>
<tr><td>Cost</td><td>Expensive — all data becomes tokens</td><td>Cheap — a few dozen lines</td></tr>
<tr><td>Accuracy</td><td>Can misalign rows</td><td>Does not misread</td></tr>
<tr><td>Next month</td><td>Start over</td><td>Drop the new file, rerun</td></tr>
</table>
<details class="lp-fold"><summary>🍊 An analogy</summary><div class="lp-fold-body">
<p>Having the AI process data by hand is like <b>hiring someone to shell peas one at a time</b>. Having it write a script is <b>hiring someone to build a pea-sheller</b>.</p>
<p>The machine takes two extra minutes, then every month costs seconds. A script is an <b>asset</b>; manual work is <b>spend</b>.</p>
</div></details>
<details class="lp-fold"><summary>🔍 What if Python is not installed</summary><div class="lp-fold-body">
<p>Scripts are usually Python with pandas. You never need to read them — but knowing one exists means next month is just "run merge.py again".</p>
<p>If it is missing, say so: "check whether Python is available; if not, tell me how to install it", or "avoid Python — give me a CSV I can open in Excel". State the constraint and it routes around it.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '开工前先探个路', en: 'Scout before you start' },
      fig: 'read-first',
      body: {
        zh: `<div class="lp-oneline">先让它把数据长什么样打印给你看，再决定怎么处理。</div>
<pre>先别处理数据。列出 data 文件夹下所有 xlsx 的名字，
把每个文件的表头和前 3 行打印给我，我要确认字段名是否一致。</pre>
<p>不看清结构就下指令，等于闭着眼睛开车。这一步花 20 秒。</p>
<details class="lp-fold"><summary>⚠️ 最容易翻车的：口径没说清</summary><div class="lp-fold-body">
<p>这四个问题不问清楚，后面所有汇总数字都是错的：</p>
<ul>
<li>「销售额」含税还是不含税？</li>
<li>日期 <code>05-03-2026</code> 是 3 月 5 日还是 5 月 3 日？</li>
<li>「客户名」在不同表里是「北京XX有限公司」还是「北京 XX」？要不要去空格统一？</li>
<li>金额单位是元还是万元？有没有混着来的？</li>
</ul>
</div></details>`,
        en: `<div class="lp-oneline">Have it print what the data actually looks like before deciding how to process it.</div>
<pre>Do not process anything yet. List every xlsx under the data folder
and print each file's header row plus its first 3 rows, so I can confirm the field names match.</pre>
<p>Instructing without seeing the structure is driving blindfolded. This step costs 20 seconds.</p>
<details class="lp-fold"><summary>⚠️ The classic killer: undefined fields</summary><div class="lp-fold-body">
<p>Leave these four unanswered and every downstream number is wrong:</p>
<ul>
<li>Is "revenue" gross or net of tax?</li>
<li>Is <code>05-03-2026</code> 5 March or 3 May?</li>
<li>Is the client "Beijing XX Ltd." in one file and "Beijing XX" in another? Normalise whitespace?</li>
<li>Are amounts in units or thousands? Are they mixed?</li>
</ul>
</div></details>`,
      },
    },
    {
      h: { zh: '完整流程：12 个月的表 → 一份汇总', en: 'Full flow: twelve monthly files → one summary' },
      fig: 'csv-merge',
      body: {
        zh: `<div class="lp-oneline">探路 → 合并 → 对账 → 汇总 → 留个说明。五步，每步都有能打开看的产出。</div>
<details class="lp-fold"><summary>📝 第二步 · 合并（完整指令，照抄改改）</summary><div class="lp-fold-body">
<pre>【目标】把 data/ 下 12 个月度销售表合并成一张总表。
【范围】只处理 data/ 下的 xlsx，忽略以 ~$ 开头的临时文件。
【产出】写一个 Python 脚本 merge.py，输出 out/全年明细.csv（UTF-8 带 BOM，Excel 能直接打开）。
      总表加一列「来源文件」，记录每行来自哪个月。
【约束】
- 不修改任何原始文件，所有输出写到 out/；
- 日期统一成 YYYY-MM-DD，解析不了的原样保留并记入 out/问题清单.csv；
- 金额统一转数字，带逗号的先去逗号；转不了的同样记入问题清单；
- 完成后打印：每个文件读入多少行、合并后共多少行、问题清单多少行。</pre>
</div></details>
<details class="lp-fold"><summary>📝 第三步 · 对账（这步最关键）</summary><div class="lp-fold-body">
<pre>请核对：12 个源文件的行数之和，是否等于 全年明细.csv 的行数 + 被丢弃的行数？
如果对不上，找出差在哪里，不要修改数据，先告诉我。</pre>
<p>为什么关键：<b>文件改坏了你看得见，数字算错了你看不见。</b>对账是你唯一能发现「悄悄丢了 37 行」的手段。</p>
</div></details>
<details class="lp-fold"><summary>📝 第四、五步 · 汇总与留说明</summary><div class="lp-fold-body">
<pre>基于 out/全年明细.csv 生成 out/汇总.xlsx，三个 sheet：
1) 按月汇总：月份、订单数、销售额合计、客单价
2) 按客户汇总：客户名、订单数、销售额合计，按销售额降序，只保留前 20
3) 异常明细：直接引用问题清单
金额保留两位小数，用千分位显示。</pre>
<pre>把整个流程写成 run_monthly.md 放项目根目录：
下个月只需要做哪几步、新文件放哪里、跑哪个命令。</pre>
<p>最后这一步是把一次性劳动变成可复用流程——真正省时间的地方在这。</p>
</div></details>`,
        en: `<div class="lp-oneline">Scout → merge → reconcile → summarise → leave a runbook. Five steps, each with an inspectable output.</div>
<details class="lp-fold"><summary>📝 Step 2 · Merge (full instruction, copy and adapt)</summary><div class="lp-fold-body">
<pre>[Goal] Merge the 12 monthly sales files under data/ into one table.
[Scope] Only xlsx directly under data/; ignore temp files starting with ~$.
[Output] Write a Python script merge.py producing out/all_rows.csv (UTF-8 with BOM so Excel opens it cleanly).
        Add a "source_file" column recording which month each row came from.
[Constraints]
- Modify no original file; all output goes to out/;
- Normalise dates to YYYY-MM-DD; unparseable values stay as-is and go to out/issues.csv;
- Convert amounts to numbers, stripping thousands separators; failures also go to issues.csv;
- When done print: rows read per file, total rows merged, rows in issues.csv.</pre>
</div></details>
<details class="lp-fold"><summary>📝 Step 3 · Reconcile (the important one)</summary><div class="lp-fold-body">
<pre>Check: does the sum of row counts across the 12 source files equal
the rows in all_rows.csv plus the rows dropped? If not, find the gap.
Do not change any data — report to me first.</pre>
<p>Why it matters: <b>a broken file is visible, a wrong number is not.</b> Reconciling is your only way to notice that 37 rows quietly vanished.</p>
</div></details>
<details class="lp-fold"><summary>📝 Steps 4 and 5 · Summarise and leave a runbook</summary><div class="lp-fold-body">
<pre>From out/all_rows.csv produce out/summary.xlsx with three sheets:
1) By month: month, order count, total revenue, average order value
2) By client: client, order count, total revenue, sorted desc, top 20 only
3) Issues: the contents of issues.csv
Amounts to two decimals with thousands separators.</pre>
<pre>Write run_monthly.md at the project root: what to do next month,
where to drop the new file, which command to run.</pre>
<p>That last step turns one-off labour into a repeatable procedure — which is where the time actually gets saved.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '数字怎么验收：三条铁律', en: 'Verifying numbers: three hard rules' },
      fig: 'reconcile',
      body: {
        zh: `<div class="lp-oneline">对总数、抽样看、瞄极值。三十秒，挡掉九成事故。</div>
<ol>
<li><b>对总数。</b>源文件行数之和 = 结果行数 + 被丢弃行数。<b>对不上就是有问题，没有例外。</b></li>
<li><b>抽样核。</b>随机挑 3 行回源文件比对，重点看日期和金额。</li>
<li><b>瞄极值。</b>让它打印「金额最大和最小的各 5 行」，负数、0、多三个零的一眼就露馅。</li>
</ol>
<details class="lp-fold"><summary>⚠️ 三个最常见的坑</summary><div class="lp-fold-body">
<p><b>① 日期串了。</b><code>03/05/2026</code> 在不同地区含义不同。要求统一输出 <code>YYYY-MM-DD</code>，并让它说明原始格式是怎么判断的。</p>
<p><b>② 金额被当成文本。</b>带货币符号、带逗号的金额直接求和会得到 0 或报错。要求显式做数字转换，并报告转换失败多少行。</p>
<p><b>③ 去重去错了。</b>「同客户同一天两笔一样金额」是重复录入还是真两笔？<b>只有你知道。</b>所以永远别说「帮我去重」，要说「把疑似重复的列给我看，我来决定」。</p>
</div></details>
<details class="lp-fold"><summary>🍊 一句话记住异常处理</summary><div class="lp-fold-body">
<p><b>机器找，人来定。</b></p>
<p>让它做的是「把可疑的挑出来放一边」，不是「替你决定删不删」。所以每次都加这句：</p>
<pre>遇到无法确定的情况不要猜，原样保留并记录到 问题清单.csv，最后告诉我每类各有多少条。</pre>
</div></details>`,
        en: `<div class="lp-oneline">Reconcile totals, spot-check rows, glance at extremes. Thirty seconds prevents most accidents.</div>
<ol>
<li><b>Reconcile.</b> Source rows = result rows + dropped rows. <b>A mismatch is a bug — no exceptions.</b></li>
<li><b>Spot-check.</b> Pick 3 rows at random and compare against the source, watching dates and amounts.</li>
<li><b>Check extremes.</b> Print the 5 largest and 5 smallest amounts; negatives, zeros and off-by-1000 values jump out.</li>
</ol>
<details class="lp-fold"><summary>⚠️ The three classic traps</summary><div class="lp-fold-body">
<p><b>① Date confusion.</b> <code>03/05/2026</code> means different days in different regions. Require <code>YYYY-MM-DD</code> output and ask how it decided the source format.</p>
<p><b>② Amounts stored as text.</b> Values with symbols or commas sum to 0 or throw. Require explicit numeric conversion and a count of failures.</p>
<p><b>③ Wrong deduplication.</b> Same client, same day, same amount — duplicate entry or two real orders? <b>Only you know.</b> So never say "dedupe this"; say "list the suspected duplicates and let me decide".</p>
</div></details>
<details class="lp-fold"><summary>🍊 Anomalies in one line</summary><div class="lp-fold-body">
<p><b>Machine finds, human decides.</b></p>
<p>Its job is to set suspicious rows aside, not to decide whether they die. So add this every time:</p>
<pre>Do not guess on ambiguous cases. Keep the original value, log the row to issues.csv,
and tell me how many rows fell into each category.</pre>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: 'CSV', en: 'CSV' }, d: { zh: '用逗号分隔的纯文本表格，任何工具都能读，最适合做中间产物', en: 'Comma-separated plain-text table; universally readable, ideal as an intermediate format' } },
    { k: { zh: 'pandas', en: 'pandas' }, d: { zh: 'Python 里处理表格的标准库，AI 写脚本时几乎必用', en: "Python's standard table library; the AI will almost always use it" } },
    { k: { zh: '脚本 / Script', en: 'Script' }, d: { zh: '一段可重复运行的自动化代码，是可复用资产', en: 'Re-runnable automation code — a reusable asset' } },
    { k: { zh: '口径', en: 'Field definition' }, d: { zh: '字段的确切定义（含税否、单位、时区…），口径不一数字必错', en: 'The exact definition of a field (tax, unit, timezone…); mismatched definitions guarantee wrong numbers' } },
    { k: { zh: '对账', en: 'Reconciliation' }, d: { zh: '用总数/总额两头核对，确认数据没有丢失或重复', en: 'Cross-checking counts and sums to confirm nothing was lost or duplicated' } },
    { k: { zh: 'UTF-8 BOM', en: 'UTF-8 BOM' }, d: { zh: '一种编码标记，加上它 Excel 打开中文 CSV 才不乱码', en: 'An encoding marker that stops Excel from garbling non-ASCII CSV files' } },
    { k: { zh: '~$ 临时文件', en: '~$ temp files' }, d: { zh: 'Excel 打开文件时生成的隐藏临时文件，批处理时要排除', en: 'Hidden temp files Excel creates while a workbook is open; exclude them in batch jobs' } },
  ],

  quiz: [
    { t: 'single', fig: 'script-loop',
      q: { zh: '处理几万行的表格数据，为什么「让 AI 写脚本去做」优于「让 AI 直接读数据处理」？', en: 'For tens of thousands of rows, why is "have the AI write a script" better than "have the AI process the data directly"?' },
      o: [
        { zh: '脚本看起来更专业', en: 'Scripts look more professional' },
        { zh: '更快更便宜，执行确定不会看错行，而且下个月可以重复使用', en: 'Faster, cheaper, deterministic, and reusable next month' },
        { zh: 'AI 不会读 Excel', en: 'The AI cannot read Excel' },
        { zh: '脚本不消耗电费', en: 'Scripts use no electricity' },
      ], a: 1,
      e: { zh: '数据进模型就变 token；脚本只让模型写几十行代码，数据由电脑自己算。', en: 'Data entering the model becomes tokens; a script has the model write a few dozen lines and lets the computer crunch.' } },

    { t: 'single', fig: 'read-first',
      q: { zh: '「探路指令」的作用是：', en: 'What is a "scouting instruction" for?' },
      o: [
        { zh: '让 AI 热身', en: 'Warming the AI up' },
        { zh: '先看清数据长什么样（文件清单、表头、前几行），再决定怎么处理', en: 'Seeing what the data actually looks like — file list, headers, first rows — before deciding how to process it' },
        { zh: '测试网络速度', en: 'Testing network speed' },
        { zh: '省电', en: 'Saving power' },
      ], a: 1,
      e: { zh: '不看清结构就下指令，等于闭着眼睛开车。', en: 'Instructing without seeing the structure is driving blindfolded.' } },

    { t: 'multi', fig: 'denominator',
      q: { zh: '下面哪些属于必须提前说清楚的「口径」问题？（多选）', en: 'Which are "field definition" questions you must settle up front? (multiple)' },
      o: [
        { zh: '销售额含税还是不含税', en: 'Revenue gross or net of tax' },
        { zh: '金额单位是元还是万元', en: 'Amounts in units or thousands' },
        { zh: '日期 05-03-2026 是 3 月 5 日还是 5 月 3 日', en: 'Whether 05-03-2026 is 5 March or 3 May' },
        { zh: '输出文件用什么图标', en: 'Which icon the output file uses' },
      ], a: [0, 1, 2],
      e: { zh: '口径不一致，后面所有汇总数字都是错的。', en: 'Inconsistent definitions make every downstream number wrong.' } },

    { t: 'single', fig: 'reconcile',
      q: { zh: '「对账」在数据处理里指的是：', en: 'In data work, "reconciling" means:' },
      o: [
        { zh: '和财务部门核对报销', en: 'Checking expenses with finance' },
        { zh: '用行数、金额总和两头核对，确认没有丢行或重复', en: 'Cross-checking row counts and totals to confirm nothing was lost or duplicated' },
        { zh: '检查拼写错误', en: 'Checking spelling' },
        { zh: '备份文件', en: 'Backing up files' },
      ], a: 1,
      e: { zh: '源文件行数之和 = 结果行数 + 被丢弃行数，对不上就是有 bug。', en: 'Sum of source rows = result rows + dropped rows. A mismatch is a bug.' } },

    { t: 'judge', fig: 'dup-rows',
      q: { zh: '「帮我把重复的订单去掉」是一条安全的指令。', en: '"Remove the duplicate orders for me" is a safe instruction.' },
      a: false,
      e: { zh: '什么算重复只有你知道（同客户同日同金额可能是两笔真单）。正确做法是让它列出疑似重复，由你决定。', en: 'Only you know what counts as a duplicate. Have it list suspected duplicates and decide yourself.' } },

    { t: 'single', fig: 'text-number',
      q: { zh: '金额列里出现 <code>1,234.50</code> 这样带逗号的文本，如果不做处理直接求和，最可能的结果是：', en: 'If an amount column contains text like <code>1,234.50</code> and you sum it without conversion, the likely result is:' },
      o: [
        { zh: '结果完全正确', en: 'Perfectly correct totals' },
        { zh: '求和得到 0、报错，或被截断成 1', en: 'Zero, an error, or truncation to 1' },
        { zh: '自动四舍五入', en: 'Automatic rounding' },
        { zh: '自动换算成美元', en: 'Automatic currency conversion' },
      ], a: 1,
      e: { zh: '文本型数字是表格处理第一大坑，必须显式转换并统计转换失败行数。', en: 'Text-typed numbers are trap #1. Convert explicitly and count the failures.' } },

    { t: 'single', fig: 'csv-merge',
      q: { zh: '为什么要求输出 CSV 时用「UTF-8 带 BOM」？', en: 'Why ask for CSV output as "UTF-8 with BOM"?' },
      o: [
        { zh: '文件更小', en: 'Smaller files' },
        { zh: 'Excel 直接双击打开时中文不会乱码', en: 'Excel opens it without garbling non-ASCII text' },
        { zh: '加密数据', en: 'It encrypts the data' },
        { zh: '让 AI 读得更快', en: 'The AI reads it faster' },
      ], a: 1,
      e: { zh: '这是给最终用 Excel 打开的人省麻烦的一个小细节。', en: 'A small detail that saves whoever opens it in Excel.' } },

    { t: 'multi', fig: 'verify-count',
      q: { zh: '验收合并后的数据，哪些做法是有效的？（多选）', en: 'Which checks actually validate merged data? (multiple)' },
      o: [
        { zh: '核对源文件行数之和与结果行数', en: 'Compare the sum of source rows with the result rows' },
        { zh: '随机抽 3 行回源文件逐字段比对', en: 'Spot-check 3 random rows field by field against the source' },
        { zh: '打印金额最大和最小的各 5 行看有无异常', en: 'Print the top and bottom 5 amounts to spot outliers' },
        { zh: '确认 AI 的回复语气是否自信', en: 'Check whether the AI sounds confident' },
      ], a: [0, 1, 2],
      e: { zh: '语气与正确性无关，模型说得越肯定越要核。', en: 'Tone says nothing about correctness; confident wording deserves more scrutiny.' } },

    { t: 'single', fig: 'dirty-flag',
      q: { zh: '批处理 Excel 文件时，为什么要排除以 <code>~$</code> 开头的文件？', en: 'Why exclude files starting with <code>~$</code> when batch-processing Excel?' },
      o: [
        { zh: '它们是加密文件', en: 'They are encrypted' },
        { zh: '它们是 Excel 打开文件时产生的临时文件，不是真正的数据', en: 'They are temp files Excel creates while a workbook is open, not real data' },
        { zh: '它们体积太大', en: 'They are too large' },
        { zh: '它们是备份，应该优先处理', en: 'They are backups and should be processed first' },
      ], a: 1,
      e: { zh: '把临时文件当数据读进去，行数对账就会莫名其妙对不上。', en: 'Reading temp files as data is a classic cause of unexplained row-count mismatches.' } },

    { t: 'single', fig: 'issues-funnel',
      q: { zh: '一份好的表格处理指令，对「异常数据」应该怎么规定？', en: 'How should a good spreadsheet instruction handle anomalies?' },
      o: [
        { zh: '让 AI 自己看着办', en: 'Let the AI decide' },
        { zh: '不要猜测，原样保留并记录到问题清单，最后报告每类多少条', en: 'Do not guess: keep the original, log it to an issues file, and report counts per category' },
        { zh: '直接删掉异常行', en: 'Delete anomalous rows' },
        { zh: '用 0 填充所有缺失值', en: 'Fill every missing value with 0' },
      ], a: 1,
      e: { zh: '静默删除和静默填充都会让错误消失在结果里，最危险。', en: 'Silent deletion and silent filling hide errors inside the result — the most dangerous outcome.' } },

    { t: 'judge', fig: 'reuse-script',
      q: { zh: '让 AI 把处理流程写成 run_monthly.md，下个月照着做，属于浪费时间。', en: 'Having the AI write run_monthly.md so next month is repeatable is a waste of time.' },
      a: false,
      e: { zh: '一次性劳动变成可复用流程，这才是自动化真正的收益点。', en: 'Turning one-off labour into a repeatable procedure is where automation actually pays.' } },

    { t: 'single', fig: 'copy-safe',
      q: { zh: '「所有输出写到 out/ 目录，不修改任何原始文件」这条约束的价值是：', en: 'The constraint "write all output to out/, never modify originals" is valuable because:' },
      o: [
        { zh: '让文件夹更整洁', en: 'It keeps folders tidy' },
        { zh: '原始数据永远可回溯，处理错了随时能重来', en: 'Source data stays intact, so any mistake is fully recoverable' },
        { zh: '加快处理速度', en: 'It speeds up processing' },
        { zh: '减少 token', en: 'It saves tokens' },
      ], a: 1,
      e: { zh: '「只增不改」是处理数据时的黄金法则。', en: '"Add, never modify" is the golden rule of data work.' } },

    { t: 'single', fig: 'script-loop',
      q: { zh: '你的电脑没装 Python，最合适的做法是：', en: 'Python is not installed on your machine. The best move is:' },
      o: [
        { zh: '放弃这个任务', en: 'Give up on the task' },
        { zh: '让 AI 先检测环境，没有就给出安装步骤，或者改用不需要 Python 的方案', en: 'Have the AI check the environment and either give install steps or switch to a Python-free approach' },
        { zh: '自己先学会 Python 再来', en: 'Learn Python first' },
        { zh: '把数据发给同事处理', en: 'Send the data to a colleague' },
      ], a: 1,
      e: { zh: '把限制说清楚，它会自己绕路。Clootee 也能帮你装运行环境。', en: 'State the constraint and it routes around it. Clootee can also install runtimes for you.' } },

    { t: 'multi', fig: 'reconcile',
      q: { zh: '合并多张表时，哪些情况会导致「行数对不上」？（多选）', en: 'Which causes a row-count mismatch when merging tables? (multiple)' },
      o: [
        { zh: '把 ~$ 临时文件也读进去了', en: 'Reading ~$ temp files as data' },
        { zh: '某些文件表头在第 3 行，前两行被当成数据或被跳过', en: 'Some files have headers on row 3, so rows get misread or skipped' },
        { zh: '解析失败的行被静默丢弃', en: 'Unparseable rows silently dropped' },
        { zh: '输出文件名太长', en: 'The output filename is too long' },
      ], a: [0, 1, 2],
      e: { zh: '前三项都是真实高频原因，第四项与行数无关。', en: 'The first three are common real causes; filename length is unrelated.' } },

    { t: 'single', fig: 'extremes',
      q: { zh: '让 AI 打印「金额最大的 5 行和最小的 5 行」，目的是：', en: 'Printing the 5 largest and 5 smallest amounts is meant to:' },
      o: [
        { zh: '展示排名', en: 'Show a ranking' },
        { zh: '快速发现异常值（负数、0、多三个零）', en: 'Surface outliers fast (negatives, zeros, values off by 1000×)' },
        { zh: '生成图表', en: 'Generate a chart' },
        { zh: '压缩数据', en: 'Compress the data' },
      ], a: 1,
      e: { zh: '极值检查是成本最低、发现率最高的数据体检。', en: 'Checking extremes is the cheapest, highest-yield data sanity check.' } },

    { t: 'single', fig: 'dup-rows',
      q: { zh: '同一个客户在不同表里写作「北京XX有限公司」和「北京 XX 有限公司」，应该：', en: 'The same client appears as "Beijing XX Ltd." and "Beijing XX  Ltd." across files. You should:' },
      o: [
        { zh: '忽略，反正差不多', en: 'Ignore it — close enough' },
        { zh: '在指令里明确规定统一规则（如去除所有空格后比较），否则按客户汇总时会被算成两个客户', en: 'Specify a normalisation rule (e.g. strip all whitespace before comparing), or the client summary will double-count' },
        { zh: '手工一个个改', en: 'Fix them one by one manually' },
        { zh: '删掉其中一个客户的数据', en: 'Delete one client\'s data' },
      ], a: 1,
      e: { zh: '这是「按客户汇总」最常见的错因，必须在口径里写死。', en: 'This is the classic cause of wrong per-client summaries; pin it down in the definitions.' } },

    { t: 'judge', fig: 'csv-merge',
      q: { zh: '加一列「来源文件」记录每行来自哪个月，对后续排查问题很有帮助。', en: 'Adding a "source_file" column recording which month each row came from helps later debugging.' },
      a: true,
      e: { zh: '出问题时能一眼定位到是哪个源文件的问题，成本几乎为零。', en: 'It pinpoints which source file is at fault, at almost no cost.' } },

    { t: 'single', fig: 'token-meter',
      q: { zh: '为什么「让 AI 逐行读几万行数据」是个坏主意？', en: 'Why is "have the AI read tens of thousands of rows one by one" a bad idea?' },
      o: [
        { zh: '模型会累', en: 'The model gets tired' },
        { zh: '数据全部变成 token，又贵又慢，还可能超出上下文窗口', en: 'All the data becomes tokens — expensive, slow, and likely to overflow the context window' },
        { zh: '数据会被公开', en: 'The data becomes public' },
        { zh: '电脑会死机', en: 'The computer crashes' },
      ], a: 1,
      e: { zh: '这正是第 1 章上下文窗口那一节的实际后果。', en: 'This is the practical consequence of the context-window lesson in Chapter 1.' } },

    { t: 'single', fig: 'prompt-4parts',
      q: { zh: '汇总表要求「按销售额降序、只保留前 20」，这属于四要素中的：', en: '"Sorted by revenue descending, top 20 only" belongs to which of the four parts?' },
      o: [
        { zh: '目标', en: 'Goal' },
        { zh: '范围', en: 'Scope' },
        { zh: '产出', en: 'Output' },
        { zh: '约束', en: 'Constraints' },
      ], a: 2,
      e: { zh: '交付物长什么样 = 产出。', en: 'What the deliverable looks like = output.' } },

    { t: 'multi', fig: 'reuse-script',
      q: { zh: '哪些是「让脚本可复用」的好做法？（多选）', en: 'Which practices make a script reusable? (multiple)' },
      o: [
        { zh: '把脚本保存在项目里，而不是让 AI 每次重写', en: 'Save the script in the project instead of regenerating it each time' },
        { zh: '写一份 run_monthly.md 说明下次怎么用', en: 'Write run_monthly.md explaining how to run it next time' },
        { zh: '让脚本从 data/ 目录自动读取所有文件，而不是硬写死 12 个文件名', en: 'Have the script scan data/ instead of hard-coding twelve filenames' },
        { zh: '每次都换一个新的输出文件名格式', en: 'Change the output filename format every run' },
      ], a: [0, 1, 2],
      e: { zh: '固定的输入输出约定 + 一份说明，就是可复用的全部秘密。', en: 'Stable input/output conventions plus a short doc — that is all reusability takes.' } },

    { t: 'single', fig: 'dirty-flag',
      q: { zh: '数据里有合并单元格，最稳妥的处理是：', en: 'The data contains merged cells. The safest handling is:' },
      o: [
        { zh: '让 AI 自行判断', en: 'Let the AI decide' },
        { zh: '在指令里说明合并单元格的含义（如"合并表示该值向下填充"），并要求它按此处理', en: 'Explain what the merge means (e.g. "a merged cell means fill the value down") and require that handling' },
        { zh: '忽略这些行', en: 'Skip those rows' },
        { zh: '手工拆开再给 AI', en: 'Unmerge manually before giving it to the AI' },
      ], a: 1,
      e: { zh: '合并单元格的语义只有你知道，不说清楚必错。手工拆虽可行但违背自动化初衷。', en: 'Only you know what the merge means. Manual unmerging works but defeats the purpose.' } },

    { t: 'single', fig: 'plan-then-act',
      q: { zh: '「先告诉我你打算怎么处理这些数据，我确认后再执行」在数据任务中尤其重要，因为：', en: 'Plan-first matters even more in data tasks because:' },
      o: [
        { zh: '数据任务耗时长', en: 'Data tasks take long' },
        { zh: '数据处理错误往往是静默的——数字看起来正常但其实是错的', en: 'Data errors are silent — the numbers look fine but are wrong' },
        { zh: '数据文件很大', en: 'Data files are large' },
        { zh: '为了省 token', en: 'To save tokens' },
      ], a: 1,
      e: { zh: '文件改错了你看得见，数字算错了你看不见——这才是最可怕的。', en: 'A broken file is visible; a wrong number is not. That is what makes it dangerous.' } },

    { t: 'judge', fig: 'reconcile',
      q: { zh: '既然 AI 已经报告「合并完成，共 12,438 行」，就不必再自己对账了。', en: 'Since the AI reported "merged, 12,438 rows", you no longer need to reconcile.' },
      a: false,
      e: { zh: '它报告的是它自己算的数。对账是拿源文件独立验证，两回事。', en: 'That number is its own arithmetic. Reconciling verifies independently from the sources.' } },

    { t: 'single', fig: 'denominator',
      q: { zh: '要生成一张「按月汇总」表，你还必须告诉 AI 的一件事是：', en: 'For a "by month" summary, one thing you must still tell the AI is:' },
      o: [
        { zh: '用什么字体', en: 'Which font to use' },
        { zh: '「月份」按哪个字段算（下单日期？付款日期？发货日期？）', en: 'Which field defines the month (order date? payment date? shipping date?)' },
        { zh: '文件保存位置的磁盘剩余空间', en: 'How much disk space is free' },
        { zh: '你的部门名称', en: 'Your department name' },
      ], a: 1,
      e: { zh: '同一批数据按不同日期口径汇总，结果可以差很多。', en: 'The same data summarised by different date fields gives materially different results.' } },

    { t: 'single', fig: 'csv-merge',
      q: { zh: 'CSV 相比 xlsx 作为「中间产物」的主要优势是：', en: 'As an intermediate format, CSV\'s main advantage over xlsx is:' },
      o: [
        { zh: '能存公式', en: 'It stores formulas' },
        { zh: '纯文本、任何工具都能读、脚本处理简单、不容易出兼容问题', en: 'Plain text: any tool reads it, scripts handle it simply, and compatibility issues are rare' },
        { zh: '文件更好看', en: 'It looks nicer' },
        { zh: '支持图表', en: 'It supports charts' },
      ], a: 1,
      e: { zh: '最终给人看的可以用 xlsx，中间步骤用 CSV 最省事。', en: 'Deliver xlsx to humans; keep intermediates in CSV.' } },

    { t: 'multi', fig: 'issues-funnel',
      q: { zh: '下面哪些内容应该写进「问题清单」而不是自行处理？（多选）', en: 'Which belong in an issues file rather than being silently handled? (multiple)' },
      o: [
        { zh: '日期无法解析的行', en: 'Rows with unparseable dates' },
        { zh: '金额字段不是数字的行', en: 'Rows where the amount is not numeric' },
        { zh: '疑似重复的订单', en: 'Suspected duplicate orders' },
        { zh: '所有正常的行', en: 'Every normal row' },
      ], a: [0, 1, 2],
      e: { zh: '问题清单只装「需要人判断的」，装全部就失去意义了。', en: 'An issues file holds only what needs human judgement; dumping everything defeats it.' } },

    { t: 'single', fig: 'reuse-script',
      q: { zh: '下个月要重复这套流程，最省事的说法是：', en: 'To repeat the whole flow next month, the least-effort instruction is:' },
      o: [
        { zh: '把整个需求重新描述一遍', en: 'Describe the entire requirement again' },
        { zh: '「把 2026-04 的文件放进 data/ 了，用 merge.py 再跑一次，然后重新生成汇总」', en: '"I put the 2026-04 file in data/. Run merge.py again and regenerate the summary."' },
        { zh: '换一个新模型试试', en: 'Try a different model' },
        { zh: '手工复制上个月的结果改一改', en: 'Copy last month\'s result and edit it' },
      ], a: 1,
      e: { zh: '有脚本 + 有说明，复用就是一句话的事。', en: 'With a script and a doc, reuse is one sentence.' } },

    { t: 'judge', fig: 'mask-data',
      q: { zh: '把销售明细里的客户手机号一起交给 AI 处理前，应该先考虑是否需要脱敏。', en: 'Before handing sales detail containing customer phone numbers to the AI, you should consider masking them.' },
      a: true,
      e: { zh: '最小必要原则：任务不需要的敏感字段，先删掉或脱敏再处理。', en: 'Least necessary data: strip or mask sensitive fields the task does not need.' } },

    { t: 'practice', fig: 'reconcile',
      q: { zh: '实操：合并多个 CSV 并完成对账。', en: 'Hands-on: merge several CSVs and reconcile.' },
      task: {
        zh: `<p>造点数据练手（可以直接让 Claude Code 帮你造）：</p>
<ol>
<li>在练习目录下建 <code>data/</code>，放 3 个结构相同的 CSV，每个至少 10 行，包含日期、客户名、金额三列，并<b>故意</b>制造一点脏数据：至少 1 行金额带逗号或货币符号、至少 1 行日期格式不同。</li>
<li>让 Claude Code 写一个脚本，把 3 个文件合并成 <code>out/全年明细.csv</code>，增加「来源文件」列，日期统一成 YYYY-MM-DD，金额转成数字；无法处理的行写入 <code>out/问题清单.csv</code>。</li>
<li>让它<b>对账</b>：3 个源文件行数之和，是否等于明细行数 + 问题清单行数。</li>
</ol>
<p>把你的指令、对账结果（具体数字）、以及问题清单里抓到的脏数据，粘到下面。</p>`,
        en: `<p>Make some practice data (Claude Code can generate it for you):</p>
<ol>
<li>Create <code>data/</code> with 3 same-shaped CSVs, 10+ rows each, columns date / client / amount, and <b>deliberately</b> add dirt: at least one amount with a comma or currency symbol, at least one date in a different format.</li>
<li>Have Claude Code write a script merging them into <code>out/all_rows.csv</code> with a source_file column, dates normalised to YYYY-MM-DD and amounts converted to numbers; unprocessable rows go to <code>out/issues.csv</code>.</li>
<li>Have it <b>reconcile</b>: does the sum of source rows equal merged rows plus issue rows?</li>
</ol>
<p>Paste below: your instruction, the reconciliation result with actual numbers, and the dirty rows caught in the issues file.</p>`,
      },
      rubric: {
        zh: `1. 指令中必须体现：合并范围、输出路径、日期统一格式、金额转数字、异常行进问题清单。缺 1 项扣 15 分。
2. 必须给出具体的对账数字（如"10+12+11=33 行，明细 31 行 + 问题清单 2 行 = 33，对得上"）。只说"对上了"而无数字扣 25 分。
3. 必须能看到问题清单里实际抓到的脏数据内容。缺失扣 20 分。
4. 数字自相矛盾（源行数之和 ≠ 明细+问题清单，却声称对得上）扣 30 分。
5. 未真正执行、纯编造给 0 分。`,
        en: `1. The instruction must cover: merge scope, output path, date normalisation, numeric conversion, anomalies to an issues file. Deduct 15 per missing item.
2. Concrete reconciliation numbers are required (e.g. "10+12+11=33; 31 merged + 2 issues = 33, matches"). Deduct 25 for "it matched" with no numbers.
3. The actual dirty rows caught in the issues file must be shown. Deduct 20 if missing.
4. If the numbers contradict themselves (sum ≠ merged + issues yet claimed to match), deduct 30.
5. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '对账是数据工作的生命线，这道题练的就是它。', en: 'Reconciliation is the lifeline of data work — that is what this drills.' } },

    { t: 'practice', fig: 'dup-rows',
      q: { zh: '实操：用一条指令，让 AI 把「疑似重复」交还给你判断。', en: 'Hands-on: make the AI hand suspected duplicates back to you.' },
      task: {
        zh: `<p>接着上一题的数据（或新造一份，里面要有 2～3 组「同客户、同日期、同金额」的行）：</p>
<ol>
<li>写一条指令，要求 AI <b>不要自动删除任何行</b>，而是找出所有疑似重复的行，输出到 <code>out/疑似重复.csv</code>，并标注每组的行号或来源；</li>
<li>要求它在回复里说明「它判断重复的依据是哪几个字段」；</li>
<li>你看过之后，再发第二条指令决定其中哪些真的要删（或者全部保留）。</li>
</ol>
<p>把两条指令、疑似重复清单的内容、以及你最终的决定，粘到下面。</p>`,
        en: `<p>Using the data from the previous task (or new data containing 2–3 groups of same client / same date / same amount rows):</p>
<ol>
<li>Write an instruction requiring the AI to <b>delete nothing automatically</b>, instead listing all suspected duplicates into <code>out/suspected_dupes.csv</code> with row numbers or source noted;</li>
<li>Require it to state <b>which fields it used</b> to judge duplication;</li>
<li>After reviewing, send a second instruction deciding which (if any) to remove.</li>
</ol>
<p>Paste below: both instructions, the suspected-duplicates list, and your final decision.</p>`,
      },
      rubric: {
        zh: `1. 第一条指令必须明确"不要自动删除"，且要求输出疑似重复清单。缺失扣 35 分。
2. 提交内容里必须包含 AI 说明的判重依据字段（例如"客户名+日期+金额"）。缺失扣 20 分。
3. 必须包含疑似重复清单的实际内容片段。缺失扣 25 分。
4. 必须有学员本人的第二条决策指令（删除哪些/全部保留），体现"人来判断"。缺失扣 20 分。
5. 未真正执行、纯编造给 0 分。`,
        en: `1. The first instruction must explicitly forbid automatic deletion and require a suspected-duplicates output. Deduct 35 if missing.
2. The submission must include the fields the AI used to judge duplication (e.g. "client + date + amount"). Deduct 20 if missing.
3. A real snippet of the suspected-duplicates list is required. Deduct 25 if missing.
4. The learner's own second decision instruction (which to delete / keep all) must be present, showing human judgement. Deduct 20 if missing.
5. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '「机器找、人来定」是所有数据清洗任务的正确分工。', en: '"Machine finds, human decides" is the correct division of labour in data cleaning.' } },
  ],
});
