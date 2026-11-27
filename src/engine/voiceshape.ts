/**
 * Gives one AI voice several "people". Each character's lines get their own pitch (higher or deeper) and their own
 * pace, set apart: the pitch is moved without making the line faster or slower (WSOLA time-stretch, then resampling),
 * so a deep voice does not drag and a high voice does not sound sped up. Then a short gap of silence is added so the
 * talk breathes. Pure sample maths, works offline.
 */

const okFactor = (f: number) => (Number.isFinite(f) && f > 0.5 && f < 2 ? f : 1)

/** Resamples by `factor` (1.1 = 10% higher and faster, 0.9 = deeper and slower) with linear interpolation. */
export function resample(samples: Float32Array, factor: number): Float32Array {
  const f = okFactor(factor)
  if (f === 1 || !samples.length) return samples
  const n = Math.max(1, Math.floor(samples.length / f))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i * f
    const a = Math.floor(x)
    const b = Math.min(samples.length - 1, a + 1)
    const t = x - a
    out[i] = samples[a] * (1 - t) + samples[b] * t
  }
  return out
}

/**
 * Changes the pace without changing the pitch (WSOLA: overlapping 30 ms pieces, each one placed where it lines up best
 * with the last, so the waves join without clicks). `tempo` 1.25 = 25% faster (shorter), 0.8 = slower (longer).
 */
export function stretchTempo(x: Float32Array, rate: number, tempo: number): Float32Array {
  const tp = okFactor(tempo)
  if (Math.abs(tp - 1) < 0.005 || x.length < 64) return x
  const N = Math.max(32, Math.round(rate * 0.03) & ~1) // piece length
  const Hs = N >> 1 // pieces overlap by half in the output
  const Ha = Hs * tp // and are taken this far apart in the input
  const tol = Math.max(4, Math.round(rate * 0.006)) // how far a piece may move to line up
  const outLen = Math.max(1, Math.round(x.length / tp))
  const out = new Float32Array(outLen + N)
  const norm = new Float32Array(outLen + N)
  const win = new Float32Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)
  const last = Math.max(0, x.length - N)
  const at = (i: number) => (i >= 0 && i < x.length ? x[i] : 0)
  let prev = 0
  for (let k = 0; k * Hs < outLen; k++) {
    let pos = Math.min(last, Math.round(k * Ha))
    if (k > 0) {
      // the piece that would naturally follow the last one: find the nearby spot that looks most like it
      const want = prev + Hs
      let best = pos
      let bestScore = -Infinity
      for (let d = -tol; d <= tol; d++) {
        const p = pos + d
        if (p < 0 || p > last) continue
        let s = 0
        for (let i = 0; i < Hs; i += 3) s += at(p + i) * at(want + i)
        if (s > bestScore) { bestScore = s; best = p }
      }
      pos = best
    }
    const o = k * Hs
    for (let i = 0; i < N; i++) { out[o + i] += at(pos + i) * win[i]; norm[o + i] += win[i] }
    prev = pos
  }
  const res = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) res[i] = norm[i] > 1e-3 ? out[i] / norm[i] : out[i]
  return res
}

/**
 * Moves the pitch by `pitch` (1.12 = higher, 0.9 = deeper) and the pace by `tempo`, each on its own: stretch first,
 * then resample, so the length only follows `tempo`.
 */
export function pitchShift(samples: Float32Array, rate: number, pitch: number, tempo = 1): Float32Array {
  const p = okFactor(pitch)
  const tp = okFactor(tempo)
  if (p === 1) return stretchTempo(samples, rate, tp)
  return resample(stretchTempo(samples, rate, tp / p), p)
}

/** Adds `secs` of silence at the end. */
export function padEnd(samples: Float32Array, rate: number, secs: number): Float32Array {
  const extra = Math.max(0, Math.round(secs * rate))
  if (!extra) return samples
  const out = new Float32Array(samples.length + extra)
  out.set(samples)
  return out
}

/** A character's line: pitch and pace shaped, then followed by a pause. */
export function shapeLine(samples: Float32Array, rate: number, pitch: number, pause: number, tempo = 1): Float32Array {
  return padEnd(pitchShift(samples, rate, pitch, tempo), rate, pause)
}

/** The same on a browser AudioBuffer (mono). */
export function shapeBuffer(b: AudioBuffer, pitch: number, pause: number, tempo = 1): AudioBuffer {
  const out = shapeLine(b.getChannelData(0), b.sampleRate, pitch, pause, tempo)
  const nb = new AudioBuffer({ length: Math.max(1, out.length), numberOfChannels: 1, sampleRate: b.sampleRate })
  nb.copyToChannel(new Float32Array(out), 0)
  return nb
}

/** How loud the voice is at each frame (0..1), for a speaking avatar: `fps` values a second, smoothed. */
export function loudness(samples: Float32Array, rate: number, fps: number): Float32Array {
  const step = Math.max(1, Math.round(rate / fps))
  const n = Math.ceil(samples.length / step)
  const out = new Float32Array(n)
  let peak = 1e-4
  for (let f = 0; f < n; f++) {
    let s = 0
    const a = f * step
    const b = Math.min(samples.length, a + step)
    for (let i = a; i < b; i++) s += samples[i] * samples[i]
    out[f] = Math.sqrt(s / Math.max(1, b - a))
    if (out[f] > peak) peak = out[f]
  }
  let prev = 0
  for (let f = 0; f < n; f++) {
    const v = Math.min(1, out[f] / (peak * 0.7))
    prev = v > prev ? v : prev * 0.6 + v * 0.4 // opens fast, closes softly
    out[f] = prev
  }
  return out
}
