// 小白教程页的文案字典。语言状态复用 trans.js 的 LANG（currentLang / toggleLang）。
// 章节正文与题库自带 {zh,en}，用 X() 取；这里只放页面框架文案。
const LDICT = {
  pageTitle: { en: 'Clootee Beginner Course', zh: 'Clootee 小白教程' },
  pageSub: {
    en: 'From zero to shipping real work with Claude Code',
    zh: '从零开始，用 Claude Code 干完真实工作',
  },
  back: { en: '← Back to Clootee', zh: '← 返回 Clootee' },
  home: { en: 'Course map', zh: '课程总览' },
  assistToggle: { en: 'Assistant', zh: '小助手' },
  chapters: { en: 'Chapters', zh: '章节' },
  overallProgress: { en: 'Overall progress', zh: '总进度' },
  chDone: { en: 'Passed', zh: '已通过' },
  chLocked: { en: 'Locked', zh: '未解锁' },
  chCurrent: { en: 'In progress', zh: '学习中' },
  chLockedHint: {
    en: 'Score 80 or above in the previous chapter to unlock this one.',
    zh: '上一章考到 80 分及以上才会解锁本章。',
  },
  minutes: { en: '{n} min read', zh: '约 {n} 分钟' },
  qCount: { en: '{n} questions in bank', zh: '题库 {n} 题' },

  // 总览页
  homeHi: { en: 'Welcome 👋', zh: '欢迎来到这里 👋' },
  homeIntro: {
    en: `<p>This course teaches an <b>absolute beginner</b> — no coding background needed — how to get real office work done with <b>Claude Code</b> inside <b>Clootee</b>.</p>
<p>Every chapter has two parts: <b>the lesson</b>, then <b>a quiz</b>. The quiz draws <b>15 random questions</b> from a <b>30-question bank</b>, and you need <b>80 or above</b> to move on — so you can miss up to three. Fall short and you simply draw a fresh set.</p>
<p>Stuck on a sentence? <b>Select any text on this page</b> and click <b>Ask the assistant</b> on the right. The assistant sees the page you are on and the text you picked.</p>`,
    zh: `<p>这门课面向<b>完全零基础</b>的职场人——不需要任何编程背景——教你在 <b>Clootee</b> 里用 <b>Claude Code</b> 把真实的工作干完。</p>
<p>每一章都是两段：<b>先讲知识点</b>，<b>再考试</b>。考试从 <b>30 题的题库</b>里<b>随机抽 15 题</b>，考到 <b>80 分及以上</b>才能进入下一章——也就是最多错 3 题。没过就重抽一套再来。</p>
<p>哪句话没看懂？<b>用鼠标选中页面上的任意文字</b>，点一下浮出来的<b>「问小助手」</b>。小助手能看到你现在在看哪一章、选中了哪句话。</p>`,
  },
  homeStart: { en: 'Start Chapter 1', zh: '从第 1 章开始' },
  homeContinue: { en: 'Continue learning', zh: '继续学习' },
  homeReset: { en: 'Reset all progress', zh: '清空全部进度' },
  homeResetAsk: {
    en: 'Clear all chapter progress and start over? This cannot be undone.',
    zh: '清空所有章节的学习进度、从头再来？此操作不可撤销。',
  },
  homeCert: { en: 'View certificate 🏆', zh: '查看结业证书 🏆' },
  // 未做完的答卷（自动存档，下次回来接着做）
  resumeTitle: { en: 'You have an unfinished quiz', zh: '你有一份没做完的测验' },
  resumeMeta: {
    en: 'Chapter {n} · {title} — {done} of {total} answered',
    zh: '第 {n} 章 · {title} —— 已答 {done} / {total} 题',
  },
  resumeGo: { en: 'Continue →', zh: '接着做 →' },
  resumeDrop: { en: 'Discard', zh: '丢掉重抽' },
  resumeDropAsk: {
    en: 'Discard this unfinished quiz? Your answers will be lost and a fresh set will be drawn next time.',
    zh: '丢掉这份没做完的答卷？已填的答案会消失，下次进来重新抽 15 题。',
  },
  autosave: {
    en: 'Progress saves automatically — close the page any time and pick up where you left off.',
    zh: '进度会自动保存 —— 随时关掉页面，下次回来接着做。',
  },

  // 章节页
  goalLabel: { en: 'What you will be able to do', zh: '学完你能做到' },
  termsLabel: { en: 'Terms in this chapter', zh: '本章术语表' },
  toQuiz: { en: 'I have read it — start the quiz →', zh: '我读完了，开始测验 →' },
  reread: { en: 'Read the lesson again', zh: '重新看知识点' },
  prevCh: { en: '← Previous chapter', zh: '← 上一章' },
  nextCh: { en: 'Next chapter →', zh: '下一章 →' },

  // 测验
  quizTitle: { en: 'Chapter quiz', zh: '本章测验' },
  quizRule: {
    en: '15 questions drawn from a bank of {n}. <b>80 or above passes</b> — you can miss up to 3.',
    zh: '从 {n} 道题库中随机抽 15 题。<b>80 分及以上通过</b>——最多允许错 3 题。',
  },
  quizPracticeOn: {
    en: 'Hands-on questions are included and will be graded by the assistant.',
    zh: '本次包含实操题，将由小助手自动阅卷。',
  },
  quizPracticeOff: {
    en: 'Hands-on questions are skipped because no MiniMax API key is set. Add one in the assistant panel to unlock them.',
    zh: '未填写 MiniMax API Key，本次已跳过实操题。在右侧小助手里填上 Key 即可解锁。',
  },
  qOf: { en: 'Question {i} / {n}', zh: '第 {i} / {n} 题' },
  tSingle: { en: 'Single choice', zh: '单选题' },
  tMulti: { en: 'Multiple choice', zh: '多选题' },
  tJudge: { en: 'True / False', zh: '判断题' },
  tPractice: { en: 'Hands-on', zh: '实操题' },
  judgeTrue: { en: 'True', zh: '正确' },
  judgeFalse: { en: 'False', zh: '错误' },
  multiHint: { en: 'Pick every correct option — partial answers are wrong.', zh: '把所有正确项都选上——选不全算错。' },
  practiceTask: { en: 'Your task', zh: '你的任务' },
  practiceHow: {
    en: 'Do it for real in Clootee, then paste below: the instruction you gave Claude Code, and what came out.',
    zh: '到 Clootee 里真的做一遍，然后把下面两样粘进来：你给 Claude Code 的指令，以及它产出的结果。',
  },
  practicePh: {
    en: 'My instruction:\n...\n\nWhat I got:\n...',
    zh: '我发的指令：\n……\n\n我拿到的结果：\n……',
  },
  practiceGrading: { en: 'The assistant is grading…', zh: '小助手正在阅卷…' },
  practiceScore: { en: 'Assistant score: {s} / 100', zh: '小助手评分：{s} / 100' },
  practiceNeedKey: {
    en: 'Hands-on grading needs a MiniMax API key. Open the assistant panel on the right to add one.',
    zh: '实操题阅卷需要 MiniMax API Key。请在右侧小助手面板里填写。',
  },
  submit: { en: 'Submit answers', zh: '提交答卷' },
  submitting: { en: 'Grading…', zh: '正在判卷…' },
  unanswered: { en: '{n} question(s) still unanswered — answer them all before submitting.', zh: '还有 {n} 题没作答，全部答完才能交卷。' },
  yourScore: { en: 'Your score', zh: '你的成绩' },
  passed: { en: 'PASSED', zh: '通过' },
  failed: { en: 'NOT YET', zh: '未通过' },
  correctLabel: { en: 'Correct answer', zh: '正确答案' },
  yourAnswer: { en: 'Your answer', zh: '你的答案' },
  whyLabel: { en: 'Why', zh: '解析' },
  retry: { en: 'Draw 15 new questions and retry', zh: '重抽 15 题，再来一次' },
  reviewWrong: { en: 'The {n} you missed — read the explanations', zh: '错的这 {n} 题，看一眼解析' },
  failHint: {
    en: 'Not quite — {n} passes. Read the explanations below, then draw a fresh set.',
    zh: '差一点，{n} 分及格。先看下面的错题解析，再重抽一套。',
  },
  askAboutQ: { en: 'Ask the assistant about this question', zh: '就这道题问小助手' },
  attempts: { en: 'Attempt #{n}', zh: '第 {n} 次尝试' },

  // 通过后的鼓励
  praiseTitle: { en: 'Chapter {n} cleared! 🎉', zh: '第 {n} 章通关！🎉' },
  praiseNext: { en: 'On to Chapter {n} →', zh: '进入第 {n} 章 →' },
  praiseBackHome: { en: 'Back to the course map', zh: '回到课程总览' },
  praiseAllDone: { en: 'You finished the whole course 🏆', zh: '你学完了整门课 🏆' },

  // 结业证书
  certTitle: { en: 'Certificate of Completion', zh: '结业证书' },
  certBody: {
    en: 'has completed all {n} chapters of the Clootee Beginner Course and passed every chapter quiz.',
    zh: '已完成 Clootee 小白教程全部 {n} 个章节，且每一章测验均已通过。',
  },
  certName: { en: 'Your name', zh: '你的名字' },
  certNamePh: { en: 'Type your name', zh: '写上你的名字' },
  certDate: { en: 'Date', zh: '日期' },
  certPrint: { en: 'Print / Save as PDF', zh: '打印 / 存成 PDF' },
  certLocked: {
    en: 'The certificate unlocks after all chapters are passed.',
    zh: '全部章节通过后即可解锁证书。',
  },

  // 小助手
  asTitle: { en: 'Study assistant', zh: '学习小助手' },
  asSettings: { en: 'Settings', zh: '设置' },

  // ── 多会话 ──
  asNew: { en: 'New chat', zh: '新会话' },
  asListBtn: { en: 'All chats', zh: '会话列表' },
  asConvsTitle: { en: 'CHATS — one topic per chat', zh: '会话列表 —— 一个话题一个会话' },
  asConvNew: { en: 'New chat', zh: '新会话' },
  asConvTurns: { en: '{n} turns', zh: '{n} 轮' },
  asConvDel: { en: 'delete', zh: '删除' },
  asConvDelAsk: { en: 'Delete this chat? It cannot be undone.', zh: '删除这个会话？删了就找不回来了。' },
  asSubLine: { en: '{title} · turn {n}/{max}', zh: '{title} · 第 {n}/{max} 轮' },

  // ── 轮次上限 ──
  asWarnLong: {
    en: 'This chat is {n} turns long. Every turn resends the whole history, so it keeps getting slower and more expensive — start a new chat.',
    zh: '这个会话已经 {n} 轮了。每问一次都会把之前所有对话重发一遍，越聊越慢越贵——建议开个新会话。',
  },
  asWarnMax: {
    en: 'Limit reached ({max} turns). Start a new chat to keep going.',
    zh: '已达 {max} 轮上限。开一个新会话就能继续问。',
  },
  asWarnNewBtn: { en: 'New chat →', zh: '开新会话 →' },

  // 点「＋」时给输入框的气泡提示：已经是空会话就不该再开一个，但必须有反馈
  asAlreadyNew: {
    en: 'This chat is already empty — type what you need right here ↓',
    zh: '这已经是一个新会话啦，请在这里输入你的需求 ↓',
  },
  asNewReady: {
    en: 'New chat ready — type what you need right here ↓',
    zh: '新会话开好了，请在这里输入你的需求 ↓',
  },
  asKeyLabel: { en: 'MiniMax API Key', zh: 'MiniMax API Key' },
  asKeyPh: { en: 'Paste your key — stored only in this browser', zh: '粘贴你的 Key —— 只存在这个浏览器里' },
  asModelLabel: { en: 'Model', zh: '模型' },
  asBaseLabel: { en: 'API base URL', zh: 'API 地址' },
  asSave: { en: 'Save', zh: '保存' },
  asSaved: { en: 'Saved ✓', zh: '已保存 ✓' },
  asGetKey: { en: 'Where do I get a key? ↗', zh: '去哪儿领 Key？↗' },
  asKeyNote: {
    en: 'The assistant is optional — the course works fully without it. This page calls MiniMax directly from your browser, so there is no extra service to start. The key is stored only in this browser and is sent only to MiniMax.',
    zh: '小助手是可选的——不填 Key 也能完整学完这门课。本页直接从你的浏览器调用 MiniMax，不经过任何中间服务，所以没有额外的东西需要启动。Key 只存在这个浏览器里，也只发给 MiniMax。',
  },
  asNetFail: {
    en: 'Cannot reach {url} — check your network or proxy. ({e})',
    zh: '连不上 {url}，请检查网络或代理。（{e}）',
  },
  asEmpty: {
    en: 'Ask me anything about this page. Try: “explain this in plain words”, “give me an example from my job”, “why is my answer wrong?”',
    zh: '这一页有什么不懂的都能问我。比如：「用大白话再讲一遍」「结合我的工作举个例子」「我这题为什么错了？」',
  },
  asPh: { en: 'Ask a question…  (Enter to send, Shift+Enter for a new line)', zh: '有什么不明白的…（Enter 发送，Shift+Enter 换行）' },
  asSend: { en: 'Send', zh: '发送' },
  asThinking: { en: 'Thinking…', zh: '正在思考…' },
  asNoKey: {
    en: 'Add a MiniMax API key first — click ⚙ above.',
    zh: '请先填写 MiniMax API Key —— 点上方的 ⚙。',
  },
  asCtxPage: { en: 'Context: {ch}', zh: '上下文：{ch}' },
  asCtxSel: { en: 'Selected text attached', zh: '已附上你选中的文字' },
  asDropSel: { en: 'remove', zh: '移除' },
  askSelection: { en: '💬 Ask the assistant', zh: '💬 问小助手' },
  asFail: { en: 'Request failed: {e}', zh: '请求失败：{e}' },
  asRetry: { en: 'Retry', zh: '重试' },
  asCopy: { en: 'Copy', zh: '复制' },
  asCopied: { en: 'Copied', zh: '已复制' },
};

function LT(key, vars) {
  const e = LDICT[key];
  let s = e ? e[currentLang()] || e.en : key;
  if (vars) Object.keys(vars).forEach((k) => (s = s.split(`{${k}}`).join(String(vars[k]))));
  return s;
}

// 从内容对象 {zh,en} 里按当前语言取值；内容缺失时回退英文再回退中文
function X(o) {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  return o[currentLang()] || o.en || o.zh || '';
}
