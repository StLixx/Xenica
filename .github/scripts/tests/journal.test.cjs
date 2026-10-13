const {test}=require('node:test');const assert=require('node:assert/strict');
const {encode}=require('../journal.cjs');const {parse}=require('../acceptance.cjs');
const append=require('../journal.cjs');
test('凭据与私密分享链接不能进入长期索引',()=>{
  for(const value of ['https://a/api/share/secret','https://a/?ticket=secret','postgres://a']) assert.throws(()=>encode({schema:1,type:'candidate',value}));
});

test('永久记录并发追加重试且重复身份不重复创建', async()=>{
  let head='first',index={schema:1,records:[]},attempts=0;
  const record={schema:1,type:'engineering',source:'a'.repeat(40),run:12,attempt:2};
  const api={rest:{git:{
    getRef:async()=>({data:{object:{sha:head}}}), getCommit:async()=>({data:{tree:{sha:'tree'}}}),
    createTree:async({tree})=>({data:{sha:'new-tree',files:tree}}),
    createCommit:async()=>({data:{sha:'new-commit'}}),
    updateRef:async({force})=>{ assert.equal(force,false); if(++attempts===1){head='concurrent';throw Object.assign(new Error('conflict'),{status:422});} head='new-commit';index.records.push({...encode(record),type:record.type,source:record.source});},
  },repos:{getContent:async()=>({data:{content:Buffer.from(JSON.stringify(index)).toString('base64')}})}}};
  const result=await append({github:api,owner:'o',repo:'r',record});
  assert.equal(result.sha256,encode(record).sha256);assert.equal(attempts,2);
  await append({github:api,owner:'o',repo:'r',record});assert.equal(attempts,2);
});
test('开始与无来源的通过不能记为产品验收',()=>{
  const identity={owner:'owner',source:'a'.repeat(40),product:'product-'+ 'b'.repeat(64)};
  const command=`/验收 ${identity.source} ${identity.product}`;
  const data={type:'product-acceptance',quote:'体验通过',origin:'chat:session/message',experiencedAt:'2026-10-11T00:00:00Z'};
  const comment=quote=>({id:1,user:{login:'owner'},body:command+'\n'+JSON.stringify({...data,quote})});
  assert.equal(parse(comment('开始'),identity),null);assert.equal(parse({...comment('通过'),body:command},identity),null);
  assert.equal(parse(comment('四项体验均通过'),identity).quote,'四项体验均通过');
});
