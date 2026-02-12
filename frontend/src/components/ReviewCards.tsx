import { useState, useEffect, useCallback } from 'react'
import { X, RotateCcw, Loader2, Layers } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { useNotificationStore } from '../stores/notification'
import { listDueReviews, getMoment, respondReview, graphTraverse } from '../lib/api'
import type { ReviewDueItem, ReviewResponse, Moment } from '../lib/types'

interface CardData {
  reviewId: string
  momentId: string
  raw_input: string
  refined?: string
  perspectives: string[]
  entities: Array<{ id: string; name: string; type: string }>
  reviewCount: number
  interval: number
}

const feedbackButtons: Array<{ response: ReviewResponse; label: string; className: string }> = [
  { response: 'again', label: '重来', className: 'review-btn-again' },
  { response: 'hard', label: '困难', className: 'review-btn-hard' },
  { response: 'good', label: '良好', className: 'review-btn-good' },
  { response: 'easy', label: '简单', className: 'review-btn-easy' },
]

/** 从 SurrealDB Thing（对象或字符串）中提取纯 ID */
function extractId(thing: unknown): string {
  if (thing === null || thing === undefined) return ''

  // 对象格式：{tb: "table", id: "xxx"}
  if (typeof thing === 'object') {
    const obj = thing as Record<string, unknown>
    const id = obj.id
    if (typeof id === 'string') return id
    if (typeof id === 'object' && id !== null) {
      const inner = id as Record<string, unknown>
      return String(inner.String || inner.string || Object.values(inner)[0] || '')
    }
    return ''
  }

  // 字符串格式："table:id"
  const str = String(thing)
  if (str.includes(':')) {
    return str.split(':').slice(1).join(':')
  }
  return str
}

export default function ReviewCards() {
  const { reviewCardsOpen, setReviewCardsOpen } = useAppStore()
  const { loadDueReviewCount } = useNotificationStore()

  const [cards, setCards] = useState<CardData[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState(false)
  const [completed, setCompleted] = useState(false)

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true)
    setCurrentIndex(0)
    setFlipped(false)
    setCompleted(false)
    setCards([])

    try {
      const dueItems = await listDueReviews()
      if (dueItems.length === 0) {
        setCompleted(true)
        setLoading(false)
        return
      }

      const cardData: CardData[] = []

      for (const item of dueItems) {
        const momentId = extractId(item.moment_id)
        const reviewId = extractId(item.id)

        try {
          const moment: Moment = await getMoment(momentId)

          // 尝试获取关联实体
          let entities: Array<{ id: string; name: string; type: string }> = []
          try {
            const graphData = await graphTraverse(momentId, 1)
            entities = graphData.nodes
              .filter((n) => n.type === 'entity')
              .map((n) => ({
                id: n.id,
                name: n.name || n.label || '',
                type: n.entity_type || '',
              }))
          } catch {
            // 图遍历可能失败，跳过实体
          }

          cardData.push({
            reviewId,
            momentId,
            raw_input: moment.raw_input,
            refined: moment.refined,
            perspectives: moment.perspectives || [],
            entities,
            reviewCount: item.review_count,
            interval: item.interval,
          })
        } catch {
          console.warn(`无法加载 moment ${momentId}，跳过`)
        }
      }

      setCards(cardData)
      if (cardData.length === 0) {
        setCompleted(true)
      }
    } catch (e) {
      console.error('加载复习数据失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // 打开时加载
  useEffect(() => {
    if (reviewCardsOpen) {
      loadData()
    }
  }, [reviewCardsOpen, loadData])

  // 点击翻转
  const handleFlip = () => {
    if (!flipped) setFlipped(true)
  }

  // 提交反馈
  const handleRespond = async (response: ReviewResponse) => {
    if (responding) return
    const card = cards[currentIndex]
    if (!card) return

    setResponding(true)
    try {
      await respondReview(card.reviewId, response)
    } catch (e) {
      console.error('复习反馈失败:', e)
    } finally {
      setResponding(false)
    }

    // 下一张
    if (currentIndex + 1 < cards.length) {
      setCurrentIndex((prev) => prev + 1)
      setFlipped(false)
    } else {
      setCompleted(true)
      loadDueReviewCount()
    }
  }

  // 关闭
  const handleClose = () => {
    setReviewCardsOpen(false)
    loadDueReviewCount()
  }

  if (!reviewCardsOpen) return null

  const total = cards.length
  const progress = total > 0 ? ((currentIndex + (completed ? 1 : 0)) / total) * 100 : 0
  const currentCard = cards[currentIndex]

  return (
    <div className="rc-overlay" onClick={handleClose}>
      <div className="rc-container" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="rc-header">
          <div className="rc-title font-serif">
            <Layers size={18} />
            刷题模式
          </div>
          <button className="rc-close" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        {/* 进度条 */}
        {!loading && total > 0 && (
          <div className="rc-progress-wrap">
            <div className="rc-progress-bar">
              <div className="rc-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="rc-progress-text">
              {completed ? total : currentIndex + 1} / {total}
            </span>
          </div>
        )}

        {/* 主体 */}
        <div className="rc-body">
          {loading ? (
            <div className="rc-loading">
              <Loader2 size={32} className="spin" />
              <p>正在加载复习卡片…</p>
            </div>
          ) : completed ? (
            <div className="rc-done">
              <div className="rc-done-emoji">🎉</div>
              <h3 className="font-serif">今日复习完成</h3>
              <p>已复习 {total} 张卡片</p>
              <button className="rc-done-btn" onClick={handleClose}>
                返回
              </button>
            </div>
          ) : currentCard ? (
            <>
              {/* 卡片 */}
              <div
                className={`fc-scene ${flipped ? 'fc-flipped' : ''}`}
                onClick={handleFlip}
              >
                <div className="fc-card">
                  {/* 正面：原始记录 */}
                  <div className="fc-face fc-front">
                    <div className="fc-label">原始记录</div>
                    <div className="fc-content font-serif">{currentCard.raw_input}</div>
                    <div className="fc-hint">点击翻转 →</div>
                  </div>

                  {/* 背面：精炼版 + 实体 + 视角 */}
                  <div className="fc-face fc-back">
                    {currentCard.refined && currentCard.refined !== currentCard.raw_input ? (
                      <div className="fc-section">
                        <div className="fc-label">精炼版</div>
                        <div className="fc-refined">{currentCard.refined}</div>
                      </div>
                    ) : (
                      <div className="fc-section">
                        <div className="fc-label">内容</div>
                        <div className="fc-refined">{currentCard.raw_input}</div>
                      </div>
                    )}

                    {currentCard.entities.length > 0 && (
                      <div className="fc-section">
                        <div className="fc-label">关联实体</div>
                        <div className="fc-tags">
                          {currentCard.entities.map((e, ei) => (
                            <span key={`${e.id}-${ei}`} className="fc-tag fc-tag-entity">
                              {e.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentCard.perspectives.length > 0 && (
                      <div className="fc-section">
                        <div className="fc-label">视角</div>
                        <div className="fc-tags">
                          {currentCard.perspectives.map((p) => (
                            <span key={p} className="fc-tag fc-tag-perspective">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 反馈按钮（翻转后显示） */}
              {flipped && (
                <div className="fc-actions">
                  {feedbackButtons.map(({ response, label, className }) => (
                    <button
                      key={response}
                      className={`fc-btn ${className}`}
                      disabled={responding}
                      onClick={() => handleRespond(response)}
                    >
                      {responding ? <Loader2 size={14} className="spin" /> : label}
                    </button>
                  ))}
                </div>
              )}

              {/* 复习信息 */}
              <div className="fc-info">
                {currentCard.reviewCount === 0
                  ? '首次复习'
                  : `第 ${currentCard.reviewCount + 1} 次复习`}
                {' · '}间隔 {Math.round(currentCard.interval)} 天
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
