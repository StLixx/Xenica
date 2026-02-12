import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { listMoments } from '../lib/api'
import { timeAgo } from '../lib/timeago'
import type { Moment } from '../lib/types'

const PERSPECTIVE_COLORS: Record<string, string> = {
  洞察: 'var(--primary)',
  任务: 'var(--accent-blue)',
  疑问: 'var(--accent-rose)',
  素材: 'var(--accent-green)',
  灵感: 'var(--accent-sand)',
}

function getPerspectiveColor(name: string): string {
  return PERSPECTIVE_COLORS[name] || 'var(--text-muted)'
}

function MomentCard({ moment }: { moment: Moment }) {
  const [expanded, setExpanded] = useState(false)
  const summary = moment.raw_input.length > 100
    ? moment.raw_input.slice(0, 100) + '…'
    : moment.raw_input

  return (
    <div className="timeline-card" onClick={() => setExpanded(!expanded)}>
      <div className="timeline-card-header">
        <span className="timeline-time">{timeAgo(moment.timestamp)}</span>
        <div className="timeline-meta">
          {moment.perspectives.length > 0 && (
            <div className="timeline-tags">
              {moment.perspectives.map((p) => (
                <span key={p} className="perspective-tag" style={{ '--tag-color': getPerspectiveColor(p) } as React.CSSProperties}>{p}</span>
              ))}
            </div>
          )}
          <span className="timeline-connections">
            <Link2 size={12} />
            {moment.weight > 0 ? Math.round(moment.weight / 10) : 0} 条连接
          </span>
        </div>
      </div>

      <p className="timeline-summary">{expanded ? moment.raw_input : summary}</p>

      {moment.refined && expanded && (
        <p className="timeline-refined"><strong>精炼：</strong>{moment.refined}</p>
      )}

      {moment.raw_input.length > 100 && (
        <button className="timeline-expand-btn">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? '收起' : '展开'}
        </button>
      )}
    </div>
  )
}

export default function Timeline() {
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    listMoments({ limit: 50 })
      .then(setMoments)
      .catch(() => setMoments([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="view-empty"><div className="loading-dots"><span /><span /><span /></div></div>
  }

  if (moments.length === 0) {
    return (
      <div className="view-empty">
        <p className="view-empty-text">还没有认知瞬间</p>
        <p className="view-empty-sub">开始对话或快速记录来创建第一个</p>
      </div>
    )
  }

  return (
    <div className="timeline-view">
      <div className="timeline-list">
        {moments.map((m, i) => <MomentCard key={`${m.id}-${i}`} moment={m} />)}
      </div>
    </div>
  )
}
