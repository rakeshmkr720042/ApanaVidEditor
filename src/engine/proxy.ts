import type { MediaSource } from '../types'
import { getFFmpeg, resetFFmpeg, runFFmpeg } from '../lib/ffmpeg'
import { compressVideo, planCompress, withInput, type VideoInfo } from './compress'
import { Cancelled } from './exporter'
import { videoFps } from './frames'

/**
 * Preview copies ("proxies" in Premiere and Resolve): a light 540p copy of a big video (4K, high frame rate,
 * long phone recordings) that the preview plays instead, so scrubbing and playback stay smooth on a slow
 * device. Exporting always reads the original file, so the final video keeps its full quality.
 */

export const PROXY_SHORT = 540
/** Videos worth a preview copy: bigger than 720p, or heavy files. */
export const wantsProxy = (s: MediaSource) => s.kind === 'video' && (Math.min(s.width, s.height) > 720 || s.file.size > 150 * 1048576)
export const proxyId = (id: string) => `proxy:${id}`

const KEY = 'use-proxies'
export const proxiesWanted = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }
export const setProxiesWanted = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ } }

/** True when this browser can play H.264 MP4 (then the fast WebCodecs compressor makes the copy). */
const playsMp4 = () => { try { return document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') !== '' } catch { return false } }

/** Makes the preview copy of a video. */
export async function makeProxy(src: MediaSource, onProgress: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
  const file = src.file instanceof File ? src.file : new File([src.file], src.name, { type: src.file.type })
  const k = Math.min(1, PROXY_SHORT / Math.max(1, Math.min(src.width, src.height)))
  if (playsMp4() && typeof VideoEncoder !== 'undefined') {
    const info: VideoInfo = { name: src.name, bytes: src.file.size, duration: src.duration, width: src.width, height: src.height, fps: (await videoFps(src.file).catch(() => null)) ?? 30 }
    const plan = planCompress(info, { preset: 'small', targetMB: 0, short: PROXY_SHORT, fps: 30, codec: 'h264' })
    const out = await compressVideo(file, info, plan, (p) => onProgress(p), signal)
    return out.blob
  }
  // no H.264 here (or no WebCodecs): a VP8 WebM made by ffmpeg
  const ff = await getFFmpeg()
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
  const w = even(src.width * k), h = even(src.height * k)
  const out = 'proxy.webm'
  const onAbort = () => { void resetFFmpeg() }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    return await withInput(file, async (input) => {
      const { code } = await runFFmpeg([
        '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', `scale=${w}:${h}`, '-r', '30',
        '-c:v', 'libvpx', '-b:v', '900k', '-deadline', 'realtime', '-cpu-used', '8', '-g', '30',
        '-c:a', 'libvorbis', '-q:a', '2', out,
      ], (p) => onProgress(Math.max(0, Math.min(1, p))))
      if (signal?.aborted) throw new Cancelled()
      if (code !== 0) throw new Error('Could not make the preview copy')
      const data = await ff.readFile(out)
      await ff.deleteFile(out).catch(() => {})
      return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/webm' })
    })
  } finally { signal?.removeEventListener('abort', onAbort) }
}
