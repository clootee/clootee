// 通用事件广播工具（业务无关）：WebSocket 客户端注册 + 广播
import { WebSocket } from 'ws';

export class EventBus {
  private static _clients = new Set<WebSocket>();

  static register(ws: WebSocket): void {
    this._clients.add(ws);
    ws.on('close', () => this._clients.delete(ws));
  }

  // 向所有连接广播一个事件对象
  static broadcast(event: unknown): void {
    const payload = JSON.stringify(event);
    for (const ws of this._clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  }
}
