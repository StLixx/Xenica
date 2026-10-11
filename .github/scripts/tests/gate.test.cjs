const { test } = require('node:test');
const assert = require('node:assert/strict');
const gate = require('../gate.cjs');

async function simulate(body, checks) {
  const events = [];
  const head = 'b'.repeat(40);
  const github = {
    paginate: async method => method === 'labels'
      ? ['试样', '功能', '缺陷', '流程', '需要验收'].map(name => ({ name }))
      : method === 'checks' ? checks : [],
    graphql: async () => ({ repository: { pullRequest: { closingIssuesReferences: { nodes: [] } } } }),
    rest: {
      issues: { listLabelsForRepo: 'labels' },
      repos: { createCommitStatus: async value => events.push({ type: 'status', ...value }) },
      checks: { listForRef: 'checks' },
      pulls: {
        get: async () => ({ data: { number: 1, state: 'open', draft: false, title: 'test', head: { sha: head } } }),
        merge: async value => events.push({ type: 'merge', ...value }),
      },
      actions: { createWorkflowDispatch: async () => {} },
    },
  };
  await gate({ github, context: { repo: { owner: 'owner', repo: 'repo' }, payload: {
    issue: { number: 1 }, comment: { body, user: { login: 'owner' } },
  } }, core: { setOutput: () => {}, info: () => {} }, mode: 'approve' });
  return events;
}
const green = ['rust', 'web', 'e2e', 'docker', 'screenshots'].map((name, index) => ({
  name, id: index + 1, conclusion: 'success',
}));
test('旧提交验收不能批准新的头提交', async () => {
  const events = await simulate(`/验收 ${'a'.repeat(40)}`, green);
  assert.equal(events.some(e => e.type === 'merge'), false);
  assert.equal(events.some(e => e.type === 'status' && e.state === 'success'), false);
});
test('没有明确成果身份的旧命令不能放行', async () => {
  assert.equal((await simulate('/通过', green)).some(e => e.type === 'merge'), false);
});
test('较新的失败检查不能被历史成功覆盖', async () => {
  const checks = [{ name: 'rust', id: 100, conclusion: 'failure' }, ...green];
  assert.equal((await simulate(`/验收 ${'b'.repeat(40)}`, checks)).some(e => e.type === 'merge'), false);
});
test('对应提交验收及所有当前检查通过才执行合并', async () => {
  assert.equal((await simulate(`/验收 ${'b'.repeat(40)}`, green)).some(e => e.type === 'merge'), true);
});
