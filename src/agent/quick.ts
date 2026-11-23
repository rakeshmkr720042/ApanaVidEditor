/**
 * Quick commands: everyday edit requests understood WITHOUT any AI (instant, offline, works on every phone).
 * Hindi, Hinglish and English: "saare clips black and white karo", "2 sec pe kaato", "music mute",
 * "9:16 bana do", "10 se 20 second tak hatao", "upar 'Happy Diwali' likho".
 * A request with parts it can't place returns them in `left`, so the AI (when set up) can take the whole thing.
 */
import type { AgentCtx, Plan, Step } from './types'
import { FILTERS } from '../engine/filters'
import { EFFECTS } from '../engine/effects'
import { TRANSITIONS } from '../engine/transitions'
import { CAMERA_PRESETS } from '../model/camera'
import { namedIn } from './find'
import { OPENABLE, colorOf } from './tools'

const DEV = '०१२३४५६७८९'
const NUM_WORDS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, sat: 7, aath: 8, nau: 9, das: 10, dus: 10,
  bees: 20, tees: 30, chalis: 40, pachas: 50, aadha: 0.5, adha: 0.5, dedh: 1.5, dhai: 2.5, dhaai: 2.5,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'आधा': 0.5,
}
const UNIT = String.raw`(?:seconds|second|seconde|secs|sec|sekand|s|सेकंड|सेकेंड)`
const ORD: Record<string, number> = { first: 1, pehla: 1, pehli: 1, pahla: 1, pahli: 1, 'पहला': 1, 'पहली': 1, second: 2, dusra: 2, dusri: 2, doosra: 2, 'दूसरा': 2, 'दूसरी': 2, third: 3, teesra: 3, teesri: 3, tisra: 3, 'तीसरा': 3, 'तीसरी': 3, fourth: 4, chautha: 4, chauthi: 4, fifth: 5, paanchva: 5, paanchvi: 5 }

/** Lower case, Hindi digits → 0-9, number words before a unit → digits, "1:30" → 90, "2 min 10 sec" → 130. */
export function normalize(input: string): string {
  let s = ` ${input.toLowerCase().replace(/[०-९]/g, (d) => String(DEV.indexOf(d))).replace(/[“”"‘’]/g, '"').replace(/\s+/g, ' ').trim()} `
  // number words only next to a unit or "clip", so "kar do" keeps its "do"
  s = s.replace(new RegExp(String.raw`(\s)(${Object.keys(NUM_WORDS).join('|')})(?=\s+(?:${UNIT.slice(3, -1)}|min|minute|मिनट|clip|clips|क्लिप)\b)`, 'gu'), (_m, sp, w) => `${sp}${NUM_WORDS[w]}`)
  s = s.replace(/(\d+):([0-5]\d)(?![\d:])/g, (all, m, sec) => (/^(9:16|16:9|21:9|4:5|4:3|3:4|1:1)$/.test(all) ? all : `${Number(m) * 60 + Number(sec)} sec`))
  s = s.replace(new RegExp(String.raw`(\d+(?:\.\d+)?)\s*(?:min|minute|minutes|मिनट)\s*(?:(\d+(?:\.\d+)?)\s*${UNIT})?`, 'gu'), (_m, m, sec) => `${Number(m) * 60 + Number(sec ?? 0)} sec`)
  // phrases with "and" in them stay whole when the request is split at "and" / "aur"
  s = s.replace(/black\s*(?:and|&|n|aur|or)\s*white|b\s*&\s*w|ब्लैक एंड व्हाइट|काला सफ़ेद/gu, 'blackandwhite').replace(/\bin\s*(?:and|aur|&)\s*out\b/g, 'in-out')
  return s.replace(/\s+/g, ' ').trim()
}

/** The request as typed, to take text back in its own capitals ("Happy Diwali", not "happy diwali"). */
let typed = ''
const original = (lower: string) => {
  const i = typed.toLowerCase().indexOf(lower)
  return i >= 0 ? typed.slice(i, i + lower.length) : lower
}

/** Splits "x aur y, phir z" into its parts. Quoted text stays whole. */
export function clauses(s: string): string[] {
  const quoted: string[] = []
  const masked = s.replace(/"[^"]*"/g, (q) => { quoted.push(q); return `\u0001q${quoted.length - 1}\u0001` })
  return masked.split(/\s*(?:,|;|।|\.\s|\band then\b|\bthen\b|\bphir\b|\bfir\b|\bऔर फिर\b|\bfor\b(?=\s+all)|\baur\b|\band\b|\bauur\b|\bऔर\b|\bतथा\b)\s*/u)
    .map((x) => x.replace(new RegExp(String.raw`\u0001q(\d+)\u0001`, 'g'), (_m, i) => quoted[Number(i)]).trim()).filter((x) => x.length > 1)
}

const has = (s: string, re: RegExp) => re.test(s)
const secOf = (s: string): number | null => {
  const m = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${UNIT}(?![a-z])`, 'u').exec(s)
  return m ? Number(m[1]) : null
}
const HERE = /\b(yahan|yaha|yahin|here|abhi|playhead|is jagah)\b|यहाँ|यहां|यहीं/u

/** Which clips the words point at, or `fallback`. */
export function clipRef(s: string, ctx: AgentCtx, fallback: 'all' | 'selected' = ctx.sel?.type === 'clip' ? 'selected' : 'all'): Step['args']['clips'] {
  const nums = [...s.matchAll(/(?:clip|क्लिप)\s*(?:no\.?|number|नंबर|#)?\s*(\d+)/gu)].map((m) => Number(m[1]))
  const before = [...s.matchAll(/(\d+)(?:st|nd|rd|th|वीं|वाँ|va|vi)?\s*(?:clip|clips|क्लिप)/gu)].map((m) => Number(m[1]))
  const list = [...nums, ...before].filter((n) => n > 0)
  for (const [w, n] of Object.entries(ORD)) if (new RegExp(String.raw`(^|\s)${w}\s+(?:clip|क्लिप)`, 'u').test(s)) list.push(n)
  if (list.length) return [...new Set(list)]
  if (/\b(aakhri|akhri|aakhiri|last|antim|end wali|end wala)\b|आख़िरी|आखिरी|अंतिम/u.test(s)) return 'last'
  if (/\b(saare|sare|saari|sari|sabhi|sab|all|har|every|poore|pura|puri|poori)\b|सारे|सारी|सभी|हर|पूरी|पूरा/u.test(s)) return 'all'
  if (/\b(is|iss|ye|yeh|this|selected|chuni|isko|isse)\b|इस|ये|इसको/u.test(s)) return 'selected'
  if (HERE.test(s)) return 'current'
  return fallback
}

type Rule = (s: string, ctx: AgentCtx) => Step | Step[] | null
const UP = /\b(badhao|badha do|badhaao|zyada|jyada|more|increase|up|high|tez|bright karo|upar|boost)\b|बढ़ाओ|ज़्यादा|ज्यादा/u
const DOWN = /\b(kam|ghatao|less|decrease|down|low|dheema|halka|reduce)\b|कम|घटाओ/u
const amount = (s: string) => (/\b(bahut|very|much|zyada|jyada|kaafi|bohot|bht)\b|बहुत/u.test(s) ? 0.3 : /\b(thoda|thodi|little|slightly|halka)\b|थोड़ा|थोड़ी/u.test(s) ? 0.1 : 0.15)

const RULES: Rule[] = [
  // video shape
  (s) => {
    const m = /\b(9[:x/ ]16|16[:x/ ]9|1[:x/ ]1|4[:x/ ]5|4[:x/ ]3|21[:x/ ]9)\b/.exec(s)
    if (m) return { tool: 'set_aspect', args: { aspect: m[1].replace(/[x/ ]/, ':') } }
    if (has(s, /\b(reel|reels|shorts?|instagram|vertical|khada|portrait|tiktok)\b|रील|खड़ा/u) && !has(s, /subtitle|caption|text|likh|reframe/)) return { tool: 'set_aspect', args: { aspect: '9:16' } }
    if (has(s, /\b(square|chakor|chaukor)\b|चौकोर/u)) return { tool: 'set_aspect', args: { aspect: '1:1' } }
    if (has(s, /\b(youtube|landscape|wide|leta)\b/) && has(s, /\b(format|size|shape|aakar|bana|karo|kar do|ratio)\b|बना|करो/u)) return { tool: 'set_aspect', args: { aspect: '16:9' } }
    return null
  },
  // mute / unmute
  (s, ctx) => {
    const music = has(s, /\b(music|gaana|gana|song|bgm|background music|audio track)\b|गाना|म्यूज़िक|संगीत/u)
    if (has(s, /\b(unmute|awaaz wapas|sound on|awaaz chalu)\b|अनम्यूट/u)) return music ? { tool: 'music_volume', args: { volume: 1, kind: 'all' } } : { tool: 'set_volume', args: { clips: clipRef(s, ctx), volume: 1 } }
    if (has(s, /\b(mute|silent|chup|awaaz band|aawaz band|sound band|sound off|bina awaaz)\b|म्यूट|आवाज़ बंद|आवाज बंद/u)) {
      return music ? { tool: 'music_volume', args: { volume: 0, kind: 'all' } } : { tool: 'set_volume', args: { clips: clipRef(s, ctx), volume: 0 } }
    }
    return null
  },
  // volume
  (s, ctx) => {
    if (!has(s, /\b(volume|awaaz|aawaz|awaz|sound|loud)\b|आवाज़|आवाज|वॉल्यूम/u)) return null
    const music = has(s, /\b(music|gaana|gana|song|bgm)\b|गाना/u)
    const pc = /(\d+)\s*(?:%|percent|pratishat|प्रतिशत)/u.exec(s)
    let v = pc ? Number(pc[1]) / 100 : has(s, UP) ? (amount(s) >= 0.3 ? 1.8 : 1.4) : has(s, DOWN) ? (amount(s) >= 0.3 ? 0.2 : 0.5) : null
    if (v == null) return null
    v = Math.max(0, Math.min(2, v))
    return music ? { tool: 'music_volume', args: { volume: v, kind: 'all' } } : { tool: 'set_volume', args: { clips: clipRef(s, ctx), volume: v } }
  },
  // speed
  (s, ctx) => {
    const x = /(\d+(?:\.\d+)?)\s*x\b|\b(?:speed|raftar)\s*(\d+(?:\.\d+)?)/.exec(s)
    if (x && has(s, /speed|fast|slow|tez|dheere|raftar|x\b|रफ़्तार|तेज़/u)) return { tool: 'set_speed', args: { clips: clipRef(s, ctx), speed: Number(x[1] ?? x[2]) } }
    if (has(s, /\b(slow ?mo|slow motion|slowmo)\b|स्लो मोशन/u)) return { tool: 'set_speed', args: { clips: clipRef(s, ctx), speed: 0.5 } }
    if (has(s, /\b(double speed|fast karo|tez karo|fast kar do|speed up|speed badhao)\b|तेज़ करो/u)) return { tool: 'set_speed', args: { clips: clipRef(s, ctx), speed: 2 } }
    if (has(s, /\b(dheere karo|slow karo|slow kar do|speed kam|slow down)\b|धीरे करो/u)) return { tool: 'set_speed', args: { clips: clipRef(s, ctx), speed: 0.5 } }
    return null
  },
  // reset look
  (s, ctx) => (has(s, /\b(filter|effect|look|rang)\b.*\b(hatao|hata do|remove|off|band)\b|\b(original look|pehle jaisa|reset look|reset)\b|फ़िल्टर हटाओ/u)
    ? (has(s, /effect/) && !has(s, /filter|look/) ? { tool: 'set_effect', args: { clips: clipRef(s, ctx), name: 'none' } }
      : has(s, /filter/) && !has(s, /effect|reset|original|pehle/) ? { tool: 'set_filter', args: { clips: clipRef(s, ctx), name: 'none' } }
        : { tool: 'reset_look', args: { clips: clipRef(s, ctx) } }) : null),
  // transitions
  (s) => {
    if (!has(s, /\b(transition|transitions)\b|ट्रांज़िशन|ट्रांजिशन/u)) return null
    const t = namedIn(TRANSITIONS, s)
    const d = secOf(s)
    const nums = [...s.matchAll(/(?:clip|क्लिप)\s*(\d+)/gu)].map((m) => Number(m[1]))
    if (has(s, /\b(hatao|remove|none|off|band)\b|हटाओ/u)) return { tool: 'set_transition', args: { after: nums.length ? nums : 'all', name: 'none' } }
    return { tool: 'set_transition', args: { after: nums.length ? nums : 'all', name: t?.id ?? 'fade', ...(d ? { duration: d } : {}) } }
  },
  // camera moves
  (s, ctx) => {
    if (!has(s, /\b(camera|cam|handheld|earthquake|bhukamp|dutch|crash zoom|push in|pull back)\b|कैमरा/u)) return null
    const c = namedIn(CAMERA_PRESETS, s) ?? (has(s, /earthquake|bhukamp|bhookamp/) ? CAMERA_PRESETS.find((x) => x.id === 'quake') : has(s, /shake|hil/) ? CAMERA_PRESETS.find((x) => x.id === 'handheld') : has(s, /zoom/) ? CAMERA_PRESETS.find((x) => x.id === 'push') : null)
    return c ? { tool: 'camera_move', args: { clips: clipRef(s, ctx), move: c.id } } : null
  },
  // background
  (s) => {
    if (!has(s, /\b(background|bg|backdrop)\b|बैकग्राउंड/u) || has(s, /remove|hatao|music/)) return null
    const bg = has(s, /\bblur\b|धुंधला/u) ? 'blur' : (s.split(' ').map(colorOf).find(Boolean) ?? null)
    return bg ? { tool: 'set_background', args: { background: bg } } : null
  },
  // delete texts / subtitles
  (s) => (has(s, /\b(text|texts|subtitle|subtitles|caption|captions|title)\b.*\b(hatao|hata do|delete|remove|mitao|nikalo)\b|टेक्स्ट हटाओ|सबटाइटल हटाओ/u)
    ? { tool: 'delete_texts', args: { texts: has(s, /subtitle|caption/) ? 'subtitles' : 'all' } } : null),
  // karaoke / word highlight on subtitles
  (s) => (has(s, /\b(karaoke|word by word|word highlight|shabd)\b|कराओके/u) ? { tool: 'style_text', args: { texts: 'subtitles', words: 'karaoke' } } : null),
  // add text: "upar 'Happy Diwali' likho 3 sec ke liye"
  (s) => {
    const q = /"([^"]{1,300})"/.exec(s)
    if (!q && !has(s, /likh|write|लिख/u)) return null
    if (has(s, /\b(marker|chapter)\b|मार्कर/u)) return null
    let text = q?.[1]?.trim() ?? ''
    if (!q) {
      // "likho Happy Diwali" or "Happy Diwali likho": the words around "likho", without place/time words
      const tidy = (x: string) => x.replace(/\b(upar|neeche|niche|beech me|top|bottom|middle|par|pe|mein|me|ke liye|for|at|on|the video|video|text|title|ek|a|naam)\b|ऊपर|नीचे/gu, ' ')
        .replace(/\d+(?:\.\d+)?\s*(?:s|sec|second|seconds|सेकंड)\b/gu, '').replace(/\s+/g, ' ').trim()
      const after = /(?:likho|likh do|likhiye|likh|write|लिखो|लिख दो)\s*[:-]?\s*(.*)$/u.exec(s)?.[1] ?? ''
      const before = /^(.*?)\s*(?:likho|likh do|likhiye|likh|write|लिखो|लिख दो)/u.exec(s)?.[1] ?? ''
      text = tidy(after) || tidy(before)
      if (!text) return null
      const o = original(text)
      text = o !== text ? o : text.charAt(0).toUpperCase() + text.slice(1)
    } else text = original(text)
    if (!text) return null
    const pos = /\b(upar|top|ऊपर)\b|ऊपर/u.test(s) ? 'top' : /\b(neeche|niche|bottom|नीचे)\b|नीचे/u.test(s) ? 'bottom' : undefined
    const dur = /(?:for|ke liye|tak)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds|सेकंड)|(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds|सेकंड)\s*(?:ke liye|for|tak|तक)/u.exec(s)
    const at = /(?:at|pe|par|पर|पे)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds|सेकंड)|(\d+(?:\.\d+)?)\s*(?:s|sec|second|seconds|सेकंड)\s*(?:pe|par|पर|पे)/u.exec(s)
    const start = has(s, /\b(shuru|start|beginning|shuruaat)\b|शुरू/u) ? 'start' : at ? Number(at[1] ?? at[2]) : 'playhead'
    return { tool: 'add_text', args: { text, at: start, ...(dur ? { duration: Number(dur[1] ?? dur[2]) } : {}), ...(pos ? { position: pos } : {}) } }
  },
  // remove a stretch: "10 se 20 second tak hatao"
  (s) => {
    const m = new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${UNIT}?\s*(?:se|from|-|to|से)\s*(\d+(?:\.\d+)?)\s*${UNIT}?\s*(?:tak|तक)?`, 'u').exec(s)
    if (!m || !has(s, /\b(hatao|hata do|delete|remove|kaato|kaat do|cut|nikalo|mitao|trim)\b|हटाओ|काटो|निकालो/u)) return null
    return { tool: 'delete_range', args: { from: Number(m[1]), to: Number(m[2]) } }
  },
  // trim a clip: "pehli clip ke shuru se 2 sec kaato"
  (s, ctx) => {
    if (!has(s, /\b(trim|shuru se|start se|aakhir se|end se|last se|starting se|ending se)\b|शुरू से|आख़िर से/u)) return null
    const n = secOf(s)
    if (n == null) return null
    const end = has(s, /\b(aakhir|akhir|end|last|ending|antim)\b|आख़िर|आखिर/u) && !has(s, /\b(shuru|start|starting)\b/)
    return { tool: 'trim_clip', args: { clip: clipRef(s, ctx, 'selected'), ...(end ? { cut_end: n } : { cut_start: n }) } }
  },
  // brightness, contrast, saturation…
  (s, ctx) => {
    if (has(s, /\b(filter|look|effect)\b|फ़िल्टर/u)) return null
    const keys: [RegExp, string][] = [
      [/\b(bright|brightness|roshni|ujala|ujaala|light)\b|रोशनी|उजाला|ब्राइट/u, 'brightness'], [/\b(dark|andhera|andhere)\b|अंधेरा/u, 'brightness'],
      [/\b(contrast)\b|कॉन्ट्रास्ट/u, 'contrast'], [/\b(saturation|colorful|colourful|rang|rangeen)\b|रंग|रंगीन/u, 'saturation'],
      [/\b(warm|garam|warmth)\b/u, 'temperature'], [/\b(cool|thanda|cold)\b/u, 'temperature'], [/\b(sharp|sharpen|sharpness|saaf)\b/u, 'sharpen'],
      [/\b(vignette)\b/u, 'vignette'], [/\b(exposure)\b/u, 'exposure'],
    ]
    for (const [re, key] of keys) {
      if (!re.test(s)) continue
      const neg = (key === 'brightness' && /\b(dark|andhera|andhere)\b|अंधेरा/u.test(s) && !has(s, DOWN)) || (key === 'temperature' && /\b(cool|thanda|cold)\b/u.test(s)) || (has(s, DOWN) && !has(s, UP))
      if (!(has(s, UP) || has(s, DOWN) || /\b(karo|kar do|lagao|bana do|thoda|bahut)\b|करो/u.test(s))) continue
      return { tool: 'adjust', args: { clips: clipRef(s, ctx), mode: 'add', [key]: (neg ? -1 : 1) * amount(s) } }
    }
    return null
  },
  // effects (named)
  (s, ctx) => {
    const e = namedIn(EFFECTS, s)
    if (!e || (!has(s, /\b(effect|lagao|laga do|daalo|add|karo|kar do|bana do|banao|chahiye)\b|इफ़ेक्ट|लगाओ|करो/u))) return null
    return { tool: 'set_effect', args: { clips: clipRef(s, ctx), name: e.id } }
  },
  // filters (named)
  (s, ctx) => {
    const f = namedIn(FILTERS, s)
    if (!f) return null
    if (!has(s, /\b(filter|look|lagao|laga do|daalo|karo|kar do|bana do|banao|chahiye|style|jaisa|wala|apply)\b|फ़िल्टर|लगाओ|करो|बना दो/u)) return null
    const pc = /(\d+)\s*%/.exec(s)
    return { tool: 'set_filter', args: { clips: clipRef(s, ctx), name: f.id, ...(pc ? { amount: Number(pc[1]) / 100 } : {}) } }
  },
  // split at a time or here
  (s, ctx) => {
    if (!has(s, /\b(split|cut|kaato|kaat do|kaat|todo|tod do|kato)\b|काटो|काट दो|तोड़ो/u)) return null
    const times = [...s.matchAll(new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${UNIT}`, 'gu'))].map((m) => Number(m[1]))
    if (times.length) return { tool: 'split_at', args: { times } }
    if (HERE.test(s) || has(s, /\b(split|cut|kaato|kaat do)\b/)) return { tool: 'split_at', args: { times: ['playhead'] } }
    void ctx
    return null
  },
  // delete / duplicate / move clips
  (s, ctx) => {
    if (has(s, /\b(delete|hatao|hata do|remove|nikalo|mitao|mita do)\b|हटाओ|हटा दो|निकालो/u) && has(s, /clip|क्लिप/u)) return { tool: 'delete_clips', args: { clips: clipRef(s, ctx, 'selected') } }
    if (has(s, /\b(duplicate|copy|dobara|double)\b|कॉपी/u) && has(s, /clip|क्लिप/u)) return { tool: 'duplicate_clip', args: { clips: clipRef(s, ctx, 'selected') } }
    const sw = /(?:clip|क्लिप)\s*(\d+)\s*(?:aur|and|और|,)\s*(?:clip|क्लिप)?\s*(\d+)\s*.*\b(swap|badlo|exchange|adla badli)\b/u.exec(s)
    if (sw) return { tool: 'move_clip', args: { clip: Number(sw[1]), to: Number(sw[2]), swap: true } }
    const mv = /(?:clip|क्लिप)\s*(\d+)\s*(?:ko)?\s*(\d+)\s*(?:number|no|nambar|par|pe|position|jagah|place)/u.exec(s)
    if (mv && has(s, /\b(move|le jao|rakho|shift)\b/)) return { tool: 'move_clip', args: { clip: Number(mv[1]), to: Number(mv[2]) } }
    return null
  },
  // rotate / flip / fit
  (s, ctx) => {
    if (has(s, /\b(flip|mirror|ulta|ulat|ulta karo)\b|उल्टा|मिरर/u)) return { tool: 'rotate_flip', args: { clips: clipRef(s, ctx), flip: has(s, /vertical|upside|neeche upar/) ? 'vertical' : 'horizontal' } }
    if (has(s, /\b(rotate|ghumao|ghuma do|turn)\b|घुमाओ/u)) {
      const d = /(-?\d+)\s*(?:°|degree|deg|digri)/.exec(s) ?? /(?:^|\s)(-?(?:90|180|270))(?:\s|$)/.exec(s)
      return { tool: 'rotate_flip', args: { clips: clipRef(s, ctx), degrees: d ? Number(d[1]) : has(s, /\b(left|baayen|baen|ulta)\b/) ? -90 : 90 } }
    }
    if (has(s, /\b(fill|full screen|poora bhar|bhar do|crop to fill)\b/)) return { tool: 'fit', args: { clips: clipRef(s, ctx), mode: 'fill' } }
    if (has(s, /\b(fit|poora dikhe|black bars)\b/)) return { tool: 'fit', args: { clips: clipRef(s, ctx), mode: 'fit' } }
    return null
  },
  // markers
  (s) => {
    if (!has(s, /\b(marker|chapter|mark)\b|मार्कर/u)) return null
    const t = secOf(s)
    const found = /"([^"]+)"/.exec(s)?.[1] ?? /(?:naam|name|called)\s+(.+)$/.exec(s)?.[1]
    const name = found ? original(found) : undefined
    return { tool: 'add_marker', args: { at: t ?? 'playhead', ...(name ? { name } : {}) } }
  },
  // fades
  (s) => {
    if (!has(s, /\bfade\b|फ़ेड/u) || has(s, /transition/)) return null
    const n = secOf(s) ?? 1
    const music = has(s, /music|gaana|gana|song|गाना/u)
    const inn = has(s, /\bfade ?in\b|shuru|start|शुरू/u), out = has(s, /\bfade ?out\b|\bout\b|\bend\b|aakhir|akhir|\bant\b|आख़िर/u)
    return { tool: 'fade', args: { target: music ? 'music' : 'video', ...(inn || !out ? { in: n } : {}), ...(out || !inn ? { out: n } : {}) } }
  },
  // tools that need the user (subtitles, noise, reframe…)
  (s, ctx) => {
    const o = OPENABLE.find((x) => x.words.some((w) => new RegExp(String.raw`(^|\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\s|$)`, 'u').test(` ${s} `)))
    if (!o) return null
    return { tool: 'open_tool', args: { tool: o.label, ...(o.needs === 'clip' ? { clip: clipRef(s, ctx, 'selected') } : {}) } }
  },
]

const SUBJECT = /\b(aasmaan|asmaan|aasman|sky|aakash|akash|chehra|chehre|face|person|aadmi|ladki|ladka|insaan|object|gaadi|car|cheez|paani|ped|tree|log|logo|bachcha|baal|hair|kapde|shirt)\b|आसमान|आकाश|चेहरा|आदमी|लड़की|लड़का|पेड़|बाल/u

export interface QuickResult { plan: Plan; left: string[] }

/** Understands what it can of `text` without AI. `plan.steps` is empty when nothing matched. */
export function quickPlan(text: string, ctx: AgentCtx): QuickResult {
  typed = text.replace(/[“”‘’]/g, '"')
  const s = normalize(text)
  const steps: Step[] = []
  const left: string[] = []
  for (const part of clauses(s)) {
    // about one thing inside the picture (the sky, a face, a car…): only the AI can judge that, a rule would
    // wrongly change the whole video
    if (SUBJECT.test(part)) { left.push(part); continue }
    let got: Step | Step[] | null = null
    for (const r of RULES) { got = r(part, ctx); if (got) break }
    if (got) steps.push(...(Array.isArray(got) ? got : [got]))
    else if (!/^(please|plz|pls|bhai|bro|ji|kripya|ok|okay|thik hai|theek hai)$/.test(part)) left.push(part)
  }
  return { plan: { understood: text.trim(), steps, missing: [], questions: [], by: 'quick' }, left }
}

/** Examples shown as chips in an empty chat (Hinglish, like users type). */
export const EXAMPLES = [
  'Saare clips pe warm filter lagao',
  '9:16 reel bana do',
  'Clips ke beech fade transition',
  'Upar "Happy Diwali" likho 3 sec ke liye',
  'Music ki awaaz 30% karo',
  '10 se 15 second tak hatao',
  'Subtitle banao',
  'Thoda bright karo',
]
