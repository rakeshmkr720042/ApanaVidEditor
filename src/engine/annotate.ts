import type { AnnoMark, AnnotateLayer, MainFrame, MediaSource, Project } from '../types'
import { posAt } from '../model/clipKeys'
import { contentRect, mainFrameOn } from '../model/mainFrame'
import { spanOn, type AnnoClock } from '../model/annotate'

/**
 * Smart Screen Annotate, drawn over the video: cursor highlight and trail (laser), spotlight, auto zoom, click
 * effects, the keys pressed, and the presenter's drawings (box, underline that starts as a highlight, arrows,
 * pen, highlighter, numbered steps). Everything is worked out from the time alone, so preview, scrubbing and
 * export draw the same picture, and nothing is kept between frames (light enough for phones).
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** 2D affine matrix [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Mat = [number, number, number, number, number, number]

export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const tr = (x: number, y: number): Mat => [1, 0, 0, 1, x, y]
const sc = (x: number, y = x): Mat => [x, 0, 0, y, 0, 0]
const rot = (deg: number): Mat => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, 0, 0] }
export const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]
}

export type LayerRectFn = (l: import('../types').MediaLayer) => { cx: number; cy: number; w: number; h: number; rotation: number }

/**
 * Where the layer's picture (0..1 of the recording, or of the screen when it follows none) lands on the canvas,
 * following the clip's crop, fit, turn, flip, zoom & move and the main frame, or the overlay's box.
 */
export function annoMatrix(l: AnnotateLayer, clock: AnnoClock, project: Project, sources: Record<string, MediaSource>, W: number, H: number, layerRect?: LayerRectFn): Mat {
  const src = l.sourceId ? sources[l.sourceId] : undefined
  if (clock.clip && src?.width && src.height) {
    const c = clock.clip
    const fw = src.width, fh = src.height
    const cr = c.crop ?? { x: 0, y: 0, w: 1, h: 1 }
    const sw = cr.w * fw, sh = cr.h * fh
    const turned = c.rotate % 180 !== 0
    const dw0 = turned ? sh : sw, dh0 = turned ? sw : sh
    const s = c.fit === 'fit' ? Math.min(W / dw0, H / dh0) : Math.max(W / dw0, H / dh0)
    let m: Mat = tr(W / 2, H / 2)
    if (c.pos || c.keys?.length) {
      const p = posAt(c, clock.T + (l.shift ?? 0))
      m = mul(m, mul(tr(p.x * W, p.y * H), mul(rot(p.rotation), sc(p.scale))))
    }
    m = mul(m, mul(rot(c.rotate), sc(c.flipH ? -1 : 1, c.flipV ? -1 : 1)))
    // picture 0..1 → pixels of the crop, centred
    m = mul(m, mul(sc(s), mul(tr(-cr.x * fw - sw / 2, -cr.y * fh - sh / 2), sc(fw, fh))))
    const f: MainFrame | null | undefined = project.main?.frame
    if (mainFrameOn(f)) {
      const r = contentRect(f!, W, H)
      m = mul([r.dw / W, 0, 0, r.dh / H, r.dx, r.dy], m)
    }
    return m
  }
  if (clock.media && layerRect) {
    const ml = clock.media
    const r = layerRect(ml)
    const cr = ml.crop ?? { x: 0, y: 0, w: 1, h: 1 }
    let m: Mat = mul(tr(r.cx, r.cy), rot(r.rotation))
    m = mul(m, sc(ml.flipH ? -1 : 1, ml.flipV ? -1 : 1))
    return mul(m, mul(sc(r.w / cr.w, r.h / cr.h), tr(-cr.x - cr.w / 2, -cr.y - cr.h / 2)))
  }
  return sc(W, H)
}

// ---- cursor

/** Cursor spot (0..1) at time T, or null when it is not known there. Smooth: a soft curve through the samples. */
export function cursorAt(l: AnnotateLayer, T: number): [number, number] | null {
  const c = l.cursor
  if (!c || !c.x.length) return null
  const f = T * c.fps
  const i = Math.floor(f)
  if (i < 0 || i >= c.x.length) return null
  const get = (k: number): [number, number] | null => {
    const j = Math.max(0, Math.min(c.x.length - 1, k))
    return c.x[j] < 0 ? null : [c.x[j] / 10000, c.y[j] / 10000]
  }
  const p1 = get(i)
  if (!p1) return null
  const p2 = get(i + 1) ?? p1
  const u = f - i
  if (!l.style.smooth) return [p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u]
  // Catmull-Rom through the neighbours
  const p0 = get(i - 1) ?? p1, p3 = get(i + 2) ?? p2
  const cr = (a: number, b: number, c2: number, d: number) =>
    0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u * u + (-a + 3 * b - 3 * c2 + d) * u * u * u)
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]
}

/** The cursor averaged over about a second, so the zoom glides instead of shaking. */
function calmCursor(l: AnnotateLayer, T: number): [number, number] | null {
  let sx = 0, sy = 0, n = 0
  for (let k = -6; k <= 6; k++) {
    const p = cursorAt(l, T + k * 0.08)
    if (p) { sx += p[0]; sy += p[1]; n++ }
  }
  return n ? [sx / n, sy / n] : null
}

// ---- marks in time order (binary search for the ones near T)

const sorted = new WeakMap<AnnoMark[], AnnoMark[]>()
function byTime(marks: AnnoMark[]) {
  let s = sorted.get(marks)
  if (!s) { s = [...marks].sort((a, b) => a.t - b.t); sorted.set(marks, s) }
  return s
}
/** Marks with t in [from, to]. */
function between(marks: AnnoMark[], from: number, to: number): AnnoMark[] {
  const s = byTime(marks)
  let lo = 0, hi = s.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid].t < from) lo = mid + 1; else hi = mid }
  const out: AnnoMark[] = []
  for (let i = lo; i < s.length && s[i].t <= to; i++) out.push(s[i])
  return out
}

const ease = (x: number) => { const v = Math.max(0, Math.min(1, x)); return v * v * (3 - 2 * v) }

/** How strongly a mode span is on at T (eases in and out over `edge` seconds). */
function spanAmount(l: AnnotateLayer, mode: 'spotlight' | 'zoom' | 'laser', T: number, edge = 0.35) {
  let best = 0
  for (const s of l.spans ?? []) {
    if (s.mode !== mode || T < s.from || T > s.to + edge) continue
    best = Math.max(best, Math.min(ease((T - s.from) / edge), 1 - ease((T - s.to) / edge)))
  }
  return best
}

/** Zoom at T: how much (1 = none) and the spot it centres on (0..1 of the picture). */
export function zoomAt(l: AnnotateLayer, T: number): { s: number; u: number; v: number } | null {
  const st = l.style
  if (st.zoom === 'off' || spanOn(l, 'hide', T)) return null
  let k = 0
  if (st.zoom === 'follow') k = 1
  else if (st.zoom === 'marked') k = spanAmount(l, 'zoom', T, 0.45)
  else {
    // at every click: in just before it, hold a while, out again
    for (const m of between(l.marks, T - 2.6, T + 0.4)) {
      if (m.kind !== 'click') continue
      const d = T - m.t
      k = Math.max(k, d < 0 ? ease(1 + d / 0.4) : 1 - ease((d - 1.8) / 0.6))
    }
  }
  if (k <= 0.001) return null
  let p = calmCursor(l, T)
  if (!p) {
    const last = between(l.marks, T - 3, T + 0.4).filter((m) => m.kind === 'click').pop()
    p = last ? [last.x ?? 0.5, last.y ?? 0.5] : [0.5, 0.5]
  }
  return { s: 1 + (st.zoomAmount - 1) * k, u: p[0], v: p[1] }
}

/** The canvas transform of a zoom: keeps the focus spot in view without showing past the picture's edges. */
export function zoomMatrix(z: { s: number; u: number; v: number }, m: Mat, W: number, H: number): Mat {
  const [fx, fy] = apply(m, z.u, z.v)
  const hw = W / (2 * z.s), hh = H / (2 * z.s)
  const cx = Math.max(hw, Math.min(W - hw, fx)), cy = Math.max(hh, Math.min(H - hh, fy))
  return mul(tr(W / 2, H / 2), mul(sc(z.s), tr(-cx, -cy)))
}

// ---- drawing

function withAlpha(hex: string, a: number) {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0')
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`
}

function polyLength(p: [number, number][]) {
  let len = 0
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  return len
}

/** Strokes a path drawn on bit by bit (p 0..1 of its length). */
function strokeOn(ctx: Ctx, pts: [number, number][], p: number, closed = false) {
  if (pts.length < 2) return
  const all = closed ? [...pts, pts[0]] : pts
  const len = polyLength(all)
  ctx.beginPath()
  ctx.moveTo(all[0][0], all[0][1])
  for (let i = 1; i < all.length; i++) ctx.lineTo(all[i][0], all[i][1])
  if (p < 1) { ctx.setLineDash([len * p, len + 1]); ctx.lineDashOffset = 0 }
  ctx.stroke()
  ctx.setLineDash([])
}

/** How long a drawing shows, and its fade (0..1) at T. */
function life(l: AnnotateLayer, m: AnnoMark, T: number, layerEndT: number) {
  const age = T - m.t
  if (age < 0) return 0
  const hold = l.style.fade > 0 ? l.style.fade : Math.max(0, layerEndT - m.t)
  return age <= hold ? 1 : Math.max(0, 1 - (age - hold) / 0.4)
}

const KEY_SECS = 1.6
const CLICK_SECS = 0.6

/**
 * Draws the layer at its own time T. `m` maps the picture (0..1) to the canvas (with any zoom already in it),
 * `zoom` is the zoom amount (lines grow a little with it), `layerEndT` the layer's last moment in its own time.
 */
export function drawAnnotate(ctx: Ctx, l: AnnotateLayer, T: number, W: number, H: number, m: Mat, zoom = 1, layerEndT = Infinity) {
  if (spanOn(l, 'hide', T)) return
  const st = l.style
  const u = Math.min(W, H) / 100 // one "unit": 1% of the short side
  const lw = u * 0.55 * Math.sqrt(zoom)
  const P = (x: number, y: number) => apply(m, x, y)
  const cur = cursorAt(l, T)
  const cp = cur ? P(cur[0], cur[1]) : null

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // spotlight: everything but the cursor's area goes dim
  const spot = st.spotlight === 'always' ? 1 : st.spotlight === 'marked' ? spanAmount(l, 'spotlight', T) : 0
  if (spot > 0 && cp) {
    const r = u * 14 * Math.sqrt(zoom)
    const g = ctx.createRadialGradient(cp[0], cp[1], r * 0.75, cp[0], cp[1], r * 1.2)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(1, `rgba(0,0,0,${(0.62 * spot).toFixed(3)})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // drawings, oldest first
  const from = st.fade > 0 ? T - st.fade - 0.5 : -Infinity
  for (const k of between(l.marks, from, T)) {
    if (k.kind === 'click' || k.kind === 'key') continue
    const a = life(l, k, T, layerEndT)
    if (a <= 0) continue
    const age = T - k.t
    const color = k.color ?? st.color
    ctx.globalAlpha = a
    const pts = k.pts ?? []
    if (k.kind === 'box' && pts.length >= 4) {
      const [x0, y0, x1, y1] = pts
      const corners = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]
      ctx.strokeStyle = color
      ctx.lineWidth = lw
      ctx.shadowColor = withAlpha(color, 0.6)
      ctx.shadowBlur = u * 1.2
      strokeOn(ctx, corners, ease(age / 0.35), true)
      ctx.shadowBlur = 0
    } else if (k.kind === 'underline' && pts.length >= 4) {
      // first a glowing highlight over the line, then it settles into a lasting underline
      const [x0, y0, x1] = pts
      const a0 = P(x0, y0), a1 = P(x1, y0)
      const grow = ease(age / 0.3)
      const settle = ease((age - 0.9) / 0.45)
      const band = u * 4.2 * Math.sqrt(zoom)
      const end: [number, number] = [a0[0] + (a1[0] - a0[0]) * grow, a0[1] + (a1[1] - a0[1]) * grow]
      // a yellow highlighter band over the words that shrinks away into the underline below them
      if (settle < 1) {
        const h = band * (1 - settle) + lw * settle
        const lift = (band / 2 - lw) * (1 - settle)
        ctx.globalAlpha = a * 0.45 * (1 - settle * 0.6)
        ctx.strokeStyle = '#ffe600'
        ctx.lineWidth = h
        ctx.lineCap = 'butt'
        ctx.shadowColor = 'rgba(255,230,0,0.8)'
        ctx.shadowBlur = u * 1.5 * (1 - settle)
        ctx.beginPath()
        ctx.moveTo(a0[0], a0[1] - lift)
        ctx.lineTo(end[0], end[1] - lift)
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.lineCap = 'round'
      }
      if (settle > 0) {
        ctx.globalAlpha = a * settle
        ctx.strokeStyle = color
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.moveTo(a0[0], a0[1])
        ctx.lineTo(end[0], end[1])
        ctx.stroke()
      }
    } else if ((k.kind === 'pen' || k.kind === 'highlight') && pts.length >= 4) {
      const line: [number, number][] = []
      for (let i = 0; i + 1 < pts.length; i += 2) line.push(P(pts[i], pts[i + 1]))
      if (k.kind === 'highlight') {
        ctx.globalAlpha = a * 0.4
        ctx.strokeStyle = k.color ?? '#ffe600'
        ctx.lineWidth = u * 3.6 * Math.sqrt(zoom)
        ctx.lineCap = 'butt'
        strokeOn(ctx, line, ease(age / 0.3))
        ctx.lineCap = 'round'
      } else {
        ctx.strokeStyle = color
        ctx.lineWidth = lw
        strokeOn(ctx, line, ease(age / 0.35))
      }
    } else if (k.kind === 'arrow' && pts.length >= 4) {
      const a0 = P(pts[0], pts[1]), a1 = P(pts[2], pts[3])
      const p = ease(age / 0.3)
      const e: [number, number] = [a0[0] + (a1[0] - a0[0]) * p, a0[1] + (a1[1] - a0[1]) * p]
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = lw
      ctx.beginPath()
      ctx.moveTo(a0[0], a0[1])
      ctx.lineTo(e[0], e[1])
      ctx.stroke()
      const ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0])
      const hl = Math.min(u * 3.2, Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) * 0.5) * p
      if (hl > 0.5) {
        ctx.beginPath()
        ctx.moveTo(e[0], e[1])
        ctx.lineTo(e[0] - hl * Math.cos(ang - 0.45), e[1] - hl * Math.sin(ang - 0.45))
        ctx.lineTo(e[0] - hl * Math.cos(ang + 0.45), e[1] - hl * Math.sin(ang + 0.45))
        ctx.closePath()
        ctx.fill()
      }
    } else if (k.kind === 'badge') {
      const [bx, by] = P(k.x ?? 0.5, k.y ?? 0.5)
      const pop = age < 0.18 ? ease(age / 0.18) * 1.18 : 1.18 - 0.18 * ease((age - 0.18) / 0.15)
      const r = u * 2.6 * pop
      if (r > 0.5) {
        ctx.fillStyle = color
        ctx.shadowColor = 'rgba(0,0,0,0.45)'
        ctx.shadowBlur = u
        ctx.beginPath()
        ctx.arc(bx, by, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.lineWidth = u * 0.35
        ctx.strokeStyle = '#ffffff'
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.font = `700 ${(r * 1.15).toFixed(1)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(k.text ?? '1', bx, by + r * 0.05)
      }
    }
    ctx.globalAlpha = 1
  }

  // laser / trail: a glowing line behind the cursor
  const laser = spanAmount(l, 'laser', T, 0.2)
  const trail = st.trail === 'always' ? 1 : st.trail === 'laser' ? laser : 0
  if (trail > 0 && cp) {
    const pts: [number, number][] = []
    for (let k = 14; k >= 0; k--) {
      const p = cursorAt(l, T - k * 0.03)
      if (p) pts.push(P(p[0], p[1]))
    }
    for (let i = 1; i < pts.length; i++) {
      const f = i / pts.length
      ctx.strokeStyle = withAlpha('#ff2d55', 0.85 * f * trail)
      ctx.lineWidth = u * (0.3 + 0.9 * f)
      ctx.shadowColor = '#ff2d55'
      ctx.shadowBlur = u * 1.4
      ctx.beginPath()
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1])
      ctx.lineTo(pts[i][0], pts[i][1])
      ctx.stroke()
    }
    ctx.shadowBlur = 0
  }

  // the cursor tip
  if (cp && laser > 0.5) {
    const r = u * 1.1
    const g = ctx.createRadialGradient(cp[0], cp[1], 0, cp[0], cp[1], r * 2.6)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.25, '#ff2d55')
    g.addColorStop(1, 'rgba(255,45,85,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cp[0], cp[1], r * 2.6, 0, Math.PI * 2)
    ctx.fill()
  } else if (cp && st.cursor !== 'none') {
    const r = u * (st.cursor === 'big' ? 4.2 : 3) * Math.sqrt(zoom)
    if (st.cursor === 'ring') {
      ctx.strokeStyle = withAlpha(st.cursorColor, 0.95)
      ctx.lineWidth = u * 0.5
      ctx.beginPath()
      ctx.arc(cp[0], cp[1], r * 0.8, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      const g = ctx.createRadialGradient(cp[0], cp[1], 0, cp[0], cp[1], r)
      g.addColorStop(0, withAlpha(st.cursorColor, 0.55))
      g.addColorStop(0.6, withAlpha(st.cursorColor, 0.3))
      g.addColorStop(1, withAlpha(st.cursorColor, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cp[0], cp[1], r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // clicks
  if (st.clicks !== 'none') {
    for (const k of between(l.marks, T - CLICK_SECS, T)) {
      if (k.kind !== 'click') continue
      const age = (T - k.t) / CLICK_SECS
      const [x, y] = P(k.x ?? 0.5, k.y ?? 0.5)
      const color = k.color ?? (k.right ? '#5ac8fa' : st.clickColor)
      const fade = 1 - age
      ctx.strokeStyle = withAlpha(color, fade)
      ctx.fillStyle = withAlpha(color, fade * 0.5)
      if (st.clicks === 'ripple') {
        for (const d of [0, 0.22]) {
          const g = age - d
          if (g <= 0) continue
          ctx.lineWidth = u * 0.6 * (1 - g)
          ctx.beginPath()
          ctx.arc(x, y, u * (1 + 5.5 * ease(g)), 0, Math.PI * 2)
          ctx.stroke()
        }
        if (age < 0.35) { ctx.beginPath(); ctx.arc(x, y, u * 1.1, 0, Math.PI * 2); ctx.fill() }
      } else if (st.clicks === 'burst') {
        ctx.lineWidth = u * 0.5
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2
          const r0 = u * (1.2 + 3 * ease(age)), r1 = r0 + u * 1.8 * (1 - age)
          ctx.beginPath()
          ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0)
          ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1)
          ctx.stroke()
        }
      } else {
        ctx.fillStyle = withAlpha(color, 0.55 * fade)
        ctx.beginPath()
        ctx.arc(x, y, u * (4 - 2.5 * ease(age)), 0, Math.PI * 2)
        ctx.fill()
      }
      if (k.right && age < 0.8) {
        ctx.fillStyle = withAlpha('#ffffff', fade)
        ctx.font = `700 ${(u * 1.6).toFixed(1)}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('R', x + u * 3, y - u * 3)
      }
    }
  }

  // keys pressed: pills at the bottom, the newest lowest
  if (st.keys) {
    const keys = between(l.marks, T - KEY_SECS, T).filter((k) => k.kind === 'key' && k.text).slice(-3)
    const fs = u * 3.6
    ctx.font = `600 ${fs.toFixed(1)}px system-ui, "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let y = H - u * 7
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i]
      const age = T - k.t
      const a = Math.min(ease(age / 0.12), 1 - ease((age - (KEY_SECS - 0.35)) / 0.35))
      if (a <= 0) continue
      const w = ctx.measureText(k.text!).width + fs * 1.4, h = fs * 1.7
      ctx.globalAlpha = a
      ctx.fillStyle = 'rgba(20,20,24,0.82)'
      roundRect(ctx, W / 2 - w / 2, y - h / 2, w, h, h * 0.3)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'
      ctx.lineWidth = Math.max(1, u * 0.15)
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(k.text!, W / 2, y + fs * 0.04)
      y -= h * 1.18
    }
    ctx.globalAlpha = 1
  }
  ctx.restore()
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** A short soft "tick" for the click sound (made once, mono). */
export function clickSound(rate: number): AudioBuffer {
  const len = Math.round(rate * 0.06)
  const buf = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: rate })
  const d = buf.getChannelData(0)
  let seed = 7
  for (let i = 0; i < len; i++) {
    seed = (seed * 16807) % 2147483647
    const noise = (seed / 2147483647) * 2 - 1
    const env = Math.exp(-i / (rate * 0.006))
    d[i] = (noise * 0.35 + Math.sin((i / rate) * 2 * Math.PI * 2200) * 0.65) * env * 0.5
  }
  return buf
}
