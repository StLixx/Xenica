const { test } = require('node:test');
const assert = require('node:assert/strict');
const { candidateId, productId, evaluate, latestChecks } = require('../candidate.cjs');

const candidate = {
  schema: 1,
  source: 'a'.repeat(40),
  base: 'b'.repeat(40),
  artifact: `sha256:${'c'.repeat(64)}`,
  preview: 'https://pr-55.xenica.truebigsand.top',
  policy: 'd'.repeat(64),
  run: 100,
  attempt: 2,
};
const current = { source: candidate.source, base: candidate.base, policy: candidate.policy };
const checks = ['rust', 'web', 'e2e', 'docker', 'screenshots', 'preview'].map((name, i) => ({
  name, id: i + 1, conclusion: 'success', run: 100, attempt: 2,
}));
const evidence = { checks, deployed: { source: candidate.source, artifact: candidate.artifact } };
const acceptance = { candidate: productId(candidate), actor: 'owner', outcome: 'accepted' };

test('候选身份包括运行产物、主线、规则和检查尝试', () => {
  for (const [key, value] of Object.entries({
    artifact: `sha256:${'e'.repeat(64)}`, base: 'e'.repeat(40), policy: 'e'.repeat(64), attempt: 3,
  })) assert.notEqual(candidateId({ ...candidate, [key]: value }), candidateId(candidate));
  assert.equal(candidateId({ ...candidate }), candidateId(candidate));
});

test('相同产品重跑工程检查保留体验身份，产物变化使体验过时', () => {
  assert.equal(productId({ ...candidate, run: 200, attempt: 3, base: 'e'.repeat(40), policy: 'f'.repeat(64) }), productId(candidate));
  assert.notEqual(productId({ ...candidate, artifact: `sha256:${'e'.repeat(64)}` }), productId(candidate));
});
test('同名检查的新失败不能由旧成功掩盖', () => {
  assert.equal(latestChecks([
    { name: 'rust', id: 2, conclusion: 'failure' },
    { name: 'rust', id: 1, conclusion: 'success' },
  ]).get('rust').conclusion, 'failure');
});
test('完全匹配且通过的候选才能放行', () => {
  assert.deepEqual(evaluate({ candidate, current, evidence, acceptance, interactive: true }).reasons, []);
});
test('旧人工验收、主线变化、规则变化、未部署和缺失证据均阻止', () => {
  const base = { candidate, current, evidence, acceptance, interactive: true };
  for (const changes of [
    { acceptance: { ...acceptance, candidate: 'old' } },
    { current: { ...current, base: 'e'.repeat(40) } },
    { current: { ...current, policy: 'e'.repeat(64) } },
    { evidence: { ...evidence, deployed: null } },
    { evidence: { ...evidence, checks: checks.slice(1) } },
    { acceptance: null },
  ]) assert.equal(evaluate({ ...base, ...changes }).mergeable, false);
});
test('其他运行及重跑的证据不能套用', () => {
  for (const change of [{ run: 99 }, { attempt: 1 }, { conclusion: 'failure' }]) {
    assert.equal(evaluate({ candidate, current, evidence: {
      ...evidence, checks: checks.map(c => ({ ...c, ...change })),
    }, acceptance, interactive: true }).mergeable, false);
  }
});
test('非交互成果免人工体验，但仍需要全部工程证据', () => {
  assert.equal(evaluate({ candidate, current, evidence, interactive: false }).mergeable, true);
  assert.equal(evaluate({ candidate, current, evidence: {}, interactive: false }).mergeable, false);
});
test('不完整或未知格式的候选默认拒绝', () => {
  for (const bad of [null, {}, { ...candidate, schema: 99 }, { ...candidate, source: 'abc' }]) {
    assert.equal(evaluate({ candidate: bad, current, evidence, acceptance, interactive: true }).mergeable, false);
  }
});
