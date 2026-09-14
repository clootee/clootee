// 环境变量映射工具：把「一组由本工具托管的 key」覆盖到某个 env 字典上。
// 业务无关：不知道 ANTHROPIC_* 是什么，只做「先清掉托管 key，再写入给定值」这一件事。
// 用途有二：注入 process.env（供 spawn 的子进程继承）、写 ~/.claude/settings.json 的 env 段。
export class EnvHelper {
  // target 上属于 managedKeys 的键全部删除，再把 values 里的键值写回（值转成字符串）。
  // 返回 target 本身，便于链式使用。managedKeys 未覆盖的 target 键原样保留。
  static applyManaged<T extends Record<string, any>>(
    target: T,
    managedKeys: string[],
    values: Record<string, string>,
  ): T {
    if (!target || typeof target !== 'object')
      throw new Error(`EnvHelper.applyManaged: invalid target=${target}`);
    if (!Array.isArray(managedKeys) || managedKeys.length === 0)
      throw new Error(`EnvHelper.applyManaged: invalid managedKeys=${JSON.stringify(managedKeys)}`);
    if (!values || typeof values !== 'object')
      throw new Error(`EnvHelper.applyManaged: invalid values=${values}`);
    for (const k of managedKeys) delete (target as Record<string, any>)[k];
    for (const [k, v] of Object.entries(values)) {
      if (managedKeys.indexOf(k) < 0)
        throw new Error(`EnvHelper.applyManaged: key 不在 managedKeys 内 key=${k}`);
      (target as Record<string, any>)[k] = String(v);
    }
    return target;
  }
}
