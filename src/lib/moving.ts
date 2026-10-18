import type { MovingMedia } from '../model/scenes'
import { renderCanvasVideo } from './canvasVideo'
import { getFFmpeg, runFFmpeg } from './ffmpeg'
import { uid } from './format'

/**
 * GIFs and video clips the user gives as raw material: a still to show in lists, and a clip of
 * exactly the length a scene needs (the GIF or video looped) when the scenes are placed.
 */

const isGif = (f: { type: string; name?: string }) => f.type === 'image/gif' || /\.gif$/i.test(f.name ?? '')

const jpeg = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the clip'))), 'image/jpeg', 0.9))

interface GifFrames { frames: ImageBitmap[]; ends: number[]; w: number; h: number } // ends: seconds into one play

/** Every frame of an animated GIF, or null where the browser can't decode one (it then stays still). */
async function gifFrames(blob: Blob, max = 400): Promise<GifFrames | null> {
  if (typeof ImageDecoder === 'undefined') return null
  try {
    const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/gif' })
    await dec.tracks.ready
    await dec.completed
    const n = Math.min(max, dec.tracks.selectedTrack?.frameCount ?? 1)
    const frames: ImageBitmap[] = [], ends: number[] = []
    let t = 0
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i })
      // browsers play frames marked shorter than 20 ms at 100 ms
      const d = image.duration && image.duration >= 20_000 ? image.duration / 1e6 : 0.1
      frames.push(await createImageBitmap(image))
      image.close()
      t += d
      ends.push(t)
    }
    dec.close()
    return frames.length ? { frames, ends, w: frames[0].width, h: frames[0].height } : null
  } catch { return null }
}

/** First frame and play length of a video file. */
async function videoInfo(file: Blob): Promise<{ image: Blob; length: number } | null> {
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.preload = 'auto'
  const url = URL.createObjectURL(file)
  const once = (ev: string) => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 15_000)
    v.addEventListener(ev, () => { clearTimeout(timer); resolve() }, { once: true })
    v.addEventListener('error', () => { clearTimeout(timer); reject(new Error('error')) }, { once: true })
  })
  try {
    v.src = url
    await once('loadeddata')
    const length = Number.isFinite(v.duration) ? v.duration : 0
    if (!length || !v.videoWidth) return null
    v.currentTime = Math.min(0.5, length / 3)
    await once('seeked')
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    return { image: await jpeg(c), length }
  } catch { return null } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url) }
}

/**
 * Reads a GIF or video into its still picture and what it takes to play it. A GIF with a single
 * frame (or one the browser can't decode) is just a picture: `media` is then undefined.
 */
export async function readMoving(file: File): Promise<{ image: Blob; media?: MovingMedia } | null> {
  if (isGif(file)) {
    const g = await gifFrames(file)
    g?.frames.forEach((f) => f.close())
    if (!g || g.frames.length < 2) return { image: file }
    return { image: file, media: { kind: 'gif', file, length: g.ends[g.ends.length - 1] } }
  }
  const info = await videoInfo(file)
  return info && { image: info.image, media: { kind: 'video', file, length: info.length } }
}

/** A clip of `seconds` that plays the GIF over and over, sized to fit a W×H frame. */
async function gifClip(m: MovingMedia, seconds: number, W: number, H: number) {
  const g = await gifFrames(m.file)
  if (!g) return null
  try {
    const s = Math.min(W / g.w, H / g.h)
    const w = Math.max(2, Math.round((g.w * s) / 2) * 2), h = Math.max(2, Math.round((g.h * s) / 2) * 2)
    const total = g.ends[g.ends.length - 1]
    const fps = Math.max(10, Math.min(25, Math.round(g.frames.length / total)))
    return await renderCanvasVideo(w, h, seconds, [[0, seconds]], (ctx, t) => {
      const at = t % total
      let i = g.ends.findIndex((e) => at < e)
      if (i < 0) i = g.ends.length - 1
      ctx.imageSmoothingQuality = 'high'
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(g.frames[i], 0, 0, w, h)
    }, fps)
  } finally { g.frames.forEach((f) => f.close()) }
}

/** The video itself when it is long enough, else the video repeated to `seconds` (no re-encoding). */
async function videoClip(m: MovingMedia, seconds: number) {
  const ext = /webm/.test(m.file.type) ? 'webm' : 'mp4'
  if (m.length >= seconds) return { blob: m.file, ext }
  const ff = await getFFmpeg()
  const name = `loop-${uid()}`
  await ff.writeFile(`${name}-in.${ext}`, new Uint8Array(await m.file.arrayBuffer()))
  try {
    const times = Math.ceil(seconds / Math.max(0.1, m.length))
    const { code } = await runFFmpeg(['-stream_loop', String(times), '-i', `${name}-in.${ext}`, '-t', seconds.toFixed(2), '-an', '-c', 'copy', `${name}.${ext}`])
    if (code !== 0) return null
    const data = (await ff.readFile(`${name}.${ext}`)) as Uint8Array
    return { blob: new Blob([data.slice().buffer], { type: `video/${ext}` }), ext }
  } finally {
    await ff.deleteFile(`${name}-in.${ext}`).catch(() => {})
    await ff.deleteFile(`${name}.${ext}`).catch(() => {})
  }
}

/** The moving clip for a scene of `seconds`, or null when it can't be made here (the still is used then). */
export async function movingClip(m: MovingMedia, seconds: number, W: number, H: number): Promise<{ blob: Blob; ext: string } | null> {
  try {
    return m.kind === 'gif' ? await gifClip(m, seconds, W, H) : await videoClip(m, seconds)
  } catch { return null }
}
