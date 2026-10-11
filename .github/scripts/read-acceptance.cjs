const {hash}=require('./journal.cjs');
const {productId}=require('./candidate.cjs');
module.exports=async function readAcceptance({github,owner,repo,source,product}) {
  let index;
  const read=async path=>JSON.parse(Buffer.from((await github.rest.repos.getContent({owner,repo,path,ref:'delivery-records'})).data.content,'base64').toString());
  try {index=await read('index.json');}catch(e){if(e.status===404)return null;throw e;}
  for(const item of [...index.records].reverse().filter(r=>r.type==='acceptance'&&r.source===source)) {
    const record=await read(item.path);
    if(hash(JSON.stringify(record))!==item.sha256)throw new Error('永久验收记录校验失败');
    if(record.product!==product||productId(record.candidate)!==product)continue;
    if(!record.evidence.quote?.trim()||!record.evidence.origin?.trim()||/^(开始|start|begin)[！!。 .]*$/i.test(record.evidence.quote.trim()))continue;
    return record;
  }
  return null;
};
