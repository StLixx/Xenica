// 从编译后的 Storybook 索引与实际主题生成；不维护第二份组件事实。
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const theme=fs.readFileSync(path.join(root,'web/src/ui/theme.css'),'utf8').replace(/\r\n/g,'\n');
const index=JSON.parse(fs.readFileSync(path.join(root,'web/storybook-static/index.json'),'utf8'));
const context=JSON.parse(fs.readFileSync(path.join(root,'docs/context/index.json'),'utf8'));
const viewIndex=fs.readFileSync(path.join(root,'web/src/views/index.ts'),'utf8');
const features=[...viewIndex.matchAll(/from '\.\/([\w-]+)'/g)].flatMap(m=>{
  const source=`web/src/views/${m[1]}/index.ts`;
  const text=fs.readFileSync(path.join(root,source),'utf8');
  const id=text.match(/id: '([^']+)'/)?.[1],title=text.match(/title: '([^']+)'/)?.[1];
  return id&&title&&/sidebar: true/.test(text)?[{id,title,source,url:`/?view=${id}`}]:[];
});
const catalog={schema:1,themeSha256:crypto.createHash('sha256').update(theme).digest('hex'),
  features,decisions:context.decisions.filter(d=>d.status==='confirmed').map(d=>({id:d.id,title:d.summary,source:'docs/context/index.json',references:d.references})),
  components:Object.values(index.entries).filter(e=>e.type==='story').map(e=>({id:e.id,title:`${e.title} / ${e.name}`,source:e.importPath?.replace(/^\.\//,'web/'),url:`/storybook/iframe.html?id=${encodeURIComponent(e.id)}&viewMode=story`})).sort((a,b)=>a.id.localeCompare(b.id)),
  tokens:[...theme.matchAll(/(--(?:x|color|text|radius|shadow|spacing|font|duration)-[\w-]+)\s*:\s*([^;]+);/g)].filter(m=>!m[2].includes('initial')).map(m=>({name:m[1],value:m[2].trim()}))};
const out=path.join(root,'web/src/api/design-catalog.json');
const text=JSON.stringify(catalog,null,2)+'\n';
if(process.argv.includes('--check')) {if(!fs.existsSync(out)||JSON.stringify(JSON.parse(fs.readFileSync(out,'utf8')))!==JSON.stringify(catalog)) throw new Error('组件或设计变量目录过期');}
else fs.writeFileSync(out,text);
