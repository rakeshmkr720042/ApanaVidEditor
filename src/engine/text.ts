import type { StickerLayer, TextAnim, TextLayer, TextStyle } from '../types'

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

export const ANIMS: TextAnim[] = ['none', 'fade', 'slide-up', 'slide-down', 'pop', 'zoom', 'bounce', 'typewriter']

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

export interface AnimState { alpha: number; scale: number; dx: number; dy: number; chars: number }

/** Animation state of a text/sticker layer at time t (dx/dy in fractions of canvas height). */
export function animState(l: { start: number; end: number; animIn: TextAnim; animOut: TextAnim }, t: number): AnimState {
  const s: AnimState = { alpha: 1, scale: 1, dx: 0, dy: 0, chars: Infinity }
  const dur = l.end - l.start
  const at = Math.min(ANIM_TIME, dur / 2)
  const apply = (anim: TextAnim, p: number, entering: boolean) => {
    p = Math.max(0, Math.min(1, p))
    if (p >= 1 && anim !== 'typewriter') return
    switch (anim) {
      case 'fade': s.alpha *= p; break
      case 'slide-up': s.alpha *= p; s.dy += (1 - easeOut(p)) * (entering ? 0.08 : -0.08); break
      case 'slide-down': s.alpha *= p; s.dy += (1 - easeOut(p)) * (entering ? -0.08 : 0.08); break
      case 'pop': s.scale *= entering ? Math.max(0, easeOutBack(p)) : p; s.alpha *= Math.min(1, p * 3); break
      case 'zoom': s.scale *= 0.4 + 0.6 * easeOut(p); s.alpha *= p; break
      case 'bounce': s.dy += (1 - bounce(p)) * (entering ? -0.15 : 0.15); s.alpha *= Math.min(1, p * 4); break
      case 'typewriter': if (entering) s.chars = p; break
      default: break
    }
  }
  if (l.animIn === 'typewriter') apply('typewriter', (t - l.start) / Math.min(1.2, dur * 0.6), true)
  else apply(l.animIn, (t - l.start) / at, true)
  if (l.animOut !== 'typewriter') apply(l.animOut, (l.end - t) / at, false)
  return s
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
  const st = layer.style
  const a = animState(layer, t)
  if (a.alpha <= 0.001 || a.scale <= 0.001) return
  const m = measureText(ctx, layer, H)
  let lines = m.lines
  if (a.chars < 1) {
    const total = layer.text.length
    let n = Math.floor(total * a.chars)
    lines = lines.map((l) => { const s = l.slice(0, Math.max(0, n)); n -= l.length + 1; return s })
  }
  ctx.save()
  ctx.globalAlpha = layer.box.opacity * a.alpha
  ctx.translate(layer.box.x * W + a.dx * H, layer.box.y * H + a.dy * H)
  ctx.rotate((layer.box.rotation * Math.PI) / 180)
  ctx.scale(layer.box.scale * a.scale, layer.box.scale * a.scale)
  if (st.background) {
    ctx.fillStyle = st.background
    roundRect(ctx, -m.w / 2, -m.h / 2, m.w, m.h, m.px * 0.25)
    ctx.fill()
  }
  ctx.font = fontString(st, m.px)
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${st.letterSpacing * m.px}px`
  ctx.textBaseline = 'middle'
  ctx.textAlign = st.align
  ctx.lineJoin = 'round'
  const x = st.align === 'left' ? -m.w / 2 + m.pad : st.align === 'right' ? m.w / 2 - m.pad : 0
  const top = -((lines.length - 1) * m.lh) / 2
  lines.forEach((line, i) => {
    const y = top + i * m.lh
    if (st.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = m.px * 0.15
      ctx.shadowOffsetY = m.px * 0.04
    }
    if (st.stroke) {
      ctx.strokeStyle = st.stroke
      ctx.lineWidth = Math.max(1, st.strokeWidth * m.px * 0.2)
      ctx.strokeText(line, x, y)
      ctx.shadowColor = 'transparent'
    }
    ctx.fillStyle = st.color
    ctx.fillText(line, x, y)
    ctx.shadowColor = 'transparent'
  })
  ctx.restore()
}

export const STICKER_BASE = 0.16

export function drawSticker(ctx: Ctx, layer: StickerLayer, t: number, W: number, H: number) {
  const a = animState(layer, t)
  if (a.alpha <= 0.001 || a.scale <= 0.001) return
  const px = STICKER_BASE * H
  ctx.save()
  ctx.globalAlpha = layer.box.opacity * a.alpha
  ctx.translate(layer.box.x * W + a.dx * H, layer.box.y * H + a.dy * H)
  ctx.rotate((layer.box.rotation * Math.PI) / 180)
  ctx.scale(layer.box.scale * a.scale, layer.box.scale * a.scale)
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
