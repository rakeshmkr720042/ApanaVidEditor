import { useEffect, useState } from 'react'

/** True after a few quiet seconds (no mouse, touch or key) while `active`: full screen hides its buttons then. */
export function useIdle(active: boolean, ms = 2600) {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!active) return
    let timer = 0
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), ms)
    }
    timer = window.setTimeout(() => setIdle(true), ms)
    const evs = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
    for (const e of evs) window.addEventListener(e, wake, { passive: true })
    return () => { clearTimeout(timer); for (const e of evs) window.removeEventListener(e, wake); setIdle(false) }
  }, [active, ms])
  return idle
}

/** Asks the browser / app window for real full screen (no tabs, bars or status bar). False when it can't. */
export async function enterNativeFullScreen(landscape: boolean): Promise<boolean> {
  const el = document.documentElement
  if (!el.requestFullscreen || document.fullscreenElement) return !!document.fullscreenElement
  try {
    await el.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    return false
  }
  // a phone turns to the video's shape (YouTube style); computers and browsers that can't just ignore it
  if (matchMedia('(pointer: coarse)').matches) {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
    o?.lock?.(landscape ? 'landscape' : 'portrait').catch(() => {})
  }
  return true
}

export function leaveNativeFullScreen() {
  try { screen.orientation?.unlock?.() } catch { /* not supported */ }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
}
