// 引擎可用性探测（调度骨架）：claude / codex 装没装、能不能跑。
// 引擎不再随包内置，用户点一下即 npm 全局安装（POST /api/engine/update）；
// bundled 只保留对老版本 out_end/tools 里那份的识别，避免老用户被误报"未安装"。
// 用途：新手引导「选引擎」那一步——没装的引擎不给选，必须先装。
// 具体探测（ClaudeBin/CodexBin/OutEnd）由 Realize 实现。
import { Engine } from '../models/Types';

export interface EngineAvail {
  system: boolean;   // PATH 上已装（npm 全局安装的落点）
  bundled: boolean;  // 老版本装在 out_end/tools 里的那份（历史兼容）
  ready: boolean;    // 任一可用即可运行
}

export interface EngineStatusReport {
  claude: EngineAvail;
  codex: EngineAvail;
  outEndReady: boolean; // out_end 目录（便携 node）是否就绪
  anyReady: boolean;    // 至少一个引擎可用
}

// 探测要跑 where/command -v 子进程（Windows 上还会闪控制台窗口），
// 而「装没装」在一次运行里几乎不会变 → 全进程只探一次，之后一律走缓存。
// 真正会改变结果的只有两件事：装/更新引擎（EngineUpdater 完成后 invalidate）、
// 用户在软件外面自己装了引擎（由前端显式带 refresh 重新探测）。
let _report: EngineStatusReport | null = null;

export class EngineStatusStruct {
  // force=true 才重新探测；默认吃缓存（发消息、读设置等高频路径必须走默认）
  static get(force = false): EngineStatusReport {
    if (!force && _report) return _report;
    const claude = this._probe('claude');
    const codex = this._probe('codex');
    _report = {
      claude,
      codex,
      outEndReady: this._outEndReady(),
      anyReady: claude.ready || codex.ready,
    };
    return _report;
  }

  // 丢弃缓存：装完/更新完引擎后调用，下次 get() 会重新探测
  static invalidate(): void {
    _report = null;
  }

  // 单个引擎的可用性（不抛错：探测失败一律按不可用）
  static one(engine: Engine): EngineAvail {
    if (engine !== 'claude' && engine !== 'codex')
      throw new Error(`EngineStatusStruct.one: invalid engine=${engine}`);
    return this.get()[engine];
  }

  // ── 探测钩子（Realize 实现）──
  protected static _probe(_engine: Engine): EngineAvail {
    throw new Error('EngineStatusStruct._probe: Not implemented');
  }
  protected static _outEndReady(): boolean {
    throw new Error('EngineStatusStruct._outEndReady: Not implemented');
  }
}
