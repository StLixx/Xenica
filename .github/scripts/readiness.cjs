// 机器检查与 Agent 实测是不同证据；报告是责任声明，不能代替 CI 或用户体验。
const MARKER = '/自检 ';

function readReport(comments, { owner, sha, preview, interactive }) {
  const reports = comments.filter(c => c.user?.login === owner && c.body?.startsWith(MARKER))
    .sort((a, b) => b.id - a.id);
  // 最新声明优先。不能用旧的通过报告覆盖新的失败报告。
  const comment = reports.find(c => c.body.split('\n')[0].trim() === `${MARKER}${sha}`);
  if (!comment) return { ready: false, reason: '缺少当前成果的 Agent 自检报告' };
  try {
    const report = JSON.parse(comment.body.slice(comment.body.indexOf('\n') + 1));
    if (report.schema !== 1 || report.source !== sha || report.preview !== preview ||
        report.scope?.confirmed !== true || typeof report.scope.reference !== 'string' ||
        !report.scope.reference.trim() || !Array.isArray(report.scenarios) || !report.scenarios.length ||
        !Array.isArray(report.unresolved) || report.unresolved.length) {
      return { ready: false, reason: '范围、场景或未解决问题记录不完整' };
    }
    for (const scenario of report.scenarios) {
      if (!scenario.name?.trim() || scenario.result !== 'passed' ||
          !Array.isArray(scenario.evidence) || !scenario.evidence.length ||
          scenario.evidence.some(url => typeof url !== 'string' || !/^https:\/\//.test(url) || /\/api\/share\//.test(url))) {
        return { ready: false, reason: '实测场景未通过或缺少可查证据' };
      }
    }
    if (interactive && (report.visual?.result !== 'passed' || !report.visual.evidence?.length ||
        report.visual.evidence.some(url => typeof url !== 'string' || !/^https:\/\//.test(url)))) {
      return { ready: false, reason: '缺少 Agent 亲眼检查的截图证据' };
    }
    return { ready: true, report, comment: comment.id };
  } catch {
    return { ready: false, reason: 'Agent 自检报告格式无效' };
  }
}

module.exports = { readReport };
