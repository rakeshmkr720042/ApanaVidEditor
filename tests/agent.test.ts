/**
 * AI chat agent: tools, safe apply (all or nothing), quick Hinglish commands, AI answer checking.
 */
import './_env'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Clip, MediaSource, Project, TextLayer } from '../src/types'
import { TOOLS, NOT_FOR_CHAT, OPENABLE } from '../src/agent/tools'
import { runPlan, problems } from '../src/agent/apply'
import { quickPlan, normalize, clauses } from '../src/agent/quick'
import { check } from '../src/agent/schema'
import type { AgentCtx } from '../src/agent/types'
import { layoutClips } from '../src/model/timeline'

const clip = (id: string, p: Partial<Clip> = {}): Clip => ({
  id, sourceId: 'v', in: 0, out: 10, speed: 1, ramp: null, volume: 1, fadeIn: 0, fadeOut: 0, rotate: 0, flipH: false, flipV: false,
  crop: null, fit: 'fit', filter: null, filterAmount: 1, adjust: { exposure: 0, brightness: 0, contrast: 0, saturation: 0, vibrance: 0, temperature: 0, tint: 0, hue: 0, highlights: 0, shadows: 0, fade: 0, vignette: 0, grain: 0, sharpen: 0 },
  transition: null, ...p,
})
const project = (): Project => ({
  clips: [clip('a'), clip('b'), clip('c')],
  layers: [
    { id: 'm', type: 'audio', sourceId: 'song', in: 0, volume: 1, fadeIn: 0, fadeOut: 0, label: 'Song', kind: 'music', start: 0, end: 30 },
    { id: 's1', type: 'text', text: 'hello there', subtitle: true, start: 1, end: 3, style: { font: 'Poppins', size: 0.045, color: '#fff', align: 'center', stroke: null, strokeWidth: 0, shadow: false, background: null, bold: false, italic: false, letterSpacing: 0 }, box: { x: 0.5, y: 0.86, scale: 1, rotation: 0, opacity: 1 }, animIn: 'none', animOut: 'none' } as TextLayer,
  ],
  settings: { aspect: '16:9', background: 'black', fps: 30 },
})
const sources: Record<string, MediaSource> = {
  v: { id: 'v', kind: 'video', width: 1920, height: 1080, duration: 10 } as MediaSource,
  song: { id: 'song', kind: 'audio', duration: 60 } as MediaSource,
}
const ctx = (p: Partial<AgentCtx> = {}): AgentCtx => ({ sources, sel: null, playhead: 12, lang: 'en', ...p })
const quick = (s: string, c = ctx()) => quickPlan(s, c)
const steps = (s: string, c = ctx()) => quick(s, c).plan.steps

test('every tool has a valid object schema, a say line and words', () => {
  const names = new Set<string>()
  for (const t of TOOLS) {
    assert.ok(!names.has(t.name), `duplicate tool ${t.name}`)
    names.add(t.name)
    assert.equal(t.params.type, 'object')
    assert.ok(t.say.length > 10 && t.words.length > 0, t.name)
  }
})

test('coverage: every main toolbar tool is a chat tool, an openable tool, or listed as not for chat', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync('src/components/Editor.tsx', 'utf8')
  const start = src.indexOf("tools = [\n      { icon: 'add', label: 'Add'")
  assert.ok(start > 0, 'main toolbar list not found')
  const block = src.slice(start, src.indexOf('\n    ]\n', start))
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1])
  assert.ok(labels.length > 30)
  const covered = new Set([...TOOLS.flatMap((t) => t.covers ?? []), ...OPENABLE.map((o) => o.label)])
  const missing = labels.filter((l) => !covered.has(l) && !NOT_FOR_CHAT.has(l))
  assert.deepEqual(missing, [], `add these toolbar tools to src/agent/tools.ts: ${missing.join(', ')}`)
})

test('schema: tidies numbers, clamps, matches enums, wraps single values in lists', () => {
  const s = { type: 'object', props: { n: { type: 'number', min: 0, max: 2 }, e: { type: 'string', enum: ['9:16', '16:9'] }, l: { type: 'array', items: { type: 'integer' } } }, required: ['n'] } as const
  const r = check(s, { n: '5', e: '9:16', l: '3', junk: 1 })
  assert.ok(r.ok, r.errors.join())
  assert.deepEqual(r.value, { n: 2, e: '9:16', l: [3] })
  assert.ok(!check(s, { e: 'x' }).ok)
})

test('apply: one plan → one new project, the original untouched', () => {
  const p = project()
  const r = runPlan(p, [{ tool: 'set_filter', args: { clips: 'all', name: 'black and white' } }, { tool: 'set_aspect', args: { aspect: '9:16' } }], ctx())
  assert.ok(r.ok)
  if (!r.ok) return
  assert.ok(r.project.clips.every((c) => c.filter?.startsWith('b-w')))
  assert.equal(r.project.settings.aspect, '9:16')
  assert.equal(p.clips[0].filter, null)
  assert.equal(p.settings.aspect, '16:9')
})

test('apply: all or nothing: a bad step cancels the whole plan', () => {
  const p = project()
  const r = runPlan(p, [{ tool: 'set_aspect', args: { aspect: '9:16' } }, { tool: 'delete_clips', args: { clips: [9] } }], ctx())
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.error.en, /no clip 9/)
})

test('apply: unknown tools and bad arguments never run', () => {
  const r = runPlan(project(), [{ tool: 'explode', args: {} }], ctx())
  assert.equal(r.ok, false)
  const r2 = runPlan(project(), [{ tool: 'set_speed', args: { speed: 'fast' } }], ctx())
  assert.equal(r2.ok, false)
})

test('apply: skipFailed keeps the good steps', () => {
  const r = runPlan(project(), [{ tool: 'set_aspect', args: { aspect: '1:1' } }, { tool: 'set_filter', args: { name: 'no-such-look-xyz' } }], ctx(), true)
  assert.ok(r.ok)
  if (r.ok) assert.equal(r.project.settings.aspect, '1:1')
})

test('apply: refuses to delete the whole video', () => {
  assert.equal(runPlan(project(), [{ tool: 'delete_clips', args: { clips: 'all' } }], ctx()).ok, false)
  assert.equal(runPlan(project(), [{ tool: 'delete_range', args: { from: 0, to: 30 } }], ctx()).ok, false)
})

test('tools: split, delete range, trim keep the video valid', () => {
  const p = project()
  const r = runPlan(p, [{ tool: 'split_at', args: { times: [5, 15] } }, { tool: 'delete_range', args: { from: 2, to: 4 } }, { tool: 'trim_clip', args: { clip: 'last', cut_end: 1 } }], ctx())
  assert.ok(r.ok, r.ok ? '' : r.error.en)
  if (!r.ok) return
  assert.deepEqual(problems(r.project), [])
  assert.ok(Math.abs(layoutClips(r.project.clips).total - (30 - 2 - 1)) < 1e-6)
})

test('tools: transitions fit inside short clips', () => {
  const p = project()
  p.clips[1] = clip('b', { out: 0.6 })
  const r = runPlan(p, [{ tool: 'set_transition', args: { after: 'all', name: 'fade', duration: 2 } }], ctx())
  assert.ok(r.ok)
  if (r.ok) for (const c of r.project.clips.slice(0, -1)) assert.ok(c.transition!.duration <= 0.3)
})

test('tools: add text keeps it inside the video', () => {
  const r = runPlan(project(), [{ tool: 'add_text', args: { text: 'Happy Diwali', at: 100, duration: 50, position: 'top' } }], ctx())
  assert.ok(r.ok)
  if (!r.ok) return
  const t = r.project.layers.find((l) => l.type === 'text' && !l.subtitle) as TextLayer
  assert.equal(t.text, 'Happy Diwali')
  assert.ok(t.end <= 30 && t.start < t.end)
  assert.ok(t.box.y < 0.3)
})

test('tools: locked main row is respected', () => {
  const p = { ...project(), main: { locked: true } }
  assert.equal(runPlan(p, [{ tool: 'set_speed', args: { clips: 'all', speed: 2 } }], ctx()).ok, false)
})

test('normalize: Hindi digits, number words, m:ss, keeps "kar do"', () => {
  assert.equal(normalize('१० सेकंड'), '10 सेकंड')
  assert.equal(normalize('do second pe kaat do'), '2 second pe kaat do')
  assert.equal(normalize('1:30 pe'), '90 sec pe')
  assert.equal(normalize('2 min 10 sec'), '130 sec')
  assert.equal(normalize('Black and White karo'), 'blackandwhite karo')
})

test('clauses: splits at aur / and / phir but keeps quoted text', () => {
  assert.deepEqual(clauses('9:16 karo aur music mute, phir "tom and jerry" likho'), ['9:16 karo', 'music mute', '"tom and jerry" likho'])
})

const cases: [string, string, Record<string, unknown>][] = [
  ['Saare clips pe warm filter lagao', 'set_filter', { clips: 'all', name: 'mood-warm' }],
  ['black and white karo', 'set_filter', { clips: 'all' }],
  ['9:16 reel bana do', 'set_aspect', { aspect: '9:16' }],
  ['square format karo', 'set_aspect', { aspect: '1:1' }],
  ['Clips ke beech fade transition', 'set_transition', { after: 'all', name: 'fade' }],
  ['Music ki awaaz 30% karo', 'music_volume', { volume: 0.3 }],
  ['music mute karo', 'music_volume', { volume: 0 }],
  ['video mute kar do', 'set_volume', { volume: 0 }],
  ['10 se 15 second tak hatao', 'delete_range', { from: 10, to: 15 }],
  ['Thoda bright karo', 'adjust', { brightness: 0.1 }],
  ['dusri clip 2x speed', 'set_speed', { clips: [2], speed: 2 }],
  ['slow motion', 'set_speed', { speed: 0.5 }],
  ['5 sec pe kaato', 'split_at', { times: [5] }],
  ['yahan cut karo', 'split_at', { times: ['playhead'] }],
  ['teesri clip hatao', 'delete_clips', { clips: [3] }],
  ['aakhri clip delete karo', 'delete_clips', { clips: 'last' }],
  ['Subtitle banao', 'open_tool', { tool: 'Subtitles' }],
  ['background blur karo', 'set_background', { background: 'blur' }],
  ['clip 1 ko 90 degree rotate karo', 'rotate_flip', { clips: [1], degrees: 90 }],
  ['subtitles hatao', 'delete_texts', { texts: 'subtitles' }],
  ['karaoke style subtitles', 'style_text', { texts: 'subtitles', words: 'karaoke' }],
  ['vhs effect lagao', 'set_effect', { name: 'vhs' }],
  ['handheld camera lagao', 'camera_move', { move: 'handheld' }],
  ['shuru me 2 second fade in', 'fade', { target: 'video', in: 2 }],
  ['marker lagao "Intro"', 'add_marker', { name: 'Intro' }],
]
for (const [say, tool, args] of cases) {
  test(`quick: "${say}" → ${tool}`, () => {
    const st = steps(say)
    assert.equal(st.length, 1, `got ${JSON.stringify(st)}`)
    assert.equal(st[0].tool, tool)
    for (const [k, v] of Object.entries(args)) assert.deepEqual(st[0].args[k], v, `${k} in ${JSON.stringify(st[0].args)}`)
  })
}

test('quick: text keeps its capitals and place', () => {
  const st = steps('Upar "Happy Diwali" likho 3 sec ke liye')
  assert.equal(st[0].tool, 'add_text')
  assert.deepEqual(st[0].args, { text: 'Happy Diwali', at: 'playhead', duration: 3, position: 'top' })
  const st2 = steps('neeche Subscribe Karo likho')
  assert.equal(st2[0].args.text, 'Subscribe Karo')
})

test('quick: several requests in one sentence', () => {
  const st = steps('saare clips black and white karo aur 9:16 bana do, phir music mute')
  assert.deepEqual(st.map((s) => s.tool), ['set_filter', 'set_aspect', 'music_volume'])
})

test('quick: selected clip is the default target when one is selected', () => {
  const st = steps('vintage filter lagao', ctx({ sel: { type: 'clip', id: 'b' } }))
  assert.equal(st[0].args.clips, 'selected')
})

test('quick: unknown parts are handed back', () => {
  const r = quick('9:16 karo aur aasmaan badal do')
  assert.equal(r.plan.steps.length, 1)
  assert.equal(r.left.length, 1)
})

test('quick + apply end to end', () => {
  const r = runPlan(project(), steps('saare clips black and white karo aur 9:16 bana do, phir music mute'), ctx())
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.project.settings.aspect, '9:16')
  assert.equal((r.project.layers.find((l) => l.id === 'm') as { volume: number }).volume, 0)
})

// ---------- AI answers ----------
import { checkAnswer, extractJSON, pickTools, systemPrompt, summary, missingReport } from '../src/agent/plan'
import { readAnswer } from '../src/agent/providers'
import { redact } from '../src/agent/providers/keys'

test('extractJSON: plain, fenced, with chatter, with <think>', () => {
  assert.deepEqual(extractJSON('{"a":1}'), { a: 1 })
  assert.deepEqual(extractJSON('Sure!\n```json\n{"a":2}\n```'), { a: 2 })
  assert.deepEqual(extractJSON('<think>hmm {"x":0}</think> Here: {"a":3} done'), { a: 3 })
  assert.equal(extractJSON('no json here'), null)
})

test('checkAnswer: good steps kept and tidied, unknown tools become missing features, bad args reported', () => {
  const r = checkAnswer({
    understood: 'x',
    steps: [
      { tool: 'set_aspect', args: { aspect: '9:16' } },
      { tool: 'replace_sky', args: { with: 'sunset' } },
      { tool: 'set_speed', args: { clips: 'all', speed: 'fast' } },
      { tool: 'set_volume', args: { clips: '2', volume: '150%' } },
    ],
    missing: [{ need: 'Magic eraser', why: 'remove a person' }, 'Sky replace'],
    questions: ['Kaunsa gaana?'],
  }, 'req')
  assert.deepEqual(r.plan.steps.map((s) => s.tool), ['set_aspect', 'set_volume'])
  assert.deepEqual(r.plan.steps[1].args, { clips: [2], volume: 1.5 })
  assert.deepEqual(r.plan.missing.map((m) => m.need), ['replace sky', 'Magic eraser', 'Sky replace'])
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0], /set_speed/)
  assert.deepEqual(r.plan.questions, ['Kaunsa gaana?'])
})

test('checkAnswer: garbage never throws', () => {
  for (const g of [null, 42, 'x', [], { steps: 'no' }, { steps: [null, 1, { tool: 5 }] }]) {
    const r = checkAnswer(g, 'q')
    assert.equal(r.plan.steps.length, 0)
  }
})

test('pickTools: a small model sees only the related tools', () => {
  const names = pickTools('music ki awaaz kam karo aur fade out').map((t) => t.name)
  assert.ok(names.includes('music_volume') && names.includes('fade'))
  assert.ok(names.length < TOOLS.length)
  assert.equal(pickTools('xyz', true).length, TOOLS.length)
  assert.ok(systemPrompt(pickTools('warm filter aur fade transition')).length < systemPrompt().length)
})

test('summary: short, no media, private mode hides text', () => {
  const s = summary(project(), ctx(), true)
  assert.match(s, /3 clips/)
  assert.ok(!s.includes('hello there'))
  assert.ok(s.length < 1200)
})

test('providers: answers of every format are read', () => {
  assert.equal(readAnswer('ollama', { message: { content: 'hi' } }).text, 'hi')
  assert.equal(readAnswer('openai', { choices: [{ message: { content: 'hi' } }] }).text, 'hi')
  assert.equal(readAnswer('anthropic', { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'h' }, { type: 'text', text: 'i' }] }).text, 'hi')
  assert.equal(readAnswer('gemini', { candidates: [{ content: { parts: [{ text: 'hi' }] } }] }).text, 'hi')
  assert.throws(() => readAnswer('anthropic', { stop_reason: 'refusal', content: [] }))
})

test('keys never leak into messages', () => {
  const s = redact('bad key sk-ant-api03-abcdefghijklmnop and AIzaSyA1234567890abcdefghijk and sk-proj-zzzzzzzzzzzzzzzz')
  assert.ok(!/sk-ant-api03-abc|AIzaSyA123|sk-proj-zzz/.test(s), s)
})

test('missing report is ready to paste', () => {
  const r = missingReport('aasmaan badlo', [{ need: 'Sky replace', why: 'sunset sky' }], ['Video shape 9:16'])
  assert.match(r, /1\. Sky replace/)
  assert.match(r, /aasmaan badlo/)
})

test('quick: requests about something inside the picture go to the AI, not a whole-video rule', () => {
  const r = quick('aasmaan ko sunset jaisa bana do aur 9:16 karo')
  assert.deepEqual(r.plan.steps.map((s) => s.tool), ['set_aspect'])
  assert.equal(r.left.length, 1)
})
