import { useState, useEffect, useCallback } from 'react'
import { X, FileText, Link2, RotateCcw, Loader2, Code, Layers } from 'lucide-react'
import { useNotificationStore } from '../stores/notification'
import { useAppStore } from '../stores/app'
import { listMoments, listDueReviews, respondReview, listCommanderLogs } from '../lib/api'
import { timeAgo } from '../lib/timeago'
import type { Moment, ReviewDueItem, ReviewResponse } from '../lib/types'

type Tab = 'expand' | 'confirm' | 'review' | 'commander'

const tabs: Array<{ id: Tab; label: string; icon: typeof FileText }> = [
  { id: 'expand', label: '待展开', icon: FileText },
  { id: 'confirm', label: '待确认', icon: Link2 },
  { id: 'review', label: '待复习', icon: RotateCcw },
  { id: 'commander', label: 'Commander', icon: Code },
]

const reviewButtons: Array<{ response: ReviewResponse; label: string; className: string }> = [
  { response: 'again', label: '重来', className: 'review-btn-again' },
  { response: 'hard', label: '困难', className: 'review-btn-hard' },
  { response: 'good', label: '良好', className: 'review-btn-good' },
  { response: 'easy', label: '简单', className: 'review-btn-easy' },
]

export default function NotificationPanel() {
  const { isOpen, close: closeNotifications } = useNotificationStore()
  const { online } = useAppStore()
  const [activeTab, setActiveTab] = useState<Tab>('expand')
  const [unextracted, setUnextracted] = useState<Moment[]>([])
  const [loading, setLoading] = useState(false)

  // X6: 待复习数据
  const [dueReviews, setDueReviews] = useState<ReviewDueItem[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)

  // X8: Commander 日志
  const [commanderLogs, setCommanderLogs] = useState<Moment[]>([])
  const [commanderLoading, setCommanderLoading] = useState(false)

  // 加载待展开
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

  // X6: 加载待复习
  const loadReviews = useCallback(() => {
    if (!online) return
    setReviewLoading(true)
    listDueReviews()
      .then(setDueReviews)
      .catch(() => setDueReviews([]))
      .finally(() => setReviewLoading(false))
  }, [online])

  useEffect(() => {
    if (isOpen && online && activeTab === 'review') {
      loadReviews()
    }
  }, [isOpen, activeTab, online, loadReviews])

  // X8: 加载 Commander 日志
  const loadCommanderLogs = useCallback(() => {
    if (!online) return
    setCommanderLoading(true)
    listCommanderLogs(30)
      .then(setCommanderLogs)
      .catch(() => setCommanderLogs([]))
      .finally(() => setCommanderLoading(false))
  }, [online])

  useEffect(() => {
    if (isOpen && online && activeTab === 'commander') {
      loadCommanderLogs()
    }
  }, [isOpen, activeTab, online, loadCommanderLogs])

  // X6: 用户反馈
  const handleReviewRespond = async (reviewId: string, response: ReviewResponse) => {
    // reviewId 格式可能是 "review_schedule:xxx"，需要提取纯 ID
    const pureId = reviewId.includes(':') ? reviewId.split(':')[1] : reviewId
    setRespondingId(reviewId)
    try {
      await respondReview(pureId, response)
      // 从列表中移除已回复的项
      setDueReviews((prev) => prev.filter((r) => {
        const rId = typeof r.id === 'object' ? JSON.stringify(r.id) : r.id
        return rId !== reviewId
      }))
    } catch (e) {
      console.error('复习反馈失败:', e)
    } finally {
      setRespondingId(null)
    }
  }

  if (!isOpen) return null

  // Mock 数据（X8 接入后替换）
  const mockConfirmations = [
    { id: '1', text: 'AI 建议关联「认知负荷」与「注意力分配」', time: '2 小时前' },
    { id: '2', text: 'AI 建议关联「涌现性」与「复杂系统」', time: '5 小时前' },
  ]

  // 提取 review ID 字符串
  const getReviewId = (item: ReviewDueItem): string => {
    if (typeof item.id === 'object' && item.id !== null) {
      return JSON.stringify(item.id)
    }
    return String(item.id)
  }

  // 复习次数描述
  const reviewLabel = (count: number): string => {
    if (count === 0) return '首次复习'
    return `第 ${count + 1} 次复习`
  }

  // X8: 按日期分组 Commander 日志
  const groupLogsByDate = (logs: Moment[]): Map<string, Moment[]> => {
    const groups = new Map<string, Moment[]>()
    for (const log of logs) {
      const date = log.trigger?.replace('Commander 日志 ', '') ||
        new Date(log.timestamp).toISOString().slice(0, 10)
      const existing = groups.get(date) || []
      existing.push(log)
      groups.set(date, existing)
    }
    return groups
  }

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
              {id === 'review' && dueReviews.length > 0 && (
                <span className="notif-badge">{dueReviews.length}</span>
              )}
              {id === 'commander' && commanderLogs.length > 0 && (
                <span className="notif-badge commander-badge">{commanderLogs.length}</span>
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
                {unextracted.map((m, i) => (
                  <li key={`${m.id}-${i}`} className="notif-item">
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
            reviewLoading ? (
              <div className="notif-loading">加载中…</div>
            ) : dueReviews.length === 0 ? (
              <div className="notif-empty">没有待复习的内容</div>
            ) : (
              <>
              {/* X6M3: 开始刷题入口 */}
              <button
                className="notif-review-start"
                onClick={() => {
                  closeNotifications()
                  useAppStore.getState().setReviewCardsOpen(true)
                }}
              >
                <Layers size={16} />
                开始刷题（{dueReviews.length} 张卡片）
              </button>
              <ul className="notif-list">
                {dueReviews.map((item) => {
                  const rid = getReviewId(item)
                  const isResponding = respondingId === rid
                  return (
                    <li key={rid} className="notif-item review-card">
                      <RotateCcw size={14} className="notif-item-icon" />
                      <div className="notif-item-body">
                        <p className="notif-item-text">
                          {item.moment_text || '(未知内容)'}
                        </p>
                        <span className="notif-item-time">
                          {reviewLabel(item.review_count)} · 间隔 {Math.round(item.interval)} 天
                        </span>
                        <div className="review-actions">
                          {reviewButtons.map(({ response, label, className }) => (
                            <button
                              key={response}
                              className={`review-respond-btn ${className}`}
                              disabled={isResponding}
                              onClick={() => handleReviewRespond(rid, response)}
                            >
                              {isResponding ? <Loader2 size={12} className="spin" /> : label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              </>
            )
          )}

          {/* X8: Commander 汇报 */}
          {activeTab === 'commander' && (
            commanderLoading ? (
              <div className="notif-loading">加载中…</div>
            ) : commanderLogs.length === 0 ? (
              <div className="notif-empty">没有 Commander 开发日志</div>
            ) : (
              <div className="commander-log-groups">
                {Array.from(groupLogsByDate(commanderLogs)).map(([date, logs]) => (
                  <div key={date} className="commander-log-group">
                    <div className="commander-log-date">
                      <Code size={12} />
                      <span>{date}</span>
                    </div>
                    <ul className="notif-list">
                      {logs.map((log, i) => (
                        <li key={`${log.id}-${i}`} className="notif-item commander-item">
                          <div className="commander-dot" />
                          <div className="notif-item-body">
                            <p className="notif-item-text commander-text">
                              {log.raw_input.slice(0, 120)}{log.raw_input.length > 120 ? '…' : ''}
                            </p>
                            <span className="notif-item-time">{timeAgo(log.timestamp)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
