// 文件管理器（实现）：按扩展名分类，决定预览方式、是否可网页预览、是否可文本编辑。
import { FileManagerStruct } from '../logic_struct/FileManagerStruct';
import { FileKind } from '../models/Types';

// 扩展名 → 归类（与前端 FilePreview / SessionFiles 保持一致）
const IMG = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'];
const VIDEO = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'];
const AUDIO = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
const SHEET = ['xlsx', 'xls', 'csv'];
const MD = ['md', 'markdown'];
const PDF = ['pdf'];
const DOC = ['doc', 'docx', 'ppt', 'pptx'];
const TEXT = ['txt', 'json', 'log', 'yml', 'yaml', 'xml', 'html', 'htm', 'css', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'sh', 'bat', 'ini', 'conf', 'env', 'sql'];

export class FileManager extends FileManagerStruct {
  protected static _classify(ext: string): { kind: FileKind; previewable: boolean; editable: boolean } {
    const e = (ext || '').toLowerCase();
    if (IMG.includes(e)) return { kind: 'image', previewable: true, editable: false };
    if (VIDEO.includes(e)) return { kind: 'video', previewable: true, editable: false };
    if (AUDIO.includes(e)) return { kind: 'audio', previewable: true, editable: false };
    if (PDF.includes(e)) return { kind: 'pdf', previewable: true, editable: false };
    if (SHEET.includes(e)) return { kind: 'sheet', previewable: true, editable: false };
    if (MD.includes(e)) return { kind: 'md', previewable: true, editable: true };
    if (TEXT.includes(e)) return { kind: 'text', previewable: true, editable: true };
    if (DOC.includes(e)) return { kind: 'doc', previewable: false, editable: false };
    // 无扩展名常见文本文件（如 Dockerfile、Makefile、LICENSE）也允许编辑
    if (!e) return { kind: 'text', previewable: true, editable: true };
    return { kind: 'other', previewable: false, editable: false };
  }
}
