// Agent 在已授权画板新增实际代码目录。只追加；不整理、删除或移动用户原件。
const fs=require('node:fs');const {createHash}=require('node:crypto');
const catalog=JSON.parse(fs.readFileSync('web/src/api/design-catalog.json','utf8'));
const origin=process.env.XENICA_URL;
if(!/^https:\/\/(?:pr-\d+\.|excalidraw\.)xenica\.truebigsand\.top$/.test(origin??''))throw new Error('invalid board origin');
async function main(){
  const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:process.env.XENICA_USER??'demo',password:process.env.XENICA_PASSWORD??'demo'})});
  if(!login.ok)throw new Error('board login failed');
  const cookie=login.headers.get('set-cookie')?.split(';')[0];
  const request=async(path,method='GET',data,headers={})=>{
    const response=await fetch(origin+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json',...headers},body:data?JSON.stringify(data):undefined});
    if(!response.ok)throw new Error('board request failed: '+response.status);return response.json();
  };
  const health=await request('/api/health');
  if(process.env.EXPECTED_SOURCE&&health.commit!==process.env.EXPECTED_SOURCE)throw new Error('board artifact changed');
  const board=await request('/api/development-board','POST');
  const elements=board.body.scene.elements;
  const prefix='catalog-'+health.commit.slice(0,12)+'-';
  if(elements.some(e=>e.customData?.xenicaCatalog?.source===health.commit)){console.log('board catalog already attached');return;}
  const rectangle=elements.find(e=>e.type==='rectangle');const text=elements.find(e=>e.type==='text');
  if(!rectangle||!text)throw new Error('original board must be attached before catalog organization');
  const identity=s=>prefix+createHash('sha256').update(s).digest('hex').slice(0,24);
  const base=Math.max(...elements.map(e=>e.x+e.width))+700;
  const added=[];
  function element(template,key,type,x,y,width,height,extra={}){
    return {...template,id:identity(key),type,x,y,width,height,version:1,versionNonce:1,updated:Date.now(),index:null,
      groupIds:[],frameId:null,boundElements:null,isDeleted:false,locked:false,link:null,customData:{xenicaCatalog:{source:health.commit,theme:catalog.themeSha256}},...extra};
  }
  function label(key,value,x,y,width=600){
    const lines=value.match(/.{1,30}/gu)??[''];
    return element(text,key,'text',x,y,width,lines.length*25,{text:lines.join('\n'),originalText:value,fontSize:20,lineHeight:1.25,containerId:null,textAlign:'left',verticalAlign:'top',autoResize:false});
  }
  function heading(key,value,x,y){added.push(label(key,value,x,y));}
  function card(key,title,url,kind,x,y,source,version){
    added.push(element(rectangle,key,'embeddable',x,y,480,360,{link:url,customData:{xenicaCatalog:{source:health.commit,theme:catalog.themeSha256},xenicaEmbed:{schema:1,kind,title,url,revision:health.commit,source,...(kind==='react'?{component:'PeekAside'}:{}),...(version?{version}:{})}}}));
  }
  heading('decisions','v0.2.5 · 确认要求（原文保留在旁侧）',base,-120);
  catalog.decisions.forEach((d,i)=>{
    const x=base+(i%2)*680,y=Math.floor(i/2)*300;
    const box=element(rectangle,'decision-'+d.id,'rectangle',x,y,620,250,{customData:{xenicaCatalog:{source:health.commit},xenicaContext:{id:d.id,source:d.source,references:d.references,type:'confirmed-decision'}}});
    const note=label('decision-label-'+d.id,d.title,x+20,y+20,580);note.containerId=box.id;box.boundElements=[{type:'text',id:note.id}];added.push(box,note);
  });
  const versions=await request('/api/development/versions');
  heading('versions','版本体验',base+1500,-120);
  card('current','当前 Xenica 页面',origin,'page',base+1500,0,'web/src/app/App.tsx');
  versions.filter(v=>v.available).forEach((v,i)=>card('version-'+v.id,v.title,'https://xenica.invalid/versions/'+v.id,'runtime',base+1500+(i%2)*540,460+Math.floor(i/2)*460,undefined,v.id));
  heading('features','页面与 Features',base+1500,1380);
  catalog.features.forEach((f,i)=>card('feature-'+f.id,f.title,new URL(f.url,origin).href,'page',base+1500+(i%2)*540,1500+Math.floor(i/2)*460,f.source));
  heading('components','真实组件与设计变量',base+3000,-120);
  card('aside','共享侧栏','https://xenica.invalid/components/PeekAside','react',base+3000,0,'web/src/ui/PeekAside.tsx');
  catalog.components.forEach((c,i)=>card('component-'+c.id,c.title,new URL(c.url,origin).href,'page',base+3000+(i%3)*540,460+Math.floor(i/3)*460,c.source));
  const body={...board.body,scene:{...board.body.scene,elements:[...elements,...added]},catalogAttachments:[...(board.body.catalogAttachments??[]),{source:health.commit,themeSha256:catalog.themeSha256,catalogSha256:createHash('sha256').update(JSON.stringify(catalog)).digest('hex')}]};
  await request('/api/nodes/'+board.id,'PATCH',{body},{'If-Match':'"'+board.updated_at+'"'});
  const saved=await request('/api/nodes/'+board.id);
  if(JSON.stringify(saved.body.scene.elements.slice(0,elements.length))!==JSON.stringify(elements))throw new Error('original board content changed');
  if((await request('/api/health')).commit!==health.commit)throw new Error('board artifact changed during organization');
  console.log(JSON.stringify({board:board.id,originalElements:elements.length,added:added.length,source:health.commit}));
}
main().catch(()=>{console.error('Board organization failed; original contents retained.');process.exitCode=1;});
