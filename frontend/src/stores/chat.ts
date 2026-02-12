import { create } from 'zustand'
import type { Message, Conversation, GeneratedArticle } from '../lib/types'
import * as api from '../lib/api'

/** 扩展 Message，支持 generated_article 字段 */
export interface ChatMessage extends Message {
  generated_article?: GeneratedArticle
}

interface ChatStore {
  // 当前对话
  conversationId: string | null
  conversations: Conversation[]
  messages: ChatMessage[]
  isLoading: boolean
  model: string
  /** X7: 草稿模式 */
  draftMode: boolean

  // 操作
  setModel: (model: string) => void
  setDraftMode: (on: boolean) => void
  loadConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  newConversation: () => void
  sendMessage: (content: string) => Promise<void>
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversationId: null,
  conversations: [],
  messages: [],
  isLoading: false,
  model: 'gpt-4.1',
  draftMode: false,

  setModel: (model) => set({ model }),
  setDraftMode: (on) => set({ draftMode: on }),

  loadConversations: async () => {
    try {
      const conversations = await api.listConversations()
      set({ conversations })
    } catch (e) {
      console.error('加载对话列表失败:', e)
    }
  },

  selectConversation: async (id) => {
    set({ conversationId: id, messages: [], isLoading: true })
    try {
      const messages = await api.getConversationMessages(id)
      set({ messages, isLoading: false })
    } catch (e) {
      console.error('加载对话消息失败:', e)
      set({ isLoading: false })
    }
  },

  newConversation: () => {
    set({ conversationId: null, messages: [] })
  },

  sendMessage: async (content) => {
    const { conversationId, messages, model } = get()

    // 先把用户消息添加到 UI
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      conversation_id: conversationId || undefined,
    }
    set({ messages: [...messages, userMsg], isLoading: true })

    try {
      const result = await api.sendChat({
        conversation_id: conversationId || undefined,
        message: content,
        model,
      })

      // AI 回复
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        timestamp: new Date().toISOString(),
        conversation_id: result.conversation_id,
        generated_article: result.generated_article,
      }

      const updatedMessages = [...get().messages, aiMsg]
      set({
        messages: updatedMessages,
        conversationId: result.conversation_id,
        isLoading: false,
      })

      // 刷新对话列表
      get().loadConversations()
    } catch (e) {
      console.error('发送消息失败:', e)
      set({ isLoading: false })
    }
  },
}))
