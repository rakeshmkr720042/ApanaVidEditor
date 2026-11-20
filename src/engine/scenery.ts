import type { SceneFx, ScenePack } from '../types'

/**
 * Scenes behind and in front of a clip (flower garden, jungle safari, hill station, snow mountains, waterfall,
 * fountain, Paris). Everything is drawn in code: no image files, so the app does not grow and there is no
 * copyright risk (the Eiffel Tower is drawn by day only; its night lights are protected).
 *
 * A scene is a few depth layers (sky, far, middle, near). The still part of each layer is drawn once per size
 * and kept; every frame only places the layers (a slow camera move shifts near layers more than far ones) and
 * draws the living parts (water, clouds, birds), worked out from the time alone, so preview, seeking and export
 * always give the same picture. The front frame (leaves, flowers, mist close to the camera) is a set of
 * pre-drawn sprites that sway, plus a few particles.
 */

type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface PackInfo { id: ScenePack; name: string; emoji: string; free: boolean; light: string }

/** The scenes, in the order the panel shows them. `free`: the scene behind works without Premium. */
export const SCENE_PACKS: PackInfo[] = [
  { id: 'garden', name: 'Flower garden', emoji: '🌷', free: true, light: '#ffe2a8' },
  { id: 'hill', name: 'Hill station', emoji: '🏡', free: true, light: '#ffe6c4' },
  { id: 'jungle', name: 'Jungle safari', emoji: '🐘', free: false, light: '#d8f0b0' },
  { id: 'mountain', name: 'Snow mountains', emoji: '🏔️', free: false, light: '#d6e8ff' },
  { id: 'waterfall', name: 'Waterfall', emoji: '💦', free: false, light: '#d4f1ff' },
  { id: 'fountain', name: 'Fountain', emoji: '⛲', free: false, light: '#fff1d0' },
  { id: 'paris', name: 'Eiffel Tower', emoji: '🗼', free: false, light: '#ffe9c8' },
]

export const SCENE_MODES: { value: SceneFx['mode']; label: string }[] = [
  { value: 'front', label: 'Frame in front' }, { value: 'behind', label: 'Scene behind me' },
  { value: 'sandwich', label: 'Behind + in front' }, { value: 'side', label: 'Side by side' },
]

export const defaultScene = (pack: ScenePack, mode: SceneFx['mode'] = 'sandwich'): SceneFx =>
  ({ pack, mode, side: 'left', blur: 0.15, front: 0.5, light: true, shadow: true, move: 'push', living: true })

/** The scene goes behind the person (needs the AI person cutout). */
export const sceneBehind = (s: SceneFx | null | undefined) => !!s && s.mode !== 'front'
/** The front frame shows. */
export const sceneFront = (s: SceneFx | null | undefined) => !!s && s.mode !== 'behind'

/** Needs Premium: sandwich and side by side, and every scene behind except the free ones. The front frame is free. */
export function scenePremium(s: Pick<SceneFx, 'pack' | 'mode'>) {
  if (s.mode === 'front') return false
  if (s.mode === 'sandwich' || s.mode === 'side') return true
  return !SCENE_PACKS.find((p) => p.id === s.pack)?.free
}

export const packInfo = (id: ScenePack) => SCENE_PACKS.find((p) => p.id === id) ?? SCENE_PACKS[0]

/** Where the scene's landmark stands (0..1 across): in the middle, or across from the person in side mode. */
export const sceneFocus = (s: SceneFx) => (s.mode === 'side' ? (s.side === 'left' ? 0.7 : 0.3) : 0.5)

/** Camera move at a point of the clip (0..1): zoom and sideways shift (fraction of the width) for the nearest layer. */
export function sceneCamera(s: SceneFx, progress: number) {
  const p = Math.min(1, Math.max(0, progress))
  const ease = p * p * (3 - 2 * p)
  if (s.move === 'push') return { zoom: 1 + 0.1 * ease, dx: 0, pad: 0 }
  if (s.move === 'pan') return { zoom: 1, dx: 0.03 - 0.06 * ease, pad: 0.07 }
  return { zoom: 1, dx: 0, pad: 0 }
}

// ---------- small helpers ----------

function makeCanvas(w: number, h: number): Canvas {
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h))
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return c
}
const ctx2d = (c: Canvas) => c.getContext('2d') as Ctx

/** The same pseudo-random number for the same (i, k): particles need no saved state. */
const hash = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
type Rnd = () => number

function vgrad(c: Ctx, y0: number, y1: number, stops: [number, string][]) {
  const g = c.createLinearGradient(0, y0, 0, y1)
  for (const [o, col] of stops) g.addColorStop(o, col)
  return g
}

function sky(c: Ctx, w: number, h: number, top: string, mid: string, bottom: string, hy: number) {
  c.fillStyle = vgrad(c, 0, hy, [[0, top], [0.6, mid], [1, bottom]])
  c.fillRect(0, 0, w, h)
}

function sun(c: Ctx, x: number, y: number, r: number, core = '#fffbe8', glow = 'rgba(255,236,170,') {
  const g = c.createRadialGradient(x, y, 0, x, y, r * 6)
  g.addColorStop(0, `${glow}0.9)`)
  g.addColorStop(0.15, `${glow}0.45)`)
  g.addColorStop(1, `${glow}0)`)
  c.fillStyle = g
  c.fillRect(x - r * 6, y - r * 6, r * 12, r * 12)
  c.fillStyle = core
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill()
}

function cloud(c: Ctx, x: number, y: number, s: number, alpha: number, seed: number) {
  c.save()
  c.globalAlpha = alpha
  const r = rng(seed)
  const n = 5 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const cx = x + (i / (n - 1) - 0.5) * s * 2.2
    const rad = s * (0.35 + r() * 0.35) * (1 - Math.abs(i / (n - 1) - 0.5))
    const cy = y - rad * 0.4
    const g = c.createRadialGradient(cx, cy - rad * 0.3, rad * 0.2, cx, cy, rad)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.7, 'rgba(250,252,255,0.95)')
    g.addColorStop(1, 'rgba(230,238,248,0)')
    c.fillStyle = g
    c.beginPath(); c.arc(cx, cy, rad, 0, Math.PI * 2); c.fill()
  }
  c.restore()
}

/** Drifting clouds across the sky (t = 0 gives still clouds). */
function clouds(c: Ctx, w: number, h: number, t: number, n: number, yTop: number, yBot: number, alpha = 0.9, seed = 1) {
  const U = Math.min(w, h)
  for (let i = 0; i < n; i++) {
    const sp = 0.004 + hash(i, seed) * 0.006
    const x = (((hash(i, seed + 1) + t * sp) % 1.4) - 0.2) * w
    const y = yTop + hash(i, seed + 2) * (yBot - yTop)
    cloud(c, x, y, U * (0.08 + hash(i, seed + 3) * 0.1), alpha * (0.6 + hash(i, seed + 4) * 0.4), i * 31 + seed)
  }
}

/** A soft ridge line: sums of waves, filled down to the bottom. */
function ridge(w: number, base: number, amp: number, seed: number, rough = 0.25, step = 0) {
  const r = rng(seed)
  const f = [1 + r() * 1.5, 3 + r() * 3, 9 + r() * 8]
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28]
  const pts: [number, number][] = []
  const n = step || 90
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w
    const u = i / n
    const y = base - amp * (0.6 * Math.sin(u * f[0] * Math.PI + ph[0]) + 0.3 * Math.sin(u * f[1] * Math.PI + ph[1]) + rough * Math.sin(u * f[2] * Math.PI + ph[2]))
    pts.push([x, y])
  }
  return pts
}
function fillRidge(c: Ctx, pts: [number, number][], h: number, fill: string | CanvasGradient) {
  c.fillStyle = fill
  c.beginPath()
  c.moveTo(pts[0][0], h)
  for (const [x, y] of pts) c.lineTo(x, y)
  c.lineTo(pts[pts.length - 1][0], h)
  c.closePath()
  c.fill()
}
const ridgeAt = (pts: [number, number][], x: number) => {
  const w = pts[pts.length - 1][0]
  const u = Math.min(pts.length - 1.001, Math.max(0, (x / w) * (pts.length - 1)))
  const i = Math.floor(u), f = u - i
  return pts[i][1] * (1 - f) + pts[i + 1][1] * f
}

function pine(c: Ctx, x: number, y: number, ht: number, col: string, light?: string) {
  const w = ht * 0.36
  c.fillStyle = '#3b2a1c'
  c.fillRect(x - w * 0.05, y - ht * 0.12, w * 0.1, ht * 0.12)
  for (let i = 0; i < 4; i++) {
    const top = y - ht + (ht * 0.22) * i
    const bw = w * (0.45 + i * 0.2)
    const bot = top + ht * 0.36
    c.fillStyle = col
    c.beginPath(); c.moveTo(x, top); c.lineTo(x + bw / 2, bot); c.lineTo(x - bw / 2, bot); c.closePath(); c.fill()
    if (light) {
      c.fillStyle = light
      c.beginPath(); c.moveTo(x, top); c.lineTo(x - bw / 2, bot); c.lineTo(x - bw * 0.1, bot); c.closePath(); c.fill()
    }
  }
}

function roundTree(c: Ctx, x: number, y: number, ht: number, col: string, light: string, r: Rnd) {
  c.fillStyle = '#4a3423'
  c.fillRect(x - ht * 0.035, y - ht * 0.45, ht * 0.07, ht * 0.45)
  const R = ht * 0.32
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const cx = x + Math.cos(a) * R * 0.55, cy = y - ht * 0.62 + Math.sin(a) * R * 0.4
    c.fillStyle = col
    c.beginPath(); c.arc(cx, cy, R * (0.55 + r() * 0.25), 0, Math.PI * 2); c.fill()
  }
  c.fillStyle = light
  for (let i = 0; i < 4; i++) {
    c.beginPath(); c.arc(x - R * 0.35 + r() * R * 0.4, y - ht * 0.72 - r() * R * 0.3, R * (0.22 + r() * 0.15), 0, Math.PI * 2); c.fill()
  }
}

/** Haze over far layers: they fade into the sky colour with distance. */
function haze(c: Ctx, w: number, _h: number, y0: number, y1: number, col: string, a: number) {
  c.fillStyle = vgrad(c, y0, y1, [[0, col.replace('A', String(a))], [1, col.replace('A', '0')]])
  c.fillRect(0, y0, w, y1 - y0)
}

function birds(c: Ctx, w: number, h: number, t: number, n: number, seed: number, col = 'rgba(40,40,50,0.75)') {
  const U = Math.min(w, h)
  c.strokeStyle = col
  c.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const sp = 0.025 + hash(i, seed) * 0.02
    const x = (((hash(i, seed + 1) + t * sp) % 1.3) - 0.15) * w
    const y = (0.12 + hash(i, seed + 2) * 0.22) * h + Math.sin(t * 0.8 + i) * U * 0.01
    const s = U * (0.012 + hash(i, seed + 3) * 0.01)
    const flap = Math.sin(t * 9 + i * 2) * 0.6
    c.lineWidth = Math.max(1, s * 0.22)
    c.beginPath()
    c.moveTo(x - s, y - s * (0.2 + flap * 0.5))
    c.quadraticCurveTo(x - s * 0.4, y - s * 0.3, x, y)
    c.quadraticCurveTo(x + s * 0.4, y - s * 0.3, x + s, y - s * (0.2 + flap * 0.5))
    c.stroke()
  }
}

// ---------- the scenes ----------

interface Layer {
  depth: number // 0 = sky (does not move), 1 = nearest
  draw: (c: Ctx, w: number, h: number, focus: number) => void
  live?: (c: Ctx, w: number, h: number, t: number, focus: number) => void
}

const HZ = 0.56 // horizon, fraction of the height

const garden: Layer[] = [
  {
    depth: 0,
    draw: (c, w, h) => {
      sky(c, w, h, '#5fb4f0', '#a9dcff', '#eaf7ff', h * HZ)
      sun(c, w * 0.82, h * 0.13, Math.min(w, h) * 0.04)
    },
    live: (c, w, h, t) => clouds(c, w, h, t, 5, h * 0.06, h * 0.3, 0.85, 3),
  },
  {
    depth: 0.25,
    draw: (c, w, h, focus) => {
      const r = rng(11)
      const hy = h * HZ
      fillRidge(c, ridge(w, hy - h * 0.02, h * 0.02, 5), h, '#7fae84')
      for (let i = 0; i < 26; i++) roundTree(c, (i / 25) * w + r() * w * 0.02, hy + h * 0.005, h * (0.07 + r() * 0.05), '#5c9461', '#77b07a', r)
      haze(c, w, h, hy - h * 0.12, hy + h * 0.02, 'rgba(225,240,255,A)', 0.35)
      // the windmill stands on the horizon at the landmark spot
      const x = focus * w, U = Math.min(w, h), mh = U * 0.3
      c.fillStyle = '#8a5a3c'
      c.beginPath(); c.moveTo(x - mh * 0.13, hy); c.lineTo(x - mh * 0.07, hy - mh); c.lineTo(x + mh * 0.07, hy - mh); c.lineTo(x + mh * 0.13, hy); c.closePath(); c.fill()
      c.fillStyle = '#a66d48'
      c.beginPath(); c.moveTo(x - mh * 0.13, hy); c.lineTo(x - mh * 0.07, hy - mh); c.lineTo(x, hy - mh); c.lineTo(x - mh * 0.02, hy); c.closePath(); c.fill()
      c.fillStyle = '#5b3a27'
      c.beginPath(); c.moveTo(x - mh * 0.1, hy - mh); c.quadraticCurveTo(x, hy - mh * 1.18, x + mh * 0.1, hy - mh); c.closePath(); c.fill()
      c.fillStyle = '#f3e6c8'
      c.fillRect(x - mh * 0.03, hy - mh * 0.28, mh * 0.06, mh * 0.12)
    },
    live: (c, w, h, t, focus) => {
      // the sails turn
      const U = Math.min(w, h), mh = U * 0.3
      const x = focus * w, y = h * HZ - mh * 0.98
      c.save()
      c.translate(x, y)
      c.rotate(t * 0.7)
      for (let i = 0; i < 4; i++) {
        c.rotate(Math.PI / 2)
        c.fillStyle = '#4a3020'
        c.fillRect(-mh * 0.012, 0, mh * 0.024, mh * 0.62)
        c.fillStyle = 'rgba(245,238,225,0.92)'
        c.fillRect(mh * 0.015, mh * 0.12, mh * 0.12, mh * 0.48)
        c.strokeStyle = 'rgba(90,60,40,0.6)'
        c.lineWidth = Math.max(1, mh * 0.006)
        for (let k = 1; k < 5; k++) { c.beginPath(); c.moveTo(mh * 0.015, mh * (0.12 + k * 0.096)); c.lineTo(mh * 0.135, mh * (0.12 + k * 0.096)); c.stroke() }
      }
      c.fillStyle = '#3a2416'
      c.beginPath(); c.arc(0, 0, mh * 0.03, 0, Math.PI * 2); c.fill()
      c.restore()
    },
  },
  {
    depth: 0.6,
    draw: (c, w, h, focus) => {
      // stripes of tulips running to the horizon, like the famous Dutch gardens
      const hy = h * HZ
      const vx = focus * w
      c.fillStyle = '#4f8a3c'
      c.fillRect(0, hy, w, h - hy)
      const colors = ['#e8304a', '#ffd23f', '#ff7eb6', '#b65cf0', '#ff8a2a', '#ffffff', '#e8304a', '#ffd23f']
      const n = 15
      const r = rng(21)
      for (let k = 0; k < n; k++) {
        const x0 = ((k - 0.5) / n) * w * 3.2 - w * 1.1
        const x1 = ((k + 0.32) / n) * w * 3.2 - w * 1.1
        const col = colors[k % colors.length]
        c.fillStyle = col
        c.beginPath(); c.moveTo(vx + (x0 - vx) * 0.004, hy); c.lineTo(x0, h); c.lineTo(x1, h); c.lineTo(vx + (x1 - vx) * 0.004, hy); c.closePath(); c.fill()
        // flower heads: bigger nearer the camera
        const dots = 220
        for (let i = 0; i < dots; i++) {
          const v = Math.pow(r(), 0.7)
          const y = hy + (h - hy) * v
          const a = r()
          const xa = vx + (x0 - vx) * v, xb = vx + (x1 - vx) * v
          const x = xa + (xb - xa) * (0.1 + a * 0.8)
          const s = Math.max(0.6, v * Math.min(w, h) * 0.012)
          c.fillStyle = i % 3 ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.18)'
          c.beginPath(); c.ellipse(x, y, s, s * 1.25, 0, 0, Math.PI * 2); c.fill()
        }
      }
      // the path in the middle
      c.fillStyle = vgrad(c, hy, h, [[0, '#d8c39a'], [1, '#c4a978']])
      c.beginPath(); c.moveTo(vx - w * 0.003, hy); c.lineTo(vx - w * 0.12, h); c.lineTo(vx + w * 0.12, h); c.lineTo(vx + w * 0.003, hy); c.closePath(); c.fill()
      haze(c, w, h, hy, hy + (h - hy) * 0.25, 'rgba(230,242,255,A)', 0.4)
    },
  },
]

const jungle: Layer[] = [
  {
    depth: 0,
    draw: (c, w, h, focus) => {
      sky(c, w, h, '#b9dcc8', '#dcefd2', '#f2f6d8', h * 0.6)
      sun(c, focus * w, h * 0.08, Math.min(w, h) * 0.05, '#fffbe0', 'rgba(255,248,200,')
    },
  },
  {
    depth: 0.2,
    draw: (c, w, h) => {
      const r = rng(31)
      const base = h * 0.6
      fillRidge(c, ridge(w, base - h * 0.08, h * 0.06, 2, 0.5, 140), h, '#a8c9a6')
      for (let i = 0; i < 18; i++) {
        const x = r() * w, ht = h * (0.25 + r() * 0.2)
        c.fillStyle = '#9cbf9c'
        c.fillRect(x - w * 0.004, base - ht, w * 0.008, ht)
        c.beginPath(); c.ellipse(x, base - ht, w * 0.05, h * 0.05, 0, 0, Math.PI * 2); c.fill()
      }
      haze(c, w, h, base - h * 0.35, base, 'rgba(225,240,215,A)', 0.0)
    },
    live: (c, w, h, t, focus) => {
      // sun rays through the trees
      c.save()
      c.globalCompositeOperation = 'lighter'
      const x0 = focus * w, y0 = -h * 0.05
      for (let i = 0; i < 7; i++) {
        const a = -0.55 + i * 0.18 + Math.sin(t * 0.3 + i) * 0.015
        const len = h * 1.1, spread = 0.035 + hash(i, 4) * 0.03
        const al = 0.07 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 1.7))
        const g = c.createLinearGradient(x0, y0, x0 + Math.sin(a) * len, y0 + Math.cos(a) * len)
        g.addColorStop(0, `rgba(255,250,210,${al})`)
        g.addColorStop(1, 'rgba(255,250,210,0)')
        c.fillStyle = g
        c.beginPath()
        c.moveTo(x0, y0)
        c.lineTo(x0 + Math.sin(a - spread) * len, y0 + Math.cos(a - spread) * len)
        c.lineTo(x0 + Math.sin(a + spread) * len, y0 + Math.cos(a + spread) * len)
        c.closePath(); c.fill()
      }
      c.restore()
    },
  },
  {
    depth: 0.45,
    draw: (c, w, h, focus) => {
      const r = rng(41)
      const base = h * 0.66
      fillRidge(c, ridge(w, base - h * 0.1, h * 0.05, 9, 0.6, 160), h, '#6f9c6a')
      for (let i = 0; i < 14; i++) {
        const x = r() * w
        if (Math.abs(x - focus * w) < w * 0.12) continue
        const ht = h * (0.35 + r() * 0.2)
        c.fillStyle = '#5b4a36'
        c.fillRect(x - w * 0.006, base - ht, w * 0.012, ht)
        c.fillStyle = '#5f8f58'
        for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(x + (r() - 0.5) * w * 0.08, base - ht + (r() - 0.3) * h * 0.04, w * (0.04 + r() * 0.03), h * 0.035, 0, 0, Math.PI * 2); c.fill() }
      }
      // an elephant crossing the clearing, far away
      const U = Math.min(w, h), s = U * 0.16
      const ex = focus * w, ey = base + h * 0.02
      c.fillStyle = '#6a6f6a'
      c.beginPath(); c.ellipse(ex, ey - s * 0.55, s * 0.55, s * 0.36, 0, 0, Math.PI * 2); c.fill()
      for (const lx of [-0.38, -0.15, 0.15, 0.36]) c.fillRect(ex + lx * s - s * 0.07, ey - s * 0.4, s * 0.14, s * 0.4)
      c.beginPath(); c.ellipse(ex + s * 0.58, ey - s * 0.72, s * 0.24, s * 0.24, 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#5c615c'
      c.beginPath(); c.ellipse(ex + s * 0.48, ey - s * 0.7, s * 0.16, s * 0.22, -0.2, 0, Math.PI * 2); c.fill()
      c.strokeStyle = '#6a6f6a'
      c.lineWidth = s * 0.1
      c.lineCap = 'round'
      c.beginPath(); c.moveTo(ex + s * 0.74, ey - s * 0.66); c.quadraticCurveTo(ex + s * 0.86, ey - s * 0.3, ex + s * 0.78, ey - s * 0.08); c.stroke()
      c.lineWidth = s * 0.03
      c.beginPath(); c.moveTo(ex - s * 0.54, ey - s * 0.62); c.quadraticCurveTo(ex - s * 0.66, ey - s * 0.4, ex - s * 0.62, ey - s * 0.3); c.stroke()
      c.strokeStyle = '#f4f0e0'
      c.lineWidth = s * 0.035
      c.beginPath(); c.moveTo(ex + s * 0.7, ey - s * 0.56); c.quadraticCurveTo(ex + s * 0.82, ey - s * 0.5, ex + s * 0.86, ey - s * 0.58); c.stroke()
      haze(c, w, h, base - h * 0.4, base + h * 0.05, 'rgba(220,238,210,A)', 0.25)
    },
  },
  {
    depth: 0.85,
    draw: (c, w, h) => {
      const r = rng(51)
      const base = h * 0.7
      c.fillStyle = vgrad(c, base, h, [[0, '#8aa457'], [0.4, '#5d7f3a'], [1, '#3e5c27']])
      c.fillRect(0, base, w, h - base)
      // tall grass
      for (let i = 0; i < 260; i++) {
        const x = r() * w, y = base + Math.pow(r(), 0.8) * (h - base)
        const ht = (y - base + h * 0.02) * 0.35
        c.strokeStyle = r() > 0.5 ? '#6f8f3c' : '#4c6b2a'
        c.lineWidth = Math.max(1, ht * 0.06)
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - 0.5) * ht, y - ht * 0.6, x + (r() - 0.5) * ht * 0.8, y - ht); c.stroke()
      }
      // big trunks at the sides
      for (const [x, k] of [[w * 0.06, 1], [w * 0.95, -1]] as const) {
        c.fillStyle = vgrad(c, 0, h, [[0, '#3d2e20'], [1, '#2c2117']])
        c.beginPath(); c.moveTo(x - w * 0.035, h); c.lineTo(x - w * 0.025, 0); c.lineTo(x + w * 0.03, 0); c.lineTo(x + w * 0.045, h); c.closePath(); c.fill()
        c.fillStyle = 'rgba(255,240,200,0.12)'
        c.fillRect(x + k * w * 0.005, 0, w * 0.01, h)
      }
    },
  },
]

const hill: Layer[] = [
  {
    depth: 0,
    draw: (c, w, h) => {
      sky(c, w, h, '#62aee6', '#b7dcf3', '#fde9c8', h * 0.5)
      sun(c, w * 0.2, h * 0.16, Math.min(w, h) * 0.035)
    },
    live: (c, w, h, t) => clouds(c, w, h, t, 4, h * 0.05, h * 0.22, 0.9, 7),
  },
  {
    depth: 0.15,
    draw: (c, w, h) => {
      fillRidge(c, ridge(w, h * 0.42, h * 0.08, 12, 0.3), h, '#9fb6d6')
      fillRidge(c, ridge(w, h * 0.48, h * 0.07, 13, 0.35), h, '#86a3c4')
    },
    live: (c, w, h, t) => {
      // clouds resting in the valleys
      for (let i = 0; i < 6; i++) {
        const x = (((hash(i, 70) + t * 0.006) % 1.4) - 0.2) * w
        cloud(c, x, h * (0.47 + hash(i, 71) * 0.05), Math.min(w, h) * 0.12, 0.55, i + 90)
      }
    },
  },
  {
    depth: 0.4,
    draw: (c, w, h) => {
      const r = rng(61)
      const pts = ridge(w, h * 0.56, h * 0.06, 14, 0.4)
      fillRidge(c, pts, h, '#5f8fa8')
      for (let i = 0; i < 70; i++) { const x = r() * w; pine(c, x, ridgeAt(pts, x) + h * 0.02, h * (0.03 + r() * 0.025), '#4a7890') }
      haze(c, w, h, h * 0.45, h * 0.6, 'rgba(220,235,250,A)', 0.0)
    },
  },
  {
    depth: 0.65,
    draw: (c, w, h, focus) => {
      const r = rng(71)
      const pts = ridge(w, h * 0.66, h * 0.07, 15, 0.3)
      fillRidge(c, pts, h, vgrad(c, h * 0.55, h, [[0, '#6aa85a'], [1, '#3f7d3c']]))
      // colourful houses on the slope at the landmark spot
      const U = Math.min(w, h)
      const roofs = ['#d6453d', '#2f6fb5', '#e0a531', '#3c9a6b', '#9b4dc4', '#e86f2d']
      for (let i = 0; i < 14; i++) {
        const x = focus * w + (r() - 0.5) * w * 0.34
        const y = ridgeAt(pts, x) + h * (0.03 + r() * 0.07)
        const s = U * (0.03 + r() * 0.02)
        c.fillStyle = ['#f6efe3', '#f1e0c5', '#e8f0f6'][i % 3]
        c.fillRect(x - s / 2, y - s * 0.7, s, s * 0.7)
        c.fillStyle = roofs[i % roofs.length]
        c.beginPath(); c.moveTo(x - s * 0.62, y - s * 0.68); c.lineTo(x, y - s * 1.1); c.lineTo(x + s * 0.62, y - s * 0.68); c.closePath(); c.fill()
        c.fillStyle = '#5a7fa0'
        c.fillRect(x - s * 0.3, y - s * 0.5, s * 0.16, s * 0.16)
        c.fillRect(x + s * 0.12, y - s * 0.5, s * 0.16, s * 0.16)
      }
      for (let i = 0; i < 40; i++) { const x = r() * w; if (Math.abs(x - focus * w) < w * 0.2) continue; pine(c, x, ridgeAt(pts, x) + h * 0.05, h * (0.06 + r() * 0.04), '#2f6a3a', '#3f7d48') }
    },
  },
  {
    depth: 0.95,
    draw: (c, w, h) => {
      const r = rng(81)
      const pts = ridge(w, h * 0.86, h * 0.04, 16, 0.2)
      fillRidge(c, pts, h, vgrad(c, h * 0.8, h, [[0, '#4d8a3e'], [1, '#2f5f28']]))
      for (const x of [w * 0.04, w * 0.12, w * 0.9, w * 0.98]) pine(c, x, h * 1.02, h * (0.42 + r() * 0.12), '#24502c', '#2f6438')
    },
  },
]

function peaks(w: number, base: number, amp: number, seed: number, focus: number): [number, number][] {
  // midpoint displacement: sharp rocky peaks, the highest one near the landmark spot
  const n = 128
  const ys = new Array(n + 1).fill(0)
  const r = rng(seed)
  const rec = (a: number, b: number, d: number) => {
    if (b - a < 2) return
    const m = (a + b) >> 1
    ys[m] = (ys[a] + ys[b]) / 2 + (r() - 0.5) * d
    rec(a, m, d * 0.56); rec(m, b, d * 0.56)
  }
  rec(0, n, 1.3)
  return ys.map((v, i) => {
    const u = i / n
    const big = Math.exp(-Math.pow((u - focus) / 0.16, 2))
    return [u * w, base - amp * (0.35 + v * 0.5 + big * 0.75)] as [number, number]
  })
}

function snowRange(c: Ctx, w: number, h: number, pts: [number, number][], rock: string, shade: string, snowLine: number) {
  fillRidge(c, pts, h, rock)
  c.save()
  c.beginPath()
  c.moveTo(0, h)
  for (const [x, y] of pts) c.lineTo(x, y)
  c.lineTo(w, h)
  c.closePath()
  c.clip()
  // shadow on the right face of each peak (light from the left)
  c.fillStyle = shade
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1]) {
      const [px, py] = pts[i]
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + (h - py) * 0.5, h); c.lineTo(px + (h - py) * 0.08, h); c.closePath(); c.fill()
    }
  }
  // snow above the snow line, with a ragged lower edge
  c.fillStyle = 'rgba(250,252,255,0.96)'
  c.beginPath()
  c.moveTo(0, 0)
  for (let i = 0; i <= 64; i++) c.lineTo((i / 64) * w, snowLine + Math.sin(i * 1.7) * h * 0.012 + Math.sin(i * 5.3) * h * 0.008)
  c.lineTo(w, 0)
  c.closePath()
  c.fill()
  c.fillStyle = 'rgba(150,175,210,0.35)'
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i][1] < pts[i - 1][1] && pts[i][1] <= pts[i + 1][1]) {
      const [px, py] = pts[i]
      c.beginPath(); c.moveTo(px, py); c.lineTo(px + (snowLine - py) * 0.55, snowLine + h * 0.02); c.lineTo(px + (snowLine - py) * 0.1, snowLine + h * 0.02); c.closePath(); c.fill()
    }
  }
  c.restore()
}

const mountain: Layer[] = [
  {
    depth: 0,
    draw: (c, w, h) => sky(c, w, h, '#2f7fd6', '#86bdf0', '#dceeff', h * 0.55),
    live: (c, w, h, t) => clouds(c, w, h, t, 3, h * 0.05, h * 0.18, 0.8, 11),
  },
  {
    depth: 0.12,
    draw: (c, w, h, focus) => {
      const pts = peaks(w, h * 0.5, h * 0.32, 5, focus)
      snowRange(c, w, h, pts, '#7f96b4', 'rgba(60,80,110,0.35)', h * 0.32)
      haze(c, w, h, h * 0.38, h * 0.55, 'rgba(220,235,250,A)', 0.0)
    },
  },
  {
    depth: 0.3,
    draw: (c, w, h, focus) => {
      const pts = peaks(w, h * 0.58, h * 0.16, 9, (focus + 0.5) % 1)
      snowRange(c, w, h, pts, '#566f8c', 'rgba(30,45,70,0.35)', h * 0.45)
    },
  },
  {
    depth: 0.55,
    draw: (c, w, h) => {
      const r = rng(91)
      const shore = h * 0.66
      // lake with the sky reflected
      c.fillStyle = vgrad(c, shore, h * 0.84, [[0, '#6c9fcf'], [1, '#2e5f8f']])
      c.fillRect(0, shore, w, h * 0.2)
      const pts = ridge(w, shore, h * 0.01, 20, 0.6)
      for (let i = 0; i < 120; i++) { const x = r() * w; pine(c, x, ridgeAt(pts, x) + h * 0.005, h * (0.05 + r() * 0.05), '#24493a', '#2e5a48') }
      c.save()
      c.globalAlpha = 0.25
      c.translate(0, shore * 2 + h * 0.01)
      c.scale(1, -1)
      for (let i = 0; i < 60; i++) { const x = hash(i, 5) * w; pine(c, x, shore, h * (0.05 + hash(i, 6) * 0.05), '#163528') }
      c.restore()
    },
    live: (c, w, h, t) => {
      // ripples sparkle on the lake
      const shore = h * 0.66
      c.strokeStyle = 'rgba(255,255,255,0.35)'
      for (let i = 0; i < 40; i++) {
        const y = shore + h * 0.02 + hash(i, 1) * h * 0.16
        const x = ((hash(i, 2) + t * 0.01 * (0.5 + hash(i, 3))) % 1) * w
        const len = w * (0.02 + hash(i, 4) * 0.04) * ((y - shore) / (h * 0.18))
        c.lineWidth = Math.max(1, h * 0.002)
        c.globalAlpha = 0.4 + 0.4 * Math.sin(t * 2 + i)
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y); c.stroke()
      }
      c.globalAlpha = 1
    },
  },
  {
    depth: 0.9,
    draw: (c, w, h) => {
      const r = rng(101)
      const pts = ridge(w, h * 0.86, h * 0.025, 21, 0.4)
      fillRidge(c, pts, h, vgrad(c, h * 0.8, h, [[0, '#6e9a4e'], [1, '#3f6a2e']]))
      for (let i = 0; i < 6; i++) {
        const x = r() * w, y = h * (0.9 + r() * 0.08), s = Math.min(w, h) * (0.03 + r() * 0.04)
        c.fillStyle = '#8a8d90'
        c.beginPath(); c.ellipse(x, y, s * 1.4, s, 0, Math.PI, 0); c.fill()
        c.fillStyle = '#a7aaad'
        c.beginPath(); c.ellipse(x - s * 0.3, y - s * 0.3, s * 0.7, s * 0.45, 0, Math.PI, 0); c.fill()
      }
    },
  },
]

const waterfall: Layer[] = [
  {
    depth: 0,
    draw: (c, w, h) => sky(c, w, h, '#76c2ea', '#bfe6f8', '#eefaff', h * 0.3),
    live: (c, w, h, t) => clouds(c, w, h, t, 3, h * 0.03, h * 0.12, 0.85, 13),
  },
  {
    depth: 0.15,
    draw: (c, w, h) => {
      fillRidge(c, ridge(w, h * 0.25, h * 0.05, 30, 0.5), h, '#8fb7a6')
      haze(c, w, h, h * 0.15, h * 0.35, 'rgba(230,245,250,A)', 0.0)
    },
  },
  {
    depth: 0.45,
    draw: (c, w, h, focus) => {
      const r = rng(111)
      const fx = focus * w, gap = w * 0.11
      // the cliff on each side of the falling water
      for (const side of [-1, 1]) {
        c.fillStyle = vgrad(c, h * 0.1, h * 0.8, [[0, '#7a7064'], [1, '#4a4239']])
        c.beginPath()
        const inner = fx + side * gap
        c.moveTo(inner, h * 0.16)
        for (let i = 0; i <= 20; i++) {
          const y = h * 0.16 + (i / 20) * h * 0.62
          c.lineTo(inner + side * (Math.sin(i * 1.3) * w * 0.012 + (i / 20) * w * 0.03), y)
        }
        c.lineTo(side < 0 ? -w * 0.1 : w * 1.1, h * 0.8)
        c.lineTo(side < 0 ? -w * 0.1 : w * 1.1, h * 0.12)
        c.closePath()
        c.fill()
        // rock ledges
        c.strokeStyle = 'rgba(30,25,20,0.35)'
        c.lineWidth = Math.max(1, h * 0.004)
        for (let i = 0; i < 18; i++) {
          const y = h * (0.2 + r() * 0.55), x = inner + side * (w * 0.03 + r() * w * 0.35)
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + side * w * (0.04 + r() * 0.08), y + h * 0.01); c.stroke()
        }
        // moss and trees on top
        c.fillStyle = '#4f8a47'
        for (let i = 0; i < 16; i++) {
          const x = inner + side * (r() * w * 0.45)
          c.beginPath(); c.ellipse(x, h * (0.13 + r() * 0.03), w * (0.03 + r() * 0.03), h * 0.03, 0, 0, Math.PI * 2); c.fill()
        }
        for (let i = 0; i < 6; i++) { const x = inner + side * (w * 0.06 + r() * w * 0.4); roundTree(c, x, h * 0.14, h * (0.1 + r() * 0.06), '#3f7a3c', '#57944f', r) }
      }
      // the pool
      c.fillStyle = vgrad(c, h * 0.76, h, [[0, '#5fb3c4'], [1, '#2b7a8c']])
      c.beginPath(); c.moveTo(-w * 0.1, h); c.lineTo(-w * 0.1, h * 0.8); c.quadraticCurveTo(fx, h * 0.72, w * 1.1, h * 0.8); c.lineTo(w * 1.1, h); c.closePath(); c.fill()
    },
    live: (c, w, h, t, focus) => {
      const fx = focus * w, gap = w * 0.11
      const top = h * 0.16, bot = h * 0.78
      // falling water: bright streaks moving down
      c.fillStyle = vgrad(c, top, bot, [[0, 'rgba(225,245,255,0.95)'], [1, 'rgba(240,250,255,0.98)']])
      c.beginPath(); c.moveTo(fx - gap, top); c.lineTo(fx + gap, top); c.lineTo(fx + gap * 1.15, bot); c.lineTo(fx - gap * 1.15, bot); c.closePath(); c.fill()
      c.save()
      c.clip()
      for (let i = 0; i < 46; i++) {
        const x = fx - gap * 1.15 + hash(i, 1) * gap * 2.3
        const len = h * (0.05 + hash(i, 2) * 0.1)
        const y = top + (((hash(i, 3) + t * (0.6 + hash(i, 4) * 0.5)) % 1.2) - 0.1) * (bot - top)
        c.strokeStyle = i % 3 ? 'rgba(150,200,225,0.55)' : 'rgba(255,255,255,0.9)'
        c.lineWidth = Math.max(1, w * (0.002 + hash(i, 5) * 0.004))
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + (x - fx) * 0.02, y + len); c.stroke()
      }
      c.restore()
      // foam and spray where it lands
      for (let i = 0; i < 30; i++) {
        const a = hash(i, 7) * Math.PI
        const k = (hash(i, 8) + t * 0.8) % 1
        const x = fx + Math.cos(a) * gap * (1.2 + k * 1.6)
        const y = bot - Math.sin(a) * h * 0.04 * (1 - k) + h * 0.01
        c.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`
        c.beginPath(); c.arc(x, y, Math.min(w, h) * (0.012 + k * 0.03), 0, Math.PI * 2); c.fill()
      }
      // mist and a faint rainbow
      const g = c.createRadialGradient(fx, bot, 0, fx, bot, w * 0.35)
      g.addColorStop(0, 'rgba(255,255,255,0.55)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = g
      c.fillRect(fx - w * 0.4, bot - h * 0.3, w * 0.8, h * 0.4)
      c.save()
      c.globalAlpha = 0.18 + 0.05 * Math.sin(t * 0.5)
      const rb = ['#ff4040', '#ffa040', '#ffff60', '#60ff80', '#60a0ff', '#a060ff']
      for (let i = 0; i < rb.length; i++) {
        c.strokeStyle = rb[i]
        c.lineWidth = Math.max(1, Math.min(w, h) * 0.008)
        c.beginPath(); c.arc(fx + gap * 1.5, bot + h * 0.06, Math.min(w, h) * (0.22 - i * 0.008), Math.PI * 1.1, Math.PI * 1.6); c.stroke()
      }
      c.restore()
    },
  },
  {
    depth: 0.9,
    draw: (c, w, h) => {
      const r = rng(121)
      for (let i = 0; i < 9; i++) {
        const x = (i < 5 ? r() * 0.3 : 0.7 + r() * 0.3) * w, y = h * (0.86 + r() * 0.12), s = Math.min(w, h) * (0.05 + r() * 0.05)
        c.fillStyle = '#4c4c48'
        c.beginPath(); c.ellipse(x, y, s * 1.5, s, 0, Math.PI, 0); c.fill()
        c.fillStyle = '#6b6b64'
        c.beginPath(); c.ellipse(x - s * 0.3, y - s * 0.35, s * 0.8, s * 0.45, 0, Math.PI, 0); c.fill()
        c.fillStyle = '#4f8a47'
        c.beginPath(); c.ellipse(x + s * 0.2, y - s * 0.85, s * 0.7, s * 0.22, 0, 0, Math.PI * 2); c.fill()
      }
    },
  },
]

const fountain: Layer[] = [
  {
    depth: 0,
    draw: (c, w, h) => {
      sky(c, w, h, '#5fb0ea', '#a6d8f6', '#f4fbff', h * 0.5)
      sun(c, w * 0.85, h * 0.1, Math.min(w, h) * 0.035)
    },
    live: (c, w, h, t) => clouds(c, w, h, t, 4, h * 0.05, h * 0.22, 0.85, 17),
  },
  {
    depth: 0.2,
    draw: (c, w, h) => {
      const r = rng(131)
      const hy = h * 0.5
      // a palace-like building in the distance
      c.fillStyle = '#efe6d6'
      c.fillRect(w * 0.05, hy - h * 0.09, w * 0.9, h * 0.09)
      c.fillStyle = '#d9cdb8'
      for (let i = 0; i < 30; i++) c.fillRect(w * (0.07 + i * 0.03), hy - h * 0.075, w * 0.012, h * 0.05)
      c.fillStyle = '#c9b89a'
      c.fillRect(w * 0.05, hy - h * 0.1, w * 0.9, h * 0.012)
      for (let i = 0; i < 30; i++) roundTree(c, r() * w, hy + h * 0.01, h * (0.08 + r() * 0.05), '#5a9156', '#74aa6c', r)
    },
  },
  {
    depth: 0.5,
    draw: (c, w, h, focus) => {
      const hy = h * 0.5, fx = focus * w, U = Math.min(w, h)
      // the plaza: stone tiles in perspective
      c.fillStyle = vgrad(c, hy, h, [[0, '#d9ccb4'], [1, '#bfae90']])
      c.fillRect(0, hy, w, h - hy)
      c.strokeStyle = 'rgba(120,100,70,0.25)'
      c.lineWidth = Math.max(1, h * 0.002)
      for (let i = -20; i <= 20; i++) { c.beginPath(); c.moveTo(fx + i * w * 0.004, hy); c.lineTo(fx + i * w * 0.12, h); c.stroke() }
      for (let i = 1; i < 14; i++) { const y = hy + (h - hy) * Math.pow(i / 14, 1.8); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }
      // grass beds at the sides
      c.fillStyle = '#5f9b4e'
      c.beginPath(); c.moveTo(0, hy + h * 0.02); c.lineTo(fx - w * 0.22, hy + h * 0.02); c.lineTo(-w * 0.2, h); c.closePath(); c.fill()
      c.beginPath(); c.moveTo(w, hy + h * 0.02); c.lineTo(fx + w * 0.22, hy + h * 0.02); c.lineTo(w * 1.2, h); c.closePath(); c.fill()
      // the fountain: a wide basin and two bowls on a column
      const by = h * 0.72, bw = U * 0.42
      c.fillStyle = '#cfc3ad'
      c.beginPath(); c.ellipse(fx, by, bw, bw * 0.16, 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#e8dfcc'
      c.fillRect(fx - bw, by - U * 0.05, bw * 2, U * 0.05)
      c.beginPath(); c.ellipse(fx, by - U * 0.05, bw, bw * 0.16, 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#5ab0cf'
      c.beginPath(); c.ellipse(fx, by - U * 0.05, bw * 0.93, bw * 0.13, 0, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#e3d9c4'
      c.fillRect(fx - U * 0.025, by - U * 0.26, U * 0.05, U * 0.22)
      for (const [yy, r0] of [[by - U * 0.26, U * 0.17], [by - U * 0.38, U * 0.09]] as const) {
        c.fillStyle = '#e8dfcc'
        c.beginPath(); c.moveTo(fx - r0, yy); c.quadraticCurveTo(fx, yy + U * 0.07, fx + r0, yy); c.closePath(); c.fill()
        c.fillStyle = '#7cc3da'
        c.beginPath(); c.ellipse(fx, yy, r0, r0 * 0.18, 0, 0, Math.PI * 2); c.fill()
      }
      c.fillStyle = '#e3d9c4'
      c.fillRect(fx - U * 0.015, by - U * 0.38, U * 0.03, U * 0.12)
    },
    live: (c, w, h, t, focus) => {
      const fx = focus * w, U = Math.min(w, h), by = h * 0.72
      c.save()
      c.globalCompositeOperation = 'lighter'
      // water drops on their arcs: the jet at the top and the falls from each bowl
      const jets: { x: number; y: number; vx: number; vy: number; n: number }[] = [
        { x: fx, y: by - U * 0.38, vx: 0.05, vy: -0.55, n: 70 },
        { x: fx, y: by - U * 0.38, vx: 0.2, vy: -0.1, n: 50 },
        { x: fx, y: by - U * 0.26, vx: 0.34, vy: -0.05, n: 60 },
      ]
      for (let j = 0; j < jets.length; j++) {
        const J = jets[j]
        for (let i = 0; i < J.n; i++) {
          const life = 1.2
          const k = ((hash(i, j + 1) + t / life) % 1) * life
          const dir = hash(i, j + 9) > 0.5 ? 1 : -1
          const vx = J.vx * dir * (0.6 + hash(i, j + 3) * 0.6) * U
          const vy = J.vy * (0.8 + hash(i, j + 4) * 0.4) * U * 2
          const x = J.x + vx * k
          const y = J.y + vy * k + 0.5 * U * 1.6 * k * k
          if (y > by - U * 0.04) continue
          c.fillStyle = `rgba(220,240,255,${0.55 * (1 - k / life * 0.5)})`
          c.beginPath(); c.arc(x, y, Math.max(1, U * 0.004), 0, Math.PI * 2); c.fill()
        }
      }
      c.restore()
      // ripples in the basin
      c.strokeStyle = 'rgba(255,255,255,0.45)'
      c.lineWidth = Math.max(1, U * 0.002)
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3) % 1
        c.globalAlpha = 1 - k
        c.beginPath(); c.ellipse(fx, by - U * 0.05, U * 0.08 + k * U * 0.3, (U * 0.08 + k * U * 0.3) * 0.14, 0, 0, Math.PI * 2); c.stroke()
      }
      c.globalAlpha = 1
    },
  },
  {
    depth: 0.9,
    draw: (c, w, h) => {
      // lamp posts at the sides
      const U = Math.min(w, h)
      for (const x of [w * 0.1, w * 0.9]) {
        c.fillStyle = '#2d2d33'
        c.fillRect(x - U * 0.008, h * 0.42, U * 0.016, h * 0.6)
        c.beginPath(); c.moveTo(x - U * 0.03, h * 0.42); c.lineTo(x + U * 0.03, h * 0.42); c.lineTo(x + U * 0.02, h * 0.37); c.lineTo(x - U * 0.02, h * 0.37); c.closePath(); c.fill()
        c.fillStyle = 'rgba(255,240,200,0.9)'
        c.fillRect(x - U * 0.018, h * 0.375, U * 0.036, h * 0.04)
      }
    },
  },
]

function eiffel(c: Ctx, x: number, base: number, ht: number) {
  // the tower by day, drawn from its shape: four curved legs, an arch, three platforms and the spire
  const col = '#6e5b48', dark = '#54443a'
  const lw = Math.max(1, ht * 0.0035)
  const halfAt = (y: number) => {
    // half width at height fraction y (0 = ground, 1 = top): wide feet narrowing on a curve
    const k = 1 - y
    return ht * (0.012 + 0.27 * Math.pow(k, 2.6))
  }
  const Y = (f: number) => base - ht * f
  c.save()
  c.lineJoin = 'round'
  // legs and tower body as a filled outline with see-through middle
  c.fillStyle = col
  c.beginPath()
  c.moveTo(x - halfAt(0), Y(0))
  for (let i = 1; i <= 40; i++) { const f = i / 40 * 0.93; c.lineTo(x - halfAt(f), Y(f)) }
  c.lineTo(x, Y(1))
  for (let i = 40; i >= 0; i--) { const f = i / 40 * 0.93; c.lineTo(x + halfAt(f), Y(f)) }
  c.closePath()
  c.fill()
  // the opening under the first platform: a wide arch
  c.globalCompositeOperation = 'destination-out'
  const legIn = (f: number) => halfAt(f) * 0.55
  c.beginPath()
  c.moveTo(x - legIn(0), Y(0))
  c.quadraticCurveTo(x - legIn(0.12) * 0.9, Y(0.14), x, Y(0.16))
  c.quadraticCurveTo(x + legIn(0.12) * 0.9, Y(0.14), x + legIn(0), Y(0))
  c.closePath()
  c.fill()
  // between the first and second platform
  c.beginPath()
  c.moveTo(x - halfAt(0.22) * 0.55, Y(0.22))
  c.lineTo(x - halfAt(0.36) * 0.45, Y(0.36))
  c.lineTo(x + halfAt(0.36) * 0.45, Y(0.36))
  c.lineTo(x + halfAt(0.22) * 0.55, Y(0.22))
  c.closePath()
  c.fill()
  c.globalCompositeOperation = 'source-over'
  // lattice: crossing struts
  c.strokeStyle = 'rgba(235,225,205,0.35)'
  c.lineWidth = lw
  for (let i = 0; i < 26; i++) {
    const f0 = i / 26 * 0.9, f1 = (i + 1) / 26 * 0.9
    for (const s of [-1, 1]) {
      c.beginPath()
      c.moveTo(x + s * halfAt(f0), Y(f0)); c.lineTo(x + s * halfAt(f1) * 0.6, Y(f1))
      c.moveTo(x + s * halfAt(f0) * 0.6, Y(f0)); c.lineTo(x + s * halfAt(f1), Y(f1))
      c.stroke()
    }
  }
  // the platforms
  c.fillStyle = dark
  for (const [f, k] of [[0.18, 1.25], [0.37, 1.2], [0.75, 1.6]] as const) {
    const hw = halfAt(f) * k + ht * 0.01
    c.fillRect(x - hw, Y(f) - ht * 0.012, hw * 2, ht * 0.022)
  }
  c.strokeStyle = col
  c.lineWidth = lw * 2
  c.beginPath(); c.moveTo(x, Y(0.93)); c.lineTo(x, Y(1.02)); c.stroke()
  c.restore()
}

const paris: Layer[] = [
  {
    depth: 0,
    draw: (c, w, h) => {
      sky(c, w, h, '#4d9fe6', '#9fd0f5', '#f2f8ff', h * 0.62)
      sun(c, w * 0.15, h * 0.12, Math.min(w, h) * 0.03)
    },
    live: (c, w, h, t) => { clouds(c, w, h, t, 4, h * 0.05, h * 0.25, 0.85, 19); birds(c, w, h, t, 6, 4) },
  },
  {
    depth: 0.12,
    draw: (c, w, h) => {
      const r = rng(141)
      const hy = h * 0.66
      for (let i = 0; i < 60; i++) {
        const x = r() * w, bw = w * (0.02 + r() * 0.04), bh = h * (0.02 + r() * 0.05)
        c.fillStyle = ['#cfd8e2', '#c4cfdb', '#d8dfe6'][i % 3]
        c.fillRect(x, hy - bh, bw, bh)
      }
    },
  },
  {
    depth: 0.3,
    draw: (c, w, h, focus) => {
      const ht = Math.min(h * 0.62, w * 1.4)
      eiffel(c, focus * w, h * 0.7, ht)
    },
  },
  {
    depth: 0.55,
    draw: (c, w, h, focus) => {
      const r = rng(151)
      const hy = h * 0.7, fx = focus * w
      // rows of trees on each side and Paris buildings behind them
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const x0 = fx + side * (w * 0.2 + i * w * 0.16)
          const bh = h * (0.1 + r() * 0.04), bw = w * 0.15
          c.fillStyle = '#efe3cf'
          c.fillRect(x0 - bw / 2, hy - bh, bw, bh)
          c.fillStyle = '#7f8ea3'
          c.beginPath(); c.moveTo(x0 - bw / 2, hy - bh); c.lineTo(x0 - bw * 0.42, hy - bh - h * 0.03); c.lineTo(x0 + bw * 0.42, hy - bh - h * 0.03); c.lineTo(x0 + bw / 2, hy - bh); c.closePath(); c.fill()
          c.fillStyle = '#8ea4bd'
          for (let k = 0; k < 6; k++) for (let j = 0; j < 3; j++) c.fillRect(x0 - bw * 0.42 + k * bw * 0.145, hy - bh + h * 0.015 + j * bh * 0.3, bw * 0.06, bh * 0.14)
        }
        for (let i = 0; i < 10; i++) roundTree(c, fx + side * (w * 0.12 + i * w * 0.07 + r() * w * 0.02), hy + h * 0.04, h * (0.11 + r() * 0.04), '#4f8a45', '#6aa65c', r)
      }
    },
  },
  {
    depth: 0.85,
    draw: (c, w, h, focus) => {
      const hy = h * 0.7, fx = focus * w
      // the long lawn and the gravel path to the tower
      c.fillStyle = vgrad(c, hy, h, [[0, '#7fb35c'], [1, '#4f8a3a']])
      c.fillRect(0, hy + h * 0.02, w, h)
      c.fillStyle = vgrad(c, hy, h, [[0, '#e0d2b4'], [1, '#cdb88f']])
      c.beginPath(); c.moveTo(fx - w * 0.02, hy + h * 0.02); c.lineTo(fx - w * 0.16, h); c.lineTo(fx + w * 0.16, h); c.lineTo(fx + w * 0.02, hy + h * 0.02); c.closePath(); c.fill()
      c.strokeStyle = 'rgba(255,255,255,0.12)'
      for (let i = 0; i < 6; i++) { const y = hy + h * 0.02 + (h - hy) * Math.pow(i / 6, 1.6); c.lineWidth = Math.max(1, h * 0.006 * (i / 6)); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke() }
    },
  },
]

const PACKS: Record<ScenePack, Layer[]> = { garden, jungle, hill, mountain, waterfall, fountain, paris }

// ---------- the front frame ----------

interface FrontEl { img: Canvas; x: number; y: number; px: number; py: number; rot: number; sway: number; speed: number; phase: number }

/** A leaf from (0,0) pointing up to (0,-len). */
function leaf(c: Ctx, len: number, wid: number, col: string, dark: string, kind: 'oval' | 'monstera' | 'banana' | 'fern' | 'pine' | 'ivy') {
  c.save()
  if (kind === 'fern') {
    c.strokeStyle = dark
    c.lineWidth = Math.max(1, wid * 0.06)
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(wid * 0.3, -len * 0.5, 0, -len); c.stroke()
    for (let i = 1; i < 22; i++) {
      const f = i / 22, y = -len * f, x = wid * 0.3 * 4 * f * (1 - f) * 0.5
      const l = wid * (1 - f) * 0.9
      for (const s of [-1, 1]) {
        c.fillStyle = i % 2 ? col : dark
        c.beginPath(); c.ellipse(x + s * l * 0.5, y + l * 0.15, l * 0.5, l * 0.14, s * 0.5, 0, Math.PI * 2); c.fill()
      }
    }
    c.restore(); return
  }
  if (kind === 'pine') {
    // a curved twig with tufts of needles, thicker towards the tip
    const bend = wid * 0.5
    const at = (f: number) => [bend * Math.sin(f * Math.PI * 0.8), -len * f] as const
    c.strokeStyle = '#5a3d26'
    c.lineWidth = Math.max(1, wid * 0.07)
    c.beginPath(); c.moveTo(0, 0)
    for (let i = 1; i <= 20; i++) { const [x, y] = at(i / 20); c.lineTo(x, y) }
    c.stroke()
    const shades = [col, dark, '#3f7d48', col]
    c.lineCap = 'round'
    for (let i = 0; i < 140; i++) {
      const f = 0.05 + (i / 140) * 0.95
      const [x, y] = at(f)
      const l = wid * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7))) * (1 - f * 0.35)
      const s = i % 2 ? 1 : -1
      const a = -Math.PI / 2 + s * (0.55 + 0.35 * Math.sin(i * 2.3))
      c.strokeStyle = shades[i % shades.length]
      c.lineWidth = Math.max(1, wid * 0.03)
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.4, x + Math.cos(a) * l, y + Math.sin(a) * l * 0.8); c.stroke()
    }
    c.restore(); return
  }
  const g = c.createLinearGradient(-wid, 0, wid, 0)
  g.addColorStop(0, dark); g.addColorStop(0.5, col); g.addColorStop(1, dark)
  c.fillStyle = g
  c.beginPath()
  if (kind === 'monstera' || kind === 'ivy') {
    c.moveTo(0, 0)
    c.bezierCurveTo(-wid * 1.2, -len * 0.05, -wid * 1.1, -len * 0.85, 0, -len)
    c.bezierCurveTo(wid * 1.1, -len * 0.85, wid * 1.2, -len * 0.05, 0, 0)
  } else {
    const ww = kind === 'banana' ? wid * 0.7 : wid
    c.moveTo(0, 0)
    c.bezierCurveTo(-ww, -len * 0.2, -ww, -len * 0.75, 0, -len)
    c.bezierCurveTo(ww, -len * 0.75, ww, -len * 0.2, 0, 0)
  }
  c.fill()
  // veins
  c.strokeStyle = 'rgba(230,255,200,0.35)'
  c.lineWidth = Math.max(1, wid * 0.05)
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -len * 0.97); c.stroke()
  c.lineWidth = Math.max(1, wid * 0.025)
  const veins = kind === 'banana' ? 16 : 7
  for (let i = 1; i < veins; i++) {
    const y = -len * (i / veins)
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(0, y); c.quadraticCurveTo(s * wid * 0.4, y - len * 0.03, s * wid * 0.85, y - len * 0.08); c.stroke() }
  }
  if (kind === 'monstera' || kind === 'banana') {
    // the splits of a monstera / torn banana leaf
    c.globalCompositeOperation = 'destination-out'
    c.lineWidth = Math.max(1, wid * (kind === 'banana' ? 0.03 : 0.08))
    c.strokeStyle = '#000'
    const n = kind === 'banana' ? 6 : 5
    for (let i = 1; i <= n; i++) {
      const y = -len * (0.15 + i * 0.13)
      for (const s of [-1, 1]) {
        if (kind === 'banana' && (i + (s > 0 ? 1 : 0)) % 2) continue
        c.beginPath(); c.moveTo(s * wid * 0.35, y); c.lineTo(s * wid * 1.3, y - len * 0.1); c.stroke()
      }
    }
    if (kind === 'monstera') for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * wid * 0.25, -len * (0.3 + i * 0.18), wid * 0.06, len * 0.035, s * 0.6, 0, Math.PI * 2); c.fill() }
  }
  c.restore()
}

function flowerHead(c: Ctx, x: number, y: number, s: number, kind: 'tulip' | 'rose' | 'daisy', col: string) {
  c.save()
  c.translate(x, y)
  if (kind === 'tulip') {
    const g = c.createLinearGradient(0, -s, 0, s * 0.5)
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0.35)')
    for (const [dx, k] of [[-0.35, 0.8], [0.35, 0.8], [0, 1]] as const) {
      c.fillStyle = col
      c.beginPath(); c.ellipse(dx * s, -s * 0.1, s * 0.38 * k, s * 0.62, dx, 0, Math.PI * 2); c.fill()
      c.fillStyle = g
      c.beginPath(); c.ellipse(dx * s, -s * 0.1, s * 0.38 * k, s * 0.62, dx, 0, Math.PI * 2); c.fill()
    }
    c.fillStyle = 'rgba(255,255,255,0.25)'
    c.beginPath(); c.ellipse(-s * 0.1, -s * 0.4, s * 0.08, s * 0.25, 0.2, 0, Math.PI * 2); c.fill()
  } else if (kind === 'rose') {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, r = s * (0.75 - i * 0.07)
      c.fillStyle = i % 2 ? col : shade(col, -0.25)
      c.beginPath(); c.ellipse(Math.cos(a) * s * 0.12, Math.sin(a) * s * 0.12, r, r * 0.8, a, 0, Math.PI * 2); c.fill()
    }
    c.strokeStyle = shade(col, -0.45)
    c.lineWidth = Math.max(1, s * 0.05)
    c.beginPath(); c.arc(0, 0, s * 0.2, 0, Math.PI * 1.5); c.stroke()
  } else {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      c.fillStyle = col
      c.beginPath(); c.ellipse(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.45, s * 0.16, a, 0, Math.PI * 2); c.fill()
    }
    c.fillStyle = '#f5b301'
    c.beginPath(); c.arc(0, 0, s * 0.25, 0, Math.PI * 2); c.fill()
  }
  c.restore()
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)))
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`
}

/** Draws a sprite once (optionally soft, like something close to the lens). */
function spriteOf(w: number, h: number, blur: number, draw: (c: Ctx) => void): Canvas {
  const pad = Math.ceil(blur * 3)
  const cv = makeCanvas(w + pad * 2, h + pad * 2)
  const c = ctx2d(cv)
  if (blur > 0.5) {
    const tmp = makeCanvas(w + pad * 2, h + pad * 2)
    const tc = ctx2d(tmp)
    tc.translate(pad, pad)
    draw(tc)
    c.filter = `blur(${blur.toFixed(1)}px)`
    c.drawImage(tmp, 0, 0)
    c.filter = 'none'
  } else {
    c.translate(pad, pad)
    draw(c)
  }
  return cv
}

/** A bunch of leaves (and flowers) fanning out from a corner; pivot = the corner. */
function cornerBunch(S: number, corner: 'tl' | 'tr' | 'bl' | 'br', blur: number, parts: { kind: Parameters<typeof leaf>[5]; col: string; dark: string; n: number; len: number; wid: number }[], flowers?: { kind: 'tulip' | 'rose' | 'daisy'; cols: string[]; n: number; size: number }, seed = 1) {
  const r = rng(seed)
  const sx = corner === 'tr' || corner === 'br' ? -1 : 1
  const sy = corner === 'bl' || corner === 'br' ? -1 : 1
  const img = spriteOf(S, S, blur, (c) => {
    c.translate(sx > 0 ? 0 : S, sy > 0 ? 0 : S)
    for (const p of parts) {
      for (let i = 0; i < p.n; i++) {
        // fan from the corner into the picture
        const a = (sx > 0 ? 0 : Math.PI) + sx * sy * (0.05 + (i / Math.max(1, p.n - 1)) * 1.45) * 1 + (r() - 0.5) * 0.2
        const len = S * p.len * (0.7 + r() * 0.4)
        c.save()
        c.rotate(a + Math.PI / 2)
        // leaf base sits a little inside the corner
        leaf(c, len, S * p.wid * (0.8 + r() * 0.4), p.col, p.dark, p.kind)
        c.restore()
      }
    }
    if (flowers) {
      for (let i = 0; i < flowers.n; i++) {
        const a = sx * sy * (0.15 + r() * 1.25)
        const d = S * (0.25 + r() * 0.45)
        const x = Math.cos(a) * d * sx * (sx > 0 ? 1 : 1)
        const y = Math.sin(a) * d * (sx > 0 ? 1 : -1)
        c.strokeStyle = '#3f7a2c'
        c.lineWidth = Math.max(1, S * 0.012)
        c.beginPath(); c.moveTo(0, 0); c.lineTo(x * (sx > 0 ? 1 : 1), y); c.stroke()
        flowerHead(c, x, y, S * flowers.size * (0.7 + r() * 0.5), flowers.kind, flowers.cols[i % flowers.cols.length])
      }
    }
  })
  const pad = (img.width - S) / 2
  return { img, px: sx > 0 ? pad : img.width - pad, py: sy > 0 ? pad : img.height - pad }
}

/** A vine hanging from the top edge; pivot = the top. */
function vine(S: number, len: number, blur: number, col: string, dark: string, flowerCol: string | null, seed: number) {
  const r = rng(seed)
  const w = S * 0.4
  const img = spriteOf(w, len, blur, (c) => {
    c.translate(w / 2, 0)
    c.strokeStyle = '#4b5d2a'
    c.lineWidth = Math.max(1, S * 0.01)
    c.beginPath(); c.moveTo(0, 0)
    for (let i = 1; i <= 20; i++) c.lineTo(Math.sin(i * 0.7) * w * 0.12, (i / 20) * len)
    c.stroke()
    for (let i = 1; i < 24; i++) {
      const y = (i / 24) * len, x = Math.sin((i / 24) * 20 * 0.7 / 1) * w * 0.12
      c.save(); c.translate(x, y); c.rotate((i % 2 ? 1 : -1) * (1.1 + r() * 0.5) + Math.PI)
      leaf(c, S * (0.05 + r() * 0.03), S * 0.035, col, dark, 'ivy')
      c.restore()
      if (flowerCol && i % 4 === 0) flowerHead(c, x + (r() - 0.5) * w * 0.2, y, S * 0.025, 'daisy', flowerCol)
    }
  })
  return { img, px: img.width / 2, py: (img.height - len) / 2 }
}

function frontEls(pack: ScenePack, w: number, h: number): FrontEl[] {
  const U = Math.min(w, h)
  const S = U * 0.78
  const B = U * 0.006 // lens softness of near things
  const els: FrontEl[] = []
  const at = (o: { img: Canvas; px: number; py: number }, x: number, y: number, rot: number, sway: number, speed: number, phase: number) =>
    els.push({ ...o, x, y, rot, sway, speed, phase })
  const green = { col: '#4e9a3c', dark: '#2f6a24' }
  if (pack === 'garden' || pack === 'fountain') {
    const fl = pack === 'garden'
      ? { kind: 'tulip' as const, cols: ['#e8304a', '#ffd23f', '#ff7eb6', '#ff8a2a'], n: 9, size: 0.07 }
      : { kind: 'rose' as const, cols: ['#e83a5a', '#ff8fb0', '#ffffff', '#ffb347'], n: 10, size: 0.06 }
    at(cornerBunch(S, 'bl', B, [{ kind: 'oval', ...green, n: 9, len: 0.5, wid: 0.06 }], fl, 3), 0, h, 0, 0.03, 0.9, 0)
    at(cornerBunch(S, 'br', B, [{ kind: 'oval', ...green, n: 9, len: 0.5, wid: 0.06 }], fl, 4), w, h, 0, 0.03, 0.8, 1.5)
  } else if (pack === 'jungle') {
    at(cornerBunch(S * 1.1, 'tl', B * 1.5, [{ kind: 'monstera', col: '#3f8f3a', dark: '#1f5a1f', n: 5, len: 0.55, wid: 0.2 }], undefined, 5), 0, 0, 0, 0.04, 0.7, 0)
    at(cornerBunch(S * 1.1, 'tr', B * 1.5, [{ kind: 'banana', col: '#5aa83f', dark: '#2f6b22', n: 5, len: 0.8, wid: 0.16 }], undefined, 6), w, 0, 0, 0.035, 0.6, 2)
    at(cornerBunch(S * 0.8, 'bl', B, [{ kind: 'fern', col: '#4f9a3c', dark: '#2f6a24', n: 6, len: 0.7, wid: 0.12 }], undefined, 7), 0, h, 0, 0.03, 0.8, 1)
    at(cornerBunch(S * 0.8, 'br', B, [{ kind: 'fern', col: '#4f9a3c', dark: '#2f6a24', n: 6, len: 0.7, wid: 0.12 }], undefined, 8), w, h, 0, 0.03, 0.7, 3)
    at(vine(S, h * 0.55, B, '#4e9a3c', '#2f6a24', null, 9), w * 0.18, 0, 0, 0.05, 0.5, 0.5)
    at(vine(S, h * 0.4, B, '#4e9a3c', '#2f6a24', null, 10), w * 0.86, 0, 0, 0.05, 0.55, 2.5)
  } else if (pack === 'hill' || pack === 'mountain') {
    at(cornerBunch(S, 'tl', B, [{ kind: 'pine', col: '#2f6a3a', dark: '#1d4a28', n: 4, len: 0.75, wid: 0.09 }], undefined, 11), 0, 0, 0, 0.025, 0.6, 0)
    if (pack === 'hill') at(cornerBunch(S, 'tr', B, [{ kind: 'pine', col: '#2f6a3a', dark: '#1d4a28', n: 4, len: 0.75, wid: 0.09 }], undefined, 12), w, 0, 0, 0.025, 0.55, 2)
    at(cornerBunch(S * 0.7, 'bl', B, [{ kind: 'oval', col: '#6c9b3a', dark: '#3f6a22', n: 12, len: 0.45, wid: 0.03 }], { kind: 'daisy', cols: ['#ffffff', '#ffd6e8', '#c9b6ff'], n: 7, size: 0.05 }, 13), 0, h, 0, 0.03, 0.9, 1)
    at(cornerBunch(S * 0.7, 'br', B, [{ kind: 'oval', col: '#6c9b3a', dark: '#3f6a22', n: 12, len: 0.45, wid: 0.03 }], { kind: 'daisy', cols: ['#ffffff', '#fff1a8', '#ffd6e8'], n: 6, size: 0.05 }, 14), w, h, 0, 0.03, 0.8, 2.2)
  } else if (pack === 'waterfall') {
    at(cornerBunch(S * 0.9, 'bl', B, [{ kind: 'fern', col: '#4f9a3c', dark: '#2a5f22', n: 7, len: 0.75, wid: 0.13 }], undefined, 15), 0, h, 0, 0.03, 0.8, 0)
    at(cornerBunch(S * 0.9, 'br', B, [{ kind: 'fern', col: '#4f9a3c', dark: '#2a5f22', n: 7, len: 0.75, wid: 0.13 }], undefined, 16), w, h, 0, 0.03, 0.75, 2)
    at(vine(S, h * 0.45, B, '#4e9a3c', '#2f6a24', null, 17), w * 0.08, 0, 0, 0.05, 0.5, 1)
  } else if (pack === 'paris') {
    for (let i = 0; i < 5; i++) at(vine(S * 0.8, h * (0.16 + hash(i, 3) * 0.14), B, '#4e8f3c', '#2f6a24', '#ff8fb8', 20 + i), w * (0.04 + i * 0.23), 0, 0, 0.04, 0.6, i)
    const fl = { kind: 'rose' as const, cols: ['#ff7eb6', '#ffffff', '#e8304a'], n: 8, size: 0.06 }
    at(cornerBunch(S * 0.8, 'bl', B, [{ kind: 'oval', ...green, n: 8, len: 0.45, wid: 0.06 }], fl, 26), 0, h, 0, 0.03, 0.9, 0)
    at(cornerBunch(S * 0.8, 'br', B, [{ kind: 'oval', ...green, n: 8, len: 0.45, wid: 0.06 }], fl, 27), w, h, 0, 0.03, 0.8, 1.5)
  }
  return els
}

/** Little things floating close to the camera: petals, butterflies, mist, snow, drops. */
function frontLive(c: Ctx, pack: ScenePack, w: number, h: number, t: number, amount: number) {
  const U = Math.min(w, h)
  if (pack === 'garden' || pack === 'paris') {
    const n = Math.round(8 + amount * 14)
    for (let i = 0; i < n; i++) {
      const fall = 0.06 + hash(i, 1) * 0.05
      const y = (((hash(i, 2) + t * fall) % 1.2) - 0.1) * h
      const x = (hash(i, 3) + Math.sin(t * 0.8 + i) * 0.03 + t * 0.01) % 1 * w
      const s = U * (0.008 + hash(i, 4) * 0.012)
      c.save()
      c.translate(x, y)
      c.rotate(t * (1 + hash(i, 5)) + i)
      c.scale(Math.cos(t * 2 + i), 1)
      c.fillStyle = pack === 'garden' ? ['#ff7eb6', '#ffd23f', '#ffffff'][i % 3] : '#ffb3cf'
      c.globalAlpha = 0.85
      c.beginPath(); c.ellipse(0, 0, s, s * 0.6, 0, 0, Math.PI * 2); c.fill()
      c.restore()
    }
  }
  if (pack === 'garden' || pack === 'jungle') {
    for (let i = 0; i < 2; i++) {
      const x = (0.2 + 0.6 * hash(i, 8) + 0.25 * Math.sin(t * 0.23 + i * 3)) * w
      const y = (0.35 + 0.25 * Math.sin(t * 0.31 + i * 2) + 0.05 * Math.sin(t * 3 + i)) * h
      const s = U * 0.03
      const f = Math.abs(Math.sin(t * 10 + i))
      c.save()
      c.translate(x, y)
      c.fillStyle = i ? '#ff9f1c' : '#4cc9f0'
      for (const side of [-1, 1]) {
        c.save(); c.scale(side * (0.25 + 0.75 * f), 1)
        c.beginPath(); c.ellipse(s * 0.5, -s * 0.25, s * 0.5, s * 0.38, -0.4, 0, Math.PI * 2); c.fill()
        c.beginPath(); c.ellipse(s * 0.4, s * 0.3, s * 0.32, s * 0.26, 0.4, 0, Math.PI * 2); c.fill()
        c.restore()
      }
      c.fillStyle = '#222'
      c.fillRect(-s * 0.06, -s * 0.45, s * 0.12, s * 0.9)
      c.restore()
    }
  }
  if (pack === 'jungle') {
    c.fillStyle = 'rgba(255,250,210,0.6)'
    for (let i = 0; i < 18; i++) {
      const x = ((hash(i, 11) + Math.sin(t * 0.2 + i) * 0.03) % 1) * w
      const y = ((hash(i, 12) - t * 0.01 * (1 + hash(i, 13)) + 10) % 1) * h
      c.globalAlpha = 0.3 + 0.4 * Math.sin(t * 1.5 + i * 2) ** 2
      c.beginPath(); c.arc(x, y, U * 0.004, 0, Math.PI * 2); c.fill()
    }
    c.globalAlpha = 1
  }
  if (pack === 'hill' || pack === 'waterfall') {
    // a band of mist drifting along the bottom
    for (let i = 0; i < 5; i++) {
      const x = (((hash(i, 21) + t * 0.012) % 1.4) - 0.2) * w
      const y = h * (0.86 + hash(i, 22) * 0.1)
      const g = c.createRadialGradient(x, y, 0, x, y, U * 0.35)
      g.addColorStop(0, `rgba(255,255,255,${0.22 + amount * 0.15})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = g
      c.fillRect(x - U * 0.35, y - U * 0.35, U * 0.7, U * 0.7)
    }
  }
  if (pack === 'waterfall' || pack === 'fountain') {
    for (let i = 0; i < 12; i++) {
      const x = ((hash(i, 31) + Math.sin(t * 0.3 + i) * 0.02) % 1) * w
      const y = ((hash(i, 32) + t * 0.02) % 1) * h
      const r = U * (0.01 + hash(i, 33) * 0.02)
      const g = c.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, 'rgba(255,255,255,0.35)')
      g.addColorStop(0.7, 'rgba(220,240,255,0.15)')
      g.addColorStop(1, 'rgba(220,240,255,0)')
      c.fillStyle = g
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill()
    }
  }
  if (pack === 'mountain') {
    c.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 40; i++) {
      const y = ((hash(i, 41) + t * (0.04 + hash(i, 42) * 0.04)) % 1) * h
      const x = ((hash(i, 43) + Math.sin(t * 0.6 + i) * 0.02 + t * 0.005) % 1) * w
      c.beginPath(); c.arc(x, y, U * (0.002 + hash(i, 44) * 0.004), 0, Math.PI * 2); c.fill()
    }
  }
}

// ---------- drawing with caches ----------

interface Cached { key: string; canvases: Canvas[] }
const layerCache: Cached[] = []
const frontCache: { key: string; els: FrontEl[] }[] = []
const MAX_CACHE = 2

function cachedLayers(pack: ScenePack, w: number, h: number, focus: number): Canvas[] {
  const key = `${pack}:${w}x${h}:${focus.toFixed(2)}`
  const hit = layerCache.find((x) => x.key === key)
  if (hit) return hit.canvases
  const canvases = PACKS[pack].map((L) => {
    const cv = makeCanvas(w, h)
    L.draw(ctx2d(cv), w, h, focus)
    return cv
  })
  layerCache.unshift({ key, canvases })
  if (layerCache.length > MAX_CACHE) layerCache.length = MAX_CACHE
  return canvases
}

function cachedFront(pack: ScenePack, w: number, h: number): FrontEl[] {
  const key = `${pack}:${w}x${h}`
  const hit = frontCache.find((x) => x.key === key)
  if (hit) return hit.els
  const els = frontEls(pack, w, h)
  frontCache.unshift({ key, els })
  if (frontCache.length > MAX_CACHE) frontCache.length = MAX_CACHE
  return els
}

/** Forgets the drawn scenes (a project was closed). */
export function clearSceneCache() { layerCache.length = 0; frontCache.length = 0 }

let backScratch: Canvas | null = null

/**
 * The scene behind, filling c (W×H) at time t (seconds) and `progress` (0..1 through the clip, for the camera
 * move). With blur the whole scene is softened in one pass.
 */
export function drawSceneBack(c: Ctx, s: SceneFx, W: number, H: number, t: number, progress: number) {
  const focus = sceneFocus(s)
  const layers = PACKS[s.pack] ?? garden
  const canvases = cachedLayers(s.pack in PACKS ? s.pack : 'garden', W, H, focus)
  const blur = s.blur > 0.01 ? s.blur * Math.min(W, H) * 0.012 : 0
  let out = c
  if (blur) {
    backScratch ??= makeCanvas(W, H)
    if (backScratch.width !== W || backScratch.height !== H) { backScratch.width = W; backScratch.height = H }
    out = ctx2d(backScratch)
    out.setTransform(1, 0, 0, 1, 0, 0)
    out.clearRect(0, 0, W, H)
  }
  const cam = sceneCamera(s, progress)
  const T = s.living ? t : 0
  for (let i = 0; i < layers.length; i++) {
    const d = layers[i].depth
    const z = (1 + (cam.zoom - 1) * (0.3 + 0.7 * d)) * (1 + cam.pad * d)
    const dx = cam.dx * d * W
    out.save()
    out.translate(W / 2 + dx, H / 2)
    out.scale(z, z)
    out.translate(-W / 2, -H / 2)
    out.drawImage(canvases[i], 0, 0)
    layers[i].live?.(out, W, H, T, focus)
    out.restore()
  }
  if (blur) {
    c.save()
    c.filter = `blur(${blur.toFixed(1)}px)`
    c.drawImage(backScratch!, 0, 0)
    c.restore()
  }
}

/** The front frame over the picture (leaves, flowers, mist close to the camera), `alpha` for transitions. */
export function drawSceneFront(c: Ctx, s: SceneFx, W: number, H: number, t: number, alpha = 1) {
  if (alpha <= 0.001) return
  const pack = s.pack in PACKS ? s.pack : 'garden'
  const T = s.living ? t : 0
  const k = 0.6 + 0.7 * Math.min(1, Math.max(0, s.front))
  c.save()
  c.globalAlpha = alpha
  for (const e of cachedFront(pack, W, H)) {
    c.save()
    c.translate(e.x, e.y)
    c.rotate(e.rot + e.sway * Math.sin(T * e.speed + e.phase))
    c.scale(k, k)
    c.drawImage(e.img, -e.px, -e.py)
    c.restore()
  }
  frontLive(c, pack, W, H, T, s.front)
  c.restore()
}

/** A small picture of a scene for the panel (no caches touched). */
export function drawSceneThumb(c: Ctx, pack: ScenePack, w: number, h: number) {
  const s = defaultScene(pack, 'sandwich')
  for (const L of PACKS[pack]) {
    c.save()
    L.draw(c, w, h, 0.5)
    L.live?.(c, w, h, 0, 0.5)
    c.restore()
  }
  for (const e of frontEls(pack, w, h)) {
    c.save()
    c.translate(e.x, e.y)
    c.scale(0.9, 0.9)
    c.drawImage(e.img, -e.px, -e.py)
    c.restore()
  }
  frontLive(c, pack, w, h, 0, s.front)
}

// ---------- the person in the scene ----------

export interface PersonBox { x0: number; x1: number; y0: number; y1: number; cx: number; area: number }

let boxScratch: Canvas | null = null
const boxMemo = new WeakMap<object, { stamp: string; box: PersonBox | null }>()

/** Where the person is in a person mask (0..1 of the frame), or null when nobody is there. */
export function personBox(mask: Canvas, stamp: string): PersonBox | null {
  const memo = boxMemo.get(mask)
  if (memo && memo.stamp === stamp) return memo.box
  const N = 64
  boxScratch ??= makeCanvas(N, N)
  const bc = (boxScratch.getContext('2d', { willReadFrequently: true }) as Ctx)
  bc.globalCompositeOperation = 'copy'
  bc.drawImage(mask, 0, 0, N, N)
  const d = bc.getImageData(0, 0, N, N).data
  let x0 = N, x1 = -1, y0 = N, y1 = -1, n = 0, sx = 0
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (d[(y * N + x) * 4 + 3] > 128) { n++; sx += x; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  const box = n < N * N * 0.006 ? null : { x0: x0 / N, x1: (x1 + 1) / N, y0: y0 / N, y1: (y1 + 1) / N, cx: sx / n / N, area: n / (N * N) }
  boxMemo.set(mask, { stamp, box })
  return box
}

/** How far to move the person sideways (fraction of the width) in side mode. */
export function sideShift(s: SceneFx, box: PersonBox | null) {
  if (s.mode !== 'side') return 0
  const target = s.side === 'left' ? 0.3 : 0.7
  const cx = box ? box.cx : 0.5
  // never push the person out of the picture
  const want = target - cx
  if (!box) return want
  return Math.max(-box.x0, Math.min(1 - box.x1, want))
}

/** A soft shadow on the ground under the person's feet (only when the feet are in the picture). */
export function drawGroundShadow(c: Ctx, box: PersonBox, dx: number, W: number, H: number) {
  if (box.y1 > 0.97) return
  const cx = (box.cx + dx) * W, y = box.y1 * H
  const rw = (box.x1 - box.x0) * W * 0.55, rh = Math.max(4, H * 0.025)
  c.save()
  c.translate(cx, y)
  c.scale(1, rh / rw)
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rw)
  g.addColorStop(0, 'rgba(0,0,0,0.45)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = g
  c.beginPath(); c.arc(0, 0, rw, 0, Math.PI * 2); c.fill()
  c.restore()
}

/** Tints the person (a canvas holding only the person) with the scene's light. */
export function lightMatch(person: Canvas, s: SceneFx, w: number, h: number) {
  const c = ctx2d(person)
  c.save()
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.globalCompositeOperation = 'source-atop'
  c.globalAlpha = 0.14
  c.fillStyle = packInfo(s.pack).light
  c.fillRect(0, 0, w, h)
  // a little light from the top, like the sky above
  c.globalAlpha = 0.1
  c.fillStyle = vgrad(c, 0, h, [[0, '#ffffff'], [0.5, 'rgba(255,255,255,0)']])
  c.fillRect(0, 0, w, h)
  c.restore()
}

/** Clips whose person was not found in the last drawn frame (the panel says so; only the front frame shows). */
export const noPersonSeen = new Map<string, boolean>()
