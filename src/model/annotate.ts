import type { AnnoKind, AnnoMark, AnnoSpan, AnnotateLayer, AnnotateStyle, Clip, Layer, MediaLayer, Project } from '../types'
import { clipSegments, layoutClips, type LaidClip } from './timeline'
import { uid } from '../lib/format'

/**
 * Smart Screen Annotate, the data side: the default look, turning a drawn stroke into a clean shape (a circle
 * becomes a box, a line becomes an underline), the cursor path, and finding where marks fall on the timeline.
 * Drawing is in src/engine/annotate.ts.
 */

export const defaultAnnoStyle = (): AnnotateStyle => ({
  color: '#ff3b30', cursor: 'glow', cursorColor: '#ffd60a', clicks: 'ripple', clickColor: '#ffd60a', keys: true,
  trail: 'laser', spotlight: 'marked', zoom: 'marked', zoomAmount: 1.8, fade: 5, smooth: true, sound: false,
})

export const newAnnotate = (start: number, end: number, sourceId: string | null = null): AnnotateLayer => ({
  id: uid(), type: 'annotate', start, end, sourceId, shift: 0, cursor: null, marks: [], spans: [], style: defaultAnnoStyle(),
})

/** Drawing tools: auto turns a circle into a box and a line into an underline; tap makes a click effect. */
export type AnnoTool = 'auto' | 'pen' | 'highlight' | 'arrow' | 'box' | 'underline' | 'badge' | 'tap'

export const ANNO_TOOLS: { value: AnnoTool; label: string }[] = [
  { value: 'auto', label: '✨ Smart pen' },
  { value: 'highlight', label: '🖍 Highlighter' },
  { value: 'arrow', label: '➜ Arrow' },
  { value: 'box', label: '▭ Box' },
  { value: 'underline', label: '⎁ Underline' },
  { value: 'pen', label: '✎ Pen' },
  { value: 'badge', label: '① Step number' },
  { value: 'tap', label: '◎ Click effect' },
]

/** Plain words for the list of marks. */
export const MARK_NAMES: Record<AnnoKind, string> = {
  click: 'Click', key: 'Key', box: 'Box', underline: 'Underline', pen: 'Drawing', highlight: 'Highlight', arrow: 'Arrow', badge: 'Step',
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Fewer points along a stroke (Ramer–Douglas–Peucker), keeping its shape. `ar` = picture width / height. */
export function simplify(pts: number[], ar: number, tol = 0.003): number[] {
  const n = pts.length / 2
  if (n <= 2) return pts.slice()
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack: [number, number][] = [[0, n - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const ax = pts[a * 2] * ar, ay = pts[a * 2 + 1], bx = pts[b * 2] * ar, by = pts[b * 2 + 1]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9
    let best = -1, far = 0
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i * 2] * ar - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / len
      if (d > far) { far = d; best = i }
    }
    if (far > tol && best > 0) { keep[best] = 1; stack.push([a, best], [best, b]) }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1])
  return out
}

/**
 * What a stroke drawn with a tool becomes. The smart pen looks at the shape: a loop round something becomes a
 * neat box round it, a mostly flat line becomes an underline, anything else stays a freehand drawing.
 * `pts` are x, y pairs (0..1), `ar` the picture's width / height (so circles are judged round on screen).
 */
export function shapeFromStroke(tool: AnnoTool, pts: number[], ar: number): { kind: AnnoKind; pts?: number[]; x?: number; y?: number } | null {
  const n = pts.length / 2
  if (!n) return null
  const xs: number[] = [], ys: number[] = []
  for (let i = 0; i < n; i++) { xs.push(pts[i * 2]); ys.push(pts[i * 2 + 1]) }
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const bw = (x1 - x0) * ar, bh = y1 - y0
  let len = 0
  for (let i = 1; i < n; i++) len += Math.hypot((xs[i] - xs[i - 1]) * ar, ys[i] - ys[i - 1])
  const tiny = len < 0.012 && Math.max(bw, bh) < 0.012
  const first = [xs[0], ys[0]], last = [xs[n - 1], ys[n - 1]]
  if (tool === 'tap' || (tiny && tool !== 'badge')) return tiny || tool === 'tap' ? { kind: 'click', x: last[0], y: last[1] } : null
  if (tool === 'badge') return { kind: 'badge', x: first[0], y: first[1] }
  const pad = 0.012
  const boxOf = () => [clamp01(x0 - pad / ar), clamp01(y0 - pad), clamp01(x1 + pad / ar), clamp01(y1 + pad)]
  const flatLine = () => {
    // the underline sits along the lower part of the drawn line, straight across its width
    const yy = [...ys].sort((a, b) => a - b)[Math.floor(n * 0.7)] ?? y1
    return [x0, yy, x1, yy]
  }
  if (tool === 'box') return { kind: 'box', pts: boxOf() }
  if (tool === 'underline') return { kind: 'underline', pts: flatLine() }
  if (tool === 'arrow') return { kind: 'arrow', pts: [first[0], first[1], last[0], last[1]] }
  if (tool === 'highlight') return { kind: 'highlight', pts: simplify(pts, ar) }
  if (tool === 'pen') return { kind: 'pen', pts: simplify(pts, ar) }
  // smart pen
  const gap = Math.hypot((last[0] - first[0]) * ar, last[1] - first[1])
  const size = Math.max(bw, bh)
  // a loop: ends near where it started, went round (path about as long as an ellipse in its box) and is not a flat scribble
  const closed = size > 0.02 && gap < Math.max(0.03, size * 0.35) && len > (bw + bh) * 1.3 && Math.min(bw, bh) > size * 0.1
  if (closed) return { kind: 'box', pts: boxOf() }
  const flat = bw > 0.03 && bh < Math.max(0.025, bw * 0.18) && len < bw * 1.5
  if (flat) return { kind: 'underline', pts: flatLine() }
  return { kind: 'pen', pts: simplify(pts, ar) }
}

/** A finished mark from a stroke, or null when nothing should be added. */
export function markFromStroke(tool: AnnoTool, pts: number[], ar: number, t: number, nextBadge: number): AnnoMark | null {
  const s = shapeFromStroke(tool, pts, ar)
  if (!s) return null
  return { id: uid(), t, ...s, ...(s.kind === 'badge' ? { text: String(nextBadge) } : {}) }
}

/** The next free step number on a layer. */
export const nextBadge = (l: AnnotateLayer) => l.marks.reduce((m, k) => (k.kind === 'badge' ? Math.max(m, Number(k.text) || 0) : m), 0) + 1

/**
 * Builds the stored cursor path from raw samples (time in seconds, x, y in 0..1, or null when the cursor was not
 * over the recorded picture), `fps` samples a second. Gaps of more than half a second count as unknown.
 */
export function cursorPath(samples: { t: number; x: number; y: number }[], dur: number, fps = 20): AnnotateLayer['cursor'] {
  if (!samples.length || dur <= 0) return null
  const n = Math.min(Math.ceil(dur * fps) + 1, 3 * 3600 * fps)
  const x = new Array<number>(n), y = new Array<number>(n)
  let j = 0
  for (let i = 0; i < n; i++) {
    const t = i / fps
    while (j + 1 < samples.length && samples[j + 1].t <= t) j++
    const s = samples[j]
    if (s.t > t + 0.5) { x[i] = -1; y[i] = -1; continue }
    const nx = s.x, ny = s.y
    const off = nx < -0.02 || nx > 1.02 || ny < -0.02 || ny > 1.02
    x[i] = off ? -1 : Math.round(clamp01(nx) * 10000)
    y[i] = off ? -1 : Math.round(clamp01(ny) * 10000)
  }
  return { fps, x, y }
}

/** Joins on/off switch times of a mode into spans; a mode still on at the end lasts until `end`. */
export function spansFrom(toggles: { t: number; mode: AnnoSpan['mode']; on: boolean }[], end: number): AnnoSpan[] {
  const open = new Map<AnnoSpan['mode'], number>()
  const out: AnnoSpan[] = []
  for (const s of toggles) {
    if (s.on && !open.has(s.mode)) open.set(s.mode, s.t)
    else if (!s.on && open.has(s.mode)) { out.push({ mode: s.mode, from: open.get(s.mode)!, to: s.t }); open.delete(s.mode) }
  }
  for (const [mode, from] of open) out.push({ mode, from, to: end })
  return out.sort((a, b) => a.from - b.from)
}

export const spanOn = (l: AnnotateLayer, mode: AnnoSpan['mode'], T: number) => !!l.spans?.some((s) => s.mode === mode && T >= s.from && T < s.to)

/** Where in the layer's own time (source seconds of its recording, or seconds from its start) the moment t falls. */
export interface AnnoClock { T: number; clip?: Clip; media?: MediaLayer }

/** Source time of a main-video clip at timeline time t, null when the clip is not on screen then. */
function clipSourceTime(it: LaidClip, t: number): number | null {
  if (t < it.start || t >= it.start + it.dur) return null
  const local = t - it.start
  for (const s of clipSegments(it.clip)) if (local < s.tEnd + 1e-9) return s.srcStart + Math.max(0, local - s.tStart) * s.speed
  return null
}

/**
 * The layer's clock at timeline time t: for a layer that follows a recording, the recording's own second on
 * screen (from the main video or an overlay showing it), so cuts, trims and speed changes stay in sync.
 */
export function annoClock(l: AnnotateLayer, project: Project, items: LaidClip[], t: number): AnnoClock | null {
  if (t < l.start || t >= l.end) return null
  const shift = l.shift ?? 0
  if (!l.sourceId) return { T: t - l.start - shift }
  for (const it of items) {
    if (it.clip.sourceId !== l.sourceId) continue
    const s = clipSourceTime(it, t)
    if (s !== null) return { T: s - shift, clip: it.clip }
  }
  for (const m of project.layers) {
    if (m.type !== 'media' || m.sourceId !== l.sourceId || t < m.start || t >= m.end) continue
    return { T: m.in + (t - m.start) * (m.speed ?? 1) - shift, media: m }
  }
  return null
}

/** Timeline times of the layer's clicks (for the click sound), inside [from, to). */
export function clickTimes(l: AnnotateLayer, project: Project, from = 0, to = Infinity): number[] {
  const clicks = l.marks.filter((m) => m.kind === 'click').map((m) => m.t + (l.shift ?? 0))
  if (!clicks.length) return []
  const out: number[] = []
  const add = (t: number) => { if (t >= from && t < to && t >= l.start && t < l.end && !spanOnAt(l, t, project)) out.push(t) }
  if (!l.sourceId) { for (const c of clicks) add(l.start + c); return out.sort((a, b) => a - b) }
  for (const it of layoutClips(project.clips).items) {
    if (it.clip.sourceId !== l.sourceId) continue
    for (const s of clipSegments(it.clip)) {
      for (const c of clicks) if (c >= s.srcStart && c < s.srcEnd) add(it.start + s.tStart + (c - s.srcStart) / s.speed)
    }
  }
  for (const m of project.layers) {
    if (m.type !== 'media' || m.sourceId !== l.sourceId) continue
    const sp = m.speed ?? 1
    for (const c of clicks) { const t = m.start + (c - m.in) / sp; if (t >= m.start && t < m.end) add(t) }
  }
  return [...new Set(out.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b)
}

/** True when effects were switched off (hide) at timeline time t. */
function spanOnAt(l: AnnotateLayer, t: number, project: Project) {
  if (!l.spans?.some((s) => s.mode === 'hide')) return false
  const c = annoClock(l, project, layoutClips(project.clips).items, t)
  return !!c && spanOn(l, 'hide', c.T)
}

/** Every annotate layer's click times with the sound on, for the preview and the export. */
export function clickSounds(project: Project, from = 0, to = Infinity): number[] {
  return project.layers
    .filter((l): l is AnnotateLayer => l.type === 'annotate' && l.style.sound)
    .flatMap((l) => clickTimes(l, project, from, to))
    .sort((a, b) => a - b)
}

export const isAnnotate = (l: Layer | null | undefined): l is AnnotateLayer => l?.type === 'annotate'
