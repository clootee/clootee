import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const dir = path.resolve('release-output');
const version = JSON.parse(fs.readFileSync('projects/claude_hub/backend/package.json')).version;
const kinds = { windows: `clootee-${version}-win.exe`, mac: `clootee-${version}-mac.dmg`, source: `clootee-${version}-source.zip` };
const packages = {};
for (const [kind, file] of Object.entries(kinds)) {
  const data = fs.readFileSync(path.join(dir, file));
  if (kind === 'windows' && data.subarray(0, 2).toString() !== 'MZ') throw new Error('Invalid Windows executable');
  if (kind === 'mac' && data.subarray(-512, -508).toString() !== 'koly') throw new Error('Invalid DMG image');
  if (kind === 'source' && data.subarray(0, 2).toString() !== 'PK') throw new Error('Invalid source ZIP');
  packages[kind] = { file, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
}
const manifest = { version, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), publishedAt: new Date().toISOString(), packages };
fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), Object.values(packages).map(p => `${p.sha256}  ${p.file}`).join('\n') + '\n');
console.log(JSON.stringify(manifest, null, 2));
