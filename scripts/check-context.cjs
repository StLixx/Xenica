const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'docs/context/index.json'), 'utf8'));
const ids = new Set();
function checkFile(file) {
  if (typeof file !== 'string' || path.isAbsolute(file) || file.includes('..') ||
      !fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`上下文引用缺失或不安全：${file}`);
  }
}
if (index.schema !== 1 || !Array.isArray(index.decisions) || !index.decisions.length) throw new Error('接续索引格式无效');
checkFile(index.scope);
for (const decision of index.decisions) {
  if (!decision.id || ids.has(decision.id) || !['confirmed', 'proposed', 'historical', 'unverified'].includes(decision.status) ||
      !decision.origin || !decision.summary || !decision.references?.length) throw new Error(`决策不完整或重复：${decision.id}`);
  ids.add(decision.id);
  decision.references.forEach(checkFile);
}
console.log(`context: ${ids.size} decisions checked`);
