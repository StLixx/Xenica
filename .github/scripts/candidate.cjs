// 纯函数门禁：不访问网络，不依据 Agent 的判断推断证据。调用方负责证据来源认证。
const { createHash } = require('node:crypto');
const REQUIRED = ['rust', 'web', 'e2e', 'docker', 'screenshots', 'preview', 'delivery-history'];
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;

function valid(candidate) {
  return candidate?.schema === 1 && SHA.test(candidate.source ?? '') &&
    SHA.test(candidate.base ?? '') && HASH.test(candidate.policy ?? '') &&
    /^sha256:[a-f0-9]{64}$/.test(candidate.artifact ?? '') &&
    /^https:\/\/pr-[1-9][0-9]*\.xenica\.truebigsand\.top\/?$/.test(candidate.preview ?? '') &&
    Number.isSafeInteger(candidate.run) && candidate.run > 0 &&
    Number.isSafeInteger(candidate.attempt) && candidate.attempt > 0 &&
    (candidate.workspace === undefined || candidate.workspace === 'https://excalidraw.xenica.truebigsand.top');
}

function candidateId(candidate) {
  if (!valid(candidate)) throw new Error('交付候选格式无效');
  const identity = ['schema', 'source', 'base', 'artifact', 'preview', 'policy', 'run', 'attempt', ...(candidate.workspace ? ['workspace'] : [])]
    .map(key => [key, candidate[key]]);
  return `dc-${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
}

// 产品身份与工程检查身份分离：相同产物重跑检查，不改写用户的历史体验判断。
function productId(candidate) {
  if (!valid(candidate)) throw new Error('交付候选格式无效');
  return `product-${createHash('sha256').update(JSON.stringify(
    ['source', 'artifact', 'preview', ...(candidate.workspace ? ['workspace'] : [])].map(key => [key, candidate[key]]),
  )).digest('hex')}`;
}

function latestChecks(checks) {
  const latest = new Map();
  for (const check of checks) {
    if (typeof check.name !== 'string' || !Number.isSafeInteger(check.id) || check.id <= 0) continue;
    if (!latest.has(check.name) || check.id > latest.get(check.name).id) latest.set(check.name, check);
  }
  return latest;
}

function evaluate({ candidate, current = {}, evidence = {}, acceptance, interactive = true }) {
  const reasons = [];
  if (!valid(candidate)) return { mergeable: false, reasons: ['候选格式无效'] };
  for (const key of ['source', 'base', 'policy']) {
    if (candidate[key] !== current[key]) reasons.push(`${key} 已变化或缺失`);
  }
  if (evidence.deployed?.source !== candidate.source || evidence.deployed?.artifact !== candidate.artifact) {
    reasons.push('部署产物未核验');
  }
  const checks = latestChecks(evidence.checks ?? []);
  for (const name of REQUIRED) {
    const check = checks.get(name);
    if (!check || check.conclusion !== 'success' || check.run !== candidate.run || check.attempt !== candidate.attempt) {
      reasons.push(`${name} 证据缺失、失败或不属于当前运行`);
    }
  }
  if (interactive && (acceptance?.candidate !== productId(candidate) ||
      acceptance.outcome !== 'accepted' || typeof acceptance.actor !== 'string' || !acceptance.actor.trim())) {
    reasons.push('缺少对应成果的人工验收');
  }
  return { mergeable: reasons.length === 0, reasons };
}

module.exports = { candidateId, productId, evaluate, latestChecks, REQUIRED };
