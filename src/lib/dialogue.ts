import type { Scene } from '../model/scenes'
import { uid } from './format'
import { ensureFont } from '../engine/text'
import { type CardTheme } from './scriptScenes'
import { toDevanagari } from './hinglish'

/**
 * "Deep Dive Conversation": a lesson written as a talk between four people (a professor, an assistant professor and
 * two students) becomes scenes. Each line is one scene: a card with the speaker's name badge and the words (or the
 * formula board), read in that speaker's own voice. Pause & Predict questions become a question card and an answer card.
 */

export type SpeakerId = 'thomas' | 'maria' | 'daniel' | 'nancy'

export interface Character {
  id: SpeakerId
  name: string // as shown on the badge
  role: string
  color: string
  /** voice shaping on top of the one AI voice: playback-rate factor (<1 deeper, >1 higher) and a pause after each line */
  pitch: number
  pause: number
}

export const CHARACTERS: Record<SpeakerId, Character> = {
  thomas: { id: 'thomas', name: 'प्रो. थॉमस', role: 'वरिष्ठ प्रोफ़ेसर', color: '#2563eb', pitch: 0.9, pause: 0.35 },
  maria: { id: 'maria', name: 'डॉ. मारिया', role: 'सहायक प्रोफ़ेसर', color: '#db2777', pitch: 1.06, pause: 0.3 },
  daniel: { id: 'daniel', name: 'डैनियल', role: 'छात्र', color: '#16a34a', pitch: 0.98, pause: 0.25 },
  nancy: { id: 'nancy', name: 'नैन्सी', role: 'छात्रा', color: '#ea580c', pitch: 1.14, pause: 0.25 },
}

export interface Turn {
  id: number | string
  speaker: SpeakerId
  line: string
  section?: string
  emotion?: string
  formula?: string | null
  branch?: string // the doubt question this turn belongs to
}

export interface Predict { after: number | string; q: string; options: string[]; answer: number; why: string[] }

export interface Lesson {
  topic: string
  turns: Turn[]
  predicts: Predict[]
  /** where each doubt branch goes in the main talk: id of the turn it follows */
  branches: { after: number | string; trigger: string; turns: Turn[] }[]
}

const SPEAKERS = new Set<string>(['thomas', 'maria', 'daniel', 'nancy'])
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)

function turnOf(x: unknown, i: number, where: string): Turn {
  if (!isObj(x)) throw new Error(`${where}: line ${i + 1} is not an object`)
  const sp = String(x.speaker ?? '').toLowerCase()
  if (!SPEAKERS.has(sp)) throw new Error(`${where}: line ${i + 1} has an unknown speaker "${String(x.speaker)}" (use thomas, maria, daniel or nancy)`)
  const line = String(x.line ?? '').trim()
  if (!line) throw new Error(`${where}: line ${i + 1} is empty`)
  return {
    id: (x.id as number | string | undefined) ?? i + 1,
    speaker: sp as SpeakerId,
    line,
    section: typeof x.section === 'string' ? x.section : undefined,
    emotion: typeof x.emotion === 'string' ? x.emotion : undefined,
    formula: typeof x.formula === 'string' && x.formula.trim() ? x.formula.trim() : null,
  }
}

/** Reads the lesson JSON (see the Deep Dive prompt). Throws a readable error when it is not one. */
export function parseLesson(raw: string): Lesson {
  let j: unknown
  try { j = JSON.parse(raw.replace(/^﻿/, '')) } catch { throw new Error('This is not a Deep Dive JSON file') }
  if (!isObj(j) || !Array.isArray(j.dialogue)) throw new Error('This is not a Deep Dive JSON file')
  const meta = isObj(j.meta) ? j.meta : {}
  const turns = j.dialogue.map((x, i) => turnOf(x, i, 'dialogue'))
  if (!turns.length) throw new Error('The conversation has no lines')
  const predicts: Predict[] = []
  for (const p of Array.isArray(j.pause_and_predict) ? j.pause_and_predict : []) {
    if (!isObj(p) || !Array.isArray(p.options) || typeof p.answer !== 'number') continue
    const options = p.options.map(String)
    if (p.answer < 0 || p.answer >= options.length) continue
    predicts.push({ after: p.after_id as number | string, q: String(p.q ?? ''), options, answer: p.answer, why: Array.isArray(p.why_wrong) ? p.why_wrong.map(String) : [] })
  }
  const branches = []
  for (const b of Array.isArray(j.doubt_branches) ? j.doubt_branches : []) {
    if (!isObj(b) || !Array.isArray(b.dialogue)) continue
    const trigger = String(b.trigger_q ?? '')
    branches.push({ after: b.after_id as number | string, trigger, turns: b.dialogue.map((x, i) => ({ ...turnOf(x, i, 'doubt branch'), branch: trigger })) })
  }
  return { topic: String(meta.topic ?? '').trim(), turns, predicts, branches }
}

// ------------------------------------------------------------ saying it aloud

const LET: Record<string, string> = {
  A: 'ए', B: 'बी', C: 'सी', D: 'डी', E: 'ई', F: 'एफ', G: 'जी', H: 'एच', I: 'आई', J: 'जे', K: 'के', L: 'एल', M: 'एम',
  N: 'एन', O: 'ओ', P: 'पी', Q: 'क्यू', R: 'आर', S: 'एस', T: 'टी', U: 'यू', V: 'वी', W: 'डब्ल्यू', X: 'एक्स', Y: 'वाई', Z: 'ज़ेड',
}
const DIG = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ']
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }
const SYMS: Record<string, string> = {
  Irms: 'आई आर एम एस', Iavg: 'आई एवरेज', Rsh: 'आर शंट', Pcu: 'पी सी यू', Ist: 'आई स्टार्ट', Eb: 'ई बी', Ia: 'आई ए', Ra: 'आर ए',
  Pm: 'पी एम', Td: 'टी डी', Tc: 'टी सी', Im: 'आई एम', Rm: 'आर एम', Rs: 'आर एस', NBAI: 'एन बी ए आई', PMMC: 'पी एम एम सी',
  EMF: 'ई एम एफ', DC: 'डी सी', AC: 'ए सी', KVL: 'के वी एल', rms: 'आर एम एस', rpm: 'आर पी एम', Hz: 'हर्ट्ज़',
}
const GREEK: Record<string, string> = { φ: 'फाई', θ: 'थीटा', ω: 'ओमेगा', π: 'पाई', Δ: 'डेल्टा', λ: 'लैम्ब्डा' }
const UNITS: [RegExp, string][] = [
  [/Ω\/V/g, 'ओम प्रति वोल्ट'], [/N[·.]m\/rad/g, 'न्यूटन मीटर प्रति रेडियन'], [/rad\/s/g, 'रेडियन प्रति सेकंड'], [/N[·.]m/g, 'न्यूटन मीटर'],
  [/m²/g, 'वर्ग मीटर'], [/[µμ]A/g, 'माइक्रो ऐम्पियर'], [/mA/g, 'मिली ऐम्पियर'], [/\bmm\b/g, 'मिलीमीटर'], [/°/g, ' डिग्री'], [/%/g, ' प्रतिशत'],
]
const LAT = 'A-Za-z'
const NOT_LETTER = `[${LAT}\\u0900-\\u0963\\u0966-\\u097F]` // a danda "।" after a letter must not block it

const spell = (tok: string) => [...tok].map((c) => LET[c.toUpperCase()] ?? c).join(' ')
const sym = (tok: string) => SYMS[tok] ?? spell(tok)

/** Turns formulas, symbols and units into words, so the voice does not skip or spell them wrongly. Hindi text stays as it is. */
export function verbalize(text: string): string {
  let s = text
  s = s.replace(/10([⁻⁺]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_m, sign: string, e: string) => {
    const n = [...e].map((c) => SUP[c]).join('')
    return `दस की घात ${sign === '⁻' ? 'ऋण ' : ''}${n.length === 1 ? DIG[+n] : n}`
  })
  for (const [re, rep] of UNITS) s = s.replace(re, rep)
  s = s.replace(/\brad\b/g, 'रेडियन').replace(/(?<=\d)²/g, ' का वर्ग')
  s = s.replace(/(?<=\d)\s*A\b/g, ' ऐम्पियर').replace(/(?<=\d)\s*V\b/g, ' वोल्ट').replace(/(?<=\d)\s*W\b/g, ' वाट')
    .replace(/(?<=\d)\s*Ω/g, ' ओम').replace(/(?<=\d)\s*T\b/g, ' टेस्ला').replace(/(?<=\d)\s*Hz\b/g, ' हर्ट्ज़')
  s = s.replace(/\b([A-Za-z]{1,4})²/g, (_m, a: string) => `${sym(a)} का वर्ग`)
  s = s.replace(/\b([A-Za-z]{1,4})'/g, (_m, a: string) => `${sym(a)} प्राइम `) // the space keeps a name after it apart
  s = s.replace(/(?<=\d) (?=\d{3}\b)/g, '') // 99 900 -> 99900
  s = s.replace(/\d+\.\d+/g, (m) => {
    const [a, b] = m.split('.')
    return `${a === '0' ? 'शून्य' : a} दशमलव ${[...b].map((c) => DIG[+c]).join(' ')}`
  })
  s = s.replace(/×/g, ' गुणा ').replace(/−/g, ' घटा ').replace(/≈/g, ' लगभग बराबर ').replace(/∝/g, ' समानुपाती ').replace(/=/g, ' बराबर ').replace(/·/g, ' ')
  s = s.replace(/\s*\/\s*/g, ' भाग ')
  for (const [g, r] of Object.entries(GREEK)) s = s.split(g).join(` ${r} `)
  for (const k of Object.keys(SYMS).sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`(?<![${LAT}])${k}(?![${LAT}])`, 'g'), SYMS[k])
  }
  s = s.replace(new RegExp(`(?<!${NOT_LETTER})([A-Za-z])(?!${NOT_LETTER})`, 'g'), (_m, c: string) => LET[c.toUpperCase()] ?? c)
  return s.replace(/\s+/g, ' ').replace(/ ,/g, ',').replace(/ ।/g, '।').replace(/ :/g, ':').trim()
}

/** Technical words that stay in English in the lesson, spelled the way a Hindi speaker says them. Others fall back to sound-by-sound. */
const WORDS: Record<string, string> = {
  torque: 'टॉर्क', core: 'कोर', wave: 'वेव', rectifier: 'रेक्टिफ़ायर', form: 'फ़ॉर्म', factor: 'फ़ैक्टर', movement: 'मूवमेंट', ammeter: 'ऐमीटर',
  voltmeter: 'वोल्टमीटर', sine: 'साइन', square: 'स्क्वेयर', shunt: 'शंट', multimeter: 'मल्टीमीटर', spring: 'स्प्रिंग', permanent: 'परमानेंट',
  magnet: 'मैग्नेट', moving: 'मूविंग', coil: 'कॉइल', type: 'टाइप', analog: 'एनालॉग', range: 'रेंज', radial: 'रेडियल', pointer: 'पॉइंटर',
  nba: 'एन बी ए', instrument: 'इंस्ट्रूमेंट', arsonval: 'आर्सोनवाल', pole: 'पोल', pieces: 'पीसेज़', flux: 'फ़्लक्स', density: 'डेंसिटी',
  former: 'फ़ॉर्मर', jewel: 'ज्वेल', bearings: 'बेयरिंग्स', taut: 'टॉट', band: 'बैंड', counterweights: 'काउंटरवेट्स', damping: 'डैम्पिंग',
  eddy: 'एडी', current: 'करंट', lenz: 'लेंज़', law: 'लॉ', deflecting: 'डिफ़्लेक्टिंग', uniform: 'यूनिफ़ॉर्म', polarised: 'पोलराइज़्ड',
  sensitivity: 'सेंसिटिविटी', accuracy: 'एक्यूरेसी', class: 'क्लास', stray: 'स्ट्रे', fields: 'फ़ील्ड्स', overload: 'ओवरलोड', volts: 'वोल्ट',
  diodes: 'डायोड्स', diode: 'डायोड', bridge: 'ब्रिज', calibration: 'कैलिब्रेशन', full: 'फ़ुल', multiplier: 'मल्टीप्लायर', ohmmeter: 'ओममीटर',
  topic: 'टॉपिक', numerical: 'न्यूमेरिकल', constant: 'कॉन्स्टेंट', mains: 'मेन्स', units: 'यूनिट्स', short: 'शॉर्ट', circuited: 'सर्किटेड', turn: 'टर्न',
  back: 'बैक', counter: 'काउंटर', motor: 'मोटर', generator: 'जनरेटर', armature: 'आर्मेचर', field: 'फ़ील्ड', speed: 'स्पीड', load: 'लोड', starter: 'स्टार्टर',
  winding: 'वाइंडिंग', brush: 'ब्रश', brushes: 'ब्रशेज़', commutator: 'कम्यूटेटर', power: 'पावर', input: 'इनपुट', output: 'आउटपुट', loss: 'लॉस', losses: 'लॉसेज़',
  copper: 'कॉपर', efficiency: 'एफ़िशिएंसी', shaft: 'शाफ़्ट', series: 'सीरीज़', shunt2: 'शंट', compound: 'कंपाउंड', rpm: 'आर पी एम', emf: 'ई एम एफ', fig: 'फ़िगर',
}

/** Any English word left in a spoken line is written in Devanagari, so the Hindi voice can say it. */
function latinToHindi(s: string): string {
  return s.replace(/[A-Za-z][A-Za-z']*/g, (w) => WORDS[w.toLowerCase().replace(/'/g, '')] ?? toDevanagari(w))
}

/** True when the line is already in spoken form (the "tts" copy of the file): nothing to convert. */
export const isSpoken = (s: string) => !/[A-Za-z=×−≈∝°%⁰¹²³⁴⁵⁶⁷⁸⁹φθωπΔλ·]/.test(s)

// ------------------------------------------------------------ cards

export interface DialogueCard {
  kind: 'say' | 'ask' | 'reveal' | 'title'
  speaker?: SpeakerId
  title?: string // the topic, or the question
  text: string
  formula?: string | null
  options?: string[]
  answer?: number
  tag?: string // small label above the text (the section, "सोचो पहले", "उत्तर")
}

const SECTION: Record<string, string> = {
  hook: 'शुरुआत', prior: 'पहले से क्या जानें', concept: 'मूल बात', math: 'गणित', misconception: 'आम ग़लतफ़हमी',
  realworld: 'असली दुनिया', mistakes: 'ग़लतियाँ', exam: 'परीक्षा', recap: 'सार',
}
export const sectionLabel = (s?: string) => (s ? SECTION[s] ?? '' : '')

const shorten = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s)

/** The scene list for a lesson, in the order it should be watched, without pictures yet. */
export interface Plan {
  card: DialogueCard
  say: string // what the voice reads (spoken form)
  text: string // what the captions show (as written)
  name: string
  speaker?: SpeakerId
}

export interface PlanOptions { doubts: boolean; predicts: boolean }

export function planLesson(l: Lesson, o: PlanOptions): Plan[] {
  const out: Plan[] = []
  const spoken = (s: string) => (isSpoken(s) ? s : latinToHindi(verbalize(s)))
  if (l.topic) out.push({ card: { kind: 'title', title: l.topic, text: 'Deep Dive बातचीत' }, say: spoken(l.topic), text: l.topic, name: shorten(l.topic, 40) })
  const add = (t: Turn) => {
    const c = CHARACTERS[t.speaker]
    out.push({
      card: { kind: 'say', speaker: t.speaker, text: t.line, formula: t.formula, tag: t.branch ? 'सवाल पर बात' : sectionLabel(t.section) },
      say: spoken(t.line), text: t.line, name: `${t.id}. ${c.name}`, speaker: t.speaker,
    })
  }
  const same = (a: number | string, b: number | string) => String(a) === String(b)
  for (const t of l.turns) {
    add(t)
    if (o.predicts) for (const p of l.predicts.filter((p) => same(p.after, t.id))) out.push(...predictPlans(p, spoken))
    if (o.doubts) for (const b of l.branches.filter((b) => same(b.after, t.id))) b.turns.forEach(add)
  }
  return out
}

function predictPlans(p: Predict, spoken: (s: string) => string): Plan[] {
  const letters = ['अ', 'ब', 'स', 'द']
  const ask = `अब रुककर सोचिए। ${p.q} ${p.options.map((o, i) => `विकल्प ${letters[i] ?? i + 1}: ${o}`).join('। ')}।`
  const right = p.options[p.answer]
  const why = p.why[p.answer] ?? ''
  const reveal = `सही उत्तर है विकल्प ${letters[p.answer] ?? p.answer + 1}: ${right}। ${why}`
  return [
    { card: { kind: 'ask', title: p.q, text: p.q, options: p.options, tag: 'पहले सोचो' }, say: spoken(ask), text: p.q, name: `सोचो: ${shorten(p.q, 30)}` },
    { card: { kind: 'reveal', title: p.q, text: why, options: p.options, answer: p.answer, tag: 'उत्तर' }, say: spoken(reveal), text: `${right}. ${why}`, name: `उत्तर: ${shorten(p.q, 30)}` },
  ]
}

// ------------------------------------------------------------ drawing

function wrapText(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && g.measureText(next).width > width) { lines.push(cur); cur = w } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

/** Draws one conversation card at W×H and returns it as a PNG. */
export async function drawDialogueCard(card: DialogueCard, theme: CardTheme, W: number, H: number): Promise<Blob> {
  const font = 'Noto Sans Devanagari'
  await ensureFont(font)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const u = Math.min(W, H)
  const sp = card.speaker ? CHARACTERS[card.speaker] : null
  const accent = sp?.color ?? theme.accent

  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, theme.bg[0]); grad.addColorStop(1, theme.bg[1])
  g.fillStyle = grad; g.fillRect(0, 0, W, H)
  g.globalAlpha = 0.1; g.fillStyle = accent
  g.beginPath(); g.arc(W, 0, u * 0.42, 0, Math.PI * 2); g.fill()
  g.globalAlpha = 1

  const padX = W * (W > H ? 0.07 : 0.08)
  const boxW = W - padX * 2
  const base = u * 0.05
  g.textBaseline = 'top'
  let y = H * 0.07

  // name badge: a round initial and the name
  if (sp) {
    const r = base * 0.85
    g.fillStyle = sp.color
    g.beginPath(); g.arc(padX + r, y + r, r, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(r * 1.1)}px "${font}"`; g.textAlign = 'center'
    g.fillText([...sp.name.replace(/^(प्रो|डॉ)\.\s*/, '')][0] ?? '', padX + r, y + r * 0.42)
    g.textAlign = 'left'
    g.fillStyle = theme.title; g.font = `700 ${Math.round(base * 1.05)}px "${font}"`
    g.fillText(sp.name, padX + r * 2.4, y + r * 0.05)
    g.fillStyle = theme.text; g.font = `400 ${Math.round(base * 0.62)}px "${font}"`
    g.fillText(sp.role, padX + r * 2.4, y + r * 1.15)
    y += r * 2.6
  }
  if (card.tag) {
    g.font = `700 ${Math.round(base * 0.6)}px "${font}"`
    const w = g.measureText(card.tag).width + base
    const tx = W - padX - w
    g.fillStyle = accent; g.globalAlpha = 0.16
    g.fillRect(tx, H * 0.07, w, base * 1.1); g.globalAlpha = 1
    g.fillStyle = accent; g.fillText(card.tag, tx + base * 0.5, H * 0.07 + base * 0.2)
    if (!sp) y = Math.max(y, H * 0.07 + base * 1.6)
  }

  const bottom = H * 0.93
  const room = bottom - y
  const lh = 1.5

  const fit = (parts: { text: string; size: number; weight: number; color: string }[], gap: number, from: number) => {
    let k = from
    for (let i = 0; i < 40; i++) {
      let total = 0
      for (const p of parts) {
        g.font = `${p.weight} ${Math.round(k * p.size)}px "${font}"`
        total += wrapText(g, p.text, boxW).length * k * p.size * lh + gap * k
      }
      if (total <= room || k < u * 0.022) break
      k *= 0.94
    }
    return k
  }

  if (card.kind === 'title') {
    g.textAlign = 'center'
    const k = fit([{ text: card.title ?? '', size: 1.5, weight: 700, color: theme.title }], 0.4, base * 1.3)
    g.font = `700 ${Math.round(k * 1.5)}px "${font}"`
    const lines = wrapText(g, card.title ?? '', boxW)
    let ty = (H - lines.length * k * 1.5 * lh) / 2 - k
    g.fillStyle = theme.title
    for (const l of lines) { g.fillText(l, W / 2, ty); ty += k * 1.5 * lh }
    g.fillStyle = accent; g.fillRect(W / 2 - u * 0.06, ty + k * 0.2, u * 0.12, Math.max(4, u * 0.008))
    g.font = `400 ${Math.round(k * 0.8)}px "${font}"`; g.fillStyle = theme.text
    g.fillText(card.text, W / 2, ty + k * 0.9)
  } else if (card.kind === 'say') {
    // the formula, when there is one, sits on a board under the words
    const formula = card.formula?.trim()
    const k = fit([{ text: card.text, size: 1, weight: 500, color: theme.title }, ...(formula ? [{ text: formula, size: 1.1, weight: 700, color: accent }] : [])], formula ? 1.2 : 0.3, base * 1.15)
    g.font = `500 ${Math.round(k)}px "${font}"`; g.fillStyle = theme.title
    for (const l of wrapText(g, card.text, boxW)) { g.fillText(l, padX, y); y += k * lh }
    if (formula) {
      y += k * 0.5
      g.font = `700 ${Math.round(k * 1.1)}px "${font}"`
      const fl = wrapText(g, formula, boxW - k * 2)
      const bh = fl.length * k * 1.1 * lh + k * 0.9
      g.fillStyle = accent; g.globalAlpha = 0.12
      g.fillRect(padX, y, boxW, bh); g.globalAlpha = 1
      g.fillStyle = accent; g.fillRect(padX, y, Math.max(6, u * 0.008), bh)
      g.fillStyle = theme.title
      let fy = y + k * 0.45
      for (const l of fl) { g.fillText(l, padX + k, fy); fy += k * 1.1 * lh }
    }
  } else {
    // a question with its four options; on the answer card the right one is lit
    const opts = card.options ?? []
    const k = fit([{ text: card.title ?? '', size: 1, weight: 700, color: theme.title }, ...opts.map((o) => ({ text: `अ. ${o}`, size: 0.85, weight: 400, color: theme.text }))], 0.5, base * 1.05)
    g.font = `700 ${Math.round(k)}px "${font}"`; g.fillStyle = theme.title
    for (const l of wrapText(g, card.title ?? '', boxW)) { g.fillText(l, padX, y); y += k * lh }
    y += k * 0.4
    const labels = ['अ', 'ब', 'स', 'द']
    opts.forEach((o, i) => {
      const right = card.kind === 'reveal' && i === card.answer
      const dim = card.kind === 'reveal' && !right
      g.font = `${right ? 700 : 400} ${Math.round(k * 0.85)}px "${font}"`
      const lines = wrapText(g, o, boxW - k * 2)
      const bh = lines.length * k * 0.85 * lh + k * 0.4
      g.globalAlpha = right ? 0.2 : 0.08; g.fillStyle = right ? '#16a34a' : accent
      g.fillRect(padX, y, boxW, bh); g.globalAlpha = dim ? 0.5 : 1
      g.fillStyle = right ? '#15803d' : theme.text
      g.fillText(`${labels[i] ?? i + 1}.`, padX + k * 0.3, y + k * 0.2)
      let oy = y + k * 0.2
      for (const l of lines) { g.fillText(l, padX + k * 1.4, oy); oy += k * 0.85 * lh }
      g.globalAlpha = 1
      y += bh + k * 0.2
    })
    if (card.kind === 'reveal' && card.text) {
      y += k * 0.2
      g.font = `400 ${Math.round(k * 0.8)}px "${font}"`; g.fillStyle = theme.text
      for (const l of wrapText(g, card.text, boxW)) { if (y > bottom) break; g.fillText(l, padX, y); y += k * 0.8 * lh }
    }
  }
  g.textAlign = 'left'
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'))
}

/** The whole lesson as scenes: a card each, with the spoken form kept apart from the caption text. */
export async function lessonToScenes(l: Lesson, o: PlanOptions, theme: CardTheme, W: number, H: number, progress: (p: number) => void): Promise<Scene[]> {
  const plans = planLesson(l, o)
  const scenes: Scene[] = []
  for (let i = 0; i < plans.length; i++) {
    progress(i / plans.length)
    const p = plans[i]
    scenes.push({ id: uid(), image: await drawDialogueCard(p.card, theme, W, H), name: p.name, text: p.text, say: p.say, speaker: p.speaker, duration: null })
  }
  return scenes
}
