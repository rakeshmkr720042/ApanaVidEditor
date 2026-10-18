import type { Scene } from '../model/scenes'
import { filesToScenes, isPdf, isPptx, type ImportProgress } from './sceneImport'
import { ask, localAI } from './localai'

/**
 * Raw material: the slides, photos, GIFs and video clips a user already has for a video. Any
 * builder that cuts content into parts (audio chapters, and later script or article sections)
 * can hand each part the piece that fits it, and draw a card itself where nothing does.
 */

export interface Pic extends Scene {
  slide: boolean // a PDF page or PowerPoint slide: shown whole, never cropped
  words: string // what it is about: the slide's text, or its file name when that says something
}

/** Words camera and app file names are made of (IMG_2041, PXL_…, WhatsApp Image … at …): they say nothing about the picture. */
const NAME_NOISE = new Set('img dsc dcim pxl vid mvimg screenshot screen shot whatsapp photo image picture pic snap giphy tenor download downloads untitled scan file at am pm video copy final edited new'.split(' '))

export function wordsOfName(name: string) {
  const w = name.replace(/[_\-.+()[\]]+/g, ' ').replace(/\d+/g, ' ').split(/\s+/).filter((x) => x && !NAME_NOISE.has(x.toLowerCase())).join(' ')
  return /\p{L}{3,}/u.test(w) ? w : ''
}

/** Reads picked files into pictures: every page of a PDF or slide of a .pptx is one. */
export async function picsFromFiles(files: File[], progress: ImportProgress): Promise<Pic[]> {
  const out: Pic[] = []
  for (const f of files) {
    const slide = isPdf(f) || isPptx(f)
    for (const s of await filesToScenes([f], progress)) out.push({ ...s, slide, words: s.text.trim() || wordsOfName(s.name) })
  }
  return out
}

// ---------------------------------------------------------------- matching

const STOP = new Set((
  'the and for are but not you all any can had her was one our out has him his how its may new now old see two way who did get got let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what into about after again also back because before being both could does each even first going great into made most never other really right should since still their there these thing think those through under used using where which while would yeah okay something people things want going'
  + ' और में का की के है हैं यह वह से को पर भी तो एक लिए कर था थी थे नहीं हम आप इस उस जो कि क्या अपने होता होती होते रहा रही रहे गया गई गए करते करना करें किया सकते बहुत सबसे इसके उसके हमारे आपके यहाँ वहाँ जैसे लेकिन अगर तरह बात कुछ सभी दिया दिए हुआ हुई अब फिर साथ बाद पहले वाले वाली वाला'
).split(' '))

/** The words of a text worth matching on, roughly stemmed so "planets" meets "planet". */
export function keywords(s: string): Set<string> {
  const out = new Set<string>()
  for (const m of s.toLowerCase().normalize('NFC').matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const w = m[0]
    if ([...w].length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue
    out.add(w.length > 6 ? w.slice(0, 6) : w.replace(/(es|s)$/, ''))
  }
  return out
}

export type Plan = (number | null)[] // for each part, which picture (index into the pictures) or none

/** Pairs parts and pictures that share words, rarest words counting most. */
export function matchByWords(parts: string[], pics: Pic[]): Plan {
  const plan: Plan = parts.map(() => null)
  const pk = parts.map(keywords)
  const df = new Map<string, number>()
  for (const k of pk) for (const w of k) df.set(w, (df.get(w) ?? 0) + 1)
  const pairs: { p: number; c: number; score: number }[] = []
  pics.forEach((pic, p) => {
    const words = keywords(pic.words)
    pk.forEach((k, c) => {
      let score = 0
      for (const w of words) if (k.has(w)) score += Math.log(1 + parts.length / df.get(w)!)
      if (score >= 1.5) pairs.push({ p, c, score })
    })
  })
  pairs.sort((a, b) => b.score - a.score)
  const used = new Set<number>()
  for (const { p, c } of pairs) if (plan[c] == null && !used.has(p)) { plan[c] = p; used.add(p) }
  return plan
}

/** Asks the user's Local AI which picture goes with which part. Only pictures with words can be judged. */
export async function matchByAI(parts: string[], pics: Pic[]): Promise<Plan> {
  const named = pics.map((p, i) => ({ i, words: p.words.replace(/\s+/g, ' ').slice(0, 220) })).filter((p) => p.words)
  const plan: Plan = parts.map(() => null)
  if (!named.length) return plan
  const out = await ask(
    'You match pictures to the parts of a talk. Each picture belongs to at most one part and each part gets at most one picture. '
    + 'Only match when the picture is clearly about what that part says. Reply with one line per match, like "P2 = C5", and nothing else.',
    `Parts of the talk:\n${parts.map((t, c) => `C${c + 1}: ${t.replace(/\s+/g, ' ').slice(0, 300) || '(no words)'}`).join('\n')}\n\n`
    + `Pictures:\n${named.map((p) => `P${p.i + 1}: ${p.words}`).join('\n')}`,
  )
  const used = new Set<number>()
  for (const m of out.matchAll(/P\s*(\d+)\s*[=:→-]+\s*C\s*(\d+)/gi)) {
    const p = Number(m[1]) - 1, c = Number(m[2]) - 1
    if (!pics[p] || c < 0 || c >= parts.length || plan[c] != null || used.has(p)) continue
    plan[c] = p; used.add(p)
  }
  return plan
}

export type Leftover = 'card' | 'repeat' // parts no picture fits: a drawn card, or the pictures again

/**
 * Gives every picture a part: matched ones keep theirs, the rest go in order into the free parts
 * between their neighbours. Parts still free get nothing (a card) or, with 'repeat', the pictures again.
 */
export function fillInOrder(plan: Plan, count: number, leftover: Leftover): Plan {
  const out = [...plan]
  const placed = new Map<number, number>()
  out.forEach((p, c) => { if (p != null) placed.set(p, c) })
  if (!placed.size && count && leftover === 'repeat') return out.map((_, c) => c % count) // one after another, over and over
  if (!placed.size && count < out.length) {
    // nothing matched: spread the pictures evenly, cards in between
    for (let p = 0; p < count; p++) out[Math.floor((p * out.length) / count)] = p
  } else {
    let cursor = -1
    for (let p = 0; p < count; p++) {
      if (placed.has(p)) { cursor = Math.max(cursor, placed.get(p)!); continue }
      let c = out.findIndex((x, i) => i > cursor && x == null)
      if (c < 0) c = out.findIndex((x) => x == null) // nothing free after it: the first free part
      if (c < 0) break
      out[c] = p; cursor = Math.max(cursor, c)
    }
  }
  if (leftover === 'repeat' && count) {
    let k = 0
    for (let c = 0; c < out.length; c++) if (out[c] == null) out[c] = k++ % count
  }
  return out
}

/** The whole choice for a list of parts: by Local AI when it is on (falling back to words), then in order. */
export async function planPictures(parts: string[], pics: Pic[], leftover: Leftover): Promise<{ plan: Plan; matched: number; byAI: boolean }> {
  if (!pics.length) return { plan: parts.map(() => null), matched: 0, byAI: false }
  const spoken = parts.some((t) => t.trim()) && pics.some((p) => p.words)
  let plan: Plan = parts.map(() => null)
  let byAI = false
  if (spoken && localAI()) {
    try { plan = await matchByAI(parts, pics); byAI = plan.some((x) => x != null) } catch { /* use the words instead */ }
  }
  if (spoken && !byAI) plan = matchByWords(parts, pics)
  const matched = plan.filter((x) => x != null).length
  return { plan: fillInOrder(plan, pics.length, leftover), matched, byAI }
}
