import type { Box, BoxKey, Clip, Layer, MediaSource, StickerLayer, TextLayer, TextStyle } from '../types'
import { posAt } from './clipKeys'
import { uid } from '../lib/format'

/**
 * Follow tags: a label, arrow, emoji or ring that stays on a moving person or thing. A tag is one or two layers
 * (a pointer sticker on the thing, and a text bubble above it) that share a `tag` id; motion tracking finds the
 * thing's path and every layer of the tag gets the same moves, so they keep their places round it.
 */

export type TagKind = 'name' | 'arrow' | 'emoji' | 'ring' | 'price'
export interface TagKindDef { id: TagKind; name: string; icon: string; pointer: string; text: string | null; style?: Partial<TextStyle> }

export const TAG_KINDS: TagKindDef[] = [
  { id: 'name', name: 'Name tag', icon: '🏷️', pointer: '🔻', text: 'Name', style: { font: 'Montserrat', color: '#111111', background: '#ffffff', shadow: false, size: 0.045 } },
  { id: 'arrow', name: 'Arrow + text', icon: '⬇️', pointer: '⬇️', text: 'Look!', style: { font: 'Bangers', color: '#ffe600', stroke: '#000000', strokeWidth: 0.8, shadow: true, size: 0.06 } },
  { id: 'price', name: 'Price tag', icon: '💰', pointer: '📍', text: '₹ 999', style: { font: 'Anton', color: '#ffffff', background: '#16a34a', shadow: false, size: 0.05 } },
  { id: 'emoji', name: 'Emoji on it', icon: '😎', pointer: '😎', text: null },
  { id: 'ring', name: 'Circle it', icon: '⭕', pointer: '⭕', text: null },
]

/** The layers of a new tag on point (x, y) of the frame, from t for len seconds. Text sits above the pointer. */
export function makeTag(kind: TagKind, text: string, x: number, y: number, t: number, len: number): Layer[] {
  const def = TAG_KINDS.find((k) => k.id === kind) ?? TAG_KINDS[0]
  const tag = uid()
  const box = (bx: number, by: number, scale = 1): Box => ({ x: bx, y: by, scale, rotation: 0, opacity: 1 })
  const ring = kind === 'ring' || kind === 'emoji'
  const pointer: StickerLayer = {
    id: uid(), type: 'sticker', emoji: def.pointer, start: t, end: t + len, tag,
    box: box(x, y, ring ? 1.3 : 0.55), animIn: 'pop', animOut: 'fade',
  }
  if (!def.text) return [pointer]
  const words: TextLayer = {
    id: uid(), type: 'text', text: text.trim() || def.text, subtitle: false, start: t, end: t + len, tag,
    style: {
      font: 'Poppins', size: 0.05, color: '#ffffff', align: 'center', stroke: null, strokeWidth: 0.5, shadow: true,
      background: null, bold: true, italic: false, letterSpacing: 0, ...def.style,
    },
    box: box(x, Math.max(0.06, y - 0.11)), animIn: 'pop', animOut: 'fade',
  }
  return [pointer, words]
}

export const tagOf = (l: Layer) => l.tag ?? null
/** The layers of each tag in the project, by tag id. */
export function tagsIn(layers: Layer[]): Map<string, Layer[]> {
  const out = new Map<string, Layer[]>()
  for (const l of layers) { const id = tagOf(l); if (id) out.set(id, [...(out.get(id) ?? []), l]) }
  return out
}

/**
 * Keyframes for a layer of the tag from the followed path: its own box moved by how far the thing has moved since
 * the path's first point. Path times are timeline seconds, keys are counted from the layer's start.
 */
export function keysFromPath(l: Layer & { box: Box }, path: { t: number; x: number; y: number }[], t0: number): BoxKey[] {
  if (!path.length) return []
  const sorted = [...path].sort((a, b) => a.t - b.t)
  // the anchor: where the thing was when the tag was put on it (the moment tracking started from)
  const home = sorted.reduce((b, p) => (Math.abs(p.t - t0) < Math.abs(b.t - t0) ? p : b))
  return sorted
    .filter((p) => p.t >= l.start - 1e-6 && p.t <= l.end + 1e-6)
    .map((p) => ({ t: p.t - l.start, box: { ...l.box, x: l.box.x + (p.x - home.x), y: l.box.y + (p.y - home.y) }, lin: true }))
}

/**
 * Where a point of the source picture (fx, fy, 0..1) shows in the frame (0..1), for a main clip drawn the way
 * renderer.placeFrame does it (crop, fit / fill, flips, zoom & move). Null for sideways-rotated clips.
 */
export function sourceToFrame(c: Clip, src: MediaSource, W: number, H: number, fx: number, fy: number, srcT: number): { x: number; y: number } | null {
  if (!src.width || !src.height || c.rotate % 180 !== 0) return null
  const cr = c.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  let u = (fx - cr.x) / cr.w, v = (fy - cr.y) / cr.h
  if (c.flipH !== (c.rotate === 180)) u = 1 - u
  if (c.flipV !== (c.rotate === 180)) v = 1 - v
  const sw = cr.w * src.width, sh = cr.h * src.height
  const s = c.fit === 'fit' ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh)
  let px = (u - 0.5) * sw * s, py = (v - 0.5) * sh * s
  if (c.pos || c.keys?.length) {
    const p = posAt(c, srcT)
    const a = (p.rotation * Math.PI) / 180
    const rx = (px * Math.cos(a) - py * Math.sin(a)) * p.scale, ry = (px * Math.sin(a) + py * Math.cos(a)) * p.scale
    px = rx + p.x * W; py = ry + p.y * H
  }
  return { x: 0.5 + px / W, y: 0.5 + py / H }
}
