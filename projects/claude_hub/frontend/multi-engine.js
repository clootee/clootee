// Named, independent engine instances; a session group keeps its original configuration.
const MultiUi = {
  text(key) {
    const copy = {
      title: ['多引擎', 'Multiple engines'], add: ['添加引擎', 'Add engine'], remove: ['移除', 'Remove'],
      intro: ['让多个引擎同时处理同一需求。', 'Let multiple engines work on the same request.'],
      details: ['了解详情', 'Learn more'],
      note: ['开启后，新会话会同时向每个引擎发送需求，工作目录为 divide/英文名。初始复制根目录的 CLAUDE.md、AGENTS.md，公共提示词持续生效。配置修改仅影响新会话；并发上限至少调整为引擎数。', 'New sessions send each request to all engines in divide/name. CLAUDE.md and AGENTS.md are copied initially; shared prompts remain active. Changes apply to new sessions. The concurrency limit is raised to at least the engine count.'],
      name: ['英文名称', 'English name'], nameNote: ['字母开头，仅英文字母、数字、下划线，最多40字符，名称不能重复。', 'Start with a letter; use letters, numbers and underscores, up to 40 characters. Names must be unique.'],
      engine: ['引擎', 'Engine'], provider: ['供应商', 'Provider'], model: ['模型 ID', 'Model ID'], base: ['自定义 Base URL', 'Custom Base URL'],
      key: ['API Key', 'API Key'], saved: ['已保存', 'Saved'], saving: ['保存中…', 'Saving…'], save: ['保存多引擎配置', 'Save engine configuration'],
      running: ['工作中', 'Working'], pending: ['等待中', 'Waiting'], paused: ['已暂停', 'Paused'], done: ['已完成', 'Done'], error: ['失败', 'Failed'], idle: ['待命', 'Ready'],
      broadcast: ['每次发送将分发给所有引擎', 'Each message is sent to all engines'], retry: ['重试加载引擎', 'Retry loading engines'], loading: ['正在加载引擎…', 'Loading engines…'],
    };
    return copy[key]?.[LANG === 'en' ? 1 : 0] || key;
  },
  rows: [], members: [], timer: null, request: 0,
  fill() {
    const host = $('multiEngineSettings');
    host.replaceChildren();
    host.setAttribute('aria-label', this.text('title'));
    const toggle = document.createElement('label'); toggle.className = 'sx-lbl multi-engine-toggle';
    const check = document.createElement('input'); check.type = 'checkbox'; check.id = 'multiEngineEnabled';
    check.checked = !!State.settings.multiEngine?.enabled;
    toggle.append(check, ' ' + this.text('title')); host.append(toggle);
    const note = document.createElement('div'); note.className = 'sx-note multi-engine-intro'; note.textContent = this.text('intro'); host.append(note);
    const details = document.createElement('details'); details.className = 'multi-engine-help';
    const summary = document.createElement('summary'); summary.textContent = this.text('details');
    const description = document.createElement('div'); description.className = 'sx-note'; description.textContent = this.text('note');
    details.append(summary, description); host.append(details);
    const rows = document.createElement('div'); rows.id = 'multiEngineRows'; host.append(rows);
    const entries = State.settings.multiEngine?.engines || [];
    entries.forEach(e => this.addRow(e));
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn'; add.textContent = this.text('add');
    add.onclick = () => this.addRow(); host.append(add);
    const save = document.createElement('button'); save.type = 'button'; save.className = 'btn'; save.textContent = this.text('save');
    const result = document.createElement('div'); result.className = 'sx-note'; result.setAttribute('role', 'status');
    save.onclick = async () => {
      save.disabled = true; result.textContent = this.text('saving');
      try {
        const multiEngine = this.collect();
        const saved = await api('/api/settings', { multiEngine });
        State.settings.multiEngine = saved.multiEngine;
        State.settings.maxConcurrentTasks = saved.maxConcurrentTasks;
        result.textContent = this.text('saved');
      } catch (e) { result.textContent = e.message; } finally { save.disabled = false; }
    };
    host.append(save, result);
    const visibility = () => { rows.hidden = !check.checked; add.hidden = !check.checked; };
    check.onchange = visibility; visibility();
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
    const populate = () => {
      const previous = provider.value || entry?.config?.provider || 'official';
      provider.replaceChildren();
      const source = $(engine.value + 'ProviderSelect');
      for (const option of source.options) provider.add(new Option(option.textContent, option.value));
      provider.value = previous;
      if (!provider.value) provider.value = 'official';
      update();
    };
    input('key', 'password').value = entry?.config?.apiKey || '';
    input('base', 'url').value = entry?.config?.baseUrl || '';
    input('model').value = entry?.config?.model || '';
    const update = () => {
      fields.key.parentElement.hidden = provider.value === 'official';
      fields.base.parentElement.hidden = provider.value !== 'custom';
      fields.key.required = provider.value !== 'official'; fields.base.required = provider.value === 'custom';
      fields.model.required = provider.value !== 'official';
    };
    engine.onchange = populate; provider.onchange = update; populate();
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn'; remove.textContent = this.text('remove'); remove.onclick = () => card.remove(); card.append(remove);
    card.multiFields = fields; card.multiEffort = entry?.config?.effort || ''; parent.append(card);
  },
  collect() {
    const enabled = $('multiEngineEnabled').checked;
    if (!enabled) return { enabled: false, engines: State.settings.multiEngine?.engines || [] };
    const engines = Array.from($('multiEngineRows').children).map(card => {
      const f = card.multiFields;
      if (enabled) for (const el of Object.values(f)) if (!el.reportValidity()) throw new Error(this.text('nameNote'));
      return { name: f.name.value.trim(), engine: f.engine.value, config: { provider: f.provider.value, apiKey: f.key.value.trim(), baseUrl: f.base.value.trim(), model: f.model.value.trim(), effort: card.multiEffort } };
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
      this.members = members; host.replaceChildren(); host.setAttribute('role', 'tablist'); host.setAttribute('aria-label', this.text('title'));
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
    if (State.sessionId === id) await loadSessions();
  },
  async ensureEngines() {
    if (!State.session?.multiGroup) return EngineRecovery.ensure(State.session?.engine || State.settings.defaultEngine);
    const members = await api('/api/multi/members?sessionId=' + encodeURIComponent(State.sessionId));
    for (const engine of new Set(members.map(m => m.engine))) if (!(await EngineRecovery.ensure(engine))) return false;
    return true;
  },
};
