import { Bell, Settings, Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../stores/theme'
import { useAppStore } from '../stores/app'
import { useNotificationStore } from '../stores/notification'

export default function TopBar() {
  const { mode, toggleMode } = useThemeStore()
  const { toggleSettings, online } = useAppStore()
  const { unreadCount, dueReviewCount, toggle: toggleNotifications } = useNotificationStore()
  const totalBadge = unreadCount + dueReviewCount

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title font-serif">Xenica</h1>
        {!online && (
          <span className="topbar-offline">离线</span>
        )}
      </div>
      <div className="topbar-actions">
        <button onClick={toggleMode} className="topbar-btn" title={mode === 'dark' ? '切换浅色' : '切换深色'}>
          {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button onClick={toggleNotifications} className="topbar-btn topbar-bell" title="通知">
          <Bell size={18} />
          {totalBadge > 0 && (
            <span className="topbar-badge">{totalBadge}</span>
          )}
        </button>
        <button onClick={toggleSettings} className="topbar-btn" title="设置">
          <Settings size={18} />
        </button>
      </div>
    </header>
  )
}
