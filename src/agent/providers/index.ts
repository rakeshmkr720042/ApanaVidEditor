/**
 * The AI behind the chat: Local AI (Ollama on the user's computer, free) or an online AI with the user's own key
 * (Pro). One interface, three wire formats: Ollama, OpenAI-compatible (OpenAI, DeepSeek, Grok, OpenRouter,
 * any custom server) and Anthropic (Claude), plus Gemini.
 *
 * Requests go straight from this device to the provider: Windows app through the main process (the key is added
 * there), Android through the native HTTP client, web with fetch. Nothing goes through our servers.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { desktop } from '../../lib/desktop'
import { getLocalAI, reachHelp } from '../../lib/localai'
import { redact, storedKey } from './keys'

export type ProviderId = 'ollama' | 'anthropic' | 'gemini' | 'openai' | 'deepseek' | 'xai' | 'openrouter' | 'custom'
type Wire = 'ollama' | 'openai' | 'anthropic' | 'gemini'

export interface ProviderInfo {
  id: ProviderId
  name: string
  wire: Wire
  /** Default server address (custom: typed by the user). */
  base: string
  online: boolean
  /** Where the user gets a key. */
  keyUrl?: string
  /** Shown in the model box until the list loads. */
  suggest: string[]
}

export const PROVIDERS: ProviderInfo[] = [
  { id: 'ollama', name: 'Local AI (Ollama, free)', wire: 'ollama', base: 'http://localhost:11434', online: false, suggest: ['gemma4:e4b'] },
  { id: 'anthropic', name: 'Claude (Anthropic)', wire: 'anthropic', base: 'https://api.anthropic.com', online: true, keyUrl: 'https://console.anthropic.com/settings/keys', suggest: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
  { id: 'gemini', name: 'Gemini (Google)', wire: 'gemini', base: 'https://generativelanguage.googleapis.com', online: true, keyUrl: 'https://aistudio.google.com/apikey', suggest: ['gemini-2.5-flash'] },
  { id: 'openai', name: 'ChatGPT (OpenAI)', wire: 'openai', base: 'https://api.openai.com/v1', online: true, keyUrl: 'https://platform.openai.com/api-keys', suggest: ['gpt-4.1-mini'] },
  { id: 'deepseek', name: 'DeepSeek', wire: 'openai', base: 'https://api.deepseek.com/v1', online: true, keyUrl: 'https://platform.deepseek.com/api_keys', suggest: ['deepseek-chat'] },
  { id: 'xai', name: 'Grok (xAI)', wire: 'openai', base: 'https://api.x.ai/v1', online: true, keyUrl: 'https://console.x.ai', suggest: ['grok-3-mini'] },
  { id: 'openrouter', name: 'OpenRouter (many AIs, one key)', wire: 'openai', base: 'https://openrouter.ai/api/v1', online: true, keyUrl: 'https://openrouter.ai/keys', suggest: ['openai/gpt-4.1-mini'] },
  { id: 'custom', name: 'Other (OpenAI-compatible address)', wire: 'openai', base: '', online: true, suggest: [] },
]
export const providerInfo = (id: ProviderId) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

/** Which AI the chat uses. No key in here (see keys.ts). */
export interface AIChoice { provider: ProviderId; model: string; base?: string; tabOnly?: boolean }

const CHOICE = 'agent-ai'
export function getChoice(): AIChoice {
  try {
    const c = JSON.parse(localStorage.getItem(CHOICE) ?? 'null') as AIChoice | null
    if (c && PROVIDERS.some((p) => p.id === c.provider)) return c
  } catch { /* private mode */ }
  const local = getLocalAI()
  return { provider: 'ollama', model: local.model || 'gemma4:e4b', base: local.url }
}
export function setChoice(c: AIChoice) { try { localStorage.setItem(CHOICE, JSON.stringify(c)) } catch { /* private mode */ } }

export const baseOf = (c: AIChoice) => (c.base?.trim() || providerInfo(c.provider).base).replace(/\/+$/, '')
const originOf = (url: string) => { try { return new URL(url).origin } catch { return '' } }

// ---------- one HTTP path for every platform ----------

interface Req { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; body?: unknown; auth?: { header: string; prefix: string; provider: ProviderId }; timeout: number; signal?: AbortSignal }

const native = Capacitor.isNativePlatform()

async function send(r: Req): Promise<{ status: number; data: unknown }> {
  const key = r.auth ? storedKey(r.auth.provider) : null
  if (r.auth && !key) throw new Error('Add your API key for this AI first (AI chat → AI settings).')
  if (key && key.origin !== originOf(r.url)) throw new Error('This key was saved for a different address. Save it again.')
  const body = r.body == null ? undefined : JSON.stringify(r.body)
  const parse = (t: string) => { try { return JSON.parse(t) } catch { return t } }
  if (r.signal?.aborted) throw new DOMException('Stopped', 'AbortError')

  // Windows app: the main process adds the key (the page never sees it) and has no CORS rules
  if (desktop?.aiFetch && (!key || key.sealed)) {
    const res = await raceAbort(desktop.aiFetch({ url: r.url, method: r.method, headers: r.headers, body, sealed: key?.v ?? null, auth: r.auth ? { header: r.auth.header, prefix: r.auth.prefix } : null, timeout: r.timeout }), r.signal)
    return { status: res.status, data: parse(res.text) }
  }
  const headers = { ...r.headers, ...(key && r.auth ? { [r.auth.header]: r.auth.prefix + key.v } : {}) }
  if (native) {
    // the native request skips the WebView's mixed-content and cross-origin rules
    const res = await raceAbort(CapacitorHttp.request({ url: r.url, method: r.method, headers, data: r.body, connectTimeout: 10_000, readTimeout: r.timeout }), r.signal)
    return { status: res.status, data: typeof res.data === 'string' ? parse(res.data) : res.data }
  }
  const ctl = new AbortController()
  const stop = () => ctl.abort()
  r.signal?.addEventListener('abort', stop)
  const timer = setTimeout(stop, r.timeout)
  try {
    const res = await fetch(r.url, { method: r.method, headers, body, signal: ctl.signal })
    return { status: res.status, data: parse(await res.text()) }
  } finally { clearTimeout(timer); r.signal?.removeEventListener('abort', stop) }
}

function raceAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p
  return new Promise<T>((ok, bad) => {
    const onAbort = () => bad(new DOMException('Stopped', 'AbortError'))
    signal.addEventListener('abort', onAbort, { once: true })
    p.then(ok, bad).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** A short reason the user can act on, from an error answer of any provider. Keys are never shown. */
function why(status: number, data: unknown, p: ProviderInfo): string {
  const d = data as { error?: { message?: string } | string; message?: string } | null
  const msg = typeof d?.error === 'string' ? d.error : d?.error?.message ?? d?.message ?? (typeof data === 'string' ? data.slice(0, 200) : '')
  if (status === 401 || status === 403) return p.online ? `${p.name}: the API key was not accepted. Check it in AI settings.` : `Ollama refused this app. ${msg}`
  if (status === 402) return `${p.name}: no credit left on your account.`
  if (status === 404) return `${p.name}: model not found. Pick another model in AI settings. ${msg}`
  if (status === 429) return `${p.name}: too many requests or usage limit reached. Wait a little and try again.`
  return redact(`${p.name} answered with error ${status}${msg ? `: ${msg}` : ''}`)
}

// ---------- the calls ----------

export interface Ask {
  system: string
  user: string
  /** JSON Schema of the answer (used where the provider can enforce it). */
  schema?: Record<string, unknown>
  signal?: AbortSignal
  timeout?: number
}
export interface Answer { text: string; usage?: { input: number; output: number } }

/** One request → the model's text answer (JSON text when `schema` is given). */
export async function askAI(c: AIChoice, a: Ask): Promise<Answer> {
  const p = providerInfo(c.provider)
  const base = baseOf(c)
  if (!base) throw new Error('Type the server address in AI settings.')
  if (!c.model) throw new Error('Pick a model in AI settings.')
  const timeout = a.timeout ?? (p.online ? 90_000 : 5 * 60_000)
  const json = { 'Content-Type': 'application/json' }
  let r: { status: number; data: unknown }
  try {
    if (p.wire === 'ollama') {
      r = await send({ url: `${base}/api/chat`, method: 'POST', headers: json, timeout, signal: a.signal, body: {
        model: c.model, stream: false, keep_alive: '30m', ...(a.schema ? { format: a.schema } : {}),
        options: { temperature: 0, num_ctx: 8192 },
        messages: [{ role: 'system', content: a.system }, { role: 'user', content: a.user }],
      } })
    } else if (p.wire === 'anthropic') {
      r = await send({ url: `${base}/v1/messages`, method: 'POST', timeout, signal: a.signal, auth: { header: 'x-api-key', prefix: '', provider: c.provider },
        headers: { ...json, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: { model: c.model, max_tokens: 4096, output_config: { effort: 'low' }, system: a.system, messages: [{ role: 'user', content: a.user }] } })
    } else if (p.wire === 'gemini') {
      r = await send({ url: `${base}/v1beta/models/${encodeURIComponent(c.model.replace(/^models\//, ''))}:generateContent`, method: 'POST', timeout, signal: a.signal,
        auth: { header: 'x-goog-api-key', prefix: '', provider: c.provider }, headers: json,
        body: { systemInstruction: { parts: [{ text: a.system }] }, contents: [{ role: 'user', parts: [{ text: a.user }] }], generationConfig: { temperature: 0, ...(a.schema ? { responseMimeType: 'application/json' } : {}) } } })
    } else {
      r = await send({ url: `${base}/chat/completions`, method: 'POST', timeout, signal: a.signal,
        auth: { header: 'Authorization', prefix: 'Bearer ', provider: c.provider },
        headers: { ...json, ...(c.provider === 'openrouter' ? { 'X-Title': 'Apna Editor' } : {}) },
        body: { model: c.model, messages: [{ role: 'system', content: a.system }, { role: 'user', content: a.user }], ...(a.schema ? { response_format: { type: 'json_object' } } : {}) } })
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    if (!p.online) throw new Error(reachHelp(base))
    throw new Error(redact(`Could not reach ${p.name}. Check the internet connection. ${(e as Error).message ?? ''}`))
  }
  if (r.status >= 400) throw new Error(why(r.status, r.data, p))
  return readAnswer(p.wire, r.data)
}

/** The text and token use of a provider's answer. */
export function readAnswer(wire: Wire, data: unknown): Answer {
  const d = data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  if (wire === 'ollama') return { text: d?.message?.content ?? '', usage: { input: d?.prompt_eval_count ?? 0, output: d?.eval_count ?? 0 } }
  if (wire === 'anthropic') {
    if (d?.stop_reason === 'refusal') throw new Error('Claude declined this request.')
    const text = (d?.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
    return { text, usage: { input: d?.usage?.input_tokens ?? 0, output: d?.usage?.output_tokens ?? 0 } }
  }
  if (wire === 'gemini') {
    const text = (d?.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('')
    return { text, usage: { input: d?.usageMetadata?.promptTokenCount ?? 0, output: d?.usageMetadata?.candidatesTokenCount ?? 0 } }
  }
  return { text: d?.choices?.[0]?.message?.content ?? '', usage: { input: d?.usage?.prompt_tokens ?? 0, output: d?.usage?.completion_tokens ?? 0 } }
}

/** The models this account / computer can use. Throws with a reason (bad key, server off…). */
export async function listModels(c: AIChoice): Promise<string[]> {
  const p = providerInfo(c.provider)
  const base = baseOf(c)
  let r: { status: number; data: unknown }
  try {
    if (p.wire === 'ollama') r = await send({ url: `${base}/api/tags`, method: 'GET', headers: {}, timeout: 10_000 })
    else if (p.wire === 'anthropic') r = await send({ url: `${base}/v1/models?limit=100`, method: 'GET', timeout: 20_000, auth: { header: 'x-api-key', prefix: '', provider: c.provider }, headers: { 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } })
    else if (p.wire === 'gemini') r = await send({ url: `${base}/v1beta/models?pageSize=200`, method: 'GET', timeout: 20_000, auth: { header: 'x-goog-api-key', prefix: '', provider: c.provider }, headers: {} })
    else r = await send({ url: `${base}/models`, method: 'GET', timeout: 20_000, auth: { header: 'Authorization', prefix: 'Bearer ', provider: c.provider }, headers: {} })
  } catch (e) {
    if (!p.online) throw new Error(reachHelp(base))
    throw new Error(redact(`Could not reach ${p.name}: ${(e as Error).message}`))
  }
  if (r.status >= 400) throw new Error(why(r.status, r.data, p))
  const d = r.data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  if (p.wire === 'ollama') return (d?.models ?? []).map((m: { name: string }) => m.name)
  if (p.wire === 'gemini') return (d?.models ?? []).filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent')).map((m: { name: string }) => m.name.replace(/^models\//, ''))
  return (d?.data ?? []).map((m: { id: string }) => m.id).sort()
}
