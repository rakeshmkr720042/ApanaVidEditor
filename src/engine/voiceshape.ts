/**
 * Gives one AI voice several "people": each character's lines are played a little faster or slower (which lifts or
 * lowers the voice), then a short gap of silence is added so the talk breathes. Pure sample maths, works offline.
 */

/** Resamples by `factor` (1.1 = 10% higher and faster, 0.9 = deeper and slower) with linear interpolation. */
export function resample(samples: Float32Array, factor: number): Float32Array {
  const f = Number.isFinite(factor) && factor > 0.5 && factor < 2 ? factor : 1
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

/** Adds `secs` of silence at the end. */
export function padEnd(samples: Float32Array, rate: number, secs: number): Float32Array {
  const extra = Math.max(0, Math.round(secs * rate))
  if (!extra) return samples
  const out = new Float32Array(samples.length + extra)
  out.set(samples)
  return out
}

/** A character's line: voice shaped, then followed by a pause. */
export function shapeLine(samples: Float32Array, rate: number, pitch: number, pause: number): Float32Array {
  return padEnd(resample(samples, pitch), rate, pause)
}

/** The same on a browser AudioBuffer (mono). */
export function shapeBuffer(b: AudioBuffer, pitch: number, pause: number): AudioBuffer {
  const out = shapeLine(b.getChannelData(0), b.sampleRate, pitch, pause)
  const nb = new AudioBuffer({ length: out.length, numberOfChannels: 1, sampleRate: b.sampleRate })
  nb.copyToChannel(new Float32Array(out), 0)
  return nb
}
