import { useState } from 'react'
import { Network, MessageCircle, Search, Clock, Layers, Settings, Bell } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { useNotificationStore } from '../stores/notification'
import { useGraphStore } from '../stores/graph'
import type { ViewType } from '../lib/types'

interface BottomNavProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  onSearchOpen: () => void
}

export default function BottomNav({ currentView, onViewChange, onSearchOpen }: BottomNavProps) {
  const { toggleSettings, setReviewCardsOpen } = useAppStore()
  const { unreadCount, dueReviewCount, toggle: toggleNotifications } = useNotificationStore()
  const totalBadge = unreadCount + dueReviewCount
  const stats = useGraphStore((s) => s.stats)
  const [showStats, setShowStats] = useState(false)

  const navItems: { view: ViewType; icon: typeof Network; label: string }[] = [
    { view: 'graph', icon: Network, label: '图谱' },
    { view: 'timeline', icon: Clock, label: '时间线' },
    { view: 'list', icon: MessageCircle, label: '列表' },
  ]

  return (
    <nav className="bottom-nav">
      {/* 品牌 */}
      <span className="bottom-nav-brand">Xenica</span>

      {/* 视图切换 */}
      {navItems.map(({ view, icon: Icon, label }) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          className={`bottom-nav-item ${currentView === view ? 'active' : ''}`}
        >
          <Icon size={14} className="bottom-nav-icon" />
          {label}
        </button>
      ))}

      {/* 搜索按钮 */}
      <button onClick={onSearchOpen} className="bottom-nav-item">
        <Search size={14} className="bottom-nav-icon" />
        搜索
      </button>

      <div className="bottom-nav-spacer" />

      {/* X6M3: 刷题入口 */}
      {dueReviewCount > 0 && (
        <button
          onClick={() => setReviewCardsOpen(true)}
          className="bottom-nav-review"
          title={`${dueReviewCount} 条待复习`}
        >
          <Layers size={13} />
          复习 {dueReviewCount}
        </button>
      )}

      {/* 通知 */}
      <button
        onClick={toggleNotifications}
        className="bottom-nav-action"
        title="通知"
      >
        <Bell size={14} />
        {totalBadge > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--primary)',
              color: 'var(--bg)',
              fontSize: '8px',
            }}
          >
            {totalBadge}
          </span>
        )}
      </button>

      {/* 设置 */}
      <button
        onClick={toggleSettings}
        className="bottom-nav-action"
        title="设置"
      >
        <Settings size={14} />
      </button>

      {/* 状态指示点 */}
      <div
        className="relative flex items-center"
        style={{ marginLeft: '4px' }}
        onMouseEnter={() => setShowStats(true)}
        onMouseLeave={() => setShowStats(false)}
      >
        <div className="bottom-nav-status-dot" />
        {showStats && stats && (
          <div
            className="absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              boxShadow: '0 4px 16px var(--shadow-heavy)',
              color: 'var(--text-dim)',
            }}
          >
            {stats.total_moments + stats.total_entities} 个节点 · {stats.total_edges} 条边
          </div>
        )}
      </div>
    </nav>
  )
}
