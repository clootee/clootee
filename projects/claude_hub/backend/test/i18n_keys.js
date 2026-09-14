// 前端文案自检（node backend/test/i18n_keys.js）：
//   1) 代码里用到的 T('key') 是否都在 trans.js 的 DICT 里，且 zh / en 两种语言都有
//      —— 缺 key 会在界面上直接显示 key 本身，缺一种语言会退回另一种，出现中英混排
//   2) 引擎板块按 id 取的元素是否都在 index.html 里存在（拼出来的 id 打错会静默报 TypeError）
const fs = require('fs');
const path = require('path');
const FE = path.resolve(__dirname, '../../frontend');

// trans.js 是浏览器脚本，补两个全局即可取出 DICT
const src = fs.readFileSync(path.join(FE, 'trans.js'), 'utf8');
const DICT = new Function('localStorage', 'navigator', src + '\nreturn DICT;')(
  { getItem: () => 'zh', setItem: () => {} },
  { language: 'zh' },
);

const html = fs.readFileSync(path.join(FE, 'index.html'), 'utf8');
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

let bad = 0;
const fail = (msg) => { console.log(`✕ ${msg}`); bad++; };

for (const file of ['app.js', 'onboard.js', 'health.js', 'workspace.js', 'rootwizard.js']) {
  const code = fs.readFileSync(path.join(FE, file), 'utf8');
  for (const m of code.matchAll(/\bT\('([A-Za-z0-9_]+)'\)/g)) {
    const e = DICT[m[1]];
    if (!e) fail(`${file}: T('${m[1]}') 字典里没有`);
    else if (!e.zh || !e.en) fail(`${file}: T('${m[1]}') 缺 ${e.zh ? 'en' : 'zh'}`);
  }
}

// 引擎板块里按 `${engine}Xxx` 模板拼出来的 id（applyEnginePaneText / providerUi）
for (const p of ['claude', 'codex']) {
  const cap = p === 'claude' ? 'Claude' : 'Codex';
  const need = [
    `${p}ProviderLbl`, `${p}ProviderSelect`, `${p}ProviderCfg`, `${p}CustomCfg`,
    `${p}BaseUrlLbl`, `${p}BaseUrl`, `${p}ModelsUrlLbl`, `${p}ModelsUrl`,
    `${p}ApiKeyLbl`, `${p}ApiKey`, `${p}ModelLbl`, `${p}ModelSelect`, `${p}ModelInput`,
    `${p}ModelList`, `${p}ModelHint`, `${p}ModelBox`, `${p}EffortLbl`, `${p}EffortSelect`,
    `${p}EffortNote`, `${p}AdvLabel`, `${p}ModelsBtn`, `${p}SaveBtn`, `${p}ProviderStatus`,
    `mdl${cap}Provider`, `mdl${cap}DetectBtn`, `mdl${cap}ListBtn`, `mdl${cap}Status`,
  ];
  for (const id of need) if (!ids.has(id)) fail(`index.html 缺 id=${id}`);
}
// 「逐个真实验证」只有 claude 有
for (const id of ['mdlClaudeVerifyChk', 'mdlClaudeVerifyTitle', 'mdlClaudeVerifyDesc'])
  if (!ids.has(id)) fail(`index.html 缺 id=${id}`);
// 「当前登录账号」也只有 claude 有（只有原版才是订阅登录）；codex 侧故意不存在，
// providerUi 取到 null 后跳过，所以这里只校验 claude 那一个
if (!ids.has('claudeOfficialWho')) fail('index.html 缺 id=claudeOfficialWho');
if (ids.has('codexOfficialWho')) fail('codexOfficialWho 不该存在（codex 没有订阅登录）');

console.log(bad ? `\n${bad} 处不通过` : '全部通过');
process.exit(bad ? 1 : 0);
