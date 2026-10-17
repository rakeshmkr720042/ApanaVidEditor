import type { Scene, TextCard } from '../model/scenes'
import { ensureFont } from '../engine/text'
import { uid } from './format'

/**
 * Script or report text → scenes. The text is split by simple rules (headings, blank lines, bullet
 * lists), no AI model needed. Each scene shows a clean text card and the voice reads the text.
 */

export interface ScriptPart {
  card: TextCard
  script: string // what the voice reads on this scene
}

type Item = { type: 'bullet' | 'para' | 'quote'; text: string }
interface Section { title: string; items: Item[] }

const BULLET = /^\s*(?:[-*+•·▪●◦➤►▶✓✔→]|\(?\d{1,2}[.)]|[a-zA-Z][)])\s+/
const SENTENCE_END = /[.!?।॥:;]["'”’)]*$/
const MAX_BULLETS = 5 // per card; longer lists continue on the next card
const MAX_PARA = 300 // characters of a paragraph on one card

const deva = (s: string) => /[ऀ-ॿ]/.test(s)

/** Removes Markdown marks a reader wouldn't see: **bold**, _italic_, `code`, [links](url). */
function plain(s: string) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_](\S.*?\S|\S)[*_](?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether the first line of a block is a heading for what follows it. */
function isHeading(block: string[], next: string): boolean {
  const s = block[0].trim()
  if (/^#{1,6}\s/.test(s)) return true
  if (s.length > 70 || SENTENCE_END.test(s) && !s.endsWith(':')) return false
  const words = s.split(/\s+/).length
  if (/^(chapter|section|part|step|topic|अध्याय|भाग|खंड|चरण)(?=[\s\d:.\-–]|$)/i.test(s) && words <= 8) return true
  if (/[^:]:$/.test(s) && words <= 8) return true // "Benefits:" introducing what follows
  if (/^[A-Z0-9][A-Z0-9 &'’,\-–]{2,}$/.test(s) && /[A-Z]{3}/.test(s)) return true // ALL CAPS
  if (block.length > 1) {
    // "Title" then its text on the next line; a hard-wrapped paragraph continues in lower case instead
    const after = block[1].trim()
    return !BULLET.test(s) && s.length <= 50 && words <= 8 && (BULLET.test(after) || (/^[A-Z\dऀ-ॿ"“]/.test(after) && s.length < after.length * 0.7))
  }
  if (!next) return false // a short last line is just text
  if (BULLET.test(s)) return /^\(?\d/.test(s) && !BULLET.test(next) && s.length <= 60 // "1. Introduction" on its own
  return words <= 10
}

const stripHeading = (s: string) => plain(s.replace(/^#{1,6}\s+/, '').replace(BULLET, (m) => (/\d/.test(m) ? m.trim() + ' ' : '')).replace(/:$/, ''))

/** Splits text into sections: a heading with the paragraphs, bullets and quotes under it. */
export function sectionsOf(raw: string): Section[] {
  const blocks = raw.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split(/\n\s*\n/)
    .map((b) => b.split('\n').filter((l) => l.trim() && !/^\s*([-*_=])\1{2,}\s*$/.test(l))) // drop --- rules
    .filter((b) => b.length)
  const sections: Section[] = []
  let cur: Section = { title: '', items: [] }
  const flush = () => { if (cur.title || cur.items.length) sections.push(cur) }
  blocks.forEach((block, bi) => {
    const next = blocks[bi + 1]?.[0] ?? ''
    let para: string[] = []
    const endPara = () => { if (para.length) cur.items.push({ type: 'para', text: plain(para.join(' ')) }); para = [] }
    block.forEach((line, li) => {
      const first = li === 0
      if (first && isHeading(block, next)) {
        flush()
        cur = { title: stripHeading(line), items: [] }
        return
      }
      if (/^\s*>/.test(line)) { endPara(); cur.items.push({ type: 'quote', text: plain(line.replace(/^\s*>\s?/, '')) }); return }
      if (BULLET.test(line)) { endPara(); cur.items.push({ type: 'bullet', text: plain(line.replace(BULLET, '')) }); return }
      // an indented or wrapped line continues the bullet above it
      const last = cur.items[cur.items.length - 1]
      if (!para.length && last?.type === 'bullet' && !first) { last.text = plain(`${last.text} ${line}`); return }
      para.push(line)
    })
    endPara()
  })
  flush()
  // merge quotes that came from consecutive "> " lines
  for (const s of sections) {
    s.items = s.items.reduce<Item[]>((out, it) => {
      const prev = out[out.length - 1]
      if (it.type === 'quote' && prev?.type === 'quote') prev.text += ' ' + it.text
      else out.push({ ...it })
      return out
    }, []).filter((it) => it.text)
  }
  return sections
}

/** Cuts a long paragraph at sentence ends into pieces that fit on one card. */
export function sentenceChunks(text: string, max = MAX_PARA): string[] {
  const sentences = text.match(/[^.!?।॥]+(?:[.!?।॥]+["'”’)]*|$)\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (cur && (cur + ' ' + s).length > max) { out.push(cur); cur = s } else cur = cur ? `${cur} ${s}` : s
  }
  if (cur) out.push(cur)
  // don't leave a tiny last piece on its own
  if (out.length > 1 && out[out.length - 1].length < max / 4) out.splice(-2, 2, `${out[out.length - 2]} ${out[out.length - 1]}`)
  return out
}

const say = (s: string) => (/[.!?।॥:]$/.test(s) ? s : `${s}${deva(s) ? '।' : '.'}`)

/** Rule-based split of a script or report into scenes: one text card and its narration each. */
export function parseScript(raw: string): ScriptPart[] {
  const parts: ScriptPart[] = []
  const sections = sectionsOf(raw)
  sections.forEach((sec) => {
    const title = sec.title
    if (!sec.items.length) {
      // a heading with nothing under it: the opening title, or a chapter card
      parts.push({ card: { kind: 'title', title, lines: [] }, script: say(title) })
      return
    }
    let titleSaid = false
    const intro = () => { if (titleSaid || !title) return ''; titleSaid = true; return say(title) + ' ' }
    for (let i = 0; i < sec.items.length;) {
      const it = sec.items[i]
      if (it.type === 'bullet') {
        const list: string[] = []
        while (i < sec.items.length && sec.items[i].type === 'bullet') list.push(sec.items[i++].text)
        // split long lists evenly: 7 bullets → 4 + 3, not 5 + 2
        const cards = Math.ceil(list.length / MAX_BULLETS)
        const per = Math.ceil(list.length / cards)
        for (let k = 0; k < list.length; k += per) {
          const lines = list.slice(k, k + per)
          parts.push({ card: { kind: 'bullets', title, lines }, script: (intro() + lines.map(say).join(' ')).trim() })
        }
        continue
      }
      i++
      if (it.type === 'quote') {
        parts.push({ card: { kind: 'quote', title: '', lines: [it.text] }, script: (intro() + it.text).trim() })
        continue
      }
      for (const chunk of sentenceChunks(it.text)) {
        // a short line with no heading reads best as a big statement
        const kind = !title && chunk.length <= 140 ? 'quote' : 'text'
        parts.push({ card: { kind, title: kind === 'quote' ? '' : title, lines: [chunk] }, script: (intro() + chunk).trim() })
      }
    }
  })
  return parts
}

// ---------------------------------------------------------------- drawing

export interface CardTheme {
  id: string
  label: string
  bg: [string, string] // gradient, top-left → bottom-right
  title: string
  text: string
  accent: string
}

export const CARD_THEMES: CardTheme[] = [
  { id: 'clean', label: 'Clean', bg: ['#ffffff', '#eef2f9'], title: '#111827', text: '#374151', accent: '#4f7cff' },
  { id: 'dark', label: 'Dark', bg: ['#0f172a', '#1e293b'], title: '#ffffff', text: '#cbd5e1', accent: '#fbbf24' },
  { id: 'paper', label: 'Paper', bg: ['#fbf6ec', '#f1e4cc'], title: '#3b2f22', text: '#5b4a38', accent: '#d9622b' },
  { id: 'vivid', label: 'Vivid', bg: ['#4338ca', '#be185d'], title: '#ffffff', text: '#f5f3ff', accent: '#fde68a' },
]

export const themeOf = (id: string) => CARD_THEMES.find((x) => x.id === id) ?? CARD_THEMES[0]

/** One piece of text in a card's layout, sized relative to the body text. */
interface Run { text: string; size: number; weight: number; color: string; bullet?: boolean; gap: number; rule?: boolean }

function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && g.measureText(next).width > width) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

/** Draws a text card at W×H (the project's frame size) and returns it as a PNG. */
export async function drawTextCard(card: TextCard, theme: CardTheme, W: number, H: number): Promise<Blob> {
  const all = card.title + card.lines.join(' ')
  const font = deva(all) ? 'Noto Sans Devanagari' : 'Poppins'
  await ensureFont(font)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const u = Math.min(W, H)

  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, theme.bg[0]); grad.addColorStop(1, theme.bg[1])
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  // a soft accent shape in the corner, so cards don't look bare
  g.globalAlpha = 0.09; g.fillStyle = theme.accent
  g.beginPath(); g.arc(W, 0, u * 0.42, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 0.06
  g.beginPath(); g.arc(0, H, u * 0.3, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 1

  const center = card.kind === 'title' || card.kind === 'quote'
  const runs: Run[] = []
  if (card.kind === 'quote') {
    runs.push({ text: '“', size: 2.6, weight: 700, color: theme.accent, gap: 0 })
    runs.push({ text: card.lines[0] ?? '', size: 1.35, weight: 700, color: theme.title, gap: -0.6 })
  } else if (card.kind === 'title') {
    runs.push({ text: card.title, size: 1.9, weight: 700, color: theme.title, gap: 0 })
    runs.push({ text: '', size: 1, weight: 400, color: theme.accent, gap: 0.5, rule: true })
    for (const l of card.lines) runs.push({ text: l, size: 0.95, weight: 400, color: theme.text, gap: 0.5 })
  } else {
    if (card.title) {
      runs.push({ text: card.title, size: 1.35, weight: 700, color: theme.title, gap: 0 })
      runs.push({ text: '', size: 1, weight: 400, color: theme.accent, gap: 0.35, rule: true })
    }
    card.lines.forEach((l, i) => runs.push({
      text: l, size: 1, weight: 400, color: theme.text, bullet: card.kind === 'bullets', gap: i || card.title ? (card.kind === 'bullets' ? 0.55 : 0.6) : 0,
    }))
  }

  const padX = W * (W > H ? 0.08 : 0.09)
  const padY = H * (W > H ? 0.1 : 0.12)
  const boxW = W - padX * 2, boxH = H - padY * 2
  const lh = deva(all) ? 1.5 : 1.32
  // shrink everything together until it fits the frame
  let base = u * (card.kind === 'quote' ? 0.07 : 0.064)
  let laid: { run: Run; lines: string[]; px: number }[] = []
  let total = 0
  for (let tries = 0; tries < 40; tries++) {
    laid = []; total = 0
    for (const r of runs) {
      const px = base * r.size
      g.font = `${r.weight} ${Math.round(px)}px "${font}"`
      const indent = r.bullet ? px * 1.1 : 0
      const lines = r.rule ? [] : wrap(g, r.text, boxW - indent)
      laid.push({ run: r, lines, px })
      total += r.gap * base + (r.rule ? base * 0.5 : lines.length * px * lh)
    }
    if (total <= boxH || base < u * 0.022) break
    base *= 0.93
  }

  let y = padY + Math.max(0, (boxH - total) / 2)
  g.textBaseline = 'top'
  for (const { run, lines, px } of laid) {
    y += run.gap * base
    if (run.rule) {
      const rw = u * 0.12, rh = Math.max(4, u * 0.008)
      g.fillStyle = run.color
      g.fillRect(center ? (W - rw) / 2 : padX, y + base * 0.2, rw, rh)
      y += base * 0.5
      continue
    }
    g.font = `${run.weight} ${Math.round(px)}px "${font}"`
    g.fillStyle = run.color
    g.textAlign = center ? 'center' : 'left'
    const x = center ? W / 2 : padX + (run.bullet ? px * 1.1 : 0)
    if (run.bullet) {
      g.fillStyle = theme.accent
      g.beginPath(); g.arc(padX + px * 0.32, y + px * lh * 0.5, px * 0.2, 0, Math.PI * 2); g.fill()
      g.fillStyle = run.color
    }
    // the big opening quote mark sits tighter than a text line
    for (const line of lines) { g.fillText(line, x, y + (lh - 1) * px * 0.4); y += px * lh }
  }
  g.textAlign = 'left'

  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'))
}

const nameOf = (card: TextCard) => {
  const s = card.title || card.lines[0] || ''
  return s.length > 40 ? s.slice(0, 40).replace(/\s+\S*$/, '') + '…' : s
}

/** Pasted (or .txt / .md) text → scenes with a drawn card each. */
export async function scriptToScenes(raw: string, theme: CardTheme, W: number, H: number, progress: (p: number) => void): Promise<Scene[]> {
  const parts = parseScript(raw)
  if (!parts.length) throw new Error('No text to turn into scenes')
  const scenes: Scene[] = []
  for (let i = 0; i < parts.length; i++) {
    progress(i / parts.length)
    const { card, script } = parts[i]
    scenes.push({ id: uid(), image: await drawTextCard(card, theme, W, H), name: nameOf(card), text: script, duration: null, card })
  }
  return scenes
}
