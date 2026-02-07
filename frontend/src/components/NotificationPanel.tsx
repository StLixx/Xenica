import { useState, useEffect } from 'react'
import { X, FileText, Link2, RotateCcw } from 'lucide-react'
import { useNotificationStore } from '../stores/notification'
import { useAppStore } from '../stores/app'
import { listMoments } from '../lib/api'
import { timeAgo } from '../lib/timeago'
import type { Moment } from '../lib/types'

type Tab = 'expand' | 'confirm' | 'review'

const tabs: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: 'expand', label: '待展开', icon: FileText },
  { id: 'confirm', label: '待确认', icon: Link2 },
  { id: 'review', label: '待复习', icon: RotateCcw },
]

export default function NotificationPanel() {
  const { isOpen, close: closeNotifications } = useNotificationStore()
  const { online } = useAppStore()
  const [activeTab, setActiveTab] = useState<Tab>('expand')
  const [unextracted, setUnextracted] = useState<Moment[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && online && activeTab === 'expand') {
      setLoading(true)
      listMoments({ limit: 20 })
        .then((moments) => {
          setUnextracted(moments.filter((m) => !m.extracted))
        })
        .catch(() => setUnextracted([]))
        .finally(() => setLoading(false))
    }
  }, [isOpen, activeTab, online])

  if (!isOpen) return null

  // Mock 数据（X8 / X6 接入后替换）
  const mockConfirmations = [
    { id: '1', text: 'AI 建议关联「认知负荷」与「注意力分配」', time: '2 小时前' },
    { id: '2', text: 'AI 建议关联「涌现性」与「复杂系统」', time: '5 小时前' },
  ]

  const mockReviews = [
    { id: '1', text: '「符号与意义」— 首次复习', time: '今天' },
    { id: '2', text: '「工作记忆模型」— 第二次复习', time: '明天' },
  ]

  return (
    <div className="notification-overlay" onClick={closeNotifications}>
      <div className="notification-panel" onClick={(e) => e.stopPropagation()}>
        <div className="notif-header">
          <h2 className="notif-title font-serif">通知</h2>
          <button className="notif-close" onClick={closeNotifications}>
            <X size={18} />
          </button>
        </div>

        <div className="notif-tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`notif-tab ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} />
              {label}
              {id === 'expand' && unextracted.length > 0 && (
                <span className="notif-badge">{unextracted.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="notif-content">
          {activeTab === 'expand' && (
            loading ? (
              <div className="notif-loading">加载中…</div>
            ) : unextracted.length === 0 ? (
              <div className="notif-empty">没有待展开的碎片</div>
            ) : (
              <ul className="notif-list">
                {unextracted.map((m) => (
                  <li key={m.id} className="notif-item">
                    <FileText size={14} className="notif-item-icon" />
                    <div className="notif-item-body">
                      <p className="notif-item-text">
                        {m.raw_input.slice(0, 80)}{m.raw_input.length > 80 ? '…' : ''}
                      </p>
                      <span className="notif-item-time">{timeAgo(m.timestamp)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {activeTab === 'confirm' && (
            <ul className="notif-list">
              {mockConfirmations.map((item) => (
                <li key={item.id} className="notif-item">
                  <Link2 size={14} className="notif-item-icon" />
                  <div className="notif-item-body">
                    <p className="notif-item-text">{item.text}</p>
                    <span className="notif-item-time">{item.time}</span>
                  </div>
                  <div className="notif-item-actions">
                    <button className="notif-action-btn accept">确认</button>
                    <button className="notif-action-btn dismiss">忽略</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {activeTab === 'review' && (
            <ul className="notif-list">
              {mockReviews.map((item) => (
                <li key={item.id} className="notif-item">
                  <RotateCcw size={14} className="notif-item-icon" />
                  <div className="notif-item-body">
                    <p className="notif-item-text">{item.text}</p>
                    <span className="notif-item-time">{item.time}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
