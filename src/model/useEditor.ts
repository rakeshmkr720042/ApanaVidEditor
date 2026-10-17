import { useCallback, useMemo, useRef, useState } from 'react'
import type { AudioLayer, BlurLayer, Clip, Layer, MediaLayer, MediaSource, Project, ProjectSettings, StickerLayer, TextLayer, Watermark, WaveLayer } from '../types'
import { MIN_CLIP } from '../types'
import { useHistory } from '../lib/history'
import { uid } from '../lib/format'
import { clipSegments, defaultAdjust, layoutClips, newClip, sourceAt } from './timeline'
import { applySlideshow, type SlideshowOptions } from './slideshow'
import { defaultTextStyle, subtitleStyle } from '../engine/text'
import { defaultWatermark } from '../engine/watermark'

export type Selection = { type: 'clip'; id: string } | { type: 'layer'; id: string } | null

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

  const appendClips = useCallback((srcs: MediaSource[], at?: number, patch?: Partial<Clip>) => {
    const p = ref.current
    const clips = srcs.map((s) => ({ ...newClip(s, uid()), ...patch }))
    const idx = at ?? p.clips.length
    h.set({ ...p, clips: [...p.clips.slice(0, idx), ...clips, ...p.clips.slice(idx)] })
    return clips
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
  }, [addLayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const addAudio = useCallback((t: number, src: MediaSource, kind: AudioLayer['kind'], label: string) => {
    const tot = total()
    const start = Math.max(0, Math.min(t, Math.max(0, tot - 0.5)))
    const l: AudioLayer = {
      id: uid(), type: 'audio', sourceId: src.id, in: 0, start, end: Math.min(start + src.duration, tot > 0 ? tot : start + src.duration),
      volume: kind === 'music' ? 0.6 : 1, fadeIn: kind === 'music' ? 1 : 0, fadeOut: kind === 'music' ? 2 : 0, label, kind,
    }
    addLayer(l)
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
    addSource, appendClips, addSlides, setSlideshow, updateClip, updateAllClips, updateLayer, updateLayers, setSettings, setWatermark,
    addText, addSticker, addBlur, addOverlay, addAudio, addWave, addLayer,
    remove, duplicate, split, moveClip, replaceProject,
  }
}

export type Editor = ReturnType<typeof useEditor>
