import { X } from 'lucide-react'
import { useGraphStore } from '../stores/graph'

interface NodeData {
  label: string
  weight: number
  perspectives?: string[]
  nodeType: string
  color: string
  raw: Record<string, unknown>
}

interface NodeDetailProps {
  nodeId: string
  onClose: () => void
}

export default function NodeDetail({ nodeId, onClose }: NodeDetailProps) {
  const node = useGraphStore((s) => s.nodes.find((n) => n.id === nodeId))

  if (!node) return null

  const data: NodeData = node.data as unknown as NodeData
  const raw = data.raw || {}
  const refined = raw['refined'] ? String(raw['refined']) : ''
  const rawInput = raw['raw_input'] ? String(raw['raw_input']) : ''
  const description = raw['description'] ? String(raw['description']) : ''
  const entityType = raw['entity_type'] ? String(raw['entity_type']) : ''

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: 'var(--bg)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-5 shrink-0"
        style={{
          height: 56,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span className="font-serif text-base font-semibold" style={{ color: 'var(--text)' }}>
          节点详情
        </span>
        <button
          onClick={onClose}
          className="chat-action-btn"
        >
          <X size={14} />
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '20px' }}>
        {/* 标题 */}
        <h2
          style={{
            fontFamily: "'Noto Serif SC', serif",
            fontSize: '18px',
            fontWeight: 600,
            color: 'var(--text)',
            borderLeft: `3px solid ${data.color}`,
            paddingLeft: '12px',
            marginBottom: '10px',
            lineHeight: 1.4,
          }}
        >
          {data.label}
        </h2>

        {/* 类型 & 权重 */}
        <div className="flex items-center gap-3" style={{ marginBottom: '16px' }}>
          <span
            className="px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              background: `${data.color}22`,
              color: data.color,
            }}
          >
            {data.nodeType === 'entity' ? '实体' : '认知瞬间'}
          </span>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {'权重 ' + String(data.weight)}
          </span>
        </div>

        {/* 视角标签 */}
        {data.perspectives && data.perspectives.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '8px', fontWeight: 400, letterSpacing: '0.03em' }}>
              视角标签
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {data.perspectives.map((p) => (
                <span
                  key={p}
                  className="px-2 py-0.5 rounded-full text-[11px]"
                  style={{
                    background: 'var(--primary-muted)',
                    color: 'var(--primary)',
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 精炼表述 */}
        {refined && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '8px', fontWeight: 400, letterSpacing: '0.03em' }}>
              精炼表述
            </label>
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)', fontFamily: "'Inter', 'Noto Sans SC', sans-serif" }}>
              {refined}
            </p>
          </div>
        )}

        {/* 原始输入 */}
        {rawInput && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '8px', fontWeight: 400, letterSpacing: '0.03em' }}>
              原始输入
            </label>
            <div
              style={{
                borderRadius: '10px',
                padding: '12px 14px',
                fontSize: '14px',
                lineHeight: 1.7,
                background: 'var(--card)',
                color: 'var(--text-secondary)',
                fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
              }}
            >
              {rawInput}
            </div>
          </div>
        )}

        {/* 描述（实体） */}
        {description && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '8px', fontWeight: 400, letterSpacing: '0.03em' }}>
              描述
            </label>
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)', fontFamily: "'Inter', 'Noto Sans SC', sans-serif" }}>
              {description}
            </p>
          </div>
        )}

        {/* 实体类型 */}
        {entityType && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '8px', fontWeight: 400, letterSpacing: '0.03em' }}>
              实体类型
            </label>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {entityType}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
