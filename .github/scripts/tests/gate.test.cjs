const { test } = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../gate.cjs');

async function simulate(body, checks, mode = 'approve', selfTest = true) {
  const events = [];
  const head = 'b'.repeat(40);
  const github = {
    paginate: async method => method === 'labels'
      ? ['试样', '功能', '缺陷', '流程', '需要验收'].map(name => ({ name }))
      : method === 'checks' ? checks : method === 'comments' && selfTest ? [{
        id: 1, user: { login: 'owner' }, body: `/自检 ${head}\n${JSON.stringify({
          schema: 1, source: head, artifact: `sha256:${'c'.repeat(64)}`, preview: 'https://pr-1.xenica.truebigsand.top',
          scope: { confirmed: true, reference: '用户确认开始' },
          scenarios: [{ name: '完整回归', result: 'passed', evidence: ['https://github.com/owner/repo/actions/runs/1'] }],
          unresolved: [],
        })}`,
      }] : [],
    graphql: async () => ({ repository: { pullRequest: { closingIssuesReferences: { nodes: [] } } } }),
    rest: {
      issues: { listLabelsForRepo: 'labels', listComments: 'comments' },
      repos: { createCommitStatus: async value => events.push({ type: 'status', ...value }) },
      checks: { listForRef: 'checks' },
      pulls: {
        listFiles: 'files',
        get: async () => ({ data: { number: 1, state: 'open', draft: false, title: 'test', labels: [], head: { sha: head, repo: { full_name: 'owner/repo' } } } }),
        merge: async value => events.push({ type: 'merge', ...value }),
      },
      actions: { createWorkflowDispatch: async () => {} },
    },
  };
  await gate({ github, context: { repo: { owner: 'owner', repo: 'repo' }, payload: {
    issue: { number: 1 }, comment: { body, user: { login: 'owner' } },
    pull_request: { number: 1, head: { sha: 'a'.repeat(40) } },
  } }, core: { setOutput: () => {}, info: () => {} }, mode,
    verify: async () => ({ ready: true, candidate: { artifact: `sha256:${'c'.repeat(64)}` }, product: `product-${'c'.repeat(64)}` }),
    archive: async () => {},
  });
  return events;
}
const green = ['rust', 'web', 'e2e', 'docker', 'screenshots', 'preview', 'delivery-history', 'pr-title'].map((name, index) => ({
  name, id: index + 1, conclusion: 'success',
}));
test('旧提交验收不能批准新的头提交', async () => {
  const events = await simulate(`/验收 ${'a'.repeat(40)} product-${'c'.repeat(64)}`, green);
  assert.equal(events.some(e => e.type === 'merge'), false);
  assert.equal(events.some(e => e.type === 'status' && e.state === 'success'), false);
});
test('没有明确成果身份的旧命令不能放行', async () => {
  assert.equal((await simulate('/通过', green)).some(e => e.type === 'merge'), false);
});

test('同一提交的其他产物体验验收不能放行', async () => {
  const events = await simulate(`/验收 ${'b'.repeat(40)} product-${'d'.repeat(64)}`, green);
  assert.equal(events.some(e => e.type === 'merge' || e.type === 'status' && e.state === 'success'), false);
});
test('较新的失败检查不能被历史成功覆盖', async () => {
  const checks = [{ name: 'rust', id: 100, conclusion: 'failure' }, ...green];
  assert.equal((await simulate(`/验收 ${'b'.repeat(40)} product-${'c'.repeat(64)}`, checks)).some(e => e.type === 'merge'), false);
});
test('对应提交验收及所有当前检查通过才执行合并', async () => {
  const provenance=JSON.stringify({type:'product-acceptance',quote:'体验通过',origin:'chat:test/message',experiencedAt:'2026-10-11T00:00:00Z'});
  assert.equal((await simulate(`/验收 ${'b'.repeat(40)} product-${'c'.repeat(64)}\n${provenance}`, green)).some(e => e.type === 'merge'), true);
});
test('旧流水线结束不能给新头提交记验收或合并', async () => {
  const events = await simulate('', green, 'ci');
  assert.equal(events.length, 0);
});

test('用户说通过也不能替代缺失的 Agent 自检', async () => {
  const events = await simulate(`/验收 ${'b'.repeat(40)} product-${'c'.repeat(64)}`, green, 'approve', false);
  assert.equal(events.some(e => e.type === 'merge' || e.type === 'status' && e.state === 'success'), false);
});

test('本地回归全绿但真实部署测试缺失仍不能交付', async () => {
  const events = await simulate(`/验收 ${'b'.repeat(40)} product-${'c'.repeat(64)}`, green.filter(c => c.name !== 'preview'));
  assert.equal(events.some(e => e.type === 'merge' || e.type === 'status' && e.state === 'success'), false);
});
