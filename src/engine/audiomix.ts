import type { AudioFx, Denoise, MediaSource, Project } from '../types'
import { clipSegments, layerSpeed, layoutClips } from '../model/timeline'
import { decodeAudio } from '../lib/media'
import { encodeWav } from './music'
import { runFFmpeg, getFFmpeg } from '../lib/ffmpeg'
import { LONG_SECS, decodeSpan, isLong } from '../lib/longaudio'
import { cleanSound, denoiseKey, soundJob } from './denoise'
import { duckCurve, duckGainFrom, FPS, isDucked } from './duck'
import { fadeGain } from './player'
import { reversedIn } from './soundfx'

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

/**
 * Reads stretches of a source's sound. Short files are unpacked once and sliced;
 * long ones are read piece by piece with ffmpeg so the whole file never sits in memory.
 */
export class SoundReader {
  private whole = new Map<string, Promise<AudioBuffer | null>>()
  private cleaned = new Map<string, Promise<Blob | null>>()
  private sources: Record<string, MediaSource>
  constructor(sources: Record<string, MediaSource>) { this.sources = sources }

  long(id: string) {
    const src = this.sources[id]
    return !!src && src.kind !== 'image' && isLong(src.duration, src.file.size)
  }

  /** The file to read: the source itself, or its cleaned sound when noise removal or sound effects are on for it. */
  private file(src: MediaSource, job?: { dn: Denoise | null; fx: AudioFx | null } | null): Promise<Blob | null> {
    if (!job) return Promise.resolve(src.file)
    const key = denoiseKey(src.id, job.dn, job.fx)
    if (!this.cleaned.has(key)) this.cleaned.set(key, cleanSound(src, job.dn, job.fx).then((b) => b ?? src.file).catch(() => src.file))
    return this.cleaned.get(key)!
  }

  /** Sound of [from, to) in the source's own time, starting at `from`; null if silent or unreadable. */
  async read(id: string, from: number, to: number, rate: number, job?: { dn: Denoise | null; fx: AudioFx | null } | null): Promise<AudioBuffer | null> {
    const src = this.sources[id]
    if (!src || src.kind === 'image' || !src.hasAudio || to <= from) return null
    const file = await this.file(src, job)
    if (!file) return null
    if (this.long(id)) {
      const ch = await decodeSpan(file, from, to - from, rate, 2).catch(() => null)
      if (!ch || !ch[0].length) return null
      const b = new AudioBuffer({ length: ch[0].length, numberOfChannels: 2, sampleRate: rate })
      ch.forEach((d, i) => b.copyToChannel(d as Float32Array<ArrayBuffer>, i))
      return b
    }
    const key = job ? denoiseKey(id, job.dn, job.fx) : id
    if (!this.whole.has(key)) this.whole.set(key, decodeAudio(file))
    const buf = await this.whole.get(key)!
    if (!buf || from >= buf.duration) return null
    return slice(buf, from, Math.min(to, buf.duration))
  }
}

/** Gain automation from breakpoints, clipped to the window (Web Audio refuses negative times). */
function automate(param: AudioParam, pts: [number, number][], from: number, to: number) {
  const at = (t: number) => {
    if (t <= pts[0][0]) return pts[0][1]
    for (let i = 1; i < pts.length; i++) {
      const [t1, v1] = pts[i], [t0, v0] = pts[i - 1]
      if (t <= t1) return t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v1
    }
    return pts[pts.length - 1][1]
  }
  param.setValueAtTime(at(from), 0)
  for (const [t, v] of pts) if (t > from && t < to) param.linearRampToValueAtTime(v, t - from)
  param.linearRampToValueAtTime(at(to), to - from)
}

/**
 * Mixes the project's sound (clips, picture-in-picture, music, voice, effects)
 * between `from` and `to` on the timeline. The default is the whole timeline.
 */
export async function mixAudio(
  project: Project,
  sources: Record<string, MediaSource>,
  onProgress?: (p: number) => void,
  win?: { from: number; to: number; rate?: number; channels?: number; reader?: SoundReader },
): Promise<AudioBuffer | null> {
  const { items, total } = layoutClips(project.clips)
  if (total <= 0) return null
  const from = win?.from ?? 0, to = Math.min(total, win?.to ?? total)
  if (to <= from) return null
  const rate = win?.rate ?? MIX_RATE
  const ctx = new OfflineAudioContext(win?.channels ?? 2, Math.ceil((to - from) * rate), rate)
  const reader = win?.reader ?? new SoundReader(sources)
  let any = false
  // music set to lower itself under voices
  const duck = project.layers.some(isDucked) ? await duckCurve(project, sources) : null
  const steps = items.length + project.layers.length
  let done = 0

  for (const it of items) {
    const c = it.clip
    onProgress?.(done++ / steps)
    if (c.volume <= 0) continue
    const s = it.start, e = it.start + it.dur
    if (e <= from || s >= to) continue
    const g = ctx.createGain()
    g.connect(ctx.destination)
    // volume, fades and transition crossfades as gain automation (timeline time)
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
    automate(g.gain, pts, from, to)

    for (const seg of clipSegments(c)) {
      // the part of this segment inside the window, in timeline and source time
      const t0 = Math.max(from, s + seg.tStart), t1 = Math.min(to, s + seg.tEnd)
      if (t1 <= t0) continue
      const a = seg.srcStart + (t0 - s - seg.tStart) * seg.speed, b = seg.srcStart + (t1 - s - seg.tStart) * seg.speed
      let part = await reader.read(c.sourceId, a, b, rate, soundJob(c))
      if (part && Math.abs(seg.speed - 1) > 1e-3) part = await stretch(part, seg.speed)
      if (!part) continue
      const node = ctx.createBufferSource()
      node.buffer = part
      node.connect(g)
      node.start(t0 - from, 0, t1 - t0)
      any = true
    }
  }

  for (const l of project.layers) {
    onProgress?.(done++ / steps)
    if ((l.type !== 'audio' && l.type !== 'media') || l.volume <= 0) continue
    const t0 = Math.max(from, l.start), t1 = Math.min(to, l.end)
    if (t1 <= t0) continue
    const len = l.end - l.start
    const g = ctx.createGain()
    g.connect(ctx.destination)
    const fi = l.type === 'audio' ? Math.min(l.fadeIn, len) : 0, fo = l.type === 'audio' ? Math.min(l.fadeOut, len) : 0
    let pts: [number, number][] = [[l.start, fi > 0 ? 0 : l.volume]]
    if (fi > 0) pts.push([l.start + fi, l.volume])
    if (fo > 0) pts.push([Math.max(l.start + fi, l.end - fo), l.volume], [l.end, 0])
    if (duck && isDucked(l)) {
      // volume, fades and the auto-lowering together, one point per curve step inside the window
      pts = []
      const gain = (t: number) => l.volume * fadeGain(t - l.start, len, fi, fo) * duckGainFrom(duck, l, t)
      for (let f = Math.floor(t0 * FPS); f <= Math.ceil(t1 * FPS); f++) pts.push([f / FPS, gain(f / FPS)])
    }
    automate(g.gain, pts, from, to)
    const sp = layerSpeed(l)
    const job = soundJob(l)
    // a sound played backwards is read from its reversed copy
    const lin = l.type === 'audio' && job?.fx?.reverse && sources[l.sourceId] ? reversedIn(l, sources[l.sourceId]) : l.in
    const a = lin + (t0 - l.start) * sp, b = lin + (t1 - l.start) * sp
    let part = await reader.read(l.sourceId, a, b, rate, job)
    if (part && Math.abs(sp - 1) > 1e-3) part = await stretch(part, sp)
    if (!part) continue
    const node = ctx.createBufferSource()
    node.buffer = part
    node.connect(g)
    node.start(t0 - from, 0, Math.min(t1 - t0, part.duration))
    any = true
  }
  onProgress?.(1)
  if (!any) return null
  return ctx.startRendering()
}

/** True when the timeline is long enough that its sound should be mixed a piece at a time. */
export const longMix = (project: Project) => layoutClips(project.clips).total > LONG_SECS

/**
 * The project's sound in pieces of `step` seconds, for long timelines. Each piece
 * is handed over and dropped before the next is made, so memory holds one piece.
 */
export async function mixInPieces(
  project: Project, sources: Record<string, MediaSource>, rate: number, channels: number,
  onPiece: (buf: AudioBuffer | null, from: number, to: number) => Promise<void> | void, onProgress?: (p: number) => void, step = 120,
) {
  const { total } = layoutClips(project.clips)
  const reader = new SoundReader(sources)
  for (let from = 0; from < total; from += step) {
    const to = Math.min(total, from + step)
    onProgress?.(from / total)
    await onPiece(await mixAudio(project, sources, undefined, { from, to, rate, channels, reader }), from, to)
  }
  onProgress?.(1)
}
