import type { CurvePoints, Grade, Lut, Project } from '../types'

/**
 * Pro grading helpers: tone curves become a 256-entry lookup (R, G, B with the master curve applied first),
 * HSL bands become 8 x 3 numbers, and a .cube LUT becomes a texture atlas. The GPU side is in gl.ts.
 */

export const HSL_BANDS = [
  { name: 'Red', color: '#ff3b3b', hue: 0 },
  { name: 'Orange', color: '#ff8c1a', hue: 30 },
  { name: 'Yellow', color: '#ffd60a', hue: 60 },
  { name: 'Green', color: '#1ed760', hue: 120 },
  { name: 'Aqua', color: '#16d9ff', hue: 180 },
  { name: 'Blue', color: '#3d6bff', hue: 230 },
  { name: 'Purple', color: '#8f3dff', hue: 275 },
  { name: 'Magenta', color: '#ff3df2', hue: 315 },
]

export const LINE: CurvePoints = [[0, 0], [1, 1]]

export const CURVE_PRESETS: { name: string; all: CurvePoints }[] = [
  { name: 'Straight', all: LINE },
  { name: 'Contrast', all: [[0, 0], [0.25, 0.18], [0.75, 0.84], [1, 1]] },
  { name: 'Strong contrast', all: [[0, 0], [0.25, 0.12], [0.75, 0.9], [1, 1]] },
  { name: 'Soft', all: [[0, 0.06], [0.5, 0.5], [1, 0.95]] },
  { name: 'Faded film', all: [[0, 0.14], [0.3, 0.32], [0.75, 0.8], [1, 0.94]] },
  { name: 'Brighter', all: [[0, 0], [0.45, 0.58], [1, 1]] },
  { name: 'Darker', all: [[0, 0], [0.55, 0.42], [1, 1]] },
]

const isLine = (p?: CurvePoints) => !p || (p.length === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1)

export function gradeIsEmpty(g: Grade | null | undefined) {
  if (!g) return true
  const c = g.curves
  const curvesOff = !c || (isLine(c.all) && isLine(c.r) && isLine(c.g) && isLine(c.b))
  const hslOff = !g.hsl || g.hsl.every((b) => b.every((v) => v === 0))
  return curvesOff && hslOff && !g.lut
}

/** A smooth curve through the points (monotone cubic, so it never overshoots), sampled at n steps. */
export function sampleCurve(pts: CurvePoints | undefined, n = 256): Float32Array {
  const out = new Float32Array(n)
  const p = [...(pts && pts.length >= 2 ? pts : LINE)].sort((a, b) => a[0] - b[0])
  const k = p.length
  const d: number[] = [] // slopes between points
  for (let i = 0; i < k - 1; i++) d.push((p[i + 1][1] - p[i][1]) / Math.max(1e-6, p[i + 1][0] - p[i][0]))
  const m: number[] = [d[0]]
  for (let i = 1; i < k - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  m.push(d[k - 2])
  for (let i = 0; i < k - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b
    if (s > 9) { const tt = 3 / Math.sqrt(s); m[i] = tt * a * d[i]; m[i + 1] = tt * b * d[i] }
  }
  for (let j = 0; j < n; j++) {
    const x = j / (n - 1)
    let y: number
    if (x <= p[0][0]) y = p[0][1]
    else if (x >= p[k - 1][0]) y = p[k - 1][1]
    else {
      let i = 0
      while (i < k - 2 && x > p[i + 1][0]) i++
      const h = p[i + 1][0] - p[i][0], t = (x - p[i][0]) / h
      const t2 = t * t, t3 = t2 * t
      y = (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1]
    }
    out[j] = Math.min(1, Math.max(0, y))
  }
  return out
}

/** What the GPU needs for one grade: lookup tables and numbers, each with a key for texture caching. */
export interface GradeGpu {
  curve: { key: string; data: Uint8Array } | null // 256 x 1 RGBA
  hsl: Float32Array | null // 8 x 3
  lut: { key: string; size: number; data: Uint8Array; amount: number } | null // (size*size) x size RGBA atlas
}

const curveCache = new Map<string, GradeGpu['curve']>()
const lutCache = new Map<string, { size: number; data: Uint8Array }>()

function curveGpu(c: Grade['curves']): GradeGpu['curve'] {
  if (!c || (isLine(c.all) && isLine(c.r) && isLine(c.g) && isLine(c.b))) return null
  const key = JSON.stringify(c)
  let hit = curveCache.get(key)
  if (!hit) {
    const all = sampleCurve(c.all), ch = [sampleCurve(c.r), sampleCurve(c.g), sampleCurve(c.b)]
    const data = new Uint8Array(256 * 4)
    for (let i = 0; i < 256; i++) {
      const v = Math.round(all[i] * 255)
      for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(ch[k][v] * 255)
      data[i * 4 + 3] = 255
    }
    hit = { key, data }
    if (curveCache.size > 64) curveCache.clear()
    curveCache.set(key, hit)
  }
  return hit
}

/** A LUT's RGB bytes laid out as an atlas: blue slices side by side (x = b * size + r, y = g). */
function lutAtlas(l: Lut) {
  let hit = lutCache.get(l.id)
  if (!hit) {
    const raw = Uint8Array.from(atob(l.data), (ch) => ch.charCodeAt(0))
    const n = l.size
    const data = new Uint8Array(n * n * n * 4)
    for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      const src = ((b * n + g) * n + r) * 3
      const dst = (g * n * n + b * n + r) * 4
      data[dst] = raw[src]; data[dst + 1] = raw[src + 1]; data[dst + 2] = raw[src + 2]; data[dst + 3] = 255
    }
    hit = { size: n, data }
    lutCache.set(l.id, hit)
  }
  return hit
}

export function gradeGpu(g: Grade | null | undefined, project: Pick<Project, 'luts'>): GradeGpu | null {
  if (!g || gradeIsEmpty(g)) return null
  const hsl = g.hsl && g.hsl.some((b) => b.some((v) => v !== 0)) ? Float32Array.from(g.hsl.flat()) : null
  const l = g.lut ? project.luts?.find((x) => x.id === g.lut!.id) : undefined
  const lut = l && g.lut ? { key: l.id, ...lutAtlas(l), amount: g.lut.amount } : null
  const out = { curve: curveGpu(g.curves), hsl, lut }
  return out.curve || out.hsl || out.lut ? out : null
}

/** Reads a .cube file (3D LUT). Domain other than 0..1 is scaled; 1D LUTs are refused. */
export function parseCube(text: string, name: string, id: string): Lut {
  let size = 0
  let min = [0, 0, 0], max = [1, 1, 1]
  const vals: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    const key = parts[0].toUpperCase()
    if (key === 'LUT_3D_SIZE') size = parseInt(parts[1], 10)
    else if (key === 'LUT_1D_SIZE') throw new Error('This is a 1D LUT. Please pick a 3D .cube file.')
    else if (key === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number)
    else if (key === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number)
    else if (/^[-\d.]/.test(parts[0]) && parts.length >= 3) vals.push(+parts[0], +parts[1], +parts[2])
  }
  if (!size || size < 2 || size > 65) throw new Error('This .cube file has no LUT_3D_SIZE (2 to 65).')
  if (vals.length < size * size * size * 3) throw new Error('This .cube file is incomplete.')
  const bytes = new Uint8Array(size * size * size * 3)
  for (let i = 0; i < bytes.length; i++) {
    const k = i % 3
    bytes[i] = Math.round(Math.min(1, Math.max(0, (vals[i] - min[k]) / ((max[k] - min[k]) || 1))) * 255)
  }
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return { id, name: name.replace(/\.cube$/i, ''), size, data: btoa(bin) }
}
