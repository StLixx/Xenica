import { MessageSquare, Network, Search, Plus } from 'lucide-react'
import { useAppStore, type MobileTab } from '../stores/app'

const tabs: Array<{ id: MobileTab; label: string; icon: typeof MessageSquare }> = [
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'record', label: '记录', icon: Plus },
  { id: 'graph', label: '图谱', icon: Network },
  { id: 'search', label: '搜索', icon: Search },
]

export default function MobileTabBar() {
  const { mobileTab, setMobileTab, setQuickRecordOpen } = useAppStore()

  const handleTab = (id: MobileTab) => {
    if (id === 'record') {
      setQuickRecordOpen(true)
    } else {
      setMobileTab(id)
    }
  }

  return (
    <nav className="mobile-tab-bar">
      {tabs.map(({ id, label, icon: Icon }) => {
        const isRecord = id === 'record'
        const isActive = !isRecord && mobileTab === id

        return (
          <button
            key={id}
            onClick={() => handleTab(id)}
            className={`tab-item ${isActive ? 'active' : ''} ${isRecord ? 'tab-record' : ''}`}
          >
            {isRecord ? (
              <span className="tab-record-btn">
                <Icon size={22} strokeWidth={2.5} />
              </span>
            ) : (
              <>
                <Icon size={20} />
                <span className="tab-label">{label}</span>
              </>
            )}
          </button>
        )
      })}
    </nav>
  )
}
