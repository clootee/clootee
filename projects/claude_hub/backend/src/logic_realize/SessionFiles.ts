// 会话文件（实现）：按扩展名分类，决定预览方式与是否可网页内预览。
import { SessionFilesStruct } from '../logic_struct/SessionFilesStruct';
import { FileKind } from '../models/Types';

// 扩展名 → 预览方式归类（与前端 FilePreview 保持一致）
const IMG = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'];
const VIDEO = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'];
const AUDIO = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
const SHEET = ['xlsx', 'xls', 'csv'];
const MD = ['md', 'markdown'];
const PDF = ['pdf'];
const DOC = ['doc', 'docx', 'ppt', 'pptx'];
const TEXT = ['txt', 'json', 'log', 'yml', 'yaml', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'sh', 'bat', 'ini', 'conf', 'env', 'sql'];

export class SessionFiles extends SessionFilesStruct {
  protected static _classify(ext: string): { kind: FileKind; previewable: boolean } {
    const e = (ext || '').toLowerCase();
    if (IMG.includes(e)) return { kind: 'image', previewable: true };
    if (VIDEO.includes(e)) return { kind: 'video', previewable: true };
    if (AUDIO.includes(e)) return { kind: 'audio', previewable: true };
    if (PDF.includes(e)) return { kind: 'pdf', previewable: true };
    if (SHEET.includes(e)) return { kind: 'sheet', previewable: true };
    if (MD.includes(e)) return { kind: 'md', previewable: true };
    if (TEXT.includes(e)) return { kind: 'text', previewable: true };
    if (DOC.includes(e)) return { kind: 'doc', previewable: false }; // 无后端抽取，仅下载
    return { kind: 'other', previewable: false };
  }
}
