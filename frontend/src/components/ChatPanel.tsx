import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, List, ChevronDown, Send, Loader2, Paperclip, Video, Image, Link, X, Copy, Check, Download } from 'lucide-react'
import { useChatStore } from '../stores/chat'
import type { ChatMessage } from '../stores/chat'
import type { GeneratedArticle } from '../lib/types'
import { useIsMobile } from '../hooks/useIsMobile'
import { ocrImage, importVideo } from '../lib/api'
import VoiceMicButton from './VoiceMicButton'

const MODEL_OPTIONS = [
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'claude-opus-4-6-thinking-fast', label: 'Claude Opus' },
  { value: 'gemini-2.5-flash', label: 'Gemini Flash' },
]

/** X7: 文章卡片组件 */
function ArticleCard({ article }: { article: GeneratedArticle }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const md = `# ${article.title}\n\n${article.content}`
    await navigator.clipboard.writeText(md)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [article])

  const handleDownload = useCallback(() => {
    const md = `# ${article.title}\n\n${article.content}`
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${article.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [article])

  return (
    <div
      className="rounded-xl p-5 mt-2"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px var(--shadow-light)',
      }}
    >
      {/* 标题 */}
      <h3
        className="font-serif font-bold mb-3"
        style={{ color: 'var(--text)', fontSize: '18px', lineHeight: 1.4 }}
      >
        {article.title}
      </h3>

      {/* 正文 */}
      <div
        className="text-sm leading-relaxed mb-4 whitespace-pre-wrap"
        style={{
          color: 'var(--text-secondary)',
          fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
          lineHeight: 1.8,
        }}
      >
        {article.content}
      </div>

      {/* 来源节点 */}
      {article.source_nodes.length > 0 && (
        <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
          来源节点：{article.source_nodes.length} 个
        </p>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{
            background: 'var(--primary-subtle)',
            color: copied ? 'var(--accent-green)' : 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? '已复制' : '复制'}
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
          style={{
            background: 'var(--primary-subtle)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <Download size={13} />
          下载 Markdown
        </button>
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const {
    messages,
    isLoading,
    model,
    conversationId,
    conversations,
    setModel,
    sendMessage,
    newConversation,
    loadConversations,
    selectConversation,
  } = useChatStore()

  const [input, setInput] = useState('')
  const [showModels, setShowModels] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [hoveredAnchor, setHoveredAnchor] = useState<number | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showVideoInput, setShowVideoInput] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoError, setVideoError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // 点击外部关闭附件菜单
  useEffect(() => {
    if (!showAttachMenu) return
    const handleClick = () => setShowAttachMenu(false)
    // 延迟绑定，避免本次点击立即触发
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [showAttachMenu])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    await sendMessage(text)
  }, [input, isLoading, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 图片上传 → 自动 OCR → 发送消息
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 重置
    if (!file || isLoading || ocrLoading) return

    setOcrLoading(true)
    try {
      const result = await ocrImage(file)
      if (result.text) {
        const ocrText = `[图片识别] ${result.text}`
        await sendMessage(ocrText)
      }
    } catch (err) {
      console.error('OCR 识别失败:', err)
    } finally {
      setOcrLoading(false)
    }
  }, [isLoading, ocrLoading, sendMessage])

  // 视频 URL 校验
  const isVideoUrl = (url: string) => {
    const trimmed = url.trim().toLowerCase()
    return (
      trimmed.includes('bilibili.com') ||
      trimmed.includes('b23.tv') ||
      trimmed.includes('youtube.com') ||
      trimmed.includes('youtu.be') ||
      trimmed.includes('douyin.com')
    )
  }

  // 视频导入
  const handleVideoImport = useCallback(async () => {
    const url = videoUrl.trim()
    if (!url || videoLoading || isLoading) return

    if (!isVideoUrl(url)) {
      setVideoError('请输入 B站、YouTube 或抖音的视频链接')
      return
    }

    setVideoError('')
    setVideoLoading(true)
    try {
      const result = await importVideo(url)
      if (result.transcript) {
        const msg = `[视频摘要] ${result.title}\n来源：${result.source_url}\n\n${result.transcript}`
        await sendMessage(msg)
      }
      setVideoUrl('')
      setShowVideoInput(false)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '视频内容提取失败'
      setVideoError(errorMsg)
    } finally {
      setVideoLoading(false)
    }
  }, [videoUrl, videoLoading, isLoading, sendMessage])

  // 对话轮次 = 用户消息数量
  const rounds = messages.filter((m) => m.role === 'user')

  const scrollToRound = (roundIndex: number) => {
    const userMessages = messagesContainerRef.current?.querySelectorAll('[data-role="user"]')
    if (userMessages && userMessages[roundIndex]) {
      userMessages[roundIndex].scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setHoveredAnchor(null)
  }

  return (
    <div
      className="flex flex-col h-full relative"
      style={{
        background: 'var(--bg)',
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
      }}
    >
      {/* 头部 */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{
          padding: isMobile ? '8px 16px' : '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          className="font-serif"
          style={{
            color: 'var(--text)',
            fontSize: '16px',
            fontWeight: 600,
          }}
        >
          对话
        </span>

        <div className="flex items-center gap-2">
          {/* 模型选择 — 更淡更克制 */}
          <div className="relative">
            <button
              onClick={() => setShowModels(!showModels)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
              style={{
                color: 'var(--text-dim)',
                background: 'transparent',
                fontSize: '11px',
              }}
            >
              {MODEL_OPTIONS.find((m) => m.value === model)?.label}
              <ChevronDown size={8} style={{ opacity: 0.5 }} />
            </button>

            {showModels && (
              <div
                className="absolute top-full right-0 mt-1 rounded-lg py-1 z-50 min-w-[160px]"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 32px var(--shadow-heavy)',
                }}
              >
                {MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setModel(opt.value)
                      setShowModels(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm transition-all"
                    style={{
                      color: model === opt.value ? 'var(--primary)' : 'var(--text-secondary)',
                      background: model === opt.value ? 'var(--primary-subtle)' : 'transparent',
                      borderRadius: '6px',
                    }}
                    onMouseEnter={(e) => {
                      if (model !== opt.value) e.currentTarget.style.background = 'var(--primary-subtle)'
                    }}
                    onMouseLeave={(e) => {
                      if (model !== opt.value) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={newConversation}
            className="chat-action-btn"
            title="新对话"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="chat-action-btn"
            title="对话历史"
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* 对话历史下拉 */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden shrink-0"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <div className="max-h-48 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <p className="text-center py-4 text-xs" style={{ color: 'var(--text-dim)' }}>
                  暂无对话
                </p>
              ) : (
                conversations.map((conv, idx) => {
                  // SurrealDB may return ID as object {tb, id: {String: "xxx"}} or string "conversation:xxx"
                  const cid = typeof conv.id === 'string'
                    ? conv.id
                    : typeof conv.id === 'object' && conv.id !== null
                      ? `${(conv.id as Record<string, unknown>).tb}:${
                          typeof (conv.id as Record<string, unknown>).id === 'object'
                            ? Object.values((conv.id as Record<string, unknown>).id as Record<string, unknown>)[0]
                            : (conv.id as Record<string, unknown>).id
                        }`
                      : String(conv.id)
                  const isActive = conversationId === cid
                  return (
                    <button
                      key={`${cid}-${idx}`}
                      onClick={() => {
                        selectConversation(cid)
                        setShowHistory(false)
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all"
                      style={{
                        color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                        background: isActive ? 'var(--primary-subtle)' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'var(--primary-subtle)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <span className="font-serif" style={{ fontWeight: 500 }}>
                        {conv.title || `对话 ${(cid.includes(':') ? cid.split(':')[1] : cid).slice(0, 8)}`}
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                        {new Date(conv.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 消息区域 */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-5 py-5"
        style={{ scrollBehavior: 'smooth' }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            {/* 装饰性散射圆环 */}
            <div className="relative" style={{ width: 120, height: 120 }}>
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="40" stroke="var(--primary)" strokeWidth="0.5" opacity="0.2">
                  <animate attributeName="r" values="38;42;38" dur="4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.2;0.1;0.2" dur="4s" repeatCount="indefinite" />
                </circle>
                <circle cx="60" cy="60" r="24" stroke="var(--primary)" strokeWidth="0.5" opacity="0.15">
                  <animate attributeName="r" values="22;26;22" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx="60" cy="60" r="4" fill="var(--primary)" opacity="0.3">
                  <animate attributeName="opacity" values="0.3;0.15;0.3" dur="2.5s" repeatCount="indefinite" />
                </circle>
                {/* 散射小节点 */}
                <circle cx="38" cy="32" r="2.5" fill="var(--primary)" opacity="0.2" />
                <circle cx="85" cy="45" r="2" fill="var(--accent-blue)" opacity="0.2" />
                <circle cx="30" cy="75" r="1.8" fill="var(--accent-green)" opacity="0.2" />
                <circle cx="90" cy="80" r="2.2" fill="var(--accent-rose)" opacity="0.15" />
                {/* 散射连线 */}
                <line x1="60" y1="60" x2="38" y2="32" stroke="var(--primary)" strokeWidth="0.5" opacity="0.1" />
                <line x1="60" y1="60" x2="85" y2="45" stroke="var(--accent-blue)" strokeWidth="0.5" opacity="0.08" />
                <line x1="60" y1="60" x2="30" y2="75" stroke="var(--accent-green)" strokeWidth="0.5" opacity="0.08" />
              </svg>
            </div>
            <span
              className="font-serif font-bold"
              style={{ color: 'var(--primary)', fontSize: '28px', letterSpacing: '0.06em' }}
            >
              织念
            </span>
            <p
              className="font-serif text-sm text-center"
              style={{ color: 'var(--text-muted)', fontWeight: 400, lineHeight: 1.8 }}
            >
              每一个想法都值得被编织
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((msg, i) => (
              <div
                key={`${msg.id}-${i}`}
                data-role={msg.role}
                className={`max-w-[95%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}
                style={msg.role === 'user' ? {
                  position: 'sticky' as const,
                  top: 0,
                  zIndex: 10,
                  background: 'var(--bg)',
                  paddingTop: 4,
                  paddingBottom: 4,
                } : undefined}
              >
                <div
                  className={`chat-bubble-wrap ${msg.role === 'user' ? 'user-bubble' : 'ai-bubble'}`}
                  style={{
                    background: msg.role === 'user' ? 'var(--user-bubble)' : 'var(--ai-bubble)',
                    color: msg.role === 'user' ? 'var(--text)' : 'var(--text-secondary)',
                  }}
                >
                  {msg.content}
                  <span
                    className="chat-bubble-time"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {/* X7: 文章卡片 */}
                {(msg as ChatMessage).generated_article && (
                  <ArticleCard article={(msg as ChatMessage).generated_article!} />
                )}
              </div>
            ))}

            {isLoading && (
              <div className="self-start">
                <div
                  className="px-4 py-3 rounded-xl flex items-center gap-2 text-sm"
                  style={{ background: 'var(--ai-bubble)', color: 'var(--text-dim)' }}
                >
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--primary)' }} />
                  思考中…
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 右侧锚点列 */}
      {!isMobile && rounds.length > 1 && (
        <div
          className="absolute top-16 bottom-20 flex flex-col justify-center gap-1.5 z-10"
          style={{ right: '10px' }}
          onMouseLeave={() => setHoveredAnchor(null)}
        >
          {rounds.map((_, i) => (
            <div key={i} className="relative">
              <button
                className="w-[5px] h-[5px] rounded-full transition-all"
                style={{
                  background:
                    hoveredAnchor === i ? 'var(--primary)' : 'var(--border-light)',
                  transform: hoveredAnchor === i ? 'scale(1.6)' : 'scale(1)',
                }}
                onMouseEnter={() => setHoveredAnchor(i)}
                onClick={() => scrollToRound(i)}
              />
              {/* 悬停摘要 */}
              <AnimatePresence>
                {hoveredAnchor === i && (
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-2 rounded-lg text-xs max-w-[200px] backdrop-blur-md cursor-pointer"
                    style={{
                      background: 'var(--backdrop)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    onClick={() => scrollToRound(i)}
                  >
                    {rounds[i].content.slice(0, 40)}
                    {rounds[i].content.length > 40 && '…'}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* 视频链接输入弹窗 */}
      <AnimatePresence>
        {showVideoInput && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute left-4 right-4 z-30 rounded-xl p-4"
            style={{
              bottom: isMobile ? '70px' : '80px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px var(--shadow-heavy)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Video size={16} style={{ color: 'var(--primary)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  粘贴视频链接
                </span>
              </div>
              <button
                onClick={() => {
                  setShowVideoInput(false)
                  setVideoError('')
                  setVideoUrl('')
                }}
                className="w-6 h-6 flex items-center justify-center rounded-md transition-all"
                style={{ color: 'var(--text-dim)' }}
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                ref={videoInputRef}
                type="url"
                value={videoUrl}
                onChange={(e) => {
                  setVideoUrl(e.target.value)
                  setVideoError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleVideoImport()
                  }
                }}
                placeholder="https://www.bilibili.com/video/BV..."
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none transition-all"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                disabled={videoLoading}
                autoFocus
              />
              <button
                onClick={handleVideoImport}
                disabled={!videoUrl.trim() || videoLoading}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 shrink-0"
                style={{
                  background: videoUrl.trim() ? 'var(--primary)' : 'var(--border)',
                  color: 'var(--bg)',
                  opacity: videoUrl.trim() && !videoLoading ? 1 : 0.5,
                }}
              >
                {videoLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    提取中…
                  </>
                ) : (
                  <>
                    <Link size={14} />
                    提取
                  </>
                )}
              </button>
            </div>

            {videoError && (
              <p className="mt-2 text-xs" style={{ color: 'var(--accent-rose, #e88)' }}>
                {videoError}
              </p>
            )}

            <p className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
              支持 B站、YouTube、抖音链接
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 输入区域 */}
      <div
        className="shrink-0"
        style={{
          padding: isMobile ? '8px 16px' : '12px 16px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          {/* 附件按钮 — 输入框外左侧 */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={(ocrLoading || videoLoading) && !showAttachMenu}
              className="w-8 h-8 flex items-center justify-center transition-all"
              style={{
                background: 'transparent',
                color: (ocrLoading || videoLoading) ? 'var(--primary)' : 'var(--text-dim)',
                border: 'none',
                cursor: (ocrLoading || videoLoading) ? 'wait' : 'pointer',
                borderRadius: '50%',
                opacity: (ocrLoading || videoLoading) && !showAttachMenu ? 0.5 : 1,
              }}
              title="附件"
            >
              {(ocrLoading || videoLoading) ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>

            {/* 附件下拉菜单 */}
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 mb-2 rounded-lg py-1 z-50 min-w-[160px]"
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 8px 32px var(--shadow-heavy)',
                  }}
                >
                  <button
                    onClick={() => {
                      setShowAttachMenu(false)
                      imageInputRef.current?.click()
                    }}
                    disabled={ocrLoading || isLoading}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-all"
                    style={{
                      color: 'var(--text-secondary)',
                      opacity: ocrLoading || isLoading ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Image size={15} style={{ color: 'var(--text-dim)' }} />
                    上传图片识别
                  </button>
                  <button
                    onClick={() => {
                      setShowAttachMenu(false)
                      setShowVideoInput(true)
                      setTimeout(() => videoInputRef.current?.focus(), 100)
                    }}
                    disabled={videoLoading || isLoading}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-all"
                    style={{
                      color: 'var(--text-secondary)',
                      opacity: videoLoading || isLoading ? 0.5 : 1,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--primary-subtle)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Video size={15} style={{ color: 'var(--text-dim)' }} />
                    粘贴视频链接
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />

          {/* 输入框 */}
          <div
            className="chat-input-wrapper flex items-center flex-1 transition-all"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: isMobile ? '24px' : '10px',
              padding: '10px 14px',
              gap: '10px',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入你的想法…"
              rows={1}
              className="flex-1 bg-transparent border-none outline-none resize-none"
              style={{
                color: 'var(--text)',
                fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
                fontSize: '14px',
                lineHeight: 1.5,
                maxHeight: 120,
                padding: 0,
              }}
            />
            {/* 麦克风：输入为空时显示，有文字时隐藏让位给发送按钮 */}
            {!input.trim() && (
              <VoiceMicButton
                onTranscript={(text) => setInput((prev) => prev + text)}
                size={32}
                rounded={isMobile}
              />
            )}
            {input.trim() && (
              <button
                onClick={handleSend}
                disabled={isLoading}
                className="w-8 h-8 flex items-center justify-center shrink-0 transition-opacity"
                style={{
                  background: 'var(--primary)',
                  color: 'var(--bg)',
                  opacity: isLoading ? 0.5 : 1,
                  borderRadius: isMobile ? '50%' : '8px',
                }}
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
