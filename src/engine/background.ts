// Keeps a long export running while the window is hidden, minimised or behind another tab.
// Browsers throttle timers on hidden pages (to once a second, later once a minute) and stop
// requestAnimationFrame and requestVideoFrameCallback, so the export loop waits on a timer that
// lives in a worker, where that throttling does not apply.
import { Capacitor, registerPlugin } from '@capacitor/core'
import { desktop } from '../lib/desktop'

/** The Android app's own plugin (MainActivity): a "Saving your video" foreground service + screen kept on. */
interface KeepAlive { start(o: { title: string; text: string }): Promise<{ background: boolean }>; stop(): Promise<void> }
const keepAlive = Capacitor.isNativePlatform() ? registerPlugin<KeepAlive>('KeepAlive') : null

/** Marks a long job as running, so the next start can tell if the app was closed in the middle (out of memory). */
const JOB_KEY = 'job-running'
function markJob(kind: string | null) {
  try { if (kind) localStorage.setItem(JOB_KEY, JSON.stringify({ kind, at: Date.now() })); else localStorage.removeItem(JOB_KEY) } catch { /* storage off */ }
}

/**
 * The job (export / compress) that was still running when the app last closed, or null. Read once:
 * the mark is cleared, so the warning is shown one time.
 */
export function interruptedJob(): { kind: string; at: number } | null {
  try {
    const raw = localStorage.getItem(JOB_KEY)
    if (!raw) return null
    localStorage.removeItem(JOB_KEY)
    const j = JSON.parse(raw) as { kind: string; at: number }
    return typeof j?.kind === 'string' && Date.now() - j.at < 7 * 864e5 ? j : null
  } catch { return null }
}

let worker: Worker | null | undefined
let nextId = 0
const waiting = new Map<number, () => void>()

function timerWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    const code = 'onmessage = (e) => setTimeout(() => postMessage(e.data[0]), e.data[1])'
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
    worker.onmessage = (e) => { const r = waiting.get(e.data); waiting.delete(e.data); r?.() }
  } catch {
    worker = null
  }
  return worker
}

/** setTimeout that keeps its pace on a hidden page. */
export function sleep(ms: number): Promise<void> {
  const w = typeof document !== 'undefined' && document.hidden ? timerWorker() : null
  if (!w) return new Promise((r) => setTimeout(r, ms))
  return new Promise((r) => { const id = ++nextId; waiting.set(id, r); w.postMessage([id, ms]) })
}

/**
 * Asks the system not to freeze the page or put the device to sleep while an export runs.
 * Returns a function that lets go again. Everything here is best effort.
 */
export function stayAwake(kind: 'export' | 'compress' = 'export', title = 'Saving your video', text = 'Apna Editor keeps working'): () => void {
  let done = false
  const cleanups: (() => void)[] = []

  markJob(kind)
  cleanups.push(() => markJob(null))

  // Android: a foreground service so the system does not stop the app mid-export, and the screen stays on
  if (keepAlive) {
    keepAlive.start({ title, text }).catch(() => {})
    cleanups.push(() => { keepAlive.stop().catch(() => {}) })
  }

  // a held Web Lock keeps Chrome from freezing the page while it is in the background
  if (navigator.locks) {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    navigator.locks.request(`export-${Math.random()}`, () => held).catch(() => {})
    cleanups.push(release)
  }

  // the screen wake lock is dropped whenever the page is hidden, so take it again on return
  let sentinel: WakeLockSentinel | null = null
  const lock = () => {
    if (done || document.hidden || !('wakeLock' in navigator)) return
    navigator.wakeLock.request('screen').then((s) => { if (done) s.release(); else sentinel = s }, () => {})
  }
  lock()
  document.addEventListener('visibilitychange', lock)
  cleanups.push(() => { document.removeEventListener('visibilitychange', lock); sentinel?.release().catch(() => {}) })

  // the desktop app also stops Windows from sleeping mid-export
  if (desktop?.keepAwake) { desktop.keepAwake(true); cleanups.push(() => desktop?.keepAwake?.(false)) }

  return () => {
    if (done) return
    done = true
    for (const c of cleanups) c()
  }
}

/** Whether an export keeps going when the user switches away (true in the desktop app, which turns throttling off). */
export const runsInBackground = !!desktop
