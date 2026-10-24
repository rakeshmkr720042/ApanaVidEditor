import type { MediaKind, MediaSource } from '../types'
import { IMAGE_DURATION } from '../model/timeline'
import { uid } from './format'
import { TOO_BIG, isLong, longPeaks, probeDuration } from './longaudio'

const LONG_BYTES_HINT = 30 * 1048576

const THUMBS = 10
const THUMB_H = 64

function once(el: HTMLMediaElement | HTMLImageElement, ev: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve() }
    const bad = () => { cleanup(); reject(new Error('This file could not be opened')) }
    const cleanup = () => { el.removeEventListener(ev, ok); el.removeEventListener('error', bad) }
    el.addEventListener(ev, ok)
    el.addEventListener('error', bad)
  })
}

export function kindOf(file: { type: string; name: string }): MediaKind | null {
  // the MIME type wins over the name: a recorded voice is audio/webm but named .webm
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('audio/')) return 'audio'
  if (/\.(mp4|mov|webm|mkv|m4v|3gp)$/i.test(file.name)) return 'video'
  if (/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)) return 'image'
  if (/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(file.name)) return 'audio'
  return null
}

let audioCtx: AudioContext | null = null
export const sharedAudioContext = () => (audioCtx ??= new AudioContext())

export async function decodeAudio(blob: Blob): Promise<AudioBuffer | null> {
  try {
    return await sharedAudioContext().decodeAudioData(await blob.arrayBuffer())
  } catch {
    return null
  }
}

export function waveform(buf: AudioBuffer, width = 400, height = 48) {
  const data = buf.getChannelData(0)
  const step = Math.max(1, Math.floor(data.length / width))
  const peaks = new Float32Array(width)
  for (let x = 0; x < width; x++) {
    let peak = 0
    for (let i = x * step; i < (x + 1) * step && i < data.length; i += 8) peak = Math.max(peak, Math.abs(data[i]))
    peaks[x] = peak
  }
  return drawPeaks(peaks, height)
}

function drawPeaks(peaks: Float32Array, height: number) {
  const width = peaks.length
  const c = document.createElement('canvas')
  c.width = width; c.height = height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  // normalise so quiet recordings still show their shape (at most 8x gain)
  let max = 0.125
  for (const p of peaks) max = Math.max(max, p)
  for (let x = 0; x < width; x++) {
    const h = Math.max(1, (peaks[x] / max) * height * 0.95)
    ctx.fillRect(x, (height - h) / 2, 1, h)
  }
  return c.toDataURL('image/png')
}

/** Waveform of a video's sound for the timeline, or '' when it has none (or is too long to decode cheaply). */
export async function videoWave(file: Blob, duration: number): Promise<string> {
  if (duration > 20 * 60 || file.size > 600 * 1048576) return ''
  const buf = await decodeAudio(file)
  if (!buf) return ''
  return waveform(buf, Math.round(Math.min(4000, Math.max(200, duration * 40))), 32)
}

/** Reads duration, size and thumbnails (or a waveform for audio). */
export async function loadSource(file: Blob, name: string, id = uid()): Promise<MediaSource> {
  const kind = kindOf({ type: file.type, name })
  if (!kind) throw new Error(`${name} is not a supported video, photo or audio file`)
  const url = URL.createObjectURL(file)

  if (kind === 'image') {
    const img = new Image()
    img.src = url
    await once(img, 'load')
    const c = document.createElement('canvas')
    c.height = THUMB_H
    c.width = Math.round((img.naturalWidth / img.naturalHeight) * THUMB_H)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return { id, kind, file, url, name, duration: IMAGE_DURATION, width: img.naturalWidth, height: img.naturalHeight, hasAudio: false, thumbs: [c.toDataURL('image/jpeg', 0.7)] }
  }

  if (kind === 'audio') {
    // long recordings are never unpacked whole: the length comes from the header and the picture from a light read
    const secs = await probeDuration(url)
    if (isLong(secs, file.size)) {
      const peaks = await longPeaks(file, 400).catch(() => null)
      if (secs > 0) return { id, kind, file, url, name, duration: secs, width: 0, height: 0, hasAudio: true, thumbs: peaks ? [drawPeaks(peaks, 48)] : [] }
    }
    const buf = await decodeAudio(file)
    if (!buf) throw new Error(file.size > LONG_BYTES_HINT ? TOO_BIG : `${name} could not be decoded. Try an MP3, M4A or WAV file.`)
    return { id, kind, file, url, name, duration: buf.duration, width: 0, height: 0, hasAudio: true, thumbs: [waveform(buf)] }
  }

  const v = document.createElement('video')
  v.muted = true
  v.preload = 'auto'
  v.playsInline = true
  v.src = url
  await once(v, 'loadedmetadata')
  let duration = v.duration
  if (!Number.isFinite(duration)) {
    // MediaRecorder WebM files report Infinity until you seek past the end.
    v.currentTime = 1e7
    await once(v, 'seeked')
    duration = v.duration
  }
  const { videoWidth: width, videoHeight: height } = v
  if (!width) throw new Error(`${name} has no video track`)
  const canvas = document.createElement('canvas')
  canvas.height = THUMB_H
  canvas.width = Math.round((width / height) * THUMB_H)
  const ctx = canvas.getContext('2d')!
  const thumbs: string[] = []
  for (let i = 0; i < THUMBS; i++) {
    v.currentTime = Math.min(duration - 0.05, ((i + 0.5) / THUMBS) * duration)
    await once(v, 'seeked')
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    thumbs.push(canvas.toDataURL('image/jpeg', 0.6))
  }
  v.removeAttribute('src')
  v.load()
  const wave = await videoWave(file, duration).catch(() => '')
  return { id, kind, file, url, name, duration, width, height, hasAudio: true, thumbs, wave }
}

/** Builds a source from stored data without re-reading the file. */
export function restoreSource(meta: Omit<MediaSource, 'url' | 'file'>, file: Blob): MediaSource {
  return { ...meta, file, url: URL.createObjectURL(file) }
}
