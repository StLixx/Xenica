import { useEffect, useRef } from 'react'
import { useOfflineStore } from '../stores/offline'
import { useAppStore } from '../stores/app'
import { createMoment, checkHealth } from '../lib/api'

/**
 * 后台同步组件 — 挂载后自动检测网络并同步离线队列
 */
export default function OfflineSync() {
  const { queue, markSynced, clearSynced } = useOfflineStore()
  const { online, setOnline } = useAppStore()
  const syncingRef = useRef(false)

  // 定期检测后端状态
  useEffect(() => {
    const check = async () => {
      const isOnline = await checkHealth()
      setOnline(isOnline)
    }
    check()
    const timer = setInterval(check, 30_000)
    return () => clearInterval(timer)
  }, [setOnline])

  // 上线时同步离线队列
  useEffect(() => {
    if (!online || syncingRef.current) return
    const pending = queue.filter((m) => !m.synced)
    if (pending.length === 0) return

    syncingRef.current = true
    ;(async () => {
      for (const m of pending) {
        try {
          await createMoment({
            raw_input: m.raw_input,
            trigger: m.trigger,
            location: m.location,
            perspectives: m.perspectives,
          })
          markSynced(m.id)
        } catch {
          break
        }
      }
      clearSynced()
      syncingRef.current = false
    })()
  }, [online, queue, markSynced, clearSynced])

  return null
}
