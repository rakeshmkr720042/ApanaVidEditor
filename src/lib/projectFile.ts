import type { MediaSource, Project } from '../types'
import { saveMedia, saveProject } from './db'
import { restoreSource } from './media'
import { uid } from './format'
import { layoutClips } from '../model/timeline'

/** Portable project file (.avp): the project JSON plus every media file it uses, embedded as data URLs. */
interface AvpFile {
  app: 'ApanaVidEditor'
  version: 1
  name: string
  project: Project
  media: { meta: Omit<MediaSource, 'url' | 'file'>; data: string }[]
}

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function projectToFile(name: string, project: Project, sources: Record<string, MediaSource>): Promise<Blob> {
  const media: AvpFile['media'] = []
  for (const s of Object.values(sources)) {
    const { url: _url, file, ...meta } = s
    void _url
    media.push({ meta, data: await dataUrl(file) })
  }
  const out: AvpFile = { app: 'ApanaVidEditor', version: 1, name, project, media }
  return new Blob([JSON.stringify(out)], { type: 'application/json' })
}

/** Reads an .avp file into a new project in IndexedDB and returns its id. */
export async function importProjectFile(file: Blob): Promise<string> {
  let parsed: AvpFile
  try { parsed = JSON.parse(await file.text()) } catch { throw new Error('This is not an ApanaVidEditor project file') }
  if (parsed?.app !== 'ApanaVidEditor' || !parsed.project || !Array.isArray(parsed.media)) throw new Error('This is not an ApanaVidEditor project file')
  const sources: MediaSource[] = []
  for (const m of parsed.media) {
    const blob = await (await fetch(m.data)).blob()
    const src = restoreSource(m.meta, blob)
    await saveMedia(src)
    sources.push(src)
  }
  const id = uid()
  const first = parsed.project.clips[0]
  await saveProject({
    id, name: parsed.name || 'Imported project', updatedAt: Date.now(), data: parsed.project, mediaIds: sources.map((s) => s.id),
    thumb: (first && sources.find((s) => s.id === first.sourceId)?.thumbs[0]) ?? null, duration: layoutClips(parsed.project.clips).total,
  })
  sources.forEach((s) => URL.revokeObjectURL(s.url))
  return id
}
