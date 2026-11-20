/**
 * Follow tags (src/model/followTag.ts): finds the path of the thing under a point by motion tracking, and finds the
 * face in the frame shown at a moment so a tag can be put on the person in one tap.
 */
import type { MediaSource, Project, StickerLayer } from '../types'
import { layoutClips } from '../model/timeline'
import { clipSrcAt } from '../model/clipKeys'
import { sourceToFrame } from '../model/followTag'
import { trackLayer } from './tracker'
import { findLooks } from './reframe'
import { outputSize } from './renderer'

export type PathPoint = { t: number; x: number; y: number }

/**
 * The path (timeline seconds, frame 0..1) of what is at point (x, y) at time t0, followed from `start` to `end`.
 * It reuses the motion tracker with a stand-in item on the point. Null when nothing could be followed.
 */
export async function followPath(p: Project, sources: Record<string, MediaSource>, x: number, y: number, t0: number,
  start: number, end: number, size: number, onProgress?: (q: number) => void, cancelled?: () => boolean): Promise<{ path: PathPoint[]; lost: number | null } | null> {
  const probe: StickerLayer = {
    id: '__follow_probe', type: 'sticker', emoji: '•', start, end,
    box: { x, y, scale: 1, rotation: 0, opacity: 1 }, animIn: 'none', animOut: 'none',
  }
  const r = await trackLayer({ ...p, layers: [...p.layers, probe] }, sources, probe.id, t0, size, onProgress, cancelled)
  if (!r || r.keys.length < 2) return null
  const path = [{ t: t0, x, y }, ...r.keys.map((k) => ({ t: start + k.t, x: k.box.x, y: k.box.y }))].sort((a, b) => a.t - b.t)
  return { path, lost: r.lost }
}

/** Where the face is in the frame at timeline time t (0..1), or null (no person, a photo-less gap, model missing). */
export async function faceAt(p: Project, sources: Record<string, MediaSource>, t: number): Promise<{ x: number; y: number } | null> {
  const it = layoutClips(p.clips).items.find((i) => t >= i.start && t < i.start + i.dur)
  const src = it && sources[it.clip.sourceId]
  if (!it || !src || (src.kind !== 'video' && src.kind !== 'image')) return null
  const srcT = src.kind === 'image' ? 0 : Math.round(clipSrcAt(it.clip, t - it.start) * 20) / 20
  const { looks } = await findLooks(sources, { [src.id]: [srcT] })
  const l = looks[src.id]?.[0]
  if (!l || l.x === null || l.y === null) return null
  const { w, h } = outputSize(p, sources, 720)
  return sourceToFrame(it.clip, src, w, h, l.x, l.y, srcT)
}
