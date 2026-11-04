const CostUi = {
  pending: false,
  defaults: { mode: 'auto', scope: 'both', guard: true, strict: false, enhance: true, thresholdTokens: 50000, minExtraUsd: 0.5, cheapModel: '', warnMessages: 15, maxMessages: 20 },
  policy() { return { ...this.defaults, ...(State.settings.costOptimization || {}) }; },
  applyText() {
    const labels = { costWarnMessagesLabel: 'costWarnMessages', costMaxMessagesLabel: 'costMaxMessages', costMessageLimitNote: 'costMessageLimitNote', costModeLabel: 'costMode', costScopeLabel: 'costScope', costSavingsClaim: 'costSavings',
      costAutomaticNote: 'costAutomatic', costGuardLabel: 'costGuard', costStrictLabel: 'costStrict',
      costEnhanceLabel: 'costEnhance', costTokensLabel: 'costTokens', costExtraLabel: 'costExtra',
      costCheapModelLabel: 'costCheapModel', costClassifierNote: 'costClassifierNote',
      costCompactIntro: 'costCompactIntro', costCompactWindowLabel: 'costCompactWindow', costCompactTokensLabel: 'costCompactTokens', costCompactWindowHelp: 'costCompactHelp', costCompactPresetHint: 'costCompactPresetHint',
      costGuardTitle: 'costAlertTitle', costContinue: 'costContinue', costNew: 'costNew',
      costCompact: 'costCompact', costCancel: 'cancel', costGuardStrictNote: 'costStrictNote',
      costPreparedLabel: 'costPreparedLabel', costPreparedSend: 'costPreparedSend' };
    for (const [id, key] of Object.entries(labels)) $(id).textContent = T(key);
    $('costGuardClose').setAttribute('aria-label', T('close'));
    for (const o of $('costMode').options) o.textContent = T({ auto: 'costAuto', manual: 'costManual', off: 'costOff' }[o.value]);
    for (const o of $('costScope').options) o.textContent = T({ both: 'costBoth', subscription: 'costSubscription', apikey: 'costApiKey' }[o.value]);
    $('costCheapModel').placeholder = T('costCheapAuto');
    for (const o of $('autoCompactModeSelect').options) o.textContent = T(o.value === 'custom' ? 'costCompactCustom' : 'costCompactAuto');
  },
  fill() {
    const p = this.policy();
    $('costMode').value = p.mode;
    $('costScope').value = p.scope;
    $('costWarnMessages').value = p.warnMessages;
    $('costMaxMessages').value = p.maxMessages;
    for (const [id, key] of [['costGuard', 'guard'], ['costStrict', 'strict'], ['costEnhance', 'enhance']]) $(id).checked = p[key];
    $('costTokens').value = p.thresholdTokens;
    $('costExtra').value = p.minExtraUsd;
    $('costCheapModel').value = p.cheapModel;
    PromptCacheUi.fill();
    fillContextPane();
    this.sync();
  },
  sync() { $('costManual').hidden = $('costMode').value !== 'manual'; $('costAutomaticNote').hidden = $('costMode').value !== 'auto'; },
  async save() {
    const warnMessages = Number($('costWarnMessages').value);
    const maxMessages = Number($('costMaxMessages').value);
    if (!Number.isInteger(warnMessages) || !Number.isInteger(maxMessages) || warnMessages < 1 || maxMessages > 10000 || warnMessages >= maxMessages) {
      alert(T('sessionLimitInvalid'));
      return false;
    }
    const p = { mode: $('costMode').value, scope: $('costScope').value,
      warnMessages, maxMessages,
      guard: $('costGuard').checked, strict: $('costStrict').checked, enhance: $('costEnhance').checked,
      thresholdTokens: Number($('costTokens').value), minExtraUsd: Number($('costExtra').value), cheapModel: $('costCheapModel').value.trim() };
    const patch = { costOptimization: p };
    if (p.mode === 'manual') {
      patch.claudePromptCache = $('claudePromptCache').value;
      patch.askClaudePromptCache = $('askClaudePromptCache').checked;
      patch.autoCompact = { mode: $('autoCompactModeSelect').value,
        tokens: Math.max(100000, Math.min(1000000, Number($('autoCompactTokensInput').value) || 1000000)) };
    } else if (p.mode === 'auto') { patch.claudePromptCache = '1h'; patch.askClaudePromptCache = false; }
    const saved = await patchSettings(patch);
    if (!saved) { setPaneNotice('engSaveFailShort', null, 'err', 0); return false; }
    PromptCacheUi.dirty = false;
    PromptCacheUi.render();
    SessionLimitUi.refresh();
    setPaneNotice('engSavedToast', null, 'ok', 2500);
    return true;
  },
  dollars(v) { return v === null || v === undefined ? T('costUnknownPrice') : ApiBill.usd(v); },
  renderCheck(c) {
    $('costGuardSummary').textContent = T('costAlertSummary').replace('{n}', fmtNum(c.tokens))
      .replace('{state}', T({ expired: 'costExpired', uncertain: 'costUncertain', invalidated: 'costInvalidated', disabled: 'cacheDisabled', warm: 'costWarm', unknown: 'costUnknown' }[c.cacheState]));
    $('costGuardEstimate').textContent = T('costEstimate').replace('{warm}', this.dollars(c.costs?.warmUsd))
      .replace('{cold}', this.dollars(c.costs?.coldUsd)) + (c.subscription ? ' ' + T('apiSubscription') : '');
    $('costGuardStrictNote').hidden = !(c.strict && c.blocked && !c.compactProof);
    $('costContinue').hidden = c.strict && c.blocked && !c.compactProof;
    $('costCompact').disabled = !c.canCompact;
  },
  async prepare(prompts) {
    if (this.pending) return null;
    const id = State.sessionId;
    if (State.session?.engine !== 'claude' || this.policy().mode === 'off') return { sessionId: id, prompts };
    const check = await api('/api/cost/check', { sessionId: id, prompt: prompts.join('\n\n') });
    if (this.pending) return null;
    if (State.sessionId !== id) return null;
    if (!check.blocked) return { sessionId: id, prompts };
    return this.choose(id, prompts, check);
  },
  choose(id, prompts, initial) {
    const modal = $('costGuardModal');
    this.pending = true;
    this.applyText();
    this.renderCheck(initial);
    $('costProgress').hidden = true;
    $('costPrepared').hidden = true;
    $('costGuardError').textContent = '';
    for (const name of ['costContinue', 'costNew', 'costCancel', 'costGuardClose']) $(name).disabled = false;
    let current = initial;
    let result = null;
    let created = null;
    let working = false;
    const busy = (value) => {
      working = value;
      for (const name of ['costContinue', 'costNew', 'costCompact', 'costCancel', 'costGuardClose']) $(name).disabled = value;
      if (!value) $('costCompact').disabled = !current.canCompact;
    };
    const progress = (stage, percent) => {
      $('costProgress').hidden = false;
      $('costProgressBar').value = percent;
      $('costProgressText').textContent = T({ checking: 'costChecking', preparing: 'costPreparing', enhancing: 'costEnhancing', creating: 'costCreating', ready: 'costReady', compacting: 'costCompacting' }[stage]);
    };
    const failed = e => { $('costGuardError').textContent = this.errorText(ErrorHandler.handle(e, 'CostUi.choose')); busy(false); };
    modal.oncancel = e => { if (working) e.preventDefault(); };
    modal.showModal();
    return new Promise(resolve => {
      modal.addEventListener('close', async () => {
        this.pending = false;
        if (!result && created) {
          try { await api('/api/session/remove', { id: created }); } catch (e) { ErrorHandler.handle(e, 'CostUi.cleanup'); }
        }
        resolve(State.sessionId === id ? result : null);
      }, { once: true });
      $('costGuardClose').onclick = $('costCancel').onclick = () => { if (!working) modal.close(); };
      $('costContinue').onclick = async () => {
        if (working || State.sessionId !== id) return;
        busy(true);
        try {
          const r = await api('/api/cost/approve', { sessionId: id, prompts, fingerprint: current.fingerprint, compactProof: current.compactProof });
          result = { sessionId: id, prompts, costApprovals: r.approvals };
          modal.close();
        } catch (e) { failed(e); }
      };
      $('costCompact').onclick = async () => {
        if (working || State.sessionId !== id) return;
        busy(true); progress('compacting', 20);
        try {
          const r = await api('/api/cost/compact', { sessionId: id });
          current = { ...r.check, compactProof: r.compactProof };
          current.canCompact = true;
          this.renderCheck(current);
          $('costProgressBar').value = 100;
          $('costProgressText').textContent = T('costCompactResult').replace('{before}', fmtNum(r.beforeTokens))
            .replace('{after}', fmtNum(r.afterTokens)).replace('{usd}', this.dollars(r.usd));
          $('costContinue').textContent = T('costConfirmSend');
          busy(false);
        } catch (e) { failed(e); }
      };
      $('costNew').onclick = async () => {
        if (working || State.sessionId !== id) return;
        busy(true); progress('checking', 10);
        try {
          const response = await fetch('/api/cost/migrate', { method: 'POST', headers: { 'x-auth-token': TOKEN, 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: id, prompt: prompts.join('\n\n') }) });
          if (!response.ok) throw new Error(T('costMigrationFailed'));
          const reader = response.body.getReader();
          const decoder = new TextDecoder(); let buffer = ''; let ready = null;
          for (;;) {
            const part = await reader.read();
            buffer += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
            const lines = buffer.split('\n'); buffer = lines.pop();
            for (const line of lines) if (line.trim()) {
              const e = JSON.parse(line);
              if (e.stage === 'error') throw new Error(e.data.message);
              progress(e.stage, e.progress);
              if (e.stage === 'ready') ready = e.data;
            }
            if (part.done) break;
          }
          if (!ready) throw new Error(T('costMigrationFailed'));
          created = ready.sessionId;
          $('costPreparedInput').value = ready.prompt;
          $('costHelperCost').textContent = T('costHelperCharge').replace('{usd}', this.dollars(ready.helperUsd));
          $('costPrepared').hidden = false;
          busy(false);
          $('costNew').disabled = true;
          $('costContinue').hidden = true;
          $('costCompact').disabled = true;
          $('costPreparedSend').onclick = () => {
            const text = $('costPreparedInput').value.trim();
            if (!text || State.sessionId !== id) return;
            result = { sessionId: created, prompts: [text] };
            modal.close();
          };
        } catch (e) { failed(e); }
      };
    });
  },
  errorText(message) {
    const codes = ['cost_cheap_model_unavailable', 'cost_classification_invalid', 'cost_context_missing', 'cost_compact_not_confirmed',
      'cost_compact_no_reduction', 'cost_session_busy', 'cost_context_changed', 'cost_strict_locked', 'cost_operation_timeout'];
    const code = codes.find(c => message.includes(c));
    return code ? T(code) : message;
  },
  bind() {
    $('costMode').addEventListener('change', () => this.sync());
  },
};
