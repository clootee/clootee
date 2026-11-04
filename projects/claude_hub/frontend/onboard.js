// 首次进入：只选语言 → 选供应商 → Clootee 原地邮箱登录 / 展开其他供应商。
// 其他供应商沿用现有引擎安装、账号登录或 API Key 配置。

const OB_STEPS = 5;

// 安装入口必须先明确选语言；供应商由用户点击后才开始配置。
const Onboard = {
  mode: 'language',         // language / providers / quick / advanced
  otherOpen: false,
  choicesLoading: false,
  choicesError: '',
  entryProvider: false,
  quickTimer: null,
  quick: null,           // 一键开始的进度：{ stage, error, grantedMicro }
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
  installErrors: {},     // 失败后只允许手动重试，避免自动重试循环
  stopInstallProgress: null,
};

async function showOnboard() {
  clearTimeout(Onboard.quickTimer);
  Onboard.mode = 'language';
  Onboard.langSet = false;
  Onboard.quick = null;
  Onboard.step = 1;
  Onboard.busy = false;
  Onboard.installing = '';
  Onboard.installErrors = {};
  Onboard.otherOpen = false;
  Onboard.choicesLoading = false;
  Onboard.choicesError = '';
  Onboard.entryProvider = false;
  $('onboardOverlay').hidden = false;
  renderOnboard();
}

function hideOnboard() {
  clearTimeout(Onboard.quickTimer);
  $('onboardOverlay').hidden = true;
}

function onboardProviderList() {
  return Onboard.providers.filter((p) => p.id !== 'custom' && p.id !== 'clootee' && (!p.engines || p.engines.includes(Onboard.engine)));
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
  const languageOnly = !Onboard.langSet;
  $('onboardOverlay').classList.toggle('ob-language-only', languageOnly);
  $('onboardTitle').hidden = languageOnly;
  $('onboardSub').hidden = languageOnly;
  $('onboardOverlay').querySelector('.ob-foot').hidden = languageOnly || Onboard.mode === 'providers';
  $('onboardNext').hidden = false;
  if (languageOnly) { renderOnboardLanguage(); return; }
  if (Onboard.mode === 'providers') { renderOnboardEntryProviders(); return; }

  if (Onboard.mode === 'quick') { renderOnboardQuick(); return; }
  $('onboardSteps').hidden = false;
  let html = '';
  for (let n = 1; n <= OB_STEPS; n++) {
    const cls = n === Onboard.step ? 'ob-dot on' : n < Onboard.step ? 'ob-dot done' : 'ob-dot';
    html += (n > 1 ? '<span class="ob-line"></span>' : '') + `<span class="${cls}">${n}</span>`;
  }
  $('onboardSteps').innerHTML = html;

  $('onboardSkip').hidden = true; // 高级引导：进来了就逐项选完，不提供跳过
  $('onboardBack').textContent = T('obBack');
  $('onboardBack').disabled = false;

  if (Onboard.step === 1) renderOnboardLocale();
  else if (Onboard.step === 2) renderOnboardNet();
  else if (Onboard.step === 3) renderOnboardEngine();
  else if (Onboard.step === 4) renderOnboardProvider();
  else if (onboardNeedsLogin()) renderOnboardLogin();
  else renderOnboardKey();
}

function renderOnboardLanguage() {
  $('onboardSteps').hidden = true;
  $('onboardTitle').textContent = '';
  $('onboardSub').textContent = '';
  $('onboardBody').innerHTML = '<div class="ob-language-buttons"><button type="button" data-language="zh">中文</button><button type="button" data-language="en">English</button></div>';
  $('onboardBody').querySelectorAll('[data-language]').forEach(button => {
    button.onclick = () => {
      Onboard.langSet = true;
      setLang(button.dataset.language);
      Onboard.mode = 'providers';
      renderOnboard();
    };
  });
}

async function loadOnboardChoices() {
  Onboard.choicesLoading = true;
  Onboard.choicesError = '';
  renderOnboard();
  try {
    const [pv, st] = await Promise.all([api('/api/engine/providers'), api('/api/engine/status?refresh=1')]);
    Onboard.providers = pv?.providers || [];
    Onboard.status = st || null;
    if (!Onboard.providers.length) throw new Error(T('obProviderLoadFailed'));
  } catch (e) {
    Onboard.choicesError = e.message || T('obProviderLoadFailed');
  } finally {
    Onboard.choicesLoading = false;
    if (Onboard.mode === 'providers') renderOnboard();
  }
}

function renderOnboardEntryProviders() {
  $('onboardSteps').hidden = true;
  $('onboardTitle').textContent = T('obChooseProvider');
  $('onboardSub').textContent = '';
  const list = Onboard.providers.filter(p => p.id !== 'custom' && p.id !== 'clootee');
  $('onboardBody').innerHTML = `
    <button type="button" class="ob-provider-choice ob-provider-default" data-clootee><strong>Clootee</strong><span>${escapeHtml(T('obClooteeStarter'))}</span></button>
    <button type="button" class="ob-provider-other" data-other aria-expanded="${Onboard.otherOpen}" aria-controls="obOtherProviders">${escapeHtml(T('obOtherProviders'))}</button>
    <div id="obOtherProviders"${Onboard.otherOpen ? '' : ' hidden'}>
      ${Onboard.choicesLoading ? `<p role="status">${escapeHtml(T('loading'))}</p>` : Onboard.choicesError ? `<p role="alert">${escapeHtml(Onboard.choicesError)}</p><button type="button" data-reload>${escapeHtml(T('obQuickRetry'))}</button>` : list.map(p => `<button type="button" class="ob-provider-choice" data-entry-provider="${escapeHtml(p.id)}"><strong>${escapeHtml(providerLabel(p.id,p.label))}</strong><span>${escapeHtml(providerNote(p.id,p.note))}</span></button>`).join('')}
    </div>`;
  $('onboardBody').querySelector('[data-clootee]').onclick = () => {
    Onboard.mode = 'quick';
    void runQuickStart();
  };
  $('onboardBody').querySelector('[data-other]').onclick = () => {
    Onboard.otherOpen = !Onboard.otherOpen;
    if (Onboard.otherOpen && !Onboard.providers.length && !Onboard.choicesLoading) void loadOnboardChoices();
    else renderOnboard();
  };
  const retry = $('onboardBody').querySelector('[data-reload]');
  if (retry) retry.onclick = () => { void loadOnboardChoices(); };
  $('onboardBody').querySelectorAll('[data-entry-provider]').forEach(button => {
    button.onclick = () => {
      Onboard.provider = button.dataset.entryProvider;
      Onboard.engine = '';
      Onboard.loggedIn = false; Onboard.loginSkipped = false;
      Onboard.key = ''; Onboard.model = ''; Onboard.models = [];
      Onboard.entryProvider = true;
      Onboard.mode = 'advanced';
      Onboard.step = 3;
      renderOnboard();
    };
  });
}

// 最后一步该走「登录 Claude 账号」还是「填 API Key」：
// 原版 Claude 用的是账号登录，第三方服务商用的是 API Key，两者互斥。
function onboardNeedsLogin() {
  return Onboard.provider === 'official';
}


// ── 一键开始 ──
// 四个阶段逐个打勾；失败停在出错的那一步，原地给「重试」和「改用自己的服务商」两条路。
const QUICK_STAGES = ['obQuickS1', 'obQuickS2', 'obQuickS3', 'obQuickS4'];

function renderOnboardQuick() {
  const q = Onboard.quick;
  $('onboardSteps').hidden = true;
  $('onboardTitle').textContent = T('obQuickTitle');
  $('onboardSub').textContent = T('obQuickSub');
  let stages = '';
  if (q) {
    stages = '<ol class="ob-quick-stages">' + QUICK_STAGES.map((k, i) => {
      const st = i < q.stage ? 'done' : i === q.stage ? (q.error ? 'err' : 'run') : 'todo';
      const icon = st === 'done' ? '✓' : st === 'err' ? '✕' : st === 'run' ? '<span class="ob-spin"></span>' : '·';
      let extra = '';
      if (i === 1 && q.grantedMicro) extra = ` <span class="ob-badge ok">${T('obQuickGranted').replace('{v}', formatUsd(q.grantedMicro))}</span>`;
      return `<li class="${st}"><span class="ob-qi">${icon}</span>${T(k)}${extra}</li>`;
    }).join('') + '</ol>';
    if (q.stage === 2 && !q.error) stages += `<div class="ob-note">${T('obQuickInstallNote')}</div>`;
    stages += `<div class="ob-inst-msg ob-pre" id="obQuickLog"${q.stage === 2 || q.error ? '' : ' hidden'}></div>`;
    if (q.error) stages += `<div class="ob-quick-err">${escapeHtml(q.error)}</div>`;
  }
  $('onboardBody').innerHTML = stages;
  // 「以后再说」按钮在一键模式下改作「高级」入口：始终可见，失败时它就是那条免费的替代路
  const adv = $('onboardSkip');
  adv.hidden = false;
  adv.className = 'link';
  adv.textContent = T('obQuickAdvanced');
  adv.disabled = Onboard.busy;
  adv.onclick = () => {
    if (Onboard.busy) return;
    clearTimeout(Onboard.quickTimer);
    Onboard.mode = 'providers';
    adv.onclick = null;
    adv.className = '';
    renderOnboard();
  };
  $('onboardBack').hidden = true;
  const next = $('onboardNext');
  next.disabled = Onboard.busy;
  next.textContent = q && q.error ? T('obQuickRetry') : T('obQuickStart');
}

function formatUsd(micro) {
  const usd = Number(micro || 0) / 1e6;
  return new Intl.NumberFormat(currentLang(),{style:'currency',currency:'CNY'}).format(usd);
}

async function runQuickStart() {
  if (!Onboard.langSet) { renderOnboard(); return; }
  clearTimeout(Onboard.quickTimer);
  Onboard.busy = true;
  // 失败重试时从出错的那一步继续，已完成的不再重做
  const q = Onboard.quick || { stage: 0, error: '', grantedMicro: 0 };
  q.error = '';
  Onboard.quick = q;
  renderOnboard();
  const stageDone = () => { q.stage += 1; renderOnboard(); };
  try {
    // ① 本机访问凭据：还没设密码就生成随机密码并直接登录（浏览器记住 token）
    if (q.stage === 0) {
      if (NEEDS_SETUP) {
        const r = await api('/api/auth/quickstart', {});
        TOKEN = r.token;
        localStorage.setItem('token', TOKEN);
        NEEDS_SETUP = false;
      }
      stageDone();
    }
    // ② 当前窗口完成邮箱登录后切换供应商。
    if (q.stage === 1) {
      let st;
      try {
        const status=await api('/api/console/status');
        if(!status.registered||status.error)await Clootee.signIn();
        st = await api('/api/console/activate', {});
      }
      catch (e) { throw new Error(`${T('obQuickFailNet')}\n${e.message || ''}`); }
      q.grantedMicro = st && st.balanceMicro;
      stageDone();
    }
    // ③ 装 Claude Code（已装就跳过）
    if (q.stage === 2) {
      const status = await api('/api/engine/status?refresh=1');
      if (!(status && status.claude && status.claude.ready)) {
        const log = $('obQuickLog');
        const stop = startEngineInstallProgress(log, T('obQuickS3'));
        try { await api('/api/engine/update', { engine: 'claude' }); }
        catch (e) { stop(); throw new Error(`${T('obInstallFail')}${e.message || ''}\n${T('obInstallManual')}\n  npm install -g @anthropic-ai/claude-code`); }
        stop();
        const after = await api('/api/engine/status?refresh=1');
        if (!(after && after.claude && after.claude.ready)) throw new Error(T('obInstallFail'));
      }
      stageDone();
    }
    // ④ 记下默认引擎、引导完成，进主界面
    await api('/api/settings', { defaultEngine: 'claude', onboarded: true, setupDone: true });
    q.stage = QUICK_STAGES.length;
    renderOnboard();
    Onboard.busy = false;
    hideOnboard();
    applyText();
    await startApp();
  } catch (e) {
    q.error = e.message || String(e);
    Onboard.busy = false;
    renderOnboard();
  } finally {
    Onboard.busy = false;
  }
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
// 进入这一步自动依次安装缺少的引擎，失败时才显示重试；装好后由用户选择引擎。
const ENGINE_META = {
  claude: { name: 'Claude Code', pkg: '@anthropic-ai/claude-code' },
  codex: { name: 'Codex', pkg: '@openai/codex' },
};

function engineReady(id) {
  return !!((Onboard.status || {})[id] || {}).ready;
}

function renderOnboardEngine() {
  if (Onboard.stopInstallProgress) {
    Onboard.stopInstallProgress();
    Onboard.stopInstallProgress = null;
  }
  $('onboardTitle').textContent = T('obStepEngine');
  $('onboardSub').textContent = T('obStepEngineSub');
  const allowed = Onboard.entryProvider ? (onboardProviderMeta(Onboard.provider)?.engines || ['claude','codex']) : ['claude','codex'];
  $('onboardBody').innerHTML = ['claude', 'codex'].filter(id => allowed.includes(id)).map(onboardEngineCard).join('');

  // 已装好的卡片可以直接选择；缺少的引擎自动安装。
  $('onboardBody').querySelectorAll('.ob-card').forEach((el) => {
    el.onclick = (ev) => {
      if (ev.target.closest('button')) return; // 按钮各自处理
      const id = el.dataset.engine;
      if (engineReady(id)) pickOnboardEngine(id);
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
  $('onboardBack').disabled = !!Onboard.installing;
  $('onboardNext').disabled = !!Onboard.installing || !Onboard.engine || !engineReady(Onboard.engine);
  if (Onboard.installing) {
    const id = Onboard.installing;
    Onboard.stopInstallProgress = startEngineInstallProgress(
      $(`obInstMsg-${id}`), `${ENGINE_META[id].name} ${T('obInstalling')}`,
    );
  } else {
    const missing = Object.keys(ENGINE_META).find((id) => allowed.includes(id) && !engineReady(id) && !Onboard.installErrors[id]);
    if (missing) void installOnboardEngine(missing);
  }
}

// 单张引擎卡：状态徽章 + 说明 + 一个大按钮（安装 / 选择）+ 该卡自己的进度区
function onboardEngineCard(id) {
  const meta = ENGINE_META[id];
  const a = (Onboard.status || {})[id] || {};
  const ready = !!a.ready;
  const picked = Onboard.engine === id;
  const busy = Onboard.installing === id;
  const error = Onboard.installErrors[id];
  const badge = ready
    ? `<span class="ob-badge ok">✓ ${T('obInstalled')}</span>`
    : `<span class="ob-badge warn">${T(busy ? 'obInstalling' : error ? 'obNotInstalled' : 'obInstallQueued')}</span>`;
  const note = ready ? T('obFromSystem') : error ? T('obInstallManual') : T('obInstallHint');
  const action = ready
    ? `<button type="button" class="ob-act ob-act-pick${picked ? ' on' : ''}" data-pick="${id}">` +
      `${picked ? `✓ ${T('obEnginePicked')}` : T('obEnginePick')}</button>`
    : `<button type="button" class="ob-act ob-act-inst" data-install="${id}"${Onboard.installing || !error ? ' disabled' : ''}>` +
      `⤓ ${T(busy ? 'obInstalling' : error ? 'obInstallRetry' : 'obInstallQueued')}</button>`;
  return (
    `<div class="ob-card ob-engine${picked ? ' on' : ''}${ready ? '' : ' locked'}" data-engine="${id}">` +
    `<div class="ob-card-h"><b>${meta.name}</b>${badge}` +
    (picked ? `<span class="ob-sel">✓ ${T('obSelected')}</span>` : '') +
    `</div>` +
    `<div class="ob-card-d">${id === 'claude' ? T('obClaudeDesc') : T('obCodexDesc')}</div>` +
    `<div class="ob-card-n">${note}</div>` +
    `<div class="ob-act-row">${action}</div>` +
    `<div class="ob-inst-msg ob-pre" id="obInstMsg-${id}" role="status" aria-live="polite">${escapeHtml(error || '')}</div>` +
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

// 全局安装沿用同一条进度通道，依次执行以免两个引擎的日志串台。
async function installOnboardEngine(id) {
  if (Onboard.installing || engineReady(id)) return;
  Onboard.installing = id;
  delete Onboard.installErrors[id];
  renderOnboardEngine();
  try {
    await api('/api/engine/update', { engine: id });
    Onboard.status = await api('/api/engine/status?refresh=1');
    if (!engineReady(id)) throw new Error(T('obNotInstalled'));
  } catch (e) {
    Onboard.installErrors[id] =
      T('obInstallFail') + (e.message || '') + '\n' + T('obInstallManual') +
      `\n  npm install -g ${ENGINE_META[id].pkg}`;
  } finally {
    if (Onboard.stopInstallProgress) Onboard.stopInstallProgress();
    Onboard.stopInstallProgress = null;
    Onboard.installing = '';
    if (Onboard.step === 3 && Onboard.mode === 'advanced') renderOnboardEngine();
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
      const name = escapeHtml(providerLabel(p.id, p.label));
      return obCard(Onboard.provider === p.id, `data-pv="${escapeHtml(p.id)}"`, `<b>${name}</b>${rec}${vis}${tag}`, escapeHtml(providerNote(p.id, p.note)));
    })
    .join('');

  $('onboardBody').querySelectorAll('.ob-card').forEach((el) => {
    el.onclick = () => {
      if (Onboard.provider !== el.dataset.pv) {
        Onboard.key = ''; Onboard.model = ''; Onboard.models = [];
      }
      Onboard.provider = el.dataset.pv;
      renderOnboard();
    };
  });
  $('onboardBack').hidden = false;
  // 原版（Claude 或 Codex）后面还有「登录账号」一步；第三方服务商到此为止（下一步填 Key）
  const last = Onboard.provider === 'official' && !onboardNeedsLogin();
  $('onboardNext').textContent = last ? T('obDone') : T('obNext');
  $('onboardNext').disabled = !Onboard.provider;
}

// ── 第 5 步（原版 Claude / 原版 Codex）：登录账号 ──
// 这是小白最容易卡死的一步：没登录时发消息完全没反应、也没有任何报错。
// 两个引擎登录链接的抠取方式不同（见 health.js 的 renderClaudeLogin / renderCodexLogin），
// 这里只按当前引擎挑一个来渲染，UI 骨架一致。
function renderOnboardLogin() {
  const isClaude = Onboard.engine === 'claude';
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
  const onLoggedIn = () => {
    Onboard.loggedIn = true;
    $('onboardNext').disabled = false;
  };
  const render = isClaude ? renderClaudeLogin : renderCodexLogin;
  render($('obLoginBox'), { onLoggedIn }).then((a) => {
    // 已经登录过（或用的是第三方服务商）就直接放行
    if (a && (a.loggedIn || (isClaude && !a.needsLogin))) onLoggedIn();
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
     <input type="password" id="onboardKey" placeholder="${T('obKeyPlaceholder')}" autocomplete="off" />
     <button type="button" id="onboardFetch">${T('obFetchModels')}</button>
     <div class="ob-note" id="onboardKeyMsg"></div>
     <div id="onboardModelWrap">
       <label class="ob-lbl">${T('obPickModel')}</label>
       <input id="onboardModel" list="onboardModelList" placeholder="${T('engModelPh')}" />
       <datalist id="onboardModelList"></datalist>
       <div class="ob-note">${T('engModelHintCustom')}</div>
     </div>`;

  $('onboardKey').value = Onboard.key;
  $('onboardKey').oninput = (e) => { Onboard.key = e.target.value; };
  $('onboardModel').value = Onboard.model || '';
  $('onboardModel').oninput = (e) => { Onboard.model = e.target.value.trim(); };
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
    $('onboardModelList').replaceChildren(...Onboard.models.map((m) => new Option(m, m)));
    Onboard.model = Onboard.model || r.recommended || Onboard.models[0] || '';
    sel.value = Onboard.model;
    msg.textContent = `${Onboard.models.length} ${T('obGotModels')}`;
  } catch (e) {
    msg.textContent = T('obFetchFail') + (e.message || '');
  }
}

// ── 上一步 / 下一步 ──
function onboardBack() {
  if (Onboard.installing) return;
  if (Onboard.entryProvider && Onboard.step === 3) { Onboard.mode = 'providers'; renderOnboard(); return; }
  if (Onboard.entryProvider && Onboard.step === 5) { Onboard.step = 3; renderOnboard(); return; }
  if (Onboard.step > 1) { Onboard.step -= 1; renderOnboard(); }
}

async function onboardNext() {
  if (Onboard.busy) return;
  if (!Onboard.langSet || Onboard.mode === 'providers') return;
  if (Onboard.mode === 'quick') { await runQuickStart(); return; }
  // 引擎没装好不放行（按钮本身也是禁用的，这里兜底防止回车/脚本触发）
  if (Onboard.step === 3 && (Onboard.installing || !engineReady(Onboard.engine))) return;
  if (Onboard.step === 1 || Onboard.step === 2 || Onboard.step === 3) {
    Onboard.step = Onboard.step === 3 && Onboard.entryProvider && Onboard.provider ? 5 : Onboard.step + 1;
    renderOnboard();
    return;
  }
  if (Onboard.step === 4) {
    // 原版（Claude / Codex）还要登录账号，走第 5 步；第三方服务商到此直接收尾（下一步填 Key）
    if (Onboard.provider === 'official' && !onboardNeedsLogin()) { await onboardFinish(''); return; }
    Onboard.step = 5;
    renderOnboard();
    return;
  }
  // 第 5 步：原版 Claude 走登录，第三方走 API Key
  if (Onboard.provider === 'clootee') { await onboardFinish(''); return; }
  if (onboardNeedsLogin()) { await onboardFinish(''); return; }
  const key = ($('onboardKey').value || '').trim();
  if (!key) { $('onboardKeyMsg').textContent = T('obNeedKeyOrOfficial'); return; }
  // Both third-party engines need an explicit model.
  if (!Onboard.model) {
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
    if (Onboard.provider === 'clootee') {
      const status=await api('/api/console/status');
      if(!status.registered||status.error)await Clootee.signIn();
    }
    await api('/api/engine/config', {
      engine: Onboard.engine,
      provider: Onboard.provider,
      apiKey: key,
      model: Onboard.model || '',
    });
    await api('/api/settings', { defaultEngine: Onboard.engine, onboarded: true, setupDone: true });
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
