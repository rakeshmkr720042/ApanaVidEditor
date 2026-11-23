/**
 * A tiny JSON-schema subset for the chat agent's tools. The same description is used three ways:
 * shown to the AI (as real JSON Schema), used to check what the AI sent back, and used to tidy it
 * (numbers written as text become numbers, values out of range are pulled into range).
 */
export type S =
  | { type: 'number' | 'integer'; min?: number; max?: number; desc?: string }
  | { type: 'string'; enum?: readonly string[]; desc?: string; max?: number }
  | { type: 'boolean'; desc?: string }
  | { type: 'array'; items: S; desc?: string; maxItems?: number }
  | { type: 'object'; props: Record<string, S>; required?: string[]; desc?: string }
  | { anyOf: S[]; desc?: string }

/** Real JSON Schema (for Ollama `format`, OpenAI `json_schema`, Gemini `responseSchema`, Claude tools). */
export function toJSONSchema(s: S): Record<string, unknown> {
  const d = s.desc ? { description: s.desc } : {}
  if ('anyOf' in s) return { anyOf: s.anyOf.map(toJSONSchema), ...d }
  switch (s.type) {
    case 'number': case 'integer':
      return { type: s.type, ...(s.min != null ? { minimum: s.min } : {}), ...(s.max != null ? { maximum: s.max } : {}), ...d }
    case 'string': return { type: 'string', ...(s.enum ? { enum: [...s.enum] } : {}), ...d }
    case 'boolean': return { type: 'boolean', ...d }
    case 'array': return { type: 'array', items: toJSONSchema(s.items), ...d }
    case 'object': return {
      type: 'object', properties: Object.fromEntries(Object.entries(s.props).map(([k, v]) => [k, toJSONSchema(v)])),
      required: s.required ?? [], ...d,
    }
  }
}

/** A one-line, short form of a schema, for the tool list in the AI's prompt (small models have little room). */
export function brief(s: S): string {
  if ('anyOf' in s) return s.anyOf.map(brief).join('|')
  switch (s.type) {
    case 'number': case 'integer': return s.min != null && s.max != null ? `${s.type === 'integer' ? 'int' : 'num'} ${s.min}..${s.max}` : s.type === 'integer' ? 'int' : 'num'
    case 'string': return s.enum ? (s.enum.length <= 12 ? s.enum.map((x) => `"${x}"`).join('|') : `"${s.enum.slice(0, 10).join('"|"')}"|…`) : 'text'
    case 'boolean': return 'true|false'
    case 'array': return `[${brief(s.items)}]`
    case 'object': return `{${Object.entries(s.props).map(([k, v]) => `${k}${s.required?.includes(k) ? '' : '?'}: ${brief(v)}`).join(', ')}}`
  }
}

export interface Checked { ok: boolean; value: unknown; errors: string[] }

const num = (v: unknown) => {
  if (typeof v === 'number') return v
  if (typeof v !== 'string' || !v.trim()) return NaN
  const s = v.trim()
  const n = Number(s.replace(/\s*[%x]$/i, ''))
  return !isFinite(n) ? NaN : /%$/.test(s) ? n / 100 : n // "150%" = 1.5
}

/** Checks `v` against `s`, tidying it on the way. Errors name the path, so the AI can be told exactly what to fix. */
export function check(s: S, v: unknown, path = 'args'): Checked {
  const errors: string[] = []
  const out = walk(s, v, path, errors)
  return { ok: errors.length === 0, value: out, errors }
}

function walk(s: S, v: unknown, path: string, errors: string[]): unknown {
  if ('anyOf' in s) {
    for (const alt of s.anyOf) {
      const e: string[] = []
      const r = walk(alt, v, path, e)
      if (!e.length) return r
    }
    errors.push(`${path}: expected ${brief(s)}`)
    return v
  }
  switch (s.type) {
    case 'number': case 'integer': {
      let n = num(v)
      if (!isFinite(n)) { errors.push(`${path}: expected a number`); return v }
      if (s.type === 'integer') n = Math.round(n)
      if (s.min != null) n = Math.max(s.min, n)
      if (s.max != null) n = Math.min(s.max, n)
      return n
    }
    case 'string': {
      if (typeof v === 'number') v = String(v)
      if (typeof v !== 'string') { errors.push(`${path}: expected text`); return v }
      if (s.enum) {
        const hit = s.enum.find((x) => x.toLowerCase() === (v as string).trim().toLowerCase())
        if (!hit) { errors.push(`${path}: "${v}" is not one of ${s.enum.length > 15 ? s.enum.slice(0, 15).join(', ') + '…' : s.enum.join(', ')}`); return v }
        return hit
      }
      return s.max ? v.slice(0, s.max) : v
    }
    case 'boolean':
      if (typeof v === 'boolean') return v
      if (v === 'true' || v === 'false') return v === 'true'
      errors.push(`${path}: expected true or false`)
      return v
    case 'array': {
      const list = Array.isArray(v) ? v : v == null ? v : [v] // a single value where a list is expected is a list of one
      if (!Array.isArray(list)) { errors.push(`${path}: expected a list`); return v }
      return list.slice(0, s.maxItems ?? 200).map((x, i) => walk(s.items, x, `${path}[${i}]`, errors))
    }
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push(`${path}: expected an object`); return v }
      const o: Record<string, unknown> = {}
      for (const [k, sub] of Object.entries(s.props)) {
        const x = (v as Record<string, unknown>)[k]
        if (x === undefined || x === null) { if (s.required?.includes(k)) errors.push(`${path}.${k} is required`); continue }
        o[k] = walk(sub, x, `${path}.${k}`, errors)
      }
      return o // unknown keys are dropped
    }
  }
}
