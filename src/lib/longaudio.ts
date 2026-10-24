import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { FFFSType } from '@ffmpeg/ffmpeg'
import { getFFmpeg, runFFmpeg } from './ffmpeg'

// Long recordings can't be unpacked in one go: decodeAudioData turns a 57 minute
// file into ~1.3 GB of samples (48 kHz stereo floats), more than a phone's browser
// may hold. These helpers let ffmpeg read the file where it lies and hand back
// only the stretch that is needed, so memory stays the size of one piece.

/** Above this length (or file size) audio is read piece by piece. */
export const LONG_SECS = 10 * 60
const LONG_BYTES = 80 * 1048576
export const isLong = (duration: number, bytes: number) => duration > LONG_SECS || bytes > LONG_BYTES

/** Shown when a recording still does not fit. */
export const TOO_BIG = 'This audio is too long for the memory on this device. Split it into parts under 30 minutes, or use the computer app.'

// ffmpeg reads the Blob in place (WORKERFS), so the file is never copied into its memory
const mounts = new WeakMap<FFmpeg, Map<Blob, string>>()
let nextMount = 1

async function mounted(blob: Blob) {
  const ff = await getFFmpeg()
  let m = mounts.get(ff)
  if (!m) { m = new Map(); mounts.set(ff, m) }
  let path = m.get(blob)
  if (!path) {
    const dir = `/long${nextMount++}`
    await ff.createDir(dir)
    await ff.mount(FFFSType.WORKERFS, { blobs: [{ name: 'in', data: blob }] }, dir)
    path = `${dir}/in`
    m.set(blob, path)
  }
  return { ff, path }
}

/**
 * Samples of [from, from + secs) of the file as one Float32Array per channel,
 * at `rate`. Null when ffmpeg can't read it.
 */
export async function decodeSpan(blob: Blob, from: number, secs: number, rate: number, channels: 1 | 2): Promise<Float32Array[] | null> {
  const { ff, path } = await mounted(blob)
  const out = `span${nextMount++}.raw`
  const { code } = await runFFmpeg([
    '-v', 'error', '-ss', from.toFixed(3), '-t', secs.toFixed(3), '-i', path, '-vn', '-ac', String(channels), '-ar', String(rate), '-f', 'f32le', out,
  ])
  if (code !== 0) { await ff.deleteFile(out).catch(() => {}); return null }
  const raw = (await ff.readFile(out)) as Uint8Array
  await ff.deleteFile(out).catch(() => {})
  const bytes = raw.byteOffset % 4 ? raw.slice() : raw
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
  if (channels === 1) return [all.slice()]
  const n = Math.floor(all.length / 2)
  const l = new Float32Array(n), r = new Float32Array(n)
  for (let i = 0; i < n; i++) { l[i] = all[2 * i]; r[i] = all[2 * i + 1] }
  return [l, r]
}

/** Length from the file's own header, without reading the sound. */
export async function probeDuration(url: string): Promise<number> {
  const a = document.createElement('audio')
  a.preload = 'metadata'
  try {
    await new Promise<void>((resolve, reject) => {
      a.onloadedmetadata = () => resolve()
      a.onerror = () => reject(new Error('unreadable'))
      a.src = url
    })
    let d = a.duration
    if (!Number.isFinite(d)) {
      // recorder files report Infinity until the end is sought
      a.currentTime = 1e7
      await new Promise<void>((resolve) => { a.onseeked = () => resolve(); setTimeout(resolve, 3000) })
      d = a.duration
    }
    return Number.isFinite(d) ? d : 0
  } catch { return 0 } finally { a.removeAttribute('src'); a.load() }
}

/** The whole file as mono samples at `rate`, read ten minutes at a time. */
export async function decodeMonoLong(blob: Blob, duration: number, rate: number, onProgress?: (p: number) => void): Promise<Float32Array | null> {
  let out: Float32Array
  try { out = new Float32Array(Math.ceil((duration + 1) * rate)) } catch { throw new Error(TOO_BIG) }
  const step = LONG_SECS
  let filled = 0
  for (let from = 0; from < duration; from += step) {
    onProgress?.(from / duration)
    const part = await decodeSpan(blob, from, step, rate, 1)
    if (!part) return from === 0 ? null : out.subarray(0, filled)
    const at = Math.round(from * rate)
    const n = Math.min(part[0].length, out.length - at)
    out.set(part[0].subarray(0, n), at)
    filled = at + n
    if (part[0].length < step * rate * 0.99) break // reached the real end
  }
  onProgress?.(1)
  return out.subarray(0, filled)
}

/** Peak levels across the file for the timeline picture, from a low-rate read (a few MB for an hour). */
export async function longPeaks(blob: Blob, width: number): Promise<Float32Array | null> {
  const part = await decodeSpan(blob, 0, 24 * 3600, 3000, 1)
  if (!part?.[0].length) return null
  const d = part[0], peaks = new Float32Array(width), step = Math.max(1, Math.floor(d.length / width))
  for (let x = 0; x < width; x++) {
    let p = 0
    for (let i = x * step; i < (x + 1) * step && i < d.length; i++) p = Math.max(p, Math.abs(d[i]))
    peaks[x] = p
  }
  return peaks
}
