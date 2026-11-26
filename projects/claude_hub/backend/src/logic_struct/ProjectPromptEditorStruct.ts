export interface ProjectPromptSnapshot {
  rootId: string;
  name: string;
  path: string;
  revision: string;
  files: { filename: string; exists: boolean; content: string }[];
}

// Coordinate validation and optimistic concurrency before writing either instruction file.
export class ProjectPromptEditorStruct {
  static read(_rootId: string): ProjectPromptSnapshot { throw new Error('Not implemented'); }

  static save(rootId: string, revision: string, mode: string, contents: unknown): ProjectPromptSnapshot {
    if (!['sync', 'separate'].includes(mode) || !Array.isArray(contents) || contents.length !== 2 || contents.some(x => typeof x !== 'string')) throw new Error('Invalid prompt settings');
    if (mode === 'sync' && contents[0] !== contents[1]) throw new Error('Synchronized prompts must match');
    const current = this.read(rootId);
    if (current.revision !== revision) throw new Error('PROMPT_CONFLICT');
    this._writeFiles(current, contents);
    return this.read(rootId);
  }

  protected static _writeFiles(_current: ProjectPromptSnapshot, _contents: string[]): void { throw new Error('Not implemented'); }
}
