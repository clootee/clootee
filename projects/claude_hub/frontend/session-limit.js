const SessionLimitUi = {
  id: '',
  status: null,
  timer: null,
  request: 0,
  feedback: null,
  render() {
    const box = $('messages');
    const old = $('sessionLimitBanner');
    if (old) old.remove();
    const s = this.id === State.sessionId && State.session ? this.status : null;
    $('addTaskBtn').disabled = !!s?.blocked;
    const feedback = this.feedback?.id === State.sessionId ? this.feedback.text : '';
    if (!s?.warning && !feedback) return;
    const banner = document.createElement('div');
    banner.id = 'sessionLimitBanner';
    banner.className = 'session-limit-banner';
    banner.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = feedback || T(s.blocked ? 'sessionLimitBlocked' : 'sessionLimitWarning')
      .replace('{count}', s.count).replace('{queued}', s.queued).replace('{max}', s.max);
    const hint = document.createElement('span');
    hint.className = 'session-limit-settings-hint';
    const [before, after] = T('sessionLimitSettingsHint').split('{settings}');
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'session-limit-settings-link';
    settings.textContent = T('settings');
    settings.onclick = () => this.openSettings();
    hint.append(before, settings, after || '');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = T('newSession');
    button.onclick = () => newSession();
    banner.append(text, ' ', hint, ' ', button);
    box.appendChild(banner);
  },
  showFeedback(text) {
    this.feedback = { id: State.sessionId, text };
    this.render();
    $('sessionLimitBanner')?.scrollIntoView({ block: 'nearest' });
  },
  openSettings() {
    openSettings();
    openSettingsPane('cost');
    requestAnimationFrame(() => {
      const target = $('costMessageLimits');
      target.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      target.focus({ preventScroll: true });
    });
  },
  async load() {
    const id = State.sessionId;
    const request = ++this.request;
    if (!id || !State.session?.rootId) { this.id = ''; this.status = null; this.render(); return null; }
    const status = await api('/api/session/limit?id=' + encodeURIComponent(id));
    if (id !== State.sessionId || request !== this.request) return null;
    if (this.id !== id || status.count !== this.status?.count || status.queued !== this.status?.queued || status.max !== this.status?.max) this.feedback = null;
    this.id = id;
    this.status = status;
    this.render();
    return status;
  },
  refresh() {
    this.render();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load().catch(e => ErrorHandler.handle(e, 'SessionLimitUi.refresh')), 80);
  },
  async prepare(incoming) {
    this.feedback = null;
    try {
      const s = await this.load();
      if (!s) return false;
      if (s.count + s.queued + incoming <= s.max) return true;
      this.showFeedback(T('sessionLimitBatch').replace('{remaining}', Math.max(0, s.max - s.count - s.queued)));
      return false;
    } catch (e) {
      this.showFeedback(ErrorHandler.handle(e, 'SessionLimitUi.prepare'));
      return false;
    }
  },
};
