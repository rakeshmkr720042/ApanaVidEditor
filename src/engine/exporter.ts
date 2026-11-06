import { t } from '../lib/i18n'
import type { AspectRatio, MediaSource, Project } from '../types'
import { layoutClips } from '../model/timeline'
import { FFFSType, type FFmpeg } from '@ffmpeg/ffmpeg'
import { getFFmpeg, runFFmpeg } from '../lib/ffmpeg'
import { longMix, mixAudio } from './audiomix'
import { canEncodeLong, mixToOgg } from './longmix'
import { sleep, stayAwake } from './background'
import { openReader, type FrameReader } from './frames'
import { encodeWav } from './music'
import { backdropSource } from './chromakey'
import { loadCutout, usesCutout } from './cutout'
import { mediaNeeds } from './player'
import { prepare3d } from './photo3d'
import { outputSize, Renderer, type FrameImage } from './renderer'
import { ensureFont } from './text'

export type Format = 'mp4' | 'webm' | 'mov' | 'gif' | 'mp3'
export type Resolution = '480' | '720' | '1080' | '1440' | '2160'
/** How hard to squeeze the file: smaller files trade away some sharpness in fast motion. */
export type SizeMode = 'small' | 'balanced' | 'high'

export interface ExportJob {
  format: Format
  resolution: Resolution
  fps: number
  watermark: string | null
  cover: number | null // timeline time of the cover frame, embedded in MP4/MOV
  aspect?: AspectRatio // overrides the project's frame shape (platform presets)
  size?: SizeMode // defaults to 'high' (the old fixed bitrate)
}

export interface ExportOutput { blob: Blob; ext: string; cover: Blob | null; width: number; height: number; encoder: string }

export class Cancelled extends Error { constructor() { super('Export cancelled') } }

type Progress = (p: number, label: string) => void

function canvasFor(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  return Object.assign(document.createElement('canvas'), { width: w, height: h })
}

async function toJpeg(c: HTMLCanvasElement | OffscreenCanvas, q = 0.9): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/jpeg', quality: q })
  return new Promise((r) => (c as HTMLCanvasElement).toBlob((b) => r(b!), 'image/jpeg', q))
}

interface VideoTarget { kind: 'h264' | 'vp9' | 'vp8'; codec: string }

async function pickEncoder(format: Format, w: number, h: number, fps: number, bitrate: number): Promise<VideoTarget | null> {
  if (typeof VideoEncoder === 'undefined') return null
  const wantH264 = format === 'mp4' || format === 'mov'
  // H.264 level: 4.0 up to 1080p, 5.0 up to 2K, 5.1 for 4K (5.2 above 30 fps)
  const big = w * h > 2560 * 1600
  const level = big ? (fps > 30 ? '34' : '33') : w * h > 1920 * 1088 ? '32' : '28'
  const h264 = [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.4200${level}`].map((codec) => ({ kind: 'h264' as const, codec }))
  const vp = [{ kind: 'vp9' as const, codec: big ? (fps > 30 ? 'vp09.00.51.08' : 'vp09.00.50.08') : 'vp09.00.40.08' }, { kind: 'vp8' as const, codec: 'vp8' }]
  for (const t of wantH264 ? [...h264, ...vp] : vp) {
    const cfg: VideoEncoderConfig = { codec: t.codec, width: w, height: h, bitrate, framerate: fps, ...(t.kind === 'h264' ? { avc: { format: 'annexb' } } : {}) }
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      const r = await VideoEncoder.isConfigSupported({ ...cfg, hardwareAcceleration }).catch(() => null)
      if (r?.supported) return t
    }
  }
  return null
}

/** IVF file header (VP8/VP9 frames for ffmpeg). */
function ivfHeader(fourcc: string, w: number, h: number, fps: number, frames: number): Uint8Array {
  const out = new Uint8Array(32)
  const dv = new DataView(out.buffer)
  out.set([68, 75, 73, 70]) // DKIF
  dv.setUint16(4, 0, true); dv.setUint16(6, 32, true)
  out.set([...fourcc].map((c) => c.charCodeAt(0)), 8)
  dv.setUint16(12, w, true); dv.setUint16(14, h, true)
  dv.setUint32(16, fps, true); dv.setUint32(20, 1, true); dv.setUint32(24, frames, true)
  return out
}

/** One IVF frame: 12-byte header (size, frame number) + data. */
function ivfFrame(data: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, data.length, true); dv.setUint32(4, n, true); dv.setUint32(8, 0, true)
  out.set(data, 12)
  return out
}

/**
 * The encoded video, kept as Blobs of about 8 MB instead of one big array. The browser can move
 * Blobs out of the page's memory (to disk), which matters on phones: a 20-minute 1080p export is
 * ~500 MB, and holding it (and copies of it) in memory is what made long exports crash.
 */
export class ChunkStore {
  private parts: Blob[] = []
  private pending: Uint8Array[] = []
  private pendingBytes = 0
  count = 0
  bytes = 0
  push(d: Uint8Array) {
    this.pending.push(d)
    this.pendingBytes += d.length
    this.bytes += d.length
    this.count++
    if (this.pendingBytes >= 8 << 20) this.flush()
  }
  private flush() {
    if (!this.pending.length) return
    this.parts.push(new Blob(this.pending as BlobPart[]))
    this.pending = []
    this.pendingBytes = 0
  }
  blob(head?: Uint8Array): Blob {
    this.flush()
    return new Blob(head ? [head as BlobPart, ...this.parts] : this.parts)
  }
}

/**
 * Lets ffmpeg read these Blobs in place (WORKERFS), so big inputs are never copied into its memory.
 * Falls back to copying them in when mounting is not possible.
 */
async function withBlobs<T>(ff: FFmpeg, files: { name: string; data: Blob }[], fn: (path: (name: string) => string) => Promise<T>): Promise<T> {
  const dir = `/ex${Math.random().toString(36).slice(2, 8)}`
  await ff.createDir(dir).catch(() => {})
  let mounted = false
  if (files.length) {
    try { await ff.mount(FFFSType.WORKERFS, { blobs: files }, dir); mounted = true } catch {
      for (const f of files) await ff.writeFile(`${dir}/${f.name}`, new Uint8Array(await f.data.arrayBuffer()))
    }
  }
  try {
    return await fn((name) => `${dir}/${name}`)
  } finally {
    if (mounted) await ff.unmount(dir).catch(() => {})
    else for (const f of files) await ff.deleteFile(`${dir}/${f.name}`).catch(() => {})
    await ff.deleteDir(dir).catch(() => {})
  }
}

/** Reads ffmpeg's output file into a Blob and frees it inside ffmpeg straight away. */
async function takeFile(ff: FFmpeg, name: string, type: string): Promise<Blob> {
  const data = (await ff.readFile(name)) as Uint8Array
  await ff.deleteFile(name).catch(() => {})
  return new Blob([data as BlobPart], { type })
}

const SIZE: Record<SizeMode, { bpp: number; keySecs: number; audioK: number; vorbisQ: number; crf: number }> = {
  small: { bpp: 0.045, keySecs: 10, audioK: 96, vorbisQ: 2, crf: 28 },
  balanced: { bpp: 0.07, keySecs: 5, audioK: 128, vorbisQ: 3, crf: 25 },
  high: { bpp: 0.11, keySecs: 2, audioK: 192, vorbisQ: 5, crf: 21 },
}

/** Share of the timeline (0..1) that shows moving video; photos, slides and text cards need far fewer bits. */
export function motionShare(project: Project, sources: Record<string, MediaSource>): number {
  const { items, total } = layoutClips(project.clips)
  if (total <= 0) return 1
  const spans: [number, number][] = []
  const isMoving = (o: { sourceId: string } & Parameters<typeof backdropSource>[0]) => sources[o.sourceId]?.kind === 'video' || backdropSource(o, sources)?.kind === 'video'
  for (const it of items) if (isMoving(it.clip)) spans.push([it.start, it.start + it.dur])
  for (const l of project.layers) if (l.type === 'media' && isMoving(l)) spans.push([l.start, l.end])
  spans.sort((a, b) => a[0] - b[0])
  let moving = 0, end = 0
  for (const [a, b] of spans) {
    const s = Math.max(a, end, 0), e = Math.min(b, total)
    if (e > s) moving += e - s
    end = Math.max(end, b)
  }
  return Math.min(1, moving / total)
}

/** Target video bitrate: bits per pixel by size mode, cut down to 35% for still content. */
export function videoBitrate(w: number, h: number, fps: number, mode: SizeMode, motion: number): number {
  const fpsScale = 30 * Math.pow(fps / 30, 0.7) // doubling the frame rate needs much less than double the bits
  // 4K needs far more bits than the 16 Mbit/s that is plenty up to 2K (YouTube asks 35-45 Mbit/s for 4K)
  const cap = w * h > 2560 * 1600 ? 45e6 : 16e6
  return Math.round(Math.min(cap, w * h * fpsScale * SIZE[mode].bpp * (0.35 + 0.65 * motion)))
}

/** Rough upper estimate of the exported file size in bytes (encoders often land below it on still content); null for GIF. */
export function estimateSize(project: Project, sources: Record<string, MediaSource>, job: ExportJob): number | null {
  if (job.format === 'gif') return null
  if (job.aspect && job.aspect !== project.settings.aspect) project = { ...project, settings: { ...project.settings, aspect: job.aspect } }
  const { total } = layoutClips(project.clips)
  const mode = job.size ?? 'high'
  const audio = SIZE[mode].audioK * 1000
  if (job.format === 'mp3') return (total * audio) / 8
  const { w, h } = outputSize(project, sources, Number(job.resolution))
  return (total * (videoBitrate(w, h, job.fps, mode, motionShare(project, sources)) + audio)) / 8
}

/** Renders the project frame by frame with the same renderer as the preview, then muxes with ffmpeg. */
export async function exportProject(
  project: Project,
  sources: Record<string, MediaSource>,
  job: ExportJob,
  onProgress: Progress,
  signal?: AbortSignal,
): Promise<ExportOutput> {
  const check = () => { if (signal?.aborted) throw new Cancelled() }
  if (job.aspect && job.aspect !== project.settings.aspect) project = { ...project, settings: { ...project.settings, aspect: job.aspect } }
  const { items, total } = layoutClips(project.clips)
  if (total <= 0) throw new Error('Nothing to export')
  const gif = job.format === 'gif'
  const short = gif ? Math.min(480, Number(job.resolution)) : Number(job.resolution)
  const { w, h } = outputSize(project, sources, short)
  const fps = gif ? Math.min(15, job.fps) : job.fps
  const mode = job.size ?? 'high'
  const size = SIZE[mode]
  const aac = ['-c:a', 'aac', '-b:a', `${size.audioK}k`]
  const vorbis = ['-c:a', 'libvorbis', '-q:a', String(size.vorbisQ)]
  const x264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(size.crf), '-g', String(Math.round(fps * size.keySecs)), '-pix_fmt', 'yuv420p']
  const release = stayAwake('export', t('Saving your video'), t('Apna Editor keeps working'))
  const ff = await getFFmpeg().catch((e) => { release(); throw e })
  const cleanup: string[] = []
  const write = async (name: string, data: Uint8Array) => { await ff.writeFile(name, data); cleanup.push(name) }

  try {
    // ---- audio
    let hasAudio = false
    let audioFile = 'a.wav'
    let audioBlob: Blob | null = null
    if (!gif) {
      onProgress(0.01, 'Mixing audio…')
      const mixing = (p: number) => onProgress(0.01 + p * 0.07, 'Mixing audio…')
      if (longMix(project) && await canEncodeLong()) {
        // an hour of sound as one WAV would need gigabytes on the way; mix and compress it piece by piece instead
        const ogg = await mixToOgg(project, sources, (p) => { check(); mixing(p) })
        check()
        if (ogg) { audioFile = 'a.ogg'; audioBlob = new Blob([ogg as BlobPart]); hasAudio = true }
      } else {
        const mix = await mixAudio(project, sources, mixing)
        check()
        if (mix) { audioBlob = encodeWav(mix); hasAudio = true }
      }
    }
    if (job.format === 'mp3') {
      if (!hasAudio) throw new Error('This project has no sound to export')
      onProgress(0.5, 'Encoding MP3…')
      cleanup.push('out.mp3')
      const { code } = await withBlobs(ff, [{ name: audioFile, data: audioBlob! }], (at) =>
        runFFmpeg(['-i', at(audioFile), '-c:a', 'libmp3lame', '-b:a', `${size.audioK}k`, 'out.mp3'], (p) => onProgress(0.5 + p * 0.45, 'Encoding MP3…')))
      if (code !== 0) throw new Error('MP3 encoding failed')
      return { blob: await takeFile(ff, 'out.mp3', 'audio/mpeg'), ext: 'mp3', cover: null, width: 0, height: 0, encoder: 'mp3' }
    }

    // ---- video frames
    const fonts = new Set(project.layers.flatMap((l) => (l.type === 'text' ? [l.style.font] : [])))
    // Noto Sans Devanagari is the fallback for Hindi letters in fonts without them, so it must be ready too
    await Promise.all([...fonts, 'Poppins', 'Noto Sans Devanagari'].map(ensureFont))
    const renderer = new Renderer(canvasFor(w, h))
    renderer.resize(w, h)
    await renderer.prepareWatermark(project, sources)
    await renderer.prepareWaves(project, sources)
    await renderer.preparePresenter(project)
    if (usesCutout(project)) await loadCutout()
    await prepare3d(project, sources)
    const readers = new Map<string, FrameReader>()
    const renderAt = async (t: number, seed: number) => {
      const needs = mediaNeeds(project, items, sources, t, 0, true)
      const frames = new Map<string, FrameImage | null>()
      for (const n of needs) {
        if (n.source.kind === 'audio') continue
        let r = readers.get(n.key)
        if (!r) { r = await openReader(n.source); readers.set(n.key, r) }
        frames.set(n.key, await r.get(n.time))
      }
      for (const [k, r] of readers) if (!needs.some((n) => n.key === k)) { r.close(); readers.delete(k) }
      renderer.render({ t, project, items, sources, frame: (k) => frames.get(k) ?? null, watermark: job.watermark, seed })
    }

    const frameCount = Math.max(1, Math.round(total * fps))
    const bitrate = gif ? Math.round(Math.min(16e6, w * h * fps * 0.2)) : videoBitrate(w, h, fps, mode, motionShare(project, sources))
    const keyEvery = Math.max(1, Math.round(fps * size.keySecs))
    const target = await pickEncoder(job.format, w, h, fps, bitrate)
    // the built-in fallback encoder is far too slow (and runs out of memory) at 4K
    if (!target && !gif && job.resolution === '2160') throw new Error('This device cannot make 4K videos. Please choose 2K or 1080p.')
    const chunks = new ChunkStore()
    let encoderName = 'ffmpeg'

    if (target) {
      encoderName = target.codec
      let encErr: unknown = null
      const enc = new VideoEncoder({
        output: (chunk) => {
          const d = new Uint8Array(chunk.byteLength)
          chunk.copyTo(d)
          chunks.push(target.kind === 'h264' ? d : ivfFrame(d, chunks.count))
        },
        error: (e) => { encErr = e },
      })
      enc.configure({
        codec: target.codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality',
        ...(target.kind === 'h264' ? { avc: { format: 'annexb' } } : {}),
      })
      for (let n = 0; n < frameCount; n++) {
        check()
        if (encErr) throw encErr
        await renderAt(Math.min(total - 1e-3, n / fps + 1e-4), n)
        const vf = new VideoFrame(renderer.canvas, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) })
        enc.encode(vf, { keyFrame: n % keyEvery === 0 })
        vf.close()
        // wait for the encoder to catch up; 'dequeue' fires as soon as it takes a frame
        while (enc.encodeQueueSize > 4) await Promise.race([new Promise((r) => enc.addEventListener('dequeue', r, { once: true })), sleep(20)])
        if (n % 3 === 0) onProgress(0.08 + (n / frameCount) * 0.8, `Rendering ${Math.round((n / frameCount) * 100)}%`)
      }
      await enc.flush()
      enc.close()
      if (encErr) throw encErr
    } else {
      // No WebCodecs encoder: hand JPEG frames to ffmpeg in batches
      for (let n = 0; n < frameCount; n++) {
        check()
        await renderAt(Math.min(total - 1e-3, n / fps + 1e-4), n)
        await write(`f${String(n).padStart(6, '0')}.jpg`, new Uint8Array(await (await toJpeg(renderer.canvas)).arrayBuffer()))
        if (n % 3 === 0) onProgress(0.08 + (n / frameCount) * 0.6, `Rendering ${Math.round((n / frameCount) * 100)}%`)
      }
    }
    for (const r of readers.values()) r.close()

    // ---- cover frame
    let cover: Blob | null = null
    if (job.cover != null && !gif) {
      await renderAt(Math.max(0, Math.min(total - 1e-3, job.cover)), 0)
      cover = await toJpeg(renderer.canvas, 0.92)
      for (const r of readers.values()) r.close()
      readers.clear()
    }

    // ---- mux / transcode
    onProgress(0.9, 'Finishing…')
    const ext = job.format
    const out = `out.${ext}`
    cleanup.push(out)
    // ffmpeg reads the video, sound and cover from Blobs in place (see withBlobs)
    const inputs: { name: string; data: Blob }[] = []
    if (hasAudio && audioBlob) inputs.push({ name: audioFile, data: audioBlob })
    const vfile = target?.kind === 'h264' ? 'v.h264' : 'v.ivf'
    if (target) {
      const head = target.kind === 'h264' ? undefined : ivfHeader(target.kind === 'vp9' ? 'VP90' : 'VP80', w, h, fps, chunks.count)
      inputs.push({ name: vfile, data: chunks.blob(head) })
    }
    // MP4/MOV with a cover: put it in on the same pass when the video is copied (no second full-size file)
    const coverNow = !!cover && (ext === 'mp4' || ext === 'mov') && target?.kind === 'h264'
    if (cover && (ext === 'mp4' || ext === 'mov')) inputs.push({ name: 'cover.jpg', data: cover })
    const type = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', gif: 'image/gif' }[ext as 'mp4']
    const blob = await withBlobs(ff, inputs, async (at) => {
      const audioIn = hasAudio ? ['-i', at(audioFile)] : []
      const audioMap = hasAudio ? ['-map', '1:a:0'] : []
      let args: string[]
      if (target) {
        const vin = target.kind === 'h264' ? ['-r', String(fps), '-i', at(vfile)] : ['-i', at(vfile)]
        if (gif) {
          args = [...vin, '-vf', `fps=${fps},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', out]
        } else if (ext === 'webm') {
          args = [...vin, ...audioIn, '-map', '0:v:0', ...audioMap, '-c:v', 'copy', ...vorbis, out]
        } else if (target.kind === 'h264') {
          const coverIn = coverNow ? ['-i', at('cover.jpg')] : []
          const coverMap = coverNow ? ['-map', `${hasAudio ? 2 : 1}:v:0`, '-disposition:v:1', 'attached_pic'] : []
          args = [...vin, ...audioIn, ...coverIn, '-map', '0:v:0', ...audioMap, ...coverMap, '-c:v', 'copy', ...aac, '-movflags', '+faststart', out]
        } else {
          // H.264 encoder not available on this device: transcode in software
          args = [...vin, ...audioIn, '-map', '0:v:0', ...audioMap, ...x264, ...aac, '-movflags', '+faststart', out]
          encoderName = `${target.codec} → x264`
        }
      } else {
        const vin = ['-framerate', String(fps), '-i', 'f%06d.jpg']
        if (gif) args = [...vin, '-vf', `split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', out]
        else if (ext === 'webm') args = [...vin, ...audioIn, '-map', '0:v:0', ...audioMap, '-c:v', 'libvpx', '-b:v', String(bitrate), '-g', String(keyEvery), '-deadline', 'realtime', '-cpu-used', '8', ...vorbis, out]
        else args = [...vin, ...audioIn, '-map', '0:v:0', ...audioMap, ...x264, ...aac, '-movflags', '+faststart', out]
      }
      const { code, logs } = await runFFmpeg(args, (p) => onProgress(0.9 + Math.max(0, Math.min(1, p)) * 0.09, 'Finishing…'))
      if (code !== 0) throw new Error('Could not write the video file: ' + logs.slice(-3).join(' '))

      let final = out
      if (cover && !coverNow && (ext === 'mp4' || ext === 'mov')) {
        const res = await runFFmpeg(['-i', out, '-i', at('cover.jpg'), '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v:1', 'attached_pic', `cov.${ext}`])
        cleanup.push(`cov.${ext}`)
        if (res.code === 0) { await ff.deleteFile(out).catch(() => {}); final = `cov.${ext}` }
      }
      return takeFile(ff, final, type)
    })
    onProgress(1, 'Done')
    return { blob, ext, cover, width: w, height: h, encoder: encoderName }
  } finally {
    release()
    for (const f of cleanup) await ff.deleteFile(f).catch(() => {})
  }
}
