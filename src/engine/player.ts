import type { MediaLayer, MediaSource, Project } from '../types'
import { activeAt, layerSpeed, layoutClips, sourceAt, type LaidClip } from '../model/timeline'
import { backdropKey, clipKey, layerKey, outputSize, Renderer, type FrameImage } from './renderer'
import { backdropSource, backdropTime } from './chromakey'
import { onCleanChange, prepareCleanSounds, previewSource, soundJob } from './denoise'
import { duckCurve, duckGain, onDuckChange } from './duck'
import { reversedIn } from './soundfx'
import { Meter } from './meter'
import { volAt } from '../model/clipKeys'
import { originalOf } from './original'

interface Need { key: string; source: MediaSource; time: number; rate: number; volume: number; preload?: boolean }

export function fadeGain(local: number, dur: number, fadeIn: number, fadeOut: number) {
  let g = 1
  if (fadeIn > 0 && local < fadeIn) g *= Math.max(0, local / fadeIn)
  if (fadeOut > 0 && local > dur - fadeOut) g *= Math.max(0, (dur - local) / fadeOut)
  return g
}

/** What media is needed at time t, with source times, rates and volumes. */
export function mediaNeeds(project: Project, items: LaidClip[], sources: Record<string, MediaSource>, t: number, lookahead = 0, smooth = false): Need[] {
  const needs: Need[] = []
  const { a, b, progress } = activeAt(items, t)
  for (const [act, g] of [[a, b ? 1 - progress : 1], [b, progress]] as const) {
    if (!act) continue
    const c = act.item.clip
    const src = sources[c.sourceId]
    if (!src) continue
    const { time, speed } = sourceAt(c, act.local)
    const volume = volAt(c, time) * g * fadeGain(act.local, act.item.dur, c.fadeIn, c.fadeOut)
    // with noise removal or sound effects the picture plays silent and the cleaned sound plays next to it
    const job = soundJob(c)
    const clean = job ? previewSource(c.sourceId, job.dn, job.fx) : null
    needs.push({ key: clipKey(c), source: src, time, rate: speed, volume: clean ? 0 : volume })
    if (clean) needs.push({ key: clipKey(c) + '~clean', source: clean, time, rate: speed, volume })
    // smooth slow motion (export): the next source frame too, to blend with
    if (smooth && c.smoothSlow && speed < 1 && src.kind === 'video') {
      needs.push({ key: clipKey(c) + '~next', source: src, time: Math.min(src.duration, (Math.floor(time * c.smoothSlow + 1e-3) + 1) / c.smoothSlow + 1e-4), rate: speed, volume: 0 })
    }
    const bd = backdropSource(c, sources)
    if (bd) needs.push({ key: backdropKey(c), source: bd, time: backdropTime(c.backdrop!, bd, act.local), rate: 1, volume: 0 })
  }
  if (lookahead > 0) {
    // in empty time (snap off) the next clip is the first one that starts later
    const next = a ? items[a.item.index + (b ? 2 : 1)] : items.find((x) => x.start > t)
    if (next && next.start - t < lookahead && sources[next.clip.sourceId]) {
      needs.push({ key: clipKey(next.clip), source: sources[next.clip.sourceId], time: next.clip.in, rate: 1, volume: 0, preload: true })
      const bd = backdropSource(next.clip, sources)
      if (bd) needs.push({ key: backdropKey(next.clip), source: bd, time: backdropTime(next.clip.backdrop!, bd, 0), rate: 1, volume: 0, preload: true })
    }
  }
  for (const l of project.layers) {
    if (l.type !== 'media' && l.type !== 'audio') continue
    const src = sources[l.sourceId]
    if (!src) continue
    const active = t >= l.start && t < l.end
    const soon = lookahead > 0 && l.start > t && l.start - t < lookahead
    if (!active && !soon) continue
    const local = Math.max(0, t - l.start)
    const sp = layerSpeed(l)
    const lv = volAt(l, l.in + local * sp)
    const vol = l.type === 'audio' ? lv * fadeGain(local, l.end - l.start, l.fadeIn, l.fadeOut) * duckGain(l, t) : lv
    const job = soundJob(l)
    const clean = job ? previewSource(l.sourceId, job.dn, job.fx) : null
    let time = l.in + local * sp
    if (l.type === 'audio' && job?.fx?.reverse) {
      // the made sound is the whole file backwards: play the matching stretch of it; silent until it is ready
      if (!clean) continue
      time = reversedIn(l, src) + local * sp
    }
    if (clean && l.type === 'audio') {
      needs.push({ key: layerKey(l), source: clean, time, rate: sp, volume: active ? vol : 0, preload: !active })
      continue
    }
    needs.push({ key: layerKey(l), source: src, time, rate: sp, volume: active && !clean ? vol : 0, preload: !active })
    const bd = l.type === 'media' ? backdropSource(l, sources) : undefined
    if (bd) needs.push({ key: backdropKey(l), source: bd, time: backdropTime((l as MediaLayer).backdrop!, bd, local), rate: 1, volume: 0, preload: !active })
    if (clean) needs.push({ key: layerKey(l) + '~clean', source: clean, time, rate: sp, volume: active ? vol : 0, preload: !active })
  }
  return needs
}

const clampRate = (r: number) => Math.min(16, Math.max(0.0625, r))

/**
 * Photos the preview can let go of: unused for 10 s, oldest first, keeping the 8 most recently used
 * (so going back and forth over a few photos never reloads them).
 */
export function photosToFree(used: Map<string, number>, now: number, keep = 8, idleMs = 10000): string[] {
  const old = [...used].sort((a, b) => b[1] - a[1]).slice(keep)
  return old.filter(([, at]) => now - at > idleMs).map(([id]) => id)
}

/** Live preview: drives <video>/<audio> elements from one clock and draws frames to a canvas. */
export class Player {
  t = 0
  playing = false
  project: Project = { clips: [], layers: [], settings: { aspect: 'original', background: 'black', fps: 30 } }
  sources: Record<string, MediaSource> = {}
  items: LaidClip[] = []
  total = 0
  watermark: string | null = null
  muted = false
  /** Playback speed of the preview (fast forward / slow motion), 1 = normal. */
  rate = 1
  readonly renderer: Renderer
  onTick: ((t: number, playing: boolean) => void) | null = null
  /** Audio meter (sounds routed through an analyser while playing), null = off. */
  meter: Meter | null = null
  setMeter(on: boolean) {
    if (on && !this.meter) this.meter = new Meter()
    // once routed, elements must stay in the context to be heard: switching off only stops reading the levels
  }
  meterOn = true

  private els = new Map<string, HTMLMediaElement>()
  private used = new Map<string, number>()
  private imgs = new Map<string, HTMLImageElement>()
  private imgUsed = new Map<string, number>()
  private raf = 0
  private clockStart = 0
  private clockT = 0
  private renderQueued = false
  private previewShort: number

  constructor(canvas: HTMLCanvasElement, previewShort = 540) {
    this.renderer = new Renderer(canvas)
    this.renderer.onNeedsRedraw = () => this.requestRender()
    this.previewShort = previewShort
    // a cleaned sound became ready (or "hear original" was switched): swap the sound now
    this.offClean = onCleanChange(() => this.sync())
    // the auto-lowering curve for music is ready
    this.offDuck = onDuckChange(() => this.sync())
  }
  private offClean: () => void
  private offDuck: () => void

  setProject(project: Project, sources: Record<string, MediaSource>) {
    this.project = project
    this.sources = sources
    const { items, total } = layoutClips(project.clips)
    this.items = items
    this.total = total
    prepareCleanSounds(project, sources)
    void duckCurve(project, sources)
    const { w, h } = outputSize(project, sources, this.previewShort)
    this.renderer.resize(w, h)
    this.before?.resize(w, h)
    if (this.t > total) this.t = total
    if (!this.playing && !this.renderOverride) this.sync()
    this.requestRender()
  }

  play() {
    if (this.playing || this.total <= 0) return
    if (this.t >= this.total - 0.05) this.t = 0
    this.playing = true
    if (this.meterOn) { this.setMeter(true); this.meter!.start() } else this.meter?.start()
    this.clockStart = performance.now()
    this.clockT = this.t
    this.sync()
    const loop = () => {
      if (!this.playing) return
      this.t = this.clockT + ((performance.now() - this.clockStart) / 1000) * this.rate
      if (this.t >= this.total) {
        this.t = this.total
        this.pause()
        return
      }
      this.sync()
      this.draw()
      this.onTick?.(this.t, true)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
    this.onTick?.(this.t, true)
  }

  pause() {
    this.playing = false
    cancelAnimationFrame(this.raf)
    for (const el of this.els.values()) el.pause()
    this.sync()
    this.requestRender()
    this.onTick?.(this.t, false)
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.total, t))
    if (this.playing) { this.clockStart = performance.now(); this.clockT = this.t }
    this.sync()
    this.requestRender()
    this.onTick?.(this.t, this.playing)
  }

  setRate(r: number) {
    if (this.playing) { this.clockT = this.t; this.clockStart = performance.now() }
    this.rate = r
    this.sync()
  }

  /** Show a specific source time of a clip (while dragging a trim handle). */
  previewSource(clipId: string, sourceTime: number) {
    const clip = this.project.clips.find((c) => c.id === clipId)
    if (!clip) return
    const el = this.element(clipKey(clip), this.sources[clip.sourceId])
    if (el && Math.abs(el.currentTime - sourceTime) > 0.01) el.currentTime = sourceTime
    this.renderOverride = clip.id
    this.requestRender()
  }

  /** Before / after: a second picture of the same moment with every edit taken off (null = off). */
  private before: Renderer | null = null
  private beforeKept: Renderer | null = null // kept for the same canvas, so switching on and off makes no new GL contexts
  setCompare(canvas: HTMLCanvasElement | null) {
    if (canvas && this.beforeKept?.canvas !== canvas) this.beforeKept = new Renderer(canvas)
    this.before = canvas ? this.beforeKept : null
    this.before?.resize(this.renderer.W, this.renderer.H)
    this.requestRender()
  }

  endPreviewSource() { this.renderOverride = null; this.sync(); this.requestRender() }
  private renderOverride: string | null = null

  requestRender() {
    if (this.renderQueued || this.playing) return
    this.renderQueued = true
    requestAnimationFrame(() => { this.renderQueued = false; this.draw() })
  }

  private element(key: string, src: MediaSource | undefined): HTMLMediaElement | null {
    if (!src || src.kind === 'image') return null
    let el = this.els.get(key)
    if (!el) {
      el = document.createElement(src.kind === 'audio' ? 'audio' : 'video') as HTMLMediaElement
      el.preload = 'auto'
      el.crossOrigin = 'anonymous'
      ;(el as HTMLVideoElement).playsInline = true
      el.addEventListener('seeked', () => this.requestRender())
      el.addEventListener('loadeddata', () => this.requestRender())
      this.els.set(key, el)
    }
    // a new file, or the same file's preview copy switched on or off
    if (el.dataset.src !== src.id || el.dataset.url !== src.url) {
      const at = el.dataset.src === src.id ? el.currentTime : 0
      el.dataset.src = src.id
      el.dataset.url = src.url
      el.src = src.url
      if (at) el.currentTime = at
    }
    this.used.set(key, performance.now())
    return el
  }

  private image(src: MediaSource) {
    let img = this.imgs.get(src.id)
    if (!img) {
      img = new Image()
      img.onload = () => this.requestRender()
      img.src = src.url
      this.imgs.set(src.id, img)
    }
    this.imgUsed.set(src.id, performance.now())
    return img
  }

  private sync() {
    // paused: smooth slow motion shows its in-between picture too (the next frame is needed for it)
    const needs = mediaNeeds(this.project, this.items, this.sources, this.t, this.playing ? 1.5 : 0, !this.playing)
    const active = new Set<string>()
    for (const n of needs) {
      if (n.source.kind === 'image') { this.image(n.source); continue }
      const el = this.element(n.key, n.source)
      if (!el) continue
      active.add(n.key)
      // ultra slow (below what a <video> can play): stepped through by seeking, without sound
      const crawl = this.playing && !n.preload && n.rate * this.rate < 0.0625
      if (crawl) {
        if (!el.paused) el.pause()
        if (Math.abs(el.currentTime - n.time) > 1 / 40 && !el.seeking) el.currentTime = n.time
      } else if (this.playing && !n.preload) {
        if (this.meterOn) this.meter?.attach(el)
        el.playbackRate = clampRate(n.rate * this.rate)
        el.volume = Math.max(0, Math.min(1, n.volume))
        el.muted = this.muted || n.volume <= 0
        if (el.paused) {
          el.currentTime = n.time
          el.play().catch(() => {})
        } else if (Math.abs(el.currentTime - n.time) > 0.3 * Math.max(1, n.rate * this.rate)) {
          el.currentTime = n.time
        }
      } else {
        if (!el.paused) el.pause()
        if (Math.abs(el.currentTime - n.time) > 0.02 && !(n.preload && el.seeking)) el.currentTime = n.time
      }
    }
    const now = performance.now()
    for (const [key, el] of this.els) {
      if (active.has(key)) continue
      if (!el.paused) el.pause()
      if (now - (this.used.get(key) ?? 0) > 8000) {
        el.removeAttribute('src')
        el.load()
        this.meter?.detach(el)
        this.els.delete(key)
      }
    }
    // photos not shown for a while let go of their decoded pixels (a 100 photo slideshow kept every one, ~50 MB each)
    for (const id of photosToFree(this.imgUsed, now)) {
      const img = this.imgs.get(id)
      if (img) { img.onload = null; img.removeAttribute('src') }
      this.imgs.delete(id)
      this.imgUsed.delete(id)
    }
  }

  frame = (key: string): FrameImage | null => {
    const el = this.els.get(key)
    if (el && el instanceof HTMLVideoElement) {
      return el.readyState >= 2 && el.videoWidth ? { image: el, width: el.videoWidth, height: el.videoHeight } : null
    }
    const id = key.startsWith('g:')
      ? ([...this.project.clips, ...this.project.layers] as { id: string; backdrop?: { sourceId?: string } | null }[]).find((o) => backdropKey(o) === key)?.backdrop?.sourceId
      : key.startsWith('c:')
        ? this.project.clips.find((c) => clipKey(c) === key)?.sourceId
        : (this.project.layers.find((l) => layerKey(l) === key) as { sourceId?: string } | undefined)?.sourceId
    const src = id ? this.sources[id] : undefined
    if (src?.kind === 'image') {
      const img = this.image(src)
      return img.complete && img.naturalWidth ? { image: img, width: img.naturalWidth, height: img.naturalHeight } : null
    }
    return null
  }

  draw() {
    // a seeking video has no frame for a moment: keep the last picture until 'seeked' asks for a redraw, instead of flashing black
    if (!this.playing && [...this.els.values()].some((el) => el.seeking && el.readyState < 2)) return
    if (this.renderOverride) {
      // Trim preview: show the raw clip frame being trimmed, full screen.
      const clip = this.project.clips.find((c) => c.id === this.renderOverride)
      if (clip) {
        const items = [{ clip: { ...clip, transition: null }, index: 0, start: 0, dur: 1, transIn: 0, transOut: 0 }]
        this.renderer.render({ t: 0, project: { ...this.project, layers: [], watermark: null, presenter: null }, items, sources: this.sources, frame: this.frame, watermark: null, seed: 0 })
        return
      }
    }
    this.renderer.render({
      t: this.t, project: this.project, items: this.items, sources: this.sources,
      frame: this.frame, watermark: this.watermark,
    })
    if (this.before) {
      const o = originalOf(this.project, this.items)
      this.before.render({ t: this.t, project: o.project, items: o.items, sources: this.sources, frame: this.frame, watermark: null })
    }
  }

  destroy() {
    this.offClean()
    this.offDuck()
    this.pause()
    for (const el of this.els.values()) { el.removeAttribute('src'); el.load() }
    this.els.clear()
    this.meter?.close()
  }
}
