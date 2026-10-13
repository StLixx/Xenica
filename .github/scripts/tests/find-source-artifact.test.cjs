const {test}=require('node:test');
const assert=require('node:assert/strict');
const find=require('../find-source-artifact.cjs');
const build=require('../build-candidate.cjs');
const {hash}=require('../journal.cjs');
const source='a'.repeat(40);
const candidate=build({root:process.cwd(),source,base:'b'.repeat(40),artifact:'sha256:'+'c'.repeat(64),number:55,run:1,attempt:1});
const record={schema:1,type:'candidate',candidate};
const entry={type:'candidate',source,path:'records/test.json',sha256:hash(JSON.stringify(record))};
function github(records=[entry],body=record){return {rest:{git:{getRef:async()=>({data:{object:{sha:'fixed'}}})},repos:{getContent:async({path})=>({data:{content:Buffer.from(JSON.stringify(path==='index.json'?{schema:1,records}:body)).toString('base64')}})}}};}
test('重跑相同源码复用同一产物；新源码必须首次构建',async()=>{
 assert.equal(await find({github:github(),owner:'StLixx',repo:'Xenica',source}),candidate.artifact);
 assert.equal(await find({github:github(),owner:'StLixx',repo:'Xenica',source:'d'.repeat(40)}),null);
});
test('记录损坏、身份被替换或查找失败时不能静默重建',async()=>{
 for(const altered of [{...record,candidate:{...candidate,source:'d'.repeat(40)}},{...record,candidate:{...candidate,artifact:'sha256:'+'e'.repeat(64)}}])
  await assert.rejects(find({github:github([entry],altered),owner:'StLixx',repo:'Xenica',source}));
 const broken=github();broken.rest.git.getRef=async()=>{throw Object.assign(new Error('unavailable'),{status:503});};
 await assert.rejects(find({github:broken,owner:'StLixx',repo:'Xenica',source}));
});
