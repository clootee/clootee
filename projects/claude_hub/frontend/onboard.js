// 新手引导（首次进入）五步：
//   ① 语言 + 明暗主题  ② 网络体检  ③ 选执行引擎  ④ 选模型服务商
//   ⑤ 原版 Claude → 登录账号；第三方 → 填 API Key 并选模型
// 「网络体检」排在最前面是有意的：国内用户十有八九卡在「连不上 Claude」，
// 先把这件事查清楚并当场给出路（开代理 / 换国产模型），比走到最后一步再报错友好得多。
// 全程只调用已有接口：/api/net/check、/api/claude/auth/*、/api/engine/status、
// /api/engine/providers、/api/engine/models、/api/engine/config、/api/codex/key、
// /api/codex/profile、/api/engine/update、/api/settings。
// 依赖 app.js 的 $ / api / applyText / applyTheme，trans.js 的 T / setLang / currentLang，
// health.js 的 runNetCheck / showNetCheck / renderClaudeLogin。

const OB_STEPS = 5;

// 强制引导：新用户必须逐项显式选择（语言/主题/引擎/服务商/模型），不提供「以后再说」。
const Onboard = {
  step: 1,
  langSet: false,        // 语言是否已显式选择（浏览器默认值不算）
  themeSet: false,       // 主题是否已显式选择
  net: null,             // 网络体检结果（缓存，来回切步骤不重测）
  engine: '',            // 'claude' | 'codex'（空=未选）
  provider: '',          // 'official' | 'xiaomi' | 'kimi' | 'minimax'（空=未选）
  providers: [],         // 后端下发的服务商元信息
  status: null,          // 引擎安装状态
  models: [],
  model: '',
  key: '',               // 已输入的 Key（切步骤后回填，避免用户重打）
  loggedIn: false,       // Claude 账号是否已登录（第 5 步）
  loginSkipped: false,   // 用户明确选择「稍后再登录」
  busy: false,
  installing: '',        // 正在安装的引擎（同一时刻只允许装一个）
};

// codex 目前只支持「原版 ChatGPT」与「Kimi」（走 config.toml + 本地代理，见 CodexProfile）
const CODEX_PROVIDERS = ['official', 'kimi'];

async function showOnboard() {
  Onboard.step = 1;
  Onboard.busy = false;
  Onboard.installing = '';
  try {
    const [pv, st] = await Promise.all([
      api('/api/engine/providers'),
      api('/api/engine/status'),
    ]);
    Onboard.providers = (pv && pv.providers) || [];
    Onboard.status = st || null;
  } catch {
    Onboard.providers = [];
    Onboard.status = null;
  }
  $('onboardOverlay').hidden = false;
  renderOnboard();
}

function hideOnboard() {
  $('onboardOverlay').hidden = true;
}

function onboardProviderList() {
  const allowed = Onboard.engine === 'codex' ? CODEX_PROVIDERS : null;
  return Onboard.providers.filter((p) => !allowed || allowed.indexOf(p.id) >= 0);
}

function onboardProviderMeta(id) {
  return Onboard.providers.find((p) => p.id === id) || null;
}

// 选中态统一渲染：加 .on（左侧色条 + 高亮边框 + 底色）并显示 ✓「已选」角标，
// 暗色下仅靠边框颜色区分不够明显，故同时给底色与角标。
function obCard(selected, dataAttr, headHtml, descHtml, noteHtml) {
  return `<div class="ob-card${selected ? ' on' : ''}" ${dataAttr}>
    <div class="ob-card-h">${headHtml}${selected ? `<span class="ob-sel">✓ ${T('obSelected')}</span>` : ''}</div>
    ${descHtml ? `<div class="ob-card-d">${descHtml}</div>` : ''}
    ${noteHtml ? `<div class="ob-card-n">${noteHtml}</div>` : ''}
  </div>`;
}

function renderOnboard() {
  let html = '';
  for (let n = 1; n <= OB_STEPS; n++) {
    const cls = n === Onboard.step ? 'ob-dot on' : n < Onboard.step ? 'ob-dot done' : 'ob-dot';
    html += (n > 1 ? '<span class="ob-line"></span>' : '') + `<span class="${cls}">${n}</span>`;
  }
  $('onboardSteps').innerHTML = html;

  $('onboardSkip').hidden = true; // 强制引导：不允许跳过
  $('onboardBack').textContent = T('obBack');

  if (Onboard.step === 1) renderOnboardLocale();
  else if (Onboard.step === 2) renderOnboardNet();
  else if (Onboard.step === 3) renderOnboardEngine();
  else if (Onboard.step === 4) renderOnboardProvider();
  else if (onboardNeedsLogin()) renderOnboardLogin();
  else renderOnboardKey();
}

// 最后一步该走「登录 Claude 账号」还是「填 API Key」：
// 原版 Claude 用的是账号登录，第三方服务商用的是 API Key，两者互斥。
function onboardNeedsLogin() {
  return Onboard.engine === 'claude' && Onboard.provider === 'official';
}

// ── 第 1 步：语言 + 主题 ──
function renderOnboardLocale() {
  $('onboardTitle').textContent = T('obStepLang');
  $('onboardSub').textContent = T('obStepLangSub');
  const lang = currentLang();
  const theme = localStorage.getItem('theme') || 'dark';
  $('onboardBody').innerHTML =
    `<label class="ob-lbl">${T('obLanguage')}</label>
     <div class="ob-row">
       ${obCard(Onboard.langSet && lang === 'zh', 'data-lang="zh"', '<b>简体中文</b>', '')}
       ${obCard(Onboard.langSet && lang === 'en', 'data-lang="en"', '<b>English</b>', '')}
     </div>
     <label class="ob-lbl">${T('obTheme')}</label>
     <div class="ob-row">
       ${obCard(Onboard.themeSet && theme === 'dark', 'data-theme="dark"', `<b>🌙 ${T('obDark')}</b>`, '')}
       ${obCard(Onboard.themeSet && theme === 'light', 'data-theme="light"', `<b>☀️ ${T('obLight')}</b>`, '')}
     </div>`;

  $('onboardBody').querySelectorAll('[data-lang]').forEach((el) => {
    el.onclick = () => { Onboard.langSet = true; setLang(el.dataset.lang); renderOnboard(); };
  });
  $('onboardBody').querySelectorAll('[data-theme]').forEach((el) => {
    el.onclick = () => {
      Onboard.themeSet = true;
      localStorage.setItem('theme', el.dataset.theme);
      applyTheme();
      renderOnboard();
    };
  });
  $('onboardBack').hidden = true;
  $('onboardNext').textContent = T('obNext');
  $('onboardNext').disabled = !(Onboard.langSet && Onboard.themeSet);
}

// ── 第 2 步：网络体检 ──
// 连不上 Claude 时不拦人：可以「开代理后重测」，也可以当场选一个实测可用的国产服务商，
// 选完直接进下一步——这是国内小白最需要的那条路。
function renderOnboardNet() {
  $('onboardTitle').textContent = T('obStepNet');
  $('onboardSub').textContent = T('obStepNetSub');
  $('onboardBody').innerHTML = '<div id="obNetBox"></div>';
  $('onboardBack').hidden = false;
  $('onboardNext').textContent = T('obNext');
  $('onboardNext').disabled = !Onboard.net;

  const opts = {
    onPickProvider: (id) => {
      Onboard.provider = id;   // 记下选择，第 4 步会预选中
      Onboard.step = 3;
      renderOnboard();
    },
    onDone: (r) => {
      Onboard.net = r;
      $('onboardNext').disabled = false;
    },
  };
  // 已经测过就直接渲染缓存结果，来回切步骤不重复测
  if (Onboard.net) showNetCheck($('obNetBox'), Onboard.net, opts);
  else runNetCheck($('obNetBox'), opts);
}

// ── 第 3 步：选引擎 ──
// 引擎不内置：每张卡自带「安装」按钮（npm 全局安装 + 实时进度），装好之前不能选中。
// 两个动作各有一个显眼的大按钮：未安装 → 立即安装；已安装 → 选择这个引擎。
const ENGINE_META = {
  claude: { name: 'Claude Code', pkg: '@anthropic-ai/claude-code' },
  codex: { name: 'Codex', pkg: '@openai/codex' },
};

function engineReady(id) {
  return !!((Onboard.status || {})[id] || {}).ready;
}

function renderOnboardEngine() {
  $('onboardTitle').textContent = T('obStepEngine');
  $('onboardSub').textContent = T('obStepEngineSub');
  $('onboardBody').innerHTML = ['claude', 'codex'].map(onboardEngineCard).join('');

  // 卡片本身也能点（已安装才生效）；没装的卡片点了就提示"先装"，不静默无反应
  $('onboardBody').querySelectorAll('.ob-card').forEach((el) => {
    el.onclick = (ev) => {
      if (ev.target.closest('button')) return; // 按钮各自处理
      const id = el.dataset.engine;
      if (engineReady(id)) pickOnboardEngine(id);
      else $(`obInstMsg-${id}`).textContent = T('obNeedInstallFirst');
    };
  });
  $('onboardBody').querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => pickOnboardEngine(b.dataset.pick);
  });
  $('onboardBody').querySelectorAll('[data-install]').forEach((b) => {
    b.onclick = () => installOnboardEngine(b.dataset.install);
  });

  $('onboardBack').hidden = false;
  $('onboardNext').textContent = T('obNext');
  // 只有"选中的引擎确实装好了"才能继续
  $('onboardNext').disabled = !Onboard.engine || !engineReady(Onboard.engine);
}

// 单张引擎卡：状态徽章 + 说明 + 一个大按钮（安装 / 选择）+ 该卡自己的进度区
function onboardEngineCard(id) {
  const meta = ENGINE_META[id];
  const a = (Onboard.status || {})[id] || {};
  const ready = !!a.ready;
  const picked = Onboard.engine === id;
  const badge = ready
    ? `<span class="ob-badge ok">✓ ${T('obInstalled')}</span>`
    : `<span class="ob-badge warn">✕ ${T('obNotInstalled')}</span>`;
  const note = ready ? T('obFromSystem') : T('obInstallHint');
  const busy = Onboard.installing === id;
  const action = ready
    ? `<button type="button" class="ob-act ob-act-pick${picked ? ' on' : ''}" data-pick="${id}">` +
      `${picked ? `✓ ${T('obEnginePicked')}` : T('obEnginePick')}</button>`
    : `<button type="button" class="ob-act ob-act-inst" data-install="${id}"${busy ? ' disabled' : ''}>` +
      `⤓ ${T('obEngineInstall')}</button>` +
      `<span class="ob-act-hint">npm install -g ${meta.pkg}</span>`;
  return (
    `<div class="ob-card ob-engine${picked ? ' on' : ''}${ready ? '' : ' locked'}" data-engine="${id}">` +
    `<div class="ob-card-h"><b>${meta.name}</b>${badge}` +
    (picked ? `<span class="ob-sel">✓ ${T('obSelected')}</span>` : '') +
    `</div>` +
    `<div class="ob-card-d">${id === 'claude' ? T('obClaudeDesc') : T('obCodexDesc')}</div>` +
    `<div class="ob-card-n">${note}</div>` +
    `<div class="ob-act-row">${action}</div>` +
    `<div class="ob-inst-msg ob-pre" id="obInstMsg-${id}"></div>` +
    `</div>`
  );
}

function pickOnboardEngine(id) {
  if (!engineReady(id)) return; // 没装的引擎不给选
  Onboard.engine = id;
  // 换引擎后服务商候选可能变化：已选的若不再可选就清空（不自动替用户选，必须显式选）
  if (Onboard.provider && !onboardProviderList().some((p) => p.id === Onboard.provider))
    Onboard.provider = '';
  renderOnboard();
}

// 一键安装：npm 全局安装该引擎，过程中在本卡内显示实时进度（同时只允许装一个）
async function installOnboardEngine(id) {
  if (Onboard.installing) return;
  Onboard.installing = id;
  const msg = $(`obInstMsg-${id}`);
  const btn = $('onboardBody').querySelector(`[data-install="${id}"]`);
  if (btn) btn.disabled = true;
  $('onboardBody').querySelectorAll('[data-install]').forEach((b) => { b.disabled = true; });
  // 引擎包 400-500MB：显示实时进度（npm 最新一行 + 已用时），否则几分钟的静默会被当成卡死
  const stop = startEngineInstallProgress(msg, `${ENGINE_META[id].name} ${T('obInstalling')}`);
  try {
    await api('/api/engine/update', { engine: id });
    stop();
    Onboard.installing = '';
    Onboard.status = await api('/api/engine/status');
    renderOnboard();
    const done = $(`obInstMsg-${id}`);
    if (done) done.textContent = T('obInstallOk');
  } catch (e) {
    stop();
    Onboard.installing = '';
    msg.textContent =
      T('obInstallFail') + (e.message || '') + '\n' + T('obInstallManual') +
      `\n  npm install -g ${ENGINE_META[id].pkg}`;
    $('onboardBody').querySelectorAll('[data-install]').forEach((b) => { b.disabled = false; });
    if (btn) btn.textContent = `⤓ ${T('obInstallRetry')}`;
  }
}

// ── 第 4 步：选服务商 ──
function renderOnboardProvider() {
  $('onboardTitle').textContent = T('obStepProvider');
  $('onboardSub').textContent = T('obStepProviderSub');
  const list = onboardProviderList();
  $('onboardBody').innerHTML = list
    .map((p) => {
      const tag = p.id === 'official'
        ? `<span class="ob-badge">${T('obNoKeyNeeded')}</span>`
        : `<span class="ob-badge warn">${T('obKeyNeeded')}</span>`;
      const rec = p.recommended ? `<span class="ob-badge ok">${T('obRecommended')}</span>` : '';
      const vis = p.vision ? `<span class="ob-badge ok">${T('obVision')}</span>` : '';
      // 名称与说明走翻译层（后端只给 id；认不出的新服务商回落到后端文案）
      const name = providerLabel(p.id, p.label);
      return obCard(Onboard.provider === p.id, `data-pv="${p.id}"`, `<b>${name}</b>${rec}${vis}${tag}`, providerNote(p.id, p.note));
    })
    .join('') +
    (Onboard.engine === 'codex' ? `<div class="ob-note">${T('obCodexOnly')}</div>` : '');

  $('onboardBody').querySelectorAll('.ob-card').forEach((el) => {
    el.onclick = () => { Onboard.provider = el.dataset.pv; renderOnboard(); };
  });
  $('onboardBack').hidden = false;
  // 原版 Claude 后面还有「登录账号」一步；原版 Codex 到此为止
  const last = Onboard.provider === 'official' && !onboardNeedsLogin();
  $('onboardNext').textContent = last ? T('obDone') : T('obNext');
  $('onboardNext').disabled = !Onboard.provider;
}

// ── 第 5 步（原版 Claude）：登录 Anthropic 账号 ──
// 这是小白最容易卡死的一步：没登录时发消息完全没反应、也没有任何报错。
// 登录链接由后端从 `claude auth login` 的输出里抠出来，这里只负责摆成一个按钮 + 四步指引。
function renderOnboardLogin() {
  $('onboardTitle').textContent = T('obStepLogin');
  $('onboardSub').textContent = T('obStepLoginSub');
  $('onboardBody').innerHTML =
    `<div id="obLoginBox"></div>` +
    `<div class="ob-note"><a href="#" id="obLoginSkip">${T('obLoginSkip')}</a></div>`;
  $('onboardBack').hidden = false;
  $('onboardNext').textContent = T('obDone');
  $('onboardNext').disabled = !(Onboard.loggedIn || Onboard.loginSkipped);

  $('obLoginSkip').onclick = (ev) => {
    ev.preventDefault();
    Onboard.loginSkipped = true;
    $('onboardNext').disabled = false;
  };
  renderClaudeLogin($('obLoginBox'), {
    onLoggedIn: () => {
      Onboard.loggedIn = true;
      $('onboardNext').disabled = false;
    },
  }).then((a) => {
    // 已经登录过（或用的是第三方服务商）就直接放行
    if (a && (a.loggedIn || !a.needsLogin)) {
      Onboard.loggedIn = true;
      $('onboardNext').disabled = false;
    }
  });
}

// ── 第 5 步（第三方服务商）：填 API Key（含开通链接与指南）+ 选模型 ──
function renderOnboardKey() {
  const meta = onboardProviderMeta(Onboard.provider) || {};
  $('onboardTitle').textContent = `${T('obStepKey')} · ${providerLabel(Onboard.provider, meta.label)}`;
  $('onboardSub').textContent = T('obStepKeySub');
  // 只首推 MiniMax，不再为其他服务商做「免费额度」这类推荐性提示
  const freeOrPaid = T('obKeyStepPaid');
  $('onboardBody').innerHTML =
    `<div class="ob-guide">
       <b>${T('obHowToKey')}</b>
       <ol>
         <li>${T('obKeyStep1')}</li>
         <li>${T('obKeyStep2')}</li>
         <li>${T('obKeyStep3')}</li>
         <li>${freeOrPaid}</li>
       </ol>
       <div class="ob-links">
         <a href="${meta.signupUrl || '#'}" target="_blank" rel="noreferrer">${T('obOpenConsole')}</a>
         <a href="${meta.docsUrl || '#'}" target="_blank" rel="noreferrer">${T('obOfficialDocs')}</a>
       </div>
     </div>
     <input type="password" id="onboardKey" placeholder="${T('obKeyPlaceholder')}" autocomplete="off" value="${Onboard.key}" />
     <button type="button" id="onboardFetch">${T('obFetchModels')}</button>
     <div class="ob-note" id="onboardKeyMsg"></div>
     <div id="onboardModelWrap" hidden>
       <label class="ob-lbl">${T('obPickModel')}</label>
       <select id="onboardModel"></select>
     </div>`;

  $('onboardKey').oninput = (e) => { Onboard.key = e.target.value; };
  $('onboardFetch').onclick = onboardFetchModels;
  $('onboardBack').hidden = false;
  $('onboardNext').textContent = T('obDone');
  $('onboardNext').disabled = false;
  setTimeout(() => $('onboardKey').focus(), 50);
}

async function onboardFetchModels() {
  const key = ($('onboardKey').value || '').trim();
  const msg = $('onboardKeyMsg');
  if (!key) { msg.textContent = T('obNeedKeyFirst'); return; }
  Onboard.key = key;
  msg.textContent = T('obConnecting');
  try {
    const r = await api(
      `/api/engine/models?provider=${encodeURIComponent(Onboard.provider)}&apiKey=${encodeURIComponent(key)}`,
    );
    Onboard.models = (r && r.models) || [];
    const sel = $('onboardModel');
    sel.innerHTML = Onboard.models.map((m) => `<option value="${m}">${m}</option>`).join('');
    $('onboardModelWrap').hidden = Onboard.models.length === 0;
    Onboard.model = Onboard.models[0] || '';
    sel.onchange = () => { Onboard.model = sel.value; };
    msg.textContent = `${Onboard.models.length} ${T('obGotModels')}`;
  } catch (e) {
    msg.textContent = T('obFetchFail') + (e.message || '');
  }
}

// ── 上一步 / 下一步 ──
function onboardBack() {
  if (Onboard.step > 1) { Onboard.step -= 1; renderOnboard(); }
}

async function onboardNext() {
  if (Onboard.busy) return;
  // 引擎没装好不放行（按钮本身也是禁用的，这里兜底防止回车/脚本触发）
  if (Onboard.step === 3 && !engineReady(Onboard.engine)) return;
  if (Onboard.step === 1 || Onboard.step === 2 || Onboard.step === 3) {
    Onboard.step += 1;
    renderOnboard();
    return;
  }
  if (Onboard.step === 4) {
    // 原版 Claude 还要登录账号；原版 Codex 用的是 ChatGPT 登录态，这里直接收尾
    if (Onboard.provider === 'official' && !onboardNeedsLogin()) { await onboardFinish(''); return; }
    Onboard.step = 5;
    renderOnboard();
    return;
  }
  // 第 5 步：原版 Claude 走登录，第三方走 API Key
  if (onboardNeedsLogin()) { await onboardFinish(''); return; }
  const key = ($('onboardKey').value || '').trim();
  if (!key) { $('onboardKeyMsg').textContent = T('obNeedKeyOrOfficial'); return; }
  // claude 引擎必须选定模型（codex 的模型由 profile 固定，无需选）
  if (Onboard.engine === 'claude' && !Onboard.model) {
    $('onboardKeyMsg').textContent = T('obNeedModel');
    return;
  }
  await onboardFinish(key);
}

// 保存：默认引擎 + 服务商/Key/模型 + 标记引导完成
async function onboardFinish(key) {
  Onboard.busy = true;
  const btn = $('onboardNext');
  btn.disabled = true;
  btn.textContent = T('obSaving');
  try {
    await api('/api/settings', { defaultEngine: Onboard.engine, onboarded: true, setupDone: true });
    if (Onboard.engine === 'codex' && Onboard.provider === 'kimi') {
      // codex 走 config.toml 档位 + Kimi 密钥（与 claude 的 ANTHROPIC_* 机制不同）
      await api('/api/codex/key', { key });
      await api('/api/codex/profile', { profile: 'kimi' });
    } else if (Onboard.engine === 'codex') {
      await api('/api/codex/profile', { profile: 'chatgpt' });
    } else {
      await api('/api/engine/config', {
        engine: 'claude',
        provider: Onboard.provider,
        apiKey: key,
        model: Onboard.model || '',
      });
    }
    hideOnboard();
    applyText();
    // 新用户：引导走完，最后一步才设定访问密码（设完由 doSetup 进主界面）
    if (typeof NEEDS_SETUP !== 'undefined' && NEEDS_SETUP) { showSetup(); return; }
    if (typeof loadSettings === 'function') await loadSettings();
  } catch (e) {
    const msg = $('onboardKeyMsg') || $('onboardSub');
    msg.textContent = T('obSaveFail') + (e.message || '');
    btn.disabled = false;
    btn.textContent = T('obDone');
  } finally {
    Onboard.busy = false;
  }
}
