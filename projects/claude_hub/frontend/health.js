// 「拿来就能用」两件套的共用 UI：① 网络体检 ② Claude 账号登录。
// 引导页（onboard.js）与设置页（app.js）都用同一份实现，避免两处逻辑跑偏。
// 依赖 app.js 的 $ / api / escapeHtml，trans.js 的 T。

const Health = {
  net: null,        // 最近一次网络体检结果
  auth: null,       // 最近一次 Claude 登录态
  login: null,      // 正在进行的登录流程快照
  loginBox: null,   // 登录卡片挂在哪个元素上（WS 事件来了要重绘）
  loginOpts: {},
  // 授权页给出的东西有两种：'code'=直接给授权码；'link'=只让填邮箱、验证链接发到邮箱里。
  // 由用户自己选（选错随时能切回来），两边的输入框内容各自暂存，重绘不丢。
  loginWay: 'code',
  loginCode: '',
  loginLink: '',
  // 登录方式：'claudeai'=订阅（Claude Pro/Max，推荐，通常比按量付费的 API 更省钱）；'console'=控制台账号（按 API 用量计费）
  loginMode: 'claudeai',
  busy: false,
};

// ══════════════════════════════════════════════════════════════════════
//  一、网络体检
// ══════════════════════════════════════════════════════════════════════

// 在 el 里跑一次体检并渲染。
// opts.onPickProvider(id) —— 用户点「改用国产模型」时回调（引导页用来跳到对应服务商）
// opts.onDone(report)     —— 体检完成回调
async function runNetCheck(el, opts) {
  if (!el) return null;
  const o = opts || {};
  el.innerHTML = `<div class="hc hc-run"><div class="hc-h"><b>${T('hcTitle')}</b></div>` +
    `<div class="hc-hint">${T('hcChecking')}</div></div>`;
  let report;
  try {
    report = await api('/api/net/check');
  } catch (e) {
    el.innerHTML =
      `<div class="hc bad"><div class="hc-h"><b>${T('hcTitle')}</b>` +
      `<span class="hc-badge bad">${T('hcFailed')}</span></div>` +
      `<div class="hc-hint">${escapeHtml(e.message || '')}</div>` +
      `<div class="hc-acts"><button type="button" class="hc-btn" data-hc-retry="1">${T('hcRetry')}</button></div></div>`;
    bindNetCheck(el, o);
    return null;
  }
  Health.net = report;
  el.innerHTML = netCheckHtml(report, o);
  bindNetCheck(el, o);
  if (o.onDone) o.onDone(report);
  return report;
}

// 用已有结果直接渲染（引导页来回切步骤时不该每次都重测一遍网络）
function showNetCheck(el, report, opts) {
  if (!el || !report) return;
  const o = opts || {};
  Health.net = report;
  el.innerHTML = netCheckHtml(report, o);
  bindNetCheck(el, o);
}

// 逐项名称：后端只给稳定的 key，文案按当前语言取；字典里没有才退回后端的中文 label
function netItemLabel(i) {
  const t = T('hcT_' + i.key);
  return t === 'hcT_' + i.key ? i.label || i.key : t;
}

// 一句话结论：同上，按 verdict + 代理 + 实测可用的国产服务商在前端拼，后端 hint 仅兜底
function netHint(r) {
  const proxied = !!(r.proxy && r.proxy.enabled);
  const url = proxied ? r.proxy.url : '';
  if (r.verdict === 'ok') return proxied ? T('hcHintOkProxy').replace('{url}', url) : T('hcHintOk');
  if (r.verdict === 'noInternet') return T('hcHintNoNet');
  if (r.verdict === 'unknown') return r.hint || '';
  const names = (r.domestic || []).map((id) => DOMESTIC_LABEL[id] || id);
  const way = names.length ? T('hcWayCn').replace('{list}', names.join('、')) : T('hcWayCnNone');
  const base = proxied ? T('hcHintNoClaudeProxy').replace('{url}', url) : T('hcHintNoClaude');
  return base.replace('{way}', way);
}

function netCheckHtml(r, o) {
  const tone = r.verdict === 'ok' ? 'ok' : r.verdict === 'noInternet' ? 'bad' : 'warn';
  const badge =
    r.verdict === 'ok' ? T('hcOk') : r.verdict === 'noInternet' ? T('hcNoNet') : T('hcNoClaude');
  const rows = r.items
    .map(
      (i) =>
        `<div class="hc-row${i.ok ? '' : ' off'}">` +
        `<span class="hc-dot">${i.ok ? '●' : '○'}</span>` +
        `<span class="hc-name">${escapeHtml(netItemLabel(i))}</span>` +
        `<span class="hc-ms">${i.ok ? i.ms + ' ms' : escapeHtml(i.error || T('hcUnreachable'))}</span>` +
        `</div>`,
    )
    .join('');
  // 连不上 Claude 时给两条出路：开代理重测，或直接换成实测可用的国产服务商
  let acts = `<button type="button" class="hc-btn" data-hc-retry="1">${T('hcRetry')}</button>`;
  if (r.verdict !== 'ok') {
    acts = `<button type="button" class="hc-btn hc-btn-primary" data-hc-retry="1">${T('hcRetryAfterVpn')}</button>`;
    if (o.onPickProvider) {
      for (const id of r.domestic) {
        acts += `<button type="button" class="hc-btn hc-btn-alt" data-hc-pick="${id}">` +
          `${T('hcUseDomestic').replace('{name}', DOMESTIC_LABEL[id] || id)}</button>`;
      }
    }
  }
  const proxy = r.proxy && r.proxy.enabled
    ? `<div class="hc-proxy">${T('hcProxyFound').replace('{url}', escapeHtml(r.proxy.url)).replace('{from}', escapeHtml(r.proxy.from))}</div>`
    : '';
  return (
    `<div class="hc ${tone}">` +
    `<div class="hc-h"><b>${T('hcTitle')}</b><span class="hc-badge ${tone}">${badge}</span></div>` +
    `<div class="hc-hint">${escapeHtml(netHint(r))}</div>` +
    proxy +
    (r.verdict !== 'ok' ? `<div class="hc-guide">${T('hcGuide')}</div>` : '') +
    `<div class="hc-acts">${acts}</div>` +
    `<details class="hc-detail"><summary>${T('hcDetail')}</summary>${rows}</details>` +
    `</div>`
  );
}

// 国产服务商在体检卡片里的展示名（与后端 provider id 对应）
// 服务商短名：走 trans（app.js 的 providerLabel 同源），拿不到才退回这里的中文兜底
const DOMESTIC_FALLBACK = { minimax: 'MiniMax', kimi: 'Kimi 开放平台', kimicode: 'Kimi Code 订阅', xiaomi: '小米 MiMo' };
const DOMESTIC_LABEL = new Proxy({}, {
  get: (_t, id) => (typeof providerLabel === 'function' ? providerLabel(id, DOMESTIC_FALLBACK[id]) : DOMESTIC_FALLBACK[id]),
});

function bindNetCheck(el, o) {
  const retry = el.querySelector('[data-hc-retry]');
  if (retry) retry.onclick = () => runNetCheck(el, o);
  el.querySelectorAll('[data-hc-pick]').forEach((b) => {
    b.onclick = () => o.onPickProvider && o.onPickProvider(b.dataset.hcPick);
  });
}

// ══════════════════════════════════════════════════════════════════════
//  二、Claude 账号登录
// ══════════════════════════════════════════════════════════════════════

// 在 el 里渲染登录卡片（自动先拉一次状态）。
// opts.onLoggedIn() —— 登录成功后回调（引导页据此放行「下一步」）
async function renderClaudeLogin(el, opts) {
  if (!el) return null;
  Health.loginBox = el;
  Health.loginOpts = opts || {};
  el.innerHTML = `<div class="cl"><div class="cl-hint">${T('clChecking')}</div></div>`;
  try {
    Health.auth = await api('/api/claude/auth/status');
  } catch (e) {
    el.innerHTML = `<div class="cl bad"><div class="cl-hint">${T('clStatusFail')}${escapeHtml(e.message || '')}</div>` +
      `<div class="cl-acts"><button type="button" class="hc-btn" data-cl-recheck="1">${T('clRecheck')}</button></div></div>`;
    bindClaudeLogin(el);
    return null;
  }
  paintClaudeLogin();
  return Health.auth;
}

// 只重画，不重新拉状态（WS 推进来时用）
function paintClaudeLogin() {
  const el = Health.loginBox;
  if (!el) return;
  stashLoginInputs();
  el.innerHTML = claudeLoginHtml(Health.auth || {}, Health.login);
  bindClaudeLogin(el);
}

// 重绘会把输入框连同内容一起换掉：先把用户已经粘进去的东西存起来，渲染时再填回去
function stashLoginInputs() {
  const code = $('clCodeInput');
  const link = $('clLinkInput');
  if (code) Health.loginCode = code.value;
  if (link) Health.loginLink = link.value;
}

function claudeLoginHtml(a, s) {
  // 第三方服务商用 API Key 直连，压根不需要 Anthropic 账号——别把人吓一跳。
  // forceOfficial=调用方（引擎板块的原版服务商）已经确定这里就是原版：
  // 下拉刚切到原版还没保存时，后端记的仍是第三方，不能因此把登录入口藏掉
  if (!Health.loginOpts.forceOfficial && a.provider && a.provider !== 'official')
    return `<div class="cl ok"><div class="cl-h"><b>${T('clTitle')}</b>` +
      `<span class="hc-badge ok">${T('clNotNeeded')}</span></div>` +
      `<div class="cl-hint">${T('clThirdParty').replace('{p}', escapeHtml(providerLabel(a.provider)))}</div></div>`;

  if (!a.cliFound)
    return `<div class="cl bad"><div class="cl-h"><b>${T('clTitle')}</b>` +
      `<span class="hc-badge bad">${T('clNoCli')}</span></div>` +
      `<div class="cl-hint">${T('clNoCliHint')}</div></div>`;

  if (a.loggedIn && !s)
    return `<div class="cl ok"><div class="cl-h"><b>${T('clTitle')}</b>` +
      `<span class="hc-badge ok">${T('clLoggedIn')}</span></div>` +
      `<div class="cl-who">${escapeHtml(a.email || '')}` +
      (a.orgName ? ` · ${escapeHtml(a.orgName)}` : '') +
      (a.subscriptionType ? ` · ${escapeHtml(a.subscriptionType)}` : '') +
      `</div>` +
      `<div class="cl-acts"><button type="button" class="hc-btn" data-cl-start="1">${T('clRelogin')}</button>` +
      `<button type="button" class="hc-btn" data-cl-recheck="1">${T('clRecheck')}</button></div></div>`;

  // 未登录 / 登录进行中
  const phase = (s && s.phase) || 'idle';
  const body = phase === 'idle' || phase === 'canceled' || phase === 'failed'
    ? claudeLoginIdleHtml(s)
    : claudeLoginRunningHtml(s);
  const tone = phase === 'done' ? 'ok' : phase === 'failed' ? 'bad' : 'warn';
  const badge = phase === 'done' ? T('clLoggedIn') : T('clNeedLogin');
  return `<div class="cl ${tone}"><div class="cl-h"><b>${T('clTitle')}</b>` +
    `<span class="hc-badge ${tone}">${badge}</span></div>${body}</div>`;
}

function claudeLoginIdleHtml(s) {
  const err = s && s.error
    ? `<div class="cl-err sx-pre">${escapeHtml(s.error)}</div>`
    : '';
  const mode = Health.loginMode === 'console' ? 'console' : 'claudeai';
  return (
    `<div class="cl-hint">${T('clWhy')}</div>` +
    err +
    `<div class="cl-q">${T('clPickMode')}</div>` +
    `<div class="cl-ways">` +
    clWayBtnHtml2('cl-mode', 'claudeai', mode, T('clModeSub'), T('clModeSubSub')) +
    clWayBtnHtml2('cl-mode', 'console', mode, T('clModeConsole'), T('clModeConsoleSub')) +
    `</div>` +
    `<div class="cl-acts">` +
    `<button type="button" class="hc-btn hc-btn-primary" data-cl-start="1">${T('clStart')}</button>` +
    `<button type="button" class="hc-btn" data-cl-recheck="1">${T('clDoneOutside')}</button>` +
    `</div>` +
    `<div class="cl-note">${T('clManual')}<code>claude auth login</code></div>`
  );
}

// 与 clWayBtnHtml 同款外观，但用于「登录方式」的单选（data-attr 名可复用不同前缀）
function clWayBtnHtml2(attr, id, cur, title, sub) {
  return `<button type="button" class="cl-way${id === cur ? ' on' : ''}" data-${attr}="${id}">` +
    `<b>${title}</b><span>${sub}</span></button>`;
}

// 拿到链接之后的核心界面：打开授权页 → 让用户自己认领「看到的是哪种情况」→ 分支指引
function claudeLoginRunningHtml(s) {
  if (!s.url)
    return `<div class="cl-hint">${escapeHtml(s.message || T('clStarting'))}</div>` +
      `<div class="cl-acts"><button type="button" class="hc-btn" data-cl-cancel="1">${T('clCancel')}</button></div>`;
  const done = s.phase === 'done';
  if (done)
    return `<div class="cl-hint">${escapeHtml(s.message || '')}</div>` +
      `<div class="cl-acts"><button type="button" class="hc-btn" data-cl-recheck="1">${T('clRecheck')}</button></div>`;
  const way = Health.loginWay === 'link' ? 'link' : 'code';
  return (
    `<div class="cl-hint">${T('clRunHint')}</div>` +
    `<div class="cl-acts">` +
    `<a class="hc-btn hc-btn-primary cl-open" href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${T('clOpenUrl')}</a>` +
    `<button type="button" class="hc-btn" data-cl-copy="1">${T('clCopyUrl')}</button>` +
    `</div>` +
    `<div class="cl-url" title="${escapeHtml(s.url)}">${escapeHtml(s.url)}</div>` +
    `<div class="cl-q">${T('clWhichCase')}</div>` +
    `<div class="cl-ways">` +
    clWayBtnHtml('code', way, T('clWayCode'), T('clWayCodeSub')) +
    clWayBtnHtml('link', way, T('clWayLink'), T('clWayLinkSub')) +
    `</div>` +
    (way === 'link' ? clLinkWayHtml() : clCodeWayHtml(s)) +
    `<div class="cl-msg" id="clMsg">${escapeHtml(s.message || '')}</div>` +
    `<div class="cl-acts"><button type="button" class="hc-btn" data-cl-cancel="1">${T('clCancel')}</button></div>`
  );
}

function clWayBtnHtml(id, cur, title, sub) {
  return `<button type="button" class="cl-way${id === cur ? ' on' : ''}" data-cl-way="${id}">` +
    `<b>${title}</b><span>${sub}</span></button>`;
}

// 情况 A：授权页直接给了授权码 —— 老流程，粘回来即可
function clCodeWayHtml(s) {
  const busy = s.phase === 'submitting';
  return (
    `<ol class="cl-steps"><li>${T('clAStep1')}</li><li>${T('clAStep2')}</li><li>${T('clAStep3')}</li></ol>` +
    `<div class="cl-code">` +
    `<input type="text" id="clCodeInput" placeholder="${T('clCodePlaceholder')}" autocomplete="off"` +
    ` value="${escapeHtml(Health.loginCode || '')}"${busy ? ' disabled' : ''} />` +
    `<button type="button" class="hc-btn hc-btn-primary" data-cl-submit="1"${busy ? ' disabled' : ''}>` +
    `${busy ? T('clSubmitting') : T('clSubmit')}</button>` +
    `</div>`
  );
}

// 情况 B：页面只让填邮箱，验证链接发到了邮箱 —— 页面上根本没有授权码，
// 关键在于「同一个浏览器」+「验证完再打开一次授权页」，这两点说不清用户就会卡死。
function clLinkWayHtml() {
  return (
    `<div class="cl-key">${T('clBKey')}</div>` +
    `<ol class="cl-steps">` +
    `<li>${T('clBStep1')}</li><li>${T('clBStep2')}</li><li>${T('clBStep3')}</li>` +
    `<li>${T('clBStep4')}</li><li>${T('clBStep5')}</li>` +
    `</ol>` +
    `<div class="cl-code">` +
    `<input type="text" id="clLinkInput" placeholder="${T('clLinkPlaceholder')}" autocomplete="off"` +
    ` value="${escapeHtml(Health.loginLink || '')}" />` +
    `<button type="button" class="hc-btn" data-cl-openlink="1">${T('clOpenLink')}</button>` +
    `</div>` +
    `<div class="cl-acts">` +
    `<button type="button" class="hc-btn hc-btn-primary" data-cl-reopen="1">${T('clReopenAuth')}</button>` +
    `<button type="button" class="hc-btn" data-cl-way="code">${T('clGotCode')}</button>` +
    `</div>` +
    `<div class="cl-note">${T('clBNote')}</div>`
  );
}

function bindClaudeLogin(el) {
  const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => { b.onclick = fn; });
  on('[data-cl-start]', startClaudeLogin);
  on('[data-cl-recheck]', () => renderClaudeLogin(el, Health.loginOpts));
  on('[data-cl-cancel]', cancelClaudeLogin);
  on('[data-cl-submit]', submitClaudeCode);
  on('[data-cl-way]', (ev) => pickClaudeLoginWay(ev.currentTarget.dataset.clWay));
  on('[data-cl-mode]', (ev) => {
    Health.loginMode = ev.currentTarget.dataset.clMode === 'console' ? 'console' : 'claudeai';
    paintClaudeLogin();
  });
  on('[data-cl-openlink]', openClaudeVerifyLink);
  on('[data-cl-reopen]', reopenClaudeAuthPage);
  on('[data-cl-copy]', (ev) => {
    const url = (Health.login || {}).url || '';
    if (!url) return;
    copyText(url, ev.currentTarget, T('clCopyUrl'));
    const m = $('clMsg');
    if (m) m.textContent = T('clCopied');
  });
  const input = el.querySelector('#clCodeInput');
  if (input) input.onkeydown = (ev) => { if (ev.key === 'Enter') submitClaudeCode(); };
  const link = el.querySelector('#clLinkInput');
  if (link) link.onkeydown = (ev) => { if (ev.key === 'Enter') openClaudeVerifyLink(); };
}

// 切换「我看到的是哪种情况」。只影响本地呈现，不碰后端那个还在等 stdin 的登录进程。
function pickClaudeLoginWay(way) {
  Health.loginWay = way === 'link' ? 'link' : 'code';
  paintClaudeLogin();
}

// 在同一个浏览器里打开邮箱验证链接 —— 这正是情况 B 最容易做错的一步，
// 所以给个按钮代劳（用户手动复制到别的浏览器/手机上打开就白验证了）。
function openClaudeVerifyLink() {
  const input = $('clLinkInput');
  const msg = $('clMsg');
  const url = ((input && input.value) || '').trim();
  Health.loginLink = url;
  if (!/^https?:\/\//i.test(url)) { if (msg) msg.textContent = T('clNeedLink'); return; }
  window.open(url, '_blank', 'noopener');
  if (msg) msg.textContent = T('clLinkOpened');
}

// 验证完之后再打开一次同一条授权链接：登录进程还活着，链接依然有效，
// 这次浏览器里已经是登录态，页面才会给出 Authorize → 授权码。
function reopenClaudeAuthPage() {
  const url = (Health.login || {}).url || '';
  const msg = $('clMsg');
  if (!url) return;
  window.open(url, '_blank', 'noopener');
  if (msg) msg.textContent = T('clReopened');
}

async function startClaudeLogin() {
  if (Health.busy) return;
  Health.busy = true;
  Health.loginWay = 'code';
  Health.loginCode = '';
  Health.loginLink = '';
  Health.login = { phase: 'starting', url: '', message: T('clStarting'), log: [], error: '' };
  paintClaudeLogin();
  try {
    Health.login = await api('/api/claude/auth/login', { mode: Health.loginMode === 'console' ? 'console' : 'claudeai' });
  } catch (e) {
    Health.login = { phase: 'failed', url: '', message: '', log: [], error: e.message || '' };
  } finally {
    Health.busy = false;
    paintClaudeLogin();
  }
}

async function submitClaudeCode() {
  const input = $('clCodeInput');
  const msg = $('clMsg');
  const code = ((input && input.value) || '').trim();
  Health.loginCode = code;
  if (!code) { if (msg) msg.textContent = T('clNeedCode'); return; }
  // 粘进来的是链接 → 十有八九是情况 B 的人把邮箱验证链接放错地方了。
  // 提交上去只会让 claude 报错退出、整个流程重来，所以就地拦下并把他领到情况 B。
  if (/^https?:\/\//i.test(code)) {
    if (input) input.value = '';   // 先清掉，否则重绘时又被 stash 回 loginCode
    Health.loginCode = '';
    Health.loginLink = code;
    Health.loginWay = 'link';
    paintClaudeLogin();
    const m2 = $('clMsg');
    if (m2) m2.textContent = T('clCodeIsLink');
    return;
  }
  if (Health.busy) return;
  Health.busy = true;
  Health.login = { ...(Health.login || {}), phase: 'submitting', message: T('clSubmitting') };
  paintClaudeLogin();
  try {
    Health.login = await api('/api/claude/auth/code', { code });
  } catch (e) {
    Health.login = { ...(Health.login || {}), phase: 'failed', error: e.message || '' };
  }
  Health.busy = false;
  // 无论成功与否都以「真实登录态」为准复核一遍，避免界面说成功其实没成
  try {
    Health.auth = await api('/api/claude/auth/status');
  } catch { /* 保留上一次状态 */ }
  if (Health.auth && Health.auth.loggedIn) {
    Health.login = null;
    Health.loginCode = '';
    Health.loginLink = '';
    paintClaudeLogin();
    if (Health.loginOpts.onLoggedIn) Health.loginOpts.onLoggedIn(Health.auth);
    return;
  }
  paintClaudeLogin();
}

async function cancelClaudeLogin() {
  try {
    await api('/api/claude/auth/cancel', {});
  } catch { /* 进程可能已经结束 */ }
  Health.login = null;
  Health.loginCode = '';
  Health.loginLink = '';
  renderClaudeLogin(Health.loginBox, Health.loginOpts);
}

// WebSocket 推来的登录进度（kind='claudeLogin'）：没有 sessionId，必须在按会话过滤之前处理
function onClaudeLoginEvent(e) {
  if (!Health.loginBox) return;
  const prev = Health.login || { log: [] };
  Health.login = {
    phase: e.phase,
    url: e.url || prev.url || '',
    message: e.message || prev.message || '',
    error: e.error || '',
    log: prev.log || [],
  };
  // 正在往输入框里粘东西时不要重绘（会打断输入、丢掉光标位置）
  const typing = document.activeElement;
  if (typing && (typing.id === 'clCodeInput' || typing.id === 'clLinkInput') && e.phase === 'awaitCode') return;
  paintClaudeLogin();
}

// ══════════════════════════════════════════════════════════════════════
//  三、Codex 账号登录（订阅 device-auth / API Key 二选一）
// ══════════════════════════════════════════════════════════════════════

Object.assign(Health, {
  cxAuth: null,      // 最近一次 codex 登录态
  cxLogin: null,     // 正在进行的登录流程快照
  cxLoginBox: null,
  cxLoginOpts: {},
  cxMode: 'chatgpt', // 'chatgpt'=订阅（device-auth）；'apiKey'=OpenAI API Key
  cxKey: '',
  cxBusy: false,
});

async function renderCodexLogin(el, opts) {
  if (!el) return null;
  Health.cxLoginBox = el;
  Health.cxLoginOpts = opts || {};
  el.innerHTML = `<div class="cl"><div class="cl-hint">${T('cxChecking')}</div></div>`;
  try {
    Health.cxAuth = await api('/api/codex/auth/status');
  } catch (e) {
    el.innerHTML = `<div class="cl bad"><div class="cl-hint">${T('cxStatusFail')}${escapeHtml(e.message || '')}</div>` +
      `<div class="cl-acts"><button type="button" class="hc-btn" data-cx-recheck="1">${T('cxRecheck')}</button></div></div>`;
    bindCodexLogin(el);
    return null;
  }
  paintCodexLogin();
  return Health.cxAuth;
}

function paintCodexLogin() {
  const el = Health.cxLoginBox;
  if (!el) return;
  const key = $('cxKeyInput');
  if (key) Health.cxKey = key.value;
  el.innerHTML = codexLoginHtml(Health.cxAuth || {}, Health.cxLogin);
  bindCodexLogin(el);
}

function codexLoginHtml(a, s) {
  if (!Health.cxLoginOpts.forceOfficial && a.provider && a.provider !== 'official')
    return `<div class="cl ok"><div class="cl-h"><b>${T('cxTitle')}</b>` +
      `<span class="hc-badge ok">${T('cxNotNeeded')}</span></div>` +
      `<div class="cl-hint">${T('cxThirdParty').replace('{p}', escapeHtml(providerLabel(a.provider)))}</div></div>`;

  if (!a.cliFound)
    return `<div class="cl bad"><div class="cl-h"><b>${T('cxTitle')}</b>` +
      `<span class="hc-badge bad">${T('cxNoCli')}</span></div>` +
      `<div class="cl-hint">${T('cxNoCliHint')}</div></div>`;

  if (a.loggedIn && !s)
    return `<div class="cl ok"><div class="cl-h"><b>${T('cxTitle')}</b>` +
      `<span class="hc-badge ok">${T('cxLoggedIn')}</span></div>` +
      (a.raw ? `<div class="cl-who">${escapeHtml(a.raw)}</div>` : '') +
      `<div class="cl-acts"><button type="button" class="hc-btn" data-cx-start="1">${T('cxRelogin')}</button>` +
      `<button type="button" class="hc-btn" data-cx-recheck="1">${T('cxRecheck')}</button></div></div>`;

  const phase = (s && s.phase) || 'idle';
  const body = phase === 'idle' || phase === 'canceled' || phase === 'failed'
    ? codexLoginIdleHtml(s)
    : codexLoginRunningHtml(s);
  const tone = phase === 'done' ? 'ok' : phase === 'failed' ? 'bad' : 'warn';
  const badge = phase === 'done' ? T('cxLoggedIn') : T('cxNeedLogin');
  return `<div class="cl ${tone}"><div class="cl-h"><b>${T('cxTitle')}</b>` +
    `<span class="hc-badge ${tone}">${badge}</span></div>${body}</div>`;
}

function codexLoginIdleHtml(s) {
  const err = s && s.error ? `<div class="cl-err sx-pre">${escapeHtml(s.error)}</div>` : '';
  const mode = Health.cxMode === 'apiKey' ? 'apiKey' : 'chatgpt';
  const keyBox = mode === 'apiKey'
    ? `<div class="cl-code">` +
      `<input type="text" id="cxKeyInput" placeholder="${T('cxKeyPlaceholder')}" autocomplete="off"` +
      ` value="${escapeHtml(Health.cxKey || '')}" />` +
      `</div>`
    : '';
  return (
    `<div class="cl-hint">${T('cxWhy')}</div>` +
    err +
    `<div class="cl-q">${T('cxPickMode')}</div>` +
    `<div class="cl-ways">` +
    clWayBtnHtml2('cx-mode', 'chatgpt', mode, T('cxModeSub'), T('cxModeSubSub')) +
    clWayBtnHtml2('cx-mode', 'apiKey', mode, T('cxModeKey'), T('cxModeKeySub')) +
    `</div>` +
    keyBox +
    `<div class="cl-acts">` +
    `<button type="button" class="hc-btn hc-btn-primary" data-cx-start="1">${mode === 'apiKey' ? T('cxSubmitKey') : T('cxStart')}</button>` +
    `<button type="button" class="hc-btn" data-cx-recheck="1">${T('cxDoneOutside')}</button>` +
    `</div>` +
    `<div class="cl-note">${T('cxManual')}<code>codex login --device-auth</code></div>`
  );
}

function codexLoginRunningHtml(s) {
  if (s.mode === 'apiKey' || !s.url)
    return `<div class="cl-hint">${escapeHtml(s.message || T('cxStarting'))}</div>` +
      `<div class="cl-acts"><button type="button" class="hc-btn" data-cx-cancel="1">${T('cxCancel')}</button></div>`;
  const done = s.phase === 'done';
  if (done)
    return `<div class="cl-hint">${escapeHtml(s.message || '')}</div>` +
      `<div class="cl-acts"><button type="button" class="hc-btn" data-cx-recheck="1">${T('cxRecheck')}</button></div>`;
  return (
    `<div class="cl-hint">${T('cxRunHint')}</div>` +
    `<div class="cl-acts">` +
    `<a class="hc-btn hc-btn-primary cl-open" href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer">${T('cxOpenUrl')}</a>` +
    `</div>` +
    `<div class="cl-url" title="${escapeHtml(s.url)}">${escapeHtml(s.url)}</div>` +
    `<div class="cl-q">${T('cxCodeLabel')}</div>` +
    `<div class="cl-code">` +
    `<input type="text" readonly value="${escapeHtml(s.code || '')}" />` +
    `<button type="button" class="hc-btn" data-cx-copy="1">${T('cxCopyCode')}</button>` +
    `</div>` +
    `<div class="cl-msg" id="cxMsg">${escapeHtml(s.message || '')}</div>` +
    `<div class="cl-acts"><button type="button" class="hc-btn" data-cx-cancel="1">${T('cxCancel')}</button></div>`
  );
}

function bindCodexLogin(el) {
  const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => { b.onclick = fn; });
  on('[data-cx-start]', startCodexLogin);
  on('[data-cx-recheck]', () => renderCodexLogin(el, Health.cxLoginOpts));
  on('[data-cx-cancel]', cancelCodexLogin);
  on('[data-cx-mode]', (ev) => {
    Health.cxMode = ev.currentTarget.dataset.cxMode === 'apiKey' ? 'apiKey' : 'chatgpt';
    paintCodexLogin();
  });
  on('[data-cx-copy]', (ev) => {
    const code = (Health.cxLogin || {}).code || '';
    if (!code) return;
    copyText(code, ev.currentTarget, T('cxCopyCode'));
    const m = $('cxMsg');
    if (m) m.textContent = T('cxCopied');
  });
  const keyInput = el.querySelector('#cxKeyInput');
  if (keyInput) keyInput.onkeydown = (ev) => { if (ev.key === 'Enter') startCodexLogin(); };
}

async function startCodexLogin() {
  if (Health.cxBusy) return;
  const mode = Health.cxMode === 'apiKey' ? 'apiKey' : 'chatgpt';
  let apiKey = '';
  if (mode === 'apiKey') {
    const input = $('cxKeyInput');
    apiKey = ((input && input.value) || '').trim();
    Health.cxKey = apiKey;
    if (!apiKey) {
      Health.cxLogin = { ...(Health.cxLogin || {}), phase: 'failed', mode, error: T('cxNeedKey') };
      paintCodexLogin();
      return;
    }
  }
  Health.cxBusy = true;
  Health.cxLogin = { phase: 'starting', mode, url: '', code: '', message: T('cxStarting'), log: [], error: '' };
  paintCodexLogin();
  try {
    Health.cxLogin = await api('/api/codex/auth/login', { mode, apiKey });
  } catch (e) {
    Health.cxLogin = { ...(Health.cxLogin || {}), phase: 'failed', error: e.message || '' };
  }
  Health.cxBusy = false;
  try {
    Health.cxAuth = await api('/api/codex/auth/status');
  } catch { /* 保留上一次状态 */ }
  if (Health.cxAuth && Health.cxAuth.loggedIn) {
    Health.cxLogin = null;
    Health.cxKey = '';
    // 登录成功即代表用户要用「原版 ChatGPT」这一档：把 config.toml 档位切过去，
    // 否则之前如果配的是 kimi，登录成功了也不会生效（codex 仍按 kimi 代理走）。
    try { await api('/api/codex/profile', { profile: 'chatgpt' }); } catch { /* 忽略，不阻断登录成功的反馈 */ }
    paintCodexLogin();
    if (Health.cxLoginOpts.onLoggedIn) Health.cxLoginOpts.onLoggedIn(Health.cxAuth);
    return;
  }
  paintCodexLogin();
}

async function cancelCodexLogin() {
  try {
    await api('/api/codex/auth/cancel', {});
  } catch { /* 进程可能已经结束 */ }
  Health.cxLogin = null;
  Health.cxKey = '';
  renderCodexLogin(Health.cxLoginBox, Health.cxLoginOpts);
}

// WebSocket 推来的登录进度（kind='codexLogin'）：没有 sessionId，必须在按会话过滤之前处理
function onCodexLoginEvent(e) {
  if (!Health.cxLoginBox) return;
  const prev = Health.cxLogin || { log: [] };
  Health.cxLogin = {
    phase: e.phase,
    mode: prev.mode || 'chatgpt',
    url: e.url || prev.url || '',
    code: e.code || prev.code || '',
    message: e.message || prev.message || '',
    error: e.error || '',
    log: prev.log || [],
  };
  paintCodexLogin();
}
