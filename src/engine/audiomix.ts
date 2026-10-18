import type { MediaSource, Project } from '../types'
import { clipSegments, layerSpeed, layoutClips } from '../model/timeline'
import { decodeAudio } from '../lib/media'
import { encodeWav } from './music'
import { runFFmpeg, getFFmpeg } from '../lib/ffmpeg'

export const MIX_RATE = 48000

/** Pitch-preserving time stretch of a slice, done with ffmpeg's atempo. */
export async function stretch(slice: AudioBuffer, speed: number): Promise<AudioBuffer | null> {
  const ff = await getFFmpeg()
  const chain: string[] = []
  let s = speed
  while (s > 2) { chain.push('atempo=2'); s /= 2 }
  while (s < 0.5) { chain.push('atempo=0.5'); s /= 0.5 }
  chain.push(`atempo=${s.toFixed(5)}`)
  await ff.writeFile('st_in.wav', new Uint8Array(await encodeWav(slice).arrayBuffer()))
  const { code } = await runFFmpeg(['-i', 'st_in.wav', '-filter:a', chain.join(','), 'st_out.wav'])
  await ff.deleteFile('st_in.wav').catch(() => {})
  if (code !== 0) return null
  const data = (await ff.readFile('st_out.wav')) as Uint8Array
  await ff.deleteFile('st_out.wav').catch(() => {})
  return decodeAudio(new Blob([data.slice().buffer]))
}

function slice(buf: AudioBuffer, from: number, to: number) {
  const a = Math.max(0, Math.floor(from * buf.sampleRate)), b = Math.min(buf.length, Math.ceil(to * buf.sampleRate))
  const out = new AudioBuffer({ length: Math.max(1, b - a), numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate })
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(a, b), c)
  return out
}

/** Mixes the whole project's sound (clips, picture-in-picture, music, voice, effects). */
export async function mixAudio(
  project: Project,
  sources: Record<string, MediaSource>,
  onProgress?: (p: number) => void,
): Promise<AudioBuffer | null> {
  const { items, total } = layoutClips(project.clips)
  if (total <= 0) return null
  const ctx = new OfflineAudioContext(2, Math.ceil(total * MIX_RATE), MIX_RATE)
  const decoded = new Map<string, AudioBuffer | null>()
  const getBuf = async (id: string) => {
    if (!decoded.has(id)) {
      const src = sources[id]
      decoded.set(id, src && src.kind !== 'image' ? await decodeAudio(src.file) : null)
    }
    return decoded.get(id)!
  }
  let any = false
  const steps = items.length + project.layers.length
  let done = 0

  for (const it of items) {
    const c = it.clip
    onProgress?.(done++ / steps)
    if (c.volume <= 0) continue
    const buf = await getBuf(c.sourceId)
    if (!buf) continue
    const g = ctx.createGain()
    g.connect(ctx.destination)
    // volume, fades and transition crossfades as gain automation (timeline time)
    const s = it.start, e = it.start + it.dur
    const pts: [number, number][] = []
    const gainAt = (t: number) => {
      const local = t - s
      let v = c.volume
      if (c.fadeIn > 0 && local < c.fadeIn) v *= local / c.fadeIn
      if (c.fadeOut > 0 && local > it.dur - c.fadeOut) v *= (it.dur - local) / c.fadeOut
      if (it.transIn > 0 && local < it.transIn) v *= local / it.transIn
      if (it.transOut > 0 && local > it.dur - it.transOut) v *= (it.dur - local) / it.transOut
      return Math.max(0, v)
    }
    for (const t of [s, s + c.fadeIn, s + it.transIn, e - c.fadeOut, e - it.transOut, e]) if (t >= s && t <= e) pts.push([t, gainAt(t)])
    pts.sort((a, b) => a[0] - b[0])
    g.gain.setValueAtTime(pts[0][1], pts[0][0])
    for (const [t, v] of pts.slice(1)) g.gain.linearRampToValueAtTime(v, t)

    for (const seg of clipSegments(c)) {
      let part: AudioBuffer | null = slice(buf, seg.srcStart, seg.srcEnd)
      if (Math.abs(seg.speed - 1) > 1e-3) part = await stretch(part, seg.speed)
      if (!part) continue
      const node = ctx.createBufferSource()
      node.buffer = part
      node.connect(g)
      node.start(s + seg.tStart, 0, seg.tEnd - seg.tStart)
      any = true
    }
  }

  for (const l of project.layers) {
    onProgress?.(done++ / steps)
    if ((l.type !== 'audio' && l.type !== 'media') || l.volume <= 0) continue
    const buf = await getBuf(l.sourceId)
    if (!buf) continue
    const len = l.end - l.start
    const g = ctx.createGain()
    g.connect(ctx.destination)
    const fi = l.type === 'audio' ? l.fadeIn : 0, fo = l.type === 'audio' ? l.fadeOut : 0
    g.gain.setValueAtTime(fi > 0 ? 0 : l.volume, l.start)
    if (fi > 0) g.gain.linearRampToValueAtTime(l.volume, l.start + Math.min(fi, len))
    if (fo > 0) { g.gain.setValueAtTime(l.volume, Math.max(l.start, l.end - fo)); g.gain.linearRampToValueAtTime(0, l.end) }
    if (l.in >= buf.duration) continue
    const sp = layerSpeed(l)
    let part: AudioBuffer | null = buf
    let from = l.in
    if (Math.abs(sp - 1) > 1e-3) {
      part = await stretch(slice(buf, l.in, Math.min(buf.duration, l.in + len * sp)), sp)
      from = 0
    }
    if (!part) continue
    const node = ctx.createBufferSource()
    node.buffer = part
    node.connect(g)
    node.start(l.start, from, Math.min(len, part.duration - from))
    any = true
  }
  onProgress?.(1)
  if (!any) return null
  return ctx.startRendering()
}
