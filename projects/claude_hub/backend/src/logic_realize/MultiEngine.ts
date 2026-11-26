import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { EngineAccess } from '../helper/EngineAccess';
import { RunAsUser } from '../helper/RunAsUser';
import * as fs from 'fs';
import * as path from 'path';
import { JsonStore } from '../helper/JsonStore';
import { MultiEngineSettings } from '../helper/MultiEngineSettings';
import { Paths } from '../paths';
import { EventBus } from '../helper/EventBus';
import { SignatureCache } from '../helper/SignatureCache';
import { Ids } from '../helper/Ids';
import { Engine, EngineProviderConfig, MultiEngineEntry, Session } from '../models/Types';
import { Settings } from './Settings';
import { SessionManager } from './SessionManager';
import { RootManager } from './RootManager';
import { ProjectPrompt } from './ProjectPrompt';
import { TaskQueue } from './TaskQueue';
import { SessionLimit } from '../helper/SessionLimit';
import { ApiCost } from './ApiCost';
import { ApiSessionTotals } from '../models/Types';
import { API_COST_MAX_BATCH } from '../config/ClaudePricing';
import { ModelManager } from './ModelManager';
import { AntigravityProfile } from './AntigravityProfile';
import { EngineConfig } from './EngineConfig';

interface Member extends MultiEngineEntry { rootId: string; sessionId: string }
interface Group { id: string; rootId: string; members: Member[] }
export class MultiEngine {
  private static file = path.join(Paths.DATA_ROOT, 'multi_engine_groups.json');
  private static _groupCache?: { signature: string; groups: Group[] };
  static listingVersion(): string { return SignatureCache.fileSignature(this.file) || ''; }
  private static groups(): Group[] {
    const signature = this.listingVersion();
    if (this._groupCache?.signature === signature) return this._groupCache.groups;
    const groups = JsonStore.read<Group[]>(this.file, []); this._groupCache = { signature, groups }; return groups;
  }
  private static _rootCache?: { signature: string; parents: Record<string,string> };
  private static rootParents(): Record<string, string> {
    const signature = (SignatureCache.fileSignature(Paths.ROOTS_FILE) || '') + ':' + this.listingVersion();
    if (this._rootCache?.signature === signature) return this._rootCache.parents;
    const parents: Record<string, string> = {};
    for (const r of RootManager.listRoots()) if (r.multiParentRootId) parents[r.id] = r.multiParentRootId;
    for (const g of this.groups()) for (const m of g.members) parents[m.rootId] = g.rootId;
    this._rootCache = { signature, parents };
    return parents;
  }
  static visibleRoots() {
    const parents = this.rootParents();
    RootManager.markInternalRoots(parents);
    return RootManager.listRoots().filter(r => this.parentRoot(r.id) === r.id).map(r => ({ ...r,
      multiChildRootIds: Object.keys(parents).filter(id => this.parentRoot(id) === r.id) }));
  }
  private static liveId(member: Member): string {
    return SessionManager.runtimeSessions().find(s => s.id === member.sessionId ||
      (s.rootId === member.rootId && !!s.claudeSessionId && `${s.rootId}:${s.claudeSessionId}` === member.sessionId))?.id || member.sessionId;
  }
  static listingInfo(s: Pick<Session, 'id' | 'rootId' | 'claudeSessionId'>) {
    const g = this.group(s);
    if (!g) return undefined;
    return { groupId: g.id, rootId: this.parentRoot(g.rootId), anchorId: this.liveId(g.members[0]),
      anchorRootId: g.members[0].rootId, ids: [...new Set(g.members.flatMap(m => [m.sessionId, this.liveId(m)]))] };
  }
  static metaKey(s: Session): string | undefined { return this.group(s)?.members[0]?.sessionId; }
  static anchorId(id: string): string {
    const s = SessionManager.getRuntimeSession(id); const g = this.group(s); return g ? this.liveId(g.members[0]) : s.id;
  }
  static parentView(s: Session): Session {
    const info = this.listingInfo(s); if (!info) return { ...s, rootId: this.parentRoot(s.rootId) };
    const members = this.members(s.id); const anchor = SessionManager.getSession(info.anchorId);
    return { ...anchor, id: info.anchorId, rootId: info.rootId, multiRootId: info.rootId, multiParentId: info.anchorId,
      multiParent: true, multiSessionIds: info.ids, multiName: '', messages: [],
      name: anchor.name || members.find(m => m.name)?.name || '',
      updatedAt: Math.max(...members.map(m => m.updatedAt)),
      tasks: members.flatMap(m => m.tasks), paused: members.every(m => m.paused),
      concurrencyPaused: members.some(m => m.concurrencyPaused) };
  }
  static visibleSessions(rows: Session[], rootId?: string): Session[] {
    const out: Session[] = []; const used = new Set<string>();
    const push = (s: Session) => {
      const row = this.parentView(s); if (rootId && row.rootId !== this.parentRoot(rootId)) return;
      const key = row.multiGroup || row.id; if (!used.has(key)) { out.push(row); used.add(key); }
    };
    for (const s of rows) push(s);
    if (rootId) for (const g of this.groups()) if (this.parentRoot(g.rootId) === this.parentRoot(rootId)) {
      try { push(SessionManager.getSession(this.liveId(g.members[0]))); } catch { /* Removed groups have no visible row. */ }
    }
    return out.sort((a,b) => Number(!!b.pinned)-Number(!!a.pinned) || b.updatedAt-a.updatedAt);
  }
  static costTotals(ids: string[]): Record<string, ApiSessionTotals> {
    if (!Array.isArray(ids) || ids.length > API_COST_MAX_BATCH) throw new Error('Invalid cost session IDs');
    const out: Record<string, ApiSessionTotals> = {};
    for (const id of ids) {
      let members: string[];
      try { members = this.members(id).map(s => s.id); } catch { members = [id]; }
      const totals = Object.values(ApiCost.totals(members));
      if (!totals.length) continue;
      const sum = structuredClone(totals[0]);
      for (const t of totals.slice(1)) {
        sum.usd += t.usd; sum.cny += t.cny; sum.sub += t.sub; sum.consumedMessages += t.consumedMessages;
        sum.unpriced = (sum.unpriced || 0) + (t.unpriced || 0);
        sum.missingUsageTurns = (sum.missingUsageTurns || 0) + (t.missingUsageTurns || 0);
        for (const key of Object.keys(sum.tokens) as (keyof typeof sum.tokens)[]) sum.tokens[key] += t.tokens[key];
        for (const key of Object.keys(sum.breakdown) as (keyof typeof sum.breakdown)[]) {
          sum.breakdown[key] += t.breakdown[key]; sum.breakdownCny[key] += t.breakdownCny[key];
        }
      }
      out[id] = sum;
    }
    return out;
  }
  static runForGroup(id: string, action: (sessionId: string) => void): void {
    for (const s of this.members(id)) action(s.id);
  }
  static remove(id: string): void {
    const s = SessionManager.getSession(id), g = this.group(s);
    if (!g) { TaskQueue.removeSession(id); return; }
    RootManager.markInternalRoots(this.rootParents());
    const ids = this.members(id).map(m => m.id);
    for (const memberId of ids) TaskQueue.removeSession(memberId);
    JsonStore.write(this.file, this.groups().filter(group => group.id !== g.id)); fs.chmodSync(this.file, 0o600);
  }
  static removeMany(ids: string[]) {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('Invalid session IDs');
    const removed: string[] = [], failed: string[] = [];
    for (const id of ids) { try { this.remove(id); removed.push(id); } catch { failed.push(id); } }
    return { removed, failed };
  }
  static async models(engine: Session['engine'], config: Pick<EngineProviderConfig, 'provider' | 'apiKey' | 'baseUrl' | 'modelsUrl'>) {
    if (engine === 'antigravity') return AntigravityProfile.models(config);
    if (engine !== 'claude' && engine !== 'codex') throw new Error('Invalid engine');
    if (config.provider === 'official') return { models: await ModelManager.officialModels(engine) };
    const ids = await EngineConfig.listModels(config.provider, config.apiKey, config.baseUrl, config.modelsUrl);
    return { models: ids.map(id => ({ id, source: 'api' as const })), recommended: EngineConfig.pickDefaultModel(config.provider, ids) };
  }
  static parentRoot(rootId: string): string {
    const parents = this.rootParents(); const seen = new Set<string>();
    while (parents[rootId] && !seen.has(rootId)) { seen.add(rootId); rootId = parents[rootId]; }
    return rootId;
  }
  private static group(s: Pick<Session, 'id' | 'rootId' | 'claudeSessionId'> & { multiGroup?: string }): Group | undefined {
    return this.groups().find(g => g.id === s.multiGroup || g.members.some(m => m.sessionId === s.id || (m.rootId === s.rootId && m.sessionId.endsWith(':'+s.claudeSessionId) && !!s.claudeSessionId)));
  }
  static decorate(s: Session): Partial<Session> {
    const g = this.group(s), m = g?.members.find(m => m.rootId === s.rootId);
    const info = g ? this.listingInfo(s) : undefined;
    return g && m && info ? { multiGroup: g.id, multiName: m.name, multiRootId: info.rootId, multiParentId: info.anchorId, multiSessionIds: info.ids } : {};
  }
  static config(s: Session): MultiEngineEntry | undefined {
    const member = this.group(s)?.members.find(m => m.rootId === s.rootId);
    // Callers receive a copy: a runner must never mutate the persisted session snapshot.
    return member ? structuredClone(member) : undefined;
  }
  static claudeSettings(s: Session, settings: object): string {
    const dir = path.join(Paths.DATA_ROOT, 'multi_engine_runtime');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    EngineAccess.ensureDir(dir, Settings.runAsUser(), true);
    const file = path.join(dir, createHash('sha256').update(s.id).digest('hex') + '.json');
    fs.writeFileSync(file, JSON.stringify(settings), { mode: 0o600 });
    const cfg = Settings.runAsUser();
    if (RunAsUser.isActive(cfg)) {
      const uid = Number(execFileSync('id', ['-u', cfg.user], { encoding: 'utf8' }).trim());
      const gid = Number(execFileSync('id', ['-g', cfg.user], { encoding: 'utf8' }).trim());
      fs.chownSync(file, uid, gid);
    }
    fs.chmodSync(file, 0o600);
    return file;
  }
  static withSession<T>(s: Session, run: () => T): T {
    const m = this.config(s);
    if (s.multiGroup && !m) throw new Error('Multi-engine configuration unavailable');
    // Always enter a fresh context: a completion callback can start a different engine.
    return EngineConfig.withConfig(m ? { [m.engine]: m.config } : {}, run);
  }
  static create(rootId: string, name: string, engine?: Session['engine'] | 'multi'): Session {
    if (engine !== 'multi') return SessionManager.createSession(rootId, name, engine);
    const setting = Settings.get().multiEngine;
    if (!setting.enabled) throw new Error('请先在设置中启用多引擎 / Enable multiple engines in Settings first');
    rootId = this.parentRoot(rootId);
    const entries = MultiEngineSettings.validate(setting).engines.filter(e => e.enabled !== false);
    if (!entries.length) throw new Error('请至少启用一个引擎 / Enable at least one engine');
    const root = RootManager.getRoot(rootId);
    const base = path.join(root.path, 'divide');
    this.safeDir(base);
    const projectPrompt = ProjectPrompt.getLocal(rootId);
    ProjectPrompt.syncLocal(root.path, projectPrompt);
    ProjectPrompt.ensure(root.path);
    // Check every target before creating sessions; never follow directory symlinks.
    for (const [index, e] of entries.entries()) {
      const dir = path.join(base, e.name);
      this.safeDir(dir);
      for (const filename of ['CLAUDE.md', 'AGENTS.md']) {
        const source = fs.readdirSync(root.path).find(n => n.toLowerCase() === filename.toLowerCase());
        if (!source) continue;
        const target = path.join(dir, filename);
        const existing = fs.readdirSync(dir).find(n => n.toLowerCase() === filename.toLowerCase());
        if (existing && fs.lstatSync(path.join(dir, existing)).isSymbolicLink()) throw new Error(`Unsafe instruction file: ${existing}`);
        if (!existing) fs.copyFileSync(path.join(root.path, source), target, fs.constants.COPYFILE_EXCL);
      }
      ProjectPrompt.syncLocal(dir, projectPrompt);
      ProjectPrompt.ensure(dir);
      this.writeIdentity(dir, index, e);
    }
    const g: Group = { id: Ids.short('multi'), rootId, members: [] };
    const sessions: Session[] = [];
    for (const e of entries) {
      const child = RootManager.ensureRoot(path.join(base, e.name), false);
      RootManager.markInternalRoots({ [child.id]: rootId });
      const s = SessionManager.createSession(child.id, '', e.engine, true);
      s.multiGroup = g.id; s.multiName = e.name;
      sessions.push(s);
      g.members.push({ ...structuredClone(e), rootId: child.id, sessionId: s.id });
    }
    const groups = this.groups(); groups.push(g); JsonStore.write(this.file, groups); fs.chmodSync(this.file, 0o600);
    sessions.forEach(s => SessionManager.saveSession(s));
    SessionManager.markIndexed(sessions[0].id);
    EventBus.broadcast({ kind: 'session', session: this.parentView(sessions[0]) });
    return SessionManager.getSession(sessions[0].id);
  }
  // Identity is taken from the session snapshot, never from subsequently edited settings.
  static ensureIdentity(session: Session): void {
    const group = this.group(session); if (!group) return;
    const index = group.members.findIndex(m => m.rootId === session.rootId);
    if (index < 0) throw new Error('Multi-engine member unavailable');
    this.writeIdentity(RootManager.getRoot(session.rootId).path, index, group.members[index]);
  }
  private static writeIdentity(dir: string, index: number, entry: MultiEngineEntry): void {
    this.safeDir(dir);
    const start = '<!-- clootee:engine-identity:start -->';
    const end = '<!-- clootee:engine-identity:end -->';
    const block = `${start}\n## Multi-engine identity\n- Engine index (zero-based / 引擎编号，从 0 开始): ${index}\n- Engine name / 引擎名称: ${entry.name}\n- Engine type: ${entry.engine === 'antigravity' ? 'Antigravity CLI' : entry.engine === 'codex' ? 'Codex' : 'Claude Code'}\nWhen separate addresses are requested, include your engine index in the address to distinguish it from the other engines.\n${end}`;
    for (const filename of ['CLAUDE.md', 'AGENTS.md']) {
      const matches = fs.readdirSync(dir).filter(n => n.toLowerCase() === filename.toLowerCase());
      for (const name of matches.length ? matches : [filename]) {
        const file = path.join(dir, name);
        if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw new Error(`Unsafe instruction file: ${name}`);
        const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        const at = current.indexOf(start), to = current.indexOf(end, at + start.length);
        const next = at >= 0 && to >= at ? current.slice(0, at) + block + current.slice(to + end.length)
          : `${current.replace(/\s+$/, '')}${current.trim() ? '\n\n' : ''}${block}\n`;
        if (next !== current) {
          const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW || 0), 0o644);
          try { fs.writeFileSync(fd, next, 'utf8'); } finally { fs.closeSync(fd); }
        }
      }
    }
  }
  private static safeDir(dir: string): void {
    if (fs.existsSync(dir)) {
      const stat = fs.lstatSync(dir);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe divide directory: ${dir}`);
    } else fs.mkdirSync(dir);
  }
  static participating(s: Session): boolean {
    if (!s.multiGroup || !s.multiName) return true;
    const name = s.multiName.toLowerCase();
    return !Settings.get().multiEngine.engines.some(e => e.enabled === false && e.name.toLowerCase() === name);
  }
  static submit(sessionId: string, prompts: string[], approvals: string[] = [], scope: 'all' | 'current' = 'all') {
    if (scope !== 'all' && scope !== 'current') throw new Error('Invalid delivery scope');
    if (!Array.isArray(prompts) || !prompts.length || prompts.some(p => typeof p !== 'string' || !p.trim())) throw new Error('Invalid prompts');
    const targets = scope === 'current' ? [SessionManager.getSession(sessionId)] : this.members(sessionId);
    const members = targets.filter(s => this.participating(s));
    if (!members.length) throw new Error('所选引擎已关闭 / No enabled recipients');
    for (const s of members) {
      const full = SessionManager.getSessionFull(s.id);
      SessionLimit.assertCapacity(SessionLimit.status(full, full.messages, Settings.get().costOptimization), prompts.length);
    }
    for (const s of members) this.ensureIdentity(s);
    return members.flatMap(s => TaskQueue.addTasks(s.id, prompts, false, s.id === sessionId ? approvals : []));
  }
  static members(sessionId: string): Session[] {
    const s = SessionManager.getSession(sessionId), g = this.group(s);
    return g ? g.members.map(m => SessionManager.getRuntimeSession(m.sessionId)) : [s];
  }
  static reconcile(s: Session): void {
    if (!s.multiGroup || !s.claudeSessionId) return;
    const groups = this.groups(), g = groups.find(g => g.id === s.multiGroup);
    const m = g?.members.find(m => m.rootId === s.rootId);
    if (m && m.sessionId !== `${s.rootId}:${s.claudeSessionId}`) { m.sessionId = `${s.rootId}:${s.claudeSessionId}`; JsonStore.write(this.file, groups); fs.chmodSync(this.file, 0o600); }
  }
}
