// 把 Issue 放进 GitHub Projects「Xenica」并设置「阶段」。看板不存在就自动创建。
// 需要 secrets.PROJECT_TOKEN（有 Projects 读写权限）；GITHUB_TOKEN 访问不了个人账号下的 Projects。

const TITLE = 'Xenica';
const FIELD = '阶段';
const STAGES = [
  ['收件', 'GRAY', '刚提的，可能很粗糙'],
  ['待澄清', 'YELLOW', '缺信息，已在 Issue 里追问'],
  ['规格待确认', 'ORANGE', '中/大规模：规格 PR 等你点头'],
  ['就绪', 'BLUE', '意图和验收标准都清楚了'],
  ['进行中', 'PURPLE', '有关联的 PR'],
  ['待验收', 'PINK', '预览已上线，等你看'],
  ['完成', 'GREEN', '已合并'],
];

async function ensureProject(github, owner, repo) {
  const q = `query($login:String!,$repo:String!){
    user(login:$login){ id projectsV2(first:50){ nodes{ id title fields(first:50){ nodes{
      ... on ProjectV2SingleSelectField { id name options { id name } } } } } } }
    repository(owner:$login,name:$repo){ id } }`;
  const r = await github.graphql(q, { login: owner, repo });
  let project = r.user.projectsV2.nodes.find((p) => p.title === TITLE);
  if (!project) {
    const c = await github.graphql(
      `mutation($owner:ID!,$title:String!,$repo:ID!){ createProjectV2(input:{ownerId:$owner,title:$title,repositoryId:$repo}){ projectV2{ id } } }`,
      { owner: r.user.id, title: TITLE, repo: r.repository.id },
    );
    project = { id: c.createProjectV2.projectV2.id, fields: { nodes: [] } };
  }
  let field = project.fields.nodes.find((f) => f?.name === FIELD);
  if (!field) {
    const c = await github.graphql(
      `mutation($p:ID!,$name:String!,$opts:[ProjectV2SingleSelectFieldOptionInput!]){
        createProjectV2Field(input:{projectId:$p,dataType:SINGLE_SELECT,name:$name,singleSelectOptions:$opts}){
          projectV2Field{ ... on ProjectV2SingleSelectField { id options { id name } } } } }`,
      { p: project.id, name: FIELD, opts: STAGES.map(([name, color, description]) => ({ name, color, description })) },
    );
    field = c.createProjectV2Field.projectV2Field;
  }
  return { projectId: project.id, field };
}

/** contentIds：Issue 或 PR 的 node id。 */
module.exports = async function project({ github, core, owner, repo, contentIds, stage }) {
  if (!contentIds.length || !stage) return;
  const { projectId, field } = await ensureProject(github, owner, repo);
  const option = field.options.find((o) => o.name === stage);
  if (!option) throw new Error(`「${FIELD}」没有选项「${stage}」`);
  for (const contentId of contentIds) {
    const a = await github.graphql(
      `mutation($p:ID!,$c:ID!){ addProjectV2ItemById(input:{projectId:$p,contentId:$c}){ item{ id } } }`,
      { p: projectId, c: contentId },
    );
    await github.graphql(
      `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){ updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){ projectV2Item{ id } } }`,
      { p: projectId, i: a.addProjectV2ItemById.item.id, f: field.id, o: option.id },
    );
    core.info(`${contentId} → ${stage}`);
  }
};
