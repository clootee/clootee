// Codex 档位切换（实现）：填充 config.toml 与密钥文件的读写细节。
// config.toml 定位复用 CodexStoreHelper.codexHome()（跨平台：os.homedir()，可用 CODEX_HOME 覆盖）。
// 密钥持久化到 claude-hub 自己的 data/codex.json，不写进 config.toml（codex 用 env_key 读环境变量）。
import * as fs from 'fs';
import * as path from 'path';
import { CodexProfileStruct } from '../logic_struct/CodexProfileStruct';
import { CodexStoreHelper } from '../helper/CodexStoreHelper';
import { Paths } from '../paths';

interface CodexKeyFile {
  kimiApiKey?: string;
}

// 密钥没有默认值：未配置时返回 null，由上层提示用户在「设置」里填写（或设 KIMI_API_KEY 环境变量）。

export class CodexProfile extends CodexProfileStruct {
  protected static _tomlPath(): string {
    return path.join(CodexStoreHelper.codexHome(), 'config.toml');
  }

  protected static _readToml(): string | null {
    const p = this._tomlPath();
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf8');
  }

  protected static _writeToml(text: string): void {
    const p = this._tomlPath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
  }

  private static _keyFile(): string {
    return path.join(Paths.DATA_ROOT, 'codex.json');
  }

  protected static _readKey(): string | null {
    const p = this._keyFile();
    const fromEnv = process.env.KIMI_API_KEY || null;
    if (!fs.existsSync(p)) return fromEnv;
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8')) as CodexKeyFile;
      return j.kimiApiKey || fromEnv;
    } catch {
      return fromEnv;
    }
  }

  protected static _writeKey(key: string): void {
    const p = this._keyFile();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const j: CodexKeyFile = { kimiApiKey: key };
    fs.writeFileSync(p, JSON.stringify(j, null, 2), 'utf8');
  }
}
