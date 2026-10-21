// Clootee Console 入口：默认服务商的设备令牌 / 用量账本 / 模型网关。
import { Gateway } from './logic_realize/Gateway';

try {
  Gateway.start();
} catch (e) {
  console.error(`[FATAL] ${(e as Error).message}`);
  process.exit(1);
}
