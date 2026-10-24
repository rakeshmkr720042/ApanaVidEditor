import { useCallback, useMemo, useRef, useState } from 'react'
import type { AudioLayer, BlurLayer, Box, Clip, Layer, MainTrack, MediaLayer, MediaSource, Project, ProjectSettings, StickerLayer, TextLayer, Track, Watermark, WaveLayer } from '../types'
import { MIN_CLIP } from '../types'
import { useHistory } from '../lib/history'
import { uid } from '../lib/format'
import { clipSegments, defaultAdjust, gapAt, insertClipsAt, layerSpeed, layoutClips, moveClipTo, newClip, removeClipKeepGap, sourceAt } from './timeline'
import { applySlideshow, type SlideshowOptions } from './slideshow'
import { defaultTextStyle, subtitleStyle } from '../engine/text'
import { defaultWatermark } from '../engine/watermark'
import { outputSize } from '../engine/renderer'
import { hasSound } from '../engine/denoise'
import { insertAt, newTrack, overlaps, trackKind, withTracks } from './tracks'
import { atTime, hasBox, keyIndexAt, keyedPatch, splitKeys, withKey } from './keyframes'

/** Where to move a layer among the rows: in front of or behind the layers it overlaps, one step or all the way. */
export type Arrange = 'front' | 'forward' | 'backward' | 'back'

/**
 * `all` picks a group around the item `id`: every clip of the main video, every item on the layer's row,
 * or for a subtitle every subtitle. Changes from the tool panels and Delete apply to the whole group.
 */
export type Selection = { type: 'clip'; id: string; all?: boolean } | { type: 'layer'; id: string; all?: boolean } | null

export const isSub = (l: Layer): l is TextLayer => l.type === 'text' && l.subtitle

/** Ids of everything the selection covers (just the item unless `all`). */
export function selectedIds(p: Project, sel: Selection): string[] {
  if (!sel) return []
  if (!sel.all) return [sel.id]
  if (sel.type === 'clip') return p.clips.map((c) => c.id)
  const l = p.layers.find((x) => x.id === sel.id)
  if (!l) return []
  return p.layers.filter(isSub(l) ? isSub : (x) => x.track === l.track).map((x) => x.id)
}

// what a change to one item of a group passes on to the others: its look and sound, never its place or content
const BULK = new Set(['speed', 'ramp', 'volume', 'fadeIn', 'fadeOut', 'denoise', 'filter', 'filterAmount', 'adjust', 'fit', 'transition',
  'chroma', 'blend', 'mask', 'border', 'animIn', 'animOut', 'flipH', 'flipV', 'style', 'strength', 'shape', 'mode', 'color', 'color2'])
function bulkPatch<T extends object>(patch: Partial<T>, sound: boolean): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    // a new speed on a track item comes with its new length
    if (BULK.has(k) || (k === 'end' && 'speed' in patch)) out[k] = v
  }
  if (!sound) delete out.denoise
  return out as Partial<T>
}

export const emptyProject = (): Project => ({ clips: [], layers: [], settings: { aspect: 'original', background: 'black', fps: 30 } })

/** Style, height and frame of the existing subtitles, for new ones to match. */
export function subtitleLook(layers: Layer[]) {
  const s = layers.find((l): l is TextLayer => l.type === 'text' && l.subtitle)
  return s ? { style: { ...s.style }, y: s.box.y, frame: s.frame ? { ...s.frame, rect: { ...s.frame.rect } } : null } : null
}

/** A wave layer with the default look for its style: bars and lines near the bottom, a ring in the middle. */
export const newWave = (sourceId: string, style: WaveLayer['style']): WaveLayer => ({
  id: uid(), type: 'wave', sourceId, in: 0, start: 0, end: 1, style, color: '#ffffff', color2: '#7dd3fc',
  box: { x: 0.5, y: style === 'circle' ? 0.5 : 0.87, scale: 1, rotation: 0, opacity: 0.95 },
})

const centerBox = () => ({ x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 })

/** Where new media goes: its own track at the playhead, or into the main video at the playhead, start or end. */
export type Placement = 'track' | 'playhead' | 'start' | 'end'

/** What was added and where, so the editor can select it, jump to it and say so. */
export interface Placed { sel: Selection; start: number; where: Placement; cut: boolean }

/** A camera recording made together with a screen recording: shown as a bubble over it, from the same moment. */
export interface CamBubble { src: MediaSource; box: Box; mask: MediaLayer['mask'] }

/** Overlay scale that fills the frame edge to edge (fit, no cropping) for a source of aspect `ar`. */
function fullFrameScale(p: Project, sources: Record<string, MediaSource>, ar: number) {
  const { w: W, h: H } = outputSize(p, sources, 1000)
  const base = ar >= 1 ? Math.min(W / ar, H) : Math.min(W, H * ar)
  return base / (Math.min(W, H) * 0.5)
}

/** All editing operations on a project, with undo/redo. */
export function useEditor(initial: Project) {
  const hist = useHistory<Project>(withTracks(initial, true))
  // every change keeps each layer on a track row; empty rows go away except while dragging
  const hSet = hist.set, hLive = hist.live
  const set = useCallback((p: Project) => hSet(withTracks(p, true)), [hSet])
  const live = useCallback((p: Project) => hLive(withTracks(p)), [hLive])
  const h = useMemo(() => ({ ...hist, set, live }), [hist.value, hist.canUndo, hist.canRedo, set, live]) // eslint-disable-line react-hooks/exhaustive-deps
  const project = h.value
  const ref = useRef(project)
  ref.current = project
  const [sources, setSources] = useState<Record<string, MediaSource>>({})
  const sourcesRef = useRef(sources)
  sourcesRef.current = sources
  const [sel, setSel] = useState<Selection>(null)
  const selRef = useRef(sel)
  selRef.current = sel
  /** The other members of the selected group when `id` is the item the group was picked from. */
  const groupOf = (id: string) => {
    const s = selRef.current
    if (!s?.all || s.id !== id) return null
    const ids = new Set(selectedIds(ref.current, s))
    ids.delete(id)
    return ids
  }
  /** The row picked in the track headers: new text, stickers, overlays and audio go there when it has room. */
  const [track, setTrack] = useState<string | null>(null)

  const layout = useMemo(() => layoutClips(project.clips), [project.clips])
  /** The playhead, kept up to date by the editor: box changes on keyframed layers become keyframes here. */
  const now = useRef(0)
  const setNow = useCallback((t: number) => { now.current = t }, [])

  // `live` edits (slider drags) are grouped into one undo step between begin() and end()
  const liveMode = useRef(false)
  const commit = useCallback((p: Project) => { if (liveMode.current) h.live(p); else h.set(p) }, [h])
  const begin = useCallback(() => { liveMode.current = true; h.begin() }, [h])
  const end = useCallback(() => { liveMode.current = false; h.end() }, [h])

  const addSource = useCallback((s: MediaSource) => {
    sourcesRef.current = { ...sourcesRef.current, [s.id]: s }
    setSources(sourcesRef.current)
  }, [])

  /** Changes a clip; with all clips selected the look and sound part of the change goes to every clip. */
  const updateClip = useCallback((id: string, patch: Partial<Clip> | ((c: Clip) => Partial<Clip>)) => {
    const p = ref.current
    const group = groupOf(id)
    const of = (c: Clip) => (typeof patch === 'function' ? patch(c) : patch)
    commit({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...of(c) } : group?.has(c.id) ? { ...c, ...bulkPatch(of(c), hasSound(sourcesRef.current[c.sourceId])) } : c)) })
  }, [commit]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateAllClips = useCallback((patch: (c: Clip) => Partial<Clip>) => {
    const p = ref.current
    commit({ ...p, clips: p.clips.map((c) => ({ ...c, ...patch(c) })) })
  }, [commit])

  /**
   * Changes a layer. With its row selected, the look and sound part of the change also goes to the items of the
   * same kind on that row (subtitle groups are handled by the text tools themselves).
   */
  const updateLayer = useCallback(<L extends Layer>(id: string, patch: Partial<L> | ((l: L) => Partial<L>)) => {
    const p = ref.current
    const of = (l: Layer) => (typeof patch === 'function' ? patch(l as L) : patch)
    const anchor = p.layers.find((l) => l.id === id)
    const group = anchor && !isSub(anchor) ? groupOf(id) : null
    const sound = (l: Layer) => (l.type === 'media' || l.type === 'audio') && hasSound(sourcesRef.current[l.sourceId])
    commit({
      ...p, layers: p.layers.map((l) => {
        if (l.id === id) return { ...l, ...keyedPatch(l, of(l), now.current) } as Layer
        if (group?.has(l.id) && l.type === anchor!.type) return { ...l, ...bulkPatch(of(l), sound(l)) } as Layer
        return l
      }),
    })
  }, [commit]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Patches every layer that matches, as one edit (e.g. the frame of all subtitles). */
  const updateLayers = useCallback((match: (l: Layer) => boolean, patch: (l: Layer) => Partial<Layer>) => {
    const p = ref.current
    commit({ ...p, layers: p.layers.map((l) => (match(l) ? ({ ...l, ...keyedPatch(l, patch(l), now.current) } as Layer) : l)) })
  }, [commit])

  const setSettings = useCallback((patch: Partial<ProjectSettings>) => {
    const p = ref.current
    commit({ ...p, settings: { ...p.settings, ...patch } })
  }, [commit])

  const setWatermark = useCallback((patch: Partial<Watermark>) => {
    const p = ref.current
    commit({ ...p, watermark: { ...(p.watermark ?? defaultWatermark()), ...patch } })
  }, [commit])

  /**
   * The one rule for adding photos, videos and recordings: on a new track at the playhead (a full-frame overlay
   * above the main video), or into the main video at the playhead (splitting the clip there), start or end.
   * Several files go one after another. An empty project always gets them as its main video.
   * `at` puts them into the main video between clips at that position instead of at the playhead (no split).
   * A camera bubble recorded with a screen recording goes on its own row in front, starting with it (same undo step).
   */
  const place = useCallback((srcs: MediaSource[], where: Placement, t: number, patch?: { crop?: Clip['crop']; dur?: number; cam?: CamBubble | null; at?: number }): Placed | null => {
    const photoDur = patch?.dur ?? 3
    const p = ref.current
    const visual = srcs.filter((s) => s.kind !== 'audio')
    if (!visual.length) return null
    const mode: Placement = p.clips.length ? where : 'end'
    const bubble = (start: number, tot: number): MediaLayer[] => {
      const cam = patch?.cam
      if (!cam) return []
      return [{
        id: uid(), type: 'media', sourceId: cam.src.id, in: 0, start, end: Math.max(start + 0.5, Math.min(tot, start + cam.src.duration)),
        box: { ...cam.box }, volume: 0, chroma: { enabled: false, color: '#00ff00', similarity: 0.35, smoothness: 0.08 }, mask: cam.mask,
        border: 0, adjust: defaultAdjust(), filter: null, filterAmount: 1,
      }]
    }
    if (mode === 'track') {
      const tot = layoutClips(p.clips).total
      let at = Math.max(0, Math.min(t, Math.max(0, tot - 0.5)))
      const layers: MediaLayer[] = []
      let cut = false
      const all = { ...sourcesRef.current, ...Object.fromEntries(visual.map((s) => [s.id, s])) }
      for (const src of visual) {
        if (at >= tot - 0.1 && layers.length) break
        const dur = src.kind === 'image' ? photoDur : src.duration
        const end = Math.min(tot, at + dur)
        if (end < at + dur - 0.05) cut = true
        const c = patch?.crop ?? null
        const ar = src.width && src.height ? (src.width * (c?.w ?? 1)) / (src.height * (c?.h ?? 1)) : 16 / 9
        layers.push({
          id: uid(), type: 'media', sourceId: src.id, in: 0, start: at, end: Math.max(at + 0.5, end),
          box: { ...centerBox(), scale: fullFrameScale(p, all, ar) },
          volume: 1, chroma: { enabled: false, color: '#00ff00', similarity: 0.35, smoothness: 0.08 }, mask: 'none', border: 0,
          adjust: defaultAdjust(), filter: null, filterAmount: 1, crop: c,
        })
        at = end
      }
      // the row picked in the track headers when it is free over the whole span, else a new row
      const span = { start: layers[0].start, end: layers[layers.length - 1].end }
      const picked = p.tracks?.find((x) => x.id === track)
      const free = picked && picked.kind === 'visual' && !picked.locked && !picked.hidden && !p.layers.some((x) => x.track === picked.id && overlaps(x, span))
      const tr = free ? picked : newTrack('visual')
      const tracks = [...(p.tracks ?? [])]
      if (!free) tracks.splice(insertAt(tracks, 'visual', false), 0, tr)
      h.set({ ...p, tracks, layers: [...p.layers, ...layers.map((l) => ({ ...l, track: tr.id })), ...bubble(layers[0].start, tot)] })
      const sel: Selection = { type: 'layer', id: layers[0].id }
      setSel(sel)
      return { sel, start: layers[0].start, where: mode, cut }
    }
    const clips = visual.map((s) => ({ ...newClip(s, uid()), ...(s.kind === 'image' ? { out: photoDur } : {}), ...(patch?.crop ? { crop: patch.crop } : {}) }))
    let list = [...p.clips]
    let idx = mode === 'start' ? 0 : list.length
    const gap = mode === 'playhead' && patch?.at === undefined ? gapAt(list, t) : null
    if (gap) {
      // the playhead is in empty time (snap off): the new media goes right there
      list = insertClipsAt(list, clips, t)
      const sel: Selection = { type: 'clip', id: clips[0].id }
      h.set({ ...p, clips: list })
      setSel(sel)
      return { sel, start: layoutClips(list).items.find((x) => x.clip.id === clips[0].id)!.start, where: mode, cut: false }
    }
    if (mode === 'playhead' && patch?.at !== undefined) idx = Math.max(0, Math.min(list.length, patch.at))
    else if (mode === 'playhead') {
      const { items } = layoutClips(list)
      const it = items.find((x) => t >= x.start && t < x.start + x.dur) ?? items[items.length - 1]
      const local = t - it.start
      const c = it.clip
      const at = c.in + local * c.speed
      if (local < 0.25 || c.ramp || at - c.in < MIN_CLIP) idx = it.index
      else if (it.dur - local < 0.25 || c.out - at < MIN_CLIP) idx = it.index + 1
      else {
        // split the clip under the playhead and put the new media in between
        list = list.flatMap((x) => (x.id === c.id ? [{ ...c, out: at, transition: null, fadeOut: 0 }, { ...c, id: uid(), in: at, fadeIn: 0, gap: undefined }] : [x]))
        idx = it.index + 1
      }
    }
    list.splice(idx, 0, ...clips)
    const laid = layoutClips(list)
    const start = laid.items[idx].start
    h.set({ ...p, clips: list, layers: [...p.layers, ...bubble(start, laid.total)] })
    const sel: Selection = { type: 'clip', id: clips[0].id }
    setSel(sel)
    return { sel, start, where: mode, cut: false }
  }, [h, track])

  /**
   * Swaps the photo or video of a main-video clip or a track item for another file, keeping where it is,
   * how long it shows, its size and position, and its look (filters, adjust, transition).
   */
  const replaceMedia = useCallback((target: Selection, src: MediaSource): boolean => {
    const p = ref.current
    if (src.kind === 'audio' || !target) return false
    const all = { ...sourcesRef.current, [src.id]: src }
    if (target.type === 'clip') {
      const c = p.clips.find((x) => x.id === target.id)
      if (!c) return false
      const len = c.out - c.in
      const out = src.kind === 'image' ? len : Math.min(src.duration, len)
      commit({ ...p, clips: p.clips.map((x) => (x.id === c.id ? { ...x, sourceId: src.id, in: 0, out, crop: null } : x)) })
      return true
    }
    const l = p.layers.find((x) => x.id === target.id)
    if (!l || l.type !== 'media') return false
    const old = all[l.sourceId]
    const arOf = (s?: MediaSource) => (s?.width && s.height ? s.width / s.height : 16 / 9)
    // a full-frame item stays full frame with the new picture's shape
    const scale = l.box.scale * fullFrameScale(p, all, arOf(src)) / fullFrameScale(p, all, arOf(old))
    const end = src.kind === 'image' ? l.end : Math.min(l.end, l.start + src.duration / (l.speed ?? 1))
    commit({ ...p, layers: p.layers.map((x) => (x.id === l.id ? { ...l, sourceId: src.id, in: 0, end, crop: null, box: { ...l.box, scale } } : x)) })
    return true
  }, [commit])

  /** Adds photos as slides and lays every photo out as a slideshow, in one undo step. */
  const addSlides = useCallback((srcs: MediaSource[], o: SlideshowOptions) => {
    const p = ref.current
    const clips = srcs.map((s) => newClip(s, uid()))
    h.set(applySlideshow({ ...p, clips: [...p.clips, ...clips] }, sourcesRef.current, o))
  }, [h])

  const setSlideshow = useCallback((o: SlideshowOptions) => {
    commit(applySlideshow(ref.current, sourcesRef.current, o))
  }, [commit])

  const addLayer = useCallback((l: Layer) => {
    const p = ref.current
    const tr = p.tracks?.find((x) => x.id === track)
    const fits = tr && tr.kind === trackKind(l) && !tr.locked && !p.layers.some((x) => x.track === tr.id && overlaps(x, l))
    h.set({ ...p, layers: [...p.layers, fits ? { ...l, track: tr.id } : l] })
    setSel({ type: 'layer', id: l.id })
  }, [h, track])

  // ----- track rows
  const addTrack = useCallback((kind: Track['kind']) => {
    const p = ref.current
    const tr = newTrack(kind, true)
    const tracks = [...(p.tracks ?? [])]
    tracks.splice(insertAt(tracks, kind, true), 0, tr)
    h.set({ ...p, tracks })
    setTrack(tr.id)
    return tr
  }, [h])

  const updateTrack = useCallback((id: string, patch: Partial<Track>) => {
    const p = ref.current
    commit({ ...p, tracks: (p.tracks ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) })
    if (patch.locked || patch.hidden) setSel((s) => (s?.type === 'layer' && p.layers.find((l) => l.id === s.id)?.track === id ? null : s))
  }, [commit])

  /** Moves a row one place up or down among rows of its kind (visual rows: up = more in front). */
  const moveTrack = useCallback((id: string, dir: -1 | 1) => {
    const p = ref.current
    const tracks = [...(p.tracks ?? [])]
    const i = tracks.findIndex((t) => t.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= tracks.length || tracks[j].kind !== tracks[i].kind) return
    ;[tracks[i], tracks[j]] = [tracks[j], tracks[i]]
    h.set({ ...p, tracks })
  }, [h])

  /** Deletes a row and everything on it. */
  const removeTrack = useCallback((id: string) => {
    const p = ref.current
    h.set({ ...p, tracks: (p.tracks ?? []).filter((t) => t.id !== id), layers: p.layers.filter((l) => l.track !== id) })
    setSel((s) => (s?.type === 'layer' && p.layers.find((l) => l.id === s.id)?.track === id ? null : s))
    setTrack((t) => (t === id ? null : t))
  }, [h])

  const setMain = useCallback((patch: Partial<MainTrack>) => {
    const p = ref.current
    h.set({ ...p, main: { ...p.main, ...patch } })
    if (patch.locked) setSel((s) => (s?.type === 'clip' ? null : s))
  }, [h])

  /** Drags a row to another place among rows of its kind (visual rows stay above audio rows). */
  const reorderTrack = useCallback((id: string, to: number) => {
    const p = ref.current
    const tracks = [...(p.tracks ?? [])]
    const from = tracks.findIndex((t) => t.id === id)
    if (from < 0) return
    const [tr] = tracks.splice(from, 1)
    const same = tracks.map((t, i) => (t.kind === tr.kind ? i : -1)).filter((i) => i >= 0)
    const lo = same.length ? same[0] : tr.kind === 'audio' ? tracks.length : 0
    const hi = same.length ? same[same.length - 1] + 1 : lo
    const at = Math.max(lo, Math.min(hi, to))
    if (at === from) return
    tracks.splice(at, 0, tr)
    h.set({ ...p, tracks })
  }, [h])

  /**
   * Puts a layer in front of (or behind) the layers it overlaps in time, on a row of its own just above (below)
   * the nearest such row, or the furthest one for front / back. Returns false when it already is.
   */
  const arrange = useCallback((id: string, how: Arrange): boolean => {
    const p = ref.current
    const l = p.layers.find((x) => x.id === id)
    if (!l || l.type === 'audio') return false
    const tracks = [...(p.tracks ?? [])]
    const rows = tracks.filter((t) => t.kind === 'visual')
    const i = rows.findIndex((t) => t.id === l.track)
    if (i < 0) return false
    const busy = (r: number) => p.layers.some((x) => x.id !== id && x.track === rows[r].id && overlaps(x, l))
    const up = how === 'front' || how === 'forward'
    const hits = rows.map((_, r) => r).filter((r) => (up ? r < i : r > i) && busy(r))
    if (!hits.length) return false
    const near = up ? hits[hits.length - 1] : hits[0]
    const far = up ? hits[0] : hits[hits.length - 1]
    const target = how === 'front' || how === 'back' ? far : near
    const tr = newTrack('visual')
    tracks.splice(tracks.indexOf(rows[target]) + (up ? 0 : 1), 0, tr)
    h.set({ ...p, tracks, layers: p.layers.map((x) => (x.id === id ? ({ ...x, track: tr.id } as Layer) : x)) })
    return true
  }, [h])

  /** Saves the layer's current pose as a keyframe at time t (the first one also marks where it starts). */
  const addKey = useCallback((id: string, t: number) => {
    const p = ref.current
    const l = p.layers.find((x) => x.id === id)
    if (!l || !hasBox(l)) return
    const box = atTime(l, t).box
    let keys = withKey(l, t, box)
    // the first keyframe away from the start also pins the start, so the layer moves from there
    if (!l.keys?.length && t - l.start > 0.1) keys = withKey({ ...l, keys }, l.start, l.box)
    h.set({ ...p, layers: p.layers.map((x) => (x.id === id ? ({ ...x, keys } as Layer) : x)) })
  }, [h])

  /** Removes the keyframe at time t, or all of them (the layer keeps the pose it has at t). */
  const removeKey = useCallback((id: string, t: number, all = false) => {
    const p = ref.current
    const l = p.layers.find((x) => x.id === id)
    if (!l || !hasBox(l) || !l.keys?.length) return
    const i = keyIndexAt(l, t)
    const keys = all ? [] : l.keys.filter((_, j) => j !== i)
    const box = keys.length ? l.box : atTime(l, t).box
    h.set({ ...p, layers: p.layers.map((x) => (x.id === id ? ({ ...x, box, keys: keys.length ? keys : undefined } as Layer) : x)) })
  }, [h])

  /** After a drag: a layer that now overlaps another on its row moves to a new row just below it. */
  const settleLayer = useCallback((id: string) => {
    let p = ref.current
    const l = p.layers.find((x) => x.id === id)
    const tracks = [...(p.tracks ?? [])]
    const i = tracks.findIndex((t) => t.id === l?.track)
    if (l && i >= 0 && p.layers.some((x) => x.id !== id && x.track === l.track && overlaps(x, l))) {
      const tr = newTrack(tracks[i].kind)
      tracks.splice(i + 1, 0, tr)
      p = { ...p, tracks, layers: p.layers.map((x) => (x.id === id ? ({ ...x, track: tr.id } as Layer) : x)) }
    }
    const next = withTracks(p, true)
    if (next !== ref.current) commit(next)
  }, [commit])

  const total = () => layoutClips(ref.current.clips).total

  /** New layer spanning `dur` seconds from `start`, kept inside the video. */
  const span = (start: number, dur: number) => {
    const tot = total()
    const s = Math.max(0, Math.min(start, Math.max(0, tot - 0.5)))
    return { start: s, end: Math.max(s + 0.5, Math.min(tot || s + dur, s + dur)) }
  }

  const addText = useCallback((t: number, subtitle = false, text = subtitle ? 'Subtitle' : 'Your text') => {
    // a new subtitle looks like (and sits in the same frame as) the ones already there
    const like = subtitle ? subtitleLook(ref.current.layers) : null
    const l: TextLayer = {
      id: uid(), type: 'text', text, subtitle, ...span(t, subtitle ? 2.5 : 3),
      style: like?.style ?? (subtitle ? subtitleStyle() : defaultTextStyle()),
      box: { ...centerBox(), y: like?.y ?? (subtitle ? 0.86 : 0.5) }, animIn: subtitle ? 'none' : 'fade', animOut: subtitle ? 'none' : 'fade',
      frame: like?.frame ?? null,
    }
    addLayer(l)
    return l
  }, [addLayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const addSticker = useCallback((t: number, emoji: string) => {
    const l: StickerLayer = { id: uid(), type: 'sticker', emoji, ...span(t, 3), box: centerBox(), animIn: 'pop', animOut: 'fade' }
    addLayer(l)
  }, [addLayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const addBlur = useCallback((t: number, mode: 'blur' | 'pixelate' = 'blur') => {
    const l: BlurLayer = { id: uid(), type: 'blur', ...span(t, 3), rect: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 }, shape: 'ellipse', mode, strength: 0.6 }
    addLayer(l)
  }, [addLayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const addOverlay = useCallback((t: number, src: MediaSource) => {
    const dur = src.kind === 'image' ? 3 : src.duration
    const l: MediaLayer = {
      id: uid(), type: 'media', sourceId: src.id, in: 0, ...span(t, dur), box: { ...centerBox(), x: 0.7, y: 0.3, scale: 0.8 },
      volume: 1, chroma: { enabled: false, color: '#00ff00', similarity: 0.35, smoothness: 0.08 }, mask: 'none', border: 0,
      adjust: defaultAdjust(), filter: null, filterAmount: 1,
    }
    addLayer(l)
    return l
  }, [addLayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const addAudio = useCallback((t: number, src: MediaSource, kind: AudioLayer['kind'], label: string, extra?: Partial<AudioLayer>) => {
    const tot = total()
    const start = Math.max(0, Math.min(t, Math.max(0, tot - 0.5)))
    const l: AudioLayer = {
      id: uid(), type: 'audio', sourceId: src.id, in: 0, start, end: Math.min(start + src.duration, tot > 0 ? tot : start + src.duration),
      volume: kind === 'music' ? 0.6 : 1, fadeIn: kind === 'music' ? 1 : 0, fadeOut: kind === 'music' ? 2 : 0, label, kind, ...extra,
    }
    addLayer(l)
    return l
  }, [addLayer]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Adds an animated waveform that moves with an audio layer's sound, over the same time span. */
  const addWave = useCallback((a: AudioLayer) => {
    const l: WaveLayer = { ...newWave(a.sourceId, 'bars'), start: a.start, end: a.end, in: a.in }
    addLayer(l)
  }, [addLayer])

  /** Deletes the selection. With `keepGap` (snap off) deleted clips leave empty time, so later clips stay put. */
  const remove = useCallback((keepGap = false) => {
    const p = ref.current
    if (!sel) return
    const ids = new Set(selectedIds(p, sel))
    if (sel.type === 'clip') h.set({ ...p, clips: keepGap ? [...ids].reduce(removeClipKeepGap, p.clips) : p.clips.filter((c) => !ids.has(c.id)) })
    else h.set({ ...p, layers: p.layers.filter((l) => !ids.has(l.id)) })
    setSel(null)
  }, [h, sel])

  const duplicate = useCallback(() => {
    const p = ref.current
    if (!sel) return
    if (sel.type === 'clip') {
      const i = p.clips.findIndex((c) => c.id === sel.id)
      if (i < 0) return
      const copy = { ...p.clips[i], id: uid(), gap: undefined }
      h.set({ ...p, clips: [...p.clips.slice(0, i + 1), copy, ...p.clips.slice(i + 1)] })
      setSel({ type: 'clip', id: copy.id })
    } else {
      const l = p.layers.find((x) => x.id === sel.id)
      if (!l) return
      const len = l.end - l.start
      const copy = { ...l, id: uid(), start: l.end, end: l.end + len } as Layer
      if ('box' in copy) copy.box = { ...copy.box }
      // stays on the same row when there is room after the original, else gets a free row
      if (p.layers.some((x) => x.track === l.track && overlaps(x, copy))) delete copy.track
      h.set({ ...p, layers: [...p.layers, copy] })
      setSel({ type: 'layer', id: copy.id })
    }
  }, [h, sel])

  /** Splits the selected layer, or the clip under the playhead, at time t. */
  const split = useCallback((t: number) => {
    const p = ref.current
    if (sel?.type === 'layer') {
      if (p.tracks?.find((x) => x.id === p.layers.find((l) => l.id === sel.id)?.track)?.locked) return
      const l = p.layers.find((x) => x.id === sel.id)
      if (!l || t <= l.start + 0.1 || t >= l.end - 0.1) return
      const right = { ...l, id: uid(), start: t } as Layer
      if (right.type === 'media' || right.type === 'audio' || right.type === 'wave') right.in = (l as MediaLayer).in + (t - l.start) * layerSpeed(l)
      const keys = splitKeys(l, t)
      const left = { ...l, end: t, ...(keys.left ? { keys: keys.left } : {}) } as Layer
      if (keys.right) (right as { keys?: unknown }).keys = keys.right
      h.set({ ...p, layers: p.layers.flatMap((x) => (x.id === l.id ? [left, right] : [x])) })
      setSel({ type: 'layer', id: right.id })
      return
    }
    if (p.main?.locked) return
    const { items } = layoutClips(p.clips)
    const it = items.find((x) => t >= x.start && t < x.start + x.dur)
    if (!it) return
    const c = it.clip
    const local = t - it.start
    if (c.ramp) {
      // keep it simple: a ramped clip is split by source time and loses the ramp
      const at = sourceAt(c, local).time
      if (at - c.in < MIN_CLIP || c.out - at < MIN_CLIP) return
      const avg = (c.out - c.in) / clipSegments(c).reduce((s, g) => s + g.tEnd - g.tStart, 0)
      const left = { ...c, out: at, ramp: null, speed: avg, transition: null }
      const right = { ...c, id: uid(), in: at, ramp: null, speed: avg, fadeIn: 0, gap: undefined }
      h.set({ ...p, clips: p.clips.flatMap((x) => (x.id === c.id ? [left, right] : [x])) })
      setSel({ type: 'clip', id: right.id })
      return
    }
    const at = c.in + local * c.speed
    if (at - c.in < MIN_CLIP || c.out - at < MIN_CLIP) return
    const left = { ...c, out: at, transition: null, fadeOut: 0 }
    const right = { ...c, id: uid(), in: at, fadeIn: 0, gap: undefined }
    h.set({ ...p, clips: p.clips.flatMap((x) => (x.id === c.id ? [left, right] : [x])) })
    setSel({ type: 'clip', id: right.id })
  }, [h, sel])

  /** Moves a main-video clip to position `to` (counted after taking it out). Returns its new start time. */
  const moveClip = useCallback((id: string, to: number): number | null => {
    const p = ref.current
    const from = p.clips.findIndex((c) => c.id === id)
    if (from < 0 || p.main?.locked) return null
    to = Math.max(0, Math.min(p.clips.length - 1, to))
    if (from === to) return null
    const clips = [...p.clips]
    const [c] = clips.splice(from, 1)
    clips.splice(to, 0, c)
    h.set({ ...p, clips })
    return layoutClips(clips).items[to].start
  }, [h])

  /** Swaps two main-video clips (each keeps its own trim, look and transition). Returns the new start of `a`. */
  const swapClips = useCallback((a: string, b: string): number | null => {
    const p = ref.current
    const i = p.clips.findIndex((c) => c.id === a)
    const j = p.clips.findIndex((c) => c.id === b)
    if (i < 0 || j < 0 || i === j || p.main?.locked) return null
    const clips = [...p.clips]
    ;[clips[i], clips[j]] = [clips[j], clips[i]]
    h.set({ ...p, clips })
    return layoutClips(clips).items[j].start
  }, [h])

  /**
   * Swaps two track items of the same kind. One after the other on a row: they trade places in that stretch
   * and keep the space between them. Otherwise each takes the other's start time and row.
   */
  const swapLayers = useCallback((a: string, b: string): boolean => {
    const p = ref.current
    const A = p.layers.find((l) => l.id === a)
    const B = p.layers.find((l) => l.id === b)
    if (!A || !B || A === B || trackKind(A) !== trackKind(B)) return false
    const locked = (l: Layer) => !!p.tracks?.find((x) => x.id === l.track)?.locked
    if (locked(A) || locked(B)) return false
    const len = (l: Layer) => l.end - l.start
    const moved = new Map<string, Partial<Layer>>()
    const [x, y] = A.start <= B.start ? [A, B] : [B, A]
    if (x.track === y.track && x.end <= y.start + 1e-6) {
      const gap = y.start - x.end
      const yEnd = x.start + len(y)
      moved.set(y.id, { start: x.start, end: yEnd })
      moved.set(x.id, { start: yEnd + gap, end: yEnd + gap + len(x) })
    } else {
      moved.set(A.id, { start: B.start, end: B.start + len(A), track: B.track })
      moved.set(B.id, { start: A.start, end: A.start + len(B), track: A.track })
    }
    h.set({ ...p, layers: p.layers.map((l) => (moved.has(l.id) ? ({ ...l, ...moved.get(l.id) } as Layer) : l)) })
    return true
  }, [h])

  /** Snap off: the clip starts exactly at `at`, leaving empty time behind instead of closing up. Returns that start. */
  const moveClipAt = useCallback((id: string, at: number): number | null => {
    const p = ref.current
    if (p.main?.locked) return null
    const clips = moveClipTo(p.clips, id, at)
    h.set({ ...p, clips })
    return layoutClips(clips).items.find((x) => x.clip.id === id)?.start ?? null
  }, [h])

  /** Removes the empty time before a clip, pulling it and the clips after it forward. */
  const closeGap = useCallback((id: string) => {
    const p = ref.current
    h.set({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, gap: undefined } : c)) })
  }, [h])

  const replaceProject = useCallback((p: Project) => h.set(p), [h])

  return {
    project, sources, layout, sel, setSel,
    canUndo: h.canUndo, canRedo: h.canRedo, undo: h.undo, redo: h.redo,
    begin, end, live: h.live,
    addSource, place, replaceMedia, addSlides, setSlideshow, updateClip, updateAllClips, updateLayer, updateLayers, setSettings, setWatermark,
    addText, addSticker, addBlur, addOverlay, addAudio, addWave, addLayer,
    track, setTrack, addTrack, updateTrack, moveTrack, reorderTrack, removeTrack, setMain, settleLayer, arrange,
    setNow, addKey, removeKey,
    remove, duplicate, split, moveClip, moveClipAt, closeGap, swapClips, swapLayers, replaceProject,
  }
}

export type Editor = ReturnType<typeof useEditor>
