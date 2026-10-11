// 只推广已验收的不可变产物。Squash 后 SHA 不同，内容树必须完全相同。
const {candidateId,productId,latestChecks,REQUIRED}=require('./candidate.cjs');
const {policyHash}=require('./build-candidate.cjs');
const {hash}=require('./journal.cjs');
module.exports=async function promote({github,context,core,root=process.cwd()}) {
  const {owner,repo}=context.repo;
  const read=async path=>JSON.parse(Buffer.from((await github.rest.repos.getContent({owner,repo,path,ref:'delivery-records'})).data.content,'base64').toString());
  const index=await read('index.json');
  const pulls=(await github.rest.repos.listPullRequestsAssociatedWithCommit({owner,repo,commit_sha:context.sha})).data;
  const pr=pulls.find(p=>p.merged_at && p.merge_commit_sha===context.sha && p.base.ref==='master');
  if(!pr)throw new Error('当前主线没有对应交付记录，禁止重新构建替代验收产物');
  const records=[];
  for(const item of index.records.filter(i=>i.source===pr.head.sha)) {
    const record=await read(item.path);
    if(hash(JSON.stringify(record))!==item.sha256)throw new Error('交付记录校验失败');
    records.push(record);
  }
  const accepted=records.filter(r=>r.type==='acceptance').at(-1);
  if(!accepted)throw new Error('未验收产物不能推广');
  const c=accepted.candidate;
  if(candidateId(c)!==c.id || productId(c)!==accepted.product || c.policy!==policyHash(root))throw new Error('验收身份或规则不匹配');
  const engineering=records.findLast(r=>r.type==='engineering'&&r.candidate.id===c.id);
  if(!engineering || engineering.selfTest.unresolved.length)throw new Error('工程资格记录缺失');
  const source=(await github.rest.git.getCommit({owner,repo,commit_sha:c.source})).data;
  const merged=(await github.rest.git.getCommit({owner,repo,commit_sha:context.sha})).data;
  if(source.tree.sha!==merged.tree.sha)throw new Error('合并后源码内容与体验产物不同');
  const checks=latestChecks(await github.paginate(github.rest.checks.listForRef,{owner,repo,ref:c.source}));
  for(const name of REQUIRED) {
    const latest=checks.get(name);const saved=engineering.checks.find(j=>j.name===name);
    if(!latest||!saved||latest.id!==saved.id||latest.conclusion!=='success')throw new Error('工程检查已被替换或失败');
  }
  core.setOutput('artifact',c.artifact);core.setOutput('source',c.source);core.setOutput('candidate',JSON.stringify(c));
};
