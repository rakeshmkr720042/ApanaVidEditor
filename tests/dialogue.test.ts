import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isSpoken, parseLesson, planLesson, verbalize } from '../src/lib/dialogue'
import { padEnd, resample, shapeLine } from '../src/engine/voiceshape'

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
