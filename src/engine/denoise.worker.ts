/// <reference lib="webworker" />
// The heavy part of noise removal, off the main thread:
//  - RNNoise (xiph.org's small recurrent network for speech), model inside the module so it works offline;
//  - a spectral noise reducer for steady noise (fan, hiss, AC, room tone) that keeps music: it learns the
//    noise from the quietest moments and turns down each frequency that is no louder than that noise.
import createRNNWasmModuleSync from '@jitsi/rnnoise-wasm/dist/rnnoise-sync.js'

export interface SpectralOpts { over: number; floorDb: number } // how far over the noise profile counts as noise, lowest gain
export interface DenoiseJob { id: number; channels: Float32Array[]; rnn: number; spectral: SpectralOpts | null } // rnn: 0 = off, else wet mix
export type DenoiseReply =
  | { id: number; progress: number }
  | { id: number; channels: Float32Array[]; vad: Float32Array | null }
  | { id: number; error: string }

const FRAME = 480 // 10 ms at 48 kHz, the only size RNNoise takes
const SCALE = 32768 // RNNoise works on 16-bit sample values
const LAG = 2 // RNNoise's output comes out two frames after its input

interface RnnModule {
  ready?: Promise<unknown>
  HEAPF32: Float32Array
  _malloc(n: number): number
  _free(p: number): void
  _rnnoise_create(model: number): number
  _rnnoise_destroy(st: number): void
  _rnnoise_process_frame(st: number, out: number, inp: number): number
}

let mod: Promise<RnnModule> | null = null
const load = () => (mod ??= (async () => {
  const m = createRNNWasmModuleSync() as RnnModule
  await m.ready
  return m
})())

function rnnoise(m: RnnModule, x: Float32Array, mix: number, vad: Float32Array, tick: (p: number) => void) {
  const st = m._rnnoise_create(0)
  const buf = m._malloc(FRAME * 4)
  const out = new Float32Array(x.length)
  const frames = vad.length
  try {
    for (let f = 0; f < frames + LAG; f++) {
      const heap = m.HEAPF32.subarray(buf >> 2, (buf >> 2) + FRAME) // re-read: the heap can grow
      const a = f * FRAME
      for (let i = 0; i < FRAME; i++) heap[i] = (a + i < x.length ? x[a + i] : 0) * SCALE
      const p = m._rnnoise_process_frame(st, buf, buf)
      const res = m.HEAPF32.subarray(buf >> 2, (buf >> 2) + FRAME)
      if (f >= LAG) {
        const o = a - LAG * FRAME
        for (let i = 0; i < FRAME && o + i < x.length; i++) out[o + i] = (res[i] / SCALE) * mix + x[o + i] * (1 - mix)
      }
      if (f < frames) vad[f] = Math.max(vad[f], p)
      if ((f & 1023) === 0) tick(f / frames)
    }
  } finally {
    m._free(buf)
    m._rnnoise_destroy(st)
  }
  return out
}

// ---- spectral noise reducer

const N = 2048 // ~43 ms window
const HOP = N / 4
const BINS = N / 2 + 1

const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
const rev = new Uint32Array(N).map((_, i) => { let r = 0; for (let b = 1, k = i; b < N; b <<= 1, k >>= 1) r = (r << 1) | (k & 1); return r })
const cosT = new Float32Array(N / 2).map((_, i) => Math.cos((-2 * Math.PI * i) / N))
const sinT = new Float32Array(N / 2).map((_, i) => Math.sin((-2 * Math.PI * i) / N))

/** In-place complex FFT (inverse when inv, unscaled). */
function fft(re: Float32Array, im: Float32Array, inv: boolean) {
  for (let i = 0; i < N; i++) {
    const j = rev[i]
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, step = N / size
    for (let s = 0; s < N; s += size) {
      for (let k = 0; k < half; k++) {
        const wr = cosT[k * step], wi = inv ? -sinT[k * step] : sinT[k * step]
        const a = s + k, b = a + half
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr; im[b] = im[a] - ti
        re[a] += tr; im[a] += ti
      }
    }
  }
}

function spectral(x: Float32Array, o: SpectralOpts, tick: (p: number) => void) {
  const frames = Math.ceil((x.length + N) / HOP)
  const at = (f: number) => f * HOP - N // first sample of frame f (starts before 0 so every sample is covered 4 times)
  const re = new Float32Array(N), im = new Float32Array(N)
  const load = (f: number) => {
    const a = at(f)
    for (let i = 0; i < N; i++) { const s = a + i; re[i] = s >= 0 && s < x.length ? x[s] * win[i] : 0; im[i] = 0 }
    fft(re, im, false)
  }
  // 1. the noise profile: in each frequency, the level it drops to in its quieter moments. Noise is always there,
  // speech and music come and go, so a low percentile over time is the noise (scaled up to its average).
  const whole = Math.max(0, Math.floor((x.length - N) / HOP) + 1) // frames fully inside the sound
  if (!whole) return x
  const take = Math.min(whole, 3000)
  const spec = new Float32Array(take * BINS)
  for (let n = 0; n < take; n++) {
    const f = Math.floor((n * whole) / take) + N / HOP // frame index whose start is (f * HOP - N) >= 0
    load(f)
    const row = spec.subarray(n * BINS, (n + 1) * BINS)
    for (let b = 0; b < BINS; b++) row[b] = re[b] * re[b] + im[b] * im[b]
    if ((n & 255) === 0) tick((0.3 * n) / take)
  }
  const noise = new Float64Array(BINS)
  const col = new Float32Array(take)
  for (let b = 0; b < BINS; b++) {
    for (let n = 0; n < take; n++) {
      const r = n * BINS
      col[n] = (spec[r + Math.max(0, b - 1)] + 2 * spec[r + b] + spec[r + Math.min(BINS - 1, b + 1)]) / 4
    }
    col.sort()
    noise[b] = col[Math.floor(take * 0.2)] / 0.39 // 20th percentile of noise is 0.39 of its mean
  }

  // 2. per frame and frequency: keep what is clearly louder than the noise, turn down the rest
  const out = new Float32Array(x.length)
  const floor = Math.pow(10, o.floorDb / 20)
  const thresh = new Float64Array(BINS).map((_, b) => noise[b] * o.over)
  const gain = new Float32Array(BINS).fill(1)
  const raw = new Float32Array(BINS), prev = new Float32Array(BINS).fill(1), held = new Float32Array(BINS)
  for (let f = 0; f < frames; f++) {
    load(f)
    for (let b = 0; b < BINS; b++) {
      const p = re[b] * re[b] + im[b] * im[b]
      // Wiener-style: how much of this bin's power is more than the noise
      const g = p > 0 ? Math.max(floor, Math.min(1, Math.sqrt(Math.max(0, p - thresh[b]) / p))) : floor
      // a bin counts as sound only when it stands out in two frames running; a single noise spike doesn't open it
      held[b] = Math.min(g, prev[b])
      prev[b] = g
    }
    for (let b = 0; b < BINS; b++) {
      // smooth across neighbouring frequencies (less "musical noise"), then over time: open fast, close slowly
      raw[b] = (held[Math.max(0, b - 1)] + held[b] * 2 + held[Math.min(BINS - 1, b + 1)]) / 4
      gain[b] += (raw[b] - gain[b]) * (raw[b] > gain[b] ? 0.7 : 0.3)
    }
    for (let b = 0; b < BINS; b++) {
      re[b] *= gain[b]; im[b] *= gain[b]
      if (b > 0 && b < N / 2) { re[N - b] = re[b]; im[N - b] = -im[b] }
    }
    fft(re, im, true)
    const a = at(f)
    // Hann in and out at 4x overlap sums to 1.5 N (N from the unscaled inverse)
    for (let i = 0; i < N; i++) { const s = a + i; if (s >= 0 && s < x.length) out[s] += (re[i] * win[i]) / (1.5 * N) }
    if ((f & 511) === 0) tick(0.3 + (0.7 * f) / frames)
  }
  return out
}

self.onmessage = async (e: MessageEvent<DenoiseJob>) => {
  const { id, channels, rnn, spectral: sp } = e.data
  try {
    const m = rnn > 0 ? await load() : null
    const vad = m ? new Float32Array(Math.ceil((channels[0]?.length ?? 0) / FRAME)) : null
    const steps = channels.length * ((m ? 1 : 0) + (sp ? 1 : 0)) || 1
    let step = 0
    const tick = (p: number) => self.postMessage({ id, progress: Math.min(1, (step + p) / steps) } satisfies DenoiseReply)
    const out = channels.map((ch) => {
      let y = ch
      if (m) { y = rnnoise(m, y, rnn, vad!, tick); step++ }
      if (sp) { y = spectral(y, sp, tick); step++ }
      return y
    })
    self.postMessage({ id, channels: out, vad } satisfies DenoiseReply, out.map((c) => c.buffer) as Transferable[])
  } catch (err) {
    self.postMessage({ id, error: String(err) } satisfies DenoiseReply)
  }
}
