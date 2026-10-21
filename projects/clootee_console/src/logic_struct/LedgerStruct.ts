// 账户与用量账本（调度）：设备注册 / 令牌校验 / 余额 / 用量 / 限流。
// 只描述步骤与顺序，持久化、随机数、内存索引都由 Realize 的 _xxx 步骤完成。
import { Config } from '../config';
import { HttpError } from '../helper/HttpError';
import { costMicro } from '../helper/Money';
import { requireInstallId, sanitizeName, sanitizeTag } from '../helper/Validate';
import {
  DeviceRecord,
  LinkCodeRecord,
  RegistrationResult,
  StatusResult,
  TokenUsage,
  UsageResult,
} from '../models/Types';

export class LedgerStruct {
  // 注册：同 installId 幂等复用；新设备按 IP 日配额发放体验额度。
  static register(installIdRaw: unknown, nameRaw: unknown, ip: string): RegistrationResult {
    const installId = requireInstallId(installIdRaw, 'Ledger.register');
    const existing = this._findByInstallId(installId);
    if (existing) {
      return { token: existing.token, grantedMicro: 0, reused: true, balanceMicro: this._balanceOf(existing) };
    }
    this._enforceIpQuota(this._today(), ip);
    const record: DeviceRecord = {
      installId,
      token: this._issueToken(),
      name: sanitizeName(nameRaw) || 'Clootee device',
      ip,
      createdAt: Date.now(),
      grantMicro: Config.GRANT_MICRO,
      spentMicro: 0,
    };
    this._addDevice(record);
    return { token: record.token, grantedMicro: record.grantMicro, reused: false, balanceMicro: this._balanceOf(record) };
  }

  // 令牌 → 设备；令牌无效返回 null（由调用方决定 401）。
  static authenticate(tokenRaw: unknown): DeviceRecord | null {
    const token = String(tokenRaw || '');
    if (!/^ck-[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
    return this._findByToken(token);
  }

  static status(device: DeviceRecord): StatusResult {
    if (!device || !device.token) throw new Error(`Ledger.status: invalid device token=${String(device && device.token)}`);
    return { balanceMicro: this._balanceOf(device), email: null };
  }

  static usage(device: DeviceRecord, limitRaw: unknown, tagRaw: unknown): UsageResult {
    if (!device || !device.token) throw new Error(`Ledger.usage: invalid device token=${String(device && device.token)}`);
    const limit = this._clampLimit(limitRaw);
    const tag = sanitizeTag(tagRaw);
    const all = this._listUsage(device.installId, limit, tag);
    const tagged = tag ? this._summarizeTagged(device.installId, tag) : null;
    return {
      items: all.map((u) => ({
        at: u.at,
        model: u.model,
        inputTokens: u.inputTokens,
        cacheReadTokens: u.cacheReadTokens,
        outputTokens: u.outputTokens,
        costMicro: u.costMicro,
        status: u.status,
      })),
      balanceMicro: this._balanceOf(device),
      tagged,
    };
  }

  static linkUrl(device: DeviceRecord): string {
    if (!device || !device.token) throw new Error('Ledger.linkUrl: device is required');
    const code = this._issueLinkCode(device.token);
    return `${Config.PUBLIC_URL}/#link=${code}`;
  }

  // 一次真实调用结束后记账：成本只在这里由 helper 算出。
  static record(device: DeviceRecord, requestedModel: string, usage: TokenUsage | null, tagRaw: unknown, status: string): void {
    if (!device || !device.installId) throw new Error('Ledger.record: device is required');
    if (!usage) return;
    const input = Math.max(0, Number(usage.inputTokens) || 0);
    const cacheRead = Math.max(0, Number(usage.cacheReadTokens) || 0);
    const output = Math.max(0, Number(usage.outputTokens) || 0);
    if (!input && !cacheRead && !output) return;
    const cost = costMicro({ inputTokens: input, cacheReadTokens: cacheRead, outputTokens: output },
      Config.PRICE_INPUT_MICRO_PER_M, Config.PRICE_OUTPUT_MICRO_PER_M);
    this._appendUsage({
      at: Date.now(),
      installId: device.installId,
      model: String(requestedModel || Config.UPSTREAM_MODEL).slice(0, 80),
      inputTokens: input,
      cacheReadTokens: cacheRead,
      outputTokens: output,
      costMicro: cost,
      status: String(status || 'ok').slice(0, 40),
      tag: sanitizeTag(tagRaw),
    }, device);
  }

  // 余额是否够一次调用（0 表示不限制）；余额不足时拒绝并给出提示。
  static assertBalance(device: DeviceRecord): void {
    const balance = this._balanceOf(device);
    if (balance <= 0) {
      throw new HttpError(402, `Ledger.assertBalance: balance exhausted for device installId=${device.installId}`);
    }
  }

  // 每分钟请求数限制（按设备）。
  static assertRate(device: DeviceRecord): void {
    this._rateCheck(device.installId);
  }

  static linkInfo(codeRaw: unknown): { balanceMicro: number; usage: UsageResult } | null {
    const code = String(codeRaw || '');
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(code)) return null;
    const token = this._resolveLinkCode(code);
    if (!token) return null;
    const device = this._findByToken(token);
    if (!device) return null;
    return { balanceMicro: this._balanceOf(device), usage: this.usage(device, 20, '') };
  }

  // ── 细节步骤（Realize 覆写） ─────────────────────────────────────────────
  protected static _findByInstallId(_installId: string): DeviceRecord | null { throw new Error('Not implemented'); }
  protected static _findByToken(_token: string): DeviceRecord | null { throw new Error('Not implemented'); }
  protected static _addDevice(_record: DeviceRecord): void { throw new Error('Not implemented'); }
  protected static _balanceOf(_device: DeviceRecord): number { throw new Error('Not implemented'); }
  protected static _listUsage(_installId: string, _limit: number, _tag: string): UsageResult['items'] { throw new Error('Not implemented'); }
  protected static _summarizeTagged(_installId: string, _tag: string): { calls: number; costMicro: number } { throw new Error('Not implemented'); }
  protected static _appendUsage(_usage: import('../models/Types').UsageRecord, _device: DeviceRecord): void { throw new Error('Not implemented'); }
  protected static _issueToken(): string { throw new Error('Not implemented'); }
  protected static _issueLinkCode(_token: string): string { throw new Error('Not implemented'); }
  protected static _resolveLinkCode(_code: string): string | null { throw new Error('Not implemented'); }
  protected static _rateCheck(_installId: string): void { throw new Error('Not implemented'); }
  protected static _enforceIpQuota(_day: string, _ip: string): void { throw new Error('Not implemented'); }
  protected static _today(): string { throw new Error('Not implemented'); }
  protected static _clampLimit(raw: unknown): number {
    const n = raw === undefined || raw === null || raw === '' ? 20 : Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error(`Ledger.usage: invalid limit=${String(raw)}`);
    return n;
  }
}

export type { LinkCodeRecord };
