const SessionLimitUi = {
  id: '',
  status: null,
  timer: null,
  request: 0,
  render() {
    const box = $('messages');
    const old = $('sessionLimitBanner');
    if (old) old.remove();
    const s = this.id === State.sessionId && State.session ? this.status : null;
    $('addTaskBtn').disabled = !!s?.blocked;
    if (!s?.warning) return;
    const banner = document.createElement('div');
    banner.id = 'sessionLimitBanner';
    banner.className = 'session-limit-banner' + (s.blocked ? ' session-limit-blocked' : '');
    banner.setAttribute('role', 'alert');
    const text = document.createElement('strong');
    text.textContent = T(s.blocked ? 'sessionLimitBlocked' : 'sessionLimitWarning')
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
    text.appendChild(hint);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = T('newSession');
    button.onclick = () => newSession();
    banner.append(text, button);
    box.appendChild(banner);
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
    try {
      const s = await this.load();
      if (!s) return false;
      if (s.count + s.queued + incoming <= s.max) return true;
      alert(T('sessionLimitBatch').replace('{remaining}', Math.max(0, s.max - s.count - s.queued)));
      return false;
    } catch (e) {
      alert(ErrorHandler.handle(e, 'SessionLimitUi.prepare'));
      return false;
    }
  },
};
