/**
 * Beat finding for music, on the device. The sound is turned into an "onset" curve (how suddenly the spectrum
 * gets louder, 100 times a second); the tempo is the repeat that curve likes best (70–180 BPM, leaning towards
 * ~120), and the beats then follow the curve's peaks one by one, so a song that drifts a little is still followed.
 */
import type { AudioLayer, MediaSource, Project } from '../types'
import { decodeMono } from './visualizer'

const RATE = 16000
const HOP = 160 // 100 frames a second
const FFT = 512
// a hit first shows in the frame whose window starts ~2 window-quarters before it
const LAG = 0.02

export interface Beats { bpm: number; beats: number[] /* source seconds */ }

/** Removes the slowly moving level so only sudden hits stay. */
function highPass(env: Float32Array, half = 25) {
  const n = env.length
  const out = new Float32Array(n)
  let sum = 0
  for (let i = 0; i < Math.min(n, half); i++) sum += env[i]
  for (let i = 0; i < n; i++) {
    if (i + half < n) sum += env[i + half]
    if (i - half - 1 >= 0) sum -= env[i - half - 1]
    const c = Math.min(n, i + half + 1) - Math.max(0, i - half)
    out[i] = Math.max(0, env[i] - sum / c)
  }
  return out
}

const norm = (a: Float32Array) => {
  let m = 0
  for (const v of a) m += v
  m = m / Math.max(1, a.length) || 1
  return a.map((v) => v / m)
}

/**
 * Onset strength per 10 ms frame (spectral flux on a log scale): `all` over the whole spectrum (for the tempo)
 * and `low` for the bass and kick drum, which usually sit on the beat (for where the beats fall).
 */
export function onsetCurve(pcm: Float32Array): { all: Float32Array; low: Float32Array } {
  const frames = Math.max(0, Math.floor((pcm.length - FFT) / HOP))
  const all = new Float32Array(frames), low = new Float32Array(frames)
  const win = new Float32Array(FFT).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1)))
  const re = new Float32Array(FFT), im = new Float32Array(FFT)
  const bins = FFT / 2
  const lowTop = 8 // below ~250 Hz
  let prev = new Float32Array(bins), cur = new Float32Array(bins)
  for (let f = 0; f < frames; f++) {
    const off = f * HOP
    for (let i = 0; i < FFT; i++) { re[i] = pcm[off + i] * win[i]; im[i] = 0 }
    fft(re, im)
    let a = 0, l = 0
    for (let k = 1; k < bins; k++) {
      const m = Math.log1p(100 * Math.hypot(re[k], im[k]))
      cur[k] = m
      const d = m - prev[k]
      if (d > 0) { a += d; if (k < lowTop) l += d }
    }
    all[f] = a; low[f] = l
    ;[prev, cur] = [cur, prev]
  }
  return { all: norm(highPass(all)), low: norm(highPass(low)) }
}

/** Beat times (seconds) from an onset curve at 100 frames a second. */
export function trackBeats(curves: { all: Float32Array; low: Float32Array }): Beats {
  const env = curves.all
  const n = env.length
  // where beats fall: mostly the kick and bass (hi-hats and claps often sit between beats)
  const hit = env.map((v, i) => 0.25 * v + curves.low[i])
  if (n < 300) return { bpm: 0, beats: [] }
  // tempo: autocorrelation of the curve over beat lengths 0.33 s (180 BPM) to 0.86 s (70 BPM)
  const minL = 33, maxL = 86
  let best = 0, bestL = 50
  const score = new Float32Array(maxL + 2)
  for (let L = minL; L <= maxL + 1; L++) {
    let s = 0
    for (let i = L; i < n; i++) s += env[i] * env[i - L]
    score[L] = s / (n - L)
  }
  for (let L = minL; L <= maxL; L++) {
    const bpm = 6000 / L
    const lean = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2)) // prefer ~120 BPM when unsure
    // a real beat length also repeats at twice its length
    const s = (score[L] + 0.5 * (score[Math.min(maxL + 1, L * 2)] ?? 0)) * lean
    if (s > best) { best = s; bestL = L }
  }
  // finer beat length from the neighbours
  const a = score[bestL - 1] ?? 0, b = score[bestL], c = score[bestL + 1] ?? 0
  const den = a - 2 * b + c
  const L = bestL + (den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0)
  // the beats: the path through the hits that scores most, each step close to one beat length (dynamic programming,
  // as in Ellis 2007), so a little drift or a missing hit doesn't throw it off
  let mean = 0
  for (const v of hit) mean += v
  mean /= n
  let sd = 0
  for (const v of hit) sd += (v - mean) ** 2
  sd = Math.sqrt(sd / n) || 1
  const local = hit.map((v) => v / sd)
  const alpha = 400
  const path = new Float32Array(n)
  const back = new Int32Array(n).fill(-1)
  const lo = Math.round(L / 2), hi = Math.round(L * 2)
  for (let t = 0; t < n; t++) {
    let best = -Infinity, from = -1
    for (let q = t - hi; q <= t - lo; q++) {
      if (q < 0) continue
      const v = path[q] - alpha * Math.log((t - q) / L) ** 2
      if (v > best) { best = v; from = q }
    }
    if (from >= 0 && best > 0) { path[t] = local[t] + best; back[t] = from } else path[t] = local[t]
  }
  // start from the best-scoring frame near the end and walk back
  let end = n - 1
  for (let t = Math.max(0, n - Math.round(L)); t < n; t++) if (path[t] > path[end]) end = t
  const frames: number[] = []
  for (let t = end; t >= 0; t = back[t]) frames.push(t)
  frames.reverse()
  // the walk may begin late (quiet intro): fill backwards with the beat length
  while (frames.length && frames[0] - L >= 0) frames.unshift(Math.round(frames[0] - L))
  const beats = frames.map((f) => Math.max(0, f / 100 + LAG))
  return { bpm: Math.round(6000 / L), beats }
}

const cache = new Map<string, Promise<Beats | null>>()

/** Finds the beats of a music file (cached per file). */
export function findBeats(src: MediaSource): Promise<Beats | null> {
  let p = cache.get(src.id)
  if (!p) {
    p = decodeMono(src.file, RATE, src.duration).then((pcm) => (pcm ? trackBeats(onsetCurve(pcm)) : null)).catch(() => null)
    cache.set(src.id, p)
  }
  return p
}

/** Timeline times of an audio layer's beats (every `every`-th one), inside the layer. */
export function layerBeats(l: AudioLayer, every = 1): number[] {
  if (!l.beats?.length) return []
  const sp = l.speed ?? 1
  const out: number[] = []
  l.beats.forEach((b, i) => {
    if (i % every) return
    const t = l.start + (b - l.in) / sp
    if (t >= l.start - 1e-3 && t <= l.end + 1e-3) out.push(t)
  })
  return out
}

/** The music whose beats drive the beat effects: the chosen layer, else the first audio layer with beats. */
export function beatLayer(p: Project): AudioLayer | null {
  const fx = p.beatFx
  const list = p.layers.filter((l): l is AudioLayer => l.type === 'audio' && !!l.beats?.length)
  return list.find((l) => l.id === fx?.layer) ?? list[0] ?? null
}

/**
 * How strongly the beat effect hits at time t: 1 right on a beat, fading out over `decay` seconds. Cached per
 * project beats list so preview and export look the same.
 */
export function beatPulse(times: number[], t: number, decay = 0.22) {
  // binary search for the last beat at or before t
  let lo = 0, hi = times.length - 1, k = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (times[m] <= t) { k = m; lo = m + 1 } else hi = m - 1
  }
  if (k < 0) return 0
  const d = t - times[k]
  return d > decay * 3 ? 0 : Math.exp(-d / decay)
}

/** In-place radix-2 FFT. */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr; im[b] = im[a] - ti
        re[a] += tr; im[a] += ti
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}
