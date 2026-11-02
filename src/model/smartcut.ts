import type { Clip, Crop, Layer, MediaSource, Project } from '../types'
import { MIN_CLIP } from '../types'
import { layoutClips } from './timeline'
import { uid } from '../lib/format'

export interface Spot { x: number; y: number } // where the face is, 0..1 of the source frame
export type SpotAt = (sourceId: string, time: number) => Spot | null

/** A cut out of one clip, in source seconds. */
export interface CutRange { clipId: string; from: number; to: number }

/** Takes `[a, b)` timeline intervals out of the time: what is after moves back. */
export function timeMapper(removed: [number, number][]) {
  const r = [...removed].sort((x, y) => x[0] - y[0])
  return (t: number) => {
    let d = 0
    for (const [a, b] of r) {
      if (t <= a) break
      d += Math.min(t, b) - a
    }
    return t - d
  }
}

/** The removed interval that `t` falls in, if any. */
const inside = (removed: [number, number][], t: number) => removed.find(([a, b]) => t > a + 1e-6 && t < b - 1e-6)

/**
 * Takes the cut ranges out of the main clips (each clip becomes the pieces between its cuts) and moves every
 * layer so captions, text and stickers stay with the words they belong to. Layers that were only inside a cut go.
 * Video/music layers keep playing on from where they start (they just end sooner).
 */
export function applyCuts(p: Project, cuts: CutRange[]): { project: Project; pieces: string[][]; removed: number } {
  const byClip = new Map<string, CutRange[]>()
  for (const c of cuts) byClip.set(c.clipId, [...(byClip.get(c.clipId) ?? []), c])
  const { items } = layoutClips(p.clips)
  const clips: Clip[] = []
  const pieces: string[][] = [] // ids of the pieces each original clip became
  const removed: [number, number][] = []
  for (const it of items) {
    const c = it.clip
    const list = (byClip.get(c.id) ?? []).sort((x, y) => x.from - y.from)
    if (!list.length) { clips.push(c); pieces.push([c.id]); continue }
    const keep: [number, number][] = []
    let at = c.in
    for (const k of list) {
      const from = Math.max(at, k.from), to = Math.min(c.out, k.to)
      if (to <= from) continue
      if (from > at) keep.push([at, from])
      at = to
    }
    if (at < c.out) keep.push([at, c.out])
    // pieces too short to keep go as well
    const kept = keep.filter(([a, b]) => (b - a) / c.speed >= MIN_CLIP)
    if (!kept.length) kept.push(keep.sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0] ?? [c.in, Math.min(c.out, c.in + MIN_CLIP * c.speed)])
    let src = c.in
    for (const [a, b] of [...kept, [c.out, c.out] as [number, number]]) {
      if (a > src + 1e-6) removed.push([it.start + (src - c.in) / c.speed, it.start + (a - c.in) / c.speed])
      src = b
    }
    const ids: string[] = []
    kept.forEach(([a, b], i) => {
      const first = i === 0, last = i === kept.length - 1
      const piece: Clip = {
        ...c, id: first ? c.id : uid(), in: a, out: b,
        fadeIn: first ? c.fadeIn : 0, fadeOut: last ? c.fadeOut : 0, transition: last ? c.transition : null,
      }
      if (!first) delete piece.gap
      clips.push(piece)
      ids.push(piece.id)
    })
    pieces.push(ids)
  }
  const map = timeMapper(removed)
  const layers: Layer[] = []
  for (const l of p.layers) {
    const start = map(l.start), end = map(l.end)
    if (end - start < Math.max(0.05, (l.end - l.start) * 0.15)) continue // (almost) all of it was cut
    const next = { ...l, start, end } as Layer
    const hit = inside(removed, l.start)
    if (hit && (next.type === 'media' || next.type === 'audio' || next.type === 'wave')) {
      const sp = next.type === 'wave' ? 1 : next.speed ?? 1
      next.in += (hit[1] - l.start) * sp
    }
    layers.push(next)
  }
  const originalSubs = p.originalSubs
    ? { ...p.originalSubs, cues: p.originalSubs.cues.map((c) => ({ ...c, start: map(c.start), end: map(c.end) })).filter((c) => c.end - c.start >= 0.05) }
    : p.originalSubs
  const gone = removed.reduce((s, [a, b]) => s + (b - a), 0)
  return { project: { ...p, clips, layers, ...(originalSubs !== undefined ? { originalSubs } : {}) }, pieces, removed: gone }
}

/** A crop `zoom` times closer inside `base`, with the face a third of the way down (or the middle when unknown). */
export function zoomCrop(base: Crop | null, zoom: number, spot: Spot | null): Crop {
  const b = base ?? { x: 0, y: 0, w: 1, h: 1 }
  const w = b.w / zoom, h = b.h / zoom
  const cx = spot ? spot.x : b.x + b.w / 2
  const cy = spot ? spot.y + h / 6 : b.y + b.h * 0.45
  const x = Math.min(b.x + b.w - w, Math.max(b.x, cx - w / 2))
  const y = Math.min(b.y + b.h - h, Math.max(b.y, cy - h / 2))
  return { x, y, w, h }
}

/**
 * Punch-in zoom (jump-cut zoom): every other video clip in `ids` comes closer by `zoom`, so each cut feels like
 * a new camera angle. Clips are zoomed from how they are framed now.
 */
export function punchIn(clips: Clip[], ids: Set<string>, sources: Record<string, MediaSource>, zoom: number, spotAt: SpotAt): Clip[] {
  let n = 0
  return clips.map((c) => {
    if (!ids.has(c.id) || sources[c.sourceId]?.kind !== 'video') return c
    const odd = n++ % 2 === 1
    if (!odd) return c
    return { ...c, crop: zoomCrop(c.crop, zoom, spotAt(c.sourceId, (c.in + c.out) / 2)) }
  })
}

/**
 * A Short from a stretch of the timeline: the main clips and layers inside `[from, to)` moved to start at 0,
 * framed 9:16 round the person (or the middle).
 */
export function cutShort(p: Project, from: number, to: number, sources: Record<string, MediaSource>, spotAt: SpotAt): Project {
  const { items } = layoutClips(p.clips)
  const clips: Clip[] = []
  for (const it of items) {
    const s = it.start, e = it.start + it.dur
    if (e <= from + 1e-3 || s >= to - 1e-3) continue
    const c = it.clip
    if (c.ramp) {
      // speed ramps can't be cut part-way: take the whole clip when most of it is inside
      if (Math.min(e, to) - Math.max(s, from) < it.dur / 2) continue
      clips.push({ ...c, id: uid() })
      continue
    }
    const a = c.in + Math.max(0, from - s) * c.speed, b = c.in + (Math.min(e, to) - s) * c.speed
    if ((b - a) / c.speed < MIN_CLIP) continue
    const piece: Clip = { ...c, id: uid(), in: a, out: b, fit: 'fill', crop: shortCrop(c, sources[c.sourceId], spotAt) }
    if (clips.length === 0) { delete piece.gap; piece.fadeIn = Math.min(piece.fadeIn, 0.3) }
    if (e > to) { piece.transition = null; piece.fadeOut = 0 }
    clips.push(piece)
  }
  const layers: Layer[] = []
  for (const l of p.layers) {
    if (l.end <= from || l.start >= to) continue
    const start = Math.max(0, l.start - from), end = Math.min(to, l.end) - from
    if (end - start < 0.05) continue
    const next = { ...l, id: uid(), start, end } as Layer
    if (l.start < from && (next.type === 'media' || next.type === 'audio' || next.type === 'wave')) {
      next.in += (from - l.start) * (next.type === 'wave' ? 1 : next.speed ?? 1)
    }
    layers.push(next)
  }
  return {
    ...p, clips, layers,
    settings: { ...p.settings, aspect: '9:16' },
    originalSubs: p.originalSubs ? { ...p.originalSubs, cues: p.originalSubs.cues.filter((c) => c.end > from && c.start < to).map((c) => ({ ...c, start: Math.max(0, c.start - from), end: Math.min(to, c.end) - from })) } : p.originalSubs ?? null,
  }
}

/** A tall 9:16 part of a wide video, round the person. Tall videos and photos keep their framing. */
function shortCrop(c: Clip, src: MediaSource | undefined, spotAt: SpotAt): Crop | null {
  if (!src || src.kind !== 'video' || !src.width || !src.height) return c.crop
  const b = c.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const rot = c.rotate % 180 !== 0
  const shown = ((rot ? src.height : src.width) * b.w) / ((rot ? src.width : src.height) * b.h)
  const want = 9 / 16
  if (shown <= want * 1.05 || rot) return c.crop
  const w = b.w * (want / shown)
  const spot = spotAt(c.sourceId, (c.in + c.out) / 2)
  const cx = spot ? spot.x : b.x + b.w / 2
  return { x: Math.min(b.x + b.w - w, Math.max(b.x, cx - w / 2)), y: b.y, w, h: b.h }
}

/** The ids of the clips in `pieces` that came out of the same original clip, flattened. */
export const allPieces = (pieces: string[][]) => new Set(pieces.flat())
