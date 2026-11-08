import type { Clip, Layer, MediaSource, Project } from '../types'
import type { MediaInfo } from './relink'
import { t } from './i18n'

/** Projects and their media are kept in IndexedDB so work survives reloads and works offline. */
export interface ProjectRecord {
  id: string
  name: string
  updatedAt: number
  data: Project
  mediaIds: string[]
  thumb: string | null
  duration: number
  /** Name and kind of every file the project uses, kept so a missing file can still be named (see lib/relink.ts). */
  mediaInfo?: Record<string, MediaInfo>
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

/** Shown when the phone's storage is full (a write was refused). */
export const STORAGE_FULL = 'Phone storage is full, so this could not be saved. Delete old projects or free some space on the phone, then try again.'

/** A friendlier error for a refused write: "storage full" when that is what happened. */
export function storageError(e: unknown): Error {
  const name = (e as DOMException | null)?.name ?? ''
  if (name === 'QuotaExceededError' || /quota|space|disk is full/i.test(String((e as Error | null)?.message ?? ''))) return new Error(t(STORAGE_FULL))
  return e instanceof Error ? e : new Error(String((e as DOMException | null)?.message ?? e ?? 'Storage error'))
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    if (mode === 'readonly') {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      return
    }
    // a write is only safe once the transaction is committed: a full disk shows up as an abort *after* the
    // request itself succeeded, which used to be reported as saved (and the work was gone after a restart)
    tx.oncomplete = () => resolve(req.result)
    tx.onabort = () => reject(storageError(tx.error ?? req.error))
    tx.onerror = () => reject(storageError(tx.error ?? req.error))
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
  const { url: _url, file, proxy: _proxy, ...meta } = src // eslint-disable-line @typescript-eslint/no-unused-vars
  void _url; void _proxy
  await run('media', 'readwrite', (s) => s.put({ id: src.id, blob: file, meta } satisfies MediaRecord))
}

/** Preview copies (proxies) of videos, kept next to the media under `proxy:<id>`. */
export const saveProxy = (id: string, blob: Blob) => run('media', 'readwrite', (s) => s.put({ id: `proxy:${id}`, blob, meta: {} }))
export const getProxy = (id: string) => run<{ blob: Blob } | undefined>('media', 'readonly', (s) => s.get(`proxy:${id}`)).then((r) => r?.blob ?? null)
export const deleteProxy = (id: string) => run('media', 'readwrite', (s) => s.delete(`proxy:${id}`))

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

/** The user's own voice sample for voice cloning, kept across projects. */
const VOICE_ID = '__my-voice'
export const saveVoiceSample = (blob: Blob) => run('media', 'readwrite', (s) => s.put({ id: VOICE_ID, blob, meta: {} }))
export const getVoiceSample = () => run<{ blob: Blob } | undefined>('media', 'readonly', (s) => s.get(VOICE_ID)).then((r) => r?.blob ?? null)
export const deleteVoiceSample = () => run('media', 'readwrite', (s) => s.delete(VOICE_ID))
