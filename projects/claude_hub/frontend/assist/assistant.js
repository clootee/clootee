/*!
 * xfeixie-assistant —— 可嵌进任意网页的 AI 学习小助手（单文件、零依赖、无后端）
 *
 * 用法：在网页 </body> 之前加这一行就行
 *   <script src="https://learn.xfeixie.com/assist/assistant.js"></script>
 *
 * 它会自己在页面右侧插一个侧栏，自带样式，不依赖任何框架。
 * 浏览器直连 MiniMax（官方接口已放行 CORS），API Key 由使用者自己填、只存在本地浏览器。
 *
 * 可选配置（写在引入之前）：
 *   <script>window.XFAssistant = { title:'学习小助手', subject:'GEO', lang:'zh', accent:'#5b8cff' };</script>
 *
 * 给 AI 读的接入文档：https://learn.xfeixie.com/assist/docs.md
 */
(function () {
  'use strict';
  if (window.__xfAssistLoaded) return;
  window.__xfAssistLoaded = true;

  var CFG = window.XFAssistant || {};
  var LANG = CFG.lang || ((navigator.language || 'zh').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en');
  var ACCENT = CFG.accent || '#5b8cff';
  var SUBJECT = CFG.subject || '';
  var DEF_MODEL = CFG.model || 'MiniMax-M3';
  var DEF_BASE = CFG.baseUrl || 'https://api.minimaxi.com/v1';
  // 每问一次都会把整个会话历史重发给模型，轮次越多越贵越慢，所以设两道闸
  var WARN_TURNS = 20, MAX_TURNS = 40, MAX_CONVS = 20;
  // 每个页面各存各的会话，互不串台
  var NS = 'xfa.' + (CFG.storageKey || location.pathname.replace(/[^\w]/g, '_').slice(0, 40));

  var DICT = {
    zh: {
      sub: '浏览器直连 MiniMax · 能看见这一页',
      open: '💬 小助手', close: '收起', neu: '新会话', list: '会话列表', set: '设置',
      convs: '会话列表 —— 一个话题一个会话', convNew: '新会话', turns: '{n} 轮', del: '删除',
      delAsk: '删除这个会话？删了就找不回来了。', subLine: '{t} · 第 {n}/{m} 轮',
      keyLabel: 'MiniMax API Key', keyPh: '粘贴你的 Key —— 只存在这个浏览器里',
      modelLabel: '模型', baseLabel: 'API 地址', save: '保存', saved: '已保存 ✓',
      getKey: '去哪儿领 Key？↗',
      note: '小助手是可选的，不填 Key 也能看完整个教程。本页直接从你的浏览器调用 MiniMax，不经过任何中间服务；Key 只存在这个浏览器里，也只发给 MiniMax。',
      empty: '这一页有什么不懂的都能问我。\n\n试试：用鼠标选中页面上任意一段文字，会浮出「问小助手」。\n或者直接问：「用大白话再讲一遍」「结合我的工作举个例子」。',
      ph: '有什么不明白的…（Enter 发送，Shift+Enter 换行）', send: '发送', thinking: '正在思考…',
      noKey: '请先填写 MiniMax API Key —— 点上方的 ⚙。', ask: '💬 问小助手', drop: '移除',
      copy: '复制', copied: '已复制', fail: '请求失败：{e}',
      netFail: '连不上 {u}，请检查网络或代理。（{e}）',
      warnLong: '这个会话已经 {n} 轮了。每问一次都会把之前所有对话重发一遍，越聊越慢越贵——建议开个新会话。',
      warnMax: '已达 {m} 轮上限。开一个新会话就能继续问。', warnNew: '开新会话 →',
      me: '我'
    },
    en: {
      sub: 'MiniMax, straight from your browser',
      open: '💬 Assistant', close: 'Hide', neu: 'New chat', list: 'All chats', set: 'Settings',
      convs: 'CHATS — one topic per chat', convNew: 'New chat', turns: '{n} turns', del: 'delete',
      delAsk: 'Delete this chat? It cannot be undone.', subLine: '{t} · turn {n}/{m}',
      keyLabel: 'MiniMax API Key', keyPh: 'Paste your key — stored only in this browser',
      modelLabel: 'Model', baseLabel: 'API base URL', save: 'Save', saved: 'Saved ✓',
      getKey: 'Where do I get a key? ↗',
      note: 'The assistant is optional — the page works fully without it. It calls MiniMax directly from your browser with no service in between; the key is stored only here and sent only to MiniMax.',
      empty: 'Ask me anything about this page.\n\nTry: select any text on the page and an "Ask" button pops up.\nOr just ask: "explain this in plain words", "give me an example from my job".',
      ph: 'Ask a question…  (Enter to send, Shift+Enter for a new line)', send: 'Send', thinking: 'Thinking…',
      noKey: 'Add a MiniMax API key first — click the gear above.', ask: '💬 Ask the assistant', drop: 'remove',
      copy: 'Copy', copied: 'Copied', fail: 'Request failed: {e}',
      netFail: 'Cannot reach {u} — check your network or proxy. ({e})',
      warnLong: 'This chat is {n} turns long. Every turn resends the whole history, so it keeps getting slower and more expensive — start a new chat.',
      warnMax: 'Limit reached ({m} turns). Start a new chat to keep going.', warnNew: 'New chat →',
      me: 'You'
    }
  };
  var T = DICT[LANG] || DICT.zh;
  T.title = CFG.title || (LANG === 'zh' ? '学习小助手' : 'Study assistant');

  function t(k, v) {
    var s = T[k] == null ? k : T[k];
    if (v) for (var p in v) s = s.split('{' + p + '}').join(String(v[p]));
    return s;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function ls(k, d) {
    try { var v = localStorage.getItem(NS + '.' + k); return v === null ? d : v; } catch (e) { return d; }
  }
  function lsSet(k, v) { try { localStorage.setItem(NS + '.' + k, v); } catch (e) { /* 隐私模式下写不了，忽略 */ } }
  function byId(id) { return document.getElementById(id); }

  // ── 状态 ──
  var convs = [], curId = '', quote = '', busy = false;

  function loadConvs() {
    try {
      var raw = JSON.parse(ls('convs', '[]'));
      convs = Object.prototype.toString.call(raw) === '[object Array]'
        ? raw.filter(function (c) { return c && c.id && Object.prototype.toString.call(c.history) === '[object Array]'; })
        : [];
    } catch (e) { convs = []; }
    curId = ls('cur', '');
    var found = false;
    for (var i = 0; i < convs.length; i++) if (convs[i].id === curId) found = true;
    if (!convs.length) newConv(true);
    else if (!found) curId = convs[0].id;
  }
  function saveConvs() {
    if (convs.length > MAX_CONVS) convs = convs.slice(0, MAX_CONVS);
    lsSet('convs', JSON.stringify(convs));
    lsSet('cur', curId);
  }
  function cur() {
    for (var i = 0; i < convs.length; i++) if (convs[i].id === curId) return convs[i];
    newConv(true);
    return convs[0];
  }
  function turns(c) {
    var h = (c || cur()).history, n = 0;
    for (var i = 0; i < h.length; i++) if (h[i].role === 'user') n++;
    return n;
  }
  function newConv(silent) {
    var id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    convs.unshift({ id: id, title: '', history: [], at: Date.now() });
    curId = id;
    quote = '';
    if (!silent) {
      saveConvs();
      renderAll();
      byId('xfa-convs').style.display = 'none';
      byId('xfa-input').focus();
    }
  }
  // 会话标题取第一句提问，截断
  function convTitle(c) {
    if (c.title) return c.title;
    for (var i = 0; i < c.history.length; i++) {
      if (c.history[i].role !== 'user') continue;
      var s = String(c.history[i].text).replace(/\s+/g, ' ').trim();
      return s.length > 16 ? s.slice(0, 16) + '…' : s;
    }
    return t('convNew');
  }

  // ── 调 MiniMax ──
  function key() { return ls('key', ''); }
  function model() { return ls('model', DEF_MODEL); }
  function base() { return ls('base', DEF_BASE); }

  // 取正文；M3 会把推理过程以 <think>…</think> 内联在 content 里，读者不需要看
  function pickText(json) {
    var ch = json && json.choices && json.choices[0];
    var c = ch && ch.message ? ch.message.content : '';
    var s = Object.prototype.toString.call(c) === '[object Array]'
      ? c.map(function (x) { return typeof x === 'string' ? x : (x && x.text) || ''; }).join('')
      : String(c || '');
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (/<think>/i.test(s)) s = s.replace(/<think>[\s\S]*$/i, '');
    return s.replace(/<\/think>/gi, '').trim();
  }

  function call(messages, temperature) {
    var k = key();
    if (!k) return Promise.reject(new Error(t('noKey')));
    var url = base().replace(/\/+$/, '') + '/chat/completions';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + k },
      body: JSON.stringify({
        model: model(), messages: messages,
        temperature: temperature == null ? 0.4 : temperature,
        max_tokens: 4096, stream: false
      })
    }).catch(function (e) {
      // 网络不通 / 被拦截时 fetch 直接抛，报错里带上目标地址方便定位
      throw new Error(t('netFail', { u: url, e: e.message }));
    }).then(function (res) {
      return res.text().then(function (raw) {
        var json = null;
        try { json = JSON.parse(raw); } catch (e) { /* 保留 raw 供报错展示 */ }
        // MiniMax 的业务错误码在 base_resp 里，HTTP 仍可能是 200
        var br = json && json.base_resp;
        if (br && Number(br.status_code) !== 0) {
          throw new Error('MiniMax ' + br.status_code + ': ' + (br.status_msg || 'unknown'));
        }
        if (!res.ok) {
          var m = (json && ((json.error && json.error.message) || json.message)) || raw.slice(0, 200);
          throw new Error('MiniMax HTTP ' + res.status + ': ' + m);
        }
        var txt = pickText(json);
        if (!txt) throw new Error('MiniMax empty reply: ' + raw.slice(0, 200));
        return txt;
      });
    });
  }

  // 整页可见：把正文纯文本一起给模型，它才能回答「这一段是什么意思」
  function pageText() {
    var main = document.querySelector('main, article, .content, #content') || document.body;
    var clone = main.cloneNode(true);
    var kill = clone.querySelectorAll('#xfa-root, #xfa-toggle, #xfa-sel, script, style, noscript');
    for (var i = 0; i < kill.length; i++) kill[i].parentNode.removeChild(kill[i]);
    return (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
  }
  function sysPrompt() {
    var zh = LANG === 'zh';
    var rules = zh
      ? '你是这个网页教程的学习助手。读者是零基础的初学者。\n规则：\n1. 用大白话解释，能打比方就打比方；一次只讲清一件事。\n2. 不确定的事直说不确定，不要编造页面上没有的内容。\n3. 回答控制在 300 字以内，除非对方要求展开。\n4. 用中文回答。'
      : 'You are the study assistant for this web tutorial. The reader is a complete beginner.\nRules:\n1. Explain in plain words, use analogies, one idea at a time.\n2. If unsure, say so. Never invent content that is not on the page.\n3. Keep answers under 250 words unless asked to go deeper.\n4. Answer in English.';
    if (SUBJECT) rules += (zh ? '\n5. 本页主题：' : '\n5. Page topic: ') + SUBJECT;
    var body = pageText();
    if (body) {
      rules += (zh ? '\n\n【读者当前正在看的页面】\n标题：' : '\n\n[The page the reader is on]\nTitle: ')
        + document.title + (zh ? '\n正文节选：\n' : '\nExcerpt:\n') + body;
    }
    return rules;
  }

  function ask(text) {
    if (busy) return;
    var q = String(text || '').trim();
    if (!q) return;
    var c = cur();
    // 硬上限：到了就只能开新会话
    if (turns(c) >= MAX_TURNS) { renderWarn(); return; }
    if (!key()) {
      c.history.push({ role: 'err', text: t('noKey') });
      saveConvs(); render(); showSettings(true);
      return;
    }
    c.history.push({ role: 'user', text: q, quote: quote });
    c.at = Date.now();
    quote = '';
    busy = true;
    saveConvs(); renderAll(); renderCtx();

    var msgs = [{ role: 'system', content: sysPrompt() }];
    for (var i = 0; i < c.history.length; i++) {
      var m = c.history[i];
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      var b = m.quote
        ? (LANG === 'zh'
            ? '我选中了这段话：\n「' + m.quote + '」\n\n我的问题：' + m.text
            : 'I selected this text:\n"' + m.quote + '"\n\nMy question: ' + m.text)
        : m.text;
      msgs.push({ role: m.role, content: b });
    }

    call(msgs, 0.4).then(function (out) {
      c.history.push({ role: 'assistant', text: out });
    }, function (e) {
      c.history.push({ role: 'err', text: t('fail', { e: e.message }) });
    }).then(function () {
      busy = false;
      saveConvs();
      renderAll();
    });
  }

  // ── 样式（自带，不污染宿主页面的类名）──
  var CSS = [
    '#xfa-root{--xfa-ac:' + ACCENT + ';position:fixed;top:0;right:0;bottom:0;width:372px;z-index:2147483000;',
    'display:flex;flex-direction:column;background:#171a21;color:#e6e8ec;border-left:1px solid #2a2f3a;',
    'font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;',
    'transform:translateX(0);transition:transform .22s ease}',
    '#xfa-root.xfa-hidden{transform:translateX(100%)}',
    '#xfa-root *{box-sizing:border-box}',
    '#xfa-toggle{position:fixed;top:14px;right:14px;z-index:2147483001;padding:8px 14px;border-radius:8px;',
    'background:' + ACCENT + ';color:#fff;border:none;cursor:pointer;font-size:13px;box-shadow:0 6px 18px rgba(0,0,0,.3)}',
    '#xfa-root button{font-family:inherit;font-size:13px;color:#e6e8ec;background:#1f2430;border:1px solid #2a2f3a;',
    'border-radius:8px;padding:6px 10px;cursor:pointer}',
    '#xfa-root button:hover{background:#2a3040}',
    '#xfa-root button.pri{background:var(--xfa-ac);border-color:var(--xfa-ac);color:#fff}',
    '#xfa-root button:disabled{opacity:.4;cursor:not-allowed}',
    '#xfa-root input,#xfa-root textarea{width:100%;font-family:inherit;font-size:13px;color:#e6e8ec;',
    'background:#1f2430;border:1px solid #2a2f3a;border-radius:8px;padding:7px 9px;outline:none}',
    '.xfa-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #2a2f3a}',
    '.xfa-tt{font-size:14px}',
    '.xfa-sub{font-size:11px;color:#8b93a3;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.xfa-sub.hot{color:#f85149}',
    '.xfa-hb{margin-left:auto;display:flex;gap:6px;flex:none}',
    '.xfa-hb button{padding:5px 9px}',
    '.xfa-panel{border-bottom:1px solid #2a2f3a;background:#1f2430;padding:11px 13px;max-height:250px;overflow:auto}',
    '.xfa-panel label{display:block;font-size:11px;color:#8b93a3;margin:8px 0 4px}',
    '.xfa-panel label:first-child{margin-top:0}',
    '.xfa-row{display:flex;align-items:center;gap:10px;margin-top:11px}',
    '.xfa-row a{font-size:12px;color:var(--xfa-ac);text-decoration:none}',
    '.xfa-note{font-size:11px;color:#8b93a3;line-height:1.6;margin:10px 0 0}',
    '.xfa-ct{font-size:10.5px;letter-spacing:.5px;color:#8b93a3;margin-bottom:8px}',
    '.xfa-cv{display:flex;align-items:center;gap:8px;padding:7px 9px;margin-bottom:5px;border-radius:8px;',
    'background:#171a21;border:1px solid #2a2f3a;cursor:pointer}',
    '.xfa-cv.on{border-color:var(--xfa-ac);background:#243049}',
    '.xfa-cv-n{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.xfa-cv-t{flex:none;font-size:11px;color:#8b93a3}.xfa-cv-t.hot{color:#f85149}',
    '.xfa-cv-x{flex:none;padding:1px 6px;font-size:11px;background:none;border:none;color:#8b93a3}',
    '.xfa-log{flex:1;min-height:0;overflow-y:auto;padding:14px}',
    '.xfa-empty{font-size:12.5px;color:#8b93a3;line-height:1.8;white-space:pre-wrap}',
    '.xfa-msg{margin-bottom:12px}.xfa-who{font-size:11px;color:#8b93a3;margin-bottom:4px}',
    '.xfa-b{border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.75;background:#1f2430;',
    'border:1px solid #2a2f3a;white-space:pre-wrap;word-break:break-word}',
    '.xfa-msg.me .xfa-b{background:#243049;border-color:var(--xfa-ac)}',
    '.xfa-msg.err .xfa-b{border-color:#f85149;color:#f85149}',
    '.xfa-b code{background:#0b0d11;border-radius:4px;padding:1px 4px;font-family:Consolas,Menlo,monospace;font-size:12px}',
    '.xfa-q{font-size:11.5px;color:#8b93a3;border-left:2px solid #2a2f3a;padding-left:8px;margin-bottom:6px;',
    'line-height:1.6;max-height:62px;overflow:hidden}',
    '.xfa-cp{font-size:11px;color:#8b93a3;background:none;border:none;padding:3px 0 0}',
    '.xfa-warn{display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid #f85149;',
    'background:#1f2430;color:#f85149;font-size:11.5px;line-height:1.6}',
    '.xfa-warn.max{background:#f85149;color:#fff}',
    '.xfa-warn button{flex:none;padding:4px 10px;font-size:11px;background:#f85149;color:#fff;border-color:#f85149}',
    '.xfa-warn.max button{background:#fff;color:#f85149;border-color:#fff}',
    '.xfa-ctx{display:flex;align-items:center;gap:8px;padding:7px 14px;border-top:1px solid #2a2f3a;',
    'background:#1f2430;font-size:11.5px;color:#8b93a3}',
    '.xfa-ctx span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.xfa-in{display:flex;gap:8px;align-items:flex-end;padding:12px 14px;border-top:1px solid #2a2f3a}',
    '.xfa-in textarea{resize:none;line-height:1.6}.xfa-in button{flex:none;padding:9px 16px}',
    '#xfa-sel{position:fixed;z-index:2147483002;padding:6px 12px;font-size:12px;border-radius:8px;border:none;',
    'background:' + ACCENT + ';color:#fff;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.35);display:none}',
    '@media print{#xfa-root,#xfa-toggle,#xfa-sel{display:none!important}}'
  ].join('');

  function html() {
    return ''
      + '<div class="xfa-head"><div style="min-width:0">'
      + '<div class="xfa-tt" id="xfa-title"></div><div class="xfa-sub" id="xfa-subline"></div></div>'
      + '<div class="xfa-hb">'
      + '<button id="xfa-new" title="' + esc(t('neu')) + '">＋</button>'
      + '<button id="xfa-list" title="' + esc(t('list')) + '">🗂</button>'
      + '<button id="xfa-set" title="' + esc(t('set')) + '">⚙</button>'
      + '<button id="xfa-hide" title="' + esc(t('close')) + '">✕</button>'
      + '</div></div>'
      + '<div class="xfa-panel" id="xfa-convs" style="display:none">'
      + '<div class="xfa-ct">' + esc(t('convs')) + '</div><div id="xfa-convlist"></div></div>'
      + '<div class="xfa-panel" id="xfa-settings" style="display:none">'
      + '<label>' + esc(t('keyLabel')) + '</label>'
      + '<input type="password" id="xfa-key" spellcheck="false" placeholder="' + esc(t('keyPh')) + '">'
      + '<label>' + esc(t('modelLabel')) + '</label><input type="text" id="xfa-model" spellcheck="false">'
      + '<label>' + esc(t('baseLabel')) + '</label><input type="text" id="xfa-base" spellcheck="false">'
      + '<div class="xfa-row"><button class="pri" id="xfa-save">' + esc(t('save')) + '</button>'
      + '<a href="https://platform.minimaxi.com/console/plan" target="_blank" rel="noreferrer">' + esc(t('getKey')) + '</a></div>'
      + '<p class="xfa-note">' + esc(t('note')) + '</p></div>'
      + '<div class="xfa-log" id="xfa-log"></div>'
      + '<div class="xfa-warn" id="xfa-warn" style="display:none"></div>'
      + '<div class="xfa-ctx" id="xfa-ctx" style="display:none"><span id="xfa-ctxt"></span>'
      + '<button id="xfa-ctxdrop" style="padding:2px 8px;font-size:11px;background:none">' + esc(t('drop')) + '</button></div>'
      + '<div class="xfa-in"><textarea id="xfa-input" rows="3" placeholder="' + esc(t('ph')) + '"></textarea>'
      + '<button class="pri" id="xfa-send">' + esc(t('send')) + '</button></div>';
  }

  // 极简 markdown：**粗体**、`行内代码`、### 小标题
  function md(s) {
    return esc(s)
      .replace(/^###?\s*(.+)$/gm, '<b>$1</b>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }

  function render() {
    var log = byId('xfa-log');
    if (!log) return;
    var h = cur().history;
    if (!h.length && !busy) {
      log.innerHTML = '<div class="xfa-empty">' + esc(t('empty')) + '</div>';
      return;
    }
    var rows = h.map(function (m, i) {
      var cls = m.role === 'user' ? 'me' : m.role === 'err' ? 'err' : '';
      var who = m.role === 'user' ? t('me') : 'MiniMax';
      var q = m.quote ? '<div class="xfa-q">“' + esc(m.quote) + '”</div>' : '';
      var cp = m.role === 'assistant'
        ? '<button class="xfa-cp" data-cp="' + i + '">' + esc(t('copy')) + '</button>' : '';
      return '<div class="xfa-msg ' + cls + '"><div class="xfa-who">' + who + '</div>' + q
        + '<div class="xfa-b">' + md(m.text) + '</div>' + cp + '</div>';
    });
    if (busy) {
      rows.push('<div class="xfa-msg"><div class="xfa-who">MiniMax</div><div class="xfa-b">'
        + esc(t('thinking')) + '</div></div>');
    }
    log.innerHTML = rows.join('');
    Array.prototype.forEach.call(log.querySelectorAll('[data-cp]'), function (b) {
      b.onclick = function () {
        try { navigator.clipboard.writeText(h[Number(b.getAttribute('data-cp'))].text); } catch (e) {}
        b.textContent = t('copied');
      };
    });
    log.scrollTop = log.scrollHeight;
  }
  function renderSub() {
    var el = byId('xfa-subline');
    if (!el) return;
    var n = turns();
    el.textContent = t('subLine', { t: convTitle(cur()), n: n, m: MAX_TURNS });
    el.className = 'xfa-sub' + (n >= WARN_TURNS ? ' hot' : '');
  }
  function renderConvs() {
    var box = byId('xfa-convlist');
    if (!box) return;
    box.innerHTML = convs.map(function (c) {
      var n = turns(c);
      return '<div class="xfa-cv' + (c.id === curId ? ' on' : '') + '" data-cv="' + c.id + '">'
        + '<span class="xfa-cv-n">' + esc(convTitle(c)) + '</span>'
        + '<span class="xfa-cv-t' + (n >= WARN_TURNS ? ' hot' : '') + '">' + esc(t('turns', { n: n })) + '</span>'
        + '<button class="xfa-cv-x" data-dl="' + c.id + '" title="' + esc(t('del')) + '">✕</button></div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-cv]'), function (el) {
      el.onclick = function (e) {
        if (e.target.getAttribute && e.target.getAttribute('data-dl')) return;
        curId = el.getAttribute('data-cv');
        quote = '';
        saveConvs();
        byId('xfa-convs').style.display = 'none';
        renderAll();
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-dl]'), function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (!confirm(t('delAsk'))) return;
        var id = b.getAttribute('data-dl');
        convs = convs.filter(function (c) { return c.id !== id; });
        if (!convs.length) newConv(true);
        else if (curId === id) curId = convs[0].id;
        saveConvs();
        renderAll();
      };
    });
  }
  // 20 轮红字提醒换会话，40 轮锁死输入
  function renderWarn() {
    var bar = byId('xfa-warn'), ta = byId('xfa-input'), sd = byId('xfa-send');
    if (!bar) return;
    var n = turns(), maxed = n >= MAX_TURNS, warn = n >= WARN_TURNS;
    bar.style.display = warn ? 'flex' : 'none';
    bar.className = 'xfa-warn' + (maxed ? ' max' : '');
    if (warn) {
      bar.innerHTML = '<span>' + esc(maxed ? t('warnMax', { m: MAX_TURNS }) : t('warnLong', { n: n }))
        + '</span><button id="xfa-wnew">' + esc(t('warnNew')) + '</button>';
      byId('xfa-wnew').onclick = function () { newConv(); };
    }
    if (ta) { ta.disabled = maxed; ta.placeholder = maxed ? t('warnMax', { m: MAX_TURNS }) : t('ph'); }
    if (sd) sd.disabled = maxed;
  }
  function renderCtx() {
    var bar = byId('xfa-ctx');
    if (!bar) return;
    bar.style.display = quote ? 'flex' : 'none';
    if (quote) byId('xfa-ctxt').textContent = '“' + quote.slice(0, 90) + (quote.length > 90 ? '…' : '') + '”';
  }
  function renderAll() { render(); renderConvs(); renderSub(); renderWarn(); }
  function showSettings(v) { byId('xfa-settings').style.display = v ? 'block' : 'none'; }
  function setOpen(v) {
    byId('xfa-root').className = v ? '' : 'xfa-hidden';
    byId('xfa-toggle').style.display = v ? 'none' : 'block';
    // 撑开正文，避免侧栏盖住内容
    document.documentElement.style.marginRight = v ? '372px' : '';
    lsSet('open', v ? '1' : '0');
  }

  function mount() {
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    var root = document.createElement('aside');
    root.id = 'xfa-root';
    root.innerHTML = html();
    document.body.appendChild(root);

    var tg = document.createElement('button');
    tg.id = 'xfa-toggle';
    tg.textContent = t('open');
    document.body.appendChild(tg);

    var sel = document.createElement('button');
    sel.id = 'xfa-sel';
    sel.textContent = t('ask');
    document.body.appendChild(sel);

    byId('xfa-title').textContent = t('title');
    byId('xfa-key').value = key();
    byId('xfa-model').value = model();
    byId('xfa-base').value = base();

    tg.onclick = function () { setOpen(true); };
    byId('xfa-hide').onclick = function () { setOpen(false); };
    byId('xfa-new').onclick = function () { newConv(); };
    byId('xfa-list').onclick = function () {
      var p = byId('xfa-convs');
      if (p.style.display === 'none') { renderConvs(); p.style.display = 'block'; }
      else p.style.display = 'none';
    };
    byId('xfa-set').onclick = function () {
      showSettings(byId('xfa-settings').style.display === 'none');
    };
    byId('xfa-save').onclick = function () {
      lsSet('key', byId('xfa-key').value.trim());
      lsSet('model', byId('xfa-model').value.trim() || DEF_MODEL);
      lsSet('base', byId('xfa-base').value.trim() || DEF_BASE);
      var b = byId('xfa-save');
      b.textContent = t('saved');
      setTimeout(function () { b.textContent = t('save'); }, 1500);
      showSettings(false);
    };
    byId('xfa-ctxdrop').onclick = function () { quote = ''; renderCtx(); };

    function send() {
      var ta = byId('xfa-input');
      var v = ta.value;
      ta.value = '';
      ask(v);
    }
    byId('xfa-send').onclick = send;
    byId('xfa-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    // 划词 → 浮出「问小助手」
    document.addEventListener('mouseup', function (e) {
      if (e.target.closest && (e.target.closest('#xfa-root') || e.target.id === 'xfa-sel')) return;
      setTimeout(function () {
        var s = window.getSelection();
        var txt = s ? String(s).trim() : '';
        if (txt.length < 4) { sel.style.display = 'none'; return; }
        var r = s.getRangeAt(0).getBoundingClientRect();
        sel.style.left = Math.max(8, Math.min(window.innerWidth - 160, r.left)) + 'px';
        sel.style.top = Math.max(8, r.top - 38) + 'px';
        sel.style.display = 'block';
        sel.setAttribute('data-t', txt.slice(0, 2000));
      }, 10);
    });
    sel.onclick = function () {
      setOpen(true);
      quote = sel.getAttribute('data-t') || '';
      renderCtx();
      byId('xfa-input').focus();
      sel.style.display = 'none';
    };
    document.addEventListener('mousedown', function (e) {
      if (e.target.id !== 'xfa-sel') sel.style.display = 'none';
    });

    loadConvs();
    renderAll();
    renderCtx();
    if (!key()) showSettings(true);
    setOpen(ls('open', '1') === '1');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
