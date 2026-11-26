import { accessSync, constants, statSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

export class AntigravityBin {
  static find(home = os.homedir()): string | undefined {
    const windows = process.platform === 'win32';
    const name = windows ? 'agy.exe' : 'agy';
    const installed = windows
      ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'agy', 'bin')
      : path.join(home, '.local', 'bin');
    const dirs = [installed, ...(process.env.PATH || '').split(path.delimiter)];
    for (const dir of dirs.filter(path.isAbsolute)) {
      const file = path.join(dir, name);
      try {
        accessSync(file, constants.X_OK);
        if (statSync(file).isFile()) return file;
      } catch { /* Check the next PATH entry. */ }
    }
    return undefined;
  }
}
