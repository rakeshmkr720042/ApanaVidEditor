import type { MediaSource, Project } from '../types'
import { activeAt, layerSpeed, layoutClips, sourceAt, type LaidClip } from '../model/timeline'
import { clipKey, layerKey, outputSize, Renderer, type FrameImage } from './renderer'

interface Need { key: string; source: MediaSource; time: number; rate: number; volume: number; preload?: boolean }

export function fadeGain(local: number, dur: number, fadeIn: number, fadeOut: number) {
  let g = 1
  if (fadeIn > 0 && local < fadeIn) g *= Math.max(0, local / fadeIn)
  if (fadeOut > 0 && local > dur - fadeOut) g *= Math.max(0, (dur - local) / fadeOut)
  return g
}

/** What media is needed at time t, with source times, rates and volumes. */
export function mediaNeeds(project: Project, items: LaidClip[], sources: Record<string, MediaSource>, t: number, lookahead = 0): Need[] {
  const needs: Need[] = []
  const { a, b, progress } = activeAt(items, t)
  for (const [act, g] of [[a, b ? 1 - progress : 1], [b, progress]] as const) {
    if (!act) continue
    const c = act.item.clip
    const src = sources[c.sourceId]
    if (!src) continue
    const { time, speed } = sourceAt(c, act.local)
    needs.push({ key: clipKey(c), source: src, time, rate: speed, volume: c.volume * g * fadeGain(act.local, act.item.dur, c.fadeIn, c.fadeOut) })
  }
  if (lookahead > 0 && a) {
    const next = items[a.item.index + (b ? 2 : 1)]
    if (next && next.start - t < lookahead && sources[next.clip.sourceId]) {
      needs.push({ key: clipKey(next.clip), source: sources[next.clip.sourceId], time: next.clip.in, rate: 1, volume: 0, preload: true })
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
    const vol = l.type === 'audio' ? l.volume * fadeGain(local, l.end - l.start, l.fadeIn, l.fadeOut) : l.volume
    const sp = layerSpeed(l)
    needs.push({ key: layerKey(l), source: src, time: l.in + local * sp, rate: sp, volume: active ? vol : 0, preload: !active })
  }
  return needs
}

const clampRate = (r: number) => Math.min(16, Math.max(0.0625, r))

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

  private els = new Map<string, HTMLMediaElement>()
  private used = new Map<string, number>()
  private imgs = new Map<string, HTMLImageElement>()
  private raf = 0
  private clockStart = 0
  private clockT = 0
  private renderQueued = false
  private previewShort: number

  constructor(canvas: HTMLCanvasElement, previewShort = 540) {
    this.renderer = new Renderer(canvas)
    this.renderer.onNeedsRedraw = () => this.requestRender()
    this.previewShort = previewShort
  }

  setProject(project: Project, sources: Record<string, MediaSource>) {
    this.project = project
    this.sources = sources
    const { items, total } = layoutClips(project.clips)
    this.items = items
    this.total = total
    const { w, h } = outputSize(project, sources, this.previewShort)
    this.renderer.resize(w, h)
    if (this.t > total) this.t = total
    if (!this.playing && !this.renderOverride) this.sync()
    this.requestRender()
  }

  play() {
    if (this.playing || this.total <= 0) return
    if (this.t >= this.total - 0.05) this.t = 0
    this.playing = true
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
    if (el.dataset.src !== src.id) {
      el.dataset.src = src.id
      el.src = src.url
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
    return img
  }

  private sync() {
    const needs = mediaNeeds(this.project, this.items, this.sources, this.t, this.playing ? 1.5 : 0)
    const active = new Set<string>()
    for (const n of needs) {
      if (n.source.kind === 'image') { this.image(n.source); continue }
      const el = this.element(n.key, n.source)
      if (!el) continue
      active.add(n.key)
      if (this.playing && !n.preload) {
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
        this.els.delete(key)
      }
    }
  }

  frame = (key: string): FrameImage | null => {
    const el = this.els.get(key)
    if (el && el instanceof HTMLVideoElement) {
      return el.readyState >= 2 && el.videoWidth ? { image: el, width: el.videoWidth, height: el.videoHeight } : null
    }
    const id = key.startsWith('c:')
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
        this.renderer.render({ t: 0, project: { ...this.project, layers: [], watermark: null }, items, sources: this.sources, frame: this.frame, watermark: null, seed: 0 })
        return
      }
    }
    this.renderer.render({
      t: this.t, project: this.project, items: this.items, sources: this.sources,
      frame: this.frame, watermark: this.watermark,
    })
  }

  destroy() {
    this.pause()
    for (const el of this.els.values()) { el.removeAttribute('src'); el.load() }
    this.els.clear()
  }
}
