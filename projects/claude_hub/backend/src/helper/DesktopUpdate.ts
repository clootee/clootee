// Only a packaged desktop's parent process may install a desktop release.
export class DesktopUpdate {
  static active(): boolean { return process.env.CLOOTEE_DESKTOP === '1' && !!process.send; }

  static request(action: 'check' | 'apply', payload: object, onProgress?: (line: string) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = require('crypto').randomBytes(16).toString('hex');
      const finish = (error?: Error, value?: any) => {
        clearTimeout(timer); process.removeListener('message', receive); process.removeListener('disconnect', disconnected);
        error ? reject(error) : resolve(value);
      };
      const receive = (message: any) => {
        if (message?.type !== 'desktop-update-result' || message.id !== id) return;
        if (typeof message.line === 'string') { onProgress?.(message.line); return; }
        finish(message.error ? new Error(message.error) : undefined, message.result);
      };
      const disconnected = () => finish(new Error('Desktop update connection closed'));
      const timer = setTimeout(() => finish(new Error('Desktop update timed out; check desktop-update.log')), action === 'check' ? 30000 : 30 * 60 * 1000);
      process.on('message', receive); process.once('disconnect', disconnected);
      process.send!({ type: 'desktop-update', id, action, payload }, error => { if (error) finish(error); });
    });
  }
}
