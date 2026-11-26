// Runtime recovery uses the same installation API and progress stream as Settings.
const EngineRecovery = {
  pending: null,
  seen: new Set(),
  names: { claude: 'Claude Code', codex: 'Codex', antigravity: 'Antigravity CLI' },
  async ensure(engine = 'claude', force = false) {
    try {
      if (this.pending) return await this.pending;
      const status = await api('/api/engine/status?refresh=1');
      if (!force && status[engine]?.ready) return true;
      if (force && status[engine]) status[engine].ready = false;
      return await this.open(status, force ? engine : null, engine === 'antigravity' ? ['antigravity'] : undefined);
    } catch (error) {
      alert(T('engineRecoveryCheckFailed') + '\n' + error.message);
      return false;
    }
  },
  // 启动时 Antigravity 未安装 → 主动弹窗；「暂不安装」本标签页内不再打扰，「不再提醒」写进本浏览器
  async promptAntigravity() {
    try {
      if (localStorage.getItem('agyPromptOff') === '1' || sessionStorage.getItem('agyPromptLater') === '1') return;
    } catch { return; }
    if (State.settings.engineAvail?.antigravity !== false || this.pending) return;
    const status = await api('/api/engine/status?refresh=1').catch(() => null);
    if (!status || status.antigravity?.ready) return;
    return this.open(status, null, ['antigravity'], true);
  },
  // 装完直接打开「AI 引擎」板块并展开 Antigravity，让用户马上填服务商 / Key / 模型
  configure(engine) {
    openSettings();
    openSettingsPane('engine');
    setAccOpen(engine, true);
    const head = $('engAcc' + engine[0].toUpperCase() + engine.slice(1) + 'Head');
    head?.scrollIntoView({ block: 'start' });
    head?.focus();
  },
  missingEngine(message) {
    const text = String(message || '');
    const match = /(?:ClaudeBin|CodexBin):.*(?:未找到|不存在)/i.exec(text)
      || /spawn\s+[^\n]*(?:claude|codex)[^\n]*ENOENT/i.exec(text);
    if (match) return /codex/i.test(match[0]) ? 'codex' : 'claude';
    if (/Cannot find module|Missing optional dependency|cannot find native binary/i.test(text)) {
      if (/@openai\/codex/i.test(text)) return 'codex';
      if (/@anthropic-ai\/claude-code/i.test(text)) return 'claude';
    }
    return null;
  },
  fromError(message, taskId) {
    const engine = this.missingEngine(message);
    if (!engine || (taskId && this.seen.has(taskId))) return Promise.resolve(false);
    if (taskId) this.seen.add(taskId);
    return this.ensure(engine, true);
  },
  open(status, forcedEngine = null, engines = ['claude', 'codex'], startup = false) {
    if (this.pending) return this.pending;
    const missing = engines.filter(id => !status[id]?.ready);
    const agy = missing.includes('antigravity');
    const never = $('engineRecoveryNever');
    if (!missing.length) return Promise.resolve(true);
    const dialog = $('engineRecoveryModal');
    const note = $('engineRecoveryNote');
    const progress = $('engineRecoveryProgress');
    const install = $('engineRecoveryInstall');
    const close = $('engineRecoveryClose');
    const dismiss = $('engineRecoveryDismiss');
    dismiss.setAttribute('aria-label', T('close'));
    dismiss.onclick = () => close.click();
    const focus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    let busy = false, completed = false;
    const installed = new Set();
    $('engineRecoveryTitle').textContent = T('engineRecoveryTitle');
    note.textContent = agy ? T('agyRecoveryMissing')
      : T('engineRecoveryMissing').replace('{engines}', missing.map(id => this.names[id]).join('、'));
    install.textContent = T(agy ? 'agyRecoveryInstall' : 'engineRecoveryInstall');
    never.textContent = T('agyRecoveryNever');
    never.hidden = !startup;
    never.disabled = false;
    install.hidden = false;
    install.disabled = false;
    close.textContent = T('engineRecoveryLater');
    dismiss.disabled = close.disabled = false;
    progress.hidden = true;
    this.pending = new Promise(resolve => {
      dialog.oncancel = event => { if (busy) event.preventDefault(); };
      dialog.onclose = () => {
        document.body.style.overflow = previousOverflow;
        this.pending = null;
        if (startup && !completed) { try { sessionStorage.setItem('agyPromptLater', '1'); } catch { /* 存储不可用时仅本次关闭 */ } }
        if (completed && agy) this.configure('antigravity');
        else if (focus?.isConnected) focus.focus();
        resolve(completed);
      };
      close.onclick = () => { if (!busy) dialog.close(); };
      never.onclick = () => {
        if (busy) return;
        try { localStorage.setItem('agyPromptOff', '1'); } catch { /* 存储不可用时仅本次关闭 */ }
        dialog.close();
      };
      install.onclick = async () => {
        if (busy) return;
        busy = true;
        install.disabled = true;
        dismiss.disabled = close.disabled = never.disabled = true;
        progress.hidden = false;
        let stop = () => {};
        try {
          // Recheck on retry so a successful first engine is never reinstalled.
          const current = await api('/api/engine/status?refresh=1');
          for (const id of missing) {
            if (current[id]?.ready && (id !== forcedEngine || installed.has(id))) continue;
            stop = startEngineInstallProgress(progress, T('engineRecoveryInstalling').replace('{engine}', this.names[id]));
            await api('/api/engine/update', { engine: id });
            stop(); stop = () => {};
            const checked = await api('/api/engine/status?refresh=1');
            if (!checked[id]?.ready) throw new Error(T('engineRecoveryVerify').replace('{engine}', this.names[id]));
            installed.add(id);
          }
          const checked = await api('/api/engine/status?refresh=1');
          if (missing.some(id => !checked[id]?.ready)) throw new Error(T('engineRecoveryVerify').replace('{engine}', missing.map(id => this.names[id]).join('、')));
          completed = true;
          note.textContent = T(agy ? 'agyRecoveryDone' : 'engineRecoveryDone');
          progress.textContent = T('engineRecoveryReady');
          install.hidden = never.hidden = true;
          close.textContent = T(agy ? 'agyRecoveryConfigure' : 'engineRecoveryContinue');
        } catch (error) {
          note.textContent = T('engineRecoveryFailed');
          progress.textContent = error.message;
          install.textContent = T('engineRecoveryRetry');
        } finally {
          stop();
          busy = false;
          install.disabled = false;
          dismiss.disabled = close.disabled = never.disabled = false;
          (completed ? close : install).focus();
        }
      };
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      install.focus();
    });
    return this.pending;
  },
};
