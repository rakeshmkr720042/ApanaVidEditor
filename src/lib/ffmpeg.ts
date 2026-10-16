import { FFmpeg } from '@ffmpeg/ffmpeg'
import { isDesktop } from './desktop'

const coreBase = () => new URL(`${import.meta.env.BASE_URL}ffmpeg/`, location.href).href
export const coreURL = () => coreBase() + 'ffmpeg-core.js'
export const wasmURL = () => coreBase() + 'ffmpeg-core.wasm'

let instance: Promise<FFmpeg> | null = null
let logSink: ((line: string) => void) | null = null
let progressSink: ((p: number) => void) | null = null

/** Lazily loads the single-threaded ffmpeg core (no COOP/COEP headers needed). */
export function getFFmpeg(): Promise<FFmpeg> {
  if (!instance) {
    instance = (async () => {
      const ff = new FFmpeg()
      ff.on('log', ({ message }) => logSink?.(message))
      ff.on('progress', ({ progress }) => progressSink?.(progress))
      await ff.load({ coreURL: coreURL(), wasmURL: wasmURL() })
      return ff
    })()
    instance.catch(() => { instance = null })
  }
  return instance
}

/** Kills a running job. The next getFFmpeg() call starts a fresh instance. */
export async function resetFFmpeg() {
  const p = instance
  instance = null
  if (p) (await p.catch(() => null))?.terminate()
}

export async function runFFmpeg(args: string[], onProgress?: (p: number) => void) {
  const ff = await getFFmpeg()
  const logs: string[] = []
  logSink = (l) => logs.push(l)
  progressSink = onProgress ?? null
  try {
    const code = await ff.exec(args)
    return { code, logs }
  } finally {
    logSink = null
    progressSink = null
  }
}

export async function isCoreCached() {
  if (isDesktop) return true // bundled with the desktop app
  if (!('caches' in window)) return false
  return !!(await caches.match(wasmURL()))
}

/** Downloads the core so the service worker caches it for offline use. */
export async function prefetchCore() {
  await Promise.all([fetch(coreURL()), fetch(wasmURL())].map((p) => p.then((r) => r.arrayBuffer())))
}
