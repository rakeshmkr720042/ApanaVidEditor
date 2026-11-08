import type { LoopAnim, TextAnim, TextFill, TextStyle, WordFx, WordFxStyle } from '../types'
import type { TitlePreset } from './desi'

/**
 * Trending looks that update without a new app: caption looks and titles are read from trending.json on the app's
 * website (GitHub Pages). To add a new trend, edit public/trending.json and push to main; every app picks it up on
 * its next start (at most twice a day, in the background).
 *
 * Safety: the file is data only (no code). Every value is checked against the app's own lists (fonts are a simple
 * name, colours are #hex, animations must be known), anything else is dropped. If the website can't be reached the
 * last good copy is used, then the copy built into the app. Nothing here ever blocks the editor.
 */

export const TRENDING_URL = 'https://rakeshmkr720042.github.io/ApanaVidEditor/trending.json'
const CACHE = 'trending-v1'
const CHECKED = 'trending-checked'
const EVERY = 12 * 3600 * 1000
const TIMEOUT = 6000
const MAX = 40

export interface CaptionLook { name: string; style: Partial<TextStyle>; words: WordFx | null; size?: number }
export interface TrendingPack { version: 1; updated: string; captionLooks: CaptionLook[]; titles: TitlePreset[] }

const WORD_STYLES: WordFxStyle[] = ['color', 'box', 'pop', 'karaoke', 'reveal', 'one']
const ANIMS: TextAnim[] = ['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop', 'typewriter', 'zoom', 'bounce', 'blur', 'spin', 'drop', 'wipe', 'letters']
const LOOPS: LoopAnim[] = ['none', 'pulse', 'float', 'swing', 'shimmer', 'heartbeat']
const FILLS: TextFill[] = ['gold', 'rose-gold', 'silver', 'royal', 'sunset', 'love', 'rainbow', 'tiranga']

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v : null)
const colour = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : null)
// colours may also be rgba(...) for see-through backgrounds
const paint = (v: unknown) => colour(v) ?? (typeof v === 'string' && /^rgba?\(\s*[\d.\s,%]+\)$/i.test(v) && v.length < 40 ? v : null)
const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined)
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : undefined)

/** Only the style fields the app knows, with safe values. */
function cleanStyle(v: unknown): Partial<TextStyle> | null {
  if (!isObj(v)) return null
  const s: Partial<TextStyle> = {}
  const font = str(v.font, 40)
  if (font && /^[A-Za-z0-9 ]+$/.test(font)) s.font = font
  const c = colour(v.color); if (c) s.color = c
  if ('stroke' in v) s.stroke = v.stroke === null ? null : colour(v.stroke) ?? null
  if ('background' in v) s.background = v.background === null ? null : paint(v.background) ?? null
  if ('glow' in v) s.glow = v.glow === null ? null : colour(v.glow) ?? null
  if ('fill' in v) s.fill = v.fill === null ? null : oneOf(v.fill, FILLS) ?? null
  const sw = num(v.strokeWidth, 0, 3); if (sw !== undefined) s.strokeWidth = sw
  const size = num(v.size, 0.02, 0.2); if (size !== undefined) s.size = size
  const ls = num(v.letterSpacing, -0.05, 0.3); if (ls !== undefined) s.letterSpacing = ls
  for (const k of ['shadow', 'bold', 'italic'] as const) if (typeof v[k] === 'boolean') s[k] = v[k] as boolean
  const align = oneOf(v.align, ['left', 'center', 'right'] as const); if (align) s.align = align
  return s.font ? s : null
}

function cleanLook(v: unknown): CaptionLook | null {
  if (!isObj(v)) return null
  const name = str(v.name, 40), style = cleanStyle(v.style)
  if (!name || !style) return null
  let words: WordFx | null = null
  if (isObj(v.words)) {
    const ws = oneOf(v.words.style, WORD_STYLES), wc = colour(v.words.color)
    if (ws && wc) words = { style: ws, color: wc, ...(v.words.caps === true ? { caps: true } : {}) }
  }
  return { name, style, words, ...(num(v.size, 0.02, 0.2) !== undefined ? { size: num(v.size, 0.02, 0.2) } : {}) }
}

function cleanTitle(v: unknown): TitlePreset | null {
  if (!isObj(v)) return null
  const name = str(v.name, 40), text = str(v.text, 200), style = cleanStyle(v.style)
  if (!name || !text || !style) return null
  return { name, text, style, animIn: oneOf(v.animIn, ANIMS) ?? 'fade', animOut: oneOf(v.animOut, ANIMS) ?? 'fade', loop: oneOf(v.loop, LOOPS) ?? 'none' }
}

/** Checks a downloaded file. Returns null when it isn't a trending pack at all. */
export function parseTrending(raw: unknown): TrendingPack | null {
  if (!isObj(raw) || raw.version !== 1) return null
  const list = <T,>(v: unknown, f: (x: unknown) => T | null) => (Array.isArray(v) ? v.slice(0, MAX).map(f).filter((x): x is T => !!x) : [])
  return { version: 1, updated: str(raw.updated, 40) ?? '', captionLooks: list(raw.captionLooks, cleanLook), titles: list(raw.titles, cleanTitle) }
}

let current: TrendingPack | null = (() => {
  try { return parseTrending(JSON.parse(localStorage.getItem(CACHE) ?? 'null')) } catch { return null }
})()
const listeners = new Set<() => void>()

/** The trending pack known now (last good download, or null until one arrives). */
export const getTrending = () => current
export function onTrending(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }

function use(pack: TrendingPack, keep: boolean) {
  current = pack
  if (keep) try { localStorage.setItem(CACHE, JSON.stringify(pack)) } catch { /* storage full: still used this time */ }
  listeners.forEach((f) => { try { f() } catch { /* a closed panel */ } })
}

async function load(url: string): Promise<TrendingPack | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT)
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache', credentials: 'omit' })
    if (!r.ok) return null
    const text = await r.text()
    if (text.length > 200_000) return null // a trending file is a few KB; anything huge is not ours
    return parseTrending(JSON.parse(text))
  } catch { return null } finally { clearTimeout(timer) }
}

let started = false
/**
 * Called once at start: waits until the app is idle, then checks the website (at most every 12 hours). With no
 * saved copy it first uses the one built into the app, so the looks are there even offline.
 */
export function startTrending() {
  if (started) return
  started = true
  const run = async () => {
    if (!current) { const local = await load(new URL('trending.json', document.baseURI).href); if (local) use(local, false) }
    let last = 0
    try { last = Number(localStorage.getItem(CHECKED)) || 0 } catch { /* private mode */ }
    if (Date.now() - last < EVERY || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
    const pack = await load(TRENDING_URL)
    if (!pack) return
    try { localStorage.setItem(CHECKED, String(Date.now())) } catch { /* private mode */ }
    use(pack, true)
  }
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? window.requestIdleCallback(cb, { timeout: 8000 }) : setTimeout(cb, 4000))
  idle(() => { run().catch(() => { /* never matters */ }) })
}
