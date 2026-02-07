import { useState, useRef, useEffect } from 'react'
import { X, MapPin, Clock, Plus, Camera, Image, Loader2 } from 'lucide-react'
import { useAppStore } from '../stores/app'
import { useOfflineStore } from '../stores/offline'
import { createMoment, checkHealth, ocrImage } from '../lib/api'
import VoiceMicButton from './VoiceMicButton'

export default function QuickRecord() {
  const { quickRecordOpen, setQuickRecordOpen, activityTags, addActivityTag, online, setOnline } = useAppStore()
  const { addToQueue } = useOfflineStore()
  const [text, setText] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customTag, setCustomTag] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // OCR 相关状态
  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrPreview, setOcrPreview] = useState<string | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [showImageOptions, setShowImageOptions] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const albumInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (quickRecordOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [quickRecordOpen])

  // 清理图片预览 URL
  useEffect(() => {
    return () => {
      if (ocrPreview) URL.revokeObjectURL(ocrPreview)
    }
  }, [ocrPreview])

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

  const handleImageSelect = (file: File) => {
    setOcrFile(file)
    setOcrPreview(URL.createObjectURL(file))
    setOcrError(null)
    setShowImageOptions(false)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImageSelect(file)
    e.target.value = '' // 重置，允许重复选择同一文件
  }

  const handleOcrRecognize = async () => {
    if (!ocrFile) return
    setOcrLoading(true)
    setOcrError(null)
    try {
      const result = await ocrImage(ocrFile)
      if (result.text) {
        setText((prev) => (prev ? prev + '\n' + result.text : result.text))
      } else {
        setOcrError('未识别到文字')
      }
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : 'OCR 识别失败')
    } finally {
      setOcrLoading(false)
    }
  }

  const clearImage = () => {
    if (ocrPreview) URL.revokeObjectURL(ocrPreview)
    setOcrFile(null)
    setOcrPreview(null)
    setOcrError(null)
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
    clearImage()
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

        {/* 拍照/上传区域 */}
        <div className="qr-ocr-area">
          {ocrPreview ? (
            <div className="qr-ocr-preview">
              <div className="qr-ocr-preview-img-wrap">
                <img src={ocrPreview} alt="预览" className="qr-ocr-preview-img" />
                <button className="qr-ocr-preview-remove" onClick={clearImage} title="移除图片">
                  <X size={14} />
                </button>
              </div>
              <button
                className="qr-ocr-recognize-btn"
                onClick={handleOcrRecognize}
                disabled={ocrLoading}
              >
                {ocrLoading ? (
                  <>
                    <Loader2 size={14} className="spin" /> 识别中…
                  </>
                ) : (
                  '识别文字'
                )}
              </button>
              {ocrError && <span className="qr-ocr-error">{ocrError}</span>}
            </div>
          ) : (
            <div className="qr-ocr-buttons">
              <button
                className="qr-ocr-btn"
                onClick={() => setShowImageOptions(!showImageOptions)}
              >
                <Camera size={16} />
                拍照 / 上传
              </button>
              {showImageOptions && (
                <div className="qr-ocr-options">
                  <button
                    className="qr-ocr-option"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera size={14} /> 拍照
                  </button>
                  <button
                    className="qr-ocr-option"
                    onClick={() => albumInputRef.current?.click()}
                  >
                    <Image size={14} /> 从相册选择
                  </button>
                </div>
              )}
            </div>
          )}
          {/* 隐藏的文件输入 */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <input
            ref={albumInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        <div className="qr-input-wrap" style={{ position: 'relative' }}>
          <textarea
            ref={inputRef}
            className="qr-input"
            placeholder="输入想法…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
          />
          <div style={{ position: 'absolute', right: 8, bottom: 8 }}>
            <VoiceMicButton
              onTranscript={(t) => setText((prev) => prev + t)}
              size={28}
              rounded
            />
          </div>
        </div>

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
