#!/usr/bin/env node
// Build public, content-addressed Clootee bundles without third-party build dependencies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');

// SHA-256 fallback for LAN HTTP, where Web Crypto is unavailable.
function sha256(bytes) {
  const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const state = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes); padded[bytes.length] = 128;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);
  const rotate = (x, n) => (x >>> n) | (x << (32 - n));
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = words[i - 15], b = words[i - 2];
      words[i] = words[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + words[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10));
    }
    let [a,b,c,d,e,f,g,h] = state;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^(~e&g)) + constants[i] + words[i]) | 0;
      const t2 = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    [a,b,c,d,e,f,g,h].forEach((value, i) => { state[i] = (state[i] + value) | 0; });
  }
  return state.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

function buildWeb(root, output, cdn = '') {
  if (!root || !output) throw Error('Usage: build-clootee-web.cjs ROOT OUTPUT [HTTPS_CDN_BASE]');
  if (cdn && !/^https:\/\//.test(cdn)) throw Error('CDN must use HTTPS');
  const frontend = path.join(root, 'projects/claude_hub/frontend');
  let html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1].split('?')[0]);
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"\s*\/>/g)].map(x => x[1].split('?')[0]);
  const groups = { core: [], charts: [], sheets: [], editor: [], qr: [] };
  for (const file of scripts) {
    const group = file.startsWith('vendor/cm/') ? 'editor' : file.includes('echarts.') ? 'charts' : file.includes('xlsx.') ? 'sheets' : file.includes('qrcode.') ? 'qr' : 'core';
    groups[group].push(file);
  }
  if (!groups.core.includes('app.js') || groups.editor.length < 2) throw Error('Unexpected source HTML');
  fs.mkdirSync(path.join(output, 'static'), { recursive: true });
  const manifest = { groups: {}, files: {}, version: JSON.parse(fs.readFileSync(path.join(root, 'version.json'))).version };
  function bundle(name, extension, files) {
    let code = files.map(file => fs.readFileSync(path.join(frontend, file), 'utf8').replace(/^\uFEFF/, '')).join(extension === 'js' ? '\n;\n' : '\n');
    if (extension === 'css') code = code.replace(/url\((['"]?)assets\//g, 'url($1/assets/');
    if (extension === 'js') new vm.Script(code, { filename: name });
    const bytes = Buffer.from(code);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const filename = `${name}.${sha256.slice(0, 20)}.${extension}`;
    const compressed = zlib.gzipSync(bytes, { level: 9 });
    fs.writeFileSync(path.join(output, 'static', filename), bytes);
    fs.writeFileSync(path.join(output, 'static', filename + '.gz'), compressed);
    manifest.files[filename] = { sha256, bytes: bytes.length, gzipBytes: compressed.length, type: extension };
    return { file: filename, sha256, type: extension };
  }
  for (const [group, files] of Object.entries(groups)) manifest.groups[group] = [bundle(group, 'js', files)];
  manifest.groups.core.unshift(bundle('styles', 'css', styles.filter(x => !x.startsWith('vendor/cm/'))));
  manifest.groups.editor.unshift(bundle('editor', 'css', styles.filter(x => x.startsWith('vendor/cm/'))));

  // Asset downloads are verified before a single execution, so fallback cannot run the app twice.
  function bootstrap(manifest, cdn, sha256) {
    const status = document.getElementById('startupStatus');
    const label = document.getElementById('startupLabel');
    const english = (localStorage.getItem('lang') || navigator.language).startsWith('en');
    label.textContent = english ? 'Loading workspace…' : '正在加载工作台…';
    const started = Date.now();
    const timer = setInterval(() => {
      label.textContent = (english ? 'Loading workspace… ' : '正在加载工作台… ') + Math.floor((Date.now() - started) / 1000) + (english ? 's' : '秒');
    }, 1000);
    const files = new Map(), groups = new Map();
    async function download(url, item, timeout) {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'force-cache', credentials: 'omit' });
        if (!response.ok) throw Error('Resource HTTP ' + response.status);
        const data = await response.arrayBuffer();
        const hash = globalThis.crypto?.subtle
          ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2, '0')).join('')
          : sha256(new Uint8Array(data));
        if (hash !== item.sha256) throw Error('Resource integrity check failed');
        return new TextDecoder().decode(data);
      } finally { clearTimeout(deadline); }
    }
    function get(item) {
      if (files.has(item.file)) return files.get(item.file);
      const task = (async () => {
        const local = '/static/' + item.file;
        if (cdn) {
          try { return await download(cdn + '/' + item.file, item, 10000); }
          catch { return download(local, item, 30000); }
        }
        return download(local, item, 30000);
      })().catch(error => { files.delete(item.file); throw error; });
      files.set(item.file, task);
      return task;
    }
    function load(group) {
      if (groups.has(group)) return groups.get(group);
      const task = (async () => {
        const items = manifest.groups[group];
        if (!items) throw Error('Unknown resource group');
        const text = await Promise.all(items.map(get));
        items.forEach((item, index) => {
          const element = document.createElement(item.type === 'css' ? 'style' : 'script');
          element.textContent = text[index] + (item.type === 'js' ? '\n//# sourceURL=/static/' + item.file : '');
          document.head.appendChild(element);
        });
      })().catch(error => { groups.delete(group); throw error; });
      groups.set(group, task);
      return task;
    }
    window.ClooteeAssets = { load };
    load('core').then(() => {
      if (!window.ClooteeBootReady) throw Error('Workspace did not start');
      return window.ClooteeBootReady;
    }).then(() => { clearInterval(timer); status.remove(); }).catch(() => {
      clearInterval(timer);
      label.textContent = english ? 'Loading failed. Please retry.' : '资源加载失败，请重试。';
      const button = document.getElementById('startupRetry');
      button.hidden = false;
      button.textContent = english ? 'Retry' : '重新加载';
      button.onclick = () => location.reload();
    });
  }
  html = html.replace(/<script src="[^"]+"><\/script>/g, '').replace(/<link rel="stylesheet" href="[^"]+"\s*\/>/g, '');
  const critical = '<style>#startupStatus{position:fixed;inset:0;z-index:99999;display:grid;place-content:center;gap:16px;text-align:center;background:var(--bg,#f8fafc);color:var(--text,#0f172a);font:16px system-ui}#startupRetry{padding:10px 24px;cursor:pointer}</style>';
  html = html.replace('</head>', critical + (cdn ? `<link rel="preconnect" href="${new URL(cdn).origin}" crossorigin>` : '') + '</head>');
  html = html.replace(/(<body[^>]*>)/, '$1<div id="startupStatus" role="status" aria-live="polite"><span id="startupLabel">正在加载工作台…</span><button id="startupRetry" hidden>重新加载</button></div>');
  html = html.replace('</body>', `<script>(${bootstrap.toString()})(${JSON.stringify(manifest)},${JSON.stringify(cdn.replace(/\/$/, ''))},${sha256.toString()});</script></body>`);
  fs.writeFileSync(path.join(output, 'index.html'), html);
  fs.writeFileSync(path.join(output, 'index.html.gz'), zlib.gzipSync(Buffer.from(html), { level: 9 }));
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { version: manifest.version, initialFiles: 2, initialGzipBytes: manifest.groups.core.reduce((sum, item) => sum + manifest.files[item.file].gzipBytes, 0), assets: Object.keys(manifest.files).length };
}

module.exports = { buildWeb, sha256 };
if (require.main === module) console.log(JSON.stringify(buildWeb(...process.argv.slice(2))));
