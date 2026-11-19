import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';
import { EngineConfig } from '../logic_realize/EngineConfig';
import { Settings } from '../logic_realize/Settings';
import { HttpJson } from './HttpJson';
import { CodexStoreHelper } from './CodexStoreHelper';

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
        this.cache.set(key, { at: Date.now(), data });
        return data;
      }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, pending);
    return pending;
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
        let raw: string;
        try {
          raw = fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), '.credentials.json'), 'utf8');
        } catch (e) {
          if (process.platform !== 'darwin') throw e;
          raw = execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { encoding: 'utf8', timeout: 3000 });
        }
        token = JSON.parse(raw).claudeAiOauth?.accessToken;
      }
      if (!token) return { name, status: 'unavailable', rows };
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (name === 'Claude') headers['anthropic-beta'] = 'oauth-2025-04-20';
      if (account) headers['ChatGPT-Account-Id'] = account;
      const response = await HttpJson.get(name === 'Claude' ? 'https://api.anthropic.com/api/oauth/usage' : 'https://chatgpt.com/backend-api/wham/usage',
        headers, 10000);
      if (response.status < 200 || response.status >= 300) return { name, status: response.status === 401 ? 'expired' : 'error', rows };
      const data = response.json;
      if (!data || typeof data !== 'object') return { name, status: 'error', rows };
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
      return { name, status: rows.length || credits !== undefined ? 'ok' : 'unavailable', rows, credits };
    } catch { return { name, status: 'unavailable', rows }; }
  }
}
