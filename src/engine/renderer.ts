import type { BlurLayer, Clip, MediaLayer, MediaSource, Project, VisualLayer } from '../types'
import { activeAt, type LaidClip } from '../model/timeline'
import { colorParams, type ColorParams } from './filters'
import { Grader } from './gl'
import { drawSticker, drawText, ensureFont, fontLoaded, measureText, STICKER_BASE } from './text'
import { drawUserWatermark, watermarkCenter, watermarkSize, watermarkVisible } from './watermark'

export interface FrameImage { image: CanvasImageSource; width: number; height: number }
export type FrameGetter = (key: string) => FrameImage | null

export interface RenderInput {
  t: number
  project: Project
  items: LaidClip[]
  sources: Record<string, MediaSource>
  frame: FrameGetter
  watermark: string | null
  seed?: number
}

type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export const clipKey = (c: { id: string }) => `c:${c.id}`
export const layerKey = (l: { id: string }) => `l:${l.id}`

function makeCanvas(w = 2, h = 2): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}

const ctx2d = (c: Canvas) => c.getContext('2d', { willReadFrequently: false }) as Ctx

/** Output size for an aspect setting, with `short` pixels on the short side. */
export function outputSize(project: Project, sources: Record<string, MediaSource>, short: number) {
  let ratio: number
  const a = project.settings.aspect
  if (a === 'original') {
    const c = project.clips.find((x) => !x.fromTemplate) ?? project.clips[0]
    const s = c && sources[c.sourceId]
    if (s && s.width && s.height) {
      let w = s.width * (c.crop?.w ?? 1), h = s.height * (c.crop?.h ?? 1)
      if (c.rotate % 180) [w, h] = [h, w]
      ratio = w / h
    } else ratio = 16 / 9
  } else {
    const [x, y] = a.split(':').map(Number)
    ratio = x / y
  }
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  return ratio >= 1 ? { w: even(short * ratio), h: even(short) } : { w: even(short), h: even(short / ratio) }
}

/** Composites one frame of the project. Used by both the live preview and export. */
export class Renderer {
  readonly canvas: Canvas
  private ctx: Ctx
  private frames: [Canvas, Canvas]
  private grader: Grader | null
  private layerGrader: Grader | null = null
  private scratch = makeCanvas()
  private bgSmall = makeCanvas(48, 48)
  private wmImage: { id: string; img: CanvasImageSource | null; ready: Promise<void> } | null = null
  onNeedsRedraw: (() => void) | null = null
  W = 2
  H = 2

  constructor(canvas?: Canvas) {
    this.canvas = canvas ?? makeCanvas()
    this.ctx = ctx2d(this.canvas)
    this.frames = [makeCanvas(), makeCanvas()]
    this.grader = Grader.create(makeCanvas())
  }

  get hasGL() { return !!this.grader }

  resize(w: number, h: number) {
    if (this.W === w && this.H === h) return
    this.W = w; this.H = h
    this.canvas.width = w; this.canvas.height = h
    for (const f of this.frames) { f.width = w; f.height = h }
    this.grader?.resize(w, h)
  }

  render(inp: RenderInput) {
    const { ctx, W, H } = this
    const seed = inp.seed ?? Math.random()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.filter = 'none'
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    const { a, b, progress } = activeAt(inp.items, inp.t)
    if (a) {
      const fa = this.drawClipFrame(0, a.item.clip, inp)
      const pa = colorParams(a.item.clip.adjust, a.item.clip.filter, a.item.clip.filterAmount)
      if (b && a.item.clip.transition) {
        const fb = this.drawClipFrame(1, b.item.clip, inp)
        const pb = colorParams(b.item.clip.adjust, b.item.clip.filter, b.item.clip.filterAmount)
        if (this.grader) {
          this.grader.drawTransition(fa, pa, fb, pb, a.item.clip.transition.type, progress, seed)
          ctx.drawImage(this.grader.canvas, 0, 0)
        } else {
          this.draw2dGraded(fa, pa)
          ctx.globalAlpha = progress
          this.draw2dGraded(fb, pb)
          ctx.globalAlpha = 1
        }
      } else if (this.grader) {
        this.grader.drawGraded(fa, pa, seed)
        ctx.drawImage(this.grader.canvas, 0, 0)
      } else {
        this.draw2dGraded(fa, pa)
      }
    }

    for (const l of inp.project.layers) {
      if (l.type === 'audio' || inp.t < l.start || inp.t >= l.end) continue
      if (l.type === 'text') {
        if (!fontLoaded(l.style.font)) ensureFont(l.style.font).then(() => this.onNeedsRedraw?.())
        drawText(ctx, l, inp.t, W, H)
      } else if (l.type === 'sticker') drawSticker(ctx, l, inp.t, W, H)
      else if (l.type === 'media') this.drawMediaLayer(l, inp, seed)
      else if (l.type === 'blur') this.drawBlur(l)
    }

    const wm = inp.project.watermark
    if (watermarkVisible(wm, inp.t)) {
      const src = wm.sourceId ? inp.sources[wm.sourceId] : undefined
      if (wm.kind === 'text' && !fontLoaded(wm.font)) ensureFont(wm.font).then(() => this.onNeedsRedraw?.())
      drawUserWatermark(ctx, wm, inp.t, W, H, src, wm.kind === 'image' ? this.watermarkImage(src) : null)
    }

    if (inp.watermark) this.drawWatermark(inp.watermark)
  }

  /** Decoded logo for an image watermark; null until it has loaded (then a redraw is requested). */
  private watermarkImage(src: MediaSource | undefined): CanvasImageSource | null {
    if (!src) return null
    if (this.wmImage?.id !== src.id) {
      const entry: NonNullable<Renderer['wmImage']> = { id: src.id, img: null, ready: Promise.resolve() }
      entry.ready = decodeImage(src).then((img) => { entry.img = img; this.onNeedsRedraw?.() }).catch(() => {})
      this.wmImage = entry
    }
    return this.wmImage.img
  }

  /** Waits until everything the watermark needs is loaded, so the first exported frames have it. */
  async prepareWatermark(project: Project, sources: Record<string, MediaSource>) {
    const wm = project.watermark
    if (!wm?.enabled) return
    if (wm.kind === 'text') await ensureFont(wm.font)
    else if (wm.sourceId) { this.watermarkImage(sources[wm.sourceId]); await this.wmImage?.ready }
  }

  /** Where the user watermark is at time t, in canvas pixels, for dragging it on the preview. */
  watermarkRect(project: Project, sources: Record<string, MediaSource>, t: number) {
    const wm = project.watermark
    if (!watermarkVisible(wm, t)) return null
    const { W, H } = this
    const { w, h } = watermarkSize(this.ctx, wm, W, H, wm.sourceId ? sources[wm.sourceId] : undefined)
    return { ...watermarkCenter(wm, t, W, H, w, h), w, h }
  }

  /** Draws a clip (crop, rotate, flip, fit/fill, background) into frames[i]. */
  private drawClipFrame(i: number, clip: Clip, inp: RenderInput): Canvas {
    const out = this.frames[i]
    const c = ctx2d(out)
    const { W, H } = this
    const bg = inp.project.settings.background
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.globalAlpha = 1
    c.fillStyle = bg === 'blur' ? '#000' : bg === 'white' ? '#fff' : bg === 'black' ? '#000' : bg
    c.fillRect(0, 0, W, H)
    const f = inp.frame(clipKey(clip))
    if (!f) return out
    if (bg === 'blur' && clip.fit === 'fit') {
      const s = this.bgSmall
      const sc = ctx2d(s)
      s.width = 48; s.height = Math.max(8, Math.round((48 * H) / W))
      this.placeFrame(sc, f, clip, s.width, s.height, 'fill')
      c.imageSmoothingEnabled = true
      c.imageSmoothingQuality = 'high'
      c.filter = 'brightness(0.7)'
      c.drawImage(s, 0, 0, W, H)
      c.filter = 'none'
    }
    this.placeFrame(c, f, clip, W, H, clip.fit)
    return out
  }

  private placeFrame(c: Ctx, f: FrameImage, clip: Clip, W: number, H: number, fit: 'fit' | 'fill') {
    const cr = clip.crop ?? { x: 0, y: 0, w: 1, h: 1 }
    const sx = cr.x * f.width, sy = cr.y * f.height, sw = cr.w * f.width, sh = cr.h * f.height
    const rot = clip.rotate % 180 !== 0
    const dw0 = rot ? sh : sw, dh0 = rot ? sw : sh
    const s = fit === 'fit' ? Math.min(W / dw0, H / dh0) : Math.max(W / dw0, H / dh0)
    c.save()
    c.translate(W / 2, H / 2)
    c.rotate((clip.rotate * Math.PI) / 180)
    c.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1)
    c.drawImage(f.image, sx, sy, sw, sh, (-sw * s) / 2, (-sh * s) / 2, sw * s, sh * s)
    c.restore()
  }

  /** Fallback when WebGL is unavailable: approximate the grade with canvas filters. */
  private draw2dGraded(src: Canvas, p: ColorParams) {
    const f = [
      `brightness(${(Math.pow(2, p.exposure) * (1 + p.brightness * 0.3)).toFixed(3)})`,
      `contrast(${(1 + p.contrast).toFixed(3)})`,
      `saturate(${Math.max(0, 1 + p.saturation + p.vibrance * 0.5).toFixed(3)})`,
      `hue-rotate(${p.hue.toFixed(1)}deg)`,
      `grayscale(${Math.min(1, p.mono + p.duo).toFixed(3)})`,
      `sepia(${Math.min(1, p.sepia + Math.max(0, p.temperature) * 0.3).toFixed(3)})`,
    ].join(' ')
    this.ctx.filter = f
    this.ctx.drawImage(src, 0, 0)
    this.ctx.filter = 'none'
  }

  /** Rectangle a layer occupies, in canvas pixels, for hit-testing and handles. */
  layerRect(l: VisualLayer, sources: Record<string, MediaSource>) {
    const { W, H } = this
    if (l.type === 'blur') return { cx: (l.rect.x + l.rect.w / 2) * W, cy: (l.rect.y + l.rect.h / 2) * H, w: l.rect.w * W, h: l.rect.h * H, rotation: 0 }
    if (l.type === 'text' && l.frame) {
      const r = l.frame.rect
      return { cx: (r.x + r.w / 2) * W, cy: (r.y + r.h / 2) * H, w: r.w * W, h: r.h * H, rotation: 0 }
    }
    if (l.type === 'text') {
      const m = measureText(this.ctx, l, H)
      return { cx: l.box.x * W, cy: l.box.y * H, w: m.w * l.box.scale, h: m.h * l.box.scale, rotation: l.box.rotation }
    }
    if (l.type === 'sticker') {
      const s = STICKER_BASE * H * 1.15 * l.box.scale
      return { cx: l.box.x * W, cy: l.box.y * H, w: s, h: s, rotation: l.box.rotation }
    }
    const src = sources[l.sourceId]
    const { w, h } = this.mediaSize(l, src)
    return { cx: l.box.x * W, cy: l.box.y * H, w, h, rotation: l.box.rotation }
  }

  private mediaSize(l: MediaLayer, src: MediaSource | undefined) {
    const ar = src && src.width ? src.width / src.height : 16 / 9
    const base = Math.min(this.W, this.H) * 0.5 * l.box.scale
    const w = ar >= 1 ? base * ar : base
    const h = ar >= 1 ? base : base / ar
    return { w: l.mask === 'circle' ? Math.min(w, h) : w, h: l.mask === 'circle' ? Math.min(w, h) : h, fw: w, fh: h }
  }

  private drawMediaLayer(l: MediaLayer, inp: RenderInput, seed: number) {
    const f = inp.frame(layerKey(l))
    if (!f) return
    const { ctx, W, H } = this
    const { w, h, fw, fh } = this.mediaSize(l, inp.sources[l.sourceId])
    let img: CanvasImageSource = f.image
    const p = colorParams(l.adjust, l.filter, l.filterAmount)
    const needsGrade = l.chroma.enabled || l.filter || Object.values(l.adjust).some((v) => v !== 0)
    if (needsGrade) {
      this.layerGrader ??= Grader.create(makeCanvas())
      if (this.layerGrader) {
        const gw = Math.max(2, Math.round(Math.min(fw, f.width))), gh = Math.max(2, Math.round(Math.min(fh, f.height)))
        this.layerGrader.resize(gw, gh)
        const sc = this.scratch
        sc.width = gw; sc.height = gh
        const s = ctx2d(sc)
        s.clearRect(0, 0, gw, gh)
        s.drawImage(f.image, 0, 0, gw, gh)
        const key = l.chroma.enabled ? hexRgb(l.chroma.color) : null
        this.layerGrader.drawGraded(sc, p, seed, key ? { color: key, similarity: l.chroma.similarity, smoothness: l.chroma.smoothness } : undefined)
        img = this.layerGrader.canvas
      }
    }
    ctx.save()
    ctx.globalAlpha = l.box.opacity
    ctx.translate(l.box.x * W, l.box.y * H)
    ctx.rotate((l.box.rotation * Math.PI) / 180)
    if (l.mask !== 'none') {
      ctx.beginPath()
      if (l.mask === 'circle') ctx.arc(0, 0, w / 2, 0, Math.PI * 2)
      else ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.12)
      ctx.clip()
    }
    ctx.drawImage(img, -fw / 2, -fh / 2, fw, fh)
    if (l.border > 0) {
      ctx.lineWidth = l.border * Math.min(W, H) * 0.01
      ctx.strokeStyle = '#fff'
      if (l.mask === 'none') ctx.strokeRect(-w / 2, -h / 2, w, h)
      else ctx.stroke()
    }
    ctx.restore()
  }

  private drawBlur(l: BlurLayer) {
    const { ctx, W, H } = this
    const x = Math.round(l.rect.x * W), y = Math.round(l.rect.y * H)
    const w = Math.max(2, Math.round(l.rect.w * W)), h = Math.max(2, Math.round(l.rect.h * H))
    const k = l.mode === 'pixelate' ? 4 + l.strength * 40 : 3 + l.strength * 25
    const sw = Math.max(1, Math.round(w / k)), sh = Math.max(1, Math.round(h / k))
    const sc = this.scratch
    sc.width = sw; sc.height = sh
    const s = ctx2d(sc)
    s.imageSmoothingEnabled = true
    s.drawImage(this.canvas, x, y, w, h, 0, 0, sw, sh)
    ctx.save()
    ctx.beginPath()
    if (l.shape === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    else ctx.rect(x, y, w, h)
    ctx.clip()
    ctx.imageSmoothingEnabled = l.mode !== 'pixelate'
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(sc, 0, 0, sw, sh, x, y, w, h)
    ctx.restore()
  }

  private drawWatermark(text: string) {
    const { ctx, W, H } = this
    const px = Math.max(10, Math.min(W, H) * 0.035)
    ctx.save()
    ctx.font = `700 ${px}px Poppins, system-ui, sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.globalAlpha = 0.75
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = px * 0.3
    ctx.fillStyle = '#fff'
    const m = px * 0.8
    const tw = ctx.measureText(text).width
    ctx.fillText(text, W - m, H - m)
    ctx.beginPath()
    const ix = W - m - tw - px * 0.9, iy = H - m - px * 0.85
    ctx.moveTo(ix, iy); ctx.lineTo(ix + px * 0.6, iy + px * 0.35); ctx.lineTo(ix, iy + px * 0.7); ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  /** Test helper: compiles all transition shaders. */
  compileTransitions() { return this.grader?.compileAll() ?? ['no webgl'] }
}

async function decodeImage(src: MediaSource): Promise<CanvasImageSource> {
  try {
    return await createImageBitmap(src.file)
  } catch {
    // e.g. SVG logos, which createImageBitmap can't decode from a Blob
    const img = new Image()
    img.src = src.url
    await img.decode()
    return img
  }
}

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace('#', '').slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
