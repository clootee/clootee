// 引擎可用性探测（实现）：分别只看「系统」与「只看内置」两条路径。
// ClaudeBin/CodexBin.resolve 在两处都找不到时抛错，故用 try/catch 包住；
// 借 preferBundled 两个方向各探一次不足以区分来源，这里直接看 out_end 与 PATH。
import { Engine } from '../models/Types';
import { EngineAvail, EngineStatusStruct } from '../logic_struct/EngineStatusStruct';
import { ClaudeBin } from '../helper/ClaudeBin';
import { CodexBin } from '../helper/CodexBin';
import { OutEnd } from '../helper/OutEnd';
import { AppConfig } from '../config/AppConfig';

export class EngineStatus extends EngineStatusStruct {
  protected static _probe(engine: Engine): EngineAvail {
    const bundled = engine === 'claude' ? !!OutEnd.claudeCmd() : !!OutEnd.codexCmd();
    let ready = false;
    try {
      // preferBundled=false → 先系统后内置；能解析出来即「至少有一个可用」
      if (engine === 'claude') ClaudeBin.resolve(AppConfig.CLAUDE_BIN, false);
      else CodexBin.resolve(AppConfig.CODEX_BIN, false);
      ready = true;
    } catch {
      ready = false;
    }
    // ready 为真而内置为假 → 只能来自系统；ready 为真且内置也有 → 系统未知，用独立探测补齐
    const system = ready && !bundled ? true : this._onSystem(engine);
    return { system, bundled, ready: ready || bundled };
  }

  // 只看系统 PATH（不看 out_end）
  private static _onSystem(engine: Engine): boolean {
    const name = engine === 'claude' ? AppConfig.CLAUDE_BIN : AppConfig.CODEX_BIN;
    const { execSync } = require('child_process') as typeof import('child_process');
    const cmd = process.platform === 'win32' ? `where ${name}` : `command -v ${name}`;
    try {
      const out = String(execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      // out_end 内置也会出现在 PATH 里（start.bat 会把它加进去）→ 排除掉
      const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const outEndDir = OutEnd.toolsDir().toLowerCase();
      return lines.some((l) => !l.toLowerCase().startsWith(outEndDir));
    } catch {
      return false;
    }
  }

  protected static _outEndReady(): boolean {
    return OutEnd.exists();
  }
}
