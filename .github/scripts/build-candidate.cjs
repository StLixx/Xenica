const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { candidateId, productId } = require('./candidate.cjs');

function policyHash(root) {
  const files = [
    '.github/scripts/candidate.cjs', '.github/scripts/readiness.cjs', '.github/scripts/verify-delivery.cjs', '.github/scripts/gate.cjs', '.github/scripts/build-candidate.cjs',
    '.github/workflows/ci.yml', '.github/workflows/approve.yml',
    'web/.dependency-cruiser.cjs', 'web/eslint.config.js',
    'scripts/check-arch.sh', 'scripts/check-context.cjs', 'scripts/setup-github.sh',
    '.github/scripts/journal.cjs', '.github/scripts/acceptance.cjs', '.github/scripts/promote.cjs',
    '.github/scripts/read-acceptance.cjs',
    '.github/scripts/find-candidate.cjs',
    '.github/scripts/append-record.cjs',
  ];
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(`${file}\0`);
    hash.update(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

module.exports = function buildCandidate({ root, source, base, artifact, number, run, attempt }) {
  const candidate = {
    schema: 1, source, base, artifact,
    preview: `https://pr-${number}.xenica.truebigsand.top`,
    policy: policyHash(root), run, attempt,
  };
  return { ...candidate, id: candidateId(candidate), product: productId(candidate) };
};
module.exports.policyHash = policyHash;
