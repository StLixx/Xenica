import { memo } from 'react'
import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react'

function XenicaEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  data,
}: EdgeProps) {
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  const relationType = (data as Record<string, unknown>)?.relationType as string || 'semantic'

  // 演化边：添加箭头标记
  const markerId = relationType === 'evolution' ? `arrow-${id}` : undefined

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
      <BaseEdge
        id={id}
        path={edgePath}
        style={style}
        markerEnd={markerId ? `url(#${markerId})` : undefined}
      />
    </>
  )
}

export default memo(XenicaEdge)
