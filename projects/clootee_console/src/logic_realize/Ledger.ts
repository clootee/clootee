// 账户与用量账本（实现）：JSON 文件持久化 + 进程内索引。单进程部署，破坏面只在 data/ledger.json。
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Config } from '../config';
import { HttpError } from '../helper/HttpError';
import { LedgerStruct } from '../logic_struct/LedgerStruct';
import { DeviceRecord, LedgerData, UsageRecord } from '../models/Types';

export class Ledger extends LedgerStruct {
  private static _data: LedgerData | null = null;
  private static _byInstall = new Map<string, DeviceRecord>();
  private static _byToken = new Map<string, DeviceRecord>();
  private static _links = new Map<string, { token: string; expiresAt: number }>();
  private static _rate = new Map<string, { minute: number; count: number }>();

  private static get _file(): string {
    return path.join(Config.DATA_DIR, 'ledger.json');
  }

  private static _load(): LedgerData {
    if (this._data) return this._data;
    let data: LedgerData = { devices: [], usage: [], issuedPerIp: {}, daily: { day: '', spentMicro: 0 } };
    try {
      if (fs.existsSync(this._file)) {
        const parsed = JSON.parse(fs.readFileSync(this._file, 'utf8'));
        data = {
          devices: Array.isArray(parsed.devices) ? parsed.devices : [],
          usage: Array.isArray(parsed.usage) ? parsed.usage : [],
          issuedPerIp: parsed.issuedPerIp && typeof parsed.issuedPerIp === 'object' ? parsed.issuedPerIp : {},
          daily: parsed.daily && typeof parsed.daily === 'object' ? parsed.daily : { day: '', spentMicro: 0 },
        };
      }
    } catch (e) {
      throw new Error(`Ledger._load: cannot read ${this._file}: ${(e as Error).message}`);
    }
    this._data = data;
    for (const d of data.devices) {
      this._byInstall.set(d.installId, d);
      this._byToken.set(d.token, d);
    }
    return data;
  }

  private static _save(): void {
    const data = this._load();
    fs.mkdirSync(Config.DATA_DIR, { recursive: true });
    const tmp = `${this._file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, this._file);
  }

  protected static _findByInstallId(installId: string): DeviceRecord | null {
    this._load();
    return this._byInstall.get(installId) || null;
  }

  protected static _findByToken(token: string): DeviceRecord | null {
    this._load();
    return this._byToken.get(token) || null;
  }

  protected static _addDevice(record: DeviceRecord): void {
    const data = this._load();
    data.devices.push(record);
    this._byInstall.set(record.installId, record);
    this._byToken.set(record.token, record);
    this._save();
  }

  protected static _balanceOf(device: DeviceRecord): number {
    if (!device) return 0;
    return Math.max(0, (Number(device.grantMicro) || 0) - (Number(device.spentMicro) || 0));
  }

  protected static _listUsage(installId: string, limit: number, tag: string): UsageRecord[] {
    const data = this._load();
    const out: UsageRecord[] = [];
    for (let i = data.usage.length - 1; i >= 0 && out.length < limit; i--) {
      const u = data.usage[i];
      if (u.installId !== installId) continue;
      if (tag && u.tag !== tag) continue;
      out.push(u);
    }
    return out;
  }

  protected static _summarizeTagged(installId: string, tag: string): { calls: number; costMicro: number } {
    const data = this._load();
    let calls = 0;
    let cost = 0;
    for (const u of data.usage) {
      if (u.installId === installId && u.tag === tag) {
        calls++;
        cost += Number(u.costMicro) || 0;
      }
    }
    return { calls, costMicro: cost };
  }

  protected static _appendUsage(usage: UsageRecord, device: DeviceRecord): void {
    const data = this._load();
    data.usage.push(usage);
    if (data.usage.length > Config.USAGE_KEEP) data.usage.splice(0, data.usage.length - Config.USAGE_KEEP);
    device.spentMicro = (Number(device.spentMicro) || 0) + (Number(usage.costMicro) || 0);
    const day = this._today();
    if (data.daily.day !== day) data.daily = { day, spentMicro: 0 };
    data.daily.spentMicro = (Number(data.daily.spentMicro) || 0) + (Number(usage.costMicro) || 0);
    this._save();
  }

  protected static _issueToken(): string {
    return `ck-${crypto.randomBytes(24).toString('base64url')}`;
  }

  protected static _issueLinkCode(token: string): string {
    const now = Date.now();
    for (const [code, rec] of this._links) {
      if (rec.expiresAt <= now) this._links.delete(code);
    }
    const code = crypto.randomBytes(12).toString('base64url');
    this._links.set(code, { token, expiresAt: now + 10 * 60 * 1000 });
    return code;
  }

  protected static _resolveLinkCode(code: string): string | null {
    const rec = this._links.get(code);
    if (!rec || rec.expiresAt <= Date.now()) return null;
    return rec.token;
  }

  protected static _dailySpent(day: string): number {
    const data = this._load();
    return data.daily.day === day ? Number(data.daily.spentMicro) || 0 : 0;
  }

  protected static _rateCheck(installId: string): void {
    if (Config.RATE_LIMIT_RPM <= 0) return;
    const minute = Math.floor(Date.now() / 60000);
    const cur = this._rate.get(installId);
    if (!cur || cur.minute !== minute) {
      this._rate.set(installId, { minute, count: 1 });
      return;
    }
    cur.count++;
    if (cur.count > Config.RATE_LIMIT_RPM) {
      throw new HttpError(429, `Ledger.assertRate: rate limit exceeded installId=${installId} (${Config.RATE_LIMIT_RPM}/min)`);
    }
  }

  protected static _enforceIpQuota(day: string, ip: string): void {
    if (Config.DEVICES_PER_IP_PER_DAY <= 0) return;
    const data = this._load();
    const key = String(ip || 'unknown');
    const cur = data.issuedPerIp[key];
    const count = cur && cur.day === day ? cur.count : 0;
    if (count >= Config.DEVICES_PER_IP_PER_DAY) {
      throw new HttpError(429, `Ledger.register: too many new devices from ip=${key} today (limit ${Config.DEVICES_PER_IP_PER_DAY})`);
    }
    data.issuedPerIp[key] = { day, count: count + 1 };
    this._save();
  }

  protected static _today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
