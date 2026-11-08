import type { MediaSource, Project } from '../types'
import { saveMedia, saveProject } from './db'
import { restoreSource } from './media'
import { uid } from './format'
import { layoutClips } from '../model/timeline'

/**
 * Portable project file (.avp): the project plus every media file it uses.
 *
 * Version 2 (written now) is binary: "AVP2", the length of a small JSON header, the header, then the media files
 * one after another, untouched. Building it copies nothing (the browser just points at the files), so even a big
 * project saves and shares on a phone without running out of memory. Opening it reads one file at a time.
 *
 * Version 1 (older app) was one JSON text with every file inside as base64; it is still opened.
 */
interface AvpFile {
  app: 'ApanaVidEditor'
  version: 1
  name: string
  project: Project
  media: { meta: Omit<MediaSource, 'url' | 'file'>; data: string }[]
}

type Meta = Omit<MediaSource, 'url' | 'file'>
interface AvpHeader {
  app: 'ApanaVidEditor'
  version: 2
  name: string
  project: Project
  media: { meta: Meta; type: string; offset: number; size: number }[]
}

const MAGIC = 'AVP2'

/** The .avp v2 file of a project. Pure: no reads, no copies of the media. */
export function packProject(name: string, project: Project, sources: Record<string, MediaSource>): Blob {
  const media: AvpHeader['media'] = []
  const files: Blob[] = []
  let offset = 0
  for (const s of Object.values(sources)) {
    const { url: _url, file, proxy: _proxy, ...meta } = s
    void _url; void _proxy
    media.push({ meta, type: file.type, offset, size: file.size })
    files.push(file)
    offset += file.size
  }
  const header = new TextEncoder().encode(JSON.stringify({ app: 'ApanaVidEditor', version: 2, name, project, media } satisfies AvpHeader))
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, header.length, true)
  return new Blob([MAGIC, len, header, ...files], { type: 'application/octet-stream' })
}

const NOT_OURS = 'This is not an Apna Editor project file'

/** Reads the header of a v2 file and hands back each media file as a slice of it (nothing is loaded yet). */
export async function unpackProject(file: Blob): Promise<{ name: string; project: Project; media: { meta: Meta; blob: Blob }[] }> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (new TextDecoder().decode(head.subarray(0, 4)) !== MAGIC) throw new Error(NOT_OURS)
  const len = new DataView(head.buffer).getUint32(4, true)
  if (len < 2 || 8 + len > file.size) throw new Error('This project file is incomplete (it may not have finished copying)')
  let h: AvpHeader
  try { h = JSON.parse(new TextDecoder().decode(await file.slice(8, 8 + len).arrayBuffer())) } catch { throw new Error(NOT_OURS) }
  if (h?.app !== 'ApanaVidEditor' || h.version !== 2 || !h.project || !Array.isArray(h.media)) throw new Error(NOT_OURS)
  const base = 8 + len
  const media = h.media.map((m) => {
    if (!(m.offset >= 0 && m.size >= 0 && base + m.offset + m.size <= file.size)) throw new Error('This project file is incomplete (it may not have finished copying)')
    return { meta: m.meta, blob: file.slice(base + m.offset, base + m.offset + m.size, m.type) }
  })
  return { name: h.name, project: h.project, media }
}

/** The project file to save or share (version 2). */
export async function projectToFile(name: string, project: Project, sources: Record<string, MediaSource>): Promise<Blob> {
  return packProject(name, project, sources)
}

async function readV1(file: Blob) {
  let parsed: AvpFile
  try { parsed = JSON.parse(await file.text()) } catch { throw new Error(NOT_OURS) }
  if (parsed?.app !== 'ApanaVidEditor' || !parsed.project || !Array.isArray(parsed.media)) throw new Error(NOT_OURS)
  const media: { meta: Meta; blob: Blob }[] = []
  for (const m of parsed.media) media.push({ meta: m.meta, blob: await (await fetch(m.data)).blob() })
  return { name: parsed.name, project: parsed.project, media }
}

/** Reads an .avp file (either version) into a new project in IndexedDB and returns its id. */
export async function importProjectFile(file: Blob): Promise<string> {
  const first = new TextDecoder().decode(new Uint8Array(await file.slice(0, 4).arrayBuffer()))
  const read = first === MAGIC ? await unpackProject(file) : await readV1(file)
  if (!Array.isArray(read.project.clips) || !Array.isArray(read.project.layers)) throw new Error(NOT_OURS)
  const sources: MediaSource[] = []
  try {
    for (const m of read.media) {
      const src = restoreSource(m.meta, m.blob)
      sources.push(src)
      await saveMedia(src) // one file at a time, so a big project never sits in memory whole
    }
    const id = uid()
    const first = read.project.clips[0]
    await saveProject({
      id, name: read.name || 'Imported project', updatedAt: Date.now(), data: read.project, mediaIds: sources.map((s) => s.id),
      thumb: (first && sources.find((s) => s.id === first.sourceId)?.thumbs[0]) ?? null, duration: layoutClips(read.project.clips).total,
    })
    return id
  } catch (e) {
    if ((e as Error)?.name === 'QuotaExceededError') throw new Error('Not enough free space on this device to open this project')
    throw e
  } finally {
    sources.forEach((s) => URL.revokeObjectURL(s.url))
  }
}

/**
 * Shares the project file with the system share sheet (WhatsApp, Drive, email, Nearby Share…). Android goes
 * through Documents/Apna Editor; elsewhere the browser's share is used when it can take files. Returns false when
 * this device can't share files, so the caller can save it instead.
 */
export async function shareProjectFile(blob: Blob, fileName: string, native: boolean, saveNative: (b: Blob, n: string, share: boolean) => Promise<string>): Promise<boolean> {
  if (native) { await saveNative(blob, fileName, true); return true }
  const f = new File([blob], fileName, { type: 'application/octet-stream' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (!nav.share || !nav.canShare?.({ files: [f] })) return false
  try { await nav.share({ files: [f], title: fileName }) } catch (e) { if ((e as Error)?.name !== 'AbortError') return false }
  return true
}
