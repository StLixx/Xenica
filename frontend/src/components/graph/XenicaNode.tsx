import { memo, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { motion } from 'framer-motion'

interface XenicaNodeData {
  label: string
  weight: number
  perspectives?: string[]
  nodeType: string
  color: string
  raw: Record<string, unknown>
}

function XenicaNode({ data, selected }: NodeProps) {
  const { label, weight, perspectives, nodeType, color } = data as unknown as XenicaNodeData
  const [hovered, setHovered] = useState(false)

  // 根据 weight 决定节点大小（统一圆形）
  const size = Math.max(36, Math.min(64, 36 + (weight || 0) * 3))
  // 大节点显示更多文字
  const maxChars = size >= 50 ? 6 : 4
  const fontSize = size >= 50 ? 11 : 10

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex items-center justify-center cursor-pointer"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `${color}26`,
        border: selected ? `2px solid ${color}` : `1.5px solid ${color}88`,
        boxShadow: selected
          ? `0 0 0 4px ${color}33, 0 0 16px ${color}22, 0 4px 20px rgba(0,0,0,0.4)`
          : hovered
            ? `0 4px 24px rgba(0,0,0,0.5)`
            : `0 2px 12px rgba(0,0,0,0.3)`,
        transform: hovered ? 'scale(1.15)' : selected ? 'scale(1.1)' : 'scale(1)',
        transition: 'transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.25s ease',
        zIndex: hovered || selected ? 10 : 1,
      }}
    >
      {/* 选中态呼吸光晕 */}
      {selected && (
        <motion.div
          initial={{ scale: 1, opacity: 0.25 }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.25, 0.08, 0.25] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: '50%',
            border: `1px solid ${color}`,
            pointerEvents: 'none',
          }}
        />
      )}

      <span
        className="text-center leading-tight"
        style={{
          fontSize,
          fontWeight: 600,
          fontFamily: "'Noto Serif SC', serif",
          color: 'rgba(255,255,255,0.9)',
          maxWidth: size - 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label.slice(0, maxChars)}
      </span>

      {/* 悬停详情 */}
      {hovered && (
        <div
          className="absolute left-full ml-3 top-1/2 -translate-y-1/2 rounded-xl pointer-events-none z-50"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 8px 32px var(--shadow-heavy)',
            minWidth: 180,
            padding: '10px 14px',
          }}
        >
          <div
            style={{
              fontFamily: "'Noto Serif SC', serif",
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: '4px',
            }}
          >
            {label}
          </div>
          {perspectives && perspectives.length > 0 && (
            <div className="flex gap-1 flex-wrap" style={{ marginTop: '6px' }}>
              {perspectives.map((p) => (
                <span
                  key={p}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '10px',
                    fontSize: '10px',
                    fontWeight: 500,
                    background: `${color}22`,
                    color,
                  }}
                >
                  {p}
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-dim)' }}>
            {nodeType === 'entity' ? '实体' : '认知瞬间'} · 权重 {weight || 0}
          </div>
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </motion.div>
  )
}

export default memo(XenicaNode)
