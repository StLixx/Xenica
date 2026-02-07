import { useState, useRef, useEffect } from 'react'
import { X, MapPin, Clock, Plus } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { useOfflineStore } from '../stores/offline'
import { createMoment, checkHealth } from '../lib/api'

export default function QuickRecord() {
  const { quickRecordOpen, setQuickRecordOpen, activityTags, addActivityTag, online, setOnline } = useAppStore()
  const { addToQueue } = useOfflineStore()
  const [text, setText] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customTag, setCustomTag] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (quickRecordOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [quickRecordOpen])

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const addCustom = () => {
    const trimmed = customTag.trim()
    if (trimmed && !activityTags.includes(trimmed)) {
      addActivityTag(trimmed)
      setSelectedTags((prev) => [...prev, trimmed])
    }
    setCustomTag('')
    setShowCustom(false)
  }

  const handleSave = async () => {
    if (!text.trim()) return
    setSaving(true)

    const now = new Date().toISOString()
    const trigger = selectedTags.length > 0 ? selectedTags.join('、') : undefined

    const isOnline = await checkHealth()
    setOnline(isOnline)

    if (isOnline) {
      try {
        await createMoment({
          raw_input: text.trim(),
          trigger,
          perspectives: [],
        })
      } catch {
        addToQueue({ raw_input: text.trim(), trigger, perspectives: [], timestamp: now })
      }
    } else {
      addToQueue({ raw_input: text.trim(), trigger, perspectives: [], timestamp: now })
    }

    setText('')
    setSelectedTags([])
    setSaving(false)
    setQuickRecordOpen(false)
  }

  if (!quickRecordOpen) return null

  return (
    <div className="quick-record-overlay" onClick={() => setQuickRecordOpen(false)}>
      <div className="quick-record-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-header">
          <h2 className="qr-title font-serif">快速记录</h2>
          <button className="qr-close" onClick={() => setQuickRecordOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <textarea
          ref={inputRef}
          className="qr-input"
          placeholder="输入想法…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />

        <div className="qr-section">
          <span className="qr-label">在做什么：</span>
          <div className="qr-tags">
            {activityTags.map((tag) => (
              <button
                key={tag}
                className={`qr-tag ${selectedTags.includes(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
            {showCustom ? (
              <span className="qr-custom-input-wrap">
                <input
                  className="qr-custom-input"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustom()}
                  placeholder="自定义…"
                  autoFocus
                />
                <button className="qr-custom-confirm" onClick={addCustom}>
                  <Plus size={14} />
                </button>
              </span>
            ) : (
              <button className="qr-tag qr-tag-add" onClick={() => setShowCustom(true)}>
                <Plus size={14} /> 自定义
              </button>
            )}
          </div>
        </div>

        <div className="qr-auto">
          <span className="qr-auto-item"><MapPin size={14} /> 自动定位</span>
          <span className="qr-auto-item"><Clock size={14} /> 自动时间</span>
        </div>

        <button className="qr-save" onClick={handleSave} disabled={!text.trim() || saving}>
          {saving ? '保存中…' : online ? '保存' : '保存（离线）'}
        </button>
      </div>
    </div>
  )
}
