import type { AudioLayer, Clip, ClipKey, ClipPos, Layer, MediaLayer, VolKey } from '../types'
import { clipSegments, layerSpeed, sourceAt } from './timeline'

/**
 * Keyframes on the main video (zoom & move of the picture) and on any sound (volume).
 * Their times are SOURCE seconds, so a keyframe stays on the same moment of the video when the clip is trimmed,
 * split, slipped or sped up, like in Premiere.
 */

export const NO_POS: ClipPos = { x: 0, y: 0, scale: 1, rotation: 0 }
/** Two keyframes closer than this (source seconds) are the same one. */
export const CLIP_KEY_SNAP = 0.04

const ease = (x: number) => x * x * (3 - 2 * x)
const mix = (a: number, b: number, k: number) => a + (b - a) * k

/** The picture's zoom & move at source time `src`. */
export function posAt(c: Clip, src: number): ClipPos {
  const keys = c.keys
  if (!keys?.length) return c.pos ?? NO_POS
  if (src <= keys[0].t) return keys[0].pos
  const last = keys[keys.length - 1]
  if (src >= last.t) return last.pos
  const i = keys.findIndex((k) => k.t > src)
  const a = keys[i - 1], b = keys[i]
  const k = ease((src - a.t) / (b.t - a.t))
  return { x: mix(a.pos.x, b.pos.x, k), y: mix(a.pos.y, b.pos.y, k), scale: mix(a.pos.scale, b.pos.scale, k), rotation: mix(a.pos.rotation, b.pos.rotation, k) }
}

export const isNoPos = (p: ClipPos | null | undefined) => !p || (Math.abs(p.x) < 1e-4 && Math.abs(p.y) < 1e-4 && Math.abs(p.scale - 1) < 1e-4 && Math.abs(p.rotation) < 1e-3)

/** Keyframes with `pos` saved at source time `src` (replacing one already there). */
export function withClipKey(c: Clip, src: number, pos: ClipPos): ClipKey[] {
  const keys = (c.keys ?? []).filter((k) => Math.abs(k.t - src) >= CLIP_KEY_SNAP)
  return [...keys, { t: src, pos: { ...pos } }].sort((a, b) => a.t - b.t)
}

/** A zoom & move change at source time `src`: a keyframe there when the clip has keyframes, else its fixed pos. */
export function posPatch(c: Clip, src: number | null, pos: ClipPos): Partial<Clip> {
  if (c.keys?.length && src !== null) return { keys: withClipKey(c, src, pos) }
  return { pos: { ...pos } }
}

/** Index of the zoom & move keyframe at source time `src`, or -1. */
export const clipKeyAt = (c: Clip, src: number | null) => (src === null ? -1 : (c.keys ?? []).findIndex((k) => Math.abs(k.t - src) < CLIP_KEY_SNAP))

/** Source time at timeline-local time `local` of a clip, or of a track item. */
export const clipSrcAt = (c: Clip, local: number) => sourceAt(c, local).time
export const layerSrcAt = (l: Layer, local: number) => ('in' in l ? l.in : 0) + local * layerSpeed(l)

// ---- volume keyframes

type Sounding = Clip | MediaLayer | AudioLayer

/** The volume at source time `src`: straight lines between volume keyframes, else the plain volume. */
export function volAt(x: Sounding, src: number): number {
  const keys = x.volKeys
  if (!keys?.length) return x.volume
  if (src <= keys[0].t) return keys[0].v
  const last = keys[keys.length - 1]
  if (src >= last.t) return last.v
  const i = keys.findIndex((k) => k.t > src)
  const a = keys[i - 1], b = keys[i]
  return mix(a.v, b.v, (src - a.t) / (b.t - a.t))
}

/** The loudest the item ever gets (0 = always silent). */
export const maxVol = (x: Sounding) => (x.volKeys?.length ? Math.max(...x.volKeys.map((k) => k.v)) : x.volume)

export function withVolKey(x: Sounding, src: number, v: number): VolKey[] {
  const keys = (x.volKeys ?? []).filter((k) => Math.abs(k.t - src) >= CLIP_KEY_SNAP)
  return [...keys, { t: src, v }].sort((a, b) => a.t - b.t)
}
export const volKeyAt = (x: Sounding, src: number | null) => (src === null ? -1 : (x.volKeys ?? []).findIndex((k) => Math.abs(k.t - src) < CLIP_KEY_SNAP))

/** Timeline-local time (seconds from the clip's start) where source time `src` shows, or null outside the clip. */
export function localOfSrc(c: Clip, src: number): number | null {
  if (src < c.in - 1e-3 || src > c.out + 1e-3) return null
  for (const s of clipSegments(c)) {
    if (src <= s.srcEnd + 1e-6) return s.tStart + (Math.max(src, s.srcStart) - s.srcStart) / s.speed
  }
  return null
}
