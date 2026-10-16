/// <reference lib="webworker" />
// Runs Whisper (speech to text) and MMS (text to speech) in the browser with transformers.js.
// The library and the models are fetched on first use and then kept in the browser cache.

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1'

type Pipe = (input: unknown, opts?: Record<string, unknown>) => Promise<unknown>
interface Lib {
  pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<Pipe>
  env: { allowLocalModels: boolean; useBrowserCache: boolean }
}

export type AiRequest =
  | { id: number; type: 'asr'; audio: Float32Array; model: string; language: string | null; task: 'transcribe' | 'translate' }
  | { id: number; type: 'tts'; model: string; texts: string[] }

export type AiResponse =
  | { id: number; type: 'progress'; stage: 'download' | 'work'; p: number }
  | { id: number; type: 'asr'; cues: { start: number; end: number; text: string }[] }
  | { id: number; type: 'tts'; clips: (Float32Array | null)[]; rate: number }
  | { id: number; type: 'error'; message: string }

let lib: Promise<Lib> | null = null
const pipes = new Map<string, Promise<Pipe>>()

const loadLib = () => (lib ??= import(/* @vite-ignore */ LIB).then((m: Lib) => {
  m.env.allowLocalModels = false
  m.env.useBrowserCache = true
  return m
}))

function getPipe(task: string, model: string, id: number) {
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
    const p = loadLib().then(async (m) => {
      try {
        return await m.pipeline(task, model, { dtype: 'q8', device: 'wasm', progress_callback })
      } catch {
        // some repos only ship full-precision weights
        return await m.pipeline(task, model, { dtype: 'fp32', device: 'wasm', progress_callback })
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

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const r = e.data
  const run = r.type === 'asr' ? asr(r) : tts(r)
  run.catch((err: unknown) => post({ id: r.id, type: 'error', message: err instanceof Error ? err.message : String(err) }))
}
