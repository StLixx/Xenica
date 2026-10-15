const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateTitle } = require('../check-pr-title.cjs');

test('接受约定的类型、可选范围和破坏性标记', () => {
  for (const title of ['feat(web): 登录页', 'fix(edge): 修复健康检查', 'docs: 更新说明', 'feat!: 调整协议', 'refactor(core)!: 调整节点模型']) {
    assert.equal(validateTitle(title), true, title);
  }
});

test('拒绝非法类型、范围、空描述、英文描述和多行输入', () => {
  for (const title of ['新增登录页', 'feature(web): 登录页', 'feat(unknown): 登录页', 'feat(web): ', 'feat(web): login', 'feat(web): 登录页\nfix: 其他', 'feat(web): 登录页\r其他', 'feat(web): 登录页\u2028其他', 'feat(web):登录页', 'feat(web):  登录页']) {
    assert.equal(validateTitle(title), false, title);
  }
});
