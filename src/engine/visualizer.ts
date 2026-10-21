import type { MediaSource, WaveLayer } from '../types'
import { TOO_BIG, decodeMonoLong, isLong } from '../lib/longaudio'

/**
 * Audio visualizer for wave layers: the sound is analysed once (loudness in 48 frequency bands,
 * 30 times a second) and every frame is drawn from that, so preview and export look the same.
 */
export interface WaveData {
  fps: number
  bands: number
  frames: number
  spec: Uint8Array // frames × bands, 0..255
  level: Uint8Array // overall loudness per frame, 0..255
}

export const WAVE_STYLES = [{ value: 'bars', label: '▮▮▮ Bars' }, { value: 'line', label: '〰 Line' }, { value: 'circle', label: '◎ Circle' }] as const

const FPS = 30
const BANDS = 48
const RATE = 16000
const FFT = 512

/**
 * Decodes a file's sound as mono at `rate` (Whisper and the visualizer both use 16 kHz).
 * Pass the length when known: long recordings are then read piece by piece.
 */
export async function decodeMono(blob: Blob, rate = RATE, duration = 0, onProgress?: (p: number) => void): Promise<Float32Array | null> {
  if (duration > 0 && isLong(duration, blob.size)) {
    const pcm = await decodeMonoLong(blob, duration, rate, onProgress).catch((e: Error) => { if (e.message === TOO_BIG) throw e; return null })
    if (pcm) return pcm
  }
  try {
    const ctx = new OfflineAudioContext(1, 1, rate)
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    if (buf.numberOfChannels === 1) return buf.getChannelData(0)
    const out = new Float32Array(buf.length)
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c)
      for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels
    }
    return out
  } catch {
    return null
  }
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

/** Band loudness per frame from 16 kHz mono samples, smoothed so the bars rise fast and fall gently. */
export async function analyse(pcm: Float32Array, rate = RATE): Promise<WaveData> {
  const hop = rate / FPS
  const frames = Math.max(1, Math.ceil(pcm.length / hop))
  const db = new Float32Array(frames * BANDS)
  const lv = new Float32Array(frames)
  const win = new Float32Array(FFT).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT - 1)))
  // log-spaced bands from 50 Hz to 7 kHz; at least one FFT bin each
  const edges: [number, number][] = []
  const hz = rate / FFT
  for (let b = 0; b < BANDS; b++) {
    const lo = 50 * Math.pow(140, b / BANDS), hi = 50 * Math.pow(140, (b + 1) / BANDS)
    const a = Math.max(1, Math.floor(lo / hz)), z = Math.max(a, Math.min(FFT / 2 - 1, Math.ceil(hi / hz)))
    edges.push([a, z])
  }
  // speech has most of its energy low down; tilt so the higher bars move too
  const tilt = edges.map(([a, z]) => 4.5 * Math.log2(Math.max(1, ((a + z) / 2) * hz) / 250))
  const re = new Float32Array(FFT), im = new Float32Array(FFT)
  for (let f = 0; f < frames; f++) {
    const at = Math.round(f * hop - FFT / 2)
    let sq = 0
    for (let i = 0; i < FFT; i++) {
      const v = pcm[at + i] ?? 0
      re[i] = v * win[i]; im[i] = 0
      sq += v * v
    }
    fft(re, im)
    for (let b = 0; b < BANDS; b++) {
      let m = 0
      for (let k = edges[b][0]; k <= edges[b][1]; k++) m = Math.max(m, re[k] * re[k] + im[k] * im[k])
      db[f * BANDS + b] = 10 * Math.log10(m + 1e-12) + tilt[b]
    }
    lv[f] = 20 * Math.log10(Math.sqrt(sq / FFT) + 1e-9)
    if (f % 3000 === 2999) await new Promise((r) => setTimeout(r, 0)) // keep the page responsive on long files
  }
  const top = (a: Float32Array) => {
    const s = a.filter((_, i) => i % 7 === 0).sort()
    return s[Math.floor(s.length * 0.995)] ?? 0
  }
  const RANGE = 48 // dB shown between silence and the loudest moments
  const specTop = top(db), lvTop = top(lv)
  const spec = new Uint8Array(frames * BANDS)
  const level = new Uint8Array(frames)
  const prev = new Float32Array(BANDS)
  let pl = 0
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < BANDS; b++) {
      const raw = Math.min(1, Math.max(0, (db[f * BANDS + b] - (specTop - RANGE)) / RANGE))
      const v = raw > prev[b] ? prev[b] + (raw - prev[b]) * 0.7 : Math.max(raw, prev[b] * 0.86)
      prev[b] = v
      spec[f * BANDS + b] = Math.round(v * 255)
    }
    const raw = Math.min(1, Math.max(0, (lv[f] - (lvTop - 40)) / 40))
    pl = raw > pl ? pl + (raw - pl) * 0.6 : Math.max(raw, pl * 0.9)
    level[f] = Math.round(pl * 255)
  }
  return { fps: FPS, bands: BANDS, frames, spec, level }
}

const cache = new Map<string, { data: WaveData | null; ready: Promise<WaveData | null> }>()

/** Analysis of a source's sound; null while it is being worked out (onReady fires when done). */
export function waveData(src: MediaSource, onReady?: () => void): WaveData | null {
  let e = cache.get(src.id)
  if (!e) {
    const entry: { data: WaveData | null; ready: Promise<WaveData | null> } = { data: null, ready: Promise.resolve(null) }
    entry.ready = decodeMono(src.file, RATE, src.duration).then((pcm) => (pcm ? analyse(pcm) : null)).then((d) => { entry.data = d; return d }).catch(() => null)
    cache.set(src.id, entry)
    e = entry
  }
  if (!e.data && onReady) void e.ready.then((d) => { if (d) onReady() })
  return e.data
}

export const waveReady = (src: MediaSource) => { waveData(src); return cache.get(src.id)!.ready }

/** Lets callers that already analysed a sound (the audio → video builder) skip doing it twice. */
export function primeWave(id: string, data: WaveData) { cache.set(id, { data, ready: Promise.resolve(data) }) }

// ---------------------------------------------------------------- drawing

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Size of a wave layer on a W×H canvas (circle: the square its ring and bars fit in). */
export function waveSize(l: Pick<WaveLayer, 'style' | 'box'>, W: number, H: number) {
  const u = Math.min(W, H)
  if (l.style === 'circle') { const s = 0.62 * u * l.box.scale; return { w: s, h: s } }
  return { w: Math.min(0.86 * W, 1.5 * u) * l.box.scale, h: 0.16 * u * l.box.scale }
}

/** Loudness of band position x (0 = lowest, 1 = highest) at a frame position, blending neighbours. */
function sampler(d: WaveData | null, local: number) {
  if (!d) return { band: () => 0, level: 0 }
  const fp = Math.max(0, Math.min(d.frames - 1, local * d.fps))
  const f0 = Math.floor(fp), f1 = Math.min(d.frames - 1, f0 + 1), k = fp - f0
  const at = (f: number, b: number) => d.spec[f * d.bands + b] / 255
  return {
    band: (x: number) => {
      const bp = Math.max(0, Math.min(d.bands - 1, x * (d.bands - 1)))
      const b0 = Math.floor(bp), b1 = Math.min(d.bands - 1, b0 + 1), j = bp - b0
      const v0 = at(f0, b0) * (1 - j) + at(f0, b1) * j
      const v1 = at(f1, b0) * (1 - j) + at(f1, b1) * j
      return v0 * (1 - k) + v1 * k
    },
    level: (d.level[f0] * (1 - k) + d.level[f1] * k) / 255,
  }
}

function mix(a: string, b: string, k: number) {
  const p = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
  const x = p(a), y = p(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`
}

// lowest sounds in the middle, highest at the edges: a symmetric shape looks calmer than a slope
const sym = (i: number, n: number) => Math.abs((i + 0.5) / n - 0.5) * 2 * 0.85

/** Draws a wave layer at local time `local` (seconds into its source). */
export function drawWave(ctx: Ctx, l: WaveLayer, data: WaveData | null, local: number, W: number, H: number) {
  const { w, h } = waveSize(l, W, H)
  const s = sampler(data, local)
  ctx.save()
  ctx.globalAlpha = l.box.opacity
  ctx.translate(l.box.x * W, l.box.y * H)
  ctx.rotate((l.box.rotation * Math.PI) / 180)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (l.style === 'bars') {
    const n = Math.max(24, Math.min(72, Math.round(w / (h * 0.16))))
    const step = w / n, bw = step * 0.62
    const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
    grad.addColorStop(0, l.color2); grad.addColorStop(0.5, l.color); grad.addColorStop(1, l.color2)
    ctx.fillStyle = grad
    for (let i = 0; i < n; i++) {
      const v = s.band(sym(i, n))
      const bh = Math.max(bw, (0.06 + 0.94 * v) * h)
      ctx.beginPath()
      ctx.roundRect(-w / 2 + i * step + (step - bw) / 2, -bh / 2, bw, bh, bw / 2)
      ctx.fill()
    }
  } else if (l.style === 'line') {
    const n = 64
    const pts: number[] = []
    for (let i = 0; i <= n; i++) {
      // taper the ends so the line meets the middle smoothly
      const edge = Math.sin((Math.PI * i) / n)
      pts.push((0.03 + 0.97 * s.band(sym(Math.min(i, n - 1), n))) * edge * (h / 2))
    }
    const x = (i: number) => -w / 2 + (w * i) / n
    const curve = (sign: number) => {
      ctx.moveTo(x(0), -sign * pts[0])
      for (let i = 1; i <= n; i++) {
        const mx = (x(i - 1) + x(i)) / 2, my = -sign * (pts[i - 1] + pts[i]) / 2
        ctx.quadraticCurveTo(x(i - 1), -sign * pts[i - 1], mx, my)
      }
      ctx.lineTo(x(n), -sign * pts[n])
    }
    ctx.beginPath(); curve(1); curve(-1)
    ctx.globalAlpha = l.box.opacity * 0.3
    ctx.fillStyle = l.color2
    ctx.fill()
    ctx.globalAlpha = l.box.opacity
    ctx.strokeStyle = l.color
    ctx.lineWidth = Math.max(2, h * 0.035)
    ctx.beginPath(); curve(1); ctx.stroke()
    ctx.beginPath(); curve(-1); ctx.stroke()
  } else {
    const r = w * 0.3, len = w * 0.2
    const n = 96
    ctx.lineWidth = Math.max(2, ((2 * Math.PI * r) / n) * 0.5)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      const v = s.band((1 - Math.abs(i / n - 0.5) * 2) * 0.85) // lowest sounds at the top, mirrored left and right
      const r1 = r + len * (0.05 + 0.95 * v)
      ctx.strokeStyle = mix(l.color, l.color2, v)
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
      ctx.stroke()
    }
    ctx.strokeStyle = l.color
    ctx.globalAlpha = l.box.opacity * (0.5 + 0.5 * s.level)
    ctx.lineWidth = Math.max(2, r * (0.03 + 0.05 * s.level))
    ctx.beginPath(); ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.restore()
}
