import { drawShower } from './shower'
import type { CaptionFrame, CaptionFramePreset, LoopAnim, StickerLayer, TextAnim, TextFill, TextLayer, TextStyle } from '../types'

export const FONTS = [
  'Poppins', 'Montserrat', 'Noto Sans Devanagari', 'Hind', 'Bebas Neue', 'Anton', 'Oswald', 'Teko', 'Bangers',
  'Righteous', 'Playfair Display', 'Pacifico', 'Lobster', 'Dancing Script', 'Caveat', 'Permanent Marker', 'Kalam', 'Yatra One',
]

const RANGES: Record<string, string> = {
  latin: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  devanagari: 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF',
}

type FontManifest = { family: string; files: { subset: string; file: string }[] }[]
let manifest: Promise<FontManifest> | null = null
const loaded = new Set<string>()
const loading = new Map<string, Promise<void>>()

const fontBase = () => new URL(`${import.meta.env.BASE_URL}fonts/`, location.href).href

export function fontLoaded(family: string) { return loaded.has(family) }

/** Loads a bundled font (both Latin and Devanagari subsets) on first use. */
export function ensureFont(family: string): Promise<void> {
  if (loaded.has(family)) return Promise.resolve()
  let p = loading.get(family)
  if (!p) {
    p = (async () => {
      manifest ??= fetch(fontBase() + 'fonts.json').then((r) => r.json())
      const entry = (await manifest).find((f) => f.family === family)
      if (entry) {
        await Promise.all(entry.files.map(async (f) => {
          const face = new FontFace(family, `url(${fontBase()}${f.file})`, { unicodeRange: RANGES[f.subset] })
          await face.load()
          document.fonts.add(face)
        }))
      }
      loaded.add(family)
    })().catch(() => { loaded.add(family) })
    loading.set(family, p)
  }
  return p
}

export async function prefetchFonts() {
  await Promise.all(FONTS.map(ensureFont))
}

export const defaultTextStyle = (): TextStyle => ({
  font: 'Poppins', size: 0.06, color: '#ffffff', align: 'center', stroke: null, strokeWidth: 0.5,
  shadow: true, background: null, bold: true, italic: false, letterSpacing: 0,
})

export const subtitleStyle = (): TextStyle => ({
  ...defaultTextStyle(), size: 0.045, background: 'rgba(0,0,0,0.55)', shadow: false,
})

export const TEXT_PRESETS: { name: string; style: Partial<TextStyle> }[] = [
  { name: 'Classic', style: {} },
  { name: 'Outline', style: { stroke: '#000000', strokeWidth: 0.6, shadow: false } },
  { name: 'Box', style: { background: '#000000cc', shadow: false } },
  { name: 'Yellow', style: { color: '#ffe600', stroke: '#000000', strokeWidth: 0.6, shadow: false, font: 'Anton' } },
  { name: 'Neon', style: { color: '#7df9ff', shadow: true, font: 'Righteous' } },
  { name: 'Label', style: { color: '#111111', background: '#ffffff', shadow: false, font: 'Montserrat' } },
  { name: 'Pink Pop', style: { color: '#ffffff', background: '#ff3d7f', shadow: false, font: 'Bangers' } },
  { name: 'Handwritten', style: { font: 'Caveat', size: 0.08 } },
  { name: 'Elegant', style: { font: 'Playfair Display', italic: true } },
  { name: 'Script', style: { font: 'Pacifico' } },
  { name: 'Headline', style: { font: 'Bebas Neue', size: 0.1, letterSpacing: 0.05 } },
  { name: 'Hindi', style: { font: 'Yatra One', color: '#ffd166', stroke: '#3d1f00', strokeWidth: 0.5 } },
]

export const ANIMS: TextAnim[] = ['none', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop', 'zoom', 'bounce', 'blur', 'spin', 'drop', 'wipe', 'typewriter', 'letters']
/** Animations that only make sense for text (they work letter by letter). */
export const TEXT_ONLY_ANIMS: TextAnim[] = ['typewriter', 'letters']

export const LOOPS: { value: LoopAnim; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'pulse', label: 'Pulse' }, { value: 'heartbeat', label: 'Heartbeat' },
  { value: 'float', label: 'Float' }, { value: 'swing', label: 'Swing' }, { value: 'shimmer', label: 'Shimmer' },
]

/** Gradient paints for letters (top to bottom; rainbow goes left to right). */
export const FILLS: { value: TextFill; label: string; stops: string[] }[] = [
  { value: 'gold', label: 'Gold', stops: ['#fff6c4', '#f7d24a', '#c8901a', '#ffe28a', '#a8700c'] },
  { value: 'rose-gold', label: 'Rose gold', stops: ['#ffe4dc', '#f4b3a2', '#c97b6b', '#f6c7b8'] },
  { value: 'silver', label: 'Silver', stops: ['#ffffff', '#d9dde3', '#8d949e', '#eef1f4', '#7a818b'] },
  { value: 'royal', label: 'Royal', stops: ['#ffe9a8', '#e0a526', '#8a1538'] },
  { value: 'sunset', label: 'Sunset', stops: ['#ffd27a', '#ff8a5c', '#e8467c'] },
  { value: 'love', label: 'Love', stops: ['#ffd1e1', '#ff5c93', '#c2185b'] },
  { value: 'rainbow', label: 'Rainbow', stops: ['#ff3b3b', '#ffb000', '#ffe600', '#3ddc84', '#3d9bff', '#a259ff'] },
]

/** Ready-made wedding and event titles: words, look and movement in one tap. */
export const TITLE_PRESETS: { name: string; text: string; style: Partial<TextStyle>; animIn: TextAnim; animOut: TextAnim; loop: LoopAnim }[] = [
  { name: 'Couple names', text: 'Rahul ❤ Priya', style: { font: 'Dancing Script', size: 0.11, fill: 'gold', glow: '#ffd36b', color: '#f7d24a', shadow: false, stroke: null, background: null }, animIn: 'letters', animOut: 'fade', loop: 'shimmer' },
  { name: 'Shubh Vivah', text: 'शुभ विवाह', style: { font: 'Yatra One', size: 0.12, fill: 'royal', glow: '#ffcc66', color: '#e0a526', shadow: false, stroke: '#4a0d1e', strokeWidth: 0.4, background: null }, animIn: 'zoom', animOut: 'fade', loop: 'shimmer' },
  { name: 'Save the Date', text: 'Save the Date\n12 . 12 . 2026', style: { font: 'Playfair Display', italic: true, size: 0.08, fill: 'rose-gold', glow: null, color: '#f4b3a2', shadow: true, stroke: null, background: null }, animIn: 'blur', animOut: 'fade', loop: 'none' },
  { name: 'Just Married', text: 'Just Married', style: { font: 'Pacifico', size: 0.1, fill: null, glow: '#ff7aa8', color: '#ffffff', shadow: false, stroke: null, background: null }, animIn: 'drop', animOut: 'fade', loop: 'heartbeat' },
  { name: 'Forever', text: 'Forever Begins', style: { font: 'Dancing Script', size: 0.1, fill: 'silver', glow: '#ffffff', color: '#ffffff', shadow: false, stroke: null, background: null }, animIn: 'wipe', animOut: 'fade', loop: 'float' },
  { name: 'Haldi', text: 'Haldi Ceremony', style: { font: 'Lobster', size: 0.09, fill: 'sunset', glow: '#ffd27a', color: '#ffb000', shadow: false, stroke: '#5a2a00', strokeWidth: 0.3, background: null }, animIn: 'bounce', animOut: 'fade', loop: 'swing' },
  { name: 'Mehendi', text: 'Mehendi Night', style: { font: 'Dancing Script', size: 0.1, fill: null, glow: '#7dff9a', color: '#d8ffcf', shadow: false, stroke: '#0b3d1b', strokeWidth: 0.3, background: null }, animIn: 'letters', animOut: 'fade', loop: 'pulse' },
  { name: 'Sangeet', text: 'Sangeet Night', style: { font: 'Righteous', size: 0.09, fill: 'love', glow: '#ff5cb3', color: '#ff5c93', shadow: false, stroke: null, background: null }, animIn: 'spin', animOut: 'fade', loop: 'pulse' },
  { name: 'Baraat', text: 'Baraat Aa Gayi!', style: { font: 'Bangers', size: 0.11, fill: 'gold', glow: null, color: '#f7d24a', shadow: true, stroke: '#3d1f00', strokeWidth: 0.6, background: null }, animIn: 'pop', animOut: 'zoom', loop: 'heartbeat' },
  { name: 'Reception', text: 'Wedding Reception', style: { font: 'Playfair Display', italic: false, size: 0.08, fill: 'gold', glow: null, color: '#f7d24a', shadow: true, stroke: null, background: null, letterSpacing: 0.08 }, animIn: 'wipe', animOut: 'fade', loop: 'shimmer' },
  { name: 'Happy Anniversary', text: 'Happy Anniversary', style: { font: 'Pacifico', size: 0.09, fill: 'love', glow: '#ffb3cf', color: '#ff5c93', shadow: false, stroke: null, background: null }, animIn: 'letters', animOut: 'fade', loop: 'float' },
  { name: 'Happy Birthday', text: 'Happy Birthday', style: { font: 'Bangers', size: 0.11, fill: 'rainbow', glow: null, color: '#ffe600', shadow: true, stroke: '#111111', strokeWidth: 0.5, background: null }, animIn: 'drop', animOut: 'fade', loop: 'swing' },
]

const ANIM_TIME = 0.45

const easeOutBack = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
function bounce(x: number) {
  const n = 7.5625, d = 2.75
  if (x < 1 / d) return n * x * x
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375
  return n * (x -= 2.625 / d) * x + 0.984375
}

export interface AnimState {
  alpha: number; scale: number; dx: number; dy: number; chars: number
  rot: number // degrees
  blur: number // fraction of the canvas height
  wipe: number // 0..1: share shown from the left
  letters: number // 0..1 while letters come in one by one, Infinity when done
}

/** Animation state of a text/sticker layer at time t (dx/dy in fractions of canvas height). */
export function animState(l: { start: number; end: number; animIn: TextAnim; animOut: TextAnim }, t: number): AnimState {
  const s: AnimState = { alpha: 1, scale: 1, dx: 0, dy: 0, chars: Infinity, rot: 0, blur: 0, wipe: 1, letters: Infinity }
  const dur = l.end - l.start
  const at = Math.min(ANIM_TIME, dur / 2)
  const apply = (anim: TextAnim, p: number, entering: boolean) => {
    p = Math.max(0, Math.min(1, p))
    if (p >= 1 && anim !== 'typewriter' && anim !== 'letters') return
    switch (anim) {
      case 'fade': s.alpha *= p; break
      case 'slide-up': s.alpha *= p; s.dy += (1 - easeOut(p)) * (entering ? 0.08 : -0.08); break
      case 'slide-down': s.alpha *= p; s.dy += (1 - easeOut(p)) * (entering ? -0.08 : 0.08); break
      // slide-left enters from the right and moves left; slide-right the opposite
      case 'slide-left': s.alpha *= p; s.dx += (1 - easeOut(p)) * (entering ? 0.25 : -0.25); break
      case 'slide-right': s.alpha *= p; s.dx += (1 - easeOut(p)) * (entering ? -0.25 : 0.25); break
      case 'pop': s.scale *= entering ? Math.max(0, easeOutBack(p)) : p; s.alpha *= Math.min(1, p * 3); break
      case 'zoom': s.scale *= 0.4 + 0.6 * easeOut(p); s.alpha *= p; break
      case 'bounce': s.dy += (1 - bounce(p)) * (entering ? -0.15 : 0.15); s.alpha *= Math.min(1, p * 4); break
      case 'typewriter': if (entering) s.chars = p; break
      case 'letters': if (entering) { if (p < 1) s.letters = p } else s.alpha *= p; break
      case 'blur': s.alpha *= Math.min(1, p * 1.5); s.blur += (1 - easeOut(p)) * 0.025; break
      case 'spin': s.scale *= Math.max(0.01, easeOut(p)); s.rot += (1 - easeOut(p)) * (entering ? -200 : 200); s.alpha *= Math.min(1, p * 2); break
      case 'drop': s.dy += (1 - Math.max(0, Math.min(1.2, easeOutBack(p)))) * (entering ? -0.35 : 0.35); s.alpha *= Math.min(1, p * 3); break
      case 'wipe': s.wipe = Math.min(s.wipe, easeOut(p)); break
      default: break
    }
  }
  if (l.animIn === 'typewriter' || l.animIn === 'letters') apply(l.animIn, (t - l.start) / Math.min(l.animIn === 'letters' ? 1.5 : 1.2, dur * 0.6), true)
  else apply(l.animIn, (t - l.start) / at, true)
  if (l.animOut !== 'typewriter') apply(l.animOut === 'letters' ? 'fade' : l.animOut, (l.end - t) / at, false)
  return s
}

export interface LoopState { scale: number; dy: number; rot: number; shine: number /* 0..1 band position, >1 = none */ }

/** A repeating movement `t` seconds after an item starts. */
export function loopState(loop: LoopAnim | undefined, t: number): LoopState {
  const s: LoopState = { scale: 1, dy: 0, rot: 0, shine: 2 }
  const T = Math.PI * 2
  switch (loop) {
    case 'pulse': s.scale = 1 + 0.045 * Math.sin((T * t) / 1.3); break
    case 'heartbeat': { const b = t % 1.1; s.scale = 1 + 0.08 * Math.exp(-b * 9) + 0.05 * Math.exp(-Math.max(0, b - 0.22) * 9) * (b > 0.22 ? 1 : 0); break }
    case 'float': s.dy = 0.012 * Math.sin((T * t) / 2.6); break
    case 'swing': s.rot = 4 * Math.sin((T * t) / 2.2); break
    case 'shimmer': s.shine = (t % 2.4) / 1.6; break
    default: break
  }
  return s
}

/** Paint for a line of text: its flat colour or a gradient fill spanning the line. */
function paintFor(ctx: Ctx, st: TextStyle, cx: number, y: number, px: number, w: number): string | CanvasGradient {
  const f = st.fill ? FILLS.find((x) => x.value === st.fill) : null
  if (!f) return st.color
  const g = f.value === 'rainbow' ? ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0) : ctx.createLinearGradient(0, y - px * 0.5, 0, y + px * 0.5)
  f.stops.forEach((c, i) => g.addColorStop(i / (f.stops.length - 1), c))
  return g
}

/** Outline, glow and fill of one piece of text at (x, y), then the shimmer's moving shine over it. */
function paintText(ctx: Ctx, st: TextStyle, text: string, x: number, y: number, px: number, lineX: number, lineW: number, shine: number) {
  if (st.shadow && !st.glow) {
    ctx.shadowColor = 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = px * 0.15
    ctx.shadowOffsetY = px * 0.04
  }
  if (st.stroke) {
    ctx.strokeStyle = st.stroke
    ctx.lineWidth = Math.max(1, st.strokeWidth * px * 0.2)
    ctx.strokeText(text, x, y)
    ctx.shadowColor = 'transparent'
  }
  ctx.fillStyle = paintFor(ctx, st, lineX, y, px, lineW)
  if (st.glow) {
    ctx.shadowColor = st.glow
    ctx.shadowOffsetY = 0
    ctx.shadowBlur = px * 0.45
    ctx.fillText(text, x, y)
    ctx.shadowBlur = px * 0.18
  }
  ctx.fillText(text, x, y)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  if (shine <= 1) {
    const bx = lineX - lineW / 2 - px + (lineW + px * 2) * shine
    const g = ctx.createLinearGradient(bx - px * 0.8, 0, bx + px * 0.8, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.85)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillText(text, x, y)
  }
}

const fontString = (st: TextStyle, px: number) =>
  `${st.italic ? 'italic ' : ''}${st.bold ? 700 : 400} ${px}px "${st.font}", "Noto Sans Devanagari", system-ui, sans-serif`

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Size of a text block in canvas pixels before scale/rotation. */
export function measureText(ctx: Ctx, layer: TextLayer, H: number) {
  const st = layer.style
  const px = Math.max(4, st.size * H)
  ctx.save()
  ctx.font = fontString(st, px)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${st.letterSpacing * px}px`
  const lines = layer.text.split('\n')
  const w = Math.max(...lines.map((l) => ctx.measureText(l || ' ').width))
  ctx.restore()
  const lh = px * 1.25
  const pad = st.background ? px * 0.35 : 0
  return { w: w + pad * 2, h: lines.length * lh + pad * 2 - (lh - px) * 0.3, px, lh, pad, lines }
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

export function drawText(ctx: Ctx, layer: TextLayer, t: number, W: number, H: number) {
  if (layer.frame) { drawFramedText(ctx, layer, layer.frame, t, W, H); return }
  const st = layer.style
  const a = animState(layer, t)
  if (a.alpha <= 0.001 || a.scale <= 0.001 || a.wipe <= 0.001) return
  const lp = loopState(layer.loop, t - layer.start)
  const m = measureText(ctx, layer, H)
  let lines = m.lines
  if (a.chars < 1) {
    const total = layer.text.length
    let n = Math.floor(total * a.chars)
    lines = lines.map((l) => { const s = l.slice(0, Math.max(0, n)); n -= l.length + 1; return s })
  }
  ctx.save()
  ctx.globalAlpha = layer.box.opacity * a.alpha
  ctx.translate(layer.box.x * W + a.dx * H, layer.box.y * H + (a.dy + lp.dy) * H)
  ctx.rotate(((layer.box.rotation + a.rot + lp.rot) * Math.PI) / 180)
  const sc = layer.box.scale * a.scale * lp.scale
  ctx.scale(sc, sc)
  if (a.blur > 0) ctx.filter = `blur(${(a.blur * H).toFixed(1)}px)`
  if (a.wipe < 1) {
    ctx.beginPath()
    ctx.rect(-m.w / 2 - m.px, -m.h / 2 - m.px, (m.w + m.px * 2) * a.wipe, m.h + m.px * 2)
    ctx.clip()
  }
  if (st.background) {
    ctx.fillStyle = st.background
    roundRect(ctx, -m.w / 2, -m.h / 2, m.w, m.h, m.px * 0.25)
    ctx.fill()
  }
  ctx.font = fontString(st, m.px)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${st.letterSpacing * m.px}px`
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const x = st.align === 'left' ? -m.w / 2 + m.pad : st.align === 'right' ? m.w / 2 - m.pad : 0
  const top = -((lines.length - 1) * m.lh) / 2
  const total = Math.max(1, lines.reduce((n, l) => n + [...l].length, 0))
  let seen = 0
  lines.forEach((line, i) => {
    const y = top + i * m.lh
    const lw = ctx.measureText(line).width
    const left = st.align === 'left' ? x : st.align === 'right' ? x - lw : x - lw / 2
    if (a.letters < 1) {
      // letters arrive one after another, each rising and fading in
      ctx.textAlign = 'left'
      const chars = [...line]
      let prefix = ''
      const base = ctx.globalAlpha
      for (const ch of chars) {
        const q = Math.max(0, Math.min(1, (a.letters - (seen / total) * 0.7) / 0.3))
        seen++
        if (q > 0) {
          ctx.globalAlpha = base * q
          paintText(ctx, st, ch, left + ctx.measureText(prefix).width, y + (1 - easeOut(q)) * m.px * 0.5, m.px, left + lw / 2, lw, 2)
        }
        prefix += ch
      }
      ctx.globalAlpha = base
      return
    }
    ctx.textAlign = st.align
    paintText(ctx, st, line, x, y, m.px, left + lw / 2, lw, lp.shine)
  })
  ctx.restore()
}

// ---------- caption frames

export const FRAME_RECTS: Record<Exclude<CaptionFramePreset, 'custom'>, CaptionFrame['rect']> = {
  bottom: { x: 0, y: 0.8, w: 1, h: 0.2 },
  top: { x: 0, y: 0, w: 1, h: 0.2 },
  left: { x: 0, y: 0, w: 0.5, h: 1 },
  right: { x: 0.5, y: 0, w: 0.5, h: 1 },
  center: { x: 0.15, y: 0.35, w: 0.7, h: 0.3 },
}

export const defaultFrame = (preset: CaptionFramePreset = 'bottom'): CaptionFrame => ({
  preset, rect: { ...FRAME_RECTS[preset === 'custom' ? 'center' : preset] },
  fill: '#000000', fillOpacity: 0.6, border: null, borderWidth: 1, radius: 0, valign: 'middle',
})

/** Splits text into lines no wider than maxW (keeps the user's own line breaks). */
function wrapLines(ctx: Ctx, text: string, maxW: number) {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/ +/)
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (line && ctx.measureText(next).width > maxW) { out.push(line); line = w } else line = next
    }
    out.push(line)
  }
  return out
}

/** Lays out framed text: wraps to the frame and shrinks the font until every line fits. */
export function layoutFramed(ctx: Ctx, layer: TextLayer, frame: CaptionFrame, W: number, H: number) {
  const st = layer.style
  const fw = frame.rect.w * W, fh = frame.rect.h * H
  let px = Math.max(4, st.size * H)
  for (let i = 0; i < 12; i++) {
    const pad = Math.min(fw, fh) * 0.08 + px * 0.3
    ctx.font = fontString(st, px)
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${st.letterSpacing * px}px`
    const lines = wrapLines(ctx, layer.text, Math.max(10, fw - pad * 2))
    const lh = px * 1.25
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
    if ((lines.length * lh <= fh - pad * 2 && widest <= fw - pad * 2) || px <= 6) return { px, lh, pad, lines }
    px *= 0.88
  }
  const pad = px * 0.3
  return { px, lh: px * 1.25, pad, lines: wrapLines(ctx, layer.text, fw - pad * 2) }
}

/** Height (fraction of the canvas) a frame of width w (fraction) needs to show the text at its own size, unshrunk. */
export function frameHeightFor(ctx: Ctx, layer: TextLayer, w: number, W: number, H: number) {
  const st = layer.style
  const px = Math.max(4, st.size * H), lh = px * 1.25, fw = w * W
  ctx.save()
  ctx.font = fontString(st, px)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${st.letterSpacing * px}px`
  // padding depends on the frame's short side, so settle it in two passes
  let fh = H
  for (let i = 0; i < 2; i++) {
    const pad = Math.min(fw, fh) * 0.08 + px * 0.3
    const lines = wrapLines(ctx, layer.text, Math.max(10, fw - pad * 2))
    fh = lines.length * lh + pad * 2
  }
  ctx.restore()
  return Math.min(1, (fh + 2) / H)
}

function drawFramedText(ctx: Ctx, layer: TextLayer, frame: CaptionFrame, t: number, W: number, H: number) {
  const st = layer.style
  const a = animState(layer, t)
  if (a.alpha <= 0.001 || a.scale <= 0.001) return
  const shine = loopState(layer.loop, t - layer.start).shine
  const x = frame.rect.x * W, y = frame.rect.y * H, w = frame.rect.w * W, h = frame.rect.h * H
  ctx.save()
  ctx.globalAlpha = layer.box.opacity * a.alpha
  // animations move/scale the whole frame around its centre
  ctx.translate(x + w / 2 + a.dx * H, y + h / 2 + a.dy * H)
  ctx.scale(a.scale, a.scale)
  const r = frame.radius * Math.min(w, h) / 2
  if (frame.fillOpacity > 0) {
    ctx.save()
    ctx.globalAlpha *= frame.fillOpacity
    ctx.fillStyle = frame.fill
    roundRect(ctx, -w / 2, -h / 2, w, h, r)
    ctx.fill()
    ctx.restore()
  }
  if (frame.border && frame.borderWidth > 0) {
    const bw = frame.borderWidth * Math.min(W, H) * 0.006
    ctx.strokeStyle = frame.border
    ctx.lineWidth = bw
    roundRect(ctx, -w / 2 + bw / 2, -h / 2 + bw / 2, w - bw, h - bw, Math.max(0, r - bw / 2))
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.rect(-w / 2, -h / 2, w, h)
  ctx.clip()
  const m = layoutFramed(ctx, layer, frame, W, H)
  let lines = m.lines
  if (a.chars < 1) {
    let n = Math.floor(layer.text.length * a.chars)
    lines = lines.map((l) => { const s = l.slice(0, Math.max(0, n)); n -= l.length + 1; return s })
  }
  ctx.font = fontString(st, m.px)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${st.letterSpacing * m.px}px`
  ctx.textBaseline = 'middle'
  ctx.textAlign = st.align
  ctx.lineJoin = 'round'
  const tx = st.align === 'left' ? -w / 2 + m.pad : st.align === 'right' ? w / 2 - m.pad : 0
  const blockH = (lines.length - 1) * m.lh
  const top = frame.valign === 'top' ? -h / 2 + m.pad + m.px / 2 : frame.valign === 'bottom' ? h / 2 - m.pad - m.px / 2 - blockH : -blockH / 2
  lines.forEach((line, i) => {
    const ly = top + i * m.lh
    if (st.background && frame.fillOpacity === 0) {
      // per-line highlight, only when the frame itself is see-through
      const lw = ctx.measureText(line).width
      if (lw > 0) {
        const lx = st.align === 'left' ? tx : st.align === 'right' ? tx - lw : tx - lw / 2
        ctx.fillStyle = st.background
        roundRect(ctx, lx - m.px * 0.25, ly - m.lh / 2, lw + m.px * 0.5, m.lh, m.px * 0.2)
        ctx.fill()
      }
    }
    const lw = ctx.measureText(line).width
    const lx = st.align === 'left' ? tx + lw / 2 : st.align === 'right' ? tx - lw / 2 : tx
    paintText(ctx, st, line, tx, ly, m.px, lx, lw, shine)
  })
  ctx.restore()
}

export const STICKER_BASE = 0.16

export function drawSticker(ctx: Ctx, layer: StickerLayer, t: number, W: number, H: number) {
  const a = animState(layer, t)
  if (a.alpha <= 0.001 || a.scale <= 0.001) return
  if (layer.shower) return drawShower(ctx, layer, t, W, H, layer.box.opacity * a.alpha)
  const lp = loopState(layer.loop, t - layer.start)
  const px = STICKER_BASE * H
  ctx.save()
  ctx.globalAlpha = layer.box.opacity * a.alpha
  ctx.translate(layer.box.x * W + a.dx * H, layer.box.y * H + (a.dy + lp.dy) * H)
  ctx.rotate(((layer.box.rotation + a.rot + lp.rot) * Math.PI) / 180)
  ctx.scale(layer.box.scale * a.scale * lp.scale, layer.box.scale * a.scale * lp.scale)
  if (a.blur > 0) ctx.filter = `blur(${(a.blur * H).toFixed(1)}px)`
  if (a.wipe < 1) { ctx.beginPath(); ctx.rect(-px, -px, px * 2 * a.wipe, px * 2); ctx.clip() }
  ctx.font = `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(layer.emoji, 0, px * 0.05)
  ctx.restore()
}

export const STICKERS: Record<string, string[]> = {
  Smileys: '😀 😂 🤣 😍 🥰 😎 🤩 😜 🤔 😴 😭 😡 🥳 😇 🤯 😱 🙄 😏 🤗 🤫 😬 🥺 😋 🤪'.split(' '),
  Love: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💘 💝 💕 💞 💓 💗 💋 😘 🌹 💐 💌'.split(' '),
  Hands: '👍 👎 👏 🙌 🙏 🤝 👌 ✌️ 🤞 🤟 🤘 👋 💪 👉 👈 👆 👇 ✋ 🫶 ☝️'.split(' '),
  Party: '🎉 🎊 🎈 🎁 🎂 🥂 🍾 ✨ 🎆 🎇 🪅 🎵 🎶 🎤 🎧 🏆 🥇 👑 💯 🔥'.split(' '),
  Nature: '☀️ 🌙 ⭐ 🌟 ⚡ 🌈 ☁️ 🌧️ ❄️ 🌊 🌸 🌺 🌻 🍀 🌴 🍁 🦋 🐶 🐱 🦁'.split(' '),
  Food: '🍕 🍔 🍟 🌮 🍜 🍣 🍩 🍪 🍫 🍦 🍰 ☕ 🧋 🥤 🍎 🍓 🍉 🥭 🍌 🍿'.split(' '),
  Travel: '✈️ 🚗 🏍️ 🚂 🚀 🛳️ 🗺️ 📍 🏖️ 🏔️ 🏙️ 🕌 🛕 🗽 🎡 📸 🎒 🧳 🌍 🧭'.split(' '),
  Symbols: '✅ ❌ ⚠️ ❗ ❓ 💥 💫 💢 💬 💭 🔔 📢 🔊 ▶️ ⏸️ ⏩ 🔁 ➡️ ⬅️ ⬆️'.split(' '),
  India: '🇮🇳 🪔 🙏 🕉️ 🛺 🏏 🐘 🦚 🌶️ 🍛 🫓 🎆 🪁 🥻 💃 🕺 🥁 🪷 🛕 🎇'.split(' '),
}
