// 语义化版本号比较（业务无关纯工具，可独立测试）。
// 只认 `主.次.修订` 三段数字，可带 `-预发布` 后缀；缺省段按 0 处理。
// 预发布规则从简：同一组数字下，带后缀的版本小于不带后缀的（2.1.0-beta < 2.1.0）。

export class SemVer {
  // 合法则返回规范化字符串，否则返回 null（调用方据此判断输入是否是版本号）
  static parse(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const s = v.trim().replace(/^v/i, '');
    if (!/^\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?$/.test(s)) return null;
    return s;
  }

  // a > b 返回 1，a < b 返回 -1，相等返回 0。任一侧非法版本号一律抛错（带方法名与非法值）
  static compare(a: string, b: string): number {
    const pa = this.parse(a);
    const pb = this.parse(b);
    if (pa === null) throw new Error(`SemVer.compare: 非法版本号 a=${JSON.stringify(a)}`);
    if (pb === null) throw new Error(`SemVer.compare: 非法版本号 b=${JSON.stringify(b)}`);
    const [na, ra] = this._split(pa);
    const [nb, rb] = this._split(pb);
    for (let i = 0; i < 3; i++) {
      if (na[i] !== nb[i]) return na[i] > nb[i] ? 1 : -1;
    }
    if (ra === rb) return 0;
    if (!ra) return 1;   // 无预发布后缀者更大
    if (!rb) return -1;
    return ra > rb ? 1 : -1;
  }

  // a > b？非法输入抛错，语义与 compare 一致
  static gt(a: string, b: string): boolean {
    return this.compare(a, b) > 0;
  }

  // a < b？非法输入抛错，语义与 compare 一致
  static lt(a: string, b: string): boolean {
    return this.compare(a, b) < 0;
  }

  private static _split(v: string): [number[], string] {
    const dash = v.indexOf('-');
    const head = dash < 0 ? v : v.slice(0, dash);
    const rest = dash < 0 ? '' : v.slice(dash + 1);
    const nums = head.split('.').map((n) => Number(n));
    while (nums.length < 3) nums.push(0);
    return [nums, rest];
  }
}
