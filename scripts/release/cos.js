// 发布用：腾讯云 COS 小工具（密钥读 ~/.secrets/tencent_cos.json，不进仓）
// node cos.js ls <prefix> | node cos.js put <localFile> <key> | node cos.js copy <srcKey> <dstKey>
const path = require('path');
const COS = require('D:/projects/devokai/projects/ai_game_builder/backend/node_modules/cos-nodejs-sdk-v5');
const cfg = require(path.join(process.env.USERPROFILE || process.env.HOME, '.secrets', 'tencent_cos.json'));
const cos = new COS({ SecretId: cfg.secretId, SecretKey: cfg.secretKey });
const base = { Bucket: cfg.bucket, Region: cfg.region };
const [cmd, a, b] = process.argv.slice(2);
const done = (err, data) => {
  if (err) { console.error('ERR', err.code || err.message || err); process.exit(1); }
  if (cmd === 'ls') (data.Contents || []).forEach((o) => console.log(o.Key, o.Size, o.LastModified));
  else console.log('ok', data.Location || data.statusCode);
};
if (cmd === 'ls') cos.getBucket({ ...base, Prefix: a || '' }, done);
else if (cmd === 'put') cos.uploadFile({ ...base, Key: b, FilePath: a }, done);
else if (cmd === 'copy') cos.putObjectCopy({ ...base, Key: b, CopySource: `${cfg.bucket}.cos.${cfg.region}.myqcloud.com/${a}` }, done);
else { console.error('usage: ls|put|copy'); process.exit(1); }
