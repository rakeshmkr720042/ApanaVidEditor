import type { ShapeMask } from '../types'

type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}
const ctx2d = (c: Canvas) => c.getContext('2d') as Ctx

export const defaultShapeMask = (shape: ShapeMask['shape']): ShapeMask => ({
  shape, x: 0.5, y: 0.5, w: shape === 'mirror' ? 1 : 0.6, h: shape === 'mirror' ? 0.4 : 0.6, rotation: 0, feather: 0.1, round: 0, invert: false,
})

/** Shapes drawn in a unit box (-1..1 each way, y down), stretched to the mask's size. */
const UNIT: Partial<Record<ShapeMask['shape'], (c: Ctx) => void>> = {
  heart: (c) => {
    c.moveTo(0, 0.95)
    c.bezierCurveTo(-1.25, 0.15, -0.95, -1.05, 0, -0.45)
    c.bezierCurveTo(0.95, -1.05, 1.25, 0.15, 0, 0.95)
    c.closePath()
  },
  star: (c) => poly(c, 10, (i) => (i % 2 ? 0.45 : 1), -Math.PI / 2),
  diamond: (c) => poly(c, 4, () => 1, -Math.PI / 2),
  hexagon: (c) => poly(c, 6, () => 1, -Math.PI / 2),
  octagon: (c) => poly(c, 8, () => 1, -Math.PI / 2 + Math.PI / 8),
  triangle: (c) => { c.moveTo(0, -1); c.lineTo(1, 0.8); c.lineTo(-1, 0.8); c.closePath() },
  flower: (c) => poly(c, 180, (i) => 0.42 + 0.58 * Math.pow(Math.abs(Math.cos((i / 180) * Math.PI * 2 * 2.5)), 0.7), -Math.PI / 2),
  keyhole: (c) => {
    c.moveTo(0.5, -0.35); c.arc(0, -0.35, 0.5, 0, Math.PI * 2); c.closePath()
    c.moveTo(-0.18, -0.2); c.lineTo(0.18, -0.2); c.lineTo(0.42, 1); c.lineTo(-0.42, 1); c.closePath()
  },
  cross: (c) => {
    const a = 0.34
    c.moveTo(-a, -1); c.lineTo(a, -1); c.lineTo(a, -a); c.lineTo(1, -a); c.lineTo(1, a); c.lineTo(a, a)
    c.lineTo(a, 1); c.lineTo(-a, 1); c.lineTo(-a, a); c.lineTo(-1, a); c.lineTo(-1, -a); c.lineTo(-a, -a); c.closePath()
  },
  cloud: (c) => {
    for (const [x, y, r] of [[-0.55, 0.2, 0.45], [-0.15, -0.2, 0.55], [0.4, -0.05, 0.5], [0.6, 0.35, 0.38], [0, 0.4, 0.5], [-0.65, 0.5, 0.3]]) {
      c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); c.closePath()
    }
  },
  drop: (c) => {
    c.moveTo(0, -1)
    c.bezierCurveTo(0.35, -0.45, 0.68, -0.05, 0.68, 0.3)
    c.arc(0, 0.3, 0.68, 0, Math.PI)
    c.bezierCurveTo(-0.68, -0.05, -0.35, -0.45, 0, -1)
    c.closePath()
  },
  sparkle: (c) => {
    c.moveTo(0, -1)
    const k = 0.14
    c.quadraticCurveTo(k, -k, 1, 0); c.quadraticCurveTo(k, k, 0, 1); c.quadraticCurveTo(-k, k, -1, 0); c.quadraticCurveTo(-k, -k, 0, -1)
    c.closePath()
  },
}

function poly(c: Ctx, n: number, r: (i: number) => number, a0: number) {
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * Math.PI * 2) / n
    const x = Math.cos(a) * r(i), y = Math.sin(a) * r(i)
    if (i) c.lineTo(x, y); else c.moveTo(x, y)
  }
  c.closePath()
}

/** How far from the centre the shape reaches at least, as a fraction of its half size (to know when it covers all). */
const INNER: Record<ShapeMask['shape'], number> = {
  rect: 1, ellipse: 1, linear: 1, mirror: 1, heart: 0.4, star: 0.38, diamond: 0.7, hexagon: 0.86, octagon: 0.92, triangle: 0.5,
  flower: 0.42, keyhole: 0.22, cross: 0.34, cloud: 0.5, drop: 0.55, sparkle: 0.2,
}

/** The shape's outline, centred on (0, 0), for a picture w × h pixels. */
function shapePath(c: Ctx, m: ShapeMask, w: number, h: number) {
  const mw = m.w * w, mh = m.h * h
  const big = (w + h) * 4 // half planes and bands reach well past the picture
  c.beginPath()
  if (m.shape === 'rect') c.roundRect(-mw / 2, -mh / 2, mw, mh, Math.min(mw, mh) * 0.5 * m.round)
  else if (m.shape === 'ellipse') c.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2)
  else if (m.shape === 'linear') c.rect(-big, -big, big * 2, big) // everything above the line
  else if (m.shape === 'mirror') c.rect(-big, -mh / 2, big * 2, mh)
  else {
    // the path keeps the scaled points; the stroke of an edge is drawn after the scale is undone
    c.save()
    c.scale(Math.max(1e-4, mw / 2), Math.max(1e-4, mh / 2))
    ;(UNIT[m.shape] ?? UNIT.star!)(c)
    c.restore()
  }
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3))
const easeIn = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x)

/**
 * The mask at `local` seconds into an item `dur` seconds long, for a picture pw × ph pixels: with a reveal it
 * grows from nothing, may keep growing until it covers the picture, beats, and shrinks away at the end.
 * `edge` is how strongly the glowing outline shows (0 once it is off the picture).
 */
export function revealAt(m: ShapeMask, local: number, dur: number, pw: number, ph: number): { mask: ShapeMask; edge: number } {
  const r = m.reveal
  if (!r || m.shape === 'linear' || m.shape === 'mirror') return { mask: m, edge: r?.edge ? 1 : 0 }
  const open = Math.max(0, r.open)
  const e = open > 0 ? ease(local / open) : 1
  let k = e
  let rot = m.rotation + r.spin * (1 - e)
  let filled = 0
  if (r.fill) {
    // how big it has to get before the farthest corner is inside it
    const a = (m.w * pw) / 2, b = (m.h * ph) / 2
    const hx = Math.max(m.x, 1 - m.x) * pw, hy = Math.max(m.y, 1 - m.y) * ph
    const inner = INNER[m.shape]
    const turned = Math.abs(rot % 360) > 0.5 || Math.abs(r.spin) > 0.5
    const need = (turned ? Math.hypot(hx, hy) / Math.max(1e-3, Math.min(a, b) * inner) : Math.hypot(hx / Math.max(1e-3, a * inner), hy / Math.max(1e-3, b * inner)))
      * (1 + m.feather * 0.35) * 1.04
    const hold = 0.35, grow = Math.max(0.3, open * 0.8)
    filled = easeIn((local - open - hold) / grow)
    k = k * (1 + (Math.max(1, need) - 1) * filled)
  }
  if (r.pulse && e >= 1 && filled <= 0) {
    // lub-dub: two quick beats a little more than once a second
    const ph2 = ((local - open) * 1.1) % 1
    const beat = Math.exp(-Math.pow((ph2 - 0.1) / 0.05, 2)) + 0.6 * Math.exp(-Math.pow((ph2 - 0.32) / 0.05, 2))
    k *= 1 + 0.07 * beat
  }
  if (r.close > 0) {
    const c = ease((dur - local) / r.close)
    k *= c
    rot += r.spin * (1 - c)
  }
  k = Math.max(0, k)
  return {
    mask: { ...m, w: m.w * k, h: m.h * k, rotation: rot },
    edge: r.edge ? Math.max(0, 1 - filled * 1.5) * Math.min(1, k * 4) : 0,
  }
}

/** A glowing outline round the shape (after it was cut out with applyMask), w × h from 0,0. */
export function drawEdge(c: Ctx, m: ShapeMask, w: number, h: number, color: string, alpha: number) {
  if (alpha <= 0.01 || m.w <= 1e-3 || m.h <= 1e-3 || m.shape === 'linear' || m.shape === 'mirror') return
  const u = Math.min(w, h)
  c.save()
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalCompositeOperation = 'source-over'
  c.filter = 'none'
  c.translate(m.x * w, m.y * h)
  c.rotate((m.rotation * Math.PI) / 180)
  shapePath(c, m, w, h)
  c.lineJoin = 'round'
  c.globalAlpha = alpha * 0.55
  c.strokeStyle = color
  c.shadowColor = color
  c.shadowBlur = u * 0.035
  c.lineWidth = u * 0.022
  c.stroke()
  c.globalAlpha = alpha
  c.shadowBlur = u * 0.012
  c.strokeStyle = '#fff'
  c.lineWidth = u * 0.006
  c.stroke()
  c.restore()
}

const cache = new Map<string, Canvas>()

/** White where the picture shows, transparent where it is hidden (soft at the edges), w × h pixels. Cached. */
export function maskCanvas(m: ShapeMask, w: number, h: number): Canvas {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h))
  const key = `${m.shape}|${m.x.toFixed(4)}|${m.y.toFixed(4)}|${m.w.toFixed(4)}|${m.h.toFixed(4)}|${m.rotation.toFixed(2)}|${m.feather.toFixed(3)}|${m.round.toFixed(3)}|${m.invert}|${w}x${h}`
  const hit = cache.get(key)
  if (hit) return hit
  const out = makeCanvas(w, h)
  const c = ctx2d(out)
  const soft = m.feather * 0.12 * Math.min(w, h)
  if (soft > 0.5) c.filter = `blur(${soft.toFixed(1)}px)`
  c.translate(m.x * w, m.y * h)
  c.rotate((m.rotation * Math.PI) / 180)
  c.fillStyle = '#fff'
  shapePath(c, m, w, h)
  c.fill()
  c.filter = 'none'
  c.setTransform(1, 0, 0, 1, 0, 0)
  if (m.invert) {
    // the outside shows: white everywhere, then the shape taken out
    c.globalCompositeOperation = 'xor'
    c.fillRect(0, 0, w, h)
    c.globalCompositeOperation = 'source-over'
  }
  if (cache.size > 12) cache.delete(cache.keys().next().value!)
  cache.set(key, out)
  return out
}

/** Hides what lies outside the mask on canvas `c` (w × h from 0,0). */
export function applyMask(c: Ctx, m: ShapeMask, w: number, h: number) {
  c.save()
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalAlpha = 1
  c.filter = 'none'
  c.globalCompositeOperation = 'destination-in'
  c.drawImage(maskCanvas(m, w, h), 0, 0, w, h)
  c.restore()
}
