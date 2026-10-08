import { useMemo } from 'react';

import type { Node } from '../../api/client';
import { useEdges, useNodes } from '../../api/queries';
import { nodeLabel } from '../../ui';

export type GraphIndex = ReturnType<typeof buildIndex>;

function buildIndex(nodes: Node[], edges: { source: string; target: string; kind: string }[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map<string, string[]>();
  const mentions = new Map<string, string[]>();
  const mentionedBy = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k);
    if (list) list.push(v);
    else m.set(k, [v]);
  };
  for (const e of edges) {
    if (e.kind === 'contains') push(parents, e.target, e.source);
    else if (e.kind === 'mentions') {
      push(mentions, e.source, e.target);
      push(mentionedBy, e.target, e.source);
    }
  }
  const kids = new Map<string, Node[]>();
  for (const e of edges)
    if (e.kind === 'contains') {
      const child = byId.get(e.target);
      if (child) kids.set(e.source, [...(kids.get(e.source) ?? []), child]);
    }
  const firstChild = (id: string) =>
    kids.get(id)?.reduce((a, b) => (b.created_at < a.created_at ? b : a));
  const pick = (ids: string[] | undefined) =>
    (ids ?? []).map((i) => byId.get(i)).filter((n): n is Node => !!n);
  return {
    byId,
    /** 包含它的节点（它在哪一页）。 */
    parentsOf: (id: string) => pick(parents.get(id)),
    /** 它提到的节点（#标记、[[名字]]）。 */
    mentionsOf: (id: string) => pick(mentions.get(id)),
    /** 提到它的节点，最近更新的在前。 */
    mentionedBy: (id: string) =>
      pick(mentionedBy.get(id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    /** 显示名（没有标题的页用它最早的一块）。 */
    label: (n: Node) => nodeLabel(n, firstChild(n.id)),
    /** 按标题找节点（标题相同取最早的，和后端一致）。 */
    byTitle: (title: string) =>
      nodes
        .filter((n) => n.title === title)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0],
  };
}

/** 全部节点和关系的索引（个人规模，直接在前端算）。 */
export function useGraphIndex() {
  const nodes = useNodes();
  const edges = useEdges();
  return useMemo(() => buildIndex(nodes.data ?? [], edges.data ?? []), [nodes.data, edges.data]);
}

/** 让某一页滚动到某一块并闪一下（列表、表格、画廊里点一条时用）。 */
export const REVEAL_EVENT = 'xenica:reveal';
let pending: { parent: string; id: string } | null = null;

export function reveal(parent: string, id: string) {
  pending = { parent, id };
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT));
}

export function takeReveal(parent: string): string | null {
  if (pending?.parent !== parent) return null;
  const id = pending.id;
  pending = null;
  return id;
}
