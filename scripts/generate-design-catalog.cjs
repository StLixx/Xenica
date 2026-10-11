// 从编译后的 Storybook 索引与实际主题生成；不维护第二份组件事实。
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const theme=fs.readFileSync(path.join(root,'web/src/ui/theme.css'),'utf8').replace(/\r\n/g,'\n');
const index=JSON.parse(fs.readFileSync(path.join(root,'web/storybook-static/index.json'),'utf8'));
const catalog={schema:1,themeSha256:crypto.createHash('sha256').update(theme).digest('hex'),
  components:Object.values(index.entries).filter(e=>e.type==='story').map(e=>({id:e.id,title:`${e.title} / ${e.name}`,source:e.importPath?.replace(/^\.\//,'web/'),url:`/storybook/iframe.html?id=${encodeURIComponent(e.id)}&viewMode=story`})).sort((a,b)=>a.id.localeCompare(b.id)),
  tokens:[...theme.matchAll(/(--(?:x|color|text|radius|shadow|spacing|font|duration)-[\w-]+)\s*:\s*([^;]+);/g)].filter(m=>!m[2].includes('initial')).map(m=>({name:m[1],value:m[2].trim()}))};
const out=path.join(root,'web/src/api/design-catalog.json');
const text=JSON.stringify(catalog,null,2)+'\n';
if(process.argv.includes('--check')) {if(!fs.existsSync(out)||JSON.stringify(JSON.parse(fs.readFileSync(out,'utf8')))!==JSON.stringify(catalog)) throw new Error('组件或设计变量目录过期');}
else fs.writeFileSync(out,text);
