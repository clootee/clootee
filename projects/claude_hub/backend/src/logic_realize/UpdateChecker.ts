// 软件版本更新（实现）：git 本地信息、GitHub commits API、git pull、拉起 restart 脚本。
// origin 指向哪个 GitHub 仓库就查那个仓库，不写死 owner/repo——跟随仓库自身，换个 fork 也能用。
import { execFileSync, spawn } from 'child_process';
import * as path from 'path';
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

const GITHUB_API_TIMEOUT_MS = 10000;
const MANIFEST_FILE = 'version.json';

export class UpdateChecker extends UpdateCheckerStruct {
  // 要比较/拉取的分支：本地分支名可能和它实际跟踪的远端分支名不一样
  // （比如本地叫 master 却跟踪 origin/main），git pull 拉的是上游跟踪分支，
  // 所以这里必须查上游而不是本地分支名，否则会拿错分支去比对 GitHub。
  protected static _currentBranch(): string {
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

  // 快进失败时的兜底：检出历史与远端对不上（仓库被重建 / 历史被改写过）时，
  // git pull --ff-only 只会 fatal 退 128，部署机就此永远停在旧版本、每次点更新都白点。
  // 工作区干净时（用户数据都在 .gitignore 里，不受影响）直接对齐远端；有本地改动则不动。
  private static _hardResetIfClean(branch: string, onProgress?: UpdateProgress): UpdateApplyResult {
    const git = GitBin.resolve();
    const run = (args: string[]) =>
      execFileSync(git, args, { cwd: Paths.PROJECT_ROOT, encoding: 'utf-8', windowsHide: true }).trim();
    try {
      if (run(['status', '--porcelain'])) {
        return { ok: false, output: '[git pull] 无法快进，且工作区有本地改动：请先提交或丢弃改动再更新' };
      }
      onProgress?.('[git] 检出历史与远端不一致，工作区干净，改为直接对齐远端');
      run(['fetch', 'origin', branch]);
      const out = run(['reset', '--hard', `origin/${branch}`]);
      onProgress?.(out);
      Logger.info('UpdateChecker', 'hard reset to origin', { branch, out });
      return { ok: true, output: out };
    } catch (e: any) {
      return { ok: false, output: `[git pull] 无法快进，对齐远端也失败: ${e?.message || e}` };
    }
  }

  protected static _pull(onProgress?: UpdateProgress): Promise<UpdateApplyResult> {
    return new Promise((resolve) => {
      const git = GitBin.find();
      if (!git) {
        resolve({ ok: false, output: '[git pull] FAILED: 未找到 git' });
        return;
      }
      Logger.info('UpdateChecker', 'git pull start');
      const child = spawn(git, ['pull', '--ff-only'], { cwd: Paths.PROJECT_ROOT, windowsHide: true });
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
      child.on('close', (code) => {
        Logger.info('UpdateChecker', 'git pull done', { code });
        if (code === 0) {
          resolve({ ok: true, output: out.trim() || 'ok' });
          return;
        }
        const fallback = this._hardResetIfClean(this._currentBranch(), onProgress);
        resolve({
          ok: fallback.ok,
          output: [out.trim() || `git pull 退出码 ${code}`, fallback.output].filter(Boolean).join('\n'),
        });
      });
    });
  }

  // 复用 restart.sh / restart.bat（唯一的自检+编译+pm2重启实现）：detached 拉起，
  // 不受当前进程随后被杀掉影响；脚本尾部在 Windows 下有交互 pause，
  // 但 stdio 设为 ignore 时读到的是空输入，pause 会立即放行，不会挂起。
  protected static _triggerRestart(): void {
    const isWin = process.platform === 'win32';
    const script = path.join(Paths.PROJECT_ROOT, isWin ? 'restart.bat' : 'restart.sh');
    Logger.info('UpdateChecker', 'trigger restart', { script });
    const child = isWin
      ? spawn('cmd.exe', ['/c', script], {
          cwd: Paths.PROJECT_ROOT,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        })
      : spawn('bash', [script], { cwd: Paths.PROJECT_ROOT, detached: true, stdio: 'ignore' });
    child.unref();
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
