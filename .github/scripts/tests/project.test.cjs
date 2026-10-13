const {test}=require('node:test');const assert=require('node:assert/strict');const project=require('../project.cjs');
function fixture({draft=false,tag='a'.repeat(40)}={}){
  const mutations=[];const github={rest:{repos:{getReleaseByTag:async()=>({data:{draft,immutable:true}})},git:{getRef:async()=>({data:{object:{sha:tag}}})},issues:{listMilestones:'milestones',listForRepo:'issues'}},paginate:async method=>method==='milestones'?[{title:'v0.2.5',number:1}]:[{node_id:'issue'}],graphql:async query=>{
    if(query.startsWith('query'))return {user:{id:'owner',projectsV2:{nodes:[{id:'project',title:'Xenica',fields:{nodes:[{id:'stage',name:'阶段',options:[]}]}}]}},repository:{id:'repo'}};
    mutations.push(query);
    if(query.includes('createProjectV2Field'))return {createProjectV2Field:{projectV2Field:{id:'field',options:[{id:'published',name:'已发布'}]}}};
    if(query.includes('addProjectV2ItemById'))return {addProjectV2ItemById:{item:{id:'item'}}};
    return {};
  }};return {mutations,args:{github,core:{info:()=>{}},owner:'owner',repo:'repo',version:'v0.2.5',commit:'a'.repeat(40)}};
}
test('任务合并字段保留，体验版本和发布状态从真实不可变 Release 单独投影',async()=>{
  const f=fixture();await project.release(f.args);assert.equal(f.mutations.filter(x=>x.includes('createProjectV2Field')).length,2);assert.equal(f.mutations.filter(x=>x.includes('updateProjectV2ItemFieldValue')).length,2);
});
test('草稿或错误 Tag 不能把看板标为已发布',async()=>{
  for(const options of [{draft:true},{tag:'b'.repeat(40)}]){const f=fixture(options);await assert.rejects(()=>project.release(f.args));assert.equal(f.mutations.length,0);}
});
