import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSpoken, parseLesson, pauseAfter, planLesson, verbalize, verbalizeEn, THINK_PAUSE } from '../src/lib/dialogue'
import { loudness, padEnd, pitchShift, resample, shapeLine, stretchTempo } from '../src/engine/voiceshape'
import { NOTE_TEMPLATES, notesLang, notesToLesson, readNotes } from '../src/lib/notesDialogue'

const lesson = JSON.stringify({
  meta: { topic: 'PMMC' },
  dialogue: [
    { id: 1, speaker: 'thomas', line: 'नमस्ते।' },
    { id: 2, speaker: 'daniel', line: 'Td = N·B·A·I क्यों?', formula: 'Td = NBAI' },
  ],
  pause_and_predict: [{ after_id: 2, q: 'कौन?', options: ['क', 'ख', 'ग', 'घ'], answer: 2, why_wrong: ['', '', 'ग सही है', ''] }],
  doubt_branches: [{ trigger_q: 'अगर?', after_id: 1, dialogue: [{ speaker: 'nancy', line: 'सर, अगर?' }] }],
})

test('dialogue: reads a lesson and rejects other files', () => {
  const l = parseLesson(lesson)
  assert.equal(l.turns.length, 2)
  assert.equal(l.predicts[0].answer, 2)
  assert.equal(l.branches[0].turns[0].speaker, 'nancy')
  assert.throws(() => parseLesson('hello'), /Deep Dive/)
  assert.throws(() => parseLesson('{"dialogue":[{"speaker":"bob","line":"x"}]}'), /unknown speaker/)
  assert.throws(() => parseLesson('{"dialogue":[]}'), /no lines/)
})

test('dialogue: scene order puts doubts and questions after their line', () => {
  const l = parseLesson(lesson)
  const names = planLesson(l, { doubts: true, predicts: true }).map((p) => p.card.kind + ':' + (p.speaker ?? ''))
  assert.deepEqual(names, ['title:', 'say:thomas', 'say:nancy', 'say:daniel', 'ask:', 'reveal:'])
  const plain = planLesson(l, { doubts: false, predicts: false })
  assert.equal(plain.length, 3)
})

test('dialogue: formulas and units are said in words', () => {
  assert.equal(verbalize('Td = NBAI'), 'टी डी बराबर एन बी ए आई')
  assert.equal(verbalize('4.5×10⁻⁵ N·m'), '4 दशमलव पाँच गुणा दस की घात ऋण पाँच न्यूटन मीटर')
  assert.equal(verbalize('10 mA'), '10 मिली ऐम्पियर')
  assert.equal(verbalize('डी\'Arsonval'), 'डी\'Arsonval')
  assert.ok(!/[A-Za-z]/.test(verbalize('Eb = 210 V, और I।')))
  assert.ok(isSpoken('नमस्ते दोस्तो।'))
  assert.ok(!isSpoken('Td = 5'))
})

test('voice shape: pitch changes the length, pause adds silence', () => {
  const a = new Float32Array(1000).fill(0.5)
  assert.equal(resample(a, 1).length, 1000)
  assert.equal(resample(a, 1.25).length, 800)
  assert.equal(resample(a, 0.8).length, 1250)
  assert.equal(resample(a, 9).length, 1000) // nonsense factor is ignored
  const p = padEnd(a, 1000, 0.5)
  assert.equal(p.length, 1500)
  assert.equal(p[1499], 0)
  assert.equal(shapeLine(a, 1000, 1, 0).length, 1000)
})

test('dialogue: no English letters reach the Hindi voice', () => {
  const l = parseLesson(JSON.stringify({ dialogue: [{ speaker: 'maria', line: 'Torque का सूत्र Td = NBAI है, shunt और core देखो, Fig. 9.5 में।' }] }))
  const [p] = planLesson(l, { doubts: false, predicts: false })
  assert.ok(!/[A-Za-z]/.test(p.say), p.say)
  assert.ok(p.say.includes('टॉर्क') && p.say.includes('शंट'))
  assert.equal(p.text, l.turns[0].line) // captions keep what was written
})

// ------------------------------------------------------------ added on top of the patch

const sine = (hz: number, rate: number, secs: number) => Float32Array.from({ length: Math.round(rate * secs) }, (_v, i) => Math.sin((2 * Math.PI * hz * i) / rate))
/** Frequency from upward zero crossings, in the middle of the clip. */
const freq = (x: Float32Array, rate: number) => {
  const a = Math.floor(x.length * 0.2), b = Math.floor(x.length * 0.8)
  let n = 0
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) n++
  return n / ((b - a) / rate)
}

test('voice shape: tempo changes the length but not the pitch', () => {
  const rate = 16000
  const a = sine(200, rate, 1)
  const fast = stretchTempo(a, rate, 1.25)
  assert.ok(Math.abs(fast.length - 12800) <= 1, String(fast.length))
  assert.ok(Math.abs(freq(fast, rate) - 200) < 8, String(freq(fast, rate)))
  const slow = stretchTempo(a, rate, 0.8)
  assert.ok(Math.abs(slow.length - 20000) <= 1)
  assert.ok(Math.abs(freq(slow, rate) - 200) < 8, String(freq(slow, rate)))
})

test('voice shape: pitch changes the pitch but not the length', () => {
  const rate = 16000
  const a = sine(200, rate, 1)
  const up = pitchShift(a, rate, 1.2)
  assert.ok(Math.abs(up.length - a.length) < a.length * 0.01, String(up.length))
  assert.ok(Math.abs(freq(up, rate) - 240) < 10, String(freq(up, rate)))
  const down = pitchShift(a, rate, 0.86, 0.94)
  assert.ok(Math.abs(down.length - a.length / 0.94) < a.length * 0.01, String(down.length))
  assert.ok(Math.abs(freq(down, rate) - 172) < 10, String(freq(down, rate)))
  assert.equal(shapeLine(a, rate, 1.2, 0.5).length - pitchShift(a, rate, 1.2).length, 8000)
})

test('voice shape: loudness follows the sound', () => {
  const rate = 1000
  const x = new Float32Array(2000)
  for (let i = 1000; i < 2000; i++) x[i] = Math.sin(i)
  const l = loudness(x, rate, 10)
  assert.equal(l.length, 20)
  assert.ok(l[3] < 0.05 && l[15] > 0.8)
})

test('pauses: longer after questions and long lines', () => {
  assert.ok(pauseAfter('क्या?', 0.25) > pauseAfter('हाँ।', 0.25))
  assert.ok(pauseAfter('This is a long line with many many words in it and it keeps going on and on and on.', 0.3) > pauseAfter('Short line.', 0.3))
  assert.ok(pauseAfter('ठीक है,', 0.25) < pauseAfter('ठीक है।', 0.25))
  assert.ok(pauseAfter('x '.repeat(500) + '?', 1) <= 1.6)
  const l = parseLesson(lesson)
  const plans = planLesson(l, { doubts: false, predicts: true })
  assert.equal(plans.find((p) => p.card.kind === 'ask')!.pause, THINK_PAUSE)
})

test('formula board: a worked formula is shown one line at a time', () => {
  const l = parseLesson(JSON.stringify({ dialogue: [{ speaker: 'thomas', line: 'देखिए:', formula: 'c² = 3² + 4²\nc² = 25\nc = 5' }] }))
  const plans = planLesson(l, { doubts: false, predicts: false })
  assert.deepEqual(plans.map((p) => p.card.step), [1, 2, 3])
  assert.ok(plans.every((p) => !/[A-Za-z]/.test(p.say)), plans.map((p) => p.say).join(' | '))
  assert.ok(plans[2].say.includes('5'))
})

test('notes: headings, definitions, lists and formulas become a talk', () => {
  const notes = `# Newton's laws\n\n## Inertia\nInertia: the wish of a body to stay as it is.\nA ball keeps rolling.\n\n## Forces\n- Push\n- Pull\n- Friction slows things\n\nF = m × a`
  const r = readNotes(notes)
  assert.equal(r.title, "Newton's laws")
  assert.deepEqual(r.sections.map((s) => s.heading), ['Inertia', 'Forces'])
  assert.equal(notesLang(notes), 'en')
  const l = notesToLesson(notes)
  assert.equal(l.lang, 'en')
  const speakers = new Set(l.turns.map((t) => t.speaker))
  assert.equal(speakers.size, 4)
  assert.ok(l.turns.some((t) => t.line === 'What is Inertia?' && (t.speaker === 'daniel' || t.speaker === 'nancy')))
  assert.ok(l.turns.some((t) => t.formula === 'F = m × a'))
  assert.equal(l.predicts.length, 2)
  for (const p of l.predicts) {
    assert.ok(p.options.length >= 3 && p.answer < p.options.length)
    assert.ok(l.turns.some((t) => t.id === p.after))
  }
  // every point of the notes is said by someone
  for (const s of ['A ball keeps rolling.', 'Push', 'Friction slows things']) assert.ok(l.turns.some((t) => t.line === s), s)
  assert.throws(() => notesToLesson('   '), /Write a few points/)
})

test('notes: the ready lessons make Hindi talks with nothing English left for the voice', () => {
  for (const tp of NOTE_TEMPLATES) {
    const l = notesToLesson(tp.text)
    assert.equal(l.lang, 'hi', tp.id)
    assert.ok(l.turns.length > 10, tp.id)
    assert.ok(l.predicts.length >= 1, tp.id)
    const plans = planLesson(l, { doubts: true, predicts: true })
    for (const p of plans) assert.ok(!/[A-Za-z]/.test(p.say), `${tp.id}: ${p.say}`)
  }
  const maths = planLesson(notesToLesson(NOTE_TEMPLATES.find((x) => x.id === 'maths')!.text), { doubts: false, predicts: false })
  assert.ok(maths.filter((p) => p.card.step).length >= 4) // the worked example fills the board step by step
})

test('verbalize: chemistry and roots', () => {
  assert.ok(!/[A-Za-z₀-₉+→]/.test(verbalize('6CO₂ + 6H₂O → C₆H₁₂O₆')))
  assert.ok(verbalize('c = √25').includes('25 का वर्गमूल'))
  assert.equal(verbalizeEn('a² + b² = c²'), 'a squared plus b squared equals c squared')
  assert.equal(verbalizeEn('c = √25'), 'c equals the square root of 25')
})
