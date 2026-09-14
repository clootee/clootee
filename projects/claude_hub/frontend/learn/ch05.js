// 第 5 章：数据分析与图表 —— 从"有数据"到"有结论"，并且结论站得住
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch05',
  icon: '📈',
  minutes: 18,
  title: { zh: '分析与图表：做一份能拿去汇报的报告', en: 'Analysis and charts: a report you can actually present' },
  goal: {
    zh: '学会「先问题、后口径、再图表」的分析三步法，让 AI 产出带图的 HTML 报告，并能识别数据分析里最常见的几种错误结论。',
    en: 'Learn the three-step method — question, then definition, then chart — get an HTML report with visuals, and recognise the classic ways data conclusions go wrong.',
  },
  praise: {
    zh: '<p>你现在能独立产出一份<b>带图、带结论、且经得起追问</b>的分析报告了。更重要的是，你知道了怎么给结论"验伤"——分母对不对、口径统一没、异常值处理了没。</p><p>下一章讲一个分水岭：<b>怎么让 AI 长期记住你的规矩</b>。学完之后，你不用每次都重复交代同样的要求。</p>',
    en: '<p>You can now produce an analysis report <b>with charts, with conclusions, and able to survive follow-up questions</b>. More importantly you know how to stress-test a conclusion: is the denominator right, are definitions consistent, were outliers handled?</p><p>Next is a turning point: <b>making the AI remember your rules long-term</b>, so you stop repeating yourself.</p>',
  },

  sections: [
    {
      h: { zh: '先有问题，再有图', en: 'Question first, chart second' },
      fig: 'question-first',
      body: {
        zh: `<div class="lp-oneline">「帮我分析一下，画几个图」= 得到五张漂亮但没人知道拿来干嘛的图。</div>
<p>正确顺序永远是：<b>① 定问题 → ② 定口径 → ③ 才画图。</b>一个明确的问题，胜过十张图。</p>
<details class="lp-fold"><summary>📝 对比一下就懂了</summary><div class="lp-fold-body">
<p>❌「分析一下销售数据，画几个图。」</p>
<p>✅「我要回答一个问题：<b>Q2 比 Q1 销售额下降 12%，主要是哪些区域造成的？</b><br>
口径：销售额=不含税成交额，按下单日期归属月份，退款单剔除。<br>
先给我一张按区域的 Q1/Q2 对比柱状图，再列出下降最多的三个区域及幅度，最后说明每个区域的下降是来自订单数减少还是客单价降低。」</p>
</div></details>
<details class="lp-fold"><summary>🍊 为什么顺序不能反</summary><div class="lp-fold-body">
<p>像去医院：先说「哪儿疼」，医生才知道该拍哪个部位的片子。上来就说「给我拍几张片」，拍一堆也没用。</p>
<p>图的类型是被问题决定的：<b>比较用柱状、趋势用折线、构成用饼图、分布用直方图。</b></p>
</div></details>`,
        en: `<div class="lp-oneline">"Analyse this and draw some charts" = five pretty charts nobody can use.</div>
<p>The order is always: <b>① fix the question → ② fix the definitions → ③ then chart.</b> One sharp question beats ten charts.</p>
<details class="lp-fold"><summary>📝 Compare the two</summary><div class="lp-fold-body">
<p>❌ "Analyse the sales data and draw some charts."</p>
<p>✅ "I need to answer one question: <b>Q2 revenue is down 12% versus Q1 — which regions drove that?</b><br>
Definitions: revenue = net of tax, attributed by order date, refunded orders excluded.<br>
First a bar chart comparing Q1 and Q2 by region, then the three largest declines with magnitudes, then say for each whether it came from fewer orders or a lower average order value."</p>
</div></details>
<details class="lp-fold"><summary>🍊 Why the order cannot flip</summary><div class="lp-fold-body">
<p>Like seeing a doctor: say where it hurts and they know what to scan. "Just take some scans" produces a pile of useless images.</p>
<p>The chart type follows the question: <b>bars compare, lines show trend, pie shows composition, histogram shows distribution.</b></p>
</div></details>`,
      },
    },
    {
      h: { zh: '让它先说口径，你确认了再算', en: 'Make it state the definitions before computing' },
      fig: 'plan-then-act',
      body: {
        zh: `<div class="lp-oneline">错误的分析和正确的分析长得一模一样——都是几个数字加几张图。</div>
<pre>先不要开始计算。请先告诉我：
1. 你打算怎么定义「客单价」「活跃客户」「复购」；
2. 你打算怎么处理退款单、跨月订单、金额为 0 的行；
3. 你打算画哪几张图，每张回答什么问题。
我确认后你再动手。</pre>
<p>花你 30 秒，挡掉两小时返工。而且它列出的定义里，<b>往往有一两个和你想的不一样</b>——那正是你要修正的。</p>
<details class="lp-fold"><summary>🔍 顺手做一件事</summary><div class="lp-fold-body">
<p>让它把最终确认下来的口径，<b>原样写进报告开头</b>（「本报告口径说明」）。</p>
<p>报告发出去后有人质疑数字，你直接指着这一节回答，能挡掉大量无谓争论。</p>
</div></details>`,
        en: `<div class="lp-oneline">A wrong analysis looks exactly like a right one — both are numbers and charts.</div>
<pre>Do not start computing yet. First tell me:
1. How you will define "average order value", "active customer" and "repeat purchase";
2. How you will handle refunds, cross-month orders and zero-amount rows;
3. Which charts you plan to draw and which question each answers.
Wait for my confirmation.</pre>
<p>Thirty seconds saves two hours. And one or two of its definitions <b>will differ from what you had in mind</b> — exactly what you needed to catch.</p>
<details class="lp-fold"><summary>🔍 One free habit</summary><div class="lp-fold-body">
<p>Have it copy the agreed definitions <b>verbatim into the top of the report</b> ("Definitions used").</p>
<p>When someone questions a number later, you point at that section — and skip a long argument.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '给结论「验伤」：五个必问', en: 'Stress-testing a conclusion: five questions' },
      fig: 'denominator',
      body: {
        zh: `<div class="lp-oneline">任何一条答不上来，这个结论就还不能拿去汇报。</div>
<ol>
<li><b>分母是什么？</b>「转化率降 5%」——分母是访问量还是有效线索？分母变了，比率毫无意义。</li>
<li><b>口径一致吗？</b>Q1 和 Q2 的「销售额」是同一个定义吗？</li>
<li><b>异常值处理了吗？</b>一笔 500 万的大单会把整月「平均客单价」拉飞。</li>
<li><b>样本够吗？</b>「西北区复购率 60%」——如果那儿总共 5 个客户，这数字说明不了任何问题。</li>
<li><b>相关还是因果？</b>「发券的客户复购率更高」，可能只是<b>本来就爱买的人才去领券</b>。</li>
</ol>
<details class="lp-fold"><summary>📝 把这五问直接写进指令</summary><div class="lp-fold-body">
<pre>给出每条结论时，请同时说明：使用的分母是什么、样本量多少、
是否剔除了异常值及理由、这是相关性还是因果关系。
凡是样本量小于 30 的结论，明确标注「样本量不足，仅供参考」。</pre>
<p>写进去，它就会自己先过一遍，省得你逐条追问。</p>
</div></details>
<details class="lp-fold"><summary>🍊 异常值为什么这么讨厌</summary><div class="lp-fold-body">
<p>十个人在酒吧，平均月薪一万。<b>比尔·盖茨走进来</b>，平均月薪变成十亿——但屋里没有一个人的真实收入接近这个数。</p>
<p>所以有极端值时，<b>中位数比平均数更能反映「典型水平」</b>。要么剔除并说明理由，要么改用中位数。</p>
</div></details>`,
        en: `<div class="lp-oneline">If any of these is unanswerable, the conclusion is not presentable yet.</div>
<ol>
<li><b>What is the denominator?</b> "Conversion down 5%" — of visits or qualified leads? If the denominator moved, the ratio means nothing.</li>
<li><b>Are definitions consistent?</b> Is "revenue" the same thing in Q1 and Q2?</li>
<li><b>Were outliers handled?</b> One five-million deal drags a whole month's average order value.</li>
<li><b>Is the sample big enough?</b> "60% repeat rate in the northwest" says nothing if the region has five customers.</li>
<li><b>Correlation or causation?</b> "Coupon recipients repeat more" may just mean <b>frequent buyers claim coupons</b>.</li>
</ol>
<details class="lp-fold"><summary>📝 Put the five straight into the instruction</summary><div class="lp-fold-body">
<pre>For each conclusion, also state: the denominator used, the sample size,
whether outliers were excluded and why, and whether this is correlation or causation.
Label any conclusion with a sample smaller than 30 as "sample too small — indicative only".</pre>
<p>Write it in and it self-checks, so you do not have to interrogate every line.</p>
</div></details>
<details class="lp-fold"><summary>🍊 Why outliers are so annoying</summary><div class="lp-fold-body">
<p>Ten people in a bar, average salary modest. <b>Bill Gates walks in</b> and the average becomes astronomical — while nobody in the room earns anything close.</p>
<p>With extreme values, <b>the median reflects the typical level better than the mean</b>. Either exclude and disclose, or switch to the median.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '产出：一份别人打得开的报告', en: 'Delivery: a report that opens on their machine' },
      fig: 'offline-html',
      body: {
        zh: `<div class="lp-oneline">HTML 单文件最好用，但一定要写明「图表内嵌，不依赖外网」。</div>
<p>否则你这边有网一切正常，同事在内网打开是<b>一片空白</b>——这是最常见的翻车。</p>
<table>
<tr><th>形态</th><th>适合</th></tr>
<tr><td>HTML 单文件</td><td>发给别人看，双击就能开</td></tr>
<tr><td>Markdown + 图片</td><td>放进知识库、贴进文档</td></tr>
<tr><td>Excel 多 sheet</td><td>别人还要在你基础上继续算（记得保留明细 sheet）</td></tr>
</table>
<details class="lp-fold"><summary>📝 完整的报告指令</summary><div class="lp-fold-body">
<pre>【目标】基于 out/全年明细.csv 生成上半年销售分析报告。
【口径】用上面已确认的定义，原样写进报告开头。
【产出】out/报告.html，单文件，图表内嵌不依赖外网，包含：
  1) 口径说明
  2) 核心结论（3 条以内，每条带具体数字）
  3) 月度趋势折线图 + 一句话解读
  4) 区域对比柱状图 + 下降最多的三个区域及原因拆解
  5) Top10 客户占比 + 风险提示
  6) 数据质量说明：处理了多少异常行、剔除了什么
【约束】
- 结论必须能从数据里算出来，不要加入你对行业的一般性判断；
- 每个数字标注怎么算的（用了哪些字段、什么筛选条件）；
- 数据支撑不足的，直接写「数据不足以判断」。</pre>
</div></details>
<details class="lp-fold"><summary>⚠️ 最该删掉的那句话</summary><div class="lp-fold-body">
<p>「这通常是因为市场竞争加剧。」</p>
<p>听起来很专业，但它<b>根本不知道你们行业发生了什么</b>——这句纯属编造。报告只能说数据支持的结论，原因分析必须标明是推测。</p>
<p>同理，结论超过三条，读者一条都记不住。<b>分析的价值在于取舍。</b></p>
</div></details>`,
        en: `<div class="lp-oneline">A single HTML file is best — but you must require "charts inlined, no external dependencies".</div>
<p>Otherwise it looks fine on your machine and opens <b>completely blank</b> for a colleague behind a firewall. This is the classic failure.</p>
<table>
<tr><th>Format</th><th>Best for</th></tr>
<tr><td>Single HTML file</td><td>Sending to people; double-click to open</td></tr>
<tr><td>Markdown + images</td><td>Wikis and documents</td></tr>
<tr><td>Multi-sheet Excel</td><td>When others keep calculating on it (keep the detail sheet)</td></tr>
</table>
<details class="lp-fold"><summary>📝 The full report instruction</summary><div class="lp-fold-body">
<pre>[Goal] From out/all_rows.csv, produce the H1 sales analysis report.
[Definitions] Use the ones confirmed above, copied verbatim into the top.
[Output] out/report.html — single file, charts inlined with no external dependencies:
  1) Definitions used
  2) Key findings (max 3, each with concrete numbers)
  3) Monthly trend line chart + one-sentence reading
  4) Regional comparison bars + the three largest declines broken down by cause
  5) Top-10 customer share + risk note
  6) Data quality note: anomalous rows handled, what was excluded
[Constraints]
- Every conclusion must be computable from the data; no general industry judgement;
- Annotate each number with how it was computed;
- If support is lacking, write "insufficient data".</pre>
</div></details>
<details class="lp-fold"><summary>⚠️ The sentence to delete</summary><div class="lp-fold-body">
<p>"This is typically due to intensifying market competition."</p>
<p>Professional-sounding and entirely invented — it <b>has no idea what happened in your industry</b>. A report may only state what the data supports; causal reasoning must be labelled a hypothesis.</p>
<p>Same discipline on length: past three findings, the reader remembers none. <b>Analysis is about prioritising.</b></p>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: '口径', en: 'Field definition' }, d: { zh: '指标的确切定义与统计规则，分析的地基', en: 'The exact definition and counting rule of a metric — the foundation of analysis' } },
    { k: { zh: '客单价', en: 'Average order value' }, d: { zh: '常见定义：销售额 ÷ 订单数（也有人用 ÷ 客户数，必须说清）', en: 'Usually revenue ÷ orders (some use ÷ customers — say which)' } },
    { k: { zh: '异常值 / 离群值', en: 'Outlier' }, d: { zh: '远离其他数据的极端值，会严重扭曲平均数', en: 'Extreme values far from the rest; they badly distort averages' } },
    { k: { zh: '样本量', en: 'Sample size' }, d: { zh: '一个结论背后有多少条数据支撑，太少则结论不成立', en: 'How many data points back a conclusion; too few and it does not hold' } },
    { k: { zh: '相关 ≠ 因果', en: 'Correlation ≠ causation' }, d: { zh: '两件事一起发生，不等于其中一个导致了另一个', en: 'Two things moving together does not mean one caused the other' } },
    { k: { zh: '同比 / 环比', en: 'YoY / period-over-period' }, d: { zh: '同比=与去年同期比，环比=与上一个周期比，两者结论可能相反', en: 'Year-over-year vs period-over-period; they can point in opposite directions' } },
    { k: { zh: '内嵌图表', en: 'Inlined charts' }, d: { zh: '图表数据与代码都打包在 HTML 里，断网也能正常显示', en: 'Chart data and code bundled into the HTML so it renders offline' } },
  ],

  quiz: [
    { t: 'single', fig: 'question-first',
      q: { zh: '分析三步法的正确顺序是：', en: 'The correct order of the three-step method is:' },
      o: [
        { zh: '图 → 口径 → 问题', en: 'Chart → definition → question' },
        { zh: '问题 → 口径 → 图', en: 'Question → definition → chart' },
        { zh: '口径 → 图 → 问题', en: 'Definition → chart → question' },
        { zh: '随便，结果都一样', en: 'Any order — same result' },
      ], a: 1,
      e: { zh: '先有要回答的问题，才知道该定什么口径、画什么图。', en: 'The question determines which definitions matter and which chart to draw.' } },

    { t: 'single', fig: 'question-first',
      q: { zh: '「帮我分析一下这份销售数据，画几个图」这条指令的主要问题是：', en: 'What is wrong with "analyse this sales data and draw some charts"?' },
      o: [
        { zh: '太短', en: 'Too short' },
        { zh: '没有明确要回答的问题，产出必然是一堆没用途的图', en: 'No question to answer, so the output is charts with no purpose' },
        { zh: '没指定颜色', en: 'No colours specified' },
        { zh: '没说用什么软件', en: 'No tool specified' },
      ], a: 1,
      e: { zh: '一个明确的问题胜过十张图。', en: 'One sharp question beats ten charts.' } },

    { t: 'multi', fig: 'denominator',
      q: { zh: '计算「客单价」之前必须明确哪些口径？（多选）', en: 'Before computing average order value, which definitions must be settled? (multiple)' },
      o: [
        { zh: '分母用订单数还是客户数', en: 'Denominator: orders or customers' },
        { zh: '退款订单算不算', en: 'Whether refunds count' },
        { zh: '跨月订单归属哪个月', en: 'Which month owns a cross-month order' },
        { zh: '图表用什么颜色', en: 'The chart colour scheme' },
      ], a: [0, 1, 2],
      e: { zh: '颜色是呈现问题，不影响数字对错。', en: 'Colour is presentation; it cannot make a number right or wrong.' } },

    { t: 'single', fig: 'denominator',
      q: { zh: '「转化率下降了 5%」这个结论，你首先要问的是：', en: 'For "conversion dropped 5%", your first question should be:' },
      o: [
        { zh: '用什么颜色画的', en: 'What colour was the chart' },
        { zh: '分母是什么（访问量？有效线索？），分母有没有同时变化', en: 'What the denominator is (visits? qualified leads?) and whether it changed too' },
        { zh: '是谁算的', en: 'Who computed it' },
        { zh: '文件存在哪', en: 'Where the file is saved' },
      ], a: 1,
      e: { zh: '比率的变化，一半以上的坑在分母上。', en: 'With ratios, most traps live in the denominator.' } },

    { t: 'single', fig: 'outlier',
      q: { zh: '某月有一笔 500 万的大单，直接算「平均客单价」会导致：', en: 'One five-million deal in a month makes the raw average order value:' },
      o: [
        { zh: '结果更准确', en: 'More accurate' },
        { zh: '平均值被严重拉高，无法反映典型订单的水平', en: 'Badly inflated, no longer representing a typical order' },
        { zh: '没有影响', en: 'Unaffected' },
        { zh: '自动被系统排除', en: 'Automatically excluded by the system' },
      ], a: 1,
      e: { zh: '异常值扭曲平均数，要么剔除并说明，要么改用中位数。', en: 'Outliers distort means: exclude and disclose, or use the median.' } },

    { t: 'judge', fig: 'sample-small',
      q: { zh: '「西北区复购率高达 60%」——如果西北区只有 5 个客户，这个结论依然可靠。', en: '"The northwest has a 60% repeat rate" is still reliable even if the region has only five customers.' },
      a: false,
      e: { zh: '样本量太小，60% 可能只是 3 个人的偶然行为。', en: 'The sample is too small; 60% may be three people behaving randomly.' } },

    { t: 'single', fig: 'corr-causal',
      q: { zh: '「发了优惠券的客户复购率更高，所以要多发优惠券」这个推理的问题是：', en: 'What is wrong with "coupon recipients repeat more, so send more coupons"?' },
      o: [
        { zh: '优惠券成本太高', en: 'Coupons are expensive' },
        { zh: '把相关当成了因果——可能是本来就爱买的人才去领券', en: 'It confuses correlation with causation — frequent buyers may simply be the ones claiming coupons' },
        { zh: '样本量不足', en: 'The sample is too small' },
        { zh: '没有画图', en: 'There is no chart' },
      ], a: 1,
      e: { zh: '相关 ≠ 因果，是数据分析最经典的陷阱。', en: 'Correlation is not causation — the classic trap.' } },

    { t: 'multi', fig: 'question-first',
      q: { zh: '给结论「验伤」的五个必问包括：（多选）', en: 'The five stress-test questions include: (multiple)' },
      o: [
        { zh: '分母是什么', en: 'What is the denominator' },
        { zh: '前后口径是否一致', en: 'Are definitions consistent over time' },
        { zh: '样本量够不够', en: 'Is the sample large enough' },
        { zh: '报告排版是否美观', en: 'Is the layout attractive' },
      ], a: [0, 1, 2],
      e: { zh: '还有两条是"异常值处理了吗"和"相关还是因果"。排版不在其中。', en: 'The other two are outlier handling and correlation vs causation. Layout is not one.' } },

    { t: 'single', fig: 'offline-html',
      q: { zh: '要求 HTML 报告「图表内嵌、不依赖外网」的原因是：', en: 'Why require "charts inlined, no external dependencies" in an HTML report?' },
      o: [
        { zh: '文件更小', en: 'Smaller file' },
        { zh: '别人在没网或内网环境打开时，图表不会变成空白', en: 'It still renders for someone offline or behind a corporate firewall' },
        { zh: '加载更快', en: 'Faster loading' },
        { zh: '更安全', en: 'More secure' },
      ], a: 1,
      e: { zh: '依赖外网 CDN 的报告，发给客户经常是一片空白。', en: 'CDN-dependent reports frequently open blank on the recipient\'s machine.' } },

    { t: 'single', fig: 'hallucination',
      q: { zh: '报告里出现「这通常是因为市场竞争加剧」这句话，正确的处理是：', en: 'A report says "this is typically due to intensifying competition". You should:' },
      o: [
        { zh: '很专业，保留', en: 'Keep it — sounds professional' },
        { zh: '删掉或标明是推测——数据里没有支撑这句话的依据', en: 'Remove it or label it as a hypothesis — the data does not support it' },
        { zh: '让 AI 再展开写三段', en: 'Ask the AI to expand it into three paragraphs' },
        { zh: '加粗强调', en: 'Bold it for emphasis' },
      ], a: 1,
      e: { zh: '这是典型的"听起来专业的编造"，模型并不知道你们行业发生了什么。', en: 'A textbook professional-sounding invention — the model has no idea what happened in your industry.' } },

    { t: 'multi', fig: 'chart-types',
      q: { zh: '图表类型与用途，哪些搭配是合适的？（多选）', en: 'Which chart-to-purpose pairings are appropriate? (multiple)' },
      o: [
        { zh: '比较不同区域销售额 → 柱状图', en: 'Comparing revenue across regions → bar chart' },
        { zh: '看 12 个月的变化趋势 → 折线图', en: 'Trend over 12 months → line chart' },
        { zh: '看 Top10 客户的占比构成 → 饼图或堆叠图', en: 'Composition of top-10 customer share → pie or stacked chart' },
        { zh: '展示两个数字的大小关系 → 三维旋转饼图', en: 'Comparing two numbers → 3-D rotating pie' },
      ], a: [0, 1, 2],
      e: { zh: '花哨的三维图会扭曲视觉比例，是最该避免的图表形式。', en: '3-D pies distort visual proportion — the chart type to avoid.' } },

    { t: 'single', fig: 'plan-then-act',
      q: { zh: '「让它先说计划再动手」在分析任务中尤其重要，因为：', en: 'Plan-first matters especially in analysis because:' },
      o: [
        { zh: '分析很花时间', en: 'Analysis takes time' },
        { zh: '错误的分析和正确的分析长得一模一样，都是数字加图', en: 'A wrong analysis looks identical to a right one — numbers and charts' },
        { zh: '模型算力有限', en: 'Model compute is limited' },
        { zh: '为了省钱', en: 'To save money' },
      ], a: 1,
      e: { zh: '文件改错看得见，数字算错看不见。', en: 'A broken file is visible; a wrong number is not.' } },

    { t: 'judge', fig: 'trace-quote',
      q: { zh: '把最终确认的口径写进报告开头，是为了让别人质疑数字时有据可依。', en: 'Putting the agreed definitions at the top of the report gives you something to point at when numbers are questioned.' },
      a: true,
      e: { zh: '口径说明是报告的"地基公示"，能挡掉大量无谓争论。', en: 'A definitions section is the report\'s published foundation and prevents pointless arguments.' } },

    { t: 'single', fig: 'chart-types',
      q: { zh: '「同比」和「环比」的区别是：', en: 'The difference between year-over-year and period-over-period is:' },
      o: [
        { zh: '没有区别', en: 'No difference' },
        { zh: '同比是与去年同期比，环比是与上一个周期比，结论可能相反', en: 'YoY compares to the same period last year; PoP compares to the previous period — they can disagree' },
        { zh: '同比用于金额，环比用于数量', en: 'YoY is for amounts, PoP for counts' },
        { zh: '环比更准确', en: 'PoP is more accurate' },
      ], a: 1,
      e: { zh: '有季节性的业务，环比涨而同比跌是很常见的。', en: 'In seasonal businesses, PoP up while YoY down is common.' } },

    { t: 'single', fig: 'trace-quote',
      q: { zh: '要求「每个数字后面标注它是怎么算的」，主要目的是：', en: 'Annotating each number with how it was computed mainly serves to:' },
      o: [
        { zh: '让报告更长', en: 'Lengthen the report' },
        { zh: '让每个数字可复核、可追溯，出问题能定位到具体算法', en: 'Make every number verifiable and traceable to its computation' },
        { zh: '展示技术能力', en: 'Show off technical skill' },
        { zh: '满足格式要求', en: 'Satisfy a format rule' },
      ], a: 1,
      e: { zh: '不可复核的数字等于没有数字。', en: 'An unverifiable number is no number at all.' } },

    { t: 'single', fig: 'three-findings',
      q: { zh: '如果某个结论数据支撑不足，最好的处理是：', en: 'If a conclusion lacks data support, the best handling is:' },
      o: [
        { zh: '删掉相关章节假装没这回事', en: 'Delete the section and pretend it does not exist' },
        { zh: '直接写"数据不足以判断"', en: 'Write "insufficient data to conclude"' },
        { zh: '用行业常识补上', en: 'Fill it in with general industry knowledge' },
        { zh: '把结论说得模糊一点', en: 'Word the conclusion vaguely' },
      ], a: 1,
      e: { zh: '「不知道」是一个合法且有价值的结论，模糊表述才是最坏的。', en: '"We do not know" is a legitimate, valuable finding; vague wording is the worst option.' } },

    { t: 'multi', fig: 'offline-html',
      q: { zh: '交付形态与场景，哪些搭配合理？（多选）', en: 'Which delivery-format pairings make sense? (multiple)' },
      o: [
        { zh: '发给别人双击就能看 → 单文件 HTML', en: 'Someone should just double-click → single-file HTML' },
        { zh: '放进知识库 → Markdown + 图片', en: 'Goes into a wiki → Markdown + images' },
        { zh: '别人还要继续算 → 多 sheet 的 Excel，保留明细', en: 'Others will keep calculating → multi-sheet Excel with the detail sheet' },
        { zh: '给客户看 → 直接发原始 CSV', en: 'For a client → send the raw CSV' },
      ], a: [0, 1, 2],
      e: { zh: '把原始明细直接发给客户既不友好，也可能泄露不该给的数据。', en: 'Raw detail is unfriendly to clients and may leak data they should not see.' } },

    { t: 'single', fig: 'sample-small',
      q: { zh: '「样本量小于 30 的结论请标注『样本量不足』」这类要求属于：', en: '"Label conclusions with n < 30 as sample-limited" is an example of:' },
      o: [
        { zh: '产出格式要求', en: 'An output format rule' },
        { zh: '让 AI 自查的约束，把统计谨慎性写进流程', en: 'A self-check constraint that bakes statistical caution into the process' },
        { zh: '角色设定', en: 'A role setting' },
        { zh: '受众说明', en: 'An audience note' },
      ], a: 1,
      e: { zh: '把验伤五问写进指令，AI 就会自己先过一遍。', en: 'Putting the five stress-test questions into the instruction makes it self-check first.' } },

    { t: 'judge', fig: 'median-mean',
      q: { zh: '中位数在有极端值的情况下，通常比平均数更能反映"典型水平"。', en: 'With extreme values present, the median usually reflects the typical level better than the mean.' },
      a: true,
      e: { zh: '一笔大单能把平均值拉飞，但对中位数影响很小。', en: 'One huge deal blows up the mean but barely moves the median.' } },

    { t: 'single', fig: 'split-steps',
      q: { zh: '「Q2 销售额下降 12%」，要拆解原因，最有价值的下一步是：', en: 'To break down "Q2 revenue fell 12%", the most valuable next step is:' },
      o: [
        { zh: '换一种颜色重画图', en: 'Redraw the chart in another colour' },
        { zh: '拆到订单数和客单价两个因子，看是买的人少了还是单笔金额降了', en: 'Split into order count and average order value — fewer buyers or smaller orders?' },
        { zh: '增加图表数量', en: 'Add more charts' },
        { zh: '换一个模型再算一次', en: 'Recompute with another model' },
      ], a: 1,
      e: { zh: '「量 × 价」的拆解，是营收类分析最基础也最有效的一刀。', en: 'The volume × price split is the most basic and effective cut in revenue analysis.' } },

    { t: 'single', fig: 'issues-funnel',
      q: { zh: '让 AI 分析数据时，要求它「说明处理了多少异常行、剔除了什么」，属于报告的哪一部分？', en: '"State how many anomalous rows were handled and what was excluded" belongs to which report section?' },
      o: [
        { zh: '核心结论', en: 'Key findings' },
        { zh: '数据质量说明', en: 'Data quality note' },
        { zh: '图表', en: 'Charts' },
        { zh: '口径说明', en: 'Definitions' },
      ], a: 1,
      e: { zh: '数据质量说明是报告可信度的一部分，不能省。', en: 'The data-quality note is part of the report\'s credibility and cannot be skipped.' } },

    { t: 'single', fig: 'denominator',
      q: { zh: '你要求 AI「口径：销售额=不含税成交额，按下单日期归属月份，退款单剔除」，这句话解决了什么？', en: 'Specifying "revenue = net of tax, attributed by order date, refunds excluded" solves:' },
      o: [
        { zh: '图表美观问题', en: 'Chart aesthetics' },
        { zh: '同一份数据被不同规则算出不同结果的问题', en: 'The problem of the same data yielding different results under different rules' },
        { zh: '文件编码问题', en: 'File encoding' },
        { zh: '性能问题', en: 'Performance' },
      ], a: 1,
      e: { zh: '口径就是把"怎么算"钉死，避免结果无法复现。', en: 'Definitions pin down how it is computed so results are reproducible.' } },

    { t: 'multi', fig: 'hallucination',
      q: { zh: '下面哪些说法属于「数据支撑的结论」而不是编造？（多选）', en: 'Which are data-supported conclusions rather than invention? (multiple)' },
      o: [
        { zh: '华东区 Q2 销售额 1,240 万，环比下降 18%', en: 'East region Q2 revenue was 12.4M, down 18% period-over-period' },
        { zh: 'Top10 客户贡献了 63% 的销售额', en: 'The top 10 customers contributed 63% of revenue' },
        { zh: '下降主要由订单数减少（-22%）导致，客单价基本持平（+1%）', en: 'The decline came mainly from order count (-22%); average order value was flat (+1%)' },
        { zh: '客户流失是因为竞争对手最近加大了促销力度', en: 'Churn is because competitors recently increased promotions' },
      ], a: [0, 1, 2],
      e: { zh: '最后一条是外部信息，数据里根本没有，属于编造。', en: 'The last is external information absent from the data — invention.' } },

    { t: 'single', fig: 'three-findings',
      q: { zh: '「客户集中度：Top10 占比 63%」这个数字，最值得配的一句话是：', en: 'For "top-10 customer share is 63%", the most valuable accompanying line is:' },
      o: [
        { zh: '说明我们的大客户战略很成功', en: 'It proves our key-account strategy works' },
        { zh: '集中度较高，前两大客户流失将直接影响约 X% 的营收，属于风险点', en: 'Concentration is high: losing the top two clients would hit roughly X% of revenue — a risk' },
        { zh: '这是行业平均水平', en: 'This is the industry average' },
        { zh: '建议继续保持', en: 'Recommend maintaining this' },
      ], a: 1,
      e: { zh: '数字要落到"意味着什么风险/机会"，且这个推论仍然基于数据本身。', en: 'A number should land on a risk or opportunity — and that inference must still come from the data.' } },

    { t: 'judge', fig: 'three-findings',
      q: { zh: '报告里的「核心结论」条数越多越好，说明分析得越透彻。', en: 'The more key findings a report lists, the more thorough the analysis.' },
      a: false,
      e: { zh: '结论超过三条，读者一条都记不住。分析的价值在于取舍。', en: 'Past three, the reader remembers none. Analysis is about prioritising.' } },

    { t: 'single', fig: 'reconcile',
      q: { zh: 'AI 给出的图表数据和它文字里写的数字对不上，你应该：', en: 'The chart data and the text numbers disagree. You should:' },
      o: [
        { zh: '以图为准', en: 'Trust the chart' },
        { zh: '以文字为准', en: 'Trust the text' },
        { zh: '两个都不信，让它重新用同一份计算结果同时生成图和文字，并打印中间数据', en: 'Trust neither: have it regenerate both from one computation and print the intermediate numbers' },
        { zh: '取平均值', en: 'Average them' },
      ], a: 2,
      e: { zh: '不一致说明中间某处算了两遍。要求单一数据源生成，是根治办法。', en: 'A mismatch means it computed twice. Requiring a single source of truth is the real fix.' } },

    { t: 'single', fig: 'three-findings',
      q: { zh: '分析报告最应该避免的表述是：', en: 'The phrasing an analysis report should most avoid:' },
      o: [
        { zh: '"数据不足以判断"', en: '"Insufficient data to conclude"' },
        { zh: '"整体呈现良好的增长态势"（无具体数字）', en: '"Overall showing healthy growth momentum" (no numbers)' },
        { zh: '"华东区环比下降 18%"', en: '"East region down 18% period-over-period"' },
        { zh: '"该结论样本量为 12，仅供参考"', en: '"This conclusion is based on n=12; indicative only"' },
      ], a: 1,
      e: { zh: '没有数字的判断句，既不能验证也不能行动，是纯粹的噪声。', en: 'A judgement with no numbers cannot be verified or acted on — pure noise.' } },

    { t: 'single', fig: 'reuse-script',
      q: { zh: '你要把这份分析下个季度再做一遍，最省事的准备是：', en: 'You will redo this analysis next quarter. The best preparation is:' },
      o: [
        { zh: '把这次的报告存好，下次照着抄', en: 'Save this report and copy it next time' },
        { zh: '让 AI 把口径说明 + 分析脚本 + 报告模板一起留在项目里，下次换数据重跑', en: 'Have the AI leave the definitions, the analysis script and the report template in the project, then swap the data and rerun' },
        { zh: '记住这次用的提示词', en: 'Memorise the prompt you used' },
        { zh: '不用准备，重新描述一遍就行', en: 'No preparation — just re-describe it' },
      ], a: 1,
      e: { zh: '和第 3 章一样：把一次性劳动沉淀成可复用资产（脚本 + 口径 + 模板）。', en: 'Same as Chapter 3: turn one-off labour into reusable assets — script, definitions, template.' } },

    { t: 'practice', fig: 'denominator',
      q: { zh: '实操：完成一次「先定口径、再出结论」的分析。', en: 'Hands-on: run one analysis with definitions fixed before conclusions.' },
      task: {
        zh: `<p>准备一份销售类数据（可以让 Claude Code 帮你生成 100 行以上的模拟数据，包含日期、区域、客户、金额、是否退款五列）：</p>
<ol>
<li>先发一条指令，<b>要求它不要计算</b>，只说明它打算怎么定义「销售额」「客单价」，以及怎么处理退款单和异常值；</li>
<li>你审阅后确认或纠正它的定义；</li>
<li>再让它基于确认的口径，给出<b>不超过 3 条</b>核心结论，每条必须带具体数字，并注明分母、样本量。</li>
</ol>
<p>把三步的指令与关键回复粘到下面，重点体现「你纠正过它哪一条定义」。</p>`,
        en: `<p>Prepare sales-like data (Claude Code can generate 100+ mock rows with date, region, client, amount, refunded):</p>
<ol>
<li>Send an instruction <b>forbidding computation</b>, asking only how it will define "revenue" and "average order value", and how it will treat refunds and outliers;</li>
<li>Review and confirm or correct its definitions;</li>
<li>Then have it produce <b>at most 3</b> key findings under the agreed definitions, each with concrete numbers, denominator and sample size.</li>
</ol>
<p>Paste all three instructions and the key replies, highlighting <b>which definition you corrected</b>.</p>`,
      },
      rubric: {
        zh: `1. 必须能看到第一条"先别计算、先说口径"的指令，以及 AI 给出的口径定义。缺失扣 35 分。
2. 必须体现学员对口径的审阅动作——确认或纠正其中至少一条（例如指出退款单应剔除、客单价分母该用订单数）。完全没有审阅动作扣 30 分。
3. 最终结论必须不超过 3 条，且每条带具体数字。超过 3 条或无数字各扣 15 分。
4. 结论中若出现明显的编造性归因（如"因为竞争加剧"）扣 20 分。
5. 未真正执行、纯编造给 0 分。`,
        en: `1. The first instruction ("do not compute yet, state definitions") and the AI's definitions must be visible. Deduct 35 if missing.
2. The learner must visibly review the definitions — confirming or correcting at least one (e.g. refunds excluded, denominator = orders). Deduct 30 if no review happened.
3. Final findings must be at most 3, each with concrete numbers. Deduct 15 each for exceeding 3 or lacking numbers.
4. Deduct 20 if findings contain invented attribution (e.g. "because competition intensified").
5. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '口径先行是分析工作和"随便画几张图"的分水岭。', en: 'Definitions-first is what separates analysis from "some charts".' } },

    { t: 'practice', fig: 'offline-html',
      q: { zh: '实操：产出一份自带图表、可双击打开的 HTML 报告。', en: 'Hands-on: produce a self-contained HTML report that opens on double-click.' },
      task: {
        zh: `<p>基于上一题的数据，让 Claude Code 生成 <code>报告.html</code>，要求：</p>
<ol>
<li><b>单文件</b>，图表内嵌，<b>不依赖任何外网资源</b>（断网也能正常显示）；</li>
<li>包含：口径说明、不超过 3 条核心结论、至少 2 张图（一张趋势、一张对比）、数据质量说明；</li>
<li>每个数字标注计算方式。</li>
</ol>
<p>生成后<b>断开网络</b>或直接双击打开验证图表是否正常显示。把你的指令、报告结构（各章节标题）、以及断网打开的验证结果粘到下面。</p>`,
        en: `<p>Using the previous data, have Claude Code produce <code>report.html</code>, requiring:</p>
<ol>
<li><b>Single file</b>, charts inlined, <b>no external resources</b> (must render offline);</li>
<li>Sections: definitions, at most 3 key findings, at least 2 charts (one trend, one comparison), data-quality note;</li>
<li>Each number annotated with how it was computed.</li>
</ol>
<p>Then <b>disconnect the network</b> (or just double-click) and confirm the charts still render. Paste your instruction, the report's section headings, and the offline verification result.</p>`,
      },
      rubric: {
        zh: `1. 指令中必须明确"单文件 + 图表内嵌 + 不依赖外网"。缺失扣 30 分。
2. 必须给出报告的实际章节结构，且至少包含口径说明、核心结论、图表、数据质量说明四类。每缺一类扣 10 分。
3. 必须有断网/双击打开的验证结论（说明图表是否正常显示）。只说"生成成功"而无打开验证扣 25 分。
4. 若学员如实说明"图表打不开/依赖了外网，已让 AI 改成内嵌"，视为完成验证，不扣分反而说明验收到位。
5. 未真正执行、纯编造给 0 分。`,
        en: `1. The instruction must state "single file + inlined charts + no external dependencies". Deduct 30 if missing.
2. The actual section structure must be shown, covering definitions, key findings, charts and a data-quality note. Deduct 10 per missing category.
3. An offline/double-click verification result is required (did the charts render?). Deduct 25 for "generated successfully" with no verification.
4. If the learner honestly reports "charts were blank because of a CDN dependency, so I had it inline them", that counts as proper verification — no deduction.
5. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '"能在别人电脑上打开"才算交付完成，这一步经常被忽略。', en: 'Delivery is not done until it opens on someone else\'s machine — the step most often skipped.' } },
  ],
});
