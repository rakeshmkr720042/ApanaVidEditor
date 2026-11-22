import type { Bloom } from '../types'
import { drawRendered, flowersGL, renderFlowers, type FlowerItem, type FlowerKind } from './flowergl'

/**
 * The garden bloom: a whole screen of a sunny flower garden (soft far trees and light spots, rows of flowers, one
 * closed bud in the middle), the camera slowly pushes in to that bud while the rest of the garden goes soft (depth
 * of field), the bud opens into a full flower, the picture comes out of its heart and grows until it fills the
 * screen, and the petals fall over it. The garden is drawn once into a few depth layers (cached per size) that
 * move at different speeds as the camera pushes in (parallax); only the hero flower is drawn fresh every frame.
 * Every frame is worked out from the time alone, so preview, seeking and export match.
 */
type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x)
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x) }
const easeInOut = (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x) }

/** True when this bloom shows the garden (new blooms do; older ones open over the video). */
export const gardenOn = (b: Bloom) => b.garden === true && flowersGL()

// ---------- timeline ----------
export interface GardenTimes { push: number; bud: number; bloom: number; emerge: number; grow: number; fall: number; full: number }
/** When each part of the garden bloom happens, seconds from the start of the layer. */
export function gardenTimes(b: Bloom): GardenTimes {
  const o = Math.max(0.8, Math.min(5, b.open))
  const push = 1.6 + o * 0.45
  const bud = 1.2
  const bloom = bud + o * 1.15
  const emerge = bloom - 0.15 * o
  const grow = 0.55 + 0.2 * o
  const fill = 0.9 + 0.3 * o
  return { push, bud, bloom, emerge, grow, fall: emerge + grow, full: emerge + grow + fill }
}

// ---------- looks per flower ----------
interface Look {
  sky: [string, string, string] // top, middle, bottom of the far background
  trees: string[] // far foliage blobs
  spots: string // light spots (bokeh)
  ground: 'bush' | 'water' | 'field' | 'branch'
  colors: (string | null)[] // flowers in the garden (null = the bloom's own colour)
  stem: number // hero stem length (flower radii)
}
const LOOKS: Record<FlowerKind, Look> = {
  rose: { sky: ['#e9e2b8', '#7f9a5a', '#2c4220'], trees: ['#3e5a2a', '#55743a', '#2b4220', '#6d8a45'], spots: '255,246,214', ground: 'bush', colors: [null, null, null, '#e75480', '#f7efe4', '#f2c12e', '#ff7f6e', null], stem: 6 },
  lotus: { sky: ['#dfe9d9', '#7fa79b', '#21443f'], trees: ['#3f6a52', '#5c8a6a', '#2c5040'], spots: '240,255,246', ground: 'water', colors: [null, null, '#fff5f8', '#f8b5d0'], stem: 1.2 },
  sunflower: { sky: ['#bfe0ff', '#a9c97a', '#3d5a22'], trees: ['#5d7d34', '#7a9a44', '#465f28'], spots: '255,250,220', ground: 'field', colors: [null, null, null, '#ffa62b'], stem: 6 },
  sakura: { sky: ['#cfe6ff', '#f3d6e2', '#8a6a7a'], trees: ['#f6c6d8', '#efb2c8', '#fbd9e6', '#c89aaa'], spots: '255,236,244', ground: 'branch', colors: [null, null, '#ffffff', '#ffb0c8'], stem: 0 },
  marigold: { sky: ['#f1e2b0', '#8da15a', '#2f4520'], trees: ['#4f6a2c', '#6a8a3a', '#38521f'], spots: '255,236,200', ground: 'bush', colors: [null, null, '#ffc400', '#e65100', null], stem: 5 },
}

function makeCanvas(w: number, h: number): Canvas {
  if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h })
  return new OffscreenCanvas(w, h)
}
const ctxOf = (c: Canvas) => c.getContext('2d') as Ctx

/** Soft blur that works everywhere: shrink, then grow back (twice for a rounder look). */
function blurInto(src: Canvas, px: number): Canvas {
  const w = src.width, h = src.height
  const out = makeCanvas(w, h)
  const oc = ctxOf(out)
  if (px < 0.5) { oc.drawImage(src, 0, 0); return out }
  if ('filter' in (oc as object)) {
    oc.filter = `blur(${px.toFixed(1)}px)`
    oc.drawImage(src, 0, 0)
    oc.filter = 'none'
    // some browsers ignore the filter on these canvases: check one pixel row changed, else fall back
    return out
  }
  const k = Math.max(1, px / 2)
  const sw = Math.max(2, Math.round(w / k)), sh = Math.max(2, Math.round(h / k))
  const sm = makeCanvas(sw, sh)
  const sc = ctxOf(sm)
  sc.imageSmoothingQuality = 'high'
  sc.drawImage(src, 0, 0, sw, sh)
  oc.imageSmoothingQuality = 'high'
  oc.drawImage(sm, 0, 0, w, h)
  return out
}

// ---------- the cached garden ----------
interface Garden {
  key: string
  W: number; H: number // frame size
  m: number // margin round the frame, px (scene units)
  res: number // cache pixels per scene px for the sharp layers
  back: Canvas; far: Canvas; mid: Canvas; midSoft: Canvas; fg: Canvas
  hero: { x: number; y: number; r: number } // hero flower in scene px
}
let cache: Garden[] = []

function heroSpot(W: number, H: number) {
  const s = Math.min(W, H)
  return { x: W * 0.5, y: H * (W >= H ? 0.5 : 0.52), r: s * 0.085 }
}

function drawSky(c: Ctx, look: Look, X: number, Y: number, w: number, h: number, s: number, seed: number) {
  const g = c.createLinearGradient(0, Y, 0, Y + h)
  g.addColorStop(0, look.sky[0]); g.addColorStop(0.45, look.sky[1]); g.addColorStop(1, look.sky[2])
  c.fillStyle = g
  c.fillRect(X, Y, w, h)
  // far trees and hedges: big soft blobs, denser near the horizon
  for (let i = 0; i < 90; i++) {
    const x = X + rnd(seed + i, 1) * w
    const y = Y + h * (0.12 + 0.55 * Math.pow(rnd(seed + i, 2), 0.8))
    const r = s * (0.05 + 0.14 * rnd(seed + i, 3))
    c.fillStyle = look.trees[i % look.trees.length]
    c.globalAlpha = 0.45 + 0.4 * rnd(i, 4)
    c.beginPath(); c.ellipse(x, y, r, r * (0.7 + 0.4 * rnd(i, 5)), 0, 0, Math.PI * 2); c.fill()
  }
  c.globalAlpha = 1
  if (look.ground === 'water') {
    const wy = Y + h * 0.5
    const wg = c.createLinearGradient(0, wy, 0, Y + h)
    wg.addColorStop(0, '#6f9e98'); wg.addColorStop(0.4, '#3b6f6a'); wg.addColorStop(1, '#1b3c3a')
    c.fillStyle = wg
    c.fillRect(X, wy, w, Y + h - wy)
    c.strokeStyle = 'rgba(230,255,250,0.25)'
    for (let i = 0; i < 60; i++) {
      const y = wy + (Y + h - wy) * Math.pow(rnd(i, 7), 1.6)
      const x = X + rnd(i, 8) * w
      c.lineWidth = 1 + (y - wy) / h * s * 0.01
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + s * (0.03 + 0.1 * rnd(i, 9)), y); c.stroke()
    }
  } else if (look.ground === 'field') {
    const fg = c.createLinearGradient(0, Y + h * 0.5, 0, Y + h)
    fg.addColorStop(0, 'rgba(80,110,40,0)'); fg.addColorStop(1, 'rgba(40,60,20,0.9)')
    c.fillStyle = fg
    c.fillRect(X, Y + h * 0.5, w, h * 0.5)
  }
}

/** Light spots of out-of-focus highlights, drawn after the blur so they stay round. */
function drawSpots(c: Ctx, look: Look, X: number, Y: number, w: number, h: number, s: number, seed: number, n: number, big: number) {
  for (let i = 0; i < n; i++) {
    const x = X + rnd(seed + i, 11) * w
    const y = Y + h * (0.05 + 0.6 * rnd(seed + i, 12))
    const r = s * (0.012 + big * rnd(seed + i, 13))
    const a = 0.06 + 0.16 * rnd(seed + i, 14)
    const g = c.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(${look.spots},${(a * 0.7).toFixed(3)})`)
    g.addColorStop(0.82, `rgba(${look.spots},${a.toFixed(3)})`)
    g.addColorStop(1, `rgba(${look.spots},0)`)
    c.fillStyle = g
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill()
  }
}

/** Lily pads on the water (lotus garden). */
function drawPads(c: Ctx, X: number, Y: number, w: number, h: number, s: number, seed: number, n: number, y0: number, y1: number, size: number) {
  for (let i = 0; i < n; i++) {
    const x = X + rnd(seed + i, 21) * w
    const yy = Y + h * lerp(y0, y1, rnd(seed + i, 22))
    const r = s * size * (0.6 + 0.6 * rnd(seed + i, 23)) * (0.5 + (yy - Y) / h)
    drawPad(c, x, yy, r, rnd(seed + i, 24) * 6.28)
  }
}
function drawPad(c: Ctx, x: number, y: number, r: number, a0: number) {
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.1, 0, x, y, r)
  g.addColorStop(0, '#6fa04a'); g.addColorStop(1, '#2f5a26')
  c.fillStyle = g
  c.beginPath(); c.moveTo(x, y); c.ellipse(x, y, r, r * 0.32, 0, a0, a0 + Math.PI * 1.88); c.closePath(); c.fill()
  c.strokeStyle = 'rgba(200,240,160,0.35)'
  c.lineWidth = Math.max(1, r * 0.03)
  c.stroke()
}

/** A cherry branch (2D), from (x0,y0) to (x1,y1) with a few twigs; returns points where blossoms sit. */
function drawBranch(c: Ctx, x0: number, y0: number, x1: number, y1: number, wid: number, seed: number): [number, number][] {
  const pts: [number, number][] = []
  c.lineCap = 'round'
  const g = c.createLinearGradient(x0, y0 - wid, x0, y0 + wid)
  g.addColorStop(0, '#6b4a3c'); g.addColorStop(1, '#2e1d16')
  c.strokeStyle = g
  c.lineWidth = wid
  const mx = (x0 + x1) / 2 + (y1 - y0) * 0.15, my = (y0 + y1) / 2 - (x1 - x0) * 0.1
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke()
  for (let k = 1; k < 6; k++) {
    const t = k / 6
    const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1
    const by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1
    const ang = (k % 2 ? -1 : 1) * (0.6 + 0.5 * rnd(seed + k, 31)) - Math.PI / 2 * 0.3
    const L = wid * (5 + 5 * rnd(seed + k, 32))
    const ex = bx + Math.cos(ang) * L, ey = by + Math.sin(ang) * L
    c.lineWidth = wid * 0.45
    c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke()
    pts.push([ex, ey], [bx + (ex - bx) * 0.5, by + (ey - by) * 0.5])
  }
  pts.push([x1, y1])
  return pts
}

function buildGarden(kind: FlowerKind, color: string | null, W: number, H: number): Garden {
  const look = LOOKS[kind]
  const s = Math.min(W, H)
  const m = Math.round(Math.max(W, H) * 0.08)
  const res = Math.min(1, 1920 / Math.max(W + 2 * m, H + 2 * m))
  const CW = Math.round((W + 2 * m) * res), CH = Math.round((H + 2 * m) * res)
  const seed = kind.length * 7 + 3
  const hero = heroSpot(W, H)
  const tint = (c: string | null) => c ?? color
  // scene px -> cache px for a layer at resolution r
  const items = (list: FlowerItem[], r: number) => list.map((it) => ({ ...it, x: (it.x + m) * r, y: (it.y + m) * r, r: it.r * r }))
  const keepOff = (x: number, y: number, rr: number) => Math.abs(x - hero.x) < hero.r * 2.4 + rr && y > hero.y - hero.r * 2.5 && y < hero.y + hero.r * 1.2

  // 1. far background (half resolution, blurred a lot)
  const br = res * 0.5
  const bw = Math.round(CW * 0.5), bh = Math.round(CH * 0.5)
  const back0 = makeCanvas(bw, bh)
  const bc = ctxOf(back0)
  bc.scale(br, br)
  drawSky(bc, look, 0, 0, W + 2 * m, H + 2 * m, s, seed)
  if (look.ground === 'water') drawPads(bc, 0, 0, W + 2 * m, H + 2 * m, s, seed, 26, 0.52, 0.75, 0.06)
  const back = blurInto(back0, s * br * 0.03)
  const bkc = ctxOf(back)
  bkc.save(); bkc.scale(br, br)
  drawSpots(bkc, look, 0, 0, W + 2 * m, H + 2 * m, s, seed, 18, 0.03)
  bkc.restore()

  // 2. far flowers (half resolution, softly blurred)
  const farList: FlowerItem[] = []
  const horizon = look.ground === 'water' ? 0.5 : 0.3
  if (look.ground !== 'branch') {
    for (let i = 0; i < (look.ground === 'water' ? 0 : 34); i++) {
      const y = H * lerp(horizon, horizon + 0.26, rnd(seed + i, 41)) + m * 0.2
      farList.push({ kind: 'rose', color: null, open: 0, x: rnd(seed + i, 42) * (W + 2 * m) - m, y: y + s * 0.03, r: s * 0.06 * (0.6 + (y / H)), pitch: 0.5, yaw: i, bush: 9, seed: i })
    }
    for (let i = 0; i < 70; i++) {
      const y = H * lerp(horizon - 0.02, horizon + 0.28, rnd(seed + i, 43))
      const k = 0.55 + (y / H) * 0.9
      farList.push({ kind, color: tint(look.colors[i % look.colors.length]), open: 0.6 + 0.4 * rnd(i, 44), x: rnd(seed + i, 45) * (W + 2 * m) - m, y, r: s * 0.026 * k, pitch: 0.55 + 0.35 * rnd(i, 46), yaw: i * 1.7, roll: (rnd(i, 47) - 0.5) * 0.4, stem: look.ground === 'water' ? 0.4 : 2.5, leaves: 1, seed: i + 100 })
    }
  }
  farList.sort((a, b) => a.y - b.y)
  const far0 = makeCanvas(bw, bh)
  const fc = ctxOf(far0)
  const fcv = renderFlowers(items(farList, br), bw, bh)
  if (fcv) drawRendered(fc, fcv, 0, 0, bw, bh)
  if (look.ground === 'branch') {
    // a far, soft cherry tree full of blossom clouds
    for (let i = 0; i < 70; i++) {
      const x = rnd(i, 51) * bw, y = bh * (0.05 + 0.55 * rnd(i, 52)), r = s * br * (0.04 + 0.08 * rnd(i, 53))
      fc.fillStyle = look.trees[i % look.trees.length]
      fc.globalAlpha = 0.5
      fc.beginPath(); fc.arc(x, y, r, 0, Math.PI * 2); fc.fill()
    }
    fc.globalAlpha = 1
  }
  const far = blurInto(far0, s * br * 0.006)

  // 3. middle flowers (full resolution, sharp + a soft copy)
  const midList: FlowerItem[] = []
  const mid = makeCanvas(CW, CH)
  const mc = ctxOf(mid)
  if (look.ground === 'branch') {
    // near branches full of open blossoms across the frame (the hero twig is drawn live)
    mc.save(); mc.scale(res, res); mc.translate(m, m)
    const lines: [number, number, number, number][] = [[-0.1, 0.25, 0.42, 0.1], [1.1, 0.2, 0.62, 0.32], [-0.1, 0.95, 0.3, 0.78], [1.1, 0.9, 0.7, 0.75]]
    lines.forEach(([x0, y0, x1, y1], i) => {
      const pts = drawBranch(mc, x0 * W, y0 * H, x1 * W, y1 * H, s * 0.018, 10 + i)
      pts.forEach(([px, py], j) => {
        for (let q = 0; q < 2; q++) {
          midList.push({ kind, color: tint(look.colors[(i + j + q) % look.colors.length]), open: 0.7 + 0.3 * rnd(i * 9 + j, 71), x: px + (q - 0.5) * s * 0.03, y: py + q * s * 0.015, r: s * (0.035 + 0.015 * rnd(j, 72)), pitch: 0.6 + 0.6 * rnd(i + j, 73), yaw: j * 1.9 + q, roll: (rnd(j, 74) - 0.5) * 0.8, seed: i * 20 + j })
        }
      })
    })
    mc.restore()
  } else if (look.ground !== 'water') {
    for (let i = 0; i < 30; i++) {
      const x = rnd(seed + i, 61) * (W + 2 * m) - m
      const y = H * lerp(0.6, 1.08, rnd(seed + i, 62))
      midList.push({ kind: 'rose', color: null, open: 0, x, y, r: s * (0.1 + 0.07 * rnd(i, 63)), pitch: 0.5, yaw: i * 2.1, bush: 34, seed: i + 300 })
    }
    let placed = 0
    for (let i = 0; i < 90 && placed < 26; i++) {
      const x = rnd(seed + i, 64) * (W + 2 * m) - m
      const y = H * lerp(0.54, 1.02, rnd(seed + i, 65))
      const r = s * (0.05 + 0.035 * rnd(i, 66)) * (0.6 + 0.6 * (y / H))
      if (keepOff(x, y, r)) continue
      placed++
      midList.push({ kind, color: tint(look.colors[i % look.colors.length]), open: 0.55 + 0.45 * rnd(i, 67), x, y, r, pitch: 0.45 + 0.45 * rnd(i, 68), yaw: i * 2.3, roll: (rnd(i, 69) - 0.5) * 0.5, stem: 4, leaves: 2, seed: i + 200 })
    }
  }
  if (look.ground === 'water') {
    let placed = 0
    for (let i = 0; i < 90 && placed < 20; i++) {
      const x = rnd(seed + i, 64) * (W + 2 * m) - m
      const y = H * lerp(0.6, 1.02, rnd(seed + i, 65))
      const r = s * (0.05 + 0.035 * rnd(i, 66)) * (0.6 + 0.6 * (y / H))
      if (keepOff(x, y, r)) continue
      placed++
      midList.push({ kind, color: tint(look.colors[i % look.colors.length]), open: 0.55 + 0.45 * rnd(i, 67), x, y, r, pitch: 0.45 + 0.4 * rnd(i, 68), yaw: i * 2.3, roll: (rnd(i, 69) - 0.5) * 0.3, seed: i + 200 })
    }
  }
  midList.sort((a, b) => a.y - b.y)
  if (look.ground === 'water') { mc.save(); mc.scale(res, res); drawPads(mc, 0, 0, W + 2 * m, H + 2 * m, s, seed + 9, 12, 0.62, 1.0, 0.11); mc.restore() }
  const mcv = renderFlowers(items(midList, res), CW, CH)
  if (mcv) {
    if ('filter' in (mc as object)) mc.filter = `blur(${(s * res * 0.0028).toFixed(2)}px)`
    drawRendered(mc, mcv, 0, 0, CW, CH)
    if ('filter' in (mc as object)) mc.filter = 'none'
  }
  const midSoft0 = makeCanvas(Math.round(CW / 2), Math.round(CH / 2))
  ctxOf(midSoft0).drawImage(mid, 0, 0, midSoft0.width, midSoft0.height)
  const midSoft = blurInto(midSoft0, s * res * 0.5 * 0.012)

  // 4. near, very soft leaves and flowers at the edges (third resolution)
  const fr = res / 3
  const fw = Math.round(CW / 3), fh = Math.round(CH / 3)
  const fgList: FlowerItem[] = []
  if (look.ground === 'branch') {
    for (let i = 0; i < 6; i++) fgList.push({ kind, color: tint(look.colors[i % look.colors.length]), open: 0.9, x: (i % 2 ? 1.02 : -0.02) * W, y: (0.2 + 0.3 * i / 2) * H, r: s * 0.14, pitch: 0.8, yaw: i, seed: i + 600 })
  } else {
    const spots = [[-0.04, 1.02], [1.05, 0.98], [0.12, 1.12], [0.9, 1.15], [-0.06, 0.6], [1.07, 0.55]]
    spots.forEach(([fx, fy], i) => {
      if (look.ground !== 'water') fgList.push({ kind: 'rose', color: null, open: 0, x: fx * W, y: fy * H, r: s * 0.3, pitch: 0.6, yaw: i, bush: 26, seed: i + 400 })
      if (i < 3) fgList.push({ kind, color: tint(look.colors[(i + 1) % look.colors.length]), open: 0.9, x: fx * W + s * 0.08, y: fy * H - s * 0.12, r: s * 0.16, pitch: 0.7, yaw: i * 2, seed: i + 500 })
    })
  }
  const fg0 = makeCanvas(fw, fh)
  const fgc = ctxOf(fg0)
  const fgv = renderFlowers(items(fgList, fr), fw, fh)
  if (fgv) drawRendered(fgc, fgv, 0, 0, fw, fh)
  const fg = blurInto(fg0, s * fr * 0.025)

  return { key: '', W, H, m, res, back, far, mid, midSoft, fg, hero }
}

function garden(kind: FlowerKind, color: string | null, W: number, H: number): Garden {
  const key = `${kind}|${color ?? ''}|${W}x${H}`
  let g = cache.find((x) => x.key === key)
  if (!g) {
    g = buildGarden(kind, color, W, H)
    g.key = key
    cache = [g, ...cache].slice(0, 2)
  }
  return g
}
/** Builds the garden for this size ahead of time (so the first frame of playback does not stutter). */
export function warmGarden(b: Bloom, W: number, H: number) { if (gardenOn(b)) garden(b.flower, b.color, W, H) }

// ---------- camera ----------
interface Cam { zoom: number; cx: number; cy: number; hx: number; hy: number; focus: number }
/** Final flower radius on screen. */
const targetR = (b: Bloom, W: number, H: number) => (Math.max(0.15, Math.min(1.2, b.size)) * Math.min(W, H)) / 2
function camera(b: Bloom, local: number, g: Garden, W: number, H: number): Cam {
  const tm = gardenTimes(b)
  const p = easeInOut(local / tm.push)
  const Zf = targetR(b, W, H) / (g.hero.r * 0.8)
  // a slow drift keeps going after the push, so the picture never feels frozen
  const drift = 1 + 0.03 * smooth((local - tm.push) / 6)
  const zoom = lerp(1, Zf, p) * drift
  const cx = lerp(g.hero.x, W * 0.5, p) + Math.sin(local * 0.4) * W * 0.004
  const cy = lerp(g.hero.y, H * 0.5, p) + Math.cos(local * 0.33) * H * 0.003
  return { zoom, cx, cy, hx: g.hero.x, hy: g.hero.y, focus: smooth((local - 0.2) / (tm.push * 0.8)) }
}

function drawLayer(c: Ctx, cv: Canvas, g: Garden, cam: Cam, k: number, alpha = 1) {
  if (alpha <= 0.002) return
  const z = 1 + (cam.zoom - 1) * k
  const sx = cv.width / (g.W + 2 * g.m)
  c.save()
  c.globalAlpha *= alpha
  c.translate(cam.cx, cam.cy)
  c.scale(z / sx, z / sx)
  c.translate(-(cam.hx + g.m) * sx, -(cam.hy + g.m) * sx)
  c.drawImage(cv, 0, 0)
  c.restore()
}

/** How open the hero flower is. */
function heroOpen(b: Bloom, local: number) {
  const tm = gardenTimes(b)
  const x = clamp01((local - tm.bud) / (tm.bloom - tm.bud))
  // petals open quickly in the middle and settle slowly, with a tiny spring
  return clamp01(easeInOut(x) + 0.04 * Math.sin(Math.PI * x) * x)
}

// ---------- the photo coming out ----------
export interface GardenPhoto { x: number; y: number; s: number; r: number; edge: number; alpha: number }
/**
 * Where the picture is and how much shows: centre (px), scale of the picture against its full-frame size, radius
 * of the round opening on screen (Infinity = all of it), and the glowing rim.
 */
export function gardenPhoto(b: Bloom, local: number, dur: number, W: number, H: number, pw: number, ph: number): GardenPhoto {
  const tm = gardenTimes(b)
  const g = garden(b.flower, b.color, W, H)
  const cam = camera(b, local, g, W, H)
  const R = targetR(b, W, H)
  const t = local - tm.emerge
  const end = Number.isFinite(dur) ? clamp01((dur - local) / 0.5) : 1
  if (t <= 0) return { x: cam.cx, y: cam.cy, s: 0, r: 0, edge: 0, alpha: 0 }
  const inner = R * (b.flower === 'sunflower' ? 0.36 : b.flower === 'sakura' ? 0.3 : 0.4)
  const e = easeOut(t / tm.grow)
  const rA = inner * (0.15 + 0.85 * e)
  const short = Math.min(pw, ph)
  const s0 = (rA * 2.3) / short
  if (!b.fill) return { x: cam.cx, y: cam.cy, s: s0, r: rA, edge: 1, alpha: clamp01(t * 4) * end }
  const f = easeInOut((local - tm.fall) / (tm.full - tm.fall))
  const cover = Math.hypot(W, H) * 0.6
  if (f >= 1) return { x: W / 2, y: H / 2, s: 1, r: Infinity, edge: 0, alpha: end }
  const r = lerp(rA, cover, f)
  // the picture grows with the opening (the round window always stays inside it) until it covers the frame
  const sc = Math.min(1, Math.max(s0, (r * 2.3) / short))
  return { x: lerp(cam.cx, W / 2, f), y: lerp(cam.cy, H / 2, f), s: sc, r, edge: 1 - f, alpha: clamp01(t * 4) }
}

/** Puts the light of the garden on: warm sun haze from the top, a few soft rays, darker corners. */
function drawLight(c: Ctx, W: number, H: number, local: number) {
  const s = Math.max(W, H)
  c.save()
  c.globalCompositeOperation = 'lighter'
  const sx = W * 0.18, sy = -H * 0.1
  const g = c.createRadialGradient(sx, sy, 0, sx, sy, s * 0.9)
  g.addColorStop(0, 'rgba(255,236,190,0.22)')
  g.addColorStop(0.5, 'rgba(255,226,170,0.08)')
  g.addColorStop(1, 'rgba(255,226,170,0)')
  c.fillStyle = g
  c.fillRect(0, 0, W, H)
  c.translate(sx, sy)
  for (let i = 0; i < 4; i++) {
    const a = 0.6 + i * 0.2 + Math.sin(local * 0.25 + i) * 0.015
    c.save()
    c.rotate(a)
    const rg = c.createLinearGradient(0, 0, s * 1.4, 0)
    rg.addColorStop(0, 'rgba(255,240,200,0.035)')
    rg.addColorStop(1, 'rgba(255,240,200,0)')
    c.fillStyle = rg
    c.beginPath(); c.moveTo(0, 0); c.lineTo(s * 1.4, -s * 0.12 * (1 + (i % 2))); c.lineTo(s * 1.4, s * 0.12 * (1 + (i % 2))); c.closePath(); c.fill()
    c.restore()
  }
  c.restore()
}
function drawVignette(c: Ctx, W: number, H: number) {
  c.save()
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(10,15,5,0.45)')
  c.fillStyle = v
  c.fillRect(0, 0, W, H)
  c.restore()
}

/** The hero flower as drawn this frame (screen px). */
function heroItem(b: Bloom, local: number, g: Garden, cam: Cam): FlowerItem {
  const look = LOOKS[b.flower]
  const open = heroOpen(b, local)
  const x = cam.cx + Math.sin(local * 1.3) * g.hero.r * 0.04 * cam.zoom * (1 - open * 0.7)
  return {
    kind: b.flower, color: b.color, open,
    x, y: cam.cy, r: g.hero.r * cam.zoom,
    pitch: lerp(0.32, 1.02, smooth(open * 1.1)), yaw: 0.4 + local * 0.06,
    roll: Math.sin(local * 1.1) * 0.03 * (1 - open * 0.6),
    stem: look.stem, stemBend: 0.01, leaves: look.stem > 2 ? 3 : 0, seed: 7,
  }
}

/** The garden, the camera push and the blooming hero flower (everything under the picture). */
export function drawGardenBack(c: Ctx, b: Bloom, local: number, _dur: number, W: number, H: number, alpha: number) {
  if (alpha <= 0.001) return
  const tm = gardenTimes(b)
  if (b.fill && local > tm.full + 0.05) return // the picture covers everything now
  const g = garden(b.flower, b.color, W, H)
  const cam = camera(b, local, g, W, H)
  const look = LOOKS[b.flower]
  c.save()
  c.globalAlpha = alpha
  drawLayer(c, g.back, g, cam, 0.25)
  drawLayer(c, g.far, g, cam, 0.5)
  drawLayer(c, g.mid, g, cam, 0.82, 1 - cam.focus)
  drawLayer(c, g.midSoft, g, cam, 0.82, cam.focus)
  const hero = heroItem(b, local, g, cam)
  if (look.ground === 'branch') {
    // the hero blossom sits at the tip of a twig on a branch coming in from the side
    const z = cam.zoom
    const hx = hero.x, hy = hero.y
    const pts = drawBranch(c, hx - g.hero.r * 9 * z, hy + g.hero.r * 4 * z, hx + g.hero.r * 0.2 * z, hy + g.hero.r * 0.35 * z, g.hero.r * 0.22 * z, 3)
    const buds: FlowerItem[] = pts.slice(0, -1).filter((_, i) => i % 2 === 0).map(([px, py], i) => ({
      kind: 'sakura', color: b.color, open: clamp01(heroOpen(b, local - 0.3 - i * 0.15) * 0.9 + 0.1 * (i % 2)), x: px, y: py, r: g.hero.r * z * 0.75, pitch: 0.7, yaw: i * 1.3, seed: i + 40,
    }))
    drawLight(c, W, H, local)
    renderAndDraw(c, [...buds, hero], W, H)
  } else {
    drawLight(c, W, H, local)
    if (look.ground === 'water') {
      // the hero lotus stands on its own lily pad
      const z = cam.zoom, r = g.hero.r * z
      drawPad(c, hero.x + r * 0.1, hero.y + r * 0.95, r * 1.5, 1.2)
    }
    renderAndDraw(c, [hero], W, H)
  }
  drawLayer(c, g.fg, g, cam, 1.5, 1 - smooth((cam.zoom - 1) / 1.5) * 0.6)
  drawVignette(c, W, H)
  // a soft glow in the flower's heart just before the picture comes out
  const gl = clamp01(1 - Math.abs(local - tm.emerge) / 0.6)
  if (gl > 0) {
    const R = targetR(b, W, H) * 0.5
    c.globalCompositeOperation = 'lighter'
    const rg = c.createRadialGradient(cam.cx, cam.cy, 0, cam.cx, cam.cy, R)
    rg.addColorStop(0, `rgba(255,248,225,${(0.55 * gl).toFixed(3)})`)
    rg.addColorStop(1, 'rgba(255,240,200,0)')
    c.fillStyle = rg
    c.fillRect(cam.cx - R, cam.cy - R, R * 2, R * 2)
  }
  c.restore()
}

function renderAndDraw(c: Ctx, items: FlowerItem[], W: number, H: number) {
  const cv = renderFlowers(items, W, H)
  if (cv) drawRendered(c, cv, 0, 0, W, H)
}

/** Where the hero flower's heart is on screen and its radius (for the petals that break away). */
export function gardenHeart(b: Bloom, local: number, W: number, H: number) {
  const g = garden(b.flower, b.color, W, H)
  const cam = camera(b, local, g, W, H)
  return { x: cam.cx, y: cam.cy, r: targetR(b, W, H) }
}
