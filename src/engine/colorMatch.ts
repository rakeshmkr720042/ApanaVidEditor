import type { Clip, CurvePoints, MediaLayer, MediaSource } from '../types'
import { sampleFrame } from './scopes'

/**
 * Color match (Premiere's "Color match", Resolve's "Shot match"): makes one shot's colours look like another's.
 * Each colour channel's spread of values is matched to the reference's (histogram matching), and the result is
 * written as red / green / blue tone curves, so it stays editable in the Color tool like any other curve.
 */

export type Hist = [Float64Array, Float64Array, Float64Array] // cumulative share 0..1 per value 0..255

const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('Could not read the picture'))
  img.src = url
})

/** Cumulative histograms of a set of pictures. */
export async function histOf(urls: string[]): Promise<Hist> {
  const bins = [new Float64Array(256), new Float64Array(256), new Float64Array(256)]
  let n = 0
  for (const u of urls) {
    const img = await load(u)
    const w = 96, h = Math.max(2, Math.round((96 * img.naturalHeight) / Math.max(1, img.naturalWidth)))
    const px = sampleFrame(img, w, h)
    if (!px) continue
    const d = px.data
    for (let i = 0; i < d.length; i += 4) { bins[0][d[i]]++; bins[1][d[i + 1]]++; bins[2][d[i + 2]]++; n++ }
  }
  if (!n) throw new Error('Could not read the picture')
  for (const b of bins) { let s = 0; for (let v = 0; v < 256; v++) { s += b[v]; b[v] = s / n } }
  return bins as Hist
}

/** Thumbnails of the part of the file a clip or overlay shows (the middle one for photos). */
export function thumbsOf(item: Pick<Clip, 'in' | 'out'> | Pick<MediaLayer, 'in'> & { dur: number }, src: MediaSource | undefined): string[] {
  if (!src?.thumbs.length) return []
  if (src.kind === 'image' || src.thumbs.length === 1) return [src.thumbs[0]]
  const a = item.in, b = 'out' in item ? item.out : item.in + item.dur
  const n = src.thumbs.length
  const inRange = src.thumbs.filter((_, i) => { const tt = ((i + 0.5) / n) * src.duration; return tt >= a - 1e-3 && tt <= b + 1e-3 })
  if (inRange.length) return inRange
  const mid = (a + b) / 2
  return [src.thumbs[Math.max(0, Math.min(n - 1, Math.floor((mid / Math.max(1e-6, src.duration)) * n)))]]
}

const POINTS = 7

/** Red, green and blue curves that make a picture with histogram `from` look like one with `to`; `amount` 0..1. */
export function matchCurves(from: Hist, to: Hist, amount: number): { r: CurvePoints; g: CurvePoints; b: CurvePoints } {
  const curve = (f: Float64Array, tt: Float64Array): CurvePoints => {
    const pts: CurvePoints = []
    let prev = 0
    for (let k = 0; k < POINTS; k++) {
      const x = k / (POINTS - 1)
      const v = Math.round(x * 255)
      // share of the picture at or below this value, and where the reference reaches the same share
      const q = k === 0 ? 0 : k === POINTS - 1 ? 1 : f[v]
      let r = 0
      while (r < 255 && tt[r] < q) r++
      let y = k === 0 ? Math.min(r, 255) / 255 : r / 255
      // keep the change gentle near the ends (a few stray pixels must not throw the whole curve)
      y = x + (y - x) * amount
      y = Math.max(prev, Math.min(1, Math.max(0, y)))
      prev = y
      pts.push([x, Number(y.toFixed(4))])
    }
    return pts
  }
  return { r: curve(from[0], to[0]), g: curve(from[1], to[1]), b: curve(from[2], to[2]) }
}
