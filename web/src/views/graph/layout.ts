/**
 * 占位布局：节点均匀排成一圈，结果只取决于输入顺序。
 * 真正的自动布局见前端片段 2.1（XMind / TheBrain 式），会替换这个文件。
 */
export interface Point {
  x: number;
  y: number;
}

export function circleLayout(ids: string[], radius = 220): Map<string, Point> {
  const out = new Map<string, Point>();
  const n = ids.length;
  ids.forEach((id, i) => {
    if (n === 1) {
      out.set(id, { x: 0, y: 0 });
      return;
    }
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    const r = Math.max(radius, n * 28);
    out.set(id, { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) });
  });
  return out;
}
