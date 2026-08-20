// 会话工具命令白名单：把 claude code 的原生斜杠命令（/usage、/compact…）作为"一键工具"暴露给前端。
// 与任务队列分开——这些是"看一眼状态 / 整理上下文"的一次性工具命令，不进队列、不进对话消息列表。
// 只在这里登记；用途文案（i18n）放前端 trans.js，后端只关心"能不能跑、要不要 resume"。
import { AppConfig } from './AppConfig';

export interface CommandSpec {
  id: string; // 前端菜单标识（也用于 i18n 文案 key）
  slash: string; // 实际透传给 claude 的原生斜杠命令
  // 是否必须在"已经开始对话的会话"上执行：
  //   true  → 命令依赖当前对话上下文（如 /compact 压缩当前对话），必须 --resume 真实会话；无则报错。
  //   false → 与对话无关的独立命令（如 /usage 看用量），跑一个临时会话即可，跑完删除其 jsonl 避免污染列表。
  needsSession: boolean;
  timeoutMs: number; // 该命令最大运行时长（毫秒），超时则强制结束（不同命令耗时差异大，逐条指定）
}

export class CommandsConfig {
  private static readonly LIST: CommandSpec[] = [
    { id: 'usage', slash: '/usage', needsSession: false, timeoutMs: AppConfig.COMMAND_TIMEOUT_MS },
  ];

  // 全部可用命令（前端渲染菜单用）
  static list(): CommandSpec[] {
    return this.LIST.map((c) => ({ ...c }));
  }

  // 按 id 取命令定义；未登记的一律拒绝（白名单，绝不放行任意斜杠字符串）
  static get(id: string): CommandSpec {
    const spec = this.LIST.find((c) => c.id === id);
    if (!spec) throw new Error(`CommandsConfig.get: unknown command id=${id}`);
    return { ...spec };
  }
}
