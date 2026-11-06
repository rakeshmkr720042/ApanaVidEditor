/**
 * Video scopes (Premiere's Lumetri scopes, Resolve's scopes): pictures of the frame's brightness and colour that
 * show what the eye misses, e.g. burnt-out whites, crushed blacks, a colour cast, or skin tones off the skin line.
 *
 * - waveform: brightness of every column (bottom = black, top = white)
 * - parade: the same for red, green and blue side by side
 * - histogram: how many pixels have each brightness, per colour
 * - vector: hue round the circle and saturation out from the middle, with the skin-tone line
 *
 * Everything works on a small copy of the frame, so it stays light enough to run while the video plays.
 */

export type ScopeMode = 'waveform' | 'parade' | 'histogram' | 'vector'

export const SCOPE_W = 256
export const SCOPE_H = 128
const SAMPLE_W = 160
const SAMPLE_H = 90

export interface FrameStats {
  /** 0..1 share of pixels at pure black / pure white (clipped). */
  black: number
  white: number
  /** Average brightness 0..1. */
  mean: number
}

let sampler: HTMLCanvasElement | null = null

/** A small copy of the frame's pixels (RGBA). */
export function sampleFrame(src: CanvasImageSource, w = SAMPLE_W, h = SAMPLE_H): ImageData | null {
  sampler ??= document.createElement('canvas')
  if (sampler.width !== w || sampler.height !== h) { sampler.width = w; sampler.height = h }
  const c = sampler.getContext('2d', { willReadFrequently: true })
  if (!c) return null
  try {
    c.drawImage(src, 0, 0, w, h)
    return c.getImageData(0, 0, w, h)
  } catch { return null }
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function frameStats(px: ImageData): FrameStats {
  const d = px.data
  let black = 0, white = 0, sum = 0
  const n = d.length / 4
  for (let i = 0; i < d.length; i += 4) {
    const y = luma(d[i], d[i + 1], d[i + 2])
    sum += y
    if (y <= 2) black++
    if (y >= 253) white++
  }
  return { black: black / n, white: white / n, mean: sum / n / 255 }
}

/** Draws one scope of the frame `px` into `out` (SCOPE_W x SCOPE_H). */
export function drawScope(out: CanvasRenderingContext2D, px: ImageData, mode: ScopeMode) {
  const W = SCOPE_W, H = SCOPE_H
  const img = out.createImageData(W, H)
  const o = img.data
  const d = px.data
  const pw = px.width, ph = px.height
  // counts per output pixel and colour
  const acc = new Float32Array(W * H * 3)
  const hit = (x: number, y: number, ch: number, v = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    acc[(y * W + x) * 3 + ch] += v
  }
  if (mode === 'waveform' || mode === 'parade') {
    const parts = mode === 'parade' ? 3 : 1
    const colW = W / parts
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const i = (y * pw + x) * 4
        const r = d[i], g = d[i + 1], b = d[i + 2]
        if (parts === 1) {
          const ox = Math.floor((x / pw) * W)
          const oy = H - 1 - Math.round((luma(r, g, b) / 255) * (H - 1))
          hit(ox, oy, 0); hit(ox, oy, 1); hit(ox, oy, 2)
        } else {
          const vals = [r, g, b]
          for (let ch = 0; ch < 3; ch++) {
            const ox = Math.floor(ch * colW + (x / pw) * (colW - 2))
            hit(ox, H - 1 - Math.round((vals[ch] / 255) * (H - 1)), ch)
          }
        }
      }
    }
    // each column of the scope gets about ph * pw / W samples: scale so a full column glows
    const k = (mode === 'parade' ? 3 : 1) * 255 * W / (pw * ph) * 6
    for (let p = 0; p < W * H; p++) {
      const g = mode === 'waveform'
      o[p * 4] = Math.min(255, acc[p * 3] * k * (g ? 0.55 : 1))
      o[p * 4 + 1] = Math.min(255, acc[p * 3 + 1] * k)
      o[p * 4 + 2] = Math.min(255, acc[p * 3 + 2] * k * (g ? 0.55 : 1))
      o[p * 4 + 3] = 255
    }
    out.putImageData(img, 0, 0)
    // 0 / 50 / 100 % lines
    out.strokeStyle = 'rgba(255,255,255,0.18)'
    out.lineWidth = 1
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const y = Math.round((1 - f) * (H - 1)) + 0.5
      out.beginPath(); out.moveTo(0, y); out.lineTo(W, y); out.stroke()
    }
    if (mode === 'parade') for (const x of [W / 3, (2 * W) / 3]) { out.beginPath(); out.moveTo(x + 0.5, 0); out.lineTo(x + 0.5, H); out.stroke() }
    return
  }
  if (mode === 'histogram') {
    const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
    for (let i = 0; i < d.length; i += 4) { bins[0][d[i]]++; bins[1][d[i + 1]]++; bins[2][d[i + 2]]++ }
    // the tallest bar (ignoring the two ends, which often spike) fills the height
    let max = 1
    for (const b of bins) for (let v = 2; v < 254; v++) max = Math.max(max, b[v])
    out.fillStyle = '#000'
    out.fillRect(0, 0, W, H)
    out.globalCompositeOperation = 'lighter'
    const colors = ['rgba(255,70,70,0.75)', 'rgba(70,230,90,0.75)', 'rgba(80,140,255,0.75)']
    bins.forEach((b, ch) => {
      out.fillStyle = colors[ch]
      out.beginPath()
      out.moveTo(0, H)
      for (let v = 0; v < 256; v++) out.lineTo((v / 255) * W, H - Math.min(1, b[v] / max) * (H - 2))
      out.lineTo(W, H)
      out.closePath()
      out.fill()
    })
    out.globalCompositeOperation = 'source-over'
    return
  }
  // vectorscope: square, centred
  const S = H
  const ox = (W - S) / 2
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const u = -0.1687 * r - 0.3313 * g + 0.5 * b // -128..128
    const v = 0.5 * r - 0.4187 * g - 0.0813 * b
    const x = Math.round(ox + S / 2 + (u / 128) * (S / 2 - 2))
    const y = Math.round(S / 2 - (v / 128) * (S / 2 - 2))
    hit(x, y, 0, r / 255 + 0.35); hit(x, y, 1, g / 255 + 0.35); hit(x, y, 2, b / 255 + 0.35)
  }
  const k = 255 * 24 / (pw * ph) * 60
  for (let p = 0; p < W * H; p++) {
    o[p * 4] = Math.min(255, acc[p * 3] * k)
    o[p * 4 + 1] = Math.min(255, acc[p * 3 + 1] * k)
    o[p * 4 + 2] = Math.min(255, acc[p * 3 + 2] * k)
    o[p * 4 + 3] = 255
  }
  out.putImageData(img, 0, 0)
  out.strokeStyle = 'rgba(255,255,255,0.22)'
  out.lineWidth = 1
  const cx = ox + S / 2, cy = S / 2
  for (const f of [0.5, 1]) { out.beginPath(); out.arc(cx, cy, (S / 2 - 2) * f, 0, Math.PI * 2); out.stroke() }
  // skin-tone line (about 123° from the +u axis, towards red-yellow)
  out.strokeStyle = 'rgba(255,200,150,0.5)'
  const a = (123 * Math.PI) / 180
  out.beginPath(); out.moveTo(cx, cy); out.lineTo(cx + Math.cos(a) * (S / 2 - 2), cy - Math.sin(a) * (S / 2 - 2)); out.stroke()
  // colour targets: R, Y, G, C, B, M at 75 %
  const targets: [string, number, number, number][] = [['R', 191, 0, 0], ['Y', 191, 191, 0], ['G', 0, 191, 0], ['C', 0, 191, 191], ['B', 0, 0, 191], ['M', 191, 0, 191]]
  out.font = '9px sans-serif'
  out.fillStyle = 'rgba(255,255,255,0.45)'
  for (const [n, r, g, b] of targets) {
    const u = -0.1687 * r - 0.3313 * g + 0.5 * b
    const v = 0.5 * r - 0.4187 * g - 0.0813 * b
    out.fillText(n, cx + (u / 128) * (S / 2 - 2) - 3, cy - (v / 128) * (S / 2 - 2) + 3)
  }
}
