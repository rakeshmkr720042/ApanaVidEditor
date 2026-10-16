import type { MediaSource, Project } from '../types'

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

type MediaMeta = Omit<MediaSource, 'url' | 'file'>
interface MediaRecord { id: string; blob: Blob; meta: MediaMeta }

let dbp: Promise<IDBDatabase> | null = null

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('clipcut', 1)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' })
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

export async function requestPersistence() {
  try { await navigator.storage?.persist?.() } catch { /* not supported */ }
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.() } catch { return undefined }
}
