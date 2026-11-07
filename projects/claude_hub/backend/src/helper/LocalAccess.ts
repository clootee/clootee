// Password-free access is local only, including WebSocket connections.
export class LocalAccess {
  static isLocal(req: { socket: { remoteAddress?: string }; headers: { host?: string; origin?: string; 'sec-fetch-site'?: string; 'x-clootee-remote'?: string } }): boolean {
    if (req.headers['x-clootee-remote'] === '1') return false;
    const ip = String(req.socket.remoteAddress || '');
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return false;
    const authority = String(req.headers.host || '').toLowerCase();
    const host = authority.replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) return false;
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        if (!['http:', 'https:'].includes(origin.protocol) || origin.host.toLowerCase() !== authority) return false;
      } catch { return false; }
    }
    return true;
  }
}
