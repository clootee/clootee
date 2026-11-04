// Runtime recovery uses the same installation API and progress stream as Settings.
const EngineRecovery = {
  pending: null,
  seen: new Set(),
  names: { claude: 'Claude Code', codex: 'Codex' },
  async ensure(engine = 'claude', force = false) {
    try {
      if (this.pending) return await this.pending;
      const status = await api('/api/engine/status?refresh=1');
      if (!force && status[engine]?.ready) return true;
      if (force && status[engine]) status[engine].ready = false;
      return await this.open(status, force ? engine : null);
    } catch (error) {
      alert(T('engineRecoveryCheckFailed') + '\n' + error.message);
      return false;
    }
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
  open(status, forcedEngine = null) {
    if (this.pending) return this.pending;
    const missing = Object.keys(this.names).filter(id => !status[id]?.ready);
    if (!missing.length) return Promise.resolve(true);
    const dialog = $('engineRecoveryModal');
    const note = $('engineRecoveryNote');
    const progress = $('engineRecoveryProgress');
    const install = $('engineRecoveryInstall');
    const close = $('engineRecoveryClose');
    const focus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    let busy = false, completed = false;
    const installed = new Set();
    $('engineRecoveryTitle').textContent = T('engineRecoveryTitle');
    note.textContent = T('engineRecoveryMissing').replace('{engines}', missing.map(id => this.names[id]).join('、'));
    install.textContent = T('engineRecoveryInstall');
    install.hidden = false;
    install.disabled = false;
    close.textContent = T('engineRecoveryLater');
    close.disabled = false;
    progress.hidden = true;
    this.pending = new Promise(resolve => {
      dialog.oncancel = event => { if (busy) event.preventDefault(); };
      dialog.onclose = () => {
        document.body.style.overflow = previousOverflow;
        this.pending = null;
        if (focus?.isConnected) focus.focus();
        resolve(completed);
      };
      close.onclick = () => { if (!busy) dialog.close(); };
      install.onclick = async () => {
        if (busy) return;
        busy = true;
        install.disabled = true;
        close.disabled = true;
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
          note.textContent = T('engineRecoveryDone');
          progress.textContent = T('engineRecoveryReady');
          install.hidden = true;
          close.textContent = T('engineRecoveryContinue');
        } catch (error) {
          note.textContent = T('engineRecoveryFailed');
          progress.textContent = error.message;
          install.textContent = T('engineRecoveryRetry');
        } finally {
          stop();
          busy = false;
          install.disabled = false;
          close.disabled = false;
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
