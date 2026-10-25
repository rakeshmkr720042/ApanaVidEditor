import { useEffect, useState } from 'react'
import type { Clip, Layer, MediaSource, Project } from '../types'
import { defaultAdjust } from '../model/timeline'
import { defaultTextStyle } from '../engine/text'
import { filterById } from '../engine/filters'
import { TRANSITIONS } from '../engine/transitions'

/**
 * Smart shortcuts: learns, on this device only, what the user keeps doing and offers it as one tap.
 *
 * Looks: every clip, overlay, text, audio item and the project itself is watched; the settings it ends up with
 * (filter, Remove noise, volume, place on screen, text style…) are kept per kind of item. When one value shows up in
 * at least `threshold` of the recent items of that kind (and at least MIN_SAMPLES times), a new item of that kind
 * without it gets "Your usual". Next step: which toolbar tool follows which; when one follows often enough it is offered
 * after the first. Saying "Not now" three times in a row pauses that habit; each can be paused or allowed again.
 * Nothing leaves the device (localStorage 'habits').
 */

const KEY = 'habits'
export const MIN_SAMPLES = 5
const RECENT = 20 // items of a kind (and follow-ups of a tool) looked at
const MAX_ITEMS = 400
const FOLLOW_GAP = 60_000 // a tool tapped later than this after another is not its next step
const SETTLE = 5 * 60_000 // an untouched item counts as "left plain" after this long (or from an earlier session)
const PAUSE_AFTER = 3 // "Not now" this many times in a row pauses a habit
const SESSION = Date.now()

export type ItemKind = 'clip-video' | 'clip-photo' | 'overlay-video' | 'overlay-photo' | 'text' | 'audio-music' | 'audio-voice' | 'audio-sound' | 'project'

interface Seen { k: ItemKind; at: number; v: Record<string, string> } // v: settings away from the default, as JSON
interface Store {
  v: 1
  on: boolean
  threshold: number
  items: Record<string, Seen>
  flow: Record<string, string[]> // "context|tool" -> the tools that came next ('' = nothing soon after)
  rej: Record<string, number> // "Not now" in a row per habit
  off: string[] // paused habits
  shown: number // suggestions shown so far (the first few explain themselves)
}

const fresh = (): Store => ({ v: 1, on: true, threshold: 0.8, items: {}, flow: {}, rej: {}, off: [], shown: 0 })
let store: Store | null = null
const listeners = new Set<() => void>()

function load(): Store {
  if (store) return store
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Store | null
    store = s?.v === 1 ? { ...fresh(), ...s } : fresh()
  } catch { store = fresh() }
  return store
}
let saveTimer: ReturnType<typeof setTimeout> | null = null
function save() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* private mode / full */ }
  }, 300)
  listeners.forEach((f) => f())
}
export function onHabits(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }
/** Re-renders when anything learned or a Smart shortcuts setting changes. */
export function useHabitsVersion() {
  const [v, setV] = useState(0)
  useEffect(() => onHabits(() => setV((n) => n + 1)), [])
  return v
}

export function habitSettings() { const s = load(); return { on: s.on, threshold: s.threshold } }
export function setHabitSettings(p: Partial<{ on: boolean; threshold: number }>) { Object.assign(load(), p); save() }
export function forgetAll() { store = { ...fresh(), on: load().on, threshold: load().threshold }; save() }

// ---------------------------------------------------------------- what is learned about each kind of item

const r2 = (n: number) => Math.round(n * 100) / 100
const norm = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (typeof x === 'number' ? r2(x) : x))
const NONE = norm(null)

type Values = Record<string, unknown>

/** Every learnable setting of an item next to its default, keyed by name. */
function settings(kind: ItemKind, x: Clip | Layer | Project, last: boolean): { now: Values; def: Values } {
  const now: Values = {}, def: Values = {}
  const add = (k: string, v: unknown, d: unknown) => { now[k] = v; def[k] = d }
  const look = (c: { filter: string | null; filterAmount: number; adjust: unknown }) => {
    add('filter', c.filter ? [c.filter, c.filterAmount] : null, null)
    add('adjust', c.adjust, defaultAdjust())
  }
  const sound = (c: { volume: number; denoise?: unknown; fx?: unknown }, vol = 1) => {
    add('volume', c.volume, vol); add('denoise', c.denoise, null); add('fx', c.fx, null)
  }
  if (kind === 'project') {
    const p = x as Project
    add('aspect', p.settings.aspect, 'original'); add('background', p.settings.background, 'black')
  } else if (kind === 'clip-video' || kind === 'clip-photo') {
    const c = x as Clip
    if (!c.ramp) add('speed', c.speed, 1)
    look(c)
    add('fit', c.fit, 'fit')
    if (!last) add('transition', c.transition, null)
    if (kind === 'clip-video') { sound(c); add('fadeIn', c.fadeIn, 0); add('fadeOut', c.fadeOut, 0) } else add('kenBurns', c.kenBurns, null)
  } else if (kind === 'overlay-video' || kind === 'overlay-photo') {
    const l = x as Extract<Layer, { type: 'media' }>
    if (!l.keys?.length) add('box', l.box, { x: 0.7, y: 0.3, scale: 0.8, rotation: 0, opacity: 1 })
    add('mask', l.mask, 'none'); add('border', l.border, 0); add('blend', l.blend, null)
    add('animIn', l.animIn, null); add('animOut', l.animOut, null)
    look(l)
    if (kind === 'overlay-video') sound(l)
  } else if (kind === 'text') {
    const l = x as Extract<Layer, { type: 'text' }>
    const d = defaultTextStyle()
    for (const k of Object.keys(d) as (keyof typeof d)[]) add(`style.${k}`, l.style[k], d[k])
    add('animIn', l.animIn, 'fade'); add('animOut', l.animOut, 'fade')
    if (!l.frame && !l.keys?.length) add('place', [l.box.x, l.box.y], [0.5, 0.5])
  } else {
    const l = x as Extract<Layer, { type: 'audio' }>
    const music = l.kind === 'music'
    sound(l, music ? 0.6 : 1)
    add('fadeIn', l.fadeIn, music ? 1 : 0); add('fadeOut', l.fadeOut, music ? 2 : 0)
    add('duck', l.duck, null)
  }
  return { now, def }
}

function kindOf(x: Clip | Layer, sources: Record<string, MediaSource>): ItemKind | null {
  if (!('type' in x)) {
    if (x.fromTemplate) return null
    const s = sources[x.sourceId]
    return s ? (s.kind === 'image' ? 'clip-photo' : 'clip-video') : null
  }
  if (x.type === 'media') { const s = sources[x.sourceId]; return s ? (s.kind === 'image' ? 'overlay-photo' : 'overlay-video') : null }
  if (x.type === 'text') return x.subtitle ? null : 'text' // subtitles already share one look
  if (x.type === 'audio') return `audio-${x.kind}` as ItemKind
  return null
}

function diff(kind: ItemKind, x: Clip | Layer | Project, last: boolean) {
  const { now, def } = settings(kind, x, last)
  const v: Record<string, string> = {}
  for (const k of Object.keys(now)) { const n = norm(now[k]); if (n !== norm(def[k])) v[k] = n }
  return { v, keys: Object.keys(now) }
}

/** Watches the project as it is now: each item's settings are remembered as the latest word on that item. */
export function observe(projectId: string, p: Project, sources: Record<string, MediaSource>) {
  const s = load()
  if (!s.on) return
  let changed = false
  const put = (id: string, k: ItemKind, x: Clip | Layer | Project, last: boolean) => {
    const { v } = diff(k, x, last)
    const old = s.items[id]
    if (old && old.k === k && norm(old.v) === norm(v)) return
    s.items[id] = { k, at: old?.at ?? Date.now(), v }
    changed = true
  }
  if (p.clips.length) put(`p:${projectId}`, 'project', p, false)
  p.clips.forEach((c, i) => { const k = kindOf(c, sources); if (k) put(c.id, k, c, i === p.clips.length - 1) })
  for (const l of p.layers) { const k = kindOf(l, sources); if (k) put(l.id, k, l, false) }
  if (!changed) return
  const ids = Object.keys(s.items)
  if (ids.length > MAX_ITEMS) ids.sort((a, b) => s.items[a].at - s.items[b].at).slice(0, ids.length - MAX_ITEMS).forEach((id) => delete s.items[id])
  save()
}

export interface Habit { id: string; kind: ItemKind; key: string; value: string; share: number; count: number; of: number; paused: boolean }

const settled = (e: Seen, now: number) => Object.keys(e.v).length > 0 || e.at < SESSION || now - e.at > SETTLE

/** The habits found for one kind of item (paused ones included), leaving out the item `except`. */
export function habitsFor(kind: ItemKind, except?: string): Habit[] {
  const s = load()
  const now = Date.now()
  const recent = Object.entries(s.items).filter(([id, e]) => e.k === kind && id !== except && settled(e, now))
    .sort((a, b) => b[1].at - a[1].at).slice(0, RECENT).map(([, e]) => e)
  if (recent.length < MIN_SAMPLES) return []
  const counts = new Map<string, Map<string, number>>()
  for (const e of recent) for (const [k, v] of Object.entries(e.v)) {
    const m = counts.get(k) ?? new Map<string, number>()
    m.set(v, (m.get(v) ?? 0) + 1)
    counts.set(k, m)
  }
  const out: Habit[] = []
  for (const [key, m] of counts) {
    const [value, count] = [...m].sort((a, b) => b[1] - a[1])[0]
    const share = count / recent.length
    if (count < MIN_SAMPLES || share < s.threshold) continue
    const id = `${kind}|${key}|${value}`
    out.push({ id, kind, key, value, share, count, of: recent.length, paused: s.off.includes(id) })
  }
  return out
}

/** The habits of its kind this item does not follow yet (paused ones left out). */
export function usualFor(x: Clip | Layer | Project, sources: Record<string, MediaSource>, id: string, last = false): Habit[] {
  if (!load().on) return []
  const kind = 'clips' in x ? 'project' : kindOf(x, sources)
  if (!kind) return []
  const hs = habitsFor(kind, id).filter((h) => !h.paused)
  if (!hs.length) return []
  const { v, keys } = diff(kind, x, last)
  return hs.filter((h) => keys.includes(h.key) && (v[h.key] ?? NONE) !== h.value)
}

/** The change that gives an item these habits. */
export function patchFor<T extends Clip | Layer | Project>(x: T, hs: Habit[]): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const h of hs) {
    const v = JSON.parse(h.value)
    if (h.kind === 'project') out.settings = { ...(out.settings as object ?? (x as Project).settings), [h.key]: v }
    else if (h.key === 'filter') { out.filter = v ? v[0] : null; out.filterAmount = v ? v[1] : 1 }
    else if (h.key.startsWith('style.')) out.style = { ...(out.style as object ?? (x as { style: object }).style), [h.key.slice(6)]: v }
    else if (h.key === 'place') out.box = { ...(x as { box: object }).box, x: v[0], y: v[1] }
    else if (h.key === 'box') out.box = { ...v }
    else out[h.key] = v
  }
  return out as Partial<T>
}

/** "Not now": three in a row pause the habit. Returns the ones that just got paused. */
export function rejectHabits<H extends { id: string }>(hs: H[]): H[] {
  const s = load()
  const paused: H[] = []
  for (const h of hs) {
    s.rej[h.id] = (s.rej[h.id] ?? 0) + 1
    if (s.rej[h.id] >= PAUSE_AFTER && !s.off.includes(h.id)) { s.off.push(h.id); delete s.rej[h.id]; paused.push(h) }
  }
  save()
  return paused
}
export function acceptHabits(ids: string[]) { const s = load(); ids.forEach((id) => delete s.rej[id]); save() }
export function pauseHabit(id: string, paused: boolean) {
  const s = load()
  s.off = s.off.filter((x) => x !== id)
  if (paused) s.off.push(id)
  delete s.rej[id]
  save()
}
export function noteShown() { load().shown++; save() }
export const isNew = () => load().shown < 3

// ---------------------------------------------------------------- next step

let last: { key: string; at: number } | null = null

/** A toolbar tool was tapped in this context (what was selected). */
export function toolUsed(ctx: string, label: string) {
  const s = load()
  if (!s.on) return
  const now = Date.now()
  if (last) {
    const list = s.flow[last.key] ?? []
    list.push(now - last.at < FOLLOW_GAP ? label : '')
    s.flow[last.key] = list.slice(-RECENT)
  }
  last = { key: `${ctx}|${label}`, at: now }
  save()
}

export interface NextStep { id: string; after: string; label: string; share: number; count: number; of: number; paused: boolean }

function nextOf(key: string, list: string[], threshold: number, off: string[]): NextStep | null {
  if (list.length < MIN_SAMPLES) return null
  const m = new Map<string, number>()
  list.forEach((l) => m.set(l, (m.get(l) ?? 0) + 1))
  const [label, count] = [...m].sort((a, b) => b[1] - a[1])[0]
  if (!label || count < MIN_SAMPLES || count / list.length < threshold) return null
  const id = `next|${key}|${label}`
  return { id, after: key.split('|')[1], label, share: count / list.length, count, of: list.length, paused: off.includes(id) }
}

/** The tool that usually comes right after this one, if there is a clear habit. */
export function nextStep(ctx: string, label: string): NextStep | null {
  const s = load()
  if (!s.on) return null
  const key = `${ctx}|${label}`
  const n = nextOf(key, s.flow[key] ?? [], s.threshold, s.off)
  return n && !n.paused ? n : null
}

/** Everything learned, for the settings sheet. */
export function allHabits(): { looks: Habit[]; steps: NextStep[] } {
  const s = load()
  const kinds = [...new Set(Object.values(s.items).map((e) => e.k))]
  const looks = kinds.flatMap((k) => habitsFor(k))
  const steps = Object.entries(s.flow).map(([k, list]) => nextOf(k, list, s.threshold, s.off)).filter((x): x is NextStep => !!x)
  return { looks, steps }
}

// ---------------------------------------------------------------- words

export const KIND_LABEL: Record<ItemKind, string> = {
  'clip-video': 'Videos in the main track', 'clip-photo': 'Photos in the main track', 'overlay-video': 'Overlay videos',
  'overlay-photo': 'Overlay photos', text: 'Text', 'audio-music': 'Music', 'audio-voice': 'Voice recordings',
  'audio-sound': 'Sound effects and detached audio', project: 'New projects',
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const secs = (n: number) => `${r2(n)} s`

/** A short name for a habit, like "Filter Warm" or "Volume 80%". */
export function describe(h: Pick<Habit, 'key' | 'value'>): string {
  const v = JSON.parse(h.value)
  switch (h.key) {
    case 'aspect': return `Format ${v}`
    case 'background': return `Background ${v}`
    case 'speed': return `Speed ${v}x`
    case 'filter': return v ? `Filter ${filterById(v[0])?.name ?? v[0]}` : 'No filter'
    case 'adjust': return 'Colour adjust'
    case 'fit': return v === 'fill' ? 'Fill frame' : 'Fit'
    case 'transition': return v ? `Transition ${TRANSITIONS.find((x) => x.id === v.type)?.name ?? v.type}` : 'No transition'
    case 'kenBurns': return v ? `Motion ${v}` : 'No motion'
    case 'volume': return `Volume ${pct(v)}`
    case 'fadeIn': return `Fade in ${secs(v)}`
    case 'fadeOut': return `Fade out ${secs(v)}`
    case 'denoise': return v ? `Remove noise (${v.kind}, ${v.level})` : 'No noise removal'
    case 'fx': return v ? 'Audio effects' : 'No audio effects'
    case 'duck': return v != null ? `Auto-lower music to ${pct(v)}` : 'No auto-lower'
    case 'box': return 'Same place and size'
    case 'place': return 'Same place'
    case 'mask': return `Shape ${v}`
    case 'border': return 'Border'
    case 'blend': return `Blend ${v ?? 'normal'}`
    case 'animIn': return `Animation in: ${v ?? 'none'}`
    case 'animOut': return `Animation out: ${v ?? 'none'}`
    case 'style.font': return `Font ${v}`
    case 'style.color': return 'Text colour'
    case 'style.size': return 'Text size'
    case 'style.stroke': case 'style.strokeWidth': return 'Outline'
    case 'style.background': return 'Text background'
    case 'style.bold': return v ? 'Bold' : 'Not bold'
    case 'style.italic': return v ? 'Italic' : 'Not italic'
    case 'style.shadow': return v ? 'Shadow' : 'No shadow'
    case 'style.align': return `Align ${v}`
    case 'style.letterSpacing': return 'Letter spacing'
    default: return h.key
  }
}
