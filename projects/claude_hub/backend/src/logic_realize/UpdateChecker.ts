// 软件版本更新（实现）：git 本地信息、GitHub commits API、git pull、拉起 restart 脚本。
// origin 指向哪个 GitHub 仓库就查那个仓库，不写死 owner/repo——跟随仓库自身，换个 fork 也能用。
import { execFileSync, spawn } from 'child_process';
import * as path from 'path';
import {
  UpdateCheckerStruct,
  UpdateCommitInfo,
  UpdateApplyResult,
  UpdateProgress,
} from '../logic_struct/UpdateCheckerStruct';
import { GitBin } from '../helper/GitBin';
import { HttpJson } from '../helper/HttpJson';
import { Paths } from '../paths';
import { Logger } from '../helper/Logger';

const GITHUB_API_TIMEOUT_MS = 10000;

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
        { cwd: Paths.PROJECT_ROOT, encoding: 'utf-8' },
      ).trim();
      const slash = upstream.indexOf('/');
      if (slash > 0) return upstream.slice(slash + 1);
    } catch {
      /* 没配上游跟踪分支：回退到本地分支名 */
    }
    return execFileSync(git, ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: Paths.PROJECT_ROOT,
      encoding: 'utf-8',
    }).trim();
  }

  protected static _localCommit(): UpdateCommitInfo {
    const git = GitBin.resolve();
    const raw = execFileSync(git, ['log', '-1', '--format=%H%n%h%n%cI%n%s'], {
      cwd: Paths.PROJECT_ROOT,
      encoding: 'utf-8',
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

  protected static _repoUrl(): string {
    const { owner, repo } = this._originRepo();
    return `https://github.com/${owner}/${repo}`;
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
        resolve({ ok: code === 0, output: out.trim() || (code === 0 ? 'ok' : `git pull 退出码 ${code}`) });
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

  private static _originRepo(): { owner: string; repo: string } {
    const git = GitBin.resolve();
    const url = execFileSync(git, ['remote', 'get-url', 'origin'], {
      cwd: Paths.PROJECT_ROOT,
      encoding: 'utf-8',
    }).trim();
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
    if (!m) throw new Error(`UpdateChecker: 无法从 origin 解析 GitHub 仓库: ${url}`);
    return { owner: m[1], repo: m[2] };
  }
}
