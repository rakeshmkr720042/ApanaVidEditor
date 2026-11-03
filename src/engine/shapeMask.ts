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

/** The shape's outline, centred on (0, 0), for a picture w × h pixels. */
function shapePath(c: Ctx, m: ShapeMask, w: number, h: number) {
  const mw = m.w * w, mh = m.h * h
  const big = (w + h) * 4 // half planes and bands reach well past the picture
  c.beginPath()
  if (m.shape === 'rect') c.roundRect(-mw / 2, -mh / 2, mw, mh, Math.min(mw, mh) * 0.5 * m.round)
  else if (m.shape === 'ellipse') c.ellipse(0, 0, mw / 2, mh / 2, 0, 0, Math.PI * 2)
  else if (m.shape === 'linear') c.rect(-big, -big, big * 2, big) // everything above the line
  else if (m.shape === 'mirror') c.rect(-big, -mh / 2, big * 2, mh)
  else if (m.shape === 'heart') {
    const sx = mw / 2, sy = mh / 2
    c.moveTo(0, sy * 0.95)
    c.bezierCurveTo(-sx * 1.25, sy * 0.15, -sx * 0.95, -sy * 1.05, 0, -sy * 0.45)
    c.bezierCurveTo(sx * 0.95, -sy * 1.05, sx * 1.25, sy * 0.15, 0, sy * 0.95)
    c.closePath()
  } else {
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 ? 0.45 : 1
      const px = Math.cos(ang) * r * (mw / 2), py = Math.sin(ang) * r * (mh / 2)
      if (i) c.lineTo(px, py); else c.moveTo(px, py)
    }
    c.closePath()
  }
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
