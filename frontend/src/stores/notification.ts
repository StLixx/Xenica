import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'expand' | 'review' | 'confirm' | 'commander'
  title: string
  body?: string
  timestamp: string
  read: boolean
}

interface NotificationStore {
  notifications: Notification[]
  unreadCount: number
  isOpen: boolean

  toggle: () => void
  close: () => void
  markRead: (id: string) => void
  markAllRead: () => void
  addNotification: (n: Omit<Notification, 'id' | 'read'>) => void
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,

  toggle: () => set({ isOpen: !get().isOpen }),
  close: () => set({ isOpen: false }),

  markRead: (id) => {
    const notifications = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    )
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.read).length,
    })
  },

  markAllRead: () => {
    const notifications = get().notifications.map((n) => ({ ...n, read: true }))
    set({ notifications, unreadCount: 0 })
  },

  addNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      read: false,
    }
    const notifications = [notification, ...get().notifications]
    set({
      notifications,
      unreadCount: notifications.filter((nn) => !nn.read).length,
    })
  },
}))
