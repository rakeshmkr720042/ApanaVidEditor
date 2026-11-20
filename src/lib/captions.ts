import type { TextLayer, TextStyle, WordFx } from '../types'
import { wordTimes } from '../engine/text'
import { uid } from './format'
import { PICTO, EMOJI_RUN, emojiFor } from './emoji'

export { emojiFor }

/** Ready-made trending caption looks: font, colours and the word-by-word style in one tap. */
export const CAPTION_LOOKS: { name: string; style: Partial<TextStyle>; words: WordFx | null; size?: number }[] = [
  {
    name: 'Bold yellow', words: { style: 'color', color: '#ffe600', caps: true },
    style: { font: 'Anton', color: '#ffffff', stroke: '#000000', strokeWidth: 0.9, shadow: true, background: null, bold: false, glow: null, fill: null },
  },
  {
    name: 'Pop', words: { style: 'pop', color: '#39ff14', caps: true },
    style: { font: 'Bangers', color: '#ffffff', stroke: '#000000', strokeWidth: 1, shadow: true, background: null, bold: false, letterSpacing: 0.03, glow: null, fill: null },
  },
  {
    name: 'Box', words: { style: 'box', color: '#8b5cf6' },
    style: { font: 'Montserrat', color: '#ffffff', stroke: null, shadow: true, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'Karaoke', words: { style: 'karaoke', color: '#00e5ff' },
    style: { font: 'Poppins', color: '#ffffff', stroke: '#000000', strokeWidth: 0.6, shadow: false, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'One word', words: { style: 'one', color: '#ffffff', caps: true }, size: 0.09,
    style: { font: 'Anton', color: '#ffffff', stroke: '#000000', strokeWidth: 0.9, shadow: true, background: null, bold: false, glow: null, fill: null },
  },
  {
    name: 'Word by word', words: { style: 'reveal', color: '#ffd166' },
    style: { font: 'Poppins', color: '#ffffff', stroke: null, shadow: true, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'Neon', words: { style: 'color', color: '#ff3df5' },
    style: { font: 'Righteous', color: '#ffffff', stroke: null, shadow: false, background: null, bold: false, glow: '#7df9ff', fill: null },
  },
  {
    name: 'Podcast', words: { style: 'box', color: '#ef4444' },
    style: { font: 'Montserrat', color: '#ffffff', stroke: null, shadow: false, background: '#000000aa', bold: true, glow: null, fill: null },
  },
  {
    name: 'Hindi', words: { style: 'color', color: '#ffd166' },
    style: { font: 'Noto Sans Devanagari', color: '#ffffff', stroke: '#000000', strokeWidth: 0.7, shadow: true, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'Emoji karaoke', words: { style: 'karaoke', color: '#ffe600', emoji: true },
    style: { font: 'Poppins', color: '#ffffff', stroke: '#000000', strokeWidth: 0.7, shadow: true, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'Bounce', words: { style: 'bounce', color: '#ff9f1c', caps: true, emoji: true },
    style: { font: 'Bangers', color: '#ffffff', stroke: '#000000', strokeWidth: 1, shadow: true, background: null, bold: false, letterSpacing: 0.03, glow: null, fill: null },
  },
  {
    name: 'Glow karaoke', words: { style: 'glow', color: '#00f0ff' },
    style: { font: 'Righteous', color: '#d0d6e0', stroke: null, shadow: false, background: null, bold: false, glow: null, fill: null },
  },
  {
    name: 'Underline', words: { style: 'underline', color: '#ff4d6d' },
    style: { font: 'Montserrat', color: '#ffffff', stroke: '#000000', strokeWidth: 0.5, shadow: true, background: null, bold: true, glow: null, fill: null },
  },
  {
    name: 'Clean', words: null,
    style: { font: 'Poppins', color: '#ffffff', stroke: null, shadow: false, background: 'rgba(0,0,0,0.55)', bold: true, glow: null, fill: null },
  },
]

/**
 * Cuts captions into short ones of at most `max` words (2–4 words a screen is the Reels/Shorts look). Each piece
 * gets its share of the time, and a piece also ends at a comma or full stop.
 */
export function splitShort(subs: TextLayer[], max: number): { remove: Set<string>; add: TextLayer[] } {
  const remove = new Set<string>()
  const add: TextLayer[] = []
  for (const s of subs) {
    const words = s.text.match(/\S+/g) ?? []
    if (words.length <= max) continue
    const times = [...wordTimes(s.text, s.start, s.end), s.end]
    const groups: number[][] = [[]]
    words.forEach((w, i) => {
      const g = groups[groups.length - 1]
      g.push(i)
      const left = words.length - i - 1
      if (left && (g.length >= max || /[,.!?।;:]$/.test(w))) groups.push([])
    })
    // a single word left over at the end joins the piece before it when there is room
    const last = groups[groups.length - 1]
    if (groups.length > 1 && last.length === 1 && groups[groups.length - 2].length < max + 1 && !/[,.!?।;:]$/.test(words[last[0] - 1])) {
      groups[groups.length - 2].push(...groups.pop()!)
    }
    remove.add(s.id)
    for (const g of groups.filter((x) => x.length)) {
      add.push({
        ...s, id: uid(), text: g.map((i) => words[i]).join(' '), start: times[g[0]], end: times[g[g.length - 1] + 1],
        style: { ...s.style }, box: { ...s.box }, frame: s.frame ? { ...s.frame, rect: { ...s.frame.rect } } : s.frame,
        words: s.words ? { ...s.words } : s.words, keys: undefined,
      })
    }
  }
  return { remove, add }
}

// ---------- emojis (the word list lives in ./emoji.ts, shared with the live word emojis in engine/text.ts)

/** The caption with a matching emoji at the end (unchanged when it has one already or nothing matches). */
export function withEmoji(text: string) {
  if (PICTO.test(text)) return text
  const e = emojiFor(text)
  return e ? `${text.trimEnd()} ${e}` : text
}

/** The caption with every emoji taken out. */
export const withoutEmoji = (text: string) => text.replace(EMOJI_RUN, '').replace(/ {2,}/g, ' ').trim()
