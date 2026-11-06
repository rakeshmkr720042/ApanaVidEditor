/// <reference lib="webworker" />
// Runs Whisper (speech to text), MMS (text to speech) and Marian (translation) in the browser
// with transformers.js. The library and the ONNX runtime ship with the app; the models come
// with the app (Windows/Android builds include a small set), or are downloaded once and then
// kept in the browser cache, so everything here works without internet after that.

import { Tensor, env, pipeline } from '@huggingface/transformers'

type Pipe = (input: unknown, opts?: Record<string, unknown>) => Promise<unknown>
type Dtype = string | Record<string, string>
/** Whisper as the pipeline exposes it, for language detection. */
interface WhisperPipe extends Pipe {
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>
  model: ((inputs: Record<string, unknown>) => Promise<{ logits: { data: Float32Array; dims: number[] } }>) & {
    generation_config: { decoder_start_token_id: number; lang_to_id: Record<string, number> }
  }
}

/** Every request carries the app's address so the engine and bundled models load from it. */
interface Base { id: number; base: string }
export type AiRequest = Base & (
  | { type: 'asr'; audio: Float32Array; model: string; language: string | null; task: 'transcribe' | 'translate'; offset?: number }
  | { type: 'tts'; model: string; texts: string[] }
  | { type: 'mt'; model: string; texts: string[] }
  | { type: 'prepare'; task: Task; model: string }
)

export type Task = 'automatic-speech-recognition' | 'text-to-speech' | 'translation'

export type AiResponse =
  | { id: number; type: 'progress'; stage: 'download' | 'load' | 'work'; p: number }
  | { id: number; type: 'asr'; cues: { start: number; end: number; text: string }[]; language: string | null }
  | { id: number; type: 'tts'; clips: (Float32Array | null)[]; rate: number }
  | { id: number; type: 'mt'; texts: string[] }
  | { id: number; type: 'prepare' }
  | { id: number; type: 'error'; message: string }

/**
 * fetch for the AI engine. A file served without its size (the Windows app's own files, the
 * Android app's files) is read by transformers.js one piece at a time into a buffer that grows by
 * copying everything read so far: a 250 MB model took two and a half minutes to open that way.
 * Such a file from the app itself is read in one go instead, which takes about a second.
 */
async function fetchWithLength(input: string | URL, init?: RequestInit) {
  const res = await fetch(input, init)
  const url = String(input)
  if (!res.ok || res.headers.has('content-length') || (init?.method ?? 'GET') !== 'GET' || !base || (!url.startsWith(new URL(base).origin) && !url.startsWith('/'))) return res
  const body = await res.arrayBuffer()
  const headers = new Headers(res.headers)
  headers.set('content-length', String(body.byteLength))
  return new Response(body, { status: res.status, statusText: res.statusText, headers })
}

const pipes = new Map<string, Promise<Pipe>>()
let bundled: Promise<Set<string>> | null = null
let base = ''

/** Points the engine at the files that ship with the app (public/ort and public/models). */
function setup(b: string) {
  if (base === b) return
  base = b
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown } }
  if (onnx.wasm) onnx.wasm.wasmPaths = { mjs: b + 'ort/ort-wasm-simd-threaded.mjs', wasm: b + 'ort/ort-wasm-simd-threaded.wasm' }
  // a path without the origin: transformers.js only checks a local file exists when it is not a full URL
  env.localModelPath = new URL(b).pathname + 'models/'
  env.fetch = fetchWithLength
  // models/index.json lists the models built into this copy of the app (none on the website)
  bundled = fetch(b + 'models/index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((l: string[]) => new Set(l))
}

/**
 * Weights per Whisper size. Whisper's encoder loses a lot of accuracy when it is
 * squeezed to 8 bits (it starts inventing sentences), so it stays full size and
 * only the decoder is squeezed. Later entries are fallbacks for repos (or built-in
 * copies) that lack a file.
 *
 * Everything runs on the CPU ('wasm'): the app ships the CPU build of the ONNX runtime
 * (see vite.config.ts), which has no WebGPU backend. Asking it for WebGPU fails with
 * "[webgpu] backend not found", and transformers.js then refuses every later model load
 * in the same worker, so captions failed on any computer whose browser offers WebGPU
 * (the Windows app, Chrome, Edge).
 */
const WHISPER: Record<string, Dtype[]> = {
  'onnx-community/whisper-large-v3-turbo': [{ encoder_model: 'q8', decoder_model_merged: 'q8' }, 'q8'],
}
const whisperDtypes = (model: string) => WHISPER[model] ?? [{ encoder_model: 'fp32', decoder_model_merged: 'q8' }, 'q8', 'fp32']

/** File name endings transformers.js uses per precision. */
const SUFFIX: Record<string, string> = { fp32: '', q8: '_quantized', fp16: '_fp16', q4: '_q4', int8: '_int8', uint8: '_uint8', bnb4: '_bnb4', q4f16: '_q4f16' }

/**
 * Whether a built-in Whisper has the weight files for this precision. Trying one it lacks
 * is not harmless: a server can answer a missing file with a web page, the engine fails to
 * read that as a model, and after one such failure transformers.js refuses every later load.
 */
async function hasWeights(model: string, dtype: Dtype) {
  const of = (part: string) => (typeof dtype === 'string' ? dtype : dtype[part]) ?? 'fp32'
  const ok = await Promise.all(['encoder_model', 'decoder_model_merged'].map(async (part) => {
    try {
      const r = await fetch(`${base}models/${model}/onnx/${part}${SUFFIX[of(part)] ?? ''}.onnx`, { method: 'HEAD' })
      return r.ok && !/text\/html/i.test(r.headers.get('content-type') ?? '')
    } catch { return false }
  }))
  return ok.every(Boolean)
}

function getPipe(task: Task, model: string, id: number) {
  const key = task + ':' + model
  if (!pipes.has(key)) {
    // opening a big model takes a while even when it is on the device: say so instead of sitting at 0%
    post({ id, type: 'progress', stage: 'load', p: -1 })
    const files = new Map<string, [number, number]>()
    const progress_callback = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status !== 'progress' || !e.file || !e.total) return
      files.set(e.file, [e.loaded ?? 0, e.total])
      let a = 0, b = 0
      for (const [l, t] of files.values()) { a += l; b += t }
      post({ id, type: 'progress', stage: 'download', p: b ? a / b : 0 })
    }
    const p = bundled!.then(async (inApp) => {
      // a built-in model is read from the app's own files and never from the internet
      const local = inApp.has(model)
      env.allowLocalModels = local
      env.allowRemoteModels = !local
      env.useBrowserCache = !local // the app's own files need no second copy in the cache
      // some repos only ship full-precision weights
      let tries: Dtype[] = task === 'automatic-speech-recognition' ? whisperDtypes(model) : ['q8', 'fp32']
      if (local && task === 'automatic-speech-recognition') {
        const have = await Promise.all(tries.map((d) => hasWeights(model, d)))
        tries = tries.filter((_, i) => have[i])
      }
      // without internet, a saved or built-in model may only have some of these files: the next one is tried
      let first: unknown
      for (const dtype of tries) {
        try {
          return (await pipeline(task, model, { dtype, device: 'wasm', progress_callback } as never)) as unknown as Pipe
        } catch (e) { first ??= e }
      }
      if (first === undefined) throw new Error('This speech model is missing its files.')
      if (!local && (!navigator.onLine || /fetch|network/i.test(String(first)))) throw new Error('This AI model is not downloaded yet. Connect to the internet once, or download it in Offline & online on the home screen.')
      throw first
    })
    p.catch(() => pipes.delete(key))
    pipes.set(key, p)
  }
  return pipes.get(key)!
}

const post = (r: AiResponse, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(r, transfer)

const RATE = 16000
const rms = (a: Float32Array, from: number, to: number) => {
  let s = 0
  for (let i = from; i < to; i++) s += a[i] * a[i]
  return Math.sqrt(s / Math.max(1, to - from))
}

/** Cuts audio into pieces under 30 s (Whisper's window), cutting in the quietest spot near each boundary. */
function pieces(audio: Float32Array): [number, number][] {
  const out: [number, number][] = []
  const max = 28 * RATE, look = 6 * RATE, win = RATE / 10
  let start = 0
  while (start < audio.length) {
    if (audio.length - start <= max) { out.push([start, audio.length]); break }
    let best = start + max, bestE = Infinity
    for (let i = start + max - look; i <= start + max - win; i += win / 2) {
      const e = rms(audio, i, i + win)
      if (e < bestE) { bestE = e; best = i + win / 2 }
    }
    out.push([start, Math.floor(best)])
    start = Math.floor(best)
  }
  return out
}

interface Chunk { timestamp: [number, number | null]; text: string }

/**
 * Raises quiet recordings so speech sits at a steady level: the silence check
 * below then works the same for a phone mic and a studio mic. Never turns down.
 */
function normalise(audio: Float32Array) {
  const win = RATE / 10, levels: number[] = []
  for (let i = 0; i + win <= audio.length; i += win) levels.push(rms(audio, i, i + win))
  if (!levels.length) return
  levels.sort((a, b) => a - b)
  const speech = levels[Math.floor(levels.length * 0.9)] // loud parts, not the pauses
  if (speech <= 0) return
  const gain = Math.min(20, 0.1 / speech)
  if (gain <= 1.05) return
  for (let i = 0; i < audio.length; i++) audio[i] = Math.max(-1, Math.min(1, audio[i] * gain))
}

/** Whisper language codes it should never pick for this app's users on its own. */
const SAME_AS: Record<string, string> = {
  // spoken Hindi and Urdu sound the same; Whisper often hears Hindi as Urdu and writes Urdu script
  ur: 'hi',
}

/**
 * Whisper's own language guess: one decoder step after <|startoftranscript|>,
 * reading the scores of the language tokens. Summed over a few pieces so one
 * odd sentence does not decide. (transformers.js would otherwise assume English.)
 */
async function detectLanguage(pipe: WhisperPipe, slices: Float32Array[]) {
  const gc = pipe.model.generation_config
  const langs = Object.entries(gc.lang_to_id ?? {})
  if (!langs.length) return null
  const votes = new Map<string, number>()
  for (const slice of slices) {
    const { input_features } = await pipe.processor(slice)
    const out = await pipe.model({
      input_features, decoder_input_ids: new Tensor('int64', BigInt64Array.from([BigInt(gc.decoder_start_token_id)]), [1, 1]),
    })
    const V = out.logits.dims[out.logits.dims.length - 1]
    const row = out.logits.data.subarray(out.logits.data.length - V)
    const scores = langs.map(([tok, i]) => [tok.slice(2, -2), row[i]] as const)
    const max = Math.max(...scores.map((x) => x[1]))
    let sum = 0
    for (const [, v] of scores) sum += Math.exp(v - max)
    for (const [code, v] of scores) {
      const c = SAME_AS[code] ?? code
      votes.set(c, (votes.get(c) ?? 0) + Math.exp(v - max) / sum)
    }
  }
  return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** True when Whisper got stuck repeating itself ("पपपपप…", "the the the…"). */
function looping(text: string) {
  if (/([^\d\s.])\1{7,}/u.test(text)) return true
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 12) return false
  return new Set(words).size / words.length < 0.3
}

/** Collapses a run of the same word or phrase said over and over into one. */
const dedupe = (text: string) => text.replace(/([^\d\s.])\1{4,}/gu, '$1').replace(/(^|\s)(\S.{0,39}?)(?:\s+\2){3,}(?=\s|$)/gu, '$1$2')

async function asr(r: Extract<AiRequest, { type: 'asr' }>) {
  const pipe = (await getPipe('automatic-speech-recognition', r.model, r.id)) as unknown as WhisperPipe
  normalise(r.audio)
  const cues: { start: number; end: number; text: string }[] = []
  const parts = pieces(r.audio).filter(([a, b]) => rms(r.audio, a, b) >= 0.004) // silence: Whisper would invent words
  const run = (fn: (p: WhisperPipe) => Promise<unknown>) => fn(pipe)
  let language = r.language
  if (!language && parts.length) {
    post({ id: r.id, type: 'progress', stage: 'work', p: 0 })
    // a few pieces spread over the recording
    const pick = [...new Set([0, Math.floor(parts.length / 2), parts.length - 1])].slice(0, 3)
    language = (await run((p) => detectLanguage(p, pick.map((i) => r.audio.subarray(...parts[i]))))) as string | null
  }
  for (let i = 0; i < parts.length; i++) {
    post({ id: r.id, type: 'progress', stage: 'work', p: i / parts.length })
    const [a, b] = parts[i]
    const slice = r.audio.subarray(a, b)
    const opts = { return_timestamps: true, task: r.task, ...(language ? { language } : {}) }
    let res = (await run((p) => p(slice, opts))) as { text: string; chunks?: Chunk[] }
    // a stuck piece is listened to again with repeats forbidden (Whisper's own fallback does the same job)
    if (looping(res.text)) res = (await run((p) => p(slice, { ...opts, no_repeat_ngram_size: 3 }))) as typeof res
    const off = (r.offset ?? 0) + a / RATE, len = (b - a) / RATE
    const chunks = res.chunks?.length ? res.chunks : [{ timestamp: [0, len] as [number, number], text: res.text }]
    for (const c of chunks) {
      const text = dedupe(c.text.trim())
      if (!text || /^[[(].*[\])]$/.test(text) || looping(text)) continue // [Music], (applause), junk
      const s = off + Math.min(len, c.timestamp[0])
      const e = off + Math.min(len, c.timestamp[1] ?? len)
      cues.push({ start: s, end: Math.max(s + 0.3, e), text })
    }
  }
  post({ id: r.id, type: 'asr', cues, language })
}

async function tts(r: Extract<AiRequest, { type: 'tts' }>) {
  const pipe = await getPipe('text-to-speech', r.model, r.id)
  const clips: (Float32Array | null)[] = []
  let rate = RATE
  for (let i = 0; i < r.texts.length; i++) {
    post({ id: r.id, type: 'progress', stage: 'work', p: i / r.texts.length })
    const text = r.texts[i].replace(/\s+/g, ' ').trim()
    if (!text) { clips.push(null); continue }
    const out = (await pipe(text)) as { audio: Float32Array; sampling_rate: number }
    rate = out.sampling_rate
    clips.push(out.audio)
  }
  const buffers = new Set(clips.filter((c): c is Float32Array => !!c).map((c) => c.buffer as ArrayBuffer))
  post({ id: r.id, type: 'tts', clips, rate }, [...buffers])
}

/** Translates each text with a Marian model (one language pair per model). */
async function mt(r: Extract<AiRequest, { type: 'mt' }>) {
  const pipe = await getPipe('translation', r.model, r.id)
  const texts: string[] = []
  for (let i = 0; i < r.texts.length; i++) {
    post({ id: r.id, type: 'progress', stage: 'work', p: i / r.texts.length })
    const text = r.texts[i].trim()
    if (!text) { texts.push(''); continue }
    const out = (await pipe(text, { max_new_tokens: 256 })) as { translation_text: string }[]
    texts.push(out[0]?.translation_text?.trim() ?? '')
  }
  post({ id: r.id, type: 'mt', texts })
}

/** Loads a model without using it, so it is downloaded and cached for offline use. */
async function prepare(r: Extract<AiRequest, { type: 'prepare' }>) {
  await getPipe(r.task, r.model, r.id)
  post({ id: r.id, type: 'prepare' })
}

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const r = e.data
  setup(r.base)
  const run = r.type === 'asr' ? asr(r) : r.type === 'tts' ? tts(r) : r.type === 'mt' ? mt(r) : prepare(r)
  run.catch((err: unknown) => post({ id: r.id, type: 'error', message: err instanceof Error ? err.message : String(err) }))
}
