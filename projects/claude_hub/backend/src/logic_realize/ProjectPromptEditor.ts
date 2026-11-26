import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { ErrorHandler } from '../helper/ErrorHandler';
import { RootManager } from './RootManager';
import { ProjectPromptEditorStruct, ProjectPromptSnapshot } from '../logic_struct/ProjectPromptEditorStruct';

// Read full project instructions, preserving existing filename casing. Refuse ambiguous files.
export class ProjectPromptEditor extends ProjectPromptEditorStruct {
  static read(rootId: string) {
    const root = RootManager.getRoot(rootId);
    const files = ['CLAUDE.md', 'AGENTS.md'].map(name => {
      const matches = fs.readdirSync(root.path).filter(x => x.toLowerCase() === name.toLowerCase());
      if (matches.length > 1) throw new Error(`Multiple instruction files: ${matches.join(', ')}`);
      const filename = matches[0] || name;
      const target = path.join(root.path, filename);
      const exists = matches.length > 0;
      if (exists && (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink())) throw new Error(`Not a regular file: ${filename}`);
      const content = exists ? fs.readFileSync(target, 'utf8') : '';
      return { filename, exists, content };
    });
    const revision = createHash('sha256').update(JSON.stringify(files)).digest('hex');
    return { rootId, name: root.name, path: root.path, files, revision };
  }

  protected static _writeFiles(current: ProjectPromptSnapshot, contents: string[]): void {
    // Synchronous validation and writes keep concurrent HTTP saves from interleaving.
    const written: number[] = [];
    try {
      current.files.forEach((file, i) => {
        if (file.exists && file.content === contents[i]) return;
        fs.writeFileSync(path.join(current.path, file.filename), contents[i], 'utf8');
        written.push(i);
      });
    } catch (error) {
      ErrorHandler.handle(error, 'ProjectPromptEditor.save');
      written.reverse().forEach(i => {
        const file = current.files[i];
        const target = path.join(current.path, file.filename);
        if (file.exists) fs.writeFileSync(target, file.content, 'utf8');
        else fs.unlinkSync(target);
      });
      throw error;
    }
  }
}
