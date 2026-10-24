import { FFFSType } from '@ffmpeg/ffmpeg'
import type { MediaSource } from '../types'
import { getFFmpeg, runFFmpeg } from '../lib/ffmpeg'
import { sleep, stayAwake } from './background'
import { Cancelled } from './exporter'
import { openReader, videoFps } from './frames'

/**
 * HandBrake-style compressor: shrinks any video file without a project. Frames are decoded and
 * re-encoded with WebCodecs (hardware, fast); the sound is re-encoded and everything muxed with
 * ffmpeg.wasm. Without a WebCodecs encoder the whole job runs in ffmpeg (x264, slower). Works offline.
 */

export type CompressPreset = 'whatsapp' | 'youtube' | 'small' | 'smallest' | 'target'
export type Codec = 'h264' | 'hevc'

export interface VideoInfo { name: string; bytes: number; duration: number; width: number; height: number; fps: number }

export interface CompressSettings {
  preset: CompressPreset
  targetMB: number // only for 'target'
  short: number // short side in pixels, 0 = automatic (preset)
  fps: number // 0 = automatic (preset)
  codec: Codec
}

export interface CompressPlan { width: number; height: number; fps: number; videoBitrate: number; audioK: number; codec: Codec; bytes: number; capped: boolean }

export interface CompressOutput { blob: Blob; width: number; height: number; encoder: string }

/** Short side, frame rate cap, bits per pixel (H.264) and audio kbps of each preset. */
const PRESETS: Record<Exclude<CompressPreset, 'target'>, { short: number; fps: number; bpp: number; audioK: number }> = {
  whatsapp: { short: 720, fps: 30, bpp: 0.06, audioK: 96 },
  youtube: { short: 1080, fps: 60, bpp: 0.1, audioK: 128 },
  small: { short: 1080, fps: 30, bpp: 0.05, audioK: 96 },
  smallest: { short: 480, fps: 30, bpp: 0.04, audioK: 64 },
}
const HEVC_SAVING = 0.65 // H.265 needs about two thirds of the bits for the same look
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Reads duration, size and frame rate of a video file; ffmpeg reads files the browser can't play. */
export async function probeVideo(file: File): Promise<VideoInfo> {
  return probeElement(file).catch(() => probeFFmpeg(file))
}

async function probeElement(file: File): Promise<VideoInfo> {
  const url = URL.createObjectURL(file)
  try {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.src = url
    await new Promise<void>((ok, fail) => {
      v.addEventListener('loadedmetadata', () => ok(), { once: true })
      v.addEventListener('error', () => fail(new Error('This video could not be opened')), { once: true })
    })
    let duration = v.duration
    if (!Number.isFinite(duration)) { // some WebM files report Infinity until the end is seeked
      v.currentTime = 1e9
      await new Promise((r) => v.addEventListener('durationchange', r, { once: true }))
      duration = v.duration
    }
    const fps = (await videoFps(file).catch(() => null)) ?? 30
    if (!v.videoWidth || !(duration > 0)) throw new Error('No picture')
    return { name: file.name, bytes: file.size, duration, width: v.videoWidth, height: v.videoHeight, fps: Math.round(fps * 100) / 100 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function probeFFmpeg(file: File): Promise<VideoInfo> {
  const { logs } = await withInput(file, (input) => runFFmpeg(['-hide_banner', '-i', input]))
  const text = logs.join('\n')
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(text)
  const v = /Stream #\S+.*Video: .*?(\d{2,5})x(\d{2,5})/.exec(text)
  if (!d || !v) throw new Error('This video could not be opened')
  const fps = Number(/([\d.]+) fps/.exec(text)?.[1]) || 30
  const turned = /rotation of -?(90|270)/.test(text)
  const w = Number(v[1]), h = Number(v[2])
  return { name: file.name, bytes: file.size, duration: Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]), width: turned ? h : w, height: turned ? w : h, fps }
}

/** Makes the file readable by ffmpeg as /in/source.<ext> without copying it into memory, runs fn, then cleans up. */
async function withInput<T>(file: File, fn: (input: string) => Promise<T>): Promise<T> {
  const ff = await getFFmpeg()
  const input = `/in/source.${(file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'}`
  let mounted = false
  await ff.createDir('/in').catch(() => {})
  try { await ff.mount(FFFSType.WORKERFS, { blobs: [{ name: input.slice(4), data: file }] }, '/in'); mounted = true } catch {
    await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()))
  }
  try {
    return await fn(input)
  } finally {
    if (mounted) await ff.unmount('/in').catch(() => {})
    else await ff.deleteFile(input).catch(() => {})
    await ff.deleteDir('/in').catch(() => {})
  }
}

/** Output size, bitrates and the expected file size for the chosen settings. */
export function planCompress(info: VideoInfo, s: CompressSettings): CompressPlan {
  const srcShort = Math.min(info.width, info.height) || 720
  const dur = Math.max(0.1, info.duration)
  const hevc = s.codec === 'hevc' ? HEVC_SAVING : 1
  const p = s.preset === 'target' ? { short: 1080, fps: 30, bpp: 0.07, audioK: 96 } : PRESETS[s.preset]
  const fps = Math.min(info.fps || 30, s.fps || p.fps)
  const fpsScale = 30 * Math.pow(fps / 30, 0.7)
  const pixels = (short: number) => {
    const k = Math.min(1, short / srcShort)
    return even(info.width * k) * even(info.height * k)
  }
  let audioK = p.audioK
  let short = Math.min(srcShort, s.short || p.short)
  let videoBitrate: number
  if (s.preset === 'target') {
    const budget = (Math.max(1, s.targetMB) * 1048576 * 8 * 0.97) / dur // keep 3% for the container
    if (budget < 400e3) audioK = 48
    videoBitrate = Math.max(80e3, budget - audioK * 1000)
    // automatic size: the largest frame that still gets enough bits per pixel to look clean
    if (!s.short) {
      const minBpp = 0.035 * hevc
      short = [1080, 720, 540, 480, 360, 240].find((c) => c <= srcShort && videoBitrate / (pixels(c) * fpsScale) >= minBpp) ?? Math.min(240, srcShort)
    }
  } else {
    videoBitrate = pixels(short) * fpsScale * p.bpp * hevc
  }
  // never make the picture heavier than the original
  const srcVideo = Math.max(100e3, (info.bytes * 8) / dur - 128e3)
  const capped = s.preset !== 'target' && videoBitrate > srcVideo * 0.7
  if (capped) videoBitrate = srcVideo * 0.7
  videoBitrate = Math.round(Math.min(videoBitrate, 20e6))
  const k = Math.min(1, short / srcShort)
  return {
    width: even(info.width * k), height: even(info.height * k), fps, videoBitrate, audioK, codec: s.codec, capped,
    bytes: (dur * (videoBitrate + audioK * 1000)) / 8,
  }
}

function hevcCodec(w: number, h: number) { return w * h > 2228224 ? 'hvc1.1.6.L153.90' : 'hvc1.1.6.L123.90' }
function h264Codecs(w: number, h: number) {
  const level = w * h > 1920 * 1088 ? '33' : '28'
  return [`avc1.6400${level}`, `avc1.4d00${level}`, `avc1.4200${level}`]
}

async function findEncoder(codec: Codec, w: number, h: number, fps: number, bitrate: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null
  for (const c of codec === 'hevc' ? [hevcCodec(w, h)] : h264Codecs(w, h)) {
    const cfg: VideoEncoderConfig = {
      codec: c, width: w, height: h, bitrate, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality',
      ...(codec === 'hevc' ? { hevc: { format: 'annexb' } } : { avc: { format: 'annexb' } }),
    } as VideoEncoderConfig
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      const r = await VideoEncoder.isConfigSupported({ ...cfg, hardwareAcceleration }).catch(() => null)
      if (r?.supported) return { ...cfg, hardwareAcceleration }
    }
  }
  return null
}

/** True when this device can encode H.265 (usually only with a hardware encoder). */
export async function hevcSupported(): Promise<boolean> {
  return !!(await findEncoder('hevc', 1280, 720, 30, 2e6))
}

/** Compresses a video file into an MP4. */
export async function compressVideo(
  file: File,
  info: VideoInfo,
  plan: CompressPlan,
  onProgress: (p: number, label: string) => void,
  signal?: AbortSignal,
): Promise<CompressOutput> {
  const check = () => { if (signal?.aborted) throw new Cancelled() }
  const release = stayAwake()
  const ff = await getFFmpeg().catch((e) => { release(); throw e })
  const cleanup: string[] = []
  let revoke = ''
  try {
    return await withInput(file, async (input) => {
      const { fps, width: w, height: h, videoBitrate, audioK } = plan
      const config = await findEncoder(plan.codec, w, h, fps, videoBitrate)
      const src = sourceFor(file, info)
      revoke = src.url
      const reader = config ? await openReader(src).catch(() => null) : null
      const first = reader ? await reader.get(0).catch(() => null) : null
      check()

      if (!config || !reader || !first) {
        // no WebCodecs encoder or decoder for this file: ffmpeg does all the work (slower)
        reader?.close()
        onProgress(0.01, 'Compressing…')
        const out = 'small.mp4'
        cleanup.push(out)
        const { code, logs } = await runFFmpeg([
          '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', `scale=${w}:${h},fps=${fps}`,
          '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(videoBitrate), '-maxrate', String(Math.round(videoBitrate * 1.5)), '-bufsize', String(videoBitrate * 2),
          '-g', String(Math.round(fps * 5)), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', `${audioK}k`, '-ac', '2', '-movflags', '+faststart', out,
        ], (p) => { if (signal?.aborted) return; onProgress(0.01 + Math.max(0, Math.min(1, p)) * 0.98, 'Compressing…') })
        check()
        if (code !== 0) throw new Error('Compression failed: ' + logs.slice(-3).join(' '))
        const data = (await ff.readFile(out)) as Uint8Array
        onProgress(1, 'Done')
        return { blob: new Blob([data.slice().buffer], { type: 'video/mp4' }), width: w, height: h, encoder: 'x264 (ffmpeg)' }
      }

      // ---- sound
      onProgress(0.01, 'Compressing sound…')
      const { code: aCode } = await runFFmpeg(['-i', input, '-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', `${audioK}k`, '-ac', '2', 'a.m4a'],
        (p) => onProgress(0.01 + Math.max(0, Math.min(1, p)) * 0.07, 'Compressing sound…'))
      cleanup.push('a.m4a')
      const hasAudio = aCode === 0
      check()

      // ---- picture
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      const chunks: Uint8Array[] = []
      let encErr: unknown = null
      const enc = new VideoEncoder({
        output: (chunk) => { const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); chunks.push(d) },
        error: (e) => { encErr = e },
      })
      enc.configure(config)
      const frameCount = Math.max(1, Math.round(info.duration * fps))
      const keyEvery = Math.round(fps * 5)
      try {
        for (let n = 0; n < frameCount; n++) {
          check()
          if (encErr) throw encErr
          const img = n === 0 ? first : await reader.get(Math.min(info.duration - 1e-3, n / fps + 1e-4))
          if (img) ctx.drawImage(img.image, 0, 0, w, h) // a missing frame repeats the last one
          const vf = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / fps), duration: Math.round(1e6 / fps) })
          enc.encode(vf, { keyFrame: n % keyEvery === 0 })
          vf.close()
          while (enc.encodeQueueSize > 4) await Promise.race([new Promise((r) => enc.addEventListener('dequeue', r, { once: true })), sleep(20)])
          if (n % 5 === 0) onProgress(0.08 + (n / frameCount) * 0.87, `Compressing ${Math.round((n / frameCount) * 100)}%`)
        }
        await enc.flush()
        if (encErr) throw encErr
      } finally {
        reader.close()
        if (enc.state !== 'closed') enc.close()
      }

      // ---- MP4
      onProgress(0.96, 'Finishing…')
      const hevc = plan.codec === 'hevc'
      const vfile = hevc ? 'v.hevc' : 'v.h264'
      const all = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0))
      let o = 0
      for (const c of chunks) { all.set(c, o); o += c.length }
      chunks.length = 0
      await ff.writeFile(vfile, all)
      cleanup.push(vfile, 'small.mp4')
      const { code, logs } = await runFFmpeg([
        '-f', hevc ? 'hevc' : 'h264', '-r', String(fps), '-i', vfile, ...(hasAudio ? ['-i', 'a.m4a'] : []),
        '-map', '0:v:0', ...(hasAudio ? ['-map', '1:a:0'] : []), '-c', 'copy', ...(hevc ? ['-tag:v', 'hvc1'] : []), '-movflags', '+faststart', 'small.mp4',
      ])
      if (code !== 0) throw new Error('Could not write the video file: ' + logs.slice(-3).join(' '))
      const data = (await ff.readFile('small.mp4')) as Uint8Array
      onProgress(1, 'Done')
      return { blob: new Blob([data.slice().buffer], { type: 'video/mp4' }), width: w, height: h, encoder: config.codec }
    })
  } finally {
    release()
    if (revoke) URL.revokeObjectURL(revoke)
    for (const f of cleanup) await ff.deleteFile(f).catch(() => {})
  }
}

function sourceFor(file: File, info: VideoInfo): MediaSource {
  return { id: 'compress', kind: 'video', file, url: URL.createObjectURL(file), name: file.name, duration: info.duration, width: info.width, height: info.height, hasAudio: true, thumbs: [] }
}
