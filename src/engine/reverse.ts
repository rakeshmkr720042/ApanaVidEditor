import type { Clip, MediaSource } from '../types'
import { getFFmpeg, runFFmpeg } from '../lib/ffmpeg'
import { loadSource } from '../lib/media'

/** Longest part that can be reversed (seconds): reversing keeps a whole piece in memory, so it goes piece by piece. */
export const REVERSE_MAX = 300
const PIECE = 2 // seconds per piece

const ext = (name: string) => (/\.(\w{2,4})$/.exec(name)?.[1] ?? 'mp4').toLowerCase()

/** A still photo (JPEG, full size) of a video's frame at `time` seconds. */
export async function stillFrame(src: MediaSource, time: number): Promise<MediaSource> {
  let blob: Blob
  if (src.kind === 'image') blob = src.file
  else {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.src = src.url
    await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error('This video could not be read')) })
    await new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = Math.min(Math.max(0, time), Math.max(0, src.duration - 0.05)) })
    const c = document.createElement('canvas')
    c.width = v.videoWidth || src.width
    c.height = v.videoHeight || src.height
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
    blob = await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('No frame'))), 'image/jpeg', 0.92))
    v.removeAttribute('src')
    v.load()
  }
  return loadSource(blob, `${src.name.replace(/\.\w+$/, '')}-freeze.jpg`)
}

/**
 * The clip's part of its video, played backwards (picture and sound), as a new file. Done offline with ffmpeg in
 * 2-second pieces from the end, which are then joined, so a long part never sits in memory whole.
 */
export async function reverseClip(clip: Clip, src: MediaSource, onProgress?: (p: number) => void): Promise<MediaSource> {
  const len = Math.min(REVERSE_MAX, clip.out - clip.in)
  const ff = await getFFmpeg()
  const input = `rev-in.${ext(src.name)}`
  await ff.writeFile(input, new Uint8Array(await src.file.arrayBuffer()))
  const n = Math.max(1, Math.ceil(len / PIECE - 1e-6))
  const pieces: string[] = []
  const sound = src.hasAudio
  // the short side at most 1080, even sizes for H.264
  const scale = "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)'"
  try {
    for (let k = 0; k < n; k++) {
      // piece k is the k-th from the end
      const end = clip.in + len - k * PIECE
      const start = Math.max(clip.in, end - PIECE)
      const out = `rev-${k}.mp4`
      const { code } = await runFFmpeg([
        '-ss', start.toFixed(3), '-t', (end - start).toFixed(3), '-i', input,
        '-vf', `${scale},reverse,format=yuv420p`, ...(sound ? ['-af', 'areverse', '-c:a', 'aac', '-b:a', '160k'] : ['-an']),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', '30', '-y', out,
      ], (p) => onProgress?.(Math.min(0.97, (k + Math.max(0, Math.min(1, p))) / n)))
      if (code !== 0) throw new Error('Reversing failed')
      pieces.push(out)
    }
    await ff.writeFile('rev-list.txt', pieces.map((x) => `file '${x}'`).join('\n'))
    const { code } = await runFFmpeg(['-f', 'concat', '-safe', '0', '-i', 'rev-list.txt', '-c', 'copy', '-movflags', '+faststart', '-y', 'rev-out.mp4'])
    if (code !== 0) throw new Error('Reversing failed')
    const data = (await ff.readFile('rev-out.mp4')) as Uint8Array
    onProgress?.(1)
    return loadSource(new Blob([data.slice()], { type: 'video/mp4' }), `${src.name.replace(/\.\w+$/, '')}-reversed.mp4`)
  } finally {
    for (const f of [input, ...pieces, 'rev-list.txt', 'rev-out.mp4']) await ff.deleteFile(f).catch(() => {})
  }
}
