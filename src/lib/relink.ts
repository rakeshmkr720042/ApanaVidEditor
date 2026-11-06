import type { MediaKind, MediaSource, Project } from '../types'
import { layerSpeed } from '../model/timeline'

/**
 * Missing media and relinking (Premiere's "Link media"). A project keeps its files in the app's storage; when the
 * browser or phone clears that storage, or a stored file can no longer be read, the project still points at the
 * file by its id. Relinking reads a file the user picks and stores it under the SAME id, so every clip, track item,
 * green-screen background and watermark that used the old file shows it again, with all edits kept.
 */

/** What the app remembers about a file even when the file itself is gone. */
export interface MediaInfo { name: string; kind: MediaKind; duration: number }

export interface Missing {
  id: string
  info: MediaInfo | null
  /** What can replace it: from the remembered file, else from how the project uses it. */
  kinds: MediaKind[]
  uses: number
  /** Source seconds the project needs from the file (a shorter file leaves some clips short). */
  need: number
  where: ('main' | 'track' | 'background' | 'watermark')[]
}

type Use = { uses: number; need: number; where: Set<Missing['where'][number]>; audioOnly: boolean }

/** Every file id the project uses, with how much of it and where. */
export function usedSources(p: Project): Map<string, Use> {
  const out = new Map<string, Use>()
  const add = (id: string | null | undefined, need: number, where: Missing['where'][number], audioOnly = false) => {
    if (!id) return
    const u = out.get(id) ?? { uses: 0, need: 0, where: new Set(), audioOnly: true }
    u.uses++
    u.need = Math.max(u.need, need)
    u.where.add(where)
    u.audioOnly &&= audioOnly
    out.set(id, u)
  }
  for (const c of p.clips) {
    add(c.sourceId, c.out, 'main')
    if (c.backdrop?.kind === 'media') add(c.backdrop.sourceId, c.backdrop.in ?? 0, 'background')
  }
  for (const l of p.layers) {
    if (l.type === 'media') {
      add(l.sourceId, l.in + (l.end - l.start) * layerSpeed(l), 'track')
      if (l.backdrop?.kind === 'media') add(l.backdrop.sourceId, l.backdrop.in ?? 0, 'background')
    } else if (l.type === 'audio') add(l.sourceId, l.in + (l.end - l.start) * layerSpeed(l), 'track', true)
    else if (l.type === 'wave') add(l.sourceId, l.in + (l.end - l.start), 'track', true)
  }
  add(p.watermark?.sourceId, 0, 'watermark')
  return out
}

/** Files the project uses that are not loaded. */
export function missingSources(p: Project, sources: Record<string, MediaSource>, info: Record<string, MediaInfo> = {}): Missing[] {
  const list: Missing[] = []
  for (const [id, u] of usedSources(p)) {
    if (sources[id]) continue
    const known = info[id] ?? null
    const kinds: MediaKind[] = known
      ? known.kind === 'audio' ? ['audio', 'video'] : known.kind === 'image' ? ['image', 'video'] : ['video', 'image']
      : u.audioOnly ? ['audio', 'video'] : ['video', 'image']
    list.push({ id, info: known, kinds, uses: u.uses, need: u.need, where: [...u.where] })
  }
  return list
}

/** What the app should remember about the loaded files (kept for missing ones too, so their names stay known). */
export function mediaInfoOf(sources: Record<string, MediaSource>, before: Record<string, MediaInfo> | undefined, p: Project): Record<string, MediaInfo> {
  const used = usedSources(p)
  const out: Record<string, MediaInfo> = {}
  for (const [id, i] of Object.entries(before ?? {})) if (used.has(id)) out[id] = i
  for (const s of Object.values(sources)) out[s.id] = { name: s.name, kind: s.kind, duration: s.kind === 'image' ? 0 : s.duration }
  return out
}

const stem = (n: string) => n.toLowerCase().replace(/\.[a-z0-9]{1,5}$/, '').trim()

/**
 * Pairs picked files with missing ones: the same name first, then the same name without the extension, and when
 * exactly one missing file and one picked file are left and they fit, those two.
 */
export function matchFiles<F extends { name: string; kind: MediaKind | null }>(missing: Missing[], files: F[]): { id: string; file: F }[] {
  const left = [...missing]
  const free = [...files]
  const pairs: { id: string; file: F }[] = []
  const take = (test: (m: Missing, f: F) => boolean) => {
    for (const f of [...free]) {
      const i = left.findIndex((m) => !!f.kind && m.kinds.includes(f.kind) && test(m, f))
      if (i < 0) continue
      pairs.push({ id: left[i].id, file: f })
      left.splice(i, 1)
      free.splice(free.indexOf(f), 1)
    }
  }
  take((m, f) => !!m.info && m.info.name.toLowerCase() === f.name.toLowerCase())
  take((m, f) => !!m.info && stem(m.info.name) === stem(f.name))
  if (left.length === 1 && free.length === 1) take(() => true)
  return pairs
}

/** True when a file that should be readable no longer is (storage cleared under it, a broken copy). */
export async function unreadable(blob: Blob): Promise<boolean> {
  if (!blob.size) return true
  try { await blob.slice(0, 16).arrayBuffer(); return false } catch { return true }
}
