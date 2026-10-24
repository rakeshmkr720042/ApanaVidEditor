import type { AudioFx, MediaSource, VoiceFx } from '../types'
import { encodeWav } from './music'
import { getFFmpeg, runFFmpeg } from '../lib/ffmpeg'

/**
 * Sound effects, offline. A sound goes through (each step only when it is on):
 *  1. pitch change (resample + ffmpeg's atempo, so the length stays the same);
 *  2. the browser's filters: equalizer, the voice changer's band, drive and ring modulation,
 *     compressor, echo and reverb;
 *  3. stereo: mono, one side, swapped sides, balance;
 *  4. loudness to a target (EBU R128 / BS.1770 measure) and a look-ahead peak limiter;
 *  5. reverse.
 * Like Remove noise, the result is made once per source and setting (see denoise.ts) and played by the
 * preview and mixed by the export, so both sound the same. The file itself is never changed.
 */

export const RATE = 48000

export const DEFAULT_FX: AudioFx = {
  bass: 0, mid: 0, treble: 0, voice: 'none', pitch: 0, compress: 0, echo: 0, reverb: 0, room: 'room',
  loudness: null, limiter: false, channels: 'stereo', pan: 0, reverse: false,
}

/** The effects with every missing field filled in. */
export const fullFx = (fx: Partial<AudioFx> | null | undefined): AudioFx => ({ ...DEFAULT_FX, ...(fx ?? {}) })

/** True when the settings change nothing. */
export function isNeutralFx(fx: AudioFx | null | undefined) {
  if (!fx) return true
  const f = fullFx(fx)
  return !f.bass && !f.mid && !f.treble && f.voice === 'none' && !f.pitch && !f.compress && !f.echo && !f.reverb &&
    f.loudness == null && !f.limiter && f.channels === 'stereo' && !f.pan && !f.reverse
}

/** The effects to apply, or null when they change nothing (so no work is done for them). */
export const liveFx = (fx: AudioFx | null | undefined): AudioFx | null => (isNeutralFx(fx) ? null : fullFx(fx))

export const fxKey = (fx: AudioFx | null | undefined) => {
  const f = liveFx(fx)
  if (!f) return ''
  return [f.bass, f.mid, f.treble, f.voice, f.pitch, f.compress, f.echo, f.reverb, f.room, f.loudness ?? '', +f.limiter, f.channels, f.pan, +!!f.reverse].join(',')
}

/** Where an audio layer that plays backwards starts in its reversed sound. */
export const reversedIn = (l: { in: number; start: number; end: number; speed?: number }, src: MediaSource) =>
  Math.max(0, src.duration - l.in - (l.end - l.start) * (l.speed ?? 1))

// ---- presets

export const EQ_PRESETS: { id: string; name: string; bass: number; mid: number; treble: number }[] = [
  { id: 'flat', name: 'Flat', bass: 0, mid: 0, treble: 0 },
  { id: 'voice', name: 'Voice boost', bass: -3, mid: 4, treble: 3 },
  { id: 'podcast', name: 'Podcast', bass: 2, mid: 2, treble: 4 },
  { id: 'bass', name: 'Bass boost', bass: 8, mid: 0, treble: 0 },
  { id: 'treble', name: 'Treble boost', bass: 0, mid: 0, treble: 7 },
  { id: 'warm', name: 'Warm', bass: 4, mid: 1, treble: -3 },
  { id: 'bright', name: 'Bright', bass: -2, mid: 1, treble: 5 },
  { id: 'lessbass', name: 'Less bass', bass: -9, mid: 0, treble: 1 },
  { id: 'muffled', name: 'Muffled', bass: 3, mid: -4, treble: -12 },
]

interface VoiceDef {
  id: VoiceFx; name: string; emoji: string
  pitch?: number // semitones, added to the pitch slider
  band?: [number, number] // high-pass and low-pass, Hz
  drive?: number // 0..1 distortion
  ring?: { freq: number; mix: number } // ring modulation: robotic / alien
  bass?: number; mid?: number; treble?: number // added to the equalizer
}

export const VOICES: VoiceDef[] = [
  { id: 'none', name: 'Normal', emoji: '🙂' },
  { id: 'deep', name: 'Deep', emoji: '🧔', pitch: -4, bass: 3 },
  { id: 'child', name: 'Child', emoji: '🧒', pitch: 4, treble: 2, bass: -2 },
  { id: 'chipmunk', name: 'Chipmunk', emoji: '🐿️', pitch: 8, bass: -3 },
  { id: 'monster', name: 'Monster', emoji: '👹', pitch: -9, drive: 0.35, bass: 4 },
  { id: 'robot', name: 'Robot', emoji: '🤖', ring: { freq: 55, mix: 0.85 }, mid: 3 },
  { id: 'alien', name: 'Alien', emoji: '👽', pitch: 3, ring: { freq: 420, mix: 0.5 } },
  { id: 'telephone', name: 'Telephone', emoji: '📞', band: [400, 3400], drive: 0.2, mid: 4 },
  { id: 'radio', name: 'Old radio', emoji: '📻', band: [250, 5000], drive: 0.12, mid: 5 },
  { id: 'megaphone', name: 'Megaphone', emoji: '📢', band: [600, 4000], drive: 0.6, mid: 6 },
]

export const voiceDef = (id: VoiceFx) => VOICES.find((v) => v.id === id) ?? VOICES[0]

/** Loudness targets people pick from. */
export const LOUDNESS: { value: number; label: string }[] = [
  { value: -14, label: 'YouTube / Reels (-14)' },
  { value: -16, label: 'Podcast (-16)' },
  { value: -23, label: 'TV (-23)' },
]

// ---- the steps

/** Total pitch change, slider and voice together, kept inside one octave each way. */
export const totalPitch = (f: AudioFx) => Math.max(-12, Math.min(12, f.pitch + (voiceDef(f.voice).pitch ?? 0)))

/** Pitch change by `semis` semitones with the same length: resample, then time-stretch back with ffmpeg. */
async function pitchStage(buf: AudioBuffer, semis: number): Promise<AudioBuffer> {
  const r = Math.pow(2, semis / 12)
  const ctx = new OfflineAudioContext(buf.numberOfChannels, Math.max(1, Math.ceil(buf.length / r)), buf.sampleRate)
  const src = new AudioBufferSourceNode(ctx, { buffer: buf, playbackRate: r })
  src.connect(ctx.destination)
  src.start()
  const fast = await ctx.startRendering()
  const ff = await getFFmpeg()
  await ff.writeFile('px_in.wav', new Uint8Array(await encodeWav(fast).arrayBuffer()))
  const ch = buf.numberOfChannels
  const { code } = await runFFmpeg(['-i', 'px_in.wav', '-filter:a', `atempo=${(1 / r).toFixed(6)}`, '-ac', String(ch), '-ar', String(buf.sampleRate), '-f', 'f32le', 'px_out.raw'])
  await ff.deleteFile('px_in.wav').catch(() => {})
  if (code !== 0) throw new Error('pitch change failed')
  const raw = (await ff.readFile('px_out.raw')) as Uint8Array
  await ff.deleteFile('px_out.raw').catch(() => {})
  const all = new Float32Array(raw.slice().buffer)
  // the same length as before, to the sample (interleaved samples to one array per side)
  const fixed = new AudioBuffer({ length: buf.length, numberOfChannels: ch, sampleRate: buf.sampleRate })
  for (let c = 0; c < ch; c++) {
    const d = fixed.getChannelData(c)
    for (let i = 0, j = c; i < d.length && j < all.length; i++, j += ch) d[i] = all[j]
  }
  return fixed
}

const ROOMS = { room: 0.7, hall: 1.9, cave: 3.4 } // reverb tail, seconds

/** A made-up room: decaying noise, a little different on each side. */
function impulse(ctx: BaseAudioContext, secs: number) {
  const n = Math.round(secs * ctx.sampleRate)
  const b = ctx.createBuffer(2, n, ctx.sampleRate)
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c)
    const pre = Math.round(0.012 * ctx.sampleRate) // early gap before the room answers
    for (let i = pre; i < n; i++) d[i] = rnd() * Math.pow(1 - (i - pre) / (n - pre), 3.2)
  }
  return b
}

function driveCurve(amount: number) {
  const k = amount * 60, n = 2048, c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return c
}

/** Equalizer, voice changer, compressor, echo and reverb with the browser's audio nodes. */
async function graphStage(buf: AudioBuffer, f: AudioFx): Promise<AudioBuffer> {
  const v = voiceDef(f.voice)
  const bass = f.bass + (v.bass ?? 0), mid = f.mid + (v.mid ?? 0), treble = f.treble + (v.treble ?? 0)
  const wide = f.echo > 0 || f.reverb > 0 // echo and reverb come out in stereo
  const chs = wide ? 2 : buf.numberOfChannels
  const ctx = new OfflineAudioContext(chs, Math.max(1, Math.round(buf.duration * RATE)), RATE)
  const src = new AudioBufferSourceNode(ctx, { buffer: buf })
  let node: AudioNode = src
  const add = (n: AudioNode) => { node.connect(n); node = n }
  if (v.band) {
    add(new BiquadFilterNode(ctx, { type: 'highpass', frequency: v.band[0], Q: 0.9 }))
    add(new BiquadFilterNode(ctx, { type: 'lowpass', frequency: v.band[1], Q: 0.9 }))
  }
  if (bass) add(new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: 120, gain: bass }))
  if (mid) add(new BiquadFilterNode(ctx, { type: 'peaking', frequency: 1500, Q: 0.8, gain: mid }))
  if (treble) add(new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 6000, gain: treble }))
  if (v.drive) {
    add(new GainNode(ctx, { gain: 1 + v.drive * 2 }))
    add(new WaveShaperNode(ctx, { curve: driveCurve(v.drive), oversample: '2x' }))
    add(new GainNode(ctx, { gain: 0.7 }))
  }
  if (v.ring) {
    // ring modulation: the sound times a steady tone, mixed with the plain sound
    const out = new GainNode(ctx, { gain: 1 })
    const dry = new GainNode(ctx, { gain: 1 - v.ring.mix })
    const ring = new GainNode(ctx, { gain: 0 })
    const osc = new OscillatorNode(ctx, { type: 'sine', frequency: v.ring.freq })
    const depth = new GainNode(ctx, { gain: v.ring.mix * 1.4 })
    osc.connect(depth).connect(ring.gain)
    osc.start()
    node.connect(dry).connect(out)
    node.connect(ring).connect(out)
    node = out
  }
  if (f.compress) {
    const set = [null, { threshold: -18, ratio: 2.5, knee: 12 }, { threshold: -26, ratio: 4, knee: 10 }, { threshold: -34, ratio: 8, knee: 6 }][f.compress]!
    add(new DynamicsCompressorNode(ctx, { ...set, attack: 0.008, release: 0.2 }))
  }
  if (wide) {
    const out = new GainNode(ctx, { gain: 1 })
    const dry = new GainNode(ctx, { gain: 1 - f.reverb * 0.3 })
    node.connect(dry).connect(out)
    if (f.echo > 0) {
      const delay = new DelayNode(ctx, { delayTime: 0.3, maxDelayTime: 1 })
      const fb = new GainNode(ctx, { gain: 0.2 + f.echo * 0.4 })
      const tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4500 }) // each repeat a little darker
      const wet = new GainNode(ctx, { gain: f.echo * 0.65 })
      node.connect(delay)
      delay.connect(tone).connect(fb).connect(delay)
      delay.connect(wet).connect(out)
    }
    if (f.reverb > 0) {
      const conv = new ConvolverNode(ctx, { buffer: impulse(ctx, ROOMS[f.room] ?? ROOMS.room) })
      const wet = new GainNode(ctx, { gain: f.reverb * 0.6 })
      node.connect(conv).connect(wet).connect(out)
    }
    node = out
  }
  node.connect(ctx.destination)
  src.start()
  return ctx.startRendering()
}

/** Stereo changes on the samples: mono, one side on both, swapped sides, then balance. */
function stereoStage(chs: Float32Array[], f: AudioFx): Float32Array[] {
  if (f.channels === 'stereo' && !f.pan) return chs
  let l = chs[0], r = chs[1] ?? chs[0]
  if (f.channels === 'mono') {
    const m = new Float32Array(l.length)
    for (let i = 0; i < m.length; i++) m[i] = (l[i] + r[i]) * 0.5
    l = r = m
  } else if (f.channels === 'left') r = l
  else if (f.channels === 'right') l = r
  else if (f.channels === 'swap') [l, r] = [r, l]
  if (f.pan) {
    // constant-power balance, so the middle stays as loud
    const a = ((f.pan + 1) * Math.PI) / 4
    const gl = Math.cos(a) * Math.SQRT2, gr = Math.sin(a) * Math.SQRT2
    const nl = new Float32Array(l.length), nr = new Float32Array(r.length)
    for (let i = 0; i < nl.length; i++) { nl[i] = l[i] * Math.min(1, gl); nr[i] = r[i] * Math.min(1, gr) }
    return [nl, nr]
  }
  // two separate sides, as later steps change each in place
  return [l, r === l ? l.slice() : r]
}

/** One biquad over a signal (direct form I), for the loudness measure. */
function biquad(x: Float32Array, b: number[], a: number[]) {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v
  }
  return y
}

/** Integrated loudness in LUFS (ITU-R BS.1770 with its gates), for 48 kHz samples. -Infinity when silent. */
export function measureLufs(chs: Float32Array[]): number {
  const k = chs.map((c) => biquad(
    biquad(c, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]),
    [1, -2, 1], [1, -1.99004745483398, 0.99007225036621],
  ))
  const hop = Math.round(0.1 * RATE)
  const n = k[0].length
  // squares summed every 100 ms, then 400 ms blocks overlapping by 75%
  const quarters: number[] = []
  for (let s = 0; s < n; s += hop) {
    let e = 0
    for (const c of k) for (let i = s; i < Math.min(n, s + hop); i++) e += c[i] * c[i]
    quarters.push(e)
  }
  const blocks: number[] = []
  for (let q = 0; q === 0 || q + 4 <= quarters.length; q++) {
    const part = quarters.slice(q, q + 4)
    blocks.push(part.reduce((a, b) => a + b, 0) / (part.length * hop))
  }
  const lufs = (e: number) => -0.691 + 10 * Math.log10(e + 1e-20)
  const abs = blocks.filter((e) => lufs(e) > -70)
  if (!abs.length) return -Infinity
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
  const rel = lufs(mean(abs)) - 10
  const gated = abs.filter((e) => lufs(e) > rel)
  return lufs(mean(gated.length ? gated : abs))
}

/** Look-ahead peak limiter: turns the sound down just before a peak would pass the ceiling. */
export function limitStage(chs: Float32Array[], ceilingDb = -1) {
  const ceil = Math.pow(10, ceilingDb / 20)
  const n = chs[0].length
  const look = Math.round(0.005 * RATE), rel = 1 - Math.exp(-1 / (0.08 * RATE))
  const need = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let p = 0
    for (const c of chs) p = Math.max(p, Math.abs(c[i]))
    need[i] = p > ceil ? ceil / p : 1
  }
  // the smallest gain needed in the next `look` samples (sliding minimum with a queue)
  const g = new Float32Array(n)
  const q = new Int32Array(n)
  let head = 0, tail = 0
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && need[q[tail - 1]] >= need[i]) tail--
    q[tail++] = i
    while (q[head] > i + look) head++
    g[i] = need[q[head]]
  }
  // release slowly after a peak, and ramp down smoothly before it
  for (let i = 1; i < n; i++) g[i] = Math.min(g[i], g[i - 1] + (1 - g[i - 1]) * rel)
  const step = 1 / look
  for (let i = n - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + step)
  for (const c of chs) for (let i = 0; i < n; i++) c[i] = Math.max(-ceil, Math.min(ceil, c[i] * g[i]))
}

/** Applies the effects to a sound. Returns 48 kHz audio of the same length. */
export async function applyFx(buf: AudioBuffer, fx: AudioFx, progress?: (p: number) => void): Promise<AudioBuffer> {
  const f = fullFx(fx)
  let b = buf
  const semis = totalPitch(f)
  if (semis) { b = await pitchStage(b, semis); progress?.(0.4) }
  b = await graphStage(b, f)
  progress?.(0.65)
  let chs: Float32Array[] = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c))
  chs = stereoStage(chs, f)
  if (f.loudness != null) {
    const now = measureLufs(chs)
    if (Number.isFinite(now)) {
      const gain = Math.pow(10, Math.min(24, f.loudness - now) / 20) // never more than +24 dB
      for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= gain
    }
    progress?.(0.85)
  }
  // a louder sound (loudness, boosts, echo) would clip: the limiter catches it
  if (f.limiter || f.loudness != null || f.bass > 0 || f.mid > 0 || f.treble > 0 || f.voice !== 'none' || f.echo || f.reverb) limitStage(chs)
  if (f.reverse) for (const c of chs) c.reverse()
  const out = new AudioBuffer({ length: chs[0].length, numberOfChannels: chs.length, sampleRate: RATE })
  chs.forEach((c, i) => out.copyToChannel(c as Float32Array<ArrayBuffer>, i))
  progress?.(1)
  return out
}
