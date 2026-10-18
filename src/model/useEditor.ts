import { useCallback, useMemo, useRef, useState } from 'react'
import type { AudioLayer, BlurLayer, Clip, Layer, MediaLayer, MediaSource, Project, ProjectSettings, StickerLayer, TextLayer, Watermark, WaveLayer } from '../types'
import { MIN_CLIP } from '../types'
import { useHistory } from '../lib/history'
import { uid } from '../lib/format'
import { clipSegments, defaultAdjust, layoutClips, newClip, sourceAt } from './timeline'
import { applySlideshow, type SlideshowOptions } from './slideshow'
import { defaultTextStyle, subtitleStyle } from '../engine/text'
import { defaultWatermark } from '../engine/watermark'
import { outputSize } from '../engine/renderer'

/** `all` on a subtitle selects every subtitle together (style, animation and delete apply to all of them). */
export type Selection = { type: 'clip'; id: string } | { type: 'layer'; id: string; all?: boolean } | null

export const isSub = (l: Layer): l is TextLayer => l.type === 'text' && l.subtitle

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

/** Overlay scale that fills the frame edge to edge (fit, no cropping) for a source of aspect `ar`. */
function fullFrameScale(p: Project, sources: Record<string, MediaSource>, ar: number) {
  const { w: W, h: H } = outputSize(p, sources, 1000)
  const base = ar >= 1 ? Math.min(W / ar, H) : Math.min(W, H * ar)
  return base / (Math.min(W, H) * 0.5)
}

/** All editing operations on a project, with undo/redo. */
export function useEditor(initial: Project) {
  const h = useHistory<Project>(initial)
  const project = h.value
  const ref = useRef(project)
  ref.current = project
  const [sources, setSources] = useState<Record<string, MediaSource>>({})
  const sourcesRef = useRef(sources)
  sourcesRef.current = sources
  const [sel, setSel] = useState<Selection>(null)

  const layout = useMemo(() => layoutClips(project.clips), [project.clips])

  // `live` edits (slider drags) are grouped into one undo step between begin() and end()
  const liveMode = useRef(false)
  const commit = useCallback((p: Project) => { if (liveMode.current) h.live(p); else h.set(p) }, [h])
  const begin = useCallback(() => { liveMode.current = true; h.begin() }, [h])
  const end = useCallback(() => { liveMode.current = false; h.end() }, [h])

  const addSource = useCallback((s: MediaSource) => {
    sourcesRef.current = { ...sourcesRef.current, [s.id]: s }
    setSources(sourcesRef.current)
  }, [])

  const updateClip = useCallback((id: string, patch: Partial<Clip> | ((c: Clip) => Partial<Clip>)) => {
    const p = ref.current
    commit({ ...p, clips: p.clips.map((c) => (c.id === id ? { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } : c)) })
  }, [commit])

  const updateAllClips = useCallback((patch: (c: Clip) => Partial<Clip>) => {
    const p = ref.current
    commit({ ...p, clips: p.clips.map((c) => ({ ...c, ...patch(c) })) })
  }, [commit])

  const updateLayer = useCallback(<L extends Layer>(id: string, patch: Partial<L> | ((l: L) => Partial<L>)) => {
    const p = ref.current
    commit({ ...p, layers: p.layers.map((l) => (l.id === id ? ({ ...l, ...(typeof patch === 'function' ? patch(l as L) : patch) } as Layer) : l)) })
  }, [commit])

  /** Patches every layer that matches, as one edit (e.g. the frame of all subtitles). */
  const updateLayers = useCallback((match: (l: Layer) => boolean, patch: (l: Layer) => Partial<Layer>) => {
    const p = ref.current
    commit({ ...p, layers: p.layers.map((l) => (match(l) ? ({ ...l, ...patch(l) } as Layer) : l)) })
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
   */
  const place = useCallback((srcs: MediaSource[], where: Placement, t: number, patch?: { crop?: Clip['crop'] }): Placed | null => {
    const p = ref.current
    const visual = srcs.filter((s) => s.kind !== 'audio')
    if (!visual.length) return null
    const mode: Placement = p.clips.length ? where : 'end'
    if (mode === 'track') {
      const tot = layoutClips(p.clips).total
      let at = Math.max(0, Math.min(t, Math.max(0, tot - 0.5)))
      const layers: MediaLayer[] = []
      let cut = false
      const all = { ...sourcesRef.current, ...Object.fromEntries(visual.map((s) => [s.id, s])) }
      for (const src of visual) {
        if (at >= tot - 0.1 && layers.length) break
        const dur = src.kind === 'image' ? 3 : src.duration
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
      h.set({ ...p, layers: [...p.layers, ...layers] })
      const sel: Selection = { type: 'layer', id: layers[0].id }
      setSel(sel)
      return { sel, start: layers[0].start, where: mode, cut }
    }
    const clips = visual.map((s) => ({ ...newClip(s, uid()), ...(patch?.crop ? { crop: patch.crop } : {}) }))
    let list = [...p.clips]
    let idx = mode === 'start' ? 0 : list.length
    if (mode === 'playhead') {
      const { items } = layoutClips(list)
      const it = items.find((x) => t >= x.start && t < x.start + x.dur) ?? items[items.length - 1]
      const local = t - it.start
      const c = it.clip
      const at = c.in + local * c.speed
      if (local < 0.25 || c.ramp || at - c.in < MIN_CLIP) idx = it.index
      else if (it.dur - local < 0.25 || c.out - at < MIN_CLIP) idx = it.index + 1
      else {
        // split the clip under the playhead and put the new media in between
        list = list.flatMap((x) => (x.id === c.id ? [{ ...c, out: at, transition: null, fadeOut: 0 }, { ...c, id: uid(), in: at, fadeIn: 0 }] : [x]))
        idx = it.index + 1
      }
    }
    list.splice(idx, 0, ...clips)
    h.set({ ...p, clips: list })
    const start = layoutClips(list).items[idx].start
    const sel: Selection = { type: 'clip', id: clips[0].id }
    setSel(sel)
    return { sel, start, where: mode, cut: false }
  }, [h])

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
    h.set({ ...p, layers: [...p.layers, l] })
    setSel({ type: 'layer', id: l.id })
  }, [h])

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

  const addAudio = useCallback((t: number, src: MediaSource, kind: AudioLayer['kind'], label: string) => {
    const tot = total()
    const start = Math.max(0, Math.min(t, Math.max(0, tot - 0.5)))
    const l: AudioLayer = {
      id: uid(), type: 'audio', sourceId: src.id, in: 0, start, end: Math.min(start + src.duration, tot > 0 ? tot : start + src.duration),
      volume: kind === 'music' ? 0.6 : 1, fadeIn: kind === 'music' ? 1 : 0, fadeOut: kind === 'music' ? 2 : 0, label, kind,
    }
    addLayer(l)
    return l
  }, [addLayer]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Adds an animated waveform that moves with an audio layer's sound, over the same time span. */
  const addWave = useCallback((a: AudioLayer) => {
    const l: WaveLayer = { ...newWave(a.sourceId, 'bars'), start: a.start, end: a.end, in: a.in }
    addLayer(l)
  }, [addLayer])

  const remove = useCallback(() => {
    const p = ref.current
    if (!sel) return
    if (sel.type === 'clip') h.set({ ...p, clips: p.clips.filter((c) => c.id !== sel.id) })
    else if (sel.all) h.set({ ...p, layers: p.layers.filter((l) => !isSub(l)) })
    else h.set({ ...p, layers: p.layers.filter((l) => l.id !== sel.id) })
    setSel(null)
  }, [h, sel])

  const duplicate = useCallback(() => {
    const p = ref.current
    if (!sel) return
    if (sel.type === 'clip') {
      const i = p.clips.findIndex((c) => c.id === sel.id)
      if (i < 0) return
      const copy = { ...p.clips[i], id: uid() }
      h.set({ ...p, clips: [...p.clips.slice(0, i + 1), copy, ...p.clips.slice(i + 1)] })
      setSel({ type: 'clip', id: copy.id })
    } else {
      const l = p.layers.find((x) => x.id === sel.id)
      if (!l) return
      const len = l.end - l.start
      const copy = { ...l, id: uid(), start: l.end, end: l.end + len } as Layer
      if ('box' in copy) copy.box = { ...copy.box }
      h.set({ ...p, layers: [...p.layers, copy] })
      setSel({ type: 'layer', id: copy.id })
    }
  }, [h, sel])

  /** Splits the selected layer, or the clip under the playhead, at time t. */
  const split = useCallback((t: number) => {
    const p = ref.current
    if (sel?.type === 'layer') {
      const l = p.layers.find((x) => x.id === sel.id)
      if (!l || t <= l.start + 0.1 || t >= l.end - 0.1) return
      const right = { ...l, id: uid(), start: t } as Layer
      if (right.type === 'media' || right.type === 'audio' || right.type === 'wave') right.in = (l as MediaLayer).in + (t - l.start)
      h.set({ ...p, layers: p.layers.flatMap((x) => (x.id === l.id ? [{ ...l, end: t } as Layer, right] : [x])) })
      setSel({ type: 'layer', id: right.id })
      return
    }
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
      const right = { ...c, id: uid(), in: at, ramp: null, speed: avg, fadeIn: 0 }
      h.set({ ...p, clips: p.clips.flatMap((x) => (x.id === c.id ? [left, right] : [x])) })
      setSel({ type: 'clip', id: right.id })
      return
    }
    const at = c.in + local * c.speed
    if (at - c.in < MIN_CLIP || c.out - at < MIN_CLIP) return
    const left = { ...c, out: at, transition: null, fadeOut: 0 }
    const right = { ...c, id: uid(), in: at, fadeIn: 0 }
    h.set({ ...p, clips: p.clips.flatMap((x) => (x.id === c.id ? [left, right] : [x])) })
    setSel({ type: 'clip', id: right.id })
  }, [h, sel])

  const moveClip = useCallback((id: string, to: number) => {
    const p = ref.current
    const from = p.clips.findIndex((c) => c.id === id)
    if (from < 0 || from === to) return
    const clips = [...p.clips]
    const [c] = clips.splice(from, 1)
    clips.splice(Math.max(0, Math.min(clips.length, to)), 0, c)
    h.set({ ...p, clips })
  }, [h])

  const replaceProject = useCallback((p: Project) => h.set(p), [h])

  return {
    project, sources, layout, sel, setSel,
    canUndo: h.canUndo, canRedo: h.canRedo, undo: h.undo, redo: h.redo,
    begin, end, live: h.live,
    addSource, place, addSlides, setSlideshow, updateClip, updateAllClips, updateLayer, updateLayers, setSettings, setWatermark,
    addText, addSticker, addBlur, addOverlay, addAudio, addWave, addLayer,
    remove, duplicate, split, moveClip, replaceProject,
  }
}

export type Editor = ReturnType<typeof useEditor>
