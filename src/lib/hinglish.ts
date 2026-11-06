/**
 * Hinglish (Hindi typed in English letters) to Devanagari, on this device, no internet.
 *
 * "namaste dosto" -> "नमस्ते दोस्तो", "shubh vivah" -> "शुभ विवाह". Common words come from a small word list
 * (so "main", "hai", "nahi" become मैं, है, नहीं); every other word is spelled out sound by sound:
 * aa/A = ा, i = ि, ee/ii/I = ी, u = ु, oo/uu/U = ू, e = े, ai = ै, o = ो, au = ौ, a consonant with no vowel
 * after it joins the next one (half letter: "pyaar" -> प्यार). Capitals inside a word give the hard letters:
 * T ट, Th ठ, D ड, Dh ढ, N ण, Sh ष, R ड़. A capital at the start of a word is just a capital.
 */

const COMMON: Record<string, string> = {
  main: 'मैं', mai: 'मैं', hain: 'हैं', hai: 'है', mein: 'में', me: 'में', nahi: 'नहीं', nahin: 'नहीं', nhi: 'नहीं',
  haan: 'हाँ', han: 'हाँ', kahan: 'कहाँ', kahaan: 'कहाँ', yahan: 'यहाँ', yahaan: 'यहाँ', wahan: 'वहाँ', wahaan: 'वहाँ',
  kyun: 'क्यों', kyon: 'क्यों', kyu: 'क्यों', aap: 'आप', ap: 'आप', hum: 'हम', ham: 'हम', tum: 'तुम', tu: 'तू',
  bhai: 'भाई', ji: 'जी', shubh: 'शुभ', vivah: 'विवाह', shaadi: 'शादी', shadi: 'शादी', janmdin: 'जन्मदिन',
  mubarak: 'मुबारक', badhai: 'बधाई', dhanyavad: 'धन्यवाद', dhanyawad: 'धन्यवाद', dhanyavaad: 'धन्यवाद',
  namaste: 'नमस्ते', namaskar: 'नमस्कार', pyar: 'प्यार', pyaar: 'प्यार', dil: 'दिल', bharat: 'भारत',
  hindi: 'हिंदी', desh: 'देश', ladki: 'लड़की', ladka: 'लड़का', bada: 'बड़ा', badi: 'बड़ी', bade: 'बड़े',
  chhota: 'छोटा', chota: 'छोटा', choti: 'छोटी', accha: 'अच्छा', achha: 'अच्छा', acha: 'अच्छा', achhi: 'अच्छी',
  sab: 'सब', aur: 'और', ya: 'या', ye: 'ये', yeh: 'यह', woh: 'वह', vo: 'वो', wo: 'वो', kya: 'क्या', ka: 'का',
  ki: 'की', ke: 'के', ko: 'को', se: 'से', par: 'पर', pe: 'पे', tak: 'तक', bhi: 'भी', toh: 'तो', to: 'तो',
  ho: 'हो', hoga: 'होगा', hogi: 'होगी', raha: 'रहा', rahi: 'रही', rahe: 'रहे', kar: 'कर', karo: 'करो',
  karna: 'करना', karen: 'करें', karein: 'करें', din: 'दिन', raat: 'रात', rat: 'रात', saal: 'साल', sal: 'साल',
  naya: 'नया', nayi: 'नई', nai: 'नई', naye: 'नए', mata: 'माता', pita: 'पिता', maa: 'माँ', ma: 'माँ',
  papa: 'पापा', beta: 'बेटा', beti: 'बेटी', ghar: 'घर', paani: 'पानी', pani: 'पानी', khana: 'खाना',
  aaj: 'आज', aj: 'आज', kal: 'कल', abhi: 'अभी', sabse: 'सबसे', bahut: 'बहुत', bohot: 'बहुत', bahot: 'बहुत',
  dosto: 'दोस्तों', doston: 'दोस्तों', dost: 'दोस्त', swagat: 'स्वागत', ram: 'राम', krishna: 'कृष्ण',
  shri: 'श्री', shree: 'श्री', ganesh: 'गणेश', om: 'ॐ', diwali: 'दिवाली', holi: 'होली', eid: 'ईद',
  video: 'वीडियो', channel: 'चैनल', subscribe: 'सब्सक्राइब', like: 'लाइक', share: 'शेयर', comment: 'कमेंट',
  happy: 'हैप्पी', birthday: 'बर्थडे', new: 'न्यू', year: 'ईयर', mera: 'मेरा', meri: 'मेरी', mere: 'मेरे',
  tera: 'तेरा', teri: 'तेरी', tere: 'तेरे', apna: 'अपना', apni: 'अपनी', apne: 'अपने', unka: 'उनका',
  uska: 'उसका', iska: 'इसका', jo: 'जो', koi: 'कोई', kuch: 'कुछ', kuchh: 'कुछ', sirf: 'सिर्फ़', zindagi: 'ज़िंदगी',
  jindagi: 'ज़िंदगी', khushi: 'ख़ुशी', duniya: 'दुनिया', log: 'लोग', logo: 'लोगों', logon: 'लोगों',
  chalo: 'चलो', dekho: 'देखो', suno: 'सुनो', aao: 'आओ', jao: 'जाओ', ek: 'एक', do: 'दो', teen: 'तीन',
  char: 'चार', chaar: 'चार', paanch: 'पाँच', panch: 'पाँच', samay: 'समय', jaldi: 'जल्दी', zaroor: 'ज़रूर',
  jarur: 'ज़रूर', please: 'प्लीज़', thanks: 'थैंक्स', sorry: 'सॉरी', bhagwan: 'भगवान', mandir: 'मंदिर',
  school: 'स्कूल', college: 'कॉलेज', india: 'इंडिया', parivar: 'परिवार', pariwar: 'परिवार', shaam: 'शाम', subah: 'सुबह', pehla: 'पहला', pahla: 'पहला',
}

// [typed, matra after a consonant, letter on its own]; longest first
const VOWELS: [string, string, string][] = [
  ['aa', 'ा', 'आ'], ['ai', 'ै', 'ऐ'], ['au', 'ौ', 'औ'], ['ee', 'ी', 'ई'], ['ii', 'ी', 'ई'], ['oo', 'ू', 'ऊ'],
  ['uu', 'ू', 'ऊ'], ['A', 'ा', 'आ'], ['I', 'ी', 'ई'], ['U', 'ू', 'ऊ'], ['E', 'ै', 'ऐ'], ['O', 'ौ', 'औ'],
  ['a', '', 'अ'], ['i', 'ि', 'इ'], ['u', 'ु', 'उ'], ['e', 'े', 'ए'], ['o', 'ो', 'ओ'],
]

// letters already joined (क्ष, ज्ञ, श्र, च्छ) count as one consonant; longest first
const CONSONANTS: [string, string][] = [
  ['shr', 'श्र'], ['chh', 'छ'], ['cch', 'च्छ'], ['ksh', 'क्ष'], ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'],
  ['jh', 'झ'], ['Th', 'ठ'], ['Dh', 'ढ'], ['Sh', 'ष'], ['Rh', 'ढ़'], ['th', 'थ'], ['dh', 'ध'], ['ph', 'फ'],
  ['bh', 'भ'], ['sh', 'श'], ['gy', 'ज्ञ'], ['k', 'क'], ['g', 'ग'], ['c', 'क'], ['j', 'ज'], ['z', 'ज़'],
  ['T', 'ट'], ['D', 'ड'], ['N', 'ण'], ['R', 'ड़'], ['S', 'श'], ['t', 'त'], ['d', 'द'], ['n', 'न'], ['p', 'प'],
  ['f', 'फ़'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'],
  ['h', 'ह'], ['x', 'क्स'], ['q', 'क'], ['K', 'क'], ['G', 'ग'], ['J', 'ज'], ['P', 'प'], ['B', 'ब'], ['M', 'म'],
  ['Y', 'य'], ['L', 'ल'], ['V', 'व'], ['W', 'व'], ['H', 'ह'], ['F', 'फ़'], ['C', 'क'], ['Z', 'ज़'], ['X', 'क्स'], ['Q', 'क'],
]

const HALANT = '्'
const ANUSVARA = 'ं'
// after these, a typed "n" is a full न (anya -> अन्य), before any other consonant it is the dot ं (hindi -> हिंदी)
const KEEP_N_BEFORE = new Set(['न', 'य', 'र', 'व', 'ह'])

type Tok = { c: string } | { v: [string, string, string] }

function tokens(w: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  outer: while (i < w.length) {
    for (const v of VOWELS) if (w.startsWith(v[0], i)) { out.push({ v }); i += v[0].length; continue outer }
    for (const [k, d] of CONSONANTS) if (w.startsWith(k, i)) { out.push({ c: d }); i += k.length; continue outer }
    return null // not a letter we know
  }
  return out
}

/** One word of English letters (A-Z only) to Devanagari. */
export function hinglishWord(word: string): string {
  if (!word) return word
  const plain = word.toLowerCase()
  // "Namaste" / "NAMASTE" are just capitalised: only capitals inside a word mean the hard letters
  const w = word === plain || word === word.toUpperCase() || word[0] + word.slice(1).toLowerCase() === word ? plain : word
  if (w === plain && COMMON[plain]) return COMMON[plain]
  const toks = tokens(w)
  if (!toks) return word
  let out = ''
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i]
    const prev = toks[i - 1]
    const next = toks[i + 1]
    const last = i === toks.length - 1
    if ('c' in tk) {
      if (tk.c === 'न' && prev && 'v' in prev && next && 'c' in next && !KEEP_N_BEFORE.has(next.c)) { out += ANUSVARA; continue }
      if (prev && 'c' in prev && !(out.endsWith(ANUSVARA))) out += HALANT
      out += tk.c
    } else {
      const afterConsonant = !!prev && 'c' in prev && !out.endsWith(ANUSVARA)
      if (!afterConsonant) { out += tk.v[2]; continue }
      // Hinglish habit: a word ending in "a" or "i" means the long sound (mera -> मेरा, bhi -> भी)
      if (last && toks.length > 1 && tk.v[0] === 'a') out += 'ा'
      else if (last && toks.length > 1 && tk.v[0] === 'i') out += 'ी'
      else out += tk.v[1]
    }
  }
  return out
}

/** Converts every English-letter word in the text; numbers, emoji and Hindi already there stay as they are. */
export function toDevanagari(text: string): string {
  return text.replace(/[A-Za-z]+/g, hinglishWord)
}

/** true when the text has a word in English letters that would change */
export const hasLatinWords = (text: string) => /[A-Za-z]/.test(text)

/**
 * For typing: if the character just typed (before the caret) ends a word, converts that word.
 * Returns the new text and caret, or null when nothing changed.
 */
export function convertWordBeforeCaret(text: string, caret: number): { text: string; caret: number } | null {
  if (caret < 2) return null
  const sep = text[caret - 1]
  if (/[A-Za-z]/.test(sep)) return null
  const before = text.slice(0, caret - 1)
  const m = /[A-Za-z]+$/.exec(before)
  if (!m) return null
  const hindi = hinglishWord(m[0])
  if (hindi === m[0]) return null
  const head = before.slice(0, m.index) + hindi
  // a full stop typed after a Hindi word becomes the Hindi full stop (purna viram)
  const end = sep === '.' && text[caret] !== '.' ? '।' : sep
  return { text: head + end + text.slice(caret), caret: head.length + end.length }
}

/** The word in English letters that is being typed at the caret (for the live preview). */
export function wordAtCaret(text: string, caret: number): string {
  const m = /[A-Za-z]+$/.exec(text.slice(0, caret))
  return m ? m[0] : ''
}
