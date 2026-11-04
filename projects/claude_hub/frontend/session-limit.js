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
    banner.className = 'session-limit-banner' + (s?.blocked ? ' is-blocked' : '');
    banner.setAttribute('role', 'status');
    const icon = document.createElement('span');
    icon.className = 'session-limit-icon';
    icon.textContent = '!';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'session-limit-summary';
    text.textContent = feedback || T(s.blocked ? 'sessionLimitBlocked' : 'sessionLimitWarning')
      .replace('{count}', s.count).replace('{queued}', s.queued).replace('{max}', s.max);
    const hint = document.createElement('span');
    hint.className = 'session-limit-settings-hint';
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'session-limit-settings-link';
    settings.textContent = T('settings');
    settings.title = T('sessionLimitSettingsHint').replace('{settings}', T('settings'));
    settings.onclick = () => this.openSettings();
    hint.append(settings);
    let queued;
    if (s?.queued) {
      queued = document.createElement('span');
      queued.className = 'session-limit-queued';
      queued.textContent = T('sessionLimitQueued').replace('{queued}', s.queued);
    }
    const count = document.createElement('span');
    count.className = 'session-limit-count';
    count.textContent = s ? `${s.count + s.queued}/${s.max}` : '';
    count.setAttribute('aria-label', T('sessionLimitCount'));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = T('newSession');
    button.onclick = () => newSession();
    banner.append(icon, ' ', count, ' · ', text);
    if (queued) banner.append(' · ', queued);
    banner.append(' · ', hint, ' · ', button);
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
    const id = State.sessionId;
    if (!id || !State.session?.rootId) { this.id = ''; this.status = null; this.render(); return false; }
    // 发送优先于后台刷新：递增 request 让排队/在途的 refresh 结果作废，并清掉待触发的定时器。
    // 否则刚建会话时 renderMessages() 调度的 refresh 会在 80ms 后顶掉本次 load（返回 null），
    // 导致首条消息静默不发送、必须再按一次回车。
    ++this.request;
    clearTimeout(this.timer);
    this.timer = null;
    try {
      const s = await api('/api/session/limit?id=' + encodeURIComponent(id));
      if (id !== State.sessionId) return false;
      this.id = id;
      this.status = s;
      if (s.count + s.queued + incoming <= s.max) { this.render(); return true; }
      this.showFeedback(T('sessionLimitBatch').replace('{remaining}', Math.max(0, s.max - s.count - s.queued)));
      return false;
    } catch (e) {
      this.showFeedback(ErrorHandler.handle(e, 'SessionLimitUi.prepare'));
      return false;
    }
  },
};
