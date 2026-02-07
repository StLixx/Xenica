import { Network, MessageCircle, Search, Clock, Bell, Sun, Moon, Palette } from 'lucide-react'
import { useThemeStore } from '../stores/theme'
import { useNotificationStore } from '../stores/notification'
import { useGraphStore } from '../stores/graph'
import { themeLabels } from '../lib/theme'
import type { ViewType } from '../lib/types'

interface BottomNavProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  onSearchOpen: () => void
}

export default function BottomNav({ currentView, onViewChange, onSearchOpen }: BottomNavProps) {
  const { theme, mode, toggleMode, cycleTheme } = useThemeStore()
  const { unreadCount, toggle: toggleNotifications } = useNotificationStore()
  const stats = useGraphStore((s) => s.stats)

  const navItems: { view: ViewType; icon: typeof Network; label: string }[] = [
    { view: 'graph', icon: Network, label: '图谱' },
    { view: 'timeline', icon: Clock, label: '时间线' },
    { view: 'list', icon: MessageCircle, label: '列表' },
  ]

  return (
    <div
      className="flex items-center px-5 gap-2 shrink-0"
      style={{
        height: 52,
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
      }}
    >
      {/* 品牌 */}
      <span
        className="font-serif font-bold mr-6"
        style={{ color: 'var(--primary)', fontSize: '16px', letterSpacing: '0.03em' }}
      >
        Xenica
      </span>

      {/* 视图切换 */}
      {navItems.map(({ view, icon: Icon, label }) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all"
          style={{
            color: currentView === view ? 'var(--primary)' : 'var(--text-muted)',
            background: currentView === view ? 'var(--primary-muted)' : 'transparent',
            fontWeight: currentView === view ? 500 : 400,
            fontSize: '13px',
          }}
        >
          <Icon size={14} style={{ opacity: 0.7 }} />
          {label}
        </button>
      ))}

      {/* 搜索按钮 */}
      <button
        onClick={onSearchOpen}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all"
        style={{ color: 'var(--text-muted)', fontSize: '13px' }}
      >
        <Search size={14} style={{ opacity: 0.7 }} />
        搜索
        <kbd
          className="ml-1 px-1.5 py-0.5 text-xs rounded"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            fontSize: 10,
          }}
        >
          Ctrl+K
        </kbd>
      </button>

      <div className="flex-1" />

      {/* 主题切换 */}
      <button
        onClick={cycleTheme}
        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-all"
        style={{ color: 'var(--text-muted)' }}
        title={`当前：${themeLabels[theme]}`}
      >
        <Palette size={13} />
        <span style={{ opacity: 0.6 }}>{themeLabels[theme]}</span>
      </button>

      <button
        onClick={toggleMode}
        className="flex items-center px-2 py-1.5 rounded-md transition-all"
        style={{ color: 'var(--text-muted)' }}
        title={mode === 'dark' ? '切换到浅色' : '切换到深色'}
      >
        {mode === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      {/* 通知 */}
      <button
        onClick={toggleNotifications}
        className="relative flex items-center px-2 py-1.5 rounded-md transition-all"
        style={{ color: 'var(--text-muted)' }}
      >
        <Bell size={14} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-xs flex items-center justify-center"
            style={{ background: 'var(--primary)', color: 'var(--bg)', fontSize: 9 }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {/* 状态 */}
      {stats && (
        <div className="flex items-center gap-1.5 ml-2 text-xs" style={{ color: 'var(--text-dim)' }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-green)' }} />
          {stats.total_moments + stats.total_entities} 个节点 · {stats.total_edges} 条边
        </div>
      )}
    </div>
  )
}
