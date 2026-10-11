const {test}=require('node:test');const assert=require('node:assert/strict');
const promote=require('../promote.cjs');const {candidateId,productId,REQUIRED}=require('../candidate.cjs');
const {policyHash}=require('../build-candidate.cjs');const {hash}=require('../journal.cjs');
const path=require('node:path');const root=path.resolve(__dirname,'../../..');
function fixture({accepted=true,tree='same',attempt=1,checkId=1}={}) {
  const c={schema:1,source:'a'.repeat(40),base:'b'.repeat(40),artifact:'sha256:'+'c'.repeat(64),preview:'https://pr-1.xenica.truebigsand.top',policy:policyHash(root),run:123,attempt:1};c.id=candidateId(c);c.product=productId(c);
  const records=[{schema:1,type:'engineering',candidate:c,checks:REQUIRED.map(name=>({name,id:1})),selfTest:{unresolved:[]}}];
  if(accepted)records.push({schema:1,type:'acceptance',candidate:c,product:c.product,evidence:{quote:'体验通过',origin:'chat:test/1'}});
  const index={records:records.map((r,i)=>({type:r.type,source:c.source,path:`records/${i}.json`,sha256:hash(JSON.stringify(r))}))};
  const outputs=[];
  return {outputs,args:{root,context:{repo:{owner:'owner',repo:'repo'},sha:'d'.repeat(40)},core:{setOutput:(...v)=>outputs.push(v)},github:{
    paginate:async()=>REQUIRED.map((name,i)=>({name,id:checkId,conclusion:'success',details_url:`https://github.com/owner/repo/actions/runs/123/job/${i+1}`})),
    rest:{checks:{listForRef:'checks'},repos:{getContent:async({path})=>({data:{content:Buffer.from(JSON.stringify(path==='index.json'?index:records[Number(path.match(/\d+/)[0])])).toString('base64')}}),listPullRequestsAssociatedWithCommit:async()=>({data:[{merged_at:'now',merge_commit_sha:'d'.repeat(40),base:{ref:'master'},head:{sha:c.source}}]})},git:{getCommit:async({commit_sha})=>({data:{tree:{sha:commit_sha===c.source?'same':tree}}})},actions:{getJobForWorkflowRun:async({job_id})=>({data:{head_sha:c.source,name:REQUIRED[job_id-1],conclusion:'success',run_id:123,run_attempt:attempt}})}}}}};
}
test('源码内容相同且已验收才推广同一 digest',async()=>{const f=fixture();await promote(f.args);assert.equal(f.outputs[0][1],'sha256:'+'c'.repeat(64));});
test('缺失验收、内容变化、尝试替换及检查替换均阻止推广',async()=>{
  for(const options of [{accepted:false},{tree:'different'},{attempt:2},{checkId:2}])await assert.rejects(()=>promote(fixture(options).args));
});
