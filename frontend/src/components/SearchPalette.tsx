import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, FileText, Box, Tag, Command } from 'lucide-react'
import * as api from '../lib/api'
import type { Moment, Entity } from '../lib/types'

interface SearchPaletteProps {
  isOpen: boolean
  onClose: () => void
  onSelectNode?: (id: string) => void
  /** 嵌入模式（手机端搜索 Tab）：不渲染固定遮罩 */
  embedded?: boolean
}

type SearchResultItem =
  | { type: 'moment'; data: Moment }
  | { type: 'entity'; data: Entity }

export default function SearchPalette({ isOpen, onClose, onSelectNode, embedded }: SearchPaletteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // 搜索
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }

    setIsSearching(true)

    // 解析前缀
    let searchQ = q
    let searchType: string | undefined

    if (q.startsWith('@')) {
      searchQ = q.slice(1)
      searchType = 'entity'
    } else if (q.startsWith('#')) {
      // 搜索视角标签
      searchQ = q.slice(1)
      searchType = 'moment'
    }

    try {
      const result = await api.search(searchQ, searchType)
      const items: SearchResultItem[] = [
        ...result.moments.map((m) => ({ type: 'moment' as const, data: m })),
        ...result.entities.map((e) => ({ type: 'entity' as const, data: e })),
      ]
      setResults(items)
      setSelectedIndex(0)
    } catch (e) {
      console.error('搜索失败:', e)
    } finally {
      setIsSearching(false)
    }
  }, [])

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.startsWith('/')) return // 命令暂不搜索
      doSearch(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      const item = results[selectedIndex]
      const id = String(item.data.id)
      onSelectNode?.(id)
      onClose()
    }
  }

  // Ctrl+K 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        if (isOpen) onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // 获取前缀提示
  const getPlaceholder = () => {
    if (query.startsWith('@')) return '搜索实体…'
    if (query.startsWith('#')) return '搜索视角标签…'
    if (query.startsWith('/')) return '输入命令…'
    return '搜索节点、实体、标签… （@实体 #标签 /命令）'
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩（嵌入模式下不渲染） */}
          {!embedded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.4)' }}
              onClick={onClose}
            />
          )}

          {/* 搜索框 */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={embedded
              ? "w-full rounded-xl overflow-hidden"
              : "fixed top-[15%] left-1/2 -translate-x-1/2 w-[560px] max-w-[90vw] z-50 rounded-xl overflow-hidden"
            }
            style={{
              background: 'var(--card)',
              border: embedded ? undefined : '1px solid var(--border)',
              boxShadow: embedded ? undefined : '0 20px 60px var(--shadow-heavy)',
            }}
          >
            {/* 输入行 */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={getPlaceholder()}
                className="flex-1 bg-transparent border-none outline-none text-sm"
                style={{
                  color: 'var(--text)',
                  fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
                }}
              />
              <kbd
                className="px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-dim)',
                  fontSize: 10,
                }}
              >
                ESC
              </kbd>
            </div>

            {/* 前缀提示 */}
            {!query && (
              <div className="px-4 py-3 flex gap-4" style={{ borderBottom: '1px solid var(--border)' }}>
                {[
                  { prefix: '@', label: '实体', icon: Box },
                  { prefix: '#', label: '标签', icon: Tag },
                  { prefix: '/', label: '命令', icon: Command },
                ].map(({ prefix, label, icon: Icon }) => (
                  <button
                    key={prefix}
                    onClick={() => setQuery(prefix)}
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-all"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Icon size={12} />
                    <span style={{ color: 'var(--primary)' }}>{prefix}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* 搜索结果 */}
            {results.length > 0 && (
              <div className="max-h-[360px] overflow-y-auto py-1">
                {results.map((item, i) => {
                  const isSelected = i === selectedIndex
                  const isMoment = item.type === 'moment'
                  const label = isMoment
                    ? (item.data as Moment).refined || (item.data as Moment).raw_input
                    : (item.data as Entity).name

                  return (
                    <button
                      key={`${item.type}-${item.data.id}-${i}`}
                      onClick={() => {
                        const id = String(item.data.id)
                        onSelectNode?.(id)
                        onClose()
                      }}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 transition-all"
                      style={{
                        background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                        color: 'var(--text)',
                        borderRadius: '8px',
                      }}
                      onMouseEnter={() => setSelectedIndex(i)}
                    >
                      {isMoment ? (
                        <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      ) : (
                        <Box size={14} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-serif truncate" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{label}</div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                          {isMoment
                            ? (item.data as Moment).perspectives?.join(' · ') || '认知瞬间'
                            : `${(item.data as Entity).entity_type} · 权重 ${(item.data as Entity).weight}`}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* 搜索中 */}
            {isSearching && (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
                搜索中…
              </div>
            )}

            {/* 无结果 */}
            {query && !isSearching && results.length === 0 && !query.startsWith('/') && (
              <div className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
                没有找到相关内容
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
