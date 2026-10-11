import { Button } from '@excalidraw/excalidraw';
import { useEffect, useState } from 'react';
import { bridgeRuntime,startVersion,useRuntime } from '../api/development';

export function RuntimeCard({version,active}:{version:string;active:boolean}) {
  const [id,setId]=useState<string|null>(null);
  const [url,setURL]=useState('');
  const [error,setError]=useState('');
  const runtime=useRuntime(id);
  const start=async()=>{setError('');setURL('');try{const r=await startVersion(version);setId(r.id);}catch(e){setError(e instanceof Error?e.message:'启动失败');}};
  useEffect(()=>{
    if(!active||id)return;
    let alive=true;
    void startVersion(version).then(r=>{if(alive)setId(r.id);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'启动失败');});
    return()=>{alive=false;};
  },[active,id,version]);
  useEffect(()=>{
    if(!active||runtime.data?.state!=='running'||url)return;
    let alive=true;
    void bridgeRuntime(runtime.data.id).then(b=>{if(alive)setURL(b.url);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'连接失败');});
    return()=>{alive=false;};
  },[active,runtime.data?.state,runtime.data?.id,url]);
  if(url && runtime.data?.state==='running') return <iframe title={`历史体验 ${version}`} src={url} className="h-full w-full border-0" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" referrerPolicy="no-referrer"/>;
  const status=runtime.data?.state;
  return <div className="p-3 text-body"><p>{error||({preparing:'正在准备历史版本…',running:'版本已准备好，操作卡片即可体验',stopping:'正在释放运行资源…',stopped:'运行资源已释放，设计与批注仍保留',failed:runtime.data?.message}[status??'']??'操作卡片即可准备历史版本')}</p>{error||status==='failed'||status==='stopped'?<Button onSelect={()=>void start()}>重新打开</Button>:null}</div>;
}
