/**
 * Motion tools that look at how the picture moves: shake removal (stabilize) and following an object (tracking),
 * both by matching small patches of a frame in the next frame, on small grey copies of the frames.
 */
import type { MediaSource, Stabilize } from '../types'
import { openReader } from './frames'

type Img = CanvasImageSource

export interface Gray { d: Float32Array; w: number; h: number }

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null
/** A small grey copy of a picture, `w` pixels wide. */
export function toGray(img: Img, iw: number, ih: number, w: number): Gray {
  const h = Math.max(8, Math.round((w * ih) / iw))
  scratch ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas')
  if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h }
  const c = scratch.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  c.drawImage(img, 0, 0, w, h)
  const px = c.getImageData(0, 0, w, h).data
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
  return { d, w, h }
}

/** A square patch (side 2·half+1) of a grey picture centred at (cx, cy), with its mean taken out. */
export function patchAt(g: Gray, cx: number, cy: number, half: number) {
  const n = 2 * half + 1
  const p = new Float32Array(n * n)
  let m = 0
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sx = Math.min(g.w - 1, Math.max(0, Math.round(cx) - half + x)), sy = Math.min(g.h - 1, Math.max(0, Math.round(cy) - half + y))
    const v = g.d[sy * g.w + sx]
    p[y * n + x] = v; m += v
  }
  m /= n * n
  let e = 0
  for (let i = 0; i < p.length; i++) { p[i] -= m; e += p[i] * p[i] }
  return { p, half, energy: Math.sqrt(e) }
}

/**
 * Where a patch is in `g`, searched within `r` pixels of (cx, cy): best normalised cross-correlation (1 = same
 * picture). The match is refined to a fraction of a pixel.
 */
export function findPatch(g: Gray, t: ReturnType<typeof patchAt>, cx: number, cy: number, r: number, step = 1) {
  const { p, half, energy } = t
  const n = 2 * half + 1
  let best = -2, bx = cx, by = cy
  const scores = new Map<number, number>()
  const score = (ox: number, oy: number) => {
    const key = ox * 100000 + oy
    const hit = scores.get(key)
    if (hit !== undefined) return hit
    const x0 = Math.round(cx) + ox - half, y0 = Math.round(cy) + oy - half
    if (x0 < 0 || y0 < 0 || x0 + n > g.w || y0 + n > g.h) { scores.set(key, -2); return -2 }
    let m = 0
    for (let y = 0; y < n; y += step) for (let x = 0; x < n; x += step) m += g.d[(y0 + y) * g.w + x0 + x]
    const cnt = Math.ceil(n / step) ** 2
    m /= cnt
    let num = 0, e = 0
    for (let y = 0; y < n; y += step) for (let x = 0; x < n; x += step) {
      const v = g.d[(y0 + y) * g.w + x0 + x] - m
      num += v * p[y * n + x]; e += v * v
    }
    const s = energy > 1e-3 && e > 1e-3 ? num / (Math.sqrt(e) * energy * (step > 1 ? Math.sqrt(cnt / (n * n)) : 1)) : -1
    scores.set(key, s)
    return s
  }
  // coarse search every 2 pixels, then the pixels round the best one
  for (let oy = -r; oy <= r; oy += 2) for (let ox = -r; ox <= r; ox += 2) {
    const s = score(ox, oy)
    if (s > best) { best = s; bx = ox; by = oy }
  }
  const cbx = bx, cby = by
  for (let oy = cby - 1; oy <= cby + 1; oy++) for (let ox = cbx - 1; ox <= cbx + 1; ox++) {
    const s = score(ox, oy)
    if (s > best) { best = s; bx = ox; by = oy }
  }
  // sub-pixel: a parabola through the neighbours
  const sub = (a: number, b: number, c: number) => { const d = a - 2 * b + c; return d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0 }
  const fx = sub(score(bx - 1, by), best, score(bx + 1, by)), fy = sub(score(bx, by - 1), best, score(bx, by + 1))
  return { x: Math.round(cx) + bx + fx, y: Math.round(cy) + by + fy, score: best }
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0 }

/**
 * How the camera moved over a video's `[a, b]` seconds: 15 looks a second, each comparing a grid of patches with
 * the frame before; the middle (median) of their movements is the camera's, so a person walking through doesn't
 * count. Returns the path in fractions of the frame.
 */
export async function findShake(src: MediaSource, a: number, b: number, onProgress?: (p: number) => void): Promise<Omit<Stabilize, 'strength'> | null> {
  const fps = 15
  const n = Math.max(2, Math.floor((b - a) * fps) + 1)
  const reader = await openReader(src).catch(() => null)
  if (!reader) return null
  const W = 192
  const x: number[] = [0], y: number[] = [0]
  let prev: Gray | null = null
  try {
    for (let i = 0; i < n; i++) {
      const f = await reader.get(a + i / fps + 0.012) // a little past the frame start, so seeking lands on it
      if (!f) { if (i) { x.push(x[i - 1]); y.push(y[i - 1]) } continue }
      const g = toGray(f.image, f.width, f.height, W)
      if (prev) {
        const mx: number[] = [], my: number[] = []
        const half = 10, r = 14
        for (let gy = 1; gy <= 3; gy++) for (let gx = 1; gx <= 4; gx++) {
          const cx = (gx / 5) * g.w, cy = (gy / 4) * g.h
          const t = patchAt(prev, cx, cy, half)
          if (t.energy < 40) continue // flat sky or wall: nothing to follow
          const m = findPatch(g, t, cx, cy, r)
          if (m.score > 0.6) { mx.push(m.x - cx); my.push(m.y - cy) }
        }
        const dx = mx.length >= 3 ? median(mx) : 0, dy = my.length >= 3 ? median(my) : 0
        x.push(x[x.length - 1] + dx / g.w); y.push(y[y.length - 1] + dy / g.h)
      }
      prev = g
      onProgress?.((i + 1) / n)
    }
  } finally { reader.close() }
  return { fps, from: a, x, y }
}

interface Smooth { dx: Float32Array; dy: Float32Array; zoom: number }
const smoothCache = new WeakMap<Stabilize, Smooth>()

/** The shake to take back at each sample (smooth path minus real path) and the zoom that hides the edges. */
function smoothed(s: Stabilize): Smooth {
  const hit = smoothCache.get(s)
  if (hit) return hit
  const n = s.x.length
  const sigma = (0.25 + s.strength * 1.75) * s.fps
  const r = Math.ceil(sigma * 2.5)
  const wts = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-0.5 * ((i - r) / sigma) ** 2))
  const dx = new Float32Array(n), dy = new Float32Array(n)
  let mx = 0, my = 0
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, sw = 0
    for (let k = -r; k <= r; k++) {
      const j = Math.min(n - 1, Math.max(0, i + k))
      const w = wts[k + r]
      sx += s.x[j] * w; sy += s.y[j] * w; sw += w
    }
    dx[i] = sx / sw - s.x[i]; dy[i] = sy / sw - s.y[i]
    mx = Math.max(mx, Math.abs(dx[i])); my = Math.max(my, Math.abs(dy[i]))
  }
  // zoom so a move of the largest shake still covers the frame, at most 25 %
  let zoom = 1 + 2 * Math.max(mx, my)
  if (zoom > 1.25) {
    const k = 0.25 / (zoom - 1)
    for (let i = 0; i < n; i++) { dx[i] *= k; dy[i] *= k }
    zoom = 1.25
  }
  const out = { dx, dy, zoom: Math.max(1, zoom * 1.01) }
  smoothCache.set(s, out)
  return out
}

/** How far to move the frame (fractions of the frame) and zoom it at source time `t`. */
export function stabAt(s: Stabilize, t: number): { dx: number; dy: number; zoom: number } {
  const m = smoothed(s)
  const f = Math.min(m.dx.length - 1, Math.max(0, (t - s.from) * s.fps))
  const i = Math.floor(f), k = f - i, j = Math.min(m.dx.length - 1, i + 1)
  return { dx: m.dx[i] + (m.dx[j] - m.dx[i]) * k, dy: m.dy[i] + (m.dy[j] - m.dy[i]) * k, zoom: m.zoom }
}
