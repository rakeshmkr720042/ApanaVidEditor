import { useSyncExternalStore } from 'react'
import type { Clip, Layer, Lut, MediaSource, Project, Track } from '../types'
import { layoutClips } from './timeline'

/**
 * A copied track row (or the main video), kept while the app is open so it can be pasted again and again,
 * also into another project: it carries the media files and LUTs its items use.
 */
export interface TrackCopy {
  kind: 'main' | Track['kind']
  /** The row's settings (name, show, sound, volume); missing for the main video. */
  track?: Track
  name: string
  layers: Layer[]
  clips: Clip[]
  sources: MediaSource[]
  luts: Lut[]
  /** Where the first item starts and the last one ends on the timeline it was copied from. */
  start: number
  end: number
}

let board: TrackCopy | null = null
const subs = new Set<() => void>()
const tell = () => subs.forEach((f) => f())

export const copiedTrack = () => board
export const clearCopiedTrack = () => { board = null; tell() }
/** The copied track, re-rendering the component when something else gets copied. */
export const useCopiedTrack = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, copiedTrack)

/** Every media file id an item points at (its own picture or sound, a green-screen backdrop, …). */
function sourceIds(x: unknown, out = new Set<string>()) {
  if (Array.isArray(x)) x.forEach((v) => sourceIds(v, out))
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (k === 'sourceId' && typeof v === 'string') out.add(v)
      else if (v && typeof v === 'object') sourceIds(v, out)
    }
  }
  return out
}

/** LUT ids an item's color grade uses. */
function lutIds(items: (Clip | Layer)[]) {
  const ids = new Set<string>()
  for (const it of items) {
    const id = 'grade' in it ? it.grade?.lut?.id : undefined
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Copies a track row with everything on it, or the main video ('main') with all its clips.
 * Returns null when there is nothing on it to copy.
 */
export function copyTrack(p: Project, sources: Record<string, MediaSource>, id: string, name: string): TrackCopy | null {
  const main = id === 'main'
  const track = main ? undefined : p.tracks?.find((t) => t.id === id)
  if (!main && !track) return null
  const layers: Layer[] = main ? [] : structuredClone(p.layers.filter((l) => l.track === id))
  const clips: Clip[] = main ? structuredClone(p.clips) : []
  if (!layers.length && !clips.length) return null
  let start = 0, end = 0
  if (main) end = layoutClips(clips).total
  else {
    start = Math.min(...layers.map((l) => l.start))
    end = Math.max(...layers.map((l) => l.end))
  }
  const items = [...clips, ...layers]
  const used = sourceIds(items)
  const luts = new Set(lutIds(items))
  board = {
    kind: main ? 'main' : track!.kind,
    track: track && { ...track },
    name,
    layers,
    clips,
    sources: [...used].map((s) => sources[s]).filter(Boolean),
    luts: (p.luts ?? []).filter((l) => luts.has(l.id)),
    start,
    end,
  }
  tell()
  return board
}

/** How a copied track goes back in: at the same time as the original, or starting at the playhead. */
export type PasteTrackHow = 'same' | 'playhead' | 'main-end' | 'main-playhead'
