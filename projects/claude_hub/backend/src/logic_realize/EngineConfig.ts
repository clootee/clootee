// 引擎服务商配置（实现）：读写 data/engines.json + 用 HttpJson 拉取模型列表
// + 读改写 ~/.claude/settings.json 的 env 段。
import * as fs from 'fs';
import * as path from 'path';
import { EngineConfigStruct, MANAGED_ENV_KEYS } from '../logic_struct/EngineConfigStruct';
import { EnginesConfig, EnginesFile } from '../models/Types';
import { HttpJson } from '../helper/HttpJson';
import { ClaudeStoreHelper } from '../helper/ClaudeStoreHelper';
import { EnvHelper } from '../helper/EnvHelper';
import { Paths } from '../paths';
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { CodexTomlHelper } from '../helper/CodexTomlHelper';
import { AppConfig } from '../config/AppConfig';
import { EngineProviderConfig } from '../models/Types';

export class EngineConfig extends EngineConfigStruct {
  // 返回落盘的原始 JSON。可能是旧的扁平结构（各服务商共用一份字段），
  // 归一化与迁移由 Struct 的 _normalizeEntry 负责，这里只管读。
  protected static _read(): EnginesConfig | null {
    try {
      if (!fs.existsSync(Paths.ENGINES_FILE)) return null;
      return JSON.parse(fs.readFileSync(Paths.ENGINES_FILE, 'utf8')) as EnginesConfig;
    } catch {
      return null;
    }
  }

  protected static _write(c: EnginesConfig): void {
    fs.mkdirSync(path.dirname(Paths.ENGINES_FILE), { recursive: true });
    fs.writeFileSync(Paths.ENGINES_FILE, JSON.stringify(c, null, 2), 'utf8');
  }

  protected static _writeFile(c: EnginesFile): void {
    fs.mkdirSync(path.dirname(Paths.ENGINES_FILE), { recursive: true });
    fs.writeFileSync(Paths.ENGINES_FILE, JSON.stringify(c, null, 2), 'utf8');
  }

  protected static async _fetchModels(url: string, apiKey: string): Promise<string[]> {
    const r = await HttpJson.get(url, { Authorization: `Bearer ${apiKey}` });
    if (r.status < 200 || r.status >= 300)
      throw new Error(`fetchModels: HTTP ${r.status} ${(r.raw || '').slice(0, 200)}`);
    const data = r.json && Array.isArray(r.json.data) ? r.json.data : [];
    return data
      .map((m: any) => (m && typeof m.id === 'string' ? m.id : ''))
      .filter((s: string) => !!s);
  }

  // ~/.claude/settings.json 的 env 段：只增删 MANAGED_ENV_KEYS，用户自己写的键/其他字段原样保留。
  // 文件坏掉（非法 JSON / 非对象）时另存为 settings.json.broken 再重建，避免把 claude 配成起不来。
  protected static _syncClaudeSettings(env: Record<string, string>): void {
    const file = ClaudeStoreHelper.settingsFile();
    // 原版订阅 + 文件本来就不存在 → 没什么要清的，不必凭空造一个 settings.json
    if (!fs.existsSync(file) && Object.keys(env).length === 0) return;
    let json: any = {};
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      try {
        json = raw.trim() ? JSON.parse(raw) : {};
      } catch {
        fs.writeFileSync(`${file}.broken`, raw, 'utf8');
        json = {};
      }
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        fs.writeFileSync(`${file}.broken`, raw, 'utf8');
        json = {};
      }
    }
    const cur = json.env && typeof json.env === 'object' && !Array.isArray(json.env) ? json.env : {};
    json.env = EnvHelper.applyManaged({ ...cur }, MANAGED_ENV_KEYS, env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }

  protected static _syncCodexConfig(cfg: EngineProviderConfig): void {
    const file = path.join(CodexStoreHelper.codexHome(), 'config.toml');
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const provider = cfg.provider === 'official' ? null : {
      name: cfg.provider,
      model: cfg.model,
      baseUrl: `http://127.0.0.1:${AppConfig.KIMI_PROXY_PORT}/v1`,
    };
    const next = CodexTomlHelper.renderProvider(existing, provider);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, 'utf8');
  }
}
