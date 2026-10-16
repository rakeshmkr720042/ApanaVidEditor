/**
 * Built-in royalty-free music and sound effects. Everything is synthesised on the device
 * with Web Audio, so the library costs no download and works offline. Tracks are
 * deterministic (seeded), so a track sounds the same every time it is generated.
 */

type Drums = 'four' | 'boombap' | 'lofi' | 'trap' | 'tabla' | 'toms' | 'claps' | 'none'
type Bass = 'root' | 'octave' | '808' | 'walking' | 'funk' | 'none'
type Chords = 'pad' | 'rhodes' | 'strum' | 'stabs' | 'piano' | 'saw' | 'gated' | 'none'
type Arp = 'up' | 'piano' | 'bell' | 'saw' | 'none'
type Scale = 'major' | 'minor' | 'dorian' | 'bhairav' | 'kafi'

interface Style {
  id: string; name: string; mood: string; bpm: number; key: number; scale: Scale; prog: number[]; bars: number
  drums: Drums; bass: Bass; chords: Chords; arp: Arp; lead?: 'flute' | 'synth'; drone?: boolean; vinyl?: boolean; sidechain?: boolean; swing?: number
}

export const MUSIC: Style[] = [
  { id: 'lofi', name: 'Lofi Chill', mood: 'Chill', bpm: 78, key: 50, scale: 'minor', prog: [0, 5, 3, 4], bars: 28, drums: 'lofi', bass: 'root', chords: 'rhodes', arp: 'none', vinyl: true, swing: 0.12 },
  { id: 'ukulele', name: 'Happy Ukulele', mood: 'Happy', bpm: 112, key: 60, scale: 'major', prog: [0, 4, 5, 3], bars: 32, drums: 'claps', bass: 'root', chords: 'strum', arp: 'none', lead: 'synth' },
  { id: 'pop', name: 'Upbeat Pop', mood: 'Energetic', bpm: 120, key: 57, scale: 'major', prog: [0, 4, 5, 3], bars: 32, drums: 'four', bass: 'octave', chords: 'pad', arp: 'saw', sidechain: true },
  { id: 'cinematic', name: 'Cinematic Rise', mood: 'Epic', bpm: 70, key: 45, scale: 'minor', prog: [0, 5, 2, 6], bars: 20, drums: 'toms', bass: 'root', chords: 'pad', arp: 'piano' },
  { id: 'corporate', name: 'Bright Corporate', mood: 'Inspiring', bpm: 104, key: 62, scale: 'major', prog: [0, 5, 3, 4], bars: 32, drums: 'four', bass: 'root', chords: 'piano', arp: 'piano' },
  { id: 'hiphop', name: 'Boom Bap', mood: 'Urban', bpm: 90, key: 53, scale: 'minor', prog: [0, 0, 5, 4], bars: 28, drums: 'boombap', bass: 'walking', chords: 'stabs', arp: 'none', swing: 0.1 },
  { id: 'ambient', name: 'Ambient Dream', mood: 'Calm', bpm: 60, key: 52, scale: 'major', prog: [0, 3, 5, 4], bars: 16, drums: 'none', bass: 'none', chords: 'pad', arp: 'bell' },
  { id: 'edm', name: 'Festival Drop', mood: 'Energetic', bpm: 128, key: 55, scale: 'minor', prog: [0, 5, 2, 6], bars: 36, drums: 'four', bass: 'octave', chords: 'saw', arp: 'saw', sidechain: true },
  { id: 'piano', name: 'Romantic Piano', mood: 'Romantic', bpm: 72, key: 60, scale: 'major', prog: [0, 4, 5, 3], bars: 20, drums: 'none', bass: 'none', chords: 'piano', arp: 'piano' },
  { id: 'travel', name: 'Travel Vlog', mood: 'Happy', bpm: 116, key: 64, scale: 'major', prog: [0, 3, 0, 4], bars: 32, drums: 'claps', bass: 'octave', chords: 'strum', arp: 'bell' },
  { id: 'trap', name: 'Dark Trap', mood: 'Urban', bpm: 140, key: 49, scale: 'minor', prog: [0, 0, 5, 6], bars: 32, drums: 'trap', bass: '808', chords: 'pad', arp: 'bell' },
  { id: 'indian', name: 'Desi Vibes', mood: 'Indian', bpm: 96, key: 50, scale: 'kafi', prog: [0, 0, 3, 4], bars: 28, drums: 'tabla', bass: 'none', chords: 'none', arp: 'none', lead: 'flute', drone: true },
  { id: 'raga', name: 'Morning Raga', mood: 'Indian', bpm: 76, key: 52, scale: 'bhairav', prog: [0, 0, 3, 0], bars: 20, drums: 'tabla', bass: 'none', chords: 'none', arp: 'none', lead: 'flute', drone: true },
  { id: 'synthwave', name: 'Retro Synthwave', mood: 'Retro', bpm: 100, key: 52, scale: 'minor', prog: [0, 5, 3, 4], bars: 32, drums: 'four', bass: 'octave', chords: 'gated', arp: 'up' },
  { id: 'acoustic', name: 'Calm Acoustic', mood: 'Calm', bpm: 88, key: 55, scale: 'major', prog: [0, 4, 5, 3], bars: 24, drums: 'none', bass: 'root', chords: 'strum', arp: 'none' },
  { id: 'funk', name: 'Funky Groove', mood: 'Fun', bpm: 108, key: 57, scale: 'dorian', prog: [0, 3, 0, 3], bars: 32, drums: 'boombap', bass: 'funk', chords: 'stabs', arp: 'none', swing: 0.08 },
  { id: 'epic', name: 'Epic Trailer', mood: 'Epic', bpm: 84, key: 46, scale: 'minor', prog: [0, 5, 6, 4], bars: 24, drums: 'toms', bass: 'octave', chords: 'saw', arp: 'none' },
  { id: 'kids', name: 'Playful Kids', mood: 'Fun', bpm: 124, key: 65, scale: 'major', prog: [0, 3, 4, 0], bars: 32, drums: 'claps', bass: 'root', chords: 'stabs', arp: 'bell', lead: 'synth' },
]

const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  bhairav: [0, 1, 4, 5, 7, 8, 11], kafi: [0, 2, 3, 5, 7, 9, 10],
}

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
const seedOf = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

class Synth {
  ctx: OfflineAudioContext
  out: GainNode
  chordBus: GainNode
  noise: AudioBuffer
  constructor(ctx: OfflineAudioContext) {
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2
    this.out = ctx.createGain()
    this.out.gain.value = 0.8
    this.out.connect(comp).connect(ctx.destination)
    this.chordBus = ctx.createGain()
    this.chordBus.connect(this.out)
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    const r = rng(99)
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1
  }
  env(g: AudioParam, t: number, a: number, peak: number, decay: number, sustain: number, end: number, release: number) {
    g.setValueAtTime(0, t)
    g.linearRampToValueAtTime(peak, t + a)
    g.setTargetAtTime(peak * sustain, t + a, decay / 3)
    g.setValueAtTime(peak * sustain, Math.max(t + a, end))
    g.setTargetAtTime(0, Math.max(t + a, end), release / 3)
  }
  osc(type: OscillatorType, f: number, t: number, dur: number, dest: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator()
    o.type = type; o.frequency.value = f; o.detune.value = detune
    o.connect(dest); o.start(t); o.stop(t + dur + 0.05)
    return o
  }
  gain(v: number, dest: AudioNode | AudioParam) {
    const g = this.ctx.createGain(); g.gain.value = v
    if (dest instanceof AudioParam) g.connect(dest); else g.connect(dest)
    return g
  }
  filter(type: BiquadFilterType, f: number, q: number, dest: AudioNode) {
    const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b
  }
  noiseHit(t: number, dur: number, type: BiquadFilterType, f: number, vol: number, dest: AudioNode = this.out, q = 1) {
    const s = this.ctx.createBufferSource()
    s.buffer = this.noise
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    s.connect(this.filter(type, f, q, g)); g.connect(dest)
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02)
  }
  kick(t: number, vol = 1) {
    const g = this.gain(0, this.out)
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45)
    const o = this.osc('sine', 150, t, 0.5, g)
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  }
  snare(t: number, vol = 0.6) {
    this.noiseHit(t, 0.2, 'bandpass', 1800, vol, this.out, 0.7)
    const g = this.gain(0, this.out)
    g.gain.setValueAtTime(vol * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    this.osc('triangle', 190, t, 0.15, g)
  }
  hat(t: number, vol = 0.18, open = false) { this.noiseHit(t, open ? 0.25 : 0.05, 'highpass', 8000, vol) }
  clap(t: number, vol = 0.5) {
    for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.012, 0.12, 'bandpass', 1400, vol * (i === 2 ? 1 : 0.6), this.out, 1.2)
  }
  tom(t: number, f: number, vol = 0.9) {
    const g = this.gain(0, this.out)
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9)
    const o = this.osc('sine', f, t, 1, g)
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.15)
    this.noiseHit(t, 0.3, 'lowpass', 600, vol * 0.4)
  }
  tabla(t: number, kind: 'na' | 'ge' | 'tin', vol = 0.6) {
    if (kind === 'ge') {
      const g = this.gain(0, this.out)
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
      const o = this.osc('sine', 90, t, 0.7, g)
      o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(110, t + 0.25)
    } else {
      const f = kind === 'na' ? 620 : 880
      const g = this.gain(0, this.out)
      g.gain.setValueAtTime(vol * 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'na' ? 0.35 : 0.2))
      this.osc('sine', f, t, 0.4, g); this.osc('sine', f * 2.01, t, 0.3, this.gain(0.3, g))
      this.noiseHit(t, 0.03, 'bandpass', 3000, vol * 0.3)
    }
  }
  bass(t: number, m: number, dur: number, kind: Bass) {
    const g = this.gain(0, this.out)
    if (kind === '808') {
      this.env(g.gain, t, 0.005, 0.9, dur, 0.7, t + dur, 0.2)
      const o = this.osc('sine', hz(m), t, dur + 0.2, g)
      o.frequency.setValueAtTime(hz(m) * 1.5, t); o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.06)
      return
    }
    const f = this.filter('lowpass', kind === 'funk' ? 1400 : 600, kind === 'funk' ? 6 : 1, g)
    this.env(g.gain, t, 0.01, 0.55, 0.2, 0.6, t + dur * 0.9, 0.08)
    this.osc('sawtooth', hz(m), t, dur, f)
    this.osc('sine', hz(m - 12), t, dur, this.gain(0.6, g))
  }
  pad(t: number, notes: number[], dur: number, vol: number, kind: Chords, dest: AudioNode) {
    const g = this.gain(0, dest)
    if (kind === 'gated') {
      for (let k = 0; k < dur * 4; k++) {
        const tt = t + k * (dur / Math.ceil(dur * 4))
        g.gain.setValueAtTime(vol, tt); g.gain.setTargetAtTime(vol * 0.2, tt + 0.05, 0.05)
      }
    } else this.env(g.gain, t, kind === 'saw' ? 0.05 : 0.6, vol, 1, 0.8, t + dur, 0.8)
    const f = this.filter('lowpass', kind === 'saw' ? 3200 : 1800, 0.7, g)
    for (const n of notes) for (const d of [-8, 8]) this.osc(kind === 'pad' ? 'triangle' : 'sawtooth', hz(n), t, dur + 1, f, d)
  }
  keys(t: number, m: number, dur: number, vol: number, kind: 'rhodes' | 'piano' | 'bell' | 'pluck' | 'square', dest: AudioNode = this.out) {
    const g = this.gain(0, dest)
    const decay = kind === 'bell' ? 1.6 : kind === 'piano' ? 1.2 : kind === 'pluck' ? 0.35 : kind === 'square' ? 0.15 : 0.9
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.005)
    g.gain.setTargetAtTime(0, t + 0.01, decay / 3)
    g.gain.setTargetAtTime(0, t + dur, 0.08)
    const f = hz(m)
    if (kind === 'square') { this.osc('square', f, t, dur + 0.3, this.filter('lowpass', 2500, 2, g)); return }
    if (kind === 'pluck') {
      const lp = this.filter('lowpass', 4000, 1, g)
      lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.3)
      this.osc('sawtooth', f, t, dur + 0.5, lp); this.osc('triangle', f * 2, t, dur + 0.5, this.gain(0.3, lp))
      return
    }
    this.osc('sine', f, t, dur + decay, g)
    this.osc(kind === 'rhodes' ? 'triangle' : 'sine', f * 2, t, dur + decay, this.gain(kind === 'bell' ? 0.5 : 0.25, g))
    if (kind === 'bell') this.osc('sine', f * 3.01, t, dur + decay, this.gain(0.2, g))
    if (kind === 'piano') this.osc('sine', f * 3, t, dur, this.gain(0.08, g))
  }
  lead(t: number, m: number, dur: number, vol: number, kind: 'flute' | 'synth') {
    const g = this.gain(0, this.out)
    this.env(g.gain, t, kind === 'flute' ? 0.06 : 0.01, vol, 0.2, 0.75, t + dur * 0.9, 0.1)
    const o = this.osc(kind === 'flute' ? 'sine' : 'square', hz(m), t, dur + 0.2, kind === 'flute' ? g : this.filter('lowpass', 2200, 1, g))
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 5.5
    const depth = this.gain(kind === 'flute' ? 6 : 3, o.detune); lfo.connect(depth); lfo.start(t + 0.15); lfo.stop(t + dur + 0.2)
    if (kind === 'flute') this.noiseHit(t, dur * 0.8, 'bandpass', hz(m) * 2, vol * 0.06, this.out, 4)
  }
}

export const SAMPLE_RATE = 44100

/** Renders a library track. */
export async function renderTrack(id: string): Promise<AudioBuffer> {
  const st = MUSIC.find((m) => m.id === id) ?? MUSIC[0]
  const beat = 60 / st.bpm
  const bar = beat * 4
  const length = st.bars * bar + 3
  const ctx = new OfflineAudioContext(2, Math.ceil(length * SAMPLE_RATE), SAMPLE_RATE)
  const s = new Synth(ctx)
  const r = rng(seedOf(st.id))
  const scale = SCALES[st.scale]
  const note = (deg: number, oct = 0) => st.key + 12 * (oct + Math.floor(deg / 7)) + scale[((deg % 7) + 7) % 7]
  const sw = (i: number) => (i % 2 === 1 ? (st.swing ?? 0) * beat : 0)

  // Fade the whole song out at the end
  s.out.gain.setValueAtTime(0.8, (st.bars - 2) * bar)
  s.out.gain.linearRampToValueAtTime(0, st.bars * bar + 1)

  let melodyDeg = 4
  for (let b = 0; b < st.bars; b++) {
    const t0 = b * bar
    const intro = b < 4
    const brk = b >= st.bars - 8 && b < st.bars - 4
    const full = !intro && !brk
    const deg = st.prog[b % st.prog.length]
    const chord = [note(deg), note(deg + 2), note(deg + 4)]
    const seventh = note(deg + 6)

    if (st.drone) for (const m of [st.key - 12, st.key - 5]) s.pad(t0, [m], bar, 0.05, 'pad', s.out)

    // chords
    if (st.chords !== 'none') {
      const vol = intro ? 0.06 : 0.09
      if (st.chords === 'pad' || st.chords === 'saw' || st.chords === 'gated') s.pad(t0, chord, bar, vol * (st.chords === 'pad' ? 1 : 0.6), st.chords, s.chordBus)
      else if (st.chords === 'rhodes') for (const [i, m] of [...chord, seventh].entries()) s.keys(t0 + i * 0.02, m, bar * 0.95, 0.07, 'rhodes', s.chordBus)
      else if (st.chords === 'piano') for (const m of chord) s.keys(t0, m - 12, bar, 0.08, 'piano', s.chordBus)
      else if (st.chords === 'strum') {
        const pattern = [0, 1, 1.5, 2.5, 3, 3.5]
        for (const p of pattern) chord.forEach((m, i) => s.keys(t0 + p * beat + i * 0.015 + sw(p * 2), m, beat * 0.6, 0.06, 'pluck', s.chordBus))
      } else if (st.chords === 'stabs') {
        for (const p of [0.5, 1.75, 2.5, 3.75]) chord.forEach((m) => s.keys(t0 + p * beat, m, beat * 0.2, 0.05, 'square', s.chordBus))
      }
    }

    // sidechain pumping on the chord bus
    if (st.sidechain && full) for (let k = 0; k < 4; k++) {
      const t = t0 + k * beat
      s.chordBus.gain.setValueAtTime(0.25, t); s.chordBus.gain.linearRampToValueAtTime(1, t + beat * 0.8)
    }

    // arps
    if (st.arp !== 'none' && !intro) {
      const steps = st.arp === 'bell' ? 4 : 8
      const notes = [...chord, chord[0] + 12, chord[1] + 12]
      for (let k = 0; k < steps; k++) {
        const m = st.arp === 'up' || st.arp === 'saw' ? notes[k % notes.length] + 12 : notes[Math.floor(r() * notes.length)] + 12
        const t = t0 + (k * bar) / steps + sw(k)
        if (st.arp === 'saw') s.keys(t, m, bar / steps, 0.04, 'pluck')
        else s.keys(t, m, bar / steps, st.arp === 'bell' ? 0.05 : 0.045, st.arp === 'up' ? 'pluck' : st.arp === 'bell' ? 'bell' : 'piano')
      }
    }

    // bass
    if (st.bass !== 'none' && !intro) {
      const root = note(deg, -2)
      if (st.bass === 'root') { s.bass(t0, root, beat * 1.8, 'root'); s.bass(t0 + beat * 2, root, beat * 1.8, 'root') }
      else if (st.bass === 'octave') for (let k = 0; k < 8; k++) s.bass(t0 + (k * beat) / 2, root + (k % 2 ? 12 : 0), beat * 0.45, 'octave')
      else if (st.bass === '808') { s.bass(t0, root, beat * 1.5, '808'); s.bass(t0 + beat * 2.5, root, beat, '808') }
      else if (st.bass === 'walking') for (let k = 0; k < 4; k++) s.bass(t0 + k * beat + sw(k), note(deg + [0, 2, 4, 5][k], -2), beat * 0.9, 'walking')
      else if (st.bass === 'funk') for (const [p, d] of [[0, 0], [0.75, 7], [1.5, 0], [2, 3], [2.75, 4], [3.5, 7]]) s.bass(t0 + p * beat, note(deg + d, -2), beat * 0.3, 'funk')
    }

    // lead melody: a seeded walk over the scale
    if (st.lead && full) {
      const steps = st.lead === 'flute' ? 4 : 8
      for (let k = 0; k < steps; k++) {
        if (r() < 0.25) continue
        melodyDeg += Math.floor(r() * 5) - 2
        melodyDeg = Math.max(0, Math.min(11, melodyDeg))
        const len = (bar / steps) * (st.lead === 'flute' && r() < 0.4 ? 2 : 1)
        s.lead(t0 + (k * bar) / steps, note(melodyDeg, 1), len * 0.95, st.lead === 'flute' ? 0.09 : 0.05, st.lead)
      }
    }

    // drums
    if (full && st.drums !== 'none') for (let k = 0; k < 16; k++) {
      const t = t0 + (k * beat) / 4 + sw(k)
      switch (st.drums) {
        case 'four':
          if (k % 4 === 0) s.kick(t)
          if (k % 8 === 4) s.clap(t, 0.35)
          if (k % 4 === 2) s.hat(t, 0.15, true); else if (k % 2 === 0) s.hat(t, 0.08)
          break
        case 'boombap':
          if (k === 0 || k === 10 || (k === 7 && r() < 0.5)) s.kick(t, 0.9)
          if (k === 4 || k === 12) s.snare(t, 0.5)
          if (k % 2 === 0) s.hat(t, 0.1)
          break
        case 'lofi':
          if (k === 0 || k === 9) s.kick(t, 0.7)
          if (k === 4 || k === 12) s.snare(t, 0.3)
          if (k % 2 === 0) s.hat(t, 0.05)
          break
        case 'trap':
          if (k === 0 || k === 11) s.kick(t, 0.8)
          if (k === 8) s.clap(t, 0.5)
          s.hat(t, k % 2 ? 0.05 : 0.09)
          if (k >= 13 && b % 2) s.hat(t + beat / 8, 0.05)
          break
        case 'claps':
          if (k % 8 === 0) s.kick(t, 0.6)
          if (k % 8 === 4) s.clap(t, 0.35)
          if (k % 2 === 0) s.hat(t, 0.06)
          break
        case 'toms':
          if (k === 0) s.tom(t, 55, 1)
          if (k === 6 || k === 10) s.tom(t, 75, 0.6)
          if (k === 12 && b % 2) s.tom(t, 90, 0.7)
          break
        case 'tabla': {
          const pat: (null | 'na' | 'ge' | 'tin')[] = ['ge', null, 'na', 'tin', 'na', null, 'ge', 'na', 'ge', null, 'na', 'tin', 'na', 'tin', 'ge', 'na']
          const p = pat[k]
          if (p) s.tabla(t, p, 0.5)
          break
        }
      }
    }
    if (st.vinyl) for (let k = 0; k < 6; k++) s.noiseHit(t0 + r() * bar, 0.01, 'highpass', 3000, 0.04)
  }
  if (st.vinyl) s.noiseHit(0, length, 'bandpass', 1200, 0.004)
  return ctx.startRendering()
}

export const SFX: { id: string; name: string }[] = [
  { id: 'whoosh', name: 'Whoosh' }, { id: 'pop', name: 'Pop' }, { id: 'ding', name: 'Ding' },
  { id: 'click', name: 'Click' }, { id: 'rise', name: 'Riser' }, { id: 'boom', name: 'Boom' },
  { id: 'shutter', name: 'Camera' }, { id: 'notify', name: 'Notification' }, { id: 'swipe', name: 'Swipe' },
  { id: 'applause', name: 'Applause' }, { id: 'heartbeat', name: 'Heartbeat' }, { id: 'coin', name: 'Coin' },
]

export async function renderSfx(id: string): Promise<AudioBuffer> {
  const dur = id === 'applause' ? 3 : id === 'rise' ? 2.5 : id === 'heartbeat' ? 2 : 1.2
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SAMPLE_RATE), SAMPLE_RATE)
  const s = new Synth(ctx)
  const r = rng(seedOf(id))
  switch (id) {
    case 'whoosh': case 'swipe': {
      const src = ctx.createBufferSource(); src.buffer = s.noise; src.loop = true
      const f = s.filter('bandpass', 400, 2, s.out)
      const g = ctx.createGain(); g.connect(f)
      const len = id === 'swipe' ? 0.35 : 0.8
      f.frequency.setValueAtTime(300, 0); f.frequency.exponentialRampToValueAtTime(id === 'swipe' ? 6000 : 3000, len * 0.6); f.frequency.exponentialRampToValueAtTime(500, len)
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1.2, len * 0.5); g.gain.linearRampToValueAtTime(0, len)
      src.connect(g); src.start(0); src.stop(len)
      break
    }
    case 'pop': {
      const g = s.gain(0, s.out); g.gain.setValueAtTime(0.9, 0); g.gain.exponentialRampToValueAtTime(0.001, 0.12)
      const o = s.osc('sine', 300, 0, 0.15, g); o.frequency.setValueAtTime(900, 0); o.frequency.exponentialRampToValueAtTime(200, 0.1)
      break
    }
    case 'ding': s.keys(0, 88, 0.1, 0.5, 'bell'); s.keys(0, 95, 0.1, 0.2, 'bell'); break
    case 'click': s.noiseHit(0, 0.02, 'highpass', 2000, 0.8); s.keys(0, 96, 0.02, 0.2, 'square'); break
    case 'rise': {
      const g = s.gain(0, s.out); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.4, 2.3); g.gain.linearRampToValueAtTime(0, 2.45)
      const o = s.osc('sawtooth', 100, 0, 2.5, s.filter('lowpass', 3000, 3, g)); o.frequency.exponentialRampToValueAtTime(1200, 2.4)
      const src = ctx.createBufferSource(); src.buffer = s.noise; src.loop = true
      const f = s.filter('highpass', 500, 1, g); f.frequency.exponentialRampToValueAtTime(8000, 2.4)
      src.connect(f); src.start(0); src.stop(2.5)
      break
    }
    case 'boom': s.kick(0, 1); s.tom(0, 40, 1); s.noiseHit(0, 0.9, 'lowpass', 300, 0.8); break
    case 'shutter': s.noiseHit(0, 0.04, 'bandpass', 3000, 0.9, s.out, 2); s.noiseHit(0.09, 0.05, 'bandpass', 2000, 0.7, s.out, 2); break
    case 'notify': s.keys(0, 84, 0.12, 0.35, 'bell'); s.keys(0.14, 91, 0.2, 0.35, 'bell'); break
    case 'applause': for (let i = 0; i < 260; i++) s.noiseHit(r() * 2.6, 0.03, 'bandpass', 1500 + r() * 2500, 0.15 + r() * 0.2, s.out, 1.5); break
    case 'heartbeat': for (const t of [0, 0.28, 1, 1.28]) { s.kick(t, t % 1 ? 0.6 : 0.9) } break
    case 'coin': s.keys(0, 83, 0.08, 0.3, 'square'); s.keys(0.08, 88, 0.4, 0.3, 'square'); break
  }
  return ctx.startRendering()
}

/** 16-bit PCM WAV. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = Math.min(2, buf.numberOfChannels)
  const len = buf.length
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2))
  const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ')
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true)
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * ch * 2, true)
  out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true)
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i))
  let o = 44
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, chans[c][i]))
    out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
    o += 2
  }
  return new Blob([out.buffer], { type: 'audio/wav' })
}
