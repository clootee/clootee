// 模型选择（实现）：真实探测各引擎的当前模型与可用模型。
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ModelManagerStruct, CLAUDE_BUILTIN_MODELS } from '../logic_struct/ModelManagerStruct';
import { EngineConfig } from './EngineConfig';
import { ClaudeBin } from '../helper/ClaudeBin';
import { CodexBin } from '../helper/CodexBin';
import { ProcessSpawner } from '../helper/ProcessSpawner';
import { AppConfig } from '../config/AppConfig';
import { Logger } from '../helper/Logger';
import { ModelDetect, ModelOption } from '../models/Types';
import { Settings } from './Settings';

// 一次探测的结果
interface ProbeResult {
  ok: boolean;
  model: string;   // 引擎回报的实际模型（拿不到则空）
  error?: string;
}

export class ModelManager extends ModelManagerStruct {
  // ── claude：从 stream-json 的 system/init 帧读回实际生效模型 ──
  // init 帧在任何模型调用之前就输出，读到即杀进程 → 不消耗 token。
  protected static async _detectClaude(selected: string): Promise<ModelDetect> {
    const r = await this._probeClaude(selected, /* killOnInit */ true);
    return {
      engine: 'claude',
      model: r.model,
      source: 'claude-init',
      ok: r.ok && !!r.model,
      error: r.ok ? (r.model ? undefined : 'init-no-model') : r.error,
      at: Date.now(),
    };
  }

  // ── codex：当前生效模型 = config.toml 的 model=，缺失则取模型目录里 priority 最高的 ──
  protected static async _detectCodex(_selected: string): Promise<ModelDetect> {
    const base: Omit<ModelDetect, 'model' | 'ok' | 'source' | 'error'> = {
      engine: 'codex',
      at: Date.now(),
    };
    const fromToml = this._codexTomlModel();
    if (fromToml) {
      return { ...base, model: fromToml, source: 'codex-toml', ok: true };
    }
    try {
      const catalog = await this._codexCatalog();
      const top = catalog[0];
      if (top) {
        return { ...base, model: top.id, source: 'codex-catalog', ok: true };
      }
      return { ...base, model: '', source: 'codex', ok: false, error: 'codex-catalog-empty' };
    } catch (e) {
      return {
        ...base,
        model: '',
        source: 'codex',
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ── claude 可用模型 ──
  protected static async _availableClaude(verify: boolean): Promise<ModelOption[]> {
    const cfg = EngineConfig.get().claude;
    // 第三方服务商：走 OpenAI 兼容 /v1/models（真实列表）
    if (cfg.provider !== 'official') {
      const ids = await EngineConfig.listModels(cfg.provider, cfg.apiKey, cfg.baseUrl, cfg.modelsUrl);
      return ids.map((id) => ({ id, source: 'api' as const }));
    }
    // 原版订阅：CLI 无列表接口 → 内置候选。verify 时逐个真实极小调用确认。
    if (!verify) return CLAUDE_BUILTIN_MODELS.map((m) => ({ ...m }));
    const out: ModelOption[] = [];
    for (const m of CLAUDE_BUILTIN_MODELS) {
      const r = await this._probeClaude(m.id, /* killOnInit */ false);
      out.push({
        ...m,
        verified: r.ok,
        // 备注要跨语言可读：解析结果写成「→ 全名」，失败则原样带上引擎的报错
        note: r.ok ? r.model && r.model !== m.id ? `→ ${r.model}` : undefined : r.error,
      });
    }
    return out;
  }

  // ── codex 可用模型：`codex debug models` 输出真实模型目录 ──
  protected static async _availableCodex(): Promise<ModelOption[]> {
    const cfg = EngineConfig.get().codex;
    if (cfg.provider !== 'official') {
      const ids = await EngineConfig.listModels(cfg.provider, cfg.apiKey, cfg.baseUrl, cfg.modelsUrl);
      return ids.map((id) => ({ id, source: 'api' as const }));
    }
    return this._codexCatalog();
  }

  // ───────────────────────── 内部：claude 探测 ─────────────────────────
  // killOnInit=true：读到 init 帧立刻结束（只验证"当前模型是什么"，零调用）
  // killOnInit=false：跑完一次极小任务，据 result 事件/退出码判断该模型是否真的可用
  private static _probeClaude(model: string, killOnInit: boolean): Promise<ProbeResult> {
    const { bin, prefixArgs } = ClaudeBin.resolve(
      AppConfig.CLAUDE_BIN,
      Settings.get().preferBundled,
    );
    const args = [
      ...prefixArgs,
      '-p',
      '--input-format',
      'text',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      AppConfig.PERMISSION_MODE,
    ];
    if (model) args.push('--model', model);

    const cwd = this._probeCwd();
    const timeoutMs = killOnInit ? 60_000 : 120_000;

    return new Promise<ProbeResult>((resolve) => {
      let seen = '';        // init 帧回报的 model
      let stderr = '';
      let isError = false;
      let resultText = '';
      let settled = false;
      const finish = (r: ProbeResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          handle.kill();
        } catch {
          /* 可能已退出 */
        }
        resolve(r);
      };

      const handle = ProcessSpawner.run(
        bin,
        args,
        cwd,
        {
          onLine: (line) => {
            let evt: any;
            try {
              evt = JSON.parse(line);
            } catch {
              return;
            }
            if (evt && evt.type === 'system' && typeof evt.model === 'string') {
              seen = evt.model;
              if (killOnInit) finish({ ok: true, model: seen });
              return;
            }
            if (evt && evt.type === 'result') {
              isError = !!evt.is_error;
              resultText = typeof evt.result === 'string' ? evt.result : '';
            }
          },
          onStderr: (chunk) => {
            stderr += chunk;
          },
          onExit: (code) => {
            if (code === 0 && !isError) return finish({ ok: true, model: seen });
            const msg =
              stderr.trim().slice(0, 300) ||
              resultText.slice(0, 300) ||
              `exit code ${code}`;
            finish({ ok: false, model: seen, error: msg });
          },
          onError: (err) => finish({ ok: false, model: seen, error: err.message }),
        },
        // 极小 prompt：killOnInit 时根本不会被消费；verify 时只回一个词
        'Reply with exactly: ok',
        false,
      );

      const timer = setTimeout(
        () => finish({ ok: !!seen, model: seen, error: seen ? undefined : 'probe-timeout' }),
        timeoutMs,
      );
    });
  }

  // ───────────────────────── 内部：codex 探测 ─────────────────────────
  // `codex debug models` 输出 {models:[{slug,display_name,visibility,supported_in_api,priority,...}]}
  // 注意每项还带巨大的 base_instructions，只取需要的字段。
  private static _codexCatalog(): Promise<ModelOption[]> {
    const { bin, prefixArgs } = CodexBin.resolve(AppConfig.CODEX_BIN, Settings.get().preferBundled);
    const cwd = this._probeCwd();
    return new Promise<ModelOption[]>((resolve, reject) => {
      let out = '';
      let stderr = '';
      let settled = false;
      const handle = ProcessSpawner.run(
        bin,
        [...prefixArgs, 'debug', 'models'],
        cwd,
        {
          onLine: (line) => {
            out += line;
          },
          onStderr: (chunk) => {
            stderr += chunk;
          },
          onExit: (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
              resolve(this._parseCodexCatalog(out));
            } catch (e) {
              reject(
                new Error(
                  `codex debug models 解析失败（exit ${code}）：` +
                    `${e instanceof Error ? e.message : String(e)}` +
                    (stderr.trim() ? ` | stderr: ${stderr.trim().slice(0, 200)}` : ''),
                ),
              );
            }
          },
          onError: (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(err);
          },
        },
        undefined,
        false,
      );
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          handle.kill();
        } catch {
          /* ignore */
        }
        reject(new Error('codex debug models 超时'));
      }, 60_000);
    });
  }

  private static _parseCodexCatalog(raw: string): ModelOption[] {
    // 输出可能夹带非 JSON 行（日志），取第一个 '{' 到最后一个 '}'
    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    if (s < 0 || e <= s) throw new Error('未找到 JSON');
    const j = JSON.parse(raw.slice(s, e + 1));
    const list = Array.isArray(j?.models) ? j.models : [];
    return list
      .filter((m: any) => m && typeof m.slug === 'string' && m.slug)
      .sort((a: any, b: any) => (a.priority ?? 999) - (b.priority ?? 999))
      .map((m: any) => ({
        id: String(m.slug),
        label: m.display_name ? String(m.display_name) : undefined,
        source: 'catalog' as const,
        verified: m.supported_in_api !== false,
      }));
  }

  private static _codexTomlModel(): string {
    try {
      const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
      const file = path.join(home, 'config.toml');
      if (!fs.existsSync(file)) return '';
      const text = fs.readFileSync(file, 'utf8');
      // 只认顶层（第一个 [section] 之前）的 model = "..."
      const head = text.split(/^\s*\[/m)[0];
      const m = head.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
      return m ? m[1].trim() : '';
    } catch (e) {
      Logger.warn('ModelManager', '读取 codex config.toml 失败', {
        message: e instanceof Error ? e.message : String(e),
      });
      return '';
    }
  }

  // 探测用工作目录：放在临时目录，避免探测产生的会话记录混进用户项目的会话列表
  private static _probeCwd(): string {
    const dir = path.join(os.tmpdir(), 'claude-hub-probe');
    try {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      return os.tmpdir();
    }
  }
}
