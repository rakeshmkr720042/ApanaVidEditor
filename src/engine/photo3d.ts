/**
 * 3D photo zoom: a still photo is cut into a few layers by how near each part is, and as the "camera" moves the
 * near layers move and grow more than the far ones, so the photo seems to have depth.
 *
 * How near things are comes from the person finder that ships with the app (people are near) and the usual
 * layout of a photo (the bottom is the ground near the camera, the top is far away). It works on the device and
 * best on photos with a person in front.
 */
import type { MediaSource, Photo3D, Project } from '../types'
import { loadCutout, personMask } from './cutout'

type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}
const ctx2d = (c: Canvas) => c.getContext('2d', { willReadFrequently: true }) as Ctx

async function canvasToUrl(c: Canvas) {
  if ('convertToBlob' in c) {
    const b = await c.convertToBlob({ type: 'image/png' })
    return await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(b) })
  }
  return c.toDataURL('image/png')
}

/** The depth picture of a photo (white = near), as a small PNG data URL. */
export async function makeDepth(src: MediaSource): Promise<{ depth: string; person: boolean }> {
  const bmp = await createImageBitmap(src.file)
  const w = 256, h = Math.max(16, Math.round((256 * bmp.height) / bmp.width))
  const pic = makeCanvas(w, h)
  ctx2d(pic).drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const ok = await loadCutout()
  const mask = ok ? personMask(pic, `depth:${src.id}`, String(Date.now()), 0.4) : null
  const out = makeCanvas(w, h)
  const c = ctx2d(out)
  const img = c.createImageData(w, h)
  let m: Uint8ClampedArray | null = null
  if (mask) {
    const mc = makeCanvas(w, h)
    ctx2d(mc).drawImage(mask, 0, 0, w, h)
    m = ctx2d(mc).getImageData(0, 0, w, h).data
  }
  let person = 0
  for (let y = 0; y < h; y++) {
    const ground = 0.12 + 0.5 * Math.pow(y / (h - 1), 1.6) // far at the top, near at the bottom
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const a = m ? m[i * 4 + 3] / 255 : 0
      if (a > 0.5) person++
      // red/blue: how near (for looking at), green: the person on their own, so they move as one piece
      const d = Math.max(ground, a * 0.95)
      img.data[i * 4] = img.data[i * 4 + 2] = Math.round(d * 255)
      img.data[i * 4 + 1] = Math.round(a * 255)
      img.data[i * 4 + 3] = 255
    }
  }
  c.putImageData(img, 0, 0)
  return { depth: await canvasToUrl(out), person: person > w * h * 0.02 }
}

/**
 * The layers, far to near: the whole photo (with the person smudged out), three bands of ground from the top of
 * the photo (far) to the bottom (near), and the person.
 */
const LEVELS = [0, 0.3, 0.55, 0.8, 1]
const BANDS: [number, number][] = [[0.3, 0.6], [0.55, 0.85], [0.8, 2]] // parts of the photo's height, top to bottom

interface Prepared { layers: Canvas[]; w: number; h: number }
const prepared = new Map<string, Prepared | 'loading'>()

/**
 * The photo cut into layers by depth (far to near), each the photo where it is at least that near. The furthest
 * layer has the near things painted over with a blurred picture, so nothing doubles up where they move away.
 * Null while the depth picture is still loading (`redraw` is called when ready).
 */
function layersFor(key: string, img: CanvasImageSource, iw: number, ih: number, depthUrl: string, redraw?: (() => void) | null): Prepared | null {
  const hit = prepared.get(key)
  if (hit === 'loading') return null
  if (hit) return hit
  prepared.set(key, 'loading')
  ;(async () => {
    const blob = await (await fetch(depthUrl)).blob()
    const depth = await createImageBitmap(blob)
    const k = Math.min(1, 1600 / Math.max(iw, ih))
    const w = Math.max(2, Math.round(iw * k)), h = Math.max(2, Math.round(ih * k))
    const dc = makeCanvas(w, h)
    const dctx = ctx2d(dc)
    dctx.drawImage(depth, 0, 0, w, h)
    const dd = dctx.getImageData(0, 0, w, h).data
    const person = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) person[i] = dd[i * 4 + 1] / 255
    const clamp = (v: number) => Math.max(0, Math.min(1, v))
    const layer = (alpha: (x: number, y: number, i: number) => number, blurred = false) => {
      const c = makeCanvas(w, h)
      const x = ctx2d(c)
      if (blurred) x.filter = `blur(${Math.round(Math.max(w, h) / 40)}px)`
      x.drawImage(img, 0, 0, w, h)
      x.filter = 'none'
      const a = x.getImageData(0, 0, w, h)
      for (let yy = 0, i = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++, i++) a.data[i * 4 + 3] = Math.round(clamp(alpha(xx, yy, i)) * 255)
      x.putImageData(a, 0, 0)
      return c
    }
    // the far layer: the whole photo, with the person replaced by the colours of the background round them
    // (a blur of the photo without the person, divided by how much of it is not person: no person colour leaks in)
    // a little wider than the person, so hair and the edges of clothes the finder missed go too
    const grown = dilate(person, w, h, Math.max(2, Math.round(Math.max(w, h) / 120)))
    const noPerson = layer((_x, _y, i) => 1 - Math.min(1, grown[i] * 1.5))
    // done on a quarter-size copy: big blurs are slow at full size, and this only fills a smooth background
    const qw = Math.max(2, Math.round(w / 4)), qh = Math.max(2, Math.round(h / 4))
    const fill = (r: number) => {
      const q = makeCanvas(qw, qh)
      const qx = ctx2d(q)
      qx.filter = `blur(${Math.max(1, Math.round(r / 4))}px)`
      qx.drawImage(noPerson, 0, 0, qw, qh)
      const c = makeCanvas(w, h)
      const x = ctx2d(c)
      x.imageSmoothingQuality = 'high'
      x.drawImage(q, 0, 0, w, h)
      return x.getImageData(0, 0, w, h)
    }
    const near = fill(Math.max(2, Math.round(Math.max(w, h) / 40))), wide = fill(Math.max(4, Math.round(Math.max(w, h) / 10)))
    const patch = new ImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      const src = near.data[i * 4 + 3] > 60 ? near : wide
      for (let c = 0; c < 3; c++) patch.data[i * 4 + c] = src.data[i * 4 + c]
      patch.data[i * 4 + 3] = Math.round(clamp(grown[i] * 2) * 255)
    }
    const pc = makeCanvas(w, h)
    ctx2d(pc).putImageData(patch, 0, 0)
    const far = makeCanvas(w, h)
    const fc = ctx2d(far)
    fc.drawImage(img, 0, 0, w, h)
    fc.drawImage(pc, 0, 0)
    const layers: Canvas[] = [far]
    // ground bands, overlapping so no gap opens between them; the person is left out of them
    for (const [lo, hi] of BANDS) {
      layers.push(layer((_x, yy, i) => {
        const v = yy / (h - 1)
        return clamp((v - lo) / 0.05) * (1 - clamp((v - hi) / 0.05)) * (1 - grown[i])
      }))
    }
    // the person, with a thin ring round them (hair, edges the finder missed): it all moves together
    layers.push(layer((_x, _y, i) => grown[i]))
    depth.close?.()
    prepared.set(key, { layers, w, h })
    redraw?.()
  })().catch((e) => { console.warn('3D photo failed', e); prepared.delete(key) })
  return null
}

/** Each value becomes the largest within `r` pixels (a wider mask). */
function dilate(a: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, a[y * w + k])
    tmp[y * w + x] = m
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let m = 0
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x])
    out[y * w + x] = m
  }
  return out
}

/** Waits until a photo's layers are ready (export). */
export async function preparePhoto3d(key: string, img: CanvasImageSource, iw: number, ih: number, depthUrl: string) {
  for (let i = 0; i < 200; i++) {
    const p = layersFor(key, img, iw, ih, depthUrl)
    if (p) return
    await new Promise((r) => setTimeout(r, 25))
  }
}

const ease = (x: number) => x * x * (3 - 2 * x)

/** Camera move for a layer of depth `d` (0 far .. 1 near) at `p` (0..1 through the clip). */
function cameraAt(fx: Photo3D, d: number, p: number) {
  const a = fx.amount
  const e = ease(Math.min(1, Math.max(0, p)))
  const depth = 0.25 + d // near layers move more
  let s = 1.06, dx = 0, dy = 0
  switch (fx.motion) {
    case 'in': s = 1.04 + a * 0.22 * e * depth; break
    case 'out': s = 1.04 + a * 0.22 * (1 - e) * depth; break
    case 'left': dx = a * 0.05 * (0.5 - e) * 2 * depth; s = 1.08 + a * 0.05 * d; break
    case 'right': dx = -a * 0.05 * (0.5 - e) * 2 * depth; s = 1.08 + a * 0.05 * d; break
    case 'up': dy = a * 0.05 * (0.5 - e) * 2 * depth; s = 1.08 + a * 0.05 * d; break
    case 'orbit': dx = Math.sin(e * Math.PI * 2) * a * 0.035 * depth; dy = -Math.cos(e * Math.PI * 2) * a * 0.02 * depth; s = 1.07 + a * 0.04 * d; break
  }
  return { s, dx, dy }
}

/**
 * Draws a photo with 3D motion into the frame: like a fill/fit placement of the photo (sx..sh: the part of the
 * photo shown, `scale`: photo pixels to frame pixels), then each layer moved by the camera.
 */
export function drawPhoto3d(c: Ctx, key: string, img: CanvasImageSource, iw: number, ih: number, fx: Photo3D, p: number,
  W: number, H: number, crop: { x: number; y: number; w: number; h: number }, scale: number, redraw?: (() => void) | null): boolean {
  const pre = layersFor(key, img, iw, ih, fx.depth, redraw)
  if (!pre) return false
  const k = pre.w / iw
  const sx = crop.x * pre.w, sy = crop.y * pre.h, sw = crop.w * pre.w, sh = crop.h * pre.h
  const dw = (sw / k) * scale, dh = (sh / k) * scale
  pre.layers.forEach((layer, i) => {
    const cam = cameraAt(fx, LEVELS[i] + (i ? 0.1 : 0), p)
    c.save()
    c.translate(W / 2 + cam.dx * W, H / 2 + cam.dy * H)
    c.scale(cam.s, cam.s)
    c.drawImage(layer, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)
    c.restore()
  })
  return true
}

/** Readies the 3D layers of every 3D photo in a project, so the export has them from the first frame. */
export async function prepare3d(p: Project, sources: Record<string, MediaSource>) {
  for (const c of p.clips) {
    const src = sources[c.sourceId]
    if (!c.photo3d || !src || src.kind !== 'image') continue
    const bmp = await createImageBitmap(src.file).catch(() => null)
    if (bmp) await preparePhoto3d(photo3dKey(c.sourceId, c.photo3d), bmp, bmp.width, bmp.height, c.photo3d.depth)
  }
}

/** Cache key of a photo's 3D layers. */
export const photo3dKey = (sourceId: string, fx: Photo3D) => `3d:${sourceId}:${hash(fx.depth)}`

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36) + s.length
}
