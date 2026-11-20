import type { Clip, ClipKey, ClipPos } from '../types'
import { clipDuration, sourceAt } from './timeline'

/**
 * Cinematic camera moves in one tap: push-in, crash zoom, handheld, impact shake, earthquake, dutch tilt, spin-in
 * and slides. Each one is written as zoom & move keyframes on the clip (source seconds), so it plays the same in
 * preview and export, on every device, and can be fine-tuned later in Zoom & move.
 */

export type CameraId = 'push' | 'pull' | 'crash' | 'handheld' | 'impact' | 'quake' | 'dutch' | 'spin' | 'slideR' | 'slideL' | 'rise'
export interface CameraPreset { id: CameraId; name: string; icon: string; info: string }

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'push', name: 'Slow push-in', icon: '🎬', info: 'The camera slowly moves closer. Builds tension, great for talking.' },
  { id: 'pull', name: 'Pull back', icon: '🔭', info: 'Starts close and slowly reveals the whole scene.' },
  { id: 'crash', name: 'Crash zoom', icon: '💥', info: 'A sudden fast zoom in at the start, then it holds. For drama and comedy.' },
  { id: 'handheld', name: 'Handheld', icon: '🤳', info: 'Gentle drifting like a camera held in the hand. Makes still shots feel alive.' },
  { id: 'impact', name: 'Impact shake', icon: '👊', info: 'A hard shake at the start that settles down. For hits, drops and reveals.' },
  { id: 'quake', name: 'Earthquake', icon: '🌋', info: 'Strong shaking for the whole clip.' },
  { id: 'dutch', name: 'Dutch tilt', icon: '📐', info: 'The picture slowly tilts to one side. Feels tense or dreamy.' },
  { id: 'spin', name: 'Spin in', icon: '🌀', info: 'Comes in turning and zoomed, then settles. A punchy opening.' },
  { id: 'slideR', name: 'Slide right', icon: '➡️', info: 'A smooth sideways camera move (dolly) to the right.' },
  { id: 'slideL', name: 'Slide left', icon: '⬅️', info: 'A smooth sideways camera move (dolly) to the left.' },
  { id: 'rise', name: 'Rise up', icon: '⬆️', info: 'The camera lifts up slowly, like a crane shot.' },
]

const P = (x: number, y: number, scale: number, rotation = 0): ClipPos => ({ x, y, scale, rotation })
/** Zoom that keeps the frame's edges hidden while the picture moves by up to `a` (frame widths) and turns by up to `deg`. */
const cover = (a: number, deg: number) => 1 + 2 * a * 1.05 + Math.sin((Math.abs(deg) * Math.PI) / 180) * 1.9

/** Smooth wobble -1..1 (sum of sines with odd frequencies, so it never repeats visibly). */
export const wobble = (t: number, seed: number) =>
  (Math.sin(t * 2.1 + seed) * 0.5 + Math.sin(t * 3.7 + seed * 2.3) * 0.3 + Math.sin(t * 6.3 + seed * 4.1) * 0.2)

/**
 * The keyframes for a preset over the clip. `strength` 0..1 (0.6 is a good middle). Local times are turned into
 * source seconds so speed changes and ramps keep the move on the same frames.
 */
export function cameraKeys(c: Clip, id: CameraId, strength = 0.6): ClipKey[] {
  const s = Math.max(0.05, Math.min(1, strength))
  const dur = Math.max(0.1, clipDuration(c))
  const at = (local: number) => sourceAt(c, Math.max(0, Math.min(dur, local))).time
  const two = (a: ClipPos, b: ClipPos): ClipKey[] => [{ t: at(0), pos: a }, { t: at(dur), pos: b }]
  /** samples every 1/rate s of fn(local seconds), as straight glides */
  const sampled = (rate: number, until: number, fn: (u: number) => ClipPos, hold?: ClipPos): ClipKey[] => {
    const end = Math.min(dur, until)
    const n = Math.min(600, Math.max(2, Math.ceil(end * rate) + 1))
    const keys: ClipKey[] = []
    for (let i = 0; i < n; i++) { const u = (end * i) / (n - 1); keys.push({ t: at(u), pos: fn(u), lin: true }) }
    if (hold && end < dur - 0.01) keys.push({ t: at(dur), pos: hold })
    return keys
  }
  switch (id) {
    case 'push': return two(P(0, 0, 1), P(0, 0, 1 + 0.25 * s))
    case 'pull': return two(P(0, 0, 1 + 0.25 * s), P(0, 0, 1))
    case 'crash': {
      const z = 1 + 0.55 * s, fast = Math.min(0.22, dur / 3)
      return [{ t: at(0), pos: P(0, 0, 1) }, { t: at(fast), pos: P(0, 0, z) }, { t: at(dur), pos: P(0, 0, z * 1.03) }]
    }
    case 'handheld': {
      const a = 0.012 * s, r = 0.7 * s, z = cover(a, r) + 0.02
      return sampled(6, dur, (u) => P(wobble(u, 1) * a, wobble(u, 5) * a * 0.8, z, wobble(u * 0.8, 9) * r))
    }
    case 'impact': {
      const a = 0.06 * s, r = 2.5 * s, len = Math.min(dur, 0.9), z = cover(a, r)
      const settle = (u: number) => Math.exp(-u * 4.5)
      return sampled(30, len, (u) => P(wobble(u * 9, 2) * a * settle(u), wobble(u * 9, 7) * a * settle(u), z, wobble(u * 9, 3) * r * settle(u)), P(0, 0, z))
    }
    case 'quake': {
      const a = 0.03 * s, r = 1.5 * s, z = cover(a, r)
      return sampled(15, dur, (u) => P(wobble(u * 5, 4) * a, wobble(u * 5, 8) * a, z, wobble(u * 5, 6) * r))
    }
    case 'dutch': {
      const r = 6 * s
      // turning shows the corners: zoom in enough to hide them on a wide frame
      return two(P(0, 0, 1.05), P(0, 0, 1.05 + Math.sin((r * Math.PI) / 180) * 1.9, -r))
    }
    case 'spin': {
      const len = Math.min(dur, 0.7)
      return [{ t: at(0), pos: P(0, 0, 1 + 0.6 * s, -25 * s) }, { t: at(len), pos: P(0, 0, 1) }, { t: at(dur), pos: P(0, 0, 1) }]
    }
    case 'slideR': case 'slideL': {
      const z = 1 + 0.2 * s, m = (z - 1) / 2 * 0.9, d = id === 'slideR' ? -1 : 1
      return two(P(-d * m, 0, z), P(d * m, 0, z))
    }
    case 'rise': {
      const z = 1 + 0.2 * s, m = (z - 1) / 2 * 0.9
      return two(P(0, -m, z), P(0, m, z))
    }
  }
}
