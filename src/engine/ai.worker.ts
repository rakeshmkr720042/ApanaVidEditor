/// <reference lib="webworker" />
// Runs Whisper (speech to text) and MMS (text to speech) in the browser with transformers.js.
// The library and the models are fetched on first use and then kept in the browser cache.

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1'

type Pipe = (input: unknown, opts?: Record<string, unknown>) => Promise<unknown>
interface Lib {
  pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<Pipe>
  env: { allowLocalModels: boolean; useBrowserCache: boolean }
  Tensor: new (type: string, data: BigInt64Array, dims: number[]) => unknown
}
type Dtype = string | Record<string, string>
/** Whisper as the pipeline exposes it, for language detection. */
interface WhisperPipe extends Pipe {
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>
  model: ((inputs: Record<string, unknown>) => Promise<{ logits: { data: Float32Array; dims: number[] } }>) & {
    generation_config: { decoder_start_token_id: number; lang_to_id: Record<string, number> }
  }
}

export type AiRequest =
  | { id: number; type: 'asr'; audio: Float32Array; model: string; language: string | null; task: 'transcribe' | 'translate'; offset?: number }
  | { id: number; type: 'tts'; model: string; texts: string[] }

export type AiResponse =
  | { id: number; type: 'progress'; stage: 'download' | 'work'; p: number }
  | { id: number; type: 'asr'; cues: { start: number; end: number; text: string }[]; language: string | null }
  | { id: number; type: 'tts'; clips: (Float32Array | null)[]; rate: number }
  | { id: number; type: 'error'; message: string }

let lib: Promise<Lib> | null = null
const pipes = new Map<string, Promise<Pipe & { device: string }>>()

const loadLib = () => (lib ??= import(/* @vite-ignore */ LIB).then((m: Lib) => {
  m.env.allowLocalModels = false
  m.env.useBrowserCache = true
  return m
}))

/**
 * Weights per Whisper size. Whisper's encoder loses a lot of accuracy when it is
 * squeezed to 8 bits (it starts inventing sentences), so it stays full size and
 * only the decoder is squeezed. Later entries are fallbacks for repos that lack a file.
 */
const WHISPER: Record<string, { wasm: Dtype[]; gpu?: Dtype; f16?: boolean }> = {
  'onnx-community/whisper-large-v3-turbo': {
    wasm: [{ encoder_model: 'q8', decoder_model_merged: 'q8' }, 'q8'],
    gpu: { encoder_model: 'fp16', decoder_model_merged: 'q4' }, f16: true,
  },
}
const whisperDtypes = (model: string) => WHISPER[model] ?? {
  wasm: [{ encoder_model: 'fp32', decoder_model_merged: 'q8' }, 'q8', 'fp32'],
  gpu: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
}

/** WebGPU makes the bigger models usable on a computer; anything wrong with it falls back to the CPU. */
let gpuCheck: Promise<{ ok: boolean; f16: boolean }> | null = null
const gpu = () => (gpuCheck ??= (async () => {
  try {
    const g = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> } }).gpu
    const a = g ? await g.requestAdapter() : null
    return { ok: !!a, f16: !!a?.features.has('shader-f16') }
  } catch { return { ok: false, f16: false } }
})())

function getPipe(task: string, model: string, id: number, cpuOnly = false) {
  const key = task + ':' + model + (cpuOnly ? ':cpu' : '')
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
      const tries: [string, Dtype][] = []
      if (task === 'automatic-speech-recognition') {
        const d = whisperDtypes(model)
        const g = cpuOnly ? null : await gpu()
        if (g?.ok && d.gpu && (!d.f16 || g.f16)) tries.push(['webgpu', d.gpu])
        for (const x of d.wasm) tries.push(['wasm', x])
      } else {
        // some repos only ship full-precision weights
        tries.push(['wasm', 'q8'], ['wasm', 'fp32'])
      }
      let last: unknown
      for (const [device, dtype] of tries) {
        try {
          const pipe = await m.pipeline(task, model, { dtype, device, progress_callback })
          return Object.assign(pipe, { device })
        } catch (e) { last = e }
      }
      throw last
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
async function detectLanguage(pipe: WhisperPipe, Tensor: Lib['Tensor'], slices: Float32Array[]) {
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
  let pipe = (await getPipe('automatic-speech-recognition', r.model, r.id)) as unknown as WhisperPipe & { device: string }
  const { Tensor } = await loadLib()
  normalise(r.audio)
  const cues: { start: number; end: number; text: string }[] = []
  const parts = pieces(r.audio).filter(([a, b]) => rms(r.audio, a, b) >= 0.004) // silence: Whisper would invent words
  // run once; if the graphics card path breaks, the CPU takes over for the rest
  const run = async (fn: (p: WhisperPipe) => Promise<unknown>) => {
    try { return await fn(pipe) } catch (e) {
      if (pipe.device !== 'webgpu') throw e
      pipe = (await getPipe('automatic-speech-recognition', r.model, r.id, true)) as unknown as WhisperPipe & { device: string }
      return fn(pipe)
    }
  }
  let language = r.language
  if (!language && parts.length) {
    post({ id: r.id, type: 'progress', stage: 'work', p: 0 })
    // a few pieces spread over the recording
    const pick = [...new Set([0, Math.floor(parts.length / 2), parts.length - 1])].slice(0, 3)
    language = (await run((p) => detectLanguage(p, Tensor, pick.map((i) => r.audio.subarray(...parts[i]))))) as string | null
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

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const r = e.data
  const run = r.type === 'asr' ? asr(r) : tts(r)
  run.catch((err: unknown) => post({ id: r.id, type: 'error', message: err instanceof Error ? err.message : String(err) }))
}
