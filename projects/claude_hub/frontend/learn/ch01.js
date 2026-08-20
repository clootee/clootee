// 第 1 章：认识 Claude Code 与 Clootee —— 术语打底，先搞清楚「这东西到底是什么」
(window.LEARN_CHAPTERS = window.LEARN_CHAPTERS || []).push({
  id: 'ch01',
  icon: '🚀',
  minutes: 20,
  title: { zh: '准备工作 + 这到底是个什么东西', en: 'Setup, and what exactly this thing is' },
  goal: {
    zh: '装好 VS Code 并改对两个 Windows 设置；用大白话说清 Claude Code 和 Clootee 各是什么，认识几个绕不开的术语，知道它能干什么、不能干什么。',
    en: 'Install VS Code and fix two Windows settings; then understand in plain words what Claude Code and Clootee are, learn the unavoidable terms, and know what it can and cannot do.',
  },
  praise: {
    zh: '<p>漂亮！<b>最难的一步已经迈过去了</b>——大多数人卡住不是因为学不会，而是因为一堆词看不懂就放弃了。你现在知道模型、Token、上下文、工作目录分别是什么了，后面全是在这几个词上面盖房子。</p><p>下一章开始<b>真的动手</b>：让 AI 帮你收拾那个乱了三年的文件夹。</p>',
    en: '<p>Nicely done! <b>You just cleared the hardest step.</b> Most people quit not because it is hard, but because the jargon looks impenetrable. You now know what a model, a token, context and a workspace are — everything later is built on those four words.</p><p>Next chapter you actually get your hands dirty: cleaning up that folder you have been avoiding for three years.</p>',
  },

  sections: [
    {
      h: { zh: '动手之前：装一个 VS Code（5 分钟，必做）', en: 'Before you start: install VS Code (5 minutes, required)' },
      fig: 'install-editor',
      body: {
        zh: `<div class="lp-oneline">AI 帮你生成的文件，你得能打开看。系统自带的记事本不够用，会挤成一行或者乱码。</div>
<p>这门课里 AI 会不停给你生成 <code>.md</code>（说明、清单、报告）、<code>.csv</code>（表格）、<code>.html</code>（小工具）这些<b>纯文本文件</b>。这些文件<b>都该用 VS Code 打开</b>。</p>
<p><b>为什么不能凑合用记事本？</b>三个真实会遇到的问题：</p>
<ul>
<li><b>全挤成一行。</b>AI 生成的文本文件换行用的是 <code>LF</code>，而老一点的 Windows 记事本不认它——你打开一份漂亮的清单，看到的是密密麻麻的一整行。</li>
<li><b>中文变乱码。</b>编码不匹配时中文会变成 <code>ä¸­æ–‡</code> 这种鬼东西。</li>
<li><b>用 Word / 写字板更糟。</b>它们会把纯文本存成带格式的文档，<b>文件就被改坏了</b>，AI 下次读它会读到一堆乱东西。</li>
</ul>
<p>VS Code 这三个问题一个都没有，而且免费、有中文界面、能自动折行、能高亮，读代码和读表格都轻松很多。</p>

<details class="lp-fold" open><summary>⬇️ 下载 VS Code</summary><div class="lp-fold-body">
<p><b><a href="https://code.visualstudio.com/" target="_blank" rel="noreferrer">👉 打开 VS Code 官网：code.visualstudio.com</a></b></p>
<p><b>页面上该点哪个？</b></p>
{{if:win}}<p>你在用 <b>Windows</b>，点页面上写着 <b>Windows</b> 的那个下载按钮就行（网站会自动把它放在最显眼的位置）。</p>{{/if}}
{{if:mac}}<p>你在用 <b>macOS</b>，点写着 <b>Mac</b> 的那个下载按钮。</p>{{/if}}
{{if:linux}}<p>你在用 <b>Linux</b>：Ubuntu / Debian 选 <b>.deb</b>，Fedora / openSUSE 选 <b>.rpm</b>。</p>{{/if}}
{{if:win}}<p><b>Windows 安装要点</b>：下载到的是一个 <code>.exe</code>，双击 → 接受协议 → 一路「下一步」。中间有一屏勾选项，<b>务必把这两个勾上</b>：</p>
<ul><li>☑ <b>将「通过 Code 打开」操作添加到 Windows 资源管理器文件上下文菜单</b></li>
<li>☑ <b>将「通过 Code 打开」操作添加到 Windows 资源管理器目录上下文菜单</b></li></ul>
<p>勾了这两个，你以后<b>右键任何文件或文件夹，就有「通过 Code 打开」</b>——这是最省事的打开方式。忘了勾也没关系，往下看还有别的办法。</p>{{/if}}
{{if:mac}}<p><b>macOS 安装要点</b>：下载到的是一个 <code>.zip</code>，双击解压得到 <b>Visual Studio Code</b> 图标，<b>把它拖进「应用程序」文件夹</b>（别留在「下载」里）。首次打开如果提示"来自互联网"，点「打开」即可。</p>{{/if}}
{{if:linux}}<p><b>Linux 安装要点</b>：下载到的是 <code>.deb</code>（Ubuntu / Debian 系）。双击用软件中心安装，或在终端 <code>sudo apt install ./下载的文件名.deb</code>。用 Fedora / openSUSE 的请到官网选 <code>.rpm</code>。</p>{{/if}}
<p>装完先<b>把 VS Code 打开一次</b>，确认能正常启动。第一次启动会问主题、语言，随便选，不影响使用。</p>
</div></details>

<details class="lp-fold"><summary>📂 装好之后，到底怎么用它打开文件？（三种办法）</summary><div class="lp-fold-body">
<p><b>办法一（最推荐）：右键 → 通过 Code 打开</b></p>
<p>在文件或文件夹上点<b>鼠标右键</b>，菜单里选「通过 Code 打开」/「Open with Code」。{{if:win}}Windows 11 的右键菜单如果没看到，点菜单底部的<b>「显示更多选项」</b>再找一遍。{{/if}}</p>
<p><b>办法二：先开 VS Code，再拖进去</b></p>
<p>打开 VS Code，然后<b>把文件（或整个文件夹）从资源管理器直接拖到 VS Code 窗口里</b>松手。拖文件夹进去的好处是：左边会出现完整的文件树，点哪个看哪个，非常适合看 AI 生成了一堆东西的情况。</p>
<p><b>办法三：菜单打开</b></p>
<p>VS Code 顶部菜单 <b>文件 → 打开文件</b>（看单个文件）或 <b>文件 → 打开文件夹</b>（看整个项目，<b>推荐</b>）。</p>
<p class="lp-warn" style="margin-top:12px">💡 <b>习惯建议：以后一律「打开文件夹」，而不是「打开文件」。</b>因为 AI 干活时经常一次生成好几个文件，打开文件夹你才看得到全貌。</p>
</div></details>

<details class="lp-fold"><summary>🔧 两个让你更舒服的小设置（可跳过）</summary><div class="lp-fold-body">
<p><b>1. 自动折行</b>——长行不用左右拖。菜单 <b>查看 → 自动换行</b>，或直接按 <code>Alt + Z</code>。</p>
<p><b>2. 把 .md 文件设成默认用 VS Code 打开</b>{{if:win}}：在任意 <code>.md</code> 文件上右键 → <b>打开方式</b> → <b>选择其他应用</b> → 选 <b>Visual Studio Code</b> → 勾上<b>「始终使用此应用打开 .md 文件」</b> → 确定。以后双击就能直接看了。{{/if}}{{if:mac}}：在任意 <code>.md</code> 文件上按 <code>Cmd + I</code> → 「打开方式」选 <b>Visual Studio Code</b> → 点<b>「全部更改」</b>。{{/if}}</p>
<p><b>3. 想看 Markdown 排版好的效果</b>：打开 <code>.md</code> 文件后，按 <code>Ctrl + Shift + V</code>（Mac 是 <code>Cmd + Shift + V</code>），会出现排版后的预览，标题、列表、表格都是正常样子。</p>
</div></details>

<details class="lp-fold"><summary>🌐 还需要装别的吗？</summary><div class="lp-fold-body">
<p><b>浏览器：需要一个现代浏览器</b>——Chrome、Edge、Firefox、Safari 任意一个都行。你既然能看到这一页，说明已经有了 ✅。第 7 章做的网页小工具就是用它打开的。</p>
<p><b>Node.js / Git / Claude Code：不用你装。</b>Clootee 会在引导页里帮你装好，缺什么点一下就补。这也是这个软件存在的意义。</p>
<p><b>Python：先不用装。</b>第 3 章处理表格时可能会用到，到时候直接问 AI「先检查有没有 Python，没有就告诉我怎么装」，它会带你走。</p>
</div></details>`,
        en: `<div class="lp-oneline">The AI will generate files you need to open and read. Your system's built-in Notepad is not good enough — it garbles them.</div>
<p>Throughout this course the AI will keep producing <code>.md</code> files (notes, indexes, reports), <code>.csv</code> files (tables) and <code>.html</code> files (little tools). These are all <b>plain text files</b>, and they should <b>all be opened in VS Code</b>.</p>
<p><b>Why not just use Notepad?</b> Three problems you will actually hit:</p>
<ul>
<li><b>Everything on one line.</b> AI-generated text uses <code>LF</code> line endings, which older Windows Notepad does not recognise — a tidy index turns into one endless line.</li>
<li><b>Garbled characters.</b> When the encoding does not match, non-ASCII text turns into nonsense like <code>ä¸­æ–‡</code>.</li>
<li><b>Word / WordPad is worse.</b> They save plain text as a formatted document, which <b>corrupts the file</b> — and the AI reads garbage from it next time.</li>
</ul>
<p>VS Code has none of these problems. It is free, wraps long lines, highlights syntax, and makes both code and tables far easier to read.</p>

<details class="lp-fold" open><summary>⬇️ Download VS Code</summary><div class="lp-fold-body">
<p><b><a href="https://code.visualstudio.com/" target="_blank" rel="noreferrer">👉 Open the official site: code.visualstudio.com</a></b></p>
<p><b>Which button do I click?</b></p>
{{if:win}}<p>You are on <b>Windows</b> — click the download button labelled <b>Windows</b> (the site puts it front and centre for you).</p>{{/if}}
{{if:mac}}<p>You are on <b>macOS</b> — click the button labelled <b>Mac</b>.</p>{{/if}}
{{if:linux}}<p>You are on <b>Linux</b>: pick <b>.deb</b> for Ubuntu/Debian, <b>.rpm</b> for Fedora/openSUSE.</p>{{/if}}
{{if:win}}<p><b>Windows install notes</b>: you get an <code>.exe</code>. Double-click → accept the licence → keep clicking Next. One screen has checkboxes — <b>make sure these two are ticked</b>:</p>
<ul><li>☑ <b>Add "Open with Code" action to Windows Explorer file context menu</b></li>
<li>☑ <b>Add "Open with Code" action to Windows Explorer directory context menu</b></li></ul>
<p>With those ticked you can <b>right-click any file or folder and choose "Open with Code"</b> — by far the easiest way in. If you forgot, there are other ways below.</p>{{/if}}
{{if:mac}}<p><b>macOS install notes</b>: you get a <code>.zip</code>. Double-click to unzip, then <b>drag the Visual Studio Code icon into your Applications folder</b> (do not leave it in Downloads). If the first launch warns it came from the internet, click Open.</p>{{/if}}
{{if:linux}}<p><b>Linux install notes</b>: you get a <code>.deb</code> (Ubuntu / Debian family). Double-click to install via your software centre, or run <code>sudo apt install ./the-file.deb</code>. On Fedora / openSUSE grab the <code>.rpm</code> from the site instead.</p>{{/if}}
<p>Once installed, <b>open VS Code once</b> to confirm it launches. The first run asks about theme and language — pick anything, it does not matter.</p>
</div></details>

<details class="lp-fold"><summary>📂 Installed — so how do I actually open a file with it? (three ways)</summary><div class="lp-fold-body">
<p><b>Way 1 (recommended): right-click → Open with Code</b></p>
<p><b>Right-click</b> a file or folder and pick "Open with Code". {{if:win}}On Windows 11, if you do not see it, click <b>"Show more options"</b> at the bottom of the menu and look again.{{/if}}</p>
<p><b>Way 2: open VS Code, then drag things in</b></p>
<p>Launch VS Code and <b>drag a file — or a whole folder — from your file manager into the window</b>. Dropping a folder gives you a full file tree on the left, which is ideal when the AI has just generated several files at once.</p>
<p><b>Way 3: use the menu</b></p>
<p>In VS Code: <b>File → Open File</b> (one file) or <b>File → Open Folder</b> (the whole project — <b>preferred</b>).</p>
<p class="lp-warn" style="margin-top:12px">💡 <b>Habit worth forming: always "Open Folder", not "Open File".</b> The AI often creates several files in one go, and only the folder view shows you all of them.</p>
</div></details>

<details class="lp-fold"><summary>🔧 Two settings that make life nicer (optional)</summary><div class="lp-fold-body">
<p><b>1. Word wrap</b> — no more scrolling sideways. Menu <b>View → Word Wrap</b>, or just press <code>Alt + Z</code>.</p>
<p><b>2. Make VS Code the default for .md files</b>{{if:win}}: right-click any <code>.md</code> file → <b>Open with</b> → <b>Choose another app</b> → pick <b>Visual Studio Code</b> → tick <b>"Always use this app to open .md files"</b> → OK. Now a double-click just works.{{/if}}{{if:mac}}: select any <code>.md</code> file, press <code>Cmd + I</code>, set "Open with" to <b>Visual Studio Code</b>, then click <b>"Change All"</b>.{{/if}}</p>
<p><b>3. To see Markdown nicely formatted</b>: open the <code>.md</code> file and press <code>Ctrl + Shift + V</code> (<code>Cmd + Shift + V</code> on Mac) for a rendered preview with real headings, lists and tables.</p>
</div></details>

<details class="lp-fold"><summary>🌐 Anything else to install?</summary><div class="lp-fold-body">
<p><b>A browser: yes, you need a modern one</b> — Chrome, Edge, Firefox or Safari, any is fine. Since you are reading this page, you already have one ✅. The web tool you build in Chapter 7 opens in it.</p>
<p><b>Node.js / Git / Claude Code: you do not install these.</b> Clootee sets them up for you in its guided setup — whatever is missing is one click away. That is the whole point of this software.</p>
<p><b>Python: not yet.</b> Chapter 3 may use it for spreadsheets; when you get there, just ask the AI "check whether Python is available; if not, tell me how to install it" and it will walk you through.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '必改的两个系统设置：显示扩展名 + 显示隐藏文件', en: 'Two system settings to fix: show file extensions and hidden files' },
      fig: 'show-ext',
      body: {
        zh: `{{if:win}}<div class="lp-oneline">你在用 Windows —— 这两个设置<b>不改的话后面一定会踩坑</b>，现在花 1 分钟改掉。</div>{{/if}}
{{if:mac}}<div class="lp-oneline">你在用 macOS —— 这两个设置建议现在打开，后面找文件会顺很多。</div>{{/if}}
<p><b>为什么必须改：</b></p>
<ul>
<li><b>不显示扩展名 → 你找不到 AI 说的那个文件。</b>AI 说「清单已生成在 <code>清单.md</code>」，你在文件夹里只看到一个叫「清单」的东西，旁边还有个也叫「清单」的——一个是 <code>.md</code> 一个是 <code>.csv</code>，你根本分不清。</li>
<li><b>不显示扩展名 → 改名会改坏文件。</b>你想把「报告」改成「报告2」，一不小心把 <code>.md</code> 删了或多打了一个点，文件就打不开了，而你连哪里错了都看不见。</li>
<li><b>不显示隐藏文件 → 看不到 <code>.git</code> 这类文件夹。</b>第 7 章用 Git 存档之后，那个记录着你所有版本的 <code>.git</code> 文件夹是隐藏的。看不到它，你会以为"存档失败了"。</li>
</ul>

{{if:win}}
<details class="lp-fold" open><summary>🪟 Windows 11 —— 一步步照做（20 秒）</summary><div class="lp-fold-body">
<p><b>1.</b> 按 <code>Win + E</code> 打开<b>文件资源管理器</b>（就是平时看文件的那个窗口）。</p>
<p><b>2.</b> 看窗口<b>顶部</b>，点 <b>「查看」</b>（英文版 View）。</p>
<p><b>3.</b> 在弹出的菜单里，鼠标移到最下面的 <b>「显示」</b>（英文版 Show）上，会再弹出一个子菜单。</p>
<p><b>4.</b> 在子菜单里点这两项，<b>让它们前面都出现勾</b>：</p>
<ul><li>☑ <b>文件扩展名</b>（File name extensions）</li>
<li>☑ <b>隐藏的项目</b>（Hidden items）</li></ul>
<p><b>5.</b> 完事。<b>怎么确认成功了？</b>随便找一张图片，它的名字现在应该带上了 <code>.jpg</code> 或 <code>.png</code>。带上了就是成功。</p>
<p>⚠️ 注意：这两项是<b>点一下开、再点一下关</b>的开关。如果点完发现名字反而没了扩展名，说明你原本是开着的，再点回来即可。</p>
</div></details>
<details class="lp-fold"><summary>🪟 Windows 10 —— 一步步照做</summary><div class="lp-fold-body">
<p><b>1.</b> 按 <code>Win + E</code> 打开文件资源管理器。</p>
<p><b>2.</b> 点顶部的 <b>「查看」选项卡</b>（和"主页""共享"排在一行的那个）。</p>
<p><b>3.</b> 在展开的工具条右侧，找到「显示/隐藏」那一组，把这两个方框勾上：</p>
<ul><li>☑ <b>文件扩展名</b></li><li>☑ <b>隐藏的项目</b></li></ul>
<p><b>4.</b> 找张图片确认名字后面出现了 <code>.jpg</code>，就成功了。</p>
</div></details>
<details class="lp-fold"><summary>🪟 上面都找不到？用这个万能办法（Win 10/11 都行）</summary><div class="lp-fold-body">
<p><b>1.</b> 按 <code>Win + R</code>，弹出一个小窗口。</p>
<p><b>2.</b> 输入 <code>control folders</code>，回车。会打开「文件资源管理器选项」。</p>
<p><b>3.</b> 切到 <b>「查看」</b>标签页，在下面那个长长的列表里：</p>
<ul>
<li>找到 <b>「隐藏已知文件类型的扩展名」</b> → <b>把勾去掉</b>（注意是"去掉"，这条是反的）</li>
<li>找到 <b>「显示隐藏的文件、文件夹和驱动器」</b> → <b>选中它</b>（是个圆点选项）</li>
</ul>
<p><b>4.</b> 点「应用」→「确定」。</p>
</div></details>
{{/if}}

{{if:mac}}
<details class="lp-fold" open><summary>🍎 macOS —— 一步步照做</summary><div class="lp-fold-body">
<p><b>显示所有扩展名：</b></p>
<p><b>1.</b> 打开 <b>访达（Finder）</b>。<b>2.</b> 顶部菜单点 <b>「访达」→「设置」</b>（旧系统叫「偏好设置」，快捷键 <code>Cmd + ,</code>）。<b>3.</b> 切到 <b>「高级」</b>标签。<b>4.</b> 勾上 <b>「显示所有文件扩展名」</b>。</p>
<p><b>显示隐藏文件：</b></p>
<p>在访达窗口里按 <code>Cmd + Shift + .</code>（句点）。隐藏的文件会以半透明显示出来。<b>再按一次就藏回去</b>——这是个开关，随时可切。</p>
<p><b>怎么确认成功？</b>打开「下载」文件夹，文件名后面现在应该都带 <code>.pdf</code> <code>.png</code> 这样的后缀了。</p>
</div></details>
{{/if}}

{{if:linux}}
<details class="lp-fold" open><summary>🐧 Linux —— 显示隐藏文件</summary><div class="lp-fold-body">
<p>在文件管理器里按 <code>Ctrl + H</code> 即可显示/隐藏以点开头的文件（GNOME Files、Nautilus、Dolphin 等都支持）。</p>
<p>Linux 本来就一直显示完整文件名，扩展名不需要额外设置。</p>
</div></details>
{{/if}}

<details class="lp-fold"><summary>🍊 打个比方，为什么这事这么重要</summary><div class="lp-fold-body">
<p>不显示扩展名，就像<b>快递单上不写收件人姓名</b>：包裹都堆在门口，长得一模一样，你只能一个个拆开猜。</p>
<p>而 AI 跟你交流时<b>永远说全名</b>——它会说「结果写进 <code>out/汇总.csv</code> 了」。你这边看不到 <code>.csv</code>，就等于它在说一门你听不懂的话。</p>
</div></details>`,
        en: `{{if:win}}<div class="lp-oneline">You are on Windows — <b>skip these two settings and you will hit trouble later</b>. One minute now saves that.</div>{{/if}}
{{if:mac}}<div class="lp-oneline">You are on macOS — turning these two on now makes finding files much easier later.</div>{{/if}}
<p><b>Why this matters:</b></p>
<ul>
<li><b>Hidden extensions mean you cannot find the file the AI mentions.</b> It says "the index is in <code>index.md</code>", but your folder just shows something called "index" — next to another thing also called "index". One is <code>.md</code>, the other <code>.csv</code>, and you cannot tell them apart.</li>
<li><b>Hidden extensions mean renaming breaks files.</b> Renaming "report" to "report2" can silently delete the <code>.md</code> or add a stray dot — the file stops opening and you cannot even see what went wrong.</li>
<li><b>Hidden files mean you cannot see folders like <code>.git</code>.</b> After you start snapshotting with Git in Chapter 7, the <code>.git</code> folder holding every version is hidden. Not seeing it, you will assume the snapshot failed.</li>
</ul>

{{if:win}}
<details class="lp-fold" open><summary>🪟 Windows 11 — step by step (20 seconds)</summary><div class="lp-fold-body">
<p><b>1.</b> Press <code>Win + E</code> to open <b>File Explorer</b> (the window you normally browse files in).</p>
<p><b>2.</b> At the <b>top</b> of the window, click <b>View</b>.</p>
<p><b>3.</b> In the menu that drops down, hover over <b>Show</b> at the bottom — a submenu appears.</p>
<p><b>4.</b> Click these two so that <b>both get a tick</b>:</p>
<ul><li>☑ <b>File name extensions</b></li>
<li>☑ <b>Hidden items</b></li></ul>
<p><b>5.</b> Done. <b>How to confirm:</b> find any image — its name should now end in <code>.jpg</code> or <code>.png</code>. If it does, you are set.</p>
<p>⚠️ Note: these are <b>toggles</b> — clicking again turns them off. If extensions disappeared instead, they were already on; just click back.</p>
</div></details>
<details class="lp-fold"><summary>🪟 Windows 10 — step by step</summary><div class="lp-fold-body">
<p><b>1.</b> Press <code>Win + E</code> to open File Explorer.</p>
<p><b>2.</b> Click the <b>View tab</b> at the top (in the row with Home and Share).</p>
<p><b>3.</b> On the right of the ribbon, in the Show/hide group, tick both boxes:</p>
<ul><li>☑ <b>File name extensions</b></li><li>☑ <b>Hidden items</b></li></ul>
<p><b>4.</b> Check any image now ends in <code>.jpg</code> — that means it worked.</p>
</div></details>
<details class="lp-fold"><summary>🪟 Cannot find any of that? Use this fallback (Win 10/11)</summary><div class="lp-fold-body">
<p><b>1.</b> Press <code>Win + R</code> — a small box appears.</p>
<p><b>2.</b> Type <code>control folders</code> and press Enter. "File Explorer Options" opens.</p>
<p><b>3.</b> Go to the <b>View</b> tab and in the long list:</p>
<ul>
<li>Find <b>"Hide extensions for known file types"</b> → <b>UNtick it</b> (note: this one is inverted)</li>
<li>Find <b>"Show hidden files, folders, and drives"</b> → <b>select it</b> (it is a radio button)</li>
</ul>
<p><b>4.</b> Click Apply, then OK.</p>
</div></details>
{{/if}}

{{if:mac}}
<details class="lp-fold" open><summary>🍎 macOS — step by step</summary><div class="lp-fold-body">
<p><b>Show all extensions:</b></p>
<p><b>1.</b> Open <b>Finder</b>. <b>2.</b> Menu bar: <b>Finder → Settings</b> (called Preferences on older systems; shortcut <code>Cmd + ,</code>). <b>3.</b> Go to the <b>Advanced</b> tab. <b>4.</b> Tick <b>"Show all filename extensions"</b>.</p>
<p><b>Show hidden files:</b></p>
<p>In any Finder window press <code>Cmd + Shift + .</code> (period). Hidden files appear semi-transparent. <b>Press again to hide them</b> — it is a toggle you can flip any time.</p>
<p><b>How to confirm:</b> open your Downloads folder — filenames should now end in <code>.pdf</code>, <code>.png</code> and so on.</p>
</div></details>
{{/if}}

{{if:linux}}
<details class="lp-fold" open><summary>🐧 Linux — show hidden files</summary><div class="lp-fold-body">
<p>Press <code>Ctrl + H</code> in your file manager to toggle dot-files (works in GNOME Files/Nautilus, Dolphin and most others).</p>
<p>Linux always shows full filenames, so extensions need no extra setting.</p>
</div></details>
{{/if}}

<details class="lp-fold"><summary>🍊 An analogy for why this matters so much</summary><div class="lp-fold-body">
<p>Hiding extensions is like <b>parcels with no name on the label</b>: they all look identical on your doorstep, so you open each one to guess.</p>
<p>Meanwhile the AI <b>always uses full names</b> — it will say "results are in <code>out/summary.csv</code>". If your side never shows <code>.csv</code>, it is speaking a language you cannot hear.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '它不是聊天机器人，是会自己动手的同事', en: 'Not a chatbot — a colleague who does the work' },
      fig: 'chat-vs-do',
      body: {
        zh: `<div class="lp-oneline">网页版 AI 是「告诉你怎么做」，Claude Code 是「它直接做完」。</div>
<p>它能打开你的文件夹、读文件、改文件、跑脚本，然后回来汇报结果。你不用再复制粘贴。</p>
<details class="lp-fold"><summary>🍊 打个比方</summary><div class="lp-fold-body">
<p>网页版 AI 像<b>电话里的老师傅</b>：他在电话那头教你怎么修，扳手还得你自己拧。</p>
<p>Claude Code 像<b>上门维修</b>：他带着工具箱进你家，修完告诉你哪儿坏了、换了什么零件。</p>
</div></details>
<details class="lp-fold"><summary>📋 看个真实例子</summary><div class="lp-fold-body">
<p>你说：「桌面『报销』文件夹里 47 张发票截图，按年月建子文件夹归好，再生成 Excel 清单：文件名、日期、金额。」</p>
<p><b>网页 AI</b>：告诉你步骤，你自己做 40 分钟。<br>
<b>Claude Code</b>：做完了，然后说「归好了，清单在 报销清单.xlsx。有 3 张我没认出金额，单独列在最后。」</p>
</div></details>
<p>所以记住一句话就够了：<b>把它当成一个手很快、但完全不了解你公司的实习生。</b></p>`,
        en: `<div class="lp-oneline">A web AI tells you how. Claude Code just does it.</div>
<p>It opens your folders, reads files, edits files, runs scripts, then reports back. No copy-pasting.</p>
<details class="lp-fold"><summary>🍊 An analogy</summary><div class="lp-fold-body">
<p>A web AI is <b>a repairman on the phone</b>: he talks you through it, you still turn the wrench.</p>
<p>Claude Code is <b>a repairman at your door</b>: he brings the toolbox in, fixes it, and tells you what he replaced.</p>
</div></details>
<details class="lp-fold"><summary>📋 A real example</summary><div class="lp-fold-body">
<p>You say: "47 receipt screenshots in the Expenses folder on my desktop — sort them into year-month subfolders and make an Excel list: filename, date, amount."</p>
<p><b>Web AI</b>: gives you the steps; you spend 40 minutes.<br>
<b>Claude Code</b>: does it, then says "Sorted. List is in expenses.xlsx. Three amounts were unreadable — listed separately at the bottom."</p>
</div></details>
<p>One sentence is enough: <b>treat it as a very fast intern who knows nothing about your company.</b></p>`,
      },
    },
    {
      h: { zh: 'Clootee 是壳，Claude Code 是引擎', en: 'Clootee is the shell, Claude Code is the engine' },
      fig: 'engine-shell',
      body: {
        zh: `<div class="lp-oneline">Claude Code 干活，Clootee 负责让你不用碰黑窗口。</div>
<p>Claude Code 本来跑在<b>终端</b>里——黑底白字、只能打字的那种窗口。装它要先装 Node、敲命令、开终端登录，很多人卡在这。</p>
<p>Clootee 把这些全包了：<b>解压 → 双击 Windows_Start.bat → 跟着网页走</b>。缺什么当场装，有进度条。</p>
<details class="lp-fold"><summary>📋 它替你省掉了什么</summary><div class="lp-fold-body">
<table>
<tr><th>本来要自己做</th><th>在 Clootee 里</th></tr>
<tr><td>装 Node.js、配环境变量</td><td>自动下便携版，只放软件自己目录</td></tr>
<tr><td>敲命令装 Claude Code</td><td>点一下按钮</td></tr>
<tr><td>开终端登录账号</td><td>点按钮 → 浏览器授权 → 粘回授权码</td></tr>
<tr><td>猜「为什么没反应」</td><td>网络体检直接告诉你哪儿不通</td></tr>
</table>
</div></details>
<details class="lp-fold"><summary>🚀 第一次怎么跑起来</summary><div class="lp-fold-body">
<p><b>1.</b> 解压到英文路径，比如 <code>D:\\Clootee</code>（路径带中文或空格容易出怪问题）。</p>
<p><b>2.</b> 双击 <code>Windows_Start.bat</code>（Mac 双击 <code>Mac_Start.command</code>，Linux 跑 <code>./Linux_Start.sh</code>）。</p>
<p><b>3.</b> 浏览器自动开 <code>localhost:8970</code>，第一次让你<b>自己设一个访问口令</b>——没有默认口令。</p>
<p><b>停止</b>：双击 <code>Windows_Stop.bat</code>（Mac 是 <code>Mac_Stop.command</code>，Linux 跑 <code>./Linux_Stop.sh</code>）。关浏览器不等于关掉它，它还在后台跑。</p>
</div></details>`,
        en: `<div class="lp-oneline">Claude Code does the work; Clootee spares you the black window.</div>
<p>Claude Code normally runs in a <b>terminal</b> — the type-only black window. Installing it means Node, install commands, terminal login. Most people quit there.</p>
<p>Clootee bundles all of it: <b>unzip → double-click Windows_Start.bat → follow the page</b>. Missing pieces install themselves, with a progress bar.</p>
<details class="lp-fold"><summary>📋 What it removes for you</summary><div class="lp-fold-body">
<table>
<tr><th>Normally your job</th><th>In Clootee</th></tr>
<tr><td>Install Node.js, set PATH</td><td>Downloads a portable copy into its own folder</td></tr>
<tr><td>Type commands to install Claude Code</td><td>One button</td></tr>
<tr><td>Open a terminal to log in</td><td>Click, authorise in browser, paste the code back</td></tr>
<tr><td>Guess why nothing happens</td><td>A network check tells you what is blocked</td></tr>
</table>
</div></details>
<details class="lp-fold"><summary>🚀 Getting it running</summary><div class="lp-fold-body">
<p><b>1.</b> Unzip to an ASCII path such as <code>D:\\Clootee</code> (spaces or non-ASCII cause odd failures).</p>
<p><b>2.</b> Double-click <code>Windows_Start.bat</code> (<code>Mac_Start.command</code> on Mac, <code>./Linux_Start.sh</code> on Linux).</p>
<p><b>3.</b> The browser opens <code>localhost:8970</code> and asks you to <b>set your own access password</b> — there is no default.</p>
<p><b>To stop</b>: double-click <code>Windows_Stop.bat</code> (<code>Mac_Stop.command</code> on Mac, <code>./Linux_Stop.sh</code> on Linux). Closing the browser does not stop it.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '两个最该懂的词：Token 和上下文', en: 'The two words that matter most: token and context' },
      fig: 'token-meter',
      body: {
        zh: `<div class="lp-oneline">Token = AI 的计费单位；上下文 = 它一次能记住的总量。</div>
<p><b>Token</b>：AI 不按字算钱，按 token 算。1 个汉字大约 1～2 个 token。你发的、它回的、它读的文件，全都算。</p>
<p><b>上下文</b>：它一次能同时"看到"多少内容，也用 token 量。<b>超了就把最早的内容挤出去</b>——这就是它"忘事"的真相。</p>
<details class="lp-fold"><summary>🍊 打个比方</summary><div class="lp-fold-body">
<p>上下文像<b>一张办公桌</b>。桌子就这么大，你不停往上摞文件，摞满了，最下面那几张就被挤掉地上了。</p>
<p>它不是不上心，是<b>桌子放不下了</b>。所以「让它读整个硬盘」是个坏主意——一次就把桌子铺满。</p>
</div></details>
<p>剩下 6 个词（模型、会话、工作目录、提示词、API Key、引擎）不用背，往下滑到<b>本章术语表</b>看一眼就行，后面每章都会再遇到。</p>`,
        en: `<div class="lp-oneline">Token = the billing unit. Context = how much it can hold at once.</div>
<p><b>Token</b>: you are billed per token, not per character — one English word ≈ 1.3 tokens. What you send, what it replies, and every file it reads all count.</p>
<p><b>Context</b>: how much it can "see" at once, also in tokens. <b>Overflow pushes out the oldest content</b> — that is the truth behind it "forgetting".</p>
<details class="lp-fold"><summary>🍊 An analogy</summary><div class="lp-fold-body">
<p>Context is <b>a desk</b>. The desk is a fixed size. Keep stacking papers on it and the ones at the bottom get pushed onto the floor.</p>
<p>It is not careless — <b>the desk is full</b>. Which is why "read my whole hard drive" is a bad idea: it covers the desk in one go.</p>
</div></details>
<p>The other six words (model, session, workspace, prompt, API key, engine) need no memorising — glance at the <b>glossary</b> further down; every chapter uses them again.</p>`,
      },
    },
    {
      h: { zh: '工作目录：它只能碰你圈出来的地方', en: 'Workspace: it can only touch what you fence off' },
      fig: 'scope-folder',
      body: {
        zh: `<div class="lp-oneline">你指哪个文件夹，它就只在哪个文件夹里折腾。这是你的安全边界。</div>
<p>不指定，它什么也看不到。指定了 <code>D:\\项目A</code>，它就碰不到 <code>D:\\项目B</code>。</p>
<p>原则很简单：<b>只给它完成这件事必需的那些文件。</b></p>
<details class="lp-fold"><summary>⚠️ 一个常见错误</summary><div class="lp-fold-body">
<p>要处理一份含客户手机号的名单，有人直接把<b>整个公司共享盘</b>设成工作目录，图方便。</p>
<p>正确做法：把那一份文件复制到一个专用文件夹，只把这个文件夹给它。任务不需要的敏感字段，处理前先删掉。</p>
</div></details>`,
        en: `<div class="lp-oneline">It works only inside the folder you point at. That is your safety boundary.</div>
<p>Point at nothing and it sees nothing. Point at <code>D:\\projectA</code> and it cannot touch <code>D:\\projectB</code>.</p>
<p>The rule is simple: <b>give it only the files this job needs.</b></p>
<details class="lp-fold"><summary>⚠️ A common mistake</summary><div class="lp-fold-body">
<p>Someone needs to process a list containing customer phone numbers, so they point the workspace at <b>the entire company share</b> for convenience.</p>
<p>Do this instead: copy that one file into a dedicated folder and give it only that. Strip sensitive fields the task does not need.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '什么该交给它，什么必须你自己来', en: 'What to delegate, what stays yours' },
      fig: 'risk-scale',
      body: {
        zh: `<div class="lp-oneline">重复、机械、能撤销的交给它；涉钱、对外、要判断的自己把关。</div>
<p><b>放心交</b>：批量改名、格式转换、几十个表合并、把杂乱内容整理成清单、写一次性小工具、初稿。</p>
<p><b>自己核</b>：要汇报的数字、涉及公司规定的判断、即将发给客户的内容。</p>
<details class="lp-fold"><summary>🍊 一句话判断标准</summary><div class="lp-fold-body">
<p>问自己：<b>「万一它做错了，我能撤回来吗？」</b></p>
<p>能撤（改个文件名、生成一个新文件）→ 放手让它做。<br>
撤不回（删文件、改合同金额、邮件已发出）→ 先看计划，或者自己来。</p>
</div></details>
<details class="lp-fold"><summary>⚠️ 它最会骗人的地方</summary><div class="lp-fold-body">
<p>它会算数，也会<b>算错</b>，而且错得很像对的。文件改坏了你一眼看得见，数字算错了你看不见。</p>
<p>所以凡是要拿去汇报的数字，至少抽样核一遍。这条在第 3 章和第 5 章还会反复出现。</p>
</div></details>`,
        en: `<div class="lp-oneline">Delegate repetitive, mechanical, reversible work. Own anything financial, external, or judgement-based.</div>
<p><b>Safe to delegate</b>: bulk renaming, format conversion, merging spreadsheets, turning mess into lists, throwaway tools, first drafts.</p>
<p><b>Verify yourself</b>: numbers you will present, judgements that depend on company policy, anything about to reach a client.</p>
<details class="lp-fold"><summary>🍊 A one-question test</summary><div class="lp-fold-body">
<p>Ask yourself: <b>"If it gets this wrong, can I undo it?"</b></p>
<p>Undoable (a renamed file, a new output file) → let it run.<br>
Not undoable (deleted files, rewritten contract amounts, a sent email) → review the plan first, or do it yourself.</p>
</div></details>
<details class="lp-fold"><summary>⚠️ Where it fools you</summary><div class="lp-fold-body">
<p>It can compute, and it can <b>miscompute</b> — convincingly. A broken file is visible; a wrong number is not.</p>
<p>So spot-check any number you will present. This comes back in Chapters 3 and 5.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '安全：三条红线', en: 'Safety: three red lines' },
      fig: 'shield-lock',
      body: {
        zh: `<div class="lp-oneline">Clootee 跳过权限确认运行，所以能打开这网页的人 = 能在你电脑上执行任意命令。</div>
<ol>
<li><b>别暴露到公网。</b>默认只监听 <code>127.0.0.1</code>（只有本机能访问），保持默认。要远程就走 SSH 隧道或 VPN。</li>
<li><b>访问口令自己设一个像样的。</b>项目里没有默认口令。</li>
<li><b>API Key 等于钱包。</b>不要发群里、不要提交到代码仓库。泄露了立刻去平台作废重发。</li>
</ol>
<details class="lp-fold"><summary>🔍 「跳过权限确认」是什么意思</summary><div class="lp-fold-body">
<p>原版 Claude Code 每次要改文件、跑命令前都会问你一句「可以吗？」。Clootee 为了能<b>无人值守连续跑任务</b>，把这个确认关掉了。</p>
<p>好处是你可以排一串活让它自己跑完；代价就是上面那句红线。所以重要文件夹<b>先备份再交给它</b>。</p>
</div></details>`,
        en: `<div class="lp-oneline">Clootee runs in skip-permission mode, so anyone who can open this page can run any command on your machine.</div>
<ol>
<li><b>Never expose it publicly.</b> It binds <code>127.0.0.1</code> (local only) by default — keep it that way. For remote access use an SSH tunnel or VPN.</li>
<li><b>Set a real access password.</b> There is no default in the project.</li>
<li><b>Your API key is your wallet.</b> Never paste it into a chat or commit it. If it leaks, revoke and reissue immediately.</li>
</ol>
<details class="lp-fold"><summary>🔍 What "skip permission" means</summary><div class="lp-fold-body">
<p>Stock Claude Code asks "may I?" before each file change or command. Clootee turns that off so it can <b>run queued work unattended</b>.</p>
<p>The upside is a queue that finishes by itself; the cost is the red line above. So <b>back up important folders</b> before letting it loose.</p>
</div></details>`,
      },
    },
    {
      h: { zh: '看不懂？问右边那个小助手', en: 'Stuck? Ask the assistant on the right' },
      fig: 'session-lanes',
      body: {
        zh: `<div class="lp-oneline">这一页的任何一句话看不懂，选中它，点浮出来的「💬 问小助手」就行。</div>
<p>小助手能<b>看见你现在在看哪一章、正文写了什么</b>，所以你不用解释背景，直接问「这段什么意思」它就知道你指哪儿。</p>
<p>三个入口：</p>
<ul>
<li><b>选中任意文字</b> → 浮出「💬 问小助手」→ 那句话自动带过去</li>
<li><b>直接在右下角输入框打字</b> → 它默认已经知道你在这一章</li>
<li><b>做题时</b>每道题右上角有「就这道题问小助手」，不确定为什么错就点它</li>
</ul>
<details class="lp-fold"><summary>📝 这样问，比「看不懂」有用得多</summary><div class="lp-fold-body">
<p>选中一句话之后，试试这几种问法：</p>
<pre>用大白话再讲一遍，别用术语。
结合我的工作举个例子——我是做人事的。
这句话和上一段有什么关系？
我这题选了 B，为什么是错的？</pre>
<p>你会发现和第 2 章要讲的「四要素指令法」是同一个道理：<b>说清楚你要什么，得到的东西才有用。</b></p>
</div></details>
<details class="lp-fold"><summary>⚠️ 一个话题一个会话，别一直往下聊</summary><div class="lp-fold-body">
<p>点小助手上方的 <b>＋</b> 可以开新会话，<b>🗂</b> 可以在多个会话之间切换。</p>
<p><b>为什么要换？</b>因为每问一次，它都会把这个会话之前的<b>全部对话重新发一遍</b>给模型。聊到第 30 轮，你问的那一句话背后其实拖着 29 轮历史——又慢又贵。</p>
<p>所以本教程做了两道闸：<b>超过 20 轮红字提醒你换会话，超过 40 轮直接不让再问</b>，点一下「开新会话」就能继续。</p>
<p>这不是在限制你，而是把第 3 节刚讲的 <b>token 和上下文</b>做成了看得见的规矩——你在第 6 章还会再遇到同一件事。</p>
</div></details>`,
        en: `<div class="lp-oneline">Any sentence on this page you do not follow: select it and click the “💬 Ask the assistant” button that pops up.</div>
<p>The assistant <b>sees which chapter you are on and what the page says</b>, so you never have to explain the background — just ask "what does this mean" and it knows what you are pointing at.</p>
<p>Three ways in:</p>
<ul>
<li><b>Select any text</b> → “💬 Ask the assistant” appears → that sentence goes along with your question</li>
<li><b>Just type in the box on the right</b> → it already knows which chapter you are on</li>
<li><b>During a quiz</b>, every question has “Ask the assistant about this question” in its corner</li>
</ul>
<details class="lp-fold"><summary>📝 Ask like this — far better than "I don't get it"</summary><div class="lp-fold-body">
<p>After selecting a sentence, try:</p>
<pre>Say this again in plain words, no jargon.
Give me an example from my job — I work in HR.
How does this relate to the previous paragraph?
I picked B on this question. Why is that wrong?</pre>
<p>Same principle as the four-part recipe in Chapter 2: <b>say what you want and the answer becomes useful.</b></p>
</div></details>
<details class="lp-fold"><summary>⚠️ One topic per chat — do not let it run on forever</summary><div class="lp-fold-body">
<p><b>＋</b> above the assistant starts a new chat; <b>🗂</b> switches between them.</p>
<p><b>Why bother?</b> Because every question resends <b>the entire chat history</b> to the model. By turn 30, one short question drags 29 turns behind it — slow and expensive.</p>
<p>So this course adds two gates: <b>a red warning past 20 turns, and no new questions past 40</b>. One click on "New chat" and you carry on.</p>
<p>This is not a restriction — it is the <b>token and context</b> lesson from the previous section turned into a visible rule. You will meet it again in Chapter 6.</p>
</div></details>`,
      },
    },
  ],

  terms: [
    { k: { zh: 'VS Code', en: 'VS Code' }, d: { zh: '免费的文本/代码编辑器，本课所有 .md /.csv /.html 都用它打开', en: 'A free text and code editor — open every .md, .csv and .html in this course with it' } },
    { k: { zh: '纯文本文件', en: 'Plain text file' }, d: { zh: '.md /.csv /.html 这类只有文字没有格式的文件，用 Word 打开会被改坏', en: 'Files like .md, .csv, .html holding text with no formatting; Word corrupts them' } },
    { k: { zh: '扩展名', en: 'File extension' }, d: { zh: '文件名最后那一小截（.md /.csv），决定这是什么类型的文件，必须让它显示出来', en: 'The tail of a filename (.md, .csv) telling you its type — you must make it visible' } },
    { k: { zh: '隐藏的项目', en: 'Hidden items' }, d: { zh: '默认不显示的文件夹（如 Git 的 .git），不打开就以为它不存在', en: 'Folders hidden by default (like Git\'s .git); unseen, you assume they do not exist' } },
    { k: { zh: '模型 / Model', en: 'Model' }, d: { zh: '真正在思考的大脑，可随时更换（Claude / MiniMax / Kimi…）', en: 'The brain doing the thinking; swappable (Claude / MiniMax / Kimi…)' } },
    { k: { zh: 'Token', en: 'Token' }, d: { zh: 'AI 的计量单位，收费与长度限制都按它算', en: "The AI's unit of text; billing and limits are counted in it" } },
    { k: { zh: '上下文窗口 / Context', en: 'Context window' }, d: { zh: '一次能同时记住的 token 总量，超了就挤掉最早的内容', en: 'How much it can hold at once; overflow pushes out the oldest content' } },
    { k: { zh: '会话 / Session', en: 'Session' }, d: { zh: '一次连续对话；新会话=一张白纸', en: 'One continuous conversation; a new session starts blank' } },
    { k: { zh: '工作目录 / Workspace', en: 'Workspace' }, d: { zh: '允许 AI 读写的文件夹，即安全边界', en: 'The folder the AI may read and write — your safety boundary' } },
    { k: { zh: '提示词 / Prompt', en: 'Prompt' }, d: { zh: '你发给 AI 的指令，写得越清楚结果越好', en: 'The instruction you send; clearer in, better out' } },
    { k: { zh: 'API Key', en: 'API key' }, d: { zh: '证明调用算你账上的密钥，等同钱包，不可外泄', en: 'The secret that bills calls to you — treat it as your wallet' } },
    { k: { zh: '引擎 / Engine', en: 'Engine' }, d: { zh: 'Clootee 里干活的程序（Claude Code / Codex）', en: 'The program doing the work in Clootee (Claude Code / Codex)' } },
    { k: { zh: '终端 / CLI', en: 'Terminal / CLI' }, d: { zh: '黑底白字、只能打字的窗口；Clootee 帮你免了它', en: 'The type-only black window; Clootee spares you from it' } },
    { k: { zh: '跳过权限确认', en: 'Skip-permission mode' }, d: { zh: 'Clootee 的运行方式：AI 动手前不再逐条问你，因此不能暴露到公网', en: "Clootee's run mode: the AI does not ask before each action — so never expose it publicly" } },
  ],

  quiz: [
    { t: 'single', fig: 'chat-vs-do',
      q: { zh: 'Claude Code 和网页版 AI 聊天最本质的区别是什么？', en: 'What is the essential difference between Claude Code and a web AI chat?' },
      o: [
        { zh: 'Claude Code 回答得更长', en: 'Claude Code writes longer answers' },
        { zh: 'Claude Code 能直接在你电脑上读写文件、执行操作，而不只是给建议', en: 'Claude Code can actually read/write files and act on your computer, not just advise' },
        { zh: 'Claude Code 不要钱', en: 'Claude Code is free' },
        { zh: 'Claude Code 只能用中文', en: 'Claude Code only speaks one language' },
      ], a: 1,
      e: { zh: '关键在「能动手」：它自己完成任务，而不是告诉你怎么做。', en: 'The key is action: it completes the task instead of telling you how.' } },

    { t: 'single', fig: 'engine-shell',
      q: { zh: 'Clootee 在整个体系里扮演什么角色？', en: 'What role does Clootee play?' },
      o: [
        { zh: '它是一个新的 AI 模型', en: 'It is a new AI model' },
        { zh: '它是 Claude Code 的网页外壳，负责安装、登录、会话管理等杂事', en: 'It is a web shell around Claude Code, handling install, login and session management' },
        { zh: '它是一个云服务器', en: 'It is a cloud server' },
        { zh: '它是 Excel 插件', en: 'It is an Excel plugin' },
      ], a: 1,
      e: { zh: '引擎是 Claude Code，Clootee 是包在外面的方向盘和仪表盘。', en: 'The engine is Claude Code; Clootee is the steering wheel and dashboard around it.' } },

    { t: 'single', fig: 'token-meter',
      q: { zh: '「Token」最准确的理解是：', en: 'The most accurate understanding of "token" is:' },
      o: [
        { zh: '登录用的口令', en: 'A login password' },
        { zh: 'AI 处理文本的计量单位，计费与长度限制都按它算', en: "The AI's unit of text; billing and length limits are counted in it" },
        { zh: '一种加密货币', en: 'A cryptocurrency' },
        { zh: '文件的扩展名', en: 'A file extension' },
      ], a: 1,
      e: { zh: 'Token 是长度/费用的单位；1 个汉字大约 1～2 个 token。', en: 'A token is the unit of length and cost; one English word ≈ 1.3 tokens.' } },

    { t: 'single', fig: 'context-fill',
      q: { zh: '你和 AI 聊到第 40 轮，它突然「忘了」你最开始提的要求。最可能的原因是：', en: 'At turn 40 the AI suddenly "forgets" your original requirement. The most likely reason:' },
      o: [
        { zh: '它故意偷懒', en: 'It is deliberately slacking' },
        { zh: '早期内容超出上下文窗口被挤出去了', en: 'The early content overflowed the context window and got pushed out' },
        { zh: '网络断了', en: 'The network dropped' },
        { zh: '它需要重启电脑', en: 'The computer needs a reboot' },
      ], a: 1,
      e: { zh: '上下文窗口有上限，超了就丢最早的内容。重要约束要重申或写进文件。', en: 'The context window has a hard limit; the oldest content is dropped. Restate key constraints or put them in a file.' } },

    { t: 'single', fig: 'scope-folder',
      q: { zh: '「工作目录」为什么是最重要的设置之一？', en: 'Why is the workspace one of the most important settings?' },
      o: [
        { zh: '它决定界面颜色', en: 'It sets the UI colour' },
        { zh: '它划定了 AI 能看到和能改动的范围，是安全边界', en: 'It bounds what the AI can see and change — the safety boundary' },
        { zh: '它决定用哪个模型', en: 'It picks the model' },
        { zh: '它决定回复语言', en: 'It sets the reply language' },
      ], a: 1,
      e: { zh: '不指定工作目录，AI 什么也看不到；指定错了，它可能动到不该动的文件。', en: 'Without one the AI sees nothing; with the wrong one it may touch files it should not.' } },

    { t: 'judge', fig: 'shield-lock',
      q: { zh: 'Clootee 以「跳过权限确认」的方式运行 Claude Code，所以任何能打开这个网页的人都能在你机器上执行命令，绝不能把它直接暴露到公网。', en: 'Clootee runs Claude Code in skip-permission mode, so anyone who can open the page can run commands on your machine — it must never be exposed to the public internet.' },
      a: true,
      e: { zh: '这是 README 里的头号安全须知：默认只监听 127.0.0.1，远程要走 SSH 隧道或 VPN。', en: "This is the top safety note: it binds to 127.0.0.1 by default; use an SSH tunnel or VPN for remote access." } },

    { t: 'judge', fig: 'key-wallet',
      q: { zh: 'API Key 泄露了没关系，反正别人不知道你的电脑密码。', en: 'A leaked API key is harmless as long as nobody knows your computer password.' },
      a: false,
      e: { zh: 'API Key 等同钱包：拿到它的人可以直接以你的账户消费。泄露必须立刻作废重发。', en: 'An API key is your wallet: whoever holds it can spend on your account. Revoke and reissue immediately.' } },

    { t: 'single', fig: 'files-sort',
      q: { zh: '下面哪件事最适合交给 Claude Code？', en: 'Which task is the best fit for Claude Code?' },
      o: [
        { zh: '决定要不要辞退某位同事', en: 'Deciding whether to fire a colleague' },
        { zh: '把 60 个命名混乱的 PDF 按「日期_客户名」批量重命名并生成清单', en: 'Bulk-renaming 60 messy PDFs to "date_client" and producing an index' },
        { zh: '猜今天股市涨还是跌', en: 'Guessing whether the market goes up today' },
        { zh: '替你参加线下会议', en: 'Attending your in-person meeting' },
      ], a: 1,
      e: { zh: '重复、机械、规则明确、量大——这正是它的主场。', en: 'Repetitive, mechanical, rule-based and high-volume — its home turf.' } },

    { t: 'multi', fig: 'intern',
      q: { zh: '以下哪些事情，AI 做完之后<b>你必须自己核对</b>？（多选）', en: 'Which of these <b>must you verify yourself</b> after the AI is done? (multiple)' },
      o: [
        { zh: '要拿去向老板汇报的销售数字', en: 'Sales figures you will present to your boss' },
        { zh: '涉及公司报销标准的判断', en: 'Judgements that depend on your expense policy' },
        { zh: '即将群发给客户的邮件正文', en: 'The body of an email about to go out to clients' },
        { zh: '它给某个临时文件夹起的名字', en: 'The name it gave a temporary folder' },
      ], a: [0, 1, 2],
      e: { zh: '对外、涉钱、涉判断的一律自己核；纯内部的临时命名无所谓。', en: 'Anything external, financial or judgement-based needs your check; an internal temp name does not.' } },

    { t: 'single', fig: 'session-lanes',
      q: { zh: '「会话（Session）」的正确用法是：', en: 'The correct way to use sessions is:' },
      o: [
        { zh: '所有工作都塞进同一个会话，方便查找', en: 'Put every job in one session so it is easy to find' },
        { zh: '不同的工作开不同的会话，避免互相干扰、也省上下文', en: 'One session per job, to avoid cross-talk and save context' },
        { zh: '每发一句话就新建一个会话', en: 'Start a new session for every message' },
        { zh: '会话越多模型越聪明', en: 'More sessions make the model smarter' },
      ], a: 1,
      e: { zh: '一个会话=一件事。混着用既浪费上下文，也容易让它把不相干的要求带过来。', en: 'One session, one job. Mixing wastes context and leaks irrelevant requirements between tasks.' } },

    { t: 'single', fig: 'intern',
      q: { zh: '把 Claude Code 想象成一个人，最贴切的比喻是：', en: 'If Claude Code were a person, the best analogy is:' },
      o: [
        { zh: '一位什么都懂的行业专家', en: 'An all-knowing industry expert' },
        { zh: '一个刚入职、手很快、但完全不了解你公司情况的实习生', en: 'A brand-new intern who is very fast but knows nothing about your company' },
        { zh: '一台自动售货机', en: 'A vending machine' },
        { zh: '一本说明书', en: 'A manual' },
      ], a: 1,
      e: { zh: '执行力强 + 缺背景知识，所以要说清楚，也要检查。', en: 'High execution, zero background — so be explicit and verify.' } },

    { t: 'single', fig: 'context-fill',
      q: { zh: '右边小助手的一个会话你已经问了 30 轮，感觉越来越慢。原因是：', en: 'After 30 turns in one assistant chat it feels slower and slower. Why?' },
      o: [
        { zh: '问得越多它越累', en: 'It gets tired the more you ask' },
        { zh: '每问一次都会把这个会话之前的全部对话重发给模型，轮次越多单次请求越大', en: 'Every turn resends the whole chat history, so each request grows with the number of turns' },
        { zh: '浏览器内存不够了', en: 'The browser runs out of memory' },
        { zh: '和轮次无关，纯属网络问题', en: 'Unrelated to turns — purely a network issue' },
      ], a: 1,
      e: { zh: '这就是上下文的直接后果，也是「一个话题一个会话」的理由。教程在 20 轮会红字提醒、40 轮不让再问。', en: 'A direct consequence of context — and the reason for one topic per chat. The course warns at 20 turns and stops at 40.' } },

    { t: 'judge', fig: 'engine-shell',
      q: { zh: '关掉浏览器标签页，Clootee 就完全停止运行了。', en: 'Closing the browser tab fully stops Clootee.' },
      a: false,
      e: { zh: '它是本机后台服务，要停必须运行 Windows_Stop.bat / Mac_Stop.command / Linux_Stop.sh。', en: 'It is a background service; you must run Windows_Stop.bat / Mac_Stop.command / Linux_Stop.sh to stop it.' } },

    { t: 'single', fig: 'shield-lock',
      q: { zh: '首次打开 Clootee 时要求设定的「访问口令」，默认值是什么？', en: 'What is the default value of the access password Clootee asks you to set on first run?' },
      o: [
        { zh: 'admin', en: 'admin' },
        { zh: '123456', en: '123456' },
        { zh: '没有默认值，由你自己设定', en: 'There is none — you choose it' },
        { zh: '你的邮箱地址', en: 'Your email address' },
      ], a: 2,
      e: { zh: '项目里不存在任何默认口令，这是刻意的安全设计。', en: 'There is deliberately no default password in the project.' } },

    { t: 'multi', fig: 'token-meter',
      q: { zh: '哪些内容会消耗 token？（多选）', en: 'Which of these consume tokens? (multiple)' },
      o: [
        { zh: '你发出去的提示词', en: 'The prompt you send' },
        { zh: 'AI 回复的内容', en: "The AI's reply" },
        { zh: 'AI 读取的文件内容', en: 'The file contents the AI reads' },
        { zh: '你在界面上点击按钮的次数', en: 'How many times you click buttons in the UI' },
      ], a: [0, 1, 2],
      e: { zh: '凡是进入模型视野的文本都算 token；点按钮本身不算。', en: 'Any text that enters the model counts; clicking buttons does not.' } },

    { t: 'single', fig: 'engine-shell',
      q: { zh: '国内网络连不上 Claude 官方服务时，Clootee 的做法是：', en: "When Claude's own service is unreachable, Clootee's approach is:" },
      o: [
        { zh: '直接报错让你自己想办法', en: 'Show an error and leave you to figure it out' },
        { zh: '做网络体检，并只列出当时实测能连通的替代服务商', en: 'Run a network check and list only the providers that actually responded' },
        { zh: '自动帮你翻墙', en: 'Automatically bypass the block for you' },
        { zh: '把请求转到别人的电脑', en: 'Route the request through someone else’s computer' },
      ], a: 1,
      e: { zh: '「只列当时实测能通的」是关键——避免你在不通的选项里瞎试。', en: 'Listing only what actually responded is the point — no blind trial and error.' } },

    { t: 'multi', fig: 'show-ext',
      q: { zh: '为什么一定要先打开「显示文件扩展名」和「显示隐藏的项目」？（多选）', en: 'Why must you turn on "file name extensions" and "hidden items" first? (multiple)' },
      o: [
        { zh: 'AI 说「结果在 汇总.csv」，不显示扩展名你就分不清哪个文件是它说的那个', en: 'The AI says "results are in summary.csv" — without extensions you cannot tell which file it means' },
        { zh: '改名时容易把扩展名删掉或打错，文件就打不开了，而你看不见错在哪', en: 'Renaming can silently delete or mistype the extension, breaking the file invisibly' },
        { zh: 'Git 存档用的 .git 文件夹是隐藏的，不开就看不到，会误以为存档失败', en: 'The .git folder Git uses is hidden — unseen, you assume the snapshot failed' },
        { zh: '不打开这两个设置，Clootee 就无法启动', en: 'Clootee cannot start unless both settings are on' },
      ], a: [0, 1, 2],
      e: { zh: '前三条都是真实会踩的坑；Clootee 能不能启动跟这两个设置无关。', en: 'The first three are real traps; whether Clootee starts has nothing to do with these settings.' } },

    { t: 'judge', fig: 'engine-shell',
      q: { zh: '模型（Claude / MiniMax / Kimi）是可以随时更换的，换了之后干活方式基本不变。', en: 'The model (Claude / MiniMax / Kimi) can be switched at any time, and the way you work stays basically the same.' },
      a: true,
      e: { zh: '模型是「大脑」，工作流程由 Claude Code 和 Clootee 决定，换脑不换流程。', en: 'The model is the brain; the workflow is set by Claude Code and Clootee, so swapping brains keeps the flow.' } },

    { t: 'single', fig: 'prompt-4parts',
      q: { zh: '下面哪种说法对「提示词（Prompt）」的理解最准确？', en: 'Which statement about prompts is most accurate?' },
      o: [
        { zh: '只要句子够长，结果就够好', en: 'The longer the sentence, the better the result' },
        { zh: '它是你给 AI 的指令，清晰度直接决定结果质量', en: 'It is your instruction to the AI; clarity directly determines quality' },
        { zh: '必须用英文写才有效', en: 'It only works in English' },
        { zh: '必须包含专业术语才管用', en: 'It only works if it contains jargon' },
      ], a: 1,
      e: { zh: '长≠好，清楚才好：目标、范围、产出格式说明白最有效。', en: 'Long is not good; clear is. State goal, scope and output format.' } },

    { t: 'multi', fig: 'engine-shell',
      q: { zh: 'Clootee 替你省掉了哪些原本必须手动做的事？（多选）', en: 'Which manual steps does Clootee remove for you? (multiple)' },
      o: [
        { zh: '安装 Node.js 并配置环境变量', en: 'Installing Node.js and setting PATH' },
        { zh: '用命令行安装 Claude Code', en: 'Installing Claude Code from the command line' },
        { zh: '开终端跑登录流程', en: 'Running the login flow in a terminal' },
        { zh: '替你决定业务上该做什么', en: 'Deciding what your business should do' },
      ], a: [0, 1, 2],
      e: { zh: '它省的是环境和流程的麻烦，业务判断永远是你的。', en: 'It removes setup friction; business judgement stays yours.' } },

    { t: 'single', fig: 'scope-folder',
      q: { zh: '你要让 AI 处理一份含客户手机号的名单，最稳妥的做法是：', en: 'You need the AI to process a list containing customer phone numbers. The safest approach is:' },
      o: [
        { zh: '直接把整个公司共享盘设为工作目录', en: 'Set the entire company shared drive as the workspace' },
        { zh: '把这份文件单独复制到一个专用文件夹，只把这个文件夹设为工作目录', en: 'Copy that file into a dedicated folder and set only that folder as the workspace' },
        { zh: '把手机号贴到聊天框里', en: 'Paste the phone numbers into the chat box' },
        { zh: '关掉访问口令方便同事一起看', en: 'Turn off the access password so colleagues can look too' },
      ], a: 1,
      e: { zh: '最小范围原则：只给它完成任务所必需的那些文件。', en: 'Least privilege: give it only the files the task requires.' } },

    { t: 'judge', fig: 'intern',
      q: { zh: '因为 AI 会算数，所以它算出来的销售汇总数字可以直接拿去开会汇报。', en: 'Since the AI can do arithmetic, its sales totals can go straight into your board meeting.' },
      a: false,
      e: { zh: '它会算也会算错。凡是对外汇报的数字，至少抽样核对一遍。', en: 'It computes, and it miscomputes. Spot-check anything you present.' } },

    { t: 'single', fig: 'shield-lock',
      q: { zh: 'Clootee 默认监听哪个地址？为什么？', en: 'Which address does Clootee bind by default, and why?' },
      o: [
        { zh: '0.0.0.0，方便同事访问', en: '0.0.0.0, so colleagues can reach it' },
        { zh: '127.0.0.1，因为跳过权限确认模式下暴露到公网极其危险', en: '127.0.0.1, because skip-permission mode makes public exposure extremely dangerous' },
        { zh: '随机端口，防止被扫描', en: 'A random port, to avoid scanning' },
        { zh: '公网 IP，方便远程办公', en: 'A public IP, for remote work' },
      ], a: 1,
      e: { zh: '需要远程时走 SSH 隧道或 VPN，而不是直接开放。', en: 'For remote access use an SSH tunnel or VPN, not direct exposure.' } },

    { t: 'single', fig: 'context-fill',
      q: { zh: '一个会话里，AI 记得之前说过的话，是因为：', en: 'Within one session the AI remembers earlier turns because:' },
      o: [
        { zh: '它把对话存进了云端数据库并永久学习', en: 'It saves the chat to a cloud database and learns permanently' },
        { zh: '之前的对话内容会随每次请求一起放进上下文', en: 'Earlier turns are sent along inside the context on every request' },
        { zh: '它有人类一样的长期记忆', en: 'It has human-like long-term memory' },
        { zh: '浏览器缓存了它的记忆', en: 'The browser caches its memory' },
      ], a: 1,
      e: { zh: '「记得」其实是每次都把历史一起发过去，所以历史越长越贵、越容易超限。', en: 'Remembering means resending the history each time — longer history costs more and overflows sooner.' } },

    { t: 'multi', fig: 'context-fill',
      q: { zh: '关于上下文窗口，下列说法正确的有：（多选）', en: 'Which statements about the context window are correct? (multiple)' },
      o: [
        { zh: '它有上限，用 token 计量', en: 'It has a hard limit, measured in tokens' },
        { zh: '超出后最早的内容会被挤掉', en: 'Overflow drops the earliest content' },
        { zh: '让 AI 读入超大文件会迅速吃掉它', en: 'Reading a huge file eats it quickly' },
        { zh: '它的大小取决于你的显示器分辨率', en: 'Its size depends on your monitor resolution' },
      ], a: [0, 1, 2],
      e: { zh: '上下文是模型能力参数，与显示器无关。', en: 'Context size is a model property, unrelated to your display.' } },

    { t: 'single', fig: 'intern',
      q: { zh: '「实习生比喻」告诉我们的最重要一课是：', en: 'The most important lesson from the "intern analogy" is:' },
      o: [
        { zh: '不要给它派活', en: 'Do not assign it work' },
        { zh: '把话说清楚，并检查结果', en: 'Be explicit, and check the result' },
        { zh: '它比你懂业务', en: 'It knows your business better than you' },
        { zh: '它需要休息', en: 'It needs rest' },
      ], a: 1,
      e: { zh: '这两点贯穿全课：清楚的指令 + 验收。', en: 'These two run through the whole course: clear instruction plus verification.' } },

    { t: 'single', fig: 'intern',
      q: { zh: '你想让 AI 帮你写一份「本季度部门 OKR」，最大的风险是：', en: 'You ask the AI to draft "this quarter\'s department OKRs". The biggest risk is:' },
      o: [
        { zh: '它写得太快', en: 'It writes too fast' },
        { zh: '它不知道你们公司的真实战略与数据，会写出看起来像样但不成立的内容', en: 'It does not know your real strategy or numbers, so it produces plausible but wrong content' },
        { zh: '它只会写英文', en: 'It only writes English' },
        { zh: '它会拒绝这个任务', en: 'It will refuse the task' },
      ], a: 1,
      e: { zh: '缺背景 → 看起来专业但不成立。要先把背景材料喂给它。', en: 'No background → professional-looking but unfounded. Feed it the context first.' } },

    { t: 'judge', fig: 'session-lanes',
      q: { zh: '在同一个会话里同时做「整理发票」和「写年度总结」，效率更高。', en: 'Doing "sort receipts" and "write the annual review" in the same session is more efficient.' },
      a: false,
      e: { zh: '会互相污染上下文、浪费 token，还容易把不相干的要求带过来。', en: 'It pollutes context, wastes tokens, and leaks irrelevant requirements across tasks.' } },

    { t: 'single', fig: 'scope-folder',
      q: { zh: '如果你完全不写工作目录就发消息让 AI「整理我的文件」，最可能发生什么？', en: 'If you set no workspace and ask the AI to "tidy up my files", what most likely happens?' },
      o: [
        { zh: '它会自动扫描整个硬盘', en: 'It scans your whole hard drive' },
        { zh: '它没有明确范围，无法定位到你说的「我的文件」，只能反问或做无关操作', en: 'It has no scope, cannot locate "my files", and will ask back or do something irrelevant' },
        { zh: '它会自动选择桌面', en: 'It automatically picks the desktop' },
        { zh: '任务会成功但很慢', en: 'It succeeds, just slowly' },
      ], a: 1,
      e: { zh: '范围是你给的。没有范围，它无从下手。', en: 'Scope comes from you. Without it, there is nothing to act on.' } },

    { t: 'multi', fig: 'risk-scale',
      q: { zh: '下面哪些属于「AI 做完你可以基本放心」的低风险任务？（多选）', en: 'Which are low-risk tasks you can largely trust? (multiple)' },
      o: [
        { zh: '把 200 个文件按修改日期分文件夹', en: 'Sorting 200 files into folders by modified date' },
        { zh: '把一段英文说明翻译成中文初稿', en: 'Producing a first-draft translation of a paragraph' },
        { zh: '把客户合同金额直接改成它算出来的数', en: 'Overwriting contract amounts with numbers it computed' },
        { zh: '给一堆截图批量改成统一命名', en: 'Bulk-renaming screenshots to a consistent pattern' },
      ], a: [0, 1, 3],
      e: { zh: '可逆、内部、机械的低风险；改合同金额是不可逆且涉钱的高风险。', en: 'Reversible, internal, mechanical = low risk. Rewriting contract amounts is irreversible and financial.' } },
  ],
});
