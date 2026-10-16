import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Transport} from '/mcp/transport.mjs';
const config=JSON.parse(fs.readFileSync('/private/bridge.json'));
async function call(tool,args) {
 const r=await (await fetch('http://127.0.0.1:8892/rpc',{method:'POST',headers:{'Authorization':'Bearer '+config.bridge_secret,'Content-Type':'application/json'},body:JSON.stringify({action:'call',tool,args,actor:'infra-smoke'})})).json();
 if(r.error)throw Error(r.error);return r.result;
}
if(fs.existsSync('/state/smoke-result.json')) {
 const result=JSON.parse(fs.readFileSync('/state/smoke-result.json'));
 const read=await call('read_document',{docId:result.docId});
 assert.match(read.content,/AFFINE_MCP_RW_20261017/);
 console.log('existing smoke document persists',result.url);
}else{
 const t=new Transport(config);
 if(!fs.existsSync('/state/pre-first-write-root.bin'))fs.writeFileSync('/state/pre-first-write-root.bin',await t.load(config.workspace_id),{mode:0o600});
 t.close();
 const made=await call('create_document',{title:'MCP 联通自检｜2026-10-17',content:'这是自动联通自检的合成文档。\n\n- 创建验证\n- 中文验证',idempotency_key:'infra-smoke-create-20261017-v1'});
 const read=await call('read_document',{docId:made.docId});
 const updated=await call('update_document',{docId:made.docId,content:'这是自动联通自检的合成文档。\n\n- [x] 创建与中文已验证\n- [x] 正文更新已验证\n\nAFFINE_MCP_RW_20261017',expected_revision:read.revision,idempotency_key:'infra-smoke-update-20261017-v1'});
 assert.match(updated.content,/AFFINE_MCP_RW_20261017/);
 const renamed=await call('update_document_meta',{docId:made.docId,title:'AFFiNE MCP 联通自检',expected_revision:updated.revision,idempotency_key:'infra-smoke-rename-20261017-v1'});
 assert.equal(renamed.title,'AFFiNE MCP 联通自检');
 const search=await call('doc_search',{query:'AFFINE_MCP_RW_20261017',limit:5});
 assert.equal(search.hits.length,1);
 const report={docId:made.docId,url:made.url,created:true,body:true,title:renamed.title,searchHits:search.hits.length,completed:new Date().toISOString()};
 fs.writeFileSync('/state/smoke-result.json',JSON.stringify(report),{mode:0o600});
 console.log(JSON.stringify(report));
}
