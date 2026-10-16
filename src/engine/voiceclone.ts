import { Client, handle_file } from '@gradio/client'
import { encodeWav } from './music'

/**
 * Voice cloning runs on a Hugging Face Space (see voice-space/ in this repo):
 * it gets a short recording of the user's voice plus a line of text and sends
 * back that line in the same voice. It needs internet; everything else stays offline.
 */

/** Languages Coqui XTTS v2 can speak, as the app's language codes. */
export const CLONE_LANGS = ['en', 'hi', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh-CN', 'ja', 'hu', 'ko']

/**
 * Personal setting, off by default and without a server: nothing here runs until the user
 * switches it on in the Local AI sheet and enters the address of their own Space.
 */
export interface VoiceClone { on: boolean; url: string }
const KEY = 'voice-clone'
export function getVoiceClone(): VoiceClone {
  const d: VoiceClone = { on: false, url: '' }
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return d }
}
export function setVoiceClone(patch: Partial<VoiceClone>) {
  const next = { ...getVoiceClone(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
  return next
}
/** The Space to use when voice cloning is switched on and has an address, else null. */
export const voiceCloneSpace = () => { const c = getVoiceClone(); return c.on && c.url.trim() ? normalizeSpace(c.url) : null }

/** Accepts "user/space", the Space page link or its .hf.space address. */
export function normalizeSpace(s: string) {
  const v = s.trim().replace(/[?#].*$/, '').replace(/\/+$/, '')
  const page = v.match(/huggingface\.co\/spaces\/([^/]+\/[^/?#]+)/)
  if (page) return page[1]
  return v
}

let client: { space: string; c: Promise<Client> } | null = null
function connect(space: string) {
  if (client?.space !== space) {
    const c = Client.connect(space).catch((e: unknown) => {
      client = null
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(/fetch|network/i.test(msg)
        ? 'Could not reach the voice cloning server. Check your internet.'
        : `Voice cloning server "${space}" is not available (${msg}). It may be asleep: open it once on huggingface.co and try again.`)
    })
    client = { space, c }
  }
  return client.c
}

/** The recording as a small mono WAV, which the server reads without any converter. */
export async function referenceWav(buf: AudioBuffer) {
  const secs = Math.min(buf.duration, 30)
  const RATE = 22050
  const ctx = new OfflineAudioContext(1, Math.ceil(secs * RATE), RATE)
  const n = ctx.createBufferSource()
  n.buffer = buf
  n.connect(ctx.destination)
  n.start()
  return encodeWav(await ctx.startRendering())
}

/**
 * Speaks each line in the reference voice, one request at a time (the free
 * server does one at a time anyway). Returns the encoded audio of each line.
 */
export async function cloneLines(
  reference: Blob, texts: string[], lang: string, onProgress: (p: number) => void, space = voiceCloneSpace(),
): Promise<ArrayBuffer[]> {
  if (!space) throw new Error('Voice cloning is off. Switch it on in Local AI settings and add your Space address.')
  const c = await connect(space)
  const language = lang.toLowerCase().startsWith('zh') ? 'zh-cn' : lang.split('-')[0]
  const ref = handle_file(reference)
  const out: ArrayBuffer[] = []
  onProgress(0)
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i].trim()
    if (!text) { out.push(new ArrayBuffer(0)); continue }
    let r
    try {
      r = await c.predict('/clone', { reference: ref, text, language, speed: 1 })
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? String(e)
      throw new Error(`Voice cloning failed on line ${i + 1}: ${msg}`)
    }
    const file = (r.data as { url?: string }[])[0]
    if (!file?.url) throw new Error('The voice cloning server sent no audio')
    const res = await fetch(file.url)
    if (!res.ok) throw new Error('Could not download the cloned voice')
    out.push(await res.arrayBuffer())
    onProgress((i + 1) / texts.length)
  }
  return out
}

/** Checks that the Space is awake and is the voice cloning one (it has a /clone endpoint). */
export async function testSpace(url: string) {
  const c = await connect(normalizeSpace(url))
  const api = await c.view_api() as { named_endpoints?: Record<string, unknown> }
  if (!api.named_endpoints?.['/clone']) throw new Error('This Space has no /clone endpoint. Upload the files from voice-space/ to it.')
}
