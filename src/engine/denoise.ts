import type { AudioFx, Denoise, MediaSource, Project } from '../types'
import { decodeAudio } from '../lib/media'
import { encodeWav } from './music'
import { applyFx, fxKey, liveFx } from './soundfx'
import type { DenoiseJob, DenoiseReply, SpectralOpts } from './denoise.worker'

/**
 * Background-noise removal, offline. A sound goes through:
 *  1. rumble cut (high-pass) and hum notches (50/60 Hz and overtones), done by the browser's filters;
 *  2. the noise reducer (in denoise.worker.ts): RNNoise for speech ("voice"), or a spectral reducer for
 *     steady noise that keeps music ("any"); "strong" voice runs both;
 *  3. an optional gate that quietens what is left between words.
 * The cleaned sound is made once per source and setting, kept as a WAV, and played by the preview in
 * place of the original sound and mixed by the export. The source file itself is never changed.
 */

export const DEFAULT_DENOISE: Denoise = { level: 'medium', kind: 'voice', hum: 0, rumble: true, gate: false }

const RATE = 48000 // RNNoise's rate
const FRAME = 480

// ---- the steps

/** Rumble cut and hum notches, and resampling to 48 kHz. */
export async function filterStage(buf: AudioBuffer, d: Denoise): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.round(buf.duration * RATE)), RATE)
  const src = ctx.createBufferSource()
  src.buffer = buf
  let node: AudioNode = src
  const add = (f: BiquadFilterNode) => { node.connect(f); node = f }
  if (d.rumble) {
    for (let i = 0; i < 2; i++) add(new BiquadFilterNode(ctx, { type: 'highpass', frequency: 80, Q: 0.707 }))
  }
  if (d.hum) {
    // the hum and its first overtones, each notch about 4 Hz wide so the voice around it stays
    for (let k = 1; k <= 6; k++) add(new BiquadFilterNode(ctx, { type: 'notch', frequency: d.hum * k, Q: (d.hum * k) / 4 }))
  }
  node.connect(ctx.destination)
  src.start()
  return ctx.startRendering()
}

let worker: Worker | null = null
let jobId = 0
type Result = { channels: Float32Array[]; vad: Float32Array | null }
const jobs = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void; progress?: (p: number) => void }>()

function work(channels: Float32Array[], rnn: number, spectral: SpectralOpts | null, progress?: (p: number) => void) {
  if (!worker) {
    worker = new Worker(new URL('./denoise.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<DenoiseReply>) => {
      const j = jobs.get(e.data.id)
      if (!j) return
      if ('progress' in e.data) j.progress?.(e.data.progress)
      else {
        jobs.delete(e.data.id)
        if ('error' in e.data) j.reject(new Error(e.data.error))
        else j.resolve(e.data)
      }
    }
    worker.onerror = (e) => { for (const j of jobs.values()) j.reject(new Error(e.message)); jobs.clear(); worker?.terminate(); worker = null }
  }
  const id = ++jobId
  return new Promise<Result>((resolve, reject) => {
    jobs.set(id, { resolve, reject, progress })
    worker!.postMessage({ id, channels, rnn, spectral } satisfies DenoiseJob, channels.map((c) => c.buffer))
  })
}

/** Speech detector from the signal level, for the gate when there is no RNNoise: open above the noise floor. */
function levelVad(channels: Float32Array[]) {
  const frames = Math.ceil(channels[0].length / FRAME)
  const db = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let s = 0, k = 0
    for (const ch of channels) for (let i = f * FRAME; i < Math.min(ch.length, (f + 1) * FRAME); i++) { s += ch[i] * ch[i]; k++ }
    db[f] = 10 * Math.log10(s / Math.max(1, k) + 1e-12)
  }
  const floor = [...db].sort((a, b) => a - b)[Math.floor(frames * 0.15)] ?? -100
  return db.map((v) => (v > floor + 9 ? 1 : 0))
}

/** Lowers the sound where the detector says nobody speaks, with soft edges and a short hold. */
function gateStage(channels: Float32Array[], vad: Float32Array, floorDb: number) {
  const frames = vad.length
  const floor = Math.pow(10, floorDb / 20)
  const target = new Float32Array(frames)
  const hold = 20 // frames (200 ms) kept open after speech
  let open = -1e9
  // look 3 frames ahead so a word's start isn't clipped
  for (let f = 0; f < frames; f++) {
    if (vad[Math.min(frames - 1, f + 3)] > 0.5 || vad[f] > 0.5) open = f
    target[f] = f - open <= hold ? 1 : floor
  }
  const g = new Float32Array(frames)
  let v = target[0]
  for (let f = 0; f < frames; f++) {
    const k = target[f] > v ? 0.6 : 0.08 // fast attack, slower release
    v += (target[f] - v) * k
    g[f] = v
  }
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const p = i / FRAME - 0.5
      const f = Math.max(0, Math.floor(p)), w = Math.min(1, Math.max(0, p - f))
      ch[i] *= g[f] * (1 - w) + g[Math.min(frames - 1, f + 1)] * w
    }
  }
}

/** True when a stereo sound is really mono (both sides the same), so it is cleaned once. */
function sameSides(chs: Float32Array[]) {
  if (chs.length < 2) return false
  const [l, r] = chs
  for (let i = 0; i < l.length; i += 97) if (Math.abs(l[i] - r[i]) > 1e-4) return false
  return true
}

/** Removes background noise from a sound. Returns 48 kHz audio of the same length. */
export async function cleanBuffer(buf: AudioBuffer, d: Denoise, progress?: (p: number) => void): Promise<AudioBuffer> {
  const filtered = await filterStage(buf, d)
  progress?.(0.05)
  const all = Array.from({ length: filtered.numberOfChannels }, (_, c) => filtered.getChannelData(c).slice())
  const mono = sameSides(all)
  // voice: RNNoise (light keeps a little of the original under it, which sounds more natural; strong also
  // runs the spectral reducer over what is left). any sound: the spectral reducer only, so music stays.
  const voice = d.kind === 'voice'
  const rnn = voice ? (d.level === 'light' ? 0.8 : 1) : 0
  const spectral: SpectralOpts | null = voice
    ? (d.level === 'strong' ? { over: 2, floorDb: -20 } : null)
    : { light: { over: 1.5, floorDb: -10 }, medium: { over: 2.5, floorDb: -18 }, strong: { over: 4, floorDb: -28 } }[d.level]
  const r = await work(mono ? [all[0]] : all, rnn, spectral, (p) => progress?.(0.05 + p * 0.9))
  const chs = r.channels
  const vad = r.vad
  if (d.gate) gateStage(chs, vad ?? levelVad(chs), d.level === 'light' ? -12 : d.level === 'medium' ? -20 : -30)
  const out = new AudioBuffer({ length: chs[0].length, numberOfChannels: all.length, sampleRate: RATE })
  all.forEach((_, c) => out.copyToChannel(chs[mono ? 0 : c] as Float32Array<ArrayBuffer>, c))
  progress?.(1)
  return out
}

// ---- cleaned sounds per source and setting (noise removal and/or sound effects), shared by the preview and the export

/** Cache key of a source with its noise removal and sound effects ('' parts = off). */
export const denoiseKey = (sourceId: string, d: Denoise | null | undefined, fx?: AudioFx | null) =>
  `${sourceId}|${d ? `${d.kind}|${d.level}|${d.hum}|${+d.rumble}|${+d.gate}` : '-'}|${fxKey(fx)}`

/** The noise removal and sound effects an item asks for; null when it plays its sound as it is. */
export function soundJob(item: { denoise?: Denoise | null; fx?: AudioFx | null }): { dn: Denoise | null; fx: AudioFx | null } | null {
  const dn = item.denoise ?? null, fx = liveFx(item.fx)
  return dn || fx ? { dn, fx } : null
}

export interface CleanState { status: 'working' | 'ready' | 'error'; progress: number; blob?: Blob; source?: MediaSource; error?: string }

type Entry = CleanState & { done: Promise<Blob | null>; used: number; needed: boolean }
const cache = new Map<string, Entry>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())
let queue: Promise<unknown> = Promise.resolve()
const KEEP = 8 // cleaned sounds kept in memory

/** Called whenever a cleaned sound starts, moves on, finishes, or "hear original" is switched. */
export function onCleanChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }

export function cleanState(sourceId: string, d: Denoise | null | undefined, fx?: AudioFx | null): CleanState | undefined {
  return cache.get(denoiseKey(sourceId, d, fx))
}

function evict() {
  const old = [...cache.entries()].filter(([, e]) => e.status !== 'working').sort((a, b) => a[1].used - b[1].used)
  while (cache.size > KEEP && old.length) {
    const [k, e] = old.shift()!
    if (e.source) URL.revokeObjectURL(e.source.url)
    cache.delete(k)
  }
}

// keys the preview still wants; a sound asked for only by the preview is skipped once nobody wants it
// (a slider dragged across many values must not make every one of them)
let wanted = new Set<string>()

/** The cleaned sound of a source (made once, one at a time). Null when the source has no sound. */
export function cleanSound(src: MediaSource, d: Denoise | null | undefined, fx?: AudioFx | null, forPreview = false): Promise<Blob | null> {
  const key = denoiseKey(src.id, d, fx)
  const have = cache.get(key)
  if (have && have.status !== 'error') { have.used = performance.now(); if (!forPreview) have.needed = true; return have.done }
  const entry = { status: 'working', progress: 0, used: performance.now(), needed: !forPreview } as Entry
  const live = liveFx(fx)
  entry.done = (queue = queue.catch(() => {}).then(async () => {
    try {
      if (!entry.needed && !wanted.has(key)) { cache.delete(key); return null }
      const buf = src.kind === 'image' ? null : await decodeAudio(src.file)
      if (!buf) throw new Error('no sound')
      const share = d && live ? 0.6 : 1 // part of the progress bar for noise removal
      let out = d ? await cleanBuffer(buf, d, (p) => { entry.progress = p * share; emit() }) : buf
      if (live) out = await applyFx(out, live, (p) => { const a = d ? share : 0; entry.progress = a + p * (1 - a); emit() })
      const blob = encodeWav(out)
      entry.blob = blob
      entry.source = { ...src, id: `dn:${key}`, kind: 'audio', file: blob, url: URL.createObjectURL(blob), thumbs: [] }
      entry.status = 'ready'
      entry.progress = 1
      return blob
    } catch (e) {
      entry.status = 'error'
      entry.error = String((e as Error).message ?? e)
      return null
    } finally {
      emit()
      evict()
    }
  })) as Promise<Blob | null>
  cache.set(key, entry)
  emit()
  return entry.done
}

/** True when the source has a sound that can be cleaned (videos without sound have an empty waveform). */
export const hasSound = (src: MediaSource | undefined): src is MediaSource => !!src && src.kind !== 'image' && src.hasAudio && src.wave !== ''

let prepTimer: ReturnType<typeof setTimeout> | null = null
/**
 * Starts cleaning every sound the project asks for (the preview calls this on each change). It waits a moment
 * so a slider being dragged only makes the sound for where it stops.
 */
export function prepareCleanSounds(project: Project, sources: Record<string, MediaSource>) {
  const jobs: [MediaSource, Denoise | null, AudioFx | null][] = []
  for (const c of project.clips) { const j = soundJob(c); if (j && hasSound(sources[c.sourceId])) jobs.push([sources[c.sourceId], j.dn, j.fx]) }
  for (const l of project.layers) {
    if (l.type !== 'media' && l.type !== 'audio') continue
    const j = soundJob(l)
    if (j && hasSound(sources[l.sourceId])) jobs.push([sources[l.sourceId], j.dn, j.fx])
  }
  wanted = new Set(jobs.map(([s, d, fx]) => denoiseKey(s.id, d, fx)))
  if (prepTimer) clearTimeout(prepTimer)
  prepTimer = setTimeout(() => { for (const [s, d, fx] of jobs) void cleanSound(s, d, fx, true) }, 350)
}

let original = false
/** "Hear original": the preview plays the sound as it was, to compare. */
export function setHearOriginal(v: boolean) { if (original !== v) { original = v; emit() } }
export const hearingOriginal = () => original

/** The cleaned sound to play in the preview, or null (not ready yet, comparing, or nothing to do). */
export function previewSource(sourceId: string, d: Denoise | null | undefined, fx?: AudioFx | null): MediaSource | null {
  if ((!d && !liveFx(fx)) || original) return null
  const e = cache.get(denoiseKey(sourceId, d, fx))
  return e?.status === 'ready' ? e.source ?? null : null
}
