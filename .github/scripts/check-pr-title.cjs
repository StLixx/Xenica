const TITLE = /^(feat|fix|perf|refactor|style|test|docs|build|ci|chore)(\((core|store|server|web|ui|shell|views|deploy|edge|ci)\))?!?: (\S[^\r\n\u2028\u2029]*)$/u;

function validateTitle(title) {
  return typeof title === 'string' && !/[\r\n\u2028\u2029]/u.test(title) &&
    TITLE.test(title) && /\p{Script=Han}/u.test(title);
}

module.exports = { validateTitle };

if (require.main === module && !validateTitle(process.env.PR_TITLE)) {
  console.error('PR 标题须为 <类型>(<可选范围>)!: <中文描述>，类型、范围见 Issue #31。');
  process.exitCode = 1;
}
