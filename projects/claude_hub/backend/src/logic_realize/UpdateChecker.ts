// 软件版本更新（实现）：git 本地信息、GitHub commits API、git pull、拉起 restart 脚本。
// origin 指向哪个 GitHub 仓库就查那个仓库，不写死 owner/repo——跟随仓库自身，换个 fork 也能用。
import { execFileSync, spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  UpdateCheckerStruct,
  UpdateCommitInfo,
  UpdateApplyResult,
  UpdateProgress,
  UpdateManifest,
} from '../logic_struct/UpdateCheckerStruct';
import { GitBin } from '../helper/GitBin';
import { HttpJson } from '../helper/HttpJson';
import { PackageInfo } from '../helper/PackageInfo';
import { SemVer } from '../helper/SemVer';
import { Paths } from '../paths';
import { Logger } from '../helper/Logger';
import { ErrorHandler } from '../helper/ErrorHandler';

const GITHUB_API_TIMEOUT_MS = 10000;
const MANIFEST_FILE = 'version.json';

export class UpdateChecker extends UpdateCheckerStruct {
  // 要比较/拉取的分支：本地分支名可能和它实际跟踪的远端分支名不一样
  // （比如本地叫 master 却跟踪 origin/main），git pull 拉的是上游跟踪分支，
  // 所以这里必须查上游而不是本地分支名，否则会拿错分支去比对 GitHub。
  private static _hasRepo(): boolean {
    const dir = path.resolve(Paths.PROJECT_ROOT, '../..', '.git');
    return fs.existsSync(dir) && !fs.existsSync(path.join(dir, 'clootee-bootstrap'));
  }

  protected static _currentBranch(): string {
    if (!this._hasRepo()) return 'main';
    const git = GitBin.resolve();
    try {
      const upstream = execFileSync(
        git,
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
        { cwd: Paths.PROJECT_ROOT, encoding: 'utf-8', windowsHide: true },
      ).trim();
      const slash = upstream.indexOf('/');
      if (slash > 0) return upstream.slice(slash + 1);
    } catch {
      /* 没配上游跟踪分支：回退到本地分支名 */
    }
    return execFileSync(git, ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: Paths.PROJECT_ROOT,
      encoding: 'utf-8',
      windowsHide: true,
    }).trim();
  }

  protected static _localCommit(): UpdateCommitInfo {
    if (!this._hasRepo()) return { sha: '', short: '', date: '', message: 'Release package' };
    const git = GitBin.resolve();
    const raw = execFileSync(git, ['log', '-1', '--format=%H%n%h%n%cI%n%s'], {
      cwd: Paths.PROJECT_ROOT,
      encoding: 'utf-8',
      windowsHide: true,
    });
    return this._parseLocalLog(raw);
  }

  protected static async _remoteCommit(branch: string): Promise<UpdateCommitInfo> {
    const { owner, repo } = this._originRepo();
    const url = `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`;
    const res = await HttpJson.get(url, { 'User-Agent': 'claude-hub-update-checker' }, GITHUB_API_TIMEOUT_MS);
    if (res.status !== 200 || !res.json || !res.json.sha)
      throw new Error(`UpdateChecker: GitHub API 请求失败 status=${res.status} url=${url}`);
    return this._parseRemoteCommit(res.json);
  }

  protected static _localVersion(): string {
    return PackageInfo.version();
  }

  // 版本清单走 raw.githubusercontent.com 直读仓库文件：不消耗 GitHub API 速率，
  // 且跟随 origin 指向的仓库与当前分支，fork 出去也能各自管各自的发版。
  // 带时间戳查询串是为了绕开 raw 的 CDN 缓存，否则刚推的 version.json 可能几分钟内读到旧的。
  protected static async _remoteManifest(branch: string): Promise<UpdateManifest | null> {
    const { owner, repo } = this._originRepo();
    const url =
      `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${MANIFEST_FILE}` +
      `?t=${Date.now()}`;
    try {
      const res = await HttpJson.get(
        url,
        { 'User-Agent': 'claude-hub-update-checker', 'Cache-Control': 'no-cache' },
        GITHUB_API_TIMEOUT_MS,
      );
      if (res.status !== 200 || !res.json) {
        Logger.info('UpdateChecker', 'manifest unavailable', { status: res.status, url });
        return null;
      }
      return this._normalizeManifest(res.json);
    } catch (e: any) {
      Logger.info('UpdateChecker', 'manifest fetch failed', { err: e?.message, url });
      return null; // 清单读不到不算错误：退回 commit 兜底，不打断用户
    }
  }

  // 汇总结论。清单读不到、或两边版本号有一个不合法，都判定为「无法确认有新版本」→ hasUpdate=false。
  // 这里不拿 commit 差异兜底：判定权只在清单，兜底会把本地未推送的提交误报成新版本。
  protected static _decide(
    currentVersion: string,
    manifest: UpdateManifest | null,
    lang?: string,
  ): { hasUpdate: boolean; mandatory: boolean; latestVersion: string; notes: string; releasedAt: string } {
    const unknown = {
      hasUpdate: false,
      mandatory: false,
      latestVersion: currentVersion,
      notes: '',
      releasedAt: '',
    };
    if (!manifest) return unknown;
    if (SemVer.parse(manifest.version) === null || SemVer.parse(currentVersion) === null) {
      Logger.info('UpdateChecker', 'version not comparable, treat as no update', {
        currentVersion,
        latestVersion: manifest.version,
      });
      return unknown;
    }
    const hasUpdate = SemVer.gt(manifest.version, currentVersion);
    return {
      hasUpdate,
      mandatory: hasUpdate && this._isMandatory(currentVersion, manifest),
      latestVersion: manifest.version,
      notes: this._pickNotes(manifest, lang),
      releasedAt: String(manifest.releasedAt || ''),
    };
  }

  protected static _repoUrl(): string {
    const { owner, repo } = this._originRepo();
    return `https://github.com/${owner}/${repo}`;
  }

  private static _confirmation(): UpdateApplyResult {
    return { ok: false, requiresConfirmation: true, output: 'Local Clootee changes require confirmation before overwriting.' };
  }

  private static _updateSpecs(root: string, run: (args: string[]) => string, commit?: string): string[] {
    const excluded = new Set<string>(['projects/claude_hub/data']);
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if ((entry.isDirectory() || entry.isSymbolicLink()) && !['scripts', 'docs', 'projects', '.github'].includes(entry.name)) excluded.add(entry.name);
    }
    const projects = new Set<string>();
    if (fs.existsSync(path.join(root, 'projects'))) {
      for (const name of fs.readdirSync(path.join(root, 'projects'))) projects.add(name);
    }
    if (commit) {
      for (const name of run(['ls-tree', '-z', '--name-only', `${commit}:projects`]).split('\0')) if (name) projects.add(name);
    }
    for (const file of run(['ls-files', '-z', 'projects/']).split('\0')) if (file) projects.add(file.split('/')[1]);
    for (const name of projects) if (name !== 'claude_hub') excluded.add(`projects/${name}`);
    return ['.', ...Array.from(excluded, entry => `:(top,exclude,literal)${entry}`)];
  }

  // Only an explicitly confirmed request may discard local code or commits.
  private static _forcePull(branch: string, onProgress?: UpdateProgress): UpdateApplyResult {
    const git = GitBin.resolve();
    const root = path.resolve(Paths.PROJECT_ROOT, '../..');
    const run = (args: string[], input?: string) =>
      execFileSync(git, args, {
        cwd: root, encoding: 'utf-8', windowsHide: true, timeout: 180000, input,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', LC_ALL: 'C' },
      }).trim();
    try {
      const actual = fs.realpathSync(run(['rev-parse', '--show-toplevel']));
      const expected = fs.realpathSync(root);
      const canonical = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
      if (canonical(actual) !== canonical(expected)) throw new Error('Refusing to update a repository outside the Clootee installation');
      run(['check-ref-format', `refs/heads/${branch}`]);
      // Fetch must succeed before touching local changes. Never clean user files
      // or hard-reset the entire monorepo: it can contain other projects.
      onProgress?.('[git] Fetching the confirmed update');
      run(['fetch', '--no-tags', 'origin', `refs/heads/${branch}`]);
      const commit = run(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
      run(['cat-file', '-e', `${commit}:projects/claude_hub/backend/package.json`]);
      const specs = this._updateSpecs(root, run, commit);
      // Restore only Clootee code. Other projects retain both their working files
      // and index entries, including partially staged edits and local commits.
      run(['-c', 'submodule.recurse=false', 'restore', `--source=${commit}`, '--staged', '--worktree',
        '--pathspec-from-file=-', '--pathspec-file-nul'], specs.join('\0') + '\0');
      const mergeState = path.resolve(root, run(['rev-parse', '--git-path', 'MERGE_HEAD']));
      if (fs.existsSync(mergeState)) run(['merge', '--quit']);
      run(['reset', '--soft', commit]);
      const out = `Updated Clootee to ${commit}`;
      onProgress?.(out);
      Logger.info('UpdateChecker', 'confirmed force update', { branch, commit });
      return { ok: true, output: out };
    } catch (e: any) {
      return { ok: false, output: ErrorHandler.handle(e, 'UpdateChecker.forcePull') };
    }
  }

  protected static _pull(onProgress?: UpdateProgress, force = false): Promise<UpdateApplyResult> {
    return new Promise((resolve) => {
      const git = GitBin.find();
      if (!git) {
        resolve({ ok: false, output: '[git pull] FAILED: 未找到 git' });
        return;
      }
      Logger.info('UpdateChecker', 'git pull start');
      const root = path.resolve(Paths.PROJECT_ROOT, '../..');
      const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', LC_ALL: 'C' };
      // Release ZIPs have no .git. Establish tracking without touching ignored user data.
      if (!this._hasRepo()) {
        if (!force) { resolve(this._confirmation()); return; }
        try {
          const run = (args: string[]) => execFileSync(git, args, {
            cwd: root, encoding: 'utf-8', windowsHide: true, env, timeout: 180000,
          });
          onProgress?.('[git] Preparing release package update');
          run(['init']);
          fs.writeFileSync(path.join(root, '.git', 'clootee-bootstrap'), 'pending');
          try { run(['remote', 'get-url', 'origin']); } catch {
            run(['remote', 'add', 'origin', 'https://github.com/clootee/clootee.git']);
          }
          const updated = this._forcePull('main', onProgress);
          if (!updated.ok) { resolve(updated); return; }
          run(['branch', '-M', 'main']);
          run(['branch', '--set-upstream-to=origin/main', 'main']);
          fs.unlinkSync(path.join(root, '.git', 'clootee-bootstrap'));
          resolve({ ok: true, output: 'Release package updated' });
        } catch (e: any) {
          resolve({ ok: false, output: e.message });
        }
        return;
      }
      if (force) { resolve(this._forcePull(this._currentBranch(), onProgress)); return; }
      const inspect = (args: string[]) => execFileSync(git, args, {
        cwd: root, encoding: 'utf-8', windowsHide: true, env, timeout: 10000,
      }).trim();
      const localChanges = inspect(['status', '--porcelain', '--untracked-files=no', '--', ...this._updateSpecs(root, inspect)]);
      if (localChanges) { resolve(this._confirmation()); return; }
      const child = spawn(git, ['pull', '--ff-only'], {
        cwd: Paths.PROJECT_ROOT, windowsHide: true, env, timeout: 180000,
      });
      let out = '';
      const cap = (c: Buffer) => {
        const text = c.toString();
        out += text;
        text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .forEach((l) => onProgress?.(l));
      };
      child.stdout?.on('data', cap);
      child.stderr?.on('data', cap);
      child.on('error', (e) => resolve({ ok: false, output: `[git pull] FAILED: ${e.message}` }));
      child.on('close', (code, signal) => {
        Logger.info('UpdateChecker', 'git pull done', { code });
        if (signal) {
          resolve({ ok: false, output: `${out}\nGit pull interrupted (${signal}); please retry.` });
          return;
        }
        if (code === 0) {
          resolve({ ok: true, output: out.trim() || 'ok' });
          return;
        }
        // A failed fast-forward must never silently discard local commits.
        // Keep network/auth errors as ordinary errors, rather than offering reset.
        let localCommits = false;
        try {
          localCommits = Number(execFileSync(git, ['rev-list', '--count', '@{u}..HEAD'], {
            cwd: root, encoding: 'utf8', windowsHide: true, env, timeout: 10000,
          }).trim()) > 0;
        } catch (e) { ErrorHandler.handle(e, 'UpdateChecker.localCommits'); }
        if (localCommits || /untracked working tree files|local changes.*overwritten|not possible to fast-forward|diverging branches|refusing to merge unrelated histories/i.test(out)) {
          resolve(this._confirmation());
        } else {
          resolve({ ok: false, output: out.trim() || `git pull exited ${code}` });
        }
      });
    });
  }

  // Restart through the Windows background service; keep diagnostics on disk.
  protected static _triggerRestart(onFailure: (error: string) => void): Promise<void> {
    const isWin = process.platform === 'win32';
    const script = isWin
      ? path.resolve(Paths.PROJECT_ROOT, '../../scripts/restart-update.js')
      : path.join(Paths.PROJECT_ROOT, 'restart.sh');
    fs.mkdirSync(Paths.LOGS_DIR, { recursive: true });
    const log = fs.openSync(path.join(Paths.LOGS_DIR, 'update-restart.log'), 'a');
    fs.writeSync(log, `\n[${new Date().toISOString()}] Launching restart for server ${process.pid}: ${script}\n`);
    Logger.info('UpdateChecker', 'trigger restart', { script });
    const child = isWin
      ? spawn(process.execPath, [script, String(process.env.PORT || 8970)], {
          cwd: Paths.PROJECT_ROOT, detached: true, stdio: ['ignore', log, log, 'ipc'], windowsHide: true,
        })
      : spawn('bash', [script], { cwd: Paths.PROJECT_ROOT, detached: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    return new Promise((resolve, reject) => {
      if (isWin) child.on('message', (message: any) => {
        if (message?.type !== 'ready-to-stop') return;
        Logger.info('UpdateChecker', 'build complete; handing restart over to Node supervisor');
        child.send({ type: 'stop-approved' }, (error) => {
          if (error) { onFailure(ErrorHandler.handle(error, 'UpdateChecker.restartHandoff')); return; }
          // Stop only this server. The independent supervisor survives and starts
          // the new service; no WMI permissions or process-tree killing required.
          setTimeout(() => process.exit(0), 300);
        });
      });
      child.once('spawn', () => { child.unref(); resolve(); });
      child.once('error', (e) => {
        Logger.error('UpdateChecker', 'restart launch failed', e);
        onFailure(e.message);
        reject(e);
      });
      child.once('exit', (code, signal) => {
        // A successful restart terminates this server. If we observe exit here,
        // the old process survived and must allow a retry (even for exit 0).
        let detail = '';
        try { detail = fs.readFileSync(path.join(Paths.LOGS_DIR, 'update-restart.log'), 'utf8').slice(-3000); }
        catch (e) { ErrorHandler.handle(e, 'UpdateChecker.restartLog'); }
        const error = `Restart failed (exit=${code}, signal=${signal || ''}). ${detail}`;
        Logger.error('UpdateChecker', error);
        onFailure(error);
      });
    });
  }

  private static _parseLocalLog(raw: string): UpdateCommitInfo {
    const lines = raw.split('\n');
    return {
      sha: (lines[0] || '').trim(),
      short: (lines[1] || '').trim(),
      date: (lines[2] || '').trim(),
      message: (lines[3] || '').trim(),
    };
  }

  private static _parseRemoteCommit(c: any): UpdateCommitInfo {
    const sha = String(c.sha || '');
    return {
      sha,
      short: sha.slice(0, 7),
      message: String(c.commit?.message || '').split('\n')[0],
      date: c.commit?.committer?.date || c.commit?.author?.date || '',
    };
  }

  // 强制更新的两条来源，满足其一即强制：
  //   force: true      —— 一刀切，所有低版本都必须更新（用于紧急修复）
  //   minVersion: "x"  —— 本机版本低于它才强制（用于「太旧的版本不再支持」）
  private static _isMandatory(currentVersion: string, m: UpdateManifest): boolean {
    if (m.force === true) return true;
    if (SemVer.parse(m.minVersion) === null) return false;
    return SemVer.lt(currentVersion, String(m.minVersion));
  }

  // 说明文案优先按语言取 notesI18n，退回 notes，再退回英文条目
  private static _pickNotes(m: UpdateManifest, lang?: string): string {
    const i18n = m.notesI18n;
    if (i18n && typeof i18n === 'object') {
      const key = String(lang || '').toLowerCase();
      if (key && typeof i18n[key] === 'string') return i18n[key];
      const short = key.split('-')[0];
      if (short && typeof i18n[short] === 'string') return i18n[short];
      if (typeof i18n.en === 'string') return i18n.en;
    }
    return typeof m.notes === 'string' ? m.notes : '';
  }

  private static _normalizeManifest(raw: any): UpdateManifest {
    return {
      version: String(raw.version || ''),
      minVersion: raw.minVersion === undefined ? undefined : String(raw.minVersion),
      force: raw.force === true,
      releasedAt: raw.releasedAt === undefined ? undefined : String(raw.releasedAt),
      notes: raw.notes === undefined ? undefined : String(raw.notes),
      notesI18n: raw.notesI18n && typeof raw.notesI18n === 'object' ? raw.notesI18n : undefined,
    };
  }

  private static _originRepo(): { owner: string; repo: string } {
    if (!this._hasRepo()) return { owner: 'clootee', repo: 'clootee' };
    const git = GitBin.resolve();
    const url = execFileSync(git, ['remote', 'get-url', 'origin'], {
      cwd: Paths.PROJECT_ROOT,
      encoding: 'utf-8',
      windowsHide: true,
    }).trim();
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
    if (!m) throw new Error(`UpdateChecker: 无法从 origin 解析 GitHub 仓库: ${url}`);
    return { owner: m[1], repo: m[2] };
  }
}
