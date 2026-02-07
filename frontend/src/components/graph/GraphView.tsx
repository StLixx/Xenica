import { useCallback, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type EdgeTypes,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import XenicaNode from './XenicaNode'
import XenicaEdge from './XenicaEdge'
import { useGraphStore } from '../../stores/graph'

const nodeTypes: NodeTypes = {
  xenicaNode: XenicaNode,
}

const edgeTypes: EdgeTypes = {
  xenicaEdge: XenicaEdge,
}

interface GraphViewProps {
  onNodeSelect?: (nodeId: string | null) => void
}

export default function GraphView({ onNodeSelect }: GraphViewProps) {
  const graphNodes = useGraphStore((s) => s.nodes)
  const graphEdges = useGraphStore((s) => s.edges)
  const isLoading = useGraphStore((s) => s.isLoading)
  const { loadTopNodes, loadStats, traverseNode, selectNode } = useGraphStore()

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges)

  // 同步 store → local state
  useEffect(() => {
    setNodes(graphNodes)
  }, [graphNodes, setNodes])

  useEffect(() => {
    setEdges(graphEdges)
  }, [graphEdges, setEdges])

  // 初始加载
  useEffect(() => {
    loadTopNodes()
    loadStats()
  }, [loadTopNodes, loadStats])

  // 同步 local → store（拖拽后）
  useEffect(() => {
    useGraphStore.getState().setNodes(nodes)
  }, [nodes])

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id)
      onNodeSelect?.(node.id)
      // 展开关联
      traverseNode(node.id, 1)
    },
    [selectNode, onNodeSelect, traverseNode],
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    onNodeSelect?.(null)
  }, [selectNode, onNodeSelect])

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'xenicaEdge',
    }),
    [],
  )

  return (
    <div className="w-full h-full relative" style={{ background: 'var(--graph-bg)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={3}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={40}
          size={1}
          color="var(--graph-grid)"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          style={{ marginBottom: 8, marginLeft: 8 }}
        />
      </ReactFlow>

      {/* 加载指示器 */}
      {isLoading && (
        <div
          className="absolute top-4 right-4 px-3 py-1.5 rounded-lg text-xs flex items-center gap-2"
          style={{
            background: 'var(--backdrop)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: 'var(--primary)' }}
          />
          加载中…
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="font-serif text-lg mb-2" style={{ color: 'var(--text-muted)' }}>
              图谱为空
            </p>
            <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
              开始对话后，节点会自动出现在这里
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
