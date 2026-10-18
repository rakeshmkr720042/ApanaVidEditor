import type { WaveStyle } from '../types'
import type { Scene } from '../model/scenes'
import type { Cue } from './srt'
import { ensureFont } from '../engine/text'
import { wrap, type CardTheme } from './scriptScenes'
import { uid } from './format'
import { planPictures, type Leftover, type Pic } from './rawMedia'

/**
 * Audio overview → video: a podcast, talk or voice note is cut into chapters at its pauses (and at
 * sentence ends when there is a transcript), and each chapter becomes a scene whose picture can change.
 * The sound itself stays one track; scenes are timed to match it exactly.
 */

export type AudioLook = 'card' | 'photos' | 'cover'

/** What an audio chapter covers, so captions can follow the real speech timing. */
export interface AudioPart {
  start: number // seconds into the audio
  end: number
  cues: Cue[] // speech in this chapter, in audio time
  heard: string // the transcript as recognised; when the scene text no longer matches, captions are spread evenly
  look: AudioLook // 'photos': one of the user's pictures; otherwise a drawn card
  pic?: string // id of the user's picture shown, when there is one
  title: string // drawn on cards
  sub: string
}

export interface Gap { start: number; end: number }

const deva = (s: string) => /[ऀ-ॿ]/.test(s)

/** Pauses in speech: stretches quieter than the speaking level for at least `minLen` seconds. */
export function findGaps(pcm: Float32Array, rate = 16000, minLen = 0.35): Gap[] {
  const win = Math.round(rate / 50) // 20 ms
  const n = Math.floor(pcm.length / win)
  if (n < 5) return []
  const db = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let s = 0
    for (let i = f * win; i < (f + 1) * win; i++) s += pcm[i] * pcm[i]
    db[f] = 10 * Math.log10(s / win + 1e-10)
  }
  const sorted = [...db].sort((a, b) => a - b)
  const floor = sorted[Math.floor(n * 0.1)], speech = sorted[Math.floor(n * 0.7)]
  const thr = floor + Math.max(6, (speech - floor) * 0.3)
  const gaps: Gap[] = []
  let from = -1
  for (let f = 0; f <= n; f++) {
    const quiet = f < n && db[f] < thr
    if (quiet && from < 0) from = f
    if (!quiet && from >= 0) {
      if ((f - from) * 0.02 >= minLen) gaps.push({ start: (from * win) / rate, end: (f * win) / rate })
      from = -1
    }
  }
  return gaps
}

/**
 * Where to cut chapters of about `target` seconds: at the longest pause near each target, or
 * between two sentences when there is a transcript. Never shorter than 60% of the target.
 */
export function chapterCuts(duration: number, gaps: Gap[], cues: Cue[], target: number): number[] {
  const cands: { t: number; score: number }[] = []
  const inCue = (t: number) => cues.some((c) => t > c.start + 0.15 && t < c.end - 0.15)
  for (const g of gaps) {
    const t = (g.start + g.end) / 2
    cands.push({ t, score: Math.min(2, g.end - g.start) - (inCue(t) ? 0.6 : 0) })
  }
  for (let i = 0; i + 1 < cues.length; i++) {
    const a = cues[i], b = cues[i + 1]
    cands.push({ t: (a.end + b.start) / 2, score: 0.3 + Math.max(0, Math.min(2, b.start - a.end)) + (/[.!?।]["”']?$/.test(a.text.trim()) ? 0.6 : 0) })
  }
  const cuts: number[] = []
  let pos = 0
  while (duration - pos > target * 1.4) {
    const lo = pos + target * 0.6, hi = Math.min(duration - target * 0.4, pos + target * 1.5)
    let best = pos + target, bestV = -Infinity
    for (const c of cands) {
      if (c.t < lo || c.t > hi) continue
      const v = c.score - Math.abs(c.t - (pos + target)) / target
      if (v > bestV) { bestV = v; best = c.t }
    }
    cuts.push(best)
    pos = best
  }
  return cuts
}

/** A few words to name a chapter by: its first sentence, shortened. */
export function headingOf(text: string, words = 7) {
  const first = text.trim().split(/(?<=[.!?।])\s+/)[0] ?? ''
  const w = first.replace(/[.!?।,;:]+$/, '').split(/\s+/).filter(Boolean)
  return w.length > words ? w.slice(0, words).join(' ') + '…' : w.join(' ')
}

// ---------------------------------------------------------------- cards

/** Layout shared by the cards and the scene builder: where the wave and the captions go. */
export const captionY = (wave: WaveStyle | null) => (wave === 'circle' ? 0.88 : wave ? 0.7 : 0.86)

const blobOf = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'))

/**
 * A background card for audio: the title (and chapter heading) with room left for the waveform and
 * captions. With a cover image it sits on a blurred copy of itself; with the ring it is cut round.
 */
export async function drawAudioCard(p: { title: string; sub: string; theme: CardTheme; cover: ImageBitmap | null; wave: WaveStyle | null; W: number; H: number }) {
  const { title, sub, theme, cover, wave, W, H } = p
  const font = deva(title + sub) ? 'Noto Sans Devanagari' : 'Poppins'
  await ensureFont(font)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const u = Math.min(W, H)
  let titleColor = theme.title, subColor = theme.text

  if (cover) {
    const s = Math.max(W / cover.width, H / cover.height) * 1.1
    g.filter = `blur(${Math.round(u * 0.035)}px) brightness(0.5)`
    g.drawImage(cover, (W - cover.width * s) / 2, (H - cover.height * s) / 2, cover.width * s, cover.height * s)
    g.filter = 'none'
    titleColor = '#ffffff'; subColor = '#e2e8f0'
  } else {
    const grad = g.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, theme.bg[0]); grad.addColorStop(1, theme.bg[1])
    g.fillStyle = grad; g.fillRect(0, 0, W, H)
    g.globalAlpha = 0.09; g.fillStyle = theme.accent
    g.beginPath(); g.arc(W, 0, u * 0.42, 0, Math.PI * 2); g.fill()
    g.globalAlpha = 0.06
    g.beginPath(); g.arc(0, H, u * 0.3, 0, Math.PI * 2); g.fill()
    g.globalAlpha = 1
  }

  // the picture area: a round cover inside the ring, or a square cover above the bars
  let textTop: number
  let textMid: boolean
  if (wave === 'circle') {
    if (cover) {
      const r = u * 0.17
      g.save(); g.beginPath(); g.arc(W / 2, H / 2, r, 0, Math.PI * 2); g.clip()
      const s = Math.max((2 * r) / cover.width, (2 * r) / cover.height)
      g.drawImage(cover, W / 2 - (cover.width * s) / 2, H / 2 - (cover.height * s) / 2, cover.width * s, cover.height * s)
      g.restore()
    }
    textTop = H / 2 - u * 0.33 - (H > W ? u * 0.25 : 0)
    textMid = false
  } else if (cover) {
    const tall = H > W
    const side = u * (wave ? (tall ? 0.62 : 0.36) : (tall ? 0.72 : 0.46))
    const cy = H * (tall ? 0.37 : wave ? 0.4 : 0.42)
    const s = Math.max(side / cover.width, side / cover.height)
    g.save()
    g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = u * 0.04
    g.beginPath(); g.roundRect(W / 2 - side / 2, cy - side / 2, side, side, side * 0.06); g.fillStyle = '#000'; g.fill()
    g.shadowColor = 'transparent'; g.clip()
    g.drawImage(cover, W / 2 - (cover.width * s) / 2, cy - (cover.height * s) / 2, cover.width * s, cover.height * s)
    g.restore()
    textTop = cy - side / 2 - u * 0.03
    textMid = false
  } else {
    textTop = H * (wave ? 0.38 : 0.45)
    textMid = true
  }

  const maxW = W * 0.84
  const tPx = u * (textMid ? 0.085 : 0.058), sPx = u * (textMid ? 0.045 : 0.036)
  const lh = deva(title + sub) ? 1.45 : 1.25
  g.font = `700 ${Math.round(tPx)}px "${font}"`
  const tLines = wrap(g, title, maxW).slice(0, 2)
  g.font = `400 ${Math.round(sPx)}px "${font}"`
  const sLines = sub ? wrap(g, sub, maxW).slice(0, 2) : []
  const block = tLines.length * tPx * lh + (sLines.length ? sPx * 0.6 + sLines.length * sPx * lh : 0)
  // centred cards are centred on textTop; above a cover the block ends at textTop
  let y = textMid ? textTop - block / 2 : Math.max(u * 0.05, textTop - block)
  if (wave === 'circle') y = Math.max(u * 0.05, textTop - block / 2)
  g.textAlign = 'center'; g.textBaseline = 'top'
  g.shadowColor = cover ? 'rgba(0,0,0,0.5)' : 'transparent'; g.shadowBlur = u * 0.01
  g.fillStyle = titleColor
  g.font = `700 ${Math.round(tPx)}px "${font}"`
  for (const l of tLines) { g.fillText(l, W / 2, y); y += tPx * lh }
  if (sLines.length) {
    y += sPx * 0.6
    g.fillStyle = cover ? subColor : theme.accent
    g.font = `400 ${Math.round(sPx)}px "${font}"`
    for (const l of sLines) { g.fillText(l, W / 2, y); y += sPx * lh }
  }
  return blobOf(c)
}

export async function bitmapOf(b: Blob | null) {
  if (!b) return null
  try { return await createImageBitmap(b) } catch { return null }
}

/**
 * Splits audio into chapter scenes: timed to the sound, with the speech of each as its text. With
 * the user's own pictures, each chapter gets the one that matches what is said (or the next in
 * order); chapters left over get a title card, or the pictures again with `leftover: 'repeat'`.
 */
export async function audioToScenes(p: {
  duration: number; gaps: Gap[]; cues: Cue[]; target: number; title: string; look: AudioLook
  pics: Pic[]; leftover: Leftover; cover: Blob | null; theme: CardTheme; wave: WaveStyle | null; W: number; H: number; progress: (p: number) => void
}): Promise<{ scenes: Scene[]; matched: number; byAI: boolean; unused: number }> {
  const cuts = chapterCuts(p.duration, p.gaps, p.cues, p.target)
  const bounds = [0, ...cuts, p.duration]
  const look: AudioLook = p.look === 'photos' && !p.pics.length ? 'card' : p.look === 'cover' && !p.cover ? 'card' : p.look
  const cover = look === 'cover' ? await bitmapOf(p.cover) : null
  const chapters = bounds.slice(0, -1).map((start, i) => {
    const end = bounds[i + 1]
    const cues = p.cues.filter((c) => { const m = (c.start + c.end) / 2; return m >= start && (m < end || i === bounds.length - 2) })
    return { start, end, cues, text: cues.map((c) => c.text.trim()).join(' ') }
  })
  const choice = look === 'photos' ? await planPictures(chapters.map((c) => c.text), p.pics, p.leftover) : null
  const scenes: Scene[] = []
  for (let i = 0; i < chapters.length; i++) {
    p.progress(i / chapters.length)
    const { start, end, cues, text } = chapters[i]
    const sub = i === 0 && chapters.length > 1 ? '' : headingOf(text)
    const pic = choice?.plan[i] != null ? p.pics[choice.plan[i]!] : null
    const part: AudioPart = { start, end, cues, heard: text, look: pic ? 'photos' : look === 'photos' ? 'card' : look, pic: pic?.id, title: p.title, sub }
    const image = pic ? pic.image : await drawAudioCard({ title: p.title, sub, theme: p.theme, cover, wave: p.wave, W: p.W, H: p.H })
    scenes.push({ id: uid(), image, media: pic?.media, name: sub || `${p.title} ${i + 1}`, text, duration: end - start, audio: part })
  }
  cover?.close()
  const shown = new Set(choice?.plan.filter((x) => x != null))
  return { scenes, matched: choice?.matched ?? 0, byAI: choice?.byAI ?? false, unused: p.pics.length - shown.size }
}
