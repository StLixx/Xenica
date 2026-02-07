import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, List, ChevronDown, Send, Loader2, Paperclip } from 'lucide-react'
import { useChatStore } from '../stores/chat'
import { useIsMobile } from '../hooks/useIsMobile'
import { ocrImage } from '../lib/api'
import VoiceMicButton from './VoiceMicButton'

const MODEL_OPTIONS = [
  { value: 'claude-sonnet', label: 'Claude Sonnet' },
  { value: 'claude-opus', label: 'Claude Opus' },
  { value: 'gemini-flash', label: 'Gemini Flash' },
]

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

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
          padding: isMobile ? '8px 20px 12px' : '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          className="font-serif font-semibold"
          style={{
            color: isMobile ? 'var(--primary)' : 'var(--text)',
            fontSize: isMobile ? '18px' : '16px',
            fontWeight: isMobile ? 700 : 600,
          }}
        >
          {isMobile ? 'Xenica' : '对话'}
        </span>

        <div className="flex items-center gap-2">
          {/* 模型选择 — 移到右侧 */}
          <div className="relative">
            <button
              onClick={() => setShowModels(!showModels)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
              style={{
                color: 'var(--text-dim)',
                background: 'var(--primary-subtle)',
                fontSize: '11px',
              }}
            >
              {MODEL_OPTIONS.find((m) => m.value === model)?.label}
              <ChevronDown size={10} />
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
            className="w-7 h-7 rounded-md flex items-center justify-center transition-all"
            style={{
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
            }}
            title="新对话"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-all"
            style={{
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
            }}
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
                conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => {
                      selectConversation(conv.id)
                      setShowHistory(false)
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-sm transition-all"
                    style={{
                      color:
                        conversationId === conv.id ? 'var(--primary)' : 'var(--text-secondary)',
                      background:
                        conversationId === conv.id ? 'var(--primary-subtle)' : 'transparent',
                    }}
                  >
                    {conv.title || `对话 ${conv.id.slice(0, 8)}`}
                    <span className="block text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                      {new Date(conv.created_at).toLocaleDateString('zh-CN')}
                    </span>
                  </button>
                ))
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
                key={msg.id}
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

      {/* 输入区域 */}
      <div
        className="shrink-0"
        style={{
          padding: isMobile ? '8px 12px 8px' : '12px 16px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div
          className="chat-input-wrapper flex items-end gap-2.5 px-3.5 py-2.5 transition-all"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: isMobile ? '24px' : '10px',
          }}
        >
          {/* 图片上传按钮 */}
          <button
            onClick={() => imageInputRef.current?.click()}
            disabled={ocrLoading || isLoading}
            className="w-8 h-8 flex items-center justify-center shrink-0 transition-all"
            style={{
              background: 'transparent',
              color: ocrLoading ? 'var(--primary)' : 'var(--text-dim)',
              border: 'none',
              cursor: ocrLoading ? 'wait' : 'pointer',
              borderRadius: isMobile ? '50%' : '8px',
              opacity: ocrLoading || isLoading ? 0.5 : 1,
            }}
            title="上传图片识别文字"
          >
            {ocrLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Paperclip size={16} />
            )}
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的想法或问题…   Enter 发送 · Shift+Enter 换行"
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-sm resize-none"
            style={{
              color: 'var(--text)',
              fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
              maxHeight: 120,
            }}
          />
          <VoiceMicButton
            onTranscript={(text) => setInput((prev) => prev + text)}
            size={32}
            rounded={isMobile}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 flex items-center justify-center shrink-0 transition-opacity"
            style={{
              background: input.trim() ? 'var(--primary)' : 'var(--border)',
              color: 'var(--bg)',
              opacity: input.trim() ? 1 : 0.5,
              borderRadius: isMobile ? '50%' : '8px',
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
