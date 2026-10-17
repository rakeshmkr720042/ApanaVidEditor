import { getFFmpeg, runFFmpeg } from './ffmpeg'
import { uid } from './format'

/**
 * Turns a drawing function into a short clip. Moving parts are encoded at full frame rate and the
 * still parts at a frame a second (a still costs almost nothing), with WebCodecs, then wrapped by
 * ffmpeg without re-encoding. Used by the animated scenes (mind map steps, quiz questions).
 */

function ivf(frames: { data: Uint8Array; ms: number }[], fourcc: string, w: number, h: number): Uint8Array {
  const size = 32 + frames.reduce((s, f) => s + 12 + f.data.length, 0)
  const out = new Uint8Array(size)
  const dv = new DataView(out.buffer)
  out.set([68, 75, 73, 70]) // DKIF
  dv.setUint16(4, 0, true); dv.setUint16(6, 32, true)
  out.set([...fourcc].map((c) => c.charCodeAt(0)), 8)
  dv.setUint16(12, w, true); dv.setUint16(14, h, true)
  dv.setUint32(16, 1000, true); dv.setUint32(20, 1, true); dv.setUint32(24, frames.length, true) // millisecond timestamps
  let o = 32
  for (const f of frames) {
    dv.setUint32(o, f.data.length, true); dv.setUint32(o + 4, f.ms, true); dv.setUint32(o + 8, 0, true)
    out.set(f.data, o + 12)
    o += 12 + f.data.length
  }
  return out
}

async function pickCodec(W: number, H: number, bitrate: number) {
  if (typeof VideoEncoder === 'undefined') return null
  for (const t of [{ codec: 'vp09.00.40.08', fourcc: 'VP90', ext: 'mp4' }, { codec: 'vp8', fourcc: 'VP80', ext: 'webm' }]) {
    const r = await VideoEncoder.isConfigSupported({ codec: t.codec, width: W, height: H, bitrate, framerate: 30 }).catch(() => null)
    if (r?.supported) return t
  }
  return null
}

/** Frame times for a clip of `seconds`: every frame while something moves, one a second otherwise. */
export function frameTimes(seconds: number, moving: [number, number][], fps = 30): { t: number; still: boolean }[] {
  const out: { t: number; still: boolean }[] = []
  const inMove = (t: number) => moving.some(([a, b]) => t >= a - 1e-6 && t <= b + 1e-6)
  let t = 0
  while (t < seconds - 1 / fps) {
    const still = !inMove(t)
    out.push({ t, still })
    if (!still) { t += 1 / fps; continue }
    // a still holds until the next movement starts
    const next = moving.map(([a]) => a).filter((a) => a > t + 1e-6).sort((a, b) => a - b)[0] ?? Infinity
    t = Math.min(t + 1, next)
  }
  out.push({ t: Math.max((out[out.length - 1]?.t ?? 0) + 1 / fps, seconds - 1 / fps), still: true })
  return out
}

/**
 * Renders `draw(g, t)` into a clip of `seconds`. Returns null where the device can't encode video,
 * and the caller then uses a still picture instead.
 */
export async function renderCanvasVideo(
  W: number, H: number, seconds: number, moving: [number, number][],
  draw: (g: CanvasRenderingContext2D, t: number) => void, fps = 30,
): Promise<{ blob: Blob; ext: string } | null> {
  const bitrate = Math.round(Math.min(8e6, W * H * fps * 0.07))
  const codec = await pickCodec(W, H, bitrate)
  if (!codec) return null
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const frames: { data: Uint8Array; ms: number }[] = []
  let err: unknown = null
  const enc = new VideoEncoder({
    output: (chunk) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); frames.push({ data: d, ms: Math.round(chunk.timestamp / 1000) }) },
    error: (e) => { err = e },
  })
  enc.configure({ codec: codec.codec, width: W, height: H, bitrate, framerate: fps, latencyMode: 'quality' })
  const times = frameTimes(seconds, moving, fps)
  for (let n = 0; n < times.length; n++) {
    if (err) break
    const { t, still } = times[n]
    draw(g, t)
    const vf = new VideoFrame(c, { timestamp: Math.round(t * 1e6) })
    enc.encode(vf, { keyFrame: n === 0 || still })
    vf.close()
    while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 2))
  }
  await enc.flush().catch((e) => { err ??= e })
  enc.close()
  if (err) throw err
  frames.sort((a, b) => a.ms - b.ms)

  const ff = await getFFmpeg()
  const name = `cv-${uid()}`
  await ff.writeFile(`${name}.ivf`, ivf(frames, codec.fourcc, W, H))
  try {
    const { code } = await runFFmpeg(['-i', `${name}.ivf`, '-c', 'copy', `${name}.${codec.ext}`])
    if (code !== 0) return null
    const data = (await ff.readFile(`${name}.${codec.ext}`)) as Uint8Array
    return { blob: new Blob([data.slice().buffer], { type: `video/${codec.ext}` }), ext: codec.ext }
  } finally {
    await ff.deleteFile(`${name}.ivf`).catch(() => {})
    await ff.deleteFile(`${name}.${codec.ext}`).catch(() => {})
  }
}
