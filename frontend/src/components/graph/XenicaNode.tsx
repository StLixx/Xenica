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

  // 缩放级别决定显示模式
  // 简化：根据 weight 决定节点大小
  const size = Math.max(36, Math.min(72, 36 + (weight || 0) * 3))
  const isSmall = size < 50

  // 圆形气泡模式（缩小时）
  if (isSmall) {
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
          background: `${color}33`,
          border: selected ? `2px solid ${color}` : `1px solid ${color}66`,
          boxShadow: selected
            ? `0 0 0 3px ${color}33, 0 4px 20px rgba(0,0,0,0.4)`
            : `0 2px 12px rgba(0,0,0,0.3)`,
          transform: hovered ? 'scale(1.15)' : 'scale(1)',
          transition: 'transform 0.2s, box-shadow 0.2s',
          zIndex: hovered ? 10 : 1,
        }}
      >
        <span
          className="text-center leading-tight"
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.9)',
            maxWidth: size - 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label.slice(0, 4)}
        </span>

        {/* 悬停详情 */}
        {hovered && (
          <div
            className="absolute left-full ml-3 top-1/2 -translate-y-1/2 rounded-lg px-3.5 py-2.5 pointer-events-none z-50"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border-light)',
              boxShadow: '0 8px 32px var(--shadow-heavy)',
              minWidth: 180,
            }}
          >
            <div
              className="font-serif text-sm font-semibold mb-1"
              style={{ color: 'var(--text)' }}
            >
              {label}
            </div>
            {perspectives && perspectives.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1.5">
                {perspectives.map((p) => (
                  <span
                    key={p}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{
                      background: `${color}22`,
                      color,
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-dim)' }}>
              {nodeType === 'entity' ? '实体' : '认知瞬间'} · 权重 {weight || 0}
            </div>
          </div>
        )}

        <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
        <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
      </motion.div>
    )
  }

  // 方形卡片模式（放大时）
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-lg cursor-pointer"
      style={{
        background: 'var(--card)',
        borderLeft: `3px solid ${color}`,
        padding: '10px 14px',
        minWidth: 120,
        boxShadow: selected
          ? `0 0 0 2px ${color}66, 0 6px 24px var(--shadow-heavy)`
          : '0 2px 8px var(--shadow)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        zIndex: hovered ? 10 : 1,
      }}
    >
      <div
        className="font-serif text-[13px] font-semibold"
        style={{ color: 'var(--text)' }}
      >
        {label}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
        {perspectives?.join(' · ') || nodeType}
        {weight ? ` · ${weight}` : ''}
      </div>

      {/* 悬停展开 */}
      {hovered && (data as unknown as XenicaNodeData).raw && (
        <div
          className="mt-2 pt-2 text-xs leading-relaxed"
          style={{
            borderTop: '1px solid var(--border)',
            color: 'var(--text-muted)',
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {String(
            (data as unknown as XenicaNodeData).raw.refined ||
            (data as unknown as XenicaNodeData).raw.description ||
            (data as unknown as XenicaNodeData).raw.raw_input ||
            ''
          ).slice(0, 100)}
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </motion.div>
  )
}

export default memo(XenicaNode)
