// Retire only this product's old distribution objects, after the website is updated.
const fs = require('node:fs');
const COS = require('cos-nodejs-sdk-v5');
const tag = process.env.KEEP_RELEASE_TAG;
if (!/^packages-[a-zA-Z0-9-]{1,70}$/.test(tag || '')) throw Error('Invalid release tag');
if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) throw Error('COS credentials are required');
const cos = new COS({SecretId:process.env.COS_SECRET_ID,SecretKey:process.env.COS_SECRET_KEY,UseAccelerate:true});
const scope = {Bucket:process.env.COS_BUCKET || 'devok-1256047633',Region:process.env.COS_REGION || 'na-siliconvalley'};
const repository = process.env.GITHUB_REPOSITORY || 'clootee/clootee';
async function json(url, headers = {}) {
 const response = await fetch(url,{headers,signal:AbortSignal.timeout(60000)});
 if (!response.ok) throw Error('Metadata request failed: '+response.status);
 return response.json();
}
async function main() {
 const release = await json(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, {Authorization:'Bearer '+process.env.GH_TOKEN,'User-Agent':'clootee-retire'});
 const asset = release.assets.find(a=>a.name==='release.json');
 if (!asset || release.draft) throw Error('Current release is not public');
 const manifest = await json(asset.browser_download_url);
 const live = await json('https://clootee.com/download/api/latest');
 if (manifest.version!==live.version || manifest.sourceCommit!==live.sourceCommit || JSON.stringify(manifest.packages)!==JSON.stringify(live.packages)) throw Error('Website must already serve the new complete release');
 const keep = new Set(Object.values(manifest.packages).map(p=>new URL(p.url).pathname.slice(1)));
 if (keep.size!==3 || [...keep].some(k=>!k.startsWith('clootee/releases/'+manifest.version+'/'))) throw Error('Invalid keep set');
 const versioning=await cos.getBucketVersioning(scope);
 if (['Enabled','Suspended'].includes(versioning.VersioningConfiguration?.Status)) throw Error('Versioned bucket requires explicit object-version cleanup');
 let marker='', keys=[];
 do {
  const page=await cos.getBucket({...scope,Prefix:'clootee/',Marker:marker,MaxKeys:1000});
  keys.push(...(page.Contents||[]).map(o=>o.Key));
  if (!['true',true].includes(page.IsTruncated))break;
  if(!page.NextMarker||page.NextMarker===marker)throw Error('Invalid COS pagination');
  marker=page.NextMarker;
 } while(true);
 const distribution = key => /^clootee\/(?:releases\/\d+\.\d+\.\d+\/[a-zA-Z0-9-]+\/clootee-[a-zA-Z0-9.-]+\.(?:zip|exe|dmg)|clootee-(?:latest|\d+\.\d+\.\d+)\.zip)$/.test(key);
 const remove=keys.filter(k=>distribution(k)&&!keep.has(k));
 console.log(JSON.stringify({version:manifest.version,keep:[...keep],oldObjects:remove,apply:process.env.REALLY_DELETE==='1'}));
 if(process.env.REALLY_DELETE!=='1')return;
 for(const Key of remove){await cos.deleteObject({...scope,Key});console.log('Retired: '+Key);}
 for(const Key of remove){
  try{await cos.headObject({...scope,Key});throw Error('Retired object is still readable');}
  catch(error){if(error.statusCode!==404)throw error;}
 }
 for(const Key of keep)await cos.headObject({...scope,Key});
 console.log('Old product packages retired; current three objects remain available.');
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
