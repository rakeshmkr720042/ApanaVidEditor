/**
 * Where the person is in a video over time, for punch-in zooms and Shorts framing: one look every few seconds
 * (or `max` looks over the file), and the nearest look answers for any moment.
 */
import type { MediaSource } from '../types'
import type { Spot, SpotAt } from '../model/smartcut'
import { loadCutout, personSpot } from './cutout'
import { openReader } from './frames'

const cache = new Map<string, { t: number; spot: Spot | null }[]>()

export async function findSpots(srcs: MediaSource[], ranges: Record<string, [number, number]>, onProgress?: (p: number) => void, max = 24): Promise<SpotAt> {
  const ok = await loadCutout()
  const videos = srcs.filter((s) => s.kind === 'video')
  let done = 0
  for (const s of videos) {
    if (!ok || cache.has(s.id)) { done++; continue }
    const [a, b] = ranges[s.id] ?? [0, s.duration]
    const n = Math.max(1, Math.min(max, Math.ceil((b - a) / 4)))
    const looks: { t: number; spot: Spot | null }[] = []
    const reader = await openReader(s, false).catch(() => null)
    if (reader) {
      try {
        for (let i = 0; i < n; i++) {
          const t = a + ((i + 0.5) / n) * (b - a)
          const f = await reader.get(t)
          looks.push({ t, spot: f ? personSpot(f.image as HTMLVideoElement) : null })
          onProgress?.((done + (i + 1) / n) / videos.length)
        }
      } finally { reader.close() }
    }
    cache.set(s.id, looks)
    done++
  }
  return (id, t) => {
    const looks = cache.get(id)?.filter((l) => l.spot)
    if (!looks?.length) return null
    return looks.reduce((best, l) => (Math.abs(l.t - t) < Math.abs(best.t - t) ? l : best)).spot
  }
}
