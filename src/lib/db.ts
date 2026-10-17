import type { Clip, Layer, MediaSource, Project } from '../types'

/** Projects and their media are kept in IndexedDB so work survives reloads and works offline. */
export interface ProjectRecord {
  id: string
  name: string
  updatedAt: number
  data: Project
  mediaIds: string[]
  thumb: string | null
  duration: number
}

export type MediaMeta = Omit<MediaSource, 'url' | 'file'>
interface MediaRecord { id: string; blob: Blob; meta: MediaMeta }

let dbp: Promise<IDBDatabase> | null = null

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('clipcut', 2)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('templates')) d.createObjectStore('templates', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export const listProjects = () =>
  run<ProjectRecord[]>('projects', 'readonly', (s) => s.getAll()).then((l) => l.sort((a, b) => b.updatedAt - a.updatedAt))
export const getProject = (id: string) => run<ProjectRecord | undefined>('projects', 'readonly', (s) => s.get(id))
export const saveProject = (p: ProjectRecord) => run('projects', 'readwrite', (s) => s.put(p))

export async function deleteProject(id: string) {
  const p = await getProject(id)
  await run('projects', 'readwrite', (s) => s.delete(id))
  if (!p) return
  const others = await listProjects()
  const still = new Set(others.flatMap((o) => o.mediaIds))
  for (const m of p.mediaIds) if (!still.has(m)) await run('media', 'readwrite', (s) => s.delete(m))
}

export async function saveMedia(src: MediaSource) {
  const { url: _url, file, ...meta } = src // eslint-disable-line @typescript-eslint/no-unused-vars
  void _url
  await run('media', 'readwrite', (s) => s.put({ id: src.id, blob: file, meta } satisfies MediaRecord))
}

export const getMedia = (id: string) => run<MediaRecord | undefined>('media', 'readonly', (s) => s.get(id))

/**
 * A reusable intro or outro: clips and layers on their own 0-based timeline, with the media they
 * need kept inside the record so deleting a project never breaks a template.
 */
export interface TemplateRecord {
  id: string
  name: string
  kind: 'intro' | 'outro'
  updatedAt: number
  duration: number
  thumb: string | null
  clips: Clip[]
  layers: Layer[]
  media: { id: string; file: Blob; meta: MediaMeta }[]
  design?: unknown // quick-builder settings, so the template can be edited again
}

export const listTemplates = () =>
  run<TemplateRecord[]>('templates', 'readonly', (s) => s.getAll()).then((l) => l.sort((a, b) => b.updatedAt - a.updatedAt))
export const saveTemplate = (t: TemplateRecord) => run('templates', 'readwrite', (s) => s.put(t))
export const deleteTemplate = (id: string) => run('templates', 'readwrite', (s) => s.delete(id))

export async function requestPersistence() {
  try { await navigator.storage?.persist?.() } catch { /* not supported */ }
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.() } catch { return undefined }
}
