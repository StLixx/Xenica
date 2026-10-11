const fs = require('node:fs');
const { candidateId, productId, evaluate, latestChecks, REQUIRED } = require('./candidate.cjs');
const { policyHash } = require('./build-candidate.cjs');

module.exports = async function verifyDelivery({ github, owner, repo, pr,
  candidate = JSON.parse(fs.readFileSync('.delivery/delivery-candidate.json', 'utf8')),
  root = process.cwd(), fetchHealth = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw new Error('部署健康检查失败');
    return response.json();
  },
}) {
  candidateId(candidate); // 验证域名与字段后才允许访问部署站点。
  if (candidate.preview !== `https://pr-${pr.number}.xenica.truebigsand.top`) {
    return { ready: false, reasons: ['候选对应其他预览'] };
  }
  const raw = await github.paginate(github.rest.checks.listForRef, { owner, repo, ref: pr.head.sha });
  const latest = latestChecks(raw);
  const checks = await Promise.all(REQUIRED.map(async name => {
    const check = latest.get(name);
    if (check?.app?.slug !== 'github-actions' || check.conclusion !== 'success') return { name };
    const match = check.details_url?.match(/\/actions\/runs\/(\d+)\/job\/(\d+)$/);
    if (!match || Number(match[1]) !== candidate.run) return { name };
    const { data: job } = await github.rest.actions.getJobForWorkflowRun({ owner, repo, job_id: Number(match[2]) });
    if (job.head_sha !== pr.head.sha || job.name !== name || job.conclusion !== 'success') return { name };
    return { name, id: check.id, conclusion: job.conclusion, run: job.run_id, attempt: job.run_attempt };
  }));
  const health = await fetchHealth(`${candidate.preview}/api/health`);
  const result = evaluate({ candidate, current: { source: pr.head.sha, base: pr.base.sha, policy: policyHash(root) },
    evidence: { checks, deployed: { source: health.commit, artifact: health.artifact } }, interactive: false });
  return { ready: result.mergeable, reasons: result.reasons, candidate, product: productId(candidate) };
};
