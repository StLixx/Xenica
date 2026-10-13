// 发布控制器与验收产物分离；已发布 Tag/附件不得覆盖。所有身份由永久记录和平台核验。
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const journal=require('./journal.cjs');const {latestChecks}=require('./candidate.cjs');
const digest=text=>createHash('sha256').update(text).digest('hex');
const SHA=/^[a-f0-9]{40}$/;const HASH=/^[a-f0-9]{64}$/;
const TARGETS=['https://xenica.truebigsand.top','https://excalidraw.xenica.truebigsand.top'];
function plan(root,version){
  if(!/^v\d+\.\d+\.\d+$/.test(version))throw Error('invalid release version');
  const p=JSON.parse(fs.readFileSync(path.join(root,'releases',version+'.json'),'utf8'));
  const cargo=fs.readFileSync(path.join(root,'Cargo.toml'),'utf8').match(/\[workspace.package\][\s\S]*?\bversion\s*=\s*"([^"]+)"/)[1];
  const web=JSON.parse(fs.readFileSync(path.join(root,'web/package.json'),'utf8')).version;
  if(p.schema!==1||p.version!==version||version!=='v'+cargo||cargo!==web||!p.title?.trim()||
    JSON.stringify(p.targets)!==JSON.stringify(TARGETS)||p.notes!==`docs/releases/${version}.md`)throw Error('release version or targets differ');
  fs.readFileSync(path.join(root,p.notes),'utf8');return p;
}
function receipt(record,c,version){
  if(record?.schema!==1||record.type!=='deployment'||record.source!==c.source||record.artifact!==c.artifact||record.version!==version||
    !Array.isArray(record.backups)||!record.backups.some(b=>b.project==='xenica')||!record.backups.some(b=>b.project==='xenica-sketch')||
    record.backups.some(b=>!HASH.test(b.sha256??'')||b.recovery!==`xenica-backup://${record.id}/${b.project}`)||
    !/^sha256:[a-f0-9]{64}$/.test(record.previous_artifact??'')||
    !Array.isArray(record.targets)||record.targets.length!==TARGETS.length||TARGETS.some(url=>!record.targets.some(t=>t.url===url&&t.source===c.source&&t.artifact===c.artifact&&'v'+t.version===version)))throw Error('deployment or backup receipt missing/mismatched');
  return record;
}
async function readRecords(github,repo){
  const head=(await github.rest.git.getRef({...repo,ref:'heads/delivery-records'})).data.object.sha;
  const read=async file=>JSON.parse(Buffer.from((await github.rest.repos.getContent({...repo,path:file,ref:head})).data.content,'base64').toString());
  const index=await read('index.json');return async predicate=>{
    for(const item of [...index.records].reverse().filter(predicate)){
      const r=await read(item.path);if(digest(JSON.stringify(r))!==item.sha256)throw Error('journal checksum differs');return {record:r,path:item.path,sha256:item.sha256};
    }throw Error('required permanent record missing');
  };
}
async function verifyMergeCI(github,repo,commit){
  const runs=await github.paginate(github.rest.actions.listWorkflowRuns,{...repo,workflow_id:'ci.yml',head_sha:commit});
  const run=runs.filter(r=>r.head_sha===commit&&r.head_branch==='master'&&['push','workflow_dispatch'].includes(r.event)).sort((a,b)=>b.id-a.id)[0];
  if(!run||run.status!=='completed'||run.conclusion!=='success')throw Error('merged CI not successful');
  const checks=latestChecks(await github.paginate(github.rest.checks.listForRef,{...repo,ref:commit}));
  for(const name of ['rust','web','e2e','screenshots']){
    const c=checks.get(name);const m=c?.details_url?.match(/\/actions\/runs\/(\d+)\/job\/(\d+)$/);
    if(c?.app?.slug!=='github-actions'||c.conclusion!=='success'||!m||Number(m[1])!==run.id)throw Error('merged checks missing/replaced');
    const j=(await github.rest.actions.getJobForWorkflowRun({...repo,job_id:Number(m[2])})).data;
    if(j.head_sha!==commit||j.run_id!==run.id||j.run_attempt!==run.run_attempt||j.name!==name||j.conclusion!=='success')throw Error('merged check identity differs');
  }return {run:run.id,attempt:run.run_attempt};
}
async function tag(github,repo,version,commit,create=false){
  try{const ref=(await github.rest.git.getRef({...repo,ref:'tags/'+version})).data;
    if(ref.object.type!=='commit'||ref.object.sha!==commit)throw Error('release tag identity differs');
  }catch(e){if(e.status!==404||!create)throw e;await github.rest.git.createRef({...repo,ref:'refs/tags/'+version,sha:commit});}
}
async function existing(github,repo,version){try{return (await github.rest.repos.getReleaseByTag({...repo,tag:version})).data;}catch(e){if(e.status!==404)throw e;return null;}}
async function assetManifest(github,repo,release){
  const assets=await github.paginate(github.rest.repos.listReleaseAssets,{...repo,release_id:release.id});
  const asset=assets.find(a=>a.name==='delivery-manifest.json');if(!asset)throw Error('release manifest asset missing');
  const data=(await github.rest.repos.getReleaseAsset({...repo,asset_id:asset.id,headers:{accept:'application/octet-stream'}})).data;
  const text=typeof data==='string'?data:Buffer.from(data).toString('utf8');const hash=digest(text);
  if(asset.digest!=='sha256:'+hash||!release.body?.includes(`<!-- xenica-release-manifest:${hash} -->`))throw Error('release manifest checksum differs');
  return {manifest:JSON.parse(text),hash};
}
module.exports=async function release({github,context,core,root=process.cwd(),sourceRoot=root,version,commit,phase='prepare',fetchHealth=async url=>{
  const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('release health failed');return r.json();
},archive=journal}){
  const repo=context.repo;if(!SHA.test(commit??'')||!['prepare','publish'].includes(phase))throw Error('invalid release request');
  if(!/^v\d+\.\d+\.\d+$/.test(version))throw Error('invalid release version');
  let prior=await existing(github,repo,version);
  if(prior&&!prior.draft){
    await tag(github,repo,version,commit);const a=await assetManifest(github,repo,prior);
    if(!prior.immutable||a.manifest.merged!==commit||a.manifest.version!==version)throw Error('existing release identity differs');
    await archive({github,...repo,record:{schema:1,type:'release',source:a.manifest.source,version,merged:commit,artifact:a.manifest.artifact,stage:'published',manifest:a.hash,url:prior.html_url,publishedAt:prior.published_at}});
    core.setOutput('published','true');core.setOutput('url',prior.html_url);return a.manifest;
  }
  const p=plan(root,version);
  const current=(await github.rest.git.getRef({...repo,ref:'heads/master'})).data.object.sha;if(current!==commit)throw Error('release is not current master');
  const milestone=(await github.paginate(github.rest.issues.listMilestones,{...repo,state:'all'})).find(m=>m.title===version);
  if(!milestone||milestone.open_issues!==0)throw Error('version scope still has unfinished tasks');
  const sourceVersion=fs.readFileSync(path.join(sourceRoot,'Cargo.toml'),'utf8').match(/\[workspace.package\][\s\S]*?\bversion\s*=\s*"([^"]+)"/)[1];
  if('v'+sourceVersion!==version||JSON.parse(fs.readFileSync(path.join(sourceRoot,'web/package.json'),'utf8')).version!==sourceVersion)throw Error('source version differs');
  const outputs={};await require(path.join(sourceRoot,'.github/scripts/promote.cjs'))({github,context:{...context,sha:commit},root:sourceRoot,core:{setOutput:(n,v)=>{outputs[n]=v;}}});
  const c=JSON.parse(outputs.candidate);const mergeCI=await verifyMergeCI(github,repo,commit);
  const manifest={schema:1,version,title:p.title,source:c.source,merged:commit,artifact:c.artifact,product:c.product,policy:c.policy,candidate:c.id,engineering:{run:c.run,attempt:c.attempt,mergeCI},targets:p.targets};
  await archive({github,...repo,record:{schema:1,type:'release',source:c.source,version,merged:commit,artifact:c.artifact,stage:'prepared',candidate:c}});
  core.setOutput('artifact',c.artifact);core.setOutput('source',c.source);core.setOutput('published','false');
  if(phase==='prepare')return manifest;
  const find=await readRecords(github,repo);const proof=await find(i=>i.type==='deployment'&&i.source===c.source);receipt(proof.record,c,version);
  for(const url of p.targets){const h=await fetchHealth(url);if(h.commit!==c.source||h.artifact!==c.artifact||'v'+h.version!==version)throw Error('published deployment identity differs');}
  manifest.deployment={path:proof.path,sha256:proof.sha256};
  if(!(await github.request('GET /repos/{owner}/{repo}/immutable-releases',repo)).data.enabled)throw Error('immutable releases are not enabled');
  const text=JSON.stringify(manifest,null,2)+'\n';const hash=digest(text);
  await tag(github,repo,version,commit,true);
  const body=fs.readFileSync(path.join(root,p.notes),'utf8')+`\n<!-- xenica-release-manifest:${hash} -->\n`;
  if(!prior)prior=(await github.rest.repos.createRelease({...repo,tag_name:version,target_commitish:commit,name:`${version} · ${p.title}`,body,draft:true,prerelease:false})).data;
  else if(prior.target_commitish!==commit||prior.body!==body)throw Error('existing draft identity differs');
  const assets=await github.paginate(github.rest.repos.listReleaseAssets,{...repo,release_id:prior.id});
  const old=assets.find(a=>a.name==='delivery-manifest.json');
  if(old){const a=await assetManifest(github,repo,prior);if(a.hash!==hash)throw Error('draft asset differs');}
  else await github.rest.repos.uploadReleaseAsset({...repo,release_id:prior.id,name:'delivery-manifest.json',data:Buffer.from(text),headers:{'content-type':'application/json','content-length':Buffer.byteLength(text)}});
  await assetManifest(github,repo,prior);
  await archive({github,...repo,record:{schema:1,type:'release',source:c.source,version,merged:commit,artifact:c.artifact,stage:'validated',manifest:hash,deployment:manifest.deployment}});
  // 附件上传期间主线或部署变化也不能偷偷放行。
  if((await github.rest.git.getRef({...repo,ref:'heads/master'})).data.object.sha!==commit)throw Error('master changed before publication');
  for(const url of p.targets){const h=await fetchHealth(url);if(h.commit!==c.source||h.artifact!==c.artifact)throw Error('deployment changed before publication');}
  const published=(await github.rest.repos.updateRelease({...repo,release_id:prior.id,draft:false,make_latest:'true'})).data;
  if(!published.immutable||published.draft)throw Error('release publication not immutable');
  await archive({github,...repo,record:{schema:1,type:'release',source:c.source,version,merged:commit,artifact:c.artifact,stage:'published',manifest:hash,url:published.html_url,publishedAt:published.published_at}});
  core.setOutput('published','true');core.setOutput('url',published.html_url);return manifest;
};
module.exports.plan=plan;module.exports.receipt=receipt;
module.exports.waitDeployment=async function waitDeployment({github,owner,repo,source,artifact,version,attempts=60}){
  for(let i=0;i<attempts;i++){
    try{
      const find=await readRecords(github,{owner,repo});const proof=await find(r=>r.type==='deployment'&&r.source===source);
      receipt(proof.record,{source,artifact},version);return;
    }catch(e){if(i===attempts-1)throw e;await new Promise(resolve=>setTimeout(resolve,10000));}
  }
};
