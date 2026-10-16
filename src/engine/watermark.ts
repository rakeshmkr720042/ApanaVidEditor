import type { MediaSource, Watermark } from '../types'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export const defaultWatermark = (): Watermark => ({
  enabled: true, kind: 'text', text: '@mychannel', font: 'Poppins', size: 0.045, color: '#ffffff', bold: true, shadow: true,
  sourceId: null, imageSize: 0.14, opacity: 0.7, position: 'br', x: 0.85, y: 0.9,
  motion: 'static', speed: 1, range: 'full', start: 0, end: 5,
})

export function watermarkVisible(wm: Watermark | null | undefined, t: number): wm is Watermark {
  if (!wm?.enabled) return false
  if (wm.kind === 'text' ? !wm.text.trim() : !wm.sourceId) return false
  return wm.range === 'full' || (t >= wm.start && t < wm.end)
}

export const wmFont = (wm: Watermark, px: number) => `${wm.bold ? 700 : 400} ${px}px "${wm.font}", Poppins, system-ui, sans-serif`

/** 0→1→0 over each unit of u: a bounce between two walls. */
const tri = (u: number) => 1 - Math.abs(2 * (u - Math.floor(u)) - 1)

/** Size of the watermark in canvas pixels. */
export function watermarkSize(ctx: Ctx, wm: Watermark, W: number, H: number, src: MediaSource | undefined) {
  const short = Math.min(W, H)
  if (wm.kind === 'image') {
    const h = wm.imageSize * short
    const ar = src && src.width && src.height ? src.width / src.height : 1
    return { w: h * ar, h }
  }
  const px = Math.max(8, wm.size * short)
  ctx.save()
  ctx.font = wmFont(wm, px)
  const w = ctx.measureText(wm.text).width
  ctx.restore()
  return { w, h: px * 1.2 }
}

/** Centre of the watermark at time t. Floating moves slowly along a bouncing path that covers the whole frame. */
export function watermarkCenter(wm: Watermark, t: number, W: number, H: number, w: number, h: number) {
  const m = Math.min(W, H) * 0.04
  const minX = m + w / 2, maxX = Math.max(minX, W - m - w / 2)
  const minY = m + h / 2, maxY = Math.max(minY, H - m - h / 2)
  if (wm.motion === 'float') {
    // different periods on each axis so the path doesn't repeat quickly (about 14 s and 19 s at speed 1)
    const k = t * Math.max(0.05, wm.speed)
    return { cx: minX + (maxX - minX) * tri(k / 14 + 0.25), cy: minY + (maxY - minY) * tri(k / 19 + 0.6) }
  }
  if (wm.position === 'custom') {
    return { cx: Math.min(maxX, Math.max(minX, wm.x * W)), cy: Math.min(maxY, Math.max(minY, wm.y * H)) }
  }
  const col = wm.position[1], row = wm.position[0]
  return {
    cx: col === 'l' ? minX : col === 'r' ? maxX : W / 2,
    cy: row === 't' ? minY : row === 'b' ? maxY : H / 2,
  }
}

/** Draws the watermark; `img` is the decoded logo for image watermarks (skipped while it loads). */
export function drawUserWatermark(ctx: Ctx, wm: Watermark, t: number, W: number, H: number, src: MediaSource | undefined, img: CanvasImageSource | null) {
  if (wm.kind === 'image' && !img) return
  const { w, h } = watermarkSize(ctx, wm, W, H, src)
  const { cx, cy } = watermarkCenter(wm, t, W, H, w, h)
  ctx.save()
  ctx.globalAlpha = Math.max(0.1, Math.min(1, wm.opacity))
  if (wm.kind === 'image') {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img!, cx - w / 2, cy - h / 2, w, h)
  } else {
    const px = h / 1.2
    ctx.font = wmFont(wm, px)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (wm.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur = px * 0.25
      ctx.shadowOffsetY = px * 0.04
    }
    ctx.fillStyle = wm.color
    ctx.fillText(wm.text, cx, cy)
  }
  ctx.restore()
}
