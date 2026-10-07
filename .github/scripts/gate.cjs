// 验收门：决定一个 PR 是自动合并，还是等你验收。规则见 docs/adr/0006-workflow.md。
//   mode = 'ci'      CI 全绿后由 ci.yml 调用
//   mode = 'approve' 你在 PR 里评论 /通过 时由 approve.yml 调用
// 「验收」这个 commit status 就是验收记录：它挂在具体的 commit 上，PR 有新提交就要重新验收。

const STATUS = '验收';
const REQUIRED_CHECKS = ['rust', 'web', 'e2e', 'docker', 'screenshots'];
const DOMAIN = 'xenica.truebigsand.top';

// 撤不回、或会改变规则本身的改动，永远要你验收。
const SENSITIVE = [
  [/^\.github\//, 'CI 与流程'],
  [/^deploy\//, '部署'],
  [/^scripts\//, '仓库脚本'],
  [/^(AGENTS|CLAUDE)\.md$/, 'Agent 规则'],
];
const DESTRUCTIVE_SQL = /\b(drop|truncate|rename|delete\s+from|alter\s+column[^;]*\btype)\b/i;

const LABELS = [
  ['试样', 'd4c5f9', '做几个方案，你挑一个'],
  ['功能', '0e8a16', '新功能'],
  ['缺陷', 'd73a4a', '有问题，先复现再修'],
  ['流程', 'c5def5', '改开发流程本身'],
  ['需要验收', 'fbca04', '强制人工验收'],
];

async function ensureLabels({ github, owner, repo }) {
  const have = new Set(
    (await github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo })).map((l) => l.name),
  );
  for (const [name, color, description] of LABELS) {
    if (!have.has(name)) await github.rest.issues.createLabel({ owner, repo, name, color, description });
  }
}

/** 需要你验收的理由；空数组 = 可以自动合并。 */
async function reasons({ github, owner, repo, pr, changed }) {
  const out = [];
  if (pr.head.repo.full_name !== `${owner}/${repo}`) out.push('来自 fork');
  if (changed.length) out.push(`截图有变化（${changed.length} 个）`);
  if (pr.labels.some((l) => l.name === '需要验收')) out.push('标了「需要验收」');
  const files = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number: pr.number });
  const touched = new Set();
  for (const f of files) {
    for (const [re, what] of SENSITIVE) if (re.test(f.filename)) touched.add(what);
    if (f.filename.startsWith('crates/store/migrations/')) {
      if (f.status !== 'added') touched.add('改了已有迁移');
      else if (DESTRUCTIVE_SQL.test(f.patch ?? '')) touched.add('破坏性的表结构变更');
    }
  }
  if (touched.size) out.push(`涉及${[...touched].join('、')}`);
  return out;
}

async function status({ github, owner, repo, sha }) {
  const all = await github.paginate(github.rest.repos.listCommitStatusesForRef, { owner, repo, ref: sha });
  return all.find((s) => s.context === STATUS); // 最新的在前
}

async function setStatus({ github, owner, repo, sha }, state, description) {
  await github.rest.repos.createCommitStatus({
    owner,
    repo,
    sha,
    state,
    context: STATUS,
    description: description.slice(0, 140),
  });
}

async function ciPassed({ github, owner, repo, sha }) {
  const runs = await github.paginate(github.rest.checks.listForRef, { owner, repo, ref: sha });
  return REQUIRED_CHECKS.every((name) => runs.some((r) => r.name === name && r.conclusion === 'success'));
}

async function linkedIssues({ github, owner, repo, number }) {
  const q = `query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){
    pullRequest(number:$n){closingIssuesReferences(first:10){nodes{id number}}}}}`;
  const r = await github.graphql(q, { owner, repo, n: number });
  return r.repository.pullRequest.closingIssuesReferences.nodes;
}

async function comment({ github, owner, repo, pr, body }) {
  const marker = '<!-- xenica-gate -->';
  const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: pr.number });
  const mine = comments.find((c) => c.body?.includes(marker));
  const full = `${marker}\n${body}`;
  if (mine) await github.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body: full });
  else await github.rest.issues.createComment({ owner, repo, issue_number: pr.number, body: full });
}

function previewBody({ pr, changed, why, sha }) {
  const host = `https://pr-${pr.number}.${DOMAIN}`;
  const lines = [
    `**预览**：${host} · [组件](${host}/storybook/) · commit \`${sha.slice(0, 7)}\``,
    '（部署器约 2 分钟内上线；页面底部显示的 commit 和这里一致就是最新的）',
    '',
  ];
  if (why.length) {
    lines.push(`**需要你验收**：${why.join('；')}`, '');
    if (changed.length) {
      lines.push('有变化的组件：');
      for (const id of changed.slice(0, 20)) lines.push(`- [${id}](${host}/storybook/?path=/story/${id})`);
      if (changed.length > 20) lines.push(`- ……共 ${changed.length} 个`);
      lines.push('');
    }
    lines.push('确认没问题就评论 `/通过`；有问题直接写在评论里，执行 Agent 照着改。');
  } else {
    lines.push('无需验收，CI 全绿后自动合并。');
  }
  return lines.join('\n');
}

async function merge({ github, owner, repo, pr }) {
  await github.rest.pulls.merge({
    owner,
    repo,
    pull_number: pr.number,
    sha: pr.head.sha,
    merge_method: 'squash',
    commit_title: `${pr.title} (#${pr.number})`,
  });
  // 用 GITHUB_TOKEN 合并不会触发 push 事件，所以手动触发 master 的 CI（构建 latest 镜像，部署器随后上线）。
  await github.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: 'ci.yml', ref: 'master' });
}

/** 返回 { stage, issues }，给 project.cjs 更新看板。 */
module.exports = async function gate({ github, context, core, mode, changed = [] }) {
  const { owner, repo } = context.repo;
  const number = context.payload.pull_request?.number ?? context.payload.issue.number;
  const pr = (await github.rest.pulls.get({ owner, repo, pull_number: number })).data;
  const sha = pr.head.sha;
  const ctx = { github, owner, repo, sha };
  await ensureLabels(ctx);
  const issues = await linkedIssues({ github, owner, repo, number });
  const result = (stage) => {
    core.setOutput('stage', stage);
    core.setOutput('issues', JSON.stringify(issues.map((i) => i.id)));
    return { stage, issues };
  };

  if (pr.state !== 'open') return result('完成');

  if (mode === 'approve') {
    await setStatus(ctx, 'success', '已验收（/通过）');
    if (pr.draft || !(await ciPassed(ctx))) {
      core.info('CI 还没全绿或仍是草稿，CI 结束时会自动合并。');
      return result('待验收');
    }
    await merge({ github, owner, repo, pr });
    return result('完成');
  }

  const why = await reasons({ github, owner, repo, pr, changed });
  const approved = (await status(ctx))?.description?.startsWith('已验收');
  await comment({ github, owner, repo, pr, body: previewBody({ pr, changed, why, sha }) });

  if (why.length && !approved) {
    await setStatus(ctx, 'pending', `等你验收：${why.join('；')}`);
    return result('待验收');
  }
  if (!approved) await setStatus(ctx, 'success', '无需验收');
  if (pr.draft) {
    core.info('草稿 PR 不合并；标记为 Ready for review 后自动合并。');
    return result('进行中');
  }
  await merge({ github, owner, repo, pr });
  return result('完成');
};
