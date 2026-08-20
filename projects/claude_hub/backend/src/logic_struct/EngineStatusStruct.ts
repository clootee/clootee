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

export class EngineStatusStruct {
  static get(): EngineStatusReport {
    const claude = this._probe('claude');
    const codex = this._probe('codex');
    return {
      claude,
      codex,
      outEndReady: this._outEndReady(),
      anyReady: claude.ready || codex.ready,
    };
  }

  // 单个引擎的可用性（不抛错：探测失败一律按不可用）
  static one(engine: Engine): EngineAvail {
    if (engine !== 'claude' && engine !== 'codex')
      throw new Error(`EngineStatusStruct.one: invalid engine=${engine}`);
    return this._probe(engine);
  }

  // ── 探测钩子（Realize 实现）──
  protected static _probe(_engine: Engine): EngineAvail {
    throw new Error('EngineStatusStruct._probe: Not implemented');
  }
  protected static _outEndReady(): boolean {
    throw new Error('EngineStatusStruct._outEndReady: Not implemented');
  }
}
