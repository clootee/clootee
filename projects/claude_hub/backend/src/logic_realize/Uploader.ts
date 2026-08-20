// 文件上传实现：清洗文件名、确保 tmp/ 存在、防重名后写入。跨平台用 path.join。
import * as fs from 'fs';
import * as path from 'path';
import { UploaderStruct, UploadResult } from '../logic_struct/UploaderStruct';

export class Uploader extends UploaderStruct {
  protected static _writeToTmp(rootPath: string, filename: string, data: Buffer): UploadResult {
    const tmpDir = path.join(rootPath, 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const safe = this._safeName(filename);
    const finalName = this._dedupe(tmpDir, safe);
    const full = path.join(tmpDir, finalName);
    fs.writeFileSync(full, data);
    return {
      name: finalName,
      rel: `tmp/${finalName}`,
      sizeKb: Math.round((data.length / 1024) * 10) / 10,
    };
  }

  // 只取文件名部分，剔除路径分隔符与控制/非法字符，避免越界写入
  private static _safeName(filename: string): string {
    const base = path.basename(filename.replace(/\\/g, '/'));
    const cleaned = base.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
    return cleaned || `upload_${Date.now()}`;
  }

  // 防重名：foo.png 已存在则改 foo-1.png / foo-2.png …
  private static _dedupe(dir: string, name: string): string {
    if (!fs.existsSync(path.join(dir, name))) return name;
    const ext = path.extname(name);
    const stem = name.slice(0, name.length - ext.length);
    let i = 1;
    while (fs.existsSync(path.join(dir, `${stem}-${i}${ext}`))) i++;
    return `${stem}-${i}${ext}`;
  }
}
