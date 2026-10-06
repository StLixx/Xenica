import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useMemo } from 'react';

import { useEdges, useNodes } from '../../api/queries';
import { useWorkbench } from '../../shell/api';
import { EmptyState, KindBadge } from '../../ui';
import { circleLayout } from './layout';

type CardData = { title: string; kind: string };

function Card({ data }: NodeProps<FlowNode<CardData>>) {
  return (
    <div className="flex max-w-[220px] cursor-pointer items-center gap-2 rounded-md bg-raised px-2.5 py-1.5 text-[13px] text-fg hover:bg-pop">
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <KindBadge kind={data.kind} />
      <span className="truncate">{data.title}</span>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
}

const nodeTypes = { card: Card };

/** 图视图：只负责导航——点节点就在旁边打开它。自动布局、聚焦、缩放见前端片段 2.x。 */
export function GraphView() {
  const nodes = useNodes();
  const edges = useEdges();
  const wb = useWorkbench();

  const flow = useMemo(() => {
    const ns = nodes.data ?? [];
    const pos = circleLayout(ns.map((n) => n.id));
    const fn: FlowNode<CardData>[] = ns.map((n) => ({
      id: n.id,
      type: 'card',
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: { title: n.title, kind: n.kind },
    }));
    const fe: FlowEdge[] = (edges.data ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));
    return { fn, fe };
  }, [nodes.data, edges.data]);

  if (nodes.isPending) return <EmptyState tone="loading" title="加载中…" />;
  if (nodes.isError) return <EmptyState tone="error" title="读取失败" hint={nodes.error.message} />;
  if (flow.fn.length === 0)
    return <EmptyState title="图是空的" hint="先新建几个节点，再在节点页里添加关系。" />;

  return (
    <div className="xenica-graph h-full" data-testid="graph">
      <ReactFlow
        nodes={flow.fn}
        edges={flow.fe}
        nodeTypes={nodeTypes}
        colorMode="dark"
        fitView
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => wb.openView('node', { id: n.id })}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--color-line)" />
      </ReactFlow>
    </div>
  );
}
