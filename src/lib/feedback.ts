import { Capacitor } from '@capacitor/core'
import { isDesktop } from './desktop'
import { isNative, saveNative } from './save'

/** Testing notes: bugs and ideas a tester writes down while using the app. Kept on this device
 *  (IndexedDB, so screenshots fit) and sent to the developer as a file or text. No server. */
export type NoteKind = 'bug' | 'idea'

export interface Note {
  id: string
  kind: NoteKind
  text: string
  at: number
  done: boolean
  /** Where in the app it happened (project name, screen). */
  where?: string
  /** Who wrote it: the tester's name, so notes from several devices can be told apart. */
  by?: string
  /** App version and device, filled in automatically. */
  device: string
  /** A screenshot as a small JPEG data URL. */
  shot?: string
}

export const appVersion: string = __APP_VERSION__

export function deviceInfo() {
  const platform = isDesktop ? 'Windows app' : Capacitor.getPlatform() === 'android' ? 'Android app' : 'Web'
  const ua = navigator.userAgent
  const os = /Android [\d.]+/.exec(ua)?.[0] ?? /Windows NT [\d.]+/.exec(ua)?.[0]?.replace('NT 10.0', '10/11') ?? /Mac OS X [\d_]+/.exec(ua)?.[0]?.replace(/_/g, '.') ?? (/iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '')
  const browser = isNative || isDesktop ? '' : /Edg\/\d+/.exec(ua)?.[0] ?? /Chrome\/\d+/.exec(ua)?.[0] ?? /Firefox\/\d+/.exec(ua)?.[0] ?? /Version\/[\d.]+ Safari/.exec(ua)?.[0] ?? ''
  return [`v${appVersion}`, platform, os, browser, `${screen.width}x${screen.height}`].filter(Boolean).join(' · ')
}

let dbp: Promise<IDBDatabase> | null = null

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('apana-feedback', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('notes', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction('notes', mode).objectStore('notes'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

export const listNotes = () => run<Note[]>('readonly', (s) => s.getAll()).then((l) => l.sort((a, b) => b.at - a.at))
export const putNote = (n: Note) => run('readwrite', (s) => s.put(n))
export const deleteNote = (id: string) => run('readwrite', (s) => s.delete(id))

export function newNote(kind: NoteKind, text: string, extra: { where?: string; shot?: string } = {}): Note {
  const by = testerName()
  return { id: crypto.randomUUID(), kind, text: text.trim(), at: Date.now(), done: false, device: deviceInfo(), ...(by && { by }), ...extra }
}

export function testerName() {
  try { return localStorage.getItem('feedback-name') ?? '' } catch { return '' }
}
export function setTesterName(name: string) {
  try { localStorage.setItem('feedback-name', name.trim()) } catch { /* private mode */ }
}

/** Shrinks a picked screenshot so dozens of notes stay small. */
export async function shrinkShot(file: File, max = 1280): Promise<string> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.75)
}

const stamp = (at: number) => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Readable Markdown list for WhatsApp, a chat or a GitHub issue. Screenshots only travel in the file. */
export function notesText(notes: Note[]) {
  const open = notes.filter((n) => !n.done)
  const lines = open.map((n, i) => {
    const meta = [stamp(n.at), n.where, n.by, n.device, n.shot && 'screenshot in file'].filter(Boolean).join(' | ')
    return `${i + 1}. **${n.kind === 'bug' ? 'BUG' : 'IDEA'}**: ${n.text.replace(/\n+/g, ' / ')}\n   _${meta}_`
  })
  return `## ApanaVidEditor testing notes (${open.length})\n\n${lines.join('\n')}`
}

const REPO = 'https://github.com/rakeshmkr720042/ApanaVidEditor'

/** Opens a new GitHub issue with the notes filled in. Needs a signed-in account with access to
 *  the repo; nothing is sent until the user presses Submit there. */
export function openIssue(notes: Note[]) {
  const open = notes.filter((n) => !n.done)
  const bugs = open.filter((n) => n.kind === 'bug').length
  const title = `Testing notes${testerName() ? ` from ${testerName()}` : ''}: ${bugs} bug${bugs === 1 ? '' : 's'}, ${open.length - bugs} idea${open.length - bugs === 1 ? '' : 's'}`
  let body = notesText(notes)
  // GitHub refuses very long links; the file carries the rest
  if (body.length > 6000) body = `${body.slice(0, 6000)}\n\n… (cut here, send the notes file for the rest)`
  window.open(`${REPO}/issues/new?${new URLSearchParams({ title, body })}`, '_blank', 'noopener')
}

interface NotesFile { app: 'ApanaVidEditor'; kind: 'feedback'; exported: number; from: string; notes: Note[] }

export function notesFile(notes: Note[]) {
  const from = testerName()
  const body: NotesFile = { app: 'ApanaVidEditor', kind: 'feedback', exported: Date.now(), from, notes }
  const day = new Date().toISOString().slice(0, 10)
  const who = from.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  return { name: `feedback-${who ? `${who}-` : ''}${day}.json`, blob: new Blob([JSON.stringify(body, null, 1)], { type: 'application/json' }) }
}

/** Adds notes from a tester's file; notes already here (same id) are kept as they are. */
export async function importNotes(file: File) {
  let data: Partial<NotesFile>
  try { data = JSON.parse(await file.text()) } catch { throw new Error('This is not a notes file.') }
  if (data.kind !== 'feedback' || !Array.isArray(data.notes)) throw new Error('This is not a notes file.')
  const have = new Set((await listNotes()).map((n) => n.id))
  let added = 0
  for (const n of data.notes) {
    if (!n?.id || typeof n.text !== 'string' || have.has(n.id)) continue
    await putNote({ ...n, kind: n.kind === 'idea' ? 'idea' : 'bug', done: !!n.done, by: n.by || data.from || undefined })
    added++
  }
  return added
}

/** Sends the notes file: share sheet on phones (WhatsApp, Gmail, Drive), a download elsewhere. */
export async function shareFile(notes: Note[]) {
  const { name, blob } = notesFile(notes)
  if (isNative) { await saveNative(blob, name, true); return 'shared' }
  const file = new File([blob], name, { type: 'application/json' })
  if (!isDesktop && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name, text: notesText(notes) }); return 'shared' } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  return 'downloaded'
}

/** Sends the list as plain text: share sheet where there is one, otherwise WhatsApp in a new tab. */
export async function shareText(notes: Note[]) {
  const text = notesText(notes)
  if (isNative) {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title: 'ApanaVidEditor testing notes', text }).catch(() => {})
    return
  }
  if (!isDesktop && navigator.share) {
    try { await navigator.share({ text }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}

export async function copyText(notes: Note[]) {
  await navigator.clipboard.writeText(notesText(notes))
}
