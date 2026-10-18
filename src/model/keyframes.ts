import type { Box, BoxKey, Layer } from '../types'

/** Two keyframes closer than this (seconds) are the same one. */
export const KEY_SNAP = 0.05

type Boxed = Extract<Layer, { box: Box }>

export const hasBox = (l: Layer): l is Boxed => 'box' in l

export const keysOf = (l: Layer): BoxKey[] => (hasBox(l) ? l.keys ?? [] : [])

const ease = (x: number) => x * x * (3 - 2 * x)
const mix = (a: number, b: number, k: number) => a + (b - a) * k

/** Where the layer's box is at timeline time t: its own box without keyframes, else glided between them. */
export function boxAt(l: Boxed, t: number): Box {
  const keys = l.keys
  if (!keys?.length) return l.box
  const lt = t - l.start
  if (lt <= keys[0].t) return keys[0].box
  const last = keys[keys.length - 1]
  if (lt >= last.t) return last.box
  const i = keys.findIndex((k) => k.t > lt)
  const a = keys[i - 1], b = keys[i]
  const k = ease((lt - a.t) / (b.t - a.t))
  return {
    x: mix(a.box.x, b.box.x, k), y: mix(a.box.y, b.box.y, k), scale: mix(a.box.scale, b.box.scale, k),
    rotation: mix(a.box.rotation, b.box.rotation, k), opacity: mix(a.box.opacity, b.box.opacity, k),
  }
}

/** The layer as it looks at time t (box taken from its keyframes). */
export function atTime<L extends Layer>(l: L, t: number): L {
  return hasBox(l) && l.keys?.length ? { ...l, box: boxAt(l, t) } : l
}

/** Index of the keyframe at time t, or -1. */
export const keyIndexAt = (l: Layer, t: number) => keysOf(l).findIndex((k) => Math.abs(k.t - (t - l.start)) < KEY_SNAP)

/** Keyframes with the box at time t saved (replacing a keyframe already there). */
export function withKey(l: Boxed, t: number, box: Box): BoxKey[] {
  const lt = Math.max(0, Math.min(l.end - l.start, t - l.start))
  const keys = (l.keys ?? []).filter((k) => Math.abs(k.t - lt) >= KEY_SNAP)
  return [...keys, { t: lt, box: { ...box } }].sort((a, b) => a.t - b.t)
}

/**
 * A change to a keyframed layer: a new box becomes a keyframe at time t instead of replacing the layer's box,
 * so dragging, resizing or a slider at another moment adds a step to the motion.
 */
export function keyedPatch(l: Layer, patch: Partial<Layer>, t: number): Partial<Layer> {
  if (!hasBox(l) || !l.keys?.length || !('box' in patch) || !patch.box) return patch
  const { box, ...rest } = patch as Partial<Boxed>
  return { ...rest, keys: withKey(l, t, box!) } as Partial<Layer>
}

/** Splits a layer's keyframes at timeline time t: the left part ends, and the right part starts, on the pose at t. */
export function splitKeys(l: Layer, t: number): { left?: BoxKey[]; right?: BoxKey[] } {
  if (!hasBox(l) || !l.keys?.length) return {}
  const lt = t - l.start
  const at = { t: lt, box: boxAt(l, t) }
  const left = [...l.keys.filter((k) => k.t < lt - KEY_SNAP), at]
  const right = [{ ...at, t: 0 }, ...l.keys.filter((k) => k.t > lt + KEY_SNAP).map((k) => ({ ...k, t: k.t - lt }))]
  return { left, right }
}
