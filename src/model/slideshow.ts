import type { Clip, KenBurns, MediaSource, Project } from '../types'
import { layoutClips } from './timeline'

export const KEN_BURNS: { value: KenBurns; label: string }[] = [
  { value: 'zoom-in', label: 'Zoom in' }, { value: 'zoom-out', label: 'Zoom out' },
  { value: 'pan-left', label: 'Pan left' }, { value: 'pan-right', label: 'Pan right' },
  { value: 'pan-up', label: 'Pan up' }, { value: 'pan-down', label: 'Pan down' },
]

const KB_ZOOM = 1.18

/** Extra scale and offset (fractions of the canvas) for a Ken Burns move at progress p (0..1) through the clip. */
export function kenBurnsAt(kb: KenBurns, p: number): { scale: number; dx: number; dy: number } {
  const e = p * p * (3 - 2 * p) * 0.6 + p * 0.4 // gentle ease, never fully stops
  const m = (KB_ZOOM - 1) / 2
  switch (kb) {
    case 'zoom-in': return { scale: 1 + (KB_ZOOM - 1) * e, dx: 0, dy: 0 }
    case 'zoom-out': return { scale: KB_ZOOM - (KB_ZOOM - 1) * e, dx: 0, dy: 0 }
    case 'pan-left': return { scale: KB_ZOOM, dx: m * (1 - 2 * e), dy: 0 }
    case 'pan-right': return { scale: KB_ZOOM, dx: -m * (1 - 2 * e), dy: 0 }
    case 'pan-up': return { scale: KB_ZOOM, dx: 0, dy: m * (1 - 2 * e) }
    case 'pan-down': return { scale: KB_ZOOM, dx: 0, dy: -m * (1 - 2 * e) }
  }
}

/** Transitions cycled through when the slideshow uses "Mix". */
export const MIX_TRANSITIONS = ['fade', 'slideleft', 'zoomin', 'circleopen', 'dissolve', 'smoothright', 'crosszoom', 'heart', 'wipeup', 'dreamy']
// Ken Burns moves cycled through so neighbouring photos move differently
const KB_CYCLE: KenBurns[] = ['zoom-in', 'pan-right', 'zoom-out', 'pan-left', 'pan-up', 'pan-down']

export interface SlideshowOptions {
  duration: number // seconds each photo is on screen
  transition: string | null // transition id, 'mix', or null for hard cuts
  transitionDuration: number
  kenBurns: boolean
  fill: boolean // crop photos to fill the frame instead of showing bars
}

export const defaultSlideshow = (): SlideshowOptions => ({ duration: 3, transition: 'mix', transitionDuration: 0.8, kenBurns: true, fill: true })

/** Reads the current slideshow settings back from the photos on the timeline. */
export function slideshowFrom(p: Project, sources: Record<string, MediaSource>): SlideshowOptions {
  const d = defaultSlideshow()
  const photos = p.clips.filter((c) => sources[c.sourceId]?.kind === 'image')
  if (!photos.length) return d
  const c = photos[0]
  const types = new Set(photos.slice(0, -1).map((x) => x.transition?.type ?? null))
  const tr = photos.slice(0, -1).find((x) => x.transition)?.transition
  return {
    duration: Math.round(((c.out - c.in) / c.speed) * 10) / 10,
    transition: types.size > 1 ? 'mix' : photos.length > 1 ? (c.transition?.type ?? null) : d.transition,
    transitionDuration: tr?.duration ?? d.transitionDuration,
    kenBurns: photos.some((x) => x.kenBurns),
    fill: photos.every((x) => x.fit === 'fill'),
  }
}

/**
 * Applies slideshow settings to every photo on the timeline (videos are left alone), then
 * stretches background music that ran to the old end so it still runs to the new end.
 */
export function applySlideshow(p: Project, sources: Record<string, MediaSource>, o: SlideshowOptions): Project {
  const oldTotal = layoutClips(p.clips).total
  let n = 0
  const clips = p.clips.map((c): Clip => {
    if (sources[c.sourceId]?.kind !== 'image') return c
    const i = n++
    const type = o.transition === 'mix' ? MIX_TRANSITIONS[i % MIX_TRANSITIONS.length] : o.transition
    return {
      ...c, in: 0, out: o.duration, speed: 1, ramp: null, fit: o.fill ? 'fill' : 'fit',
      transition: type ? { type, duration: o.transitionDuration } : null,
      kenBurns: o.kenBurns ? KB_CYCLE[i % KB_CYCLE.length] : null,
    }
  })
  const total = layoutClips(clips).total
  const layers = p.layers.map((l) => {
    if (l.type !== 'audio' || l.kind !== 'music' || l.start >= total) return l
    const src = sources[l.sourceId]
    const room = src ? l.start + src.duration - l.in : l.end
    if (l.end < oldTotal - 0.05 && l.end <= total) return l // the user shortened it on purpose
    return { ...l, end: Math.max(l.start + 0.5, Math.min(total, room)) }
  })
  return { ...p, clips, layers }
}
