import type { MediaSource } from '../types'
import { openReader, type FrameReader } from './frames'
import type { FrameImage } from './renderer'

/**
 * Scene detection (Premiere's "Scene edit detection", Resolve's "Scene cut detector"): finds the camera cuts
 * inside one long video, e.g. a finished film or a recording of many shots, so it can be split into its shots.
 *
 * Frames are read 8 times a second and compared by their colour spread (a histogram per channel) and by how much
 * the small grey picture changed. A cut is a big jump that stands out from the frames around it, so a fast pan or
 * a flash does not count as easily. Each cut found is then pinned to the exact frame (30 a second).
 */

const COARSE_FPS = 8
const FINE_FPS = 30
const W = 64
const BINS = 16

interface Sig { hist: Float32Array; gray: Float32Array }

let canvas: OffscreenCanvas | HTMLCanvasElement | null = null
function signature(f: FrameImage): Sig | null {
  const h = Math.max(2, Math.round((W * f.height) / Math.max(1, f.width)))
  canvas ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, h) : document.createElement('canvas')
  if (canvas.width !== W || canvas.height !== h) { canvas.width = W; canvas.height = h }
  const c = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null
  if (!c) return null
  c.drawImage(f.image, 0, 0, W, h)
  const d = c.getImageData(0, 0, W, h).data
  const hist = new Float32Array(BINS * 3)
  const gray = new Float32Array(W * h)
  const n = W * h
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    hist[(d[i] * BINS) >> 8]++
    hist[BINS + ((d[i + 1] * BINS) >> 8)]++
    hist[2 * BINS + ((d[i + 2] * BINS) >> 8)]++
    gray[p] = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255
  }
  for (let k = 0; k < hist.length; k++) hist[k] /= n
  return { hist, gray }
}

/** How different two frames look, about 0 (same) to 1 (nothing alike). */
function distance(a: Sig, b: Sig) {
  let hd = 0
  for (let k = 0; k < a.hist.length; k++) hd += Math.abs(a.hist[k] - b.hist[k])
  hd /= 6 // three channels, each at most 2
  let gd = 0
  const n = Math.min(a.gray.length, b.gray.length)
  for (let p = 0; p < n; p++) gd += Math.abs(a.gray[p] - b.gray[p])
  gd /= n
  return 0.6 * hd + 0.4 * Math.min(1, gd * 2.5)
}

const median = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

export interface SceneOptions {
  /** 0..1: higher finds softer cuts too (and more false ones). */
  sensitivity: number
  /** Shortest shot to keep, seconds. */
  minShot: number
}
export const DEFAULT_SCENE: SceneOptions = { sensitivity: 0.5, minShot: 0.8 }

/**
 * Source times (seconds, between `a` and `b`) where a new shot starts. `onProgress` gets 0..1.
 * Stops early (returning what was found) when `signal` is aborted.
 */
export async function findSceneCuts(src: MediaSource, a: number, b: number, opt: SceneOptions, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<number[]> {
  if (src.kind !== 'video') return []
  const reader = await openReader(src)
  const times: number[] = []
  const dists: number[] = []
  try {
    const n = Math.max(2, Math.floor((b - a) * COARSE_FPS))
    let prev: Sig | null = null
    for (let i = 0; i <= n; i++) {
      if (signal?.aborted) break
      const tt = Math.min(b - 0.01, a + i / COARSE_FPS)
      const f = await reader.get(tt + 0.012).catch(() => null)
      const s = f ? signature(f) : null
      if (s && prev) { times.push(tt); dists.push(distance(prev, s)) }
      if (s) prev = s
      onProgress?.(0.85 * (i / n))
    }
  } finally { reader.close() }

  // a cut stands out from its neighbours (local median) and is big enough on its own
  const floor = 0.32 - 0.22 * opt.sensitivity // 0.32 (strict) .. 0.10 (soft)
  const lift = 3.2 - 1.6 * opt.sensitivity
  const coarse: number[] = []
  for (let i = 0; i < dists.length; i++) {
    const around = [...dists.slice(Math.max(0, i - 6), i), ...dists.slice(i + 1, i + 7)]
    const base = median(around)
    if (dists[i] >= floor && dists[i] >= base * lift + 0.03 && dists[i] >= (dists[i - 1] ?? 0) && dists[i] >= (dists[i + 1] ?? 0)) {
      const tt = times[i]
      if (tt - a < opt.minShot || b - tt < opt.minShot) continue
      if (coarse.length && tt - coarse[coarse.length - 1] < opt.minShot) {
        // two cuts too close: keep the stronger one
        const j = times.indexOf(coarse[coarse.length - 1])
        if (dists[i] > dists[j]) coarse[coarse.length - 1] = tt
        continue
      }
      coarse.push(tt)
    }
  }
  if (!coarse.length || signal?.aborted) { onProgress?.(1); return coarse }

  // pin each cut to the first frame of the new shot
  const fine = await openReader(src)
  const out: number[] = []
  try {
    for (let k = 0; k < coarse.length; k++) {
      out.push(await pin(fine, coarse[k] - 1 / COARSE_FPS, coarse[k]))
      onProgress?.(0.85 + 0.15 * ((k + 1) / coarse.length))
    }
  } finally { fine.close() }
  return out
}

/** Between `from` (old shot) and `to` (new shot): the time of the first frame that belongs to the new shot. */
async function pin(r: FrameReader, from: number, to: number): Promise<number> {
  let prev: Sig | null = null
  let best = to, bestD = -1
  const steps = Math.max(1, Math.round((to - from) * FINE_FPS))
  for (let i = 0; i <= steps; i++) {
    const tt = from + i / FINE_FPS
    const f = await r.get(tt + 0.004).catch(() => null)
    const s = f ? signature(f) : null
    if (s && prev) {
      const d = distance(prev, s)
      if (d > bestD) { bestD = d; best = tt }
    }
    if (s) prev = s
  }
  return Math.round(best * 1000) / 1000
}
