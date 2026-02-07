import { memo } from 'react'
import { getStraightPath, type EdgeProps } from '@xyflow/react'

/**
 * 生成波浪线路径（感官边专用）
 */
function getWavyPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx
  const dy = ty - sy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 1) return `M ${sx} ${sy} L ${tx} ${ty}`

  const numWaves = Math.max(3, Math.round(dist / 35))
  const amp = 6

  // 单位方向向量
  const ux = dx / dist
  const uy = dy / dist
  // 垂直方向
  const px = -uy
  const py = ux

  let path = `M ${sx} ${sy}`
  const totalSegs = numWaves * 2

  for (let i = 0; i < totalSegs; i++) {
    const t1 = (i + 0.5) / totalSegs
    const t2 = (i + 1) / totalSegs
    const sign = i % 2 === 0 ? 1 : -1

    const cx = sx + dx * t1 + px * amp * sign
    const cy = sy + dy * t1 + py * amp * sign
    const ex = sx + dx * t2
    const ey = sy + dy * t2

    path += ` Q ${cx} ${cy} ${ex} ${ey}`
  }

  return path
}

function XenicaEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  data,
}: EdgeProps) {
  const relationType = (data as Record<string, unknown>)?.relationType as string || 'semantic'

  // 感官边使用波浪路径，其他使用直线
  const isSensory = relationType === 'sensory'
  const isEvolution = relationType === 'evolution'

  const edgePath = isSensory
    ? getWavyPath(sourceX, sourceY, targetX, targetY)
    : getStraightPath({ sourceX, sourceY, targetX, targetY })[0]

  // 演化边：添加箭头标记
  const markerId = isEvolution ? `arrow-${id}` : undefined

  return (
    <>
      {markerId && (
        <defs>
          <marker
            id={markerId}
            markerWidth="8"
            markerHeight="8"
            refX="8"
            refY="4"
            orient="auto"
          >
            <polygon
              points="0,0 8,4 0,8"
              fill={String(style.stroke) || '#8faa7b'}
              opacity={Number(style.opacity) || 0.7}
            />
          </marker>
        </defs>
      )}
      <path
        id={id}
        d={edgePath}
        fill="none"
        className="react-flow__edge-path"
        style={{
          ...style,
          // 感官边使用稍细的线宽和自己的 dash
          ...(isSensory ? { strokeDasharray: undefined } : {}),
        }}
        markerEnd={markerId ? `url(#${markerId})` : undefined}
      />
      {/* 透明的宽交互路径（方便悬停） */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />
    </>
  )
}

export default memo(XenicaEdge)
