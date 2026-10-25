import type { Presenter, PresenterProfile, Project } from '../types'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * The presenter's own banner: name, qualification and experience, shown like a news channel's name strip
 * at the start, every few minutes and at the end. The profile is filled in once and kept on the device;
 * each project keeps a copy (so .avp files carry it) and its own choice of look and timing.
 */

const KEY = 'presenter-profile'

export const emptyProfile = (): PresenterProfile => ({ name: '', qualification: '', experience: '', extra: '', photo: null })

export function loadProfile(): PresenterProfile {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...emptyProfile(), ...JSON.parse(raw) }
  } catch { /* private mode or bad data */ }
  return emptyProfile()
}

export function saveProfile(p: PresenterProfile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* full or private mode: the project still has its copy */ }
}

export const hasProfile = (p: PresenterProfile) => !!(p.name.trim() || p.qualification.trim() || p.experience.trim())

export const defaultPresenter = (profile = loadProfile()): Presenter => ({
  enabled: true, profile, style: 'lower', theme: 'red', duration: 5, atStart: true, atEnd: true, every: 5,
})

export interface PresenterTheme { id: string; label: string; accent: string; main: string; mainText: string; sub: string; subText: string }

export const PRESENTER_THEMES: PresenterTheme[] = [
  { id: 'red', label: 'News red', accent: '#e11d2e', main: '#ffffff', mainText: '#111111', sub: '#c8102e', subText: '#ffffff' },
  { id: 'blue', label: 'Blue', accent: '#ffcc00', main: '#0b3d91', mainText: '#ffffff', sub: '#ffffff', subText: '#0b3d91' },
  { id: 'gold', label: 'Gold', accent: '#d4a017', main: '#101828', mainText: '#ffffff', sub: '#d4a017', subText: '#101828' },
  { id: 'green', label: 'Green', accent: '#16a34a', main: '#ffffff', mainText: '#0f2e1a', sub: '#15803d', subText: '#ffffff' },
  { id: 'dark', label: 'Dark', accent: '#ff7a00', main: '#111111', mainText: '#ffffff', sub: '#2b2b2b', subText: '#ffd8b0' },
]

export const themeOf = (id: string) => PRESENTER_THEMES.find((t) => t.id === id) ?? PRESENTER_THEMES[0]

/** Second line of the banner: qualification and experience. */
export const detailLine = (p: PresenterProfile) => [p.qualification.trim(), p.experience.trim()].filter(Boolean).join('  •  ')

const GAP = 5 // seconds kept clear between two banners

/** When the banners start, for a video `total` seconds long. Middle repeats never crowd the first or the end banner. */
export function presenterTimes(pr: Presenter | null | undefined, total: number): number[] {
  if (!pr?.enabled || !hasProfile(pr.profile) || total < 1) return []
  const D = Math.min(pr.duration, total)
  const lead = pr.style === 'full' ? 0 : Math.min(1, total * 0.05)
  const first = lead
  const last = Math.max(0, total - D - (pr.style === 'full' ? 0 : 0.5))
  const out: number[] = []
  if (pr.atStart) out.push(first)
  const showEnd = pr.atEnd && (!pr.atStart || last >= first + D + 1)
  if (pr.every > 0) {
    const step = pr.every * 60
    for (let t = step; t + D <= total; t += step) {
      if (pr.atStart && t < first + D + GAP) continue
      if (showEnd && t + D + GAP > last) break
      out.push(t)
    }
  }
  if (showEnd) out.push(last)
  return out
}

/** The banner showing at time t: when it started. */
export function presenterAt(pr: Presenter | null | undefined, total: number, t: number): number | null {
  if (!pr?.enabled) return null
  const D = Math.min(pr.duration, total)
  for (const s of presenterTimes(pr, total)) if (t >= s && t < s + D) return s
  return null
}

/** Captions on screen while a banner shows push the lower-third up so they don't overlap. */
export function captionsDuring(project: Project, from: number, to: number) {
  return project.layers.some((l) => l.type === 'text' && l.start < to && l.end > from &&
    (l.subtitle || (l.frame ? l.frame.rect.y + l.frame.rect.h > 0.7 : l.box.y > 0.7)))
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3)
export const presenterFont = (weight: number, px: number) => `${weight} ${px}px Poppins, "Noto Sans Devanagari", system-ui, sans-serif`

/** Shrinks the text to fit a width. */
function fitFont(ctx: Ctx, text: string, weight: number, px: number, maxW: number) {
  ctx.font = presenterFont(weight, px)
  const w = ctx.measureText(text).width
  if (w <= maxW || !w) return { px, w }
  const s = maxW / w
  ctx.font = presenterFont(weight, px * s)
  return { px: px * s, w: maxW }
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
}

function drawPhoto(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, cx: number, cy: number, d: number, ring: string, ringW: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
  ctx.fillStyle = ring
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, d / 2 - ringW, 0, Math.PI * 2)
  ctx.clip()
  const iw = img.width || 1, ih = img.height || 1
  const s = (d - ringW * 2) / Math.min(iw, ih)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s)
  ctx.restore()
}

type Img = (CanvasImageSource & { width: number; height: number }) | null

/**
 * Draws the banner `p` seconds after it started (it lasts D seconds). `lift`: captions are on screen,
 * so the lower-third sits higher.
 */
export function drawPresenter(ctx: Ctx, pr: Presenter, p: number, D: number, W: number, H: number, photo: Img, lift: boolean) {
  const S = Math.min(W, H)
  const th = themeOf(pr.theme)
  const prof = pr.profile
  const name = prof.name.trim() || prof.qualification.trim()
  const detail = prof.name.trim() ? detailLine(prof) : prof.experience.trim()
  const extra = prof.extra.trim()
  const out = clamp01((D - p) / 0.5)
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'

  if (pr.style === 'lower') {
    const kName = Math.min(easeOut(p / 0.6), easeOut(out))
    const kSub = Math.min(easeOut((p - 0.15) / 0.6), easeOut(out))
    const kTag = Math.min(easeOut((p - 0.3) / 0.5), easeOut(out))
    const kPhoto = Math.min(easeOut(p / 0.45), easeOut(out))
    const portrait = H > W
    const marginX = W * (portrait ? 0.04 : 0.05)
    const z = portrait ? 1.3 : 1 // the short side is the width on a phone video: a bit bigger reads better
    const nameH = S * 0.085 * z, subH = detail ? S * 0.06 * z : 0, tagH = extra ? S * 0.045 * z : 0
    const photoD = photo ? nameH + subH : 0
    const left = marginX + (photo ? photoD + S * 0.012 : S * 0.014)
    const maxW = W - left - marginX
    const pad = S * 0.025
    const nf = fitFont(ctx, name, 700, nameH * 0.56, maxW - pad * 2)
    const sf = detail ? fitFont(ctx, detail, 500, subH * 0.55, maxW - pad * 2) : { px: 0, w: 0 }
    const tf = extra ? fitFont(ctx, extra.toUpperCase(), 700, tagH * 0.6, maxW - pad * 2) : { px: 0, w: 0 }
    const nameW = nf.w + pad * 2, subW = detail ? sf.w + pad * 2 : 0, tagW = extra ? tf.w + pad * 1.6 : 0
    const bottom = H * (lift ? 0.74 : portrait ? 0.86 : 0.9)
    const subY = bottom - subH, nameY = subY - nameH, tagY = nameY - tagH

    // accent bar on the left edge of the strips (or the photo)
    if (!photo) {
      ctx.fillStyle = th.accent
      const barH = (nameH + subH) * kName
      ctx.fillRect(marginX, bottom - barH, S * 0.014, barH)
    }
    if (kName > 0) {
      ctx.save()
      ctx.beginPath(); ctx.rect(left, nameY, nameW * kName, nameH); ctx.clip()
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = S * 0.02
      ctx.fillStyle = th.main
      ctx.fillRect(left, nameY, nameW, nameH)
      ctx.shadowColor = 'transparent'
      ctx.fillStyle = th.mainText
      ctx.font = presenterFont(700, nf.px)
      ctx.fillText(name, left + pad - (1 - kName) * nameW * 0.3, nameY + nameH / 2)
      ctx.restore()
    }
    if (detail && kSub > 0) {
      ctx.save()
      ctx.beginPath(); ctx.rect(left, subY, subW * kSub, subH); ctx.clip()
      ctx.fillStyle = th.sub
      ctx.fillRect(left, subY, subW, subH)
      ctx.fillStyle = th.subText
      ctx.font = presenterFont(500, sf.px)
      ctx.fillText(detail, left + pad - (1 - kSub) * subW * 0.3, subY + subH / 2)
      ctx.restore()
    }
    if (extra && kTag > 0) {
      ctx.save()
      ctx.beginPath(); ctx.rect(left, tagY + tagH * (1 - kTag), tagW, tagH * kTag); ctx.clip()
      ctx.fillStyle = th.accent
      ctx.fillRect(left, tagY, tagW, tagH)
      ctx.fillStyle = '#ffffff'
      ctx.font = presenterFont(700, tf.px)
      ctx.fillText(extra.toUpperCase(), left + pad * 0.8, tagY + tagH / 2)
      ctx.restore()
    }
    if (photo && kPhoto > 0) {
      const d = photoD * (0.6 + 0.4 * kPhoto)
      ctx.globalAlpha = kPhoto
      drawPhoto(ctx, photo, marginX + photoD / 2, bottom - photoD / 2, d, th.accent, S * 0.006)
    }
  } else if (pr.style === 'card') {
    const k = Math.min(easeOut(p / 0.6), easeOut(out))
    const portrait = H > W
    const cardW = W * (portrait ? 0.62 : 0.34)
    const pad = S * 0.03
    const photoD = photo ? S * 0.14 : 0
    const inner = cardW - pad * 2 - (photo ? photoD + pad * 0.7 : 0)
    const nf = fitFont(ctx, name, 700, S * 0.045, inner)
    const lines = [detail, extra].filter(Boolean)
    const fonts = lines.map((l) => fitFont(ctx, l, 500, S * 0.03, inner))
    const textH = nf.px * 1.3 + fonts.reduce((a, f) => a + f.px * 1.45, 0)
    const cardH = Math.max(photoD, textH) + pad * 2
    const m = S * 0.045
    const x = W - m - cardW + (1 - k) * (cardW + m)
    const y = m + (portrait ? H * 0.06 : 0)
    ctx.globalAlpha = k
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = S * 0.03
    ctx.fillStyle = th.main
    roundRect(ctx, x, y, cardW, cardH, S * 0.02); ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.fillStyle = th.accent
    roundRect(ctx, x, y, S * 0.012, cardH, S * 0.006); ctx.fill()
    let tx = x + pad
    if (photo) {
      drawPhoto(ctx, photo, tx + photoD / 2, y + cardH / 2, photoD, th.accent, S * 0.005)
      tx += photoD + pad * 0.7
    }
    let ty = y + cardH / 2 - textH / 2 + nf.px * 0.65
    ctx.fillStyle = th.mainText
    ctx.font = presenterFont(700, nf.px)
    ctx.fillText(name, tx, ty)
    ty += nf.px * 0.65
    lines.forEach((l, i) => {
      const f = fonts[i]
      ty += f.px * 0.72
      ctx.font = presenterFont(500, f.px)
      ctx.fillStyle = i === 0 ? th.accent : th.mainText
      ctx.globalAlpha = k * (i === 0 ? 1 : 0.8)
      ctx.fillText(l, tx, ty)
      ty += f.px * 0.73
    })
  } else {
    // full-screen intro card
    const kIn = easeOut(p / 0.7), kOut = easeOut(out)
    const k = Math.min(kIn, kOut)
    ctx.globalAlpha = k
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, th.main)
    g.addColorStop(1, th.sub)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, W, H)
    const scale = 0.92 + 0.08 * kIn
    ctx.translate(W / 2, H / 2)
    ctx.scale(scale, scale)
    ctx.translate(-W / 2, -H / 2)
    const photoD = photo ? S * 0.3 : 0
    const nf = fitFont(ctx, name, 700, S * 0.085, W * 0.86)
    const df = detail ? fitFont(ctx, detail, 500, S * 0.045, W * 0.86) : { px: 0, w: 0 }
    const ef = extra ? fitFont(ctx, extra, 500, S * 0.038, W * 0.86) : { px: 0, w: 0 }
    const gap = S * 0.035
    const blockH = photoD + (photo ? gap : 0) + nf.px * 1.2 + S * 0.03 + df.px * 1.4 + ef.px * 1.4
    let y = H / 2 - blockH / 2
    if (photo) {
      drawPhoto(ctx, photo, W / 2, y + photoD / 2, photoD, th.accent, S * 0.008)
      y += photoD + gap
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = S * 0.015
    ctx.font = presenterFont(700, nf.px)
    ctx.fillText(name, W / 2, y + nf.px * 0.6)
    y += nf.px * 1.2
    ctx.shadowColor = 'transparent'
    const lineW = Math.min(W * 0.5, Math.max(nf.w, df.w) * 0.6) * kIn
    ctx.fillStyle = th.accent
    ctx.fillRect(W / 2 - lineW / 2, y + S * 0.005, lineW, S * 0.008)
    y += S * 0.03
    if (detail) {
      ctx.fillStyle = '#ffffff'
      ctx.font = presenterFont(500, df.px)
      ctx.fillText(detail, W / 2, y + df.px * 0.7)
      y += df.px * 1.4
    }
    if (extra) {
      ctx.globalAlpha = k * 0.85
      ctx.fillStyle = '#ffffff'
      ctx.font = presenterFont(400, ef.px)
      ctx.fillText(extra, W / 2, y + ef.px * 0.7)
    }
  }
  ctx.restore()
}

/** Shrinks a picked photo to a small square JPEG data URL, so it fits in the device storage and project files. */
export async function photoToDataUrl(file: Blob, size = 320): Promise<string> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = c.height = Math.min(size, s)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, c.width, c.height)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.88)
}
