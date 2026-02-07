import { useState, useEffect } from 'react'
import { listPerspectives, listMoments } from '../lib/api'
import { timeAgo } from '../lib/timeago'
import type { Moment, Perspective } from '../lib/types'

export default function ListView() {
  const [perspectives, setPerspectives] = useState<Perspective[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [momentsLoading, setMomentsLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    listPerspectives()
      .then((res) => {
        setPerspectives(res.perspectives)
        if (res.perspectives.length > 0) setSelected(res.perspectives[0].name)
      })
      .catch(() => setPerspectives([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setMomentsLoading(true)
    listMoments({ perspective: selected, limit: 50 })
      .then(setMoments)
      .catch(() => setMoments([]))
      .finally(() => setMomentsLoading(false))
  }, [selected])

  if (loading) {
    return <div className="view-empty"><div className="loading-dots"><span /><span /><span /></div></div>
  }

  if (perspectives.length === 0) {
    return (
      <div className="view-empty">
        <p className="view-empty-text">还没有视角标签</p>
        <p className="view-empty-sub">AI 会在对话中自动提取视角标签</p>
      </div>
    )
  }

  return (
    <div className="list-view">
      <aside className="list-sidebar">
        <h3 className="list-sidebar-title font-serif">视角</h3>
        <ul className="list-sidebar-tags">
          {perspectives.map((p) => (
            <li key={p.name}>
              <button className={`list-tag-btn ${selected === p.name ? 'active' : ''}`} onClick={() => setSelected(p.name)}>
                <span className="list-tag-name">{p.name}</span>
                <span className="list-tag-count">{p.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="list-content">
        <h3 className="list-content-title font-serif">
          {selected}
          <span className="list-content-count">{moments.length} 条</span>
        </h3>

        {momentsLoading ? (
          <div className="view-empty"><div className="loading-dots"><span /><span /><span /></div></div>
        ) : moments.length === 0 ? (
          <p className="list-content-empty">该标签下暂无内容</p>
        ) : (
          <div className="list-moment-cards">
            {moments.map((m) => (
              <div key={m.id} className="list-moment-card">
                <p className="list-moment-text">{m.refined || m.raw_input}</p>
                <div className="list-moment-meta">
                  <span>{timeAgo(m.timestamp)}</span>
                  {m.perspectives.filter((p) => p !== selected).map((p) => (
                    <span key={p} className="perspective-tag-sm">{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
