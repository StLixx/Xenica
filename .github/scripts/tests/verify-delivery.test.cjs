const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const verify = require('../verify-delivery.cjs');
const { policyHash } = require('../build-candidate.cjs');
const { REQUIRED } = require('../candidate.cjs');
const root = path.resolve(__dirname, '../../..');
const candidate = { schema: 1, source: 'a'.repeat(40), base: 'b'.repeat(40), policy: policyHash(root),
  artifact: `sha256:${'c'.repeat(64)}`, preview: 'https://pr-55.xenica.truebigsand.top', run: 100, attempt: 2 };
const pr = { number: 55, head: { sha: candidate.source }, base: { sha: candidate.base } };
const checks = REQUIRED.map((name, i) => ({ name, id: i + 1, conclusion: 'success', app: { slug: 'github-actions' },
  details_url: `https://github.com/owner/repo/actions/runs/100/job/${i + 1}` }));
async function simulate({ raw = checks, jobChange = {}, healthChange = {}, prChange = {}, record = candidate } = {}) {
  return verify({ root, candidate: record, owner: 'owner', repo: 'repo', pr: { ...pr, ...prChange },
    github: { paginate: async () => raw, rest: { checks: { listForRef: 'checks' }, actions: {
      getJobForWorkflowRun: async ({ job_id }) => ({ data: { head_sha: candidate.source,
        name: checks[job_id - 1].name, conclusion: 'success', run_id: 100, run_attempt: 2, ...jobChange } }),
    } } }, fetchHealth: async () => ({ commit: candidate.source, artifact: candidate.artifact, ...healthChange }),
  });
}
test('从 GitHub job 与实际部署身份核验完整候选', async () => {
  assert.equal((await simulate()).ready, true);
});

test('标为固定画板但缺少入口身份时不放行', async () => {
  assert.equal((await simulate({ prChange: { labels: [{ name: '固定画板' }] } })).ready, false);
});

test('固定入口未更新到本次产物时不放行', async () => {
  const record = { ...candidate, workspace: 'https://excalidraw.xenica.truebigsand.top' };
  const result = await verify({root,candidate:record,owner:'owner',repo:'repo',pr,
    github:{paginate:async()=>checks,rest:{checks:{listForRef:'checks'},actions:{getJobForWorkflowRun:async({job_id})=>({data:{head_sha:candidate.source,name:checks[job_id-1].name,conclusion:'success',run_id:100,run_attempt:2}})}}},
    fetchHealth:async url=>({commit:url.startsWith(record.workspace)?'e'.repeat(40):candidate.source,artifact:candidate.artifact})});
  assert.equal(result.ready,false);
});
test('假检查、旧尝试、旧产物、旧主线、其他预览不能套用', async () => {
  for (const change of [
    { raw: checks.map(c => ({ ...c, app: { slug: 'other' } })) },
    { jobChange: { run_attempt: 1 } }, { jobChange: { head_sha: 'd'.repeat(40) } },
    { jobChange: { conclusion: 'failure' } }, { healthChange: { artifact: null } },
    { healthChange: { commit: 'd'.repeat(40) } }, { prChange: { base: { sha: 'd'.repeat(40) } } },
    { record: { ...candidate, preview: 'https://pr-56.xenica.truebigsand.top' } },
  ]) assert.equal((await simulate(change)).ready, false);
});
