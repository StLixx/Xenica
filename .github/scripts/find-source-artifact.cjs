// 相同源码重跑检查时复用已经归档的不可变产物；不存在才首次构建。
const { hash } = require('./journal.cjs');
const { candidateId, productId } = require('./candidate.cjs');
module.exports = async function findSourceArtifact({ github, owner, repo, source }) {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error('invalid source');
  let head;
  try { head = (await github.rest.git.getRef({ owner, repo, ref: 'heads/delivery-records' })).data.object.sha; }
  catch (error) { if (error.status === 404) return null; throw error; }
  const read = async path => JSON.parse(Buffer.from((await github.rest.repos.getContent({ owner, repo, path, ref: head })).data.content, 'base64').toString());
  const index = await read('index.json');
  if (index.schema !== 1 || !Array.isArray(index.records)) throw new Error('journal index corrupt');
  const item = index.records.findLast(r => r.type === 'candidate' && r.source === source);
  if (!item) return null;
  const record = await read(item.path);
  const candidate = record.candidate;
  if (hash(JSON.stringify(record)) !== item.sha256 || record.type !== 'candidate' ||
      candidate?.source !== source || candidateId(candidate) !== candidate.id ||
      productId(candidate) !== candidate.product) throw new Error('archived product corrupt');
  return candidate.artifact;
};
