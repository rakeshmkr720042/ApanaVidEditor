import type { Bloom, ShapeMask } from '../types'
import { drawPetalSprite, drawRendered, flowersGL, renderFlowers } from './flowergl'
import { drawGardenBack, gardenHeart, gardenOn, gardenTimes } from './garden'
import { readyPhotosOf } from './readyFlowers'
import { drawPhotoBack, drawPhotoPetal, photoHeart, photoOn, photoTimes, picsOf, type Pics } from './photoBloom'

/**
 * Flower bloom reveal: a bud grows, the flower opens petal by petal, the chosen photo / video comes out of its
 * centre (and can fill the screen), and petals fall over the whole picture. Everything is drawn in code (no image
 * files) and worked out from the time alone, so preview, seeking and export always give the same frame.
 */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Canvas = HTMLCanvasElement | OffscreenCanvas
export type FlowerKind = Bloom['flower']

export const FLOWERS: { value: FlowerKind; label: string; icon: string; color: string; colors: string[]; free: boolean }[] = [
  { value: 'rose', label: 'Rose', icon: '🌹', color: '#c8102e', colors: ['#c8102e', '#ff5c8a', '#fff1ea', '#ffd23f', '#ff7a1a'], free: true },
  { value: 'lotus', label: 'Lotus', icon: '🪷', color: '#f48fb1', colors: ['#f48fb1', '#fff5f8', '#ce93d8'], free: false },
  { value: 'sunflower', label: 'Sunflower', icon: '🌻', color: '#ffc107', colors: ['#ffc107', '#ff9800'], free: false },
  { value: 'sakura', label: 'Sakura', icon: '🌸', color: '#ffc2d4', colors: ['#ffc2d4', '#ffffff', '#ff8fb8'], free: false },
  { value: 'marigold', label: 'Marigold', icon: '🏵️', color: '#ff8f00', colors: ['#ff8f00', '#ffc400', '#e65100'], free: false },
]
export const flowerInfo = (k: FlowerKind) => FLOWERS.find((f) => f.value === k) ?? FLOWERS[0]

/** A new bloom; a flower with ready real photos (the rose) starts as a real-photo bloom with them. */
export const defaultBloom = (flower: FlowerKind = 'rose'): Bloom => {
  const ready = readyPhotosOf(flower)
  return {
    flower, color: null, open: 2, size: 0.62, fill: true, petals: 60, seconds: 4, wind: flower === 'sakura' ? 0.4 : 0, garden: true,
    ...(ready ? { photo: true, photos: { ...ready } } : {}),
  }
}

// ---------- small helpers ----------
const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x)
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const easeInOut = (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2 }
/** Slow start, smooth middle and a tiny spring at the end, like a petal opening. */
const easeBack = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x) + 0.15 * Math.sin(Math.PI * x) * x * x }
const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x) }

function rgbOf(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim().slice(0, 7))
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(c: [number, number, number], to: number, f: number) {
  const v = (x: number) => Math.round(x + (to - x) * f)
  return `rgb(${v(c[0])},${v(c[1])},${v(c[2])})`
}
interface Pal { base: string; deep: string; tip: string; edge: string; back: string }
const pals = new Map<string, Pal>()
function palette(kind: FlowerKind, color: string | null | undefined): Pal {
  const key = `${kind}|${color ?? ''}`
  let p = pals.get(key)
  if (!p) {
    const c = rgbOf(color) ?? rgbOf(flowerInfo(kind).color)!
    const light = c[0] + c[1] + c[2] > 640 // white petals: shade with a soft pink-grey instead of black
    p = {
      base: mix(c, 0, 0),
      deep: light ? mix([c[0] - 40, c[1] - 70, c[2] - 60], 0, 0.1) : mix(c, 0, 0.5),
      tip: mix(c, 255, light ? 0.6 : 0.28),
      edge: mix(c, 255, 0.55),
      back: light ? mix(c, 0, 0.18) : mix(c, 0, 0.3),
    }
    if (pals.size > 40) pals.clear()
    pals.set(key, p)
  }
  return p
}

// ---------- petal outlines (base at 0,0, tip at 0,-1, about ±0.5 wide) ----------
const PETAL: Record<FlowerKind, (c: Ctx) => void> = {
  rose: (c) => {
    c.moveTo(0, 0)
    c.bezierCurveTo(-0.62, -0.12, -0.78, -0.82, -0.3, -0.99)
    c.quadraticCurveTo(0, -0.9, 0.3, -0.99)
    c.bezierCurveTo(0.78, -0.82, 0.62, -0.12, 0, 0)
  },
  lotus: (c) => {
    c.moveTo(0, 0)
    c.bezierCurveTo(-0.5, -0.2, -0.42, -0.72, 0, -1)
    c.bezierCurveTo(0.42, -0.72, 0.5, -0.2, 0, 0)
  },
  sunflower: (c) => {
    c.moveTo(0, 0)
    c.bezierCurveTo(-0.5, -0.3, -0.42, -0.8, 0, -1)
    c.bezierCurveTo(0.42, -0.8, 0.5, -0.3, 0, 0)
  },
  sakura: (c) => {
    c.moveTo(0, 0)
    c.bezierCurveTo(-0.62, -0.25, -0.62, -0.95, -0.2, -1)
    c.lineTo(0, -0.84)
    c.lineTo(0.2, -1)
    c.bezierCurveTo(0.62, -0.95, 0.62, -0.25, 0, 0)
  },
  marigold: (c) => {
    c.moveTo(0, 0)
    c.lineTo(-0.5, -0.8)
    c.quadraticCurveTo(-0.42, -1.02, -0.25, -0.9)
    c.quadraticCurveTo(-0.13, -1.06, 0, -0.92)
    c.quadraticCurveTo(0.13, -1.06, 0.25, -0.9)
    c.quadraticCurveTo(0.42, -1.02, 0.5, -0.8)
    c.closePath()
  },
}

/**
 * One petal pointing up from (0,0): `len` long, `wid` × len wide. `shade` 0..1 darkens it (closed / turned away).
 */
function petal(c: Ctx, kind: FlowerKind, pal: Pal, len: number, wid: number, shade: number, line: boolean | string = true) {
  if (len < 0.5) return
  c.beginPath()
  c.save()
  c.scale(Math.max(0.01, len * wid), len)
  PETAL[kind](c)
  c.restore()
  const g = c.createLinearGradient(0, 0, 0, -len)
  g.addColorStop(0, pal.deep)
  g.addColorStop(0.55, pal.base)
  g.addColorStop(1, pal.tip)
  c.fillStyle = g
  c.fill()
  if (shade > 0.01) {
    c.fillStyle = `rgba(40,0,10,${(shade * 0.45).toFixed(3)})`
    c.fill()
  }
  if (line) {
    const a = c.globalAlpha
    c.lineWidth = Math.max(0.6, len * 0.025)
    c.strokeStyle = typeof line === 'string' ? line : pal.edge
    c.globalAlpha = a * 0.55
    c.stroke()
    c.globalAlpha = a
  }
}

/** A soft dark copy of a petal a little lower, so overlapping petals look layered (cheaper than shadowBlur). */
function petalShadow(c: Ctx, kind: FlowerKind, len: number, wid: number, a: number) {
  if (len < 0.5) return
  c.beginPath()
  c.save()
  c.translate(0, len * 0.04)
  c.scale(len * wid * 1.08, len * 1.04)
  PETAL[kind](c)
  c.restore()
  c.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`
  c.fill()
}

function sepals(c: Ctx, R: number, n: number, open: number, a0: number) {
  const len = R * (0.45 + 0.55 * open)
  c.fillStyle = '#2e7d32'
  for (let j = 0; j < n; j++) {
    c.save()
    c.rotate(a0 + (j * Math.PI * 2) / n)
    c.beginPath()
    c.moveTo(0, 0)
    c.quadraticCurveTo(-len * 0.28, -len * 0.5, 0, -len)
    c.quadraticCurveTo(len * 0.28, -len * 0.5, 0, 0)
    c.fill()
    c.restore()
  }
}

// ---------- the five flowers (centred on 0,0, about R across from the centre) ----------
function drawRose(c: Ctx, R: number, open: number, pal: Pal, time: number) {
  sepals(c, R * 0.95, 5, open, 0.3)
  const rings = [
    { n: 5, r: 1, a0: 0 }, { n: 5, r: 0.82, a0: 0.63 }, { n: 5, r: 0.64, a0: 0.2 }, { n: 4, r: 0.47, a0: 0.95 }, { n: 3, r: 0.32, a0: 0.4 },
  ]
  rings.forEach((rg, ri) => {
    const o = easeBack((open - ri * 0.1) / 0.6)
    const len = R * rg.r * (0.36 + 0.64 * o)
    const wid = 0.95 + 0.3 * o
    const twist = (1 - o) * 1.1 + Math.sin(time * 0.6 + ri) * 0.015
    for (let j = 0; j < rg.n; j++) {
      c.save()
      c.rotate(rg.a0 + (j * Math.PI * 2) / rg.n + twist)
      petalShadow(c, 'rose', len, wid, 0.22)
      petal(c, 'rose', pal, len, wid, (1 - o) * 0.5 + ri * 0.06)
      c.restore()
    }
  })
  // the tight curled heart of the rose
  c.save()
  c.lineCap = 'round'
  c.strokeStyle = pal.deep
  for (let k = 0; k < 4; k++) {
    c.lineWidth = Math.max(1, R * 0.028)
    c.beginPath()
    const a = k * 1.9 + (1 - open) * 1.5
    c.arc(0, 0, R * 0.055 * (k + 1) * (0.75 + 0.25 * open), a, a + Math.PI * 1.25)
    c.stroke()
  }
  c.restore()
}

function drawLotus(c: Ctx, R: number, open: number, pal: Pal, time: number) {
  const by = R * 0.42
  // water: rings spreading out and two lily pads
  c.save()
  const a = c.globalAlpha
  c.strokeStyle = '#bfe9ff'
  c.lineWidth = Math.max(1, R * 0.018)
  for (let k = 0; k < 3; k++) {
    const ph = (time * 0.35 + k / 3) % 1
    c.globalAlpha = a * 0.5 * (1 - ph) * Math.min(1, open * 2 + 0.3)
    c.beginPath()
    c.ellipse(0, by + R * 0.05, R * (0.7 + ph * 1.1), R * (0.12 + ph * 0.2), 0, 0, Math.PI * 2)
    c.stroke()
  }
  c.globalAlpha = a
  for (const [x, y, s] of [[-0.95, 0.12, 0.55], [0.9, 0.2, 0.45]]) {
    c.beginPath()
    c.ellipse(x * R, by + y * R, R * s, R * s * 0.26, 0, 0.25, Math.PI * 2 - 0.05)
    c.lineTo(x * R, by + y * R)
    c.closePath()
    c.fillStyle = '#2e7d32'
    c.fill()
    c.strokeStyle = '#66bb6a'
    c.lineWidth = Math.max(1, R * 0.012)
    c.stroke()
  }
  c.restore()
  const rows = [
    { n: 6, spread: 1.25, len: 1.0, wid: 0.62, shade: 0.35, delay: 0 },
    { n: 5, spread: 0.6, len: 1.12, wid: 0.6, shade: 0.12, delay: 0.15 },
    { n: 4, spread: 1.05, len: 0.92, wid: 0.72, shade: 0, delay: 0.05 },
  ]
  c.save()
  c.translate(0, by)
  for (const row of rows) {
    const o = easeBack((open - row.delay) / 0.75)
    for (let j = 0; j < row.n; j++) {
      const u = row.n > 1 ? (2 * j) / (row.n - 1) - 1 : 0
      c.save()
      c.rotate(row.spread * u * o + Math.sin(time * 0.8 + j) * 0.012)
      const len = R * row.len * (0.62 + 0.38 * o) * (1 - Math.abs(u) * 0.12)
      const wid = row.wid * (0.8 + 0.2 * o)
      petalShadow(c, 'lotus', len, wid, 0.16)
      petal(c, 'lotus', pal, len, wid, row.shade + (1 - o) * 0.15)
      c.restore()
    }
  }
  c.restore()
}

const discs = new Map<string, Canvas>()
function seedDisc(px: number): Canvas {
  const s = Math.max(16, Math.min(1024, Math.round(px / 8) * 8))
  const key = String(s)
  let d = discs.get(key)
  if (!d) {
    d = makeCanvas(s, s)
    const x = d.getContext('2d') as Ctx
    const r = s / 2
    const g = x.createRadialGradient(r, r, 0, r, r, r)
    g.addColorStop(0, '#2b170c'); g.addColorStop(0.7, '#4e2c17'); g.addColorStop(0.92, '#7a4a1e'); g.addColorStop(1, '#c58a1a')
    x.fillStyle = g
    x.beginPath(); x.arc(r, r, r, 0, Math.PI * 2); x.fill()
    const n = 240
    for (let k = 1; k < n; k++) {
      const rr = Math.sqrt(k / n) * r * 0.9, a = k * 2.39996
      x.fillStyle = k % 3 ? 'rgba(20,10,4,0.8)' : 'rgba(200,140,60,0.55)'
      x.beginPath(); x.arc(r + Math.cos(a) * rr, r + Math.sin(a) * rr, Math.max(0.5, r * 0.028), 0, Math.PI * 2); x.fill()
    }
    if (discs.size > 6) discs.clear()
    discs.set(key, d)
  }
  return d
}

function drawSunflower(c: Ctx, R: number, open: number, pal: Pal, time: number) {
  // soft golden rays behind
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.globalAlpha *= 0.3 * clamp01(open * 1.5)
  const rg = c.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.7)
  rg.addColorStop(0, 'rgba(255,214,90,0.9)')
  rg.addColorStop(1, 'rgba(255,214,90,0)')
  c.fillStyle = rg
  c.rotate(time * 0.15)
  for (let j = 0; j < 12; j++) {
    c.rotate(Math.PI / 6)
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-R * 0.14, -R * 1.7); c.lineTo(R * 0.14, -R * 1.7); c.closePath(); c.fill()
  }
  c.restore()
  sepals(c, R * 0.9, 16, open, 0.1)
  const outer = { ...pal, base: pal.deep, deep: pal.deep }
  for (const [ring, n, a0, k, p] of [[0, 18, 0, 1, outer], [1, 18, Math.PI / 18, 0.88, pal]] as const) {
    const o = easeBack((open - ring * 0.1) / 0.7)
    const len = R * k * (0.42 + 0.58 * o)
    for (let j = 0; j < n; j++) {
      c.save()
      c.rotate(a0 + (j * Math.PI * 2) / n + (1 - o) * 0.4)
      petal(c, 'sunflower', p, len, 0.26, (1 - o) * 0.4, false)
      c.restore()
    }
  }
  const dr = R * 0.38 * (0.72 + 0.28 * easeOut(open))
  c.save()
  c.rotate(time * 0.12)
  c.drawImage(seedDisc(dr * 2), -dr, -dr, dr * 2, dr * 2)
  c.restore()
}

/** Where the cherry blossoms sit on their branch (x, y, size, order they open), in R units. */
const SAKURA = [
  { x: 0, y: 0, s: 0.62, k: 0 }, { x: -0.62, y: 0.36, s: 0.26, k: 1 }, { x: 0.66, y: -0.38, s: 0.3, k: 2 },
  { x: -1.12, y: 0.58, s: 0.22, k: 3 }, { x: 1.18, y: -0.74, s: 0.22, k: 4 }, { x: 0.3, y: 0.42, s: 0.18, k: 5 }, { x: -0.36, y: -0.4, s: 0.17, k: 6 },
]
function sakuraFlower(c: Ctx, s: number, o: number, pal: Pal, a0: number) {
  const len = s * (0.28 + 0.72 * o)
  for (let j = 0; j < 5; j++) {
    c.save()
    c.rotate(a0 + (j * Math.PI * 2) / 5 + (1 - o) * 0.8)
    petalShadow(c, 'sakura', len, 0.9, 0.12)
    petal(c, 'sakura', pal, len, 0.9, (1 - o) * 0.3)
    c.restore()
  }
  if (o > 0.3) {
    c.save()
    c.globalAlpha *= clamp01((o - 0.3) / 0.4)
    c.strokeStyle = '#d81b60'
    c.lineWidth = Math.max(0.6, s * 0.03)
    c.fillStyle = '#ffd54f'
    for (let j = 0; j < 9; j++) {
      const a = (j / 9) * Math.PI * 2 + a0
      const rr = s * 0.34 * o
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); c.stroke()
      c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(0.6, s * 0.04), 0, Math.PI * 2); c.fill()
    }
    c.fillStyle = '#c2185b'
    c.beginPath(); c.arc(0, 0, s * 0.08, 0, Math.PI * 2); c.fill()
    c.restore()
  }
}
function drawSakura(c: Ctx, R: number, open: number, pal: Pal, time: number) {
  // the branch grows in first
  const g = easeOut(open * 2.5 + 0.25)
  c.save()
  c.lineCap = 'round'
  c.strokeStyle = '#4e342e'
  c.lineWidth = Math.max(1.5, R * 0.07)
  const L = R * 4.4
  c.setLineDash([L * g, L])
  c.beginPath()
  c.moveTo(-1.7 * R, 0.95 * R)
  c.bezierCurveTo(-0.8 * R, 0.45 * R, -0.25 * R, 0.25 * R, 0, 0)
  c.bezierCurveTo(0.35 * R, -0.25 * R, 0.9 * R, -0.45 * R, 1.6 * R, -1.0 * R)
  c.stroke()
  c.lineWidth = Math.max(1, R * 0.035)
  c.beginPath(); c.moveTo(-0.62 * R, 0.36 * R); c.quadraticCurveTo(-0.5 * R, -0.1 * R, -0.36 * R, -0.4 * R); c.stroke()
  c.beginPath(); c.moveTo(0.2 * R, -0.12 * R); c.quadraticCurveTo(0.3 * R, 0.2 * R, 0.3 * R, 0.42 * R); c.stroke()
  c.restore()
  for (const f of [...SAKURA].reverse()) {
    const o = easeBack((open * 1.6 - 0.15 - f.k * 0.09) / 0.7)
    if (o <= 0.001) continue
    c.save()
    c.translate(f.x * R, f.y * R)
    c.rotate(Math.sin(time * 1.1 + f.k) * 0.04)
    sakuraFlower(c, f.s * R * (0.4 + 0.6 * clamp01(o * 2)), o, pal, f.k * 0.7)
    c.restore()
  }
}

function drawMarigold(c: Ctx, R: number, open: number, pal: Pal, time: number) {
  sepals(c, R * 0.85, 8, open, 0.2)
  const rings = 6
  for (let k = 0; k < rings; k++) {
    const o = easeBack((open * 1.2 - (rings - 1 - k) * 0.03 - k * 0.04) / 0.75)
    const r = R * (1 - k * 0.14)
    const len = r * (0.34 + 0.66 * o)
    const n = 15 - k
    const shade = (k % 2 ? 0.16 : 0.03) + (rings - k) * 0.012
    for (let j = 0; j < n; j++) {
      c.save()
      c.rotate(k * 0.41 + (j * Math.PI * 2) / n + (1 - o) * 0.6 + Math.sin(time + k) * 0.01)
      petalShadow(c, 'marigold', len, 0.42, 0.3)
      petal(c, 'marigold', pal, len, 0.42, shade + (j % 3 === 0 ? 0.1 : 0) + (1 - o) * 0.25, pal.deep)
      c.restore()
    }
  }
  c.fillStyle = pal.deep
  c.beginPath(); c.arc(0, 0, R * 0.06 * (0.5 + 0.5 * open), 0, Math.PI * 2); c.fill()
}

const DRAW: Record<FlowerKind, (c: Ctx, R: number, open: number, pal: Pal, time: number) => void> = {
  rose: drawRose, lotus: drawLotus, sunflower: drawSunflower, sakura: drawSakura, marigold: drawMarigold,
}

/** Draws one flower centred at cx, cy, R pixels from centre to petal tip, `open` 0 (bud) .. 1 (fully open). */
export function drawFlower(c: Ctx, kind: FlowerKind, color: string | null, open: number, cx: number, cy: number, R: number, time: number) {
  if (flowersGL()) {
    // the real 3D flower, drawn at the canvas's own pixel size so it stays sharp
    const sc = Math.max(0.25, Math.abs(c.getTransform?.().a ?? 1))
    const S = Math.max(8, Math.min(4096, Math.ceil(R * 2.9 * sc)))
    const cv = renderFlowers([{
      kind, color, open: clamp01(open), x: S / 2, y: S / 2, r: (R * sc * 1.2), pitch: 1.0 - 0.25 * (1 - clamp01(open)), yaw: 0.4 + time * 0.05,
      roll: Math.sin(time * 1.3) * 0.03 * (1 - open * 0.6), seed: 3,
    }], S, S)
    if (cv) { drawRendered(c, cv, cx - S / (2 * sc), cy - S / (2 * sc), S / sc, S / sc); return }
  }
  c.save()
  c.translate(cx, cy)
  c.rotate(Math.sin(time * 1.3) * 0.03 * (1 - open * 0.6))
  DRAW[kind](c, R, clamp01(open), palette(kind, color), time)
  c.restore()
}

// ---------- falling petals ----------
interface Fall { size: number; vt: number; sway: number; freq: number; spin: number; flip: number; count: number; wid: number }
const FALL: Record<FlowerKind, Fall> = {
  rose: { size: 0.06, vt: 0.17, sway: 0.05, freq: 1.1, spin: 0.9, flip: 2.2, count: 1, wid: 1.1 },
  lotus: { size: 0.075, vt: 0.13, sway: 0.04, freq: 0.7, spin: 0.45, flip: 1.3, count: 0.8, wid: 0.6 },
  sunflower: { size: 0.06, vt: 0.23, sway: 0.06, freq: 1.6, spin: 2.0, flip: 3.0, count: 1, wid: 0.28 },
  sakura: { size: 0.03, vt: 0.11, sway: 0.08, freq: 1.3, spin: 1.5, flip: 3.2, count: 1.7, wid: 0.9 },
  marigold: { size: 0.034, vt: 0.21, sway: 0.03, freq: 2.0, spin: 2.6, flip: 4.0, count: 1.3, wid: 0.5 },
}

function makeCanvas(w: number, h: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  return Object.assign(document.createElement('canvas'), { width: w, height: h })
}

const sprites = new Map<string, Canvas>()
/** A loose petal drawn once (front or back side, sharp or soft), S × S pixels, petal base at the bottom. */
function petalSprite(kind: FlowerKind, color: string | null, px: number, back: boolean, soft: boolean): Canvas {
  const S = Math.max(16, Math.min(256, 1 << Math.ceil(Math.log2(Math.max(1, px)))))
  const key = `${kind}|${color ?? ''}|${S}|${back ? 1 : 0}|${soft ? 1 : 0}`
  let sp = sprites.get(key)
  if (!sp) {
    sp = makeCanvas(S, S)
    const x = sp.getContext('2d') as Ctx
    const pal = palette(kind, color)
    const p = back ? { ...pal, base: pal.back, tip: pal.base, edge: pal.base } : pal
    if (soft && 'filter' in x) x.filter = `blur(${(S * 0.035).toFixed(1)}px)`
    x.translate(S / 2, S * 0.92)
    const w = Math.min(FALL[kind].wid, 1)
    petal(x, kind, p, S * 0.84, w, back ? 0.15 : 0, !soft)
    if (sprites.size > 160) sprites.clear()
    sprites.set(key, sp)
  }
  return sp
}

/**
 * One loose petal centred at 0,0 of the current transform, `size` pixels long; `flip` (-1..1) is how much it
 * faces the camera as it tumbles (the back side shows darker).
 */
export function drawLoosePetal(c: Ctx, kind: FlowerKind, color: string | null, size: number, flip: number, soft = false, phase?: number) {
  if (phase !== undefined && drawPetalSprite(c, kind, color, size * 1.25, phase, soft)) return
  const sp = petalSprite(kind, color, size, flip < 0, soft)
  c.save()
  c.scale(Math.max(0.12, Math.abs(flip)), 1)
  c.drawImage(sp, -size / 2, -size / 2, size, size)
  c.restore()
}

// ---------- the bloom timeline ----------
export interface BloomTimes { bud: number; emerge: number; grow: number; fall: number; full: number }
/** When each part happens, in seconds from the start of the layer. */
export function bloomTimes(b: Bloom): BloomTimes {
  if (photoOn(b)) { const g = photoTimes(b, picsOf(b)); return { bud: g.bud, emerge: g.emerge, grow: g.grow, fall: g.fall, full: g.full } }
  if (gardenOn(b)) { const g = gardenTimes(b); return { bud: g.bud, emerge: g.emerge, grow: g.grow, fall: g.fall, full: g.full } }
  const o = Math.max(0.6, Math.min(8, b.open))
  const emerge = 0.85 * o
  const grow = Math.max(0.35, 0.3 * o)
  const fall = b.fill ? emerge + grow : emerge + grow * 0.5
  return { bud: 0.2 * o, emerge, grow, fall, full: emerge + grow + Math.max(0.5, 0.45 * o) }
}
/** How long a new bloom layer lasts with a photo: the bloom, the petals and a little rest. */
export const bloomLength = (b: Bloom) => Math.max(5, bloomTimes(b).fall + Math.max(1, b.seconds) + 1.5)

const flowerOpen = (b: Bloom, local: number) => {
  const tm = bloomTimes(b)
  return clamp01((local - tm.bud) / Math.max(0.2, 0.8 * Math.max(0.6, b.open)))
}
/** Flower radius in pixels for a picture W × H. */
export const flowerRadius = (b: Bloom, W: number, H: number) => (Math.max(0.15, Math.min(1.2, b.size)) * Math.min(W, H)) / 2

/**
 * How much of the photo / video shows: a circle `r` pixels round the flower centre (Infinity = all of it), and
 * how strongly its glowing edge shows.
 */
export function bloomOpening(b: Bloom, local: number, cx: number, cy: number, W: number, H: number): { r: number; edge: number } {
  const tm = bloomTimes(b)
  const R = flowerRadius(b, W, H)
  const t = local - tm.emerge
  if (t <= 0) return { r: 0, edge: 0 }
  const inner = R * (b.flower === 'lotus' ? 0.42 : b.flower === 'sakura' ? 0.4 : 0.5)
  const rA = inner * easeBack(t / tm.grow)
  if (!b.fill) return { r: rA, edge: 1 }
  const cover = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.12
  const g = (t - tm.grow) / (tm.full - tm.emerge - tm.grow)
  if (g >= 1) return { r: Infinity, edge: 0 }
  if (g <= 0) return { r: rA, edge: 1 }
  return { r: inner + (cover - inner) * easeInOut(g), edge: Math.max(0, 1 - g * 1.4) }
}

/** The mask that cuts the photo / video to its opening, for a picture mw × mh drawn centred on the flower. */
export function bloomMask(r: number, mw: number, mh: number): ShapeMask {
  return { shape: 'ellipse', x: 0.5, y: 0.5, w: (2 * r) / mw, h: (2 * r) / mh, rotation: 0, feather: 0.045, round: 0, invert: false }
}

/** The flower (and, when the photo stays inside it, the far petals behind the photo). */
export function drawBloomBack(c: Ctx, b: Bloom, local: number, dur: number, cx: number, cy: number, W: number, H: number, alpha: number) {
  if (alpha <= 0.001 || local < 0) return
  if (photoOn(b)) {
    const pics = picsOf(b)
    if (pics) { drawPhotoBack(c, b, pics, local, W, H, alpha); if (!b.fill) drawPetals(c, b, local, dur, cx, cy, W, H, alpha, 0) }
    return
  }
  if (gardenOn(b)) { drawGardenBack(c, b, local, dur, W, H, alpha); if (!b.fill) drawPetals(c, b, local, dur, cx, cy, W, H, alpha, 0); return }
  const tm = bloomTimes(b)
  const R = flowerRadius(b, W, H)
  const fade = b.fill ? 1 - clamp01((local - tm.fall) / 0.3) : 1
  const grow = easeBack(local / Math.max(0.1, tm.bud))
  if (fade > 0.001) {
    c.save()
    c.globalAlpha = alpha * fade
    // soft light behind the flower
    const gl = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5)
    gl.addColorStop(0, 'rgba(255,245,220,0.35)')
    gl.addColorStop(1, 'rgba(255,245,220,0)')
    c.fillStyle = gl
    c.fillRect(cx - R * 1.5, cy - R * 1.5, R * 3, R * 3)
    drawFlower(c, b.flower, b.color, flowerOpen(b, local), cx, cy, R * Math.max(0.01, grow), local)
    c.restore()
  }
  if (!b.fill) drawPetals(c, b, local, dur, cx, cy, W, H, alpha, 0)
}

/** The light burst as the photo comes out, the flower's own petals flying off, and the petals falling in front. */
export function drawBloomFront(c: Ctx, b: Bloom, local: number, dur: number, cx: number, cy: number, W: number, H: number, alpha: number) {
  if (alpha <= 0.001 || local < 0) return
  if (photoOn(b)) {
    const pics = picsOf(b)
    if (!pics) return
    const h = photoHeart(b, pics, Math.min(local, bloomTimes(b).fall), W, H)
    if (b.fill) drawBurst(c, b, local, dur, h.x, h.y, h.r * 0.85, W, H, alpha)
    drawPetals(c, b, local, dur, h.x, h.y, W, H, alpha, b.fill ? -1 : 1)
    return
  }
  if (gardenOn(b)) {
    // the flower's own petals break away from where the flower is now, then the petals fall over the picture
    const h = gardenHeart(b, Math.min(local, bloomTimes(b).fall), W, H)
    if (b.fill) drawBurst(c, b, local, dur, h.x, h.y, h.r * 0.85, W, H, alpha)
    drawPetals(c, b, local, dur, h.x, h.y, W, H, alpha, b.fill ? -1 : 1)
    return
  }
  const tm = bloomTimes(b)
  const R = flowerRadius(b, W, H)
  const bt = local - tm.emerge + 0.1
  if (bt > 0 && bt < 0.9) {
    const k = Math.sin((bt / 0.9) * Math.PI)
    c.save()
    c.globalCompositeOperation = 'lighter'
    c.globalAlpha = alpha * 0.55 * k
    const rr = R * (0.5 + bt * 1.4)
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, rr)
    g.addColorStop(0, 'rgba(255,250,230,1)')
    g.addColorStop(0.35, 'rgba(255,220,160,0.5)')
    g.addColorStop(1, 'rgba(255,200,120,0)')
    c.fillStyle = g
    c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
    c.restore()
  }
  if (b.fill) drawBurst(c, b, local, dur, cx, cy, R, W, H, alpha)
  drawPetals(c, b, local, dur, cx, cy, W, H, alpha, b.fill ? -1 : 1)
}

/** A loose petal: a real one cut from the user's photo when the bloom has photos, else a drawn one. */
function looseOrPhoto(c: Ctx, b: Bloom, pics: Pics | null, i: number, size: number, phase: number, soft: boolean) {
  if (pics) drawPhotoPetal(c, pics, i, size, phase, soft)
  else drawLoosePetal(c, b.flower, b.color, size, Math.cos(phase), soft, phase)
}

/** Fades the petals out over the last moment of the layer. */
const endFade = (local: number, dur: number) => (Number.isFinite(dur) ? clamp01((dur - local) / 0.6) : 1)

/** The opened flower's own petals breaking away from it (fill style), flying out and falling. */
function drawBurst(c: Ctx, b: Bloom, local: number, dur: number, cx: number, cy: number, R: number, W: number, H: number, alpha: number) {
  const tm = bloomTimes(b)
  const t = local - tm.fall
  if (t <= 0) return
  const f = FALL[b.flower]
  const n = b.flower === 'sakura' ? 16 : b.flower === 'marigold' ? 22 : 14
  const k = 1.6 // air drag
  const a0 = alpha * endFade(local, dur)
  const pics = picsOf(b)
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rnd(i, 21) * 0.4
    const sp = H * (0.45 + 0.6 * rnd(i, 22))
    const e = (1 - Math.exp(-k * t)) / k
    const vt = H * f.vt * (0.9 + 0.5 * rnd(i, 23))
    const x = cx + Math.cos(ang) * R * 0.55 + Math.cos(ang) * sp * e + Math.sin(t * f.freq * 2 + i) * W * f.sway * 0.5 + b.wind * W * 0.06 * t
    const y = cy + Math.sin(ang) * R * 0.55 + (Math.sin(ang) * sp - H * 0.15) * e + vt * (t - e)
    const size = R * (b.flower === 'sakura' ? 0.28 : b.flower === 'marigold' ? 0.3 : 0.55) * (0.8 + 0.3 * rnd(i, 24))
    if (y - size > H || x < -size * 2 || x > W + size * 2) continue
    c.save()
    c.globalAlpha = a0 * clamp01(t * 6)
    c.translate(x, y)
    c.rotate(ang + Math.PI / 2 + t * f.spin * (rnd(i, 25) - 0.5) * 2)
    looseOrPhoto(c, b, pics, i, size, t * f.flip + i, false)
    c.restore()
  }
}

/**
 * Petals falling over the whole picture: three depths (far small and slow, near big, fast and soft).
 * `which` 0 = only far ones, 1 = mid and near, -1 = all.
 */
function drawPetals(c: Ctx, b: Bloom, local: number, dur: number, cx: number, cy: number, W: number, H: number, alpha: number, which: -1 | 0 | 1) {
  void cx; void cy
  const tm = bloomTimes(b)
  const t0 = local - tm.fall
  if (t0 <= 0 || b.petals <= 0) return
  const f = FALL[b.flower]
  const n = Math.max(0, Math.min(220, Math.round(b.petals * f.count)))
  const secs = Math.max(0.5, b.seconds)
  const a0 = alpha * endFade(local, dur)
  if (a0 <= 0.001) return
  const pics = picsOf(b)
  for (let i = 0; i < n; i++) {
    const depth = i % 3 // 0 far, 1 mid, 2 near
    if (which === 0 && depth !== 0) continue
    if (which === 1 && depth === 0) continue
    const r1 = rnd(i, 1), r2 = rnd(i, 2), r3 = rnd(i, 3), r4 = rnd(i, 4)
    // a third are already spread over the picture when the petals start, the rest come in from the top
    const already = r4 < 0.33
    const spawn = already ? 0 : r1 * secs
    const t = t0 - spawn
    if (t <= 0) continue
    const dk = depth === 0 ? 0.55 : depth === 1 ? 1 : 1.7
    const vk = depth === 0 ? 0.7 : depth === 1 ? 1 : 1.35
    const size = H * f.size * dk * (0.75 + 0.5 * r2)
    const vt = H * f.vt * vk * (0.8 + 0.4 * r3)
    const k = 1.2
    const e = (1 - Math.exp(-k * t)) / k
    const y0 = already ? (r1 * 0.95 - 0.05) * H : -size - r3 * H * 0.15
    const y = y0 + vt * (t - e) + (already ? vt * 0.4 * e : 0)
    if (y - size > H) continue
    const x0 = (r2 * 1.2 - 0.1) * W - b.wind * W * 0.3
    const x = x0 + Math.sin(t * f.freq * (0.8 + 0.4 * r4) + r1 * 6.28) * W * f.sway + b.wind * W * 0.12 * t * vk
    if (x < -size * 2 || x > W + size * 2) continue
    c.save()
    c.globalAlpha = a0 * (depth === 0 ? 0.75 : 1) * clamp01(t * (already ? 3 : 8))
    c.translate(x, y)
    c.rotate((r3 - 0.5) * 6.28 + t * f.spin * (r4 - 0.5) * 2 + Math.sin(t * f.freq + r2 * 6) * 0.5)
    const ph = t * f.flip * (0.7 + 0.6 * r1) + r2 * 6.28
    looseOrPhoto(c, b, pics, i, size, ph, depth === 2)
    c.restore()
  }
}
