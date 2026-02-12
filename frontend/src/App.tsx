import { useState, useEffect, useCallback } from 'react'
import { useThemeStore } from './stores/theme'
import { useAppStore } from './stores/app'
import { useGraphStore } from './stores/graph'
import { useNotificationStore } from './stores/notification'
import { useIsMobile } from './hooks/useIsMobile'
import { applyTheme } from './lib/theme'
import { checkGoalSetup } from './lib/api'
import type { ViewType, GenerateFromNodesOutput } from './lib/types'

// 桌面端组件（来自 X4 主体）
import GraphView from './components/graph/GraphView'
import ChatPanel from './components/ChatPanel'
import NodeDetail from './components/NodeDetail'
import BottomNav from './components/BottomNav'
import SearchPalette from './components/SearchPalette'

// 补充组件
import TopBar from './components/TopBar'
import MobileTabBar from './components/MobileTabBar'
import Timeline from './components/Timeline'
import ListView from './components/ListView'
import QuickRecord from './components/QuickRecord'
import NotificationPanel from './components/NotificationPanel'
import ReviewCards from './components/ReviewCards'
import Settings from './components/Settings'
import MarkdownImport from './components/MarkdownImport'
import OfflineSync from './components/OfflineSync'
import GoalSetup from './components/GoalSetup'

export default function App() {
  const { theme, mode } = useThemeStore()
  const { view, setView, mobileTab, online } = useAppStore()
  const { selectedNodeId, loadTopNodes, loadStats, traverseNode, selectNode } = useGraphStore()
  const { loadDueReviewCount } = useNotificationStore()
  const isMobile = useIsMobile()
  const [searchOpen, setSearchOpen] = useState(false)
  const [rightTab, setRightTab] = useState<'chat' | 'detail' | 'generation'>('chat')
  const [showGoalSetup, setShowGoalSetup] = useState(false)
  /** X7: 生成结果 */
  const [generationResult, setGenerationResult] = useState<GenerateFromNodesOutput | null>(null)

  const handleGenerationResult = useCallback((result: GenerateFromNodesOutput) => {
    setGenerationResult(result)
    setRightTab('generation')
  }, [])

  // 同步主题到 DOM
  useEffect(() => {
    applyTheme(theme, mode)
  }, [theme, mode])

  // X8: 首次启动检查目标设置
  useEffect(() => {
    if (!online) return
    const localDone = localStorage.getItem('xenica-goal-setup-done')
    if (localDone === 'true') return

    checkGoalSetup()
      .then((status) => {
        if (!status.setup_completed) {
          setShowGoalSetup(true)
        } else {
          localStorage.setItem('xenica-goal-setup-done', 'true')
        }
      })
      .catch(() => {
        // 后端不可达时不弹引导
      })
  }, [online])

  // 加载图谱数据 + X6: 待复习数量
  useEffect(() => {
    if (online) {
      loadTopNodes()
      loadStats()
      loadDueReviewCount()
    }
  }, [online, loadTopNodes, loadStats, loadDueReviewCount])

  // 节点选中时自动切换到详情 tab
  useEffect(() => {
    if (selectedNodeId) {
      setRightTab('detail')
    }
  }, [selectedNodeId])

  // Ctrl+K 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSearchSelect = (id: string) => {
    traverseNode(id)
    selectNode(id)
    if (isMobile) {
      useAppStore.getState().setMobileTab('graph')
    } else {
      setView('graph')
    }
  }

  // ─── 桌面端主区域 ───
  const renderDesktopMain = () => {
    switch (view) {
      case 'timeline':
        return <Timeline />
      case 'list':
        return <ListView />
      case 'graph':
      default:
        return (
          <div className="desktop-graph-area">
            <GraphView onGenerationResult={handleGenerationResult} />
          </div>
        )
    }
  }

  // ─── 手机端视图 ───
  const renderMobileContent = () => {
    if (!online && mobileTab !== 'chat') {
      return (
        <div className="view-empty">
          <p className="view-empty-text">当前离线</p>
          <p className="view-empty-sub">点击底部中间按钮进行快速记录</p>
        </div>
      )
    }

    switch (mobileTab) {
      case 'chat':
        return <ChatPanel />
      case 'graph':
        return (
          <div className="mobile-graph-area">
            <GraphView onGenerationResult={handleGenerationResult} />
            {selectedNodeId && (
              <NodeDetail nodeId={selectedNodeId} onClose={() => selectNode(null)} />
            )}
          </div>
        )
      case 'search':
        return (
          <div className="mobile-search-wrapper">
            <SearchPalette
              isOpen={true}
              onClose={() => useAppStore.getState().setMobileTab('chat')}
              onSelectNode={handleSearchSelect}
              embedded
            />
          </div>
        )
      default:
        return <ChatPanel />
    }
  }

  // X8: 目标引导全屏弹窗
  if (showGoalSetup) {
    return <GoalSetup onComplete={() => setShowGoalSetup(false)} />
  }

  // ─── 手机端 ───
  if (isMobile) {
    return (
      <div className="app-mobile">
        <TopBar />
        <main className="app-mobile-content">
          {renderMobileContent()}
        </main>
        <MobileTabBar />

        <QuickRecord />
        <NotificationPanel />
        <ReviewCards />
        <Settings />
        <MarkdownImport />
        <OfflineSync />
      </div>
    )
  }

  // ─── 桌面端 ───
  return (
    <div className="app-desktop">
      <div className="app-desktop-body">
        {/* 左侧：主区域 */}
        <main className="app-desktop-main">
          {renderDesktopMain()}
        </main>

        {/* 右侧：对话 / 节点详情 / 生成结果 Tab 切换 */}
        <aside className="app-desktop-chat">
          {(selectedNodeId || generationResult) && (
            <div className="right-panel-tabs">
              <button
                className={`right-panel-tab ${rightTab === 'chat' ? 'active' : ''}`}
                onClick={() => setRightTab('chat')}
              >
                对话
              </button>
              {selectedNodeId && (
                <button
                  className={`right-panel-tab ${rightTab === 'detail' ? 'active' : ''}`}
                  onClick={() => setRightTab('detail')}
                >
                  节点详情
                </button>
              )}
              {generationResult && (
                <button
                  className={`right-panel-tab ${rightTab === 'generation' ? 'active' : ''}`}
                  onClick={() => setRightTab('generation')}
                >
                  生成结果
                </button>
              )}
            </div>
          )}
          {rightTab === 'generation' && generationResult ? (
            <GenerationResultPanel
              result={generationResult}
              onClose={() => {
                setGenerationResult(null)
                setRightTab('chat')
              }}
            />
          ) : rightTab === 'detail' && selectedNodeId ? (
            <NodeDetail
              nodeId={selectedNodeId}
              onClose={() => {
                selectNode(null)
                setRightTab('chat')
              }}
            />
          ) : (
            <ChatPanel />
          )}
        </aside>
      </div>

      {/* 底部导航 */}
      <BottomNav
        currentView={view}
        onViewChange={(v: ViewType) => setView(v)}
        onSearchOpen={() => setSearchOpen(true)}
      />

      {/* 全局弹窗 */}
      <SearchPalette
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectNode={handleSearchSelect}
      />
      <QuickRecord />
      <NotificationPanel />
      <ReviewCards />
      <Settings />
      <MarkdownImport />
      <OfflineSync />
    </div>
  )
}

/** X7: 生成结果面板 */
function GenerationResultPanel({
  result,
  onClose,
}: {
  result: GenerateFromNodesOutput
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const md = `# ${result.title}\n\n${result.content}`
    await navigator.clipboard.writeText(md)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const md = `# ${result.title}\n\n${result.content}`
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${result.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* 头部 */}
      <div
        className="flex items-center justify-between shrink-0 px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="font-serif font-semibold"
          style={{ color: 'var(--text)', fontSize: '16px' }}
        >
          生成结果
        </span>
        <button
          onClick={onClose}
          className="text-xs px-2 py-1 rounded"
          style={{ color: 'var(--text-dim)' }}
        >
          关闭
        </button>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* 标题 */}
        <h2
          className="font-serif font-bold mb-4"
          style={{ color: 'var(--text)', fontSize: '22px', lineHeight: 1.4 }}
        >
          {result.title}
        </h2>

        {/* 正文 */}
        <div
          className="text-sm leading-relaxed whitespace-pre-wrap mb-6"
          style={{
            color: 'var(--text-secondary)',
            fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
            lineHeight: 1.8,
          }}
        >
          {result.content}
        </div>

        {/* 来源 */}
        {result.source_nodes.length > 0 && (
          <p className="text-xs mb-4" style={{ color: 'var(--text-dim)' }}>
            基于 {result.source_nodes.length} 个图谱节点生成
          </p>
        )}

        {/* 操作 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
            style={{
              background: 'var(--primary-subtle)',
              color: copied ? 'var(--accent-green, #8faa7b)' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            {copied ? '已复制 ✓' : '复制'}
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
            下载 Markdown
          </button>
        </div>
      </div>
    </div>
  )
}
