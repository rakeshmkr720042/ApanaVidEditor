import type { AspectRatio, MediaSource, Project } from '../types'
import { layoutClips } from '../model/timeline'
import { getFFmpeg, runFFmpeg } from '../lib/ffmpeg'
import { longMix, mixAudio } from './audiomix'
import { canEncodeLong, mixToOgg } from './longmix'
import { sleep, stayAwake } from './background'
import { openReader, type FrameReader } from './frames'
import { encodeWav } from './music'
import { mediaNeeds } from './player'
import { outputSize, Renderer, type FrameImage } from './renderer'
import { ensureFont } from './text'

export type Format = 'mp4' | 'webm' | 'mov' | 'gif' | 'mp3'
export type Resolution = '480' | '720' | '1080' | '1440'
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
  const level = w * h > 1920 * 1088 ? '32' : '28'
  const h264 = [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.4200${level}`].map((codec) => ({ kind: 'h264' as const, codec }))
  const vp = [{ kind: 'vp9' as const, codec: 'vp09.00.40.08' }, { kind: 'vp8' as const, codec: 'vp8' }]
  for (const t of wantH264 ? [...h264, ...vp] : vp) {
    const cfg: VideoEncoderConfig = { codec: t.codec, width: w, height: h, bitrate, framerate: fps, ...(t.kind === 'h264' ? { avc: { format: 'annexb' } } : {}) }
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      const r = await VideoEncoder.isConfigSupported({ ...cfg, hardwareAcceleration }).catch(() => null)
      if (r?.supported) return t
    }
  }
  return null
}

function ivf(chunks: Uint8Array[], fourcc: string, w: number, h: number, fps: number): Uint8Array {
  const size = 32 + chunks.reduce((s, c) => s + 12 + c.length, 0)
  const out = new Uint8Array(size)
  const dv = new DataView(out.buffer)
  out.set([68, 75, 73, 70]) // DKIF
  dv.setUint16(4, 0, true); dv.setUint16(6, 32, true)
  out.set([...fourcc].map((c) => c.charCodeAt(0)), 8)
  dv.setUint16(12, w, true); dv.setUint16(14, h, true)
  dv.setUint32(16, fps, true); dv.setUint32(20, 1, true); dv.setUint32(24, chunks.length, true)
  let o = 32
  chunks.forEach((c, i) => {
    dv.setUint32(o, c.length, true); dv.setUint32(o + 4, i, true); dv.setUint32(o + 8, 0, true)
    out.set(c, o + 12)
    o += 12 + c.length
  })
  return out
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
  for (const it of items) if (sources[it.clip.sourceId]?.kind === 'video') spans.push([it.start, it.start + it.dur])
  for (const l of project.layers) if (l.type === 'media' && sources[l.sourceId]?.kind === 'video') spans.push([l.start, l.end])
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
  return Math.round(Math.min(16e6, w * h * fpsScale * SIZE[mode].bpp * (0.35 + 0.65 * motion)))
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
  const release = stayAwake()
  const ff = await getFFmpeg().catch((e) => { release(); throw e })
  const cleanup: string[] = []
  const write = async (name: string, data: Uint8Array) => { await ff.writeFile(name, data); cleanup.push(name) }

  try {
    // ---- audio
    let hasAudio = false
    let audioFile = 'a.wav'
    if (!gif) {
      onProgress(0.01, 'Mixing audio…')
      const mixing = (p: number) => onProgress(0.01 + p * 0.07, 'Mixing audio…')
      if (longMix(project) && await canEncodeLong()) {
        // an hour of sound as one WAV would need gigabytes on the way; mix and compress it piece by piece instead
        const ogg = await mixToOgg(project, sources, (p) => { check(); mixing(p) })
        check()
        if (ogg) { audioFile = 'a.ogg'; await write(audioFile, ogg); hasAudio = true }
      } else {
        const mix = await mixAudio(project, sources, mixing)
        check()
        if (mix) { await write(audioFile, new Uint8Array(await encodeWav(mix).arrayBuffer())); hasAudio = true }
      }
    }
    if (job.format === 'mp3') {
      if (!hasAudio) throw new Error('This project has no sound to export')
      onProgress(0.5, 'Encoding MP3…')
      const { code } = await runFFmpeg(['-i', audioFile, '-c:a', 'libmp3lame', '-b:a', `${size.audioK}k`, 'out.mp3'], (p) => onProgress(0.5 + p * 0.45, 'Encoding MP3…'))
      if (code !== 0) throw new Error('MP3 encoding failed')
      cleanup.push('out.mp3')
      const data = (await ff.readFile('out.mp3')) as Uint8Array
      return { blob: new Blob([data.slice().buffer], { type: 'audio/mpeg' }), ext: 'mp3', cover: null, width: 0, height: 0, encoder: 'mp3' }
    }

    // ---- video frames
    const fonts = new Set(project.layers.flatMap((l) => (l.type === 'text' ? [l.style.font] : [])))
    await Promise.all([...fonts, 'Poppins'].map(ensureFont))
    const renderer = new Renderer(canvasFor(w, h))
    renderer.resize(w, h)
    await renderer.prepareWatermark(project, sources)
    await renderer.prepareWaves(project, sources)
    const readers = new Map<string, FrameReader>()
    const renderAt = async (t: number, seed: number) => {
      const needs = mediaNeeds(project, items, sources, t)
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
    const chunks: Uint8Array[] = []
    let encoderName = 'ffmpeg'

    if (target) {
      encoderName = target.codec
      let encErr: unknown = null
      const enc = new VideoEncoder({
        output: (chunk) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); chunks.push(d) },
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
    const audioIn = hasAudio ? ['-i', audioFile] : []
    const audioMap = hasAudio ? ['-map', '1:a:0'] : []
    let args: string[]
    if (target) {
      const vfile = target.kind === 'h264' ? 'v.h264' : 'v.ivf'
      if (target.kind === 'h264') {
        const all = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0))
        let o = 0
        for (const c of chunks) { all.set(c, o); o += c.length }
        await write(vfile, all)
      } else await write(vfile, ivf(chunks, target.kind === 'vp9' ? 'VP90' : 'VP80', w, h, fps))
      chunks.length = 0
      const vin = target.kind === 'h264' ? ['-r', String(fps), '-i', vfile] : ['-i', vfile]
      if (gif) {
        args = [...vin, '-vf', `fps=${fps},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', out]
      } else if (ext === 'webm') {
        args = [...vin, ...audioIn, '-map', '0:v:0', ...audioMap, '-c:v', 'copy', ...vorbis, out]
      } else if (target.kind === 'h264') {
        args = [...vin, ...audioIn, '-map', '0:v:0', ...audioMap, '-c:v', 'copy', ...aac, '-movflags', '+faststart', out]
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
    if (cover && (ext === 'mp4' || ext === 'mov')) {
      await write('cover.jpg', new Uint8Array(await cover.arrayBuffer()))
      const res = await runFFmpeg(['-i', out, '-i', 'cover.jpg', '-map', '0', '-map', '1', '-c', 'copy', '-disposition:v:1', 'attached_pic', `cov.${ext}`])
      cleanup.push(`cov.${ext}`)
      if (res.code === 0) final = `cov.${ext}`
    }
    const data = (await ff.readFile(final)) as Uint8Array
    const type = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', gif: 'image/gif' }[ext as 'mp4']
    onProgress(1, 'Done')
    return { blob: new Blob([data.slice().buffer], { type }), ext, cover, width: w, height: h, encoder: encoderName }
  } finally {
    release()
    for (const f of cleanup) await ff.deleteFile(f).catch(() => {})
  }
}
