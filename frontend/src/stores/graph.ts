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

/**
 * 从 SurrealDB 的 ID 格式中提取字符串 ID
 * 支持格式：
 *   - "string-id"
 *   - { tb: "entity", id: { String: "xxx" } }
 *   - { tb: "entity", id: "xxx" }
 */
function extractId(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    const inner = obj.id
    if (typeof inner === 'string') return inner
    if (typeof inner === 'object' && inner !== null) {
      const str = (inner as Record<string, unknown>).String
      if (typeof str === 'string') return str
    }
    // fallback: "tb:id" 格式
    if (obj.tb && inner) return `${obj.tb}:${extractId(inner)}`
  }
  return String(raw)
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
  /** X7: 多选节点 ID 集合 */
  selectedNodeIds: Set<string>
  isLoading: boolean

  loadTopNodes: () => Promise<void>
  loadStats: () => Promise<void>
  traverseNode: (id: string, depth?: number) => Promise<void>
  selectNode: (id: string | null) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  /** X7: 切换多选 */
  toggleMultiSelect: (id: string) => void
  /** X7: 清空多选 */
  clearMultiSelect: () => void
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  nodes: [],
  edges: [],
  stats: null,
  selectedNodeId: null,
  selectedNodeIds: new Set<string>(),
  isLoading: false,

  loadTopNodes: async () => {
    set({ isLoading: true })
    try {
      const result = await api.graphTop(30)
      const topNodes = result.nodes

      // 转换为 react-flow 节点
      // 随机散布布局（互相不重叠）
      const placedPositions: { x: number; y: number; r: number }[] = []
      const rfNodes: Node[] = topNodes.map((n: Record<string, unknown>, i: number) => {
        const id = extractId(n.id) || `node-${i}`
        const label = String(n.label || n.name || n.raw_input || '?')
        const weight = Number(n.weight || 1)
        const perspectives = n.perspectives as string[] | undefined
        const nodeType = n.type as string | undefined

        // 节点半径（与 XenicaNode 的 size 计算一致）
        const nodeSize = Math.max(36, Math.min(64, 36 + weight * 3))
        const nodeRadius = nodeSize / 2 + 20 // 加 padding 防止重叠

        // 随机散布 + 碰撞检测
        let x = 0, y = 0
        let attempts = 0
        const maxAttempts = 50
        const spreadRadius = 120 + topNodes.length * 12
        do {
          const angle = Math.random() * Math.PI * 2
          const dist = 60 + Math.random() * spreadRadius
          x = 400 + Math.cos(angle) * dist
          y = 300 + Math.sin(angle) * dist
          attempts++
        } while (
          attempts < maxAttempts &&
          placedPositions.some(
            (p) => Math.hypot(p.x - x, p.y - y) < (p.r + nodeRadius)
          )
        )
        placedPositions.push({ x, y, r: nodeRadius })

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

      // 处理初始边（如果 API 返回了 edges）
      const rfEdges: Edge[] = (result.edges || []).map((e: Record<string, unknown>, i: number) => {
        const rawFrom = String(e.source || e.in || '')
        const rawTo = String(e.target || e.out || '')
        const fromId = rawFrom.includes(':') ? rawFrom.split(':').slice(1).join(':') : rawFrom
        const toId = rawTo.includes(':') ? rawTo.split(':').slice(1).join(':') : rawTo
        const rt = String(e.relation_type || 'semantic')
        const style = edgeTypeMap[rt] || edgeTypeMap.semantic
        const strength = Number(e.strength || 0.5)

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

      set({ nodes: rfNodes, edges: rfEdges, isLoading: false })
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
          const nid = extractId(n.id)
          return !existingIds.has(nid)
        })
        .map((n, i) => {
          const nid = extractId(n.id)
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
        const rawFrom = extractId(e.source || e.in)
        const rawTo = extractId(e.target || e.out)
        // 边端点可能是 "table:id" 字符串，需要去掉前缀匹配节点 ID
        const fromId = rawFrom.includes(':') ? rawFrom.split(':').slice(1).join(':') : rawFrom
        const toId = rawTo.includes(':') ? rawTo.split(':').slice(1).join(':') : rawTo
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

  // X7: 多选
  toggleMultiSelect: (id) => {
    const current = new Set(get().selectedNodeIds)
    if (current.has(id)) {
      current.delete(id)
    } else {
      current.add(id)
    }
    set({ selectedNodeIds: current })
  },
  clearMultiSelect: () => set({ selectedNodeIds: new Set() }),
}))
