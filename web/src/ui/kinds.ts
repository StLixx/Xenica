/** 节点类型的单字标记与名称。颜色在 theme.css 的 --x-kind-* 里。 */
export const KINDS: Record<string, { mark: string; label: string }> = {
  note: { mark: '记', label: '笔记' },
  knowledge: { mark: '知', label: '知识点' },
  question: { mark: '题', label: '题目' },
  video: { mark: '视', label: '视频' },
  book: { mark: '书', label: '教材' },
  podcast: { mark: '播', label: '播客' },
  embed: { mark: '嵌', label: '嵌入' },
  task: { mark: '务', label: '任务' },
  goal: { mark: '标', label: '目标' },
  area: { mark: '域', label: '领域' },
  tool: { mark: '件', label: '工具' },
  setting: { mark: '设', label: '设置' },
  log: { mark: '迹', label: '记录' },
};

/** 关系类型的显示名。 */
export const EDGE_KINDS: Record<string, string> = {
  related: '相关',
  part_of: '属于',
  mentions: '讲到',
  tests: '考查',
  cites: '引用',
  serves: '服务于',
  derived: '派生',
};

export function edgeLabel(kind: string) {
  return EDGE_KINDS[kind] ?? kind;
}

export function kindInfo(kind: string) {
  return KINDS[kind] ?? { mark: (kind[0] ?? '?').toUpperCase(), label: kind };
}

export function kindColor(kind: string) {
  return KINDS[kind] ? `var(--x-kind-${kind})` : 'var(--x-kind-default)';
}
