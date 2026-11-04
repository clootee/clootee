// 教程右侧的 MiniMax 小助手：多会话聊天窗，能感知「当前在看哪一章」和「用户选中的文字」。
// 它同时兼任实操题的自动阅卷员。浏览器直连 MiniMax，不经过任何后端；Key 与会话都存 localStorage。
//
// 为什么要限制轮次：每问一次都要把这个会话之前的全部对话重发给模型，
// 所以轮次越多，单次请求越贵越慢（这正是第 6 章讲的上下文问题）。
// 20 轮红字提醒换会话，40 轮直接锁死输入——把课程里讲的道理做成产品约束。
const Assist = {
  KEY_K: 'learn.mm.key',
  KEY_M: 'learn.mm.model',
  KEY_B: 'learn.mm.base',
  KEY_C: 'learn.mm.convs',   // 全部会话
  KEY_CUR: 'learn.mm.cur',   // 当前会话 id
  DEF_MODEL: 'MiniMax-M3',
  DEF_BASE: 'https://api.minimaxi.com/v1',
  WARN_TURNS: 20,            // 到这个轮数开始红字提醒
  MAX_TURNS: 40,             // 到这个轮数不再允许提问
  MAX_CONVS: 20,             // 最多保留多少个会话（超出丢最旧的）

  convs: [],            // [{id, title, history:[{role,text,quote}], at}]
  curId: '',
  quote: '',            // 用户选中的、准备一起发出去的文字
  busy: false,
  ctxProvider: () => ({ title: '', text: '' }), // 由 learn.js 注入：当前页面上下文

  key() { return localStorage.getItem(this.KEY_K) || ''; },
  model() { return localStorage.getItem(this.KEY_M) || this.DEF_MODEL; },
  base() { return localStorage.getItem(this.KEY_B) || this.DEF_BASE; },
  hasKey() { return !!this.key(); },

  // ── 会话管理 ──
  loadConvs() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY_C) || '[]');
      this.convs = Array.isArray(raw) ? raw.filter((c) => c && c.id && Array.isArray(c.history)) : [];
    } catch {
      this.convs = [];
    }
    this.curId = localStorage.getItem(this.KEY_CUR) || '';
    if (!this.convs.length) this.newConv(true);
    else if (!this.convs.some((c) => c.id === this.curId)) this.curId = this.convs[0].id;
  },
  saveConvs() {
    if (this.convs.length > this.MAX_CONVS) this.convs = this.convs.slice(0, this.MAX_CONVS);
    localStorage.setItem(this.KEY_C, JSON.stringify(this.convs));
    localStorage.setItem(this.KEY_CUR, this.curId);
  },
  // 当前会话；理论上不会缺失，缺了就补一个空的，别让界面崩掉
  cur() {
    let c = this.convs.find((x) => x.id === this.curId);
    if (!c) { this.newConv(true); c = this.convs[0]; }
    return c;
  },
  // 已提问轮数 = 用户消息条数（报错不算一轮）
  turns(conv) {
    return (conv || this.cur()).history.filter((m) => m.role === 'user').length;
  },
  newConv(silent) {
    const id = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
    this.convs.unshift({ id, title: '', history: [], at: Date.now() });
    this.curId = id;
    this.quote = '';
    if (!silent) {
      this.saveConvs();
      this.renderAll();
      const p = document.getElementById('asConvs');
      if (p) p.hidden = true;
      this.nudgeInput('asNewReady');
    }
  },
  switchConv(id) {
    if (!this.convs.some((c) => c.id === id)) return;
    this.curId = id;
    this.quote = '';
    this.saveConvs();
    document.getElementById('asConvs').hidden = true;
    this.renderAll();
  },
  delConv(id) {
    const at = this.convs.findIndex((c) => c.id === id);
    if (at < 0) return;
    this.convs.splice(at, 1);
    if (!this.convs.length) this.newConv(true);
    else if (this.curId === id) this.curId = this.convs[0].id;
    this.saveConvs();
    this.renderAll();
  },
  // 会话标题取第一句提问，超长截断；没提问过就叫「新会话」
  convTitle(c) {
    if (c.title) return c.title;
    const first = c.history.find((m) => m.role === 'user');
    if (!first) return LT('asConvNew');
    const t = String(first.text).replace(/\s+/g, ' ').trim();
    return t.length > 18 ? `${t.slice(0, 18)}…` : t;
  },

  // ── 底层：一次问答 ──
  // 直接从浏览器调 MiniMax（官方接口已放行 CORS），**不经过 Clootee 后端**。
  // 这样教程是一个纯静态页：没有额外端口、没有额外服务，也永远不需要重启什么东西才能用。
  async call(messages, temperature) {
    const key = this.key();
    if (!key) throw new Error(LT('asNoKey'));
    const url = `${this.base().replace(/\/+$/, '')}/chat/completions`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: this.model(),
          messages,
          temperature: typeof temperature === 'number' ? temperature : 0.3,
          max_tokens: 4096,
          stream: false,
        }),
      });
    } catch (e) {
      // 网络不通 / 被拦截时 fetch 直接抛，这里给出能定位的地址
      throw new Error(LT('asNetFail', { url, e: e.message }));
    }
    const raw = await res.text();
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      /* 保留 raw 供报错展示 */
    }
    // MiniMax 的业务错误码在 base_resp 里，HTTP 仍可能是 200
    const br = json && json.base_resp;
    if (br && Number(br.status_code) !== 0) {
      throw new Error(`MiniMax ${br.status_code}: ${br.status_msg || 'unknown'}`);
    }
    if (!res.ok) {
      const msg = (json && ((json.error && json.error.message) || json.message)) || raw.slice(0, 200);
      throw new Error(`MiniMax HTTP ${res.status}: ${msg}`);
    }
    const text = this.pickText(json);
    if (!text) throw new Error(`MiniMax 返回空内容 / empty reply: ${raw.slice(0, 200)}`);
    return text;
  },

  // 取正文；M3 会把推理过程以 <think>…</think> 内联在 content 里，学员不需要看，去掉
  pickText(json) {
    const msg = json && json.choices && json.choices[0] && json.choices[0].message;
    const c = msg ? msg.content : '';
    let s = Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? x : (x && x.text) || '')).join('') : String(c || '');
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (/<think>/i.test(s)) s = s.replace(/<think>[\s\S]*$/i, ''); // 未闭合：其后全是推理
    return s.replace(/<\/think>/gi, '').trim();
  },

  // ── 聊天 ──
  systemPrompt() {
    const ctx = this.ctxProvider() || {};
    const zh = currentLang() === 'zh';
    const rules = zh
      ? `你是 Clootee 小白教程的学习助手。学员是完全零基础的职场人（不会编程）。
规则：
1. 用大白话解释，能打比方就打比方；一次只讲清一件事。
2. 涉及操作时，给「在 Clootee 里点哪里、输入什么」的具体步骤。
3. 不确定的事直说不确定，不要编造 Clootee 里不存在的按钮或功能。
4. 回答控制在 300 字以内，除非学员要求展开。
5. 用中文回答。`
      : `You are the study assistant for the Clootee beginner course. The learner is an office worker with zero coding background.
Rules:
1. Explain in plain words, use analogies, one idea at a time.
2. For anything hands-on, give concrete steps: what to click in Clootee, what to type.
3. If you are not sure, say so. Never invent buttons or features that do not exist in Clootee.
4. Keep answers under 250 words unless asked to go deeper.
5. Answer in English.`;
    const page = ctx.text
      ? (zh ? `\n\n【学员当前正在看的页面】\n标题：${ctx.title}\n正文节选：\n${ctx.text}` :
              `\n\n[The page the learner is currently on]\nTitle: ${ctx.title}\nExcerpt:\n${ctx.text}`)
      : '';
    return rules + page;
  },

  async ask(text) {
    if (this.busy) return;
    const q = String(text || '').trim();
    if (!q) return;
    const conv = this.cur();
    // 硬上限：到了就只能开新会话，不再往这个会话里加
    if (this.turns(conv) >= this.MAX_TURNS) {
      this.renderWarn();
      return;
    }
    if (!this.hasKey()) {
      conv.history.push({ role: 'err', text: LT('asNoKey') });
      this.saveConvs();
      this.render();
      this.openSettings(true);
      return;
    }
    const quote = this.quote;
    conv.history.push({ role: 'user', text: q, quote });
    conv.at = Date.now();
    this.quote = '';
    this.busy = true;
    this.saveConvs();
    this.renderAll();

    const msgs = [{ role: 'system', content: this.systemPrompt() }];
    conv.history.filter((m) => m.role === 'user' || m.role === 'assistant').forEach((m) => {
      const body = m.quote
        ? (currentLang() === 'zh' ? `我选中了这段话：\n「${m.quote}」\n\n我的问题：${m.text}`
                                  : `I selected this text:\n"${m.quote}"\n\nMy question: ${m.text}`)
        : m.text;
      msgs.push({ role: m.role, content: body });
    });

    try {
      const out = await this.call(msgs, 0.4);
      conv.history.push({ role: 'assistant', text: out });
    } catch (e) {
      conv.history.push({ role: 'err', text: LT('asFail', { e: e.message }) });
    }
    this.busy = false;
    this.saveConvs();
    this.renderAll();
  },

  // ── 实操题阅卷 ──
  // 返回 {score:0-100, pass:bool, feedback:string}；调用失败时抛出，由上层如实展示
  async grade(task, rubric, answer) {
    const zh = currentLang() === 'zh';
    const sys = zh
      ? `你是编程教学的阅卷老师，正在给零基础学员的「实操题」打分。学员在 Clootee 里用 Claude Code 完成任务后，把自己发的指令和拿到的结果粘贴上来。
评分要求：
- 只按评分要点判断，不要额外加戏；学员做法与参考不同但达成同样目标的，同样给分。
- 学员明显没做（空话、复制题目、编造结果）判 0 分。
- 反馈必须具体：指出缺了哪一条要点、下次怎么改。
只输出 JSON，不要任何多余文字，格式：{"score": 0-100 的整数, "feedback": "中文反馈，80 字以内"}`
      : `You grade hands-on exercises for absolute beginners learning Claude Code inside Clootee. The learner pastes the instruction they gave and the result they got.
Grading rules:
- Judge only against the listed criteria. A different approach that reaches the same goal still scores full marks.
- Score 0 if they clearly did not do it (empty talk, copying the prompt back, fabricated output).
- Feedback must be concrete: which criterion is missing and how to fix it next time.
Output JSON only, no extra text: {"score": integer 0-100, "feedback": "under 60 words"}`;
    const user = zh
      ? `【题目】\n${task}\n\n【评分要点】\n${rubric}\n\n【学员提交】\n${answer}`
      : `[Task]\n${task}\n\n[Criteria]\n${rubric}\n\n[Learner submission]\n${answer}`;
    const raw = await this.call([{ role: 'system', content: sys }, { role: 'user', content: user }], 0.1);
    const parsed = this.parseJson(raw);
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    if (!Number.isFinite(score)) throw new Error(`阅卷返回无法解析：${raw.slice(0, 200)}`);
    return { score, pass: score >= 80, feedback: String(parsed.feedback || '').trim() };
  },

  // 模型偶尔会把 JSON 包在 ``` 里或前后带话，这里宽容地抠出第一个对象
  parseJson(raw) {
    const s = String(raw || '');
    const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : s;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error(`阅卷返回无法解析：${s.slice(0, 200)}`);
    try {
      return JSON.parse(body.slice(start, end + 1));
    } catch (e) {
      throw new Error(`阅卷返回无法解析：${s.slice(0, 200)}`);
    }
  },

  // ── 渲染 ──
  esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },
  // 极简 markdown：**粗体**、`行内代码`、### 小标题；其余靠 white-space:pre-wrap 保留换行
  md(s) {
    return this.esc(s)
      .replace(/^###?\s*(.+)$/gm, '<b>$1</b>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  },
  // 一次刷新聊天区 + 会话列表 + 副标题 + 轮次告警
  renderAll() {
    this.render();
    this.renderConvs();
    this.renderSub();
    this.renderWarn();
  },
  render() {
    const log = document.getElementById('asLog');
    if (!log) return;
    const hist = this.cur().history;
    if (hist.length === 0 && !this.busy) {
      log.innerHTML = `<div class="as-empty">${this.esc(LT('asEmpty'))}</div>`;
      return;
    }
    const rows = hist.map((m, i) => {
      const cls = m.role === 'user' ? 'me' : m.role === 'err' ? 'err' : '';
      const who = m.role === 'user' ? (currentLang() === 'zh' ? '我' : 'You') : 'MiniMax';
      const quote = m.quote ? `<div class="as-quote">“${this.esc(m.quote)}”</div>` : '';
      const copy = m.role === 'assistant'
        ? `<button type="button" class="as-copy" data-copy="${i}">${this.esc(LT('asCopy'))}</button>` : '';
      return `<div class="as-msg ${cls}"><div class="as-who">${who}</div>${quote}<div class="as-bubble">${this.md(m.text)}</div>${copy}</div>`;
    });
    if (this.busy) rows.push(`<div class="as-msg"><div class="as-who">MiniMax</div><div class="as-bubble">${this.esc(LT('asThinking'))}</div></div>`);
    log.innerHTML = rows.join('');
    log.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = () => {
        navigator.clipboard.writeText(hist[Number(b.dataset.copy)].text);
        b.textContent = LT('asCopied');
      };
    });
    log.scrollTop = log.scrollHeight;
  },

  // 副标题：当前会话名 + 已用轮次，超过警戒线标红
  renderSub() {
    const el = document.getElementById('asSub');
    if (!el) return;
    const n = this.turns();
    el.textContent = LT('asSubLine', { title: this.convTitle(this.cur()), n, max: this.MAX_TURNS });
    el.classList.toggle('hot', n >= this.WARN_TURNS);
  },

  // 会话列表
  renderConvs() {
    const box = document.getElementById('asConvsList');
    if (!box) return;
    document.getElementById('asConvsTitle').textContent = LT('asConvsTitle');
    box.innerHTML = this.convs.map((c) => {
      const n = this.turns(c);
      return `<div class="as-conv${c.id === this.curId ? ' on' : ''}" data-conv="${c.id}">
        <span class="as-conv-nm">${this.esc(this.convTitle(c))}</span>
        <span class="as-conv-n${n >= this.WARN_TURNS ? ' hot' : ''}">${this.esc(LT('asConvTurns', { n }))}</span>
        <button type="button" class="as-conv-x" data-del="${c.id}" title="${this.esc(LT('asConvDel'))}">✕</button>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-conv]').forEach((el) => {
      el.onclick = (e) => {
        if (e.target.dataset.del) return;
        this.switchConv(el.dataset.conv);
      };
    });
    box.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        if (confirm(LT('asConvDelAsk'))) this.delConv(b.dataset.del);
      };
    });
  },

  // 轮次告警：>=20 红字建议换会话，>=40 锁死输入
  renderWarn() {
    const bar = document.getElementById('asWarn');
    const ta = document.getElementById('asInput');
    const send = document.getElementById('asSendBtn');
    if (!bar) return;
    const n = this.turns();
    const maxed = n >= this.MAX_TURNS;
    const warn = n >= this.WARN_TURNS;
    bar.hidden = !warn;
    bar.classList.toggle('maxed', maxed);
    if (warn) {
      bar.innerHTML = `<span>${this.esc(maxed ? LT('asWarnMax', { max: this.MAX_TURNS }) : LT('asWarnLong', { n }))}</span>
        <button type="button" id="asWarnNew">${this.esc(LT('asWarnNewBtn'))}</button>`;
      const b = document.getElementById('asWarnNew');
      if (b) b.onclick = () => this.newConv();
    }
    if (ta) {
      ta.disabled = maxed;
      ta.placeholder = maxed ? LT('asWarnMax', { max: this.MAX_TURNS }) : LT('asPh');
    }
    if (send) send.disabled = maxed;
  },
  renderCtx() {
    const bar = document.getElementById('asCtx');
    if (!bar) return;
    bar.hidden = !this.quote;
    if (this.quote) {
      document.getElementById('asCtxTxt').textContent = `“${this.quote.slice(0, 90)}${this.quote.length > 90 ? '…' : ''}”`;
      document.getElementById('asCtxDrop').textContent = LT('asDropSel');
    }
  },
  // 把学员的注意力引到输入框：气泡 + 输入框高亮 + 聚焦。
  // 单纯 focus() 太隐蔽——「已经是新会话」时点＋不该再开一个空会话，
  // 但也不能毫无反应，否则学员会以为按钮坏了。
  nudgeInput(key) {
    const ta = document.getElementById('asInput');
    const tip = document.getElementById('asTip');
    if (!ta || !tip) return;
    clearTimeout(this._tipHide);
    clearTimeout(this._tipGone);
    tip.textContent = LT(key);
    tip.hidden = false;
    tip.classList.remove('out');
    void tip.offsetWidth;          // 重启动画：连点两次也要每次都看得见
    ta.classList.remove('nudge');
    void ta.offsetWidth;
    ta.classList.add('nudge');
    if (!ta.disabled) ta.focus();
    this._tipHide = setTimeout(() => {
      tip.classList.add('out');
      this._tipGone = setTimeout(() => { tip.hidden = true; tip.classList.remove('out'); }, 240);
    }, 2800);
  },

  setQuote(text) {
    this.quote = String(text || '').trim().slice(0, 2000);
    this.renderCtx();
    document.getElementById('asInput').focus();
  },
  openSettings(open) {
    document.getElementById('asSettings').hidden = !open;
  },

  applyText() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('asTitle', LT('asTitle'));
    set('asKeyLabel', LT('asKeyLabel'));
    set('asModelLabel', LT('asModelLabel'));
    set('asBaseLabel', LT('asBaseLabel'));
    set('asSaveBtn', LT('asSave'));
    set('asGetKey', LT('asGetKey'));
    set('asKeyNote', LT('asKeyNote'));
    set('asSendBtn', LT('asSend'));
    document.getElementById('asKey').placeholder = LT('asKeyPh');
    document.getElementById('asNewBtn').title = LT('asNew');
    document.getElementById('asListBtn').title = LT('asListBtn');
    document.getElementById('asSettingsBtn').title = LT('asSettings');
    this.renderAll();
    this.renderCtx();
  },

  init() {
    this.loadConvs();
    document.getElementById('asKey').value = this.key();
    document.getElementById('asModel').value = this.model();
    document.getElementById('asBase').value = this.base();
    if (!this.hasKey()) this.openSettings(true);

    document.getElementById('asSettingsBtn').onclick = () => {
      const p = document.getElementById('asSettings');
      p.hidden = !p.hidden;
    };
    document.getElementById('asSaveBtn').onclick = () => {
      localStorage.setItem(this.KEY_K, document.getElementById('asKey').value.trim());
      localStorage.setItem(this.KEY_M, document.getElementById('asModel').value.trim() || this.DEF_MODEL);
      localStorage.setItem(this.KEY_B, document.getElementById('asBase').value.trim() || this.DEF_BASE);
      const b = document.getElementById('asSaveBtn');
      b.textContent = LT('asSaved');
      setTimeout(() => (b.textContent = LT('asSave')), 1500);
      this.openSettings(false);
      if (typeof onAssistKeyChanged === 'function') onAssistKeyChanged();
    };
    document.getElementById('asNewBtn').onclick = () => {
      // 当前会话还是空的：再开一个只会多出一个同名空会话，看起来像「点了没反应」
      if (!this.cur().history.length) this.nudgeInput('asAlreadyNew');
      else this.newConv();
    };
    document.getElementById('asListBtn').onclick = () => {
      const p = document.getElementById('asConvs');
      if (p.hidden) { this.renderConvs(); p.hidden = false; } else p.hidden = true;
    };
    document.getElementById('asCtxDrop').onclick = () => { this.quote = ''; this.renderCtx(); };
    const send = () => {
      const ta = document.getElementById('asInput');
      const v = ta.value;
      ta.value = '';
      this.ask(v);
    };
    document.getElementById('asSendBtn').onclick = send;
    document.getElementById('asInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    this.applyText();
  },
};
