import type { MediaSource } from '../types'
import { uid } from './format'

const THUMBS = 10
const THUMB_H = 64

function once(el: HTMLMediaElement, ev: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve() }
    const bad = () => { cleanup(); reject(new Error('This video could not be read by the browser')) }
    const cleanup = () => { el.removeEventListener(ev, ok); el.removeEventListener('error', bad) }
    el.addEventListener(ev, ok)
    el.addEventListener('error', bad)
  })
}

/** Reads duration, size and a strip of thumbnails using a hidden <video>. */
export async function loadSource(file: File): Promise<MediaSource> {
  const url = URL.createObjectURL(file)
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
    v.currentTime = 0
    await once(v, 'seeked')
  }
  const { videoWidth: width, videoHeight: height } = v
  if (!width) throw new Error(`${file.name} has no video track`)

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

  return {
    id: uid(),
    file,
    url,
    name: file.name,
    duration,
    width,
    height,
    thumbs,
  }
}
