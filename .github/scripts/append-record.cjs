// 部署与 Agent 工具共用追加入口。凭据仅从 stdin 读取，永不写入记录或日志。
const append=require('./journal.cjs');
async function main() {
  const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
  const {token,record}=JSON.parse(Buffer.concat(chunks).toString());
  if(!token?.trim())throw new Error('missing publication credential');
  const call=async(method,path,data)=>{
    const response=await fetch('https://api.github.com/repos/StLixx/Xenica/'+path,{method,
      headers:{Authorization:'Bearer '+token.trim(),Accept:'application/vnd.github+json','Content-Type':'application/json'},
      body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Object.assign(new Error('publication request failed'),{status:response.status});
    return {data:await response.json()};
  };
  const github={rest:{git:{
    getRef:({ref})=>call('GET','git/ref/'+ref),getCommit:({commit_sha})=>call('GET','git/commits/'+commit_sha),
    createTree:({owner,repo,...data})=>call('POST','git/trees',data),
    createCommit:({owner,repo,...data})=>call('POST','git/commits',data),
    createRef:({owner,repo,...data})=>call('POST','git/refs',data),
    updateRef:({owner,repo,ref,...data})=>call('PATCH','git/refs/'+ref,data),
  },repos:{getContent:({path,ref})=>call('GET','contents/'+path+'?ref='+encodeURIComponent(ref))}}};
  const result=await append({github,owner:'StLixx',repo:'Xenica',record});
  process.stdout.write(JSON.stringify({path:result.path,sha256:result.sha256})+'\n');
}
main().catch(()=>{process.stderr.write('Permanent record publication failed; no credentials logged.\n');process.exitCode=1;});
