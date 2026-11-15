import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { EngineAccess } from '../helper/EngineAccess';
import { RunAsUser } from '../helper/RunAsUser';
import * as fs from 'fs';
import * as path from 'path';
import { JsonStore } from '../helper/JsonStore';
import { MultiEngineSettings } from '../helper/MultiEngineSettings';
import { Paths } from '../paths';
import { Ids } from '../helper/Ids';
import { Engine, EngineProviderConfig, MultiEngineEntry, Session } from '../models/Types';
import { Settings } from './Settings';
import { SessionManager } from './SessionManager';
import { RootManager } from './RootManager';
import { ProjectPrompt } from './ProjectPrompt';
import { TaskQueue } from './TaskQueue';
import { SessionLimit } from '../helper/SessionLimit';
import { ModelManager } from './ModelManager';
import { EngineConfig } from './EngineConfig';

interface Member extends MultiEngineEntry { rootId: string; sessionId: string }
interface Group { id: string; rootId: string; members: Member[] }
export class MultiEngine {
  private static file = path.join(Paths.DATA_ROOT, 'multi_engine_groups.json');
  private static groups(): Group[] { return JsonStore.read<Group[]>(this.file, []); }
  static async models(engine: Engine, config: Pick<EngineProviderConfig, 'provider' | 'apiKey' | 'baseUrl' | 'modelsUrl'>) {
    if (engine !== 'claude' && engine !== 'codex') throw new Error('Invalid engine');
    if (config.provider === 'official') return { models: await ModelManager.officialModels(engine) };
    const ids = await EngineConfig.listModels(config.provider, config.apiKey, config.baseUrl, config.modelsUrl);
    return { models: ids.map(id => ({ id, source: 'api' as const })), recommended: EngineConfig.pickDefaultModel(config.provider, ids) };
  }
  static parentRoot(rootId: string): string {
    return this.groups().find(g => g.members.some(m => m.rootId === rootId))?.rootId || rootId;
  }
  private static group(s: Session): Group | undefined {
    return this.groups().find(g => g.id === s.multiGroup || g.members.some(m => m.sessionId === s.id || (m.rootId === s.rootId && m.sessionId.endsWith(':'+s.claudeSessionId) && !!s.claudeSessionId)));
  }
  static decorate(s: Session): Partial<Session> {
    const g = this.group(s), m = g?.members.find(m => m.rootId === s.rootId);
    return g && m ? { multiGroup: g.id, multiName: m.name } : {};
  }
  static config(s: Session): MultiEngineEntry | undefined {
    return this.group(s)?.members.find(m => m.rootId === s.rootId);
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
  static create(rootId: string, name: string, engine?: Engine | 'multi'): Session {
    if (engine !== 'multi') return SessionManager.createSession(rootId, name, engine);
    const setting = Settings.get().multiEngine;
    if (!setting.enabled) throw new Error('请先在设置中启用多引擎 / Enable multiple engines in Settings first');
    rootId = this.parentRoot(rootId);
    const entries = MultiEngineSettings.validate(setting).engines;
    const root = RootManager.getRoot(rootId);
    const base = path.join(root.path, 'divide');
    this.safeDir(base);
    ProjectPrompt.ensure(root.path);
    // Check every target before creating sessions; never follow directory symlinks.
    for (const e of entries) {
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
      ProjectPrompt.ensure(dir);
    }
    const g: Group = { id: Ids.short('multi'), rootId, members: [] };
    const sessions: Session[] = [];
    for (const e of entries) {
      const child = RootManager.ensureRoot(path.join(base, e.name), false);
      const s = SessionManager.createSession(child.id, '', e.engine);
      s.multiGroup = g.id; s.multiName = e.name;
      sessions.push(s);
      g.members.push({ ...e, rootId: child.id, sessionId: s.id });
    }
    const groups = this.groups(); groups.push(g); JsonStore.write(this.file, groups); fs.chmodSync(this.file, 0o600);
    sessions.forEach(s => SessionManager.saveSession(s));
    return sessions[0];
  }
  private static safeDir(dir: string): void {
    if (fs.existsSync(dir)) {
      const stat = fs.lstatSync(dir);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe divide directory: ${dir}`);
    } else fs.mkdirSync(dir);
  }
  static submit(sessionId: string, prompts: string[], approvals: string[] = []) {
    if (!Array.isArray(prompts) || !prompts.length || prompts.some(p => typeof p !== 'string' || !p.trim())) throw new Error('Invalid prompts');
    const members = this.members(sessionId);
    for (const s of members) {
      const full = SessionManager.getSessionFull(s.id);
      SessionLimit.assertCapacity(SessionLimit.status(full, full.messages, Settings.get().costOptimization), prompts.length);
    }
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
