import { useSyncExternalStore } from 'react'
import type { IconName } from '../components/Icon'

/**
 * The editor's tool row, made personal: where it sits (under the video, or in the empty space left/right of it),
 * groups of related tools, favourites (pinned tools), the user's own order, and the hover magnify effect.
 * Saved on this device only (localStorage 'toolbar').
 */

export type Dock = 'bottom' | 'left' | 'right'
export type GroupId = 'all' | 'fav' | 'edit' | 'add' | 'text' | 'look' | 'audio' | 'ai'
export type PresetId = 'default' | 'editing' | 'color' | 'audio'

export type ToolbarSettings = {
  dock: Dock
  /** the group shown (a group with nothing for the current selection shows All) */
  group: GroupId
  /** show the row of group chips */
  grouped: boolean
  /** hover with a mouse: the button under the cursor grows most, its neighbours a little */
  magnify: boolean
  /** tool keys pinned to Favourites (also shown first in All) */
  pins: string[]
  /** the user's own order of tool keys */
  order: string[]
}

export const DEFAULTS: ToolbarSettings = { dock: 'bottom', group: 'all', grouped: true, magnify: true, pins: [], order: [] }

export const GROUPS: { id: GroupId; label: string; icon: IconName }[] = [
  { id: 'fav', label: 'Favourites', icon: 'star' },
  { id: 'all', label: 'All', icon: 'apps' },
  { id: 'edit', label: 'Cut & edit', icon: 'split' },
  { id: 'add', label: 'Add', icon: 'add' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'look', label: 'Look & color', icon: 'color' },
  { id: 'audio', label: 'Audio', icon: 'music' },
  { id: 'ai', label: 'AI & makers', icon: 'ai' },
]

/** Which group a tool belongs to (by its key). Unknown tools go to Edit. */
const GROUP_OF: Record<string, Exclude<GroupId, 'all' | 'fav'>> = {}
const put = (g: Exclude<GroupId, 'all' | 'fav'>, keys: string[]) => { for (const k of keys) GROUP_OF[k] = g }
put('edit', ['Split', 'Trim', 'Delete', 'Duplicate', 'Move / swap', 'Swap', 'Select all', 'One clip', 'One item', 'Insert after', 'Replace',
  'Freeze frame', 'reverse', 'Speed', 'Layer order', 'Keyframes', 'Track', 'Zoom & move', 'fit', 'Copy track', 'Paste track', 'Copy style',
  'Paste style', 'marker'])
put('add', ['Add', 'Overlay', 'Add overlay', 'Stickers', 'Shower', 'Showers', 'Split screen', 'Blur', 'Record screen', 'Record camera', 'Intro/Outro', 'Slideshow'])
put('text', ['Text', 'Titles', 'Edit', 'Style', 'Caption style', 'Behind person', 'captions', 'Subtitles', 'Listen again'])
put('look', ['Filters', 'Effects', 'Adjust', 'Color', 'Crop', 'Mask', 'Transition', 'Green screen', 'Remove BG', 'Blend', 'Animation', 'motion',
  'Photo', 'Size & opacity', 'Watermark', 'Format', 'Adjustment layer', 'Scopes', 'Strength', 'Main frame'])
put('audio', ['Audio', 'Record voice', 'Volume', 'Remove noise', 'Audio effects', 'Detach audio', 'Beats', 'Beat sync', 'Waveform'])
put('ai', ['AI Dub', 'Smart cut', 'Slides to video', 'Script to video', 'Mind map to video', 'Audio to video', 'Quiz to video', 'Data to video', 'Article to video'])

export const groupOf = (key: string) => GROUP_OF[key] ?? 'edit'

/** Tools that always stay in view whatever group is picked (the Smart shortcuts ones). */
export const ALWAYS = new Set(['Your usual', 'Smart shortcuts'])

export const PRESETS: { id: PresetId; label: string; hint: string; set: Pick<ToolbarSettings, 'dock' | 'group'> }[] = [
  { id: 'default', label: 'Default', hint: 'All tools under the video', set: { dock: 'bottom', group: 'all' } },
  { id: 'editing', label: 'Editing', hint: 'Cut, trim, move tools under the video', set: { dock: 'bottom', group: 'edit' } },
  { id: 'color', label: 'Color', hint: 'Look & color tools on the right of the video', set: { dock: 'right', group: 'look' } },
  { id: 'audio', label: 'Audio', hint: 'Sound tools on the left of the video', set: { dock: 'left', group: 'audio' } },
]

export const presetOf = (s: ToolbarSettings): PresetId | null => PRESETS.find((p) => p.set.dock === s.dock && p.set.group === s.group)?.id ?? null

// ---- store
const KEY = 'toolbar'
const load = (): ToolbarSettings => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const v = JSON.parse(raw) as Partial<ToolbarSettings>
    return {
      dock: v.dock === 'left' || v.dock === 'right' ? v.dock : 'bottom',
      group: GROUPS.some((g) => g.id === v.group) ? v.group! : 'all',
      grouped: v.grouped !== false,
      magnify: v.magnify !== false,
      pins: Array.isArray(v.pins) ? v.pins.filter((x) => typeof x === 'string') : [],
      order: Array.isArray(v.order) ? v.order.filter((x) => typeof x === 'string') : [],
    }
  } catch { return DEFAULTS }
}
let store = load()
const subs = new Set<() => void>()
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const toolbarSettings = () => store
export function setToolbar(patch: Partial<ToolbarSettings>) {
  store = { ...store, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* private mode */ }
  subs.forEach((f) => f())
}
export const useToolbar = () => useSyncExternalStore(subscribe, () => store)

export const applyPreset = (id: PresetId) => { const p = PRESETS.find((x) => x.id === id); if (p) setToolbar(p.set) }
export const isPinned = (key: string) => store.pins.includes(key)
export const togglePin = (key: string) => setToolbar({ pins: isPinned(key) ? store.pins.filter((k) => k !== key) : [...store.pins, key] })

// ---- order

/**
 * The tools in the user's order. Only tools the user has placed move: they take the places those same tools
 * had, sorted by the saved order; everything else stays where the editor puts it.
 */
export function ordered<T>(items: T[], keyOf: (x: T) => string, order: string[]): T[] {
  if (!order.length) return items
  const rank = new Map(order.map((k, i) => [k, i]))
  const slots: number[] = []
  const placed: T[] = []
  items.forEach((x, i) => { if (rank.has(keyOf(x))) { slots.push(i); placed.push(x) } })
  placed.sort((a, b) => rank.get(keyOf(a))! - rank.get(keyOf(b))!)
  const out = items.slice()
  slots.forEach((s, i) => { out[s] = placed[i] })
  return out
}

/** Pinned tools first (in pin order), the rest after. */
export function pinnedFirst<T>(items: T[], keyOf: (x: T) => string, pins: string[]): T[] {
  if (!pins.length) return items
  const p = items.filter((x) => pins.includes(keyOf(x)))
  return [...p, ...items.filter((x) => !pins.includes(keyOf(x)))]
}

/** Save a new order for the tools in view: `visible` is the keys as now shown, `key` moves to `to`. */
export function moveTool(visible: string[], key: string, to: number) {
  const from = visible.indexOf(key)
  if (from < 0) return
  const next = visible.slice()
  next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, key)
  setToolbar({ order: [...next, ...store.order.filter((k) => !next.includes(k))] })
}

/** The tools to show for a group (Smart shortcuts tools stay in every group). */
export function inGroup<T>(items: T[], keyOf: (x: T) => string, group: GroupId, pins: string[]): T[] {
  if (group === 'all') return items
  if (group === 'fav') return items.filter((x) => ALWAYS.has(keyOf(x)) || pins.includes(keyOf(x)))
  return items.filter((x) => ALWAYS.has(keyOf(x)) || groupOf(keyOf(x)) === group)
}

/** How much each button grows (0..1) for a pointer at `p`, given the button centres along the row. */
export function magnifyLevels(centres: number[], p: number, size: number, reach = 2.6): number[] {
  return centres.map((c) => {
    const d = Math.abs(c - p) / Math.max(1, size)
    if (d >= reach) return 0
    // smooth bell: 1 under the cursor, falling to 0 about `reach` buttons away
    return (Math.cos((d / reach) * Math.PI) + 1) / 2
  })
}
