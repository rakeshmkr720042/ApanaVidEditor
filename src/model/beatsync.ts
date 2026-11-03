import type { Clip, MediaSource } from '../types'
import { layoutClips, rampPoints } from './timeline'

/** Timeline length of a clip that shows `src` seconds of its source at its speed (or speed ramp). */
function srcPerSecond(c: Clip) {
  const pts = rampPoints(c)
  if (!pts) return c.speed
  // a ramp spends len/s_i seconds on each of its n equal source pieces
  return pts.length / pts.reduce((a, s) => a + 1 / s, 0)
}

/**
 * Trims the main clips so each cut lands on a beat (`cuts`: timeline seconds, in order). Clip i ends on the next
 * cut at least `minDur` after it starts; photos stretch to fit, videos show more or less of their source (moving
 * their start back when the source runs out). With `ramp`, every clip gets that speed ramp (velocity edit).
 * Clips after the last beat keep their length. Gaps go; transitions stay, centred on the beat.
 */
export function beatSync(clips: Clip[], cuts: number[], sources: Record<string, MediaSource>, ramp: string | null, minDur = 0.3): Clip[] {
  const out: Clip[] = []
  let k = 0
  for (const c0 of clips) {
    const c: Clip = { ...c0, ...(ramp !== undefined && ramp !== null ? { ramp } : {}) }
    delete c.gap
    const start = layoutClips([...out, c]).items[out.length].start
    while (k < cuts.length && cuts[k] < start + minDur) k++
    if (k >= cuts.length) { out.push(c); continue }
    const trans = c.transition ? c.transition.duration : 0
    const dur = cuts[k] - start + trans / 2
    k++
    const need = dur * srcPerSecond(c)
    const src = sources[c.sourceId]
    if (src?.kind === 'image' || !src) {
      c.out = c.in + need
    } else {
      const len = src.duration
      if (c.in + need <= len) c.out = c.in + need
      else if (need <= len) { c.in = Math.max(0, len - need); c.out = len }
      else { c.in = 0; c.out = len } // too short to reach the beat: shows all of it
    }
    out.push(c)
  }
  return out
}
