// 预设系统提示词注入（实现）：文件查找（大小写不敏感）与读写。
import * as fs from 'fs';
import * as path from 'path';
import { PromptBlock } from '../helper/PromptBlock';
import { ProjectPromptStruct, PromptEnsureAction } from '../logic_struct/ProjectPromptStruct';

export class ProjectPrompt extends ProjectPromptStruct {
  // 目录里找 basename 与 defaultName 相同（忽略大小写）的文件；Linux 下 claude.md 与 CLAUDE.md 可并存，取先出现的
  protected static _findFile(rootPath: string, defaultName: string): string | null {
    const want = defaultName.toLowerCase();
    try {
      const hit = fs
        .readdirSync(rootPath, { withFileTypes: true })
        .find((e) => e.isFile() && e.name.toLowerCase() === want);
      return hit ? path.join(rootPath, hit.name) : null;
    } catch {
      return null;
    }
  }

  protected static _defaultPath(rootPath: string, defaultName: string): string {
    return path.join(rootPath, defaultName);
  }

  protected static _readFile(file: string): string {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  }

  protected static _writeFile(file: string, content: string): void {
    fs.writeFileSync(file, content, 'utf8');
  }

  // 文件本来不存在=created；存在但没有标记块=appended；有标记块但内容变了=updated
  protected static _actionOf(existing: string | null, current: string): PromptEnsureAction {
    if (!existing) return 'created';
    return current.includes(PromptBlock.START) ? 'updated' : 'appended';
  }
}
