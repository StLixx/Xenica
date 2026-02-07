import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, List, ChevronDown, Send, Loader2 } from 'lucide-react'
import { useChatStore } from '../stores/chat'
import { useIsMobile } from '../hooks/useIsMobile'

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
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
        className="flex items-center justify-between px-5 shrink-0"
        style={{
          height: 56,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-serif text-base font-semibold" style={{ color: 'var(--text)' }}>
            对话
          </span>

          {/* 模型选择 */}
          <div className="relative">
            <button
              onClick={() => setShowModels(!showModels)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
              style={{
                color: 'var(--text-muted)',
                background: 'var(--primary-subtle)',
              }}
            >
              {MODEL_OPTIONS.find((m) => m.value === model)?.label}
              <ChevronDown size={12} />
            </button>

            {showModels && (
              <div
                className="absolute top-full left-0 mt-1 rounded-lg py-1 z-50 min-w-[160px]"
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
        </div>

        <div className="flex gap-2">
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
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span
              className="font-serif text-2xl font-semibold tracking-wide"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.05em' }}
            >
              织念
            </span>
            <p
              className="font-serif text-sm text-center"
              style={{ color: 'var(--text-dim)', fontWeight: 300, opacity: 0.7 }}
            >
              分享你的想法…
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
          className="absolute right-1.5 top-16 bottom-20 flex flex-col justify-center gap-1.5 z-10"
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
      <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
        <div
          className="flex items-end gap-2.5 rounded-xl px-3.5 py-2.5 transition-all"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的想法或问题…"
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-sm resize-none"
            style={{
              color: 'var(--text)',
              fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
              maxHeight: 120,
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-opacity"
            style={{
              background: input.trim() ? 'var(--primary)' : 'var(--border)',
              color: 'var(--bg)',
              opacity: input.trim() ? 1 : 0.5,
            }}
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-center mt-1.5 text-[10px]" style={{ color: 'var(--text-dim)' }}>
          Enter 发送 · Shift+Enter 换行
        </p>
      </div>
    </div>
  )
}
