// 小白教程引擎：章节导航、知识点渲染、抽题考试（30 抽 15，满分才过）、实操题送小助手阅卷、
// 通关鼓励与结业证书。进度只存在浏览器 localStorage，不依赖后端，教程本身可离线独立使用。
const CH = window.LEARN_CHAPTERS || [];
const PICK = 15;                 // 每次抽题数
const PASS = 80;                 // 通过分数线（15 题里对 12 题即 80 分）
const PRACTICE_PASS = 80;        // 实操题达到该分即判该题正确
const PROG_KEY = 'learn.progress';
const CERT_KEY = 'learn.certName';
const QUIZ_KEY = 'learn.quiz';   // 正在做的那份答卷（抽到哪 15 题 + 已填的答案 + 判卷结果）
const VIEW_KEY = 'learn.view';   // 上次看到哪一页，下次打开直接回到这里

const View = { name: 'home', ch: 0 };
let Quiz = null;                 // {chIdx, items:[], answers:[], graded:false, results:[], score:0}

const $$ = (id) => document.getElementById(id);

// ── 按当前操作系统显示对应的操作步骤 ──
// 章节正文里写 {{if:win}}…{{/if}}，只有对应系统才显示那一段。
// 下载一律给官网总链接，不做直链——版本让用户按文字提示自己在官网点。
const OS = (() => {
  const ua = navigator.userAgent || '';
  if (/Windows|Win32|Win64/i.test(ua)) return 'win';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'other';
})();
function applyEnv(html) {
  // 认出系统就只留该系统那一段；没认出来（OS='other'）则三套步骤全留，
  // 宁可长一点，也不能让人看到一个空章节、一步说明都没有。
  return String(html).replace(/\{\{if:(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (m, os, inner) =>
    (OS === 'other' || os === OS ? inner : ''));
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 进度 ──
function progress() {
  try {
    return JSON.parse(localStorage.getItem(PROG_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveProgress(p) {
  localStorage.setItem(PROG_KEY, JSON.stringify(p));
}
function isPassed(i) {
  return !!progress()[CH[i].id]?.passed;
}
// 第 0 章永远开放；其余需前一章通过
function isUnlocked(i) {
  return i === 0 || isPassed(i - 1);
}
function passedCount() {
  return CH.filter((_, i) => isPassed(i)).length;
}
function allPassed() {
  return CH.length > 0 && passedCount() === CH.length;
}
function markPassed(i) {
  const p = progress();
  const cur = p[CH[i].id] || { attempts: 0 };
  p[CH[i].id] = { passed: true, attempts: (cur.attempts || 0) + 1, at: new Date().toISOString() };
  saveProgress(p);
}
function markAttempt(i) {
  const p = progress();
  const cur = p[CH[i].id] || { attempts: 0, passed: false };
  p[CH[i].id] = { passed: !!cur.passed, attempts: (cur.attempts || 0) + 1, at: cur.at || '' };
  saveProgress(p);
}
function attemptsOf(i) {
  return progress()[CH[i].id]?.attempts || 0;
}

// ── 答卷与位置的自动存档 ──
// 做题做到一半关掉页面，下次打开还是那 15 题、还是你填过的答案，不用重来。
// 存的是题目在题库里的下标（items 里的对象就是题库里的对象，indexOf 拿得到）。
function saveQuiz() {
  // Quiz 为空只表示"当前没在做题的页面上"（比如回了首页），
  // **不能**顺手把存档删掉——那样一回首页答卷就没了。删档只在明确丢弃/重置时做。
  if (!Quiz) return;
  const bank = CH[Quiz.chIdx].quiz;
  localStorage.setItem(QUIZ_KEY, JSON.stringify({
    chIdx: Quiz.chIdx,
    bankLen: bank.length,
    idx: Quiz.items.map((q) => bank.indexOf(q)),
    answers: Quiz.answers,
    results: Quiz.results,
    graded: Quiz.graded,
    score: Quiz.score,
    at: Date.now(),
  }));
}
// 读存档；题库改过（长度变了 / 下标越界）就当存档失效，宁可重抽也不能给错题
function loadQuiz() {
  let s;
  try {
    s = JSON.parse(localStorage.getItem(QUIZ_KEY) || 'null');
  } catch {
    return null;
  }
  if (!s || !CH[s.chIdx]) return null;
  const bank = CH[s.chIdx].quiz;
  if (bank.length !== s.bankLen) return null;
  if (!Array.isArray(s.idx) || !s.idx.length) return null;
  if (s.idx.some((i) => !(Number.isInteger(i) && i >= 0 && i < bank.length))) return null;
  if (!Array.isArray(s.answers) || s.answers.length !== s.idx.length) return null;
  return {
    chIdx: s.chIdx,
    items: s.idx.map((i) => bank[i]),
    answers: s.answers,
    results: Array.isArray(s.results) ? s.results : [],
    graded: !!s.graded,
    score: Number(s.score) || 0,
    grading: false,
    msg: '',
  };
}
// 已作答题数（用于「继续未完成的测验」提示）
function answeredCount(q) {
  if (!q) return 0;
  return q.items.reduce((n, item, i) => {
    const a = q.answers[i];
    const empty = item.t === 'multi' ? !a || !a.length
      : item.t === 'practice' ? !String(a || '').trim() : a === null || a === undefined;
    return n + (empty ? 0 : 1);
  }, 0);
}
function saveView() {
  localStorage.setItem(VIEW_KEY, JSON.stringify({ name: View.name, ch: View.ch }));
}
function loadView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null');
    if (!v || !['home', 'chapter', 'quiz', 'result', 'cert'].includes(v.name)) return null;
    if (!Number.isInteger(v.ch) || !CH[v.ch]) return null;
    return v;
  } catch {
    return null;
  }
}
function clearSaved() {
  localStorage.removeItem(QUIZ_KEY);
  localStorage.removeItem(VIEW_KEY);
}

// ── 主题（跟随 Clootee 设置，只取配色，不跑动态背景）──
function applyLearnTheme() {
  const t = localStorage.getItem('theme') || 'dark';
  document.body.className = `${t} learn-page`;
}

// ── 顶栏 / 导航 ──
function renderTop() {
  document.documentElement.lang = currentLang();
  document.title = LT('pageTitle');
  $$('lpBack').textContent = LT('back');
  $$('lpTitle').textContent = LT('pageTitle');
  $$('lpSub').textContent = LT('pageSub');
  $$('lpBarLabel').textContent = LT('overallProgress');
  $$('lpLangBtn').textContent = currentLang() === 'zh' ? 'EN' : '中文';
  $$('lpAssistBtn').textContent = `💬 ${LT('assistToggle')}`;
  const pct = CH.length ? Math.round((passedCount() / CH.length) * 100) : 0;
  $$('lpBarFill').style.width = `${pct}%`;
  $$('lpBarPct').textContent = `${pct}%`;
}

function renderNav() {
  $$('lpNavTitle').textContent = LT('chapters');
  $$('lpNavHome').textContent = `🏠 ${LT('home')}`;
  $$('lpNavHome').className = `lp-nav-home${View.name === 'home' ? ' primary' : ''}`;
  $$('lpNavCert').textContent = allPassed() ? LT('homeCert') : `🔒 ${LT('certTitle')}`;
  $$('lpNavCert').disabled = !allPassed();

  $$('lpNavList').innerHTML = CH.map((c, i) => {
    const done = isPassed(i);
    const locked = !isUnlocked(i);
    const on = View.ch === i && View.name !== 'home' && View.name !== 'cert';
    const st = done ? LT('chDone') : locked ? LT('chLocked') : LT('chCurrent');
    const mark = done ? '✓' : locked ? '🔒' : i + 1;
    return `<button type="button" class="lp-item${done ? ' done' : ''}${locked ? ' locked' : ''}${on ? ' on' : ''}" data-ch="${i}">
      <span class="lp-item-idx">${mark}</span>
      <span class="lp-item-txt"><span class="lp-item-nm">${esc(X(c.title))}</span><span class="lp-item-st">${esc(st)}</span></span>
    </button>`;
  }).join('');
  $$('lpNavList').querySelectorAll('[data-ch]').forEach((b) => {
    b.onclick = () => gotoChapter(Number(b.dataset.ch));
  });
}

function gotoChapter(i) {
  if (!isUnlocked(i)) {
    alert(LT('chLockedHint'));
    return;
  }
  View.name = 'chapter';
  View.ch = i;
  Quiz = null;
  render();
}
function gotoHome() {
  View.name = 'home';
  Quiz = null;
  render();
}

// ── 总览页 ──
function renderHome() {
  const started = passedCount() > 0;
  const list = CH.map((c, i) => {
    const done = isPassed(i);
    const locked = !isUnlocked(i);
    return `<button type="button" class="lp-item${done ? ' done' : ''}${locked ? ' locked' : ''}" data-goch="${i}">
      <span class="lp-item-idx">${done ? '✓' : locked ? '🔒' : i + 1}</span>
      <span class="lp-item-txt">
        <span class="lp-item-nm">${esc(c.icon || '')} ${esc(X(c.title))}</span>
        <span class="lp-item-st">${esc(X(c.goal))}</span>
      </span>
    </button>`;
  }).join('');

  // 有没做完的答卷就顶到最上面，一眼能接着做（已判过卷的不算"没做完"）
  const s0 = loadQuiz();
  const saved = s0 && !s0.graded ? s0 : null;
  const resume = saved ? `<div class="lp-resume">
      <div class="lp-resume-tx">
        <b>${esc(LT('resumeTitle'))}</b>
        <span>${esc(LT('resumeMeta', {
          n: saved.chIdx + 1,
          title: X(CH[saved.chIdx].title),
          done: answeredCount(saved),
          total: saved.items.length,
        }))}</span>
      </div>
      <button type="button" class="primary" id="homeResume">${esc(LT('resumeGo'))}</button>
      <button type="button" id="homeResumeDrop">${esc(LT('resumeDrop'))}</button>
    </div>` : '';

  return `<div class="lp-wrap">
    <h1 class="lp-h1">${esc(LT('homeHi'))}</h1>
    ${resume}
    <div class="lp-card">${LT('homeIntro')}</div>
    <div class="lp-card">
      <h2>${esc(LT('chapters'))}</h2>
      ${list}
    </div>
    <div class="lp-foot">
      <button type="button" class="primary" id="homeGo">${esc(started ? LT('homeContinue') : LT('homeStart'))}</button>
      <span class="grow"></span>
      <button type="button" class="danger" id="homeReset">${esc(LT('homeReset'))}</button>
    </div>
  </div>`;
}

function wireHome() {
  document.querySelectorAll('[data-goch]').forEach((b) => {
    b.onclick = () => gotoChapter(Number(b.dataset.goch));
  });
  const go = $$('homeGo');
  if (go) {
    go.onclick = () => {
      const next = CH.findIndex((_, i) => !isPassed(i));
      gotoChapter(next < 0 ? CH.length - 1 : next);
    };
  }
  const rs = $$('homeReset');
  if (rs) {
    rs.onclick = () => {
      if (!confirm(LT('homeResetAsk'))) return;
      localStorage.removeItem(PROG_KEY);
      Quiz = null;
      clearSaved();
      gotoHome();
    };
  }
  const rg = $$('homeResume');
  if (rg) {
    rg.onclick = () => {
      const saved = loadQuiz();
      if (!saved) { gotoHome(); return; }
      Quiz = saved;
      View.name = saved.graded ? 'result' : 'quiz';
      View.ch = saved.chIdx;
      render();
      $$('lpBody').scrollTop = 0;
    };
  }
  const rd = $$('homeResumeDrop');
  if (rd) {
    rd.onclick = () => {
      if (!confirm(LT('resumeDropAsk'))) return;
      Quiz = null;
      localStorage.removeItem(QUIZ_KEY);
      gotoHome();
    };
  }
}

// ── 章节知识点 ──
function renderChapter(i) {
  const c = CH[i];
  const secs = (c.sections || []).map((s) =>
    `<div class="lp-card"><h2>${esc(applyEnv(X(s.h)))}</h2>${Fig(s.fig)}${applyEnv(X(s.body))}</div>`).join('');
  const terms = (c.terms || []).length
    ? `<div class="lp-card"><h2>${esc(LT('termsLabel'))}</h2><div class="lp-terms">${
        c.terms.map((t) => `<div class="lp-term"><div class="lp-term-k">${esc(X(t.k))}</div><div class="lp-term-d">${esc(X(t.d))}</div></div>`).join('')
      }</div></div>`
    : '';
  return `<div class="lp-wrap">
    <h1 class="lp-h1">${esc(c.icon || '')} ${esc(`${i + 1}. ${X(c.title)}`)}</h1>
    <p class="lp-lead">${esc(X(c.goal))}</p>
    <div class="lp-meta">
      <span class="lp-chip">${esc(LT('minutes', { n: c.minutes || 10 }))}</span>
      <span class="lp-chip">${esc(LT('qCount', { n: (c.quiz || []).length }))}</span>
      ${isPassed(i) ? `<span class="lp-chip ok">✓ ${esc(LT('chDone'))}</span>` : ''}
    </div>
    ${secs}
    ${terms}
    <div class="lp-foot">
      ${i > 0 ? `<button type="button" id="chPrev">${esc(LT('prevCh'))}</button>` : ''}
      <span class="grow"></span>
      <button type="button" class="primary" id="chQuiz">${esc(LT('toQuiz'))}</button>
    </div>
  </div>`;
}

function wireChapter(i) {
  if ($$('chPrev')) $$('chPrev').onclick = () => gotoChapter(i - 1);
  $$('chQuiz').onclick = () => startQuiz(i);
}

// ── 抽题 ──
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 有 Key 时保证至少抽到 1 道实操题（题库里有的话）；没 Key 时整体排除实操题
function drawQuiz(i) {
  const bank = CH[i].quiz || [];
  const practice = bank.filter((q) => q.t === 'practice');
  const normal = bank.filter((q) => q.t !== 'practice');
  let picked;
  if (Assist.hasKey() && practice.length) {
    const nP = Math.min(practice.length, Math.max(1, Math.round(PICK * practice.length / bank.length)));
    picked = shuffle(practice).slice(0, nP).concat(shuffle(normal).slice(0, PICK - nP));
  } else {
    picked = shuffle(normal).slice(0, PICK);
  }
  return shuffle(picked);
}

function startQuiz(i) {
  const items = drawQuiz(i);
  Quiz = {
    chIdx: i,
    items,
    answers: items.map((q) => (q.t === 'multi' ? [] : q.t === 'practice' ? '' : null)),
    results: [],
    graded: false,
    score: 0,
    grading: false,
    msg: '',
  };
  View.name = 'quiz';
  View.ch = i;
  render();
  $$('lpBody').scrollTop = 0;
}

// ── 测验渲染 ──
function typeLabel(t) {
  return { single: LT('tSingle'), multi: LT('tMulti'), judge: LT('tJudge'), practice: LT('tPractice') }[t] || t;
}

function renderQuiz() {
  const c = CH[Quiz.chIdx];
  const notice = Assist.hasKey() ? LT('quizPracticeOn') : LT('quizPracticeOff');
  const qs = Quiz.items.map((q, n) => renderQ(q, n)).join('');
  return `<div class="lp-wrap">
    <h1 class="lp-h1">${esc(`${Quiz.chIdx + 1}. ${X(c.title)}`)} — ${esc(LT('quizTitle'))}</h1>
    <p class="lp-lead">${LT('quizRule', { n: (c.quiz || []).length })} · ${esc(notice)}${
      attemptsOf(Quiz.chIdx) ? ` · ${esc(LT('attempts', { n: attemptsOf(Quiz.chIdx) + 1 }))}` : ''
    }</p>
    <p class="lp-autosave">💾 ${esc(LT('autosave'))}</p>
    ${qs}
    <div class="lp-submit-bar">
      <button type="button" class="primary" id="quizSubmit"${Quiz.grading ? ' disabled' : ''}>${
        esc(Quiz.grading ? LT('submitting') : LT('submit'))
      }</button>
      <button type="button" id="quizBack">${esc(LT('reread'))}</button>
      <span class="lp-submit-msg">${esc(Quiz.msg)}</span>
    </div>
  </div>`;
}

function renderQ(q, n) {
  const a = Quiz.answers[n];
  const head = `<div class="lp-q-head">
    <span class="lp-q-no">${esc(LT('qOf', { i: n + 1, n: Quiz.items.length }))}</span>
    <span class="lp-q-tag${q.t === 'practice' ? ' practice' : ''}">${esc(typeLabel(q.t))}</span>
    <button type="button" class="lp-q-ask" data-askq="${n}">${esc(LT('askAboutQ'))}</button>
  </div>`;
  const txt = `${Fig(q.fig)}<div class="lp-q-txt">${X(q.q)}</div>`;
  let body = '';

  if (q.t === 'single' || q.t === 'multi') {
    const keys = 'ABCDEFGH';
    body = (q.t === 'multi' ? `<p class="lp-hint">${esc(LT('multiHint'))}</p>` : '') +
      q.o.map((o, k) => {
        const sel = q.t === 'multi' ? a.indexOf(k) >= 0 : a === k;
        return `<button type="button" class="lp-opt${sel ? ' sel' : ''}" data-q="${n}" data-o="${k}">
          <span class="lp-opt-k">${keys[k]}</span><span>${X(o)}</span></button>`;
      }).join('');
  } else if (q.t === 'judge') {
    body = [true, false].map((v) => `<button type="button" class="lp-opt${a === v ? ' sel' : ''}" data-q="${n}" data-j="${v}">
      <span class="lp-opt-k">${v ? '✓' : '✕'}</span><span>${esc(v ? LT('judgeTrue') : LT('judgeFalse'))}</span></button>`).join('');
  } else {
    body = `<div class="lp-task"><span class="lp-lbl">${esc(LT('practiceTask'))}</span>${X(q.task)}</div>
      <p class="lp-hint">${esc(LT('practiceHow'))}</p>
      <textarea class="lp-pr-input" data-pr="${n}" placeholder="${esc(LT('practicePh'))}">${esc(a || '')}</textarea>`;
  }
  return `<div class="lp-q">${head}${txt}${body}</div>`;
}

function wireQuiz() {
  document.querySelectorAll('[data-o]').forEach((b) => {
    b.onclick = () => {
      const n = Number(b.dataset.q);
      const k = Number(b.dataset.o);
      const q = Quiz.items[n];
      if (q.t === 'multi') {
        const cur = Quiz.answers[n];
        const at = cur.indexOf(k);
        if (at >= 0) cur.splice(at, 1);
        else cur.push(k);
      } else {
        Quiz.answers[n] = k;
      }
      render();
    };
  });
  document.querySelectorAll('[data-j]').forEach((b) => {
    b.onclick = () => {
      Quiz.answers[Number(b.dataset.q)] = b.dataset.j === 'true';
      render();
    };
  });
  document.querySelectorAll('[data-pr]').forEach((t) => {
    // 实操题的长文本边打边存，不等提交（这里不重绘，否则光标会跳）
    t.oninput = () => { Quiz.answers[Number(t.dataset.pr)] = t.value; saveQuiz(); };
  });
  document.querySelectorAll('[data-askq]').forEach((b) => {
    b.onclick = () => {
      const q = Quiz.items[Number(b.dataset.askq)];
      const opts = q.o ? q.o.map((o, k) => `${'ABCDEFGH'[k]}. ${stripHtml(X(o))}`).join('\n') : '';
      Assist.setQuote(`${stripHtml(X(q.q))}${opts ? `\n${opts}` : ''}`);
      document.body.classList.remove('no-assist');
    };
  });
  $$('quizBack').onclick = () => gotoChapter(Quiz.chIdx);
  $$('quizSubmit').onclick = submitQuiz;
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

// ── 判卷 ──
function sameSet(a, b) {
  const x = a.slice().sort((m, n) => m - n).join(',');
  const y = b.slice().sort((m, n) => m - n).join(',');
  return x === y;
}

async function submitQuiz() {
  const missing = Quiz.items.reduce((n, q, i) => {
    const a = Quiz.answers[i];
    const empty = q.t === 'multi' ? a.length === 0 : q.t === 'practice' ? !String(a || '').trim() : a === null;
    return n + (empty ? 1 : 0);
  }, 0);
  if (missing > 0) {
    Quiz.msg = LT('unanswered', { n: missing });
    render();
    return;
  }
  Quiz.msg = '';
  Quiz.grading = true;
  render();

  const results = [];
  for (let i = 0; i < Quiz.items.length; i++) {
    const q = Quiz.items[i];
    const a = Quiz.answers[i];
    if (q.t === 'single') results.push({ ok: a === q.a });
    else if (q.t === 'judge') results.push({ ok: a === q.a });
    else if (q.t === 'multi') results.push({ ok: sameSet(a, q.a) });
    else {
      try {
        const g = await Assist.grade(stripHtml(X(q.task)), X(q.rubric), String(a));
        results.push({ ok: g.pass, score: g.score, feedback: g.feedback });
      } catch (e) {
        results.push({ ok: false, error: e.message });
      }
    }
  }

  Quiz.results = results;
  Quiz.graded = true;
  Quiz.grading = false;
  const right = results.filter((r) => r.ok).length;
  Quiz.score = Math.round((right / results.length) * 100);
  const passed = Quiz.score >= PASS;
  if (passed) markPassed(Quiz.chIdx);
  else markAttempt(Quiz.chIdx);
  View.name = 'result';
  render();
  $$('lpBody').scrollTop = 0;
  if (passed) confetti();
}

// ── 成绩页 ──
function renderResult() {
  const c = CH[Quiz.chIdx];
  const passed = Quiz.score >= PASS;
  const wrong = Quiz.results.filter((r) => !r.ok).length;
  const last = Quiz.chIdx === CH.length - 1;

  // 80 分即通过，所以通过时也可能有错题——错题解析一律展示，别让人带着错误认知过关
  const detail = wrong === 0 ? '' : `<h2 class="lp-review-h">${esc(LT('reviewWrong', { n: wrong }))}</h2>` +
    Quiz.items.map((q, n) => {
    const r = Quiz.results[n];
    if (r.ok) return '';
    return `<div class="lp-q wrong">
      <div class="lp-q-head">
        <span class="lp-q-no">${esc(LT('qOf', { i: n + 1, n: Quiz.items.length }))}</span>
        <span class="lp-q-tag${q.t === 'practice' ? ' practice' : ''}">${esc(typeLabel(q.t))}</span>
        <button type="button" class="lp-q-ask" data-askq2="${n}">${esc(LT('askAboutQ'))}</button>
      </div>
      ${Fig(q.fig)}<div class="lp-q-txt">${X(q.q)}</div>
      ${answerLines(q, n, r)}
      <div class="lp-why"><span class="lp-lbl">${esc(LT('whyLabel'))}</span>${X(q.e)}</div>
    </div>`;
  }).join('');

  const praise = passed
    ? `<div class="lp-praise">${X(c.praise)}</div>`
    : `<div class="lp-praise">${esc(LT('failHint', { n: PASS }))}</div>`;

  const nextBtn = passed
    ? (last
        ? `<button type="button" class="primary" id="resCert">${esc(LT('homeCert'))}</button>`
        : `<button type="button" class="primary" id="resNext">${esc(LT('praiseNext', { n: Quiz.chIdx + 2 }))}</button>`)
    : `<button type="button" class="primary" id="resRetry">${esc(LT('retry'))}</button>`;

  return `<div class="lp-wrap">
    <div class="lp-score ${passed ? 'pass' : 'fail'}">
      ${passed ? `<div class="lp-badge">${esc(c.icon || '🎉')}</div>` : ''}
      <div class="lp-score-num">${Quiz.score}</div>
      <div class="lp-score-lbl">${esc(LT('yourScore'))} · ${esc(passed ? LT('passed') : LT('failed'))}</div>
      ${passed ? `<h2 style="margin:14px 0 0">${esc(LT('praiseTitle', { n: Quiz.chIdx + 1 }))}</h2>` : ''}
      ${praise}
    </div>
    ${detail}
    <div class="lp-foot">
      ${nextBtn}
      <button type="button" id="resReread">${esc(LT('reread'))}</button>
      <span class="grow"></span>
      <button type="button" id="resHome">${esc(LT('praiseBackHome'))}</button>
    </div>
  </div>`;
}

function answerLines(q, n, r) {
  if (q.t === 'practice') {
    const s = r.error ? `⚠ ${r.error}` : LT('practiceScore', { s: r.score });
    return `<div class="lp-pr-state bad">${esc(s)}${r.feedback ? `\n${r.feedback}` : ''}</div>`;
  }
  const keys = 'ABCDEFGH';
  const fmt = (v) => {
    if (q.t === 'judge') return v ? LT('judgeTrue') : LT('judgeFalse');
    if (q.t === 'multi') return v.slice().sort((a, b) => a - b).map((k) => keys[k]).join(' + ');
    return keys[v];
  };
  const mine = Quiz.answers[n];
  const empty = q.t === 'multi' && mine.length === 0;
  return `<div class="lp-ans-line">${esc(LT('yourAnswer'))}: <b>${esc(empty ? '—' : fmt(mine))}</b> · ${
    esc(LT('correctLabel'))}: <b>${esc(fmt(q.a))}</b></div>`;
}

function wireResult() {
  if ($$('resNext')) $$('resNext').onclick = () => gotoChapter(Quiz.chIdx + 1);
  if ($$('resRetry')) $$('resRetry').onclick = () => startQuiz(Quiz.chIdx);
  if ($$('resCert')) $$('resCert').onclick = () => { View.name = 'cert'; render(); };
  $$('resReread').onclick = () => gotoChapter(Quiz.chIdx);
  $$('resHome').onclick = gotoHome;
  document.querySelectorAll('[data-askq2]').forEach((b) => {
    b.onclick = () => {
      const q = Quiz.items[Number(b.dataset.askq2)];
      Assist.setQuote(stripHtml(X(q.q)));
      document.body.classList.remove('no-assist');
    };
  });
}

// ── 结业证书 ──
function renderCert() {
  if (!allPassed()) {
    return `<div class="lp-wrap"><div class="lp-card"><p>${esc(LT('certLocked'))}</p></div></div>`;
  }
  const name = localStorage.getItem(CERT_KEY) || '';
  const date = new Date().toLocaleDateString(currentLang() === 'zh' ? 'zh-CN' : 'en-US');
  return `<div class="lp-wrap">
    <div class="lp-cert">
      <div class="lp-cert-top">CLOOTEE</div>
      <h1 class="lp-cert-h">${esc(LT('certTitle'))}</h1>
      <input class="lp-cert-name" id="certName" value="${esc(name)}" placeholder="${esc(LT('certNamePh'))}" />
      <div class="lp-cert-body">${esc(LT('certBody', { n: CH.length }))}</div>
      <div class="lp-cert-foot"><span>${esc(LT('certDate'))}: ${esc(date)}</span><span>Claude Code × MiniMax M3</span></div>
    </div>
    <div class="lp-foot">
      <button type="button" class="primary" id="certPrint">${esc(LT('certPrint'))}</button>
      <span class="grow"></span>
      <button type="button" id="certHome">${esc(LT('praiseBackHome'))}</button>
    </div>
  </div>`;
}

function wireCert() {
  if (!$$('certName')) return;
  $$('certName').oninput = () => localStorage.setItem(CERT_KEY, $$('certName').value);
  $$('certPrint').onclick = () => window.print();
  $$('certHome').onclick = gotoHome;
}

// ── 通关彩带 ──
function confetti() {
  const box = document.createElement('div');
  box.className = 'lp-confetti';
  const colors = ['#5b8cff', '#3fb950', '#d29922', '#f85149', '#a78bfa'];
  let html = '';
  for (let i = 0; i < 90; i++) {
    const left = Math.random() * 100;
    const dur = 2.2 + Math.random() * 1.8;
    const delay = Math.random() * 0.8;
    const c = colors[i % colors.length];
    html += `<i style="left:${left}%;background:${c};animation-duration:${dur}s;animation-delay:${delay}s"></i>`;
  }
  box.innerHTML = html;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 5200);
}

// ── 渲染总入口 ──
function render() {
  applyLearnTheme();
  // 每次重绘都顺手存档：答卷与当前位置都不会因为关页面而丢
  saveQuiz();
  saveView();
  renderTop();
  renderNav();
  const body = $$('lpBody');
  if (View.name === 'home') { body.innerHTML = renderHome(); wireHome(); }
  else if (View.name === 'chapter') { body.innerHTML = renderChapter(View.ch); wireChapter(View.ch); }
  else if (View.name === 'quiz') { body.innerHTML = renderQuiz(); wireQuiz(); }
  else if (View.name === 'result') { body.innerHTML = renderResult(); wireResult(); }
  else if (View.name === 'cert') { body.innerHTML = renderCert(); wireCert(); }
}

// 小助手感知的页面上下文：当前视图标题 + 正文纯文本（截断，避免把整章塞爆）
function pageContext() {
  const c = CH[View.ch];
  const titles = {
    home: LT('home'),
    chapter: `${View.ch + 1}. ${X(c?.title)}`,
    quiz: `${View.ch + 1}. ${X(c?.title)} — ${LT('quizTitle')}`,
    result: `${View.ch + 1}. ${X(c?.title)} — ${LT('yourScore')}`,
    cert: LT('certTitle'),
  };
  return { title: titles[View.name] || LT('pageTitle'), text: stripHtml($$('lpBody').innerHTML).slice(0, 6000) };
}

// 保存 Key 后重绘：抽题规则会从「排除实操题」变成「包含实操题」
function onAssistKeyChanged() {
  if (View.name === 'quiz' && !Quiz.graded) render();
}

// ── 选中文字 → 浮出「问小助手」 ──
function wireSelection() {
  const btn = $$('lpSelAsk');
  btn.textContent = LT('askSelection');
  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('.lp-assist') || e.target.id === 'lpSelAsk') return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? String(sel).trim() : '';
      if (text.length < 4) { btn.hidden = true; return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      btn.style.left = `${Math.max(8, Math.min(window.innerWidth - 150, rect.left))}px`;
      btn.style.top = `${Math.max(8, rect.top - 38)}px`;
      btn.hidden = false;
      btn.dataset.text = text;
    }, 10);
  });
  btn.onclick = () => {
    document.body.classList.remove('no-assist');
    Assist.setQuote(btn.dataset.text || '');
    btn.hidden = true;
  };
  document.addEventListener('mousedown', (e) => {
    if (e.target.id !== 'lpSelAsk') btn.hidden = true;
  });
}

// ── 启动 ──
function boot() {
  if (CH.length === 0) {
    $$('lpBody').innerHTML = '<div class="lp-wrap"><div class="lp-card"><p>章节内容未加载 / chapters failed to load</p></div></div>';
    return;
  }
  $$('lpBack').onclick = () => { location.href = 'index.html'; };
  $$('lpLangBtn').onclick = () => {
    localStorage.setItem('lang', currentLang() === 'zh' ? 'en' : 'zh');
    location.reload();
  };
  $$('lpAssistBtn').onclick = () => document.body.classList.toggle('no-assist');
  $$('lpNavHome').onclick = gotoHome;
  $$('lpNavCert').onclick = () => { View.name = 'cert'; render(); };

  Assist.ctxProvider = pageContext;
  Assist.init();
  wireSelection();
  restoreSession();
  render();
}

// 打开页面时回到上次的位置；正在做的答卷一起恢复。
// 存档对不上（题库改过、数据坏了）就静默退回章节页，绝不拿错数据往下跑。
function restoreSession() {
  const v = loadView();
  if (!v) return;
  if (v.name === 'quiz' || v.name === 'result') {
    const saved = loadQuiz();
    if (!saved || saved.chIdx !== v.ch) {
      View.name = CH[v.ch] ? 'chapter' : 'home';
      View.ch = v.ch;
      return;
    }
    Quiz = saved;
    View.name = saved.graded ? 'result' : 'quiz';
    View.ch = saved.chIdx;
    return;
  }
  if (v.name === 'cert' && !allPassed()) { View.name = 'home'; return; }
  if (v.name === 'chapter' && !isUnlocked(v.ch)) { View.name = 'home'; return; }
  View.name = v.name;
  View.ch = v.ch;
}

boot();
