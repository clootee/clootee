// 通用事件广播工具（业务无关）：WebSocket 客户端注册 + 广播
import { WebSocket } from 'ws';

export class EventBus {
  private static _clients = new Map<WebSocket, () => boolean>();

  static register(ws: WebSocket, authorize: () => boolean = () => true): void {
    this._clients.set(ws, authorize);
    ws.on('close', () => this._clients.delete(ws));
  }

  static revalidate(): void {
    for (const [ws, authorize] of this._clients) {
      if (!authorize()) { this._clients.delete(ws); ws.close(4001, 'security password changed'); }
    }
  }

  // 向所有连接广播一个事件对象
  static broadcast(event: unknown): void {
    this.revalidate();
    const payload = JSON.stringify(event);
    for (const ws of this._clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}
