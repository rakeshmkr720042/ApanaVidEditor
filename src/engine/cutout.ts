/**
 * Person cutout (background removal without a green screen). MediaPipe's selfie segmenter runs on the device and
 * finds the person in a frame; the result is a small soft mask that the renderer scales up and uses to keep only
 * the person. The model (250 KB) and runtime ship with the app, so it works offline.
 *
 * The renderer is synchronous, so the segmenter is loaded ahead (loadCutout) and then called synchronously per
 * frame. Until it is ready, items with a cutout show whole and a redraw follows.
 */
import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import type { Cutout, Project } from '../types'

type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Source = HTMLCanvasElement | OffscreenCanvas | HTMLVideoElement | ImageBitmap | VideoFrame

let seg: ImageSegmenter | null = null
let loading: Promise<boolean> | null = null
let failed = false
const waiting = new Set<() => void>()

const base = () => new URL(`${import.meta.env.BASE_URL}mediapipe/`, location.href).href

/** Loads the segmenter once; resolves false when this device can't run it. */
export function loadCutout(): Promise<boolean> {
  if (seg) return Promise.resolve(true)
  loading ??= (async () => {
    try {
      const { ImageSegmenter } = await import('@mediapipe/tasks-vision')
      const b = base()
      seg = await ImageSegmenter.createFromOptions(
        { wasmLoaderPath: `${b}vision_wasm_internal.js`, wasmBinaryPath: `${b}vision_wasm_internal.wasm` },
        { baseOptions: { modelAssetPath: `${b}selfie_segmenter.tflite`, delegate: 'CPU' }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false },
      )
      return true
    } catch (e) {
      console.warn('person cutout unavailable', e)
      failed = true
      return false
    } finally {
      for (const f of waiting) f()
      waiting.clear()
    }
  })()
  return loading
}

export const cutoutReady = () => !!seg
export const cutoutFailed = () => failed

/** True when something in the project needs the person cutout. */
export const usesCutout = (p: Project) =>
  p.clips.some((c) => c.cutout?.enabled) || p.layers.some((l) => (l.type === 'media' && l.cutout?.enabled) || (l.type === 'text' && l.behind))

/** Starts loading and calls `redraw` once it is ready (for the live preview). */
function ensure(redraw?: (() => void) | null) {
  if (seg || failed) return
  if (redraw) waiting.add(redraw)
  loadCutout()
}

function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}
const ctx2d = (c: Canvas) => c.getContext('2d') as Ctx

const scratch: Record<'a' | 'b' | 'in', Canvas | null> = { a: null, b: null, in: null }
const sized = (which: 'a' | 'b' | 'in', w: number, h: number) => {
  let c = scratch[which]
  if (!c) c = scratch[which] = makeCanvas(w, h)
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  return c
}

interface Cached { stamp: string; mask: Canvas }
const cache = new Map<string, Cached>()

/**
 * The person mask of an image as a small canvas whose alpha is the person (model size, 256×256; draw it scaled).
 * `key` + `stamp` identify the frame: the same pair returns the cached mask (paused redraws cost nothing).
 */
export function personMask(img: Source, key: string, stamp: string, soft: number, redraw?: (() => void) | null): Canvas | null {
  ensure(redraw)
  if (!seg) return null
  const full = `${stamp}|${soft.toFixed(2)}`
  const hit = cache.get(key)
  if (hit && hit.stamp === full) return hit.mask
  // the model works at 256 px: a small copy keeps the call and the mask cheap on big frames
  const iw = 'videoWidth' in img ? img.videoWidth : 'displayWidth' in img ? img.displayWidth : img.width
  const ih = 'videoHeight' in img ? img.videoHeight : 'displayHeight' in img ? img.displayHeight : img.height
  if (!iw || !ih) return hit?.mask ?? null
  const k = Math.min(1, 320 / Math.max(iw, ih))
  const small = sized('in', Math.max(2, Math.round(iw * k)), Math.max(2, Math.round(ih * k)))
  const sc = ctx2d(small)
  sc.globalCompositeOperation = 'copy'
  sc.drawImage(img, 0, 0, small.width, small.height)
  let res
  try { res = seg.segment(small as Parameters<ImageSegmenter['segment']>[0]) } catch (e) { console.warn('cutout failed', e); return hit?.mask ?? null }
  const m = res.confidenceMasks?.[0]
  if (!m) { res.close(); return null }
  const w = m.width, h = m.height
  const conf = m.getAsFloat32Array()
  const mask = hit?.mask && hit.mask.width === w && hit.mask.height === h ? hit.mask : makeCanvas(w, h)
  const c = ctx2d(mask)
  const data = c.createImageData(w, h)
  // confidence -> alpha with a soft step; softer edges widen the step
  const lo = 0.45 - soft * 0.3, hi = 0.55 + soft * 0.15
  for (let i = 0; i < conf.length; i++) {
    const x = Math.min(1, Math.max(0, (conf[i] - lo) / (hi - lo)))
    data.data[i * 4 + 3] = Math.round(x * x * (3 - 2 * x) * 255)
  }
  c.putImageData(data, 0, 0)
  res.close()
  cache.set(key, { stamp: full, mask })
  return mask
}

/** Forgets cached masks (a project was closed). */
export function clearCutoutCache() { cache.clear() }

/** `src` (w×h) with only the person left, in a scratch canvas. */
export function keepPerson(src: CanvasImageSource, mask: Canvas, w: number, h: number): Canvas {
  const out = sized('a', w, h)
  const c = ctx2d(out)
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalCompositeOperation = 'copy'
  c.imageSmoothingEnabled = true
  c.imageSmoothingQuality = 'high'
  c.drawImage(mask, 0, 0, w, h)
  c.globalCompositeOperation = 'source-in'
  c.drawImage(src, 0, 0, w, h)
  c.globalCompositeOperation = 'source-over'
  return out
}

/**
 * Draws the outline round the person (before the person is drawn on top) into ctx at (x, y, w, h).
 * line: a solid edge; glow: a soft halo; scribble: a hand-drawn edge that wobbles a few times a second.
 */
export function drawOutline(ctx: Ctx, mask: Canvas, cut: Cutout, x: number, y: number, w: number, h: number, t: number) {
  const kind = cut.outline ?? 'none'
  if (kind === 'none') return
  const color = cut.color ?? '#ffffff'
  const px = Math.max(1, (0.15 + (cut.width ?? 0.4)) * Math.min(w, h) * 0.02)
  // the person's shape in the outline colour
  const sil = sized('b', Math.ceil(w), Math.ceil(h))
  const s = ctx2d(sil)
  s.setTransform(1, 0, 0, 1, 0, 0)
  s.globalCompositeOperation = 'copy'
  s.drawImage(mask, 0, 0, sil.width, sil.height)
  s.globalCompositeOperation = 'source-in'
  s.fillStyle = color
  s.fillRect(0, 0, sil.width, sil.height)
  s.globalCompositeOperation = 'source-over'
  ctx.save()
  if (kind === 'glow') {
    ctx.shadowColor = color
    ctx.shadowBlur = px * 3
    for (let i = 0; i < 3; i++) ctx.drawImage(sil, x, y, w, h)
  } else {
    // stamp the shape round a circle: a thicker shape whose edge shows past the person
    const steps = 16
    const frame = kind === 'scribble' ? Math.floor(t * 8) : 0
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 + frame * 0.7
      const r = kind === 'scribble' ? px * (0.7 + 0.6 * Math.abs(Math.sin(frame * 1.3 + i * 2.1))) : px
      ctx.drawImage(sil, x + Math.cos(a) * r, y + Math.sin(a) * r, w, h)
    }
  }
  ctx.restore()
}

/**
 * Where the person's face is in a frame (0..1 of the frame), from the person mask: the middle of the top part of
 * the person, a little below the top of the head. Null when no one is found.
 */
export function personSpot(img: Source): { x: number; y: number } | null {
  if (!seg) return null
  const iw = 'videoWidth' in img ? img.videoWidth : 'displayWidth' in img ? img.displayWidth : img.width
  const ih = 'videoHeight' in img ? img.videoHeight : 'displayHeight' in img ? img.displayHeight : img.height
  if (!iw || !ih) return null
  const k = Math.min(1, 320 / Math.max(iw, ih))
  const small = sized('in', Math.max(2, Math.round(iw * k)), Math.max(2, Math.round(ih * k)))
  const sc = ctx2d(small)
  sc.globalCompositeOperation = 'copy'
  sc.drawImage(img, 0, 0, small.width, small.height)
  let res
  try { res = seg.segment(small as Parameters<ImageSegmenter['segment']>[0]) } catch { return null }
  const m = res.confidenceMasks?.[0]
  if (!m) { res.close(); return null }
  const w = m.width, h = m.height, conf = m.getAsFloat32Array()
  let top = -1, bottom = -1, count = 0
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) if (conf[y * w + x] > 0.5) row++
    count += row
    if (row > w * 0.02) { if (top < 0) top = y; bottom = y }
  }
  if (top < 0 || count < w * h * 0.01) { res.close(); return null }
  // the head: the top fifth of the person (at most a third of the frame)
  const headEnd = Math.min(bottom, top + Math.max(4, Math.min((bottom - top) * 0.2, h / 3)))
  let sx = 0, n = 0
  for (let y = top; y <= headEnd; y++) for (let x = 0; x < w; x++) if (conf[y * w + x] > 0.5) { sx += x; n++ }
  res.close()
  return { x: n ? sx / n / w : 0.5, y: (top + (headEnd - top) * 0.6) / h }
}
