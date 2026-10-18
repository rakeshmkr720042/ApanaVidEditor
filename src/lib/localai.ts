import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { isDesktop } from './desktop'

/**
 * Local AI: a language model the user runs on their own computer with Ollama (for example Gemma).
 * Off until a server is set up in the Local AI sheet. Used to shorten text into key points, write
 * quiz questions from notes, and translate subtitles without the online translator.
 */

export interface LocalAI { on: boolean; url: string; model: string; translate: boolean }

const KEY = 'local-ai'
export const DEFAULT_URL = 'http://localhost:11434'
const TIMEOUT = 5 * 60_000 // a small model on a laptop CPU can take a while on a long text

export function getLocalAI(): LocalAI {
  const d: LocalAI = { on: false, url: DEFAULT_URL, model: '', translate: true }
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return d }
}
export function setLocalAI(patch: Partial<LocalAI>) {
  const next = { ...getLocalAI(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
  return next
}
/** The settings when Local AI is switched on and has a model, else null. */
export const localAI = () => { const c = getLocalAI(); return c.on && c.url && c.model ? c : null }

const native = Capacitor.isNativePlatform()
const base = (url: string) => url.trim().replace(/\/+$/, '').replace(/^(?!https?:\/\/)/i, 'http://')
const isLoopback = (host: string) => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(host)

/**
 * Why the server could not be reached, in words the user can act on. The browser hides the
 * real reason (server off, wrong address, or this site not allowed), so all the fixes are listed.
 */
export function reachHelp(url: string) {
  const host = (() => { try { return new URL(base(url)).hostname } catch { return '' } })()
  const steps = [`Could not reach Ollama at ${base(url)}.`, '• Check that Ollama is running on the computer (the Ollama app, or "ollama serve" in PowerShell).']
  if (!native && !isDesktop) {
    steps.push(`• This web page must be allowed to talk to Ollama. In PowerShell run:  setx OLLAMA_ORIGINS "${location.origin}"  then quit Ollama from the tray and start it again.`)
    steps.push('• If the browser asks to let this site use apps on your device, allow it.')
  }
  if (!isLoopback(host)) steps.push('• From a phone: Ollama must listen on the network. Run  setx OLLAMA_HOST "0.0.0.0"  restart Ollama, allow it in Windows Firewall, and use the laptop\'s Wi-Fi address (ipconfig → IPv4), with both on the same Wi-Fi.')
  return steps.join('\n')
}

/** A web page served over https can't call an http address on the network; localhost is the exception. */
function blocked(url: string) {
  if (native || isDesktop || location.protocol !== 'https:') return null
  try {
    const u = new URL(base(url))
    if (u.protocol === 'http:' && !isLoopback(u.hostname)) {
      return 'The web app can only reach Ollama on this same computer (http://localhost:11434). To use the laptop\'s Ollama from a phone, use the Android app; on the laptop, use the Windows app or localhost.'
    }
  } catch { return 'That server address is not valid' }
  return null
}

async function request<T>(url: string, path: string, body?: unknown, timeout = TIMEOUT): Promise<T> {
  const why = blocked(url)
  if (why) throw new Error(why)
  const full = base(url) + path
  if (native) {
    // the native request skips the WebView's mixed-content and cross-origin rules
    let r: { status: number; data: unknown }
    try {
      r = await CapacitorHttp.request({ url: full, method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, data: body, connectTimeout: 8000, readTimeout: timeout })
    } catch { throw new Error(reachHelp(url)) }
    const data = typeof r.data === 'string' ? (() => { try { return JSON.parse(r.data as string) } catch { return r.data } })() : r.data
    if (r.status >= 400) throw new Error(errorOf(data, r.status))
    return data as T
  }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  let res: Response
  try {
    res = await fetch(full, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal })
  } catch (e) {
    // a quick request that times out means the address doesn't answer at all
    throw new Error((e as Error).name === 'AbortError' && timeout === TIMEOUT ? 'Local AI took too long to answer. Try a shorter text.' : reachHelp(url))
  } finally { clearTimeout(timer) }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(errorOf(data, res.status))
  return data as T
}

const errorOf = (data: unknown, status: number) => {
  const e = (data as { error?: string } | null)?.error
  if (status === 403) return 'Ollama refused this app. Set OLLAMA_ORIGINS as shown in Local AI settings, then restart Ollama.'
  if (e && /not found/i.test(e)) return `${e}. Pick a model you have installed (ollama list).`
  return e ? `Local AI: ${e}` : `Local AI answered with error ${status}`
}

/** Installed model names, from Ollama's /api/tags. Throws with help text when the server can't be reached. */
export async function listModels(url: string): Promise<string[]> {
  const r = await request<{ models?: { name: string }[] }>(url, '/api/tags', undefined, 10_000)
  return (r.models ?? []).map((m) => m.name)
}

/** The model to start with: a Gemma one if there is one, else the first. */
export const pickModel = (models: string[]) => models.find((m) => /gemma/i.test(m)) ?? models[0] ?? ''

/** One chat turn with the local model; returns its answer as plain text. */
export async function ask(system: string, user: string, cfg = localAI()): Promise<string> {
  if (!cfg) throw new Error('Set up Local AI first (Home → Local AI)')
  const r = await request<{ message?: { content?: string } }>(cfg.url, '/api/chat', {
    model: cfg.model, stream: false, options: { temperature: 0.3 },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })
  return clean(r.message?.content ?? '')
}

/** Drops thinking and a ``` fence around the answer, if the model added them. */
export function clean(s: string) {
  let out = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fence = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(out)
  if (fence) out = fence[1].trim()
  return out
}

const deva = (s: string) => /[ऀ-ॿ]/.test(s)
const sameLanguage = (text: string) => (deva(text) ? 'Write in Hindi (Devanagari), the language of the text.' : 'Write in the same language as the text.')

/** Shortens a script or article into key points, in the Script to video format (# title, short headings, - points). */
export async function keyPoints(text: string): Promise<string> {
  const out = await ask(
    'You turn long text into a short video script. Reply with the script only, no introduction or closing remarks. Format:\n'
    + '# Title of the video\n\n## First section heading\n- a key point\n- a key point\n\n## Next section heading\n- a key point\n\n'
    + 'Rules: 3 to 6 sections; 2 to 4 points per section; each point one short sentence of at most 15 words; keep names, numbers and facts exact; '
    + 'do not invent anything that is not in the text; no bold or other markdown besides # and - . ' + sameLanguage(text),
    text.slice(0, 24_000),
  )
  if (!/\S/.test(out)) throw new Error('Local AI gave an empty answer. Try again.')
  return out
}

/**
 * Article version of keyPoints: the headline, source line and pictures are kept as they are,
 * only the story text is shortened, and the pictures go back in between the new sections.
 */
export async function articleKeyPoints(raw: string): Promise<string> {
  const lines = raw.split('\n')
  const pics = lines.filter((l) => /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(l))
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  const head: string[] = []
  if (/^#\s/.test(lines[i] ?? '')) head.push(lines[i++])
  while (i < lines.length && (!lines[i].trim() || /^source:/i.test(lines[i].trim()))) { if (lines[i].trim()) head.push(lines[i]); i++ }
  const body = lines.slice(i).filter((l) => !pics.includes(l)).join('\n').trim()
  if (!body) throw new Error('There is no article text to shorten')
  const short = (await keyPoints((head[0] ? head[0] + '\n\n' : '') + body)).split('\n')
  if (head[0] && /^#\s/.test(short.find((l) => l.trim()) ?? '')) short.splice(short.findIndex((l) => l.trim()), 1) // keep the real headline
  const out: string[] = [head.join('\n\n'), '']
  let p = 0
  for (const l of short) {
    if (/^##\s/.test(l) && p < pics.length && out.some((o) => /^##\s/.test(o))) out.push(pics[p++], '')
    out.push(l)
  }
  if (p < pics.length) out.push('', ...pics.slice(p))
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Writes quiz questions (or flashcards) from notes, in the format Quiz to video reads. */
export async function makeQuiz(text: string, mode: 'quiz' | 'cards', count = 5): Promise<string> {
  const format = mode === 'quiz'
    ? 'Q: the question?\nA) option\nB) option *\nC) option\nD) option\nExplanation: one short sentence why.\n\nMark the one right option with * at the end of its line. Four options each.'
    : 'Q: the question or term\nA: the answer, short\n\n'
  const out = await ask(
    `You write ${mode === 'quiz' ? 'multiple-choice quiz questions' : 'flashcards'} for a video from the text the user gives. Reply with the ${mode === 'quiz' ? 'questions' : 'cards'} only, no introduction. `
    + `First line: "# " and a short title. Then exactly ${count} items, a blank line between them, each in this format:\n${format}\n`
    + 'Only use facts from the text. No bold or other markdown. ' + sameLanguage(text),
    text.slice(0, 24_000),
  )
  if (!/^Q:/m.test(out)) throw new Error('Local AI did not write any questions. Try again or use a longer text.')
  return out
}

/** Translates one line; the answer is only the translation. */
export async function translateLine(text: string, from: string, to: string) {
  const out = await ask(
    `You are a translator for video subtitles. Translate the user's text ${from === 'auto' ? '' : `from ${from} `}to ${to}. `
    + 'Reply with the translation only, on one line, no quotes or notes. Keep names and numbers as they are.',
    text,
  )
  return out.replace(/\s*\n+\s*/g, ' ').replace(/^["“]|["”]$/g, '').trim() || text
}
