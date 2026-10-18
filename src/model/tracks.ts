import type { Layer, Project, Track } from '../types'
import { uid } from '../lib/format'

export const trackKind = (l: Layer): Track['kind'] => (l.type === 'audio' ? 'audio' : 'visual')

/** Text, stickers, blur and waves get a new row at the top (in front); videos and photos one under the other rows. */
const FRONT: Layer['type'][] = ['text', 'sticker', 'blur', 'wave']

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end - 1e-6 && b.start < a.end - 1e-6

export const newTrack = (kind: Track['kind'], keep = false): Track => ({ id: uid(), kind, ...(keep ? { keep } : {}) })

/** Where a new row of this kind goes: visual rows stay above audio rows. */
export function insertAt(tracks: Track[], kind: Track['kind'], front: boolean) {
  if (kind === 'audio') return tracks.length
  if (front) return 0
  const lastVisual = tracks.map((t) => t.kind).lastIndexOf('visual')
  return lastVisual + 1
}

/** "Track 2" / "Audio 1", unless the user named it. */
export function trackName(tracks: Track[], tr: Track, tl = (s: string) => s) {
  if (tr.name) return tr.name
  const n = tracks.filter((t) => t.kind === tr.kind).indexOf(tr) + 1
  return `${tl(tr.kind === 'audio' ? 'Audio' : 'Track')} ${n}`
}

/**
 * Gives every layer a track: the first unlocked row of its kind that is free over its time span, else a new row.
 * Older projects get their rows this way the first time they open. With `prune`, rows that became empty go away
 * (except ones the user made). Returns `p` itself when nothing changes.
 */
export function withTracks(p: Project, prune = false): Project {
  const tracks = [...(p.tracks ?? [])]
  const kindOf = new Map(tracks.map((t) => [t.id, t.kind]))
  const loose = p.layers.filter((l) => !l.track || kindOf.get(l.track) !== trackKind(l))
  const empty = prune && tracks.some((t) => !t.keep && !p.layers.some((l) => l.track === t.id))
  if (!loose.length && !empty) return p
  const busy = new Map<string, Layer[]>()
  for (const l of p.layers) if (!loose.includes(l)) busy.set(l.track!, [...(busy.get(l.track!) ?? []), l])
  const assign = new Map<string, string>()
  for (const l of [...loose].sort((a, b) => a.start - b.start)) {
    const kind = trackKind(l)
    let tr = tracks.find((t) => t.kind === kind && !t.locked && !(busy.get(t.id) ?? []).some((x) => overlaps(x, l)))
    if (!tr) {
      tr = newTrack(kind)
      tracks.splice(insertAt(tracks, kind, FRONT.includes(l.type)), 0, tr)
    }
    busy.set(tr.id, [...(busy.get(tr.id) ?? []), l])
    assign.set(l.id, tr.id)
  }
  const layers = assign.size ? p.layers.map((l) => (assign.has(l.id) ? ({ ...l, track: assign.get(l.id) } as Layer) : l)) : p.layers
  return { ...p, layers, tracks: prune ? tracks.filter((t) => t.keep || busy.has(t.id)) : tracks }
}

/**
 * The project as it plays and exports: hidden rows left out, muted rows silent, row volume applied, the main
 * video silent when its row is muted, and layers drawn bottom row first so the top row is in front.
 */
export function playable(p: Project): Project {
  const tracks = p.tracks ?? []
  if (!tracks.length && !p.main?.muted) return p
  const byId = new Map(tracks.map((t, i) => [t.id, { t, i }]))
  const row = (l: Layer) => byId.get(l.track ?? '')?.i ?? -1
  const layers = p.layers.flatMap((l): Layer[] => {
    const tr = byId.get(l.track ?? '')?.t
    if (!tr) return [l]
    if (tr.hidden) return []
    const g = tr.muted ? 0 : tr.volume ?? 1
    return [(l.type === 'media' || l.type === 'audio') && g !== 1 ? { ...l, volume: l.volume * g } : l]
  }).sort((a, b) => row(b) - row(a))
  const clips = p.main?.muted ? p.clips.map((c) => ({ ...c, volume: 0 })) : p.clips
  return { ...p, clips, layers }
}

/** True when the layer sits on a locked row. */
export const isLocked = (p: Project, l: Layer) => !!p.tracks?.find((t) => t.id === l.track)?.locked
