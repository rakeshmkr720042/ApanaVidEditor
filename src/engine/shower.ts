import type { Shower, StickerLayer } from '../types'

/**
 * Showers: many copies of a sticker moving over the whole picture (falling rose petals, rising hearts, confetti,
 * party bursts…). Every particle is worked out from its number and the time, so preview and export match and any
 * frame can be drawn on its own. Two drawn shapes besides emoji: 'petal' (a rose petal) and 'paper' (confetti).
 */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Canvas = HTMLCanvasElement | OffscreenCanvas

export const SHOWER_PRESETS: { name: string; emoji: string; shower: Shower }[] = [
  { name: 'Rose petals', emoji: 'petal', shower: { motion: 'fall', count: 40, size: 1, speed: 1 } },
  { name: 'Flower shower', emoji: '🌸', shower: { motion: 'fall', count: 30, size: 1, speed: 0.9 } },
  { name: 'Marigold', emoji: '🌼', shower: { motion: 'fall', count: 30, size: 1, speed: 1 } },
  { name: 'Rising hearts', emoji: '❤️', shower: { motion: 'rise', count: 22, size: 1, speed: 1 } },
  { name: 'Floating love', emoji: '💕', shower: { motion: 'float', count: 16, size: 1, speed: 1 } },
  { name: 'Confetti', emoji: 'paper', shower: { motion: 'fall', count: 70, size: 1, speed: 1.2 } },
  { name: 'Party burst', emoji: '🎉', shower: { motion: 'burst', count: 30, size: 0.9, speed: 1 } },
  { name: 'Confetti burst', emoji: 'paper', shower: { motion: 'burst', count: 60, size: 1, speed: 1 } },
  { name: 'Balloons', emoji: '🎈', shower: { motion: 'rise', count: 14, size: 1.4, speed: 0.8 } },
  { name: 'Sparkles', emoji: '✨', shower: { motion: 'float', count: 24, size: 0.8, speed: 1 } },
  { name: 'Stars', emoji: '⭐', shower: { motion: 'swirl', count: 18, size: 0.8, speed: 1 } },
  { name: 'Fireworks', emoji: '🎆', shower: { motion: 'burst', count: 14, size: 1.3, speed: 0.8 } },
  { name: 'Diyas', emoji: '🪔', shower: { motion: 'float', count: 12, size: 1.1, speed: 0.7 } },
  { name: 'Snow', emoji: '❄️', shower: { motion: 'fall', count: 40, size: 0.7, speed: 0.7 } },
  { name: 'Gold coins', emoji: '🪙', shower: { motion: 'fall', count: 25, size: 0.9, speed: 1.4 } },
  { name: 'Butterflies', emoji: '🦋', shower: { motion: 'float', count: 10, size: 1.1, speed: 1.2 } },
]

export const SHOWER_MOTIONS: { value: Shower['motion']; label: string }[] = [
  { value: 'fall', label: 'Fall' }, { value: 'rise', label: 'Rise' }, { value: 'float', label: 'Float' },
  { value: 'burst', label: 'Burst' }, { value: 'swirl', label: 'Swirl' },
]

const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}
const PAPER = ['#ff4d6d', '#ffd60a', '#4cc9f0', '#80ed99', '#f72585', '#ff9f1c', '#ffffff', '#b388ff']
const BURST = 2.6 // seconds between bursts

const sprites = new Map<string, Canvas>()
/** An emoji drawn once at a size, reused for every particle (much faster than text per particle). */
function sprite(emoji: string, px: number): Canvas {
  const size = Math.max(8, Math.round(px / 4) * 4)
  const key = `${emoji}|${size}`
  let c = sprites.get(key)
  if (!c) {
    const s = Math.ceil(size * 1.3)
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(s, s) : Object.assign(document.createElement('canvas'), { width: s, height: s })
    const x = c.getContext('2d') as Ctx
    x.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    x.fillText(emoji, s / 2, s / 2 + size * 0.05)
    if (sprites.size > 120) sprites.clear()
    sprites.set(key, c)
  }
  return c
}

function petal(ctx: Ctx, r: number, i: number) {
  const g = ctx.createRadialGradient(0, r * 0.3, r * 0.1, 0, 0, r)
  const deep = rnd(i, 9) > 0.5
  g.addColorStop(0, deep ? '#ff4d6d' : '#ff8fab')
  g.addColorStop(1, deep ? '#a4133c' : '#e5446d')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(0, r)
  ctx.bezierCurveTo(r * 0.9, r * 0.5, r * 0.8, -r * 0.8, 0, -r * 0.55)
  ctx.bezierCurveTo(-r * 0.8, -r * 0.8, -r * 0.9, r * 0.5, 0, r)
  ctx.fill()
}

/** Draws a sticker's shower at time t (the layer's own fade/zoom in and out are applied by the caller's alpha). */
export function drawShower(ctx: Ctx, l: StickerLayer, t: number, W: number, H: number, alpha: number) {
  const sh = l.shower!
  const tau = Math.max(0, t - l.start) * sh.speed
  const base = 0.16 * H * 0.42 * sh.size
  const n = Math.max(1, Math.min(150, Math.round(sh.count)))
  for (let i = 0; i < n; i++) {
    const r0 = rnd(i, 1), r1 = rnd(i, 2), r2 = rnd(i, 3), r3 = rnd(i, 4)
    const size = base * (0.6 + 0.8 * r2)
    let x = 0, y = 0, rot = 0, a = 1, flip = 1
    const v = 0.12 + 0.12 * r3 // screen heights per second
    if (sh.motion === 'fall' || sh.motion === 'rise') {
      const span = 1 + (2 * size) / H
      let p = (r1 * span + tau * v) % span
      if (sh.motion === 'rise') p = span - p
      y = p * H - size
      x = r0 * W + Math.sin(tau * (1 + r2) + r1 * 6.28) * 0.04 * W
      rot = (r3 - 0.5) * 1.2 + Math.sin(tau * (1.5 + r0) + r2 * 6) * 0.8
      flip = Math.cos(tau * (2 + r1 * 3) + r0 * 6)
    } else if (sh.motion === 'float') {
      x = (r0 + Math.sin(tau * 0.4 + r1 * 6.28) * 0.05) * W
      y = (r1 + Math.cos(tau * 0.35 + r0 * 6.28) * 0.05) * H
      a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(tau * 1.6 + r2 * 6.28))
      rot = Math.sin(tau * 0.8 + r3 * 6) * 0.3
    } else if (sh.motion === 'swirl') {
      const ang = tau * (0.3 + 0.2 * r3) + r0 * 6.28
      const rad = (0.15 + 0.35 * r1) * Math.min(W, H)
      x = W / 2 + Math.cos(ang) * rad * (W / Math.min(W, H)) * 0.8
      y = H / 2 + Math.sin(ang) * rad
      a = 0.5 + 0.5 * Math.sin(tau * 2 + r2 * 6.28)
      rot = ang
    } else {
      // bursts from a few spots, one after another; particles fly out and fall
      const round = Math.floor((tau + r0 * 0.15) / BURST)
      const age = (tau + r0 * 0.15) % BURST
      const spot = Math.floor(rnd(i, 7) * 2)
      const cx = (0.25 + 0.5 * rnd(round * 3 + spot, 5)) * W, cy = (0.25 + 0.3 * rnd(round * 3 + spot, 6)) * H
      const ang = r1 * Math.PI * 2
      const sp = (0.25 + 0.45 * r2) * H
      x = cx + Math.cos(ang) * sp * age * 0.9
      y = cy + Math.sin(ang) * sp * age * 0.9 + 0.5 * 0.35 * H * age * age
      a = Math.max(0, 1 - age / BURST) * Math.min(1, age * 8)
      rot = ang + age * 3
      flip = Math.cos(age * 6 + r0 * 6)
    }
    if (a <= 0.01) continue
    ctx.save()
    ctx.globalAlpha = alpha * a
    ctx.translate(x, y)
    ctx.rotate(rot)
    if (l.emoji === 'paper') {
      ctx.scale(1, Math.max(0.15, Math.abs(flip)))
      ctx.fillStyle = PAPER[Math.floor(rnd(i, 8) * PAPER.length)]
      ctx.fillRect(-size * 0.22, -size * 0.12, size * 0.44, size * 0.24)
    } else if (l.emoji === 'petal') {
      ctx.scale(Math.max(0.3, Math.abs(flip)), 1)
      petal(ctx, size * 0.32, i)
    } else {
      const img = sprite(l.emoji, size)
      const s = size * 1.3
      ctx.drawImage(img, -s / 2, -s / 2, s, s)
    }
    ctx.restore()
  }
}
