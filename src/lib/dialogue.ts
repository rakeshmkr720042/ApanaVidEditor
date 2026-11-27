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
  name: string // as shown on the badge (Hindi lessons)
  role: string
  nameEn: string // the same for English lessons
  roleEn: string
  color: string
  /**
   * voice shaping on top of the one AI voice: pitch factor (<1 deeper, >1 higher, the pace stays), pace factor
   * (>1 faster) and the shortest pause after each line (longer lines and questions get more, see pauseAfter)
   */
  pitch: number
  tempo: number
  pause: number
}

export const CHARACTERS: Record<SpeakerId, Character> = {
  thomas: { id: 'thomas', name: 'प्रो. थॉमस', role: 'वरिष्ठ प्रोफ़ेसर', nameEn: 'Prof. Thomas', roleEn: 'Senior professor', color: '#2563eb', pitch: 0.86, tempo: 0.94, pause: 0.35 },
  maria: { id: 'maria', name: 'डॉ. मारिया', role: 'सहायक प्रोफ़ेसर', nameEn: 'Dr. Maria', roleEn: 'Assistant professor', color: '#db2777', pitch: 1.1, tempo: 1, pause: 0.3 },
  daniel: { id: 'daniel', name: 'डैनियल', role: 'छात्र', nameEn: 'Daniel', roleEn: 'Student', color: '#16a34a', pitch: 0.97, tempo: 1.06, pause: 0.25 },
  nancy: { id: 'nancy', name: 'नैन्सी', role: 'छात्रा', nameEn: 'Nancy', roleEn: 'Student', color: '#ea580c', pitch: 1.2, tempo: 1.04, pause: 0.25 },
}

export type LessonLang = 'hi' | 'en'
export const nameOf = (c: Character, lang: LessonLang = 'hi') => (lang === 'en' ? c.nameEn : c.name)
export const roleOf = (c: Character, lang: LessonLang = 'hi') => (lang === 'en' ? c.roleEn : c.role)

/**
 * Seconds of quiet after a line: a little more for long lines, more after a question (the listener thinks, the other
 * person "hears" it) or an exclamation, less after a comma-like ending. Never more than 1.6 s.
 */
export function pauseAfter(line: string, base: number): number {
  const s = line.trim()
  const words = s.split(/\s+/).filter(Boolean).length
  let p = base + Math.min(0.45, words * 0.012)
  const end = s.replace(/["'”’)\]]+$/, '').slice(-1)
  if (end === '?') p += 0.35
  else if (end === '!') p += 0.2
  else if (end === '…') p += 0.3
  else if (end === ':') p += 0.2
  else if (end === '।' || end === '.') p += 0.1
  else if (end === ',' || end === ';') p -= 0.05
  return Math.round(Math.min(1.6, Math.max(0.15, p)) * 100) / 100
}
/** Quiet after a Pause & Predict question is read: time to think before the answer card. */
export const THINK_PAUSE = 2.5

export interface Turn {
  id: number | string
  speaker: SpeakerId
  line: string
  section?: string
  emotion?: string
  formula?: string | null
  branch?: string // the doubt question this turn belongs to
  readFormula?: boolean // the voice also reads the board (lessons made from notes, where the line only points to it)
}

export interface Predict { after: number | string; q: string; options: string[]; answer: number; why: string[] }

export interface Lesson {
  topic: string
  lang?: LessonLang // 'hi' when left out
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
const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' }
const subscripts = (s: string) => s.replace(/[₀-₉]+/g, (m) => ` ${[...m].map((c) => SUB[c]).join('')} `)
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
  // chemical formulas (CO₂, C₆H₁₂O₆): each element spelled, each count said
  let s = text.replace(/(?<![A-Za-z])((?:[A-Z][a-z]?[₀-₉]*){1,8})(?![A-Za-z])/g, (m: string) =>
    /[₀-₉]/.test(m) ? ` ${m.replace(/([A-Z][a-z]?)([₀-₉]*)/g, (_x, el: string, n: string) => ` ${spell(el)} ${[...n].map((c) => SUB[c]).join('')} `)} ` : m)
  s = subscripts(s)
  s = s.replace(/√\s*\(?([^\s)]+)\)?/g, ' $1 का वर्गमूल ').replace(/(?<=\d)³/g, ' का घन').replace(/\b([A-Za-z]{1,4})³/g, '$1 का घन')
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
  s = s.replace(/→|⟶|=>/g, ' से बनता है ').replace(/\+/g, ' धन ').replace(/×/g, ' गुणा ').replace(/−/g, ' घटा ').replace(/≈/g, ' लगभग बराबर ').replace(/∝/g, ' समानुपाती ').replace(/=/g, ' बराबर ').replace(/·/g, ' ')
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
export const isSpoken = (s: string) => !/[A-Za-z=×−≈∝°%⁰¹²³⁴⁵⁶⁷⁸⁹₀-₉φθωπΔλ·+→√]/.test(s)

/** The English voice's version of verbalize: symbols and powers in words, the rest left as written. */
export function verbalizeEn(text: string): string {
  let s = subscripts(text)
  s = s.replace(/√\s*\(?([^\s)]+)\)?/g, ' the square root of $1 ')
  s = s.replace(/10([⁻⁺]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_m, sign: string, e: string) => ` ten to the power ${sign === '⁻' ? 'minus ' : ''}${[...e].map((c) => SUP[c]).join('')} `)
  s = s.replace(/²/g, ' squared ').replace(/³/g, ' cubed ')
  s = s.replace(/[⁰¹⁴⁵⁶⁷⁸⁹]+/g, (m) => ` to the power ${[...m].map((c) => SUP[c]).join('')} `)
  s = s.replace(/→|⟶|=>/g, ' gives ').replace(/≈/g, ' is about ').replace(/∝/g, ' is proportional to ').replace(/=/g, ' equals ')
    .replace(/\+/g, ' plus ').replace(/×/g, ' times ').replace(/−/g, ' minus ').replace(/(?<=\s)-(?=\s)/g, ' minus ').replace(/·/g, ' ')
    .replace(/(?<=\d)\s*\/\s*(?=\d)/g, ' over ').replace(/%/g, ' percent').replace(/°/g, ' degrees')
  for (const [g, r] of Object.entries({ φ: 'phi', θ: 'theta', ω: 'omega', π: 'pi', Δ: 'delta', λ: 'lambda' })) s = s.split(g).join(` ${r} `)
  return s.replace(/\s+/g, ' ').replace(/ ([,.?!])/g, '$1').trim()
}

// ------------------------------------------------------------ cards

export interface DialogueCard {
  kind: 'say' | 'ask' | 'reveal' | 'title'
  lang?: LessonLang
  speaker?: SpeakerId
  /** with a step-by-step formula (lines split by a new line): how many of its lines are on the board so far */
  step?: number
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
const SECTION_EN: Record<string, string> = {
  hook: 'Opening', prior: 'What to know first', concept: 'Key idea', math: 'Maths', misconception: 'Common mistake',
  realworld: 'Real world', mistakes: 'Mistakes', exam: 'Exam', recap: 'Recap',
}
export const sectionLabel = (s?: string, lang: LessonLang = 'hi') => (s ? (lang === 'en' ? SECTION_EN : SECTION)[s] ?? '' : '')
/** The lines of a formula board, top to bottom. */
export const formulaSteps = (f?: string | null) => (f ?? '').split(/\n+/).map((x) => x.trim()).filter(Boolean)
const WORDS_EN = { title: 'Deep Dive conversation', branch: 'Doubt', ask: 'Think first', answer: 'Answer', then: 'Then' }
const WORDS_HI = { title: 'Deep Dive बातचीत', branch: 'सवाल पर बात', ask: 'पहले सोचो', answer: 'उत्तर', then: 'फिर' }

const shorten = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s)

/** The scene list for a lesson, in the order it should be watched, without pictures yet. */
export interface Plan {
  card: DialogueCard
  say: string // what the voice reads (spoken form)
  text: string // what the captions show (as written)
  name: string
  speaker?: SpeakerId
  pause: number // seconds of quiet after the voice
}

export interface PlanOptions { doubts: boolean; predicts: boolean }

export function planLesson(l: Lesson, o: PlanOptions): Plan[] {
  const out: Plan[] = []
  const lang: LessonLang = l.lang ?? 'hi'
  const W = lang === 'en' ? WORDS_EN : WORDS_HI
  const spoken = (s: string) => (lang === 'en' ? verbalizeEn(s) : isSpoken(s) ? s : latinToHindi(verbalize(s)))
  if (l.topic) out.push({ card: { kind: 'title', lang, title: l.topic, text: W.title }, say: spoken(l.topic), text: l.topic, name: shorten(l.topic, 40), pause: 0.6 })
  const add = (t: Turn) => {
    const c = CHARACTERS[t.speaker]
    const tag = t.branch ? W.branch : sectionLabel(t.section, lang)
    const steps = formulaSteps(t.formula)
    const name = `${t.id}. ${nameOf(c, lang)}`
    if (steps.length < 2) {
      const words = t.readFormula && steps.length ? `${t.line} ${steps[0]}` : t.line
      out.push({ card: { kind: 'say', lang, speaker: t.speaker, text: t.line, formula: t.formula, tag }, say: spoken(words), text: words, name, speaker: t.speaker, pause: pauseAfter(t.line, c.pause) })
      return
    }
    // a worked formula: the board fills one line at a time, each read out as it appears
    steps.forEach((st, k) => {
      const words = k === 0 ? `${t.line} ${st}` : `${W.then}, ${st}`
      out.push({
        card: { kind: 'say', lang, speaker: t.speaker, text: t.line, formula: t.formula, step: k + 1, tag },
        say: spoken(words), text: k === 0 ? `${t.line} ${st}` : st, name: k === 0 ? name : `${name} (${k + 1})`, speaker: t.speaker,
        pause: k === steps.length - 1 ? pauseAfter(t.line, c.pause) : 0.45,
      })
    })
  }
  const same = (a: number | string, b: number | string) => String(a) === String(b)
  for (const t of l.turns) {
    add(t)
    if (o.predicts) for (const p of l.predicts.filter((p) => same(p.after, t.id))) out.push(...predictPlans(p, spoken, lang))
    if (o.doubts) for (const b of l.branches.filter((b) => same(b.after, t.id))) b.turns.forEach(add)
  }
  return out
}

export const optionLetters = (lang: LessonLang = 'hi') => (lang === 'en' ? ['A', 'B', 'C', 'D'] : ['अ', 'ब', 'स', 'द'])

const bare = (s: string) => s.replace(/[\s.।!]+$/, '')

function predictPlans(p: Predict, spoken: (s: string) => string, lang: LessonLang): Plan[] {
  const letters = optionLetters(lang)
  const en = lang === 'en'
  const opt = (i: number) => `${en ? 'option' : 'विकल्प'} ${letters[i] ?? i + 1}`
  const ask = en
    ? `Pause and think. ${p.q} ${p.options.map((o, i) => `${opt(i)}: ${bare(o)}`).join('. ')}.`
    : `अब रुककर सोचिए। ${p.q} ${p.options.map((o, i) => `${opt(i)}: ${bare(o)}`).join('। ')}।`
  const right = bare(p.options[p.answer])
  const why = p.why[p.answer] ?? ''
  const reveal = en ? `The right answer is ${opt(p.answer)}: ${right}. ${why}` : `सही उत्तर है ${opt(p.answer)}: ${right}। ${why}`
  const W = en ? WORDS_EN : WORDS_HI
  return [
    { card: { kind: 'ask', lang, title: p.q, text: p.q, options: p.options, tag: W.ask }, say: spoken(ask), text: p.q, name: `${en ? 'Think' : 'सोचो'}: ${shorten(p.q, 30)}`, pause: THINK_PAUSE },
    { card: { kind: 'reveal', lang, title: p.q, text: why, options: p.options, answer: p.answer, tag: W.answer }, say: spoken(reveal).trim(), text: why ? `${right}. ${why}` : right, name: `${W.answer}: ${shorten(p.q, 30)}`, pause: 0.6 },
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

const FONT = 'Noto Sans Devanagari'

/** Where the speaker's round badge sits on a W×H card (the same on every card, so a speaking avatar can be drawn over it). */
export function avatarSpot(W: number, H: number) {
  const u = Math.min(W, H)
  const padX = W * (W > H ? 0.07 : 0.08)
  const base = u * 0.05
  const r = base * 0.85
  return { x: padX + r, y: H * 0.07 + r, r, base }
}

/**
 * The speaker's badge: a round initial. While they speak (`level` 0..1 from the voice), soft rings pulse round it
 * with the sound, kept clear of the name and the words.
 */
export function paintAvatar(g: CanvasRenderingContext2D, card: DialogueCard, W: number, H: number, level: number | null) {
  const sp = card.speaker ? CHARACTERS[card.speaker] : null
  if (!sp) return
  const { x, y, r } = avatarSpot(W, H)
  if (level != null) {
    for (let k = 2; k >= 1; k--) {
      g.globalAlpha = (0.14 + level * 0.2) / k
      g.fillStyle = sp.color
      g.beginPath(); g.arc(x, y, r * (1 + k * (0.06 + level * 0.12)), 0, Math.PI * 2); g.fill()
    }
    g.globalAlpha = 1
  }
  g.fillStyle = sp.color
  g.beginPath(); g.arc(x, y, r * (1 + (level ?? 0) * 0.05), 0, Math.PI * 2); g.fill()
  g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(r * 1.1)}px "${FONT}"`; g.textAlign = 'center'; g.textBaseline = 'top'
  const name = nameOf(sp, card.lang).replace(/^(प्रो|डॉ|Prof|Dr)\.\s*/, '')
  g.fillText([...name][0] ?? '', x, y - r * 0.58)
  g.textAlign = 'left'
}

/** Draws one conversation card on `g` (W×H). The font must be ready (see drawDialogueCard). */
export function paintDialogueCard(g: CanvasRenderingContext2D, card: DialogueCard, theme: CardTheme, W: number, H: number) {
  const font = FONT
  const u = Math.min(W, H)
  const sp = card.speaker ? CHARACTERS[card.speaker] : null
  const lang = card.lang ?? 'hi'
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
    paintAvatar(g, card, W, H, null)
    g.textBaseline = 'top'
    g.fillStyle = theme.title; g.font = `700 ${Math.round(base * 1.05)}px "${font}"`
    g.fillText(nameOf(sp, lang), padX + r * 2.4, y + r * 0.05)
    g.fillStyle = theme.text; g.font = `400 ${Math.round(base * 0.62)}px "${font}"`
    g.fillText(roleOf(sp, lang), padX + r * 2.4, y + r * 1.15)
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
    // the formula, when there is one, sits on a board under the words; a worked one fills in line by line
    const steps = formulaSteps(card.formula)
    const shown = card.step ? Math.min(steps.length, Math.max(1, card.step)) : steps.length
    // sized for the full board, so the words do not jump while the lines come in
    const k = fit([{ text: card.text, size: 1, weight: 500, color: theme.title }, ...steps.map((st) => ({ text: st, size: 1.1, weight: 700, color: accent }))], steps.length ? 1.2 : 0.3, base * 1.15)
    g.font = `500 ${Math.round(k)}px "${font}"`; g.fillStyle = theme.title
    for (const l of wrapText(g, card.text, boxW)) { g.fillText(l, padX, y); y += k * lh }
    if (steps.length) {
      y += k * 0.5
      g.font = `700 ${Math.round(k * 1.1)}px "${font}"`
      const wrapped = steps.map((st) => wrapText(g, st, boxW - k * 2))
      const bh = wrapped.reduce((n, w) => n + w.length, 0) * k * 1.1 * lh + k * 0.9
      g.fillStyle = accent; g.globalAlpha = 0.12
      g.fillRect(padX, y, boxW, bh); g.globalAlpha = 1
      g.fillStyle = accent; g.fillRect(padX, y, Math.max(6, u * 0.008), bh)
      let fy = y + k * 0.45
      wrapped.forEach((lines, i) => {
        if (i >= shown) return
        // the newest line of a worked formula stands out
        g.fillStyle = card.step && steps.length > 1 && i === shown - 1 ? accent : theme.title
        for (const l of lines) { g.fillText(l, padX + k, fy); fy += k * 1.1 * lh }
      })
    }
  } else {
    // a question with its four options; on the answer card the right one is lit
    const opts = card.options ?? []
    const labels = optionLetters(lang)
    const k = fit([{ text: card.title ?? '', size: 1, weight: 700, color: theme.title }, ...opts.map((o) => ({ text: `${labels[0]}. ${o}`, size: 0.85, weight: 400, color: theme.text }))], 0.5, base * 1.05)
    g.font = `700 ${Math.round(k)}px "${font}"`; g.fillStyle = theme.title
    for (const l of wrapText(g, card.title ?? '', boxW)) { g.fillText(l, padX, y); y += k * lh }
    y += k * 0.4
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
}

/** Draws one conversation card at W×H and returns it as a PNG. */
export async function drawDialogueCard(card: DialogueCard, theme: CardTheme, W: number, H: number): Promise<Blob> {
  await ensureFont(FONT)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  paintDialogueCard(c.getContext('2d')!, card, theme, W, H)
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'))
}

/**
 * A card whose speaker's badge moves with their voice: `level` holds the loudness `fps` times a second, starting
 * `speechAt` seconds into the clip. Returns null where the device can't make video (the still card is used then).
 */
export async function renderTalkingCard(card: DialogueCard, theme: CardTheme, W: number, H: number, seconds: number, speechAt: number, level: Float32Array, fps = 15): Promise<{ blob: Blob; ext: string } | null> {
  await ensureFont(FONT)
  const still = document.createElement('canvas')
  still.width = W; still.height = H
  paintDialogueCard(still.getContext('2d')!, card, theme, W, H)
  const { renderCanvasVideo } = await import('./canvasVideo')
  const speechEnd = speechAt + level.length / fps
  return renderCanvasVideo(W, H, seconds, [[speechAt, Math.min(seconds, speechEnd)]], (g, t) => {
    g.drawImage(still, 0, 0)
    const f = Math.floor((t - speechAt) * fps)
    paintAvatar(g, card, W, H, f >= 0 && f < level.length ? level[f] : 0)
  }, fps)
}

/** The whole lesson as scenes: a card each, with the spoken form kept apart from the caption text. */
export async function lessonToScenes(l: Lesson, o: PlanOptions, theme: CardTheme, W: number, H: number, progress: (p: number) => void, talking = false): Promise<Scene[]> {
  const plans = planLesson(l, o)
  const scenes: Scene[] = []
  for (let i = 0; i < plans.length; i++) {
    progress(i / plans.length)
    const p = plans[i]
    scenes.push({
      id: uid(), image: await drawDialogueCard(p.card, theme, W, H), name: p.name, text: p.text, say: p.say, speaker: p.speaker, pause: p.pause, duration: null,
      ...(talking && p.speaker ? { talk: { card: p.card, theme: theme.id } } : {}),
    })
  }
  return scenes
}
