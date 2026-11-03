import { useSyncExternalStore } from 'react'
import type { Clip, Layer, MediaSource, Project } from '../types'
import { hasSound } from '../engine/denoise'

/**
 * Copy style / Paste style (Premiere's "Paste attributes"): the look, sound, speed, frame, animation or text style
 * of one clip or layer put on others, without changing what they show or where they sit.
 */

type Kind = 'clip' | Layer['type']
export type StylePart = 'look' | 'sound' | 'speed' | 'frame' | 'anim' | 'text'

/** Which item kinds carry each setting, and its value when the item has none. */
const KEYS: Record<StylePart, { key: string; kinds: Kind[]; none: unknown }[]> = {
  look: [
    { key: 'filter', kinds: ['clip', 'media'], none: null },
    { key: 'filterAmount', kinds: ['clip', 'media'], none: 1 },
    { key: 'adjust', kinds: ['clip', 'media'], none: undefined },
    { key: 'effect', kinds: ['clip', 'media'], none: null },
    { key: 'grade', kinds: ['clip', 'media'], none: null },
  ],
  sound: [
    { key: 'volume', kinds: ['clip', 'media', 'audio'], none: 1 },
    { key: 'fadeIn', kinds: ['clip', 'audio'], none: 0 },
    { key: 'fadeOut', kinds: ['clip', 'audio'], none: 0 },
    { key: 'fx', kinds: ['clip', 'media', 'audio'], none: null },
    { key: 'denoise', kinds: ['clip', 'media', 'audio'], none: null },
  ],
  speed: [
    { key: 'speed', kinds: ['clip', 'media', 'audio'], none: 1 },
    { key: 'ramp', kinds: ['clip'], none: null },
  ],
  frame: [
    { key: 'crop', kinds: ['clip', 'media'], none: null },
    { key: 'fit', kinds: ['clip'], none: 'fit' },
    { key: 'rotate', kinds: ['clip'], none: 0 },
    { key: 'flipH', kinds: ['clip', 'media'], none: false },
    { key: 'flipV', kinds: ['clip', 'media'], none: false },
    { key: 'mask', kinds: ['media'], none: 'none' },
    { key: 'border', kinds: ['media'], none: 0 },
    { key: 'blend', kinds: ['media'], none: 'normal' },
  ],
  anim: [
    { key: 'animIn', kinds: ['text', 'sticker', 'media'], none: 'none' },
    { key: 'animOut', kinds: ['text', 'sticker', 'media'], none: 'none' },
    { key: 'loop', kinds: ['text', 'sticker'], none: 'none' },
  ],
  text: [
    { key: 'style', kinds: ['text'], none: undefined },
    { key: 'words', kinds: ['text'], none: null },
    { key: 'frame', kinds: ['text'], none: null },
  ],
}

export const PART_LABELS: Record<StylePart, string> = {
  look: 'Color & look', sound: 'Sound', speed: 'Speed', frame: 'Crop & turn', anim: 'Animation', text: 'Text style',
}
export const PARTS = Object.keys(KEYS) as StylePart[]

export interface CopiedStyle {
  from: Kind
  name: string // what it was copied from, for messages
  values: Partial<Record<StylePart, Record<string, unknown>>>
}

type Item = Clip | Layer
const kindOf = (x: Item): Kind => ('type' in x ? x.type : 'clip')
const clone = <T>(v: T): T => (v === undefined || v === null || typeof v !== 'object' ? v : structuredClone(v))

/** Does this item have a sound / a moving picture (for the sound and speed parts)? */
function fits(part: StylePart, x: Item, sources: Record<string, MediaSource>) {
  const src = 'sourceId' in x ? sources[x.sourceId] : undefined
  if (part === 'sound') return kindOf(x) === 'audio' || hasSound(src)
  if (part === 'speed') return kindOf(x) === 'audio' || src?.kind === 'video'
  return true
}

/** The parts this item can give (copy) or take (paste). */
export function partsOf(x: Item, sources: Record<string, MediaSource>): StylePart[] {
  const k = kindOf(x)
  return PARTS.filter((p) => KEYS[p].some((d) => d.kinds.includes(k)) && fits(p, x, sources))
}

export function copyStyle(x: Item, sources: Record<string, MediaSource>, name: string): CopiedStyle | null {
  const k = kindOf(x)
  const values: CopiedStyle['values'] = {}
  for (const p of partsOf(x, sources)) {
    const v: Record<string, unknown> = {}
    for (const d of KEYS[p]) {
      if (!d.kinds.includes(k)) continue
      const own = (x as unknown as Record<string, unknown>)[d.key]
      v[d.key] = clone(own === undefined ? d.none : own)
    }
    values[p] = v
  }
  if (!Object.keys(values).length) return null
  const style = { from: k, name, values }
  store = style
  for (const f of listeners) f()
  return style
}

/** The parts of a copied style that `x` can take. */
export function pasteableParts(style: CopiedStyle, x: Item, sources: Record<string, MediaSource>): StylePart[] {
  const k = kindOf(x)
  const mine = partsOf(x, sources)
  return PARTS.filter((p) => style.values[p] && mine.includes(p) && Object.keys(style.values[p]!).some((key) => KEYS[p].find((d) => d.key === key)?.kinds.includes(k)))
}

/** The changes that put the chosen parts of a copied style on one item (empty when nothing fits). */
export function stylePatch(style: CopiedStyle, x: Item, parts: StylePart[], sources: Record<string, MediaSource>): Record<string, unknown> {
  const k = kindOf(x)
  const out: Record<string, unknown> = {}
  for (const p of pasteableParts(style, x, sources)) {
    if (!parts.includes(p)) continue
    for (const [key, v] of Object.entries(style.values[p]!)) {
      const d = KEYS[p].find((dd) => dd.key === key)
      if (!d?.kinds.includes(k) || v === undefined) continue
      out[key] = clone(v)
    }
  }
  // a track item with a new speed keeps its source part, so its length changes (and never runs past the file's end)
  if ('speed' in out && k !== 'clip' && 'start' in x && 'sourceId' in x) {
    const l = x as Extract<Layer, { sourceId: string; in: number }>
    const old = (l as { speed?: number }).speed ?? 1
    const sp = Math.max(0.1, Number(out.speed) || 1)
    const src = sources[l.sourceId]
    let dur = ((l.end - l.start) * old) / sp
    if (src?.duration) dur = Math.min(dur, Math.max(0.2, (src.duration - l.in) / sp))
    out.end = l.start + dur
  }
  // a clip with a ramp ignores its own speed; a pasted plain speed takes the ramp off
  if (k === 'clip' && 'speed' in out && !('ramp' in out)) out.ramp = null
  return out
}

/** Patches for every target id (clips and layers of the project) that can take the style. */
export function pastePatches(style: CopiedStyle, project: Project, ids: string[], parts: StylePart[], sources: Record<string, MediaSource>) {
  const patches: Record<string, Record<string, unknown>> = {}
  for (const id of ids) {
    const x: Item | undefined = project.clips.find((c) => c.id === id) ?? project.layers.find((l) => l.id === id)
    if (!x) continue
    const patch = stylePatch(style, x, parts, sources)
    // a .cube look copied in another project is not in this one: keep the rest of the grade
    const g = patch.grade as { lut?: { id: string } } | null | undefined
    if (g?.lut && !project.luts?.some((l) => l.id === g.lut!.id)) patch.grade = { ...g, lut: undefined }
    if (Object.keys(patch).length) patches[id] = patch
  }
  return patches
}

// the copied style lives for the whole session (also when another project is opened)
let store: CopiedStyle | null = null
const listeners = new Set<() => void>()
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
export const useCopiedStyle = () => useSyncExternalStore(subscribe, () => store)
export const copiedStyle = () => store
