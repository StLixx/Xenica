const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const buildCandidate = require('../build-candidate.cjs');
const { candidateId } = require('../candidate.cjs');
const input = {
  root: path.resolve(__dirname, '../../..'), source: 'a'.repeat(40), base: 'b'.repeat(40),
  artifact: `sha256:${'c'.repeat(64)}`, number: 55, run: 100, attempt: 1,
};
test('流水线构建元数据生成稳定的候选及规则指纹', () => {
  const record = buildCandidate(input);
  assert.equal(record.id, candidateId(record));
  assert.equal(record.policy.length, 64);
  assert.deepEqual(record, buildCandidate(input));
  assert.notEqual(record.id, buildCandidate({ ...input, artifact: `sha256:${'d'.repeat(64)}` }).id);
});
test('未提供真实产物摘要或完整规则不能生成候选', () => {
  assert.throws(() => buildCandidate({ ...input, artifact: '' }));
  assert.throws(() => buildCandidate({ ...input, root: path.join(input.root, 'absent-policy') }));
});
