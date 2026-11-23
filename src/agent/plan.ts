/**
 * The AI half of the chat agent: turns a request into a checked plan of tool steps, rewrites rough requests
 * (prompt enhancer), and lists the features a request needs that the editor doesn't have.
 *
 * Made for small local models (Gemma 4 E4B on a laptop): the AI only sees the few tools the request is about
 * (picked here by keywords, no extra AI call), a short project summary, strict JSON output, temperature 0, and
 * one chance to fix its own mistakes. Whatever it answers is checked again before anything runs (apply.ts).
 */
import type { Project } from '../types'
import { layoutClips } from '../model/timeline'
import { TOOLS, OPENABLE } from './tools'
import { brief } from './schema'
import { normalize } from './quick'
import { prepare, describeStep } from './apply'
import { askAI, providerInfo, type AIChoice } from './providers'
import type { AgentCtx, Missing, Plan, Step } from './types'
import { addUsage } from './usage'

const fmt = (s: number) => `${Math.round(s * 10) / 10}s`

/** A short description of the project for the AI (no media, no file names unless asked). */
export function summary(p: Project, ctx: AgentCtx, privateMode = false): string {
  const { items, total } = layoutClips(p.clips)
  const kind = (id: string) => ctx.sources[id]?.kind ?? 'video'
  const clips = items.slice(0, 40).map((x, i) => `${i + 1}:${kind(x.clip.sourceId)} ${fmt(x.start)}-${fmt(x.start + x.dur)}${x.clip.filter ? ` filter=${x.clip.filter}` : ''}${x.clip.speed !== 1 ? ` speed=${x.clip.speed}` : ''}${x.clip.volume === 0 ? ' muted' : ''}`)
  const texts = p.layers.filter((l) => l.type === 'text')
  const subs = texts.filter((l) => l.type === 'text' && l.subtitle).length
  const titles = texts.filter((l) => l.type === 'text' && !l.subtitle).slice(0, 8).map((l) => (l.type === 'text' ? `"${privateMode ? '…' : l.text.slice(0, 40)}" ${fmt(l.start)}-${fmt(l.end)}` : ''))
  const audio = p.layers.filter((l) => l.type === 'audio').map((l) => (l.type === 'audio' ? `${l.kind} ${fmt(l.start)}-${fmt(l.end)} vol=${l.volume}` : ''))
  const sel = ctx.sel ? (ctx.sel.type === 'clip' ? `clip ${p.clips.findIndex((c) => c.id === ctx.sel!.id) + 1}` : 'an item on a track') : 'nothing'
  return [
    `Video: ${fmt(total)} long, shape ${p.settings.aspect}, ${p.clips.length} clips${items.length > 40 ? ' (first 40 listed)' : ''}.`,
    clips.length ? `Clips: ${clips.join('; ')}` : 'No clips yet.',
    texts.length ? `Text: ${titles.join('; ') || 'none'}${subs ? `; ${subs} subtitles` : ''}` : 'No text.',
    audio.length ? `Audio: ${audio.join('; ')}` : 'No music.',
    `Playhead at ${fmt(ctx.playhead)}. Selected: ${sel}.`,
  ].join('\n')
}

/** The tools worth showing the AI for this request (keyword match). Few tools = a small model stays accurate. */
export function pickTools(text: string, all = false) {
  if (all) return TOOLS
  const s = ` ${normalize(text)} `
  const scored = TOOLS.map((t) => ({ t, n: t.words.filter((w) => s.includes(w.toLowerCase())).length + (s.includes(t.name.replace(/_/g, ' ')) ? 2 : 0) }))
  const hit = scored.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).map((x) => x.t)
  if (hit.length < 2) return TOOLS
  // the common everyday tools always come along, so a request that names them indirectly still works
  const always = ['set_filter', 'adjust', 'add_text', 'set_aspect', 'set_transition', 'open_tool']
  return [...new Set([...hit.slice(0, 10), ...TOOLS.filter((t) => always.includes(t.name))])]
}

/** JSON Schema of the AI's answer (enforced by Ollama; others are asked for JSON and checked). */
export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    understood: { type: 'string' },
    steps: { type: 'array', items: { type: 'object', properties: { tool: { type: 'string' }, args: { type: 'object' } }, required: ['tool', 'args'] } },
    missing: { type: 'array', items: { type: 'object', properties: { need: { type: 'string' }, why: { type: 'string' } }, required: ['need'] } },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['understood', 'steps', 'missing', 'questions'],
}

const EXAMPLES = `Examples:
Request: "saare clips black and white karo aur 9:16 bana do"
{"understood":"All clips black and white, video shape 9:16","steps":[{"tool":"set_filter","args":{"clips":"all","name":"black and white"}},{"tool":"set_aspect","args":{"aspect":"9:16"}}],"missing":[],"questions":[]}
Request: "pehli clip ke upar 2 second ke liye 'Welcome' likho aur aasmaan ko sunset wala bana do"
{"understood":"Text Welcome on clip 1 for 2s; make the sky a sunset","steps":[{"tool":"add_text","args":{"text":"Welcome","at":"start","duration":2,"position":"top"}}],"missing":[{"need":"Sky replace (change the sky in a video)","why":"to make the sky a sunset"}],"questions":[]}
Request: "isko acha bana do"
{"understood":"Make the video look better","steps":[{"tool":"adjust","args":{"clips":"all","contrast":0.1,"saturation":0.1}},{"tool":"set_filter","args":{"clips":"all","name":"vivid","amount":0.6}}],"missing":[],"questions":["Kaisa look chahiye: warm, cinematic ya vintage?"]}`

export function systemPrompt(tools = TOOLS, lang: 'en' | 'hi' = 'en') {
  const list = tools.map((t) => `- ${t.name}${brief(t.params)}: ${t.say}`).join('\n')
  return `You are the editing assistant inside Apna Editor, a video editor. The user writes in Hindi, Hinglish or English.
Turn the request into steps using ONLY these tools (name and arguments exactly as shown; "?" = optional):
${list}

Rules:
- Answer with ONE JSON object only: {"understood": text, "steps": [{"tool": name, "args": {...}}], "missing": [{"need": text, "why": text}], "questions": [text]}.
- Use only the tools listed. Never invent a tool. Times are seconds on the timeline. Clip numbers start at 1.
- If part of the request needs something no tool can do, do not fake it: put that feature in "missing" (short name of the feature + why) and still do the parts that are possible.
- Jobs that need listening, face finding or the user's files (subtitles from speech, noise removal, background removal, adding music) use open_tool.
- Ask in "questions" only when you really can't guess; otherwise pick sensible values.
- Write "understood", "why" and "questions" in ${lang === 'hi' ? 'simple Hindi (Devanagari)' : 'the language the user wrote in'}.
${EXAMPLES}`
}

/** The first JSON object in a model's answer (models sometimes add text or ``` fences around it). */
export function extractJSON(text: string): unknown {
  const t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  try { return JSON.parse(t) } catch { /* look inside */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (fence) { try { return JSON.parse(fence[1]) } catch { /* keep looking */ } }
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)) } catch { /* not JSON */ } }
  return null
}

export interface Checked { plan: Plan; problems: string[] }

/** Checks a model's answer: unknown tools become missing features, bad arguments become problems to fix. */
export function checkAnswer(raw: unknown, request: string): Checked {
  const problems: string[] = []
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (!raw) problems.push('The answer was not a JSON object.')
  const steps: Step[] = []
  const missing: Missing[] = []
  const arr = (v: unknown) => (Array.isArray(v) ? v : [])
  for (const [i, x] of arr(o.steps).entries()) {
    const st = x as { tool?: unknown; args?: unknown }
    const step: Step = { tool: String(st?.tool ?? ''), args: (st?.args && typeof st.args === 'object' ? st.args : {}) as Record<string, unknown> }
    if (!TOOLS.some((t) => t.name === step.tool)) {
      // a tool that doesn't exist is a feature the editor is missing
      if (step.tool) missing.push({ need: step.tool.replace(/_/g, ' '), why: JSON.stringify(step.args).slice(0, 120) })
      continue
    }
    const prep = prepare(step)
    if (!prep.ok) { problems.push(`steps[${i}] ${step.tool}: ${prep.errors.join('; ')}`); continue }
    steps.push({ tool: step.tool, args: prep.args })
  }
  for (const m of arr(o.missing)) {
    const need = typeof m === 'string' ? m : String((m as Missing)?.need ?? '')
    if (need.trim()) missing.push({ need: need.trim().slice(0, 120), why: typeof m === 'object' ? String((m as Missing)?.why ?? '').slice(0, 200) : undefined })
  }
  const questions = arr(o.questions).map(String).filter((q) => q.trim()).slice(0, 3)
  return { plan: { understood: String(o.understood ?? request).slice(0, 300), steps, missing, questions, by: 'ai' }, problems }
}

export interface PlanOpts { signal?: AbortSignal; privateMode?: boolean; onStage?: (s: 'thinking' | 'fixing') => void }

/** Asks the AI for a plan, lets it fix its own mistakes once, and returns only checked steps. */
export async function planWithAI(request: string, p: Project, ctx: AgentCtx, ai: AIChoice, o: PlanOpts = {}): Promise<Plan & { dropped: string[] }> {
  const online = providerInfo(ai.provider).online
  const tools = pickTools(request, online) // big online models see every tool; a small local one sees the relevant few
  const system = systemPrompt(tools, ctx.lang)
  const user = `Project:\n${summary(p, ctx, o.privateMode)}\n\nRequest: ${request}`
  o.onStage?.('thinking')
  let ans = await askAI(ai, { system, user, schema: PLAN_SCHEMA, signal: o.signal })
  if (online) addUsage(ans.usage)
  let checked = checkAnswer(extractJSON(ans.text), request)
  if (checked.problems.length) {
    o.onStage?.('fixing')
    const fix = `${user}\n\nYour previous answer:\n${ans.text.slice(0, 3000)}\n\nIt had these problems:\n${checked.problems.join('\n')}\nAnswer again with the corrected JSON object only.`
    try {
      ans = await askAI(ai, { system, user: fix, schema: PLAN_SCHEMA, signal: o.signal })
      if (online) addUsage(ans.usage)
      const again = checkAnswer(extractJSON(ans.text), request)
      // keep the better of the two answers
      if (again.problems.length <= checked.problems.length) checked = again
    } catch (e) { if ((e as Error).name === 'AbortError') throw e }
  }
  return { ...checked.plan, dropped: checked.problems }
}

// ---------- prompt enhancer ----------

export interface Enhanced { clear: string; assumptions: string[]; questions: string[] }

/** Without AI: when the quick parser understood every part, its step lines ARE the clear version. */
export function enhanceOffline(steps: Step[], ctx: AgentCtx): string {
  return steps.map((s) => describeStep(s, ctx)[ctx.lang]).join('. ')
}

/** With AI: rewrites a rough request into a clear, exact one, with what it assumed and what it must ask. */
export async function enhanceWithAI(request: string, p: Project, ctx: AgentCtx, ai: AIChoice, signal?: AbortSignal): Promise<Enhanced> {
  const tools = pickTools(request, true).map((t) => `${t.name}: ${t.say}`).join('\n')
  const system = `You rewrite a video-editing request so a video editor understands it exactly. Keep the user's language (Hindi, Hinglish or English).
Make it specific: which clips (numbers or all), times in seconds, positions, colours, strengths. Fill sensible values from the project. Keep it short, one line per change.
The editor can do: \n${tools}\n
Answer ONE JSON object: {"clear": text, "assumptions": [text], "questions": [text]}. "assumptions": values you guessed. "questions": at most 2, only if you can't guess.`
  const ans = await askAI(ai, { system, user: `Project:\n${summary(p, ctx)}\n\nRequest: ${request}`, signal, schema: { type: 'object', properties: { clear: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } }, questions: { type: 'array', items: { type: 'string' } } }, required: ['clear', 'assumptions', 'questions'] } })
  if (providerInfo(ai.provider).online) addUsage(ans.usage)
  const o = (extractJSON(ans.text) ?? {}) as Partial<Enhanced>
  const clear = typeof o.clear === 'string' && o.clear.trim() ? o.clear.trim() : request
  return { clear, assumptions: Array.isArray(o.assumptions) ? o.assumptions.map(String).slice(0, 5) : [], questions: Array.isArray(o.questions) ? o.questions.map(String).slice(0, 2) : [] }
}

// ---------- missing features ----------

/** Changes when tools are added, so a saved unfinished request knows the app got new features. */
export const CATALOG_VERSION = (() => {
  let h = 5381
  for (const c of [...TOOLS.map((t) => t.name), ...OPENABLE.map((o) => o.label)].join('|')) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0
  return h.toString(36)
})()

/** A ready-to-send message (Hinglish) asking for the missing features, for the project chat with Claude. */
export function missingReport(request: string, missing: Missing[], doable: string[]): string {
  return [
    'Apna Editor AI chat: ye features chahiye (abhi editor me nahi hain)',
    '',
    `Mera request: "${request}"`,
    '',
    'Missing features:',
    ...missing.map((m, i) => `${i + 1}. ${m.need}${m.why ? ` (kyun: ${m.why})` : ''}`),
    ...(doable.length ? ['', 'Jo abhi ho sakta hai (chat ne kar diya / kar sakta hai):', ...doable.map((d) => `- ${d}`)] : []),
    '',
    'In features ko add kar do, phir main chat me "Ab poora karein" daba kar baaki kaam complete karunga.',
  ].join('\n')
}

export interface Pending { request: string; missing: Missing[]; version: string; at: number }
const PENDING = 'agent-pending'
export function savePending(projectId: string, x: Omit<Pending, 'version' | 'at'>) {
  try {
    const all = JSON.parse(localStorage.getItem(PENDING) ?? '{}') as Record<string, Pending>
    all[projectId] = { ...x, version: CATALOG_VERSION, at: Date.now() }
    localStorage.setItem(PENDING, JSON.stringify(all))
  } catch { /* private mode */ }
}
export function getPending(projectId: string): (Pending & { newTools: boolean }) | null {
  try {
    const p = (JSON.parse(localStorage.getItem(PENDING) ?? '{}') as Record<string, Pending>)[projectId]
    return p ? { ...p, newTools: p.version !== CATALOG_VERSION } : null
  } catch { return null }
}
export function clearPending(projectId: string) {
  try { const all = JSON.parse(localStorage.getItem(PENDING) ?? '{}'); delete all[projectId]; localStorage.setItem(PENDING, JSON.stringify(all)) } catch { /* private mode */ }
}
