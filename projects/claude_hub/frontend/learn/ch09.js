// 第 9 章（加餐）：想学什么新领域，就让 AI 给你现做一份带 AI 小助手的网页教程
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch09',
  icon: '🎁',
  minutes: 12,
  title: { zh: '加餐：让 AI 给你做一份教程（学任何新领域都能用）', en: 'Bonus: have the AI build you a tutorial (works for any new field)' },
  goal: {
    zh: '学会一条可以反复用的提示词：想搞懂什么，就让 Claude Code 做一份带 AI 小助手的网页教程，看不懂的地方划词就能追问。',
    en: 'Learn one reusable prompt: whatever you need to understand, have Claude Code build a web tutorial with a built-in AI assistant, so you can select any sentence and dig deeper.',
  },
  praise: {
    zh: '<p>这一章的东西<b>你会用一辈子</b>。</p><p>以后不管撞见什么陌生词——GEO、DDR、期权池、ISO 9001、你们公司新上的那套系统——都不用再去翻十篇质量参差的文章。<b>一条提示词，十分钟，一份为你量身定做、还能随时追问的教程。</b></p><p>而且它是可以复利的：你做的每一份教程都能发给同事，别人填上自己的 Key 就能用。</p>',
    en: '<p>You will use this one <b>for the rest of your life</b>.</p><p>Next time you hit an unfamiliar term — GEO, DDR, option pool, ISO 9001, that new system your company just rolled out — you no longer wade through ten articles of uneven quality. <b>One prompt, ten minutes, a tutorial written for you that you can interrogate as you read.</b></p><p>And it compounds: every tutorial you make can be handed to a colleague, who just adds their own key.</p>',
  },

  sections: [
    {
      h: { zh: '与其到处搜，不如让它给你现做一份', en: 'Stop searching. Have it built for you.' },
      fig: 'doc-draft',
      body: {
        zh: `<div class="lp-oneline">想搞懂一个陌生领域，最快的办法不是搜十篇文章，是让 AI 按你的水平现做一份教程。</div>
<p>比如老板忽然说「我们要做一下 <b>GEO</b>」。你搜出来的东西：一半是广告，一半假设你已经懂 SEO，还有一半互相矛盾。</p>
<p>换个做法：让 Claude Code 给你生成一个<b>网页教程</b>——大白话、有比喻、由浅入深四个例子、最后五道题考你。而且<b>页面右侧带一个 AI 小助手</b>，哪句话没看懂，选中它直接问。</p>
<details class="lp-fold"><summary>🍊 打个比方</summary><div class="lp-fold-body">
<p>网上搜文章，像<b>去图书馆借书</b>：书是给所有人写的，深浅不由你定，看不懂也没人可问。</p>
<p>让 AI 现做，像<b>请了个家教</b>：他按你的底子讲，讲完出题考你，你随时能打断问「这句什么意思」。</p>
<p>差别不在信息量，在<b>能不能追问</b>。</p>
</div></details>`,
        en: `<div class="lp-oneline">The fastest way into an unfamiliar field is not reading ten articles — it is having a tutorial built at your level.</div>
<p>Say your boss suddenly says "we need to do <b>GEO</b>". What you find online: half advertising, half assuming you already know SEO, and half contradicting each other.</p>
<p>Different approach: have Claude Code generate a <b>web tutorial</b> — plain words, analogies, four worked examples from easy to real, five questions at the end. And <b>an AI assistant docked on the right</b>: any sentence you do not follow, select it and ask.</p>
<details class="lp-fold"><summary>🍊 An analogy</summary><div class="lp-fold-body">
<p>Searching for articles is like <b>borrowing a library book</b>: written for everyone, pitched at a level you did not choose, and nobody to ask when you get stuck.</p>
<p>Having the AI build one is like <b>hiring a tutor</b>: pitched at you, quizzes you at the end, and you can interrupt at any line to ask what it means.</p>
<p>The difference is not the amount of information. It is <b>whether you can ask follow-up questions</b>.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '照抄这条提示词，把 XXX 换成你要学的东西', en: 'Copy this prompt, replace XXX with your topic' },
      fig: 'prompt-4parts',
      body: {
        zh: `<div class="lp-oneline">整章就这一条指令。新建一个会话，粘进去，把 XXX 换成你要学的东西。</div>
<pre>【任务】给我做一份「XXX」的网页教程。我是这个领域的零基础新手。

【产出】在当前工作目录下新建文件夹 tutorial-xxx/，里面放两个文件：
- index.html —— 教程正文，单页，双击就能在浏览器打开
- assistant.js —— AI 小助手组件，从 https://learn.xfeixie.com/assist/assistant.js 下载到这个文件夹
  （下载不了就从本机 Clootee 目录复制：projects/claude_hub/frontend/assist/assistant.js）

【正文怎么写】
1. 全程大白话。每出现一个新术语，先用一句话说清它是什么，再往下讲。
2. 每个概念配一个生活里的比喻。
3. 由浅入深给 4 个例子，从最简单的一直到实际工作中能用的。
4. 最后出 5 道题考我，答案和解析放在可折叠区域里，我想看再点开。
5. 正文放在 &lt;main&gt; 标签里。

【右侧 AI 小助手】
在 &lt;/body&gt; 之前加这两行，不要自己另写聊天窗：
&lt;script&gt;window.XFAssistant = { subject: 'XXX' };&lt;/script&gt;
&lt;script src="./assistant.js"&gt;&lt;/script&gt;
接入方式详见 https://learn.xfeixie.com/assist/docs.md ，先读这个文档再动手。

【约束】
- 除了 assistant.js，不依赖任何外网资源，断网也要能打开。
- 不要编造你不确定的事实；拿不准的地方明确写「这一点我不确定，建议你去核实」。
- 做完告诉我文件在哪、怎么打开。</pre>
<p>就这样。<b>不用改任何别的东西</b>，把 XXX 换掉就行。</p>
<details class="lp-fold"><summary>🔍 为什么提示词里要点名那个小助手</summary><div class="lp-fold-body">
<p>因为<b>你不说，它就会自己写一个</b>——写一个又丑又难用、还得配后端的聊天框，浪费十几分钟，效果还差。</p>
<p><code>assistant.js</code> 是一个现成的组件：一行引入，自带侧栏、多轮对话、新建会话、划词提问，
使用者填自己的 MiniMax Key 就能用，<b>不需要任何后端</b>。</p>
<p>那个 <code>docs.md</code> 是<b>专门写给 AI 读的</b>接入文档。让它先读一遍，它就不会瞎猜用法。</p>
</div></details>
<details class="lp-fold"><summary>📝 这条提示词其实就是第 2 章的四要素</summary><div class="lp-fold-body">
<table>
<tr><th>要素</th><th>在这条提示词里是哪一段</th></tr>
<tr><td><b>目标</b></td><td>【任务】做一份 XXX 的网页教程，我是零基础</td></tr>
<tr><td><b>范围</b></td><td>【产出】新建 tutorial-xxx/，就两个文件</td></tr>
<tr><td><b>产出</b></td><td>【正文怎么写】五条 + 【右侧小助手】那两行</td></tr>
<tr><td><b>约束</b></td><td>【约束】不依赖外网、不许编造、做完汇报</td></tr>
</table>
<p>看出来了吧——你早就学会了，这里只是换了个题材用一遍。</p>
</div></details>`,
        en: `<div class="lp-oneline">The whole chapter is this one instruction. Start a new session, paste it, replace XXX.</div>
<pre>[Task] Build me a web tutorial on "XXX". I am a complete beginner in this field.

[Output] Create a folder tutorial-xxx/ in the current workspace with two files:
- index.html —— the tutorial itself, one page, opens by double-click
- assistant.js —— the AI assistant component, downloaded from https://learn.xfeixie.com/assist/assistant.js
  (if the download fails, copy it from this machine's Clootee:
   projects/claude_hub/frontend/assist/assistant.js)

[How to write it]
1. Plain words throughout. Every time a new term appears, define it in one sentence first.
2. Give every concept an everyday analogy.
3. Four worked examples, from the simplest to something usable at work.
4. End with 5 questions for me; put answers and explanations in collapsible blocks.
5. Put the body inside a &lt;main&gt; tag.

[The assistant on the right]
Add these two lines before &lt;/body&gt;. Do not write your own chat window:
&lt;script&gt;window.XFAssistant = { subject: 'XXX' };&lt;/script&gt;
&lt;script src="./assistant.js"&gt;&lt;/script&gt;
Integration docs: https://learn.xfeixie.com/assist/docs.md — read that first, then build.

[Constraints]
- Apart from assistant.js, no external resources; it must open offline.
- Do not invent facts you are unsure of; where uncertain, write "I am not certain about this — please verify".
- When done, tell me where the files are and how to open them.</pre>
<p>That is it. <b>Change nothing else</b> — just swap out XXX.</p>
<details class="lp-fold"><summary>🔍 Why the prompt names that assistant component</summary><div class="lp-fold-body">
<p>Because <b>if you do not say it, the AI writes its own</b> — an ugly, awkward chat box that usually wants a backend, costing fifteen minutes for a worse result.</p>
<p><code>assistant.js</code> is a ready-made component: one line to include, with a sidebar, multi-turn chat, new chats and select-to-ask built in. The reader supplies their own MiniMax key and <b>no backend is needed</b>.</p>
<p>That <code>docs.md</code> is an integration doc <b>written specifically for AI to read</b>. Point the AI at it and it stops guessing.</p>
</div></details>
<details class="lp-fold"><summary>📝 This prompt is just Chapter 2's four parts again</summary><div class="lp-fold-body">
<table>
<tr><th>Part</th><th>Which section of the prompt</th></tr>
<tr><td><b>Goal</b></td><td>[Task] a web tutorial on XXX, I am a beginner</td></tr>
<tr><td><b>Scope</b></td><td>[Output] create tutorial-xxx/, exactly two files</td></tr>
<tr><td><b>Output</b></td><td>[How to write it] plus the two assistant lines</td></tr>
<tr><td><b>Constraints</b></td><td>[Constraints] offline, no invention, report back</td></tr>
</table>
<p>You already knew this — the topic just changed.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '做好之后：打开它，然后学会「划词追问」', en: 'Once it is built: open it, then learn to select-and-ask' },
      fig: 'session-lanes',
      body: {
        zh: `<div class="lp-oneline">最值钱的动作是——看到不懂的那句话，选中它，点浮出来的「问小助手」。</div>
<p>打开 <code>tutorial-xxx/index.html</code>（双击，或在 VS Code 里右键 → 在浏览器中打开）。</p>
<p>第一次用要<b>填一次 Key</b>：点右上角 ⚙ → 粘贴 MiniMax API Key → 保存。填一次就记住了，以后所有用这个组件的教程都能直接问。</p>
<details class="lp-fold"><summary>📝 值得一试的四种问法</summary><div class="lp-fold-body">
<p>选中一句话之后：</p>
<pre>这句话用大白话再讲一遍。
结合我的工作举个例子——我是做人事的。
这个和上一节讲的是什么关系？
这句话在什么情况下不成立？</pre>
<p>最后那句尤其好用：<b>任何说法都有边界</b>，问清边界，你才算真懂了，而不是背下来了。</p>
</div></details>
<details class="lp-fold"><summary>⚠️ 一个话题一个会话</summary><div class="lp-fold-body">
<p>小助手上方的 <b>＋</b> 开新会话，<b>🗂</b> 切换会话。</p>
<p>原因和第 1 章讲的一样：每问一次都要把这个会话之前的全部对话重发一遍，越聊越慢越贵。
组件在 <b>20 轮会红字提醒</b>你换会话、<b>40 轮直接不让再问</b>——点一下「开新会话」就能继续。</p>
</div></details>
<details class="lp-fold"><summary>🔍 想发给同事？可以</summary><div class="lp-fold-body">
<p>整个 <code>tutorial-xxx/</code> 文件夹打包发过去就行，对方双击 <code>index.html</code> 就能看。</p>
<p><b>你的 Key 不会跟着跑</b>——Key 存在你自己浏览器里，不在文件里。对方要提问，填他自己的 Key。</p>
</div></details>`,
        en: `<div class="lp-oneline">The single most valuable habit: see a sentence you do not follow, select it, click the button that pops up.</div>
<p>Open <code>tutorial-xxx/index.html</code> (double-click, or right-click in VS Code and open in a browser).</p>
<p>First time you need to <b>enter a key once</b>: click the gear top-right, paste your MiniMax API key, save. It is remembered from then on, for every tutorial using this component.</p>
<details class="lp-fold"><summary>📝 Four ways of asking that are worth trying</summary><div class="lp-fold-body">
<p>After selecting a sentence:</p>
<pre>Say this again in plain words.
Give me an example from my job — I work in HR.
How does this relate to the previous section?
When does this statement stop being true?</pre>
<p>That last one is the best: <b>every claim has limits</b>. Find the limits and you actually understand it, rather than having memorised it.</p>
</div></details>
<details class="lp-fold"><summary>⚠️ One topic per chat</summary><div class="lp-fold-body">
<p><b>＋</b> above the assistant starts a new chat, <b>🗂</b> switches between them.</p>
<p>Same reason as Chapter 1: every question resends the whole chat history, so it gets slower and pricier. The component <b>warns in red at 20 turns</b> and <b>stops accepting questions at 40</b> — one click on "New chat" and you carry on.</p>
</div></details>
<details class="lp-fold"><summary>🔍 Want to send it to a colleague? Go ahead</summary><div class="lp-fold-body">
<p>Zip the whole <code>tutorial-xxx/</code> folder and send it. They double-click <code>index.html</code>.</p>
<p><b>Your key does not travel with it</b> — it lives in your browser, not in the files. They add their own key to ask questions.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '不满意就接着说，别重开一个会话', en: 'Not happy with it? Keep talking — do not start over' },
      fig: 'one-change',
      body: {
        zh: `<div class="lp-oneline">教程是活的。哪里讲得不好，就在同一个会话里说清楚，让它改。</div>
<p>常用的几句（一次说一件事）：</p>
<pre>第 3 个例子太跳了，在它前面再加一个更简单的过渡例子。
「索引」这个词你直接用了没解释，补一句大白话定义。
比喻太抽象，换一个跟点外卖有关的。
把 5 道题里的第 2 题换掉，那题考的是记忆不是理解。
最后加一节「常见误区」，列 3 条新手最容易搞错的。</pre>
<details class="lp-fold"><summary>⚠️ 有一件事必须你自己来</summary><div class="lp-fold-body">
<p><b>核对事实。</b>AI 写的教程读起来非常顺，但它<b>可能把某个数字、某个年份、某条规定写错</b>，而且错得一点也不像错的。</p>
<p>所以提示词里那句「拿不准的地方明确写『我不确定』」很重要——它会把自己心虚的地方标出来，
那几处就是<b>你需要去官方文档核实的清单</b>。</p>
<p>这条规矩从第 1 章讲到现在：<b>它负责快，你负责对。</b></p>
</div></details>
<details class="lp-fold"><summary>🍊 这一章真正教你的东西</summary><div class="lp-fold-body">
<p>不是「怎么学 GEO」，是<b>「怎么学任何东西」</b>。</p>
<p>你手上现在有一台<b>教程生产机</b>：投进去一个陌生词，产出一份为你写的、能追问的教材。
遇到新领域的成本，从「看一周文章」变成「十分钟 + 一条粘贴的提示词」。</p>
</div></details>`,
        en: `<div class="lp-oneline">The tutorial is alive. Whatever is explained badly, say so in the same session and have it fixed.</div>
<p>Useful lines (one change at a time):</p>
<pre>Example 3 jumps too far — add a simpler bridging example before it.
You used the word "index" without explaining it; add a one-line plain definition.
That analogy is too abstract — use one about ordering food delivery.
Replace question 2 of the 5; it tests memory rather than understanding.
Add a final section "common mistakes" with the 3 things beginners get wrong.</pre>
<details class="lp-fold"><summary>⚠️ One thing you must do yourself</summary><div class="lp-fold-body">
<p><b>Check the facts.</b> An AI-written tutorial reads beautifully, but it <b>may get a number, a year or a rule wrong</b> — and it will not look wrong at all.</p>
<p>That is why the prompt says "where uncertain, write that you are not certain". It flags its own shaky spots, and those flags are <b>your list of things to verify against official sources</b>.</p>
<p>The same rule since Chapter 1: <b>it is responsible for fast, you are responsible for right.</b></p>
</div></details>
<details class="lp-fold"><summary>🍊 What this chapter actually taught you</summary><div class="lp-fold-body">
<p>Not "how to learn GEO" — <b>"how to learn anything"</b>.</p>
<p>You now own a <b>tutorial factory</b>: feed in an unfamiliar term, get back teaching material written for you that answers follow-up questions. The cost of entering a new field drops from "a week of reading" to "ten minutes and one pasted prompt".</p>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: '生成式教程', en: 'Generated tutorial' }, d: { zh: '让 AI 按你的水平现做的教材，可随时追问、随时改', en: 'Teaching material the AI builds at your level; you can question and revise it any time' } },
    { k: { zh: 'assistant.js', en: 'assistant.js' }, d: { zh: '可嵌任意网页的 AI 小助手组件，一行引入，无需后端', en: 'A drop-in AI assistant component for any page; one line, no backend' } },
    { k: { zh: '组件 / Component', en: 'Component' }, d: { zh: '写好一次、到处复用的现成零件，不用每次重造', en: 'A ready-made part written once and reused everywhere' } },
    { k: { zh: '划词提问', en: 'Select-to-ask' }, d: { zh: '选中页面上的文字，把它作为引用直接问 AI', en: 'Select text on the page and send it to the AI as a quote' } },
    { k: { zh: 'subject 主题', en: 'subject' }, d: { zh: '告诉小助手本页在讲什么，回答会更贴题', en: 'Tells the assistant what the page is about so answers stay on topic' } },
    { k: { zh: '给 AI 读的文档', en: 'AI-facing docs' }, d: { zh: '专门写给 AI 看的接入说明，避免它瞎猜用法', en: 'Integration docs written for an AI to read, so it stops guessing' } },
  ],

  quiz: [
    { t: 'single', fig: 'doc-draft',
      q: { zh: '想快速搞懂一个陌生领域，本章推荐的做法是：', en: 'To get up to speed in an unfamiliar field, this chapter recommends:' },
      o: [
        { zh: '搜十篇文章一篇篇读', en: 'Reading ten articles one by one' },
        { zh: '让 AI 按你的水平现做一份带小助手的网页教程，看不懂就划词追问', en: 'Have the AI build a web tutorial at your level with an assistant, and select-to-ask when stuck' },
        { zh: '买一本书', en: 'Buying a book' },
        { zh: '直接问同事', en: 'Asking a colleague' },
      ], a: 1,
      e: { zh: '关键差别不是信息量，是「能不能追问」。', en: 'The difference is not information volume — it is whether you can ask follow-ups.' } },

    { t: 'single', fig: 'prompt-4parts',
      q: { zh: '用本章那条提示词时，你需要改动的地方是：', en: 'When using this chapter\'s prompt, what do you need to change?' },
      o: [
        { zh: '几乎全部重写', en: 'Rewrite almost all of it' },
        { zh: '只把 XXX 换成你要学的东西', en: 'Just replace XXX with your topic' },
        { zh: '要改成英文', en: 'Translate it to English' },
        { zh: '要先学会 HTML', en: 'Learn HTML first' },
      ], a: 1,
      e: { zh: '这条提示词是模板，换主题即可复用——和第 4 章的周报模板同一个思路。', en: 'It is a template: swap the topic and reuse — the same idea as the weekly-update template in Chapter 4.' } },

    { t: 'single', fig: 'read-first',
      q: { zh: '提示词里为什么要给出 <code>https://learn.xfeixie.com/assist/docs.md</code> 这个地址？', en: 'Why does the prompt include the <code>docs.md</code> URL?' },
      o: [
        { zh: '为了让教程看起来更专业', en: 'To make the tutorial look professional' },
        { zh: '那是专门写给 AI 读的接入文档，先读它就不会瞎猜组件用法', en: 'It is integration documentation written for the AI; reading it stops the AI guessing how to use the component' },
        { zh: '为了统计有多少人用', en: 'To count how many people use it' },
        { zh: '没有实际作用', en: 'It serves no purpose' },
      ], a: 1,
      e: { zh: '给 AI 一份权威文档，比让它猜要可靠得多。', en: 'Handing the AI authoritative docs beats letting it guess.' } },

    { t: 'judge', fig: 'html-css-js',
      q: { zh: '如果提示词里不点名那个现成的小助手组件，AI 很可能自己另写一个又丑又难用、还要配后端的聊天框。', en: 'If the prompt does not name the ready-made component, the AI will likely write its own clunky chat box that wants a backend.' },
      a: true,
      e: { zh: '这就是「不要自己另写聊天窗」那句话存在的原因。', en: 'That is exactly why the prompt says "do not write your own chat window".' } },

    { t: 'single', fig: 'scope-folder',
      q: { zh: '生成的 <code>tutorial-xxx/</code> 文件夹里应该有哪两个文件？', en: 'Which two files should the generated <code>tutorial-xxx/</code> folder contain?' },
      o: [
        { zh: 'index.html 和 assistant.js', en: 'index.html and assistant.js' },
        { zh: 'index.html 和 style.css', en: 'index.html and style.css' },
        { zh: 'README.md 和 index.html', en: 'README.md and index.html' },
        { zh: '只要一个 index.html', en: 'Only index.html' },
      ], a: 0,
      e: { zh: '正文一个，小助手组件一个。把组件放本地，整个文件夹才能随便拷贝、断网也能开。', en: 'One for the content, one for the component. Keeping it local makes the folder portable and offline-capable.' } },

    { t: 'multi', fig: 'prompt-4parts',
      q: { zh: '提示词要求正文「怎么写」，包含哪些要求？（多选）', en: 'Which requirements does the prompt put on the writing? (multiple)' },
      o: [
        { zh: '全程大白话，新术语先用一句话说清', en: 'Plain words; define each new term in one sentence first' },
        { zh: '每个概念配一个生活里的比喻', en: 'An everyday analogy for every concept' },
        { zh: '由浅入深给 4 个例子', en: 'Four worked examples from easy to real' },
        { zh: '正文越长越好', en: 'The longer the better' },
      ], a: [0, 1, 2],
      e: { zh: '长度从来不是目标，讲明白才是。', en: 'Length is never the goal; being understood is.' } },

    { t: 'single', fig: 'question-first',
      q: { zh: '提示词要求最后出 5 道题，答案放在可折叠区域，用意是：', en: 'The prompt asks for 5 questions with answers in collapsible blocks. Why?' },
      o: [
        { zh: '让页面显得内容多', en: 'To make the page look fuller' },
        { zh: '让你先自己想一遍再看答案，检验是真懂还是看懂了', en: 'So you think first, then check — testing real understanding rather than recognition' },
        { zh: '方便打印', en: 'Easier printing' },
        { zh: '折叠能加快加载', en: 'Collapsing speeds up loading' },
      ], a: 1,
      e: { zh: '答案直接摆着，你会不自觉地「看一眼就以为会了」。', en: 'With answers visible you slide into "I recognise it, so I know it".' } },

    { t: 'single', fig: 'session-lanes',
      q: { zh: '教程生成好之后，本章说「最值钱的动作」是什么？', en: 'Once the tutorial is built, what does this chapter call the most valuable habit?' },
      o: [
        { zh: '从头到尾读三遍', en: 'Reading it three times end to end' },
        { zh: '看到不懂的那句话就选中它，问右侧小助手', en: 'Selecting any sentence you do not follow and asking the assistant' },
        { zh: '把它打印出来', en: 'Printing it out' },
        { zh: '转发到部门群', en: 'Forwarding it to the team chat' },
      ], a: 1,
      e: { zh: '追问才是这套做法优于「搜文章」的地方。', en: 'Follow-up questions are exactly what searching articles cannot give you.' } },

    { t: 'single', fig: 'key-wallet',
      q: { zh: '第一次打开生成的教程，要做的一步准备是：', en: 'The one setup step when first opening the generated tutorial:' },
      o: [
        { zh: '安装 Node.js', en: 'Install Node.js' },
        { zh: '点右上角 ⚙ 填一次 MiniMax API Key', en: 'Click the gear top-right and enter your MiniMax API key once' },
        { zh: '启动一个后端服务', en: 'Start a backend service' },
        { zh: '注册一个账号', en: 'Register an account' },
      ], a: 1,
      e: { zh: '填一次就记住了，以后所有用这个组件的教程都能直接问。', en: 'Once entered, it is remembered for every tutorial using the component.' } },

    { t: 'judge', fig: 'local-only',
      q: { zh: '把生成的教程文件夹发给同事，你的 API Key 也会跟着一起发过去。', en: 'Sending the tutorial folder to a colleague also sends your API key along with it.' },
      a: false,
      e: { zh: 'Key 存在你自己浏览器的 localStorage 里，不在文件里。对方要问就填他自己的。', en: 'The key lives in your browser\'s localStorage, not in the files. They add their own.' } },

    { t: 'multi', fig: 'session-lanes',
      q: { zh: '划词之后，哪些问法比「看不懂」有用？（多选）', en: 'After selecting text, which questions beat "I do not get it"? (multiple)' },
      o: [
        { zh: '这句话用大白话再讲一遍', en: 'Say this again in plain words' },
        { zh: '结合我的工作举个例子——我是做人事的', en: 'Give me an example from my job — I work in HR' },
        { zh: '这句话在什么情况下不成立？', en: 'When does this statement stop being true?' },
        { zh: '再多说点', en: 'Tell me more' },
      ], a: [0, 1, 2],
      e: { zh: '「再多说点」没给方向，等于没问。问边界那句最能检验你是不是真懂。', en: '"Tell me more" gives no direction. Asking for the limits best tests real understanding.' } },

    { t: 'single', fig: 'context-fill',
      q: { zh: '小助手为什么在 20 轮红字提醒、40 轮不让再问？', en: 'Why does the assistant warn at 20 turns and stop at 40?' },
      o: [
        { zh: '防止你问太多问题', en: 'To stop you asking too much' },
        { zh: '每问一次都会把该会话之前的全部对话重发给模型，轮次越多越慢越贵', en: 'Every question resends the whole chat history, so more turns means slower and pricier' },
        { zh: '模型有次数限制', en: 'The model has a usage cap' },
        { zh: '为了让你休息', en: 'To make you take a break' },
      ], a: 1,
      e: { zh: '这就是第 1 章讲的上下文，被做成了看得见的产品约束。', en: 'That is the context lesson from Chapter 1, turned into a visible product constraint.' } },

    { t: 'single', fig: 'one-change',
      q: { zh: '教程里第 3 个例子太跳了，正确做法是：', en: 'Example 3 in the tutorial jumps too far. What do you do?' },
      o: [
        { zh: '重开一个会话，从头再生成一份', en: 'Start a new session and regenerate from scratch' },
        { zh: '在同一个会话里说「第 3 个例子太跳了，前面加一个更简单的过渡例子」', en: 'In the same session say "example 3 jumps too far — add a simpler bridging example before it"' },
        { zh: '算了，自己硬看', en: 'Give up and struggle through' },
        { zh: '换个 AI 重做', en: 'Try a different AI' },
      ], a: 1,
      e: { zh: '同一个会话里它还留着上下文，改起来又快又准；一次只提一件事。', en: 'It still holds the context, so the fix is fast and precise. One change at a time.' } },

    { t: 'judge', fig: 'hallucination',
      q: { zh: 'AI 生成的教程读起来很顺，所以里面的数字、年份、规定基本可以直接相信。', en: 'An AI-written tutorial reads smoothly, so its numbers, years and rules can basically be trusted.' },
      a: false,
      e: { zh: '读起来顺和事实正确是两回事。它可能错得一点也不像错的——事实核对永远是你的活。', en: 'Reading well and being right are different things. It can be wrong in a way that looks perfectly right.' } },

    { t: 'single', fig: 'hallucination',
      q: { zh: '提示词要求「拿不准的地方明确写『我不确定』」，这句的价值是：', en: 'The prompt says "where uncertain, write that you are not certain". Its value:' },
      o: [
        { zh: '显得谦虚', en: 'It sounds humble' },
        { zh: '它把自己心虚的地方标出来，那几处正是你要去官方文档核实的清单', en: 'It flags its own shaky spots, and those flags become your verification checklist' },
        { zh: '可以少写点内容', en: 'It writes less' },
        { zh: '没什么用', en: 'No real use' },
      ], a: 1,
      e: { zh: '把「机器能定的」和「人要核的」分开，是自动化最关键的一刀。', en: 'Separating machine-decidable from human-verifiable is the key cut in any automation.' } },

    { t: 'single', fig: 'offline-html',
      q: { zh: '提示词要求「除了 assistant.js 不依赖任何外网资源」，是为了：', en: 'Why require "no external resources apart from assistant.js"?' },
      o: [
        { zh: '让文件更小', en: 'Smaller files' },
        { zh: '断网、内网、发给别人时都能正常打开，不会变成一片空白', en: 'It still opens offline, behind a firewall, or on someone else\'s machine — instead of a blank page' },
        { zh: '加载更快', en: 'Faster loading' },
        { zh: '避免版权问题', en: 'To avoid copyright issues' },
      ], a: 1,
      e: { zh: '这个坑第 5 章和第 7 章都撞过：依赖外网 CDN 的页面，别人打开经常是空白。', en: 'Chapters 5 and 7 hit this: CDN-dependent pages frequently open blank for the recipient.' } },

    { t: 'single', fig: 'add-only',
      q: { zh: '「组件」这个词在本章指的是：', en: 'What does "component" mean in this chapter?' },
      o: [
        { zh: '一段需要每次重写的代码', en: 'Code you rewrite each time' },
        { zh: '写好一次、到处复用的现成零件，引一行就能用', en: 'A ready-made part written once and reused everywhere with one line' },
        { zh: '一种编程语言', en: 'A programming language' },
        { zh: '一个服务器', en: 'A server' },
      ], a: 1,
      e: { zh: '和第 3 章的可复用脚本、第 4 章的提示词模板是同一个思想：别重复造。', en: 'Same idea as Chapter 3\'s reusable script and Chapter 4\'s prompt template: stop rebuilding.' } },

    { t: 'single', fig: 'trace-quote',
      q: { zh: '配置里的 <code>subject</code> 字段是干什么的？', en: 'What is the <code>subject</code> config field for?' },
      o: [
        { zh: '设置网页标题', en: 'Setting the page title' },
        { zh: '告诉小助手本页在讲什么，让回答更贴题', en: 'Telling the assistant what the page is about so answers stay on topic' },
        { zh: '选择 AI 模型', en: 'Choosing the AI model' },
        { zh: '设置主题颜色', en: 'Setting the accent colour' },
      ], a: 1,
      e: { zh: '给背景，回答就准——和第 4 章「不给素材它只能造词」是同一件事。', en: 'Context in, accuracy out — the same point as Chapter 4\'s "no material, only filler".' } },

    { t: 'judge', fig: 'engine-shell',
      q: { zh: '这个小助手组件需要你另外启动一个后端服务才能工作。', en: 'The assistant component needs you to start a separate backend service.' },
      a: false,
      e: { zh: '它由浏览器直接调 MiniMax，零后端、零额外端口——所以生成的教程双击就能用。', en: 'It calls MiniMax straight from the browser: no backend, no extra port — so the tutorial just opens.' } },

    { t: 'multi', fig: 'prompt-4parts',
      q: { zh: '这条提示词里的【约束】部分包含哪些？（多选）', en: 'What is in the [Constraints] section of the prompt? (multiple)' },
      o: [
        { zh: '不依赖外网资源，断网也要能打开', en: 'No external resources; must open offline' },
        { zh: '不要编造不确定的事实', en: 'Do not invent facts you are unsure of' },
        { zh: '做完告诉我文件在哪、怎么打开', en: 'When done, say where the files are and how to open them' },
        { zh: '必须用 React 框架', en: 'Must use the React framework' },
      ], a: [0, 1, 2],
      e: { zh: '框架选择不该由你规定——你要的是能打开的教程，不是某个技术栈。', en: 'Framework choice is not yours to dictate — you want a tutorial that opens, not a tech stack.' } },

    { t: 'single', fig: 'files-sort',
      q: { zh: '生成的教程正文要求放在 <code>&lt;main&gt;</code> 标签里，原因是：', en: 'Why must the tutorial body sit inside a <code>&lt;main&gt;</code> tag?' },
      o: [
        { zh: '这样排版更好看', en: 'It looks better' },
        { zh: '小助手优先读这个标签的内容，不会把导航页脚也读进去浪费 token', en: 'The assistant reads that tag first, so navigation and footers do not waste tokens' },
        { zh: '浏览器要求必须有', en: 'Browsers require it' },
        { zh: '为了 SEO', en: 'For SEO' },
      ], a: 1,
      e: { zh: '这条写在 docs.md 的「给页面作者的建议」里，属于让组件发挥最好效果的细节。', en: 'It is in the "advice for page authors" part of docs.md — a detail that makes the component work best.' } },

    { t: 'single', fig: 'reuse-script',
      q: { zh: '这一章真正教会你的是：', en: 'What this chapter actually teaches you is:' },
      o: [
        { zh: '怎么学 GEO', en: 'How to learn GEO' },
        { zh: '怎么学任何东西——你手上多了一台「教程生产机」', en: 'How to learn anything — you now own a tutorial factory' },
        { zh: '怎么写 HTML', en: 'How to write HTML' },
        { zh: '怎么用 MiniMax', en: 'How to use MiniMax' },
      ], a: 1,
      e: { zh: 'GEO 只是例子。换任何陌生词，同一条提示词照样跑。', en: 'GEO is just the example. Any unfamiliar term, same prompt.' } },

    { t: 'single', fig: 'mvp-grow',
      q: { zh: '第一次生成的教程不太满意，最好的处理顺序是：', en: 'The first version is not great. Best way to proceed?' },
      o: [
        { zh: '一口气把十条意见全提了', en: 'Send all ten pieces of feedback at once' },
        { zh: '一次提一件事，改完看一眼，再提下一件', en: 'One change at a time; look at the result, then ask for the next' },
        { zh: '推倒重来', en: 'Scrap it and start over' },
        { zh: '将就着看', en: 'Just live with it' },
      ], a: 1,
      e: { zh: '第 7 章讲过：一次改五件，出问题时你不知道是哪件引起的。', en: 'Chapter 7 covered this: change five things and you cannot tell which one broke it.' } },

    { t: 'judge', fig: 'share-file',
      q: { zh: '生成的教程可以整个文件夹打包发给同事，对方双击 index.html 就能看。', en: 'You can zip the whole tutorial folder for a colleague; they double-click index.html and read it.' },
      a: true,
      e: { zh: '这正是「不依赖外网资源 + 组件放本地」换来的好处。', en: 'That is exactly what "no external resources plus a local component" buys you.' } },

    { t: 'single', fig: 'intern',
      q: { zh: '关于 AI 生成的教程，本章的总结是：', en: 'This chapter\'s summary about AI-generated tutorials:' },
      o: [
        { zh: '它写的都对，可以完全信任', en: 'It is all correct and can be fully trusted' },
        { zh: '它负责快，你负责对', en: 'It is responsible for fast; you are responsible for right' },
        { zh: '它写的都不能信', en: 'None of it can be trusted' },
        { zh: '只能用来入门，不能用于工作', en: 'Only for hobbies, never for work' },
      ], a: 1,
      e: { zh: '这句话从第 1 章的「实习生比喻」一直贯穿到这里。', en: 'This runs all the way from the intern analogy in Chapter 1.' } },

    { t: 'multi', fig: 'session-lanes',
      q: { zh: '小助手支持下面哪些能力？（多选）', en: 'Which of these does the assistant support? (multiple)' },
      o: [
        { zh: '多轮对话', en: 'Multi-turn conversation' },
        { zh: '新建会话、在多个会话之间切换', en: 'Starting new chats and switching between them' },
        { zh: '看见整个网页的正文', en: 'Seeing the whole page body' },
        { zh: '替你修改页面内容', en: 'Editing the page content for you' },
      ], a: [0, 1, 2],
      e: { zh: '它只负责答疑；改内容要回到 Claude Code 那边说。', en: 'It only answers questions; content changes go back to Claude Code.' } },

    { t: 'single', fig: 'question-first',
      q: { zh: '「这句话在什么情况下不成立？」这个问法好在哪？', en: 'Why is "when does this stop being true?" such a good question?' },
      o: [
        { zh: '显得你很专业', en: 'It makes you sound expert' },
        { zh: '任何说法都有边界，问清边界才算真懂而不是背下来', en: 'Every claim has limits; knowing them is understanding rather than memorising' },
        { zh: '能问出更多字', en: 'It produces a longer answer' },
        { zh: '能让 AI 出错', en: 'It trips the AI up' },
      ], a: 1,
      e: { zh: '这也是检验自己有没有真学会的最快办法。', en: 'It is also the fastest self-check on whether you really learned it.' } },

    { t: 'judge', fig: 'consolidate',
      q: { zh: '这条提示词值得存成文件（比如 prompts/做教程.md），以后换个主题直接复用。', en: 'This prompt is worth saving to a file (e.g. prompts/make-tutorial.md) and reusing with a new topic.' },
      a: true,
      e: { zh: '和第 4 章的周报模板一样：高频 + 格式稳定 = 模板化收益最大。', en: 'Like the weekly-update template in Chapter 4: high frequency plus stable format equals maximum payoff.' } },

    { t: 'practice', fig: 'doc-draft',
      q: { zh: '实操：给自己做一份教程。', en: 'Hands-on: build yourself a tutorial.' },
      task: {
        zh: `<p>挑一个<b>你真的不懂、但工作上早晚要懂</b>的词（GEO、期权池、ISO 9001、你们公司新上的某套系统，都行）。</p>
<ol>
<li>新建会话，把本章那条提示词粘进去，<b>把 XXX 换成你选的那个词</b>；</li>
<li>等它做完，<b>自己打开 index.html</b> 看一眼；</li>
<li>填上 MiniMax Key，<b>随便选中一句话，问小助手一个问题</b>。</li>
</ol>
<p>把下面内容粘过来：你选的主题、你实际发出的提示词（换过 XXX 的那版）、生成后目录里有哪些文件、以及你划词问的那个问题和小助手的回答（截取即可）。</p>`,
        en: `<p>Pick a term you <b>genuinely do not understand but will need at work</b> (GEO, option pool, ISO 9001, that new internal system — anything).</p>
<ol>
<li>Start a new session, paste this chapter's prompt, <b>replacing XXX with your term</b>;</li>
<li>When it finishes, <b>open index.html yourself</b> and look at it;</li>
<li>Enter your MiniMax key, <b>select any sentence and ask the assistant one question</b>.</li>
</ol>
<p>Paste below: your topic, the exact prompt you sent (with XXX replaced), what files ended up in the folder, and the question you asked by selecting text plus the assistant's reply (an excerpt is fine).</p>`,
      },
      rubric: {
        zh: `1. 必须给出具体主题（不能是"XXX"或"某个领域"这类占位）。缺失扣 25 分。
2. 必须能看到学员实际发出的提示词，且其中 XXX 已被替换成真实主题。未替换或没给提示词扣 30 分。
3. 必须列出生成后的文件（至少包含 index.html；有 assistant.js 更好）。缺失扣 20 分。
4. 必须包含一次真实的划词提问：既有学员问的问题，也有小助手的回答片段。缺任一项扣 25 分。
5. 明显没做（空话、复述题目、编造文件名如"文件1"）给 0 分。`,
        en: `1. A concrete topic is required (not a placeholder like "XXX" or "some field"). Deduct 25 if missing.
2. The actual prompt sent must be visible, with XXX replaced by the real topic. Deduct 30 if unreplaced or absent.
3. The resulting files must be listed (index.html at minimum; assistant.js is better). Deduct 20 if missing.
4. A real select-to-ask exchange is required: both the learner's question and an excerpt of the reply. Deduct 25 if either is missing.
5. Obviously not done (empty talk, restating the task, fabricated names like "file1") scores 0.`,
      },
      e: { zh: '这道题练的是「把提示词真的用出去」——存着不用，等于没学。', en: 'This drills actually using the prompt. A prompt you never send is a prompt you never learned.' } },

    { t: 'practice', fig: 'one-change',
      q: { zh: '实操：让教程按你的反馈改一版。', en: 'Hands-on: have the tutorial revised from your feedback.' },
      task: {
        zh: `<p>接着上一题生成的教程：</p>
<ol>
<li>自己读一遍，找出<b>至少两处</b>讲得不好的地方（例子太跳、术语没解释、比喻太抽象、题目考的是记忆……）；</li>
<li>回到<b>同一个会话</b>，<b>一次只提一件事</b>，让它改；改完看一眼，再提第二件；</li>
<li>顺便检查它有没有按要求标出「我不确定」的地方——如果有，挑一条说说你打算怎么核实。</li>
</ol>
<p>把两轮修改的指令、改动前后的差别（一句话描述即可）、以及那条「不确定」的内容与你的核实计划，粘到下面。</p>`,
        en: `<p>Continuing with the tutorial from the previous task:</p>
<ol>
<li>Read it and find <b>at least two</b> weak spots (an example that jumps, an undefined term, an abstract analogy, a memory-testing question…);</li>
<li>Back in the <b>same session</b>, ask for <b>one change at a time</b>; check the result, then ask for the second;</li>
<li>Also check whether it flagged anything as "I am not certain" — if so, pick one and say how you plan to verify it.</li>
</ol>
<p>Paste below: both revision instructions, a one-line before/after for each, and the flagged uncertainty plus your verification plan.</p>`,
      },
      rubric: {
        zh: `1. 必须有两条独立的修改指令，且是分两次提的（一次提完两件事扣 25 分）。缺一条扣 30 分。
2. 每条修改要有改动前后的差别描述。缺失一条扣 15 分。
3. 必须回应「不确定」那一项：要么给出教程里标注的原文与核实计划，要么如实说明教程里没有标注任何不确定处。完全不提扣 20 分。
4. 修改指令若只是"改好一点""再优化一下"这类没方向的话，每条扣 15 分。
5. 未真正执行、纯编造给 0 分。`,
        en: `1. Two separate revision instructions are required, sent one at a time (deduct 25 if both were sent together). Deduct 30 if one is missing.
2. Each revision needs a before/after description. Deduct 15 per missing one.
3. The uncertainty point must be addressed: either quote the flagged text plus a verification plan, or state honestly that nothing was flagged. Deduct 20 if ignored.
4. Directionless instructions like "make it better" cost 15 each.
5. Not actually executed or fabricated scores 0.`,
      },
      e: { zh: '生成只是开始，能改才是真的掌握——顺便把「事实核对是你的活」这条落到实处。', en: 'Generating is the start; revising is mastery — and it puts "fact-checking is your job" into practice.' } },
  ],
});
