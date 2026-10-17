globalThis.logger ||= console;
const root = document.querySelector('#app');
let user, apiEditor, map, state, dirty = false, saving = false, blocked = false, timer, pending = 0;
let outlineOpen = false, panelOpen = false, savedSnapshot, generation = 0;
const $ = selector => document.querySelector(selector);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => '<img alt="" src="/icons/' + name + '.svg">';
const button = (name, title, action, extra='') => '<button class="icon ' + extra + '" title="' + title + '" aria-label="' + title + '" data-action="' + action + '">' + icon(name) + '</button>';
function toast(text) {
  $('.toast')?.remove();
  const element = document.createElement('div'); element.className = 'toast'; element.setAttribute('role','status');
  element.textContent = text; document.body.append(element); setTimeout(()=>element.remove(),5500);
}
async function request(path, options={}) {
  const controller = new AbortController(), timeout = setTimeout(()=>controller.abort(),20000);
  try {
    const response = await fetch(path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || '操作未完成'),{status:response.status});
    return result;
  } catch(error) {
    if(error.name === 'AbortError') throw new Error('连接超时，内容仍保留在当前页面');
    throw error;
  } finally {clearTimeout(timeout);}
}
function download(data, name, type='application/octet-stream') {
  const url = URL.createObjectURL(new Blob([data],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function status(text, error=false) {
  const el=$('.save-state');if(el){el.textContent=text;el.classList.toggle('error',error);}
}
function draftKey(){return 'xmind:draft:'+user.id+':'+map.id;}
function changed(snapshot) {
  savedSnapshot=snapshot;dirty=true;pending++;status('正在保存…');clearTimeout(timer);
  try{localStorage.setItem(draftKey(),JSON.stringify({revision:map.revision,title:map.title,snapshot}));}catch{}
  timer=setTimeout(()=>save(),650);renderOutline();
}
async function save() {
  clearTimeout(timer);
  if(!dirty || saving || blocked || !apiEditor)return;
  saving=true;const sequence=pending, currentMap=map, snapshot=savedSnapshot||apiEditor.snapshot();
  try {
    const result=await request('/api/maps/'+currentMap.id,{method:'PUT',headers:{'If-Match':String(currentMap.revision)},body:JSON.stringify({title:currentMap.title,snapshot})});
    currentMap.revision=result.revision;
    if(map!==currentMap)return;
    if(sequence===pending){dirty=false;localStorage.removeItem(draftKey());status('已保存');apiEditor.editor.markDocumentSaved();}
    else {try{localStorage.setItem(draftKey(),JSON.stringify({revision:map.revision,title:map.title,snapshot:savedSnapshot}));}catch{}}
  } catch(error) {
    if(error.status===409){blocked=true;status('版本冲突 · 请导出后重新打开',true);toast(error.message);}
    else{status('保存失败 · 点击重试',true);toast(error.message);}
  } finally {saving=false;if(dirty&&!blocked&&sequence!==pending)timer=setTimeout(save,650);}
}
async function run(name,inputValue,payload) {
  try {await apiEditor?.run(name,inputValue,payload);closeMenu();}
  catch(error){toast(error.name==='NotAllowedError'?'浏览器未允许访问剪贴板，请允许后重试':error.message);}
}
function updateState(next) {
  state=next;
  if(!$('.shell'))return;
  $('.zoom').textContent=Math.round((state.zoomScale||1)*100)+'%⌄';
  for(const node of document.querySelectorAll('[data-native]')){
    const action=state.actionStates?.[node.dataset.native];node.disabled=!!action?.disabled;
  }
  const sheets=$('.sheets');
  sheets.replaceChildren(...state.sheets.map(sheet=>{
    const b=document.createElement('button');b.className='sheet'+(sheet.id===state.activeSheetId?' active':'');
    b.textContent=sheet.title;b.onclick=()=>run('mutateEditor:switchSheet',sheet.id);return b;
  }));
  renderOutline();syncPanel();
}
function closeMenu(){ $('.popover')?.remove(); }
function menu(anchor,items){
  closeMenu();const popup=document.createElement('div');popup.className='popover';popup.setAttribute('role','menu');
  for(const item of items){
    if(!item){popup.append(document.createElement('hr'));continue;}
    const node=document.createElement('button');node.className='menu-item';node.setAttribute('role','menuitem');
    node.innerHTML='<span>'+esc(item[0])+'</span><kbd>'+esc(item[2]||'')+'</kbd>';
    node.onclick=()=>{closeMenu();Promise.resolve(item[1]()).catch(error=>toast(error.message));};popup.append(node);
  }
  document.body.append(popup);const box=anchor.getBoundingClientRect();
  popup.style.left=Math.max(12,Math.min(box.left,innerWidth-popup.offsetWidth-12))+'px';
  popup.style.top=(box.bottom+popup.offsetHeight>innerHeight?Math.max(12,box.top-popup.offsetHeight-5):box.bottom+5)+'px';
  popup.querySelector('button')?.focus();
  popup.onkeydown=event=>{
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;
    event.preventDefault();const items=[...popup.querySelectorAll('button')],current=items.indexOf(document.activeElement);
    items[(current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
  };
}
function dialog(title) {
  $('.overlay')?.remove();const overlay=document.createElement('div');overlay.className='overlay';
  const box=document.createElement('section');box.className='dialog';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<button class="close" aria-label="关闭">✕</button><h2>'+esc(title)+'</h2><div class="dialog-body"></div>';
  box.querySelector('.close').onclick=()=>overlay.remove();
  overlay.append(box);document.body.append(overlay);return box.querySelector('.dialog-body');
}
async function files(){
  await save();const body=dialog('我的导图');body.textContent='正在读取…';
  const result=await request('/api/maps');body.replaceChildren();
  const create=document.createElement('button');create.className='primary';create.textContent='＋ 新建思维导图';
  create.onclick=async()=>{await newMap();$('.overlay')?.remove();};body.append(create);
  for(const entry of result.maps){
    const row=document.createElement('div');row.className='map-row';const b=document.createElement('button');
    b.textContent=entry.title;b.onclick=async()=>{await openMap(entry.id);$('.overlay')?.remove();};
    const date=document.createElement('small');date.textContent=new Date(entry.updated*1000).toLocaleDateString();
    row.append(b,date);body.append(row);
  }
}
function rename(){
  const body=dialog('重命名导图');const form=document.createElement('form');
  form.innerHTML='<input aria-label="导图名称" maxlength="200" value="'+esc(map.title)+'"><button class="primary">保存</button>';
  form.onsubmit=event=>{event.preventDefault();map.title=form.querySelector('input').value;$('.title').textContent=map.title;changed(apiEditor.snapshot());$('.overlay').remove();};
  body.append(form);form.querySelector('input').select();
}
async function resolveConflict(){
  if(!dirty){await openMap(map.id);return;}
  const body=dialog('保留当前修改');
  body.innerHTML='<p>导出当前修改后，重新读取服务器上的最新版本。</p><button class="primary">导出当前修改并重新打开</button>';
  body.querySelector('button').onclick=async()=>{
    try{await exportMap();dirty=false;blocked=false;localStorage.removeItem(draftKey());await openMap(map.id);$('.overlay')?.remove();}
    catch(error){toast(error.message);}
  };
}
async function versions(){
  const body=dialog('历史版本');body.textContent='正在读取…';
  const result=await request('/api/maps/'+map.id+'/versions');body.replaceChildren();
  for(const version of result.versions){
    const b=document.createElement('button');b.className='menu-item';b.textContent='版本 '+version.revision+' · '+new Date(version.created*1000).toLocaleString();
    b.onclick=async()=>{
      const old=await request('/api/maps/'+map.id+'/versions/'+version.revision);
      await createFromSnapshot(map.title+' · 版本 '+version.revision,old.snapshot);
      $('.overlay')?.remove();toast('已将历史版本另存为导图');
    };body.append(b);
  }
}
function renderOutline(){
  const el=$('.outline');if(!el||!apiEditor)return;el.replaceChildren();
  const sheet=apiEditor.snapshot().native.content.find(s=>s.id===state?.activeSheetId);
  function walk(topic,depth){
    const b=document.createElement('button');b.textContent=topic.title||'空白主题';b.style.paddingLeft=(8+depth*16)+'px';b.onclick=()=>apiEditor.select([topic.id]);el.append(b);
    for(const child of topic.children?.attached||[])walk(child,depth+1);
  }
  if(sheet)walk(sheet.rootTopic,0);
}
function toggleOutline(){
  outlineOpen=!outlineOpen;
  if(outlineOpen){const node=document.createElement('aside');node.className='outline';node.setAttribute('aria-label','大纲');$('.workspace').prepend(node);renderOutline();}
  else $('.outline')?.remove();
}
function syncPanel(){
  if(!$('.panel')||!apiEditor)return;
  const properties=apiEditor.editor.syncedProperties.value || {};
  const size=$('#font-size'), color=$('#text-color');
  if(size&&document.activeElement!==size){
    const property=properties.topicFontSize;
    size.disabled=!property||!!state?.actionStates?.['mutateProperty:topicFontSize']?.disabled;
    const value=property?.values?.length>1?'':String(property?.value??'');
    if(value&&!Array.from(size.options).some(o=>o.value===value))size.add(new Option(value,value));
    size.value=value;
  }
  if(color&&document.activeElement!==color){
    const property=properties.topicTextColorString;color.disabled=!property||!!state?.actionStates?.['mutateProperty:topicTextColorString']?.disabled;
    if(/^#[0-9a-f]{6}/i.test(property?.value||''))color.value=property.value.slice(0,7);
  }
}
function togglePanel(){
  panelOpen=!panelOpen;if(!panelOpen){$('.panel')?.remove();return;}
  const panel=document.createElement('aside');panel.className='panel';panel.setAttribute('aria-label','样式面板');
  panel.innerHTML='<div class="panel-tabs"><button class="active">样式</button></div><section class="panel-section"><h4>文字</h4><div class="row"><label for="font-size">字号</label><select id="font-size"><option value="">多种</option>'+[12,14,16,18,20,24,28,32,36,48].map(n=>'<option'+(n===16?' selected':'')+'>'+n+'</option>').join('')+'</select></div><div class="row"><button class="primary" data-style="mutate:setFontBold"><b>B</b></button><button class="primary" data-style="mutate:setFontItalic"><i>I</i></button></div><div class="row"><label for="text-color">文字颜色</label><input id="text-color" type="color" value="#333333"></div></section><section class="panel-section"><h4>主题填充</h4><div class="swatches">'+['#ffffff','#f5b4ad','#ffe79c','#c5e9ba','#abdcf7','#d9c3ef'].map(c=>'<button class="swatch" aria-label="填充 '+c+'" style="--swatch:'+c+'" data-color="'+c+'"></button>').join('')+'</div></section><section class="panel-section"><h4>分支</h4><button class="menu-item" data-style="mutate:toggleBranchFoldedState">展开 / 折叠</button><button class="menu-item" data-style="mutate:foldAllDescendantBranches">折叠所有子分支</button><button class="menu-item" data-style="mutate:unfoldAllDescendantBranches">展开所有子分支</button></section>';
  $('.workspace').append(panel);
  panel.querySelector('#font-size').onchange=e=>run('mutateProperty:topicFontSize',+e.target.value);
  panel.querySelector('#text-color').onchange=e=>run('mutateProperty:topicTextColorString',e.target.value);
  for(const b of panel.querySelectorAll('[data-color]'))b.onclick=()=>run('mutateProperty:topicFillColorString',b.dataset.color);
  for(const b of panel.querySelectorAll('[data-style]'))b.onclick=()=>run(b.dataset.style);
  syncPanel();
}
async function exportMap(){
  download(await apiEditor.exportFile(),map.title.replace(/[\\/:*?"<>|]/g,'_')+'.xmind');
}
async function chooseFile(image=false){
  const input=document.createElement('input');input.type='file';input.accept=image?'image/*':'.xmind';input.style.display='none';document.body.append(input);
  input.onchange=async()=>{
    try{
      const file=input.files[0];if(!file)return;
      if(file.size>(image?12:32)*1024*1024)throw new Error(image?'图片请小于 12 MB':'文件请小于 32 MB');
      if(image)await apiEditor.addImage(file);
      else {
        await save();if(dirty)throw new Error('请先保存或导出当前导图');
        await newMap(file.name.replace(/\.xmind$/i,''));
        await apiEditor.importFile(await file.arrayBuffer());await save();toast('导入完成');
      }
    }catch(error){toast(error.message);}finally{input.remove();}
  };input.click();
}
function buildShell(){
  root.innerHTML='<div class="shell"><header class="topbar"><button class="logo" aria-label="文件菜单"><b style="color:#ea5b4f;font-size:20px">X</b><span>XMind</span>'+icon('chevron-downward')+'</button><div class="title-group"><button class="title">'+esc(map.title)+'</button><button class="save-state" title="点击重试保存">已保存</button></div><div class="tools">'+button('add-topic','主题 · Enter','mutate:insertTopicAfter')+button('add-subtopic','子主题 · Tab','mutate:insertSubtopicWithTask')+'<i class="divider"></i>'+button('relationship','关系线','mutate:createRelationship')+button('summary','概要','mutate:insertSummary')+button('boundary','外框','mutate:insertBoundary')+'<i class="divider"></i>'+button('add','插入','insert')+'</div><div class="rightbar">'+button('hamburger-list','大纲','outline','desktop')+button('panel-right','样式','panel')+'<span class="avatar" title="'+esc(user.name)+'">'+esc(user.name[0].toUpperCase())+'</span><button class="primary export-button">导出</button></div></header><div class="workspace"><div class="canvas-wrap"><div class="stage"></div><div class="mobile-tools">'+button('add-topic','新增主题','mutate:insertTopicAfter')+button('add-subtopic','新增子主题','mutate:insertSubtopicWithTask')+'</div></div></div><footer class="bottombar"><button class="icon new-sheet" title="添加画布" aria-label="添加画布">＋</button><div class="sheets"></div><button class="zoom" aria-label="缩放">100%⌄</button><button class="outline-toggle">大纲</button></footer></div>';
  for(const b of document.querySelectorAll('[data-action]')){
    const name=b.dataset.action;if(name.startsWith('mutate:'))b.dataset.native=name;
    b.onpointerdown=e=>e.preventDefault();
    b.onclick=()=>name==='outline'?toggleOutline():name==='panel'?togglePanel():name==='insert'?menu(b,[
      ['图片…',()=>chooseFile(true)],['关系线',()=>run('mutate:createRelationship')],['概要',()=>run('mutate:insertSummary')],['外框',()=>run('mutate:insertBoundary')],['标注',()=>run('mutate:insertCallout')],['浮动主题',()=>run('mutate:insertFloatingTopic')]
    ]):run(name);
  }
  $('.logo').onclick=e=>menu(e.currentTarget,[
    ['我的导图',files],['新建思维导图',()=>newMap(),'Ctrl N'],['重命名',rename],null,
    ['导入 XMind 文件…',()=>chooseFile()],['导出 XMind 文件',exportMap,'Ctrl Shift S'],
    ['历史版本',versions],['保存',save,'Ctrl S'],['读取服务器最新版本',resolveConflict],null,
    ['撤销',()=>run('undo'),'Ctrl Z'],['重做',()=>run('redo'),'Ctrl Shift Z'],['复制',()=>run('copy'),'Ctrl C'],['剪切',()=>run('cut'),'Ctrl X'],['粘贴',()=>run('paste'),'Ctrl V'],null,
    ['退出登录',async()=>{await save();if(dirty)throw new Error('当前内容尚未保存，请先导出');await request('/api/logout',{method:'POST',body:'{}'});location.reload();}]
  ]);
  $('.title').onclick=rename;$('.save-state').onclick=()=>{if(blocked)toast('请先导出当前导图，再从文件菜单重新打开，以保留双方修改');else save();};
  $('.export-button').onclick=()=>exportMap().catch(e=>toast(e.message));$('.outline-toggle').onclick=toggleOutline;
  $('.new-sheet').onclick=()=>run('mutateEditor:newSheet');
  $('.zoom').onclick=e=>menu(e.currentTarget,[['放大',()=>run('mutateEditor:zoomIn'),'+'],['缩小',()=>run('mutateEditor:zoomOut'),'-'],['100%',()=>run('mutateEditor:resetZoom')],['适应画布',()=>run('mutateEditor:fitMap')]]);
}
async function createFromSnapshot(title,snapshot){
  await save();if(dirty)throw new Error('请先保存或导出当前导图');
  const entry=await request('/api/maps',{method:'POST',body:JSON.stringify({title,snapshot})});await openMap(entry.id);
}
async function newMap(title='思维导图'){
  const {createBlankSnapshot}=await import('/native.js');
  await createFromSnapshot(title,await createBlankSnapshot(title));
}
async function openMap(id){
  await save();
  if(dirty && !blocked)throw new Error('请先保存或导出当前导图');
  if(dirty && blocked){toast('冲突修改仍在当前页面，请先导出后再重新打开');return;}
  const entry=await request('/api/maps/'+id);
  generation++;apiEditor?.dispose();apiEditor=null;map=entry;dirty=false;blocked=false;pending=0;savedSnapshot=null;outlineOpen=false;panelOpen=false;
  buildShell();status('正在打开…');history.replaceState(null,'','#'+id);
  const mine=generation;
  const {openNative}=await import('/native.js');
  const created=await openNative({container:$('.stage'),snapshot:entry.snapshot,id:entry.id,onChange:snapshot=>{if(mine===generation)changed(snapshot);},onState:next=>{if(mine===generation)updateState(next);}});
  if(mine!==generation){created.dispose();return;}apiEditor=created;status('已保存');updateState(state);
  try{
    const draft=JSON.parse(localStorage.getItem(draftKey())||'null');
    if(draft){const body=dialog('发现未保存的草稿');body.innerHTML='<p>上次修改尚未保存到服务器，可另存为一张导图。</p><button class="primary">恢复草稿副本</button><button class="menu-item">保留服务器版本</button>';
      body.children[1].onclick=async()=>{localStorage.removeItem(draftKey());await createFromSnapshot(draft.title+' · 恢复',draft.snapshot);$('.overlay')?.remove();};
      body.children[2].onclick=()=>{localStorage.removeItem(draftKey());$('.overlay').remove();};}
  }catch{}
}
function login(){
  root.innerHTML='<div class="login"><form class="login-card"><h1>XMind</h1><p>打开你的思维导图</p><label>用户名<input name="name" autocomplete="username" value="test" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">登录</button><div class="login-error" role="alert"></div></form></div>';
  $('.login-card').onsubmit=async e=>{
    e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;
    try{await request('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});await boot();}
    catch(error){$('.login-error').textContent=error.message;}finally{button.disabled=false;}
  };
}
async function boot(){
  ({user}=await request('/api/session'));if(!user){login();return;}
  if(!$('#native-font')){const css=document.createElement('link');css.id='native-font';css.rel='stylesheet';css.href='/vendor-gantt.ZktEL8qG.css';document.head.append(css);}
  const {maps}=await request('/api/maps');const id=location.hash.slice(1);
  if(maps.some(m=>m.id===id))await openMap(id);else if(maps.length)await openMap(maps[0].id);else await newMap();
}
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.popover')&&!event.target.closest('.logo')&&!event.target.closest('[data-action="insert"]')&&!event.target.closest('.zoom'))closeMenu();});
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeMenu();$('.overlay')?.remove();return;}
  if(event.isComposing||!apiEditor)return;
  const shortcut=event.ctrlKey||event.metaKey;
  if(shortcut&&event.key.toLowerCase()==='s'){event.preventDefault();event.shiftKey?exportMap().catch(e=>toast(e.message)):save();return;}
  if(event.target.closest('input,textarea,.overlay')||apiEditor.editor.isEditingTitle.value)return;
  if($('.popover')&&!shortcut)return;
  if(!event.target.closest('.stage')&&!shortcut)return;
  let action;
  if(shortcut&&event.key.toLowerCase()==='n'){event.preventDefault();newMap().catch(e=>toast(e.message));return;}
  if(shortcut){action=({z:event.shiftKey?'redo':'undo',y:'redo',c:'copy',x:'cut',v:'paste',a:'mutate:selectAll'})[event.key.toLowerCase()];}
  else if(event.key===' '&&!event.altKey&&!event.shiftKey){
    event.preventDefault();event.stopPropagation();
    apiEditor.startEditingTitle().catch(error=>toast(error.message));return;
  }
  else action=({Tab:'mutate:insertSubtopicWithTask',Enter:event.shiftKey?'mutate:insertTopicBefore':'mutate:insertTopicAfter',Delete:'mutate:delete',Backspace:'mutate:delete',F2:'mutate:startEditingTopic'})[event.key];
  if(action){event.preventDefault();event.stopPropagation();run(action);}
},true);
addEventListener('beforeunload',event=>{if(dirty||saving){event.preventDefault();event.returnValue='';}});
addEventListener('online',()=>save());
boot().catch(error=>{console.error(error);root.innerHTML='<div class="login"><section class="login-card"><h1>暂时无法打开</h1><p>'+esc(error.message)+'</p><button class="reconnect">重新连接</button></section></div>';$('.reconnect').onclick=()=>location.reload();});
