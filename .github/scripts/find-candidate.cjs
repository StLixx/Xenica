const {hash}=require('./journal.cjs');const {candidateId}=require('./candidate.cjs');
module.exports=async function findCandidate({github,owner,repo,source,run,attempt}) {
  const head=(await github.rest.git.getRef({owner,repo,ref:'heads/delivery-records'})).data.object.sha;
  const read=async path=>JSON.parse(Buffer.from((await github.rest.repos.getContent({owner,repo,path,ref:head})).data.content,'base64').toString());
  const index=await read('index.json');
  const item=index.records.findLast(r=>r.type==='candidate'&&r.source===source&&r.run===run&&r.attempt===attempt);
  if(!item)throw new Error('永久候选记录缺失，禁止使用旧运行替代');
  const record=await read(item.path);
  if(hash(JSON.stringify(record))!==item.sha256 || candidateId(record.candidate)!==record.candidate.id)throw new Error('永久候选记录损坏');
  return record.candidate;
};
