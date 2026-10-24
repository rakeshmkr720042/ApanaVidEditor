import { useEffect, useRef } from 'react'
import { isNative } from './save'

/**
 * One "go back" for every open panel, sheet and window: the phone's Back button and Esc close the one on top.
 * Sheets and full-screen windows sit above tool panels, which sit above a selection on the timeline.
 */
export const BACK = { selection: 1, panel: 2, sheet: 3 } as const

interface Entry { level: number; order: number; close: { current: () => void } }
const open = new Set<Entry>()
let counter = 0

/** Closes the top-most open thing. False when nothing was open. */
export function goBack(): boolean {
  let top: Entry | null = null
  for (const e of open) if (!top || e.level > top.level || (e.level === top.level && e.order > top.order)) top = e
  if (!top) return false
  top.close.current()
  return true
}

/**
 * Lets Back / Esc close this while `active`. `close` may do nothing (e.g. while a job runs):
 * Back is still taken by it, so nothing underneath closes instead.
 */
export function useBack(active: boolean, close: () => void, level: number = BACK.sheet) {
  const ref = useRef(close)
  ref.current = close
  useEffect(() => {
    if (!active) return
    const e: Entry = { level, order: ++counter, close: ref }
    open.add(e)
    return () => { open.delete(e) }
  }, [active, level])
}

let started = false
/** Hooks up Esc and, in the Android app, the system Back button (once, at start-up). */
export function listenForBack() {
  if (started) return
  started = true
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (goBack()) e.preventDefault()
  })
  if (!isNative) return
  import('@capacitor/app').then(({ App }) => {
    // with a listener the app no longer goes back by itself: nothing open → previous screen, or leave the app
    App.addListener('backButton', ({ canGoBack }) => {
      if (goBack()) return
      if (canGoBack) history.back()
      else App.exitApp()
    })
  }).catch(() => { /* plugin missing: the WebView's own back stays */ })
}
