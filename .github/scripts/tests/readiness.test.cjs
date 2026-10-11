const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readReport } = require('../readiness.cjs');
const sha = 'a'.repeat(40);
const preview = 'https://pr-55.xenica.truebigsand.top';
const args = { owner: 'owner', sha, preview, interactive: true };
const report = {
  schema: 1, source: sha, preview, scope: { confirmed: true, reference: '对话确认开始' },
  scenarios: [{ name: '刷新后仍存在', result: 'passed', evidence: ['https://github.com/test/actions/runs/1'] }],
  visual: { result: 'passed', evidence: ['https://github.com/test/actions/runs/1/artifacts/1'] }, unresolved: [],
};
const comment = (value = report, id = 1, login = 'owner') => ({
  id, user: { login }, body: `/自检 ${sha}\n${JSON.stringify(value)}`,
});

test('范围确认、场景通过、视觉证据齐全才可交付', () => {
  assert.equal(readReport([comment()], args).ready, true);
});
test('缺失、过时、非可信身份、坏 JSON 一律拒绝', () => {
  for (const comments of [[], [comment(report, 1, 'other')],
    [{ ...comment(), body: '/自检 bad\n{}' }], [{ ...comment(), body: `/自检 ${sha}\nnot-json` }]]) {
    assert.equal(readReport(comments, args).ready, false);
  }
});
test('失败、待解决、空场景、无证据、无视觉检查不能交给用户排错', () => {
  for (const change of [{ scope: { confirmed: false } }, { scenarios: [] },
    { unresolved: ['保存丢失'] }, { visual: null },
    { scenarios: [{ ...report.scenarios[0], result: 'failed' }] },
    { scenarios: [{ ...report.scenarios[0], evidence: [] }] }]) {
    assert.equal(readReport([comment({ ...report, ...change })], args).ready, false);
  }
});
test('新失败声明不能被旧成功声明掩盖', () => {
  assert.equal(readReport([comment(), comment({ ...report, unresolved: ['新失败'] }, 2)], args).ready, false);
});
test('非交互成果免视觉体验，但仍需要自检场景', () => {
  assert.equal(readReport([comment({ ...report, visual: null })], { ...args, interactive: false }).ready, true);
});
