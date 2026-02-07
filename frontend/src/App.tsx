import { useState, useEffect } from 'react'
import { useThemeStore } from './stores/theme'
import { useAppStore } from './stores/app'
import { useGraphStore } from './stores/graph'
import { useIsMobile } from './hooks/useIsMobile'
import { applyTheme } from './lib/theme'
import type { ViewType } from './lib/types'

// 桌面端组件（来自 X4 主体）
import GraphView from './components/graph/GraphView'
import ChatPanel from './components/ChatPanel'
import NodeDetail from './components/NodeDetail'
import BottomNav from './components/BottomNav'
import SearchPalette from './components/SearchPalette'

// 补充组件（本任务新建）
import TopBar from './components/TopBar'
import MobileTabBar from './components/MobileTabBar'
import Timeline from './components/Timeline'
import ListView from './components/ListView'
import QuickRecord from './components/QuickRecord'
import NotificationPanel from './components/NotificationPanel'
import Settings from './components/Settings'
import OfflineSync from './components/OfflineSync'

export default function App() {
  const { theme, mode } = useThemeStore()
  const { view, setView, mobileTab, online } = useAppStore()
  const { selectedNodeId, loadTopNodes, loadStats, traverseNode, selectNode } = useGraphStore()
  const isMobile = useIsMobile()
  const [searchOpen, setSearchOpen] = useState(false)

  // 同步主题到 DOM
  useEffect(() => {
    applyTheme(theme, mode)
  }, [theme, mode])

  // 加载图谱数据
  useEffect(() => {
    if (online) {
      loadTopNodes()
      loadStats()
    }
  }, [online, loadTopNodes, loadStats])

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
            <GraphView />
            {selectedNodeId && (
              <NodeDetail nodeId={selectedNodeId} onClose={() => selectNode(null)} />
            )}
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
            <GraphView />
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
            />
          </div>
        )
      default:
        return <ChatPanel />
    }
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
        <Settings />
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

        {/* 右侧：常驻对话 */}
        <aside className="app-desktop-chat">
          <ChatPanel />
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
      <Settings />
      <OfflineSync />
    </div>
  )
}
