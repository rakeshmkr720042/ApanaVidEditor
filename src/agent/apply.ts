/**
 * Runs a plan on a copy of the project, all or nothing. Every step's arguments are checked, every step runs on
 * the copy, and the result is checked for anything that could crash the player or the export (NaN times, empty
 * clips, broken ids). Only a clean result goes back to the editor, as one change = one Undo.
 * The editor's own project is never touched here, so a bad AI answer can't break the open video.
 */
import type { Project } from '../types'
import { MIN_CLIP } from '../types'
import { check } from './schema'
import { toolByName } from './tools'
import { AgentError, type After, type AgentCtx, type Both, type Step } from './types'

export interface StepResult { step: Step; ok: boolean; say: Both; error?: Both }

export type RunResult =
  | { ok: true; project: Project; results: StepResult[]; after: After }
  | { ok: false; results: StepResult[]; error: Both }

/** Arguments tidied and checked, or the reasons they can't be used. */
export function prepare(step: Step): { ok: true; args: Record<string, unknown> } | { ok: false; errors: string[] } {
  const tool = toolByName(step.tool)
  if (!tool) return { ok: false, errors: [`unknown tool "${step.tool}"`] }
  const c = check(tool.params, step.args ?? {}, 'args')
  return c.ok ? { ok: true, args: c.value as Record<string, unknown> } : { ok: false, errors: c.errors }
}

/** The plan card line for a step (or why it can't be done). */
export function describeStep(step: Step, ctx: AgentCtx): Both {
  const tool = toolByName(step.tool)
  const prep = prepare(step)
  if (!tool || !prep.ok) return { en: `${step.tool}: ${prep.ok ? '' : prep.errors.join('; ')}`, hi: `${step.tool}: ${prep.ok ? '' : prep.errors.join('; ')}` }
  try { return tool.describe(prep.args, ctx) } catch { return { en: step.tool, hi: step.tool } }
}

/**
 * Applies `steps` in order to a copy of `p`. If any step fails, nothing is applied (`ok: false`) and the
 * failing step says why; `skipFailed` instead leaves out the steps that fail and keeps the rest.
 */
export function runPlan(p: Project, steps: Step[], ctx: AgentCtx, skipFailed = false): RunResult {
  let draft: Project = structuredClone(p)
  // only problems a step makes count (an old project may already have a harmless oddity)
  const before = new Set(problems(p))
  const results: StepResult[] = []
  const after: After = {}
  for (const step of steps) {
    const tool = toolByName(step.tool)
    const prep = prepare(step)
    if (!tool || !prep.ok) {
      const why = prep.ok ? 'unknown tool' : prep.errors.join('; ')
      const error = { en: `Could not understand "${step.tool}": ${why}`, hi: `"${step.tool}" समझ नहीं आया: ${why}` }
      results.push({ step, ok: false, say: error, error })
      if (!skipFailed) return { ok: false, results, error }
      continue
    }
    const say = (() => { try { return tool.describe(prep.args, ctx) } catch { return { en: step.tool, hi: step.tool } } })()
    try {
      const stepAfter: After = {}
      const next = tool.run(draft, prep.args, ctx, stepAfter)
      const bad = problems(next).filter((x) => !before.has(x))
      if (bad.length) throw new AgentError(`That change would break the video (${bad[0]}), so it was not made.`, `इस बदलाव से वीडियो ख़राब हो जाती (${bad[0]}), इसलिए नहीं किया।`)
      draft = next
      Object.assign(after, stepAfter)
      results.push({ step, ok: true, say })
    } catch (e) {
      const error = e instanceof AgentError ? { en: e.message, hi: e.hi } : { en: `Something went wrong: ${(e as Error)?.message ?? e}`, hi: `कुछ गड़बड़ हुई: ${(e as Error)?.message ?? e}` }
      results.push({ step, ok: false, say, error })
      if (!skipFailed) return { ok: false, results, error }
    }
  }
  if (!results.some((r) => r.ok)) return { ok: false, results, error: results.find((r) => r.error)?.error ?? { en: 'Nothing to do.', hi: 'करने को कुछ नहीं।' } }
  return { ok: true, project: draft, results, after }
}

/** Anything in the project that would make the player or the export fail. Empty = fine. */
export function problems(p: Project): string[] {
  const out: string[] = []
  const fin = (n: unknown) => typeof n === 'number' && isFinite(n)
  const ids = new Set<string>()
  for (const c of p.clips) {
    if (ids.has(c.id)) out.push('two clips with one id')
    ids.add(c.id)
    if (!fin(c.in) || !fin(c.out) || !fin(c.speed) || c.speed <= 0) out.push('a clip with a broken time')
    else if ((c.out - c.in) / c.speed < MIN_CLIP - 1e-6) out.push('a clip that is too short')
    if (!fin(c.volume) || c.volume < 0) out.push('a broken volume')
    if (c.transition && !fin(c.transition.duration)) out.push('a broken transition')
  }
  for (const l of p.layers) {
    if (ids.has(l.id)) out.push('two items with one id')
    ids.add(l.id)
    if (!fin(l.start) || !fin(l.end) || l.end <= l.start) out.push('an item with a broken time')
  }
  if (!p.settings || !p.settings.aspect) out.push('missing video settings')
  return [...new Set(out)]
}
