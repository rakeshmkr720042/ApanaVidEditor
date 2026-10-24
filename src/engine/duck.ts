import type { AudioLayer, Layer, MediaSource, Project } from '../types'
import { layerSpeed, layoutClips, sourceAt } from '../model/timeline'
import { decodeAudio } from '../lib/media'
import { decodeMonoLong, isLong } from '../lib/longaudio'
import { hasSound } from './denoise'

/**
 * Auto-lowering ("ducking"): music on a track with `duck` set gets quieter by itself wherever someone speaks
 * in the main video, an overlay video or a voice track, and comes back up in the pauses. Each sound's
 * loudness is read once (20 times a second); the timeline's curve is worked out from those and used by the
 * preview and the export alike.
 */

export const FPS = 20 // curve and loudness steps per second
const ATTACK = 0.2, RELEASE = 0.5, HOLD = 0.3 // seconds

const envs = new Map<string, Promise<Uint8Array | null>>()

/** Where the source is loud enough to be someone speaking (1) or quiet (0), per 1/20 s. */
function activity(src: MediaSource): Promise<Uint8Array | null> {
  let p = envs.get(src.id)
  if (!p) {
    p = (async () => {
      const rate = 8000
      let mono: Float32Array | null
      if (isLong(src.duration, src.file.size)) mono = await decodeMonoLong(src.file, src.duration, rate).catch(() => null)
      else {
        const b = await decodeAudio(src.file)
        if (!b) return null
        const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(b.duration * rate)), rate)
        const s = new AudioBufferSourceNode(ctx, { buffer: b })
        s.connect(ctx.destination)
        s.start()
        mono = (await ctx.startRendering()).getChannelData(0)
      }
      if (!mono?.length) return null
      const step = rate / FPS, n = Math.ceil(mono.length / step)
      const db = new Float32Array(n)
      for (let f = 0; f < n; f++) {
        let e = 0, k = 0
        for (let i = f * step; i < Math.min(mono.length, (f + 1) * step); i++) { e += mono[i] * mono[i]; k++ }
        db[f] = 10 * Math.log10(e / Math.max(1, k) + 1e-12)
      }
      // above the room's own noise (its quietest 20%) and not near-silent
      const floor = [...db].sort((a, b) => a - b)[Math.floor(n * 0.2)] ?? -100
      const gate = Math.max(-48, floor + 10)
      return Uint8Array.from(db, (v) => (v > gate ? 1 : 0))
    })().catch(() => null)
    envs.set(src.id, p)
  }
  return p
}

export const isDucked = (l: Layer): l is AudioLayer => l.type === 'audio' && l.duck != null

/** The sounds that make ducked music lower: everything with sound that isn't ducked itself or music. */
function triggers(project: Project, sources: Record<string, MediaSource>) {
  const out: { sourceId: string; start: number; end: number; at: (local: number) => number }[] = []
  const { items } = layoutClips(project.clips)
  for (const it of items) {
    const c = it.clip
    if (c.volume <= 0 || !hasSound(sources[c.sourceId])) continue
    out.push({ sourceId: c.sourceId, start: it.start, end: it.start + it.dur, at: (local) => sourceAt(c, local).time })
  }
  for (const l of project.layers) {
    if ((l.type !== 'media' && l.type !== 'audio') || l.volume <= 0 || (l.type === 'audio' && (l.duck != null || l.kind === 'music'))) continue
    if (!hasSound(sources[l.sourceId])) continue
    const sp = layerSpeed(l)
    out.push({ sourceId: l.sourceId, start: l.start, end: l.end, at: (local) => l.in + local * sp })
  }
  return out
}

let latest: { sig: string; curve: Float32Array } | null = null
const curves = new Map<string, Promise<Float32Array | null>>()
const listeners = new Set<() => void>()

export function onDuckChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }

/**
 * How far ducked music is lowered across the timeline, 0 (not at all) .. 1 (fully), per 1/20 s.
 * Null when nothing is ducked.
 */
export function duckCurve(project: Project, sources: Record<string, MediaSource>): Promise<Float32Array | null> {
  if (!project.layers.some(isDucked)) return Promise.resolve(null)
  const tr = triggers(project, sources)
  const total = Math.max(layoutClips(project.clips).total, ...project.layers.map((l) => l.end))
  const sig = `${total.toFixed(2)};` + tr.map((t) => `${t.sourceId}:${t.start.toFixed(3)}:${t.end.toFixed(3)}:${t.at(0).toFixed(3)}:${t.at(t.end - t.start).toFixed(3)}`).join(';')
  let p = curves.get(sig)
  if (!p) {
    p = (async () => {
      const n = Math.ceil(total * FPS) + 1
      const on = new Uint8Array(n)
      for (const t of tr) {
        const a = await activity(sources[t.sourceId])
        if (!a) continue
        for (let f = Math.floor(t.start * FPS); f < Math.min(n, Math.ceil(t.end * FPS)); f++) {
          const st = t.at(Math.max(0, f / FPS - t.start))
          if (a[Math.floor(st * FPS)]) on[f] = 1
        }
      }
      // hold through short pauses between words, start lowering a little before the voice
      const target = new Float32Array(n)
      const hold = Math.round(HOLD * FPS), ahead = Math.round(ATTACK * FPS)
      let next = Infinity // the next frame with a voice
      for (let f = n - 1; f >= 0; f--) { if (on[f]) next = f; if (next - f <= ahead) target[f] = 1 }
      let last = -Infinity
      for (let f = 0; f < n; f++) { if (on[f]) last = f; if (f - last <= hold) target[f] = 1 }
      const curve = new Float32Array(n)
      let v = target[0] ?? 0
      const up = 1 / (ATTACK * FPS), down = 1 / (RELEASE * FPS)
      for (let f = 0; f < n; f++) {
        v = target[f] > v ? Math.min(target[f], v + up) : Math.max(target[f], v - down)
        curve[f] = v
      }
      latest = { sig, curve }
      listeners.forEach((f) => f())
      return curve
    })()
    curves.set(sig, p)
    if (curves.size > 6) curves.delete(curves.keys().next().value!)
  }
  return p
}

/** The gain of a ducked layer at a timeline time from the last curve made (1 until one is ready). */
export function duckGain(l: AudioLayer, t: number): number {
  if (l.duck == null || !latest) return 1
  const f = Math.max(0, Math.min(latest.curve.length - 1, Math.round(t * FPS)))
  return 1 - latest.curve[f] * (1 - l.duck)
}

/** The same, from a given curve (the export). */
export function duckGainFrom(curve: Float32Array, l: AudioLayer, t: number): number {
  if (l.duck == null) return 1
  const f = Math.max(0, Math.min(curve.length - 1, Math.round(t * FPS)))
  return 1 - curve[f] * (1 - l.duck)
}
