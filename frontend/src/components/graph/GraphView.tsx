import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
import { FileText, List, AlignLeft, Loader2, X } from 'lucide-react'
import XenicaNode from './XenicaNode'
import XenicaEdge from './XenicaEdge'
import { useGraphStore } from '../../stores/graph'
import * as api from '../../lib/api'
import type { GenerateFromNodesOutput } from '../../lib/types'

const nodeTypes: NodeTypes = {
  xenicaNode: XenicaNode,
}

const edgeTypes: EdgeTypes = {
  xenicaEdge: XenicaEdge,
}

interface GraphViewProps {
  onNodeSelect?: (nodeId: string | null) => void
  /** X7: 生成结果回调 */
  onGenerationResult?: (result: GenerateFromNodesOutput) => void
}

export default function GraphView({ onNodeSelect, onGenerationResult }: GraphViewProps) {
  const graphNodes = useGraphStore((s) => s.nodes)
  const graphEdges = useGraphStore((s) => s.edges)
  const isLoading = useGraphStore((s) => s.isLoading)
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds)
  const { loadTopNodes, loadStats, traverseNode, selectNode, toggleMultiSelect, clearMultiSelect } = useGraphStore()
  const [generating, setGenerating] = useState(false)
  /** 防止 store↔local 双向同步死循环 */
  const syncFromStoreRef = useRef(false)

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges)

  // 同步 store → local state，并标记多选节点
  useEffect(() => {
    syncFromStoreRef.current = true
    const updatedNodes = graphNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        multiSelected: selectedNodeIds.has(n.id),
      },
      style: selectedNodeIds.has(n.id)
        ? {
            ...n.style,
            outline: '2px dashed var(--primary)',
            outlineOffset: '3px',
            borderRadius: '12px',
          }
        : { ...n.style, outline: undefined, outlineOffset: undefined },
    }))
    setNodes(updatedNodes)
    // 下一个 tick 解锁，让 local→store 同步跳过这次
    requestAnimationFrame(() => { syncFromStoreRef.current = false })
  }, [graphNodes, selectedNodeIds, setNodes])

  useEffect(() => {
    setEdges(graphEdges)
  }, [graphEdges, setEdges])

  // 初始加载
  useEffect(() => {
    loadTopNodes()
    loadStats()
  }, [loadTopNodes, loadStats])

  // 同步 local → store（拖拽后）— 跳过来自 store 的同步
  useEffect(() => {
    if (syncFromStoreRef.current) return
    useGraphStore.getState().setNodes(nodes)
  }, [nodes])

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // X7: Shift+点击 → 多选
      if (event.shiftKey) {
        toggleMultiSelect(node.id)
        return
      }
      selectNode(node.id)
      onNodeSelect?.(node.id)
      // 展开关联
      traverseNode(node.id, 1)
    },
    [selectNode, onNodeSelect, traverseNode, toggleMultiSelect],
  )

  // X7: 从选中节点生成
  const handleGenerate = useCallback(
    async (format: 'article' | 'outline' | 'summary') => {
      const ids = Array.from(selectedNodeIds)
      if (ids.length < 1 || generating) return
      setGenerating(true)
      try {
        const result = await api.generateFromNodes(ids, format)
        onGenerationResult?.(result)
        clearMultiSelect()
      } catch (e) {
        console.error('生成失败:', e)
      } finally {
        setGenerating(false)
      }
    },
    [selectedNodeIds, generating, onGenerationResult, clearMultiSelect],
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

      {/* X7: 多选生成工具栏 */}
      <AnimatePresence>
        {selectedNodeIds.size >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-5 py-3 rounded-2xl"
            style={{
              background: 'rgba(var(--bg-rgb, 30 30 34), 0.85)',
              backdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px var(--shadow-heavy)',
            }}
          >
            <span className="text-xs shrink-0" style={{ color: 'var(--text-dim)' }}>
              已选 {selectedNodeIds.size} 个节点
            </span>
            <div className="w-px h-5" style={{ background: 'var(--border)' }} />
            <button
              onClick={() => handleGenerate('article')}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'var(--primary-subtle)',
                color: 'var(--primary)',
                border: '1px solid var(--border)',
                opacity: generating ? 0.5 : 1,
              }}
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
              文章
            </button>
            <button
              onClick={() => handleGenerate('outline')}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'var(--primary-subtle)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                opacity: generating ? 0.5 : 1,
              }}
            >
              <List size={13} />
              大纲
            </button>
            <button
              onClick={() => handleGenerate('summary')}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: 'var(--primary-subtle)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                opacity: generating ? 0.5 : 1,
              }}
            >
              <AlignLeft size={13} />
              摘要
            </button>
            <div className="w-px h-5" style={{ background: 'var(--border)' }} />
            <button
              onClick={clearMultiSelect}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all"
              style={{ color: 'var(--text-dim)' }}
              title="取消选择"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 空状态 */}
      {!isLoading && nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-6" style={{ maxWidth: 320 }}>
            {/* 散射节点动画 SVG */}
            <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
              {/* 外圈呼吸 */}
              <circle cx="90" cy="90" r="70" stroke="var(--primary)" strokeWidth="0.5" opacity="0.12">
                <animate attributeName="r" values="68;74;68" dur="5s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.12;0.06;0.12" dur="5s" repeatCount="indefinite" />
              </circle>
              <circle cx="90" cy="90" r="45" stroke="var(--primary)" strokeWidth="0.5" opacity="0.1">
                <animate attributeName="r" values="43;48;43" dur="3.5s" repeatCount="indefinite" />
              </circle>
              {/* 中心点 */}
              <circle cx="90" cy="90" r="5" fill="var(--primary)" opacity="0.25">
                <animate attributeName="opacity" values="0.25;0.12;0.25" dur="3s" repeatCount="indefinite" />
              </circle>
              {/* 散射节点 */}
              <circle cx="50" cy="50" r="3.5" fill="var(--primary)" opacity="0.2">
                <animate attributeName="cy" values="50;47;50" dur="4s" repeatCount="indefinite" />
              </circle>
              <circle cx="135" cy="60" r="3" fill="var(--accent-blue)" opacity="0.18" />
              <circle cx="42" cy="120" r="2.5" fill="var(--accent-green)" opacity="0.15" />
              <circle cx="140" cy="125" r="3" fill="var(--accent-rose)" opacity="0.15">
                <animate attributeName="cx" values="140;143;140" dur="3.5s" repeatCount="indefinite" />
              </circle>
              <circle cx="90" cy="38" r="2" fill="var(--accent-sand)" opacity="0.12" />
              <circle cx="65" cy="145" r="2.5" fill="var(--accent-blue)" opacity="0.1" />
              {/* 连线 */}
              <line x1="90" y1="90" x2="50" y2="50" stroke="var(--primary)" strokeWidth="0.5" opacity="0.08" />
              <line x1="90" y1="90" x2="135" y2="60" stroke="var(--accent-blue)" strokeWidth="0.5" opacity="0.06" />
              <line x1="90" y1="90" x2="42" y2="120" stroke="var(--accent-green)" strokeWidth="0.5" opacity="0.06" />
              <line x1="90" y1="90" x2="140" y2="125" stroke="var(--accent-rose)" strokeWidth="0.5" opacity="0.06" />
              <line x1="50" y1="50" x2="90" y2="38" stroke="var(--primary)" strokeWidth="0.4" opacity="0.05" />
              <line x1="42" y1="120" x2="65" y2="145" stroke="var(--accent-blue)" strokeWidth="0.4" opacity="0.04" />
            </svg>
            <div className="text-center">
              <p
                className="font-serif font-bold mb-2"
                style={{ color: 'var(--primary)', fontSize: '22px', letterSpacing: '0.05em' }}
              >
                织念
              </p>
              <p className="font-serif" style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.8 }}>
                开始对话，让想法自然生长为图谱
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
