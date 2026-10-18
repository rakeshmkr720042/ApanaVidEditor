import type { Scene } from '../model/scenes'
import { ensureFont } from '../engine/text'
import { renderCanvasVideo } from './canvasVideo'
import { wrap } from './scriptScenes'
import { uid } from './format'

/**
 * Quiz or flashcards → video. Questions are written or pasted in a simple format and split by
 * rules (no AI model). Each question is one scene, rendered as a short clip: the question and its
 * options come in, a countdown ring fills up, then the right answer lights up (or the card flips
 * over to its answer). An optional title card opens the video and an answer recap closes it.
 */

export interface QuizItem {
  id: string
  q: string // the question, or the front of a flashcard
  options: string[] // multiple choice options; empty for an open question or a flashcard
  correct: number // index of the right option, -1 if none is marked
  answer: string // a written answer (open question, back of a flashcard)
  explain: string // optional explanation shown with the answer
}

export interface QuizDeck {
  title: string
  items: QuizItem[]
}

export type QuizMode = 'quiz' | 'cards'

export interface QuizSettings {
  mode: QuizMode
  theme: string
  timer: number // seconds of countdown before the answer
  beep: boolean // ticking countdown and a chime on the answer
  explain: boolean // show explanations with the answer
  recap: boolean // end with a card listing every answer
}

export type QuizPart = { kind: 'intro' } | { kind: 'item'; index: number } | { kind: 'recap' }

/** What a quiz scene shows. Scene.text is read first; `say2` is read when the answer appears. */
export interface QuizScene {
  deck: QuizDeck
  settings: QuizSettings
  part: QuizPart
  say2: string
}

export const defaultQuizSettings = (): QuizSettings => ({ mode: 'quiz', theme: 'night', timer: 5, beep: true, explain: true, recap: true })

export const item = (q = '', options: string[] = [], correct = -1, answer = '', explain = ''): QuizItem => ({ id: uid(), q, options, correct, answer, explain })

const deva = (s: string) => /[ऀ-ॿ]/.test(s)
const deckText = (d: QuizDeck) => [d.title, ...d.items.flatMap((i) => [i.q, ...i.options, i.answer, i.explain])].join(' ')
export const deckLang = (d: QuizDeck) => (deva(deckText(d)) ? 'hi' : 'en')

/** What the back of a card (or the revealed answer) says. */
export const answerOf = (it: QuizItem) => it.answer.trim() || (it.correct >= 0 ? it.options[it.correct] ?? '' : '')

// ---------------------------------------------------------------- text in and out

const LETTERS = 'ABCDEFGH'
const SAY_LETTERS_HI = ['ए', 'बी', 'सी', 'डी', 'ई', 'एफ़', 'जी', 'एच']
const MAX_OPTIONS = 6

const Q_START = /^(?:(?:q|que|ques|question|प्रश्न|प्र|सवाल)\s*\.?\s*(?:\d{1,3}\s*[:.)\-–]?|[:.)\-–])|\d{1,3}\s*[.)]|front\s*[:\-–])\s*/i
const OPTION = /^(?:\(\s*([a-h]|[क-ज])\s*\)|([a-h]|[क-ज])\s*[).])\s*/i
const BULLET_OPTION = /^(?:[-•●◦▪]|\[[ xX✓✔]?\])\s+/
const ANSWER = /^(?:a\s*:|(?:ans|answer|correct(?:\s+answer)?|right\s+answer|उत्तर|उ|जवाब|सही\s+(?:उत्तर|जवाब)|back)\s*[:\-–])\s*/i
const EXPLAIN = /^(?:explanation|explain|why|reason|note|hint|व्याख्या|कारण|स्पष्टीकरण)\s*[:\-–]\s*/i
const TITLE = /^(?:#{1,3}\s+|(?:title|quiz|topic|विषय|शीर्षक)\s*[:\-–]\s*)/i
const MARK_END = /\s*(?:\*+|✓|✔|✅|\[[xX✓✔]\]|\((?:correct|right|ans|answer|सही)\))\s*$/i
const ends = (s: string) => /[?？]\s*$/.test(s)

function plain(s: string) {
  return s.replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim()
}

/** An option line's text and whether it is marked as the right one. */
function optionText(raw: string): { text: string; right: boolean } {
  let s = raw.trim()
  let right = false
  const bold = /^\*\*(.+)\*\*$/.exec(s) ?? /^__(.+)__$/.exec(s)
  if (bold) { s = bold[1]; right = true }
  if (MARK_END.test(s)) { s = s.replace(MARK_END, ''); right = true }
  if (/^\*\s*/.test(s)) { s = s.replace(/^\*\s*/, ''); right = true }
  return { text: plain(s), right }
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Which option an "Answer:" line points to: by letter (B, (b), ख) or by its text. */
function matchAnswer(value: string, options: string[]): number {
  if (!options.length) return -1
  const letter = /^\(?\s*([a-h]|[क-ज])\s*\)?(?=$|[\s).:\-–,])/i.exec(value)
  if (letter) {
    const c = letter[1]
    const i = /[क-ज]/.test(c) ? c.charCodeAt(0) - 0x915 : LETTERS.indexOf(c.toUpperCase())
    if (i >= 0 && i < options.length) return i
  }
  const v = norm(value.replace(/^\(?\s*([a-h]|[क-ज])\s*[).:\-–]\s*/i, ''))
  if (!v) return -1
  const exact = options.findIndex((o) => norm(o) === v)
  if (exact >= 0) return exact
  return options.findIndex((o) => { const n = norm(o); return !!n && (n.includes(v) || v.includes(n)) })
}

/**
 * Rule-based split of pasted text into questions. Understands "Q: … / A: …" pairs, multiple choice
 * with A) B) C) options (the right one marked with *, ✓ or an "Answer: B" line), "Explanation:"
 * lines, and one-line flashcards like "front | back". A first line on its own is the title.
 */
export function parseQuiz(raw: string): QuizDeck {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')
  const items: QuizItem[] = []
  let title = ''
  let cur: (QuizItem & { last: 'q' | 'option' | 'answer' | 'explain'; answerRaw: string }) | null = null
  let blank = false
  const done = () => {
    if (!cur) return
    const it = cur
    if (it.answerRaw) {
      const idx = matchAnswer(it.answerRaw, it.options)
      if (idx >= 0) it.correct = idx
      else it.answer = it.answerRaw
    }
    if (it.options.length === 1 && !it.answer) { it.answer = it.options[0]; it.options = []; it.correct = -1 }
    if (it.q.trim()) items.push({ id: it.id, q: it.q.trim(), options: it.options.slice(0, MAX_OPTIONS), correct: it.correct < MAX_OPTIONS ? it.correct : -1, answer: it.answer.trim(), explain: it.explain.trim() })
    cur = null
  }
  const start = (q: string) => { done(); cur = { ...item(plain(q)), last: 'q', answerRaw: '' } }
  const nextLine = (i: number) => { for (let k = i + 1; k < lines.length; k++) if (lines[k].trim()) return lines[k].trim(); return '' }

  lines.forEach((rawLine, li) => {
    const line = rawLine.trim()
    if (!line || /^([-*_=])\1{2,}$/.test(line)) { blank = true; return }
    const wasBlank = blank
    blank = false
    const c = cur as typeof cur // narrowed copy for the checks below

    if (!items.length && !c && !title) {
      if (TITLE.test(line)) { title = plain(line.replace(TITLE, '')); return }
      // a first line on its own, followed by a question, names the quiz
      if (!Q_START.test(line) && !ends(line) && !/\t| \| |::/.test(line) && Q_START.test(nextLine(li))) { title = plain(line); return }
    }
    if (Q_START.test(line)) { start(line.replace(Q_START, '')); return }
    if (c && EXPLAIN.test(line)) { c.explain = plain(line.replace(EXPLAIN, '')); c.last = 'explain'; return }
    if (c && ANSWER.test(line)) { c.answerRaw = plain(line.replace(ANSWER, '')); c.last = 'answer'; return }
    if (c && (OPTION.test(line) || (BULLET_OPTION.test(line) && c.last !== 'answer'))) {
      const checked = /^\[[xX✓✔]\]/.test(line)
      const { text, right } = optionText(line.replace(OPTION.test(line) ? OPTION : BULLET_OPTION, ''))
      if (text) {
        if (right || checked) c.correct = c.options.length
        c.options.push(text)
        c.last = 'option'
      }
      return
    }
    // one-line flashcards: "front | back", "front :: back" or two spreadsheet columns
    const pair = /^(.+?)\s*(?:\t+|\s\|\s|::)\s*(.+)$/.exec(line)
    if (pair && (!c || c.last !== 'q' || c.options.length || c.answerRaw)) { start(pair[1]); cur!.answerRaw = plain(pair[2]); cur!.last = 'answer'; return }

    if (!c) { start(line); return }
    const complete = c.options.length > 0 || !!c.answerRaw
    if (ends(line) && (complete || wasBlank)) { start(line); return }
    if (c.last === 'explain') { c.explain = plain(`${c.explain} ${line}`); return }
    if (c.last === 'answer') {
      if (wasBlank) start(line)
      else c.answerRaw = plain(`${c.answerRaw} ${line}`)
      return
    }
    if (c.last === 'option') {
      if (wasBlank) start(line)
      else c.options[c.options.length - 1] = plain(`${c.options[c.options.length - 1]} ${line}`)
      return
    }
    // after the question: a line that follows a "…?" (or a blank line) is its answer
    if (ends(c.q) || wasBlank) { c.answerRaw = plain(line); c.last = 'answer'; return }
    c.q = plain(`${c.q} ${line}`)
  })
  done()
  return { title, items }
}

/** Deck → text in the same format, for switching from the list editor back to text. */
export function quizToText(d: QuizDeck): string {
  const out: string[] = []
  if (d.title.trim()) out.push(`# ${d.title.trim()}`, '')
  for (const it of d.items) {
    out.push(`Q: ${it.q}`)
    it.options.forEach((o, i) => out.push(`${LETTERS[i]}) ${o}${i === it.correct ? ' *' : ''}`))
    if (it.answer.trim()) out.push(`A: ${it.answer.trim()}`)
    if (it.explain.trim()) out.push(`Explanation: ${it.explain.trim()}`)
    out.push('')
  }
  return out.join('\n').trim()
}

/** Cleans a deck from the list editor: no empty questions or options. */
export function tidyDeck(d: QuizDeck): QuizDeck {
  return {
    title: d.title.trim(),
    items: d.items.filter((i) => i.q.trim()).map((i) => {
      const keep = i.options.map((o, k) => ({ o: o.trim(), k })).filter((x) => x.o)
      return { ...i, q: i.q.trim(), options: keep.map((x) => x.o), correct: keep.findIndex((x) => x.k === i.correct), answer: i.answer.trim(), explain: i.explain.trim() }
    }),
  }
}

/** Questions that can't show a right answer yet. */
export const missingAnswer = (it: QuizItem) => !answerOf(it)

// ---------------------------------------------------------------- voice

const say = (s: string, hi: boolean) => (!s ? '' : /[.!?।॥:]$/.test(s) ? s : `${s}${hi ? '।' : '.'}`)

/** What the voice reads when a scene starts, and when its answer appears. */
export function voiceOf(d: QuizDeck, part: QuizPart, st: QuizSettings): [string, string] {
  const hi = deckLang(d) === 'hi'
  const n = d.items.length
  if (part.kind === 'intro') {
    const count = st.mode === 'cards' ? (hi ? `${n} कार्ड।` : `${n} flashcards.`) : hi ? `${n} सवाल। तैयार हो जाइए!` : `${n} questions. Get ready!`
    return [`${say(d.title, hi)} ${count}`.trim(), '']
  }
  if (part.kind === 'recap') {
    if (st.mode === 'cards') return [hi ? 'एक बार सब दोहरा लेते हैं।' : "Let's review them all.", '']
    return [hi ? 'ये रहे सही उत्तर। आपके कितने सही हुए?' : 'Here are the answers. How many did you get right?', '']
  }
  const it = d.items[part.index]
  const letter = (i: number) => (hi ? SAY_LETTERS_HI[i] : LETTERS[i])
  const why = st.explain && it.explain ? ' ' + say(it.explain, hi) : ''
  if (st.mode === 'cards') return [say(it.q, hi), (say(answerOf(it), hi) + why).trim()]
  const opts = it.options.map((o, i) => `${letter(i)}, ${say(o, hi)}`).join(' ')
  const first = `${say(it.q, hi)} ${opts}`.trim()
  let second = ''
  if (it.correct >= 0) second = hi ? `सही उत्तर है ${letter(it.correct)}, ${say(it.options[it.correct], true)}` : `The answer is ${letter(it.correct)}, ${say(it.options[it.correct], false)}`
  else if (it.answer) second = hi ? `उत्तर है: ${say(it.answer, true)}` : `The answer is: ${say(it.answer, false)}`
  return [first, (second + why).trim()]
}

// ---------------------------------------------------------------- timing

export interface QuizPlan {
  appear: number // everything has come in
  timerStart: number
  timerEnd: number // the answer appears
  end: number // scene length
  voiceAt: number // when the first voice starts
  voice2At: number // when the answer is read
  moving: [number, number][] // stretches with movement, for the video encoder
}

const VOICE_AT = 0.3
const FLIP = 0.7
const words = (s: string) => s.split(/\s+/).filter(Boolean).length

/** When things happen in a quiz scene, given how long its two voice lines last (0 = no voice). */
export function quizPlan(qs: QuizScene, say1: number, say2: number): QuizPlan {
  const { deck, settings: st, part } = qs
  if (part.kind !== 'item') {
    const rows = part.kind === 'recap' ? Math.min(deck.items.length, 12) : 0
    const appear = part.kind === 'recap' ? 0.6 + 0.12 * rows : 1
    const read = part.kind === 'recap' ? 2.5 + rows * 0.45 : 2.2
    const end = Math.max(appear + read, say1 ? VOICE_AT + say1 + 0.8 : 0)
    return { appear, timerStart: end, timerEnd: end, end, voiceAt: VOICE_AT, voice2At: end, moving: [[0, appear]] }
  }
  const it = deck.items[part.index]
  const cards = st.mode === 'cards'
  const appear = cards ? 0.7 : 0.55 + 0.16 * it.options.length + 0.3
  const timerStart = say1 ? Math.max(appear, VOICE_AT + say1 + 0.3) : appear + 0.4
  const timerEnd = timerStart + st.timer
  const reveal = cards ? FLIP : 0.6
  const voice2At = timerEnd + reveal + 0.1
  const shown = (cards ? words(answerOf(it)) : 0) + (st.explain ? words(it.explain) : 0)
  const hold = Math.max(reveal + 1.8 + shown / 3.2, say2 ? voice2At - timerEnd + say2 + 0.7 : 0)
  return { appear, timerStart, timerEnd, end: timerEnd + hold, voiceAt: VOICE_AT, voice2At, moving: [[0, appear], [timerStart, timerEnd + reveal + 0.4]] }
}

// ---------------------------------------------------------------- looks

export interface QuizTheme {
  id: string
  label: string
  bg: [string, string]
  text: string
  sub: string
  panel: string // question box and card front
  option: string
  optionText: string
  badge: string
  badgeText: string
  accent: string // timer ring, highlights
  accentText: string // text on the accent colour
  good: string // right answer
  late: string // last seconds of the timer
  back: [string, string] // back of a flashcard
  backText: string
}

export const QUIZ_THEMES: QuizTheme[] = [
  {
    id: 'night', label: 'Night', bg: ['#0b1026', '#25357a'], text: '#ffffff', sub: '#c7d0f5', panel: 'rgba(255,255,255,0.08)',
    option: '#1b2860', optionText: '#eef1ff', badge: '#fbbf24', badgeText: '#1f1300', accent: '#fbbf24', accentText: '#1f1300', good: '#22c55e', late: '#f43f5e',
    back: ['#fbbf24', '#f97316'], backText: '#1f1300',
  },
  {
    id: 'classroom', label: 'Classroom', bg: ['#fdfaf3', '#efe4cc'], text: '#1f2937', sub: '#5b5446', panel: '#ffffff',
    option: '#ffffff', optionText: '#1f2937', badge: '#2563eb', badgeText: '#ffffff', accent: '#2563eb', accentText: '#ffffff', good: '#16a34a', late: '#dc2626',
    back: ['#2563eb', '#1e40af'], backText: '#ffffff',
  },
  {
    id: 'pop', label: 'Pop', bg: ['#6d28d9', '#db2777'], text: '#ffffff', sub: '#fde7f3', panel: 'rgba(255,255,255,0.14)',
    option: '#ffffff', optionText: '#3b0764', badge: '#7c3aed', badgeText: '#ffffff', accent: '#fde047', accentText: '#3b0764', good: '#22c55e', late: '#fde047',
    back: ['#fde047', '#facc15'], backText: '#3b0764',
  },
]

export const quizThemeOf = (id: string) => QUIZ_THEMES.find((x) => x.id === id) ?? QUIZ_THEMES[0]

const LABELS = {
  en: { q: 'Question', card: 'Card', answer: 'Answer', answers: 'Answers', review: 'Review', score: 'How many did you get right?', ready: 'Get ready!', questions: 'questions', cards: 'flashcards', each: 'seconds each' },
  hi: { q: 'प्रश्न', card: 'कार्ड', answer: 'उत्तर', answers: 'सही उत्तर', review: 'दोहराएं', score: 'आपके कितने सही हुए?', ready: 'तैयार हो जाइए!', questions: 'सवाल', cards: 'कार्ड', each: 'सेकंड हर एक पर' },
}

// ---------------------------------------------------------------- layout

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const pop = (x: number) => { const c1 = 1.70158, c3 = c1 + 1, v = clamp01(x) - 1; return 1 + c3 * v * v * v + c1 * v * v }

type Block = { lines: string[]; px: number; lh: number }

interface Laid {
  W: number; H: number; u: number; font: string; portrait: boolean
  pad: number; top: number; ringR: number; ringX: number; ringY: number
  // question scenes
  q?: Block & { y: number; x: number; w: number; h: number }
  opts?: { x: number; y: number; w: number; h: number; lines: string[]; px: number; letter: string }[]
  open?: { x: number; y: number; w: number; h: number; lines: string[]; px: number }
  exp?: Block & { x: number; y: number; w: number; h: number }
  // flashcards
  card?: { x: number; y: number; w: number; h: number; front: Block; back: Block; exp: Block | null }
  // intro and recap
  title?: Block & { y: number }
  subtitle?: Block & { y: number }
  rows?: { x: number; y: number; w: number; px: number; num: string; text: string }[]
  footer?: Block & { y: number }
}

function measure(font: string) {
  const c = document.createElement('canvas')
  const g = c.getContext('2d')!
  return (text: string, px: number, width: number) => {
    g.font = `700 ${Math.round(px)}px "${font}"`
    return wrap(g, text, width)
  }
}

function fitText(g: CanvasRenderingContext2D, text: string, px: number, width: number, font: string): string {
  g.font = `700 ${Math.round(px)}px "${font}"`
  if (g.measureText(text).width <= width) return text
  let s = text
  while (s.length > 1 && g.measureText(s + '…').width > width) s = s.slice(0, -1)
  return s.trimEnd() + '…'
}

function layout(qs: QuizScene, W: number, H: number, font: string): Laid {
  const portrait = W < H
  const u = Math.min(W, H)
  const pad = W * (portrait ? 0.07 : 0.06)
  const top = H * (portrait ? 0.075 : 0.07)
  const ringR = u * (portrait ? 0.075 : 0.068)
  const L: Laid = { W, H, u, font, portrait, pad, top, ringR, ringX: W - pad - ringR, ringY: top + ringR }
  const wrapAt = measure(font)
  const lhOf = (hi: boolean) => (hi ? 1.45 : 1.25)
  const hi = font.includes('Devanagari')
  const lh = lhOf(hi)
  const areaTop = top + ringR * 2 + u * 0.05
  const areaBottom = H - H * (portrait ? 0.13 : 0.07) // tall videos keep clear of the app buttons at the bottom
  const avail = areaBottom - areaTop
  const boxW = W - pad * 2
  const { deck, settings: st, part } = qs
  const lab = LABELS[hi ? 'hi' : 'en']

  if (part.kind === 'intro') {
    let px = u * 0.11
    let tl: string[] = []
    for (let k = 0; k < 30; k++) { tl = wrapAt(deck.title, px, boxW); if (tl.length * px * lh <= H * 0.4 || px < u * 0.04) break; px *= 0.92 }
    const sub = `${deck.items.length} ${st.mode === 'cards' ? lab.cards : lab.questions}${st.mode === 'quiz' || st.timer ? ` · ${st.timer} ${lab.each}` : ''}`
    const spx = u * 0.042
    const sl = wrapAt(sub, spx, boxW)
    const total = tl.length * px * lh + u * 0.08 + sl.length * spx * lh + u * 0.14
    const y = (H - total) / 2
    L.title = { lines: tl, px, lh, y }
    L.subtitle = { lines: sl, px: spx, lh, y: y + tl.length * px * lh + u * 0.08 }
    return L
  }

  if (part.kind === 'recap') {
    const tpx = u * 0.07
    L.title = { lines: [st.mode === 'cards' ? lab.review : lab.answers], px: tpx, lh, y: top }
    const rowsTop = top + tpx * lh + u * 0.05
    const footer = st.mode === 'quiz' ? lab.score : ''
    const fpx = u * 0.045
    const fl = footer ? wrapAt(footer, fpx, boxW) : []
    const rowsBottom = areaBottom - (fl.length ? fl.length * fpx * lh + u * 0.05 : 0)
    const items = deck.items
    const cols = !portrait && items.length > 6 ? 2 : 1
    const perCol = Math.ceil(items.length / cols)
    const gapX = u * 0.05
    const colW = (boxW - gapX * (cols - 1)) / cols
    const px = Math.max(u * 0.022, Math.min(u * 0.08, (rowsBottom - rowsTop) / (perCol * 1.9)))
    const rowH = Math.min(px * 1.9, (rowsBottom - rowsTop) / perCol)
    const used = perCol * rowH
    const y0 = rowsTop + Math.max(0, (rowsBottom - rowsTop - used) / 2)
    L.rows = items.map((it, i) => {
      const col = Math.floor(i / perCol), row = i % perCol
      const ans = answerOf(it)
      const text = st.mode === 'cards' ? `${it.q} → ${ans || '—'}` : it.correct >= 0 ? `${LETTERS[it.correct]} · ${it.options[it.correct]}` : ans || '—'
      return { x: pad + col * (colW + gapX), y: y0 + row * rowH, w: colW, px, num: `${i + 1}`, text }
    })
    if (fl.length) L.footer = { lines: fl, px: fpx, lh, y: areaBottom - fl.length * fpx * lh }
    return L
  }

  const it = deck.items[part.index]
  const showExp = st.explain && !!it.explain

  if (st.mode === 'cards') {
    const cw = portrait ? W * 0.86 : W * 0.62
    const ch = Math.min(avail, portrait ? H * 0.52 : H * 0.66)
    const inner = cw * 0.84
    const room = ch * 0.68
    const fitBlock = (text: string, start: number, maxH: number): Block => {
      let px = start, lines: string[] = []
      for (let k = 0; k < 40; k++) { lines = wrapAt(text, px, inner); if (lines.length * px * lh <= maxH || px < u * 0.022) break; px *= 0.93 }
      return { lines, px, lh }
    }
    const front = fitBlock(it.q, u * 0.085, room)
    const ans = answerOf(it) || '—'
    const back = fitBlock(ans, u * 0.08, showExp ? room * 0.55 : room)
    const exp = showExp ? fitBlock(it.explain, u * 0.04, room * 0.4) : null
    L.card = { x: (W - cw) / 2, y: areaTop + (avail - ch) / 2, w: cw, h: ch, front, back, exp }
    return L
  }

  // a multiple choice or open question: shrink everything together until it fits
  let base = u * (portrait ? 0.078 : 0.058)
  const n = it.options.length
  for (let tries = 0; tries < 40; tries++) {
    const qpx = base * 1.15
    const ql = wrapAt(it.q, qpx, boxW - base)
    const qh = ql.length * qpx * lh + base * 1.1
    const opx = base * 0.86
    const vpad = opx * 0.55
    const badge = opx * 1.7
    let cols = !portrait && n >= 2 && n <= 4 ? 2 : 1
    const gap = opx * 0.55
    const tileFor = (c: number) => {
      const colW = (boxW - gap * (c - 1)) / c
      const textW = colW - badge - vpad * 3
      return { colW, laid: it.options.map((o) => wrapAt(o, opx, textW)) }
    }
    let t = tileFor(cols)
    if (cols === 2 && t.laid.some((l) => l.length > 2)) { cols = 1; t = tileFor(1) }
    const rows = Math.ceil(n / cols)
    const rowH: number[] = []
    for (let r = 0; r < rows; r++) {
      const ls = t.laid.slice(r * cols, r * cols + cols)
      rowH.push(Math.max(badge + vpad * 1.2, Math.max(...ls.map((l) => l.length)) * opx * lh + vpad * 2))
    }
    let optsH = rowH.reduce((a, b) => a + b, 0) + gap * Math.max(0, rows - 1)
    let openLines: string[] = []
    if (!n) {
      openLines = wrapAt(answerOf(it) || '?', opx, boxW - vpad * 4)
      optsH = Math.max(badge * 1.4, openLines.length * opx * lh + vpad * 2.4)
    }
    const epx = base * 0.66
    const el = showExp ? wrapAt(it.explain, epx, boxW - epx * 2.2) : []
    const eh = el.length ? el.length * epx * lh + epx * 1.6 : 0
    const sep = base * 0.75
    const total = qh + sep + optsH + (eh ? sep + eh : 0)
    if (total <= avail || base < u * 0.02) {
      let y = areaTop + Math.max(0, (avail - total) / 2)
      L.q = { lines: ql, px: qpx, lh, x: pad, y, w: boxW, h: qh }
      y += qh + sep
      if (n) {
        L.opts = it.options.map((_, i) => {
          const r = Math.floor(i / cols), c = i % cols
          const ry = y + rowH.slice(0, r).reduce((a, b) => a + b, 0) + gap * r
          return { x: pad + c * (t.colW + gap), y: ry, w: t.colW, h: rowH[r], lines: t.laid[i], px: opx, letter: LETTERS[i] }
        })
      } else {
        L.open = { x: pad, y, w: boxW, h: optsH, lines: openLines, px: opx }
      }
      y += optsH + sep
      if (eh) L.exp = { lines: el, px: epx, lh, x: pad, y, w: boxW, h: eh }
      return L
    }
    base *= 0.94
  }
  return L
}

// ---------------------------------------------------------------- drawing

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2))
}

function lerpColor(a: string, b: string, t: number) {
  const p = (c: string) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
  if (!a.startsWith('#') || !b.startsWith('#')) return t < 0.5 ? a : b
  const x = p(a), y = p(b)
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * clamp01(t))).join(',')})`
}

function background(g: CanvasRenderingContext2D, L: Laid, th: QuizTheme) {
  const { W, H, u } = L
  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, th.bg[0]); grad.addColorStop(1, th.bg[1])
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  g.globalAlpha = 0.08; g.fillStyle = th.accent
  g.beginPath(); g.arc(W * 0.95, H * 0.04, u * 0.42, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 0.06
  g.beginPath(); g.arc(W * 0.02, H * 0.98, u * 0.32, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 1
}

function lines(g: CanvasRenderingContext2D, b: Block, x: number, y: number, align: CanvasTextAlign, font: string) {
  g.font = `700 ${Math.round(b.px)}px "${font}"`
  g.textAlign = align
  g.textBaseline = 'middle'
  // Devanagari hangs from its top line, so it sits a little lower to look centred
  const nudge = b.px * (font.includes('Devanagari') ? 0.1 : 0.04)
  b.lines.forEach((l, i) => g.fillText(l, x, y + (i + 0.5) * b.px * b.lh + nudge))
}

/** Progress along the top ("Question 3/10") and the countdown ring. */
function header(g: CanvasRenderingContext2D, L: Laid, th: QuizTheme, qs: QuizScene, plan: QuizPlan, t: number) {
  const { u, pad, top, font, W } = L
  const part = qs.part
  if (part.kind !== 'item') return
  const n = qs.deck.items.length
  const lab = LABELS[font.includes('Devanagari') ? 'hi' : 'en']
  const a = ease(t / 0.35)
  g.globalAlpha = a
  // thin progress bar across the top
  const by = top * 0.42, bh = Math.max(4, u * 0.009)
  g.fillStyle = th.sub; g.globalAlpha = a * 0.25
  rr(g, pad, by, W - pad * 2, bh, bh); g.fill()
  g.globalAlpha = a
  g.fillStyle = th.accent
  rr(g, pad, by, ((W - pad * 2) * (part.index + 1)) / n, bh, bh); g.fill()
  // the "Question 3/10" pill
  const label = `${qs.settings.mode === 'cards' ? lab.card : lab.q} ${part.index + 1}/${n}`
  const px = u * 0.036
  g.font = `700 ${Math.round(px)}px "${font}"`
  const pw = g.measureText(label).width + px * 1.6
  const ph = px * 2
  const py = L.ringY - ph / 2
  g.fillStyle = th.accent
  rr(g, pad, py, pw, ph, ph / 2); g.fill()
  g.fillStyle = th.accentText
  g.textAlign = 'left'; g.textBaseline = 'middle'
  g.fillText(label, pad + px * 0.8, py + ph / 2 + px * 0.04)
  g.globalAlpha = 1

  // countdown ring: fills up as time runs out, the number counts down
  const T = qs.settings.timer
  const { ringX: cx, ringY: cy, ringR: r } = L
  const p = clamp01((t - plan.timerStart) / T)
  const done = t >= plan.timerEnd
  const remain = Math.max(0, plan.timerEnd - t)
  const late = !done && t >= plan.timerStart && remain <= Math.min(2, T / 2)
  const beat = late ? 1 + 0.06 * Math.max(0, Math.cos((remain % 1) * Math.PI * 2)) : 1
  const doneP = clamp01((t - plan.timerEnd) / 0.4)
  g.save()
  g.globalAlpha = a
  g.translate(cx, cy); g.scale(beat * (1 + 0.12 * Math.sin(doneP * Math.PI)), beat * (1 + 0.12 * Math.sin(doneP * Math.PI)))
  const lw = r * 0.2
  g.fillStyle = th.panel === '#ffffff' ? '#ffffff' : 'rgba(0,0,0,0.25)'
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill()
  g.lineWidth = lw; g.lineCap = 'round'
  g.strokeStyle = th.sub; g.globalAlpha = a * 0.25
  g.beginPath(); g.arc(0, 0, r - lw / 2, 0, Math.PI * 2); g.stroke()
  g.globalAlpha = a
  const color = done ? th.good : late ? th.late : th.accent
  g.strokeStyle = color
  if (p > 0) { g.beginPath(); g.arc(0, 0, r - lw / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); g.stroke() }
  g.fillStyle = done ? th.good : th.text
  g.textAlign = 'center'; g.textBaseline = 'middle'
  if (done) {
    // a tick mark once the answer is out
    g.strokeStyle = th.good; g.lineWidth = lw * 0.9
    g.beginPath(); g.moveTo(-r * 0.32, 0); g.lineTo(-r * 0.08, r * 0.24); g.lineTo(r * 0.34, -r * 0.24); g.stroke()
  } else {
    g.font = `700 ${Math.round(r * 0.85)}px "${font}"`
    g.fillText(`${t < plan.timerStart ? T : Math.ceil(remain - 1e-6)}`, 0, r * 0.04)
  }
  g.restore()
}

function drawQuestion(g: CanvasRenderingContext2D, L: Laid, th: QuizTheme, qs: QuizScene, plan: QuizPlan, t: number) {
  const it = qs.deck.items[(qs.part as { index: number }).index]
  const { font } = L
  const r = clamp01((t - plan.timerEnd) / 0.5) // reveal progress
  if (L.q) {
    const a = ease((t - 0.05) / 0.4)
    g.save()
    g.globalAlpha = a
    g.translate(0, (1 - a) * L.u * 0.04)
    g.fillStyle = th.panel
    rr(g, L.q.x, L.q.y, L.q.w, L.q.h, L.u * 0.03); g.fill()
    g.fillStyle = th.text
    lines(g, L.q, L.W / 2, L.q.y + (L.q.h - L.q.lines.length * L.q.px * L.q.lh) / 2, 'center', font)
    g.restore()
  }
  L.opts?.forEach((o, i) => {
    const at = 0.45 + 0.16 * i
    const s = 0.85 + 0.15 * pop((t - at) / 0.35)
    const a = ease((t - at) / 0.25)
    if (a <= 0) return
    const right = i === it.correct
    const wrong = it.correct >= 0 && !right
    g.save()
    g.globalAlpha = a * (wrong ? 1 - 0.55 * r : 1)
    const pulse = right ? 1 + 0.05 * Math.sin(r * Math.PI) : 1
    g.translate(o.x + o.w / 2, o.y + o.h / 2); g.scale(s * pulse, s * pulse); g.translate(-o.w / 2, -o.h / 2)
    g.fillStyle = right && r > 0 ? lerpColor(th.option, th.good, r) : th.option
    rr(g, 0, 0, o.w, o.h, o.h * 0.22); g.fill()
    if (th.option === '#ffffff') { g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2; g.stroke() }
    const badge = o.px * 1.7
    const vpad = o.px * 0.55
    g.fillStyle = right && r > 0 ? '#ffffff' : th.badge
    g.beginPath(); g.arc(vpad + badge / 2, o.h / 2, badge / 2, 0, Math.PI * 2); g.fill()
    g.fillStyle = right && r > 0 ? th.good : th.badgeText
    g.font = `700 ${Math.round(o.px * 0.95)}px "${font}"`
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(o.letter, vpad + badge / 2, o.h / 2 + o.px * 0.04)
    g.fillStyle = right && r > 0.5 ? '#ffffff' : th.optionText
    lines(g, { lines: o.lines, px: o.px, lh: L.q?.lh ?? 1.25 }, vpad * 2 + badge, (o.h - o.lines.length * o.px * (L.q?.lh ?? 1.25)) / 2, 'left', font)
    g.restore()
  })
  if (L.open) {
    const o = L.open
    const a = ease((t - 0.45) / 0.3)
    g.save()
    g.globalAlpha = a
    g.fillStyle = r > 0 ? lerpColor(th.option, th.good, r) : th.option
    rr(g, o.x, o.y, o.w, o.h, L.u * 0.03); g.fill()
    if (r < 1) {
      g.globalAlpha = a * (1 - r)
      g.fillStyle = th.optionText
      g.font = `700 ${Math.round(o.h * 0.55)}px "${font}"`
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('?', L.W / 2, o.y + o.h / 2)
    }
    if (r > 0) {
      g.globalAlpha = a * r
      g.fillStyle = '#ffffff'
      const lh = L.q?.lh ?? 1.25
      lines(g, { lines: o.lines, px: o.px, lh }, L.W / 2, o.y + (o.h - o.lines.length * o.px * lh) / 2, 'center', font)
    }
    g.restore()
  }
  if (L.exp) {
    const e = L.exp
    const a = ease((t - plan.timerEnd - 0.4) / 0.4)
    if (a > 0) {
      g.save()
      g.globalAlpha = a
      g.translate(0, (1 - a) * L.u * 0.03)
      g.fillStyle = th.panel
      rr(g, e.x, e.y, e.w, e.h, L.u * 0.025); g.fill()
      g.fillStyle = th.accent
      rr(g, e.x, e.y, Math.max(6, L.u * 0.012), e.h, 3); g.fill()
      g.fillStyle = th.sub
      lines(g, e, e.x + e.px * 1.2, e.y + e.px * 0.8, 'left', font)
      g.restore()
    }
  }
}

function drawCard(g: CanvasRenderingContext2D, L: Laid, th: QuizTheme, plan: QuizPlan, t: number) {
  const c = L.card!
  const { font, u } = L
  const lab = LABELS[font.includes('Devanagari') ? 'hi' : 'en']
  const s = 0.8 + 0.2 * pop(t / 0.6)
  const a = ease(t / 0.4)
  const f = clamp01((t - plan.timerEnd) / FLIP)
  const angle = f * Math.PI
  const sx = Math.max(0.02, Math.abs(Math.cos(angle)))
  const lift = 1 + 0.06 * Math.sin(angle)
  const backSide = f >= 0.5
  g.save()
  g.globalAlpha = a
  g.translate(c.x + c.w / 2, c.y + c.h / 2)
  g.scale(s * sx * lift, s * lift)
  // a soft shadow under the card
  g.fillStyle = 'rgba(0,0,0,0.18)'
  rr(g, -c.w / 2 + u * 0.01, -c.h / 2 + u * 0.02, c.w, c.h, u * 0.04); g.fill()
  if (backSide) {
    const grad = g.createLinearGradient(-c.w / 2, -c.h / 2, c.w / 2, c.h / 2)
    grad.addColorStop(0, th.back[0]); grad.addColorStop(1, th.back[1])
    g.fillStyle = grad
  } else g.fillStyle = th.panel === '#ffffff' ? '#ffffff' : lerpColor(th.option, th.bg[1], 0.3)
  rr(g, -c.w / 2, -c.h / 2, c.w, c.h, u * 0.04); g.fill()
  const label = backSide ? lab.answer : lab.q
  const lpx = u * 0.034
  g.fillStyle = backSide ? th.backText : th.accent
  g.globalAlpha = a * 0.85
  g.font = `700 ${Math.round(lpx)}px "${font}"`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(label.toUpperCase(), 0, -c.h / 2 + lpx * 1.6)
  g.globalAlpha = a
  const body = backSide ? c.back : c.front
  const exp = backSide ? c.exp : null
  const bh = body.lines.length * body.px * body.lh
  const eh = exp ? exp.lines.length * exp.px * exp.lh + u * 0.03 : 0
  let y = -(bh + eh) / 2 + lpx * 0.8
  g.fillStyle = backSide ? th.backText : th.panel === '#ffffff' ? th.text : th.optionText
  lines(g, body, 0, y, 'center', font)
  y += bh + u * 0.03
  if (exp) { g.globalAlpha = a * 0.85; lines(g, exp, 0, y, 'center', font) }
  g.restore()
}

function drawIntro(g: CanvasRenderingContext2D, L: Laid, th: QuizTheme, t: number) {
  const { font, u, W } = L
  const lab = LABELS[font.includes('Devanagari') ? 'hi' : 'en']
  const a = ease(t / 0.5), s = 0.85 + 0.15 * pop(t / 0.6)
  g.save()
  g.globalAlpha = a
  g.translate(W / 2, L.title!.y); g.scale(s, s); g.translate(-W / 2, -L.title!.y)
  g.fillStyle = th.text
  lines(g, L.title!, W / 2, L.title!.y, 'center', font)
  g.restore()
  const ry = L.title!.y + L.title!.lines.length * L.title!.px * L.title!.lh + u * 0.035
  const rw = u * 0.14 * ease((t - 0.3) / 0.4)
  g.fillStyle = th.accent
  rr(g, W / 2 - rw / 2, ry, rw, Math.max(5, u * 0.01), 4); g.fill()
  const b = ease((t - 0.45) / 0.4)
  g.globalAlpha = b
  g.fillStyle = th.sub
  lines(g, L.subtitle!, W / 2, L.subtitle!.y, 'center', font)
  // "Get ready!" pill
  const px = u * 0.04
  g.font = `700 ${Math.round(px)}px "${font}"`
  const pw = g.measureText(lab.ready).width + px * 2
  const py = L.subtitle!.y + L.subtitle!.lines.length * L.subtitle!.px * L.subtitle!.lh + u * 0.05
  const c = ease((t - 0.7) / 0.3)
  g.globalAlpha = c
  g.fillStyle = th.accent
  rr(g, W / 2 - pw / 2, py, pw, px * 2.1, px * 1.05); g.fill()
  g.fillStyle = th.accentText
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(lab.ready, W / 2, py + px * 1.08)
  g.globalAlpha = 1
}

function drawRecap(g: CanvasRenderingContext2D, L: Laid, th: QuizTheme, t: number) {
  const { font, u, W } = L
  g.globalAlpha = ease(t / 0.4)
  g.fillStyle = th.text
  lines(g, L.title!, W / 2, L.title!.y, 'center', font)
  g.globalAlpha = 1
  L.rows!.forEach((r, i) => {
    const a = ease((t - 0.3 - 0.12 * Math.min(i, 12)) / 0.3)
    if (a <= 0) return
    g.save()
    g.globalAlpha = a
    g.translate((1 - a) * u * 0.04, 0)
    const h = r.px * 1.5
    g.fillStyle = th.panel
    rr(g, r.x, r.y, r.w, h, h * 0.3); g.fill()
    g.fillStyle = th.accent
    g.beginPath(); g.arc(r.x + h / 2, r.y + h / 2, h * 0.36, 0, Math.PI * 2); g.fill()
    g.fillStyle = th.accentText
    g.font = `700 ${Math.round(r.px * 0.8)}px "${font}"`
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(r.num, r.x + h / 2, r.y + h / 2 + r.px * 0.03)
    g.fillStyle = th.text
    g.textAlign = 'left'
    g.fillText(fitText(g, r.text, r.px * 0.9, r.w - h * 1.3, font), r.x + h * 1.1, r.y + h / 2 + r.px * 0.03)
    g.restore()
  })
  if (L.footer) {
    g.globalAlpha = ease((t - 0.4 - 0.12 * Math.min(L.rows!.length, 12)) / 0.4)
    g.fillStyle = th.accent
    lines(g, L.footer, W / 2, L.footer.y, 'center', font)
    g.globalAlpha = 1
  }
}

function drawQuizFrame(g: CanvasRenderingContext2D, L: Laid, qs: QuizScene, plan: QuizPlan, t: number) {
  const th = quizThemeOf(qs.settings.theme)
  g.globalAlpha = 1
  background(g, L, th)
  if (qs.part.kind === 'intro') drawIntro(g, L, th, t)
  else if (qs.part.kind === 'recap') drawRecap(g, L, th, t)
  else {
    header(g, L, th, qs, plan, t)
    if (qs.settings.mode === 'cards') drawCard(g, L, th, plan, t)
    else drawQuestion(g, L, th, qs, plan, t)
  }
  g.globalAlpha = 1
}

async function prepare(qs: QuizScene, W: number, H: number) {
  const font = deckLang(qs.deck) === 'hi' ? 'Noto Sans Devanagari' : 'Poppins'
  await ensureFont(font) // before measuring any text
  return layout(qs, W, H, font)
}

const png = (c: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the quiz'))), 'image/png'))

/** The scene's final picture (answer shown): its thumbnail, and its stand-in where video can't be made. */
export async function drawQuizStill(qs: QuizScene, W: number, H: number): Promise<Blob> {
  const L = await prepare(qs, W, H)
  const plan = quizPlan(qs, 0, 0)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  drawQuizFrame(c.getContext('2d')!, L, qs, plan, plan.end + 5)
  return png(c)
}

/** A live preview of one question at a moment of its scene, for the editor sheet. */
export async function drawQuizPreview(qs: QuizScene, c: HTMLCanvasElement, at: 'question' | 'answer' | number) {
  const L = await prepare(qs, c.width, c.height)
  const plan = quizPlan(qs, 0, 0)
  const t = at === 'answer' ? plan.end + 5 : at === 'question' ? (plan.timerStart + plan.timerEnd) / 2 : at
  drawQuizFrame(c.getContext('2d')!, L, qs, plan, t)
}

/**
 * Renders a quiz scene as a clip of `seconds`. `offset` is how far into the clip the scene really
 * starts (the incoming transition), so the countdown lines up with the voice and the beeps.
 */
export async function renderQuizVideo(qs: QuizScene, plan: QuizPlan, W: number, H: number, seconds: number, offset: number) {
  const L = await prepare(qs, W, H)
  const moving = plan.moving.map(([a, b]) => [a + offset, b + offset] as [number, number])
  return renderCanvasVideo(W, H, seconds, moving, (g, t) => drawQuizFrame(g, L, qs, plan, Math.max(0, t - offset)))
}

// ---------------------------------------------------------------- sound

/** Countdown ticks (higher for the last three) and a chime when the answer appears. */
export function countdownSound(timer: number, rate = 44100): AudioBuffer {
  const len = Math.ceil((timer + 1.4) * rate)
  const buf = new AudioBuffer({ length: len, sampleRate: rate, numberOfChannels: 1 })
  const d = new Float32Array(len)
  const tone = (at: number, freqs: number[], dur: number, amp: number) => {
    const s0 = Math.round(at * rate), n = Math.round(dur * rate)
    for (let i = 0; i < n && s0 + i < len; i++) {
      const tt = i / rate
      const env = Math.min(1, tt / 0.004) * Math.exp(-tt * (6 / dur))
      let v = 0
      for (const f of freqs) v += Math.sin(2 * Math.PI * f * tt)
      d[s0 + i] += (amp * env * v) / freqs.length
    }
  }
  for (let k = 0; k < timer; k++) tone(k, [k >= timer - 3 ? 1320 : 880], 0.07, 0.35)
  tone(timer, [784, 1175, 1568], 1.2, 0.4)
  buf.copyToChannel(d, 0)
  return buf
}

// ---------------------------------------------------------------- scenes

const short = (s: string) => (s.length > 40 ? s.slice(0, 40).replace(/\s+\S*$/, '') + '…' : s)

/** The parts of the video: an optional title card, one scene per question, an optional recap. */
export function quizParts(d: QuizDeck, st: QuizSettings): QuizPart[] {
  const parts: QuizPart[] = []
  if (d.title.trim()) parts.push({ kind: 'intro' })
  d.items.forEach((_, index) => parts.push({ kind: 'item', index }))
  if (st.recap && d.items.length > 1) parts.push({ kind: 'recap' })
  return parts
}

/** One scene per part, each with its picture and what the voice reads. */
export async function quizToScenes(d: QuizDeck, st: QuizSettings, W: number, H: number, progress: (p: number) => void): Promise<Scene[]> {
  if (!d.items.length) throw new Error('No questions found')
  const parts = quizParts(d, st)
  const hi = deckLang(d) === 'hi'
  const lab = LABELS[hi ? 'hi' : 'en']
  const scenes: Scene[] = []
  for (let i = 0; i < parts.length; i++) {
    progress(i / parts.length)
    const part = parts[i]
    const [text, say2] = voiceOf(d, part, st)
    const quiz: QuizScene = { deck: d, settings: st, part, say2 }
    const name = part.kind === 'intro' ? short(d.title) : part.kind === 'recap' ? (st.mode === 'cards' ? lab.review : lab.answers)
      : `${part.index + 1}. ${short(d.items[part.index].q)}`
    scenes.push({ id: uid(), image: await drawQuizStill(quiz, W, H), name, text, duration: null, quiz })
  }
  return scenes
}
