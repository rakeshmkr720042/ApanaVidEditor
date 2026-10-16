import type { Adjust, Clip, Layer, MediaSource, Project } from '../types'

export const IMAGE_DURATION = 3600 // images behave like a very long still video

export const SPEED_RAMPS: { id: string; name: string; points: number[] }[] = [
  { id: 'montage', name: 'Montage', points: [1, 1, 3, 3, 0.4, 0.4, 3, 1] },
  { id: 'hero', name: 'Hero', points: [1, 2, 3, 0.3, 0.3, 0.3, 3, 2] },
  { id: 'bullet', name: 'Bullet', points: [2, 2, 0.25, 0.25, 0.25, 2, 2, 2] },
  { id: 'jump', name: 'Jump cut', points: [1, 1, 4, 4, 1, 1, 4, 1] },
  { id: 'flash-in', name: 'Flash in', points: [4, 3, 2, 1.5, 1, 1, 1, 1] },
  { id: 'flash-out', name: 'Flash out', points: [1, 1, 1, 1, 1.5, 2, 3, 4] },
  { id: 'slow-mid', name: 'Slow middle', points: [1.5, 1, 0.5, 0.3, 0.3, 0.5, 1, 1.5] },
  { id: 'build-up', name: 'Build up', points: [0.5, 0.6, 0.8, 1, 1.3, 1.7, 2.2, 3] },
]

export interface Segment { srcStart: number; srcEnd: number; speed: number; tStart: number; tEnd: number }

/** Splits a clip into constant-speed pieces (one piece unless it has a speed ramp). */
export function clipSegments(c: Clip): Segment[] {
  const ramp = c.ramp ? SPEED_RAMPS.find((r) => r.id === c.ramp) : null
  const speeds = ramp ? ramp.points : [c.speed]
  const n = speeds.length
  const len = (c.out - c.in) / n
  let t = 0
  return speeds.map((speed, i) => {
    const d = len / speed
    const seg = { srcStart: c.in + i * len, srcEnd: c.in + (i + 1) * len, speed, tStart: t, tEnd: t + d }
    t += d
    return seg
  })
}

export function clipDuration(c: Clip) {
  const segs = clipSegments(c)
  return segs[segs.length - 1].tEnd
}

/** Maps time inside the clip (timeline seconds) to source time and playback rate. */
export function sourceAt(c: Clip, local: number): { time: number; speed: number } {
  const segs = clipSegments(c)
  for (const s of segs) {
    if (local < s.tEnd || s === segs[segs.length - 1]) {
      const time = Math.min(s.srcEnd, s.srcStart + Math.max(0, local - s.tStart) * s.speed)
      return { time, speed: s.speed }
    }
  }
  return { time: c.out, speed: 1 }
}

export interface LaidClip {
  clip: Clip
  index: number
  start: number
  dur: number
  transIn: number // overlap with previous clip
  transOut: number // overlap with next clip
}

export function transitionLength(clips: Clip[], i: number) {
  const c = clips[i]
  const next = clips[i + 1]
  if (!c?.transition || !next) return 0
  return Math.max(0, Math.min(c.transition.duration, clipDuration(c) / 2, clipDuration(next) / 2))
}

export function layoutClips(clips: Clip[]): { items: LaidClip[]; total: number } {
  const items: LaidClip[] = []
  let t = 0
  let prevOut = 0
  clips.forEach((clip, index) => {
    const dur = clipDuration(clip)
    const transOut = transitionLength(clips, index)
    items.push({ clip, index, start: t - prevOut, dur, transIn: prevOut, transOut })
    t = t - prevOut + dur
    prevOut = transOut
  })
  return { items, total: Math.max(0, t) }
}

export function projectDuration(p: Project) {
  const { total } = layoutClips(p.clips)
  return total
}

export interface Active { item: LaidClip; local: number }

/** Clip(s) visible at time t: `a` is the outgoing clip, `b` the incoming one during a transition. */
export function activeAt(items: LaidClip[], t: number): { a: Active | null; b: Active | null; progress: number } {
  if (!items.length) return { a: null, b: null, progress: 0 }
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const end = it.start + it.dur
    if (t < end || i === items.length - 1) {
      const local = Math.max(0, Math.min(it.dur - 1e-4, t - it.start))
      const next = items[i + 1]
      if (next && it.transOut > 0 && t >= end - it.transOut) {
        const p = (t - (end - it.transOut)) / it.transOut
        return { a: { item: it, local }, b: { item: next, local: t - next.start }, progress: Math.min(1, Math.max(0, p)) }
      }
      return { a: { item: it, local }, b: null, progress: 0 }
    }
  }
  return { a: null, b: null, progress: 0 }
}

export const defaultAdjust = (): Adjust => ({
  exposure: 0, brightness: 0, contrast: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0,
  highlights: 0, shadows: 0, fade: 0, vignette: 0, grain: 0, sharpen: 0,
})

export const isNeutral = (a: Adjust) => Object.values(a).every((v) => v === 0)

export function newClip(src: MediaSource, id: string): Clip {
  return {
    id, sourceId: src.id, in: 0, out: src.kind === 'image' ? 3 : src.duration,
    speed: 1, ramp: null, volume: 1, fadeIn: 0, fadeOut: 0, rotate: 0, flipH: false, flipV: false, crop: null,
    fit: 'fit', filter: null, filterAmount: 1, adjust: defaultAdjust(), transition: null,
  }
}

/** Lanes for overlay layers so overlapping bars don't collide on the timeline. */
export function layerLanes(layers: Layer[]): Map<string, number> {
  const lanes: { end: number; group: string }[][] = []
  const res = new Map<string, number>()
  const group = (l: Layer) => (l.type === 'audio' ? 'audio' : 'visual')
  const sorted = [...layers].sort((a, b) => (group(a) === group(b) ? a.start - b.start : group(a) === 'visual' ? -1 : 1))
  for (const l of sorted) {
    let lane = lanes.findIndex((ln) => ln[0].group === group(l) && ln.every((x) => x.end <= l.start + 1e-6))
    if (lane < 0) { lanes.push([]); lane = lanes.length - 1 }
    lanes[lane].push({ end: l.end, group: group(l) })
    res.set(l.id, lane)
  }
  return res
}
