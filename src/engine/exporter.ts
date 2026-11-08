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
import { info as logInfo, warn as logWarn } from '../lib/blackbox'
import { isPhone } from '../lib/exportCheck'
import { AvcTrack, muxMp4, parseAdts, type AacTrack } from './mp4mux'

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
  /** last-resort settings after failures: no hardware video decoder, software encoder first */
  safe?: boolean
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

interface VideoTarget { kind: 'h264' | 'vp9' | 'vp8'; codec: string; hw: HardwareAcceleration }

/**
 * Every encoder setting this device says it can do, best first. Phones often say yes to a setting
 * and then fail on the first frames (or stop responding), so the export goes down this list.
 */
async function encoderCandidates(format: Format, w: number, h: number, fps: number, bitrate: number, safe = false): Promise<VideoTarget[]> {
  if (typeof VideoEncoder === 'undefined') return []
  const wantH264 = format === 'mp4' || format === 'mov'
  // H.264 level: 4.0 up to 1080p, 5.0 up to 2K, 5.1 for 4K (5.2 above 30 fps)
  const big = w * h > 2560 * 1600
  const level = big ? (fps > 30 ? '34' : '33') : w * h > 1920 * 1088 ? '32' : '28'
  const h264 = [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.4200${level}`].map((codec) => ({ kind: 'h264' as const, codec }))
  const vp = [{ kind: 'vp9' as const, codec: big ? (fps > 30 ? 'vp09.00.51.08' : 'vp09.00.50.08') : 'vp09.00.40.08' }, { kind: 'vp8' as const, codec: 'vp8' }]
  const accel: HardwareAcceleration[] = safe ? ['prefer-software', 'no-preference', 'prefer-hardware'] : ['prefer-hardware', 'no-preference', 'prefer-software']
  const out: VideoTarget[] = []
  for (const t of wantH264 ? [...h264, ...vp] : vp) {
    const cfg: VideoEncoderConfig = { codec: t.codec, width: w, height: h, bitrate, framerate: fps, ...(t.kind === 'h264' ? { avc: { format: 'avc' } } : {}) }
    for (const hardwareAcceleration of accel) {
      const r = await VideoEncoder.isConfigSupported({ ...cfg, hardwareAcceleration }).catch(() => null)
      if (r?.supported) out.push({ ...t, hw: hardwareAcceleration })
    }
  }
  // the same codec at 'no-preference' usually ends up on the same encoder as one of the others: try it last
  return out.sort((a, b) => (a.hw === 'no-preference' ? 1 : 0) - (b.hw === 'no-preference' ? 1 : 0)).slice(0, 6)
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
      // phones mix in pieces sooner: a whole 5-minute mix is ~110 MB, plus a WAV copy of it
      if ((longMix(project) || (isPhone && total > 150)) && await canEncodeLong()) {
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
    // sources whose hardware decoder failed or stalled: read them by seeking a <video> instead
    const slowRead = new Set<string>()
    const renderAt = async (t: number, seed: number) => {
      const needs = mediaNeeds(project, items, sources, t, 0, true)
      const frames = new Map<string, FrameImage | null>()
      for (const n of needs) {
        if (n.source.kind === 'audio') continue
        let r = readers.get(n.key)
        if (!r) { r = await openReader(n.source, !job.safe && !slowRead.has(n.source.id)); readers.set(n.key, r) }
        let f: FrameImage | null
        try { f = await r.get(n.time) } catch (e) {
          if (slowRead.has(n.source.id) || job.safe) throw e
          logWarn('Video decoder failed, reading this video the slow way', `${n.source.name}: ${(e as Error)?.message ?? e}`)
          slowRead.add(n.source.id)
          r.close()
          r = await openReader(n.source, false)
          readers.set(n.key, r)
          f = await r.get(n.time)
        }
        frames.set(n.key, f)
      }
      for (const [k, r] of readers) if (!needs.some((n) => n.key === k)) { r.close(); readers.delete(k) }
      renderer.render({ t, project, items, sources, frame: (k) => frames.get(k) ?? null, watermark: job.watermark, seed })
    }

    const frameCount = Math.max(1, Math.round(total * fps))
    const bitrate = gif ? Math.round(Math.min(16e6, w * h * fps * 0.2)) : videoBitrate(w, h, fps, mode, motionShare(project, sources))
    const keyEvery = Math.max(1, Math.round(fps * size.keySecs))
    const candidates = await encoderCandidates(job.format, w, h, fps, bitrate, job.safe)
    // the built-in fallback encoder is far too slow (and runs out of memory) at 4K
    if (!candidates.length && !gif && job.resolution === '2160') throw new Error('This device cannot make 4K videos. Please choose 2K or 1080p.')
    logInfo('Export video encoder', `${candidates.length ? candidates.map((c) => `${c.codec}/${c.hw}`).join(', ') : 'none (ffmpeg JPEG frames, slow, uses much memory)'} · ${w}x${h} · ${fps} fps · ${(bitrate / 1e6).toFixed(1)} Mbit/s · ${frameCount} frames`, true)

    /** Renders and encodes every frame with one encoder setting. Throws when that encoder fails. */
    const encodeWith = async (target: VideoTarget): Promise<AvcTrack | ChunkStore> => {
      const avc = target.kind === 'h264' ? new AvcTrack() : null
      const ivf = avc ? null : new ChunkStore()
      let encErr: unknown = null
      let lastOut = performance.now()
      const enc = new VideoEncoder({
        output: (chunk, meta) => {
          lastOut = performance.now()
          const d = new Uint8Array(chunk.byteLength)
          chunk.copyTo(d)
          if (avc) avc.push(d, chunk.type === 'key', chunk.timestamp, meta?.decoderConfig?.description)
          else ivf!.push(ivfFrame(d, ivf!.count))
        },
        error: (e) => { encErr = e },
      })
      try {
        enc.configure({
          codec: target.codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality', hardwareAcceleration: target.hw,
          ...(avc ? { avc: { format: 'avc' } } : {}),
        })
        for (let n = 0; n < frameCount; n++) {
          check()
          if (encErr) throw encErr
          await renderAt(Math.min(total - 1e-3, n / fps + 1e-4), n)
          const vf = new VideoFrame(renderer.canvas, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) })
          enc.encode(vf, { keyFrame: n % keyEvery === 0 })
          vf.close()
          // wait for the encoder to catch up; 'dequeue' fires as soon as it takes a frame
          const waitFrom = performance.now()
          while (enc.encodeQueueSize > 4) {
            await Promise.race([new Promise((r) => enc.addEventListener('dequeue', r, { once: true })), sleep(20)])
            if (encErr) throw encErr
            // some phone encoders stop taking frames without an error
            if (performance.now() - Math.max(waitFrom, lastOut) > 20000) throw new Error('The video encoder stopped responding')
          }
          if (n === 30 && avc && !avc.samples.length && performance.now() - lastOut > 10000) throw new Error('The video encoder gives no output')
          if (n % 3 === 0) onProgress(0.08 + (n / frameCount) * 0.8, `Rendering ${Math.round((n / frameCount) * 100)}%`)
        }
        await Promise.race([enc.flush(), sleep(30000).then(() => { throw new Error('The video encoder did not finish') })])
        if (encErr) throw encErr
        if (avc && (!avc.samples.length || !avc.description)) throw new Error('The video encoder made no usable video')
        return avc ?? ivf!
      } finally {
        try { enc.close() } catch { /* already closed */ }
      }
    }

    let target: VideoTarget | null = null
    let encoded: AvcTrack | ChunkStore | null = null
    let encoderName = 'ffmpeg'
    for (const c of candidates) {
      try {
        encoded = await encodeWith(c)
        target = c
        break
      } catch (e) {
        if (e instanceof Cancelled || signal?.aborted) throw e
        logWarn(`Video encoder ${c.codec} (${c.hw}) failed, trying the next one`, (e as Error)?.message ?? String(e))
        for (const r of readers.values()) r.close()
        readers.clear()
        onProgress(0.08, 'Trying another video encoder…')
      }
    }
    if (candidates.length && !target) throw new Error('The video encoder of this device failed. Try a lower resolution.')
    if (!target) {
      // No WebCodecs encoder: hand JPEG frames to ffmpeg
      if (isPhone && frameCount > 30 * 90) throw new Error('This device has no video encoder for long videos. Please update Android System WebView / Chrome.')
      for (let n = 0; n < frameCount; n++) {
        check()
        await renderAt(Math.min(total - 1e-3, n / fps + 1e-4), n)
        await write(`f${String(n).padStart(6, '0')}.jpg`, new Uint8Array(await (await toJpeg(renderer.canvas)).arrayBuffer()))
        if (n % 3 === 0) onProgress(0.08 + (n / frameCount) * 0.6, `Rendering ${Math.round((n / frameCount) * 100)}%`)
      }
    } else encoderName = `${target.codec} ${target.hw}`
    for (const r of readers.values()) r.close()
    readers.clear()

    // ---- cover frame
    let cover: Blob | null = null
    if (job.cover != null && !gif) {
      await renderAt(Math.max(0, Math.min(total - 1e-3, job.cover)), 0)
      cover = await toJpeg(renderer.canvas, 0.92)
      for (const r of readers.values()) r.close()
      readers.clear()
    }

    const ext = job.format
    const type = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', gif: 'image/gif' }[ext as 'mp4']

    // ---- H.264: the MP4 is written here; ffmpeg only makes the (small) AAC sound
    if (encoded instanceof AvcTrack && (ext === 'mp4' || ext === 'mov')) {
      logInfo('Export: video encoded', `${(encoded.bytes / 1048576).toFixed(1)} MB, ${encoded.samples.length} frames, audio ${audioBlob ? (audioBlob.size / 1048576).toFixed(1) + ' MB' : 'none'}`, true)
      onProgress(0.9, 'Finishing…')
      let aac: AacTrack | null = null
      if (hasAudio && audioBlob) {
        cleanup.push('a.aac')
        aac = await withBlobs(ff, [{ name: audioFile, data: audioBlob }], async (at) => {
          const { code } = await runFFmpeg(['-i', at(audioFile), '-c:a', 'aac', '-b:a', `${size.audioK}k`, '-ac', '2', '-f', 'adts', 'a.aac'], (p) => onProgress(0.9 + Math.max(0, Math.min(1, p)) * 0.08, 'Finishing…'))
          if (code !== 0) return null
          const d = (await ff.readFile('a.aac')) as Uint8Array
          await ff.deleteFile('a.aac').catch(() => {})
          return parseAdts(d)
        })
      }
      if (!hasAudio || aac) {
        const blob = muxMp4({ video: encoded, width: w, height: h, fps, audio: aac, cover: cover ? new Uint8Array(await cover.arrayBuffer()) : null, mov: ext === 'mov' })
        onProgress(1, 'Done')
        return { blob, ext, cover, width: w, height: h, encoder: `${encoderName} · mp4 writer` }
      }
      logWarn('Could not make the AAC sound on its own, joining with ffmpeg instead')
    }

    // ---- mux / transcode with ffmpeg
    const vBytes = encoded instanceof AvcTrack ? encoded.bytes : encoded?.bytes ?? 0
    logInfo('Export: video encoded', `${(vBytes / 1048576).toFixed(1)} MB, audio ${audioBlob ? (audioBlob.size / 1048576).toFixed(1) + ' MB' : 'none'}`, true)
    onProgress(0.9, 'Finishing…')
    const out = `out.${ext}`
    cleanup.push(out)
    // ffmpeg reads the video, sound and cover from Blobs in place (see withBlobs)
    const inputs: { name: string; data: Blob }[] = []
    if (hasAudio && audioBlob) inputs.push({ name: audioFile, data: audioBlob })
    const vfile = target?.kind === 'h264' ? 'v.mp4' : 'v.ivf'
    if (encoded instanceof AvcTrack) inputs.push({ name: vfile, data: muxMp4({ video: encoded, width: w, height: h, fps }) })
    else if (encoded && target) inputs.push({ name: vfile, data: encoded.blob(ivfHeader(target.kind === 'vp9' ? 'VP90' : 'VP80', w, h, fps, encoded.count)) })
    if (cover && (ext === 'mp4' || ext === 'mov')) inputs.push({ name: 'cover.jpg', data: cover })
    const coverNow = !!cover && (ext === 'mp4' || ext === 'mov') && target?.kind === 'h264'
    const blob = await withBlobs(ff, inputs, async (at) => {
      const audioIn = hasAudio ? ['-i', at(audioFile)] : []
      const audioMap = hasAudio ? ['-map', '1:a:0'] : []
      let args: string[]
      if (target) {
        const vin = ['-i', at(vfile)]
        if (gif) {
          args = [...vin, '-vf', `fps=${fps},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, '-loop', '0', out]
        } else if (ext === 'webm') {
          args = [...vin, ...audioIn, '-map', '0:v:0', ...audioMap, '-c:v', target.kind === 'h264' ? 'libvpx' : 'copy', ...vorbis, out]
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
