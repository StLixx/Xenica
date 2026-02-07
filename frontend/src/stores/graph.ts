import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { GraphStats } from '../lib/types'
import * as api from '../lib/api'

// 视角颜色映射
const perspectiveColors: Record<string, string> = {
  '认知科学': '#d4a574',
  '哲学': '#8ba4b8',
  '技术': '#8faa7b',
  '艺术': '#b88ba4',
  '自然科学': '#a5967b',
  '任务': '#d4a574',
  '洞察': '#8ba4b8',
  '疑问': '#b88ba4',
  '素材': '#8faa7b',
}

function getNodeColor(perspectives?: string[]): string {
  if (!perspectives || perspectives.length === 0) return '#8a8580'
  for (const p of perspectives) {
    if (perspectiveColors[p]) return perspectiveColors[p]
  }
  return '#d4a574'
}

// 边类型样式
const edgeTypeMap: Record<string, { stroke: string; strokeDasharray?: string; animated?: boolean }> = {
  semantic: { stroke: '#d4a574' },
  temporal: { stroke: '#8ba4b8', strokeDasharray: '8,5' },
  sensory: { stroke: '#b88ba4', strokeDasharray: '3,3' },
  evolution: { stroke: '#8faa7b', strokeDasharray: '2,4', animated: true },
}

interface GraphStore {
  nodes: Node[]
  edges: Edge[]
  stats: GraphStats | null
  selectedNodeId: string | null
  isLoading: boolean

  loadTopNodes: () => Promise<void>
  loadStats: () => Promise<void>
  traverseNode: (id: string, depth?: number) => Promise<void>
  selectNode: (id: string | null) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  stats: null,
  selectedNodeId: null,
  isLoading: false,

  loadTopNodes: async () => {
    set({ isLoading: true })
    try {
      const result = await api.graphTop(30)
      const topNodes = result.nodes

      // 转换为 react-flow 节点
      const rfNodes: Node[] = topNodes.map((n: Record<string, unknown>, i: number) => {
        const id = String((n.id as Record<string, unknown>)?.id || n.id || `node-${i}`)
        const label = String(n.label || n.name || n.raw_input || '?')
        const weight = Number(n.weight || 1)
        const perspectives = n.perspectives as string[] | undefined
        const nodeType = n.type as string | undefined

        // 力导向风格的初始位置 — 环形排列
        const angle = (i / topNodes.length) * Math.PI * 2
        const radius = 200 + Math.random() * 150
        const x = 400 + Math.cos(angle) * radius
        const y = 300 + Math.sin(angle) * radius

        return {
          id,
          type: 'xenicaNode',
          position: { x, y },
          data: {
            label,
            weight,
            perspectives,
            nodeType: nodeType || 'moment',
            color: getNodeColor(perspectives),
            raw: n,
          },
        }
      })

      set({ nodes: rfNodes, isLoading: false })
    } catch (e) {
      console.error('加载图谱节点失败:', e)
      set({ isLoading: false })
    }
  },

  loadStats: async () => {
    try {
      const stats = await api.graphStats()
      set({ stats })
    } catch (e) {
      console.error('加载图谱统计失败:', e)
    }
  },

  traverseNode: async (id, depth = 1) => {
    set({ isLoading: true })
    try {
      const result = await api.graphTraverse(id, depth)
      const existing = get().nodes
      const existingIds = new Set(existing.map((n) => n.id))

      // 找到中心节点位置
      const centerNode = existing.find((n) => n.id === id)
      const cx = centerNode?.position.x || 400
      const cy = centerNode?.position.y || 300

      // 添加新节点
      const newNodes: Node[] = result.nodes
        .filter((n) => {
          const nid = String((n.id as unknown as Record<string, unknown>)?.id || n.id)
          return !existingIds.has(nid)
        })
        .map((n, i) => {
          const nid = String((n.id as unknown as Record<string, unknown>)?.id || n.id)
          const label = n.refined || n.raw_input || n.name || '?'
          const angle = (i / result.nodes.length) * Math.PI * 2
          const dist = 120 + Math.random() * 80

          return {
            id: nid,
            type: 'xenicaNode',
            position: {
              x: cx + Math.cos(angle) * dist,
              y: cy + Math.sin(angle) * dist,
            },
            data: {
              label,
              weight: n.weight || 1,
              perspectives: n.perspectives,
              nodeType: n.entity_type ? 'entity' : 'moment',
              color: getNodeColor(n.perspectives),
              raw: n,
            },
          }
        })

      // 添加新边
      const newEdges: Edge[] = result.edges.map((e, i) => {
        const fromId = String((e.in as unknown as Record<string, unknown>)?.id || e.in)
        const toId = String((e.out as unknown as Record<string, unknown>)?.id || e.out)
        const rt = e.relation_type || 'semantic'
        const style = edgeTypeMap[rt] || edgeTypeMap.semantic
        const strength = e.strength || 0.5

        return {
          id: `edge-${fromId}-${toId}-${i}`,
          source: fromId,
          target: toId,
          type: 'xenicaEdge',
          animated: style.animated || false,
          style: {
            stroke: style.stroke,
            strokeWidth: 1 + strength * 2,
            strokeDasharray: style.strokeDasharray,
            opacity: 0.3 + strength * 0.5,
          },
          data: {
            relationType: rt,
            description: e.description,
            strength,
          },
        }
      })

      set({
        nodes: [...existing, ...newNodes],
        edges: [...get().edges, ...newEdges],
        isLoading: false,
      })
    } catch (e) {
      console.error('遍历节点失败:', e)
      set({ isLoading: false })
    }
  },

  selectNode: (id) => set({ selectedNodeId: id }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
}))
