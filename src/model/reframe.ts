import type { AspectRatio, Clip, ClipKey, ClipPos, MediaSource, Project } from '../types'
import { NO_POS } from './clipKeys'

/**
 * Auto reframe (face-aware): turns a wide 16:9 video into 9:16 (or 1:1, 4:5) and moves the picture over time so
 * the person stays in the frame, like a camera operator following them. The moves are zoom & move keyframes on
 * each main clip (source seconds, straight glides), so they can be edited later in Zoom & move.
 * This file is pure (no browser): the face looks come from src/engine/reframe.ts.
 */

/** Where the person's face was at source second t (0..1 of the source picture), null = no one there. */
export interface Look { t: number; x: number | null; y: number | null }
/** follow = glides with the person all the time; steady = holds still and only moves when they leave the middle. */
export type ReframeStyle = 'follow' | 'steady'
export interface ReframeOptions { aspect: AspectRatio; style: ReframeStyle; zoom: number }
export const REFRAME_SHAPES: { value: AspectRatio; label: string; ratio: number }[] = [
  { value: '9:16', label: '9:16 Reels / Shorts', ratio: 9 / 16 },
  { value: '1:1', label: '1:1 Square', ratio: 1 },
  { value: '4:5', label: '4:5 Post', ratio: 4 / 5 },
]
/** A jump this big (of the picture) between two looks half a second apart is a cut, not a walk. */
const CUT_JUMP = 0.18
export const shapeRatio = (a: AspectRatio) => REFRAME_SHAPES.find((s) => s.value === a)?.ratio ?? 9 / 16

/** Fills the gaps (no one found) from the nearest look; the middle when no one is ever found. */
export function fillLooks(looks: Look[]): { t: number; x: number; y: number }[] {
  const found = looks.filter((l) => l.x !== null && l.y !== null)
  return looks.map((l) => {
    if (l.x !== null && l.y !== null) return { t: l.t, x: l.x, y: l.y }
    if (!found.length) return { t: l.t, x: 0.5, y: 0.4 }
    const n = found.reduce((b, f) => (Math.abs(f.t - l.t) < Math.abs(b.t - l.t) ? f : b))
    return { t: l.t, x: n.x!, y: n.y! }
  })
}

const median3 = (v: number[]) => v.map((x, i) => {
  if (i === 0 || i === v.length - 1) return x
  const a = [v[i - 1], x, v[i + 1]].sort((p, q) => p - q)
  return a[1]
})

/**
 * Gaussian-weighted local straight-line fit of values sampled at times ts (sigma in seconds): smooth like a
 * gaussian blur, but a person walking steadily stays exactly on the line, also at the ends (no lag or lead).
 */
export function smooth(ts: number[], v: number[], sigma: number): number[] {
  if (sigma <= 0) return v.slice()
  return v.map((_, i) => {
    let sw = 0, st = 0, sv = 0, stt = 0, stv = 0
    for (let j = 0; j < v.length; j++) {
      const d = ts[j] - ts[i]
      if (Math.abs(d) > sigma * 3) continue
      const w = Math.exp(-(d * d) / (2 * sigma * sigma))
      sw += w; st += w * d; sv += w * v[j]; stt += w * d * d; stv += w * d * v[j]
    }
    if (!sw) return v[i]
    const den = sw * stt - st * st
    // value of the fitted line at d = 0; a single point (or all at one time) is just the weighted mean
    return Math.abs(den) < 1e-9 ? sv / sw : (sv * stt - st * stv) / den
  })
}

/**
 * A steady camera: it stays where it is while the value is within `zone` of it, and only moves (to the new
 * spot) when the person has been outside for a moment. The jumps are softened afterwards by smooth().
 */
export function holdPath(ts: number[], v: number[], zone: number, settle = 0.6): number[] {
  if (!v.length) return []
  const out: number[] = []
  let cam = v[0], outSince: number | null = null
  for (let i = 0; i < v.length; i++) {
    if (Math.abs(v[i] - cam) > zone) {
      outSince ??= ts[i]
      if (ts[i] - outSince >= settle || Math.abs(v[i] - cam) > zone * 2.5) { cam = v[i]; outSince = null }
    } else outSince = null
    out.push(cam)
  }
  return out
}

/** Douglas-Peucker on (t, x, y): the fewest points whose straight lines stay within tol of the path. */
export function simplify(pts: { t: number; x: number; y: number }[], tol: number): { t: number; x: number; y: number }[] {
  if (pts.length <= 2) return pts.slice()
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    let worst = -1, wi = -1
    for (let i = a + 1; i < b; i++) {
      const k = (pts[i].t - pts[a].t) / (pts[b].t - pts[a].t || 1)
      const d = Math.max(Math.abs(pts[a].x + (pts[b].x - pts[a].x) * k - pts[i].x), Math.abs(pts[a].y + (pts[b].y - pts[a].y) * k - pts[i].y))
      if (d > worst) { worst = d; wi = i }
    }
    if (worst > tol) { keep[wi] = true; stack.push([a, wi], [wi, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

/**
 * How big the clip's picture is in the new frame (in frame widths / heights) when it fills it, at zoom 1.
 * Null when it can't be moved (rotated sideways or unknown size).
 */
export function pictureSize(c: Clip, src: MediaSource | undefined, ratio: number): { pw: number; ph: number } | null {
  if (!src?.width || !src.height) return null
  const cr = c.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const rot = c.rotate % 180 !== 0
  const a = rot ? (src.height * cr.h) / (src.width * cr.w) : (src.width * cr.w) / (src.height * cr.h)
  // fill: the picture covers the frame, so one side matches and the other is bigger
  return a >= ratio ? { pw: a / ratio, ph: 1 } : { pw: 1, ph: ratio / a }
}

/** The zoom & move that puts source point (fx, fy) in the middle of the frame, kept so no edge shows. */
export function centreOn(c: Clip, fx: number, fy: number, size: { pw: number; ph: number }, zoom: number, faceAt = 0.42): ClipPos {
  const cr = c.crop ?? { x: 0, y: 0, w: 1, h: 1 }
  let u = (fx - cr.x) / cr.w, v = (fy - cr.y) / cr.h
  if (c.flipH) u = 1 - u
  if (c.flipV) v = 1 - v
  const pw = size.pw * zoom, ph = size.ph * zoom
  const mx = (pw - 1) / 2, my = (ph - 1) / 2
  const clamp = (x: number, m: number) => Math.max(-m, Math.min(m, x))
  // the face sits a little above the middle (head room), like a person framed for a Reel
  return { x: clamp(-(u - 0.5) * pw, mx), y: clamp(-(v - 0.5) * ph + (faceAt - 0.5), my), scale: zoom, rotation: 0 }
}

/** The keyframes that follow the person through one clip. */
export function reframeKeys(c: Clip, src: MediaSource | undefined, looks: Look[], o: ReframeOptions): { pos: ClipPos | null; keys: ClipKey[] } {
  const size = pictureSize(c, src, shapeRatio(o.aspect))
  if (!size || c.rotate % 180 !== 0) return { pos: o.zoom > 1.001 ? { ...NO_POS, scale: o.zoom } : null, keys: [] }
  const inside = looks.filter((l) => l.t >= c.in - 1 && l.t <= c.out + 1).sort((a, b) => a.t - b.t)
  const pts = fillLooks(inside.length ? inside : [{ t: (c.in + c.out) / 2, x: null, y: null }])
  if (pts.length === 1 || src?.kind === 'image') {
    const p = centreOn(c, pts[0].x, pts[0].y, size, o.zoom)
    return { pos: p, keys: [] }
  }
  // a big jump between two looks is a cut in the video (or someone else): the camera jumps too, not glides
  const parts: { t: number; x: number; y: number }[][] = [[pts[0]]]
  for (let i = 1; i < pts.length; i++) {
    if (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) > CUT_JUMP) parts.push([])
    parts[parts.length - 1].push(pts[i])
  }
  const keys: ClipKey[] = []
  for (const part of parts) {
    const ts = part.map((p) => p.t)
    let xs = median3(part.map((p) => p.x)), ys = median3(part.map((p) => p.y))
    if (o.style === 'steady') {
      xs = smooth(ts, holdPath(ts, xs, 0.12 / size.pw), 0.35)
      ys = smooth(ts, holdPath(ts, ys, 0.12 / size.ph), 0.35)
    } else {
      xs = smooth(ts, xs, 0.8)
      ys = smooth(ts, ys, 1.2)
    }
    const path = ts.map((t, i) => ({ t, ...centreOn(c, xs[i], ys[i], size, o.zoom) }))
    const few = simplify(path.map((p) => ({ t: p.t, x: p.x, y: p.y })), 0.006)
    const prev = keys[keys.length - 1]
    if (prev) {
      // hold the old framing until just before the cut, then jump
      const cut = (prev.t + few[0].t) / 2
      keys.push({ t: cut - 0.02, pos: { ...prev.pos }, lin: true })
      few[0] = { ...few[0], t: cut }
    }
    for (const p of few) keys.push({ t: p.t, pos: { x: p.x, y: p.y, scale: o.zoom, rotation: 0 }, lin: true })
  }
  // a camera that never moves is just a fixed position
  const still = keys.every((k) => Math.abs(k.pos.x - keys[0].pos.x) < 0.006 && Math.abs(k.pos.y - keys[0].pos.y) < 0.006)
  if (keys.length === 1 || still) return { pos: keys[0].pos, keys: [] }
  return { pos: null, keys }
}

/** The whole project in the new shape, every main clip following its person. Layers keep their places. */
export function reframeProject(p: Project, sources: Record<string, MediaSource>, looks: Record<string, Look[]>, o: ReframeOptions): Project {
  const clips = p.clips.map((c) => {
    const src = sources[c.sourceId]
    if (c.fromTemplate || !src || src.kind === 'audio') return c
    const { pos, keys } = reframeKeys(c, src, looks[c.sourceId] ?? [], o)
    const next: Clip = { ...c, fit: 'fill', pos, keys }
    if (!keys.length) delete next.keys
    // Ken Burns already moves photos; keep it, it fills the frame too
    return next
  })
  return { ...p, clips, settings: { ...p.settings, aspect: o.aspect } }
}

/** Source seconds to look at for each video: every `step` seconds of the parts the main clips use. */
export function lookTimes(p: Project, sources: Record<string, MediaSource>, step = 0.5, max = 400): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const c of p.clips) {
    const s = sources[c.sourceId]
    if (!s || c.fromTemplate) continue
    if (s.kind === 'image') { out[s.id] ??= [0]; continue }
    if (s.kind !== 'video') continue
    const len = c.out - c.in
    const n = Math.max(2, Math.min(max, Math.ceil(len / step) + 1))
    const list = out[s.id] ?? []
    for (let i = 0; i < n; i++) list.push(c.in + (len * i) / (n - 1))
    out[s.id] = list
  }
  for (const id of Object.keys(out)) {
    const sorted = [...new Set(out[id].map((t) => Math.round(t * 20) / 20))].sort((a, b) => a - b)
    out[id] = sorted
  }
  return out
}
