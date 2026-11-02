/**
 * Motion tracking: a text, sticker or overlay follows a moving thing in the main video. The main video (without
 * any layers) is drawn small, 15 times a second, and the patch of picture under the item at the start is looked
 * for in each next frame; the item gets a keyframe at every step.
 */
import type { BoxKey, Layer, MediaSource, Project } from '../types'
import { layoutClips } from '../model/timeline'
import { boxAt, hasBox } from '../model/keyframes'
import { openReader, type FrameReader } from './frames'
import { mediaNeeds } from './player'
import { outputSize, Renderer, type FrameImage } from './renderer'
import { findPatch, patchAt, toGray, type Gray } from './motion'

const FPS = 15

export interface TrackResult { keys: BoxKey[]; lost: number | null /* timeline second where it lost the thing */ }

/**
 * Follows what is under layer `id` at time `t0` (timeline seconds) through the layer's time, forwards and backwards.
 * `size`: 0..1 how big the followed patch is, relative to the frame's short side.
 */
export async function trackLayer(p: Project, sources: Record<string, MediaSource>, id: string, t0: number, size: number,
  onProgress?: (p: number) => void, cancelled?: () => boolean): Promise<TrackResult | null> {
  const l0 = p.layers.find((l) => l.id === id)
  if (!l0 || !hasBox(l0)) return null
  const bare: Project = { ...p, layers: [], watermark: null, presenter: null, beatFx: null }
  const { items } = layoutClips(bare.clips)
  const { w, h } = outputSize(bare, sources, 240)
  const r = new Renderer()
  r.resize(w, h)
  const readers = new Map<string, FrameReader>()
  const frameAt = async (t: number): Promise<Gray | null> => {
    const needs = mediaNeeds(bare, items, sources, t)
    const frames = new Map<string, FrameImage | null>()
    for (const n of needs) {
      if (n.source.kind === 'audio') continue
      let rd = readers.get(n.key)
      if (!rd) { rd = await openReader(n.source, false); readers.set(n.key, rd) }
      frames.set(n.key, await rd.get(n.time))
    }
    if (!needs.length) return null
    r.render({ t, project: bare, items, sources, frame: (k) => frames.get(k) ?? null, watermark: null, seed: 0 })
    return toGray(r.canvas, w, h, w)
  }

  const start = Math.max(l0.start, Math.min(l0.end - 1e-3, t0))
  const box = boxAt(l0, start)
  const half = Math.max(6, Math.round((Math.min(w, h) * (0.06 + size * 0.14)) / 2))
  const steps = (from: number, to: number) => Math.max(0, Math.floor(Math.abs(to - from) * FPS))
  const total = steps(start, l0.end) + steps(start, l0.start) + 1
  let done = 0
  const keys: BoxKey[] = []
  let lost: number | null = null
  const home = { x: box.x * w, y: box.y * h }

  const run = async (dir: 1 | -1) => {
    const g0 = await frameAt(start)
    if (!g0) return
    let tpl = patchAt(g0, home.x, home.y, half)
    let x = home.x, y = home.y, vx = 0, vy = 0
    const n = steps(start, dir > 0 ? l0.end : l0.start)
    for (let i = 1; i <= n; i++) {
      if (cancelled?.()) return
      const t = start + (dir * i) / FPS
      const g = await frameAt(t)
      done++; onProgress?.(done / total)
      if (!g) break
      // look near where it would be if it kept moving the same way
      const m = findPatch(g, tpl, x + vx, y + vy, Math.max(8, Math.round(half * 0.9)))
      if (m.score < 0.45) { if (lost === null || Math.abs(t - start) < Math.abs(lost - start)) lost = t; break }
      vx = 0.6 * (m.x - x) + 0.4 * vx; vy = 0.6 * (m.y - y) + 0.4 * vy
      x = m.x; y = m.y
      keys.push({ t: t - l0.start, box: { ...boxAt(l0, t), x: box.x + (x - home.x) / w, y: box.y + (y - home.y) / h }, lin: true })
      // the look of the thing changes slowly (turning, light): take a little of the new picture into the patch
      if (m.score > 0.8) {
        const fresh = patchAt(g, x, y, half)
        if (fresh.energy > 1e-3) {
          const p = tpl.p.map((v, k) => 0.85 * v + 0.15 * fresh.p[k])
          let e = 0
          for (const v of p) e += v * v
          tpl = { p, half, energy: Math.sqrt(e) }
        }
      }
    }
  }
  try {
    keys.push({ t: start - l0.start, box: { ...box }, lin: true })
    await run(1)
    await run(-1)
  } finally {
    for (const rd of readers.values()) rd.close()
  }
  keys.sort((a, b) => a.t - b.t)
  return { keys, lost }
}

/** True when a layer's keyframes came from tracking (one every 1/15 s, gliding straight). */
export const isTracked = (l: Layer) => hasBox(l) && (l.keys?.length ?? 0) > 3 && l.keys!.every((k) => k.lin)
