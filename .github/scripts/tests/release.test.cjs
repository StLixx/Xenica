const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const release=require('../release.cjs');const {candidateId,productId,REQUIRED}=require('../candidate.cjs');const {policyHash}=require('../build-candidate.cjs');const {hash}=require('../journal.cjs');
const root=path.resolve(__dirname,'../../..');const commit='d'.repeat(40);const source='a'.repeat(40);const artifact='sha256:'+'c'.repeat(64);
function fixture({backup=true,health=true,master=commit,oldCI=false,tag=null,immutable=true,unfinished=false,policyChanged=false}={}){
  const c={schema:1,source,base:'b'.repeat(40),artifact,preview:'https://pr-61.xenica.truebigsand.top',policy:policyChanged?'0'.repeat(64):policyHash(root),run:123,attempt:1};c.id=candidateId(c);c.product=productId(c);
  const records=[{schema:1,type:'engineering',candidate:c,checks:REQUIRED.map((name,i)=>({name,id:i+1})),selfTest:{unresolved:[]}},
    {schema:1,type:'acceptance',candidate:c,product:c.product,evidence:{quote:'体验通过',origin:'chat:test/1'}},
    {schema:1,type:'deployment',id:'test',source,artifact,version:'v0.2.5',previous_artifact:'sha256:'+'e'.repeat(64),backups:(backup?['xenica','xenica-sketch']:['xenica']).map(project=>({project,sha256:'f'.repeat(64),recovery:`xenica-backup://test/${project}`})),targets:['https://xenica.truebigsand.top','https://excalidraw.xenica.truebigsand.top'].map(url=>({url,source,artifact,version:'0.2.5'}))}];
  const index={records:records.map((r,i)=>({type:r.type,source:r.candidate?.source??r.source,path:`records/${i}.json`,sha256:hash(JSON.stringify(r))}))};
  let published=null;let asset=null;let tagSha=tag;const mutations=[];
  const missing=()=>{throw Object.assign(Error('missing'),{status:404});};
  const check=(name,i,merged)=>({name,id:merged?i+21:i+1,conclusion:oldCI&&merged?'failure':'success',app:{slug:'github-actions'},details_url:`https://github.com/owner/repo/actions/runs/${merged?300:123}/job/${merged?i+21:i+1}`});
  const github={request:async()=>({data:{enabled:immutable}}),paginate:async(fn,args)=>{
    if(fn==='checks')return (args.ref===commit?['rust','web','e2e','screenshots']:REQUIRED).map((name,i)=>check(name,i,args.ref===commit));
    if(fn==='runs')return [{id:300,head_sha:commit,head_branch:'master',event:'push',status:'completed',conclusion:'success',run_attempt:1}];
    if(fn==='assets')return asset?[asset]:[];
    if(fn==='milestones')return [{title:'v0.2.5',open_issues:unfinished?1:0}];
    throw Error('unexpected pagination');
  },rest:{checks:{listForRef:'checks'},actions:{listWorkflowRuns:'runs',getJobForWorkflowRun:async({job_id})=>({data:{head_sha:job_id>=21?commit:source,name:job_id>=21?['rust','web','e2e','screenshots'][job_id-21]:REQUIRED[job_id-1],conclusion:'success',run_id:job_id>=21?300:123,run_attempt:1}})},git:{
    getRef:async({ref})=>({data:{object:{type:'commit',sha:ref==='heads/master'?master:ref==='heads/delivery-records'?'journal':tagSha??missing()}}}),
    getCommit:async()=>({data:{tree:{sha:'same-tree'}}}),createRef:async({sha})=>{tagSha=sha;mutations.push('tag');return {data:{}};}
  },issues:{listMilestones:'milestones'},repos:{
    getContent:async({path})=>({data:{content:Buffer.from(JSON.stringify(path==='index.json'?index:records[Number(path.match(/\d+/)[0])])).toString('base64')}}),
    listPullRequestsAssociatedWithCommit:async()=>({data:[{merged_at:'now',merge_commit_sha:commit,base:{ref:'master'},head:{sha:source}}]}),
    getReleaseByTag:async()=>({data:published??missing()}),listReleaseAssets:'assets',getReleaseAsset:async()=>({data:asset.bytes}),
    createRelease:async(args)=>{published={...args,id:10,immutable:false,html_url:'https://github.com/owner/repo/releases/tag/v0.2.5'};mutations.push('draft');return {data:published};},
    uploadReleaseAsset:async({data,name})=>{asset={id:1,name,bytes:data,digest:'sha256:'+hash(data)};mutations.push('asset');return {data:asset};},
    updateRelease:async()=>{published={...published,draft:false,immutable:true,published_at:'2026-10-13T03:00:00Z'};mutations.push('publish');return {data:published};}
  }}};
  return {mutations,github,getAsset:()=>asset,setPublished:p=>{published=p;},args:{github,context:{repo:{owner:'owner',repo:'repo'}},core:{setOutput:()=>{}},root,version:'v0.2.5',commit,phase:'publish',archive:async({record})=>mutations.push(record.stage),fetchHealth:async()=>({commit:source,artifact:health?artifact:'sha256:'+'0'.repeat(64),version:'0.2.5'})}};
}
test('备份、最新检查、精确部署通过后一次发布；重跑只核验并补永久记录',async()=>{
  const f=fixture();const manifest=await release(f.args);assert.equal(manifest.merged,commit);assert.equal(manifest.source,source);assert.equal(f.mutations.filter(x=>x==='publish').length,1);
  await release(f.args);assert.equal(f.mutations.filter(x=>x==='publish').length,1);
});
test('prepare 只保存明确发布请求，不建 Tag 或发布；合并 CI 不调用发布',async()=>{
  const f=fixture();await release({...f.args,phase:'prepare'});assert.deepEqual(f.mutations,['prepared']);
  const fs=require('node:fs');assert.doesNotMatch(fs.readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8'),/imagetools create.*xenica:latest/);
});
test('缺少画板备份、错误部署、主线变化、旧失败检查、错误 Tag、未启用不可变发布均阻止正式发布',async()=>{
  for(const options of [{backup:false},{health:false},{master:'0'.repeat(40)},{oldCI:true},{tag:'0'.repeat(40)},{immutable:false},{unfinished:true},{policyChanged:true}]){
    const f=fixture(options);await assert.rejects(()=>release(f.args));assert.ok(!f.mutations.includes('publish'));
  }
});
test('已发布附件校验值变化不能被重跑覆盖',async()=>{
  const f=fixture();await release(f.args);f.getAsset().bytes=Buffer.from('{}');await assert.rejects(()=>release(f.args),/checksum/);assert.equal(f.mutations.filter(x=>x==='publish').length,1);
});
test('公共永久记录写入失败时禁止发布',async()=>{
  const f=fixture();await assert.rejects(()=>release({...f.args,archive:async()=>{throw Error('journal unavailable');}}));assert.ok(!f.mutations.includes('publish'));
});
