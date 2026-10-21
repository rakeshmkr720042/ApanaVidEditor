/// <reference lib="webworker" />
// Runs Whisper (speech to text), MMS (text to speech) and Marian (translation) in the browser
// with transformers.js. The library and the ONNX runtime ship with the app; the models come
// with the app (Windows/Android builds include a small set), or are downloaded once and then
// kept in the browser cache, so everything here works without internet after that.

import { env, pipeline } from '@huggingface/transformers'

type Pipe = (input: unknown, opts?: Record<string, unknown>) => Promise<unknown>

/** Every request carries the app's address so the engine and bundled models load from it. */
interface Base { id: number; base: string }
export type AiRequest = Base & (
  | { type: 'asr'; audio: Float32Array; model: string; language: string | null; task: 'transcribe' | 'translate' }
  | { type: 'tts'; model: string; texts: string[] }
  | { type: 'mt'; model: string; texts: string[] }
  | { type: 'prepare'; task: Task; model: string }
)

export type Task = 'automatic-speech-recognition' | 'text-to-speech' | 'translation'

export type AiResponse =
  | { id: number; type: 'progress'; stage: 'download' | 'work'; p: number }
  | { id: number; type: 'asr'; cues: { start: number; end: number; text: string }[] }
  | { id: number; type: 'tts'; clips: (Float32Array | null)[]; rate: number }
  | { id: number; type: 'mt'; texts: string[] }
  | { id: number; type: 'prepare' }
  | { id: number; type: 'error'; message: string }

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
  // models/index.json lists the models built into this copy of the app (none on the website)
  bundled = fetch(b + 'models/index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []).then((l: string[]) => new Set(l))
}

function getPipe(task: Task, model: string, id: number) {
  const key = task + ':' + model
  if (!pipes.has(key)) {
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
      const load = (dtype: string) => pipeline(task, model, { dtype, device: 'wasm', progress_callback } as never) as unknown as Promise<Pipe>
      try {
        return await load('q8')
      } catch (e) {
        // some repos only ship full-precision weights
        try { return await load('fp32') } catch {
          if (!local && (!navigator.onLine || /fetch|network/i.test(String(e)))) throw new Error('This AI model is not downloaded yet. Connect to the internet once, or download it in Offline & online on the home screen.')
          throw e
        }
      }
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

async function asr(r: Extract<AiRequest, { type: 'asr' }>) {
  const pipe = await getPipe('automatic-speech-recognition', r.model, r.id)
  const cues: { start: number; end: number; text: string }[] = []
  const parts = pieces(r.audio)
  for (let i = 0; i < parts.length; i++) {
    post({ id: r.id, type: 'progress', stage: 'work', p: i / parts.length })
    const [a, b] = parts[i]
    const slice = r.audio.subarray(a, b)
    if (rms(slice, 0, slice.length) < 0.003) continue // silence: Whisper would invent words
    const res = (await pipe(slice, {
      return_timestamps: true, task: r.task, ...(r.language ? { language: r.language } : {}),
    })) as { text: string; chunks?: Chunk[] }
    const off = a / RATE, len = (b - a) / RATE
    const chunks = res.chunks?.length ? res.chunks : [{ timestamp: [0, len] as [number, number], text: res.text }]
    for (const c of chunks) {
      const text = c.text.trim()
      if (!text || /^[[(].*[\])]$/.test(text)) continue // [Music], (applause)…
      const s = off + Math.min(len, c.timestamp[0])
      const e = off + Math.min(len, c.timestamp[1] ?? len)
      cues.push({ start: s, end: Math.max(s + 0.3, e), text })
    }
  }
  post({ id: r.id, type: 'asr', cues })
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
