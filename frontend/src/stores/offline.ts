import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface PendingMoment {
  id: string
  raw_input: string
  trigger?: string
  location?: string
  perspectives: string[]
  timestamp: string
  synced: boolean
}

interface OfflineStore {
  queue: PendingMoment[]
  addToQueue: (m: Omit<PendingMoment, 'id' | 'synced'>) => void
  markSynced: (id: string) => void
  removeFromQueue: (id: string) => void
  clearSynced: () => void
}

export const useOfflineStore = create<OfflineStore>()(
  persist(
    (set) => ({
      queue: [],
      addToQueue: (m) =>
        set((s) => ({
          queue: [
            ...s.queue,
            { ...m, id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, synced: false },
          ],
        })),
      markSynced: (id) =>
        set((s) => ({
          queue: s.queue.map((m) => (m.id === id ? { ...m, synced: true } : m)),
        })),
      removeFromQueue: (id) =>
        set((s) => ({ queue: s.queue.filter((m) => m.id !== id) })),
      clearSynced: () =>
        set((s) => ({ queue: s.queue.filter((m) => !m.synced) })),
    }),
    { name: 'xenica-offline' },
  ),
)
