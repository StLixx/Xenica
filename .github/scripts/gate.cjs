// 验收门：决定一个 PR 是自动合并，还是等你验收。规则见 docs/adr/0006-workflow.md。
//   mode = 'ci'      CI 全绿后由 ci.yml 调用
//   mode = 'approve' 你在 PR 里评论 /通过 时由 approve.yml 调用
// 「验收」这个 commit status 就是验收记录：它挂在具体的 commit 上，PR 有新提交就要重新验收。

const STATUS = '验收';
const REQUIRED_CHECKS = require('./candidate.cjs').REQUIRED;
const DOMAIN = 'xenica.truebigsand.top';
const { latestChecks } = require('./candidate.cjs');
const { readReport } = require('./readiness.cjs');
const verifyDelivery = require('./verify-delivery.cjs');

// 撤不回、或会改变规则本身的改动，永远要你验收。
const SENSITIVE = [
  // 界面改动一律在整体预览里看过再合并（测试和 story 本身除外，story 的变化由截图对比管）
  [/^web\/src\/(?!api\/)(?!.*\.(test|stories)\.tsx?$)/, '界面'],
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
  const latest = latestChecks(runs);
  return REQUIRED_CHECKS.every((name) => latest.get(name)?.conclusion === 'success');
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
    `（最近更新的 PR 同时在固定网址 https://preview.${DOMAIN}）`,
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
    lines.push('执行 Agent 会在对话里把要看的地方告诉你；你确认体验后，它记录已体验的成果身份。无需你打开 GitHub 或再次确认。');
  } else {
    lines.push('无需验收，CI 全绿后自动合并。');
  }
  return lines.join('\n');
}

async function merge({ github, owner, repo, pr }) {
  // 严格主线检查仍由平台执行；再次读取不作为原子锁。
  const fresh = (await github.rest.pulls.get({ owner, repo, pull_number: pr.number })).data;
  if (fresh.head.sha !== pr.head.sha || (pr.base && fresh.base?.sha !== pr.base.sha)) {
    throw new Error('合并前成果或主线已更新，需要重新检查');
  }
  if (!require('./check-pr-title.cjs').validateTitle(fresh.title)) {
    throw new Error('合并前 PR 标题不符合提交规范');
  }
  await github.rest.pulls.merge({
    owner,
    repo,
    pull_number: pr.number,
    sha: pr.head.sha,
    merge_method: 'squash',
    commit_title: `${fresh.title} (#${pr.number})`,
  });
  // 用 GITHUB_TOKEN 合并不会触发 push，所以手动触发 master 校验；正式推广由 release.yml 单独执行。
  await github.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: 'ci.yml', ref: 'master' });
}

/** 返回 { stage, issues }，给 project.cjs 更新看板。 */
module.exports = async function gate({ github, context, core, mode, changed = [], verify = verifyDelivery, archive = require('./journal.cjs') }) {
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

  if (mode === 'ci' && context.payload.pull_request.head.sha !== sha) {
    core.info('流水线对应的头提交已过时，不记录验收或尝试合并。');
    return result('进行中');
  }

  const why = await reasons({ github, owner, repo, pr, changed });
  const checksReady = await ciPassed(ctx);
  const selfTest = readReport(await github.paginate(github.rest.issues.listComments, {
    owner, repo, issue_number: number,
  }), { owner, sha, preview: `https://pr-${number}.${DOMAIN}`, interactive: why.length > 0 });
  if (!checksReady || !selfTest.ready) {
    const reason = !checksReady ? '当前工程或真实预览测试未全部通过' : selfTest.reason;
    core.info(reason);
    await setStatus(ctx, 'pending', `Agent 自检未完成：${reason}`);
    return result('进行中');
  }
  let delivery;
  try {
    delivery = await verify({ github, owner, repo, pr });
  } catch {
    delivery = { ready: false, reasons: ['候选或部署证据无法核验'] };
  }
  if (!delivery.ready) {
    await setStatus(ctx, 'pending', `交付核验未完成：${delivery.reasons.join('；')}`);
    return result('进行中');
  }

  if (selfTest.report.artifact !== delivery.candidate.artifact) {
    await setStatus(ctx, 'pending', 'Agent 实测对应其他构建产物');
    return result('进行中');
  }

  if (mode === 'approve') {
    await archive({github,owner,repo,record:{schema:1,type:'engineering',candidate:delivery.candidate,checks:delivery.checks,deployed:delivery.deployed,selfTest:selfTest.report,comment:selfTest.comment}});
    // 由 Agent 根据用户实际体验的成果代写；普通命令不能推断验收了当前新提交。
    const accepted = require('./acceptance.cjs').parse(context.payload.comment,{owner,source:sha,product:delivery.product});
    if (!accepted) {
      core.info('未提供对应成果身份或成果已更新，保留未验收状态。');
      return result('待验收');
    }
    await archive({github,owner,repo,record:{schema:1,type:'acceptance',candidate:delivery.candidate,product:delivery.product,evidence:accepted}});
    await setStatus(ctx, 'success', `已验收 ${delivery.product}`);
    if (pr.draft || !(await ciPassed(ctx))) {
      core.info('当前必需检查还没全绿或仍是草稿，保持未合并。');
      return result('待验收');
    }
    await merge({ github, owner, repo, pr });
    return result('完成');
  }

  const approved = Boolean(await require('./read-acceptance.cjs')({github,owner,repo,source:sha,product:delivery.product}));
  await archive({github,owner,repo,record:{schema:1,type:'engineering',candidate:delivery.candidate,checks:delivery.checks,deployed:delivery.deployed,selfTest:selfTest.report,comment:selfTest.comment}});
  await comment({ github, owner, repo, pr, body: previewBody({ pr, changed, why, sha }) });

  if (why.length && !approved) {
    await setStatus(ctx, 'pending', `等你验收：${why.join('；')}`);
    return result('待验收');
  }
  if (!approved) {
    await archive({github,owner,repo,record:{schema:1,type:'acceptance',candidate:delivery.candidate,product:delivery.product,evidence:{type:'engineering-only',interactive:false}}});
    await setStatus(ctx, 'success', '无需验收');
  }
  if (pr.draft) {
    core.info('草稿 PR 不合并；标记为 Ready for review 后自动合并。');
    return result('进行中');
  }
  if (!(await ciPassed(ctx))) {
    core.info('当前必需检查未全绿，不能自动合并。');
    return result('进行中');
  }
  await merge({ github, owner, repo, pr });
  return result('完成');
};
