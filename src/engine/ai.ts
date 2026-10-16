import type { MediaSource, Project } from '../types'
import type { Cue } from '../lib/srt'
import type { AiRequest, AiResponse } from './ai.worker'
import { mixAudio, stretch } from './audiomix'
import { localAI, translateLine } from '../lib/localai'
import { decodeAudio } from '../lib/media'
import { cloneLines } from './voiceclone'

// ---------------------------------------------------------------- languages

/** Languages for translation (MyMemory codes). */
export const LANGUAGES: { code: string; name: string }[] = [
  ['en', 'English'], ['hi', 'Hindi'], ['bn', 'Bengali'], ['ta', 'Tamil'], ['te', 'Telugu'], ['mr', 'Marathi'], ['gu', 'Gujarati'],
  ['kn', 'Kannada'], ['ml', 'Malayalam'], ['pa', 'Punjabi'], ['ur', 'Urdu'], ['or', 'Odia'], ['as', 'Assamese'], ['ne', 'Nepali'],
  ['si', 'Sinhala'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['ru', 'Russian'],
  ['ar', 'Arabic'], ['fa', 'Persian'], ['he', 'Hebrew'], ['tr', 'Turkish'], ['zh-CN', 'Chinese (Simplified)'],
  ['zh-TW', 'Chinese (Traditional)'], ['ja', 'Japanese'], ['ko', 'Korean'], ['id', 'Indonesian'], ['ms', 'Malay'], ['th', 'Thai'],
  ['vi', 'Vietnamese'], ['tl', 'Filipino'], ['my', 'Burmese'], ['km', 'Khmer'], ['nl', 'Dutch'], ['pl', 'Polish'], ['uk', 'Ukrainian'],
  ['cs', 'Czech'], ['sk', 'Slovak'], ['ro', 'Romanian'], ['hu', 'Hungarian'], ['bg', 'Bulgarian'], ['sr', 'Serbian'], ['hr', 'Croatian'],
  ['sl', 'Slovenian'], ['el', 'Greek'], ['sv', 'Swedish'], ['no', 'Norwegian'], ['da', 'Danish'], ['fi', 'Finnish'], ['et', 'Estonian'],
  ['lv', 'Latvian'], ['lt', 'Lithuanian'], ['ca', 'Catalan'], ['sw', 'Swahili'], ['af', 'Afrikaans'], ['am', 'Amharic'], ['yo', 'Yoruba'],
].map(([code, name]) => ({ code, name }))

export const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.name ?? code

/** Languages Whisper can listen for (a subset; 'auto' lets it detect). */
export const SPOKEN = ['auto', 'en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'ur', 'ne', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'fa', 'tr', 'zh-CN', 'ja', 'ko', 'id', 'th', 'vi', 'nl', 'pl', 'uk']

/** Voices that render offline in the browser (Meta MMS models converted for transformers.js). */
export const VOICES: Record<string, string> = {
  en: 'Xenova/mms-tts-eng', hi: 'Xenova/mms-tts-hin', es: 'Xenova/mms-tts-spa', fr: 'Xenova/mms-tts-fra', de: 'Xenova/mms-tts-deu',
  pt: 'Xenova/mms-tts-por', ru: 'Xenova/mms-tts-rus', ar: 'Xenova/mms-tts-ara', vi: 'Xenova/mms-tts-vie', ro: 'Xenova/mms-tts-ron',
  yo: 'Xenova/mms-tts-yor',
}

export const ASR_MODELS = [
  { id: 'onnx-community/whisper-tiny', label: 'Fast', size: '~45 MB' },
  { id: 'onnx-community/whisper-base', label: 'Balanced', size: '~80 MB' },
  { id: 'onnx-community/whisper-small', label: 'Accurate', size: '~250 MB' },
]

// ---------------------------------------------------------------- worker plumbing

export type Progress = (stage: 'download' | 'work', p: number) => void

let worker: Worker | null = null
let nextId = 1
const waiting = new Map<number, { resolve: (r: AiResponse) => void; reject: (e: Error) => void; progress?: Progress }>()

type NoId<T> = T extends unknown ? Omit<T, 'id'> : never

function call(req: NoId<AiRequest>, progress?: Progress, transfer: Transferable[] = []) {
  if (!worker) {
    worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<AiResponse>) => {
      const r = e.data
      const w = waiting.get(r.id)
      if (!w) return
      if (r.type === 'progress') { w.progress?.(r.stage, r.p); return }
      waiting.delete(r.id)
      if (r.type === 'error') w.reject(new Error(r.message))
      else w.resolve(r)
    }
    worker.onerror = (e) => {
      for (const w of waiting.values()) w.reject(new Error(e.message || 'AI engine failed to start'))
      waiting.clear()
      worker?.terminate()
      worker = null
    }
  }
  const id = nextId++
  return new Promise<AiResponse>((resolve, reject) => {
    waiting.set(id, { resolve, reject, progress })
    worker!.postMessage({ ...req, id } as AiRequest, transfer)
  })
}

// ---------------------------------------------------------------- speech to text

/** The whole timeline's sound as 16 kHz mono, which is what Whisper listens to. */
async function timelineAudio(project: Project, sources: Record<string, MediaSource>, onProgress?: (p: number) => void) {
  const mix = await mixAudio(project, sources, onProgress)
  if (!mix) return null
  const ctx = new OfflineAudioContext(1, Math.ceil(mix.duration * 16000), 16000)
  const n = ctx.createBufferSource()
  n.buffer = mix
  n.connect(ctx.destination)
  n.start()
  return (await ctx.startRendering()).getChannelData(0)
}

/** Breaks long sentences into subtitle-sized lines, sharing the time by length. */
function splitLong(c: Cue, max = 84): Cue[] {
  if (c.text.length <= max) return [c]
  const words = c.text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max / 2 + 10) { lines.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur)
  const total = lines.reduce((s, l) => s + l.length, 0)
  let t = c.start
  return lines.map((text) => {
    const d = ((c.end - c.start) * text.length) / total
    const cue = { start: t, end: t + d, text }
    t += d
    return cue
  })
}

export async function transcribe(
  project: Project, sources: Record<string, MediaSource>,
  opts: { model: string; language: string; toEnglish: boolean }, progress: Progress,
): Promise<Cue[]> {
  progress('work', 0)
  const audio = await timelineAudio(project, sources)
  if (!audio) throw new Error('This video has no sound to listen to')
  return transcribeSamples(audio, opts, progress)
}

/** Speech to text on 16 kHz mono samples (the array is handed to the worker, so pass a copy to keep it). */
export async function transcribeSamples(audio: Float32Array, opts: { model: string; language: string; toEnglish: boolean }, progress: Progress): Promise<Cue[]> {
  const language = opts.language === 'auto' ? null : opts.language.split('-')[0]
  const r = await call({ type: 'asr', audio, model: opts.model, language, task: opts.toEnglish ? 'translate' : 'transcribe' }, progress, [audio.buffer])
  if (r.type !== 'asr') throw new Error('Unexpected reply')
  return r.cues.flatMap((c) => splitLong(c))
}

// ---------------------------------------------------------------- translation

const EMAIL_KEY = 'mymemory-email'
export const getEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? '' } catch { return '' } }
export const setEmail = (e: string) => { try { localStorage.setItem(EMAIL_KEY, e) } catch { /* private mode */ } }

async function translateOne(text: string, from: string, to: string, email: string) {
  const url = new URL('https://api.mymemory.translated.net/get')
  url.searchParams.set('q', text)
  url.searchParams.set('langpair', `${from === 'auto' ? 'Autodetect' : from}|${to}`)
  if (email) url.searchParams.set('de', email)
  let res: Response
  try { res = await fetch(url) } catch { throw new Error('No internet connection: translation needs to be online') }
  const j = await res.json().catch(() => null) as { responseStatus: number | string; responseDetails?: string; responseData?: { translatedText?: string } } | null
  const out = j?.responseData?.translatedText ?? ''
  if (!j || Number(j.responseStatus) === 429 || /MYMEMORY WARNING/i.test(out)) {
    throw new Error('Free daily translation limit reached. Add your email below for a bigger limit, or try tomorrow.')
  }
  if (Number(j.responseStatus) !== 200) throw new Error(j.responseDetails || 'Translation failed')
  // MyMemory returns HTML entities for a few characters
  const el = document.createElement('textarea')
  el.innerHTML = out
  return el.value
}

/** Translates every cue, keeping its timing. Repeated lines are translated once. */
export async function translateCues(cues: Cue[], from: string, to: string, onProgress: (p: number) => void): Promise<Cue[]> {
  const email = getEmail()
  const unique = [...new Set(cues.map((c) => c.text))]
  const done = new Map<string, string>()
  let next = 0, finished = 0
  // the user's own model on their computer, when it is set up for translation; it answers one line at a time
  const local = localAI()?.translate ? localAI() : null
  if (local) {
    for (const text of unique) {
      done.set(text, await translateLine(text, from === 'auto' ? 'auto' : langName(from), langName(to)))
      onProgress(++finished / unique.length)
    }
    return cues.map((c) => ({ ...c, text: done.get(c.text) ?? c.text }))
  }
  const workerFn = async () => {
    while (next < unique.length) {
      const text = unique[next++]
      // the API takes up to 500 bytes; long cues are sent sentence by sentence
      const parts = new TextEncoder().encode(text).length > 450 ? text.split(/(?<=[.!?।])\s+/) : [text]
      const out: string[] = []
      for (const p of parts) out.push(await translateOne(p, from, to, email))
      done.set(text, out.join(' '))
      onProgress(++finished / unique.length)
    }
  }
  await Promise.all([workerFn(), workerFn(), workerFn()])
  return cues.map((c) => ({ ...c, text: done.get(c.text) ?? c.text }))
}

// ---------------------------------------------------------------- text to speech

const toBuffer = (data: Float32Array, rate: number) => {
  const b = new AudioBuffer({ length: Math.max(1, data.length), numberOfChannels: 1, sampleRate: rate })
  b.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  return b
}

/**
 * Speaks each line. With a reference recording the lines are voiced in that
 * person's voice by the cloning server; otherwise by an offline voice.
 */
async function speak(texts: string[], lang: string, progress: Progress, reference?: Blob | null): Promise<(AudioBuffer | null)[]> {
  if (reference) {
    const files = await cloneLines(reference, texts, lang, (p) => progress('work', p))
    return Promise.all(files.map((f) => (f.byteLength ? decodeAudio(new Blob([f])) : null)))
  }
  const model = VOICES[lang]
  if (!model) throw new Error('No offline voice for this language yet')
  const r = await call({ type: 'tts', model, texts }, progress)
  if (r.type !== 'tts') throw new Error('Unexpected reply')
  return r.clips.map((c) => (c ? toBuffer(c, r.rate) : null))
}

/** Plays the first line so the voice can be heard before dubbing everything. */
export async function sampleVoice(text: string, lang: string, progress: Progress, reference?: Blob | null) {
  return (await speak([text], lang, progress, reference))[0] ?? null
}

/**
 * Builds one voice-over track as long as the video. Each line starts at its cue;
 * a line that would run into the next one is sped up (up to 1.6x, pitch kept).
 */
export async function buildVoiceOver(
  cues: Cue[], lang: string, total: number, progress: Progress, reference?: Blob | null,
): Promise<AudioBuffer> {
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  const clips = await speak(sorted.map((c) => c.text), lang, progress, reference)
  const RATE = 48000
  const ctx = new OfflineAudioContext(1, Math.ceil(Math.max(total, 0.5) * RATE), RATE)
  for (let i = 0; i < sorted.length; i++) {
    let buf = clips[i]
    if (!buf) continue
    const slot = (sorted[i + 1]?.start ?? total) - sorted[i].start
    const factor = buf.duration / Math.max(0.3, slot)
    if (factor > 1.05) buf = (await stretch(buf, Math.min(1.6, factor)).catch(() => null)) ?? buf
    const n = ctx.createBufferSource()
    n.buffer = buf
    n.connect(ctx.destination)
    n.start(sorted[i].start)
  }
  return ctx.startRendering()
}

/** Speaks each text separately (empty texts give null), for scene-by-scene narration. */
export async function speakLines(texts: string[], lang: string, progress: Progress): Promise<(AudioBuffer | null)[]> {
  const idx = texts.map((s, i) => (s.trim() ? i : -1)).filter((i) => i >= 0)
  if (!idx.length) return texts.map(() => null)
  const clips = await speak(idx.map((i) => texts[i]), lang, progress)
  const out: (AudioBuffer | null)[] = texts.map(() => null)
  idx.forEach((i, n) => { const c = clips[n]; if (c?.length) out[i] = c })
  return out
}
