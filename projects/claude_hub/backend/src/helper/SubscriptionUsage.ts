import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { EngineConfig } from '../logic_realize/EngineConfig';
import { ClaudeLogin } from '../logic_realize/ClaudeLogin';
import { Settings } from '../logic_realize/Settings';
import { HttpJson } from './HttpJson';
import { CodexStoreHelper } from './CodexStoreHelper';
import { ClaudeStoreHelper } from './ClaudeStoreHelper';

export class SubscriptionUsage {
  private static cache = new Map<string, { at: number; data: unknown }>();
  private static pending = new Map<string, Promise<unknown>>();
  static async get(): Promise<unknown> {
    const config = EngineConfig.get();
    const names = [
      ...(config.codex.provider === 'official' ? ['ChatGPT'] : []),
      ...(config.claude.provider === 'official' ? ['Claude'] : []),
    ];
    const key = JSON.stringify([Settings.effectiveHomeDir(), names]);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 120000) return cached.data;
    if (this.pending.has(key)) return this.pending.get(key);
    const pending = Promise.all(names.map(name => this.read(name)))
      .then(accounts => {
        const data = { accounts, updatedAt: new Date().toISOString() };
        // 只缓存全部成功的结果：失败（网络抖动、凭据刚被刷新）下次打开设置就该立刻重试
        if (accounts.every((a: any) => a.status === 'ok')) this.cache.set(key, { at: Date.now(), data });
        return data;
      }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, pending);
    return pending;
  }
  private static claudeToken(home: string): string | undefined {
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(ClaudeStoreHelper.configDir(home), '.credentials.json'), 'utf8');
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
      if (process.platform !== 'darwin') throw Object.assign(new Error('no-credentials'), { code: 'no-credentials' });
      raw = execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { encoding: 'utf8', timeout: 3000 });
    }
    return JSON.parse(raw).claudeAiOauth?.accessToken;
  }
  // Claude Code 只在自己发请求时续期（access token 约 8 小时过期）；一段时间没跑任务，
  // 文件里的 token 就已过期，余量接口一直 401。这里按 CLI 同样的方式用 refresh token 续期并写回。
  private static refreshing?: Promise<string | undefined>;
  private static refreshClaudeToken(home: string, force: boolean): Promise<string | undefined> {
    this.refreshing ??= this.doRefreshClaudeToken(home, force).finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private static async doRefreshClaudeToken(home: string, force: boolean): Promise<string | undefined> {
    const file = path.join(ClaudeStoreHelper.configDir(home), '.credentials.json');
    if (!fs.existsSync(file)) return undefined; // macOS 钥匙串由 CLI 自己维护
    for (let attempt = 0; attempt < 2; attempt++) {
      const json = JSON.parse(fs.readFileSync(file, 'utf8'));
      const oauth = json.claudeAiOauth;
      if (!oauth?.refreshToken) return undefined;
      if (!force && attempt === 0 && Number(oauth.expiresAt) > Date.now() + 60000) return oauth.accessToken;
      const response = await HttpJson.post('https://platform.claude.com/v1/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: oauth.refreshToken,
        client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
        ...(Array.isArray(oauth.scopes) && oauth.scopes.length ? { scope: oauth.scopes.join(' ') } : {}),
      }, {}, 10000);
      const data = response.json;
      if (response.status >= 200 && response.status < 300 && data?.access_token) {
        // 写回前重读：期间 CLI 可能已续期，保留文件里其他字段
        const latest = JSON.parse(fs.readFileSync(file, 'utf8'));
        latest.claudeAiOauth = {
          ...latest.claudeAiOauth,
          accessToken: data.access_token,
          ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
          ...(typeof data.expires_in === 'number' ? { expiresAt: Date.now() + data.expires_in * 1000 } : {}),
          ...(typeof data.scope === 'string' ? { scopes: data.scope.split(' ').filter(Boolean) } : {}),
        };
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(latest), { mode: 0o600 });
        fs.renameSync(tmp, file);
        return data.access_token;
      }
      // refresh token 已被并发运行的 CLI 轮换掉：重读文件，用它刚写入的新凭据再试一次
      const reread = JSON.parse(fs.readFileSync(file, 'utf8')).claudeAiOauth;
      if (reread?.refreshToken === oauth.refreshToken) return undefined;
      if (Number(reread?.expiresAt) > Date.now() + 60000) return reread.accessToken;
    }
    return undefined;
  }
  private static async read(name: string): Promise<unknown> {
    const rows: { label: string; remaining: number; reset?: string }[] = [];
    try {
      const home = Settings.effectiveHomeDir() || os.homedir();
      let token: string | undefined;
      let account: string | undefined;
      if (name === 'ChatGPT') {
        const auth = JSON.parse(fs.readFileSync(path.join(CodexStoreHelper.codexHome(home), 'auth.json'), 'utf8'));
        token = auth.tokens?.access_token;
        account = auth.tokens?.account_id;
      } else {
        token = this.claudeToken(home);
        try { token = (await this.refreshClaudeToken(home, false)) || token; } catch { /* 续期失败仍用原 token，401 再走兜底 */ }
      }
      if (!token) return { name, status: 'unavailable', reason: 'no-token', rows };
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (name === 'Claude') headers['anthropic-beta'] = 'oauth-2025-04-20';
      if (account) headers['ChatGPT-Account-Id'] = account;
      const url = name === 'Claude' ? 'https://api.anthropic.com/api/oauth/usage' : 'https://chatgpt.com/backend-api/wham/usage';
      let response = await HttpJson.get(url, headers, 10000);
      if (name === 'Claude' && response.status === 401) {
        const auth = await ClaudeLogin.status();
        let latest = this.claudeToken(home);
        if (!latest || latest === token) latest = await this.refreshClaudeToken(home, true).catch(() => undefined);
        if (latest && latest !== token) {
          headers.Authorization = `Bearer ${latest}`;
          response = await HttpJson.get(url, headers, 10000);
        }
        if (response.status === 401) {
          const signedOut = auth.cliFound && !auth.error && auth.needsLogin;
          return { name, status: signedOut ? 'expired' : 'unavailable', reason: signedOut ? 'claude-signed-out' : 'usage-unauthorized', rows };
        }
      }
      if (response.status < 200 || response.status >= 300) return { name, status: response.status === 401 ? 'expired' : 'error', reason: `http-${response.status}`, rows };
      const data = response.json;
      if (!data || typeof data !== 'object') return { name, status: 'error', reason: 'bad-response', rows };
      const add = (label: string, used: unknown, reset?: string) => {
        if (typeof used === 'number' && Number.isFinite(used)) rows.push({ label, remaining: Math.max(0, Math.min(100, 100 - used)), reset });
      };
      let credits: string | undefined;
      if (name === 'Claude') {
        for (const [key, value] of Object.entries(data)) {
          if (key === 'extra_usage' || !value || typeof value !== 'object') continue;
          const window = value as any;
          add(key, window.utilization, window.resets_at);
        }
        if (data.extra_usage?.is_enabled) add('extra_usage', data.extra_usage.utilization);
      } else {
        for (const [key, value] of Object.entries(data.rate_limit || {})) {
          const window = value as any;
          if (window && typeof window === 'object') add(key, window.used_percent, typeof window.reset_at === 'number' ? new Date(window.reset_at * 1000).toISOString() : undefined);
        }
        if (data.credits?.unlimited === true) credits = 'unlimited';
        else if (data.credits?.balance != null) credits = String(data.credits.balance);
      }
      return { name, status: rows.length || credits !== undefined ? 'ok' : 'unavailable', reason: rows.length || credits !== undefined ? undefined : 'empty-usage', rows, credits };
    } catch (e: any) {
      // 错误码（ENOENT / ETIMEDOUT / ENOTFOUND…）原样带出，用户才能分清是没登录还是网络不通
      return { name, status: 'unavailable', reason: String(e?.code || e?.message || 'error').slice(0, 120), rows };
    }
  }
}
