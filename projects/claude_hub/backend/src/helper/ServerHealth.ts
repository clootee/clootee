import * as os from 'os';
import { promises as fs } from 'fs';
import { Paths } from '../paths';
import { ErrorHandler } from './ErrorHandler';

// Host metrics only; MemAvailable excludes reclaimable Linux caches from usage.
export class ServerHealth {
  static async get() {
    if (process.platform !== 'linux') return { platform: process.platform };
    const cores = os.cpus().length || 1;
    const load = os.loadavg()[0];
    let memory: { total: number; available: number; usedPercent: number } | null = null;
    let disk: { total: number; available: number; usedPercent: number } | null = null;
    await Promise.all([
      fs.readFile('/proc/meminfo', 'utf8').then(text => {
        const kb = (key: string) => Number(text.match(new RegExp('^' + key + ':\\s+(\\d+)', 'm'))?.[1]) * 1024;
        const total = kb('MemTotal');
        const available = kb('MemAvailable');
        if (total > 0 && Number.isFinite(available)) memory = { total, available, usedPercent: 100 * (1 - available / total) };
      }).catch(e => { ErrorHandler.handle(e, 'ServerHealth.memory'); }),
      fs.statfs(Paths.DATA_ROOT).then(s => {
        const total = s.blocks * s.bsize;
        const available = s.bavail * s.bsize;
        if (total > 0) disk = { total, available, usedPercent: 100 * (1 - available / total) };
      }).catch(e => { ErrorHandler.handle(e, 'ServerHealth.disk'); }),
    ]);
    return { platform: 'linux', cores, load, loadPercent: load / cores * 100, memory, disk };
  }
}
