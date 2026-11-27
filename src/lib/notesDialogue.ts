import type { Lesson, LessonLang, Predict, SpeakerId, Turn } from './dialogue'

/**
 * Notes → Deep Dive conversation, with plain rules (no AI). Headings become topics a student asks about, each point
 * is said by one of the two teachers (a "term: meaning" point is first asked as a question by a student), lines with
 * "=" or "→" go on the formula board (lines that follow each other become one worked formula, shown step by step), and
 * headings with lists or definitions give Pause & Predict questions whose wrong options come from the other points.
 */

export interface NoteSection { heading: string; points: NotePoint[] }
export interface NotePoint { text: string; kind: 'point' | 'item' | 'formula'; term?: string; meaning?: string; label?: string }

const DEV = /[ऀ-ॿ]/g
const LAT = /[A-Za-z]/g
/** Hindi when Devanagari letters are the larger part of the text. */
export const notesLang = (text: string): LessonLang => ((text.match(DEV)?.length ?? 0) >= (text.match(LAT)?.length ?? 0) * 0.6 ? 'hi' : 'en')

const BULLET = /^\s*(?:[-*•▪◦–]|\d{1,2}[.)]|[a-z][.)])\s+/i
const isFormula = (s: string) => /[=→⟶]|=>/.test(s) && s.length <= 120
const isHeading = (raw: string, next?: string) => {
  const s = raw.trim()
  if (/^#{1,6}\s+/.test(s)) return true
  // "Causes:" alone on a line, before a list or points
  if (/[:：]$/.test(s) && s.length <= 60 && !isFormula(s)) return true
  // a short line with no full stop, followed by a list
  return !!next && BULLET.test(next) && s.length <= 50 && !/[.!?।]$/.test(s) && !BULLET.test(s) && !isFormula(s)
}
const clean = (s: string) => s.replace(/^#{1,6}\s+/, '').replace(BULLET, '').replace(/[:：]\s*$/, '').replace(/\*\*|__/g, '').trim()

/** "Term: meaning", "Term – meaning", "Term is …", "Term means …" (also "X का मतलब है …"). */
function definition(s: string): { term: string; meaning: string } | null {
  let m = s.match(/^(.{2,40}?)\s*(?::|：|\s[–—-]\s)\s*(.{6,})$/)
  if (m && !/[=→]/.test(m[1])) return { term: m[1].trim(), meaning: m[2].trim() }
  m = s.match(/^((?:the |an? )?[A-Za-z][\w\s'-]{1,38}?)\s+(?:is|are|means|refers to)\s+(.{6,})$/i)
  if (m) return { term: m[1].replace(/^(the|an?)\s+/i, '').trim(), meaning: s }
  m = s.match(/^(.{2,30}?)\s+(?:का मतलब|यानी|अर्थात)\s+(.{6,})$/)
  if (m) return { term: m[1].trim(), meaning: s }
  return null
}

const sentences = (p: string) => p.split(/(?<=[.!?।])\s+(?=\S)/).map((x) => x.trim()).filter((x) => x.length > 1)

/** Splits notes into a title and sections of points. */
export function readNotes(text: string): { title: string; sections: NoteSection[] } {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, ''))
  let title = ''
  const sections: NoteSection[] = []
  let cur: NoteSection | null = null
  const nonEmpty = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim())
  nonEmpty.forEach(({ l }, n) => {
    const next = nonEmpty[n + 1]?.l
    const s = l.trim()
    // the first line is the title when it is a "# heading" or a short line without a full stop
    if (n === 0 && (/^#\s+/.test(s) || (s.length <= 70 && !/[.!?।:]$/.test(s) && !BULLET.test(s) && !isFormula(s)))) { title = clean(s); return }
    if (isHeading(s, next)) { cur = { heading: clean(s), points: [] }; sections.push(cur); return }
    if (!cur) { cur = { heading: '', points: [] }; sections.push(cur) }
    const sec: NoteSection = cur
    const item = BULLET.test(s)
    const body = clean(s)
    if (!body) return
    if (isFormula(body)) {
      // "Formula: a² + b² = c²" keeps its label; lines one after another, or split with ";", are steps of one board
      const lm = body.match(/^([^=→:]{2,40}):\s*(.+)$/)
      const steps = (lm ? lm[2] : body).split(/\s*;\s*/).filter(Boolean)
      const last = sec.points[sec.points.length - 1]
      if (last?.kind === 'formula' && !lm) last.text += '\n' + steps.join('\n')
      else sec.points.push({ kind: 'formula', text: steps.join('\n'), label: lm?.[1].trim() })
      return
    }
    for (const part of item ? [body] : sentences(body)) {
      const d = definition(part)
      sec.points.push({ kind: item ? 'item' : 'point', text: part, ...(d ? { term: d.term, meaning: d.meaning } : {}) })
    }
  })
  const kept = sections.filter((s) => s.points.length || s.heading)
  if (!title) title = kept.find((s) => s.heading)?.heading ?? ''
  return { title, sections: kept }
}

// what the four say around the notes' own words
const SAY = {
  hi: {
    hello: (t: string) => `नमस्ते दोस्तो! आज हम ${t || 'इस विषय'} को आसान बातचीत में समझेंगे। मेरे साथ हैं डॉ. मारिया, और हमारे दो छात्र, डैनियल और नैन्सी।`,
    ready: 'नमस्ते! चलिए शुरू करते हैं।',
    about: (h: string) => (/[?？]$/.test(h) ? h : `सर, ${h} के बारे में बताइए।`),
    what: (t: string) => `${t} क्या होता है?`,
    formula: (label?: string) => (label ? `${label} बोर्ड पर देखिए।` : 'इसे बोर्ड पर लिखकर देखते हैं।'),
    nudge: ['अच्छा, और आगे?', 'समझ गया। और?', 'सर, इसे थोड़ा और समझाइए।', 'यह तो दिलचस्प है!'],
    recap: (hs: string[]) => `तो आज हमने सीखा: ${hs.join(', ')}।`,
    thanks: 'धन्यवाद सर, अब बात साफ़ हो गई!',
    bye: 'बहुत बढ़िया। अगली बार फिर मिलेंगे!',
    qDef: (t: string) => `${t} क्या है?`,
    qList: (h: string) => `इनमें से कौन-सी बात "${h}" के बारे में सही है?`,
  },
  en: {
    hello: (t: string) => `Hello everyone! Today we'll understand ${t || 'this topic'} in an easy conversation. With me is Dr. Maria, and our two students, Daniel and Nancy.`,
    ready: "Hello! Let's begin.",
    about: (h: string) => (/[?]$/.test(h) ? h : `Can you tell us about ${h}?`),
    what: (t: string) => `What is ${t}?`,
    formula: (label?: string) => (label ? `Look at the ${label.toLowerCase()} on the board.` : "Let's write it on the board."),
    nudge: ['Okay, and then?', 'Got it. What next?', 'Could you explain that a bit more?', "That's interesting!"],
    recap: (hs: string[]) => `So today we covered: ${hs.join(', ')}.`,
    thanks: 'Thank you, that is much clearer now!',
    bye: 'Great. See you next time!',
    qDef: (t: string) => `What is ${t}?`,
    qList: (h: string) => `Which of these is true about "${h}"?`,
  },
}

/** An option as shown: short, without its full stop (the card and the voice add their own). */
const cut = (s: string, n = 90) => {
  const x = s.replace(/[\s.।!]+$/, '')
  return x.length > n ? x.slice(0, n).replace(/\s+\S*$/, '') + '…' : x
}
const uniq = (xs: string[], not: string) => [...new Set(xs)].filter((x) => x && x !== not)

/** A fixed, repeatable shuffle of the options (the right one is not always first). */
function placeRight(right: string, wrong: string[], seed: number): { options: string[]; answer: number } {
  const answer = seed % (wrong.length + 1)
  const options = [...wrong]
  options.splice(answer, 0, right)
  return { options, answer }
}

/** Notes → a lesson the Deep Dive maker can turn into scenes. Throws when there is nothing to say. */
export function notesToLesson(text: string, lang: LessonLang = notesLang(text)): Lesson {
  const { title, sections } = readNotes(text)
  if (!sections.some((s) => s.points.length)) throw new Error('Write a few points first: headings, lines or a list')
  const S = SAY[lang]
  const turns: Turn[] = []
  const predicts: Predict[] = []
  let id = 0
  const say = (speaker: SpeakerId, line: string, section: string, formula: string | null = null) => {
    turns.push({ id: ++id, speaker, line, section, formula })
    return id
  }
  const teacher = (n: number): SpeakerId => (n % 2 ? 'maria' : 'thomas')
  const student = (n: number): SpeakerId => (n % 2 ? 'nancy' : 'daniel')
  let ask = 0 // whose turn it is among the students
  let tell = 0 // and among the teachers

  // wrong options for the questions come from the other points
  const allDefs = sections.flatMap((s, si) => s.points.filter((p) => p.term).map((p) => ({ si, term: p.term!, meaning: p.meaning! })))
  const allItems = sections.flatMap((s, si) => s.points.filter((p) => p.kind !== 'formula' && !p.term).map((p) => ({ si, text: p.text })))

  say('thomas', S.hello(title), 'hook')
  say('maria', S.ready, 'hook')
  sections.forEach((sec, si) => {
    let asked = false
    if (sec.heading && sec.heading !== title) {
      const at = say(student(ask++), S.about(sec.heading), 'concept')
      // a Pause & Predict from the heading's list: which point belongs here
      const mine = sec.points.filter((x) => x.kind === 'item')
      const others = [...allItems, ...allDefs.map((d) => ({ si: d.si, text: d.meaning }))].filter((x) => x.si !== si)
      if (mine.length >= 2 && others.length >= 2 && !sec.points.some((p) => p.term)) {
        const right = mine[si % mine.length].text
        const wrong = uniq(others.filter((_x, k) => k % Math.max(1, Math.floor(others.length / 3)) === 0).map((x) => cut(x.text)), cut(right)).slice(0, 3)
        predicts.push({ after: at, q: S.qList(sec.heading), ...placeRight(cut(right), wrong, si + 1), why: [] })
        asked = true
      }
    }
    let plain = 0
    sec.points.forEach((p) => {
      if (p.kind === 'formula') { say(teacher(tell++), S.formula(p.label), 'math', p.text); turns[turns.length - 1].readFormula = true; return }
      if (p.term) {
        const at = say(student(ask++), S.what(p.term), 'concept')
        // the first definition of a section becomes a Pause & Predict: pick the right meaning
        // wrong options: the other meanings first, then other points of the notes
        const wrong = uniq([...allDefs.filter((d) => d.term !== p.term).map((d) => d.meaning), ...allItems.filter((x) => x.si !== si).map((x) => x.text)].map((x) => cut(x)), cut(p.meaning!)).slice(0, 3)
        if (!asked && wrong.length >= 2) {
          predicts.push({ after: at, q: S.qDef(p.term), ...placeRight(cut(p.meaning!), wrong, id), why: [] })
          asked = true
        }
        say(teacher(tell++), p.text, 'concept')
        return
      }
      // every third plain point, a student nudges the talk on
      if (plain > 0 && plain % 3 === 0) say(student(ask++), S.nudge[(plain / 3 - 1) % S.nudge.length], 'concept')
      say(teacher(tell), p.text, 'concept')
      if (++plain % 2 === 0) tell++
    })
  })
  const heads = sections.map((s) => s.heading).filter((h) => h && h !== title)
  if (heads.length) say('maria', S.recap(heads), 'recap')
  say(student(ask++), S.thanks, 'recap')
  say('thomas', S.bye, 'recap')
  return { topic: title, lang, turns, predicts, branches: [] }
}

/** Ready lessons to start from: notes the user can change before making scenes. */
export const NOTE_TEMPLATES: { id: string; label: string; text: string }[] = [
  {
    id: 'science', label: 'Science concept',
    text: `# प्रकाश संश्लेषण (Photosynthesis)

## परिचय
प्रकाश संश्लेषण: वह प्रक्रिया जिसमें हरे पौधे सूरज की रोशनी से अपना भोजन बनाते हैं।
यह पत्तियों में होता है, क्योंकि वहाँ क्लोरोफ़िल होता है।
क्लोरोफ़िल: पत्तियों का हरा रंग, जो सूरज की रोशनी को पकड़ता है।

## ज़रूरी चीज़ें
- सूरज की रोशनी
- पानी, जो जड़ें मिट्टी से लेती हैं
- कार्बन डाइऑक्साइड, जो पत्तियों के छोटे छेदों (रंध्र) से अंदर आती है
- क्लोरोफ़िल

## समीकरण
6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂
इसमें ग्लूकोज़ बनता है और ऑक्सीजन बाहर निकलती है।

## महत्व
- धरती का लगभग सारा भोजन इसी से शुरू होता है।
- हम जो ऑक्सीजन लेते हैं, वह इसी से आती है।
`,
  },
  {
    id: 'history', label: 'History',
    text: `# 1857 की क्रांति

## शुरुआत
1857 की क्रांति 10 मई 1857 को मेरठ से शुरू हुई।
इससे पहले मार्च 1857 में मंगल पांडे ने बैरकपुर में विद्रोह किया था।
इसे भारत का पहला स्वतंत्रता संग्राम भी कहा जाता है।

## कारण
- नई एनफ़ील्ड राइफ़ल के कारतूसों पर गाय और सुअर की चर्बी की बात
- डलहौज़ी की हड़प नीति (Doctrine of Lapse), जिससे राज्य छीने गए
- किसानों और कारीगरों पर भारी कर और आर्थिक शोषण

## प्रमुख नेता
- दिल्ली में बहादुर शाह ज़फ़र
- झाँसी में रानी लक्ष्मीबाई
- कानपुर में नाना साहब और तात्या टोपे
- लखनऊ में बेगम हज़रत महल
- बिहार में कुँवर सिंह

## परिणाम
1858 में ईस्ट इंडिया कंपनी का शासन ख़त्म हुआ।
भारत का शासन सीधे ब्रिटिश ताज के हाथ में चला गया।
`,
  },
  {
    id: 'maths', label: 'Maths formula',
    text: `# पाइथागोरस प्रमेय

## नियम
पाइथागोरस प्रमेय: समकोण त्रिभुज में कर्ण का वर्ग बाकी दो भुजाओं के वर्गों के जोड़ के बराबर होता है।
कर्ण: समकोण के सामने वाली, सबसे लंबी भुजा।
सूत्र: a² + b² = c²

## एक उदाहरण
मान लीजिए दो भुजाएँ 3 और 4 सेंटीमीटर हैं।
c² = a² + b²
c² = 3² + 4²
c² = 9 + 16 = 25
c = √25 = 5
तो कर्ण 5 सेंटीमीटर है।

## ध्यान रखने वाली बातें
- यह नियम सिर्फ़ समकोण त्रिभुज पर लागू होता है।
- c हमेशा सबसे लंबी भुजा होती है।
`,
  },
]
