import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ViewType } from '../lib/types'

export type MobileTab = 'chat' | 'record' | 'graph' | 'search'

interface AppStore {
  // 桌面视图
  view: ViewType
  setView: (v: ViewType) => void

  // 手机端 Tab
  mobileTab: MobileTab
  setMobileTab: (t: MobileTab) => void

  // 后端连接状态
  online: boolean
  setOnline: (v: boolean) => void

  // 通知面板
  notificationOpen: boolean
  toggleNotification: () => void

  // 设置页
  settingsOpen: boolean
  toggleSettings: () => void

  // 快速记录弹窗
  quickRecordOpen: boolean
  setQuickRecordOpen: (v: boolean) => void

  // "在做什么"预设标签
  activityTags: string[]
  setActivityTags: (tags: string[]) => void
  addActivityTag: (tag: string) => void
  removeActivityTag: (tag: string) => void

  // LLM 配置
  llmEndpoint: string
  llmModel: string
  setLlmEndpoint: (v: string) => void
  setLlmModel: (v: string) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      view: 'graph',
      setView: (view) => set({ view }),

      mobileTab: 'chat',
      setMobileTab: (mobileTab) => set({ mobileTab }),

      online: true,
      setOnline: (online) => set({ online }),

      notificationOpen: false,
      toggleNotification: () => set((s) => ({ notificationOpen: !s.notificationOpen })),

      settingsOpen: false,
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),

      quickRecordOpen: false,
      setQuickRecordOpen: (quickRecordOpen) => set({ quickRecordOpen }),

      activityTags: ['骑车', '看视频', '上课', '散步', '吃饭', '和人聊天'],
      setActivityTags: (activityTags) => set({ activityTags }),
      addActivityTag: (tag) => set((s) => ({ activityTags: [...s.activityTags, tag] })),
      removeActivityTag: (tag) => set((s) => ({ activityTags: s.activityTags.filter((t) => t !== tag) })),

      llmEndpoint: 'http://localhost:8045',
      llmModel: 'claude-sonnet-4-20250514',
      setLlmEndpoint: (llmEndpoint) => set({ llmEndpoint }),
      setLlmModel: (llmModel) => set({ llmModel }),
    }),
    {
      name: 'xenica-app',
      partialize: (s) => ({
        activityTags: s.activityTags,
        llmEndpoint: s.llmEndpoint,
        llmModel: s.llmModel,
      }),
    },
  ),
)
