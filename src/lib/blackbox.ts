// Blackbox: like an aeroplane's flight recorder. It keeps the last few hundred things that happened
// in the app (taps, screens, export steps, every error with its stack) on this device, so after a
// crash the cause can still be read, copied or shared. It survives the app closing: entries are
// written to localStorage (synchronous, so even a sudden out-of-memory kill keeps what was written)
// and the Android app adds its own crash and exit reasons (see KeepAlivePlugin.blackbox()).
import { Capacitor, registerPlugin } from '@capacitor/core'
import { isDesktop } from './desktop'

export type Level = 'info' | 'action' | 'warn' | 'error' | 'crash'
export interface Entry {
  /** time (ms since 1970) */
  t: number
  lvl: Level
  /** what happened, one line */
  msg: string
  /** extra detail: a stack, settings, numbers */
  data?: string
  /** session number: a new one each time the app starts */
  s: number
}

const KEY = 'blackbox-v1'
const SESSION_KEY = 'blackbox-session'
const ALIVE_KEY = 'blackbox-alive'
const MAX = 600
const MAX_DATA = 2000

let entries: Entry[] = []
let session = 0
let loaded = false
let dirty = false
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as Entry[]) : []
    if (Array.isArray(list)) entries = list.filter((e) => e && typeof e.msg === 'string').slice(-MAX)
  } catch { entries = [] }
}

/** Writes the log now. Errors and export steps call this at once, so a crash right after keeps them. */
export function flush() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!dirty) return
  dirty = false
  try { localStorage.setItem(KEY, JSON.stringify(entries)) } catch {
    // storage full: keep the newest half and try once more
    entries = entries.slice(-Math.floor(MAX / 2))
    try { localStorage.setItem(KEY, JSON.stringify(entries)) } catch { /* nothing more to do */ }
  }
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

function text(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`
  try { return JSON.stringify(v) } catch { return String(v) }
}

/** Adds one line to the blackbox. `now` writes it to storage straight away (use for anything a crash could follow). */
export function log(lvl: Level, msg: string, data?: unknown, now = lvl === 'error' || lvl === 'crash' || lvl === 'warn') {
  load()
  const d = text(data)
  entries.push({ t: Date.now(), lvl, msg: clip(msg, 300), ...(d ? { data: clip(d, MAX_DATA) } : {}), s: session })
  if (entries.length > MAX) entries.splice(0, entries.length - MAX)
  dirty = true
  if (now) flush()
  else if (!timer) timer = setTimeout(flush, 1500)
  for (const l of listeners) l()
  if (lvl === 'error' || lvl === 'crash') problemSeen(msg)
}

/** `now`: write at once (export steps, anything a crash could follow) */
export const info = (msg: string, data?: unknown, now = false) => log('info', msg, data, now)
export const warn = (msg: string, data?: unknown) => log('warn', msg, data)
export const error = (msg: string, data?: unknown) => log('error', msg, data)

export function entriesNow(): Entry[] { load(); return entries.slice() }
export function clearLog() { entries = []; dirty = true; flush(); for (const l of listeners) l() }
export function onChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

// ---- "a problem was recorded" pill (shown by BlackboxHost)
let problemListener: ((msg: string) => void) | null = null
let lastProblem = 0
function problemSeen(msg: string) {
  // at most one pill every 20 seconds, so an error loop does not cover the screen
  if (Date.now() - lastProblem < 20000) return
  lastProblem = Date.now()
  problemListener?.(msg)
}
export function onProblem(fn: (msg: string) => void) { problemListener = fn; return () => { if (problemListener === fn) problemListener = null } }

// ---- opening the viewer from anywhere (buttons, Ctrl+Shift+L)
const OPEN_EVENT = 'blackbox-open'
export const openBlackbox = () => window.dispatchEvent(new Event(OPEN_EVENT))
export function onOpen(fn: () => void) { window.addEventListener(OPEN_EVENT, fn); return () => window.removeEventListener(OPEN_EVENT, fn) }

// ---- device facts, printed at the top of every copied log
declare const __APP_VERSION__: string
const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

export function memoryNow(): { heapMB?: number; limitMB?: number; deviceGB?: number } {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory
  const deviceGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return {
    ...(m ? { heapMB: Math.round(m.usedJSHeapSize / 1048576), limitMB: Math.round(m.jsHeapSizeLimit / 1048576) } : {}),
    ...(deviceGB ? { deviceGB } : {}),
  }
}

export function deviceSummary(): string {
  const platform = isDesktop ? 'Windows app' : Capacitor.getPlatform() === 'android' ? 'Android app' : 'Web'
  const ua = navigator.userAgent
  const os = /Android [\d.]+/.exec(ua)?.[0] ?? /Windows NT [\d.]+/.exec(ua)?.[0] ?? /Mac OS X [\d_]+/.exec(ua)?.[0] ?? (/Linux/.test(ua) ? 'Linux' : '')
  const model = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.replace(/ Build.*/, '') ?? ''
  const chrome = /Chrome\/[\d.]+/.exec(ua)?.[0] ?? ''
  const mem = memoryNow()
  return [
    `Apna Editor v${version}`, platform, os, model, chrome,
    `${screen.width}x${screen.height} @${devicePixelRatio}x`,
    `${navigator.hardwareConcurrency ?? '?'} cores`,
    mem.deviceGB ? `RAM ~${mem.deviceGB} GB` : '',
    mem.limitMB ? `JS heap ${mem.heapMB}/${mem.limitMB} MB` : '',
    `WebCodecs ${typeof VideoEncoder !== 'undefined' ? 'yes' : 'no'}`,
  ].filter(Boolean).join(' · ')
}

/** The whole log as plain text, newest last, ready to paste in a chat. */
export async function logText(list = entriesNow()): Promise<string> {
  let storage = ''
  try {
    const e = await navigator.storage?.estimate?.()
    if (e?.quota) storage = `Storage: ${Math.round((e.usage ?? 0) / 1048576)} MB used of ${Math.round(e.quota / 1048576)} MB`
  } catch { /* not supported */ }
  const head = ['=== Apna Editor blackbox ===', deviceSummary(), storage, `Written: ${new Date().toLocaleString()}`, ''].filter((x, i) => x || i === 4)
  const lines = list.map((e) => {
    const d = new Date(e.t)
    const time = `${d.toLocaleDateString()} ${d.toTimeString().slice(0, 8)}`
    return `[${time}] #${e.s} ${e.lvl.toUpperCase().padEnd(6)} ${e.msg}${e.data ? `\n    ${e.data.replace(/\n/g, '\n    ')}` : ''}`
  })
  return [...head, ...lines].join('\n')
}

// ---- Android: crash and exit reasons recorded by the app itself (Java side)
interface NativeBox { blackbox(): Promise<{ text?: string; exits?: { at: number; reason: string; detail: string }[] }> }
const nativeBox = Capacitor.isNativePlatform() ? registerPlugin<NativeBox>('KeepAlive') : null
const SEEN_EXIT_KEY = 'blackbox-exit-seen'

async function readNative() {
  if (!nativeBox) return
  try {
    const r = await nativeBox.blackbox()
    if (r.text?.trim()) log('crash', 'Android app crash report', r.text.trim())
    let seen = 0
    try { seen = Number(localStorage.getItem(SEEN_EXIT_KEY)) || 0 } catch { /* storage off */ }
    const fresh = (r.exits ?? []).filter((x) => x.at > seen).sort((a, b) => a.at - b.at)
    for (const x of fresh) {
      const bad = !/USER_REQUESTED|EXIT_SELF|USER_STOPPED|PACKAGE_UPDATED|OTHER/.test(x.reason)
      log(bad ? 'crash' : 'info', `Last time the app ended: ${x.reason} (${new Date(x.at).toLocaleString()})`, x.detail)
    }
    if (fresh.length) try { localStorage.setItem(SEEN_EXIT_KEY, String(fresh[fresh.length - 1].at)) } catch { /* storage off */ }
  } catch { /* older app build without the method */ }
}

// ---- automatic capture
function describeTarget(el: Element | null): string | null {
  const b = el?.closest('button, a, [role="button"], select, input[type="checkbox"], .chip, .tool')
  if (!b) return null
  const label = b.getAttribute('aria-label') || b.getAttribute('title') || (b.textContent ?? '').replace(/\s+/g, ' ').trim()
  return label ? clip(label, 50) : b.tagName.toLowerCase()
}

let started = false

/** Starts recording. Call once, as early as possible. */
export function startBlackbox() {
  if (started || typeof window === 'undefined') return
  started = true
  load()
  try { session = (Number(localStorage.getItem(SESSION_KEY)) || 0) + 1; localStorage.setItem(SESSION_KEY, String(session)) } catch { session = 1 }

  // the last session did not say goodbye: it crashed, ran out of memory or was swiped away
  let unclean = false
  try { unclean = localStorage.getItem(ALIVE_KEY) === '1'; localStorage.setItem(ALIVE_KEY, '1') } catch { /* storage off */ }
  if (unclean) {
    const last = [...entries].reverse().find((e) => e.s === session - 1)
    log('warn', 'The app did not close normally last time (crash, out of memory, or closed from recent apps)', last ? `Last thing recorded: ${last.msg}` : undefined)
  }
  log('info', `App started (${location.hash || 'home'})`, deviceSummary(), true)
  void readNative()

  window.addEventListener('error', (e: Event) => {
    // a resource (image, script) that failed to load has no message; keep only its address
    if (!(e instanceof ErrorEvent)) {
      const src = (e.target as HTMLImageElement | HTMLScriptElement | null)?.src
      if (src) log('warn', 'Could not load a file', src)
      return
    }
    log('error', e.message || 'Script error', e.error ?? `${e.filename}:${e.lineno}:${e.colno}`)
  }, true)
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    if (r?.name === 'AbortError') return // a cancelled share sheet or download is not a problem
    log('error', `Unhandled: ${r instanceof Error ? r.message : clip(text(r), 200)}`, r)
  })
  const origError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    origError(...args)
    try {
      const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : text(a))).join(' ')
      // React development noise is not a user problem
      if (!/^Warning:|act\(|DevTools/.test(msg)) log('warn', `console: ${clip(msg, 200)}`, args.find((a) => a instanceof Error))
    } catch { /* never let logging break the app */ }
  }

  // what the user did: taps on buttons, keys with Ctrl, screen changes
  document.addEventListener('click', (e) => {
    const what = describeTarget(e.target as Element)
    if (what) log('action', `Tap: ${what}`)
  }, true)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.length === 1) log('action', `Key: Ctrl+${e.shiftKey ? 'Shift+' : ''}${e.key.toUpperCase()}`)
    // Ctrl+Shift+L opens the blackbox anywhere (Cmd+Shift+L on a Mac)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); openBlackbox() }
  }, true)
  window.addEventListener('hashchange', () => log('action', `Screen: ${location.hash || 'home'}`))
  document.addEventListener('visibilitychange', () => {
    const m = memoryNow()
    log('info', document.hidden ? 'App went to the background' : 'App came back', m.heapMB ? `JS heap ${m.heapMB} MB` : undefined, true)
  })
  // a normal close or reload: mark it, so the next start does not report a crash
  window.addEventListener('pagehide', () => { try { localStorage.removeItem(ALIVE_KEY) } catch { /* storage off */ } flush() })
}

/**
 * While a long job runs, notes memory every 15 seconds: when the phone then runs out of memory and
 * the app dies, the last note shows how close it was.
 */
export function watchMemory(label: string): () => void {
  const id = setInterval(() => {
    const m = memoryNow()
    if (m.heapMB != null) log('info', `${label}: memory`, `JS heap ${m.heapMB} of ${m.limitMB} MB`, true)
  }, 15000)
  return () => clearInterval(id)
}
