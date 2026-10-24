import type { Backdrop, ChromaKey, MediaSource } from '../types'
import type { Chroma } from './gl'

/** Green screen settings for a new key: off until turned on, then tuned by detectKey(). */
export const defaultChroma = (): ChromaKey => ({ enabled: false, color: '#00ff00', similarity: 0.35, smoothness: 0.08, spill: 0.5, shrink: 0 })

type RGB = [number, number, number]

const chroma = (c: RGB): [number, number] => [
  -0.169 * c[0] - 0.331 * c[1] + 0.5 * c[2],
  0.5 * c[0] - 0.419 * c[1] - 0.081 * c[2],
]

/** How far a colour is from the key, the way the shader's keyMask() measures it (0..~0.9; under `similarity` = removed). */
export function keyDistance(c: RGB, key: RGB) {
  const [kb, kr] = chroma(key)
  const [cb, cr] = chroma(c)
  const kl = Math.max(Math.hypot(kb, kr), 1e-4)
  const s = Math.min(1, Math.max(0.7, Math.hypot(cb, cr) / kl))
  return Math.hypot(cb - kb * s, cr - kr * s)
}

export const hexRgb = (h: string): RGB => {
  const n = parseInt(h.replace('#', '').slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
/** Settings as the shader takes them. */
export const toChroma = (k: ChromaKey): Chroma => ({ color: hexRgb(k.color), similarity: k.similarity, smoothness: k.smoothness, spill: k.spill ?? 0.5, shrink: k.shrink ?? 0 })

const hex = (c: RGB) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')

function hsv([r, g, b]: RGB) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx }
}

interface Px { c: RGB; w: number }

/** The pixels of some frames (each scaled down), border pixels weighted more: the screen is almost always around the edges. */
function pixels(frames: ImageData[]): Px[] {
  const out: Px[] = []
  for (const f of frames) {
    const { width: W, height: H, data } = f
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const edge = x < W * 0.12 || x >= W * 0.88 || y < H * 0.12
      out.push({ c: [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255], w: edge ? 3 : 1 })
    }
  }
  return out
}

const pct = (v: number[], p: number) => {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]
}

const rgbAt = (f: ImageData, i: number): RGB => [f.data[i * 4] / 255, f.data[i * 4 + 1] / 255, f.data[i * 4 + 2] / 255]

/** True for pixels that are clearly the screen: its hue (within ~25°) and at least a third of its colourfulness, so shadows count. */
function isScreen(c: RGB, key: RGB) {
  const [kb, kr] = chroma(key)
  const [cb, cr] = chroma(c)
  const kl = Math.hypot(kb, kr), cl = Math.hypot(cb, cr)
  return cl > kl * 0.35 && (cb * kb + cr * kr) / (cl * kl || 1) > 0.9
}

export interface Detected { key: ChromaKey; kind: 'green' | 'blue' | 'other'; cover: number }

/**
 * Settings that remove `color` from these frames without biting into the person: strength just past the
 * screen's own spread (shadows and creases included) but short of the person's nearest colour. Pixels touching
 * the screen are left out of the person, since they are blends of both.
 */
export function tuneKey(frames: ImageData[], color: string, base: ChromaKey = defaultChroma()): ChromaKey {
  const key = hexRgb(color)
  const screen: number[] = []
  const fg: number[] = []
  for (const f of frames) {
    const { width: W, height: H } = f
    const mask = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) mask[i] = isScreen(rgbAt(f, i), key) ? 1 : 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x
      const d = keyDistance(rgbAt(f, i), key)
      if (mask[i]) { screen.push(d); continue }
      let near = false
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && mask[ny * W + nx]) { near = true; break }
      }
      if (!near) fg.push(d)
    }
  }
  const smoothness = 0.08
  const spread = pct(screen, 0.98)
  const nearFg = fg.length > 20 ? pct(fg, 0.01) : 1
  // past the screen's spread, but the soft edge must end before the person's nearest colour
  const similarity = Math.max(0.06, Math.min(0.5, spread + 0.03, nearFg - smoothness - 0.02))
  return { ...base, enabled: true, color, similarity, smoothness, spill: base.spill ?? 0.5, shrink: base.shrink ?? 0 }
}

/**
 * Finds the screen colour: the biggest strongly coloured green or blue area (edges count more). Returns null
 * when no screen covers at least 8% of the picture.
 */
export function detectKey(frames: ImageData[], base?: ChromaKey): Detected | null {
  const px = pixels(frames)
  const total = px.reduce((s, p) => s + p.w, 0)
  if (!total) return null
  const bins = new Array(36).fill(0)
  const info = px.map((p) => ({ ...p, ...hsv(p.c) }))
  for (const p of info) if (p.s > 0.25 && p.v > 0.15) bins[Math.floor(p.h / 10) % 36] += p.w * p.s
  // the strongest hue among green (70°-170°) and blue (180°-260°) screens, with its neighbours
  let best = -1, bestW = 0
  for (let i = 7; i <= 25; i++) {
    const w = bins[i - 1] + bins[i] + bins[i + 1]
    if (w > bestW) { bestW = w; best = i }
  }
  if (best < 0) return null
  const hue = best * 10 + 5
  const near = info.filter((p) => p.s > 0.25 && p.v > 0.15 && Math.min(Math.abs(p.h - hue), 360 - Math.abs(p.h - hue)) < 22)
  const cover = near.reduce((s, p) => s + p.w, 0) / total
  if (cover < 0.08) return null
  // the screen's typical colour: the more saturated half (lit, not the shadowed folds), averaged
  const sMed = pct(near.map((p) => p.s), 0.5)
  const lit = near.filter((p) => p.s >= sMed)
  const avg: RGB = [0, 0, 0]
  for (const p of lit) for (let k = 0; k < 3; k++) avg[k] += p.c[k] / lit.length
  const color = hex(avg)
  const kind = hue >= 70 && hue < 175 ? 'green' : hue >= 175 && hue <= 265 ? 'blue' : 'other'
  return { key: tuneKey(frames, color, base), kind, cover }
}

/** The average colour around (x, y) (0..1) of a frame, for the colour picker. */
export function colorAt(f: ImageData, x: number, y: number) {
  const cx = Math.round(x * (f.width - 1)), cy = Math.round(y * (f.height - 1))
  const acc: RGB = [0, 0, 0]
  let n = 0
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const px = cx + dx, py = cy + dy
    if (px < 0 || py < 0 || px >= f.width || py >= f.height) continue
    const i = (py * f.width + px) * 4
    acc[0] += f.data[i]; acc[1] += f.data[i + 1]; acc[2] += f.data[i + 2]; n++
  }
  return hex(acc.map((v) => v / n / 255) as RGB)
}

/** One frame of a photo or video at `time` seconds, at most `max` pixels wide. */
export async function grabFrame(src: MediaSource, time: number, max = 480): Promise<HTMLCanvasElement | null> {
  let img: HTMLVideoElement | HTMLImageElement
  let w: number, h: number
  if (src.kind === 'image') {
    const i = new Image()
    i.src = src.url
    await i.decode().catch(() => {})
    if (!i.naturalWidth) return null
    img = i; w = i.naturalWidth; h = i.naturalHeight
  } else if (src.kind === 'video') {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.src = src.url
    const ok = await new Promise<boolean>((r) => {
      const to = setTimeout(() => r(false), 8000)
      v.addEventListener('loadeddata', () => { clearTimeout(to); r(true) }, { once: true })
      v.addEventListener('error', () => { clearTimeout(to); r(false) }, { once: true })
    })
    if (!ok || !v.videoWidth) return null
    await new Promise<void>((r) => {
      const to = setTimeout(r, 4000)
      v.addEventListener('seeked', () => { clearTimeout(to); r() }, { once: true })
      v.currentTime = Math.max(0, Math.min(time, (src.duration || v.duration || 0) - 0.05))
    })
    img = v; w = v.videoWidth; h = v.videoHeight
  } else return null
  const s = Math.min(1, max / w)
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.round(w * s)); c.height = Math.max(2, Math.round(h * s))
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  if (img instanceof HTMLVideoElement) { img.removeAttribute('src'); img.load() }
  return c
}

/** Small copy of a frame's pixels, for detection (fast enough on phones). */
export function smallPixels(c: HTMLCanvasElement, max = 96): ImageData {
  const s = Math.min(1, max / c.width)
  const w = Math.max(2, Math.round(c.width * s)), h = Math.max(2, Math.round(c.height * s))
  const t = document.createElement('canvas')
  t.width = w; t.height = h
  const x = t.getContext('2d', { willReadFrequently: true })!
  x.drawImage(c, 0, 0, w, h)
  return x.getImageData(0, 0, w, h)
}

/** Source second of a backdrop video `local` seconds into its clip or layer: from its start point, looping. */
export function backdropTime(b: Backdrop, src: MediaSource, local: number) {
  if (src.kind !== 'video' || !(src.duration > 0.2)) return 0
  const t = (b.in ?? 0) + Math.max(0, local)
  return t % src.duration
}

/** The backdrop photo/video that shows behind a green screen item, if any. */
export const backdropSource = (o: { chroma?: ChromaKey | null; backdrop?: Backdrop | null }, sources: Record<string, MediaSource>) =>
  o.chroma?.enabled && o.backdrop?.kind === 'media' && o.backdrop.sourceId ? sources[o.backdrop.sourceId] : undefined
