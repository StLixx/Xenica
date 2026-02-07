import { useState, useEffect, useCallback } from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT)

  const check = useCallback(() => {
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
  }, [])

  useEffect(() => {
    // matchMedia 监听
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const mqHandler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', mqHandler)

    // resize fallback（Cursor 内置浏览器 matchMedia 可能不触发）
    window.addEventListener('resize', check)

    // 初始检查
    check()

    return () => {
      mql.removeEventListener('change', mqHandler)
      window.removeEventListener('resize', check)
    }
  }, [check])

  return isMobile
}
