const PromptCacheUi = {
  pending: false,
  applyText() {
    const labels = { claudePromptCacheLabel: 'cacheDefault', askClaudePromptCacheLabel: 'cacheAsk',
      claudePromptCacheHelpLabel: 'cacheExplain', claudePromptCacheHelp: 'cacheHelp', promptCacheTitle: 'cacheTitle',
      promptCacheIntro: 'cacheIntro', promptCacheLong: 'cacheLong', promptCacheLongNote: 'cacheLongNote',
      promptCacheShort: 'cacheShort', promptCacheShortNote: 'cacheShortNote', promptCacheAdvanced: 'cacheAdvanced',
      promptCacheOff: 'cacheOff', promptCacheOffNote: 'cacheOffNote', promptCacheHelpLabel: 'cacheExplain',
      promptCacheHelp: 'cacheHelp', promptCacheCancel: 'cancel' };
    for (const [id, key] of Object.entries(labels)) $(id).textContent = T(key);
    $('promptCacheClose').setAttribute('aria-label', T('close'));
    for (const o of $('claudePromptCache').options) o.textContent = T({ '1h': 'cacheHour', '5m': 'cacheFive', off: 'cacheDisabled' }[o.value]);
    this.render();
  },
  fill() {
    this.dirty = false;
    $('claudePromptCache').value = State.settings.claudePromptCache || '1h';
    $('askClaudePromptCache').checked = !!State.settings.askClaudePromptCache;
  },
  render() {
    const btn = $('sessionPromptCache');
    if (!btn) return;
    const show = State.session && State.session.rootId && State.session.engine === 'claude';
    btn.hidden = !show;
    if (show) {
      const mode = State.session.promptCache || State.settings.claudePromptCache || '1h';
      btn.textContent = T('cacheBadge').replace('{v}', T({ '1h': 'cacheHourShort', '5m': 'cacheFiveShort', off: 'cacheDisabled' }[mode]));
      btn.title = T('cacheChange');
    }
  },
  async ensure() {
    if (State.session?.engine !== 'claude') return true;
    if (this.pending) return false;
    const s = State.session;
    if (State.settings.costOptimization?.mode !== 'manual') return true;
    const fresh = !s.claudeSessionId && !s.tasks?.length && !s.messages?.length;
    if (fresh && State.settings.askClaudePromptCache && s.promptCacheConfirmed !== true) return this.choose(true);
    if (!s.promptCache) {
      const id = State.sessionId;
      try {
        const updated = await api('/api/session/prompt-cache', { id, mode: State.settings.claudePromptCache || '1h' });
        if (State.sessionId !== id) return false;
        State.session = { ...State.session, promptCache: updated.promptCache, promptCacheConfirmed: true };
        this.render();
      } catch (e) { alert(ErrorHandler.handle(e, 'PromptCacheUi.ensure')); return false; }
    }
    return true;
  },
  choose(sendAfter) {
    if (this.pending || State.session?.engine !== 'claude') return Promise.resolve(false);
    this.pending = true;
    const id = State.sessionId;
    const modal = $('promptCacheModal');
    this.applyText();
    $('promptCacheConfirm').textContent = T(sendAfter ? 'cacheChooseSend' : 'save');
    $('promptCacheError').textContent = '';
    $('promptCacheConfirm').disabled = false;
    const mode = State.session.promptCache || State.settings.claudePromptCache || '1h';
    const radios = [...modal.querySelectorAll('input[name="promptCacheChoice"]')];
    for (const radio of radios) radio.checked = radio.value === mode;
    if (mode === 'off') modal.querySelector('details').open = true;
    modal.showModal();
    return new Promise((resolve) => {
      let success = false;
      modal.addEventListener('close', () => { this.pending = false; resolve(success && State.sessionId === id); }, { once: true });
      $('promptCacheConfirm').onclick = async () => {
        if (State.sessionId !== id) { modal.close(); return; }
        const selected = radios.find((r) => r.checked)?.value || '1h';
        $('promptCacheConfirm').disabled = true;
        try {
          const s = await api('/api/session/prompt-cache', { id, mode: selected });
          if (State.sessionId === id) State.session = { ...State.session, promptCache: s.promptCache, promptCacheConfirmed: true };
          success = true;
          this.render();
          modal.close();
        } catch (e) {
          $('promptCacheError').textContent = ErrorHandler.handle(e, 'PromptCacheUi.choose');
          $('promptCacheConfirm').disabled = false;
        }
      };
    });
  },
  bind() {
    $('sessionPromptCache').onclick = () => { if (State.settings.costOptimization?.mode === 'manual') this.choose(false); };
    $('promptCacheClose').onclick = $('promptCacheCancel').onclick = () => $('promptCacheModal').close();
    for (const id of ['claudePromptCache', 'askClaudePromptCache']) $(id).addEventListener('change', () => {
      this.dirty = true;
      setPaneNotice('engDirty', null, 'warn', 0);
    });
  },
};
