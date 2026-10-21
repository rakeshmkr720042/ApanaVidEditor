/**
 * Which AI models can work without internet on this device, and downloading them ahead of time.
 *
 * The AI engine (transformers.js and the ONNX runtime) ships with the app. Models either come
 * with the app (the Windows and Android builds include a small set, listed in models/index.json)
 * or are downloaded once from Hugging Face into the browser cache, where transformers.js finds
 * them again with no internet.
 */

import { Capacitor } from '@capacitor/core'
import { isDesktop } from '../lib/desktop'

export type ModelKind = 'asr' | 'tts' | 'mt'
export type ModelState = 'app' | 'saved' | 'none'

const CACHE = 'transformers-cache' // transformers.js env.cacheKey
const HUB = 'https://huggingface.co/'

/** The weight files a model needs, without the precision suffix ('' for fp32, '_quantized' for q8). */
const WEIGHTS: Record<ModelKind, string[]> = {
  asr: ['onnx/encoder_model', 'onnx/decoder_model_merged'],
  mt: ['onnx/encoder_model', 'onnx/decoder_model_merged'],
  tts: ['onnx/model'],
}

let bundled: Promise<Set<string>> | null = null
/** Models built into this copy of the app (none on the website). */
export const bundledModels = () => (bundled ??= fetch(new URL('models/index.json', document.baseURI))
  .then((r) => (r.ok ? r.json() : [])).catch(() => []).then((l: string[]) => new Set(l)))

async function cachedUrls(): Promise<Set<string>> {
  if (!('caches' in self)) return new Set()
  try {
    const c = await caches.open(CACHE)
    return new Set((await c.keys()).map((r) => r.url))
  } catch { return new Set() }
}

/** Whether each model works offline: built into the app, saved on this device, or not yet. */
export async function modelStates(models: { id: string; kind: ModelKind }[]): Promise<Record<string, ModelState>> {
  const [inApp, urls] = await Promise.all([bundledModels(), cachedUrls()])
  const out: Record<string, ModelState> = {}
  for (const m of models) {
    if (inApp.has(m.id)) { out[m.id] = 'app'; continue }
    const has = (f: string) => ['_quantized', ''].some((s) => urls.has(`${HUB}${m.id}/resolve/main/${f}${s}.onnx`))
    out[m.id] = urls.has(`${HUB}${m.id}/resolve/main/config.json`) && WEIGHTS[m.kind].every(has) ? 'saved' : 'none'
  }
  return out
}

export const modelState = async (id: string, kind: ModelKind) => (await modelStates([{ id, kind }]))[id]

/** Removes a downloaded model's files from this device. */
export async function deleteModel(id: string) {
  const c = await caches.open(CACHE)
  const prefix = `${HUB}${id}/resolve/`
  await Promise.all((await c.keys()).filter((r) => r.url.startsWith(prefix)).map((r) => c.delete(r)))
}

/** Asks the browser not to clear downloaded models when the device runs low on space. */
export async function keepStorage() {
  try { return (await navigator.storage?.persist?.()) ?? false } catch { return false }
}

// ---------------------------------------------------------------- offline translation

/** Our language codes as used in the Marian (opus-mt) model names. */
const mtCode = (c: string) => (c === 'zh-CN' || c === 'zh-TW' ? 'zh' : c)

/** Languages with a converted Marian model into English, and out of English. */
const TO_EN = ['hi', 'zh-CN', 'fr', 'es', 'de', 'ru', 'ar', 'ko', 'nl', 'it', 'pl', 'cs', 'fi', 'sv', 'da', 'tr', 'id', 'ja', 'et', 'th', 'vi', 'uk']
const FROM_EN = ['hi', 'zh-CN', 'de', 'fr', 'es', 'it', 'ru', 'ar', 'nl', 'da', 'fi', 'vi', 'ro', 'sv', 'uk']

export const mtModel = (from: string, to: string) => `Xenova/opus-mt-${mtCode(from)}-${mtCode(to)}`
export const MT_SIZE = '~80-110 MB'

/** Every offline translation model, for the download list. */
export const MT_MODELS = [
  ...FROM_EN.map((to) => ({ from: 'en', to, id: mtModel('en', to) })),
  ...TO_EN.map((from) => ({ from, to: 'en', id: mtModel(from, 'en') })),
]

/**
 * The models that translate `from` into `to`: one when either side is English, two through
 * English otherwise (Hindi → English → Spanish). Null when there is no offline route.
 */
export function mtRoute(from: string, to: string): string[] | null {
  if (from === 'auto' || from === to) return null
  if (from === 'en') return FROM_EN.includes(to) ? [mtModel('en', to)] : null
  if (to === 'en') return TO_EN.includes(from) ? [mtModel(from, 'en')] : null
  return TO_EN.includes(from) && FROM_EN.includes(to) ? [mtModel(from, 'en'), mtModel('en', to)] : null
}

// ---------------------------------------------------------------- the AI engine itself

const ortFiles = () => ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'].map((f) => new URL(`ort/${f}`, document.baseURI).href)

/** Whether the AI engine is on the device (always in the apps; on the website once cached). */
export async function isEngineCached() {
  if (isDesktop || Capacitor.isNativePlatform()) return true // ships inside the app
  if (!('caches' in self)) return false
  return !!(await caches.match(ortFiles()[1]))
}

/** Fetches the AI engine so the service worker keeps it for offline use. */
export const prefetchEngine = () => Promise.all(ortFiles().map((u) => fetch(u).then((r) => r.arrayBuffer())))
