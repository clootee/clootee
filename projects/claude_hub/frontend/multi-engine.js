// Named, independent engine instances; a session group keeps its original configuration.
const MultiUi = {
  text(key) {
    const copy = {
      title: ['多引擎', 'Multiple engines'], add: ['添加引擎', 'Add engine'], remove: ['移除', 'Remove'],
      details: ['了解详情', 'Learn more'],
      confirmRemoveGroup: ['删除此父会话及其全部引擎子会话？', 'Delete this parent session and all its engine sessions?'],
      chooseSessionEngine: ['选择本次会话的引擎', 'Choose an engine for this session'],
      chooseDelivery: ['选择发送范围', 'Choose recipients'],
      sendAll: ['发送给所有引擎', 'Send to all engines'],
      sendCurrent: ['仅发送给当前引擎', 'Send only to current engine'],
      sendAllNote: ['所有引擎同时处理本次消息', 'All engines process this message in parallel'],
      singleSession: ['单引擎会话', 'Single-engine session'],
      multiDisabled: ['多引擎（已关闭）', 'Multiple engines (disabled)'],
      multiSession: ['并行运行 {n} 个引擎', 'Run {n} engines in parallel'],
      multiSetup: ['请先在设置中配置至少两个引擎', 'Configure at least two engines in Settings first'],

      fetchModels: ['拉取模型', 'Fetch models'], fetchingModels: ['拉取中…', 'Fetching…'],
      fetchedModels: ['已获取 {n} 个模型', 'Loaded {n} models'], emptyModels: ['未获取到模型，请手动输入或重试。', 'No models returned. Enter a model ID or retry.'],
      manualModel: ['手动输入模型 ID', 'Enter a model ID'], autoModel: ['自动', 'Automatic'],
      needKey: ['请先填写此引擎的 API Key。', 'Enter this engine’s API key first.'], needBase: ['请先填写 Base URL。', 'Enter a Base URL first.'],

      toggleFailed: ['开关未保存，请重新勾选重试。', 'The switch was not saved. Toggle it again to retry.'],
      loadingConfig: ['正在带入已保存的配置…', 'Loading saved configuration…'],
      note: ['开启后，新建会话可选择「多引擎」；选择后每次发送可选择全部或当前引擎，工作目录为 divide/英文名。初始复制根目录的 CLAUDE.md、AGENTS.md，公共提示词持续生效。配置修改仅影响新会话；并发上限至少调整为引擎数。', 'When enabled, new sessions can choose Multiple engines to choose all engines or the current engine for each message in divide/name. CLAUDE.md and AGENTS.md are copied initially; shared prompts remain active. Changes apply to new sessions. The concurrency limit is raised to at least the engine count.'],
      name: ['英文名称', 'English name'], nameNote: ['字母开头，仅英文字母、数字、下划线，最多40字符，名称不能重复。', 'Start with a letter; use letters, numbers and underscores, up to 40 characters. Names must be unique.'],
      engine: ['引擎', 'Engine'], provider: ['供应商', 'Provider'], model: ['模型', 'Model'], base: ['自定义 Base URL', 'Custom Base URL'],
      key: ['API Key', 'API Key'], saving: ['保存中…', 'Saving…'],
      running: ['工作中', 'Working'], pending: ['等待中', 'Waiting'], paused: ['已暂停', 'Paused'], done: ['已完成', 'Done'], error: ['失败', 'Failed'], idle: ['待命', 'Ready'],
      broadcast: ['每次发送时选择全部或当前引擎', 'Choose all engines or the current engine for each message'], retry: ['重试加载引擎', 'Retry loading engines'], loading: ['正在加载引擎…', 'Loading engines…'],
    };
    return copy[key]?.[LANG === 'en' ? 1 : 0] || key;
  },
  displayRoot(session) {
    return session?.multiRootId || State.roots.find(r => r.multiChildRootIds?.includes(session?.rootId))?.id || session?.rootId;
  },
  isSelected(row) { return row.id === State.sessionId || (!!row.multiGroup && row.multiGroup === State.session?.multiGroup); },
  sessionTarget(row) { return row.multiGroup ? this.activeTabs?.get(row.multiGroup) || row.id : row.id; },
  knowsMember(id) {
    return this.members.some(m => m.id === id) || State.sessions.some(s => s.multiParent && (s.multiSessionIds || []).includes(id));
  },
  scheduleList() {
    clearTimeout(this.listTimer);
    this.listTimer = setTimeout(() => loadSessions().catch(console.warn), 200);
  },
  sessionMode(session) { return session?.multiGroup ? 'multi' : session?.engine; },
  chooseSessionEngine() {
    if (this.enginePickerOpen) return Promise.resolve(null);
    this.enginePickerOpen = true;
    const focus = document.activeElement, overflow = document.body.style.overflow;
    const dialog = document.createElement('dialog'); dialog.className = 'session-engine-picker'; dialog.id = 'sessionEnginePicker';
    dialog.setAttribute('aria-labelledby', 'sessionEnginePickerTitle');
    const title = document.createElement('h2'); title.id = 'sessionEnginePickerTitle'; title.textContent = this.text('chooseSessionEngine'); dialog.append(title);
    const list = document.createElement('div'); list.className = 'session-engine-choices'; dialog.append(list);
    const choices = [
      { id: 'claude', title: 'Claude Code', mark: 'CC', note: this.text('singleSession') },
      { id: 'codex', title: 'Codex', mark: 'CD', note: this.text('singleSession') },
    ];
    if (State.settings.multiEngine?.enabled) {
      const count = State.settings.multiEngine.engines?.length || 0;
      choices.push({ id: 'multi', title: this.text('title'), mark: 'M', note: count >= 2 ? this.text('multiSession').replace('{n}', count) : this.text('multiSetup'), disabled: count < 2 });
    }
    let preferred;
    for (const choice of choices) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'session-engine-choice'; button.dataset.engine = choice.id; button.disabled = !!choice.disabled;
      const mark = document.createElement('span'); mark.className = 'session-engine-mark'; mark.textContent = choice.mark; mark.setAttribute('aria-hidden', 'true');
      const content = document.createElement('span'); content.className = 'session-engine-choice-copy';
      const name = document.createElement('strong'); name.textContent = choice.title;
      const note = document.createElement('span'); note.textContent = choice.note; content.append(name, note);
      button.append(mark, content); button.onclick = () => dialog.close(choice.id); list.append(button);
      if (choice.id === State.settings.defaultEngine) preferred = button;
    }
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'sx-btn session-engine-cancel'; cancel.textContent = T('cancel'); cancel.onclick = () => dialog.close(); dialog.append(cancel);
    document.body.append(dialog); document.body.style.overflow = 'hidden';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const choice = dialog.returnValue || null;
        dialog.remove(); this.enginePickerOpen = false; document.body.style.overflow = overflow;
        if (focus?.isConnected) focus.focus();
        resolve(choice);
      }, { once: true });
      dialog.showModal(); preferred?.focus();
    });
  },
  chooseDelivery() {
    if (!State.session?.multiGroup) return Promise.resolve('current');
    if (this.deliveryPickerOpen) return Promise.resolve(null);
    this.deliveryPickerOpen = true;
    const focus = document.activeElement, overflow = document.body.style.overflow;
    const dialog = document.createElement('dialog'); dialog.className = 'session-engine-picker'; dialog.id = 'multiDeliveryPicker';
    dialog.setAttribute('aria-labelledby', 'multiDeliveryTitle');
    const title = document.createElement('h2'); title.id = 'multiDeliveryTitle'; title.textContent = this.text('chooseDelivery'); dialog.append(title);
    const list = document.createElement('div'); list.className = 'session-engine-choices'; dialog.append(list);
    for (const choice of [
      { id:'all', title:this.text('sendAll'), note:this.text('sendAllNote'), mark:'M' },
      { id:'current', title:this.text('sendCurrent'), note:State.session.multiName || (State.session.engine === 'codex' ? 'Codex' : 'Claude Code'), mark:'1' },
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'session-engine-choice'; button.dataset.scope = choice.id;
      const mark = document.createElement('span'); mark.className = 'session-engine-mark'; mark.textContent = choice.mark; mark.setAttribute('aria-hidden','true');
      const copy = document.createElement('span'); copy.className = 'session-engine-choice-copy';
      const name = document.createElement('strong'); name.textContent = choice.title;
      const note = document.createElement('span'); note.textContent = choice.note; copy.append(name,note); button.append(mark,copy);
      button.onclick = () => dialog.close(choice.id); list.append(button);
    }
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'sx-btn session-engine-cancel'; cancel.textContent = T('cancel'); cancel.onclick = () => dialog.close(); dialog.append(cancel);
    document.body.append(dialog); document.body.style.overflow = 'hidden';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const scope = ['all','current'].includes(dialog.returnValue) ? dialog.returnValue : null;
        dialog.remove(); this.deliveryPickerOpen = false; document.body.style.overflow = overflow;
        if (focus?.isConnected) focus.focus(); resolve(scope);
      }, { once:true });
      dialog.showModal();
    });
  },
  rows: [], members: [], timer: null, request: 0,
  fill() {
    this.savedConfig = null;
    const host = $('multiEngineSettings');
    host.querySelectorAll('.multi-engine-card').forEach(card => card.abortModels?.());
    host.replaceChildren();
    host.setAttribute('aria-label', this.text('title'));
    const toggle = document.createElement('label'); toggle.className = 'sx-lbl multi-engine-toggle';
    const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'multiEngineEnabled';
    check.checked = !!State.settings.multiEngine?.enabled;
    toggle.append(check, ' ' + this.text('title')); host.append(toggle);
    const toggleStatus = document.createElement('div'); toggleStatus.className = 'sx-note'; toggleStatus.setAttribute('role', 'status'); toggleStatus.hidden = true; host.append(toggleStatus);
    const details = document.createElement('details'); details.className = 'multi-engine-help';
    const summary = document.createElement('summary'); summary.textContent = this.text('details');
    const description = document.createElement('div'); description.className = 'sx-note'; description.textContent = this.text('note');
    details.append(summary, description); host.append(details);
    const rows = document.createElement('div'); rows.id = 'multiEngineRows'; host.append(rows);
    const entries = State.settings.multiEngine?.engines || [];
    entries.forEach(e => this.addRow(e));
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn'; add.textContent = this.text('add');
    add.onclick = async () => {
      add.disabled = true; result.textContent = this.text('loadingConfig');
      try {
        const saved = await this.savedConfigurations();
        if (!add.isConnected) return;
        const engine = State.settings.defaultEngine === 'claude' ? 'claude' : 'codex';
        this.addRow({ engine, config: this.currentConfiguration(engine, saved) });
        result.textContent = '';
      } catch (e) { result.textContent = e.message; } finally { add.disabled = false; }
    }; host.append(add);
    const result = document.createElement('div'); result.className = 'sx-note'; result.setAttribute('role', 'status');
    host.append(result);
    const visibility = () => {
      const enabled = check.checked;
      details.hidden = !enabled;
      details.open = enabled;
      rows.hidden = !enabled;
      add.hidden = !enabled;
      result.hidden = !enabled;
    };
    check.onchange = async () => {
      const enabled = check.checked;
      const previous = !!State.settings.multiEngine?.enabled;
      visibility(); check.disabled = true;
      toggleStatus.textContent = this.text('saving'); toggleStatus.hidden = false;
      const pending = api('/api/settings', { multiEngine: { enabled } }).then(saved => {
        State.settings.multiEngine = { ...(State.settings.multiEngine || { engines: [] }), enabled: saved.multiEngine.enabled };
        State.settings.maxConcurrentTasks = saved.maxConcurrentTasks;
        refreshEngineControl();
        toggleStatus.hidden = true;
        return true;
      }).catch(error => {
        check.checked = previous; visibility();
        toggleStatus.textContent = this.text('toggleFailed') + ' ' + error.message;
        return false;
      }).finally(() => { check.disabled = false; });
      this.pendingToggle = pending;
      await pending;
      if (this.pendingToggle === pending) this.pendingToggle = null;
    };
    visibility();
  },
  async saveConfiguration() {
    if (this.pendingToggle && !(await this.pendingToggle)) throw new Error(this.text('toggleFailed'));
    if (!$('multiEngineEnabled').checked) return;
    const { engines } = this.collect();
    const saved = await api('/api/settings', { multiEngine: { engines } });
    State.settings.multiEngine = { ...(State.settings.multiEngine || {}), engines: saved.multiEngine.engines };
    State.settings.maxConcurrentTasks = saved.maxConcurrentTasks;
  },
  savedConfigurations() {
    if (!this.savedConfig) {
      this.savedConfig = Promise.all([
        api('/api/engine/config'),
        api('/api/engine/slots?engine=claude'),
        api('/api/engine/slots?engine=codex'),
      ]).then(([current, claude, codex]) => ({ current, slots: { claude: claude.slots || {}, codex: codex.slots || {} } }))
        .catch(error => { this.savedConfig = null; throw error; });
    }
    return this.savedConfig;
  },
  currentConfiguration(engine, saved) {
    if (typeof EngineLoaded !== 'undefined' && EngineLoaded[engine]) {
      const ui = providerUi(engine);
      return { provider: ui.select.value, apiKey: ui.key.value, baseUrl: ui.base.value, modelsUrl: ui.modelsUrl.value, model: modelValue(engine), effort: ui.effort?.value || '', models: saved.current[engine].provider === ui.select.value ? saved.current[engine].models : saved.slots[engine][ui.select.value]?.models };
    }
    return saved.current[engine];
  },
  addRow(entry) {
    const parent = $('multiEngineRows'); if (parent.children.length >= 10) return;
    const card = document.createElement('fieldset'); card.className = 'multi-engine-card';
    const fields = {};
    const input = (key, type = 'text') => {
      const label = document.createElement('label'); label.textContent = this.text(key);
      const el = document.createElement('input'); el.type = type; el.className = 'sx-input'; el.autocomplete = 'off';
      label.append(el); card.append(label); fields[key] = el; return el;
    };
    input('name').value = entry?.name || '';
    fields.name.pattern = '[A-Za-z][A-Za-z0-9_]{0,39}'; fields.name.maxLength = 40; fields.name.required = true;
    const hint = document.createElement('div'); hint.className = 'sx-note'; hint.textContent = this.text('nameNote'); card.append(hint);
    const select = (key) => {
      const label = document.createElement('label'); label.textContent = this.text(key);
      const el = document.createElement('select'); el.className = 'sx-input'; label.append(el); card.append(label); fields[key] = el; return el;
    };
    const engine = select('engine'); engine.add(new Option('Claude Code', 'claude')); engine.add(new Option('Codex', 'codex')); engine.value = entry?.engine || 'codex';
    const provider = select('provider');
    const populate = (wanted) => {
      const previous = wanted || provider.value || entry?.config?.provider || 'official';
      provider.replaceChildren();
      const source = $(engine.value + 'ProviderSelect');
      for (const option of source.options) provider.add(new Option(option.textContent, option.value));
      if (!Array.from(provider.options).some(o => o.value === previous)) provider.add(new Option(previous, previous));
      provider.value = previous;
      update();
    };
    input('key', 'password').value = entry?.config?.apiKey || '';
    input('base', 'url').value = entry?.config?.baseUrl || '';
    const modelInput = input('model'); modelInput.classList.add('multi-engine-model-input'); modelInput.setAttribute('aria-label', this.text('manualModel'));
    const choices = document.createElement('select'); choices.className = 'sx-input'; choices.setAttribute('aria-label', this.text('model'));
    const modelBox = document.createElement('div'); modelBox.className = 'multi-engine-model-box';
    const modelHead = document.createElement('div'); modelHead.className = 'multi-engine-model-head';
    const modelTitle = document.createElement('span'); modelTitle.className = 'multi-engine-model-title'; modelTitle.textContent = this.text('model');
    modelHead.append(modelTitle);
    modelInput.parentElement.replaceWith(modelBox);
    modelBox.append(modelHead, choices, modelInput); fields.modelChoice = choices;
    const manualValue = '__clootee_manual_model__';
    const setChoices = (models, selected) => {
      card.multiModels = Array.from(new Map((models || []).map(m => typeof m === 'string' ? { id: m } : m).filter(m => m?.id).map(m => [m.id, m])).values());
      choices.replaceChildren();
      if (provider.value === 'official') choices.add(new Option(this.text('autoModel'), ''));
      for (const m of card.multiModels) choices.add(new Option(m.label || m.id, m.id));
      if (selected && !card.multiModels.some(m => m.id === selected)) choices.add(new Option(selected, selected));
      choices.add(new Option(this.text('manualModel'), manualValue));
      choices.value = selected || (provider.value === 'official' ? '' : manualValue);
      modelInput.value = selected;
      modelInput.hidden = choices.value !== manualValue;
    };
    choices.onchange = () => {
      modelInput.hidden = choices.value !== manualValue;
      if (!modelInput.hidden) modelInput.focus();
      else modelInput.value = choices.value;
    };
    const fetchModels = document.createElement('button'); fetchModels.type = 'button'; fetchModels.className = 'sx-btn multi-engine-model-fetch';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(key, value);
    const arrows = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrows.setAttribute('d', 'M20 11a8 8 0 0 0-14-5.3L3 9M3 4v5h5M4 13a8 8 0 0 0 14 5.3L21 15M16 15h5v5'); icon.append(arrows);
    const fetchLabel = document.createElement('span'); fetchLabel.textContent = this.text('fetchModels');
    fetchModels.append(icon, fetchLabel); modelHead.append(fetchModels);
    const setFetching = (busy) => {
      fetchModels.disabled = busy; fetchModels.classList.toggle('is-loading', busy); fetchModels.setAttribute('aria-busy', String(busy));
      fetchLabel.textContent = this.text(busy ? 'fetchingModels' : 'fetchModels');
    };
    const update = () => {
      fields.key.parentElement.hidden = provider.value === 'official';
      fields.base.parentElement.hidden = provider.value !== 'custom';
      fields.key.required = provider.value !== 'official'; fields.base.required = provider.value === 'custom';
      fields.model.required = provider.value !== 'official';
    };
    let currentEngine = engine.value;
    let currentProvider = entry?.config?.provider || 'official';
    const drafts = new Map();
    const lastProviders = new Map([[currentEngine, currentProvider]]);
    const status = document.createElement('div'); status.className = 'sx-note multi-engine-model-status'; status.setAttribute('role', 'status');
    const say = (message, state = '') => { status.textContent = message; status.dataset.state = state; };
    let modelVersion = 0, modelController;
    const cancelModels = () => {
      modelVersion++; modelController?.abort(); delete card.dataset.modelsLoading;
      setFetching(false);
    };
    card.abortModels = cancelModels;
    const fingerprint = () => JSON.stringify([engine.value, provider.value, fields.key.value.trim(), fields.base.value.trim(), card.multiModelsUrl || '']);
    fetchModels.onclick = async () => {
      const request = { engine: engine.value, provider: provider.value, apiKey: fields.key.value.trim(), baseUrl: fields.base.value.trim(), modelsUrl: card.multiModelsUrl || '' };
      if (request.provider !== 'official' && request.provider !== 'clootee' && !request.apiKey) { say(this.text('needKey'), 'error'); return; }
      if (request.provider === 'custom' && !request.baseUrl) { say(this.text('needBase'), 'error'); return; }
      cancelModels(); const version = modelVersion, signature = fingerprint();
      modelController = new AbortController(); card.dataset.modelsLoading = 'true';
      setFetching(true); say(this.text('fetchingModels'), 'loading');
      try {
        const response = await api('/api/engine/models', request, false, modelController.signal);
        if (version !== modelVersion || signature !== fingerprint() || !card.isConnected) return;
        const models = (response.models || []).map(m => typeof m === 'string' ? { id: m } : m).filter(m => m?.id);
        if (!models.length) throw new Error(this.text('emptyModels'));
        const selected = modelInput.value || (models.some(m => m.id === response.recommended) ? response.recommended : models[0].id);
        setChoices(models, selected);
        say(this.text('fetchedModels').replace('{n}', card.multiModels.length), 'success');
      } catch (e) {
        if (version === modelVersion && signature === fingerprint() && e.name !== 'AbortError') say(e.message, 'error');
      } finally {
        if (version === modelVersion) { delete card.dataset.modelsLoading; setFetching(false); }
      }
    };
    for (const field of [fields.key, fields.base]) field.addEventListener('input', () => { cancelModels(); setChoices([], modelInput.value); say(''); });

    const readConfig = () => ({ provider: currentProvider, apiKey: fields.key.value, baseUrl: fields.base.value, model: fields.model.value, effort: card.multiEffort || '', modelsUrl: card.multiModelsUrl || '', models: card.multiModels || [] });
    const change = async (engineChanged) => {
      drafts.set(currentEngine + ':' + currentProvider, readConfig());
      cancelModels();
      const targetEngine = engine.value;
      const targetProvider = provider.value;
      card.disabled = true; card.dataset.loading = 'true'; say(this.text('loadingConfig'), 'loading');
      try {
        const saved = await this.savedConfigurations();
        if (!card.isConnected) return;
        const current = this.currentConfiguration(targetEngine, saved);
        const wanted = engineChanged ? lastProviders.get(targetEngine) || current.provider : targetProvider;
        const config = drafts.get(targetEngine + ':' + wanted)
          || (current.provider === wanted ? current : saved.slots[targetEngine][wanted])
          || {};
        currentEngine = targetEngine; currentProvider = wanted; lastProviders.set(targetEngine, wanted);
        populate(wanted);
        fields.key.value = config.apiKey || '';
        fields.base.value = config.baseUrl || '';
        card.multiModelsUrl = config.modelsUrl || '';
        setChoices(config.models || [], config.model || '');
        card.multiEffort = config.effort || '';
        say('');
      } catch (e) {
        engine.value = currentEngine; populate(currentProvider); say(e.message, 'error');
      } finally { card.disabled = false; delete card.dataset.loading; }
    };
    engine.onchange = () => change(true); provider.onchange = () => change(false); populate();
    card.multiModelsUrl = entry?.config?.modelsUrl || '';
    setChoices(entry?.config?.models || [], entry?.config?.model || '');
    modelBox.append(status);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn'; remove.textContent = this.text('remove'); remove.onclick = () => { cancelModels(); card.remove(); }; card.append(remove);
    card.multiFields = fields; card.multiEffort = entry?.config?.effort || ''; parent.append(card);
  },
  collect() {
    const enabled = $('multiEngineEnabled').checked;
    if (!enabled) return { enabled: false, engines: State.settings.multiEngine?.engines || [] };
    const engines = Array.from($('multiEngineRows').children).map(card => {
      if (card.dataset.modelsLoading) throw new Error(this.text('fetchingModels'));
      if (card.dataset.loading) throw new Error(this.text('loadingConfig'));
      const f = card.multiFields;
      if (enabled) for (const el of Object.values(f)) if (!el.reportValidity()) throw new Error(this.text('nameNote'));
      return { name: f.name.value.trim(), engine: f.engine.value, config: { provider: f.provider.value, apiKey: f.key.value.trim(), baseUrl: f.base.value.trim(), model: f.model.value.trim(), effort: card.multiEffort, modelsUrl: card.multiModelsUrl || '' } };
    });
    return { enabled, engines };
  },
  schedule() {
    clearTimeout(this.timer);
    if (!State.session?.multiGroup) { $('multiEngineTabs').hidden = true; return; }
    this.timer = setTimeout(() => this.renderTabs(), 100);
  },
  async renderTabs() {
    const host = $('multiEngineTabs'), id = State.sessionId, version = ++this.request;
    if (!State.session?.multiGroup) { host.hidden = true; return; }
    host.hidden = false;
    if (!host.children.length) host.textContent = this.text('loading');
    try {
      const members = await api('/api/multi/members?sessionId=' + encodeURIComponent(id));
      if (version !== this.request || State.sessionId !== id) return;
      this.members = members; this.membersGroup = State.session.multiGroup; refreshComposerControls(); host.replaceChildren(); host.setAttribute('role', 'tablist'); host.setAttribute('aria-label', this.text('title'));
      members.forEach((m, i) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'multi-engine-tab'; button.setAttribute('role', 'tab');
        const selected = m.id === id || (m.id.split(':')[0] === State.session?.rootId);
        button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
        const tasks = m.tasks || [], last = tasks.at(-1);
        const status = m.paused ? 'paused' : tasks.some(t => t.status === 'running') ? 'running' : tasks.some(t => t.status === 'pending') ? 'pending' : last?.status === 'error' ? 'error' : last?.status === 'done' ? 'done' : 'idle';
        const title = document.createElement('strong'); title.textContent = m.name;
        const detail = document.createElement('span'); detail.textContent = `${m.engine === 'codex' ? 'Codex' : 'Claude Code'} · ${this.text(status)}`;
        button.append(title, detail); button.onclick = () => this.switchTab(m.id);
        button.onkeydown = e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const target = e.key === 'Home' ? 0 : e.key === 'End' ? members.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + members.length) % members.length; this.switchTab(members[target].id).then(() => $('multiEngineTabs').children[target]?.focus()); } };
        host.append(button);
      });
      host.title = this.text('broadcast');
    } catch (e) {
      if (State.sessionId !== id) return;
      host.replaceChildren(); const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = this.text('retry'); retry.title = e.message; retry.onclick = () => this.renderTabs(); host.append(retry);
    }
  },
  async switchTab(id) {
    await selectSession(id);
    if (State.sessionId === id && State.session?.multiGroup) {
      if (!this.activeTabs) this.activeTabs = new Map();
      this.activeTabs.set(State.session.multiGroup,id);
    }
    if (State.sessionId === id) await loadSessions();
  },
  async ensureEngines(scope = 'all') {
    if (scope === 'current' || !State.session?.multiGroup) return EngineRecovery.ensure(State.session?.engine || State.settings.defaultEngine);
    const members = await api('/api/multi/members?sessionId=' + encodeURIComponent(State.sessionId));
    for (const engine of new Set(members.map(m => m.engine))) if (!(await EngineRecovery.ensure(engine))) return false;
    return true;
  },
};
