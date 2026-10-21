// 入口参数校验（纯函数，无 IO）。
export function requireInstallId(value: unknown, where: string): string {
  const s = String(value || '');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(s)) {
    throw new Error(`${where}: invalid installId=${s.slice(0, 16)}`);
  }
  return s;
}

export function requireToken(value: unknown, where: string): string {
  const s = String(value || '');
  if (!/^ck-[A-Za-z0-9_-]{20,128}$/.test(s)) {
    throw new Error(`${where}: invalid token`);
  }
  return s;
}

export function clampLimit(value: unknown, min: number, max: number, where: string): number {
  if (value === undefined || value === null || value === '') return Math.min(20, max);
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${where}: invalid limit=${String(value)} (expected ${min}..${max})`);
  }
  return n;
}

export function sanitizeName(value: unknown): string {
  return String(value || '').replace(/[\u0000-\u001f]/g, '').slice(0, 60);
}

export function sanitizeTag(value: unknown): string {
  return String(value || '').replace(/[^\w:.\-]/g, '').slice(0, 120);
}
