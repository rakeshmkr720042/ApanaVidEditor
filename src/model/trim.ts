import type { Clip, Layer, MediaSource, Project } from '../types'
import { MIN_CLIP } from '../types'
import { IMAGE_DURATION, layerSpeed, layoutClips, sourceAt } from './timeline'

/**
 * Pro trim edits (Premiere / Resolve names):
 * - ripple trim: cut a clip's start or end to the playhead; the main video closes up behind it (Q / W)
 * - roll: move the cut between two clips; one gets longer, the other shorter, the total stays the same
 * - slip: show a different part of the clip's video, same length and place
 * - slide: move a clip between its neighbours; the one before gets longer and the one after shorter
 * - ripple delete (track rows): delete an item and pull the later items on its row back by its length
 *
 * Times here are timeline seconds; a clip's source part changes by (timeline change × its speed).
 */

const srcEnd = (c: Clip, sources: Record<string, MediaSource>) => {
  const s = sources[c.sourceId]
  return !s ? c.out : s.kind === 'image' ? IMAGE_DURATION : s.duration
}
/** Clips with a speed ramp have no single speed: roll and slide leave them alone. */
const ramped = (c: Clip | undefined) => !!c?.ramp

export type Range = { min: number; max: number }
const none: Range = { min: 0, max: 0 }

/** How far (timeline seconds, − = earlier) the cut after clip `i` can roll. */
export function rollRange(clips: Clip[], i: number, sources: Record<string, MediaSource>): Range {
  const a = clips[i], b = clips[i + 1]
  if (!a || !b || ramped(a) || ramped(b) || (b.gap ?? 0) > 0) return none
  return {
    // a shortens / b's start goes back to its source start
    min: -Math.min((a.out - a.in - MIN_CLIP) / a.speed, b.in / b.speed),
    // a grows to its source end / b shortens
    max: Math.min((srcEnd(a, sources) - a.out) / a.speed, (b.out - b.in - MIN_CLIP) / b.speed),
  }
}

export function roll(clips: Clip[], i: number, d: number): Record<string, Partial<Clip>> {
  const a = clips[i], b = clips[i + 1]
  return { [a.id]: { out: a.out + d * a.speed }, [b.id]: { in: b.in + d * b.speed } }
}

/** How far (source seconds) clip `i` can slip: − shows earlier video, + later. */
export function slipRange(c: Clip, sources: Record<string, MediaSource>): Range {
  const s = sources[c.sourceId]
  if (!s || s.kind === 'image') return none
  return { min: -c.in, max: s.duration - c.out }
}

export const slip = (c: Clip, d: number): Record<string, Partial<Clip>> => ({ [c.id]: { in: c.in + d, out: c.out + d } })

/** How far (timeline seconds) clip `i` can slide between its neighbours. */
export function slideRange(clips: Clip[], i: number, sources: Record<string, MediaSource>): Range {
  const p = clips[i - 1], c = clips[i], n = clips[i + 1]
  if (!p || !c || !n || ramped(p) || ramped(n) || (c.gap ?? 0) > 0 || (n.gap ?? 0) > 0) return none
  return {
    min: -Math.min((p.out - p.in - MIN_CLIP) / p.speed, n.in / n.speed),
    max: Math.min((srcEnd(p, sources) - p.out) / p.speed, (n.out - n.in - MIN_CLIP) / n.speed),
  }
}

export function slide(clips: Clip[], i: number, d: number): Record<string, Partial<Clip>> {
  const p = clips[i - 1], n = clips[i + 1]
  return { [p.id]: { out: p.out + d * p.speed }, [n.id]: { in: n.in + d * n.speed } }
}

/**
 * Ripple trim of the main-video clip under the playhead (or `id` when the playhead is inside it): its start ('in')
 * or end ('out') is cut to the playhead. Returns the patch and where the playhead should go (the cut point).
 */
export function trimClipToPlayhead(project: Project, t: number, side: 'in' | 'out', id?: string): { patch: Record<string, Partial<Clip>>; at: number } | null {
  const { items } = layoutClips(project.clips)
  const it = items.find((x) => (id ? x.clip.id === id : true) && t > x.start + 1e-3 && t < x.start + x.dur - 1e-3)
    ?? (id ? undefined : items.find((x) => t > x.start && t < x.start + x.dur))
  if (!it) return null
  const c = it.clip
  const local = t - it.start
  if (side === 'in' ? it.dur - local < MIN_CLIP : local < MIN_CLIP) return null
  const at = sourceAt(c, local).time
  return side === 'in' ? { patch: { [c.id]: { in: at } }, at: it.start } : { patch: { [c.id]: { out: at } }, at: t }
}

/** The same for a track item: start or end cut to the playhead (keyframes keep their times on the picture). */
export function trimLayerToPlayhead(l: Layer, t: number, side: 'in' | 'out'): Partial<Layer> | null {
  if (t <= l.start + 0.1 || t >= l.end - 0.1) return null
  if (side === 'out') return { end: t }
  const d = t - l.start
  const patch: Record<string, unknown> = { start: t }
  if ('in' in l) patch.in = l.in + d * layerSpeed(l)
  if ('keys' in l && l.keys?.length) patch.keys = l.keys.map((k) => ({ ...k, t: k.t - d })).filter((k) => k.t >= -1e-3)
  return patch as Partial<Layer>
}

/** Ripple delete on a track row: the item goes and the later items on its row move back by its length. */
export function rippleDeleteLayer(p: Project, id: string): Project {
  const l = p.layers.find((x) => x.id === id)
  if (!l) return p
  const len = l.end - l.start
  return {
    ...p,
    layers: p.layers.filter((x) => x.id !== id).map((x) => (x.track === l.track && x.start >= l.end - 1e-3 ? { ...x, start: x.start - len, end: x.end - len } : x)),
  }
}
