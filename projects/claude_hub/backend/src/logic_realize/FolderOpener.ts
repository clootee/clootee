// 在系统文件管理器中打开文件夹（实现）：按平台选择命令，跨平台兼容
import { spawn } from 'child_process';
import * as path from 'path';
import { FolderOpenerStruct } from '../logic_struct/FolderOpenerStruct';

export class FolderOpener extends FolderOpenerStruct {
  protected static _revealFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('explorer.exe', [path.dirname(filePath)], { detached: true, stdio: 'ignore', shell: false });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  }
  protected static _openFolder(dirPath: string): void {
    if (process.platform === 'win32') {
      // explorer 打开目录后即便成功也可能返回非 0，故用 detached 且不等待
      spawn('explorer', [dirPath], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [dirPath], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [dirPath], { detached: true, stdio: 'ignore' }).unref();
    }
  }
}
