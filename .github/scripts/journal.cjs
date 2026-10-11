// 长期记录使用同仓库的独立 Git 分支，避免记录自身改变候选源码身份。
const {createHash}=require('node:crypto');
const BRANCH='delivery-records';
const hash=s=>createHash('sha256').update(s).digest('hex');
function encode(record) {
  if(record.schema!==1||!['candidate','engineering','acceptance','promotion','archive'].includes(record.type)) throw new Error('invalid journal record');
  const text=JSON.stringify(record);
  if(/\/api\/share\/|[?&](token|ticket|password|secret|api.?key)=|postgres:\/\//i.test(text)) throw new Error('private credential in journal');
  if(record.candidate) {
    const {candidateId,productId}=require('./candidate.cjs');
    if(candidateId(record.candidate)!==record.candidate.id || productId(record.candidate)!==record.candidate.product) throw new Error('invalid candidate identity in journal');
  }
  return {text,sha256:hash(text),path:`records/${hash(text)}.json`};
}
module.exports=async function append({github,owner,repo,record}) {
  const item=encode(record);const git=github.rest.git;
  for(let attempt=0;attempt<5;attempt++) {
    let head=null,baseTree,index={schema:1,records:[]};
    try {head=(await git.getRef({owner,repo,ref:`heads/${BRANCH}`})).data.object.sha;}
    catch(e) {if(e.status!==404)throw e;}
    if(head) {
      baseTree=(await git.getCommit({owner,repo,commit_sha:head})).data.tree.sha;
      const content=(await github.rest.repos.getContent({owner,repo,path:'index.json',ref:head})).data;
      index=JSON.parse(Buffer.from(content.content,'base64').toString());
      if(index.schema!==1||!Array.isArray(index.records))throw new Error('journal index corrupt');
      if(index.records.some(r=>r.sha256===item.sha256))return item;
    }
    index.records.push({path:item.path,sha256:item.sha256,type:record.type,source:record.candidate?.source ?? record.source,
      run:record.candidate?.run ?? record.run,attempt:record.candidate?.attempt ?? record.attempt,previous:index.records.at(-1)?.sha256 ?? null});
    const tree=(await git.createTree({owner,repo,...(baseTree?{base_tree:baseTree}:{}),tree:[
      {path:item.path,mode:'100644',type:'blob',content:item.text},
      {path:'index.json',mode:'100644',type:'blob',content:JSON.stringify(index,null,2)+'\n'},
    ]})).data;
    const commit=(await git.createCommit({owner,repo,message:`chore(delivery): archive ${record.type} ${item.sha256.slice(0,12)}`,tree:tree.sha,parents:head?[head]:[]})).data;
    try {
      if(head)await git.updateRef({owner,repo,ref:`heads/${BRANCH}`,sha:commit.sha,force:false});
      else await git.createRef({owner,repo,ref:`refs/heads/${BRANCH}`,sha:commit.sha});
      return item;
    }catch(e){if(![409,422].includes(e.status))throw e;}
  }
  throw new Error('journal concurrent append failed');
};
module.exports.encode=encode;
module.exports.hash=hash;
